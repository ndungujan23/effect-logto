import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['test/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			// Generated from the OpenAPI spec; exercised through representative operations, not line by line.
			exclude: ['src/domain/schema/**', 'src/application/operation/**', 'src/infrastructure/http/operation/**'],
			thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
		},
	},
})
