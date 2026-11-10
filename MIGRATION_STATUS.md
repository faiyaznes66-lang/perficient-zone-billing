# Migration status

## Completed
- [x] Private GitHub repository created and verified
- [x] Hatchable v16 source copied to `main`
- [x] Migration branch created: `hostinger-migration`
- [x] Hostinger-compatible Node.js/Express runtime added
- [x] Hatchable frontend authentication replaced with Supabase Auth
- [x] Hatchable database/storage/email/browser services replaced by a local compatibility adapter
- [x] Hatchable project config removed from migration branch
- [x] Supabase project created in ap-south-1
- [x] Original 26 database migrations applied
- [x] Hostinger identity migration applied
- [x] Initial production data imported and row counts verified

## Supabase
Project ref: `zdlohsshizjdldzkgafv`
Project URL: `https://zdlohsshizjdldzkgafv.supabase.co`

Imported:
- app_users: 1
- businesses: 1
- expenses: 1
- subscriptions: 1

## Remaining before cutover
- [x] RLS enabled on all 24 application tables
- [x] Public logo bucket and private customer-document bucket created and verified
- [ ] Configure SMTP
- [ ] Configure PDF service or keep browser Print/PDF fallback
- [ ] Deploy `hostinger-migration` branch to Hostinger preview URL
- [ ] Connect existing Supabase database with Hostinger Database Connect Wizard
- [ ] Run acceptance tests
- [ ] Perform final delta data sync
- [ ] Switch production domain
- [ ] Keep Hatchable available for rollback during the parallel-run window


## Security/auth hardening completed
- [x] Browser database access blocked by RLS; application data is backend-only
- [x] Customer documents moved to private-storage design and authenticated download flow
- [x] Business logos use a separate public image bucket
- [x] Supabase magic-link authentication wired into the Hostinger branch
- [ ] Add the Hostinger preview URL to Supabase Auth URL Configuration after the first preview deploy


## Validation
- [x] GitHub CI dependency installation passed on Node.js 22
- [x] JavaScript syntax checks passed for server, API, pages, libraries and compatibility layer
- [x] Required migration/runtime files verified
- [x] Built-in Help Center added at `/help/`
- [x] Draft PR #1 opened and intentionally left unmerged until Hostinger acceptance testing passes


## UAE e-Invoicing — Complyance sandbox connector
- [x] Migration 030: seller TIN/trade licence/scope/revenue profile, outbound document snapshots, inbound inbox and credit-note foundation
- [x] Migration 031: per-business Complyance company/source/branch IDs, mapping readiness, contact details and signed webhook idempotency store
- [x] Complyance ISV Connect API sandbox onboarding endpoint with FTA authorisation confirmation and existing-source recovery
- [x] Seller settings UI for FTA contact details, beneficiary ID and disclosed-agent principal TRN
- [x] Customer buyer registration type and endpoint details for PINT AE
- [x] Invoice editor PINT AE fields and unit-code input
- [x] GETS/PINT AE payload builder for the initial supported invoice subset
- [x] Local preflight plus Complyance sandbox `purpose=validate`
- [x] Guarded invoice submission with immutable payload snapshot and duplicate/unknown-outcome protection
- [x] Complyance document status retrieval
- [x] HMAC SHA-256 signed sandbox/production purchase webhook receiver with event deduplication
- [x] Incoming purchase invoice inbox and full-document retrieval endpoint
- [x] Business Settings and invoice editor controls for connect, validate, submit, refresh and inbox
- [x] Help Center Complyance onboarding and webhook tutorials
- [ ] Apply migration 030 to Supabase (attempted; Supabase connection timed out)
- [ ] Apply migration 031 to Supabase after 030
- [ ] Obtain Complyance ISV sandbox API key with read/write permission and add it to Hostinger as `COMPLYANCE_SANDBOX_API_KEY`
- [ ] Complete FTA ASP authorisation for the Perficient legal entity using the exact contact email stored in Business Settings
- [ ] Connect the company in sandbox and complete the Complyance Default GETS Mapping Testbed cases until `readyForInvoicing=true`
- [ ] Configure the signed sandbox webhook and add `COMPLYANCE_WEBHOOK_SECRET_SANDBOX` in Hostinger
- [ ] Run end-to-end sandbox tests with real business/customer identifiers and provider-approved test cases
- [ ] Extend payload coverage for non-VAT sellers, discounts, zero-rated/exempt supplies, reverse charge, exports/e-commerce, overseas buyers and credit notes
- [ ] Obtain production key/webhook secret and complete provider/FTA go-live checks before production use

### Initial connector scope and safety limits
The current payload builder intentionally supports only UAE B2B/B2G, VAT-registered seller tax invoices with standard-rated VAT, no invoice or line discounts, UAE buyer addresses and supported unit/payment codes. Other cases are blocked rather than guessed. The code does not mark a document accepted until Complyance status retrieval reports a terminal result. Production credentials and production transmission remain disabled until sandbox and legal onboarding are complete.
