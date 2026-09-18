// Management API
export { LogtoManagement, type LogtoManagementOptions } from './management.ts'
export * as LogtoTenant from './domain/tenant.ts'
export type { LogtoTenant as Tenant, SelfHostedOptions } from './domain/tenant.ts'
export * as ClientCredentials from './infrastructure/auth/client-credentials.ts'
export { AccessTokenProvider } from './application/port/access-token-provider.ts'

// Custom authentication / other API surfaces
export * as LogtoClient from './client.ts'

// Operations and errors
export type * from './application/operation/index.ts'
export type { LogtoError, OperationConfig, WithOptionalResponse } from './application/config.ts'
export { LogtoApiError, LogtoAuthError, LogtoWebhookSignatureError } from './domain/error.ts'

// Extras
export * from './domain/search/index.ts'
export * as Pagination from './application/pagination.ts'
export * as LogtoWebhook from './webhook.ts'
