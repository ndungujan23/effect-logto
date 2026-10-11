import { defineConfig } from 'oxfmt'
import { middleapi } from 'uncheck/oxfmt'

export default defineConfig({
	...middleapi,
	useTabs: true,
	tabWidth: 4,
	printWidth: 140,
	trailingComma: 'es5',
	arrowParens: 'avoid',
	quoteProps: 'as-needed',
	objectWrap: 'collapse',
	sortImports: false,
	ignorePatterns: [
		'**/dist',
		'**/coverage',
		'**/node_modules',
		'**/.turbo',
		'**/CHANGELOG.md',
		'**/spec/openapi.json',
		'bun.lock',
		// Config, manifests and docs keep their hand-formatted style; oxfmt owns source code.
		'**/*.json',
		'**/*.md',
		'**/*.yml',
		'.idea',
	],
})
