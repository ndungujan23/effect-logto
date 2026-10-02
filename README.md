# effect-logto

An [Effect](https://effect.website) client for [Logto](https://logto.io).

Provides typed access to the Management, Account, and Experience APIs as a resource tree (`api.users.list` instead of `api.listUsers`), verified webhook payloads, and a fluent builder for advanced user search.

[![npm](https://img.shields.io/npm/v/effect-logto)](https://www.npmjs.com/package/effect-logto)
[![CI](https://github.com/ndungujan23/effect-logto/actions/workflows/ci.yml/badge.svg)](https://github.com/ndungujan23/effect-logto/actions/workflows/ci.yml)

## Install

```sh
npm install effect-logto effect
# or: bun add / pnpm add / yarn add
```

- `effect` is a peer dependency. This library targets **Effect 4** (stable).
- ESM only. Compatible with Node 22+, Bun, Deno, and edge runtimes. Provide any `HttpClient` implementation (for example `FetchHttpClient.layer`).
- Entry points:
	- `effect-logto` — clients, errors, search, and pagination
	- `effect-logto/schema` — every request and response schema
	- `effect-logto/webhook` — webhook verification and payload types

## Management API

```ts
import { Effect, Redacted } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { LogtoManagement, LogtoTenant } from 'effect-logto'

// Logto Cloud
const LogtoLive = LogtoManagement.layer({
  tenant: LogtoTenant.cloud('your-tenant-id'),
  clientId: 'your-client-id',
  clientSecret: Redacted.make('your-client-secret'),
})

// Self-hosted / OSS — tenant is always `default`; the indicator defaults to https://default.logto.app/api
const LogtoOssLive = LogtoManagement.layer({
  tenant: LogtoTenant.selfHosted({ baseUrl: 'https://auth.example.com' }),
  clientId: 'your-client-id',
  clientSecret: Redacted.make('your-client-secret'),
})

const program = Effect.gen(function* () {
  const logto = yield* LogtoManagement
  const app = yield* logto.applications.get('app-id', undefined)
  yield* logto.users.assignRoles('user-id', { payload: { roleIds: ['role-id'] } })
})

program.pipe(Effect.provide(LogtoLive), Effect.provide(FetchHttpClient.layer))
```

Access tokens are obtained via the client-credentials grant. Tokens are cached, refreshed 60 seconds before expiry, and shared across concurrent callers. On a `401` response the token is discarded and the request is retried once with a fresh token.

All operations fail with a `LogtoError`:

| Error | When |
| --- | --- |
| `LogtoApiError` | Non-success status. Carries `status`, Logto’s `code` (e.g. `entity.not_exists_with_id`), `message`, and `data` |
| `LogtoAuthError` | Unable to obtain an access token |
| `HttpClientError` | Transport failure |
| `SchemaError` | Response did not match the expected schema |

Pass `config: { includeResponse: true }` to receive `[value, response]` instead of the decoded value alone.

`LogtoClient.fromHttpClient(client)` exposes every API surface over an `HttpClient` that you authenticate yourself. This is the recommended approach for the Account API (end-user token), the Experience API, and public endpoints.

## Extras

### Advanced user search

```ts
import { UserSearch } from 'effect-logto'

const search = UserSearch.make()
  .field('name', ['Alice', 'Bob'], { mode: 'exact' }) // multiple values are only allowed in exact mode
  .field('primaryEmail', '%@gmail.com')
  .joint('and')

logto.users.list({ params: { search_params: search.params } })

UserSearch.make().identity({ type: 'social', provider: 'github', id: 'gh-user-id' })
```

`search_params` also accepts a plain record or any list of `[key, value]` entries (keys may be repeated).

### Pagination

```ts
import { Pagination } from 'effect-logto'

const everyone = Pagination.paginate((page) =>
  logto.users.list({ params: page, config: { includeResponse: true } }),
)
```

Streams every item, one request per page. Iteration stops when the `Total-Number` header total is reached, or on the first short or empty page.

### Webhooks

```ts
import { LogtoWebhook } from 'effect-logto'

const payload = yield* LogtoWebhook.receive({
  body: rawBody, // the raw body, not re-serialised JSON
  signature: request.headers[LogtoWebhook.SIGNATURE_HEADER],
  signingKey: Redacted.make(signingKey),
}).pipe(Effect.provide(LogtoWebhook.layer))

switch (payload.event) {
  case 'User.Created':
    payload.data.primaryEmail
    break
  case 'Organization.Membership.Updated':
    payload.addedUserIds
    break
}
```

The signature is verified with Web Crypto before the body is parsed, so the same code runs on Node, Bun, Deno, and edge runtimes. To accept only a single event family, pass its schema:

```ts
LogtoWebhook.receive(input, LogtoWebhook.DataPayload)
```

Payload schemas follow Logto’s payload builders (`packages/core/src/libraries/hook`) rather than the prose documentation. Notable differences:

- `User.Deleted` carries the deleted user in `data`.
- Delete events on `204` routes omit `data`.
- `User.Data.Updated` from `/custom-data` and `/profile` sends that route’s response body, not a full user. Inspect `matchedRoute`.
- User fields are nullable; timestamps are epoch milliseconds.

## Project layout

```
spec/openapi.json                      pinned Logto OpenAPI document
scripts/                               generator (spec → split, renamed modules)
src/
  domain/                              pure data — no IO
    schema/<resource>.ts               generated Effect schemas, one module per API tag
    webhook/  search/  tenant.ts  error.ts
  application/                         ports and use-cases
    operation/<resource>.ts            generated <Resource>Operations interfaces + API aggregates
    port/                              AccessTokenProvider, WebhookSignatureVerifier
    webhook/  pagination.ts  config.ts
  infrastructure/                      adapters
    http/operation/<resource>.ts       generated HttpClient implementations
    http/transport.ts  auth/client-credentials.ts  webhook/hmac-signature-verifier.ts
  management.ts  client.ts  webhook.ts  composition roots
  index.ts  schema.ts                  entry points (effect-logto, /schema, /webhook)
```

## Regenerating

```sh
cd packages/effect-logto
bun run generate                                     # from the pinned spec/openapi.json
bun run generate --fetch https://auth.example.com    # refresh the spec from a running Logto first
bun run type:check && bun run test
```

CI regenerates from the pinned specification and fails if the result differs from the committed sources. Always commit generator output together with the specification.

The generator invokes `@effect/openapi-generator` programmatically (the CLI is currently unreliable on Effect 4), then splits the output by OpenAPI tag and renames each operation’s schemas after its method: `ListApplicationRolesParams` becomes `Applications.ListRolesParams`, and `CreateApplication200` becomes `Applications.CreateResponse`.

Two adjustments are applied to the specification before generation:

- Spec quirks rejected by the importer (JS-literal regex patterns, the `[translationKey]` placeholder, `default: {}` on required objects, and documentation-only `properties` beside a `oneOf`). These fixes live in `scripts/spec.ts`.
- Error statuses with no documented body now fail with `LogtoApiError` instead of succeeding with `undefined`.
- Path parameters are wrapped in `encodeURIComponent` so identifiers containing `/`, `?`, `#`, or `..` cannot address a different endpoint.

To correct an unhelpful method name, add an override in `scripts/naming.ts`.

## Testing against a real Logto instance

Unit tests run against a scripted in-memory Logto and require no network. A read-only smoke check is also available to validate the pinned specification against a live instance (token grant, URL shapes, and every response schema). Only `GET` requests are issued; nothing is created or modified:

```sh
cd packages/effect-logto
LOGTO_ENDPOINT=https://auth.example.com \
LOGTO_CLIENT_ID=... LOGTO_CLIENT_SECRET=... \
bun run live-check
```

For Logto Cloud use `LOGTO_TENANT_ID` instead of `LOGTO_ENDPOINT`. Override the Management API indicator or token URL with `LOGTO_API_RESOURCE` / `LOGTO_TOKEN_ENDPOINT` if required. The machine-to-machine application must have the **Logto Management API** permission in the Logto Console.

Each check prints `✔` or `✘` together with the decoded values. A schema mismatch appears as a decode error that names the exact field. Findings should be captured as offline tests in `test/spec-shapes.test.ts`.

## Development

```sh
bun install
bun run check      # lint, typecheck, test, build, and validate the published package (publint + attw)
bun run changeset  # describe your change for the changelog; required for any user-facing change
```

Tests use Vitest on Node against a scripted in-memory Logto (`test/support/fake-logto.ts`) and therefore need neither network access nor a running Logto instance.

## License

MIT
