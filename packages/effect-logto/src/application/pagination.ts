import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Stream from 'effect/Stream'
import type * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse'

/** Logto reports the total size of a paginated collection in this response header. */
export const TOTAL_HEADER = 'total-number'

export interface Page {
	readonly page: number
	readonly page_size: number
}

/** The `Total-Number` header of a paginated response, when present. */
export const totalOf = (response: HttpClientResponse.HttpClientResponse): Option.Option<number> =>
	Option.fromNullishOr(response.headers[TOTAL_HEADER]).pipe(
		Option.map(Number),
		Option.filter(total => Number.isSafeInteger(total) && total >= 0)
	)

/**
 * Streams every item of a paginated Logto list, one request per page.
 *
 * ```ts
 * const everyone = paginate((page) => api.users.list({ params: { ...page }, config: { includeResponse: true } }))
 * ```
 *
 * Stops at the page that reaches `Total-Number`, or at the first short page when the header is absent.
 */
export const paginate = <A, E, R>(
	fetchPage: (page: Page) => Effect.Effect<readonly [ReadonlyArray<A>, HttpClientResponse.HttpClientResponse], E, R>,
	options?: { readonly pageSize?: number | undefined }
): Stream.Stream<A, E, R> => {
	const pageSize = options?.pageSize ?? 100
	return Stream.paginate(1, page =>
		Effect.map(fetchPage({ page, page_size: pageSize }), ([items, response]) => {
			const seen = (page - 1) * pageSize + items.length
			const more = Option.match(totalOf(response), {
				onNone: () => items.length === pageSize,
				onSome: total => items.length > 0 && seen < total,
			})
			return [items, more ? Option.some(page + 1) : Option.none()] as const
		})
	)
}
