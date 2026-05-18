# No-missing feature pass

This pass adds GitHub + Railway-only implementations for the items that were previously crossed out.

Implemented locally:
1. SSO/OAuth local provider and assertion endpoints.
2. Image transform manifest pipeline for resized/WebP/AVIF-ready derivatives.
3. Local full-text search index rebuild and query endpoints.
4. Custom Astro-like route and island manifests.
5. Visual page builder layout records and render endpoint.
6. Local plugin marketplace publishing endpoint.
7. GitHub-manifest plugin update channel records.
8. Plugin sandbox permission, network, CPU, and memory policy records.
9. Railway static immutable asset manifest with cache headers.
10. Local notification delivery channel and outbox endpoints.
11. WCAG 2.2 AA audit endpoint.
12. Local payment gateway, authorize, and capture endpoints.
13. PayPal/Stripe-shaped gateway records without external network calls.
14. Local CRM/ERP/accounting export and sync endpoints.
15. Local fraud scoring and rules engine.

No required external services are used. External-facing features are implemented as self-hosted/local adapters so the repo remains deployable using GitHub and Railway only.
