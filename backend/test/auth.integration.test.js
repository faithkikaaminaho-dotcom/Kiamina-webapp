import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

let mongoServer;
let app;
let connectToDatabase;
let AuthAccount;
let AuthSession;
let CredentialLoginAttempt;
let setupError = null;

const ensureSetup = (t) => {
  if (!setupError) {
    return true;
  }

  t.skip(`Mongo integration setup unavailable: ${setupError.message}`);
  return false;
};

test.before(async () => {
  process.env.NODE_ENV = "test";
  process.env.SERVICE_NAME = "auth-service-test";
  process.env.MONGO_DB_NAME = "kiamina_auth_integration";
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
  process.env.FIREBASE_WEB_API_KEY = "test-web-api-key";
  process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret";
  process.env.MONGOMS_RUNTIME_DOWNLOAD = process.env.MONGOMS_RUNTIME_DOWNLOAD || "0";

  try {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();

    ({ default: app } = await import("../services/auth-service/src/app.js"));
    ({ connectToDatabase } = await import("../services/auth-service/src/config/db.js"));
    ({ AuthAccount } = await import("../services/auth-service/src/models/AuthAccount.model.js"));
    ({ AuthSession } = await import("../services/auth-service/src/models/AuthSession.model.js"));
    ({ CredentialLoginAttempt } = await import("../services/auth-service/src/models/CredentialLoginAttempt.model.js"));

    await connectToDatabase();
  } catch (error) {
    setupError = error;
  }
});

test.beforeEach(async () => {
  if (setupError) {
    return;
  }

  await AuthAccount.deleteMany({});
  await AuthSession.deleteMany({});
  await CredentialLoginAttempt.deleteMany({});
});

test.after(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }

  if (mongoServer) {
    await mongoServer.stop();
  }
});

test("auth integration: login-session and logout-session revoke lifecycle", async (t) => {
  if (!ensureSetup(t)) return;

  const loginResponse = await request(app).post("/api/v1/auth/login-session").send({
    email: "admin@example.com",
    role: "admin",
    loginMethod: "password",
    sessionTtlMinutes: 30,
    ipAddress: "127.0.0.1",
    userAgent: "integration-test"
  });

  assert.equal(loginResponse.status, 201);
  assert.ok(loginResponse.body?.account?.uid);
  assert.ok(loginResponse.body?.session?.sessionId);
  assert.ok(Array.isArray(loginResponse.headers["set-cookie"]));
  assert.ok(
    loginResponse.headers["set-cookie"].some((cookieValue) =>
      cookieValue.startsWith("kiamina_access_token=")
    )
  );
  assert.ok(
    loginResponse.headers["set-cookie"].some((cookieValue) =>
      cookieValue.startsWith("kiamina_refresh_token=")
    )
  );

  const uid = loginResponse.body.account.uid;
  const sessionId = loginResponse.body.session.sessionId;

  const logoutResponse = await request(app)
    .post("/api/v1/auth/logout-session")
    .set("x-user-id", uid)
    .send({
      sessionId,
      reason: "logout"
    });

  assert.equal(logoutResponse.status, 200);
  assert.equal(logoutResponse.body?.session?.sessionId, sessionId);
  assert.equal(logoutResponse.body?.session?.uid, uid);

  const dbSession = await AuthSession.findOne({ sessionId }).lean();
  assert.ok(dbSession?.revokedAt);
  assert.equal(dbSession?.revokedReason, "logout");

  const secondLogoutResponse = await request(app)
    .post("/api/v1/auth/logout-session")
    .set("x-user-id", uid)
    .send({
      sessionId
    });

  assert.equal(secondLogoutResponse.status, 200);
  assert.match(secondLogoutResponse.body?.message || "", /already revoked or expired/i);
});

test("auth integration: refresh-token rotates access and refresh cookies", async (t) => {
  if (!ensureSetup(t)) return;

  const agent = request.agent(app);

  const loginResponse = await agent.post("/api/v1/auth/login-session").send({
    email: "refresh@example.com",
    role: "admin",
    loginMethod: "password",
    sessionTtlMinutes: 60
  });

  assert.equal(loginResponse.status, 201);

  const refreshResponse = await agent.post("/api/v1/auth/refresh-token").send({});
  assert.equal(refreshResponse.status, 200);
  assert.match(refreshResponse.body?.message || "", /refreshed/i);
  assert.ok(Array.isArray(refreshResponse.headers["set-cookie"]));
  assert.ok(
    refreshResponse.headers["set-cookie"].some((cookieValue) =>
      cookieValue.startsWith("kiamina_access_token=")
    )
  );
});

test("auth integration: register-account migrates an existing email record to a new uid", async (t) => {
  if (!ensureSetup(t)) return;

  await AuthAccount.create({
    uid: "legacy_uid_1",
    email: "migrate-auth@example.com",
    fullName: "Legacy User",
    role: "client",
    provider: "email-password",
    status: "active",
    emailVerified: true
  });

  const response = await request(app).post("/api/v1/auth/register-account").send({
    uid: "firebase_uid_2",
    email: "migrate-auth@example.com",
    fullName: "Legacy User",
    role: "client",
    provider: "email-password",
    status: "active",
    emailVerified: true
  });

  assert.equal(response.status, 200);
  assert.equal(response.body?.account?.uid, "firebase_uid_2");

  const legacyAccount = await AuthAccount.findOne({ uid: "legacy_uid_1" }).lean();
  assert.equal(legacyAccount, null);

  const migratedAccount = await AuthAccount.findOne({
    uid: "firebase_uid_2",
    email: "migrate-auth@example.com"
  }).lean();
  assert.ok(migratedAccount);
});

