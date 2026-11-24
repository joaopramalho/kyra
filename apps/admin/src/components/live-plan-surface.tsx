"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { billingPlanCatalog, type BillingPlanSlug } from "@lobbystack/shared";
import { ArrowUpRight, Check } from "lucide-react";
import { toast } from "sonner";
import type { BillingPermissions } from "./billing-past-due-banner";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { PageSurface } from "./page-surface";
import { SectionBlock } from "./section-block";
import { Button } from "./ui/button";
import { useOpenUpgradePlanDialog } from "./upgrade-plan-dialog-context";
import { SpendingCapSection } from "./billing-spending-cap";
import { Skeleton } from "./ui/skeleton";
import { Surface } from "./ui/surface";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type Business = { businessId: string; name: string; slug: string; role: string; active: boolean };
type Billing = {
  availableCheckoutPlans: Array<"starter" | "pro">;
  availableCheckoutIntervals: { starter: string[]; pro: string[] };
  permissions: BillingPermissions;
  account: { plan: string | null; billingKey: string; billingInterval: string | null; subscriptionState: string | null; currentPeriodStart: string | null; currentPeriodEnd: string | null; overageSpendingCapCents: number | null } | null;
  usage: Array<{ periodKey: string; usageKind: string; quantity: number; syncStatus: string }>;
  transactions: Array<{ kind: string; sourceId: string; status: string; amountCents: number; currency: string; description: string | null; invoiceUrl: string | null; occurredAt: string }>;
  usageStatus: { usageComplete: boolean; voiceBlocked: boolean; alertSmsBlocked: boolean; outboundCallAttemptsBlocked: boolean; overageSpendingCapReached: boolean; overageSpendCents: number; overageSpendingCapCents: number | null } | null;
};
type CommercialBilling = { customer: { name: string; email: string | null; onboardingStatus: string } | null; portalAvailable: boolean; subscriptions: Array<{ planName: string; status: string; monthlyAmountCents: number; currency: string; currentPeriodStart: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean }>; invoices: Array<{ kind: string; status: string; amountCents: number; currency: string; description: string | null; hostedInvoiceUrl: string | null; occurredAt: string }> };

