import { PublicAffiliateCheckout } from "@/components/public-affiliate-checkout";

export const dynamic = "force-dynamic";

export default async function AffiliateCheckoutPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PublicAffiliateCheckout code={code} />;
}
