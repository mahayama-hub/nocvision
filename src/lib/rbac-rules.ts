export type NocRoleName =
  | "Administrator"
  | "Tenant Owner"
  | "NOC Engineer"
  | "NOC Read-Only / Auditor"
  | "Refresh";

export const ALL_NOC_ROLES: NocRoleName[] = [
  "Administrator",
  "Tenant Owner",
  "NOC Engineer",
  "NOC Read-Only / Auditor",
  "Refresh",
];

/** Roles strictly below Administrator and Tenant Owner */
export const SUBORDINATE_NOC_ROLES: NocRoleName[] = [
  "NOC Engineer",
  "NOC Read-Only / Auditor",
  "Refresh",
];

export function getAssignableRoles(actorRole: NocRoleName): NocRoleName[] {
  if (actorRole === "Administrator") {
    return ALL_NOC_ROLES;
  }
  if (actorRole === "Tenant Owner") {
    return SUBORDINATE_NOC_ROLES;
  }
  return [];
}

export function canAssignRole(
  actorRole: NocRoleName,
  targetRole: NocRoleName
): boolean {
  return getAssignableRoles(actorRole).includes(targetRole);
}