async function getJson<T>(url: string): Promise<T> { const response = await fetch(url, { credentials: "include" }); if (!response.ok) throw new Error("Unable to load billing data."); return await response.json() as T; }
async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> { const response = await fetch(url, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Unable to update billing."); return await response.json() as T; }
function formatMoney(cents: number, currency = "usd", locale = "en"): string { return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100); }
function formatBillingDate(value: string | null, locale = "en"): string { return value ? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "—"; }
function planSlug(value: string | null | undefined): BillingPlanSlug { return value === "self_hosted_standard" ? "self_host" : value === "self_host" || value === "starter" || value === "pro" || value === "enterprise" ? value : "free_cloud"; }


export function LivePlanSurface() {
  const { i18n, t } = useTranslation("settings");
  const money = (cents: number, currency = "usd") => formatMoney(cents, currency, i18n.language);
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const openUpgradePlanDialog = useOpenUpgradePlanDialog();
  const [portalPending, setPortalPending] = useState(false);
  const [stripePortalPending, setStripePortalPending] = useState(false);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const billing = useQuery({ queryKey: ["billing", business?.businessId], queryFn: () => getJson<Billing>(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const commercial = useQuery({ queryKey: ["commercial-billing", business?.businessId], queryFn: () => getJson<CommercialBilling>(`/api/billing/commercial?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId && ["business_owner", "business_admin"].includes(business.role)) });


  const returnRequestId = searchParams.get("checkout") === "success" ? searchParams.get("requestId") : null;
  const returnedCheckout = useQuery({
    queryKey: ["billing-checkout-return", business?.businessId, returnRequestId],
    enabled: Boolean(business && returnRequestId),
    queryFn: () => getJson<{ synced: boolean }>(`/api/billing/checkout?businessId=${encodeURIComponent(business!.businessId)}&requestId=${encodeURIComponent(returnRequestId!)}`),
    refetchInterval: query => query.state.data?.synced ? false : 1500,
  });
  useEffect(() => {
    if (!business || !returnRequestId || !returnedCheckout.data?.synced) return;
    void queryClient.invalidateQueries({ queryKey: ["billing", business.businessId] });
    router.replace("/settings/plan");
  }, [business, returnRequestId, returnedCheckout.data?.synced, queryClient, router]);

  useEffect(() => { if (searchParams.get("checkout") && business?.businessId) void queryClient.invalidateQueries({ queryKey: ["billing", business.businessId] }); }, [business?.businessId, queryClient, searchParams]);

  async function openPortal() { if (!business) return; setPortalPending(true); try { const result = await postJson<{ url: string }>(`/api/billing/portal?businessId=${encodeURIComponent(business.businessId)}`, {}); window.location.assign(result.url); } catch { toast.error(t("billing.toast.portalFailed")); } finally { setPortalPending(false); } }
  async function openStripePortal() { if (!business) return; setStripePortalPending(true); try { const result = await postJson<{ url: string }>(`/api/billing/commercial/portal?businessId=${encodeURIComponent(business.businessId)}`, {}); window.location.assign(result.url); } catch { toast.error(t("billing.toast.portalFailed")); } finally { setStripePortalPending(false); } }

  if (businesses.isLoading || billing.isLoading) return <PageSurface description="" title={t("sections.billing")}><BillingSkeleton t={t} /></PageSurface>;
  if (businesses.isError || billing.isError || !business || !billing.data) return <PageSurface description="" title={t("sections.billing")}><Surface className="flex flex-col items-start gap-4 p-6"><p role="alert">{t("billing.usage.unavailable")}</p><Button variant="outline" onClick={() => { if (businesses.isError || !business) void businesses.refetch(); else void billing.refetch(); }}>{t("billing.actions.retry")}</Button></Surface></PageSurface>;

  const account = billing.data?.account;
  const plan = planSlug(account?.plan);
  const catalog = billingPlanCatalog[plan];
  const monthlyPrice = account?.billingInterval === "annual" ? catalog.annualEffectiveMonthlyChargeCents : catalog.monthlyChargeCents;
  const hasStripeCommercialCustomer = Boolean(commercial.data?.customer);
  const commercialProviderResolved = commercial.isSuccess;
  const displayedLegacyPrice = commercialProviderResolved && !hasStripeCommercialCustomer ? monthlyPrice : null;
  const included = [catalog.voiceSecondsIncluded === null ? t("billing.currentPlan.includedVoiceCustom") : `${Math.round(catalog.voiceSecondsIncluded / 60)} ${t("billing.currentPlan.includedVoiceLabel")}`, catalog.outboundCallAttemptsIncluded === null ? t("billing.currentPlan.includedOutboundCustom") : `${catalog.outboundCallAttemptsIncluded} ${t("billing.currentPlan.includedOutboundLabel")}`, catalog.alertSmsSegmentsIncluded === null ? t("billing.currentPlan.includedSmsCustom") : `${catalog.alertSmsSegmentsIncluded} ${t("billing.currentPlan.includedSmsLabel")}`, catalog.knowledgeStorageBytes === null ? t("billing.currentPlan.includedStorageCustom") : t("billing.currentPlan.includedStorage", { amount: (catalog.knowledgeStorageBytes / (catalog.knowledgeStorageBytes >= 1024 ** 3 ? 1024 ** 3 : 1024 ** 2)).toLocaleString(i18n.language), unit: catalog.knowledgeStorageBytes >= 1024 ** 3 ? "GB" : "MB" })];
  const permissions = billing.data?.permissions;
  const canUpgrade = commercialProviderResolved && !hasStripeCommercialCustomer && permissions?.hasCheckoutAccess && billing.data?.availableCheckoutPlans.some(target =>
    (plan === "free_cloud" || (plan === "starter" && target === "pro")) && billing.data.availableCheckoutIntervals[target].length > 0);
  const canManage = commercialProviderResolved && !hasStripeCommercialCustomer && permissions?.hasCustomerPortalAccess === true;

  return <PageSurface description="" title={t("sections.billing")}>
    <div className="flex w-full flex-col gap-10">
    <SectionBlock title={t("billing.currentPlan.title")}>
      <Surface className="px-6 py-5">
        <div className="flex flex-col gap-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <span className="text-xl font-medium leading-7 text-foreground">
                {t(`billing.planLabels.${plan === "free_cloud" ? "freeCloudCard" : plan === "self_host" ? "selfHost" : plan === "starter" ? "starterCard" : plan === "pro" ? "proCard" : "enterpriseCard"}`)}
              </span>
              <div className="flex flex-col items-start gap-0.5">
                <div className="flex flex-wrap items-end gap-2">
                  {displayedLegacyPrice !== null ? (
                    <span className="text-4xl font-semibold tracking-tight text-foreground">
                      {money(displayedLegacyPrice)}
                    </span>
                  ) : (
                    <span className="text-base text-muted-foreground">
                      {hasStripeCommercialCustomer ? t("billing.commercial.priceShownBelow") : commercialProviderResolved ? t("billing.currentPlan.customPricing") : t("billing.commercial.providerUnresolved")}
                    </span>
                  )}
                  {displayedLegacyPrice !== null ? (
                    <span className="pb-1 text-base text-muted-foreground">
                      {account?.billingInterval === "annual"
                        ? t("billing.currentPlan.annualEffectiveSuffix")
                        : t("billing.currentPlan.monthlySuffix")}
                    </span>
                  ) : null}
                </div>
                {!hasStripeCommercialCustomer && (plan === "starter" || plan === "pro") && (
                  <span className="text-base text-muted-foreground">
                    {t("billing.currentPlan.paygMonthlySuffix")}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <span className="text-base font-medium leading-6 text-foreground">
                {t("billing.currentPlan.includedTitle")}
              </span>
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {included.map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 text-emerald-500" />
                    <span className="text-[15px] leading-6 text-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {(canUpgrade || canManage) && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {canUpgrade && (
                <Button
                  className="w-full sm:w-auto"
                  size="sm"
                  variant="outline"
                  onClick={openUpgradePlanDialog}
                >
                  {t("billing.actions.upgradeToPro")}
                </Button>
              )}
              {canManage && (
                <Button
                  className="w-full sm:w-auto"
                  size="sm"
                  variant="outline"
                  disabled={portalPending}
                  onClick={() => void openPortal()}
                >
                  {portalPending
                    ? t("billing.actions.openingPortal")
                    : t("billing.actions.manageSubscription")}
                  <ArrowUpRight className="size-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </Surface>
    </SectionBlock>
    {commercial.data?.customer && <SectionBlock title={t("billing.commercial.title")} description={t("billing.commercial.description")}>
      <Surface className="space-y-5 p-6">
        {commercial.data.subscriptions.length === 0 ? <p className="text-sm text-muted-foreground">{t("billing.commercial.noSubscription")}</p> : commercial.data.subscriptions.map((subscription, index) => <div className="flex flex-col gap-4 border-b border-border pb-5 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between" key={`${subscription.planName}-${index}`}><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{subscription.planName}</h3><Badge variant="outline">{subscription.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{money(subscription.monthlyAmountCents, subscription.currency)}{t("billing.commercial.perMonth")} · {subscription.cancelAtPeriodEnd ? t("billing.commercial.cancelsAt", { date: formatBillingDate(subscription.currentPeriodEnd, i18n.language) }) : t("billing.commercial.renewsAt", { date: formatBillingDate(subscription.currentPeriodEnd, i18n.language) })}</p></div>{commercial.data.portalAvailable && <Button size="sm" variant="outline" disabled={stripePortalPending} onClick={() => void openStripePortal()}>{stripePortalPending ? t("billing.actions.openingPortal") : t("billing.commercial.manageOnStripe")}<ArrowUpRight className="size-3.5" /></Button>}</div>)}
        {commercial.data.invoices.length > 0 && <div className="overflow-x-auto"><Table className="min-w-[36rem]"><TableHeader><TableRow><TableHead>{t("billing.transactions.columns.date")}</TableHead><TableHead>{t("billing.transactions.columns.description")}</TableHead><TableHead>{t("billing.transactions.columns.status")}</TableHead><TableHead className="text-right">{t("billing.transactions.columns.amount")}</TableHead><TableHead className="text-right">{t("billing.transactions.columns.invoice")}</TableHead></TableRow></TableHeader><TableBody>{commercial.data.invoices.map((invoice) => <TableRow key={`${invoice.kind}-${invoice.occurredAt}-${invoice.description}`}><TableCell>{formatBillingDate(invoice.occurredAt, i18n.language)}</TableCell><TableCell>{invoice.description ?? invoice.kind}</TableCell><TableCell className="capitalize">{invoice.status.replaceAll("_", " ")}</TableCell><TableCell className="text-right tabular-nums">{money(invoice.amountCents, invoice.currency)}</TableCell><TableCell className="text-right">{invoice.hostedInvoiceUrl ? <a className="text-primary underline-offset-4 hover:underline" href={invoice.hostedInvoiceUrl} rel="noreferrer" target="_blank">{t("billing.actions.viewInvoice")}</a> : "—"}</TableCell></TableRow>)}</TableBody></Table></div>}
      </Surface>
    </SectionBlock>}
    {plan !== "self_host" ? <><SpendingCapSection key={business.businessId} businessId={business.businessId} locale={i18n.language} t={(key, options) => t(key, options ?? {})} status={{ plan, overageSpendingCapCents: account?.overageSpendingCapCents ?? null, overageSpendCents: billing.data?.usageStatus?.overageSpendCents ?? 0, overageSpendCentsComplete: billing.data?.usageStatus?.usageComplete ?? true, overageSpendingCapReached: billing.data?.usageStatus?.overageSpendingCapReached ?? false, hasBillingManagementAccess: permissions?.hasBillingManagementAccess === true }} />{!hasStripeCommercialCustomer && <Transactions locale={i18n.language} transactions={billing.data?.transactions ?? []} t={t} />}</> : null}
    </div>
  </PageSurface>;
}

type Translate = ReturnType<typeof useTranslation>["t"];
function Transactions({ transactions, t, locale }: { transactions: Billing["transactions"]; t: Translate; locale: string }) {
  if (!transactions || transactions.length === 0) return null;

  return (
    <SectionBlock
      title={t("billing.transactions.title")}
      description={t("billing.transactions.description")}
    >
      <TableCard>
        <Table className="min-w-[42rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.date")}
              </TableHead>
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.description")}
              </TableHead>
              <TableHead className="text-right text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.amount")}
              </TableHead>
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.status")}
              </TableHead>
              <TableHead className="text-right text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.invoice")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => {
              const isRefund = tx.kind === "refund";
              return (
                <TableRow key={tx.sourceId}>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    {formatBillingDate(tx.occurredAt, locale)}
                  </TableCell>
                  <TableCell className="text-sm text-foreground">
                    {tx.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-medium text-foreground">
                    {isRefund ? "−" : ""}
                    {formatMoney(tx.amountCents, tx.currency, locale)}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground capitalize">
                      {tx.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {tx.invoiceUrl ? (
                      <Button
                        render={
                          <a
                            aria-label={t("billing.transactions.invoice")}
                            href={tx.invoiceUrl}
                            rel="noopener noreferrer"
                            target="_blank"
                          />
                        }
                        variant="ghost"
                        size="sm"
                        className="h-auto gap-1 px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t("billing.transactions.invoice")}
                        <ArrowUpRight className="size-3" />
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
    </SectionBlock>
  );
}

function PlanSectionSkeleton({
  t,
}: {
  t: Translate;
}) {
  return (
    <SectionBlock title={t("billing.currentPlan.title")}>
      <Surface className="px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
      </Surface>
    </SectionBlock>
  );
}

function SpendingCapSectionSkeleton({
  t,
}: {
  t: Translate;
}) {
  return (
    <SectionBlock title={t("billing.spendingCap.title")}>
      <Surface className="px-6 py-5">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-12 w-full rounded-xl" />
          <div className="flex items-end gap-3">
            <Skeleton className="h-10 max-w-xs flex-1 rounded-xl" />
            <Skeleton className="h-8 w-24 rounded-xl" />
          </div>
        </div>
      </Surface>
    </SectionBlock>
  );
}

function TransactionsSectionSkeleton({
  t,
}: {
  t: Translate;
}) {
  return (
    <SectionBlock
      title={t("billing.transactions.title")}
      description={t("billing.transactions.description")}
    >
      <TableCard>
        <Table className="min-w-[42rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.date")}
              </TableHead>
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.description")}
              </TableHead>
              <TableHead className="text-right text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.amount")}
              </TableHead>
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.status")}
              </TableHead>
              <TableHead className="text-right text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.invoice")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 3 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-40" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-12" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </SectionBlock>
  );
}

function BillingSkeleton({
  t,
}: {
  t: Translate;
}) {
  return (
    <div className="flex w-full flex-col gap-10">
      <PlanSectionSkeleton t={t} />
      <SpendingCapSectionSkeleton t={t} />
      <TransactionsSectionSkeleton t={t} />
    </div>
  );
}
