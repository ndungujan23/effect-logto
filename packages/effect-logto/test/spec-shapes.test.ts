/**
 * Regressions for places where Logto's published OpenAPI document disagrees with what a real
 * tenant sends. Each case here failed against a live instance before `scripts/spec.ts` patched
 * the spec; they are pinned offline so CI catches a regeneration that loses the fix.
 *
 * `scripts/live-check.ts` is the counterpart that re-checks these against a real Logto.
 */
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { describe, expect, test } from 'vitest'

import * as Applications from '../src/domain/schema/applications.ts'
import * as Connectors from '../src/domain/schema/connectors.ts'
import * as Hooks from '../src/domain/schema/hooks.ts'
import * as Users from '../src/domain/schema/users.ts'

/** The element schema of a `Schema.Array(...)` list response. */
const element = (schema: any) => schema.value

const accepts = (schema: Schema.Codec<any, any>, value: unknown) => Result.isSuccess(Schema.decodeUnknownResult(schema)(value))

describe('nullable enums (OpenAPI 3.0 `nullable: true` beside `enum`)', () => {
	test.each([
		['connector platform', element(Connectors.ListResponse).fields.platform, 'Web'],
		['hook event (legacy single-event field)', element(Hooks.ListResponse).fields.event, 'User.Created'],
		['user passwordAlgorithm', Users.GetResponse.fields.passwordAlgorithm, 'Argon2id'],
	])('%s accepts null as well as its literals', (_, schema, literal) => {
		// Logto sends null here: `platform` for non-social connectors, `event` for hooks using `events`,
		// `passwordAlgorithm` for users without a password.
		expect(accepts(schema, null)).toBe(true)
		expect(accepts(schema, literal)).toBe(true)
		expect(accepts(schema, 'NotAValidValue')).toBe(false)
	})
})

describe('redirect URI lists', () => {
	const { redirectUris, postLogoutRedirectUris } = element(Applications.ListResponse).fields.oidcClientMetadata.fields

	test.each([
		['redirectUris', redirectUris],
		['postLogoutRedirectUris', postLogoutRedirectUris],
	])('%s is an array of strings, not of objects', (_, schema) => {
		// The spec types the item as `{ type: 'object', description: 'Validator function' }`,
		// a placeholder left behind by Logto's zod-to-OpenAPI step.
		expect(accepts(schema, ['https://app.example.com/callback'])).toBe(true)
		expect(accepts(schema, [])).toBe(true)
		expect(accepts(schema, [{ url: 'https://app.example.com/callback' }])).toBe(false)
	})
})
