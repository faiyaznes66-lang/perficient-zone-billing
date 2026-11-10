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

## UAE e-Invoicing — Complyance
For the first sandbox integration, configure these server-side Hostinger variables:
- `COMPLYANCE_SANDBOX_API_KEY=<ISV workspace sandbox API key>`
- `COMPLYANCE_WEBHOOK_SECRET_SANDBOX=<HMAC SHA-256 secret copied when creating the sandbox webhook>`

For production, only after sandbox tests, ASP authorisation and go-live checks pass:
- `COMPLYANCE_PRODUCTION_API_KEY=<ISV workspace production API key>`
- `COMPLYANCE_WEBHOOK_SECRET_PRODUCTION=<HMAC SHA-256 secret for the production webhook>`

The Connect API key and Unify API key are the same workspace key but use different headers. The application sends both only from its server. Never put either API key or webhook signing secret in browser code, GitHub, or a customer-visible setting. Complyance company/source identifiers are stored per business; the shared ISV API key remains in Hostinger environment variables.

Webhook URLs to register in the Complyance Developer Portal:
- Sandbox: `<APP_URL>/api/webhooks/complyance/sandbox`
- Production: `<APP_URL>/api/webhooks/complyance/production`

Turn on HMAC SHA-256 signing and subscribe to `purchase.invoice.stored` and `purchase.invoice.validation_failed`. Use a separate webhook and secret for each environment.

`EINVOICE_CREDENTIALS_ENCRYPTION_KEY=<32-byte key encoded as 64 hexadecimal characters>` remains reserved for future provider-specific customer tokens that must be encrypted at rest. It is not the storage location for the shared Complyance ISV API key.

## Recurring billing scheduler
- `CRON_SECRET=<generate a strong random secret>`

After the first Hostinger preview URL is issued, add:
- the preview origin as the Supabase **Site URL** or an allowed redirect URL;
- `<preview-origin>/app/` as an Auth redirect URL.

Do not add production DNS until the parallel-run checklist passes.
