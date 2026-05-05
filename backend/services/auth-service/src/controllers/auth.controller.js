import { env } from "../config/env.js";
import { issueOtpChallenge, verifyOtpChallenge } from "../services/otp.service.js";
import { issueSmsOtpChallenge, verifySmsOtpChallenge } from "../services/sms-otp.service.js";
import {
  createFirebaseUser,
  generateFirebaseEmailVerificationLink,
  generateFirebasePasswordResetLink,
  updateFirebaseUserProfile,
  updateFirebaseUserPassword,
  verifyFirebaseIdToken
} from "../services/firebase-admin.service.js";
import { signInWithFirebasePassword } from "../services/firebase-identity.service.js";
import {
  assertActiveSessionForUid,
  createLoginSessionRecord,
  deleteAuthAccountForUid,
  getRegisteredAuthAccountByEmail,
  getOwnerBootstrapEligibility,
  listRegisteredAuthAccounts,
  refreshSessionTokenHash,
  registerOrUpdateAuthAccount,
  revokeSessionForUid,
  updateManagedAuthAccountByUid
} from "../services/auth-accounts.service.js";
import {
  assertCredentialLoginAllowed,
  clearCredentialLoginLockout,
  LOGIN_LOCKOUT_MESSAGE,
  registerCredentialLoginFailure
} from "../services/credential-login-lockout.service.js";
import {
  createAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyAccessToken
} from "../services/auth-tokens.service.js";
import {
  dispatchEmailVerificationLink,
  dispatchOtpEmail,
  dispatchPasswordResetLink
} from "../services/auth-messaging.service.js";
import {
  validateChangePasswordPayload,
  validateSendEmailVerificationLinkPayload,
  validatePasswordLoginPayload,
  validateLogoutSessionPayload,
  validateRefreshTokenPayload,
  validateLoginSessionPayload,
  validateRegisterAccountPayload,
  validateSendPasswordResetLinkPayload,
  validateSendOtpPayload,
  validateSendSmsOtpPayload,
  validateSocialAuthAccountStatusPayload,
  validateVerifyOtpPayload,
  validateVerifySmsOtpPayload,
  validateVerifyTokenPayload
} from "../validation/auth.validation.js";

const ACCESS_COOKIE_NAME = "kiamina_access_token";
const REFRESH_COOKIE_NAME = "kiamina_refresh_token";
const SESSION_COOKIE_NAME = "kiamina_session_id";
const ELEVATED_ADMIN_ROLES = new Set(["owner", "superadmin"]);

