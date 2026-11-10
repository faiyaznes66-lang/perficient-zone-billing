# Complyance UAE e-Invoicing integration

## Scope and tenancy

Perficient Zone Billing is a multi-business SaaS. Perficient Zone's own company account and each customer company's account are represented by separate business records. The ISV workspace API key is shared server-side by the application; each business has its own UAE TIN, FTA ASP authorisation, Complyance company, branch and source identity.

The current connector is sandbox-first. The implemented outbound mapping supports full UAE tax invoices for B2B/B2G buyers, with standard-rated 5% VAT for VAT-registered sellers and out-of-scope lines for non-VAT sellers. Unsupported scenarios are blocked by local preflight rather than guessed: discounts, exempt/zero-rated/reverse-charge VAT categories, overseas buyers, consumer invoices, selected transaction modifiers and credit notes require additional mapping and testing.

## Server environment

Set these only in the Hostinger Node.js server environment. Never put them in browser JavaScript or `runtime-config.js`.

- `COMPLYANCE_SANDBOX_API_KEY`: sandbox read/write API key from the Complyance Partner Platform Developer Portal.
- `COMPLYANCE_PRODUCTION_API_KEY`: keep unset until production onboarding and go-live are approved.
- `COMPLYANCE_WEBHOOK_SECRET_SANDBOX`: HMAC signing secret configured for the sandbox webhook.
- `COMPLYANCE_WEBHOOK_SECRET_PRODUCTION`: production webhook secret; keep unset until production is enabled.
- `EINVOICE_CREDENTIALS_ENCRYPTION_KEY`: 64 hex characters (32 bytes), reserved for encrypted credential storage.

The ISV API key is held as a server environment secret, not copied into a business record or browser.

## Per-business sandbox onboarding

1. Complete the business profile in Settings: legal name, UAE FTA TIN (10 digits, not the 15-digit VAT TRN), VAT/TRN status, trade licence number and issuing authority, emirate, city, address, revenue band, scope assessment and authorised contact details.
2. The business administrator must authorise Complyance as its ASP with the FTA for the sandbox environment. Use the same 10-digit TIN and administrator email in Business Settings that were used for the FTA ASP authorisation.
3. In Settings, explicitly confirm that the business has authorised Complyance, then use Connect to Complyance. The backend checks for an existing company/source before attempting creation to reduce duplicate onboarding.
4. In the Complyance Partner Developer Portal, open Default GETS Mapping and run the required Testbed cases until they pass. Use Refresh status in the app to update onboarding and mapping readiness.
5. Do not submit invoices until the connection is marked connected and mapping readiness is true.

The application generates a distinct source name for each business account.

## Application endpoints

All endpoints below require an authenticated application session, except the signed webhook receiver.

- `GET /api/einvoicing-status` — business profile, scope/revenue timeline, ASP connection and readiness checks.
- `POST /api/einvoicing-connect` — onboard or recover the business's Complyance sandbox company. Request must include `{"authorized_by_business":true}` after the FTA ASP authorisation is complete.
- `POST /api/einvoicing-sync` — refresh company onboarding and mapping readiness from Complyance.
- `GET /api/einvoicing-validate/:invoiceId` — local and (when ready) Complyance payload validation; this does not submit the invoice.
- `POST /api/einvoicing-submit/:invoiceId` — requires `{"confirm_submit":true}`; validates first, then submits to Unify. Duplicate and uncertain submissions are guarded.
- `POST /api/einvoicing-document-status/:invoiceId` — retrieve and store the provider document status.
- `GET /api/einvoicing-inbox` — list received purchase invoices.
- `POST /api/webhooks/complyance/sandbox` — public endpoint protected by HMAC SHA-256 signature verification and event deduplication. Configure this URL and its secret in the Complyance sandbox webhook settings.

The invoice page exposes validation and an explicit send confirmation. Settings provides the seller readiness and connection workflow. The inbox receives supported purchase-invoice events.

A successful Unify HTTP response is not final acceptance. The document must be refreshed until it reaches terminal state; `final_valid` is the accepted state. A timeout after a submission may have started is treated as an unknown outcome; do not blindly resubmit.

## Production go-live

Production is not enabled by the current onboarding flow. Before production is added:

1. Complete the supported sandbox test matrix and receive terminal `final_valid` results.
2. Pass all required production Default GETS Mapping Testbed cases.
3. Create a production API key in the Partner Platform.
4. Have each business authorise Complyance as its ASP with the FTA for production.
5. Implement and test separate production onboarding and environment switching for each business.
6. Configure the production webhook and secret, then run a controlled production pilot.

## Security and operational notes

- Keep Complyance API keys, Supabase service credentials and encryption keys server-side.
- Webhook signatures are checked against the raw request body using timing-safe comparison.
- Webhook events are deduplicated by provider, environment and event ID.
- Business ownership is checked on invoice, status and inbox routes.
- Review the PINT AE mapping and supported transaction types before enabling additional invoice categories.
