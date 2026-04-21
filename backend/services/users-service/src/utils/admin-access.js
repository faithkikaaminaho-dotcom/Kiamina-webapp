const ADMIN_ROLES = new Set(["admin", "owner", "superadmin"]);
const ELEVATED_ADMIN_ROLES = new Set(["owner", "superadmin"]);

export const ADMIN_LEVELS = Object.freeze({
  OWNER: "owner",
  SUPER: "super",
  AREA_ACCOUNTANT: "area_accountant",
  CUSTOMER_SERVICE: "customer_service",
  TECHNICAL_SUPPORT: "technical_support"
});

export const ADMIN_PERMISSION_DEFINITIONS = Object.freeze([
  { id: "view_documents", label: "View Documents" },
  { id: "download_documents", label: "Download Documents" },
  { id: "approve_documents", label: "Approve Documents" },
  { id: "reject_documents", label: "Reject Documents" },
  { id: "request_info_documents", label: "Request Additional Information" },
  { id: "comment_documents", label: "Comment on Documents" },
  { id: "add_internal_notes", label: "Add Internal Notes" },
  { id: "view_assigned_clients", label: "View Assigned Clients" },
  { id: "view_businesses", label: "View All Clients" },
  { id: "view_upload_history", label: "View Upload History" },
  { id: "view_activity_logs", label: "View Activity Logs" },
  { id: "client_assistance", label: "Client Assistance" },
  { id: "impersonate_clients", label: "Impersonate Client Session" },
  { id: "view_client_settings", label: "View Client Settings" },
  { id: "edit_client_settings", label: "Edit Client Settings" },
  { id: "manage_technical_client_config", label: "Manage Technical Client Config" },
  { id: "send_notifications", label: "Send Notifications" },
  { id: "approve_verification", label: "Approve Verification" },
  { id: "manage_users", label: "Manage Users" },
  { id: "manage_admin_roles", label: "Manage Admin Roles" },
  { id: "assign_clients_to_area", label: "Assign Clients to Area Accountant" },
  { id: "reset_admin_password", label: "Reset Admin Password" },
  { id: "manage_system_config", label: "Manage System Configuration" },
  { id: "view_system_audit_reports", label: "View System Audit Reports" },
  { id: "delete_data", label: "Delete Data" }
]);

export const FULL_ADMIN_PERMISSION_IDS = Object.freeze(
  ADMIN_PERMISSION_DEFINITIONS.map((permission) => permission.id)
);

const PERMISSION_ID_SET = new Set(FULL_ADMIN_PERMISSION_IDS);
const LEGACY_PERMISSION_ALIASES = new Map([
  ["manage_admins", ["manage_users", "manage_admin_roles"]],
  ["view_clients", ["view_businesses"]]
]);

const AREA_ACCOUNTANT_PERMISSION_IDS = Object.freeze([
  "view_documents",
  "download_documents",
  "approve_documents",
  "reject_documents",
  "request_info_documents",
  "comment_documents",
  "add_internal_notes",
  "view_assigned_clients",
  "view_upload_history",
  "view_activity_logs"
]);

const CUSTOMER_SERVICE_PERMISSION_IDS = Object.freeze([
  "view_documents",
  "download_documents",
  "comment_documents",
  "add_internal_notes",
  "view_businesses",
  "view_upload_history",
  "view_client_settings",
  "client_assistance",
  "impersonate_clients",
  "send_notifications"
]);

const TECHNICAL_SUPPORT_PERMISSION_IDS = Object.freeze([
  "view_documents",
  "download_documents",
  "comment_documents",
  "add_internal_notes",
  "view_businesses",
  "view_upload_history",
  "view_client_settings",
  "edit_client_settings",
  "manage_technical_client_config",
  "client_assistance",
  "impersonate_clients",
  "send_notifications",
  "view_activity_logs"
]);

const normalizeRole = (role) => String(role || "").trim().toLowerCase();

const dedupeStrings = (values = []) => [...new Set(
  values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
)];

export const isAdminRole = (role) => ADMIN_ROLES.has(normalizeRole(role));

export const parseAdminRoles = (roles = []) => dedupeStrings(
  (Array.isArray(roles) ? roles : [])
    .map((role) => normalizeRole(role))
    .filter(Boolean)
);

export const normalizeAdminLevel = (adminLevel) => {
  const normalizedLevel = String(adminLevel || "").trim().toLowerCase();
  if (!normalizedLevel) return ADMIN_LEVELS.SUPER;
  if (
    normalizedLevel === "owner"
    || normalizedLevel === "root"
    || normalizedLevel === "principal"
  ) {
    return ADMIN_LEVELS.OWNER;
  }
  if (
    normalizedLevel === "super"
    || normalizedLevel === "senior"
    || normalizedLevel === "head"
    || normalizedLevel === "super-admin"
  ) {
    return ADMIN_LEVELS.SUPER;
  }
  if (
    normalizedLevel === "area"
    || normalizedLevel === "area_accountant"
    || normalizedLevel === "area-accountant"
    || normalizedLevel === "area accountant"
    || normalizedLevel === "accountant"
    || normalizedLevel === "site"
    || normalizedLevel === "site/area"
    || normalizedLevel === "site-area"
    || normalizedLevel === "operational"
  ) {
    return ADMIN_LEVELS.AREA_ACCOUNTANT;
  }
  if (
    normalizedLevel === "customer_service"
    || normalizedLevel === "customer-service"
    || normalizedLevel === "customer service"
    || normalizedLevel === "support"
    || normalizedLevel === "agent"
    || normalizedLevel === "content"
  ) {
    return ADMIN_LEVELS.CUSTOMER_SERVICE;
  }
  if (
    normalizedLevel === "technical_support"
    || normalizedLevel === "technical-support"
    || normalizedLevel === "technical support"
    || normalizedLevel === "technical"
    || normalizedLevel === "tech"
  ) {
    return ADMIN_LEVELS.TECHNICAL_SUPPORT;
  }
  return ADMIN_LEVELS.SUPER;
};

