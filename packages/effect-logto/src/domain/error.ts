import * as Schema from 'effect/Schema'

/**
 * Logto answered with a non-success status.
 *
 * Logto's error body is `{ code, message, data?, details? }` (e.g. `code: "entity.not_exists_with_id"`),
 * which is decoded here when present so callers can branch on `code` rather than on `status` alone.
 */
export class LogtoApiError extends Schema.TaggedError<LogtoApiError>()('LogtoApiError', {
	status: Schema.Number,
	method: Schema.String,
	url: Schema.String,
	code: Schema.optional(Schema.String),
	message: Schema.String,
	data: Schema.optional(Schema.Unknown),
	details: Schema.optional(Schema.String),
}) {
	get isNotFound() {
		return this.status === 404
	}
	get isUnauthorized() {
		return this.status === 401
	}
}

/** Obtaining a Management API access token failed (bad credentials, unreachable token endpoint, …). */
export class LogtoAuthError extends Schema.TaggedError<LogtoAuthError>()('LogtoAuthError', {
	message: Schema.String,
	cause: Schema.optional(Schema.Defect()),
}) {}

/** The `logto-signature-sha-256` header is missing or does not match the request body. */
export class LogtoWebhookSignatureError extends Schema.TaggedError<LogtoWebhookSignatureError>()('LogtoWebhookSignatureError', {
	reason: Schema.Literals(['Missing', 'Mismatch']),
}) {}
