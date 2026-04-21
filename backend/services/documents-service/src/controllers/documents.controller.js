import {
  changeDocumentStatus,
  createDocument,
  deleteDocument,
  deleteDocumentsForOwner,
  getDocumentById,
  getDocumentsByOwner,
  getDocumentStorageRefsByOwner,
  getDocumentSummaryByOwner,
  reassignDocumentsForOwner,
  updateDocument
} from "../services/documents.service.js";
import {
  reassignRecordsByOwner,
  removeRecordsByOwner
} from "../services/accounting-records.service.js";
import {
  createSignedDownloadUrl,
  deleteStorageObject,
  getDownloadResponseHeaders,
  getStoredFileAsset,
  uploadFileBuffer
} from "../services/mongodb-storage.service.js";
import {
  getRequestActor,
  hasAnyAdminPermission,
  isAdminActor,
  isPrivilegedActor
} from "../utils/request-actor.js";
import {
  buildDocumentUpdatePayload,
  validateCreateDocumentPayload,
  validateStatusPayload,
  validateUploadBody
} from "../validation/documents.validation.js";
import { env } from "../config/env.js";

const requireActor = (req, res) => {
  const actor = getRequestActor(req);
  if (!actor.uid) {
    res.status(401).json({
      message: "Missing x-user-id header from authenticated gateway request"
    });
    return null;
  }

  return actor;
};

const assertAdminDocumentPermission = (res, actor, permissionIds = [], message) => {
  if (!isAdminActor(actor)) {
    return true;
  }

  if (hasAnyAdminPermission(actor, permissionIds)) {
    return true;
  }

  res.status(403).json({
    message: message || "You do not have permission to perform this document action."
  });
  return false;
};

export const createOne = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) {
      return;
    }

    const { errors, payload } = validateCreateDocumentPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const actorIsPrivileged = isPrivilegedActor(actor);
    if (!actorIsPrivileged && payload.ownerUserId !== actor.uid) {
      return res.status(403).json({
        message: "You can only create documents for your own account."
      });
    }

    const document = await createDocument(payload);

    return res.status(201).json(document);
  } catch (error) {
    return next(error);
  }
};

export const listByOwner = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) {
      return;
    }

    const { ownerUserId } = req.params;
    const actorIsPrivileged = isPrivilegedActor(actor);

    if (!actorIsPrivileged && ownerUserId !== actor.uid) {
      return res.status(403).json({
        message: "You can only list your own documents."
      });
    }
    if (
      actorIsPrivileged
      && ownerUserId !== actor.uid
      && !assertAdminDocumentPermission(
        res,
        actor,
        ["view_documents"],
        "You do not have permission to view another user's documents."
      )
    ) {
      return;
    }

    const documents = await getDocumentsByOwner(ownerUserId);
    return res.status(200).json(documents);
  } catch (error) {
    return next(error);
  }
};

export const getOwnerSummary = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) {
      return;
    }

    const { ownerUserId } = req.params;
    const actorIsPrivileged = isPrivilegedActor(actor);

    if (!actorIsPrivileged && ownerUserId !== actor.uid) {
      return res.status(403).json({
        message: "You can only view summary for your own documents."
      });
    }
    if (
      actorIsPrivileged
      && ownerUserId !== actor.uid
      && !assertAdminDocumentPermission(
        res,
        actor,
        ["view_documents"],
        "You do not have permission to view another user's document summary."
      )
    ) {
      return;
    }

    const summary = await getDocumentSummaryByOwner(ownerUserId);
    return res.status(200).json(summary);
  } catch (error) {
    return next(error);
  }
};

export const getById = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) {
      return;
    }

    const document = await getDocumentById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    const actorIsPrivileged = isPrivilegedActor(actor);
    if (!actorIsPrivileged && document.ownerUserId !== actor.uid) {
      return res.status(403).json({ message: "You cannot access this document." });
    }
    if (
      actorIsPrivileged
      && document.ownerUserId !== actor.uid
      && !assertAdminDocumentPermission(
        res,
        actor,
        ["view_documents"],
        "You do not have permission to access another user's document."
      )
    ) {
      return;
    }

    return res.status(200).json(document);
  } catch (error) {
    return next(error);
  }
};

export const updateStatus = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) {
      return;
    }

    if (!isPrivilegedActor(actor)) {
      return res.status(403).json({
        message: "Only privileged users can change document status."
      });
    }
    if (
      !assertAdminDocumentPermission(
        res,
        actor,
        ["approve_documents", "reject_documents", "request_info_documents"],
        "You do not have permission to change document status."
      )
    ) {
      return;
    }

    const { status, error } = validateStatusPayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const updated = await changeDocumentStatus({
      id: req.params.id,
      status
    });

    if (!updated) {
      return res.status(404).json({ message: "Document not found" });
    }

    return res.status(200).json(updated);
  } catch (error) {
    return next(error);
  }
};

