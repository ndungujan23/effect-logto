import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'

import { WebhookSignatureVerifier } from '../../application/port/webhook-signature-verifier.ts'
import { LogtoWebhookSignatureError } from '../../domain/error.ts'

const encoder = new TextEncoder()

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')

/** Compares without short-circuiting on the first differing character. */
const timingSafeEqual = (a: string, b: string) => {
	let diff = a.length ^ b.length
	for (let index = 0; index < Math.max(a.length, b.length); index++) diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0)
	return diff === 0
}

/**
 * Logto signs `JSON.stringify(payload)` with HMAC-SHA256 and sends the hex digest.
 * Uses Web Crypto, so it runs on Node, Bun, Deno and edge runtimes alike.
 */
export const make = WebhookSignatureVerifier.of({
	verify: Effect.fnUntraced(function* ({ body, signature, signingKey }) {
		if (!signature) return yield* new LogtoWebhookSignatureError({ reason: 'Missing' })

		const expected = yield* Effect.promise(async () => {
			const key = await crypto.subtle.importKey(
				'raw',
				encoder.encode(Redacted.value(signingKey)),
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['sign']
			)
			const data = typeof body === 'string' ? encoder.encode(body) : body
			return hex(await crypto.subtle.sign('HMAC', key, data as Uint8Array<ArrayBuffer>))
		})

		if (!timingSafeEqual(expected, signature.trim().toLowerCase())) return yield* new LogtoWebhookSignatureError({ reason: 'Mismatch' })
	}),
})

export const layer: Layer.Layer<WebhookSignatureVerifier> = Layer.succeed(WebhookSignatureVerifier, make)
