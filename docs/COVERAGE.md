# Feature coverage

This repository includes internal code paths, tables, routes, admin screens, or adapters for the full requested CMS/e-commerce list.

## Fully local / self-contained
Auth, RBAC, profiles, account management, password reset local outbox, email verification flag, 2FA, permissions, teams, audit logs, CMS CRUD, post status, scheduling metadata, autosave revisions, taxonomies, custom fields, media library, SEO, comments/moderation, revisions/rollback, search, REST API, SSG, preview endpoint, webhooks, theme system, layouts, page blocks, plugin registry/hooks, caching/static output, security headers, backups, import/export, localization records, workflows, notifications local outbox, analytics, A/B test records, multi-site/tenant records, environment config, CLI, migrations ledger, forms, memberships, paywalls, GDPR export, accessibility settings, product management, variations, inventory, SKUs, pricing rules, carts, checkout, guest/account checkout data, currencies, tax rules, shipping zones, order management, customer history, coupons, dynamic pricing records, subscriptions, digital downloads/license records, reviews, wishlists, abandoned-cart records, invoices, sales reports, marketplace/affiliate records, fraud-rule stubs, API-first commerce and checkout hooks.

## Included as local adapters/stubs because of the GitHub + Railway only rule
Live Stripe/PayPal/Apple Pay processing, real SMTP/email delivery, external CDN, external OAuth providers, live shipping/tax APIs, CRM/ERP/accounting systems and fraud-scoring providers. The CMS has tables/routes/interfaces for these, but they intentionally do not call third-party platforms.

## Completed before Railway setup: email, PayPal, notifications and CDN

The latest build includes code-level support for:

- Real email notification infrastructure: provider registry, SMTP/API/local modes, templates, event triggers, outbox queue, retries and delivery logs.
- PayPal integration: admin config, Orders API payloads, capture/refund records, payments table integration and webhook receiver records. Add PayPal credentials later as Railway variables.
- Reliable internal notifications: in-app notifications, user preferences, notification events, read states, email escalation through the outbox and stored push subscriptions for later web-push providers.
- CDN integration: admin-configurable provider records, origins, cache rules, immutable asset registration and purge jobs. Add CDN API credentials later from the admin area or Railway env vars.

These features are coded so the CMS can be installed now. External delivery only becomes live when credentials are added.
