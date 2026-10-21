import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { lmcBusinessSettingsSchema, lmcProcessJobSchema, lmcQualificationSchema, lmcSendJobSchema, type LmcBusinessSettings, type LmcChannel, type LmcEmailTransport, type LmcOutboundEmail, type LmcStructuredAction } from "@lobbystack/contracts";
import { lmcEvents, lmcJobs, lmcLeads, lmcMessages, lmcSettings, lmcSuppressions, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { signActionToken, verifyReplyToken } from "./capabilities";
import { enqueueLmcJob, LmcJobQueue, type LmcJob } from "./queue";

type Lead = typeof lmcLeads.$inferSelect;
type Message = typeof lmcMessages.$inferSelect;
type WorkerInput = { database: Database; dispatcher: Database; now: () => Date; channel: LmcChannel; mail: LmcEmailTransport; baseUrl: string; receivingDomain: string; signingSecret: string };
const terminal = new Set(["opted_out","suppressed","declined","booked"]);
const injection = (text: string) => /ignore\s+(?:all\s+)?(?:your|previous|system)\s+(?:rules|instructions)|\bsystem\s*:|\b(?:give|apply)\s+\d{1,3}\s*%\s*(?:off|discount)|another\s+tenant/i.test(text);

export class LmcEmailWorker {
  private readonly queue: LmcJobQueue;
  private readonly baseUrl: string;
  constructor(private readonly input: WorkerInput) {
    const url = new URL(input.baseUrl);
    if (url.protocol!=="https:" || url.username || url.password || url.search || url.hash || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(input.receivingDomain) || input.channel.kind!=="email") throw new Error("INVALID_EMAIL_WORKER_CONFIG");
    this.baseUrl = input.baseUrl.replace(/\/$/,"");
    // Validate the mandatory signing secret before the first outbound transaction.
    signActionToken({tenantId:"00000000-0000-4000-8000-000000000000",leadId:"00000000-0000-4000-8000-000000000000",purpose:"unsubscribe"},input.signingSecret);
    this.queue = new LmcJobQueue({worker:input.database,dispatcher:input.dispatcher,now:input.now});
  }

  /** Bounded work per invocation. The runtime can call this again while work remains. */
  async drain(maxRounds = 20): Promise<{ completed: number; failed: number }> {
    if (!Number.isInteger(maxRounds) || maxRounds<1 || maxRounds>100) throw new Error("INVALID_QUEUE_LIMIT");
    const result = {completed:0,failed:0};
    for (let round=0;round<maxRounds;round++) {
      let claimed=0;
      for (const tenant of await this.queue.dueTenants()) {
        for (const job of await this.queue.claim(tenant,10)) {
          claimed++;
          try {
            if (job.kind==="process") await this.process(job);
            else if (job.kind==="send") await this.send(job);
            else throw new Error("INVALID_JOB_PAYLOAD");
            if (await this.queue.complete(job)) result.completed++;
          } catch (error) {
            const code = error instanceof Error ? error.message : "LMC_JOB_FAILED";
            await this.queue.fail(job,code);
            result.failed++;
          }
        }
      }
      if (!claimed) break;
    }
    return result;
  }

  private scoped<T>(tenantId: string, fn: (tx: DatabaseTransaction) => Promise<T>) {
    return withBusinessTransaction(this.input.database,{businessId:tenantId,actorType:"worker"},fn);
  }
  private async lease(tx: DatabaseTransaction, job: LmcJob) {
    const [current] = await tx.select().from(lmcJobs).where(and(eq(lmcJobs.tenantId,job.tenantId),eq(lmcJobs.id,job.id))).for("update");
    if (!current || current.status!=="running" || current.leaseToken!==job.leaseToken || !current.leasedUntil || current.leasedUntil<=this.input.now()) throw new Error("LMC_JOB_FAILED");
  }
  private async suppressed(tx: DatabaseTransaction, lead: Lead) {
    return (await tx.select({email:lmcSuppressions.email}).from(lmcSuppressions).where(and(eq(lmcSuppressions.tenantId,lead.tenantId),eq(lmcSuppressions.email,lead.email))).limit(1)).length>0;
  }

  private async process(job: LmcJob) {
    const payload = lmcProcessJobSchema.parse(job.payload);
    const snapshot = await this.scoped(job.tenantId,async tx => {
      const [processed] = await tx.select({id:lmcEvents.id}).from(lmcEvents).where(and(eq(lmcEvents.tenantId,job.tenantId),eq(lmcEvents.externalId,`processed:${job.id}`))).limit(1);
      if (processed) return null;
      const [lead] = await tx.select().from(lmcLeads).where(and(eq(lmcLeads.tenantId,job.tenantId),eq(lmcLeads.id,job.leadId))).limit(1);
      const [settings] = await tx.select().from(lmcSettings).where(eq(lmcSettings.tenantId,job.tenantId)).limit(1);
      const [message] = await tx.select().from(lmcMessages).where(and(eq(lmcMessages.tenantId,job.tenantId),eq(lmcMessages.leadId,job.leadId),eq(lmcMessages.id,payload.messageId),eq(lmcMessages.direction,"lead"))).limit(1);
      if (!lead || !message || !settings?.enabled || !verifyReplyToken(payload.replyToken,job.tenantId,lead.replyTokenHash)) throw new Error("INVALID_JOB_PAYLOAD");
      if (lead.aiPaused || terminal.has(lead.status) || lead.followupGeneration!==payload.generation || await this.suppressed(tx,lead)) return null;
      const history = await tx.select().from(lmcMessages).where(and(eq(lmcMessages.tenantId,job.tenantId),eq(lmcMessages.leadId,lead.id))).orderBy(asc(lmcMessages.createdAt),asc(lmcMessages.id));
      return {lead,message,history,settings:lmcBusinessSettingsSchema.parse(settings.config)};
    });
    if (!snapshot) return;
    const {lead,message,settings,history} = snapshot;
    const isEmergency = settings.emergencyKeywords.some(word=>message.body.toLowerCase().includes(word.toLowerCase()));
    const isInjection = message.headers["X-LMC-Injection-Detected"]==="true" || injection(`${lead.name ?? ""}\n${message.subject}\n${message.body}`);
    let actions: LmcStructuredAction[] = [];
    if (!isEmergency && !isInjection) {
      try {
        actions = (await this.input.channel.run({channel:"email",tenant:{id:job.tenantId,settings},contact:{id:lead.contactId ?? lead.id,email:lead.email},message:{id:message.id,subject:message.subject,text:message.body},
          history:history.filter(item=>item.id!==message.id && ["lead","assistant","human"].includes(item.direction)).map(item=>({role:item.direction as "lead"|"assistant"|"human",text:item.body}))})).actions;
      } catch { actions=[{type:"handoff",reason:"model_unavailable"}]; }
    }
    await this.scoped(job.tenantId,async tx => {
      await this.lease(tx,job);
      const [current] = await tx.select().from(lmcLeads).where(and(eq(lmcLeads.tenantId,job.tenantId),eq(lmcLeads.id,lead.id))).for("update");
      if (!current || current.aiPaused || terminal.has(current.status) || current.followupGeneration!==payload.generation || await this.suppressed(tx,current)) return;
      const [already] = await tx.select({id:lmcEvents.id}).from(lmcEvents).where(and(eq(lmcEvents.tenantId,job.tenantId),eq(lmcEvents.externalId,`processed:${job.id}`))).limit(1);
      if (already) return;
      let qualification={...current.qualification,...(current.name ? {name:current.name} : {})};
      let status="qualifying", reason: string|null=null, paused=false, alert=false;
      let text="Please share your ZIP code and whether you need roof repair or roof replacement. Is this a residential or commercial property?";
      if (isEmergency) {
        qualification={...qualification,urgency:"emergency"}; status="human_handoff"; reason="emergency"; paused=true; alert=true; text=settings.emergencyText;
      } else if (isInjection) {
        status="human_handoff"; reason="prompt_injection_detected"; paused=true; alert=true; text="A team member will review your request and reply personally.";
        await tx.insert(lmcEvents).values({tenantId:job.tenantId,leadId:lead.id,type:"prompt_injection_detected",metadata:{messageId:message.id},createdAt:this.input.now()});
      } else {
        for (const action of actions) if (action.type==="qualify") {
          const parsed=lmcQualificationSchema.safeParse(action.fields);
          if (!parsed.success || !Number.isFinite(action.confidence) || action.confidence<settings.confidenceThreshold) {actions=[{type:"handoff",reason:"invalid_model_output"}];break;}
          qualification={...qualification,...parsed.data};
        }
        const handoff=actions.find(action=>action.type==="handoff");
        const intent=actions.find(action=>action.type==="intent");
        const requestedService=qualification.serviceType?.toLowerCase();
        const service=requestedService ? settings.services.find(item=>[item.name,...item.aliases].some(name=>name.toLowerCase()===requestedService)) : undefined;
        if (qualification.zip && !settings.serviceAreaZips.includes(qualification.zip)) {status="declined";reason="outside_service_area";text="This location is outside our service area. We do not serve that ZIP code.";}
        else if (requestedService && !service) {status="declined";reason="unsupported_service";text="We do not offer the requested service. Our team can help only with our listed services.";}
        else if (handoff || (intent?.type==="intent" && ["complaint","complex","unknown","reschedule","cancel","book","availability"].includes(intent.intent))) {
          status="human_handoff";reason=handoff?.type==="handoff" ? handoff.reason : "human_review_required";paused=true;alert=true;text="A team member will review your request and reply personally.";
        } else if (intent?.type==="intent" && intent.intent==="wait") {text="Thank you. We will wait for you to contact our office.";}
        else {
          const questions:string[]=[];
          if (!qualification.zip) questions.push("What is your ZIP code?");
          if (!service) questions.push(`Which service do you need: ${settings.services.map(item=>item.name).join(" or ")}? Please tell us whether this is repair or replacement.`);
          if (!qualification.propertyType) questions.push("Is the property residential or commercial?");
          if (service) qualification.serviceType=service.name;
          if (!questions.length) questions.push("Thank you. A team member will help arrange an inspection.");
          text=questions.join(" ");
          if (intent?.type==="intent" && intent.intent==="price") text=`${settings.priceInformation || "We need an inspection to provide an estimate; we cannot quote a price by email."} ${text}`;
        }
      }
      await tx.update(lmcLeads).set({qualification,status,reason,aiPaused:paused,updatedAt:this.input.now()}).where(and(eq(lmcLeads.tenantId,job.tenantId),eq(lmcLeads.id,lead.id)));
      await this.outbound(tx,job,current,message,settings,payload.replyToken,text,"reply",paused,payload.generation);
      if (alert) {
        const transcript=history.map(item=>`[${item.direction}] ${item.body}`).join("\n\n");
        const summary=`Lead: ${current.email}\nZIP: ${qualification.zip ?? "unknown"}\nService: ${qualification.serviceType ?? "unknown"}\nReason: ${reason}\n\nHistory:\n${transcript}`;
        const full=summary.length>45_000 ? `${summary.slice(0,45_000)}\nFull history: ${this.baseUrl}/leads/${lead.id}` : summary;
        await this.outbound(tx,job,current,message,settings,payload.replyToken,full,"owner_alert",true,payload.generation);
      }
      await tx.insert(lmcEvents).values({tenantId:job.tenantId,leadId:lead.id,type:"email_processed",externalId:`processed:${job.id}`,metadata:{messageId:message.id,status,reason},createdAt:this.input.now()});
    });
  }

  private async outbound(tx: DatabaseTransaction, job: LmcJob, lead: Lead, incoming: Message, settings: LmcBusinessSettings, replyToken: string, body: string, kind: "reply"|"owner_alert", allowPaused: boolean, generation: number) {
    const id=randomUUID();
    const messageId=`<${job.id}-${kind}@${this.input.receivingDomain}>`;
    const headers:Record<string,string>={"Message-ID":messageId,"Auto-Submitted":"auto-generated"};
    let text=body;
    if (kind!=="owner_alert") {
      const token=signActionToken({tenantId:lead.tenantId,leadId:lead.id,purpose:"unsubscribe"},this.input.signingSecret);
      const unsubscribe=`${this.baseUrl}/api/lmc/unsubscribe/${token}`;
      text+=`\n\n${settings.physicalAddress}\nReply STOP or unsubscribe: ${unsubscribe}`;
      headers["List-Unsubscribe"]=`<${unsubscribe}>`;
      headers["List-Unsubscribe-Post"]="List-Unsubscribe=One-Click";
      headers["In-Reply-To"]=incoming.messageId;
      headers.References=incoming.messageId;
    }
    const outbound:LmcOutboundEmail={tenantId:lead.tenantId,leadId:lead.id,idempotencyKey:`lmc:${id}`,kind,from:settings.fromEmail,to:kind==="owner_alert" ? settings.ownerEmail : lead.email,
      replyTo:kind==="owner_alert" ? settings.fromEmail : `reply+${replyToken}@${this.input.receivingDomain}`,subject:kind==="owner_alert" ? "Lead requires your attention" : `Re: ${lead.subject || "Your request"}`,text,headers};
    await tx.insert(lmcMessages).values({id,tenantId:lead.tenantId,leadId:lead.id,direction:kind==="owner_alert" ? "owner" : "assistant",kind,messageId,toEmail:outbound.to,subject:outbound.subject,body:text,headers,status:"queued",createdAt:this.input.now()});
    await enqueueLmcJob(tx,{tenantId:lead.tenantId,leadId:lead.id,kind:"send",dedupeKey:`send:${id}`,payload:{messageId:id,outbound,generation,allowPaused},availableAt:this.input.now()});
  }

  private async send(job: LmcJob) {
    const payload=lmcSendJobSchema.parse(job.payload);
    await this.scoped(job.tenantId,async tx=>{
      await this.lease(tx,job);
      const [lead]=await tx.select().from(lmcLeads).where(and(eq(lmcLeads.tenantId,job.tenantId),eq(lmcLeads.id,job.leadId))).for("update");
      const [message]=await tx.select().from(lmcMessages).where(and(eq(lmcMessages.tenantId,job.tenantId),eq(lmcMessages.leadId,job.leadId),eq(lmcMessages.id,payload.messageId))).for("update");
      const outgoing=payload.outbound;
      if (!lead || !message || outgoing.tenantId!==job.tenantId || outgoing.leadId!==job.leadId || outgoing.headers["Message-ID"]!==message.messageId || outgoing.text!==message.body || outgoing.to!==message.toEmail || outgoing.subject!==message.subject || outgoing.kind!==message.kind) throw new Error("INVALID_JOB_PAYLOAD");
      if (message.status!=="queued") return;
      const owner=message.kind==="owner_alert";
      const [settings]=await tx.select().from(lmcSettings).where(eq(lmcSettings.tenantId,job.tenantId)).limit(1);
      const config=settings ? lmcBusinessSettingsSchema.parse(settings.config) : null;
      const replyPrefix="reply+", replySuffix=`@${this.input.receivingDomain}`;
      const replyToken=outgoing.replyTo.startsWith(replyPrefix) && outgoing.replyTo.endsWith(replySuffix) ? outgoing.replyTo.slice(replyPrefix.length,-replySuffix.length) : "";
      const validRecipient=config && outgoing.from===config.fromEmail && outgoing.to===(owner ? config.ownerEmail : lead.email)
        && (owner ? outgoing.replyTo===config.fromEmail : verifyReplyToken(replyToken,job.tenantId,lead.replyTokenHash));
      if (outgoing.idempotencyKey!==`lmc:${message.id}` || JSON.stringify(outgoing.headers)!==JSON.stringify(message.headers)) throw new Error("INVALID_JOB_PAYLOAD");
      if (!settings?.enabled || !validRecipient || (!owner && (await this.suppressed(tx,lead) || ["suppressed","opted_out"].includes(lead.status) || lead.followupGeneration!==payload.generation || (lead.aiPaused && !payload.allowPaused)))) {
        await tx.update(lmcMessages).set({status:"cancelled"}).where(and(eq(lmcMessages.tenantId,job.tenantId),eq(lmcMessages.id,message.id)));return;
      }
      const delivery=await this.input.mail.send(outgoing);
      await tx.update(lmcMessages).set({status:"sent",providerId:delivery.providerMessageId,sentAt:this.input.now()}).where(and(eq(lmcMessages.tenantId,job.tenantId),eq(lmcMessages.id,message.id)));
      if (!owner) await tx.update(lmcLeads).set({lastOutboundMessageId:message.messageId,updatedAt:this.input.now()}).where(and(eq(lmcLeads.tenantId,job.tenantId),eq(lmcLeads.id,lead.id)));
    });
  }
}