const buildAppActionLinkFromFirebaseLink = ({
  appLink,
  firebaseLink,
  mode
}) => {
  const baseUrl = new URL(String(appLink || "").trim());
  const generatedUrl = new URL(String(firebaseLink || "").trim());
  const oobCode = String(generatedUrl.searchParams.get("oobCode") || "").trim();

  if (!oobCode) {
    throw new Error("Firebase action link is missing oobCode.");
  }

  baseUrl.searchParams.set("mode", String(mode || "").trim());
  baseUrl.searchParams.set("oobCode", oobCode);
  return baseUrl.toString();
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

const getCookieValue = (req, cookieName) => {
  const cookies = parseCookieHeader(req.headers.cookie || "");
  return String(cookies[cookieName] || "").trim();
};

const normalizeRoles = (decodedToken) => {
  const rawRoles = decodedToken?.roles ?? decodedToken?.role;

  if (Array.isArray(rawRoles)) {
    return [...new Set(rawRoles.map((role) => String(role).trim().toLowerCase()).filter(Boolean))];
  }

  if (typeof rawRoles === "string") {
    return [
      ...new Set(
        rawRoles
          .split(",")
          .map((role) => role.trim().toLowerCase())
          .filter(Boolean)
      )
    ];
  }

  return [];
};

const getActorUid = (req) => {
  const actorUid = req.headers["x-user-id"];
  return actorUid ? String(actorUid) : "";
};

const getActorRoles = (req) => {
  const raw = req.headers["x-user-roles"];
  if (Array.isArray(raw)) {
    return raw
      .map((role) => String(role || "").trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
};

const isElevatedAdminActor = (req) =>
  getActorRoles(req).some((role) => ELEVATED_ADMIN_ROLES.has(role));

const getActorEmail = (req) =>
  String(req.headers["x-user-email"] || "").trim().toLowerCase();

const resolveAccountDeletionReason = (payload = {}, fallback = "account-deleted") => {
  const source = payload && typeof payload === "object" ? payload : {};
  const rawReason =
    source.reason ||
    source.retentionIntent ||
    source.reasonOther ||
    fallback;
  const normalized = String(rawReason || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized.slice(0, 120);
};

const getRequestIpAddress = (req) =>
  String(
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
      req.socket.remoteAddress ||
      ""
  );

const MANAGED_ACCOUNT_ROLES = new Set(["admin", "owner", "superadmin"]);
const MANAGED_ACCOUNT_STATUSES = new Set(["active", "disabled", "suspended", "pending"]);

const buildManagedAccountCreatePayload = (source = {}) => {
  const payload = source && typeof source === "object" ? source : {};
  const email = String(payload.email || "").trim().toLowerCase();
  const fullName = String(payload.fullName || "").trim();
  const password = String(payload.password || "");
  const role = String(payload.role || "admin").trim().toLowerCase();
  const status = String(payload.status || "active").trim().toLowerCase();
  const errors = [];

  if (!email) errors.push("email is required");
  if (!fullName) errors.push("fullName is required");
  if (!password) errors.push("password is required");
  if (!MANAGED_ACCOUNT_ROLES.has(role)) {
    errors.push("role must be one of: admin, owner, superadmin");
  }
  if (!MANAGED_ACCOUNT_STATUSES.has(status)) {
    errors.push("status must be one of: active, disabled, suspended, pending");
  }

  return {
    errors,
    payload: { email, fullName, password, role, status }
  };
};

const buildManagedAccountUpdatePayload = (source = {}) => {
  const payload = source && typeof source === "object" ? source : {};
  const nextPayload = {};
  const errors = [];

  if (payload.email !== undefined) {
    const email = String(payload.email || "").trim().toLowerCase();
    if (!email) {
      errors.push("email cannot be empty");
    } else {
      nextPayload.email = email;
    }
  }

  if (payload.fullName !== undefined) {
    nextPayload.fullName = String(payload.fullName || "").trim();
  }

  if (payload.role !== undefined) {
    const role = String(payload.role || "").trim().toLowerCase();
    if (!MANAGED_ACCOUNT_ROLES.has(role)) {
      errors.push("role must be one of: admin, owner, superadmin");
    } else {
      nextPayload.role = role;
    }
  }

  if (payload.status !== undefined) {
    const status = String(payload.status || "").trim().toLowerCase();
    if (!MANAGED_ACCOUNT_STATUSES.has(status)) {
      errors.push("status must be one of: active, disabled, suspended, pending");
    } else {
      nextPayload.status = status;
    }
  }

  return { errors, payload: nextPayload };
};

const toCookieOptions = (maxAgeMs) => ({
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: "lax",
  path: "/",
  ...(env.authCookieDomain ? { domain: env.authCookieDomain } : {}),
  maxAge: maxAgeMs
});

const setAuthCookies = ({
  res,
  accessToken,
  accessTokenExpiresAt,
  refreshToken,
  sessionId,
  sessionExpiresAt
}) => {
  const now = Date.now();
  const accessMaxAgeMs = Math.max(
    1,
    (accessTokenExpiresAt instanceof Date
      ? accessTokenExpiresAt.getTime()
      : Date.now() + env.accessTokenTtlMinutes * 60 * 1000) - now
  );
  const sessionMaxAgeMs = Math.max(
    1,
    (sessionExpiresAt instanceof Date
      ? sessionExpiresAt.getTime()
      : Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000) - now
  );

  res.cookie(ACCESS_COOKIE_NAME, accessToken, toCookieOptions(accessMaxAgeMs));
  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    {
      ...toCookieOptions(sessionMaxAgeMs),
      path: "/api/v1/auth"
    }
  );
  res.cookie(SESSION_COOKIE_NAME, sessionId, toCookieOptions(sessionMaxAgeMs));
};

const clearAuthCookies = (res) => {
  const baseOptions = {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    ...(env.authCookieDomain ? { domain: env.authCookieDomain } : {})
  };

  res.clearCookie(ACCESS_COOKIE_NAME, {
    ...baseOptions,
    path: "/"
  });
  res.clearCookie(REFRESH_COOKIE_NAME, {
    ...baseOptions,
    path: "/api/v1/auth"
  });
  res.clearCookie(SESSION_COOKIE_NAME, {
    ...baseOptions,
    path: "/"
  });
};

const OTP_DELIVERY_ERROR_MESSAGES = {
  "notifications-service-url-not-configured":
    "OTP email delivery is not configured on the server.",
  "notification-request-timeout":
    "OTP email delivery timed out while contacting the notifications service.",
  "notification-request-failed":
    "OTP email delivery failed while contacting the notifications service."
};

const formatOtpDeliveryErrorMessage = (reason = "") => {
  const normalizedReason = String(reason || "").trim();
  if (!normalizedReason) {
    return "OTP challenge created but we could not deliver the OTP email.";
  }

  if (OTP_DELIVERY_ERROR_MESSAGES[normalizedReason]) {
    return OTP_DELIVERY_ERROR_MESSAGES[normalizedReason];
  }

  if (normalizedReason.startsWith("notification-service-status-")) {
    const statusCode = normalizedReason.slice("notification-service-status-".length);
    return `OTP email delivery failed with notifications service status ${statusCode}.`;
  }

  return "OTP challenge created but OTP email delivery failed.";
};

export const sendOtp = async (req, res, next) => {
  try {
    const { errors, payload } = validateSendOtpPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const result = await issueOtpChallenge(payload);
    const dispatchResult = await dispatchOtpEmail({
      email: payload.email,
      otp: result.otp,
      purpose: payload.purpose,
      expiryMinutes: env.otpExpiryMinutes
    });

    if (!dispatchResult.queued) {
      if (env.nodeEnv !== "production") {
        return res.status(202).json({
          message:
            "OTP challenge created (development preview enabled because email delivery failed).",
          challengeId: result.challengeId,
          expiresAt: result.expiresAt,
          dispatchQueued: false,
          deliveryError: formatOtpDeliveryErrorMessage(dispatchResult.reason),
          reason: dispatchResult.reason || "notification-request-failed",
          previewOtp: result.otp
        });
      }

      return res.status(502).json({
        message: formatOtpDeliveryErrorMessage(dispatchResult.reason),
        reason: dispatchResult.reason || "notification-request-failed",
        challengeId: result.challengeId,
        expiresAt: result.expiresAt,
        previewOtp: env.nodeEnv === "production" ? undefined : result.otp
      });
    }

    return res.status(202).json({
      message: "OTP challenge created.",
      challengeId: result.challengeId,
      expiresAt: result.expiresAt,
      dispatchQueued: true,
      previewOtp: env.nodeEnv === "production" ? undefined : result.otp
    });
  } catch (error) {
    return next(error);
  }
};

export const authenticatePassword = async (req, res, next) => {
  try {
    const { errors, payload } = validatePasswordLoginPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    await assertCredentialLoginAllowed(payload.email);
    const result = await signInWithFirebasePassword(payload);
    if (!result.ok || !result.idToken) {
      if (result.status >= 500) {
        return res.status(result.status || 503).json({
          message: "Unable to verify credentials right now."
        });
      }

      const failureState = await registerCredentialLoginFailure(payload.email);
      if (failureState.locked) {
        return res.status(423).json({
          message: LOGIN_LOCKOUT_MESSAGE,
          remainingMs: failureState.remainingMs
        });
      }

      return res.status(401).json({
        message: "Incorrect email or password"
      });
    }

    await clearCredentialLoginLockout(payload.email);
    return res.status(200).json({
      message: "Credentials verified.",
      uid: result.uid,
      email: result.email,
      idToken: result.idToken
    });
  } catch (error) {
    return next(error);
  }
};

export const verifyOtp = async (req, res, next) => {
  try {
    const { errors, payload } = validateVerifyOtpPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const result = await verifyOtpChallenge(payload);
    if (!result.success) {
      return res.status(400).json({ message: result.reason });
    }

    return res.status(200).json({
      message: "OTP verified successfully."
    });
  } catch (error) {
    return next(error);
  }
};

export const verifyToken = async (req, res, next) => {
  try {
    const { idToken, accessToken, sessionId, error } = validateVerifyTokenPayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const verifiedAccessToken = accessToken ? verifyAccessToken(accessToken) : null;
    if (verifiedAccessToken) {
      await assertActiveSessionForUid({
        sessionId: verifiedAccessToken.sessionId,
        uid: verifiedAccessToken.uid
      });

      return res.status(200).json({
        uid: verifiedAccessToken.uid,
        email: verifiedAccessToken.email || null,
        emailVerified: true,
        authTime: null,
        roles: normalizeRoles(verifiedAccessToken),
        sessionId: verifiedAccessToken.sessionId || null,
        tokenType: "access-token"
      });
    }

    const decoded = idToken ? await verifyFirebaseIdToken(idToken) : null;
    if (!decoded) {
      return res.status(401).json({
        message: accessToken
          ? "Invalid or expired access token."
          : "Token verification failed. Configure Firebase Admin credentials and retry."
      });
    }

    const resolvedSessionId = sessionId || "";
    if (resolvedSessionId) {
      await assertActiveSessionForUid({
        sessionId: resolvedSessionId,
        uid: decoded.uid
      });
    }

    return res.status(200).json({
      uid: decoded.uid,
      email: decoded.email || null,
      emailVerified: Boolean(decoded.email_verified),
      authTime: decoded.auth_time || null,
      roles: normalizeRoles(decoded),
      sessionId: resolvedSessionId || null,
      tokenType: "firebase-id-token"
    });
  } catch (error) {
    return next(error);
  }
};

export const getBootstrapOwnerStatus = async (req, res, next) => {
  try {
    const status = await getOwnerBootstrapEligibility();
    return res.status(200).json({
      canBootstrapOwner: Boolean(status.canBootstrapOwner),
      adminAccountCount: Number(status.adminAccountCount || 0),
      message: status.canBootstrapOwner
        ? "Owner bootstrap is available."
        : "Owner bootstrap is disabled because an admin account already exists."
    });
  } catch (error) {
    return next(error);
  }
};

export const listAccounts = async (req, res, next) => {
  try {
    const actorUid = getActorUid(req);
    if (!actorUid) {
      return res.status(401).json({
        message: "Missing x-user-id header from authenticated gateway request"
      });
    }
    if (!isElevatedAdminActor(req)) {
      return res.status(403).json({
        message: "Only owner or superadmin users can list auth accounts."
      });
    }

    const limit = Math.max(1, Math.min(500, Number(req.query?.limit) || 200));
    const accounts = await listRegisteredAuthAccounts({ limit });
    return res.status(200).json({
      accounts: accounts.map((account) => ({
        uid: account.uid,
        email: account.email,
        fullName: account.fullName,
        role: account.role,
        provider: account.provider,
        status: account.status,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        lastLoginAt: account.lastLoginAt
      }))
    });
  } catch (error) {
    return next(error);
  }
};

export const createManagedAccount = async (req, res, next) => {
  try {
    const actorUid = getActorUid(req);
    if (!actorUid) {
      return res.status(401).json({
        message: "Missing x-user-id header from authenticated gateway request"
      });
    }
    if (!isElevatedAdminActor(req)) {
      return res.status(403).json({
        message: "Only owner or superadmin users can create managed auth accounts."
      });
    }

    const { errors, payload } = buildManagedAccountCreatePayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const createdFirebaseUser = await createFirebaseUser({
      email: payload.email,
      password: payload.password,
      displayName: payload.fullName
    });
    if (!createdFirebaseUser.ok || !createdFirebaseUser.uid) {
      return res.status(503).json({
        message: "Unable to create managed auth account right now."
      });
    }

    const result = await registerOrUpdateAuthAccount({
      uid: createdFirebaseUser.uid,
      email: payload.email,
      fullName: payload.fullName,
      role: payload.role,
      provider: "email-password",
      status: payload.status,
      emailVerified: false,
      phoneVerified: false
    });

    return res.status(result.created ? 201 : 200).json({
      message: result.created ? "Managed auth account created." : "Managed auth account updated.",
      account: {
        uid: result.account.uid,
        email: result.account.email,
        fullName: result.account.fullName,
        role: result.account.role,
        provider: result.account.provider,
        status: result.account.status
      }
    });
  } catch (error) {
    return next(error);
  }
};

export const updateManagedAccount = async (req, res, next) => {
  try {
    const actorUid = getActorUid(req);
    if (!actorUid) {
      return res.status(401).json({
        message: "Missing x-user-id header from authenticated gateway request"
      });
    }
    if (!isElevatedAdminActor(req)) {
      return res.status(403).json({
        message: "Only owner or superadmin users can update managed auth accounts."
      });
    }

    const targetUid = String(req.params.uid || "").trim();
    if (!targetUid) {
      return res.status(400).json({ message: "uid is required." });
    }

    const { errors, payload } = buildManagedAccountUpdatePayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        message: "Provide at least one field: email, fullName, role, status"
      });
    }

    const firebaseUpdate = await updateFirebaseUserProfile({
      uid: targetUid,
      email: payload.email,
      displayName: payload.fullName,
      disabled: payload.status !== undefined
        ? payload.status === "disabled" || payload.status === "suspended"
        : undefined
    });
    if (!firebaseUpdate.ok) {
      return res.status(503).json({
        message: "Unable to update managed auth account right now."
      });
    }

    const updated = await updateManagedAuthAccountByUid({
      uid: targetUid,
      email: payload.email,
      fullName: payload.fullName,
      role: payload.role,
      status: payload.status
    });

    return res.status(200).json({
      message: "Managed auth account updated.",
      account: {
        uid: updated.uid,
        email: updated.email,
        fullName: updated.fullName,
        role: updated.role,
        provider: updated.provider,
        status: updated.status
      }
    });
  } catch (error) {
    return next(error);
  }
};

