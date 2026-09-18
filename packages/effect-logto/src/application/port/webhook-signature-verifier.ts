import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import type * as Redacted from 'effect/Redacted'

import type { LogtoWebhookSignatureError } from '../../domain/error.ts'

export interface WebhookSignatureInput {
	/** The request body exactly as received — never a re-serialised parsed body. */
	readonly body: string | Uint8Array
	/** Value of the `logto-signature-sha-256` header. */
	readonly signature: string | null | undefined
	/** The webhook's signing key from Logto Console › Webhooks. */
	readonly signingKey: Redacted.Redacted<string>
}

/** Checks that a webhook request was signed by Logto. */
export class WebhookSignatureVerifier extends Context.Service<
	WebhookSignatureVerifier,
	{ readonly verify: (input: WebhookSignatureInput) => Effect.Effect<void, LogtoWebhookSignatureError> }
>()('effect-logto/WebhookSignatureVerifier') {}