export const putById = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) {
      return;
    }

    const existing = await getDocumentById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Document not found" });
    }

    const actorIsPrivileged = isPrivilegedActor(actor);
    if (!actorIsPrivileged && existing.ownerUserId !== actor.uid) {
      return res.status(403).json({ message: "You cannot update this document." });
    }

    const { payload, errors } = buildDocumentUpdatePayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        message:
          "Provide at least one field to update: ownerUserId, fileName, category, className, tags, metadata, storageProvider, storagePath, status"
      });
    }

    if (
      !actorIsPrivileged &&
      (payload.ownerUserId !== undefined ||
        payload.storageProvider !== undefined ||
        payload.storagePath !== undefined ||
        payload.status !== undefined)
    ) {
      return res.status(403).json({
        message:
          "Only privileged users can update owner, storage metadata, or document status."
      });
    }

    const updated = await updateDocument({
      id: req.params.id,
      payload
    });

    if (!updated) {
      return res.status(404).json({ message: "Document not found" });
    }

    return res.status(200).json(updated);
  } catch (error) {
    return next(error);
  }
};

export const removeById = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) {
      return;
    }

    const existing = await getDocumentById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Document not found" });
    }

    const actorIsPrivileged = isPrivilegedActor(actor);
    if (!actorIsPrivileged && existing.ownerUserId !== actor.uid) {
      return res.status(403).json({ message: "You cannot delete this document." });
    }

    const deleted = await deleteDocument(req.params.id);

    if (deleted?.storagePath && env.deleteStorageObjectOnRecordDelete) {
      await deleteStorageObject(deleted.storagePath);
    }

    return res.status(200).json({
      message: "Document deleted successfully.",
      id: deleted.id
    });
  } catch (error) {
    return next(error);
  }
};

export const removeByOwner = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) {
      return;
    }

    const ownerUserId = String(req.params.ownerUserId || "").trim();
    if (!ownerUserId) {
      return res.status(400).json({ message: "ownerUserId is required." });
    }

    const actorIsAdmin = isAdminActor(actor);
    if (!actorIsAdmin && ownerUserId !== actor.uid) {
      return res.status(403).json({
        message: "You can only purge your own documents."
      });
    }
    if (
      actorIsAdmin
      && ownerUserId !== actor.uid
      && !assertAdminDocumentPermission(
        res,
        actor,
        ["delete_data"],
        "You do not have permission to purge another user's documents."
      )
    ) {
      return;
    }

    const storageRefs = await getDocumentStorageRefsByOwner(ownerUserId);
    const [documentsDeletionResult, accountingDeletionResult] = await Promise.all([
      deleteDocumentsForOwner(ownerUserId),
      removeRecordsByOwner(ownerUserId)
    ]);

    const storageTargets = (Array.isArray(storageRefs) ? storageRefs : []).filter((record) =>
      String(record?.storagePath || "").trim()
    );

    let storageDeletedCount = 0;
    let storageFailedCount = 0;
    if (env.deleteStorageObjectOnRecordDelete && storageTargets.length > 0) {
      const storageDeleteResults = await Promise.allSettled(
        storageTargets.map((record) =>
          deleteStorageObject(String(record.storagePath || "").trim())
        )
      );
      storageDeleteResults.forEach((result) => {
        if (result.status === "fulfilled") {
          storageDeletedCount += 1;
        } else {
          storageFailedCount += 1;
        }
      });
    }

    return res.status(200).json({
      message: "Owner documents purged successfully.",
      ownerUserId,
      deletedDocuments: Number(documentsDeletionResult?.deletedCount || 0),
      deletedAccountingRecords: Number(accountingDeletionResult?.deletedCount || 0),
      deletedStorageObjects: storageDeletedCount,
      failedStorageObjectDeletes: storageFailedCount
    });
  } catch (error) {
    return next(error);
  }
};

