import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import type * as HttpClient from 'effect/unstable/http/HttpClient'
import type * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse'

import type { OperationConfig } from '../../application/config.ts'
import { LogtoApiError } from '../../domain/error.ts'
import { type SearchParams, toEntries } from '../../domain/search/search-params.ts'

/** The helpers every generated operation adapter is built from. */
export interface Transport {
	readonly withResponse: <Config extends OperationConfig>(
		config: Config | undefined
	) => (
		f: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<any, any>
	) => (request: HttpClientRequest.HttpClientRequest) => Effect.Effect<any, any>
	readonly decodeSuccess: <S extends Schema.Constraint>(
		schema: S
	) => (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<any, any>
	readonly unexpectedStatus: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<never, LogtoApiError>
	readonly searchParams: (params: SearchParams | undefined) => ReadonlyArray<readonly [string, string]>
}

/** Logto's `RequestError` body. */
const ErrorBody = Schema.Struct({
	code: Schema.optionalKey(Schema.String),
	message: Schema.optionalKey(Schema.String),
	data: Schema.optionalKey(Schema.Unknown),
	details: Schema.optionalKey(Schema.String),
})
const decodeErrorBody = Schema.decodeUnknownOption(ErrorBody)

const unexpectedStatus = (response: HttpClientResponse.HttpClientResponse) =>
	response.text.pipe(
		Effect.orElseSucceed(() => ''),
		Effect.flatMap(text => {
			let json: unknown
			try {
				json = text ? JSON.parse(text) : undefined
			} catch {
				json = undefined
			}
			const body = decodeErrorBody(json)
			return Effect.fail(
				new LogtoApiError({
					status: response.status,
					method: response.request.method,
					url: response.request.url,
					code: body._tag === 'Some' ? body.value.code : undefined,
					message: (body._tag === 'Some' ? body.value.message : undefined) ?? (text || `Unexpected status ${response.status}`),
					data: body._tag === 'Some' ? body.value.data : undefined,
					details: body._tag === 'Some' ? body.value.details : undefined,
				})
			)
		})
	)

/** Builds the transport for a client whose requests are already authenticated and rooted at the Logto endpoint. */
export const makeTransport = (httpClient: HttpClient.HttpClient.With<any, never>): Transport => ({
	withResponse: config => f => request =>
		Effect.flatMap(
			httpClient.execute(request),
			config?.includeResponse ? response => Effect.map(f(response), value => [value, response]) : f
		),
	decodeSuccess: schema => response => HttpClientResponse.schemaBodyJson(schema)(response) as Effect.Effect<any, any>,
	unexpectedStatus,
	searchParams: toEntries,
})
