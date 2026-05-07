import { env } from "../config/env.js";

const stripApiPrefix = (pathValue) => {
  const trimmedPath =
    !pathValue || pathValue === "/"
      ? "/"
      : pathValue.endsWith("/")
        ? pathValue.slice(0, -1)
        : pathValue;

  if (trimmedPath === "/api/v1") {
    return "/";
  }

  return trimmedPath.startsWith("/api/v1")
    ? trimmedPath.replace(/^\/api\/v1/, "")
    : trimmedPath;
};

const isPublicAuthOrAvailabilityRoute = (normalizedMethod, normalizedPath) =>
  (normalizedMethod === "GET" || normalizedMethod === "POST") &&
  (
    normalizedPath === "/auth/bootstrap-owner-status" ||
    normalizedPath === "/auth/authenticate-password" ||
    normalizedPath === "/auth/register-account" ||
    normalizedPath === "/auth/login-session" ||
    normalizedPath === "/auth/refresh-token" ||
    normalizedPath === "/auth/send-otp" ||
    normalizedPath === "/auth/send-email-verification-link" ||
    normalizedPath === "/auth/send-password-reset-link" ||
    normalizedPath === "/auth/verify-otp" ||
    normalizedPath === "/auth/verify-token" ||
    normalizedPath === "/auth/social-account-status" ||
    normalizedPath === "/users/public/phone-availability"
  );

const getPublicRouteLimiterKey = (methodValue, pathValue) => {
  const normalizedMethod = methodValue.toUpperCase();
  const normalizedPath = stripApiPrefix(pathValue);

  if (normalizedMethod === "GET" && normalizedPath === "/notifications/insights/articles") {
    return "insights-list";
  }

  if (
    normalizedMethod === "GET" &&
    normalizedPath.startsWith("/notifications/insights/articles/")
  ) {
    return "insights-detail";
  }

  if (
    normalizedMethod === "POST" &&
    normalizedPath === "/notifications/insights/analytics/events"
  ) {
    return "insights-analytics";
  }

  if (normalizedMethod === "POST" && normalizedPath === "/notifications/contact") {
    return "contact-form";
  }

  if (
    (normalizedMethod === "GET" || normalizedMethod === "POST") &&
    normalizedPath.startsWith("/notifications/support/public/tickets")
  ) {
    if (
      normalizedPath === "/notifications/support/public/tickets" ||
      normalizedPath.endsWith("/messages")
    ) {
      return "support-public";
    }
  }

  if (isPublicAuthOrAvailabilityRoute(normalizedMethod, normalizedPath)) {
    return "public-auth";
  }

  if (normalizedMethod === "POST" && normalizedPath === "/users/public/support-leads") {
    return "support-leads";
  }

  return "";
};

const isRateLimitExemptPublicRoute = (methodValue, pathValue) => {
  const normalizedMethod = methodValue.toUpperCase();
  const normalizedPath = stripApiPrefix(pathValue);

  if (normalizedMethod === "POST" && normalizedPath === "/users/public/support-leads") {
    return true;
  }

  if (
    normalizedMethod === "POST" &&
    normalizedPath === "/notifications/insights/analytics/events"
  ) {
    return true;
  }

  if (
    normalizedMethod === "GET" &&
    (normalizedPath === "/notifications/insights/articles" || normalizedPath === "/notifications/insights/articles/search")
  ) {
    return true;
  }

  if (
    (normalizedMethod === "GET" || normalizedMethod === "POST") &&
    normalizedPath.startsWith("/notifications/insights/articles/")
  ) {
    return true;
  }

  if (
    (normalizedMethod === "GET" || normalizedMethod === "POST") &&
    normalizedPath.startsWith("/notifications/support/public/tickets")
  ) {
    return true;
  }

  if (isPublicAuthOrAvailabilityRoute(normalizedMethod, normalizedPath)) {
    return true;
  }

  return false;
};

const getRequestLimit = (publicRouteLimiterKey) => {
  if (!publicRouteLimiterKey) {
    return env.requestsPerMinute;
  }

  return env.requestsPerMinute * 10;
};

const buildHeaders = () => ({
  Authorization: `Bearer ${env.upstashRestToken}`
});

const callUpstash = async (commandPath) => {
  const baseUrl = env.upstashRestUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${commandPath}`, {
    method: "POST",
    headers: buildHeaders()
  });

  if (!response.ok) {
    throw new Error(`Upstash request failed with status ${response.status}`);
  }

  return response.json();
};

export const rateLimitMiddleware = async (req, res, next) => {
  if (!env.upstashRestUrl || !env.upstashRestToken) {
    return next();
  }

  if (isRateLimitExemptPublicRoute(req.method, req.path)) {
    return next();
  }

  const publicRouteLimiterKey = getPublicRouteLimiterKey(req.method, req.path);
  const ipAddress =
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown";
  const bucket = Math.floor(Date.now() / 60000);
  const routeBucketSuffix = publicRouteLimiterKey
    ? `:${publicRouteLimiterKey}`
    : "";
  const key = `gateway:ratelimit:${ipAddress}${routeBucketSuffix}:${bucket}`;
  const encodedKey = encodeURIComponent(key);
  const requestLimit = getRequestLimit(publicRouteLimiterKey);

  try {
    const result = await callUpstash(`/incr/${encodedKey}`);
    const currentCount = Number(result.result || 0);

    if (currentCount === 1) {
      void callUpstash(`/expire/${encodedKey}/60`);
    }

    if (currentCount > requestLimit) {
      return res.status(429).json({
        message: "Too many requests. Please try again shortly."
      });
    }
  } catch (error) {
    console.error("Rate limit middleware warning:", error.message);
  }

  return next();
};
