/**
 * Read-only smoke check against a real Logto instance.
 *
 * Unlike the unit tests (which run against a scripted in-memory Logto), this talks to a live
 * tenant to prove the token grant, the URL shapes and the generated response schemas match what
 * Logto actually serves. It only issues GETs — nothing is created, updated or deleted.
 *
 *   LOGTO_ENDPOINT=https://auth.example.com \
 *   LOGTO_CLIENT_ID=... LOGTO_CLIENT_SECRET=... \
 *   bun run live-check
 *
 * Variables:
 *   LOGTO_ENDPOINT        Logto base URL (self-hosted), e.g. https://auth.example.com
 *   LOGTO_TENANT_ID       Logto Cloud tenant id — use instead of LOGTO_ENDPOINT
 *   LOGTO_CLIENT_ID       machine-to-machine app id
 *   LOGTO_CLIENT_SECRET   machine-to-machine app secret
 *   LOGTO_API_RESOURCE    optional: the Management API indicator, when it isn't the default
 *   LOGTO_TOKEN_ENDPOINT  optional: token endpoint, when it isn't <endpoint>/oidc/token
 *
 * The M2M application needs the "Logto Management API" permission in Logto Console.
 */
import * as Effect from 'effect/Effect'
import * as Redacted from 'effect/Redacted'
import * as Stream from 'effect/Stream'
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient'

import { LogtoApiError, LogtoAuthError, LogtoManagement, LogtoTenant, Pagination, UserSearch } from '../src/index.ts'

const required = (name: string) => {
	const value = process.env[name]
	if (!value) throw new Error(`Missing ${name}`)
	return value
}

const tenant = process.env.LOGTO_TENANT_ID
	? LogtoTenant.cloud(process.env.LOGTO_TENANT_ID)
	: LogtoTenant.selfHosted({
			baseUrl: required('LOGTO_ENDPOINT'),
			apiIndicator: process.env.LOGTO_API_RESOURCE,
			tokenEndpoint: process.env.LOGTO_TOKEN_ENDPOINT,
		})

const check = <A>(label: string, effect: Effect.Effect<A, unknown>, show: (value: A) => string) =>
	effect.pipe(
		Effect.map(value => `✔ ${label}: ${show(value)}`),
		Effect.catchCause(cause => Effect.succeed(`✘ ${label}: ${describe(cause)}`)),
		Effect.tap(Effect.log)
	)

const describe = (cause: unknown) => {
	const error = cause instanceof Error ? cause : ((cause as any)?.reasons?.[0]?.error ?? cause)
	if (error instanceof LogtoApiError) return `${error.status} ${error.code ?? ''} ${error.message}`.trim()
	if (error instanceof LogtoAuthError) return error.message
	return String((error as any)?.message ?? error)
}

const program = Effect.gen(function* () {
	const logto = yield* LogtoManagement
	yield* Effect.log(`Logto ${tenant._tag} ${tenant.endpoint.href} (indicator ${tenant.apiIndicator})`)

	yield* check('applications', logto.applications.list({ params: { page: 1, page_size: 5 } }), apps =>
		apps.length === 0 ? 'none' : `${apps.length} → ${apps.map(app => `${app.name} [${app.type}]`).join(', ')}`
	)

	yield* check(
		'users (page 1)',
		logto.users.list({ params: { page: 1, page_size: 5 }, config: { includeResponse: true } }),
		([users, response]) => {
			const total = Pagination.totalOf(response)
			const names = users.map(user => user.username ?? user.primaryEmail ?? user.name ?? user.id)
			return `${total._tag === 'Some' ? `${total.value} total` : 'unknown total'} → ${names.join(', ') || 'none'}`
		}
	)

	yield* check(
		'users (search)',
		logto.users.list({ params: { page: 1, page_size: 3, search_params: UserSearch.make().keyword('%a%').params } }),
		users => `${users.length} matching "%a%"`
	)

	yield* check(
		'roles',
		logto.roles.list({ params: { page: 1, page_size: 10 } }),
		roles => roles.map(role => role.name).join(', ') || 'none'
	)
	yield* check(
		'resources (APIs)',
		logto.resources.list(undefined),
		resources => resources.map(resource => resource.indicator).join(', ') || 'none'
	)
	yield* check(
		'organizations',
		logto.organizations.list({ params: { page: 1, page_size: 5 } }),
		organizations => organizations.map(organization => organization.name).join(', ') || 'none'
	)
	yield* check(
		'organization scopes',
		logto.organizationScopes.list({ params: { page: 1, page_size: 5 } }),
		scopes => scopes.map(scope => scope.name).join(', ') || 'none'
	)
	yield* check(
		'connectors',
		logto.connectors.list(undefined),
		connectors => connectors.map(connector => connector.id).join(', ') || 'none'
	)
	yield* check(
		'sign-in experience',
		logto.signInExperience.get(undefined),
		experience => `branding ${JSON.stringify(experience.color.primaryColor)}`
	)
	yield* check(
		'hooks (webhooks)',
		logto.hooks.list({ params: { page: 1, page_size: 10 } }),
		hooks => hooks.map(hook => `${hook.name} → ${hook.events.join('/')}`).join(', ') || 'none'
	)

	// Walks every page through the Total-Number header, capped so a big tenant stays cheap.
	yield* check(
		'pagination stream (users)',
		Stream.runCollect(
			Stream.take(
				Pagination.paginate(page => logto.users.list({ params: page, config: { includeResponse: true } }), { pageSize: 2 }),
				10
			)
		),
		users => `streamed ${users.length} user(s) across pages of 2`
	)
})

const options = { tenant, clientId: required('LOGTO_CLIENT_ID'), clientSecret: Redacted.make(required('LOGTO_CLIENT_SECRET')) }

await Effect.runPromise(program.pipe(Effect.provide(LogtoManagement.layer(options)), Effect.provide(FetchHttpClient.layer)))
