export type StripeCommercialConfig = { secretKey: string; webhookSecret: string; appBaseUrl: string };

/** Keeps the Stripe sales surface closed until its key, webhook and trusted
 * canonical application origin are all configured. */
export function stripeCommercialConfig(environment: Readonly<Record<string, string | undefined>> = process.env): StripeCommercialConfig | null {
  if (environment.STRIPE_BILLING_ENABLED !== "true") return null;
  const secretKey = environment.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = environment.STRIPE_WEBHOOK_SECRET?.trim();
  const appBaseUrl = environment.APP_BASE_URL?.trim().replace(/\/$/, "");
  if (!secretKey || !webhookSecret || !appBaseUrl) return null;
  let parsed: URL;
  try { parsed = new URL(appBaseUrl); } catch { return null; }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") return null;
  return { secretKey, webhookSecret, appBaseUrl: parsed.origin };
}
