# Parallel-run acceptance checklist

Keep the Hatchable v16 app available while testing the Hostinger preview.

## Platform
- [ ] `/health` returns `{"ok":true}`
- [ ] Landing page loads
- [ ] Magic-link sign-in works
- [ ] Existing Perficient Zone business profile appears after first sign-in

## Core accounting
- [ ] Create/edit customer
- [ ] Upload/open/delete customer document
- [ ] Upload/change business logo
- [ ] Create item
- [ ] Create quote and convert to invoice
- [ ] Create UAE invoice and verify totals/VAT
- [ ] Edit invoice
- [ ] Secure invoice share page
- [ ] Browser Print / Save PDF
- [ ] Record partial/full payment
- [ ] Record/edit/delete refund
- [ ] Record/edit/delete bank charge
- [ ] Record/edit/delete bad-debt write-off

## Operations
- [ ] Create/edit expense
- [ ] Billable expense → draft invoice
- [ ] Time entry → draft invoice
- [ ] Delivery challan
- [ ] Project detail and profitability
- [ ] Customer review
- [ ] Customer portal

## Reporting
- [ ] Dashboard receivables
- [ ] Sales vs expenses
- [ ] Reports Center
- [ ] CSV exports
- [ ] Customer statement

## Integrations
- [ ] SMTP email after SMTP variables are configured
- [ ] Server PDF after PDF service variables are configured
- [ ] Recurring invoice endpoint protected by `CRON_SECRET`
- [ ] UAE e-invoicing still returns provider-required / adapter-required until a real provider is configured

## Cutover
- [ ] Pause writes on Hatchable briefly
- [ ] Perform final delta data sync
- [ ] Recheck source and target row counts
- [ ] Re-run smoke tests on Hostinger
- [ ] Switch production domain
- [ ] Keep Hatchable available as rollback during the agreed rollback window
