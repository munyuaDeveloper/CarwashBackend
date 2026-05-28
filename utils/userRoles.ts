export const VALID_USER_ROLES = [
  'attendant',
  'admin',
  'system_admin',
  'business_admin'
] as const;

export type UserRole = (typeof VALID_USER_ROLES)[number];

const ROLE_RANK: Record<UserRole, number> = {
  attendant: 1,
  admin: 2,
  business_admin: 3,
  system_admin: 4
};

export const normalizeRoles = (input: unknown): UserRole[] => {
  if (Array.isArray(input)) {
    const roles = input
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value): value is UserRole => VALID_USER_ROLES.includes(value as UserRole));
    return [...new Set(roles)];
  }

  if (typeof input === 'string' && input.trim().length > 0) {
    const role = input.trim() as UserRole;
    return VALID_USER_ROLES.includes(role) ? [role] : [];
  }

  return [];
};

export const getUserRoles = (user?: { roles?: unknown; role?: unknown } | null): UserRole[] => {
  if (!user) return [];
  const fromRoles = normalizeRoles(user.roles);
  const fromLegacy = normalizeRoles(user.role);

  if (fromRoles.length > 0 && fromLegacy.length > 0) {
    return [...new Set([...fromRoles, ...fromLegacy])];
  }
  if (fromRoles.length > 0) return fromRoles;
  return fromLegacy;
};

/** Normalize roles on a user document after load (for req.user). */
export const syncUserRoles = (user: { roles?: unknown; role?: unknown }): UserRole[] => {
  const roles = getUserRoles(user);
  if (roles.length > 0) {
    (user as { roles: UserRole[] }).roles = roles;
    (user as { role?: UserRole | undefined }).role = getPrimaryRole({ roles }) ?? roles[0];
  }
  return roles;
};

/**
 * Expands route-required roles so business_admin and admin satisfy each other's routes.
 * system_admin and attendant are not expanded.
 */
export const expandRouteRoles = (requiredRoles: string[]): UserRole[] => {
  const expanded = new Set<UserRole>();

  for (const required of requiredRoles) {
    if (!VALID_USER_ROLES.includes(required as UserRole)) continue;
    const role = required as UserRole;
    expanded.add(role);

    if (role === 'business_admin' || role === 'admin') {
      expanded.add('business_admin');
      expanded.add('admin');
    }
  }

  return [...expanded];
};

export const userHasRouteAccess = (
  user: { roles?: unknown; role?: unknown } | null | undefined,
  requiredRoles: string[]
): boolean => userHasAnyRole(user, expandRouteRoles(requiredRoles));

/** Only business_admin and system_admin may create users or change role assignments. */
export const canAssignRoles = (
  user: { roles?: unknown; role?: unknown } | null | undefined
): boolean => userHasAnyRole(user, ['business_admin', 'system_admin']);

export const getPrimaryRole = (user?: { roles?: unknown; role?: unknown } | null): UserRole | null => {
  const roles = getUserRoles(user);
  if (roles.length === 0) return null;
  return roles.reduce((highest, role) => (ROLE_RANK[role] > ROLE_RANK[highest] ? role : highest), roles[0]!);
};

export const userHasRole = (
  user: { roles?: unknown; role?: unknown } | null | undefined,
  role: UserRole
): boolean => getUserRoles(user).includes(role);

export const userHasAnyRole = (
  user: { roles?: unknown; role?: unknown } | null | undefined,
  roles: UserRole[]
): boolean => {
  const userRoles = getUserRoles(user);
  return roles.some((role) => userRoles.includes(role));
};

export const validateRoles = (
  roles: UserRole[],
  options?: { allowEmpty?: boolean }
): string | null => {
  if (!roles.length) {
    return options?.allowEmpty ? null : 'At least one role is required';
  }

  const invalid = roles.filter((role) => !VALID_USER_ROLES.includes(role));
  if (invalid.length > 0) {
    return `Invalid role(s): ${invalid.join(', ')}`;
  }

  if (roles.includes('system_admin') && roles.length > 1) {
    return 'system_admin cannot be combined with other roles';
  }

  return null;
};

export const requiresBusinessAssignment = (roles: UserRole[]): boolean =>
  roles.length > 0 && !roles.includes('system_admin');
