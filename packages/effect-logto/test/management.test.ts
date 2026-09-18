import * as ConfigProvider from 'effect/ConfigProvider'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { describe, expect, test } from 'vitest'

import { LogtoApiError, LogtoManagement, LogtoTenant, Pagination } from '../src/index.ts'
import { failureOf, fakeLogto, json, runManagement, scope, tokenEndpoint, withApi } from './support/fake-logto.ts'

describe('LogtoManagement', () => {
	test('requests a client-credentials token for the OSS indicator, caches it, and roots calls at the endpoint', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => token(url) ?? json([scope('a')]))

		const exit = await runManagement(
			withApi(api => Effect.andThen(api.organizationScopes.list(undefined), api.organizationScopes.list(undefined))),
			logto
		)

		expect(Exit.isSuccess(exit) && exit.value[0]?.id).toBe('a')
		const [tokenCall, ...rest] = logto.calls
		expect(tokenCall?.url.href).toBe('https://auth.example.com/oidc/token')
		expect(tokenCall?.method).toBe('POST')
		expect(tokenCall?.authorization).toBe(`Basic ${btoa('m2m:shh')}`)
		expect(Object.fromEntries(new URLSearchParams(tokenCall?.body))).toEqual({
			grant_type: 'client_credentials',
			resource: 'https://default.logto.app/api',
			scope: 'all',
		})
		expect(rest.map(call => [call.url.href, call.authorization])).toEqual([
			['https://auth.example.com/api/organization-scopes', 'Bearer token-1'],
			['https://auth.example.com/api/organization-scopes', 'Bearer token-1'],
		])
	})

	test('a 401 invalidates the cached token and retries once with a fresh one', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto(
			(request, url) =>
				token(url) ?? (request.headers.authorization === 'Bearer token-1' ? json({}, { status: 401 }) : json(scope('r1')))
		)

		const exit = await runManagement(
			withApi(api => api.organizationScopes.get('r1', undefined)),
			logto
		)

		expect(Exit.isSuccess(exit) && exit.value.id).toBe('r1')
		expect(logto.calls.map(call => `${call.url.pathname} ${call.authorization ?? ''}`)).toEqual([
			'/oidc/token Basic bTJtOnNoaA==',
			'/api/organization-scopes/r1 Bearer token-1',
			'/oidc/token Basic bTJtOnNoaA==',
			'/api/organization-scopes/r1 Bearer token-2',
		])
	})

	test('a 401 that survives the retry surfaces as LogtoApiError instead of looping', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => token(url) ?? json({ code: 'auth.unauthorized', message: 'Unauthorized.' }, { status: 401 }))

		const exit = await runManagement(
			withApi(api => api.organizationScopes.get('r1', undefined)),
			logto
		)

		expect(failureOf(exit)).toMatchObject({ _tag: 'LogtoApiError', status: 401, isUnauthorized: true })
		expect(logto.apiCalls()).toHaveLength(2)
	})

	test("non-success statuses fail with LogtoApiError carrying Logto's error body", async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto(
			(_, url) =>
				token(url) ??
				json(
					{ code: 'entity.not_exists_with_id', message: 'The scope with ID `nope` does not exist.', data: { id: 'nope' } },
					{ status: 404 }
				)
		)

		const exit = await runManagement(
			withApi(api => api.organizationScopes.get('nope', undefined)),
			logto
		)

		const error = failureOf(exit)
		expect(error).toBeInstanceOf(LogtoApiError)
		expect(error).toMatchObject({
			status: 404,
			code: 'entity.not_exists_with_id',
			message: 'The scope with ID `nope` does not exist.',
			data: { id: 'nope' },
			method: 'GET',
			url: 'https://auth.example.com/api/organization-scopes/nope',
			isNotFound: true,
			isUnauthorized: false,
		})
	})

	test('a non-JSON error body (e.g. from a proxy) still produces a LogtoApiError with the raw text', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => token(url) ?? new Response('<html>Bad Gateway</html>', { status: 502 }))

		const exit = await runManagement(
			withApi(api => api.organizationScopes.list(undefined)),
			logto
		)

		expect(failureOf(exit)).toMatchObject({ _tag: 'LogtoApiError', status: 502, code: undefined, message: '<html>Bad Gateway</html>' })
	})

	test('an empty error body falls back to a status message', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => token(url) ?? new Response(null, { status: 500 }))

		const exit = await runManagement(
			withApi(api => api.organizationScopes.list(undefined)),
			logto
		)

		expect(failureOf(exit)).toMatchObject({ status: 500, message: 'Unexpected status 500' })
	})

	test('a success body that does not match the spec fails with a SchemaError', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => token(url) ?? json([{ id: 42 }]))

		const exit = await runManagement(
			withApi(api => api.organizationScopes.list(undefined)),
			logto
		)

		expect(failureOf(exit)).toMatchObject({ _tag: 'SchemaError' })
	})

	test('path parameters, JSON payloads and 204 responses', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto(
			(request, url) => token(url) ?? (request.method === 'DELETE' ? new Response(null, { status: 204 }) : json(scope('new')))
		)

		const exit = await runManagement(
			withApi(api =>
				Effect.all([
					api.organizationScopes.create({ payload: { name: 'read:reports', description: null } }),
					api.organizationScopes.delete('a b/c', undefined),
				])
			),
			logto
		)

		expect(Exit.isSuccess(exit) && exit.value[0].id).toBe('new')
		const [create, remove] = logto.apiCalls()
		expect([create?.method, create?.url.pathname, JSON.parse(create?.body ?? '')]).toEqual([
			'POST',
			'/api/organization-scopes',
			{ name: 'read:reports', description: null },
		])
		expect([remove?.method, remove?.url.pathname]).toEqual(['DELETE', '/api/organization-scopes/a%20b%2Fc'])
	})

	test('includeResponse returns the raw response alongside the value', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => token(url) ?? json([scope('a')], { headers: { 'Total-Number': '42' } }))

		const exit = await runManagement(
			withApi(api => api.organizationScopes.list({ config: { includeResponse: true } })),
			logto
		)

		expect(Exit.isSuccess(exit) && Pagination.totalOf(exit.value[1])).toEqual(expect.objectContaining({ value: 42 }))
	})

	test('layerConfig reads the options from Config', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => token(url) ?? json([]))

		const layer = LogtoManagement.layerConfig(
			Config.all({
				endpoint: Config.String('LOGTO_ENDPOINT'),
				clientId: Config.String('LOGTO_CLIENT_ID'),
				clientSecret: Config.Redacted('LOGTO_CLIENT_SECRET'),
			}).pipe(
				Config.map(({ endpoint, ...credentials }) => ({ tenant: LogtoTenant.selfHosted({ baseUrl: endpoint }), ...credentials }))
			)
		)

		const exit = await Effect.runPromiseExit(
			withApi(api => api.organizationScopes.list(undefined)).pipe(
				Effect.provide(layer),
				Effect.provide(logto.layer),
				Effect.provide(
					ConfigProvider.layer(
						ConfigProvider.fromUnknown({
							LOGTO_ENDPOINT: 'https://id.internal',
							LOGTO_CLIENT_ID: 'from-config',
							LOGTO_CLIENT_SECRET: 'secret',
						})
					)
				)
			)
		)

		expect(Exit.isSuccess(exit)).toBe(true)
		expect(logto.calls.map(call => call.url.href)).toEqual([
			'https://id.internal/oidc/token',
			'https://id.internal/api/organization-scopes',
		])
		expect(logto.tokenCalls()[0]?.authorization).toBe(`Basic ${btoa('from-config:secret')}`)
	})

	test('a missing config value fails layer construction with a ConfigError', async () => {
		const logto = fakeLogto(() => json([]))
		const layer = LogtoManagement.layerConfig(
			Config.all({ clientId: Config.String('LOGTO_CLIENT_ID'), clientSecret: Config.Redacted('LOGTO_CLIENT_SECRET') }).pipe(
				Config.map(credentials => ({ tenant: LogtoTenant.cloud('abc'), ...credentials }))
			)
		)

		const exit = await Effect.runPromiseExit(
			withApi(api => api.organizationScopes.list(undefined)).pipe(
				Effect.provide(layer),
				Effect.provide(logto.layer),
				Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ LOGTO_CLIENT_ID: 'x' })))
			)
		)

		expect(failureOf(exit)).toMatchObject({ _tag: 'ConfigError' })
		expect(logto.calls).toHaveLength(0)
	})
})
