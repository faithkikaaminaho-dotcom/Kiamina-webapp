import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

let mongoServer;
let app;
let connectToDatabase;
let Document;
let StoredDocumentAsset;
let setupError = null;

const ensureSetup = (t) => {
  if (!setupError) {
    return true;
  }

  t.skip(`Mongo integration setup unavailable: ${setupError.message}`);
  return false;
};

const binaryParser = (res, callback) => {
  const chunks = [];
  res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
  res.on("error", callback);
};

const documentAdminHeaders = {
  "x-user-id": "admin_documents_uid",
  "x-user-email": "admin-documents@example.com",
  "x-user-roles": "admin",
  "x-user-admin-permissions": "view_documents,download_documents,approve_documents"
};

const limitedDocumentAdminHeaders = {
  "x-user-id": "limited_admin_documents_uid",
  "x-user-email": "limited-admin-documents@example.com",
  "x-user-roles": "admin",
  "x-user-admin-permissions": "view_documents"
};

test.before(async () => {
  process.env.NODE_ENV = "test";
  process.env.SERVICE_NAME = "documents-service-test";
  process.env.MONGO_DB_NAME = "kiamina_documents_integration";
  process.env.MONGOMS_RUNTIME_DOWNLOAD =
    process.env.MONGOMS_RUNTIME_DOWNLOAD || "0";

  try {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();

    ({ default: app } = await import("../services/documents-service/src/app.js"));
    ({ connectToDatabase } = await import(
      "../services/documents-service/src/config/db.js"
    ));
    ({ Document } = await import(
      "../services/documents-service/src/models/Document.model.js"
    ));
    ({ StoredDocumentAsset } = await import(
      "../services/documents-service/src/models/StoredDocumentAsset.model.js"
    ));

    await connectToDatabase();
  } catch (error) {
    setupError = error;
  }
});

test.beforeEach(async () => {
  if (setupError) {
    return;
  }

  await Promise.all([Document.deleteMany({}), StoredDocumentAsset.deleteMany({})]);
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

test("documents integration: upload, download, and delete store file bytes in MongoDB", async (t) => {
  if (!ensureSetup(t)) return;

  const uid = "client_documents_uid";
  const email = "documents-client@example.com";
  const fileContents = "invoice-body";

  const uploadResponse = await request(app)
    .post("/api/v1/documents/upload")
    .set("x-user-id", uid)
    .set("x-user-email", email)
    .set("x-user-roles", "client")
    .field("ownerUserId", uid)
    .field("category", "sales")
    .field("className", "headoffice")
    .attach("file", Buffer.from(fileContents, "utf8"), {
      filename: "invoice.txt",
      contentType: "text/plain"
    });

  assert.equal(uploadResponse.status, 201);
  assert.equal(uploadResponse.body?.ownerUserId, uid);
  assert.equal(uploadResponse.body?.storageProvider, "mongodb");
  assert.match(String(uploadResponse.body?.storagePath || ""), /^[a-f0-9]{24}$/i);
  assert.equal(uploadResponse.body?.metadata?.contentType, "text/plain");
  const documentId = String(
    uploadResponse.body?.id || uploadResponse.body?._id || ""
  ).trim();
  assert.match(documentId, /^[a-f0-9]{24}$/i);

  const storedAsset = await StoredDocumentAsset.findById(
    uploadResponse.body.storagePath
  );
  assert.ok(storedAsset);
  assert.equal(storedAsset.fileName, "invoice.txt");
  assert.equal(storedAsset.contentType, "text/plain");
  assert.equal(storedAsset.buffer.toString("utf8"), fileContents);

  const downloadUrlResponse = await request(app)
    .get(`/api/v1/documents/${documentId}/download-url`)
    .set("x-user-id", uid)
    .set("x-user-email", email)
    .set("x-user-roles", "client");

  assert.equal(downloadUrlResponse.status, 200);
  assert.match(
    String(downloadUrlResponse.body?.downloadUrl || ""),
    new RegExp(`/api/v1/documents/${documentId}/download$`)
  );

  const downloadResponse = await request(app)
    .get(`/api/v1/documents/${documentId}/download`)
    .set("x-user-id", uid)
    .set("x-user-email", email)
    .set("x-user-roles", "client")
    .buffer(true)
    .parse(binaryParser);

  assert.equal(downloadResponse.status, 200);
  assert.match(String(downloadResponse.headers["content-type"] || ""), /^text\/plain/i);
  assert.equal(downloadResponse.body.toString("utf8"), fileContents);

  const deleteResponse = await request(app)
    .delete(`/api/v1/documents/${documentId}`)
    .set("x-user-id", uid)
    .set("x-user-email", email)
    .set("x-user-roles", "client");

  assert.equal(deleteResponse.status, 200);

  const deletedDocument = await Document.findById(documentId).lean();
  const deletedAsset = await StoredDocumentAsset.findById(
    uploadResponse.body.storagePath
  ).lean();
  assert.equal(deletedDocument, null);
  assert.equal(deletedAsset, null);
});

test("documents integration: admin document permissions gate cross-account download and status changes", async (t) => {
  if (!ensureSetup(t)) return;

  const uid = "client_cross_account_documents_uid";
  const email = "cross-account-documents@example.com";

  const uploadResponse = await request(app)
    .post("/api/v1/documents/upload")
    .set("x-user-id", uid)
    .set("x-user-email", email)
    .set("x-user-roles", "client")
    .field("ownerUserId", uid)
    .field("category", "expenses")
    .field("className", "branch")
    .attach("file", Buffer.from("receipt-body", "utf8"), {
      filename: "receipt.txt",
      contentType: "text/plain"
    });

  assert.equal(uploadResponse.status, 201);
  const documentId = String(uploadResponse.body?.id || uploadResponse.body?._id || "").trim();
  assert.match(documentId, /^[a-f0-9]{24}$/i);

  const deniedDownloadResponse = await request(app)
    .get(`/api/v1/documents/${documentId}/download`)
    .set(limitedDocumentAdminHeaders)
    .buffer(true)
    .parse(binaryParser);

  assert.equal(deniedDownloadResponse.status, 403);
  assert.match(deniedDownloadResponse.body.toString("utf8"), /download another user's document/i);

  const allowedDownloadResponse = await request(app)
    .get(`/api/v1/documents/${documentId}/download`)
    .set(documentAdminHeaders)
    .buffer(true)
    .parse(binaryParser);

  assert.equal(allowedDownloadResponse.status, 200);
  assert.equal(allowedDownloadResponse.body.toString("utf8"), "receipt-body");

  const deniedStatusResponse = await request(app)
    .patch(`/api/v1/documents/${documentId}/status`)
    .set(limitedDocumentAdminHeaders)
    .send({
      status: "ready"
    });

  assert.equal(deniedStatusResponse.status, 403);
  assert.match(deniedStatusResponse.body?.message || "", /change document status/i);

  const approvedStatusResponse = await request(app)
    .patch(`/api/v1/documents/${documentId}/status`)
    .set(documentAdminHeaders)
    .send({
      status: "ready"
    });

  assert.equal(approvedStatusResponse.status, 200);
  assert.equal(approvedStatusResponse.body?.status, "ready");
});
