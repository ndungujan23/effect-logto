import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Redacted from 'effect/Redacted'
import * as TestClock from 'effect/testing/TestClock'
import { describe, expect, test } from 'vitest'

import { AccessTokenProvider, ClientCredentials, LogtoAuthError, LogtoTenant } from '../src/index.ts'
import { failureOf, fakeLogto, json, tokenEndpoint } from './support/fake-logto.ts'

const options = { tenant: LogtoTenant.cloud('abc123'), clientId: 'm2m', clientSecret: Redacted.make('shh') }

const tokenValue = Effect.gen(function* () {
	const tokens = yield* AccessTokenProvider
	return Redacted.value(yield* tokens.get)
})

describe('ClientCredentials', () => {
	test('reuses the token until `refreshBefore` the expiry, then fetches a new one', async () => {
		const token = tokenEndpoint({ expiresIn: 3600 })
		const scripted = fakeLogto((_, url) => token(url) ?? json({}, { status: 404 }))

		const exit = await Effect.runPromiseExit(
			Effect.gen(function* () {
				const first = yield* tokenValue
				yield* TestClock.adjust('3539 seconds')
				const stillCached = yield* tokenValue
				yield* TestClock.adjust('2 seconds')
				const refreshed = yield* tokenValue
				return [first, stillCached, refreshed]
			}).pipe(
				Effect.provide(ClientCredentials.layer({ ...options, refreshBefore: '60 seconds' })),
				Effect.provide(scripted.layer),
				Effect.provide(TestClock.layer())
			)
		)

		expect(Exit.isSuccess(exit) && exit.value).toEqual(['token-1', 'token-1', 'token-2'])
		expect(scripted.tokenCalls()).toHaveLength(2)
	})

	test('targets the cloud token endpoint with the tenant API indicator and a custom scope', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => token(url) ?? json({}, { status: 404 }))

		await Effect.runPromise(
			tokenValue.pipe(Effect.provide(ClientCredentials.layer({ ...options, scope: 'all read:users' })), Effect.provide(logto.layer))
		)

		const [call] = logto.tokenCalls()
		expect(call?.url.href).toBe('https://abc123.logto.app/oidc/token')
		expect(Object.fromEntries(new URLSearchParams(call?.body))).toEqual({
			grant_type: 'client_credentials',
			resource: 'https://abc123.logto.app/api',
			scope: 'all read:users',
		})
	})

	test('concurrent callers share one in-flight token request', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => Effect.as(Effect.sleep('50 millis'), token(url) ?? json({}, { status: 404 })))

		const exit = await Effect.runPromiseExit(
			Effect.all(
				Array.from({ length: 10 }, () => tokenValue),
				{ concurrency: 'unbounded' }
			).pipe(Effect.provide(ClientCredentials.layer(options)), Effect.provide(logto.layer))
		)

		expect(Exit.isSuccess(exit) && new Set(exit.value)).toEqual(new Set(['token-1']))
		expect(logto.tokenCalls()).toHaveLength(1)
	})

	test('invalidate forces the next call to fetch a fresh token', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => token(url) ?? json({}, { status: 404 }))

		const exit = await Effect.runPromiseExit(
			Effect.gen(function* () {
				const tokens = yield* AccessTokenProvider
				const first = yield* tokenValue
				yield* tokens.invalidate
				return [first, yield* tokenValue]
			}).pipe(Effect.provide(ClientCredentials.layer(options)), Effect.provide(logto.layer))
		)

		expect(Exit.isSuccess(exit) && exit.value).toEqual(['token-1', 'token-2'])
	})

	test('retries a failing token endpoint twice, then fails with LogtoAuthError and caches nothing', async () => {
		let attempts = 0
		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) =>
			++attempts <= 3 ? json({ error: 'invalid_client' }, { status: 401 }) : (token(url) ?? json({}, { status: 404 }))
		)

		const exit = await Effect.runPromiseExit(
			Effect.gen(function* () {
				const fiber = yield* Effect.forkChild(Effect.exit(tokenValue))
				yield* TestClock.adjust('10 seconds')
				const failed = yield* Fiber.join(fiber)
				return [failed, yield* tokenValue] as const
			}).pipe(Effect.provide(ClientCredentials.layer(options)), Effect.provide(logto.layer), Effect.provide(TestClock.layer()))
		)

		expect(Exit.isSuccess(exit)).toBe(true)
		if (!Exit.isSuccess(exit)) return
		const [failed, recovered] = exit.value
		const error = failureOf(failed)
		expect(error).toBeInstanceOf(LogtoAuthError)
		expect(error?.message).toBe('Could not obtain a Logto access token from https://abc123.logto.app/oidc/token')
		expect(recovered).toBe('token-1')
		expect(attempts).toBe(4)
	})

	test('a malformed token response is an auth error, not a defect', async () => {
		const logto = fakeLogto(() => json({ token: 'nope' }))

		const exit = await Effect.runPromiseExit(
			Effect.gen(function* () {
				const fiber = yield* Effect.forkChild(tokenValue)
				yield* TestClock.adjust('10 seconds')
				return yield* Fiber.join(fiber)
			}).pipe(Effect.provide(ClientCredentials.layer(options)), Effect.provide(logto.layer), Effect.provide(TestClock.layer()))
		)

		expect(failureOf(exit)).toBeInstanceOf(LogtoAuthError)
	})

	test('never exposes the client secret when the options are logged', () => {
		expect(String(options.clientSecret)).not.toContain('shh')
		expect(JSON.stringify(options)).not.toContain('shh')
	})
})
