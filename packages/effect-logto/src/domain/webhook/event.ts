/**
 * Logto webhook event names, mirrored from `hookEvents` in `@logto/schemas`
 * (packages/schemas/src/foundations/jsonb-types/hooks.ts).
 */
import * as Schema from 'effect/Schema'

/** Fired by the Experience API when an end-user flow completes. */
export const InteractionEvents = ['PostRegister', 'PostSignIn', 'PostSignInAdaptiveMfaTriggered', 'PostResetPassword'] as const
export const InteractionHookEvent = Schema.Literals(InteractionEvents)
export type InteractionHookEvent = typeof InteractionHookEvent.Type

/** Fired when Logto data changes, via the Management API or an end-user flow. */
export const DataEvents = [
	'User.Created',
	'User.Deleted',
	'User.Data.Updated',
	'User.SuspensionStatus.Updated',
	'TrustedDevice.Created',
	'TrustedDevice.Deleted',
	'Role.Created',
	'Role.Deleted',
	'Role.Data.Updated',
	'Role.Scopes.Updated',
	'Scope.Created',
	'Scope.Deleted',
	'Scope.Data.Updated',
	'Organization.Created',
	'Organization.Deleted',
	'Organization.Data.Updated',
	'Organization.Membership.Updated',
	'OrganizationRole.Created',
	'OrganizationRole.Deleted',
	'OrganizationRole.Data.Updated',
	'OrganizationRole.Scopes.Updated',
	'OrganizationScope.Created',
	'OrganizationScope.Deleted',
	'OrganizationScope.Data.Updated',
] as const
export const DataHookEvent = Schema.Literals(DataEvents)
export type DataHookEvent = typeof DataHookEvent.Type

/** Fired on security incidents. */
export const ExceptionEvents = ['Identifier.Lockout', 'Message.RateLimited', 'Grant.LimitExceeded'] as const
export const ExceptionHookEvent = Schema.Literals(ExceptionEvents)
export type ExceptionHookEvent = typeof ExceptionHookEvent.Type

export const HookEvent = Schema.Literals([...InteractionEvents, ...DataEvents, ...ExceptionEvents])
export type HookEvent = typeof HookEvent.Type

/** The end-user flow a payload came from. Field name keeps Logto's historical "interaction" naming. */
export const InteractionEvent = Schema.Literals(['SignIn', 'Register', 'ForgotPassword'])
export type InteractionEvent = typeof InteractionEvent.Type

export const isInteractionEvent = (event: string): event is InteractionHookEvent =>
	(InteractionEvents as ReadonlyArray<string>).includes(event)
export const isDataEvent = (event: string): event is DataHookEvent => (DataEvents as ReadonlyArray<string>).includes(event)
export const isExceptionEvent = (event: string): event is ExceptionHookEvent => (ExceptionEvents as ReadonlyArray<string>).includes(event)
