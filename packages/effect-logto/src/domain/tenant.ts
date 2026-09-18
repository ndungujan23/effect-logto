/**
 * Where a Logto tenant lives. Logto Cloud and self-hosted (OSS) differ only in how the
 * endpoint and the Management API resource indicator are derived:
 *
 * | Mode        | Endpoint                          | API indicator                        |
 * | ----------- | --------------------------------- | ------------------------------------ |
 * | Cloud       | `https://<tenant-id>.logto.app`   | `https://<tenant-id>.logto.app/api`  |
 * | Self-hosted | your own `baseUrl`                | `https://default.logto.app/api`      |
 */
export interface LogtoTenant {
	readonly _tag: 'Cloud' | 'SelfHosted'
	readonly tenantId: string
	/** Base URL the REST API is served from (paths already start with `/api`). */
	readonly endpoint: URL
	/** OAuth token endpoint used for the client-credentials grant. */
	readonly tokenEndpoint: URL
	/** The `resource` requested in the token call: the Management API indicator. */
	readonly apiIndicator: string
}

const withoutTrailingSlash = (url: string | URL) => new URL(String(url).replace(/\/+$/, ''))

/** A Logto Cloud tenant, e.g. `LogtoTenant.cloud('abc123')`. */
export const cloud = (tenantId: string): LogtoTenant => {
	const endpoint = new URL(`https://${tenantId}.logto.app`)
	return {
		_tag: 'Cloud',
		tenantId,
		endpoint,
		tokenEndpoint: new URL('/oidc/token', endpoint),
		apiIndicator: `https://${tenantId}.logto.app/api`,
	}
}

export interface SelfHostedOptions {
	/** Public Logto endpoint, e.g. `https://auth.example.com`. */
	readonly baseUrl: string | URL
	/** Defaults to `https://default.logto.app/api`, the indicator OSS Logto registers for the `default` tenant. */
	readonly apiIndicator?: string | undefined
	/**
	 * Override when the token endpoint is reached on a different address than the API,
	 * e.g. an internal service URL. Defaults to `<baseUrl>/oidc/token`.
	 */
	readonly tokenEndpoint?: string | URL | undefined
}

/** A self-hosted (OSS) Logto instance, which always serves the `default` tenant. */
export const selfHosted = (options: SelfHostedOptions): LogtoTenant => {
	const endpoint = withoutTrailingSlash(options.baseUrl)
	return {
		_tag: 'SelfHosted',
		tenantId: 'default',
		endpoint,
		tokenEndpoint: options.tokenEndpoint ? new URL(options.tokenEndpoint) : new URL(`${endpoint.href.replace(/\/$/, '')}/oidc/token`),
		apiIndicator: options.apiIndicator ?? 'https://default.logto.app/api',
	}
}
