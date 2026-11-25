import { PublicCommercialCheckout } from "@/components/public-commercial-checkout";

export const dynamic = "force-dynamic";

export default async function CheckoutOfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicCommercialCheckout token={token} />;
}
