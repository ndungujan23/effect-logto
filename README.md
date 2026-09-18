# effect-logto

An [Effect](https://effect.website) client for [Logto](https://logto.io): the Management, Account and Experience APIs as a resource tree (`api.users.list`, not `api.listUsers`), typed webhooks with signature verification, and a builder for advanced user search.

[![npm](https://img.shields.io/npm/v/effect-logto)](https://www.npmjs.com/package/effect-logto)
[![CI](https://github.com/ndungujan23/effect-logto/actions/workflows/ci.yml/badge.svg)](https://github.com/ndungujan23/effect-logto/actions/workflows/ci.yml)

## Install

```sh
npm install effect-logto effect
# or: bun add / pnpm add / yarn add
```

- `effect` is a peer dependency. This library targets **Effect 4** (currently `4.0.0-rc`), so expect breaking changes while both are pre-1.0.
- ESM only. Runs on Node 22+, Bun, Deno and edge runtimes. Provide any `HttpClient`, e.g. `FetchHttpClient.layer`.
- Entry points: `effect-logto` (clients, errors, search, pagination), `effect-logto/schema` (every request/response schema), and `effect-logto/webhook`.

## Management API

```ts
import { Effect, Redacted } from 'effect'
import { FetchHttpClient } from 'effect/unstable/http'
import { LogtoManagement, LogtoTenant } from 'effect-logto'

// Logto Cloud
const LogtoLive = LogtoManagement.layer({
	tenant: LogtoTenant.cloud('your-tenant-id'),
	clientId: 'your-client-id',
	clientSecret: Redacted.make('your-client-secret'),
})

// Self-hosted / OSS: the tenant is always `default`, the indicator defaults to https://default.logto.app/api
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

The access token comes from the client-credentials grant. It's cached, refreshed 60 seconds before it expires, and shared by concurrent callers. If Logto answers `401`, the token is dropped and the request is retried once with a fresh one.

Every operation fails with `LogtoError`:

| Error | When |
| --- | --- |
| `LogtoApiError` | Non-success status. Carries `status`, Logto's `code` (e.g. `entity.not_exists_with_id`), `message`, `data` |
| `LogtoAuthError` | No access token could be obtained |
| `HttpClientError` | Transport failure |
| `SchemaError` | The response did not match the spec |

Pass `config: { includeResponse: true }` to get `[value, response]` back.

`LogtoClient.fromHttpClient(client)` returns every API surface over an `HttpClient` that you authenticate yourself: the Account API with an end-user token, the Experience API, and the public endpoints.

## Extras

### Advanced user search

```ts
import { UserSearch } from 'effect-logto'

const search = UserSearch.make()
	.field('name', ['Alice', 'Bob'], { mode: 'exact' }) // several values are only allowed in exact mode
	.field('primaryEmail', '%@gmail.com')
	.joint('and')

logto.users.list({ params: { search_params: search.params } })

UserSearch.make().identity({ type: 'social', provider: 'github', id: 'gh-user-id' })
```

`search_params` also accepts a plain record, or any list of `[key, value]` entries (keys may repeat).

### Pagination

```ts
import { Pagination } from 'effect-logto'

const everyone = Pagination.paginate((page) => logto.users.list({ params: page, config: { includeResponse: true } }))
```

This streams every item, one request per page. It stops once the `Total-Number` header's total is reached, or at the first short or empty page.

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

The signature is checked before the body is parsed. The check uses Web Crypto, so it runs on Node, Bun, Deno and edge runtimes. To accept only one event family, pass its schema: `LogtoWebhook.receive(input, LogtoWebhook.DataPayload)`.

The payload schemas follow Logto's payload builders (`packages/core/src/libraries/hook`), not the prose docs. The two disagree in a few places:

- `User.Deleted` carries the deleted user in `data`.
- Delete events on `204` routes omit `data`.
- `User.Data.Updated` from `/custom-data` and `/profile` sends that route's response body, not a user. Check `matchedRoute`.
- User fields are nullable, and timestamps are epoch milliseconds.

## Layout

```
spec/openapi.json                      pinned Logto OpenAPI document
scripts/                               generator (spec -> split, renamed modules)
src/
  domain/                              pure data: no IO
    schema/<resource>.ts               generated Effect schemas, one module per API tag
    webhook/  search/  tenant.ts  error.ts
  application/                         ports and use-cases
    operation/<resource>.ts            generated `<Resource>Operations` interfaces + API aggregates
    port/                              AccessTokenProvider, WebhookSignatureVerifier
    webhook/  pagination.ts  config.ts
  infrastructure/                      adapters
    http/operation/<resource>.ts       generated HttpClient implementations
    http/transport.ts  auth/client-credentials.ts  webhook/hmac-signature-verifier.ts
  management.ts  client.ts  webhook.ts  composition roots
  index.ts  schema.ts                  entry points (`effect-logto`, `/schema`, `/webhook`)
```

## Regenerating

```sh
cd packages/effect-logto
bun run generate                                     # from spec/openapi.json
bun run generate --fetch https://auth.example.com    # refresh the spec from a running Logto first
bun run type:check && bun run test
```

CI regenerates from the pinned spec and fails if the result differs from the committed sources, so always commit the generator output together with the spec.

The generator runs `@effect/openapi-generator` (pinned to `4.0.0-rc.112`; newer releases emit helpers the splitter doesn't handle yet) programmatically, because its CLI is broken on the current Effect RC. It then splits the output by OpenAPI tag and renames each operation's schemas after its method: `ListApplicationRolesParams` becomes `Applications.ListRolesParams`, and `CreateApplication200` becomes `Applications.CreateResponse`.

Two parts of the spec are adjusted before generation:

- Spec quirks the importer rejects: JS-literal regex patterns, the `[translationKey]` placeholder, `default: {}` on required objects, and doc-only `properties` beside a `oneOf`. These fixes are in `scripts/spec.ts`.
- Error statuses with no documented body: these now fail with `LogtoApiError` instead of succeeding with `undefined`.
- Path parameters: the generator interpolates them raw, so each one is wrapped in `encodeURIComponent`. Without that, an id containing `/`, `?`, `#` or `..` would address a different endpoint.

To fix an unhelpful method name, add an override in `scripts/naming.ts`.

## Testing against a real Logto

The unit tests run against a scripted in-memory Logto and need no network. To check the pinned spec against a real instance — the token grant, URL shapes and every response schema — there is a read-only smoke check (GETs only, nothing is created or modified):

```sh
cd packages/effect-logto
LOGTO_ENDPOINT=https://auth.example.com \
LOGTO_CLIENT_ID=... LOGTO_CLIENT_SECRET=... \
bun run live-check
```

Use `LOGTO_TENANT_ID` instead of `LOGTO_ENDPOINT` for Logto Cloud, and `LOGTO_API_RESOURCE` / `LOGTO_TOKEN_ENDPOINT` to override the Management API indicator or token URL. The machine-to-machine app needs the **Logto Management API** permission in Logto Console.

Each check prints `✔` or `✘` with the decoded values, so a schema that no longer matches what Logto sends shows up as a decode error naming the exact field. Whatever it finds should then be pinned as an offline test in `test/spec-shapes.test.ts`.

## Development

```sh
bun install
bun run check      # lint, typecheck, test, build, and validate the published package (publint + attw)
bun run changeset  # describe your change for the changelog; required for anything user-facing
```

Tests use Vitest on Node against a scripted in-memory Logto (`test/support/fake-logto.ts`), so they need no network or Logto instance.

## License

MIT
