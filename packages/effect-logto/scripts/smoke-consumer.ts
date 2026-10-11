/**
 * Installs the *packed* package into a clean project next to a given `effect` version and drives it
 * through plain Node, exactly as a consumer would. Catches what unit tests running against `src/`
 * cannot: dist files importing an `effect/...` path that the consumer's Effect does not export,
 * missing entry points, and a peer range that admits versions the build does not work with.
 *
 *   bun run smoke                    # against the newest Effect the peer range allows
 *   bun run smoke --effect 4.0.0     # against a specific Effect version (the floor of the peer range)
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const effectFlag = process.argv.indexOf('--effect')
const effectVersion = effectFlag === -1 ? 'latest' : (process.argv[effectFlag + 1] ?? 'latest')

const run = (cmd: ReadonlyArray<string>, cwd: string) => {
	const result = Bun.spawnSync([...cmd], { cwd, stdout: 'pipe', stderr: 'pipe' })
	if (result.exitCode !== 0) {
		throw new Error(`${cmd.join(' ')} (in ${cwd}) exited with ${result.exitCode}\n${result.stdout}\n${result.stderr}`)
	}
	return result.stdout.toString().trim()
}

const consumer = `
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'

import { LogtoManagement, LogtoTenant, LogtoWebhook } from 'effect-logto'
import * as Schema from 'effect-logto/schema'
import * as Webhook from 'effect-logto/webhook'

const assert = (condition, message) => {
	if (!condition) throw new Error('smoke test failed: ' + message)
}
assert(Schema.Users && Object.keys(Schema.Users).length > 10, 'effect-logto/schema exports the generated schemas')
assert(typeof Webhook.receive === 'function' && typeof LogtoWebhook.receive === 'function', 'webhook entry point')

const calls = []
const http = HttpClient.make(request => {
	const url = new URL(request.url)
	calls.push(request.method + ' ' + url.pathname)
	const body = url.pathname === '/oidc/token'
		? { access_token: 'token', expires_in: 3600, token_type: 'Bearer', scope: 'all' }
		: []
	return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(body)))
})

const program = Effect.gen(function* () {
	const logto = yield* LogtoManagement
	return yield* logto.organizationScopes.list(undefined)
}).pipe(
	Effect.provide(
		LogtoManagement.layer({
			tenant: LogtoTenant.selfHosted({ baseUrl: 'https://auth.example.com' }),
			clientId: 'id',
			clientSecret: Redacted.make('secret'),
		})
	),
	Effect.provide(Layer.succeed(HttpClient.HttpClient, http))
)

const exit = await Effect.runPromiseExit(program)
assert(Exit.isSuccess(exit), 'a management call succeeds through the packed build: ' + JSON.stringify(exit))
assert(calls.join() === 'POST /oidc/token,GET /api/organization-scopes', 'unexpected calls: ' + calls.join())
console.log('ok')
`

const directory = await mkdtemp(join(tmpdir(), 'effect-logto-smoke-'))
try {
	const packed = join(directory, 'pack')
	run(['mkdir', packed], directory)
	run(['npm', 'pack', '--pack-destination', packed, '--silent'], root)
	const tarball = run(['ls', packed], directory)
		.split('\n')
		.find(name => name.endsWith('.tgz'))
	if (!tarball) throw new Error('npm pack produced no tarball')

	const project = join(directory, 'consumer')
	run(['mkdir', project], directory)
	await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }))
	run(['npm', 'install', '--no-audit', '--no-fund', '--loglevel=error', join(packed, tarball), `effect@${effectVersion}`], project)

	const installed = JSON.parse(await Bun.file(join(project, 'node_modules/effect/package.json')).text()).version
	await writeFile(join(project, 'main.mjs'), consumer)
	const output = run(['node', 'main.mjs'], project)
	console.log(`✔ effect-logto works with effect@${installed} on Node ${process.versions.node}: ${output}`)
} finally {
	await rm(directory, { recursive: true, force: true })
}
