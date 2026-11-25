"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { localizePublicPath } from "@/lib/locale-path";
import type { SupportedLocale } from "@/lib/locale";

export function AffiliatePortalSignOut({ locale }: { locale: SupportedLocale }) {
  const router = useRouter();
  const { t } = useTranslation("nav");
  const [pending, setPending] = useState(false);
  async function signOut() {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) return;
      router.replace(localizePublicPath("/login", locale));
      router.refresh();
    } finally {
      setPending(false);
    }
  }
  return <Button aria-busy={pending} disabled={pending} onClick={() => void signOut()} size="sm" variant="outline">{t("sidebar.signOut")}</Button>;
}