export const resetManagedAccountPassword = async (req, res, next) => {
  try {
    const actorUid = getActorUid(req);
    if (!actorUid) {
      return res.status(401).json({
        message: "Missing x-user-id header from authenticated gateway request"
      });
    }
    if (!isElevatedAdminActor(req)) {
      return res.status(403).json({
        message: "Only owner or superadmin users can reset managed auth account passwords."
      });
    }

    const targetUid = String(req.params.uid || "").trim();
    if (!targetUid) {
      return res.status(400).json({ message: "uid is required." });
    }

    const temporaryPassword = `Temp@${Math.floor(100000 + Math.random() * 900000)}`;
    const updateResult = await updateFirebaseUserPassword({
      uid: targetUid,
      newPassword: temporaryPassword
    });
    if (!updateResult.ok) {
      return res.status(503).json({
        message: "Unable to reset password right now."
      });
    }

    return res.status(200).json({
      message: "Managed auth account password reset.",
      temporaryPassword
    });
  } catch (error) {
    return next(error);
  }
};

export const getSocialAuthAccountStatus = async (req, res, next) => {
  try {
    const { errors, payload } = validateSocialAuthAccountStatusPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const decodedToken = await verifyFirebaseIdToken(payload.idToken);
    const normalizedEmail = String(decodedToken?.email || "").trim().toLowerCase();
    if (!decodedToken || !normalizedEmail) {
      return res.status(401).json({
        message: "Unable to verify the social sign-in token."
      });
    }

    const account = await getRegisteredAuthAccountByEmail(normalizedEmail);
    const requestedProvider = String(payload.provider || "google").trim().toLowerCase();
    const registeredProvider = String(account?.provider || "").trim().toLowerCase();
    const registeredProviders = Array.isArray(account?.providers)
      ? account.providers.map((provider) => String(provider || "").trim().toLowerCase()).filter(Boolean)
      : [];
    const hasPassword = Boolean(
      account?.hasPassword
      || registeredProvider === "email-password"
      || registeredProviders.includes("email-password")
    );
    const matchesProvider = Boolean(
      account
      && (
        registeredProvider === requestedProvider
        || registeredProviders.includes(requestedProvider)
        || (requestedProvider === "email-password" && hasPassword)
      )
    );

    return res.status(200).json({
      email: normalizedEmail,
      exists: Boolean(account),
      accountExists: Boolean(account),
      provider: registeredProvider,
      providers: registeredProviders,
      hasPassword,
      role: String(account?.role || "").trim().toLowerCase(),
      status: String(account?.status || "").trim().toLowerCase(),
      emailVerified: Boolean(account?.emailVerified),
      matchesProvider
    });
  } catch (error) {
    return next(error);
  }
};

