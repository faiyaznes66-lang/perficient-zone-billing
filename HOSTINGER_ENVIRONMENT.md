# Hostinger environment variables

Configure these in the Hostinger Node.js application before the preview deployment.

## Supabase
- `SUPABASE_URL=https://zdlohsshizjdldzkgafv.supabase.co`
- `SUPABASE_ANON_KEY=<use the Supabase publishable/anon key>`
- `SUPABASE_SERVICE_ROLE_KEY=<copy the service-role secret from Supabase Dashboard → Project Settings → API>`
- `SUPABASE_PUBLIC_BUCKET=perficient-zone-billing-public`
- `SUPABASE_PRIVATE_BUCKET=perficient-zone-billing-private`

## Database
Use Hostinger's Supabase database connection flow if available. It should populate the connection variables. The application ultimately needs:
- `DATABASE_URL=<Supabase PostgreSQL connection string>`

## Application
- `NODE_ENV=production`
- `PORT=3000`
- `APP_URL=<Hostinger preview URL initially>`

## Email
Invoice/report email remains disabled until SMTP is configured:
- `SMTP_HOST`
- `SMTP_PORT=587`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Server PDF
Browser Print / Save PDF remains available. Server PDF download additionally needs:
- `BROWSERLESS_URL`
- `BROWSERLESS_TOKEN`

## Recurring billing scheduler
- `CRON_SECRET=<generate a strong random secret>`

After the first Hostinger preview URL is issued, add:
- the preview origin as the Supabase **Site URL** or an allowed redirect URL;
- `<preview-origin>/app/` as an Auth redirect URL.

Do not add production DNS until the parallel-run checklist passes.
