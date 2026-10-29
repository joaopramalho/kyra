"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { requestJson } from "@/lib/request-json";

type InboundNumberResponse = { phoneNumber: { e164: string; status: string; voiceEnabled: boolean; voiceWebhookStatus: string | null } | null };

export function LmcInboundNumberCard() {
  const { t } = useTranslation("settings");
  const number = useQuery({ queryKey: ["lmc-inbound-number"], queryFn: () => requestJson<InboundNumberResponse>("/api/lmc/voice/number") });
  return <Surface className="p-5 sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-semibold">{t("phoneNumber.inboundSetup.title")}</h2>{number.isPending ? <p className="mt-2 text-sm text-muted-foreground">{t("phoneNumber.inboundSetup.loading")}</p> : number.data?.phoneNumber ? <div className="mt-3 flex flex-wrap items-center gap-3"><p className="font-mono">{number.data.phoneNumber.e164}</p><p className="text-sm text-muted-foreground">{number.data.phoneNumber.status} · voice {number.data.phoneNumber.voiceEnabled ? "enabled" : "disabled"} · SIP {number.data.phoneNumber.voiceWebhookStatus ?? "not checked"}</p></div> : <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("phoneNumber.inboundSetup.empty")}</p>}</div><Button nativeButton={false} render={<Link href="/settings/phone-number" />} size="sm" variant="outline">{t(number.data?.phoneNumber ? "phoneNumber.inboundSetup.manage" : "phoneNumber.inboundSetup.setup")}</Button></div></Surface>;
}