export const sendPasswordResetLink = async (req, res, next) => {
  try {
    const { errors, payload } = validateSendPasswordResetLinkPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const generatedLinkResult = await generateFirebasePasswordResetLink(payload.email);
    if (!generatedLinkResult.ok || !generatedLinkResult.link) {
      return res.status(503).json({
        message: "Unable to generate password reset link right now."
      });
    }

    const resetLink = buildAppActionLinkFromFirebaseLink({
      appLink: payload.resetLink,
      firebaseLink: generatedLinkResult.link,
      mode: "reset-password"
    });

    const dispatchResult = await dispatchPasswordResetLink({
      email: payload.email,
      resetLink
    });

    return res.status(202).json({
      message: "Password reset link request accepted.",
      email: payload.email,
      dispatchQueued: Boolean(dispatchResult.queued),
      previewResetLink: env.nodeEnv === "production" ? undefined : resetLink
    });
  } catch (error) {
    return next(error);
  }
};

export const sendEmailVerificationLink = async (req, res, next) => {
  try {
    const { errors, payload } = validateSendEmailVerificationLinkPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const generatedLinkResult = await generateFirebaseEmailVerificationLink(payload.email);
    if (!generatedLinkResult.ok || !generatedLinkResult.link) {
      return res.status(503).json({
        message: "Unable to generate email verification link right now."
      });
    }

    const verificationLink = buildAppActionLinkFromFirebaseLink({
      appLink: payload.verificationLink,
      firebaseLink: generatedLinkResult.link,
      mode: "email-verification"
    });

    const dispatchResult = await dispatchEmailVerificationLink({
      email: payload.email,
      verificationLink
    });

    return res.status(202).json({
      message: "Email verification link request accepted.",
      email: payload.email,
      dispatchQueued: Boolean(dispatchResult.queued),
      previewVerificationLink: env.nodeEnv === "production" ? undefined : verificationLink
    });
  } catch (error) {
    return next(error);
  }
};

