"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3 } from "lucide-react";

export function CommercialCheckoutSuccess({ token }: { token: string }) {
  const [paid, setPaid] = useState(false);
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(`/api/checkout/offers/${encodeURIComponent(token)}`, { cache: "no-store" });
        const data = await response.json();
        if (active && response.ok && data.status === "paid") setPaid(true);
      } catch { /* Retry on the next poll; the webhook remains the payment authority. */ }
    };
    void check();
    const timer = window.setInterval(() => void check(), 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token]);
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12 text-foreground"><section className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm">{paid ? <CheckCircle2 className="mx-auto size-10 text-emerald-600" /> : <Clock3 className="mx-auto size-10 text-muted-foreground" />}<h1 className="mt-5 text-2xl font-semibold">{paid ? "Payment confirmed" : "Confirming your payment"}</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{paid ? "Your payment is confirmed. Our team will follow up with you about onboarding." : "Stripe has returned you to Lead My Company. We are waiting for verified payment confirmation. This page will update automatically; you do not need to submit payment again."}</p></section></main>;
}
