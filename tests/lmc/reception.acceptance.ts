import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { businesses, lmcJobs, lmcLeads, lmcMessages, lmcSettings, withBusinessTransaction } from "@lobbystack/db";
import { FakeLmcEmailModel, FakeLmcEmailProvider } from "@lobbystack/providers";
import { EmailChannel } from "../../packages/agent-core/src/channels";
import { createReplyToken } from "../../packages/domain/src/server/lmc/capabilities";
import { LmcLeadCapture } from "../../packages/domain/src/server/lmc/capture";
import { LmcEmailWorker } from "../../packages/domain/src/server/lmc/worker";
import { LmcEmailReception, handleLmcEmailWebhook, handleLmcUnsubscribe } from "../../packages/domain/src/server/lmc/reception";
import { openLmcTestDatabase } from "./support/database";

describe("authenticated replies preserve conversation capabilities and suppression", () => {
  let h: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async()=>{h=await fixture();});
  afterEach(async()=>{await h?.close();});
  it("verifies sender, token and thread before recording a reply, then processes duplicate deliveries once",async()=>{
    const event=h.event("ZIP 33101, roof repair, residential homeowner");
    expect(await Promise.all([h.reception.receive(event),h.reception.receive(event)])).toMatchObject([{accepted:true},{accepted:true}]);
    await Promise.all([h.worker.drain(),h.worker.drain()]);
    expect(h.mail.to(h.email)).toHaveLength(2);
    expect(await h.scoped(tx=>tx.select().from(lmcMessages).where(eq(lmcMessages.providerId,event.id)))).toHaveLength(1);
    expect(await h.lead()).toMatchObject({verifiedAt:expect.any(Date),followupGeneration:1});
  });
  it.each(["sender","token","thread","authentication"])("rejects a mismatched %s without changing the conversation",async mismatch=>{
    const event=h.event("ZIP 33101");
    if(mismatch==="sender")event.email.from="intruder@example.invalid";
    if(mismatch==="token")event.email.to=createReplyToken(h.tenantId).value+"@inbound.example.invalid";
    if(mismatch==="thread")event.email.headers["In-Reply-To"]="<another@example.invalid>";
    if(mismatch==="authentication")event.email.authentication.dkim="fail";
    expect(await h.reception.receive(event)).toMatchObject({accepted:false});
    await h.worker.drain();
    expect(h.mail.to(h.email)).toHaveLength(1);
    expect(await h.lead()).toMatchObject({verifiedAt:null,followupGeneration:0});
  });
  it("never replies to automatic mail and does not mark it as a human response",async()=>{
    const event=h.event("Out of office"); event.email.headers["Auto-Submitted"]="auto-replied";
    expect(await h.reception.receive(event)).toMatchObject({accepted:false});
    await h.worker.drain();
    expect(h.mail.to(h.email)).toHaveLength(1);
    expect(await h.lead()).toMatchObject({verifiedAt:null});
  });
  it.each(["reply","link"])("suppresses all threads for the email through a %s and cancels pending deliveries",async mode=>{
    const another=await h.capture.capture(h.captureToken.value,{requestId:randomUUID(),email:h.email,message:"More roofing help"});
    await h.worker.drain(1); // Leave the second thread's outbound delivery queued.
    if(mode==="reply") expect(await h.reception.receive(h.event("STOP"))).toMatchObject({accepted:true});
    else {
      const header=h.mail.lastTo(h.email).headers["List-Unsubscribe"];
      const token=header!.slice(1,-1).split("/").at(-1)!;
      expect((await handleLmcUnsubscribe(new Request("https://lmc.example",{method:"POST",body:"List-Unsubscribe=One-Click"}),token,h.reception)).status).toBe(200);
    }
    await h.worker.drain();
    expect(h.mail.to(h.email)).toHaveLength(1);
    expect(await h.lead()).toMatchObject({status:"opted_out"});
    expect((await h.scoped(tx=>tx.select().from(lmcLeads).where(eq(lmcLeads.id,another.id))))[0]).toMatchObject({status:"opted_out"});
  });
  it("the HTTP boundary calls the trusted adapter before any inbound data can reach persistence",async()=>{
    const before=await h.scoped(tx=>tx.select().from(lmcMessages));
    const response=await handleLmcEmailWebhook(new Request("https://lmc.example",{method:"POST",body:JSON.stringify(h.event("forged"))}),{async verifyAndLoad(){throw new Error("INVALID_WEBHOOK_SIGNATURE");}},h.reception);
    expect(response.status).toBe(401);
    expect(await h.scoped(tx=>tx.select().from(lmcMessages))).toHaveLength(before.length);
    const event=h.event("Please wait; I will contact your office.");
    expect((await handleLmcEmailWebhook(new Request("https://lmc.example",{method:"POST",body:"signed provider bytes"}),{async verifyAndLoad(){return event;}},h.reception)).status).toBe(200);
  });
});

async function fixture(){
  const db=openLmcTestDatabase(), tenantId=randomUUID(), captureToken=createReplyToken(tenantId), email="ana@example.invalid";
  const now=()=>new Date("2030-01-09T03:40:00Z"), signingSecret="s".repeat(40);
  await db.admin.db.insert(businesses).values({id:tenantId,slug:`lmc-reception-${tenantId}`,name:"Roofing",timezone:"America/New_York",businessType:"service_company"});
  await db.admin.db.insert(lmcSettings).values({tenantId,captureTokenHash:captureToken.hash,config:{ownerEmail:"owner@example.invalid",fromEmail:"team@example.invalid",physicalAddress:"100 Main Street, Miami FL 33101",serviceAreaZips:["33101"],serviceAreaCities:[],services:[{id:randomUUID(),name:"roof repair",aliases:[]}],emergencyKeywords:["active leak"],emergencyText:"Our team will contact you urgently.",priceInformation:"",tone:"professional",confidenceThreshold:0.8,tools:["availability","book","handoff"],followups:{enabled:false,maxTouches:0,delaysHours:[],dailyCap:100}}});
  const mail=new FakeLmcEmailProvider(), model=new FakeLmcEmailModel();
  const capture=new LmcLeadCapture({database:db.worker.db,now});
  const worker=new LmcEmailWorker({database:db.worker.db,dispatcher:db.dispatcher.db,now,channel:new EmailChannel(model),mail,baseUrl:"https://lmc.example",receivingDomain:"inbound.example.invalid",signingSecret});
  const reception=new LmcEmailReception({database:db.worker.db,now,receivingDomain:"inbound.example.invalid",signingSecret});
  const lead=await capture.capture(captureToken.value,{requestId:randomUUID(),email,message:"Can you help with my roof?"}); await worker.drain();
  const scoped=<T>(fn:Parameters<typeof withBusinessTransaction<T>>[2])=>withBusinessTransaction(db.worker.db,{businessId:tenantId,actorType:"worker"},fn);
  return {tenantId,captureToken,email,mail,worker,reception,capture,scoped,event(text:string){
    const outgoing=mail.lastTo(email);
    return {kind:"message" as const,id:randomUUID(),email:{from:email,to:outgoing.replyTo,subject:"Re: Roof",text,headers:{"Message-ID":`<${randomUUID()}@example.invalid>`,"In-Reply-To":outgoing.headers["Message-ID"]!,"Auto-Submitted":"no"},authentication:{spf:"pass",dkim:"pass",dmarc:"pass",aligned:true}}};
  },async lead(){return(await scoped(tx=>tx.select().from(lmcLeads).where(eq(lmcLeads.id,lead.id))))[0];},async close(){await db.admin.db.delete(businesses).where(eq(businesses.id,tenantId));await db.close();}};
}
