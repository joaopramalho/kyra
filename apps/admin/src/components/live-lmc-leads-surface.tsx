"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertCircle, ArrowUpRight, Bot, CalendarClock, CheckCircle2, ChevronLeft, Clock3, Mail, MessageSquareText, Pause, Play, RefreshCw, Search, Send, ShieldAlert, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectActiveBusiness } from "@/lib/active-business";
import { requestJson } from "@/lib/request-json";

type Business = { businessId: string; active: boolean; role: string };
type Lead = {
  id: string;
  name: string;
  email: string;
  subject: string;
  status: string;
  reason?: string | null;
  aiPaused: boolean;
  consentFollowups: boolean;
  followupCount: number;
  qualification: Record<string, string | null>;
  appointmentId: string | null;
  createdAt: string;
  updatedAt: string;
};
type Message = {
  id: string;
  direction: string;
  kind: string;
  body: string;
  status: string;
  createdAt: string;
};
type LeadEvent = { id: string; type: string; metadata: Record<string, unknown>; createdAt: string };
type Appointment = { id: string; startsAt: string; endsAt: string; timezone: string; status: string; calendarSyncState: string; serviceName: string; staffName: string };
type Detail = {
  lead: Lead;
  appointment: Appointment | null;
  messages: Message[];
  events: LeadEvent[];
  role: string;
  nextBefore: string | null;
};
const leadStatuses = ["new", "qualifying", "qualified", "human_handoff", "booked", "declined", "opted_out", "suppressed"] as const;
const canReply = (role: string) =>
  ["scheduler", "business_admin", "business_owner", "platform_admin"].includes(
    role,
  );

export function LiveLmcLeadsSurface() {
  const { t } = useTranslation("lmc");
  const businesses = useQuery({
    queryKey: ["businesses"],
    queryFn: ({ signal }) =>
      requestJson<{ businesses: Business[] }>("/api/businesses", { signal }),
  });
  const business = selectActiveBusiness(businesses.data?.businesses);
  if (businesses.isPending) return <div className="flex flex-col gap-4" role="status" aria-label={t("loading")}><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;
  if (businesses.isError) return <Card className="rounded-2xl"><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><AlertCircle className="size-6 text-destructive" /><p role="alert" className="text-sm text-muted-foreground">{t("loadFailed")}</p><Button variant="outline" onClick={() => void businesses.refetch()}><RefreshCw data-icon="inline-start" />{t("retry")}</Button></CardContent></Card>;
  if (!business)
    return (
      <Card className="rounded-2xl"><CardContent className="py-12 text-center text-sm text-muted-foreground" role="status">{t("noWorkspace")}</CardContent></Card>
    );
  return <LeadWorkspace key={business.businessId} business={business} />;
}

