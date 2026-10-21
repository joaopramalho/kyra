import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { accounts, users } from "@lobbystack/db";
import { hashReplacementPassword } from "../../../apps/admin/src/lib/password";
import { openLmcTestDatabase } from "./database";
import { createLmcHarness } from "./harness";

type Harness = Awaited<ReturnType<typeof createLmcHarness>>;

/** Exercises the running Next HTTP/auth boundaries. Only synthetic .invalid identities and lead content are used. */
export async function probeEmailReadRoutes(baseUrl: string) {
  const base = new URL(baseUrl);
  if (
    base.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    throw new Error("ISOLATION_HTTP_REQUIRES_LOCAL_ORIGIN");
  const db = openLmcTestDatabase(),
    failures: string[] = [],
    probed: string[] = [];
  let a: Harness | undefined, b: Harness | undefined;
  const loggedInCookies: string[] = [];
  const check = (condition: boolean, code: string) => {
    if (!condition) failures.push(code);
  };
  async function request(
    path: string,
    cookie = "",
    tenant = "",
    method = "GET",
    extra: Record<string, string> = {},
  ) {
    return fetch(new URL(path, base), {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(tenant ? { "x-business-id": tenant } : {}),
        ...extra,
      },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
  }
  async function login(h: Harness) {
    const password = `Audit-${randomBytes(24).toString("hex")}!`;
    const hash = await hashReplacementPassword(password);
    await db.admin.db
      .update(users)
      .set({ emailVerified: true, passwordHash: hash })
      .where(eq(users.id, h.ownerId));
    await db.admin.db.insert(accounts).values({
      userId: h.ownerId,
      providerId: "credential",
      accountId: h.ownerId,
      password: hash,
    });
    const response = await fetch(new URL("/api/auth/sign-in/email", base), {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: base.origin },
      body: JSON.stringify({ email: `${h.ownerId}@example.invalid`, password }),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (response.status !== 200)
      throw new Error(`AUDIT_SIGN_IN_STATUS:${response.status}`);
    const result = (await response.json()) as { user?: { id?: string } };
    if (result.user?.id !== h.ownerId)
      throw new Error("AUDIT_SERVER_DATABASE_MISMATCH");
    const cookies = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .filter(Boolean)
      .join("; ");
    if (!cookies.includes("session_token="))
      throw new Error("AUDIT_SESSION_COOKIE_MISSING");
    loggedInCookies.push(cookies);
    return cookies;
  }
  try {
    a = await createLmcHarness({ now: "2030-01-09T03:40:00Z" });
    b = await createLmcHarness({ now: "2030-01-09T03:40:00Z" });
    const one = await a.capture({
      email: "http-a@example.invalid",
      message: "Private tenant A roof request",
    });
    const other = await b.capture({
      email: "http-b@example.invalid",
      message: "Private tenant B roof request",
    });
    const cookieA = await login(a),
      cookieB = await login(b);
    for (const target of [
      { route: "/api/leads", a: "/api/leads", b: "/api/leads" },
      {
        route: "/api/leads/[leadId]",
        a: `/api/leads/${one.id}`,
        b: `/api/leads/${other.id}`,
      },
    ]) {
      const ownA = await request(target.a, cookieA, a.tenantId);
      const dataA = await ownA.text();
      check(
        ownA.status === 200 &&
          dataA.includes(one.id) &&
          !dataA.includes(other.id) &&
          !dataA.includes("Private tenant B roof request"),
        `HTTP_OWN_A:${target.route}:${ownA.status}`,
      );
      check(
        ownA.headers.get("cache-control")?.includes("private") === true &&
          ownA.headers.get("cache-control")?.includes("no-store") === true,
        `HTTP_PRIVATE_CACHE:${target.route}`,
      );
      const ownB = await request(target.b, cookieB, b.tenantId),
        dataB = await ownB.text();
      check(
        ownB.status === 200 &&
          dataB.includes(other.id) &&
          !dataB.includes(one.id),
        `HTTP_OWN_B:${target.route}:${ownB.status}`,
      );
      for (const method of ["GET", "HEAD"]) {
        const own = await request(target.a, cookieA, a.tenantId, method);
        check(
          own.status === 200,
          `HTTP_OWN_METHOD:${method}:${target.route}:${own.status}`,
        );
        await own.arrayBuffer();
        const unauthorized = await request(target.a, "", a.tenantId, method);
        check(
          unauthorized.status === 401,
          `HTTP_ANONYMOUS:${method}:${target.route}:${unauthorized.status}`,
        );
        await unauthorized.arrayBuffer();
        for (const path of [target.b, `${target.b}?businessId=${b.tenantId}`]) {
          const foreign = await request(path, cookieA, b.tenantId, method, {
            "x-user-id": b.ownerId,
            "x-actor-type": "system",
          });
          const body = await foreign.text();
          check(
            foreign.status === 403 &&
              !body.includes(other.id) &&
              !body.includes("Private tenant B roof request"),
            `HTTP_FOREIGN_TENANT:${method}:${target.route}:${foreign.status}`,
          );
        }
        if (target.route.includes("[leadId]")) {
          const foreignId = await request(
            target.b,
            cookieA,
            a.tenantId,
            method,
          );
          check(
            foreignId.status === 404,
            `HTTP_FOREIGN_RESOURCE:${method}:${target.route}:${foreignId.status}`,
          );
          await foreignId.arrayBuffer();
        }
        probed.push(`${method} ${target.route}`);
      }
      for (const [cookie, tenant, path] of [
        [cookieA, a.tenantId, target.a],
        [cookieA, b.tenantId, target.b],
      ]) {
        const options = await request(path!, cookie!, tenant!, "OPTIONS");
        const allow = options.headers.get("allow") ?? "",
          text = await options.text();
        check(
          options.status === 204 &&
            ["GET", "HEAD", "OPTIONS"].every((method) =>
              allow.split(/,\s*/).includes(method),
            ) &&
            text === "",
          `HTTP_OPTIONS:${target.route}:${options.status}`,
        );
      }
      probed.push(`OPTIONS ${target.route}`);
    }
  } finally {
    for (const cookie of loggedInCookies) {
      try {
        const response = await fetch(new URL("/api/auth/sign-out", base), {
          method: "POST",
          headers: {
            cookie,
            origin: base.origin,
            "Content-Type": "application/json",
          },
          body: "{}",
          signal: AbortSignal.timeout(5_000),
          redirect: "error",
        });
        if (!response.ok)
          failures.push(`HTTP_SESSION_CLEANUP:${response.status}`);
        await response.arrayBuffer();
      } catch {
        failures.push("HTTP_SESSION_CLEANUP_FAILED");
      }
    }
    try {
      await b?.close();
    } finally {
      try {
        await a?.close();
      } finally {
        await db.close();
      }
    }
  }
  return { failures, probed };
}
