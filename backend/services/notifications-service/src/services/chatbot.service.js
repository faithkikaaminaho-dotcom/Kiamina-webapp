import crypto from "node:crypto";
import {
  createChatSession,
  findActiveChatSessionByOwnerUserId,
  findChatSessionBySessionId,
  listChatSessions,
  updateChatSessionBySessionId
} from "../repositories/chat-sessions.repository.js";
import {
  createChatMessage,
  listChatMessagesBySessionId
} from "../repositories/chat-messages.repository.js";
import { searchKnowledgeBaseArticles } from "../repositories/knowledge-base.repository.js";
import { createEscalatedSupportTicketFromChat } from "./support.service.js";

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const generateSessionId = () =>
  `chat_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;

const assertCanAccessSession = ({ session, actorUid, isAdmin }) => {
  if (!session) {
    throw createHttpError(404, "Chat session not found");
  }

  if (!isAdmin && session.ownerUserId !== actorUid) {
    throw createHttpError(403, "You cannot access this chat session.");
  }
};

const SUPPORT_WORKING_HOURS_TEXT =
  "Mon-Fri 8:00 AM - 5:00 PM, Sat-Sun 9:00 AM - 1:00 PM (WAT)";

const CURATED_REPLY_RULES = [
  {
    patterns: ["upload", "document", "file"],
    reply:
      "To upload documents, open Expenses, Sales, or Bank Statements, choose the correct folder, upload the file, complete the required class or metadata, then submit it for review."
  },
  {
    patterns: ["expense"],
    reply:
      "For expenses, go to the Expenses workspace, upload into the correct folder, complete the class and supporting details, then monitor the review status in the folder view and upload history."
  },
  {
    patterns: ["sales", "invoice", "revenue"],
    reply:
      "For sales documents, go to Sales, upload the file, complete the class and invoice details, then track the review outcome from the workspace."
  },
  {
    patterns: ["bank"],
    reply:
      "For bank statements, open Bank Statements, upload the statement, set the correct period details, then monitor the review status from the workspace."
  },
  {
    patterns: ["setting", "profile", "account"],
    reply:
      "Settings is where you manage your profile, business details, tax information, verification records, notification preferences, and account security."
  },
  {
    patterns: ["verification", "identity", "kyc"],
    reply:
      "For verification, open Settings and go to the verification section. Upload the requested records and submit them for review."
  },
  {
    patterns: ["onboarding", "workspace setup"],
    reply:
      "Kiamina onboarding first confirms your profile, then collects the business and accounting details needed to prepare your workspace correctly."
  },
  {
    patterns: ["tax", "vat", "compliance", "tin"],
    reply:
      "Kiamina supports tax compliance, filing readiness, and finance-control setup. Keeping your tax details current in Settings helps document reviews stay aligned."
  },
  {
    patterns: ["payroll", "salary"],
    reply:
      "Kiamina payroll support covers payroll processing, compliance checks, payroll journals, and reconciliation support."
  },
  {
    patterns: ["bookkeeping", "financial reporting", "financial modeling", "service", "advisory"],
    reply:
      "Kiamina service lines include bookkeeping, financial reporting, financial modeling, payroll processing, and tax compliance delivered with a structured, audit-ready approach."
  },
  {
    patterns: ["hours", "open", "working hour", "time"],
    reply: `Human support working hours are ${SUPPORT_WORKING_HOURS_TEXT}. Outside those hours, Kiamina can still capture your details and inquiry for follow-up.`
  },
  {
    patterns: ["agent", "human", "representative", "support team"],
    reply:
      "If you need a human agent, say so clearly in chat and Kiamina will escalate the conversation. During offline hours, your details and inquiry can still be captured for follow-up."
  }
];

const findCuratedAssistantReply = (message = "") => {
  const normalizedMessage = String(message || "").trim().toLowerCase();
  if (!normalizedMessage) return "";

  const matchedRule = CURATED_REPLY_RULES.find(({ patterns = [] }) =>
    patterns.some((pattern) => normalizedMessage.includes(pattern))
  );

  return matchedRule?.reply || "";
};

const buildFallbackAssistantReply = (message) => {
  const curatedReply = findCuratedAssistantReply(message);
  if (curatedReply) {
    return curatedReply;
  }

  return "I can help with Kiamina services, onboarding, uploads, tax, payroll, settings, and verification. I can also help escalate to human support.";
};

const buildKnowledgeAssistantReply = (article) => {
  const title = String(article.title || "").trim();
  const summary = String(article.summary || "").trim();

  if (summary) {
    return `I found a related help article: ${title}. ${summary}`;
  }

  return `I found a related help article: ${title}.`;
};

export const createChatSessionForActor = async ({ actor, payload }) => {
  if (payload.reuseActive) {
    const existing = await findActiveChatSessionByOwnerUserId(actor.uid);
    if (existing) {
      return {
        session: existing,
        created: false
      };
    }
  }

  const session = await createChatSession({
    sessionId: generateSessionId(),
    ownerUserId: actor.uid,
    ownerEmail: actor.email || "",
    channel: payload.channel || "web",
    status: "active",
    startedAt: new Date(),
    context: payload.context || {},
    lastMessageAt: new Date()
  });

  return {
    session,
    created: true
  };
};

export const listChatSessionsForActor = async ({ actor, isAdmin, query }) => {
  const shouldListAll = isAdmin && query.scope === "all";

  return listChatSessions({
    ownerUserId: shouldListAll ? "" : actor.uid,
    status: query.status || "",
    limit: query.limit || 20
  });
};

export const getChatSessionBySessionIdForActor = async ({ sessionId, actor, isAdmin }) => {
  const session = await findChatSessionBySessionId(sessionId);
  assertCanAccessSession({ session, actorUid: actor.uid, isAdmin });
  return session;
};

export const listChatMessagesForSessionForActor = async ({
  sessionId,
  actor,
  isAdmin,
  limit = 100
}) => {
  const session = await findChatSessionBySessionId(sessionId);
  assertCanAccessSession({ session, actorUid: actor.uid, isAdmin });

  return listChatMessagesBySessionId(sessionId, limit);
};

export const postChatMessageForSession = async ({
  sessionId,
  actor,
  isAdmin,
  payload
}) => {
  const session = await findChatSessionBySessionId(sessionId);
  assertCanAccessSession({ session, actorUid: actor.uid, isAdmin });

  if (session.status !== "active") {
    throw createHttpError(409, "Cannot send message to a non-active chat session.");
  }

  const userMessage = await createChatMessage({
    sessionId,
    role: "user",
    content: payload.message,
    source: "user",
    citations: []
  });

  const suggestions = await searchKnowledgeBaseArticles({
    query: payload.message,
    status: "published",
    visibility: "public",
    limit: 3
  });

  const primaryArticle = suggestions[0];
  const curatedReply = findCuratedAssistantReply(payload.message);
  const assistantContent = primaryArticle && curatedReply
    ? `${curatedReply} I also found a related help article: ${String(primaryArticle.title || "").trim()}${String(primaryArticle.summary || "").trim() ? `. ${String(primaryArticle.summary || "").trim()}` : "."}`
    : primaryArticle
      ? buildKnowledgeAssistantReply(primaryArticle)
      : buildFallbackAssistantReply(payload.message);

  const assistantMessage = await createChatMessage({
    sessionId,
    role: "assistant",
    content: assistantContent,
    source: primaryArticle ? "knowledge-base" : "rule-engine",
    citations:
      payload.includeCitations && primaryArticle
        ? [
            {
              articleId: primaryArticle.articleId,
              title: primaryArticle.title,
              url: `/knowledge-base/articles/${primaryArticle.articleId}`
            }
          ]
        : []
  });

  const updatedSession = await updateChatSessionBySessionId(sessionId, {
    lastMessageAt: assistantMessage.createdAt
  });

  return {
    session: updatedSession || session,
    userMessage,
    assistantMessage,
    suggestions: suggestions.map((article) => ({
      articleId: article.articleId,
      title: article.title,
      category: article.category,
      summary: article.summary
    }))
  };
};

export const escalateChatSessionForActor = async ({
  sessionId,
  actor,
  isAdmin,
  payload
}) => {
  const session = await findChatSessionBySessionId(sessionId);
  assertCanAccessSession({ session, actorUid: actor.uid, isAdmin });

  if (session.escalatedToTicketId) {
    return {
      session,
      ticketId: session.escalatedToTicketId,
      escalated: false
    };
  }

  const transcript = await listChatMessagesBySessionId(sessionId, 200);
  const result = await createEscalatedSupportTicketFromChat({
    ownerUserId: session.ownerUserId,
    ownerEmail: session.ownerEmail || actor.email || "",
    subject: payload.subject || `Escalated chat session ${session.sessionId}`,
    summary: payload.summary || "Escalated from chatbot conversation.",
    priority: payload.priority || "medium",
    transcript
  });

  const updatedSession = await updateChatSessionBySessionId(sessionId, {
    status: "escalated",
    endedAt: new Date(),
    escalatedToTicketId: result.ticket.ticketId
  });

  return {
    session: updatedSession || session,
    ticketId: result.ticket.ticketId,
    escalated: true
  };
};
