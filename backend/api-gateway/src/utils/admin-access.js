const ADMIN_LEVELS = Object.freeze({
  OWNER: "owner",
  SUPER: "super",
  AREA_ACCOUNTANT: "area_accountant",
  CUSTOMER_SERVICE: "customer_service",
  TECHNICAL_SUPPORT: "technical_support"
});

const FULL_ADMIN_PERMISSION_IDS = Object.freeze([
  "view_documents",
  "download_documents",
  "approve_documents",
  "reject_documents",
  "request_info_documents",
  "comment_documents",
  "add_internal_notes",
  "view_assigned_clients",
  "view_businesses",
  "view_upload_history",
  "view_activity_logs",
  "client_assistance",
  "impersonate_clients",
  "view_client_settings",
  "edit_client_settings",
  "manage_technical_client_config",
  "send_notifications",
  "approve_verification",
  "manage_users",
  "manage_admin_roles",
  "assign_clients_to_area",
  "reset_admin_password",
  "manage_system_config",
  "view_system_audit_reports",
  "delete_data"
]);

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

const parseRoles = (roles = []) =>
  [...new Set(
    (Array.isArray(roles) ? roles : [])
      .map((role) => String(role || "").trim().toLowerCase())
      .filter(Boolean)
  )];

const dedupeStrings = (values = []) =>
  [...new Set(
    values
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];

export const normalizeAdminLevel = (adminLevel) => {
  const normalizedLevel = String(adminLevel || "").trim().toLowerCase();
  if (!normalizedLevel) return "";
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
  return "";
};

const deriveAdminLevelFromRoles = (roles = []) => {
  const normalizedRoles = parseRoles(roles);
  if (normalizedRoles.some((role) => role === "owner")) {
    return ADMIN_LEVELS.OWNER;
  }
  if (normalizedRoles.some((role) => role === "superadmin")) {
    return ADMIN_LEVELS.SUPER;
  }
  return "";
};

const sanitizeAdminPermissions = (permissions = []) => dedupeStrings(
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

const getDefaultPermissionsForAdminLevel = (adminLevel) => {
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
  if (normalizedLevel === ADMIN_LEVELS.TECHNICAL_SUPPORT) {
    return [...TECHNICAL_SUPPORT_PERMISSION_IDS];
  }
  return [...FULL_ADMIN_PERMISSION_IDS];
};

export const buildAdminAccessContext = ({
  identity = {},
  user = null
} = {}) => {
  const roles = parseRoles([
    ...(Array.isArray(identity?.roles) ? identity.roles : []),
    ...(Array.isArray(user?.roles) ? user.roles : [])
  ]);
  const normalizedAdminLevel = normalizeAdminLevel(
    user?.adminAccess?.adminLevel || deriveAdminLevelFromRoles(roles)
  );
  const explicitPermissions = sanitizeAdminPermissions(user?.adminAccess?.adminPermissions);
  const effectiveAdminPermissions =
    explicitPermissions.length > 0
      ? explicitPermissions
      : getDefaultPermissionsForAdminLevel(normalizedAdminLevel || deriveAdminLevelFromRoles(roles));

  return {
    adminLevel: normalizedAdminLevel,
    adminPermissions: effectiveAdminPermissions
  };
};
