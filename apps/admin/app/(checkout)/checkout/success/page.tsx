import { CommercialCheckoutSuccess } from "@/components/commercial-checkout-success";

export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ offer?: string }> }) {
  const { offer } = await searchParams;
  if (!offer) return <main className="flex min-h-screen items-center justify-center p-8 text-center"><p>Payment confirmation is unavailable. Contact the person who shared your offer.</p></main>;
  return <CommercialCheckoutSuccess token={offer} />;
}
