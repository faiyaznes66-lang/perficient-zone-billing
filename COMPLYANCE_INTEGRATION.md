# Complyance UAE e-Invoicing integration

## Scope

This integration is for the Perficient Zone Billing SaaS: Perficient Zone's own business account and each customer business account use the same Complyance ISV workspace credentials, while each UAE business has its own FTA ASP authorization, Complyance company, branch and source identity.

The first release is sandbox-only and supports UAE full tax invoices for B2B/B2G customers, subject to the field and tax-category checks in `lib/complyance.js`. It does not automatically submit consumer, overseas, simplified, credit-note or unsupported VAT/transaction cases.

## Server environment

Set these only in the Node.js server environment (never in browser/runtime-config variables):

- `COMPLYANCE_SANDBOX_API_KEY`: sandbox API key from the Complyance Partner Platform Developer Portal.
- `COMPLYANCE_PRODUCTION_API_KEY`: production key; leave unset until go-live approval.
- `EINVOICE_CREDENTIALS_ENCRYPTION_KEY`: 64 hex characters (32 bytes), reserved for encrypted provider credentials.
- `COMPLYANCE_WEBHOOK_SECRET_SANDBOX` and `COMPLYANCE_WEBHOOK_SECRET_PRODUCTION`: reserved for separately configured webhook signature verification.

The app does not store the ISV API key in a business record. It remains a server-side environment secret.

## Per-business onboarding

1. The business completes its Business Settings: legal name, UAE FTA TIN (10 digits, not the 15-digit VAT TRN), VAT/TRN details where registered, trade licence number and issuing authority, emirate, city, address, and an authorised contact name/email/mobile.
2. The business administrator authorizes Complyance as its ASP with the FTA for the sandbox environment, using the same TIN and administrator email.
3. The signed-in business administrator calls `POST /api/einvoice` with `{"action":"connect"}`.
4. The app creates the business's company/branch/source in Complyance sandbox and stores the returned IDs and readiness status.
5. In the Complyance Partner Developer Portal, run the required Default GETS Mapping Testbed cases until they pass. Do not submit invoices while `readyForInvoicing` is false.

Each business gets a deterministic, distinct source name derived from its internal business ID.

## API

All endpoints below require a signed-in application session.

- `GET /api/einvoice` — read this business's sandbox connection and recent outbound documents.
- `POST /api/einvoice` with `{"action":"connect"}` — onboard this business in sandbox. Existing company records are not re-created.
- `POST /api/einvoice` with `{"action":"validate","invoiceId":"..."}` — validate a finalized invoice payload without submitting it for delivery.
- `POST /api/einvoice` with `{"action":"submit","invoiceId":"..."}` — submit an eligible finalized invoice to Complyance sandbox.
- `POST /api/einvoice` with `{"action":"refresh","documentId":"..."}` — retrieve the provider's current status and persist it.

The API stores the request payload hash, provider document ID, generated XML (when returned), provider response, validation errors and status events. A timeout/5xx during submission is marked `submission_unknown`; the app blocks blind retries and requires a status/portal check to avoid duplicate invoices.

## Production checklist

Production is deliberately not enabled by this route yet. Before enabling it:

1. Complete the full sandbox test matrix and receive `final_valid` for each supported document type.
2. Complete all required production Default GETS Mapping Testbed cases.
3. Create a production API key in the Partner Platform.
4. Have each business authorize Complyance as its ASP with the FTA for production.
5. Onboard each business separately with `platformEnvironment: "production"`.
6. Run a controlled production pilot and verify terminal `final_valid` status before treating a document as accepted.

A successful HTTP response from Unify is not final acceptance. The app must check the document until `isTerminal` is true and state is `final_valid`.

## Current limitations

- The current route only handles the outbound sales-invoice path.
- The first mapping supports full UAE tax invoices for B2B/B2G and the supported standard/out-of-scope tax cases implemented by the payload builder.
- Purchase-invoice inbox/webhook ingestion, credit-note submission, UI settings screens and production submission are follow-on work.
- Never expose Complyance keys, Supabase service credentials or the encryption key to the browser.
