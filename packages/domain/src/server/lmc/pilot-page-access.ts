import { eq } from "drizzle-orm";
import { lmcBusinessSettingsSchema, lmcTenantIdentitySchema } from "@lobbystack/contracts";
import { lmcSettings, users, withBusinessTransaction, type Database } from "@lobbystack/db";
import { AuthorizationError, requireBusinessMembership } from "../../authz";

export async function resolveLmcPilotPageAccess(context:{database:Database;authDatabase:Database},userId:string):Promise<{tenantId:string}|null>{
  const identity=lmcTenantIdentitySchema.shape.userId.safeParse(userId);
  if(!identity.success)return null;
  const [user]=await context.authDatabase.select({verified:users.emailVerified,activeBusinessId:users.activeBusinessId}).from(users).where(eq(users.id,identity.data)).limit(1);
  if(!user?.verified||!user.activeBusinessId)return null;
  const tenantId=user.activeBusinessId;
  return withBusinessTransaction(context.database,{businessId:tenantId,userId:identity.data,actorType:"operator"},async tx=>{
    try{await requireBusinessMembership(tx,{businessId:tenantId,userId:identity.data,minimumRole:"viewer"});}
    catch(error){if(error instanceof AuthorizationError)return null;throw error;}
    const [settings]=await tx.select({config:lmcSettings.config}).from(lmcSettings).where(eq(lmcSettings.tenantId,tenantId)).limit(1);
    if(!settings||!lmcBusinessSettingsSchema.safeParse(settings.config).success)return null;
    // A paused tenant still needs settings access; API roles and scheduling
    // freshness/verification rules continue to govern every actual operation.
    return {tenantId};
  });
}
