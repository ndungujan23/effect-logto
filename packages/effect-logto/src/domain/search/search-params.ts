import * as Schema from 'effect/Schema'

/**
 * The value of a list endpoint's `search_params`.
 *
 * Logto's search keys are repeatable (`search.name=Alice&search.name=Bob`), which a plain
 * record cannot express, so an ordered list of entries is accepted as well. Build one with
 * {@link import('./user-search.ts').UserSearch}.
 */
export type SearchParams = { readonly [key: string]: string } | ReadonlyArray<readonly [string, string]>
export const SearchParams: Schema.Codec<SearchParams> = Schema.Union([
	Schema.Record(Schema.String, Schema.String),
	Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
])

/** Normalises {@link SearchParams} into URL entries, preserving order and repeated keys. */
export const toEntries = (params: SearchParams | undefined): ReadonlyArray<readonly [string, string]> => {
	if (!params) return []
	return Array.isArray(params) ? params : Object.entries(params)
}
