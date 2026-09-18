/**
 * Webhook request bodies, modelled on Logto's own payload builders
 * (packages/core/src/libraries/hook/{index,context-manager}.ts) rather than the prose docs,
 * which disagree with the implementation in a few places:
 *
 * - `User.Deleted` carries the deleted user in `data`, not `null`.
 * - Delete events triggered by a `204` route omit `data` entirely instead of sending `null`.
 * - `User.Data.Updated` from `PATCH /users/:id/custom-data` or `/profile` sends that route's
 *   response body (the custom data / profile object), not a user; check `matchedRoute`.
 * - User fields are nullable and timestamps are epoch milliseconds.
 *
 * Every payload is a union discriminated by `event`.
 */
import * as Schema from 'effect/Schema'

import {
	ApplicationEntity,
	OrganizationEntity,
	OrganizationRoleEntity,
	OrganizationScopeEntity,
	RoleEntity,
	ScopeEntity,
	TrustedDeviceEntity,
	UserEntity,
} from './entity.ts'
import { InteractionEvent } from './event.ts'

// -- shared fields ----------------------------------------------------------------------------

/** Present on every delivery. */
const Common = {
	hookId: Schema.String,
	/** ISO 8601. */
	createdAt: Schema.String,
	userAgent: Schema.optionalKey(Schema.String),
}

/** Set when the change came from a user-facing flow on the Experience API. */
const ExperienceApiContext = {
	interactionEvent: Schema.optionalKey(InteractionEvent),
	sessionId: Schema.optionalKey(Schema.String),
	applicationId: Schema.optionalKey(Schema.String),
	application: Schema.optionalKey(ApplicationEntity),
	/** CIMD clients are unregistered, so their identifier URL stands in for `application`. */
	cimdClientId: Schema.optionalKey(Schema.String),
}

/** Set when the change came from a Management API call. */
const ManagementApiContext = {
	path: Schema.optionalKey(Schema.String),
	method: Schema.optionalKey(Schema.String),
	status: Schema.optionalKey(Schema.Number),
	params: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
	/** The koa route that matched, e.g. `/users/:userId/custom-data`. */
	matchedRoute: Schema.optionalKey(Schema.String),
}

const DataContext = { ...Common, ip: Schema.optionalKey(Schema.String), ...ExperienceApiContext, ...ManagementApiContext }

const dataEvent = <const Event extends string, Fields extends Schema.Struct.Fields>(event: Event, fields: Fields) =>
	Schema.Struct({ ...DataContext, event: Schema.Literal(event), ...fields }).annotate({
		identifier: `Logto${event.replaceAll('.', '')}Payload`,
	})

/** `data` of an event whose route answers `204`: absent in practice, `null` per the docs. */
const NoData = Schema.optionalKey(Schema.NullOr(Schema.Unknown))

// -- user flow (interaction) events -----------------------------------------------------------

export const InteractionPayload = Schema.Struct({
	...Common,
	event: Schema.Literals(['PostRegister', 'PostSignIn', 'PostSignInAdaptiveMfaTriggered', 'PostResetPassword']),
	interactionEvent: InteractionEvent,
	sessionId: Schema.optionalKey(Schema.String),
	userIp: Schema.optionalKey(Schema.String),
	userId: Schema.optionalKey(Schema.String),
	user: Schema.optionalKey(UserEntity),
	applicationId: Schema.optionalKey(Schema.String),
	application: Schema.optionalKey(ApplicationEntity),
	cimdClientId: Schema.optionalKey(Schema.String),
	/** Only on `PostSignInAdaptiveMfaTriggered`. */
	adaptiveMfaResult: Schema.optionalKey(Schema.Unknown),
}).annotate({ identifier: 'LogtoInteractionPayload' })
export type InteractionPayload = typeof InteractionPayload.Type

// -- data mutation events ---------------------------------------------------------------------

export const UserCreatedPayload = dataEvent('User.Created', { data: UserEntity })
export const UserDeletedPayload = dataEvent('User.Deleted', { data: Schema.optionalKey(Schema.NullOr(UserEntity)) })
export const UserDataUpdatedPayload = dataEvent('User.Data.Updated', {
	/** A user, or the partial object returned by `/custom-data` and `/profile` routes. */
	data: Schema.Union([UserEntity, Schema.Record(Schema.String, Schema.Json)]),
})
export const UserSuspensionStatusUpdatedPayload = dataEvent('User.SuspensionStatus.Updated', { data: UserEntity })

export const TrustedDeviceCreatedPayload = dataEvent('TrustedDevice.Created', { data: TrustedDeviceEntity })
export const TrustedDeviceDeletedPayload = dataEvent('TrustedDevice.Deleted', { data: TrustedDeviceEntity })

export const RoleCreatedPayload = dataEvent('Role.Created', { data: RoleEntity })
export const RoleDeletedPayload = dataEvent('Role.Deleted', { data: NoData })
export const RoleDataUpdatedPayload = dataEvent('Role.Data.Updated', { data: RoleEntity })
export const RoleScopesUpdatedPayload = dataEvent('Role.Scopes.Updated', {
	data: Schema.optionalKey(Schema.NullOr(Schema.Array(ScopeEntity))),
	/** Only when scopes were assigned while creating the role. */
	roleId: Schema.optionalKey(Schema.String),
})

