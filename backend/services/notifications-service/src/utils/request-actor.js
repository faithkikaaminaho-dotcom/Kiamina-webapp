const ADMIN_ROLES = new Set(["admin", "owner", "superadmin", "manager"]);
const ELEVATED_ADMIN_ROLES = new Set(["owner", "superadmin"]);

const parseHeaderList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((role) => String(role).trim().toLowerCase())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean);
  }

  return [];
};

export const getRequestActor = (req) => {
  const uidHeader = req.headers["x-user-id"];
  const emailHeader = req.headers["x-user-email"];
  const rolesHeader = req.headers["x-user-roles"];
  const adminLevelHeader = req.headers["x-user-admin-level"];
  const adminPermissionsHeader = req.headers["x-user-admin-permissions"];

  return {
    uid: uidHeader ? String(uidHeader) : "",
    email: emailHeader ? String(emailHeader) : "",
    roles: parseHeaderList(rolesHeader),
    adminLevel: adminLevelHeader ? String(adminLevelHeader).trim().toLowerCase() : "",
    adminPermissions: parseHeaderList(adminPermissionsHeader)
  };
};

export const isAdminActor = (actor) =>
  actor.roles.some((role) => ADMIN_ROLES.has(role));

export const hasAdminPermission = (actor, permissionId) =>
  actor.roles.some((role) => ELEVATED_ADMIN_ROLES.has(role))
  || (Array.isArray(actor?.adminPermissions) && actor.adminPermissions.includes(String(permissionId || "").trim()));

export const hasAnyAdminPermission = (actor, permissionIds = []) => {
  if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
    return true;
  }
  return permissionIds.some((permissionId) => hasAdminPermission(actor, permissionId));
};
