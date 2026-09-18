import * as Clock from 'effect/Clock'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'
import * as SynchronizedRef from 'effect/SynchronizedRef'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse'

import { AccessTokenProvider } from '../../application/port/access-token-provider.ts'
import { LogtoAuthError } from '../../domain/error.ts'
import type { LogtoTenant } from '../../domain/tenant.ts'

export interface ClientCredentials {
	readonly clientId: string
	readonly clientSecret: Redacted.Redacted<string> | string
}

export interface ClientCredentialsOptions extends ClientCredentials {
	readonly tenant: LogtoTenant
	/** Space-separated scopes. Logto's Management API grants everything under `all`. */
	readonly scope?: string | undefined
	/** Refresh this long before the token actually expires. Defaults to 60 seconds. */
	readonly refreshBefore?: Duration.Input | undefined
}

const TokenResponse = Schema.Struct({
	access_token: Schema.String,
	expires_in: Schema.Number,
	token_type: Schema.optionalKey(Schema.String),
	scope: Schema.optionalKey(Schema.String),
})

interface CachedToken {
	readonly token: Redacted.Redacted<string>
	readonly expiresAt: number
}

/**
 * Client-credentials grant against the tenant's token endpoint, with the token cached and
 * refreshed on demand. Concurrent callers share a single in-flight refresh.
 */
export const make = Effect.fnUntraced(function* (options: ClientCredentialsOptions) {
	const httpClient = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
	const cache = yield* SynchronizedRef.make(Option.none<CachedToken>())
	const refreshBefore = Duration.toMillis(Duration.fromInputUnsafe(options.refreshBefore ?? Duration.seconds(60)))
	const secret = typeof options.clientSecret === 'string' ? Redacted.make(options.clientSecret) : options.clientSecret

	const request = HttpClientRequest.post(options.tenant.tokenEndpoint.href).pipe(
		HttpClientRequest.basicAuth(options.clientId, Redacted.value(secret)),
		HttpClientRequest.bodyUrlParams({
			grant_type: 'client_credentials',
			resource: options.tenant.apiIndicator,
			scope: options.scope ?? 'all',
		})
	)

	const fetchToken = httpClient.execute(request).pipe(
		Effect.flatMap(HttpClientResponse.schemaBodyJson(TokenResponse)),
		Effect.retry({ times: 2, schedule: Schedule.exponential(Duration.millis(250)) }),
		Effect.mapError(
			cause =>
				new LogtoAuthError({ message: `Could not obtain a Logto access token from ${options.tenant.tokenEndpoint.href}`, cause })
		),
		Effect.flatMap(response =>
			Effect.map(
				Clock.currentTimeMillis,
				(now): CachedToken => ({ token: Redacted.make(response.access_token), expiresAt: now + response.expires_in * 1000 })
			)
		)
	)

	const get = SynchronizedRef.modifyEffect(cache, cached =>
		Effect.flatMap(Clock.currentTimeMillis, now =>
			Option.isSome(cached) && now < cached.value.expiresAt - refreshBefore
				? Effect.succeed([cached.value.token, cached] as const)
				: Effect.map(fetchToken, fresh => [fresh.token, Option.some(fresh)] as const)
		)
	)

	return AccessTokenProvider.of({ get, invalidate: SynchronizedRef.set(cache, Option.none()) })
})

export const layer = (options: ClientCredentialsOptions): Layer.Layer<AccessTokenProvider, never, HttpClient.HttpClient> =>
	Layer.effect(AccessTokenProvider, make(options))
