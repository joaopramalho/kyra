import { and, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { businesses, businessHours, services, withBusinessTransaction, type Database } from "@lobbystack/db";
import { findEmailAvailabilityInTransaction } from "../booking";
import { candidateStartTimes } from "../receptionistActions";

export async function listEmailVisitSlots(database:Database,input:{tenantId:string;serviceId:string;now:Date}){
  const loaded=await withBusinessTransaction(database,{businessId:input.tenantId,actorType:"worker"},async tx=>{
    const [business]=await tx.select({timezone:businesses.timezone}).from(businesses).where(eq(businesses.id,input.tenantId)).limit(1);
    const [service]=await tx.select({duration:services.durationMinutes}).from(services).where(and(eq(services.businessId,input.tenantId),eq(services.id,input.serviceId),eq(services.active,true))).limit(1);
    const hours=await tx.select().from(businessHours).where(eq(businessHours.businessId,input.tenantId));
    return {business,service,hours};
  });
  if(!loaded.business||!loaded.service)return [];
  const slots:Awaited<ReturnType<typeof findEmailAvailabilityInTransaction>>=[];
  const localNow=DateTime.fromJSDate(input.now,{zone:loaded.business.timezone});
  for(let day=0;day<7&&slots.length<3;day++){
    const date=localNow.plus({days:day}).toISODate();if(!date)break;
    const candidates=candidateStartTimes({date,timezone:loaded.business.timezone,hours:loaded.hours,durationMinutes:loaded.service.duration,now:input.now});
    for(const startsAt of candidates){
      const available=await withBusinessTransaction(database,{businessId:input.tenantId,actorType:"worker"},tx=>findEmailAvailabilityInTransaction(tx,{businessId:input.tenantId,serviceId:input.serviceId,startsAt,now:input.now}));
      if(available[0])slots.push(available[0]);
      if(slots.length>=3)break;
    }
  }
  return slots;
}
