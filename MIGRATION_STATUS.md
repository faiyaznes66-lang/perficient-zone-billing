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
- [ ] Enable RLS after approval
- [ ] Create/configure storage bucket and private document strategy
- [ ] Configure SMTP
- [ ] Configure PDF service or keep browser Print/PDF fallback
- [ ] Deploy `hostinger-migration` branch to Hostinger preview URL
- [ ] Connect existing Supabase database with Hostinger Database Connect Wizard
- [ ] Run acceptance tests
- [ ] Perform final delta data sync
- [ ] Switch production domain
- [ ] Keep Hatchable available for rollback during the parallel-run window
