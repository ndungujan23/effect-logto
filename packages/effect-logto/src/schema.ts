/**
 * Every Management/Account/Experience API schema, one namespace per resource:
 *
 * ```ts
 * import { Users } from 'effect-logto/schema'
 *
 * const user: Users.GetResponse = ...
 * Schema.decodeUnknownEffect(Users.CreatePayload)(input)
 * ```
 *
 * Import this entry only where you need runtime schemas; operation types are reachable from
 * the main entry without it.
 */
export * from './domain/schema/index.ts'
