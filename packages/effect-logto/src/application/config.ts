import type * as Schema from 'effect/Schema'
import type * as HttpClientError from 'effect/unstable/http/HttpClientError'
import type * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse'

import type { LogtoApiError, LogtoAuthError } from '../domain/error.ts'

export interface OperationConfig {
	/**
	 * Return `[value, response]` instead of just the decoded value — e.g. to read Logto's
	 * `Total-Number` pagination header.
	 */
	readonly includeResponse?: boolean | undefined
}

/** `A`, or `[A, HttpClientResponse]` when the operation was called with `includeResponse: true`. */
export type WithOptionalResponse<A, Config extends OperationConfig> = Config extends { readonly includeResponse: true }
	? [A, HttpClientResponse.HttpClientResponse]
	: A

/**
 * Everything a Logto operation can fail with:
 *
 * - `LogtoApiError` — Logto answered with a non-success status.
 * - `LogtoAuthError` — no access token could be obtained.
 * - `HttpClientError` — transport failure (DNS, connection reset, …).
 * - `SchemaError` — the response did not match the spec.
 */
export type LogtoError = LogtoApiError | LogtoAuthError | HttpClientError.HttpClientError | Schema.SchemaError
