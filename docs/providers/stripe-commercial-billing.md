# Commercial billing and affiliate operations

This runbook describes the manually operated Stripe commercial billing flow. It does not grant tenant access or change operational entitlements. Tenant usage billing remains a separate system.

## Custom offers and checkout

Superadmins can create an offer in `/internal/commercial` with any monthly amount and a one-time setup fee, including zero. An offer can be named freely and does not need a catalog plan. Starter, Growth, and Pro are optional private presets; the migration creates no public plan rows and new catalog rows are private by default. An affiliate is optional. Offer amounts are snapshotted server-side, and the customer pays through Stripe Checkout at `/checkout/{opaque-token}` (or `/checkout/affiliate/{referral-code}`). The browser return page is not proof of payment: a verified Stripe webhook marks payment. Stripe webhook event IDs and object IDs are unique, invoice commissions use unique source keys, and retries return success after an event has already been processed.

After payment, an administrator manually provisions the tenant and associates the commercial customer with it. The association is one-to-one and cannot be silently reassigned. The tenant owner then sees contracted commercial pricing, invoices, and payment status at `/settings/plan`. This association does not update Polar billing accounts, legacy tenant plans, entitlements, or services.

## Provider behavior

| Tenant state | Polar checkout and portal | Stripe commercial billing |
| --- | --- | --- |
| Existing Polar tenant, no commercial association or open Stripe offer | Continues to work normally. | May be associated by an administrator only after checking for existing Polar billing. Association and offer creation reject a chargeable Polar subscription or pending Polar checkout. |
| Tenant linked to a Stripe commercial customer, awaiting payment or with an open offer | Polar checkout is blocked while the Stripe flow is pending. | Offer checkout remains available. The Stripe portal is not available until Stripe customer linkage exists. |
| Tenant has a Stripe customer or subscription | Polar checkout is blocked; the Polar portal endpoint returns 409. | Tenant owner sees commercial status, invoice history, and contracted price; portal sessions are created only after tenant authorization and resolve the mapped Stripe customer. |
| Tenant has only a canceled/expired Polar subscription | Polar flow is allowed, subject to normal existing billing rules. | Commercial billing is independent. |
| Commercial prospect has no tenant association yet | Existing tenant billing is unaffected. | Checkout works without Polar. The administrator must check for a pre-existing Polar customer before associating/provisioning; the system does not match identities by email or transfer subscriptions. |

The tenant plan and usage display remains operational entitlement data. For a Stripe-linked tenant, the old Polar catalog amount and legacy transaction list are hidden as a contracted price; Stripe commercial price and invoices are shown instead. Stripe commercial events never require a Polar subscription. A customer with an unassociated Polar subscription cannot be detected from an email-only Stripe prospect, so manual identity review is required before association.

## Affiliates, commissions, and payouts

Authenticated users can open `/affiliate`. The portal creates or loads only the signed-in user's affiliate profile and returns only that profile's referral link, counts, commissions, and payouts. It shows referred/paid customers, active subscriptions, pending and available balances, paid history, and reversal debt. Attribution is attached through the dedicated affiliate checkout link; there is no marketing-site first-touch cookie or attribution reassignment.

Recurring commissions use the affiliate rate snapshotted onto the customer, defaulting to 25%, and have a 30-day hold. Each paid invoice has one commission source key, so webhook retries do not create another commission. Partial refunds adjust unpaid commission from the original invoice amounts; paid commissions remain in history and a negative reversal is recorded. Chargebacks hold pending/available commissions; a lost dispute voids unpaid commission and records a reversal against paid commission. Later manual payout entries offset outstanding reversal debt before recording net paid funds. Payouts are manual and the external reference is recorded only after transfer completion.

## Configuration and operations

Set `STRIPE_BILLING_ENABLED=true`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and canonical HTTPS `APP_BASE_URL`. Keep keys server-only. Register `POST /api/webhooks/stripe` for checkout completion/async payment outcomes, invoice paid/failed, subscription create/update/delete, charge refunds, and dispute lifecycle events. Stripe retries non-2xx webhook responses; processing and financial mutations share a database transaction. Mapping failures are retryable and require operator diagnosis. Use Stripe test mode for manual acceptance checks; do not treat this document as authorization to perform live transactions.

Admin operations require the existing superadmin session and MFA gate. Offer, preset, affiliate, association, and payout changes are audit logged. Offer tokens are random bearer secrets stored as SHA-256 digests. Checkout session retries reuse the active session/idempotency key. A new session is only attempted after the prior session expires or the operator rotates the link.

## Scope and limitations

Plans and offers are USD. Tax treatment, invoicing policy, dunning, chargeback response, and the actual payout transfer remain operator responsibilities. Tenant provisioning and association are manual. This MVP does not provision services, deploy Railway resources, provision Twilio, automate payouts, or suspend services. Subscription MRR is a current active-subscription snapshot, not revenue recognition.

Migration `0082_commercial_stripe.sql` is additive and registered in the raw migration list. This audit did not apply it. A rollout still requires a separately planned deployment and migration. Keep the tables and records on application rollback; dropping them would erase billing, webhook-idempotency, audit, and commission history.
