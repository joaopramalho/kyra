"use client";
/* eslint-disable jsx-a11y/label-has-associated-control -- labels wrap the custom Input controls. */

import { useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Offer = { status: string; planName: string; monthlyAmountCents: number; setupAmountCents: number; discountAmountCents: number; amountDueTodayCents: number; currency: string; expiresAt: string | null };
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);

export function PublicCommercialCheckout({ token }: { token: string }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const canceled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("canceled") === "1";
  useEffect(() => {
    void fetch(`/api/checkout/offers/${encodeURIComponent(token)}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "This offer is unavailable.");
      setOffer(data);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "This offer is unavailable.")).finally(() => setLoading(false));
  }, [token]);

  async function startCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/checkout/offers/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), email: form.get("email") }) });
      const data = await response.json();
      if (!response.ok || typeof data.checkoutUrl !== "string") throw new Error(data.error ?? "Checkout could not be started.");
      window.location.assign(data.checkoutUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Checkout could not be started."); setSubmitting(false); }
  }

  return <main className="min-h-screen bg-muted/30 px-4 py-12 text-foreground sm:py-20"><div className="mx-auto max-w-xl"><div className="mb-8 text-center"><p className="text-sm font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">LEAD MY COMPANY</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Secure checkout</h1><p className="mt-2 text-sm text-muted-foreground">Review the offer and continue to Stripe’s hosted payment page.</p></div><section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">{loading ? <div className="flex items-center justify-center py-12 text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" /> Loading offer…</div> : offer ? <><div className="border-b border-border pb-5"><p className="text-sm text-muted-foreground">Subscription plan</p><h2 className="mt-1 text-xl font-semibold">{offer.planName}</h2></div><dl className="space-y-3 py-5 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Monthly subscription</dt><dd className="font-medium">{money(offer.monthlyAmountCents, offer.currency)} / month</dd></div>{offer.setupAmountCents > 0 && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">One-time setup</dt><dd className="font-medium">{money(offer.setupAmountCents, offer.currency)}</dd></div>}{offer.discountAmountCents > 0 && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">One-time offer discount</dt><dd className="font-medium text-emerald-700 dark:text-emerald-400">−{money(offer.discountAmountCents, offer.currency)}</dd></div>}<div className="flex justify-between gap-4 border-t border-border pt-4 text-base"><dt className="font-semibold">Due today</dt><dd className="font-semibold">{money(offer.amountDueTodayCents, offer.currency)}</dd></div></dl>{offer.status === "paid" ? <p className="rounded-lg bg-emerald-500/10 p-4 text-sm">Payment confirmed. Our team will contact you about onboarding.</p> : <><p className="mb-5 text-xs leading-relaxed text-muted-foreground">Your subscription renews monthly at {money(offer.monthlyAmountCents, offer.currency)}. The setup fee and offer discount apply once. Subscription management and cancellation are available through the customer portal.</p>{offer.status === "checkout_pending" && <p className="mb-4 rounded-lg bg-muted p-3 text-sm">A checkout for this offer is already open. Continue below to return to it.</p>}{canceled && <p className="mb-4 rounded-lg bg-muted p-3 text-sm">Checkout was canceled. No payment was confirmed.</p>}<form className="space-y-4" onSubmit={startCheckout}><label className="block space-y-1.5 text-sm"><span className="font-medium">Name or company</span><Input autoComplete="name" maxLength={180} name="name" required /></label><label className="block space-y-1.5 text-sm"><span className="font-medium">Email</span><Input autoComplete="email" name="email" required type="email" /></label><Button className="w-full" disabled={submitting} type="submit">{submitting && <LoaderCircle className="size-4 animate-spin" />}Continue to secure payment</Button></form><p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />Payment details are entered on Stripe’s secure checkout.</p></>}</> : <div className="py-10 text-center"><h2 className="font-semibold">Offer unavailable</h2><p className="mt-2 text-sm text-muted-foreground">This payment link may have expired or already been used.</p></div>}{error && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}</section><p className="mt-5 text-center text-xs text-muted-foreground">Questions about this offer? Contact the person who shared this link.</p></div></main>;
}
