/**
 * Receiving Logto webhooks: signature verification + typed payloads.
 *
 * ```ts
 * const payload = yield* LogtoWebhook.receive({
 *   body: rawBody,                                       // the raw request body, not re-serialised JSON
 *   signature: headers[LogtoWebhook.SIGNATURE_HEADER],
 *   signingKey: Redacted.make(process.env.LOGTO_WEBHOOK_SIGNING_KEY!),
 * }).pipe(Effect.provide(LogtoWebhook.layer))
 *
 * switch (payload.event) {
 *   case 'User.Created': payload.data.primaryEmail; break
 *   case 'Organization.Membership.Updated': payload.addedUserIds; break
 * }
 * ```
 */
export { WebhookSignatureVerifier, type WebhookSignatureInput } from './application/port/webhook-signature-verifier.ts'
export { receiveWebhook as receive, SIGNATURE_HEADER } from './application/webhook/receive-webhook.ts'
export { LogtoWebhookSignatureError } from './domain/error.ts'
export * from './domain/webhook/index.ts'
/** HMAC-SHA256 verifier backed by Web Crypto. */
export { layer } from './infrastructure/webhook/hmac-signature-verifier.ts'