export const reassignByOwner = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) {
      return;
    }

    const fromOwnerUserId = String(req.params.ownerUserId || "").trim();
    const toOwnerUserId = String(req.body?.toOwnerUserId || "").trim();

    if (!fromOwnerUserId) {
      return res.status(400).json({ message: "ownerUserId is required." });
    }
    if (!toOwnerUserId) {
      return res.status(400).json({ message: "toOwnerUserId is required." });
    }
    if (fromOwnerUserId === toOwnerUserId) {
      return res.status(200).json({
        message: "Owner documents already belong to the target user.",
        fromOwnerUserId,
        toOwnerUserId,
        migratedDocuments: 0,
        migratedAccountingRecords: 0,
        migratedStorageObjects: 0
      });
    }

    if (!isAdminActor(actor)) {
      return res.status(403).json({
        message: "Only admin users can reassign owner documents."
      });
    }
    if (
      !assertAdminDocumentPermission(
        res,
        actor,
        ["delete_data"],
        "You do not have permission to reassign owner documents."
      )
    ) {
      return;
    }

    const [documentsResult, accountingResult] = await Promise.all([
      reassignDocumentsForOwner({
        fromOwnerUserId,
        toOwnerUserId
      }),
      reassignRecordsByOwner({
        fromOwnerUserId,
        toOwnerUserId
      })
    ]);

    return res.status(200).json({
      message: "Owner documents reassigned successfully.",
      fromOwnerUserId,
      toOwnerUserId,
      migratedDocuments: Number(documentsResult?.migratedDocuments || 0),
      migratedAccountingRecords: Number(accountingResult?.modifiedCount || 0),
      migratedStorageObjects: Number(documentsResult?.migratedStorageObjects || 0)
    });
  } catch (error) {
    return next(error);
  }
};

export const uploadOne = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) {
      return;
    }

    if (!req.file) {
      return res.status(400).json({ message: "file is required (multipart field: file)" });
    }

    const { errors, payload } = validateUploadBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const ownerUserId = payload.ownerUserId || actor.uid;
    const actorIsPrivileged = isPrivilegedActor(actor);
    if (!actorIsPrivileged && ownerUserId !== actor.uid) {
      return res.status(403).json({
        message: "You can only upload documents for your own account."
      });
    }

    const uploadResult = await uploadFileBuffer({
      ownerUserId,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer
    });

    const mergedMetadata = {
      ...payload.metadata,
      fileSize: uploadResult.size,
      contentType: uploadResult.contentType,
      uploadedBy: actor.uid,
      uploadedAt: new Date().toISOString()
    };

    const document = await createDocument({
      ownerUserId,
      fileName: req.file.originalname,
      category: payload.category,
      className: payload.className,
      tags: payload.tags,
      metadata: mergedMetadata,
      storageProvider: uploadResult.storageProvider,
      storagePath: uploadResult.storagePath,
      status: "processing"
    });

    return res.status(201).json(document);
  } catch (error) {
    return next(error);
  }
};

export const getDownloadUrl = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) {
      return;
    }

    const document = await getDocumentById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    const actorIsPrivileged = isPrivilegedActor(actor);
    if (!actorIsPrivileged && document.ownerUserId !== actor.uid) {
      return res.status(403).json({ message: "You cannot download this document." });
    }
    if (
      actorIsPrivileged
      && document.ownerUserId !== actor.uid
      && !assertAdminDocumentPermission(
        res,
        actor,
        ["download_documents"],
        "You do not have permission to download another user's document."
      )
    ) {
      return;
    }

    if (document.storageProvider !== "mongodb" || !document.storagePath) {
      return res.status(400).json({
        message: "This document does not have a MongoDB storage object."
      });
    }

    const signed = await createSignedDownloadUrl({
      req,
      documentId: document.id
    });

    return res.status(200).json({
      documentId: document.id,
      downloadUrl: signed.url,
      expiresAt: signed.expiresAt
    });
  } catch (error) {
    return next(error);
  }
};

export const downloadById = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) {
      return;
    }

    const document = await getDocumentById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    const actorIsPrivileged = isPrivilegedActor(actor);
    if (!actorIsPrivileged && document.ownerUserId !== actor.uid) {
      return res.status(403).json({ message: "You cannot download this document." });
    }
    if (
      actorIsPrivileged
      && document.ownerUserId !== actor.uid
      && !assertAdminDocumentPermission(
        res,
        actor,
        ["download_documents"],
        "You do not have permission to download another user's document."
      )
    ) {
      return;
    }

    if (document.storageProvider !== "mongodb" || !document.storagePath) {
      return res.status(400).json({
        message: "This document does not have a MongoDB storage object."
      });
    }

    const storedFile = await getStoredFileAsset(document.storagePath);
    if (!storedFile) {
      return res.status(404).json({ message: "Stored file not found." });
    }

    const headers = getDownloadResponseHeaders({
      fileName: document.fileName || storedFile.fileName,
      contentType:
        document.metadata?.contentType || storedFile.contentType,
      size: document.metadata?.fileSize || storedFile.size
    });

    Object.entries(headers).forEach(([headerName, headerValue]) => {
      res.setHeader(headerName, headerValue);
    });

    return res.status(200).send(storedFile.buffer);
  } catch (error) {
    return next(error);
  }
};
