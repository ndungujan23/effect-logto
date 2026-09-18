import { createHmac } from 'node:crypto'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Redacted from 'effect/Redacted'
import { describe, expect, test } from 'vitest'

import { LogtoWebhook } from '../src/index.ts'
import * as Webhook from '../src/webhook.ts'
import { failureOf } from './support/fake-logto.ts'

const signingKey = 'whsec_test'
/** Signs the way Logto does: hex HMAC-SHA256 of the exact body, computed with node:crypto as an independent oracle. */
const sign = (body: string | Uint8Array) => createHmac('sha256', signingKey).update(body).digest('hex')

const user = {
	id: 'u1',
	username: null,
	primaryEmail: 'a@example.com',
	primaryPhone: null,
	name: 'Alice',
	avatar: null,
	customData: {},
	identities: {},
	lastSignInAt: null,
	createdAt: 1_700_000_000_000,
	updatedAt: 1_700_000_000_000,
	profile: {},
	applicationId: null,
	cimdClientId: null,
	isSuspended: false,
}

const base = { hookId: 'hook_1', createdAt: '2026-09-17T00:00:00.000Z', userAgent: 'Mozilla/5.0' }

const receive = (payload: unknown, signature?: string) => {
	const body = JSON.stringify(payload)
	return Effect.runPromiseExit(
		LogtoWebhook.receive({ body, signature: signature ?? sign(body), signingKey: Redacted.make(signingKey) }).pipe(
			Effect.provide(LogtoWebhook.layer)
		)
	)
}

