import { env } from "../config/env.js";
import { buildAdminAccessContext } from "../utils/admin-access.js";

const ADMIN_ROLES = new Set(["admin", "owner", "superadmin"]);

const PUBLIC_ROUTE_KEYS = new Set([
  "GET /gateway/info",
  "POST /notifications/contact",
  "POST /notifications/insights/analytics/events",
  "GET /notifications/insights/articles",
  "GET /notifications/insights/articles/search",
  "POST /notifications/support/public/tickets",
  "GET /notifications/support/public/tickets",
  "GET /users/public/phone-availability",
  "POST /users/public/support-leads",
  "POST /users/public/newsletters",
  "GET /users/public/client-team-invite",
  "GET /auth/bootstrap-owner-status",
  "POST /auth/authenticate-password",
  "POST /auth/register-account",
  "POST /auth/login-session",
  "POST /auth/refresh-token",
  "POST /auth/send-otp",
  "POST /auth/send-email-verification-link",
  "POST /auth/send-password-reset-link",
  "POST /auth/verify-otp",
  "POST /auth/verify-token",
  "POST /auth/social-account-status"
]);

const normalizePath = (pathValue) => {
  if (!pathValue || pathValue === "/") {
    return "/";
  }

  return pathValue.endsWith("/") ? pathValue.slice(0, -1) : pathValue;
};

const isPublicRoute = (method, pathValue) => {
  if (method.toUpperCase() === "OPTIONS") {
    return true;
  }

  const normalizedPath = normalizePath(pathValue);
  const normalizedMethod = method.toUpperCase();
  if (
    normalizedMethod === "GET"
    && normalizedPath.startsWith("/notifications/insights/articles/")
  ) {
    return true;
  }
  if (
    (normalizedMethod === "GET" || normalizedMethod === "POST")
    && normalizedPath.startsWith("/notifications/support/public/tickets/")
    && normalizedPath.endsWith("/messages")
  ) {
    return true;
  }

  const key = `${normalizedMethod} ${normalizedPath}`;
  return PUBLIC_ROUTE_KEYS.has(key);
};

const extractBearerToken = (authorizationHeader) => {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return "";
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return "";
  }

  return token.trim();
};

const parseCookieHeader = (cookieHeader = "") =>
  String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex <= 0) {
        return accumulator;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      if (key) {
        accumulator[key] = value;
      }
      return accumulator;
    }, {});

const extractCookieToken = (cookieHeader, cookieName) => {
  const cookies = parseCookieHeader(cookieHeader);
  return String(cookies[cookieName] || "").trim();
};

const extractSessionId = (sessionHeader) => {
  if (!sessionHeader || typeof sessionHeader !== "string") {
    return "";
  }

  return sessionHeader.trim();
};

const normalizeRoles = (rolesValue) => {
  if (Array.isArray(rolesValue)) {
    return rolesValue
      .map((role) => String(role).trim().toLowerCase())
      .filter(Boolean);
  }

  if (typeof rolesValue === "string") {
    return rolesValue
      .split(",")
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean);
  }

  return [];
};

const shouldLoadAdminAccess = (roles = []) =>
  (Array.isArray(roles) ? roles : []).some((role) =>
    ADMIN_ROLES.has(String(role || "").trim().toLowerCase())
  );

const verifyTokenWithAuthService = async ({
  idToken,
  accessToken,
  sessionId,
  requestId
}) => {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, env.authVerifyTimeoutMs);

  try {
    const response = await fetch(`${env.authServiceUrl}/api/v1/auth/verify-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(requestId ? { "x-request-id": requestId } : {})
      },
      body: JSON.stringify({ idToken, accessToken, sessionId }),
      signal: abortController.signal
    });

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchUserProfileFromUsersService = async ({
  identity,
  requestId
}) => {
  if (!identity?.uid || !env.usersServiceUrl) {
    return null;
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, env.authVerifyTimeoutMs);

  try {
    const response = await fetch(`${env.usersServiceUrl}/api/v1/users/me`, {
      method: "GET",
      headers: {
        ...(requestId ? { "x-request-id": requestId } : {}),
        "x-user-id": identity.uid,
        "x-user-email": identity.email || "",
        "x-user-roles": (Array.isArray(identity.roles) ? identity.roles : []).join(",")
      },
      signal: abortController.signal
    });

    if (!response.ok) {
      return null;
    }

    return await response.json().catch(() => null);
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.warn("auth-guard admin access enrichment warning:", error.message);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const authGuardMiddleware = async (req, res, next) => {
  if (isPublicRoute(req.method, req.path)) {
    return next();
  }

  const idTokenFromHeader = extractBearerToken(req.headers.authorization);
  const accessTokenFromCookie = extractCookieToken(req.headers.cookie, "kiamina_access_token");
  const idToken = idTokenFromHeader;
  const accessToken = accessTokenFromCookie;

  if (!idToken && !accessToken) {
    return res.status(401).json({
      message:
        "Missing authentication token. Provide Authorization Bearer token or kiamina_access_token cookie."
    });
  }

  const sessionIdHeader = extractSessionId(req.headers["x-session-id"]);
  const sessionIdCookie = extractCookieToken(req.headers.cookie, "kiamina_session_id");
  const sessionId = sessionIdHeader || sessionIdCookie || "";
  if (!sessionId && idToken && !accessToken) {
    return res.status(401).json({
      message: "Missing x-session-id header or kiamina_session_id cookie for authenticated request."
    });
  }

  try {
    const response = await verifyTokenWithAuthService({
      idToken,
      accessToken,
      sessionId,
      requestId: req.id
    });

    if (response.status === 401 || response.status === 400 || response.status === 403) {
      return res.status(401).json({
        message: "Invalid, expired, or revoked token/session."
      });
    }

    if (!response.ok) {
      return res.status(503).json({
        message: "Authentication service is currently unavailable."
      });
    }

    const identity = await response.json();
    if (!identity?.uid) {
      return res.status(401).json({
        message: "Token verification failed."
      });
    }

    const normalizedRoles = normalizeRoles(identity.roles);
    let adminLevel = "";
    let adminPermissions = [];

    if (shouldLoadAdminAccess(normalizedRoles)) {
      const userProfile = await fetchUserProfileFromUsersService({
        identity: {
          uid: identity.uid,
          email: identity.email || "",
          roles: normalizedRoles
        },
        requestId: req.id
      });
      const adminContext = buildAdminAccessContext({
        identity: {
          uid: identity.uid,
          email: identity.email || "",
          roles: normalizedRoles
        },
        user: userProfile
      });
      adminLevel = adminContext.adminLevel || "";
      adminPermissions = Array.isArray(adminContext.adminPermissions)
        ? adminContext.adminPermissions
        : [];
    }

    req.user = {
      uid: identity.uid,
      email: identity.email || "",
      emailVerified: Boolean(identity.emailVerified),
      sessionId: identity.sessionId || sessionId || "",
      roles: normalizedRoles,
      adminLevel,
      adminPermissions
    };

    return next();
  } catch (error) {
    if (error.name === "AbortError") {
      return res.status(503).json({
        message: "Authentication service timeout."
      });
    }

    console.error("auth-guard error:", error.message);
    return res.status(503).json({
      message: "Authentication service is currently unavailable."
    });
  }
};
