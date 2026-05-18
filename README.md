# Headless Railway CMS Commerce

A self-contained, custom-coded headless CMS + static frontend + plugin/theme + commerce starter for deployment using only GitHub and Railway.

## Run locally

```bash
npm install
npm run dev
```

Default admin:

- Email: `admin@example.com`
- Password: `ChangeMe123!`

Open:

- API health: `/api/health`
- Admin: `/admin`
- Static site: `/site/index.html`

## Deploy on Railway

1. Push this folder to GitHub.
2. Create a Railway project from the GitHub repo.
3. Add environment variables: `APP_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NODE_ENV=production`.
4. Railway will run `npm start`.

## Build static frontend

```bash
npm run build
```

The static site is generated into `public/site`.

## No external platforms

This project does not require WordPress, Shopify, Webflow, SaaS CMSs, managed search, CDN, Stripe, PayPal, SMTP providers, or SSO providers. Where those normally exist, this repo includes local adapters/stubs so you can add provider code later only if you decide to allow it.

## Version 4.0 no-missing pass

This build adds local/self-hosted implementations for the previously missing feature groups. Run `GET /api/no-missing/capabilities` after starting the server to see the implemented modules.

Because the project must use only GitHub and Railway, features that usually require third-party services are implemented as local adapters and extension points rather than live external SaaS calls.
