import {
  createDocumentRecord,
  deleteDocumentsByOwner,
  deleteDocumentById,
  findDocumentById,
  listDocumentStorageRefsByOwner,
  listDocumentsByOwner,
  reassignDocumentsByOwner,
  reassignStoredAssetsByOwner,
  summarizeDocumentsByOwner,
  updateDocumentById,
  updateDocumentStatus
} from "../repositories/documents.repository.js";

export const createDocument = async (payload) => createDocumentRecord(payload);

export const getDocumentsByOwner = async (ownerUserId) =>
  listDocumentsByOwner(ownerUserId);

export const getDocumentStorageRefsByOwner = async (ownerUserId) =>
  listDocumentStorageRefsByOwner(ownerUserId);

export const getDocumentSummaryByOwner = async (ownerUserId) =>
  summarizeDocumentsByOwner(ownerUserId);

export const getDocumentById = async (id) => findDocumentById(id);

export const changeDocumentStatus = async ({ id, status }) =>
  updateDocumentStatus(id, status);

export const updateDocument = async ({ id, payload }) =>
  updateDocumentById(id, payload);

export const deleteDocument = async (id) => deleteDocumentById(id);

export const deleteDocumentsForOwner = async (ownerUserId) =>
  deleteDocumentsByOwner(ownerUserId);

export const reassignDocumentsForOwner = async ({
  fromOwnerUserId,
  toOwnerUserId
}) => {
  const [documentsResult, storageAssetsResult] = await Promise.all([
    reassignDocumentsByOwner({
      fromOwnerUserId,
      toOwnerUserId
    }),
    reassignStoredAssetsByOwner({
      fromOwnerUserId,
      toOwnerUserId
    })
  ]);

  return {
    migratedDocuments: Number(documentsResult?.modifiedCount || 0),
    migratedStorageObjects: Number(storageAssetsResult?.modifiedCount || 0)
  };
};