export const sendSmsOtp = async (req, res, next) => {
  try {
    const { errors, payload } = validateSendSmsOtpPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const result = await issueSmsOtpChallenge(payload);

    return res.status(202).json({
      message: "SMS OTP challenge created.",
      requestId: result.requestId,
      expiresAt: result.expiresAt,
      previewOtp: env.nodeEnv === "production" ? undefined : result.otp
    });
  } catch (error) {
    return next(error);
  }
};

export const verifySmsOtp = async (req, res, next) => {
  try {
    const { errors, payload } = validateVerifySmsOtpPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const result = await verifySmsOtpChallenge(payload);
    if (!result.success) {
      return res.status(400).json({ message: result.reason });
    }

    return res.status(200).json({
      message: "SMS OTP verified successfully."
    });
  } catch (error) {
    return next(error);
  }
};

export const registerAccount = async (req, res, next) => {
  try {
    const { errors, payload } = validateRegisterAccountPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const result = await registerOrUpdateAuthAccount(payload);

    return res.status(result.created ? 201 : 200).json({
      message: result.created ? "Account registration record created." : "Account registration record updated.",
      account: {
        uid: result.account.uid,
        email: result.account.email,
        fullName: result.account.fullName,
        role: result.account.role,
        provider: result.account.provider,
        providers: Array.isArray(result.account.providers) ? result.account.providers : [],
        hasPassword: Boolean(result.account.hasPassword),
        status: result.account.status,
        emailVerified: Boolean(result.account.emailVerified),
        phoneVerified: Boolean(result.account.phoneVerified),
        lastLoginAt: result.account.lastLoginAt
      }
    });
  } catch (error) {
    return next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const actorUid = getActorUid(req);
    const actorEmail = getActorEmail(req);
    if (!actorUid || !actorEmail) {
      return res.status(401).json({
        message: "Missing authenticated user identity from gateway request"
      });
    }

    const { errors, payload } = validateChangePasswordPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }
    if (payload.currentPassword === payload.newPassword) {
      return res.status(400).json({
        message: "New password must be different from your current password."
      });
    }

    const signInResult = await signInWithFirebasePassword({
      email: actorEmail,
      password: payload.currentPassword
    });
    if (!signInResult.ok || !signInResult.uid) {
      if (signInResult.status >= 500) {
        return res.status(signInResult.status || 503).json({
          message: "Unable to verify your current password right now."
        });
      }
      return res.status(401).json({
        message: "Current password is incorrect."
      });
    }
    if (signInResult.uid !== actorUid) {
      return res.status(403).json({
        message: "Current password does not match the authenticated account."
      });
    }

    const updateResult = await updateFirebaseUserPassword({
      uid: actorUid,
      newPassword: payload.newPassword
    });
    if (!updateResult.ok) {
      return res.status(503).json({
        message: "Unable to update your password right now."
      });
    }

    return res.status(200).json({
      message: "Your password has been updated successfully."
    });
  } catch (error) {
    return next(error);
  }
};

