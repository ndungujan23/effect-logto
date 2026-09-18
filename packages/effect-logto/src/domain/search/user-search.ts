/**
 * Immutable builder for Logto's advanced user search (`GET /api/users`).
 *
 * ```ts
 * // name contains "foo" AND email ends with @gmail.com
 * const search = UserSearch.make()
 *   .field('name', '%foo%')
 *   .field('primaryEmail', '%@gmail.com')
 *   .joint('and')
 *
 * api.users.list({ params: { search_params: search.params } })
 * ```
 *
 * @see https://docs.logto.io/user-management/advanced-user-search
 */
import type { SearchParams } from './search-params.ts'

/** The user columns Logto searches when no field is given. Nested paths (`name.first`) are rejected by Logto. */
export type UserSearchField = 'id' | 'primaryEmail' | 'primaryPhone' | 'username' | 'name' | (string & {})

/**
 * - `like` (default): SQL `LIKE`/`ILIKE`, use `%` wildcards. Matches a single value per field.
 * - `exact`: `=`; the only mode that accepts several values for one field (OR-ed together).
 * - `similar_to`: SQL `SIMILAR TO`; only works together with {@link UserSearch.caseSensitive}.
 * - `posix`: POSIX regular expression.
 */
export type UserSearchMode = 'like' | 'exact' | 'similar_to' | 'posix'

export type UserSearchJoint = 'or' | 'and'

export type UserIdentityLookup =
	/** A social connector identity; `provider` is the connector target, e.g. `github`. */
	| { readonly type: 'social'; readonly provider: string; readonly id: string }
	/** An enterprise SSO identity; `provider` is the IdP issuer URL. */
	| { readonly type: 'sso'; readonly provider: string; readonly id: string }

export class UserSearch {
	private constructor(readonly params: ReadonlyArray<readonly [string, string]>) {}

	static make(): UserSearch {
		return new UserSearch([])
	}

	private with(...entries: ReadonlyArray<readonly [string, string]>): UserSearch {
		return new UserSearch([...this.params, ...entries])
	}

	/** Search every searchable field (`search=`). Defaults to `like` mode, so include `%` wildcards. */
	keyword(value: string, options?: { readonly mode?: UserSearchMode }): UserSearch {
		return this.with(['search', value], ...(options?.mode ? [['mode', options.mode] as const] : []))
	}

	/** Search one field (`search.<field>=`), optionally overriding the match mode for that field only. */
	field(field: UserSearchField, value: string, options?: { readonly mode?: UserSearchMode }): UserSearch
	/** Match any of several exact values for one field. Logto only allows multiple values in `exact` mode. */
	field(field: UserSearchField, values: ReadonlyArray<string>, options: { readonly mode: 'exact' }): UserSearch
	field(field: UserSearchField, value: string | ReadonlyArray<string>, options?: { readonly mode?: UserSearchMode }): UserSearch {
		const values = typeof value === 'string' ? [value] : value
		return this.with(
			...values.map(item => [`search.${field}`, item] as const),
			...(options?.mode ? [[`mode.${field}`, options.mode] as const] : [])
		)
	}

	/** Default match mode for every keyword that doesn't override it (`mode=`). */
	mode(mode: UserSearchMode): UserSearch {
		return this.with(['mode', mode])
	}

	/** How several conditions combine (`joint=`). Logto defaults to `or`. */
	joint(joint: UserSearchJoint): UserSearch {
		return this.with(['joint', joint])
	}

	/** Make every condition case-sensitive (`isCaseSensitive=true`). This is global, not per field. */
	caseSensitive(): UserSearch {
		return this.with(['isCaseSensitive', 'true'])
	}

	/** Exact lookup of the user linked to an external identity; AND-ed with any other condition. */
	identity(lookup: UserIdentityLookup): UserSearch {
		return this.with(['identityType', lookup.type], ['identityProvider', lookup.provider], ['identityId', lookup.id])
	}

	/** The raw search parameters, for `search_params`. */
	toSearchParams(): SearchParams {
		return this.params
	}
}
