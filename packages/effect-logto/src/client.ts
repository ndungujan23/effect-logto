/**
 * Building blocks for callers that authenticate some other way (an end-user access token for
 * the Account API, a personal access token, a pre-configured `HttpClient`, …).
 *
 * ```ts
 * const account = LogtoClient.fromHttpClient(
 *   httpClient.pipe(
 *     HttpClient.mapRequest(HttpClientRequest.prependUrl('https://auth.example.com')),
 *     HttpClient.mapRequest(HttpClientRequest.bearerToken(userAccessToken)),
 *   ),
 * ).account
 *
 * const profile = yield* account.myAccount.getProfile(undefined)
 * ```
 */
import type * as HttpClient from 'effect/unstable/http/HttpClient'

import type { LogtoAccountApi, LogtoExperienceApi, LogtoManagementApi, LogtoPublicApi } from './application/operation/index.ts'
import { makeAccountApi, makeExperienceApi, makeManagementApi, makePublicApi } from './infrastructure/http/operation/index.ts'
import { makeTransport } from './infrastructure/http/transport.ts'

export interface LogtoApis {
	readonly management: LogtoManagementApi
	readonly account: LogtoAccountApi
	readonly experience: LogtoExperienceApi
	readonly public: LogtoPublicApi
}

/** Every Logto API surface over a client that is already rooted at the Logto endpoint and authenticated. */
export const fromHttpClient = (httpClient: HttpClient.HttpClient.With<any, never>): LogtoApis => {
	const transport = makeTransport(httpClient)
	return {
		management: makeManagementApi(transport),
		account: makeAccountApi(transport),
		experience: makeExperienceApi(transport),
		public: makePublicApi(transport),
	}
}
