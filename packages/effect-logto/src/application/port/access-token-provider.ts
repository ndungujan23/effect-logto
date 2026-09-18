import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import type * as Redacted from 'effect/Redacted'

import type { LogtoAuthError } from '../../domain/error.ts'

/** Supplies bearer tokens for Logto API calls. */
export class AccessTokenProvider extends Context.Service<
	AccessTokenProvider,
	{
		/** A currently valid access token, fetched or refreshed as needed. */
		readonly get: Effect.Effect<Redacted.Redacted<string>, LogtoAuthError>
		/** Drop any cached token, e.g. after Logto rejected it with `401`. */
		readonly invalidate: Effect.Effect<void>
	}
>()('effect-logto/AccessTokenProvider') {}
