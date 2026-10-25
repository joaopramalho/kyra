import { isDeepStrictEqual } from "node:util";
import type { HttpAuditContext } from "./isolation-http";
import { scopedSnapshot } from "./isolation-pilot-guards";

const routes = [
  "/api/internal/superadmin/overview",
  "/api/internal/superadmin/clients",
] as const;

/** Proves that tenant sessions cannot cross the platform-admin boundary. */
export async function probePilotSuperAdminContext(context: HttpAuditContext) {
  const { a, b, cookieA, cookieB, request, check, probed, db } = context;
  const original = await db.admin.pool.query<{
    platform_role: string;
    two_factor_enabled: boolean;
  }>(
    "select platform_role, two_factor_enabled from users where id=$1",
    [a.ownerId],
  );
  if (!original.rows[0]) throw new Error("PILOT_SUPERADMIN_CONTROL_MISSING");
  const foreignBefore = await scopedSnapshot(context, "b");

  try {
    await db.admin.pool.query(
      "update users set platform_role='platform_admin', two_factor_enabled=true where id=$1",
      [a.ownerId],
    );

    for (const route of routes) {
      for (const method of ["GET", "HEAD"] as const) {
        const anonymous = await request(route, "", a.tenantId, method);
        check(anonymous.status === 401, `PILOT_SUPERADMIN_ANONYMOUS:${method}:${route}:${anonymous.status}`);
        await anonymous.arrayBuffer();

        const tenant = await request(route, cookieB, b.tenantId, method);
        check(tenant.status === 403, `PILOT_SUPERADMIN_TENANT:${method}:${route}:${tenant.status}`);
        await tenant.arrayBuffer();

        const forged = await request(route, cookieB, a.tenantId, method, {
          "x-user-id": a.ownerId,
          "x-actor-type": "system",
        });
        check(forged.status === 403, `PILOT_SUPERADMIN_FORGED:${method}:${route}:${forged.status}`);
        await forged.arrayBuffer();

        const admin = await request(route, cookieA, a.tenantId, method);
        const body = await admin.text();
        const valid = admin.status === 200 && (method === "HEAD" || (
          route.endsWith("/clients")
            ? body.includes(a.tenantId) && body.includes(b.tenantId)
            : Number((JSON.parse(body) as { total?: number }).total) >= 2
        ));
        check(valid, `PILOT_SUPERADMIN_CONTROL:${method}:${route}:${admin.status}`);
        if (valid) probed.push(`${method} ${route}`);
      }

      const options = await request(route, cookieA, a.tenantId, "OPTIONS");
      const allow = (options.headers.get("allow") ?? "").split(/,\s*/);
      const validOptions = options.status === 204 && ["GET", "HEAD", "OPTIONS"].every((method) => allow.includes(method)) && await options.text() === "";
      check(validOptions, `PILOT_SUPERADMIN_OPTIONS:${route}:${options.status}`);
      if (validOptions) probed.push(`OPTIONS ${route}`);
    }

    check(isDeepStrictEqual(foreignBefore, await scopedSnapshot(context, "b")), "PILOT_SUPERADMIN_CHANGED_FOREIGN_TENANT");
  } finally {
    await db.admin.pool.query(
      "update users set platform_role=$2, two_factor_enabled=$3 where id=$1",
      [a.ownerId, original.rows[0].platform_role, original.rows[0].two_factor_enabled],
    );
  }
}
