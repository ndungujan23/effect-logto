import * as Exit from 'effect/Exit'
import * as Option from 'effect/Option'
import * as Stream from 'effect/Stream'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse'
import { describe, expect, test } from 'vitest'

import { Pagination, UserSearch } from '../src/index.ts'
import { fakeLogto, json, runManagement, scope, tokenEndpoint, withApi } from './support/fake-logto.ts'

describe('UserSearch', () => {
	test('builds repeatable search keys and sends them, in order, on users.list', async () => {
		const search = UserSearch.make()
			.field('name', ['Alice', 'Bob'], { mode: 'exact' })
			.field('primaryEmail', '%@gmail.com')
			.joint('and')
			.caseSensitive()
			.identity({ type: 'social', provider: 'github', id: 'gh-1' })

		expect(search.params).toEqual([
			['search.name', 'Alice'],
			['search.name', 'Bob'],
			['mode.name', 'exact'],
			['search.primaryEmail', '%@gmail.com'],
			['joint', 'and'],
			['isCaseSensitive', 'true'],
			['identityType', 'social'],
			['identityProvider', 'github'],
			['identityId', 'gh-1'],
		])

		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => token(url) ?? json([]))
		await runManagement(
			withApi(api => api.users.list({ params: { page: 2, search_params: search.params } })),
			logto
		)

		const listed = logto.apiCalls().at(-1)?.url
		expect(listed?.pathname).toBe('/api/users')
		expect([...(listed?.searchParams ?? [])]).toEqual([['page', '2'], ...search.params])
	})

	test('keyword search with a global mode, and record-shaped search_params', async () => {
		expect(UserSearch.make().keyword('%ali%', { mode: 'posix' }).mode('like').toSearchParams()).toEqual([
			['search', '%ali%'],
			['mode', 'posix'],
			['mode', 'like'],
		])

		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => token(url) ?? json([]))
		await runManagement(
			withApi(api => api.users.list({ params: { search_params: { 'search.username': 'alice' } } })),
			logto
		)
		expect(logto.apiCalls().at(-1)?.url.search).toBe('?search.username=alice')
	})

	test('is immutable: every step returns a new builder', () => {
		const base = UserSearch.make().field('name', 'a')
		const extended = base.joint('and')
		expect(base.params).toHaveLength(1)
		expect(extended.params).toHaveLength(2)
		expect(extended).not.toBe(base)
	})
})

const response = (headers: Record<string, string>) =>
	HttpClientResponse.fromWeb(HttpClientRequest.get('https://auth.example.com/api/users'), new Response('[]', { headers }))

describe('Pagination', () => {
	test('totalOf reads Total-Number and ignores junk', () => {
		expect(Pagination.totalOf(response({ 'Total-Number': '7' }))).toEqual(Option.some(7))
		expect(Pagination.totalOf(response({}))).toEqual(Option.none())
		expect(Pagination.totalOf(response({ 'Total-Number': 'lots' }))).toEqual(Option.none())
		expect(Pagination.totalOf(response({ 'Total-Number': '-1' }))).toEqual(Option.none())
		expect(Pagination.totalOf(response({ 'Total-Number': '1.5' }))).toEqual(Option.none())
	})

	const pages = (items: ReadonlyArray<ReadonlyArray<string>>, total?: number) => {
		const token = tokenEndpoint()
		return fakeLogto((_, url) => {
			const answer = token(url)
			if (answer) return answer
			const page = items[Number(url.searchParams.get('page')) - 1] ?? []
			return json(page.map(scope), total === undefined ? undefined : { headers: { 'Total-Number': String(total) } })
		})
	}

	const collect = (logto: ReturnType<typeof fakeLogto>, pageSize: number) =>
		runManagement(
			withApi(api =>
				Stream.runCollect(
					Pagination.paginate(page => api.organizationScopes.list({ params: page, config: { includeResponse: true } }), {
						pageSize,
					})
				)
			),
			logto
		)

	test('walks pages until Total-Number is reached', async () => {
		const logto = pages([['a', 'b'], ['c']], 3)
		const exit = await collect(logto, 2)
		expect(Exit.isSuccess(exit) && exit.value.map(item => item.id)).toEqual(['a', 'b', 'c'])
		expect(logto.apiCalls().map(call => call.url.search)).toEqual(['?page=1&page_size=2', '?page=2&page_size=2'])
	})

	test('stops when the total is an exact multiple of the page size, without an extra request', async () => {
		const logto = pages(
			[
				['a', 'b'],
				['c', 'd'],
			],
			4
		)
		const exit = await collect(logto, 2)
		expect(Exit.isSuccess(exit) && exit.value.map(item => item.id)).toEqual(['a', 'b', 'c', 'd'])
		expect(logto.apiCalls()).toHaveLength(2)
	})

	test('without the header, stops at the first short page', async () => {
		const logto = pages([['a', 'b'], ['c', 'd'], []])
		const exit = await collect(logto, 2)
		expect(Exit.isSuccess(exit) && exit.value.map(item => item.id)).toEqual(['a', 'b', 'c', 'd'])
		expect(logto.apiCalls()).toHaveLength(3)
	})

	test('stops on an empty page even if Total-Number claims more (a collection that shrank mid-walk)', async () => {
		const logto = pages([['a', 'b'], []], 10)
		const exit = await collect(logto, 2)
		expect(Exit.isSuccess(exit) && exit.value.map(item => item.id)).toEqual(['a', 'b'])
		expect(logto.apiCalls()).toHaveLength(2)
	})

	test('an empty collection yields nothing after one request', async () => {
		const logto = pages([], 0)
		const exit = await collect(logto, 100)
		expect(Exit.isSuccess(exit) && exit.value).toEqual([])
		expect(logto.apiCalls()).toHaveLength(1)
	})

	test('a failing page fails the stream', async () => {
		const token = tokenEndpoint()
		const logto = fakeLogto((_, url) => token(url) ?? json({ code: 'oops', message: 'boom' }, { status: 500 }))
		const exit = await collect(logto, 2)
		expect(Exit.isFailure(exit)).toBe(true)
	})
})