export const ScopeCreatedPayload = dataEvent('Scope.Created', { data: ScopeEntity })
export const ScopeDeletedPayload = dataEvent('Scope.Deleted', { data: NoData })
export const ScopeDataUpdatedPayload = dataEvent('Scope.Data.Updated', { data: ScopeEntity })

export const OrganizationCreatedPayload = dataEvent('Organization.Created', { data: OrganizationEntity })
export const OrganizationDeletedPayload = dataEvent('Organization.Deleted', { data: NoData })
export const OrganizationDataUpdatedPayload = dataEvent('Organization.Data.Updated', { data: OrganizationEntity })
/**
 * Delta arrays are omitted when empty and silently capped at 5000 entries; treat a missing
 * array as "no change on that side" and an array of exactly 5000 as a cue to reconcile.
 */
export const OrganizationMembershipUpdatedPayload = dataEvent('Organization.Membership.Updated', {
	data: NoData,
	organizationId: Schema.String,
	addedUserIds: Schema.optionalKey(Schema.Array(Schema.String)),
	removedUserIds: Schema.optionalKey(Schema.Array(Schema.String)),
	addedApplicationIds: Schema.optionalKey(Schema.Array(Schema.String)),
	removedApplicationIds: Schema.optionalKey(Schema.Array(Schema.String)),
})

export const OrganizationRoleCreatedPayload = dataEvent('OrganizationRole.Created', { data: OrganizationRoleEntity })
export const OrganizationRoleDeletedPayload = dataEvent('OrganizationRole.Deleted', { data: NoData })
export const OrganizationRoleDataUpdatedPayload = dataEvent('OrganizationRole.Data.Updated', { data: OrganizationRoleEntity })
export const OrganizationRoleScopesUpdatedPayload = dataEvent('OrganizationRole.Scopes.Updated', {
	data: NoData,
	/** Only when scopes were assigned while creating the organization role. */
	organizationRoleId: Schema.optionalKey(Schema.String),
})

export const OrganizationScopeCreatedPayload = dataEvent('OrganizationScope.Created', { data: OrganizationScopeEntity })
export const OrganizationScopeDeletedPayload = dataEvent('OrganizationScope.Deleted', { data: NoData })
export const OrganizationScopeDataUpdatedPayload = dataEvent('OrganizationScope.Data.Updated', { data: OrganizationScopeEntity })

export const DataPayload = Schema.Union([
	UserCreatedPayload,
	UserDeletedPayload,
	UserDataUpdatedPayload,
	UserSuspensionStatusUpdatedPayload,
	TrustedDeviceCreatedPayload,
	TrustedDeviceDeletedPayload,
	RoleCreatedPayload,
	RoleDeletedPayload,
	RoleDataUpdatedPayload,
	RoleScopesUpdatedPayload,
	ScopeCreatedPayload,
	ScopeDeletedPayload,
	ScopeDataUpdatedPayload,
	OrganizationCreatedPayload,
	OrganizationDeletedPayload,
	OrganizationDataUpdatedPayload,
	OrganizationMembershipUpdatedPayload,
	OrganizationRoleCreatedPayload,
	OrganizationRoleDeletedPayload,
	OrganizationRoleDataUpdatedPayload,
	OrganizationRoleScopesUpdatedPayload,
	OrganizationScopeCreatedPayload,
	OrganizationScopeDeletedPayload,
	OrganizationScopeDataUpdatedPayload,
]).annotate({ identifier: 'LogtoDataPayload' })
export type DataPayload = typeof DataPayload.Type

// -- exception events -------------------------------------------------------------------------

export const IdentifierLockoutPayload = dataEvent('Identifier.Lockout', {
	type: Schema.Literals(['email', 'phone', 'username']),
	value: Schema.String,
})

export const MessageRateLimitedPayload = dataEvent('Message.RateLimited', {
	/** e.g. `VerificationCodeSend`. */
	action: Schema.String,
	/** The email address or phone number that hit the send rate limit. */
	recipient: Schema.String,
})

/** Emitted from the OIDC authorization endpoint, so there is no Experience API context. */
export const GrantLimitExceededPayload = Schema.Struct({
	...Common,
	ip: Schema.optionalKey(Schema.String),
	event: Schema.Literal('Grant.LimitExceeded'),
	userId: Schema.String,
	/** Absent for CIMD clients, which carry `cimdClientId` instead. */
	applicationId: Schema.optionalKey(Schema.String),
	cimdClientId: Schema.optionalKey(Schema.String),
	application: Schema.optionalKey(ApplicationEntity),
	maxAllowedGrants: Schema.Number,
	preRevocationActiveGrantCount: Schema.Number,
	/** Already destroyed on Logto's side; persist them if you need them. */
	revokedGrantIds: Schema.Array(Schema.String),
}).annotate({ identifier: 'LogtoGrantLimitExceededPayload' })

export const ExceptionPayload = Schema.Union([IdentifierLockoutPayload, MessageRateLimitedPayload, GrantLimitExceededPayload]).annotate({
	identifier: 'LogtoExceptionPayload',
})
export type ExceptionPayload = typeof ExceptionPayload.Type

// -- any event --------------------------------------------------------------------------------

export const WebhookPayload = Schema.Union([InteractionPayload, DataPayload, ExceptionPayload]).annotate({
	identifier: 'LogtoWebhookPayload',
})
export type WebhookPayload = typeof WebhookPayload.Type
