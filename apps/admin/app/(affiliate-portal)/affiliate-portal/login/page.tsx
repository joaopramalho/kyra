import { notFound } from "next/navigation";

import { GuestAuthCard } from "@/components/guest-auth-card";
import { affiliateProgramEnabled } from "@/lib/affiliate-program";

export default function AffiliatePortalLoginPage() {
  if (!affiliateProgramEnabled()) notFound();
  return <GuestAuthCard affiliatePortal mode="login" />;
}
