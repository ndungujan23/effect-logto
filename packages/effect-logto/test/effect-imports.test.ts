import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const srcDir = join(import.meta.dirname, '../src')
const require = createRequire(import.meta.url)

const sourceFiles = (dir: string): Array<string> =>
	readdirSync(dir).flatMap(entry => {
		const path = join(dir, entry)
		return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : []
	})

const effectSpecifiers = [
	...new Set(
		sourceFiles(srcDir).flatMap(file =>
			[...readFileSync(file, 'utf8').matchAll(/(?:from|import\()\s*'(effect(?:\/[\w/-]+)?)'/g)].map(match => match[1]!)
		)
	),
].sort()

describe('effect imports', () => {
	test('the source imports a sensible set of effect modules', () => {
		expect(effectSpecifiers).toContain('effect/Effect')
		expect(effectSpecifiers).toContain('effect/http/HttpClient')
	})

	// 0.1.0 shipped importing `effect/unstable/http/*`, which only exists in Effect 4 betas/RCs: every consumer
	// on Effect 4 stable got "Cannot find module 'effect/unstable/http/HttpClient'".
	test.each(effectSpecifiers)('%s is exported by the installed effect', specifier => {
		expect(() => require.resolve(specifier)).not.toThrow()
	})
})
