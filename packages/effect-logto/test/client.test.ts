import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import { describe, expect, test } from 'vitest'

import { LogtoClient } from '../src/index.ts'
import { fakeLogto, json } from './support/fake-logto.ts'

describe('LogtoClient.fromHttpClient', () => {
	test('exposes every API surface over a caller-authenticated client', async () => {
		const logto = fakeLogto((_, url) => (url.pathname === '/api/status' ? new Response(null, { status: 204 }) : json({ id: 'u1' })))

		const exit = await Effect.runPromiseExit(
			Effect.gen(function* () {
				const client = (yield* HttpClient.HttpClient).pipe(
					HttpClient.mapRequest(HttpClientRequest.prependUrl('https://auth.example.com')),
					HttpClient.mapRequest(HttpClientRequest.bearerToken('user-access-token'))
				)
				const apis = LogtoClient.fromHttpClient(client)
				yield* apis.public.status.get(undefined)
				return Object.keys(apis)
			}).pipe(Effect.provide(logto.layer))
		)

		expect(Exit.isSuccess(exit) && exit.value).toEqual(['management', 'account', 'experience', 'public'])
		expect(logto.calls.map(call => [call.url.href, call.authorization])).toEqual([
			['https://auth.example.com/api/status', 'Bearer user-access-token'],
		])
	})

	test('surfaces are split by the token each one needs', () => {
		const apis = LogtoClient.fromHttpClient(HttpClient.make(() => Effect.die('unused')))
		expect(Object.keys(apis.account).sort()).toEqual(['myAccount', 'verifications'])
		expect(Object.keys(apis.experience)).toEqual(['experience'])
		expect(apis.management).toHaveProperty('users')
		expect(apis.management).not.toHaveProperty('myAccount')
	})
})