describe('LogtoWebhook.receive', () => {
	test('decodes a User.Deleted delivery, which carries the deleted user', async () => {
		const exit = await receive({
			...base,
			event: 'User.Deleted',
			ip: '10.0.0.1',
			path: '/users/u1',
			method: 'DELETE',
			status: 204,
			data: user,
		})
		expect(Exit.isSuccess(exit) && exit.value.event === 'User.Deleted' && exit.value.data?.id).toBe('u1')
	})

	test.each([
		{
			...base,
			event: 'PostSignIn',
			interactionEvent: 'SignIn',
			sessionId: 's1',
			userIp: '1.1.1.1',
			userId: 'u1',
			user,
			application: { id: 'app', type: 'SPA', name: 'Web', description: null },
		},
		{
			...base,
			event: 'Organization.Membership.Updated',
			matchedRoute: '/organizations/:id/users',
			organizationId: 'org_1',
			addedUserIds: ['u1'],
		},
		{ ...base, event: 'User.Data.Updated', matchedRoute: '/users/:userId/custom-data', data: { theme: 'dark' } },
		{ ...base, event: 'Role.Deleted' },
		{ ...base, event: 'Identifier.Lockout', ip: '1.1.1.1', interactionEvent: 'SignIn', type: 'email', value: 'a@example.com' },
		{
			...base,
			event: 'Grant.LimitExceeded',
			userId: 'u1',
			applicationId: 'app',
			maxAllowedGrants: 2,
			preRevocationActiveGrantCount: 3,
			revokedGrantIds: ['g1'],
		},
	])('decodes a $event delivery', async delivery => {
		const exit = await receive(delivery)
		expect(Exit.isSuccess(exit) && exit.value.event).toBe(delivery.event)
	})

	test('rejects the retired `Partner.*` events', async () => {
		const exit = await receive({ ...base, event: 'Partner.Created', data: { id: 'o1' } })
		expect(failureOf(exit)).toMatchObject({ _tag: 'SchemaError' })
	})

	test('rejects a tampered body before decoding it', async () => {
		const body = JSON.stringify({ ...base, event: 'Role.Deleted' })
		const exit = await Effect.runPromiseExit(
			LogtoWebhook.receive({
				body: body.replace('hook_1', 'hook_2'),
				signature: sign(body),
				signingKey: Redacted.make(signingKey),
			}).pipe(Effect.provide(LogtoWebhook.layer))
		)
		expect(failureOf(exit)).toMatchObject({ _tag: 'LogtoWebhookSignatureError', reason: 'Mismatch' })
	})

	test('checks the signature before parsing, so a signed-looking junk body is a signature error, not a parse error', async () => {
		const exit = await Effect.runPromiseExit(
			LogtoWebhook.receive({ body: 'not json', signature: 'ab'.repeat(32), signingKey: Redacted.make(signingKey) }).pipe(
				Effect.provide(LogtoWebhook.layer)
			)
		)
		expect(failureOf(exit)).toMatchObject({ _tag: 'LogtoWebhookSignatureError', reason: 'Mismatch' })
	})

	test.each([
		['empty', ''],
		['null', null],
		['undefined', undefined],
	])('rejects a delivery with a %s signature', async (_, signature) => {
		const body = JSON.stringify({ ...base, event: 'Role.Deleted' })
		const exit = await Effect.runPromiseExit(
			LogtoWebhook.receive({ body, signature, signingKey: Redacted.make(signingKey) }).pipe(Effect.provide(LogtoWebhook.layer))
		)
		expect(failureOf(exit)).toMatchObject({ _tag: 'LogtoWebhookSignatureError', reason: 'Missing' })
	})

	test('rejects a signature made with a different key, and a truncated one', async () => {
		const body = JSON.stringify({ ...base, event: 'Role.Deleted' })
		const wrongKey = createHmac('sha256', 'other').update(body).digest('hex')
		for (const signature of [wrongKey, sign(body).slice(0, 63)]) {
			const exit = await receive({ ...base, event: 'Role.Deleted' }, signature)
			expect(failureOf(exit)).toMatchObject({ reason: 'Mismatch' })
		}
	})

	test('accepts a Uint8Array body and an upper-case, whitespace-padded signature', async () => {
		const bytes = new TextEncoder().encode(JSON.stringify({ ...base, event: 'Role.Deleted' }))
		const exit = await Effect.runPromiseExit(
			LogtoWebhook.receive({ body: bytes, signature: ` ${sign(bytes).toUpperCase()}\n`, signingKey: Redacted.make(signingKey) }).pipe(
				Effect.provide(LogtoWebhook.layer)
			)
		)
		expect(Exit.isSuccess(exit) && exit.value.event).toBe('Role.Deleted')
	})

	test('a custom schema narrows the accepted payloads', async () => {
		const body = JSON.stringify({ ...base, event: 'Role.Deleted' })
		const run = (schema: typeof Webhook.InteractionPayload) =>
			Effect.runPromiseExit(
				LogtoWebhook.receive({ body, signature: sign(body), signingKey: Redacted.make(signingKey) }, schema).pipe(
					Effect.provide(LogtoWebhook.layer)
				)
			)
		expect(failureOf(await run(Webhook.InteractionPayload))).toMatchObject({ _tag: 'SchemaError' })
	})

	test('the verifier is a swappable port', async () => {
		const exit = await Effect.runPromiseExit(
			LogtoWebhook.receive({
				body: JSON.stringify({ ...base, event: 'Role.Deleted' }),
				signature: 'x',
				signingKey: Redacted.make('k'),
			}).pipe(Effect.provideService(LogtoWebhook.WebhookSignatureVerifier, { verify: () => Effect.void }))
		)
		expect(Exit.isSuccess(exit)).toBe(true)
	})
})

describe('webhook events', () => {
	test('SIGNATURE_HEADER matches what Logto sends', () => {
		expect(LogtoWebhook.SIGNATURE_HEADER).toBe('logto-signature-sha-256')
	})

	test('event guards partition every event into exactly one family', () => {
		for (const event of LogtoWebhook.HookEvent.literals) {
			const families = [LogtoWebhook.isInteractionEvent(event), LogtoWebhook.isDataEvent(event), LogtoWebhook.isExceptionEvent(event)]
			expect({ event, families: families.filter(Boolean).length }).toEqual({ event, families: 1 })
		}
		expect(LogtoWebhook.isDataEvent('Partner.Created')).toBe(false)
	})
})
