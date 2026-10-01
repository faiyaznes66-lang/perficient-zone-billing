# Hostinger deployment — next step

Use Hostinger's Node.js Web App flow.

1. In hPanel go to **Websites → Add Website → Node.js Web App / Deploy Web App**.
2. Choose **GitHub integration**.
3. Select private repository `faiyaznes66-lang/perficient-zone-billing`.
4. Select branch `hostinger-migration`.
5. Use **Node.js 22.x**.
6. Start command: `npm start`.
7. Entry file: `server.js`.
8. After the first app is created, use the Node.js dashboard **Database → Connect → Supabase** and choose the existing project `perficient-zone-billing`.
9. Add the remaining variables from `.env.example`.
10. Deploy only to the Hostinger preview URL for now. Do not point the production domain yet.

The application includes `/health` for deployment verification.
