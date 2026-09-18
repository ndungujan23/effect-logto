/**
 * Loading and normalising the Logto OpenAPI document before it reaches the Effect generator.
 *
 * Logto's published spec has a few quirks that the JSON-Schema importer rejects outright;
 * each fix below is narrow and documented so it can be dropped once upstream is fixed.
 */

type Json = null | boolean | number | string | ReadonlyArray<Json> | { [key: string]: Json }
type Node = Record<string, any>

export const fetchSpec = async (endpoint: string): Promise<Node> => {
	const url = new URL('/api/swagger.json', endpoint)
	const response = await fetch(url)
	if (!response.ok) throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`)
	return (await response.json()) as Node
}

/** A spec as published by Logto, cloned and patched so the generator can consume it. */
export const normalizeSpec = (spec: Node): Node => {
	const clone = structuredClone(spec) as Node
	recursiveTranslations(clone)
	visit(clone)
	return clone
}

const visit = (node: Json | Node): void => {
	if (Array.isArray(node)) {
		for (const item of node) visit(item)
		return
	}
	if (!node || typeof node !== 'object') return
	const schema = node as Node

	regexLiteralPattern(schema)
	emptyObjectDefault(schema)
	documentationOnlyProperties(schema)
	nullableEnum(schema)
	redirectUriList(schema)
	if (untypedJsonUnion(schema)) return

	for (const value of Object.values(schema)) visit(value)
}

/**
 * Logto serialises zod regexes as JS literals (`"/^\\d+$/"`, `"/^#[\\da-f]{3}$/i"`),
 * which are not valid ECMA-262 pattern strings. Strip the delimiters and fold the
 * only flag in use (`i`) into the character classes.
 */
const regexLiteralPattern = (schema: Node) => {
	if (typeof schema.pattern !== 'string') return
	const literal = /^\/(.*)\/([a-z]*)$/s.exec(schema.pattern)
	if (!literal) return
	const [, source, flags] = literal
	schema.pattern = flags.includes('i') ? source.replace(/a-z/g, 'a-zA-Z').replace(/a-f/g, 'a-fA-F') : source
}

/**
 * Phrase objects are nested `{ [key]: string | TranslationObject }` maps, but the spec spells the
 * key as a literal `"[translationKey]"` property and drops the recursive branch.
 */
const recursiveTranslations = (spec: Node) => {
	const schemas = spec.components?.schemas
	if (!schemas?.TranslationObject || !schemas.Translation) return
	const { example, description } = schemas.TranslationObject
	schemas.Translation = { oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/TranslationObject' }] }
	schemas.TranslationObject = {
		type: 'object',
		additionalProperties: { $ref: '#/components/schemas/Translation' },
		...(description ? { description } : {}),
		...(example ? { example } : {}),
	}
}

/** `default: {}` on an object with required members is not a valid value of that object. */
const emptyObjectDefault = (schema: Node) => {
	const value = schema.default
	if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0 && schema.required?.length) {
		delete schema.default
	}
}

/**
 * Some request bodies put a `oneOf` next to a `properties` map that only carries
 * descriptions. The importer treats that as an intersection it cannot expand.
 */
const documentationOnlyProperties = (schema: Node) => {
	if (Array.isArray(schema.oneOf) && schema.properties && schema.type === undefined) delete schema.properties
}

/**
 * The spec is OpenAPI 3.0, where nullability is `nullable: true`. The importer honours that for
 * plain types but drops it next to an `enum`, so `platform`, `passwordAlgorithm` and the legacy
 * `hook.event` decoded as non-nullable and failed against a live tenant, which really does send
 * `null`. Spell those out as a union the importer keeps.
 */
const nullableEnum = (schema: Node) => {
	if (schema.nullable !== true || !Array.isArray(schema.enum) || schema.oneOf) return
	const { nullable, enum: values, type, ...rest } = schema
	for (const key of Object.keys(schema)) delete schema[key]
	Object.assign(schema, rest, { oneOf: [{ ...(type ? { type } : {}), enum: values }, { type: 'null' }] })
}

/**
 * `redirectUris` / `postLogoutRedirectUris` are arrays of URL strings, but Logto's zod-to-OpenAPI
 * step loses `z.string().url()` and emits the placeholder `{ type: 'object', description:
 * 'Validator function' }` for the item. A live tenant returns plain strings.
 *
 * Other `Validator function` placeholders in the spec (connector `name`/`description` phrase maps,
 * `usernamePolicy`, …) really are objects, so they are left alone.
 */
const redirectUriList = (schema: Node) => {
	if (schema.type !== 'array' || !schema.items || typeof schema.items !== 'object') return
	const items = schema.items as Node
	if (items.type === 'object' && items.description === 'Validator function') {
		schema.items = { type: 'string', format: 'uri' }
	}
}

/**
 * `rawData` fields are declared as `type: object` + `oneOf: [object, array, string, number, boolean]`,
 * i.e. "any JSON". Collapse them to an unconstrained schema.
 */
const untypedJsonUnion = (schema: Node): boolean => {
	if (!Array.isArray(schema.oneOf)) return false
	const members = schema.oneOf as ReadonlyArray<Node>
	if (members.some(member => member.properties || member.enum || member.$ref)) return false
	const types = new Set(members.map(member => member.type))
	if (!(types.has('object') && types.has('array') && types.has('string'))) return false

	const { description } = schema
	for (const key of Object.keys(schema)) delete schema[key]
	if (description) schema.description = description
	return true
}
