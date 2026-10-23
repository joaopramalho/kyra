import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "yaml";

const root=new URL("../../",import.meta.url);
test("hosted pilot workflow requires actual unit/PostgreSQL execution after the full build",async()=>{
  const workflow=parse(await readFile(new URL(".github/workflows/pilot-release.yml",root),"utf8"));
  assert.equal(workflow.permissions.contents,"read");
  assert.ok(workflow.on.workflow_dispatch!==undefined);
  const steps=workflow.jobs.verify.steps;
  const runs=steps.filter(step=>step.run).map(step=>step.run).join("\n");
  for(const command of ["pnpm typecheck","pnpm build","pnpm test:build-config","node scripts/pilot-ci.mjs"])assert.ok(runs.includes(command),command);
  assert.ok(runs.indexOf("pnpm build")<runs.indexOf("node scripts/pilot-ci.mjs"));
  assert.ok(!runs.includes("continue-on-error"));
  const upload=steps.find(step=>step.uses?.startsWith("actions/upload-artifact@"));
  assert.ok(upload);assert.ok(upload.with.path.endsWith("pilot-ci-summary.json"));
  assert.ok(!upload.with.path.includes("**"));
});
test("hosted pilot security jobs retain full secret history, strict Semgrep and production dependency severity gates",async()=>{
  const workflow=parse(await readFile(new URL(".github/workflows/pilot-release.yml",root),"utf8"));
  const run=name=>workflow.jobs[name].steps.filter(step=>step.run).map(step=>step.run).join("\n");
  assert.match(run("secret-scan"),/--log-opts=--all/);assert.match(run("secret-scan"),/--redact=100/);
  assert.match(run("static-security"),/--strict --error/);assert.match(run("static-security"),/--timeout 30/);
  assert.match(run("dependencies"),/pnpm audit --prod --audit-level high/);
  for(const job of Object.values(workflow.jobs))assert.notEqual(job["continue-on-error"],true);
});
