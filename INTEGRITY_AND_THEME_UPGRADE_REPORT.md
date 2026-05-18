# Robocaz theme and CMS integrity upgrade

## Theme fixes
- Commerce/storefront theme now loads the green storefront stylesheet through the active theme injector.
- Commerce/storefront components use square styling with 2px border radius.
- Admin, account and login styling now uses Facebook blue (`#1877f2`) as the default brand colour.
- Admin, account and login buttons/boxes are squared with 2px border radius.
- Admin inline styles, account inline styles, admin polished theme CSS and shared standard area CSS were updated.

## Integrity/checksum lock
- Added `src/cms-integrity-manifest.json` containing SHA-256 checksums for release CMS files.
- Embedded the manifest checksum in `src/server.js` as `CMS_EXPECTED_MANIFEST_SHA256`.
- Admin login (`POST /api/auth/login`) verifies the manifest and all CMS file checksums before issuing a session token.
- If files are changed, deleted or the manifest is changed, login returns HTTP 423 with the changed/missing files.
- Emergency bypass is possible only by setting `CMS_INTEGRITY_CHECK=off` in the server environment.

## Validation
- `npm test` passed.
- Admin login passed when files were unchanged.
- Admin login was blocked with HTTP 423 after a test file tamper.
