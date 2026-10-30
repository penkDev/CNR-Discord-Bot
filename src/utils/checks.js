export class UserError extends Error {}

const hasRole = (member, roleId) => member?.roles?.cache?.has(roleId) === true;

export function requireStaffRole(interaction, config) {
  if (!hasRole(interaction.member, config.staffRoleId)) {
    throw new UserError('You need staff permissions to use this command.');
  }
}

export function requireCrewRole(interaction, config) {
  if (!hasRole(interaction.member, config.crewRoleId)) {
    throw new UserError('You do not have the required role to use this command.');
  }
}

export function requirePermission(interaction, permission) {
  if (!interaction.memberPermissions?.has(permission)) {
    throw new UserError("You don't have permission to use this command.");
  }
}
