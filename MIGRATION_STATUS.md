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
