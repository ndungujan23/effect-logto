/**
 * A scripted Logto: an in-memory `HttpClient` that records every request and answers with
 * whatever the test's handler returns. No network, no mocking library.
 */
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import type * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse'

import { LogtoManagement } from '../../src/management.ts'
import * as LogtoTenant from '../../src/domain/tenant.ts'

export interface RecordedCall {
	readonly method: string
	readonly url: URL
	readonly authorization: string | undefined
	readonly body: string
}

export type Handler = (request: HttpClientRequest.HttpClientRequest, url: URL, body: string) => Response | Effect.Effect<Response>

const bodyText = (request: HttpClientRequest.HttpClientRequest) =>
	request.body._tag === 'Uint8Array' ? new TextDecoder().decode(request.body.body) : ''

export const fakeLogto = (handler: Handler) => {
	const calls: Array<RecordedCall> = []
	const client = HttpClient.make((request, url) => {
		const body = bodyText(request)
		calls.push({ method: request.method, url, authorization: request.headers.authorization, body })
		const answer = handler(request, url, body)
		return Effect.map(Effect.isEffect(answer) ? answer : Effect.succeed(answer), response =>
			HttpClientResponse.fromWeb(request, response)
		)
	})
	return {
		calls,
		/** Calls excluding the token endpoint. */
		apiCalls: () => calls.filter(call => call.url.pathname !== '/oidc/token'),
		tokenCalls: () => calls.filter(call => call.url.pathname === '/oidc/token'),
		layer: Layer.succeed(HttpClient.HttpClient, client),
	}
}
export type FakeLogto = ReturnType<typeof fakeLogto>

export const json = (value: unknown, init?: ResponseInit) =>
	new Response(JSON.stringify(value), { ...init, headers: { 'content-type': 'application/json', ...init?.headers } })

/** Answers the client-credentials grant with `token-1`, `token-2`, … and `undefined` for anything else. */
export const tokenEndpoint = (options?: { readonly expiresIn?: number }) => {
	let issued = 0
	return (url: URL) =>
		url.pathname === '/oidc/token'
			? json({ access_token: `token-${++issued}`, expires_in: options?.expiresIn ?? 3600, token_type: 'Bearer', scope: 'all' })
			: undefined
}

export const scope = (id: string) => ({ tenantId: 'default', id, name: `scope-${id}`, description: null })

export const tenant = LogtoTenant.selfHosted({ baseUrl: 'https://auth.example.com/' })

export const managementLayer = LogtoManagement.layer({ tenant, clientId: 'm2m', clientSecret: 'shh' })

export const runManagement = <A, E>(effect: Effect.Effect<A, E, LogtoManagement>, logto: FakeLogto) =>
	Effect.runPromiseExit(effect.pipe(Effect.provide(managementLayer), Effect.provide(logto.layer)))

export const withApi = <A, E>(f: (api: LogtoManagement['Service']) => Effect.Effect<A, E>) =>
	Effect.gen(function* () {
		return yield* f(yield* LogtoManagement)
	})

/** The typed failure of an exit, or `undefined` when it succeeded or died. */
export const failureOf = <A, E>(exit: Exit.Exit<A, E>): E | undefined =>
	Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined
