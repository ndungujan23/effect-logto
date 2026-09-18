import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import type { LogtoWebhookSignatureError } from '../../domain/error.ts'
import { WebhookPayload } from '../../domain/webhook/payload.ts'
import { type WebhookSignatureInput, WebhookSignatureVerifier } from '../port/webhook-signature-verifier.ts'

/** The header Logto signs every delivery with. */
export const SIGNATURE_HEADER = 'logto-signature-sha-256'

const decodeBody = Schema.decodeUnknownEffect(Schema.fromJsonString(WebhookPayload))

/**
 * Verifies a delivery's signature, then decodes its body.
 *
 * Signature first: nothing from an unauthenticated body is parsed. Narrow the result with
 * `payload.event`, or pass `schema` to accept only one family (e.g. `DataPayload`).
 */
export const receiveWebhook: {
	(input: WebhookSignatureInput): Effect.Effect<WebhookPayload, LogtoWebhookSignatureError | Schema.SchemaError, WebhookSignatureVerifier>
	<S extends Schema.Codec<any, any>>(
		input: WebhookSignatureInput,
		schema: S
	): Effect.Effect<S['Type'], LogtoWebhookSignatureError | Schema.SchemaError, WebhookSignatureVerifier>
} = Effect.fnUntraced(function* (input: WebhookSignatureInput, schema?: Schema.Codec<any, any>) {
	const verifier = yield* WebhookSignatureVerifier
	yield* verifier.verify(input)
	const text = typeof input.body === 'string' ? input.body : new TextDecoder().decode(input.body)
	return yield* schema ? Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(text) : decodeBody(text)
}) as any