export const recordLoginSession = async (req, res, next) => {
  try {
    const { errors, payload } = validateLoginSessionPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const result = await createLoginSessionRecord({
      ...payload,
      ipAddress: payload.ipAddress || getRequestIpAddress(req),
      userAgent: payload.userAgent || String(req.headers["user-agent"] || ""),
      tokenHash: refreshTokenHash
    });

    const accessToken = createAccessToken({
      uid: result.account.uid,
      email: result.account.email,
      roles: [result.account.role].filter(Boolean),
      sessionId: result.session.sessionId
    });

    setAuthCookies({
      res,
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt,
      refreshToken,
      sessionId: result.session.sessionId,
      sessionExpiresAt: result.session.expiresAt
    });

    return res.status(201).json({
      message: "Login session recorded.",
      account: {
        uid: result.account.uid,
        email: result.account.email,
        role: result.account.role,
        status: result.account.status
      },
      session: {
        sessionId: result.session.sessionId,
        issuedAt: result.session.issuedAt,
        expiresAt: result.session.expiresAt,
        loginMethod: result.session.loginMethod
      },
      tokens: {
        accessTokenExpiresAt: accessToken.expiresAt
      }
    });
  } catch (error) {
    return next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const { errors, payload } = validateRefreshTokenPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const sessionId = payload.sessionId || getCookieValue(req, SESSION_COOKIE_NAME);
    const incomingRefreshToken = payload.refreshToken || getCookieValue(req, REFRESH_COOKIE_NAME);

    if (!sessionId || !incomingRefreshToken) {
      return res.status(400).json({
        message: "sessionId and refreshToken are required."
      });
    }

    const nextRefreshToken = generateRefreshToken();
    const result = await refreshSessionTokenHash({
      sessionId,
      refreshTokenHash: hashRefreshToken(incomingRefreshToken),
      nextRefreshTokenHash: hashRefreshToken(nextRefreshToken)
    });

    const nextAccessToken = createAccessToken({
      uid: result.account.uid,
      email: result.account.email,
      roles: [result.account.role].filter(Boolean),
      sessionId: result.session.sessionId
    });

    setAuthCookies({
      res,
      accessToken: nextAccessToken.token,
      accessTokenExpiresAt: nextAccessToken.expiresAt,
      refreshToken: nextRefreshToken,
      sessionId: result.session.sessionId,
      sessionExpiresAt: result.session.expiresAt
    });

    return res.status(200).json({
      message: "Access token refreshed successfully.",
      session: {
        sessionId: result.session.sessionId,
        expiresAt: result.session.expiresAt
      },
      tokens: {
        accessTokenExpiresAt: nextAccessToken.expiresAt
      }
    });
  } catch (error) {
    return next(error);
  }
};

