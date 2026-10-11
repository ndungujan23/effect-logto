import { defineConfig } from 'oxlint'
import { middleapi } from 'uncheck/oxlint'

export default defineConfig({
	extends: [middleapi],
	ignorePatterns: ['**/dist', '**/coverage', '**/node_modules', '**/.turbo'],
	overrides: [
		{
			// Maintenance scripts report progress on stdout.
			files: ['**/scripts/**'],
			rules: { 'no-console': 'off' },
		},
		{
			// Generated adapters share one prelude of helpers; each file uses only the ones it needs.
			files: ['packages/effect-logto/src/infrastructure/http/operation/**'],
			rules: { 'no-unused-vars': 'off' },
		},
	],
})
