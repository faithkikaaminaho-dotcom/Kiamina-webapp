import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { env } from "../../config/env.js";
import { authGuardMiddleware } from "../../middleware/auth-guard.js";
import { responseCacheMiddleware } from "../../middleware/response-cache.js";

const router = express.Router();

const createDomainProxy = (targetUrl, servicePrefix) =>
  createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    xfwd: true,
    pathRewrite: (path) => `${servicePrefix}${path}`,
    on: {
      proxyReq: (proxyReq, req) => {
        if (req.id) {
          proxyReq.setHeader("x-request-id", req.id);
        }
        if (req.user?.uid) {
          proxyReq.setHeader("x-user-id", req.user.uid);
        }
        if (req.user?.email) {
          proxyReq.setHeader("x-user-email", req.user.email);
        }
        if (typeof req.user?.emailVerified === "boolean") {
          proxyReq.setHeader(
            "x-user-email-verified",
            String(req.user.emailVerified)
          );
        }
        if (req.user?.sessionId) {
          proxyReq.setHeader("x-session-id", req.user.sessionId);
        }
        if (Array.isArray(req.user?.roles) && req.user.roles.length > 0) {
          proxyReq.setHeader("x-user-roles", req.user.roles.join(","));
        }
        if (req.user?.adminLevel) {
          proxyReq.setHeader("x-user-admin-level", req.user.adminLevel);
        }
        if (Array.isArray(req.user?.adminPermissions) && req.user.adminPermissions.length > 0) {
          proxyReq.setHeader(
            "x-user-admin-permissions",
            req.user.adminPermissions.join(",")
          );
        }
      }
    }
  });

router.get("/gateway/info", (req, res) => {
  res.json({
    service: env.serviceName,
    version: "v1",
    dependencies: {
      authServiceUrl: env.authServiceUrl,
      usersServiceUrl: env.usersServiceUrl,
      documentsServiceUrl: env.documentsServiceUrl,
      notificationsServiceUrl: env.notificationsServiceUrl
    }
  });
});

router.use(authGuardMiddleware);

// Keep SSE stream outside response cache to avoid buffering long-lived connections.
router.get(
  "/notifications/events/stream",
  createDomainProxy(env.notificationsServiceUrl, "/api/v1")
);

router.use(responseCacheMiddleware);

router.use("/auth", createDomainProxy(env.authServiceUrl, "/api/v1/auth"));
router.use("/users", createDomainProxy(env.usersServiceUrl, "/api/v1/users"));
router.use(
  "/documents",
  createDomainProxy(env.documentsServiceUrl, "/api/v1/documents")
);
router.use(
  "/notifications",
  createDomainProxy(env.notificationsServiceUrl, "/api/v1/notifications")
);

export default router;
