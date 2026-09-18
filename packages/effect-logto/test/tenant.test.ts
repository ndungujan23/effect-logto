import { describe, expect, test } from 'vitest'

import { LogtoTenant } from '../src/index.ts'

describe('LogtoTenant', () => {
	test('cloud derives endpoint, token endpoint and indicator from the tenant id', () => {
		const tenant = LogtoTenant.cloud('abc123')
		expect([tenant._tag, tenant.tenantId, tenant.endpoint.href, tenant.tokenEndpoint.href, tenant.apiIndicator]).toEqual([
			'Cloud',
			'abc123',
			'https://abc123.logto.app/',
			'https://abc123.logto.app/oidc/token',
			'https://abc123.logto.app/api',
		])
	})

	test('self-hosted serves the default tenant and uses the OSS indicator', () => {
		const tenant = LogtoTenant.selfHosted({ baseUrl: 'https://auth.example.com' })
		expect([tenant._tag, tenant.tenantId, tenant.endpoint.href, tenant.tokenEndpoint.href, tenant.apiIndicator]).toEqual([
			'SelfHosted',
			'default',
			'https://auth.example.com/',
			'https://auth.example.com/oidc/token',
			'https://default.logto.app/api',
		])
	})

	test('self-hosted tolerates trailing slashes and a path prefix', () => {
		const tenant = LogtoTenant.selfHosted({ baseUrl: new URL('https://example.com/logto///') })
		expect([tenant.endpoint.href, tenant.tokenEndpoint.href]).toEqual([
			'https://example.com/logto',
			'https://example.com/logto/oidc/token',
		])
	})

	test('self-hosted accepts an internal token endpoint and a custom indicator', () => {
		const tenant = LogtoTenant.selfHosted({
			baseUrl: 'https://auth.example.com',
			tokenEndpoint: 'http://logto:3001/oidc/token',
			apiIndicator: 'https://custom.example.com/api',
		})
		expect([tenant.endpoint.href, tenant.tokenEndpoint.href, tenant.apiIndicator]).toEqual([
			'https://auth.example.com/',
			'http://logto:3001/oidc/token',
			'https://custom.example.com/api',
		])
	})

	test('self-hosted rejects a base URL that is not a URL', () => {
		expect(() => LogtoTenant.selfHosted({ baseUrl: 'auth.example.com' })).toThrow(TypeError)
	})
})