export const logoutSession = async (req, res, next) => {
  try {
    const actorUid = getActorUid(req);
    if (!actorUid) {
      return res.status(401).json({
        message: "Missing x-user-id header from authenticated gateway request"
      });
    }

    const sessionIdFromCookie = getCookieValue(req, SESSION_COOKIE_NAME);
    const { errors, payload } = validateLogoutSessionPayload({
      ...(req.body && typeof req.body === "object" ? req.body : {}),
      sessionId: req.body?.sessionId || sessionIdFromCookie || ""
    });
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const result = await revokeSessionForUid({
      sessionId: payload.sessionId,
      uid: actorUid,
      reason: payload.reason || "logout"
    });
    clearAuthCookies(res);

    return res.status(200).json({
      message: result.revoked ? "Session revoked successfully." : "Session already revoked or expired.",
      session: {
        sessionId: result.session.sessionId,
        uid: result.session.uid,
        revokedAt: result.session.revokedAt || null,
        revokedReason: result.session.revokedReason || payload.reason || "logout"
      }
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteAccount = async (req, res, next) => {
  try {
    const actorUid = getActorUid(req);
    if (!actorUid) {
      return res.status(401).json({
        message: "Missing x-user-id header from authenticated gateway request"
      });
    }

    const reason = resolveAccountDeletionReason(req.body, "account-deleted");
    const result = await deleteAuthAccountForUid({
      uid: actorUid,
      reason
    });
    clearAuthCookies(res);

    return res.status(200).json({
      message: result.deleted ? "Auth account deleted successfully." : "Auth account not found.",
      uid: actorUid,
      deleted: Boolean(result.deleted),
      revokedSessionCount: Number(result.revokedSessionCount || 0),
      firebase: result.firebase || {}
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteAccountByUid = async (req, res, next) => {
  try {
    const actorUid = getActorUid(req);
    if (!actorUid) {
      return res.status(401).json({
        message: "Missing x-user-id header from authenticated gateway request"
      });
    }
    if (!isElevatedAdminActor(req)) {
      return res.status(403).json({
        message: "Only owner or superadmin users can delete another auth account."
      });
    }

    const targetUid = String(req.params.uid || "").trim();
    if (!targetUid) {
      return res.status(400).json({ message: "uid is required." });
    }

    const reason = resolveAccountDeletionReason(req.body, "admin-account-deleted");
    const result = await deleteAuthAccountForUid({
      uid: targetUid,
      reason
    });

    return res.status(200).json({
      message: result.deleted ? "Auth account deleted successfully." : "Auth account not found.",
      uid: targetUid,
      deleted: Boolean(result.deleted),
      revokedSessionCount: Number(result.revokedSessionCount || 0),
      firebase: result.firebase || {}
    });
  } catch (error) {
    return next(error);
  }
};