test("auth integration: login-session rebinds stale email ownership to the current uid", async (t) => {
  if (!ensureSetup(t)) return;

  await AuthAccount.create({
    uid: "legacy_login_uid",
    email: "migrate-login@example.com",
    fullName: "Migrated Login",
    role: "client",
    provider: "email-password",
    status: "active",
    emailVerified: true
  });

  const loginResponse = await request(app).post("/api/v1/auth/login-session").send({
    uid: "firebase_login_uid",
    email: "migrate-login@example.com",
    role: "client",
    loginMethod: "otp",
    sessionTtlMinutes: 30
  });

  assert.equal(loginResponse.status, 201);
  assert.equal(loginResponse.body?.account?.uid, "firebase_login_uid");
  assert.equal(loginResponse.body?.session?.loginMethod, "otp");

  const migratedAccount = await AuthAccount.findOne({
    uid: "firebase_login_uid",
    email: "migrate-login@example.com"
  }).lean();
  assert.ok(migratedAccount);

  const sessionRecord = await AuthSession.findOne({
    sessionId: loginResponse.body?.session?.sessionId
  }).lean();
  assert.equal(sessionRecord?.uid, "firebase_login_uid");
});

test("auth integration: logout-session blocks revoking another user's session", async (t) => {
  if (!ensureSetup(t)) return;

  const loginResponse = await request(app).post("/api/v1/auth/login-session").send({
    email: "owner@example.com",
    role: "owner",
    loginMethod: "password",
    sessionTtlMinutes: 30
  });

  assert.equal(loginResponse.status, 201);
  const sessionId = loginResponse.body?.session?.sessionId;
  assert.ok(sessionId);

  const forbiddenResponse = await request(app)
    .post("/api/v1/auth/logout-session")
    .set("x-user-id", "different-user")
    .send({
      sessionId
    });

  assert.equal(forbiddenResponse.status, 403);
  assert.match(forbiddenResponse.body?.message || "", /cannot revoke another user's session/i);
});

test("auth integration: owner/superadmin can delete another auth account by uid", async (t) => {
  if (!ensureSetup(t)) return;

  const loginResponse = await request(app).post("/api/v1/auth/login-session").send({
    email: "target-delete@example.com",
    role: "client",
    loginMethod: "password",
    sessionTtlMinutes: 30
  });

  assert.equal(loginResponse.status, 201);
  const targetUid = String(loginResponse.body?.account?.uid || "");
  assert.ok(targetUid);

  const deleteResponse = await request(app)
    .delete(`/api/v1/auth/account/${encodeURIComponent(targetUid)}`)
    .set("x-user-id", "owner_uid_1")
    .set("x-user-roles", "superadmin")
    .send({
      reason: "admin-account-deleted"
    });

  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteResponse.body?.uid, targetUid);
  assert.equal(deleteResponse.body?.deleted, true);

  const authAccount = await AuthAccount.findOne({ uid: targetUid }).lean();
  assert.equal(authAccount, null);
});

test("auth integration: authenticate-password locks after repeated failures", async (t) => {
  if (!ensureSetup(t)) return;

  const originalFetch = global.fetch;
  let fetchCallCount = 0;
  global.fetch = async () => {
    fetchCallCount += 1;
    return {
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: "INVALID_LOGIN_CREDENTIALS"
        }
      })
    };
  };

  try {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const response = await request(app).post("/api/v1/auth/authenticate-password").send({
        email: "lockout@example.com",
        password: "WrongPassword1!"
      });

      assert.equal(response.status, 401);
      assert.match(response.body?.message || "", /incorrect email or password/i);
    }

    const lockedResponse = await request(app).post("/api/v1/auth/authenticate-password").send({
      email: "lockout@example.com",
      password: "WrongPassword1!"
    });

    assert.equal(lockedResponse.status, 423);
    assert.match(lockedResponse.body?.message || "", /temporarily locked/i);

    const stillLockedResponse = await request(app).post("/api/v1/auth/authenticate-password").send({
      email: "lockout@example.com",
      password: "CorrectPassword1!"
    });

    assert.equal(stillLockedResponse.status, 423);
    assert.equal(fetchCallCount, 5);

    const attemptRecord = await CredentialLoginAttempt.findOne({
      email: "lockout@example.com"
    }).lean();
    assert.equal(Number(attemptRecord?.failedCount || 0), 5);
    assert.ok(attemptRecord?.lockUntilAt);
  } finally {
    global.fetch = originalFetch;
  }
});

test("auth integration: change-password rejects incorrect current password", async (t) => {
  if (!ensureSetup(t)) return;

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: {
        message: "INVALID_LOGIN_CREDENTIALS"
      }
    })
  });

  try {
    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set("x-user-id", "client_uid_1")
      .set("x-user-email", "client@example.com")
      .send({
        currentPassword: "WrongPassword1!",
        newPassword: "NewPassword1!"
      });

    assert.equal(response.status, 401);
    assert.match(response.body?.message || "", /current password is incorrect/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test("auth integration: non-elevated admin cannot delete another auth account by uid", async (t) => {
  if (!ensureSetup(t)) return;

  const loginResponse = await request(app).post("/api/v1/auth/login-session").send({
    email: "target-no-delete@example.com",
    role: "client",
    loginMethod: "password",
    sessionTtlMinutes: 30
  });

  assert.equal(loginResponse.status, 201);
  const targetUid = String(loginResponse.body?.account?.uid || "");
  assert.ok(targetUid);

  const deleteResponse = await request(app)
    .delete(`/api/v1/auth/account/${encodeURIComponent(targetUid)}`)
    .set("x-user-id", "admin_uid_1")
    .set("x-user-roles", "admin")
    .send({
      reason: "admin-account-deleted"
    });

  assert.equal(deleteResponse.status, 403);
  assert.match(deleteResponse.body?.message || "", /owner or superadmin/i);
});
