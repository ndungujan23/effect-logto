/**
 * Entities carried by webhook payloads, derived from the generated Management API schemas so
 * they stay in lock-step with the spec.
 *
 * For Management-API-triggered data events Logto sends the route's response body as `data`
 * (`ctx.response.body`), so those entities are exactly the corresponding response schemas.
 * Unknown extra keys are ignored when decoding.
 */
import * as Schema from 'effect/Schema'

import * as Applications from '../schema/applications.ts'
import * as OrganizationRoles from '../schema/organization-roles.ts'
import * as OrganizationScopes from '../schema/organization-scopes.ts'
import * as Organizations from '../schema/organizations.ts'
import * as Resources from '../schema/resources.ts'
import * as Roles from '../schema/roles.ts'
import * as Users from '../schema/users.ts'

const user = Users.GetResponse.fields

/** `pick(user, ...userInfoSelectFields)`; fields added in newer Logto releases are optional. */
export const UserEntity = Schema.Struct({
	id: user.id,
	username: user.username,
	primaryEmail: user.primaryEmail,
	primaryPhone: user.primaryPhone,
	name: user.name,
	avatar: user.avatar,
	customData: user.customData,
	identities: user.identities,
	lastSignInAt: user.lastSignInAt,
	createdAt: user.createdAt,
	updatedAt: Schema.optionalKey(user.updatedAt),
	profile: Schema.optionalKey(user.profile),
	applicationId: user.applicationId,
	cimdClientId: Schema.optionalKey(user.cimdClientId),
	isSuspended: user.isSuspended,
})
export type UserEntity = typeof UserEntity.Type

const application = Applications.GetResponse.fields

/** `pick(application, 'id', 'type', 'name', 'description')`. */
export const ApplicationEntity = Schema.Struct({
	id: application.id,
	type: application.type,
	name: application.name,
	description: application.description,
})
export type ApplicationEntity = typeof ApplicationEntity.Type

export const RoleEntity = Roles.CreateResponse
export type RoleEntity = typeof RoleEntity.Type

export const ScopeEntity = Resources.CreateScopeResponse
export type ScopeEntity = typeof ScopeEntity.Type

export const OrganizationEntity = Organizations.CreateResponse
export type OrganizationEntity = typeof OrganizationEntity.Type

export const OrganizationRoleEntity = OrganizationRoles.CreateResponse
export type OrganizationRoleEntity = typeof OrganizationRoleEntity.Type

export const OrganizationScopeEntity = OrganizationScopes.CreateResponse
export type OrganizationScopeEntity = typeof OrganizationScopeEntity.Type

/** The deliberately narrow trusted-device projection Logto exposes to lifecycle events. */
export const TrustedDeviceEntity = Schema.Struct({ id: Schema.String, userId: Schema.String, expiresAt: Schema.Number })
export type TrustedDeviceEntity = typeof TrustedDeviceEntity.Type
