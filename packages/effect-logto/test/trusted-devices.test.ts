import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import { describe, expect, test } from 'vitest'

import { LogtoClient } from '../src/index.ts'
import { fakeLogto, json, runManagement, tokenEndpoint, withApi } from './support/fake-logto.ts'

const device = (id: string) => ({
	id,
	userAgent: 'Mozilla/5.0',
	country: 'KE',
	city: null,
	createdAt: 1_700_000_000_000,
	lastUsedAt: 1_700_000_100_000,
	expiresAt: 1_702_000_000_000,
})

describe('trusted devices', () => {
	test('users.listTrustedDevices decodes the devices of a user', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => token(url) ?? json([device('td-1')]))

		const exit = await runManagement(
			withApi(api => api.users.listTrustedDevices('user-1', undefined)),
			logto
		)

		expect(Exit.isSuccess(exit) && exit.value).toEqual([device('td-1')])
		expect(logto.apiCalls().map(call => `${call.method} ${call.url.pathname}`)).toEqual(['GET /api/users/user-1/trusted-devices'])
	})

	test('users.deleteTrustedDevice encodes both ids into the path', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => token(url) ?? new Response(null, { status: 204 }))

		const exit = await runManagement(
			withApi(api => api.users.deleteTrustedDevice('user/1', 'td 1', undefined)),
			logto
		)

		expect(Exit.isSuccess(exit)).toBe(true)
		expect(logto.apiCalls().map(call => `${call.method} ${call.url.pathname}`)).toEqual([
			'DELETE /api/users/user%2F1/trusted-devices/td%201',
		])
	})

	test('account.myAccount lists and deletes the own trusted devices of the caller', async () => {
		const logto = fakeLogto(request =>
			request.method === 'GET' ? json([{ ...device('td-2'), isCurrent: true }]) : new Response(null, { status: 204 })
		)

		const exit = await Effect.runPromiseExit(
			Effect.gen(function* () {
				const client = (yield* HttpClient.HttpClient).pipe(
					HttpClient.mapRequest(HttpClientRequest.prependUrl('https://auth.example.com')),
					HttpClient.mapRequest(HttpClientRequest.bearerToken('user-access-token'))
				)
				const { account } = LogtoClient.fromHttpClient(client)
				const devices = yield* account.myAccount.getTrustedDevices(undefined)
				yield* account.myAccount.deleteTrustedDeviceById(devices[0]!.id, undefined)
				return devices
			}).pipe(Effect.provide(logto.layer))
		)

		expect(Exit.isSuccess(exit) && exit.value).toEqual([{ ...device('td-2'), isCurrent: true }])
		expect(logto.calls.map(call => `${call.method} ${call.url.pathname} ${call.authorization}`)).toEqual([
			'GET /api/my-account/trusted-devices Bearer user-access-token',
			'DELETE /api/my-account/trusted-devices/td-2 Bearer user-access-token',
		])
	})
})
