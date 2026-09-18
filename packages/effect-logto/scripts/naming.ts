/**
 * Turns Logto's flat operation ids into a resource tree:
 *
 *   tag "Applications"       + ListApplicationRoles  -> applications.listRoles
 *   tag "Organization roles" + ListOrganizationRoles -> organizationRoles.list
 *
 * and names each operation's schemas after the method they belong to:
 *
 *   ListApplicationRolesParams -> Applications.ListRolesParams
 *   CreateApplication200       -> Applications.CreateResponse
 */

const words = (value: string) => value.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) ?? []

const pascal = (value: string) =>
	value
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean)
		.map(part => part[0].toUpperCase() + part.slice(1))
		.join('')

const camel = (value: string) => {
	const name = pascal(value)
	return name[0].toLowerCase() + name.slice(1)
}

/** Explicit names where the heuristic below produces something unhelpful. */
const resourceOverrides: Record<string, string> = {
	CIMD: 'cimd',
	'Swagger.json': 'swagger',
	'SSO connectors': 'ssoConnectors',
	'SSO connector providers': 'ssoConnectorProviders',
	'SAML applications': 'samlApplications',
	'SAML applications auth flow': 'samlApplicationsAuthFlow',
}

export const resourceKey = (tag: string) => resourceOverrides[tag] ?? camel(tag)

/** kebab-case file name for a resource key. */
export const fileName = (key: string) => key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

const singular = (word: string) => word.toLowerCase().replace(/ies$/, 'y').replace(/s$/, '')
const same = (a: string, b: string) => singular(a) === singular(b)

/** Removes the tag's noun (fully, or just its head noun) from the front of an operation id's object. */
const stripNoun = (object: ReadonlyArray<string>, noun: ReadonlyArray<string>): ReadonlyArray<string> => {
	const candidates = [noun, noun.slice(-1)]
	for (const candidate of candidates) {
		if (candidate.length === 0 || candidate.length > object.length) continue
		if (candidate.every((word, index) => same(word, object[index]))) return object.slice(candidate.length)
	}
	return object
}

/** Explicit method names, keyed by operation id. */
const methodOverrides: Record<string, string> = { DeleteEmailTemplates: 'deleteMany', GetSignInExp: 'get', UpdateSignInExp: 'update' }

export const methodName = (operationId: string, tag: string): string => {
	if (methodOverrides[operationId]) return methodOverrides[operationId]
	const [verb, ...object] = words(operationId)
	const noun = tag.split(/[\s-]+/).flatMap(part => words(pascal(part)))
	const rest = stripNoun(object, noun)
	return camel([verb, ...rest].join(' '))
}

export type SchemaRole =
	| { readonly kind: 'params' }
	| { readonly kind: 'payload'; readonly encoding: 'Json' | 'FormData' | 'FormUrlEncoded' }
	| { readonly kind: 'response'; readonly status: string }

/** Splits `CreateApplicationRequestJson` into its operation id and role, when it is an operation schema. */
export const parseSchemaName = (name: string, operationIds: ReadonlySet<string>): { operationId: string; role: SchemaRole } | undefined => {
	const match = /^(.*?)(Params|RequestJson|RequestFormData|RequestFormUrlEncoded|\d{3})$/.exec(name)
	if (!match || !operationIds.has(match[1])) return undefined
	const [, operationId, suffix] = match
	if (suffix === 'Params') return { operationId, role: { kind: 'params' } }
	if (suffix.startsWith('Request')) {
		return { operationId, role: { kind: 'payload', encoding: suffix.slice('Request'.length) as 'Json' } }
	}
	return { operationId, role: { kind: 'response', status: suffix } }
}

export const schemaName = (method: string, role: SchemaRole, responseCount: number) => {
	const base = pascal(method)
	switch (role.kind) {
		case 'params':
			return `${base}Params`
		case 'payload':
			return role.encoding === 'Json' ? `${base}Payload` : `${base}${role.encoding}`
		case 'response':
			return responseCount > 1 ? `${base}Response${role.status}` : `${base}Response`
	}
}

export const typeName = (key: string) => pascal(key)
