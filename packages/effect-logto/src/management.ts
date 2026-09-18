/**
 * Composition root for the Management API: tenant + client credentials -> `LogtoManagement`.
 *
 * ```ts
 * // Logto Cloud
 * const LogtoLive = LogtoManagement.layer({
 *   tenant: LogtoTenant.cloud('your-tenant-id'),
 *   clientId: 'your-client-id',
 *   clientSecret: Redacted.make('your-client-secret'),
 * })
 *
 * // Self-hosted / OSS
 * const LogtoLive = LogtoManagement.layer({
 *   tenant: LogtoTenant.selfHosted({ baseUrl: 'https://auth.example.com' }),
 *   clientId: 'your-client-id',
 *   clientSecret: Redacted.make('your-client-secret'),
 * })
 *
 * Effect.gen(function* () {
 *   const logto = yield* LogtoManagement
 *   const applications = yield* logto.applications.list(undefined)
 * }).pipe(Effect.provide(LogtoLive), Effect.provide(FetchHttpClient.layer))
 * ```
 */
import type * as Config from 'effect/Config'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'

import type { LogtoManagementApi } from './application/operation/index.ts'
import { AccessTokenProvider } from './application/port/access-token-provider.ts'
import type { LogtoTenant } from './domain/tenant.ts'
import * as ClientCredentials from './infrastructure/auth/client-credentials.ts'
import { makeManagementApi } from './infrastructure/http/operation/index.ts'
import { makeTransport } from './infrastructure/http/transport.ts'

export type LogtoManagementOptions = ClientCredentials.ClientCredentialsOptions

/**
 * An `HttpClient` rooted at the tenant endpoint that attaches a bearer token to every request
 * and, if Logto rejects the token with `401`, drops it and retries once with a fresh one.
 */
export const authenticatedClient = (base: HttpClient.HttpClient, tenant: LogtoTenant, tokens: AccessTokenProvider['Service']) => {
	const endpoint = tenant.endpoint.href.replace(/\/$/, '')
	return HttpClient.makeWith(
		(request: Effect.Effect<HttpClientRequest.HttpClientRequest>) =>
			Effect.flatMap(request, request => {
				const send = Effect.flatMap(tokens.get, token => base.execute(HttpClientRequest.bearerToken(request, token)))
				return Effect.flatMap(send, response =>
					response.status === 401 ? Effect.andThen(tokens.invalidate, send) : Effect.succeed(response)
				)
			}),
		request => Effect.succeed(HttpClientRequest.prependUrl(request, endpoint))
	)
}

export class LogtoManagement extends Context.Service<LogtoManagement, LogtoManagementApi>()('effect-logto/LogtoManagement') {
	/** Builds the API from whichever `AccessTokenProvider` is in context. */
	static readonly make = (tenant: LogtoTenant): Effect.Effect<LogtoManagementApi, never, HttpClient.HttpClient | AccessTokenProvider> =>
		Effect.gen(function* () {
			const base = yield* HttpClient.HttpClient
			const tokens = yield* AccessTokenProvider
			return makeManagementApi(makeTransport(authenticatedClient(base, tenant, tokens)))
		})

	/** Management API authenticated with the client-credentials grant. Requires an `HttpClient`. */
	static readonly layer = (options: LogtoManagementOptions): Layer.Layer<LogtoManagement, never, HttpClient.HttpClient> =>
		Layer.effect(LogtoManagement, LogtoManagement.make(options.tenant)).pipe(Layer.provide(ClientCredentials.layer(options)))

	/** Same as {@link LogtoManagement.layer}, with options read from `Config`. */
	static readonly layerConfig = (
		options: Config.Config<LogtoManagementOptions>
	): Layer.Layer<LogtoManagement, Config.ConfigError, HttpClient.HttpClient> =>
		Layer.unwrap(Effect.map(options, resolved => LogtoManagement.layer(resolved)))
}