function LeadWorkspace({ business }: { business: Business }) {
  const { t, i18n } = useTranslation("lmc");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [view, setView] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const agent = useQuery({
    queryKey: ["lmc-agent-status", business.businessId],
    queryFn: ({ signal }) => requestJson<{ enabled: boolean; providerMode: string }>(`/api/lmc/settings?businessId=${encodeURIComponent(business.businessId)}`, { signal }),
    refetchInterval: 30_000,
  });
  const list = useQuery({
    queryKey: ["lmc-leads", business.businessId, search, status, view, page],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ businessId: business.businessId, limit: "25", offset: String(page * 25), search });
      if (status !== "all") params.set("status", status);
      if (view !== "all") params.set("view", view);
      return requestJson<{ items: Lead[]; summary: Record<string, number>; aiActiveCount: number; hasNext: boolean; role: string }>(`/api/leads?${params}`, { signal });
    },
    refetchInterval: 10_000,
  });
  const summary = list.data?.summary ?? {};
  const metrics = [
    ["total", Object.values(summary).reduce((a, b) => a + b, 0), Mail],
    ["new", summary.new ?? 0, MessageSquareText],
    ["active", (summary.qualifying ?? 0) + (summary.qualified ?? 0), Bot],
    ["booked", summary.booked ?? 0, CalendarClock],
    ["attention", summary.human_handoff ?? 0, ShieldAlert],
  ] as const;
  return (
    <div className="ph-no-capture flex flex-col gap-4">
      <header className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("eyebrow")}</p>
          <h1 className="type-page-title">{t("title")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AgentStatus data={agent.data} error={agent.isError} t={t} />
          <Button className="rounded-xl" nativeButton={false} render={<Link href="/settings/email" />} variant="outline">{t("manageEmail")}<ArrowUpRight data-icon="inline-end" /></Button>
        </div>
      </header>
      <section aria-label={t("overviewTitle")} className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
        {metrics.map(([label, count, Icon], index) => (
          <Card className={`rounded-none border-0 bg-card py-0 shadow-none ${index === 4 ? "col-span-2 sm:col-span-1" : ""}`} key={label}>
            <CardContent className="flex items-center gap-3 px-3 py-3 sm:px-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground"><Icon aria-hidden="true" className="size-4" /></span>
              <div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{t(`metrics.${label}`)}</p>{list.isPending ? <Skeleton className="mt-1 h-6 w-12" /> : list.isError ? <p className="mt-1 text-xs text-muted-foreground">{t("unavailable")}</p> : <p className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums">{count.toLocaleString(i18n.language)}</p>}</div>
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="grid min-h-[min(68vh,760px)] items-start gap-3 lg:grid-cols-[minmax(18rem,0.78fr)_minmax(0,1.7fr)]">
        <Card className={`min-h-[30rem] overflow-hidden rounded-2xl border-border/70 py-0 shadow-sm ${selected ? "hidden lg:flex lg:flex-col" : "flex flex-col"}`}>
          <div className="flex flex-col gap-3 border-b p-4">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">{t("inboxTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("leadCount", { count: list.data?.items.length ?? 0 })}</p></div>{list.isFetching ? <RefreshCw aria-label={t("refreshing")} className="size-4 animate-spin text-muted-foreground" /> : null}</div>
            <label className="relative block" htmlFor="lmc-lead-search"><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="lmc-lead-search" aria-label={t("search")} className="h-10 rounded-xl ps-9" placeholder={t("search")} maxLength={200} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></label>
            <div role="group" aria-label={t("quickViews")} className="grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1">
              {(["all", "needs_attention", "ai_active", "booked"] as const).map((item) => <button key={item} type="button" aria-pressed={view === item} className={`min-h-9 rounded-lg px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setView(item); setStatus("all"); setPage(0); }}>{t(`views.${item}`)} <span className="ms-1 tabular-nums">{item === "all" ? Object.values(summary).reduce((a, b) => a + b, 0) : item === "needs_attention" ? summary.human_handoff ?? 0 : item === "booked" ? summary.booked ?? 0 : list.data?.aiActiveCount ?? 0}</span></button>)}
            </div>
            <Select value={status} onValueChange={(value) => { setStatus(String(value ?? "all")); setView("all"); setPage(0); }}>
              <SelectTrigger aria-label={t("filterStatus")} className="h-10 w-full rounded-xl"><SelectValue>{t(status === "all" ? "allStatuses" : `statuses.${status}`)}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="all">{t("allStatuses")}</SelectItem>{["new", "qualifying", "qualified", "human_handoff", "booked", "declined", "opted_out", "suppressed"].map((value) => <SelectItem key={value} value={value}>{t(`statuses.${value}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-3">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {list.isError ? <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4" role="alert"><p className="text-sm text-destructive">{t("loadFailed")}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => void list.refetch()}><RefreshCw data-icon="inline-start" />{t("retry")}</Button></div>
                : list.isPending ? <div className="flex flex-col gap-2" role="status">{Array.from({ length: 6 }, (_, index) => <LeadRowSkeleton key={index} />)}</div>
                : list.data.items.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center p-5 text-center"><Search className="size-5 text-muted-foreground" /><p className="mt-3 font-medium">{t(search || status !== "all" || view !== "all" ? "noMatchesTitle" : "emptyTitle")}</p><p className="mt-1 text-sm text-muted-foreground">{t(search || status !== "all" || view !== "all" ? "noMatches" : "empty")}</p></div>
                : <ul className="flex flex-col gap-1">{list.data.items.map((lead) => <li key={lead.id}><LeadListRow lead={lead} locale={i18n.language} selected={selected === lead.id} onClick={() => setSelected(lead.id)} /></li>)}</ul>}
            </div>
            {list.data?.items.length ? <div className="flex items-center justify-between gap-2 border-t pt-3"><span className="text-xs tabular-nums text-muted-foreground">{t("pageCount", { from: page * 25 + 1, to: page * 25 + list.data.items.length })}</span><div className="flex gap-1"><Button aria-label={t("previous")} size="icon-sm" variant="outline" disabled={page === 0 || list.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft className="rtl:rotate-180" /></Button><Button aria-label={t("next")} size="icon-sm" variant="outline" disabled={!list.data.hasNext || list.isFetching} onClick={() => setPage((value) => value + 1)}><ChevronLeft className="rotate-180 rtl:rotate-0" /></Button></div></div> : null}
          </CardContent>
        </Card>
        {selected ? (
          <LeadConversation key={selected} business={business} id={selected} onBack={() => setSelected(null)} />
        ) : (
          <Card className="hidden min-h-[30rem] rounded-2xl lg:flex lg:items-center lg:justify-center 2xl:col-span-2">
            <CardContent className="mx-auto max-w-sm py-8 text-center text-muted-foreground">
              <Mail className="mx-auto size-6" />
              <p className="mt-3 font-medium text-foreground">{t("selectLeadTitle")}</p>
              <p className="mt-1 text-sm">{t("selectLead")}</p>
            </CardContent>
          </Card>
        )}
      </div>
      {list.data ? <details className="rounded-xl bg-muted/20 px-4 py-3"><summary className="cursor-pointer text-sm font-medium">{t("statusMixTitle")}</summary><div className="pt-3"><StatusDistribution counts={list.data.summary} locale={i18n.language} /></div></details> : null}
    </div>
  );
}

function AgentStatus({ data, error, t }: { data: { enabled: boolean; providerMode: string } | undefined; error: boolean; t: (key: string) => string }) {
  return (
    <Badge className="h-9 gap-2 rounded-xl border-border/70 bg-background px-3 font-medium" variant="outline" role="status">
      <span aria-hidden="true" className={`size-2 rounded-full ${error || !data ? "bg-muted-foreground" : data.enabled ? "bg-emerald-500" : "bg-amber-500"}`} />
      {error ? t("agentUnavailable") : !data ? t("agentLoading") : t(data.enabled ? "agentActive" : "agentPaused")}
      {data?.providerMode === "fake" ? <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t("demoMode")}</span> : null}
    </Badge>
  );
}

function StatusDistribution({ counts, locale }: { counts: Record<string, number>; locale: string }) {
  const { t } = useTranslation("lmc");
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return (
    <Card className="rounded-2xl border-border/70 py-0 shadow-sm">
      <CardHeader className="border-b px-4 py-4 sm:px-5"><CardTitle className="text-sm">{t("statusMixTitle")}</CardTitle><CardDescription>{t("statusMixDescription")}</CardDescription></CardHeader>
      <CardContent className="grid gap-x-8 gap-y-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
        {leadStatuses.map((status) => {
          const count = counts[status] ?? 0;
          return (
            <div className="min-w-0" key={status}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="truncate text-muted-foreground">{t(`statuses.${status}`)}</span><span className="shrink-0 font-medium tabular-nums">{count.toLocaleString(locale)}</span></div>
              <div aria-label={t(`statuses.${status}`)} aria-valuemax={total} aria-valuemin={0} aria-valuenow={count} className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${total ? Math.round((count / total) * 100) : 0}%` }} /></div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function LeadListRow({
  lead,
  locale,
  selected,
  onClick,
}: {
  lead: Lead;
  locale: string;
  selected: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation("lmc");
  const initials = lead.name?.trim()
    ? lead.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")
    : lead.email.slice(0, 2).toUpperCase();
  const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(new Date(lead.updatedAt));
  return (
    <button
      aria-label={lead.name || lead.email}
      aria-pressed={selected}
      className={`w-full rounded-xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary/25 bg-primary/[0.055]" : "border-transparent hover:border-border/70 hover:bg-muted/45"}`}
      onClick={onClick}
      type="button"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-medium">{initials}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{lead.name || lead.email}</span>
            <time className="shrink-0 pt-0.5 text-[11px] text-muted-foreground" dateTime={lead.updatedAt}>{date}</time>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{lead.email}</span>
          <span className="mt-1 line-clamp-2 break-words text-xs leading-5 text-foreground/80">{lead.subject || t("noSubject")}</span>
          <span className="mt-2 flex items-center gap-2">
            <Badge className="max-w-full truncate rounded-full" variant={lead.status === "human_handoff" ? "destructive" : lead.status === "booked" ? "secondary" : "outline"}>{t(`statuses.${lead.status}`, { defaultValue: lead.status })}</Badge>
            {lead.aiPaused ? <Badge className="rounded-full px-2 py-0 text-[10px]" variant="outline">{t("pausedShort")}</Badge> : null}
          </span>
        </span>
      </div>
    </button>
  );
}

function LeadRowSkeleton() {
  return <div className="flex gap-3 rounded-xl p-3"><Skeleton className="size-9 shrink-0 rounded-full" /><div className="flex flex-1 flex-col gap-2 py-1"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-1/2" /></div></div>;
}

function LeadConversation({
  business,
  id,
  onBack,
}: {
  business: Business;
  id: string;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation("lmc");
  const client = useQueryClient();
  const [draft, setDraft] = useState("");
  const pending = useRef<{ requestId: string; text: string } | null>(null);
  const url = "/api/leads/" + encodeURIComponent(id);
  const workspace = "businessId=" + encodeURIComponent(business.businessId);
  const detail = useInfiniteQuery({
    queryKey: ["lmc-lead", business.businessId, id],
    initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) =>
      requestJson<Detail>(
        url + "?" + workspace + (pageParam ? "&before=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (page) => page.nextBefore ?? undefined,
    refetchInterval: 5_000,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["lmc-lead", business.businessId, id] }),
      client.invalidateQueries({ queryKey: ["lmc-leads", business.businessId] }),
    ]);
  };
  const send = useMutation({
    mutationFn: () => {
      if (!pending.current || pending.current.text !== draft.trim()) {
        pending.current = { requestId: crypto.randomUUID(), text: draft.trim() };
      }
      return requestJson(url + "/reply?" + workspace, {
        method: "POST",
        body: JSON.stringify(pending.current),
      });
    },
    onSuccess: async () => {
      setDraft("");
      pending.current = null;
      await refresh();
    },
  });
  const pause = useMutation({
    mutationFn: (paused: boolean) =>
      requestJson(url + "/automation?" + workspace, {
        method: "PATCH",
        body: JSON.stringify({ paused }),
      }),
    onSuccess: refresh,
  });

  if (detail.isError) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="size-6 text-destructive" />
          <p className="text-sm text-muted-foreground" role="alert">{t("loadFailed")}</p>
          <div className="flex gap-2">
            <Button onClick={onBack} variant="outline">{t("backToLeads")}</Button>
            <Button onClick={() => void detail.refetch()}><RefreshCw data-icon="inline-start" />{t("retry")}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  const data = detail.data?.pages[0];
  if (!data) {
    return (
      <Card className="min-h-96 rounded-2xl" role="status">
        <CardContent className="flex h-full flex-col justify-end gap-4 p-6">
          <Skeleton className="h-16 w-3/5" />
          <Skeleton className="h-20 w-3/4 self-end" />
          <Skeleton className="h-16 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  const lead = data.lead;
  const allowed = canReply(data.role) && !["opted_out", "suppressed"].includes(lead.status);
  const messages = [
    ...new Map(
      detail.data!.pages.flatMap((page) => page.messages).map((message) => [message.id, message]),
    ).values(),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const events = data.events.filter((event) => event.type !== "email_received").slice(0, 20);
  const timeline = [
    ...messages.map((item) => ({ type: "message" as const, item, at: item.createdAt })),
    ...events.map((item) => ({ type: "event" as const, item, at: item.createdAt })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <>
      <Card className="flex min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-2xl border-border/70 py-0 shadow-sm lg:col-start-2 2xl:col-start-2">
        <CardHeader className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-3 border-b px-4 py-3 sm:flex sm:flex-row sm:px-5">
          <Button className="shrink-0 lg:hidden" aria-label={t("backToLeads")} onClick={onBack} size="icon-sm" variant="ghost">
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted/50 text-xs font-medium">
            {lead.name?.slice(0, 1).toUpperCase() || lead.email.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <CardTitle className="truncate text-sm">{lead.name || lead.email}</CardTitle>
            <CardDescription className="mt-0.5 line-clamp-1 break-words">{lead.subject || t("noSubject")}</CardDescription>
          </div>
          <div className="col-span-full flex w-full shrink-0 flex-wrap items-center justify-end gap-1.5 sm:col-span-auto sm:ms-auto sm:w-auto">
            <LeadStatusBadge status={lead.status} />
            <Badge variant="outline" className="rounded-full"><Bot className="me-1 size-3" />{t(lead.aiPaused ? "pausedShort" : "aiActiveShort")}</Badge>
            {allowed ? <Button size="sm" variant="outline" disabled={pause.isPending} onClick={() => pause.mutate(!lead.aiPaused)}>{lead.aiPaused ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}{t(lead.aiPaused ? "resume" : "pause")}</Button> : null}
          </div>
        </CardHeader>
        {lead.status === "human_handoff" ? <div className="border-b border-amber-500/20 bg-amber-500/[0.06] px-4 py-2 text-xs leading-5 text-amber-900 dark:text-amber-100"><span className="font-semibold">{t("handoffNotice")}</span>{lead.reason ? <span className="ms-1">{t(`handoffReasons.${lead.reason}`, { defaultValue: t("handoffReasonUnknown") })}</span> : null}</div> : null}
        <div className="flex min-h-0 flex-1 flex-col">
          {detail.hasNextPage ? (
            <div className="border-b px-4 py-1 text-center">
              <Button variant="ghost" size="sm" loading={detail.isFetchingNextPage} loadingLabel={t("loading")} disabled={detail.isFetchingNextPage} onClick={() => void detail.fetchNextPage()}>{t("earlier")}</Button>
            </div>
          ) : null}
          <ol aria-label={t("conversationHistory")} className="flex min-h-64 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">
            {timeline.length === 0 ? (
              <li className="m-auto max-w-xs py-10 text-center text-sm leading-6 text-muted-foreground">{t("noMessages")}</li>
            ) : timeline.map((entry) => entry.type === "message" ? (
              <MessageEntry key={"message:" + entry.item.id} item={entry.item} locale={i18n.language} />
            ) : (
              <EventEntry key={"event:" + entry.item.id} item={entry.item} locale={i18n.language} />
            ))}
          </ol>
          {allowed ? (
            <form className="border-t bg-muted/15 p-3 sm:p-4" onSubmit={(event) => { event.preventDefault(); if (draft.trim() && !send.isPending) send.mutate(); }}>
              {send.isError ? <p className="mb-2 text-sm text-destructive" role="alert">{t("sendFailed")}</p> : null}
              {send.isSuccess ? <p className="mb-2 text-sm text-muted-foreground" role="status">{t("queued")}</p> : null}
              <label className="sr-only" htmlFor={"lmc-human-reply-" + id}>{t("reply")}</label>
              <Textarea id={"lmc-human-reply-" + id} className="min-h-20 rounded-xl bg-background" maxLength={8000} placeholder={t("replyPlaceholder")} value={draft} disabled={send.isPending} onChange={(event) => { setDraft(event.target.value); send.reset(); }} />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{t("replyHelp")}</p>
                <Button disabled={send.isPending || !draft.trim()} loading={send.isPending} loadingLabel={t("sending")} type="submit"><Send data-icon="inline-start" />{t("send")}</Button>
              </div>
            </form>
          ) : <p className="border-t px-4 py-3 text-sm text-muted-foreground">{t("readOnlyConversation")}</p>}
        </div>
      </Card>

      <details className="lg:col-start-2 rounded-xl bg-muted/20 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">{t("leadProfile")}</summary>
        <aside className="mt-3 flex flex-col gap-3" aria-label={t("leadProfile")}>
        <Card className="rounded-2xl border-border/70 py-0 shadow-sm">
          <CardHeader className="border-b px-4 py-4"><CardTitle className="text-sm">{t("leadProfile")}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4 px-4 py-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{lead.name || t("unknownLead")}</p>
              <p className="mt-0.5 break-all text-xs text-muted-foreground">{lead.email}</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="flex items-start gap-2.5">
                {lead.aiPaused ? <Pause className="mt-0.5 size-4 text-muted-foreground" /> : <Bot className="mt-0.5 size-4 text-primary" />}
                <div>
                  <p className="text-sm font-medium">{t(lead.aiPaused ? "paused" : "active")}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t(lead.aiPaused ? "resumeHelp" : "activeHelp")}</p>
                </div>
              </div>
              {pause.isError ? <p className="mt-2 text-xs text-destructive" role="alert">{t("pauseFailed")}</p> : null}
              {pause.isSuccess ? <p className="mt-2 text-xs text-muted-foreground" role="status">{t("automationUpdated")}</p> : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
              <ProfileDatum label={t("createdAt")} value={new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(lead.createdAt))} />
              <ProfileDatum label={t("followupsSent")} value={lead.followupCount.toLocaleString(i18n.language)} />
              <ProfileDatum label={t("followupConsent")} value={t(lead.consentFollowups ? "consentedShort" : "notConsentedShort")} />
            </dl>
          </CardContent>
        </Card>

        {Object.entries(lead.qualification).some(([, value]) => Boolean(value)) ? (
          <Card className="rounded-2xl border-border/70 py-0 shadow-sm">
            <CardHeader className="border-b px-4 py-4"><CardTitle className="text-sm">{t("qualification")}</CardTitle></CardHeader>
            <CardContent className="px-4 py-4">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
                {Object.entries(lead.qualification).filter(([, value]) => Boolean(value)).map(([key, value]) => (
                  <ProfileDatum key={key} label={t("fields." + key, { defaultValue: key })} value={String(value)} />
                ))}
              </dl>
            </CardContent>
          </Card>
        ) : null}

        {data.appointment ? (
          <Card className="rounded-2xl border-border/70 py-0 shadow-sm">
            <CardHeader className="border-b px-4 py-4"><CardTitle className="flex items-center gap-2 text-sm"><CalendarClock className="size-4 text-primary" />{t("appointment")}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 px-4 py-4">
              <div><p className="text-sm font-medium">{data.appointment.serviceName}</p><p className="mt-0.5 text-xs text-muted-foreground">{t("withStaff", { name: data.appointment.staffName })}</p></div>
              <div className="rounded-xl bg-muted/35 p-3">
                <p className="text-xs text-muted-foreground">{t("appointmentTime")}</p>
                <p className="mt-1 text-sm font-medium">{new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short", timeZone: data.appointment.timezone }).format(new Date(data.appointment.startsAt))}</p>
              </div>
              <Badge className="w-fit rounded-full" variant="outline">{t("appointmentStatus." + data.appointment.status, { defaultValue: data.appointment.status })}</Badge>
              <Badge className="w-fit rounded-full" variant={data.appointment.calendarSyncState === "failed" ? "destructive" : data.appointment.calendarSyncState === "synced" ? "secondary" : "outline"}>
                {data.appointment.calendarSyncState === "synced" ? <CheckCircle2 className="me-1 size-3" /> : data.appointment.calendarSyncState === "failed" ? <AlertCircle className="me-1 size-3" /> : <Clock3 className="me-1 size-3" />}
                {t("calendarSync." + data.appointment.calendarSyncState, { defaultValue: t("calendarSync.pending") })}
              </Badge>
              {data.appointment.calendarSyncState === "failed" ? <p className="text-xs leading-5 text-destructive">{t("calendarSync.failedHelp")}</p> : null}
            </CardContent>
          </Card>
        ) : lead.status === "booked" ? (
          <Card className="rounded-2xl border-amber-500/25 bg-amber-500/[0.04] py-0">
            <CardContent className="flex gap-2.5 px-4 py-4 text-sm text-amber-800 dark:text-amber-200"><AlertCircle className="mt-0.5 size-4 shrink-0" /><p>{t("bookingRecordMissing")}</p></CardContent>
          </Card>
        ) : null}
        </aside>
      </details>
    </>
  );
}

function LeadStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("lmc");
  return <Badge className="max-w-32 truncate rounded-full" variant={status === "human_handoff" ? "destructive" : status === "booked" ? "secondary" : "outline"}>{t("statuses." + status, { defaultValue: status })}</Badge>;
}

function ProfileDatum({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[11px] text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words text-xs font-medium">{value}</dd></div>;
}

function MessageEntry({ item, locale }: { item: Message; locale: string }) {
  const { t } = useTranslation("lmc");
  const own = item.direction === "assistant" || item.direction === "human";
  const owner = item.direction === "owner";
  return (
    <li className={"flex " + (owner ? "justify-center" : own ? "justify-end" : "justify-start")}>
      <article className={"max-w-[88%] rounded-2xl border px-3.5 py-3 sm:max-w-[80%] " + (owner ? "w-full border-amber-500/20 bg-amber-500/[0.06]" : own ? "border-primary/15 bg-primary/[0.055]" : "border-border/70 bg-muted/35")}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium text-foreground/80">
            {owner ? <ShieldAlert className="size-3.5 text-amber-600" /> : own ? <Bot className="size-3.5 text-primary" /> : <UserRound className="size-3.5" />}
            {t("directions." + item.direction, { defaultValue: t("directions.other") })}
            {item.kind === "followup" ? <span>· {t("followup")}</span> : null}
          </span>
          <span className="inline-flex items-center gap-1">
            {item.status === "sent" ? <CheckCircle2 className="size-3 text-emerald-600" /> : item.status === "failed" ? <AlertCircle className="size-3 text-destructive" /> : <Clock3 className="size-3" />}
            {t("delivery." + item.status, { defaultValue: item.status })}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p>
        <time className="mt-2 block text-end text-[11px] text-muted-foreground" dateTime={item.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time>
      </article>
    </li>
  );
}

function EventEntry({ item, locale }: { item: LeadEvent; locale: string }) {
  const { t } = useTranslation("lmc");
  const status = typeof item.metadata.status === "string" ? item.metadata.status : null;
  const warning = item.type === "outbound_reconciliation_required" || item.type === "prompt_injection_detected";
  return (
    <li className="flex justify-center">
      <div className={"flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs " + (warning ? "border-amber-500/25 bg-amber-500/[0.06] text-amber-800 dark:text-amber-200" : "border-border/60 bg-background text-muted-foreground")}>
        {warning ? <ShieldAlert className="size-3.5 shrink-0" /> : <Clock3 className="size-3.5 shrink-0" />}
        <span>{t("events." + item.type, { defaultValue: t("events.updated") })}</span>
        {status ? <Badge className="rounded-full px-1.5 py-0 text-[10px]" variant="outline">{t("statuses." + status, { defaultValue: status })}</Badge> : null}
        <time className="shrink-0" dateTime={item.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time>
      </div>
    </li>
  );
}
