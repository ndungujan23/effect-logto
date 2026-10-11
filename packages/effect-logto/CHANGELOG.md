# effect-logto

## 0.2.0

### Minor Changes

- 455fa7b: Update peer dependency to Effect v4

### Patch Changes

- Fix `Cannot find module 'effect/unstable/http/HttpClient'` when installed next to Effect 4 stable. 0.1.0 was built against a release candidate where the HTTP client lived under `effect/unstable/http`; it is now imported from `effect/http`, and the peer range is `effect@^4.0.0`. CI now installs the packed tarball into a clean project with the lowest and the newest supported Effect and runs it under Node, so an unresolvable import can no longer ship.
- Internal: replace Biome with oxlint and oxfmt, run together with `tsc` and `sherif` through uncheck.
- Sync with the latest Logto OpenAPI document: adds trusted-device operations (`users.listTrustedDevices`, `users.deleteTrustedDevice`, `myAccount.getTrustedDevices`, `myAccount.deleteTrustedDeviceById`, `experience.setTrustedDeviceOptInDecision`) and the new query parameters of `users.list`. The generator now copes with `search_params` appearing anywhere among a list's query parameters.
- 083f4db: Update generated API schemas and operations

## 0.1.0

### Minor Changes

- f6cc233: Initial release: Effect client for the Logto Management, Account and Experience APIs (359 operations generated from Logto's OpenAPI spec), client-credentials auth with a cached, shared token, typed webhooks with HMAC signature verification, an advanced user search builder, and a pagination stream.
