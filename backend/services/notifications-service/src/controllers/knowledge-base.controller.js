import {
  getRequestActor,
  hasAnyAdminPermission,
  isAdminActor
} from "../utils/request-actor.js";
import {
  createKnowledgeBaseArticleForActor,
  deleteKnowledgeBaseArticleForActor,
  getKnowledgeBaseArticleByIdForActor,
  listKnowledgeBaseArticlesForActor,
  searchKnowledgeBaseArticlesForActor,
  updateKnowledgeBaseArticleForActor
} from "../services/knowledge-base.service.js";
import {
  buildKnowledgeBaseArticleUpdatePayload,
  validateCreateKnowledgeBaseArticlePayload,
  validateKnowledgeBaseListQuery,
  validateKnowledgeBaseSearchQuery
} from "../validation/knowledge-base.validation.js";

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

const requireAdminActor = (req, res) => {
  const actor = requireActor(req, res);
  if (!actor) return null;

  if (!isAdminActor(actor)) {
    res.status(403).json({ message: "Only admin users can perform this action." });
    return null;
  }

  return actor;
};

const requireAdminPermission = (req, res, permissionIds = [], message) => {
  const actor = requireAdminActor(req, res);
  if (!actor) return null;

  if (!hasAnyAdminPermission(actor, permissionIds)) {
    res.status(403).json({
      message: message || "You do not have permission to perform this action."
    });
    return null;
  }

  return actor;
};

export const createArticle = async (req, res, next) => {
  try {
    const actor = requireAdminPermission(
      req,
      res,
      ["client_assistance"],
      "You do not have permission to manage knowledge base articles."
    );
    if (!actor) return;

    const { errors, payload } = validateCreateKnowledgeBaseArticlePayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const article = await createKnowledgeBaseArticleForActor({ actor, payload });
    return res.status(201).json(article);
  } catch (error) {
    return next(error);
  }
};

export const listArticles = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) return;

    const { errors, payload } = validateKnowledgeBaseListQuery(req.query);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const articles = await listKnowledgeBaseArticlesForActor({
      isAdmin: isAdminActor(actor),
      query: payload
    });

    return res.status(200).json(articles);
  } catch (error) {
    return next(error);
  }
};

export const searchArticles = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) return;

    const { errors, payload } = validateKnowledgeBaseSearchQuery(req.query);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const articles = await searchKnowledgeBaseArticlesForActor({
      isAdmin: isAdminActor(actor),
      query: payload
    });

    return res.status(200).json(articles);
  } catch (error) {
    return next(error);
  }
};

export const getArticleById = async (req, res, next) => {
  try {
    const actor = requireActor(req, res);
    if (!actor) return;

    const article = await getKnowledgeBaseArticleByIdForActor({
      articleId: req.params.articleId,
      isAdmin: isAdminActor(actor)
    });

    return res.status(200).json(article);
  } catch (error) {
    return next(error);
  }
};

export const patchArticle = async (req, res, next) => {
  try {
    const actor = requireAdminPermission(
      req,
      res,
      ["client_assistance"],
      "You do not have permission to manage knowledge base articles."
    );
    if (!actor) return;

    const { payload, errors } = buildKnowledgeBaseArticleUpdatePayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        message:
          "Provide at least one field to update: title, slug, summary, content, category, status, visibility, tags"
      });
    }

    const updated = await updateKnowledgeBaseArticleForActor({
      articleId: req.params.articleId,
      actor,
      payload
    });

    return res.status(200).json(updated);
  } catch (error) {
    return next(error);
  }
};

export const deleteArticle = async (req, res, next) => {
  try {
    const actor = requireAdminPermission(
      req,
      res,
      ["client_assistance"],
      "You do not have permission to manage knowledge base articles."
    );
    if (!actor) return;

    const deleted = await deleteKnowledgeBaseArticleForActor({
      articleId: req.params.articleId
    });
    if (!deleted) {
      return res.status(404).json({ message: "Knowledge base article not found" });
    }

    return res.status(200).json({
      message: "Knowledge base article deleted successfully.",
      articleId: deleted.articleId
    });
  } catch (error) {
    return next(error);
  }
};
