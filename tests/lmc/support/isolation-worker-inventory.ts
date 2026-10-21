import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { AuditRoute } from "./isolation-inventory";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const workerMethods = [
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
];
const comparisons = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

/** Follows the worker entry's local production imports, then reads routing predicates via AST. */
export function discoverWorkerHttpRoutes(root = projectRoot): AuditRoute[] {
  const src = resolve(root, "apps/worker/src"),
    entry = join(src, "index.ts"),
    visited = new Set<string>(),
    result: AuditRoute[] = [];
  function walk(node: ts.Node, visit: (node: ts.Node) => void) {
    visit(node);
    ts.forEachChild(node, (child) => walk(child, visit));
  }
  function localModule(file: string, specifier: string) {
    const target = resolve(dirname(file), specifier),
      stem = target.replace(/\.[cm]?js$/, ""),
      candidates = [
        target,
        `${stem}.ts`,
        `${stem}.tsx`,
        `${stem}.js`,
        join(target, "index.ts"),
      ];
    const found = candidates.find(
      (candidate) => existsSync(candidate) && /\.[cm]?[jt]sx?$/.test(candidate),
    );
    if (!found)
      throw new Error(
        `UNRESOLVED_WORKER_MODULE:${relative(root, file)}:${specifier}`,
      );
    if (!found.startsWith(src + sep))
      throw new Error(
        `UNINVENTORIED_WORKER_MODULE:${relative(root, file)}:${specifier}`,
      );
    return found;
  }
  function visit(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      ),
      label = relative(root, file).replaceAll("\\", "/");
    const imports: string[] = [],
      dependencies: string[] = [];
    walk(source, (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        imports.push(node.moduleSpecifier.text);
        const typeOnly = ts.isImportDeclaration(node)
          ? node.importClause?.isTypeOnly
          : node.isTypeOnly;
        if (!typeOnly && node.moduleSpecifier.text.startsWith("."))
          dependencies.push(node.moduleSpecifier.text);
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      ) {
        const argument = node.arguments[0];
        if (!argument || !ts.isStringLiteral(argument))
          throw new Error(`UNRESOLVED_WORKER_MODULE:${label}`);
        const specifier = argument.text;
        imports.push(specifier);
        if (specifier.startsWith(".")) dependencies.push(specifier);
      }
    });
    const http = imports.some((value) =>
      ["node:http", "http", "node:https", "https"].includes(value),
    );
    let listener = false;
    walk(source, (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "listen"
      )
        listener = true;
    });
    if (listener && !http)
      throw new Error(`UNINVENTORIED_WORKER_LISTENER:${label}`);
    if (http) {
      const constants = new Map<string, string>(),
        pathNames = new Set<string>(),
        requestNames = new Set(["request", "req"]),
        paths = new Set<string>();
      walk(source, (node) => {
        if (
          (ts.isFunctionDeclaration(node) ||
            ts.isFunctionExpression(node) ||
            ts.isArrowFunction(node)) &&
          node.parameters[0] &&
          ts.isIdentifier(node.parameters[0].name)
        )
          requestNames.add(node.parameters[0].name.text);
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.initializer &&
          ts.isStringLiteral(node.initializer)
        )
          constants.set(node.name.text, node.initializer.text);
      });
      function isPath(node: ts.Node): boolean {
        if (ts.isParenthesizedExpression(node)) return isPath(node.expression);
        return (
          (ts.isIdentifier(node) && pathNames.has(node.text)) ||
          (ts.isPropertyAccessExpression(node) &&
            (node.name.text === "pathname" ||
              (node.name.text === "url" &&
                ts.isIdentifier(node.expression) &&
                requestNames.has(node.expression.text))))
        );
      }
      walk(source, (node) => {
        if (ts.isVariableDeclaration(node) && node.initializer) {
          if (ts.isIdentifier(node.name) && isPath(node.initializer))
            pathNames.add(node.name.text);
          if (ts.isObjectBindingPattern(node.name))
            for (const binding of node.name.elements)
              if (
                ts.isIdentifier(binding.name) &&
                (binding.propertyName?.getText(source) ?? binding.name.text) ===
                  "pathname"
              )
                pathNames.add(binding.name.text);
        }
      });
      function add(node: ts.Node) {
        const value = ts.isStringLiteral(node)
          ? node.text
          : ts.isIdentifier(node)
            ? constants.get(node.text)
            : undefined;
        if (!value?.startsWith("/"))
          throw new Error(`UNRESOLVED_WORKER_ROUTING:${label}`);
        paths.add(value);
      }
      walk(source, (node) => {
        if (
          ts.isBinaryExpression(node) &&
          comparisons.has(node.operatorToken.kind)
        ) {
          if (isPath(node.left)) add(node.right);
          else if (isPath(node.right)) add(node.left);
        }
        if (ts.isSwitchStatement(node) && isPath(node.expression))
          for (const clause of node.caseBlock.clauses)
            if (ts.isCaseClause(clause)) add(clause.expression);
        if (ts.isIfStatement(node)) {
          if (isPath(node.expression))
            throw new Error(`UNRESOLVED_WORKER_ROUTING:${label}`);
          walk(node.expression, (expression) => {
            if (
              ts.isCallExpression(expression) &&
              ((ts.isPropertyAccessExpression(expression.expression) &&
                isPath(expression.expression.expression)) ||
                expression.arguments.some(isPath))
            )
              throw new Error(`UNRESOLVED_WORKER_ROUTING:${label}`);
          });
        }
        if (
          ts.isElementAccessExpression(node) &&
          isPath(node.argumentExpression)
        )
          throw new Error(`UNRESOLVED_WORKER_ROUTING:${label}`);
      });
      if (!paths.size && (listener || pathNames.size))
        throw new Error(`UNRESOLVED_WORKER_ROUTING:${label}`);
      for (const path of paths)
        result.push({
          path,
          file: label,
          methods: [...workerMethods],
          surface: "worker",
        });
    }
    for (const dependency of dependencies) visit(localModule(file, dependency));
  }
  if (!existsSync(entry)) throw new Error("WORKER_HTTP_ENTRY_MISSING");
  visit(entry);
  if (!result.length) throw new Error("WORKER_HTTP_INVENTORY_EMPTY");
  if (new Set(result.map((route) => route.path)).size !== result.length)
    throw new Error("DUPLICATE_WORKER_HTTP_ROUTE");
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
