"use client";
/* eslint-disable jsx-a11y/label-has-associated-control -- labels wrap the custom Input controls. */

import { useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Plan = { slug: string; name: string; description: string; monthlyAmountCents: number; setupAmountCents: number; leadAllowance: number | null; currency: string };
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);

export function PublicAffiliateCheckout({ code }: { code: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const canceled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("canceled") === "1";
  useEffect(() => {
    void fetch(`/api/checkout/affiliate/${encodeURIComponent(code)}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "This referral link is unavailable.");
      const values = data.plans as Plan[];
      setPlans(values); setSelectedSlug(values[0]?.slug ?? "");
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "This referral link is unavailable.")).finally(() => setLoading(false));
  }, [code]);
  useEffect(() => {
    let visitorId = window.localStorage.getItem("lmc_affiliate_visitor");
    if (!visitorId) { visitorId = crypto.randomUUID(); window.localStorage.setItem("lmc_affiliate_visitor", visitorId); }
    void fetch("/api/affiliate/click", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ referralCode: code, visitorId, sourceUrl: window.location.pathname }) }).catch(() => undefined);
  }, [code]);

  async function startCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestKey = idempotencyKey || crypto.randomUUID();
    setIdempotencyKey(requestKey); setSubmitting(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/checkout/affiliate/${encodeURIComponent(code)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), email: form.get("email"), planSlug: selectedSlug, idempotencyKey: requestKey }) });
      const data = await response.json();
      if (!response.ok || typeof data.checkoutUrl !== "string") throw new Error(data.error ?? "Checkout could not be started.");
      window.location.assign(data.checkoutUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Checkout could not be started."); setSubmitting(false); }
  }

  const selected = plans.find((plan) => plan.slug === selectedSlug);
  return <main className="min-h-screen bg-muted/30 px-4 py-12 text-foreground sm:py-20"><div className="mx-auto max-w-3xl"><div className="mb-8 text-center"><p className="text-sm font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">LEAD MY COMPANY</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Choose your plan</h1><p className="mt-2 text-sm text-muted-foreground">Compare subscription terms, then continue to Stripe’s hosted payment page.</p></div><section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">{loading ? <div className="flex items-center justify-center py-12 text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" /> Loading plans…</div> : plans.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No public plans are available at this time.</p> : <><div className="grid gap-3 sm:grid-cols-3">{plans.map((plan) => <button aria-pressed={selectedSlug === plan.slug} className={`rounded-xl border p-4 text-left transition-colors ${selectedSlug === plan.slug ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`} key={plan.slug} onClick={() => setSelectedSlug(plan.slug)} type="button"><span className="block font-semibold">{plan.name}</span><span className="mt-1 block text-xl font-semibold">{money(plan.monthlyAmountCents, plan.currency)}<span className="text-xs font-normal text-muted-foreground"> / month</span></span><span className="mt-2 block text-xs text-muted-foreground">{plan.description}</span>{plan.setupAmountCents > 0 && <span className="mt-2 block text-xs text-muted-foreground">One-time setup: {money(plan.setupAmountCents, plan.currency)}</span>}</button>)}</div>{selected && <div className="mt-5 rounded-lg bg-muted/50 p-4 text-sm"><div className="flex justify-between gap-4"><span className="text-muted-foreground">Due today</span><span className="font-semibold">{money(selected.monthlyAmountCents + selected.setupAmountCents, selected.currency)}</span></div><div className="mt-2 flex justify-between gap-4"><span className="text-muted-foreground">Recurring monthly</span><span>{money(selected.monthlyAmountCents, selected.currency)}</span></div></div>}{canceled && <p className="mt-4 rounded-lg bg-muted p-3 text-sm">Checkout was canceled. No payment was confirmed.</p>}<form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={startCheckout}><label className="space-y-1.5 text-sm"><span className="font-medium">Name or company</span><Input autoComplete="name" maxLength={180} name="name" required /></label><label className="space-y-1.5 text-sm"><span className="font-medium">Email</span><Input autoComplete="email" name="email" required type="email" /></label><Button className="sm:col-span-2" disabled={submitting || !selected} type="submit">{submitting && <LoaderCircle className="size-4 animate-spin" />}Continue to secure payment</Button></form><p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />Payment details are entered on Stripe’s secure checkout. The affiliate may earn a commission.</p></>}{error && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}</section></div></main>;
}
