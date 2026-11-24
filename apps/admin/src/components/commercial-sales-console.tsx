"use client";
/* eslint-disable jsx-a11y/label-has-associated-control -- labels wrap the custom Input controls used throughout this form. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Link2, LoaderCircle, Plus, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { surfaceClassName } from "@/components/ui/surface";

type Offer = { id: string; customerName: string; customerEmail: string | null; planName: string; monthlyAmountCents: number; setupAmountCents: number; discountAmountCents: number; currency: string; status: string; expiresAt: string | null; checkoutUrl: string | null; createdAt: string };
type Customer = { id: string; name: string; email: string | null; tenantId: string | null; onboardingStatus: string; subscription: null | { planName: string; status: string; monthlyAmountCents: number; currentPeriodEnd: string | null } };
type Tenant = { id: string; name: string; slug: string };
type Affiliate = { id: string; userName: string | null; email: string; referralCode: string; commissionRateBps: number; status: string; referralLink: string; pendingCommissionCents: number; availableCommissionCents: number; paidCommissionCents: number };
type CommercialOverview = { mrr: number; activeSubscriptions: number; newSubscriptions: number; setupFeesSold: number; cashCollected: number; failedPayments: number; awaitingOnboarding: number; awaitingTenant: number; pendingCommissions: number; availableCommissions: number; paidCommissions: number };
type Plan = { slug: string; name: string; description: string; monthly: string; setup: string; leads: string; visible: boolean; publiclyAvailable: boolean; acceptsAffiliate: boolean; allowPromotionCodes: boolean; stripeProductId: string; stripePriceId: string };

const customPlan: Plan = { slug: "custom-offer", name: "Custom", description: "Negotiated custom pricing", monthly: "", setup: "0.00", leads: "", visible: true, publiclyAvailable: false, acceptsAffiliate: false, allowPromotionCodes: true, stripeProductId: "", stripePriceId: "" };

function cents(value: string): number | null {
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(value.trim());
  return match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : null;
}
function money(amount: number, currency = "usd") { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100); }

export function CommercialSalesConsole() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([customPlan]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [overview, setOverview] = useState<CommercialOverview>({ mrr: 0, activeSubscriptions: 0, newSubscriptions: 0, setupFeesSold: 0, cashCollected: 0, failedPayments: 0, awaitingOnboarding: 0, awaitingTenant: 0, pendingCommissions: 0, availableCommissions: 0, paidCommissions: 0 });
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [planName, setPlanName] = useState("Custom");
  const [customOfferName, setCustomOfferName] = useState("Custom offer");
  const selectedPlan = useMemo(() => plans.find((plan) => plan.name === planName) ?? customPlan, [plans, planName]);
  const [monthly, setMonthly] = useState(selectedPlan.monthly);
  const [setup, setSetup] = useState(selectedPlan.setup);
  const [discount, setDiscount] = useState("0.00");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [affiliateProfileId, setAffiliateProfileId] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [affiliateEmail, setAffiliateEmail] = useState("");
  const [affiliateCode, setAffiliateCode] = useState("");
  const [affiliateRate, setAffiliateRate] = useState("25");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [offerResponse, customerResponse, affiliateResponse] = await Promise.all([fetch("/api/internal/superadmin/commercial/offers", { cache: "no-store" }), fetch("/api/internal/superadmin/commercial/customers", { cache: "no-store" }), fetch("/api/internal/superadmin/commercial/affiliates", { cache: "no-store" })]);
    if (!offerResponse.ok || !customerResponse.ok || !affiliateResponse.ok) throw new Error("Commercial records could not be loaded.");
    const [offerData, customerData, affiliateData] = await Promise.all([offerResponse.json(), customerResponse.json(), affiliateResponse.json()]);
    setOffers(offerData.offers ?? []);
    setOverview(offerData.overview ?? { mrr: 0, activeSubscriptions: 0, newSubscriptions: 0, setupFeesSold: 0, cashCollected: 0, failedPayments: 0, awaitingOnboarding: 0, awaitingTenant: 0, pendingCommissions: 0, availableCommissions: 0, paidCommissions: 0 });
    const catalog: Plan[] = (offerData.plans ?? []).map((plan: { slug: string; name: string; description: string; monthlyAmountCents: number; setupAmountCents: number; leadAllowance: number | null; stripeProductId: string | null; stripePriceId: string | null; visible: boolean; publiclyAvailable: boolean; acceptsAffiliate: boolean; allowPromotionCodes: boolean }) => ({ slug: plan.slug, name: plan.name, description: plan.description, monthly: (plan.monthlyAmountCents / 100).toFixed(2), setup: (plan.setupAmountCents / 100).toFixed(2), leads: plan.leadAllowance === null ? "" : String(plan.leadAllowance), stripeProductId: plan.stripeProductId ?? "", stripePriceId: plan.stripePriceId ?? "", visible: plan.visible, publiclyAvailable: plan.publiclyAvailable, acceptsAffiliate: plan.acceptsAffiliate, allowPromotionCodes: plan.allowPromotionCodes }));
    setPlans([...catalog, customPlan]);
    setCustomers(customerData.customers ?? []);
    setTenants(customerData.tenants ?? []);
    setAffiliates(affiliateData.affiliates ?? []);
  }, []);
  useEffect(() => { void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load billing.")); }, [refresh]);

  function changePlan(name: string) {
    const plan = plans.find((item) => item.slug === name);
    if (!plan || plan.slug === customPlan.slug) {
      setPlanName("Custom"); setMonthly(""); setSetup("0.00"); return;
    }
    setPlanName(plan.name); setMonthly(plan.monthly); setSetup(plan.setup);
  }

  async function createOffer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const monthlyAmountCents = cents(monthly); const setupAmountCents = cents(setup || "0"); const discountAmountCents = cents(discount || "0");
    if (monthlyAmountCents === null || setupAmountCents === null || discountAmountCents === null) { setError("Enter prices using dollars and cents, such as 499.00."); setBusy(false); return; }
    const expiresAt = expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 86_400_000).toISOString() : null;
    try {
      const response = await fetch("/api/internal/superadmin/commercial/offers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customerName, customerEmail, planName: planName === "Custom" ? customOfferName : planName, monthlyAmountCents, setupAmountCents, discountAmountCents, leadAllowance: planName === "Custom" ? null : selectedPlan.leads ? Number(selectedPlan.leads) : null, tenantId: tenantId || null, affiliateProfileId: affiliateProfileId || null, internalNotes, expiresAt }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Offer could not be created.");
      await navigator.clipboard.writeText(data.paymentUrl);
      setCopiedId(data.id);
      setCustomerName(""); setCustomerEmail(""); setInternalNotes(""); setAffiliateProfileId(""); setTenantId("");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Offer could not be created."); }
    finally { setBusy(false); }
  }

  async function copyLink(offerId: string, url: string) {
    await navigator.clipboard.writeText(url); setCopiedId(offerId); window.setTimeout(() => setCopiedId(null), 2000);
  }
  async function issueOfferLink(offerId: string) {
    setError("");
    try {
      const response = await fetch(`/api/internal/superadmin/commercial/offers/${offerId}/link`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Payment link could not be issued.");
      await navigator.clipboard.writeText(data.paymentUrl);
      window.open(data.paymentUrl, "_blank", "noopener,noreferrer");
      setCopiedId(offerId); window.setTimeout(() => setCopiedId(null), 2000);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Payment link could not be issued."); }
  }
  async function revoke(offerId: string) {
    if (!window.confirm("Revoke this unpaid offer? Its link will stop working.")) return;
    const response = await fetch(`/api/internal/superadmin/commercial/offers/${offerId}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Offer could not be revoked."); return; }
    await refresh();
  }
  async function associate(customerId: string, selectedTenantId: string) {
    if (!selectedTenantId) return;
    const response = await fetch(`/api/internal/superadmin/commercial/customers/${customerId}/associate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId: selectedTenantId }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Tenant could not be associated."); return; }
    await refresh();
  }

  async function createAffiliate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const percentage = Number(affiliateRate);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) { setError("Commission rate must be between 0 and 100 percent."); setBusy(false); return; }
    try {
      const response = await fetch("/api/internal/superadmin/commercial/affiliates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: affiliateEmail, referralCode: affiliateCode || undefined, commissionRateBps: Math.round(percentage * 100) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Affiliate could not be added.");
      await navigator.clipboard.writeText(data.referralLink);
      setAffiliateEmail(""); setAffiliateCode(""); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Affiliate could not be added."); }
    finally { setBusy(false); }
  }

  async function recordPayout(affiliateProfileId: string) {
    const externalReference = window.prompt("Enter the bank or payment provider payout reference:")?.trim();
    if (!externalReference) return;
    if (!window.confirm("Record this manual payout as completed?")) return;
    const response = await fetch(`/api/internal/superadmin/commercial/affiliates/${affiliateProfileId}/payout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ externalReference }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Payout could not be recorded."); return; }
    await refresh();
  }

  return <div className="space-y-8">
    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
    <section aria-label="Commercial overview" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Monthly recurring revenue", money(overview.mrr)], ["Active paid subscriptions", String(overview.activeSubscriptions)], ["New this month", String(overview.newSubscriptions)], ["Setup fees sold", money(overview.setupFeesSold)], ["Cash collected, net of refunds", money(overview.cashCollected)], ["Failed invoice payments", String(overview.failedPayments)], ["Paid, awaiting onboarding", String(overview.awaitingOnboarding)], ["Awaiting tenant association", String(overview.awaitingTenant)], ["Pending commissions", money(overview.pendingCommissions)], ["Available commissions", money(overview.availableCommissions)], ["Paid commissions", money(overview.paidCommissions)]].map(([label, value]) => <div className={`${surfaceClassName} p-4`} key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p></div>)}</section>
    <section className={`${surfaceClassName} p-5 sm:p-7`}>
      <div className="mb-6 flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Create payment offer</h2><p className="mt-1 text-sm text-muted-foreground">The hosted link collects payment details through Stripe. Tenant setup remains a manual step.</p></div><span className="rounded-full bg-muted p-2 text-muted-foreground"><Link2 className="size-4" /></span></div>
      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={createOffer}>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Customer or company</span><Input required maxLength={180} value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Email (optional)</span><Input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} /></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Preset (optional)</span><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={plans.find((plan) => plan.name === planName)?.slug ?? customPlan.slug} onChange={(event) => changePlan(event.target.value)}><option value={customPlan.slug}>Custom negotiated offer</option>{plans.filter((plan) => plan.visible && plan.slug !== customPlan.slug).map((plan) => <option key={plan.slug} value={plan.slug}>{plan.name}</option>)}</select></label>
        {planName === "Custom" && <label className="space-y-1.5 text-sm"><span className="font-medium">Offer name</span><Input required maxLength={120} value={customOfferName} onChange={(event) => setCustomOfferName(event.target.value)} /></label>}
        <label className="space-y-1.5 text-sm"><span className="font-medium">Monthly price (USD)</span><Input inputMode="decimal" required value={monthly} onChange={(event) => setMonthly(event.target.value)} /></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">One-time setup (USD)</span><Input inputMode="decimal" value={setup} onChange={(event) => setSetup(event.target.value)} /></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Discount today (USD)</span><Input inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Existing tenant (optional)</span><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={tenantId} onChange={(event) => setTenantId(event.target.value)}><option value="">No tenant yet</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.slug}</option>)}</select></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Affiliate (optional)</span><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={affiliateProfileId} onChange={(event) => setAffiliateProfileId(event.target.value)}><option value="">No affiliate</option>{affiliates.map((affiliate) => <option key={affiliate.id} value={affiliate.id}>{affiliate.userName ?? affiliate.email} · {(affiliate.commissionRateBps / 100).toFixed(2)}%</option>)}</select></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Link expires in days (blank for no expiry)</span><Input inputMode="numeric" min="1" max="365" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} /></label>
        <label className="space-y-1.5 text-sm sm:col-span-2 lg:col-span-3"><span className="font-medium">Internal notes</span><textarea className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" maxLength={4000} value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} /></label>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3"><Button disabled={busy} type="submit">{busy ? <LoaderCircle className="size-4 animate-spin" /> : copiedId ? <Check className="size-4" /> : <Plus className="size-4" />}{busy ? "Creating…" : copiedId ? "Link created and copied" : "Create and copy payment link"}</Button><span className="text-xs text-muted-foreground">Monthly: {monthly && cents(monthly) !== null ? money(cents(monthly)!) : "—"} · Setup: {setup && cents(setup) !== null ? money(cents(setup)!) : money(0)}</span></div>
      </form>
    </section>

    <section className="space-y-3"><div><h2 className="text-lg font-semibold">Plan catalog</h2><p className="text-sm text-muted-foreground">Changes apply to future offers. Existing offers keep their original price.</p></div><div className="grid gap-3 lg:grid-cols-3">{plans.filter((plan) => plan.slug !== customPlan.slug).map((plan) => <PlanEditor key={plan.slug} plan={plan} onSaved={refresh} />)}</div></section>

    <section className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Payment offers</h2><p className="text-sm text-muted-foreground">Up to 100 most recent offers</p></div><Button aria-label="Refresh commercial data" variant="outline" size="icon" onClick={() => void refresh()}><RefreshCw className="size-4" /></Button></div><div className={`${surfaceClassName} overflow-x-auto`}><table className="w-full min-w-[54rem] text-left text-sm"><thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Customer", "Plan", "Price", "Status", "Expires", "Link"].map((heading) => <th className="px-4 py-3 font-medium" key={heading}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-border">{offers.map((offer) => <tr key={offer.id}><td className="px-4 py-3"><span className="font-medium">{offer.customerName}</span><span className="block text-xs text-muted-foreground">{offer.customerEmail ?? "Email collected at checkout"}</span></td><td className="px-4 py-3">{offer.planName}</td><td className="px-4 py-3">{money(offer.monthlyAmountCents)}/mo<span className="block text-xs text-muted-foreground">setup {money(offer.setupAmountCents)} · discount {money(offer.discountAmountCents)}</span></td><td className="px-4 py-3"><Badge variant={offer.status === "paid" ? "default" : "outline"}>{offer.status}</Badge></td><td className="px-4 py-3 text-muted-foreground">{offer.expiresAt ? new Date(offer.expiresAt).toLocaleDateString() : "Never"}</td><td className="px-4 py-3">{(offer.status === "open" || offer.status === "checkout_pending") && <Button variant="outline" size="sm" onClick={() => void issueOfferLink(offer.id)}>{copiedId === offer.id ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}{copiedId === offer.id ? "Copied & previewed" : "Preview & copy"}</Button>}{(offer.status === "open" || offer.status === "checkout_pending") && <Button className="ml-2" variant="outline" size="sm" onClick={() => void revoke(offer.id)}>Revoke</Button>}{!offer.checkoutUrl && offer.status !== "open" && offer.status !== "checkout_pending" ? "—" : null}</td></tr>)}{offers.length === 0 && <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={6}>No payment offers yet.</td></tr>}</tbody></table></div></section>

    <section className="space-y-3"><div><h2 className="text-lg font-semibold">Paid customers and onboarding</h2><p className="text-sm text-muted-foreground">Manually associate a paid customer after their tenant is provisioned.</p></div><div className={`${surfaceClassName} overflow-x-auto`}><table className="w-full min-w-[50rem] text-left text-sm"><thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Customer", "Subscription", "Onboarding", "Tenant association"].map((heading) => <th className="px-4 py-3 font-medium" key={heading}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-border">{customers.map((customer) => <tr key={customer.id}><td className="px-4 py-3"><span className="font-medium">{customer.name}</span><span className="block text-xs text-muted-foreground">{customer.email ?? "—"}</span></td><td className="px-4 py-3">{customer.subscription ? <>{customer.subscription.planName} · {money(customer.subscription.monthlyAmountCents)}/mo<span className="block text-xs text-muted-foreground">{customer.subscription.status}</span></> : "Awaiting first payment"}</td><td className="px-4 py-3"><Badge variant="outline">{customer.onboardingStatus.replaceAll("_", " ")}</Badge></td><td className="px-4 py-3">{customer.tenantId ? <span className="text-muted-foreground">Associated</span> : customer.onboardingStatus === "paid_awaiting_onboarding" ? <AssociateControl customer={customer} tenants={tenants} onAssociate={associate} /> : "—"}</td></tr>)}{customers.length === 0 && <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={4}>Customers will appear after a verified Stripe payment.</td></tr>}</tbody></table></div></section>
    <AffiliateAdminSection affiliates={affiliates} email={affiliateEmail} setEmail={setAffiliateEmail} code={affiliateCode} setCode={setAffiliateCode} rate={affiliateRate} setRate={setAffiliateRate} busy={busy} onSubmit={createAffiliate} onCopy={copyLink} onPayout={recordPayout} copiedId={copiedId} />
  </div>;
}

function AffiliateAdminSection({ affiliates, email, setEmail, code, setCode, rate, setRate, busy, onSubmit, onCopy, onPayout, copiedId }: { affiliates: Affiliate[]; email: string; setEmail: (value: string) => void; code: string; setCode: (value: string) => void; rate: string; setRate: (value: string) => void; busy: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onCopy: (id: string, url: string) => Promise<void>; onPayout: (affiliateProfileId: string) => Promise<void>; copiedId: string | null }) {
  return <section className="space-y-4"><div><h2 className="text-lg font-semibold">Affiliate partners</h2><p className="text-sm text-muted-foreground">Set a recurring commission rate, copy referral links, and record manual payouts.</p></div><form className={`${surfaceClassName} grid gap-3  p-4 sm:grid-cols-2 lg:grid-cols-4`} onSubmit={onSubmit}><label className="space-y-1.5 text-sm"><span className="font-medium">Existing user email</span><Input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="space-y-1.5 text-sm"><span className="font-medium">Referral code (optional)</span><Input maxLength={64} value={code} onChange={(event) => setCode(event.target.value)} /></label><label className="space-y-1.5 text-sm"><span className="font-medium">Recurring commission (%)</span><Input inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} /></label><div className="flex items-end"><Button disabled={busy} type="submit">{busy ? "Saving…" : "Add affiliate and copy link"}</Button></div></form><div className={`${surfaceClassName} overflow-x-auto`}><table className="w-full min-w-[68rem] text-left text-sm"><thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Partner", "Rate", "Pending", "Available", "Paid", "Actions"].map((heading) => <th className="px-4 py-3 font-medium" key={heading}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-border">{affiliates.map((affiliate) => <tr key={affiliate.id}><td className="px-4 py-3"><span className="font-medium">{affiliate.userName ?? affiliate.email}</span><span className="block text-xs text-muted-foreground">{affiliate.email}</span></td><td className="px-4 py-3">{(affiliate.commissionRateBps / 100).toFixed(2)}% recurring</td><td className="px-4 py-3">{money(affiliate.pendingCommissionCents)}</td><td className="px-4 py-3">{money(affiliate.availableCommissionCents)}</td><td className="px-4 py-3">{money(affiliate.paidCommissionCents)}</td><td className="flex gap-2 px-4 py-3"><Button size="sm" variant="outline" onClick={() => void onCopy(affiliate.id, affiliate.referralLink)}>{copiedId === affiliate.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copiedId === affiliate.id ? "Copied" : "Copy link"}</Button><Button disabled={affiliate.availableCommissionCents <= 0} size="sm" onClick={() => void onPayout(affiliate.id)}>Record payout</Button></td></tr>)}{affiliates.length === 0 && <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>No affiliate partners yet.</td></tr>}</tbody></table></div></section>;
}

function AssociateControl({ customer, tenants, onAssociate }: { customer: Customer; tenants: Tenant[]; onAssociate: (customerId: string, tenantId: string) => Promise<void> }) {
  const [tenantId, setTenantId] = useState("");
  return <div className="flex min-w-64 gap-2"><select aria-label={`Tenant for ${customer.name}`} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs" value={tenantId} onChange={(event) => setTenantId(event.target.value)}><option value="">Choose tenant</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select><Button size="sm" disabled={!tenantId} onClick={() => void onAssociate(customer.id, tenantId)}>Associate</Button></div>;
}

function PlanEditor({ plan, onSaved }: { plan: Plan; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description);
  const [monthly, setMonthly] = useState(plan.monthly);
  const [setup, setSetup] = useState(plan.setup);
  const [leads, setLeads] = useState(plan.leads);
  const [visible, setVisible] = useState(plan.visible);
  const [publiclyAvailable, setPubliclyAvailable] = useState(plan.publiclyAvailable);
  const [acceptsAffiliate, setAcceptsAffiliate] = useState(plan.acceptsAffiliate);
  const [allowPromotionCodes, setAllowPromotionCodes] = useState(plan.allowPromotionCodes);
  const [stripeProductId, setStripeProductId] = useState(plan.stripeProductId);
  const [stripePriceId, setStripePriceId] = useState(plan.stripePriceId);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const monthlyAmountCents = cents(monthly); const setupAmountCents = cents(setup || "0");
    if (monthlyAmountCents === null || setupAmountCents === null || (leads && !/^\d+$/.test(leads))) { setStatus("Enter a valid price and lead allowance."); return; }
    setSaving(true); setStatus("");
    try {
      const response = await fetch(`/api/internal/superadmin/commercial/plans/${encodeURIComponent(plan.slug)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, description, monthlyAmountCents, setupAmountCents, leadAllowance: leads ? Number(leads) : null, visible, publiclyAvailable, acceptsAffiliate, allowPromotionCodes, stripeProductId, stripePriceId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Plan could not be saved.");
      await onSaved(); setStatus("Saved");
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : "Plan could not be saved."); }
    finally { setSaving(false); }
  }
  return <form className={`${surfaceClassName} space-y-3  p-4`} onSubmit={save}><div className="flex items-center justify-between"><h3 className="font-semibold">{plan.slug}</h3><span className="text-xs text-muted-foreground">USD</span></div><label className="block space-y-1 text-xs"><span>Name</span><Input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="block space-y-1 text-xs"><span>Description</span><Input maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} /></label><div className="grid grid-cols-2 gap-2"><label className="space-y-1 text-xs"><span>Monthly price</span><Input inputMode="decimal" value={monthly} onChange={(event) => setMonthly(event.target.value)} /></label><label className="space-y-1 text-xs"><span>Setup fee</span><Input inputMode="decimal" value={setup} onChange={(event) => setSetup(event.target.value)} /></label><label className="space-y-1 text-xs"><span>Monthly leads</span><Input inputMode="numeric" value={leads} onChange={(event) => setLeads(event.target.value)} /></label></div><label className="block space-y-1 text-xs"><span>Stripe Product ID</span><Input value={stripeProductId} onChange={(event) => setStripeProductId(event.target.value)} /></label><label className="block space-y-1 text-xs"><span>Stripe recurring Price ID</span><Input value={stripePriceId} onChange={(event) => setStripePriceId(event.target.value)} /></label><div className="grid gap-1 text-xs">{[[visible, setVisible, "Visible in admin offers"], [publiclyAvailable, setPubliclyAvailable, "Available on affiliate links"], [acceptsAffiliate, setAcceptsAffiliate, "Allow affiliate attribution"], [allowPromotionCodes, setAllowPromotionCodes, "Allow Stripe promotion codes"]].map(([checked, setChecked, label]) => <label className="flex items-center gap-2" key={String(label)}><input checked={checked as boolean} onChange={(event) => (setChecked as (value: boolean) => void)(event.target.checked)} type="checkbox" />{label as string}</label>)}</div><div className="flex items-center justify-between gap-3"><Button disabled={saving} size="sm" type="submit">{saving ? "Saving…" : "Save plan"}</Button><span className="text-xs text-muted-foreground" role="status">{status}</span></div></form>;
}
