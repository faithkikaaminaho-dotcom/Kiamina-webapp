import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

let mongoServer;
let app;
let connectToDatabase;
let setupError = null;

const adminHeaders = {
  "x-user-id": "admin_uid_1",
  "x-user-email": "admin@example.com",
  "x-user-roles": "admin",
  "x-user-admin-permissions": "client_assistance,send_notifications"
};

const limitedAdminHeaders = {
  "x-user-id": "admin_uid_2",
  "x-user-email": "limited-admin@example.com",
  "x-user-roles": "admin",
  "x-user-admin-permissions": "client_assistance"
};

const userHeaders = {
  "x-user-id": "client_uid_1",
  "x-user-email": "client@example.com",
  "x-user-roles": "client"
};

const secondUserHeaders = {
  "x-user-id": "client_uid_2",
  "x-user-email": "client2@example.com",
  "x-user-roles": "client"
};

const ensureSetup = (t) => {
  if (!setupError) {
    return true;
  }

  t.skip(`Mongo integration setup unavailable: ${setupError.message}`);
  return false;
};

test.before(async () => {
  process.env.NODE_ENV = "test";
  process.env.SERVICE_NAME = "notifications-service-test";
  process.env.MONGO_DB_NAME = "kiamina_notifications_integration";
  process.env.SMTP_HOST = "";
  process.env.QSTASH_URL = "";
  process.env.MONGOMS_RUNTIME_DOWNLOAD = process.env.MONGOMS_RUNTIME_DOWNLOAD || "0";

  try {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();

    ({ default: app } = await import("../services/notifications-service/src/app.js"));
    ({ connectToDatabase } = await import("../services/notifications-service/src/config/db.js"));
    await connectToDatabase();
  } catch (error) {
    setupError = error;
  }
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

test("notifications integration: knowledge-base create and search", async (t) => {
  if (!ensureSetup(t)) return;

  const createResponse = await request(app)
    .post("/api/v1/notifications/knowledge-base/articles")
    .set(adminHeaders)
    .send({
      title: "Invoice Upload Help",
      content: "Use the dashboard upload widget for invoices.",
      summary: "Upload invoices from dashboard.",
      status: "published",
      category: "technical",
      tags: ["invoice", "upload"]
    });

  assert.equal(createResponse.status, 201);
  assert.ok(createResponse.body?.articleId);

  const searchResponse = await request(app)
    .get("/api/v1/notifications/knowledge-base/articles/search")
    .set(userHeaders)
    .query({ q: "invoice" });

  assert.equal(searchResponse.status, 200);
  assert.ok(Array.isArray(searchResponse.body));
  assert.ok(searchResponse.body.length >= 1);
});

test("notifications integration: send-email requires send_notifications permission", async (t) => {
  if (!ensureSetup(t)) return;

  const deniedResponse = await request(app)
    .post("/api/v1/notifications/send-email")
    .set(limitedAdminHeaders)
    .send({
      to: ["client@example.com"],
      subject: "Permission test",
      message: "This should be denied."
    });

  assert.equal(deniedResponse.status, 403);
  assert.match(deniedResponse.body?.message || "", /send notifications/i);

  const allowedResponse = await request(app)
    .post("/api/v1/notifications/send-email")
    .set(adminHeaders)
    .send({
      to: ["client@example.com"],
      subject: "Permission test",
      message: "This should be queued."
    });

  assert.equal(allowedResponse.status, 503);
  assert.match(allowedResponse.body?.message || "", /qstash not configured|provider/i);
});

test("notifications integration: chatbot session message and escalation to support", async (t) => {
  if (!ensureSetup(t)) return;

  await request(app)
    .post("/api/v1/notifications/knowledge-base/articles")
    .set(adminHeaders)
    .send({
      title: "VAT Filing Guide",
      content: "VAT can be filed monthly using approved records.",
      summary: "Filing VAT monthly.",
      status: "published",
      category: "billing",
      tags: ["vat", "tax"]
    });

  const sessionResponse = await request(app)
    .post("/api/v1/notifications/chatbot/sessions")
    .set(userHeaders)
    .send({
      channel: "web"
    });

  assert.ok([200, 201].includes(sessionResponse.status));
  const sessionId = sessionResponse.body?.session?.sessionId;
  assert.ok(sessionId);

  const chatResponse = await request(app)
    .post(`/api/v1/notifications/chatbot/sessions/${sessionId}/messages`)
    .set(userHeaders)
    .send({
      message: "How do I file vat?"
    });

  assert.equal(chatResponse.status, 201);
  assert.equal(chatResponse.body?.userMessage?.role, "user");
  assert.equal(chatResponse.body?.assistantMessage?.role, "assistant");

  const escalateResponse = await request(app)
    .post(`/api/v1/notifications/chatbot/sessions/${sessionId}/escalate`)
    .set(userHeaders)
    .send({
      subject: "Need human support for VAT filing",
      priority: "high"
    });

  assert.equal(escalateResponse.status, 200);
  assert.ok(escalateResponse.body?.ticketId);

  const ticketId = escalateResponse.body.ticketId;

  const ownTicketResponse = await request(app)
    .get(`/api/v1/notifications/support/tickets/${ticketId}`)
    .set(userHeaders);
  assert.equal(ownTicketResponse.status, 200);
  assert.equal(ownTicketResponse.body?.ticketId, ticketId);

  const forbiddenResponse = await request(app)
    .get(`/api/v1/notifications/support/tickets/${ticketId}`)
    .set(secondUserHeaders);
  assert.equal(forbiddenResponse.status, 403);

  const adminMessagesResponse = await request(app)
    .get(`/api/v1/notifications/support/tickets/${ticketId}/messages`)
    .set(adminHeaders);
  assert.equal(adminMessagesResponse.status, 200);
  assert.ok(Array.isArray(adminMessagesResponse.body));
  assert.ok(adminMessagesResponse.body.length >= 1);
});

test("notifications integration: anonymous support session creates and reads public ticket", async (t) => {
  if (!ensureSetup(t)) return;

  const anonymousSessionId = `anon-session-${Date.now()}`;

  const createResponse = await request(app)
    .post("/api/v1/notifications/support/public/tickets")
    .send({
      sessionId: anonymousSessionId,
      subject: "Anonymous support request",
      description: "I need help with onboarding.",
      leadLabel: "Lead 1",
      fullName: "Website Visitor",
      organizationType: "individual",
      channel: "web"
    });

  assert.equal(createResponse.status, 201);
  const ticketId = createResponse.body?.ticket?.ticketId;
  assert.ok(ticketId);

  const listResponse = await request(app)
    .get("/api/v1/notifications/support/public/tickets")
    .query({
      sessionId: anonymousSessionId,
      limit: 20
    });
  assert.equal(listResponse.status, 200);
  assert.ok(Array.isArray(listResponse.body));
  assert.ok(listResponse.body.some((ticket) => ticket.ticketId === ticketId));

  const postMessageResponse = await request(app)
    .post(`/api/v1/notifications/support/public/tickets/${ticketId}/messages`)
    .send({
      sessionId: anonymousSessionId,
      content: "Can an agent assist me?",
      senderDisplayName: "Visitor"
    });
  assert.equal(postMessageResponse.status, 201);
  assert.ok(postMessageResponse.body?.data?.id || postMessageResponse.body?.data?._id);

  const listMessagesResponse = await request(app)
    .get(`/api/v1/notifications/support/public/tickets/${ticketId}/messages`)
    .query({
      sessionId: anonymousSessionId,
      limit: 50
    });
  assert.equal(listMessagesResponse.status, 200);
  assert.ok(Array.isArray(listMessagesResponse.body));
  assert.ok(listMessagesResponse.body.length >= 2);

  const forbiddenMessagesResponse = await request(app)
    .get(`/api/v1/notifications/support/public/tickets/${ticketId}/messages`)
    .query({
      sessionId: `${anonymousSessionId}-other`,
      limit: 50
    });
  assert.equal(forbiddenMessagesResponse.status, 403);
});
