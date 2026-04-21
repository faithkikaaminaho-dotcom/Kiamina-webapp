import { Document } from "../models/Document.model.js";
import { StoredDocumentAsset } from "../models/StoredDocumentAsset.model.js";

export const createDocumentRecord = async (payload) => Document.create(payload);

export const listDocumentsByOwner = async (ownerUserId) =>
  Document.find({ ownerUserId }).sort({ createdAt: -1 });

export const listDocumentStorageRefsByOwner = async (ownerUserId) =>
  Document.find(
    { ownerUserId },
    {
      storageProvider: 1,
      storagePath: 1
    }
  ).lean();

export const findDocumentById = async (id) => Document.findById(id);

export const updateDocumentStatus = async (id, status) =>
  Document.findByIdAndUpdate(id, { status }, { new: true });

export const updateDocumentById = async (id, payload) =>
  Document.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true
  });

export const deleteDocumentById = async (id) => Document.findByIdAndDelete(id);

export const deleteDocumentsByOwner = async (ownerUserId) =>
  Document.deleteMany({ ownerUserId });

export const reassignDocumentsByOwner = async ({
  fromOwnerUserId,
  toOwnerUserId
}) =>
  Document.updateMany(
    { ownerUserId: String(fromOwnerUserId || "").trim() },
    {
      $set: {
        ownerUserId: String(toOwnerUserId || "").trim()
      }
    }
  );

export const reassignStoredAssetsByOwner = async ({
  fromOwnerUserId,
  toOwnerUserId
}) =>
  StoredDocumentAsset.updateMany(
    { ownerUserId: String(fromOwnerUserId || "").trim() },
    {
      $set: {
        ownerUserId: String(toOwnerUserId || "").trim()
      }
    }
  );

const getSafeStatusKey = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "processing") return "processing";
  if (normalized === "to-review") return "toReview";
  if (normalized === "ready") return "ready";
  if (normalized === "rejected") return "rejected";
  if (normalized === "info-requested" || normalized === "needs-clarification") return "infoRequested";
  return "other";
};

const getSafeCategoryKey = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "expenses") return "expenses";
  if (normalized === "sales") return "sales";
  if (normalized === "bank-statements") return "bankStatements";
  return "other";
};

export const summarizeDocumentsByOwner = async (ownerUserId) => {
  const rows = await Document.find(
    { ownerUserId },
    { status: 1, category: 1, createdAt: 1, updatedAt: 1 }
  ).lean();

  const statusCounts = {
    processing: 0,
    toReview: 0,
    ready: 0,
    rejected: 0,
    infoRequested: 0,
    other: 0
  };
  const categoryCounts = {
    expenses: 0,
    sales: 0,
    bankStatements: 0,
    other: 0
  };

  let latestTimestampMs = 0;
  const recentCutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let uploadedLast7Days = 0;

  for (const row of rows) {
    const statusKey = getSafeStatusKey(row?.status);
    statusCounts[statusKey] += 1;

    const categoryKey = getSafeCategoryKey(row?.category);
    categoryCounts[categoryKey] += 1;

    const createdAtMs = Date.parse(row?.createdAt || "");
    if (Number.isFinite(createdAtMs)) {
      if (createdAtMs > latestTimestampMs) {
        latestTimestampMs = createdAtMs;
      }
      if (createdAtMs >= recentCutoffMs) {
        uploadedLast7Days += 1;
      }
    }
  }

  const totalDocuments = rows.length;
  const pendingDocuments =
    statusCounts.processing + statusCounts.toReview + statusCounts.infoRequested;
  const approvedDocuments = statusCounts.ready;
  const rejectedDocuments = statusCounts.rejected;

  return {
    ownerUserId,
    totalDocuments,
    pendingDocuments,
    approvedDocuments,
    rejectedDocuments,
    uploadedLast7Days,
    lastUploadedAt: latestTimestampMs ? new Date(latestTimestampMs).toISOString() : null,
    statusCounts,
    categoryCounts,
    generatedAt: new Date().toISOString()
  };
};