export const deriveAdminLevelFromRoles = (roles = []) => {
  const normalizedRoles = parseAdminRoles(roles);
  if (normalizedRoles.some((role) => role === "owner")) {
    return ADMIN_LEVELS.OWNER;
  }
  if (normalizedRoles.some((role) => role === "superadmin")) {
    return ADMIN_LEVELS.SUPER;
  }
  return "";
};

export const getDefaultPermissionsForAdminLevel = (adminLevel) => {
  const normalizedLevel = normalizeAdminLevel(adminLevel);
  if (normalizedLevel === ADMIN_LEVELS.OWNER || normalizedLevel === ADMIN_LEVELS.SUPER) {
    return [...FULL_ADMIN_PERMISSION_IDS];
  }
  if (normalizedLevel === ADMIN_LEVELS.AREA_ACCOUNTANT) {
    return [...AREA_ACCOUNTANT_PERMISSION_IDS];
  }
  if (normalizedLevel === ADMIN_LEVELS.CUSTOMER_SERVICE) {
    return [...CUSTOMER_SERVICE_PERMISSION_IDS];
  }
  return [...TECHNICAL_SUPPORT_PERMISSION_IDS];
};

export const sanitizeAdminPermissions = (permissions = []) => dedupeStrings(
  (Array.isArray(permissions) ? permissions : [])
    .flatMap((permissionId) => {
      const normalizedPermissionId = String(permissionId || "").trim().toLowerCase();
      if (!normalizedPermissionId) return [];
      if (LEGACY_PERMISSION_ALIASES.has(normalizedPermissionId)) {
        return LEGACY_PERMISSION_ALIASES.get(normalizedPermissionId);
      }
      return PERMISSION_ID_SET.has(normalizedPermissionId) ? [normalizedPermissionId] : [];
    })
);

export const normalizeAdminAccessRecord = ({
  adminAccess = {},
  roles = []
} = {}) => {
  const resolvedAdminLevel = String(
    adminAccess?.adminLevel || deriveAdminLevelFromRoles(roles) || ""
  ).trim();
  return {
    adminLevel: resolvedAdminLevel ? normalizeAdminLevel(resolvedAdminLevel) : "",
    adminPermissions: sanitizeAdminPermissions(adminAccess?.adminPermissions),
    mustChangePassword: Boolean(adminAccess?.mustChangePassword)
  };
};

export const buildAdminAccessContext = ({
  actor = {},
  user = null
} = {}) => {
  const actorRoles = parseAdminRoles(actor?.roles);
  const userRoles = parseAdminRoles(user?.roles);
  const roles = dedupeStrings([...actorRoles, ...userRoles].map((role) => normalizeRole(role)));
  const normalizedAccessRecord = normalizeAdminAccessRecord({
    adminAccess: user?.adminAccess,
    roles
  });
  const defaultAdminLevel = normalizedAccessRecord.adminLevel || deriveAdminLevelFromRoles(roles);
  const effectiveAdminPermissions =
    normalizedAccessRecord.adminPermissions.length > 0
      ? [...normalizedAccessRecord.adminPermissions]
      : getDefaultPermissionsForAdminLevel(defaultAdminLevel);

  return {
    uid: String(actor?.uid || user?.uid || "").trim(),
    email: String(user?.email || actor?.email || "").trim().toLowerCase(),
    roles,
    adminLevel: normalizedAccessRecord.adminLevel,
    adminPermissions: [...normalizedAccessRecord.adminPermissions],
    effectiveAdminPermissions,
    mustChangePassword: normalizedAccessRecord.mustChangePassword,
    isAdmin: roles.some((role) => ADMIN_ROLES.has(role)),
    isElevated:
      roles.some((role) => ELEVATED_ADMIN_ROLES.has(role))
      || (
        normalizedAccessRecord.adminPermissions.length === 0
        && (
          normalizedAccessRecord.adminLevel === ADMIN_LEVELS.OWNER
          || normalizedAccessRecord.adminLevel === ADMIN_LEVELS.SUPER
        )
      )
  };
};

export const hasAdminPermission = (adminContext, permissionId) =>
  String(permissionId || "").trim()
    ? Array.isArray(adminContext?.effectiveAdminPermissions)
      && adminContext.effectiveAdminPermissions.includes(String(permissionId).trim())
    : false;

export const hasAnyAdminPermission = (adminContext, permissionIds = []) => {
  if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
    return true;
  }
  return permissionIds.some((permissionId) => hasAdminPermission(adminContext, permissionId));
};
