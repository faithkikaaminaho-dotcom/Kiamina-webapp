import {
  getRecentNotificationLogs,
  queueEmailNotification,
  removeNotificationLog,
  replaceNotificationLog,
  updateNotificationStatus
} from "../services/notifications.service.js";
import { publishRealtimeEvent } from "../services/realtime-events.service.js";
import {
  getRequestActor,
  hasAnyAdminPermission,
  isAdminActor
} from "../utils/request-actor.js";
import {
  buildNotificationLogUpdatePayload,
  validatePatchStatusPayload,
  validateSendEmailPayload
} from "../validation/notifications.validation.js";

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
  if (!actor) {
    return null;
  }

  if (!isAdminActor(actor)) {
    res.status(403).json({ message: "Only admin users can perform this action." });
    return null;
  }

  return actor;
};

const requireAdminPermission = (req, res, permissionIds = [], message) => {
  const actor = requireAdminActor(req, res);
  if (!actor) {
    return null;
  }

  if (!hasAnyAdminPermission(actor, permissionIds)) {
    res.status(403).json({
      message: message || "You do not have permission to perform this action."
    });
    return null;
  }

  return actor;
};

const emitNotificationEvent = (eventPayload = {}) => {
  try {
    publishRealtimeEvent(eventPayload);
  } catch (error) {
    console.error("notifications realtime emit warning:", error.message);
  }
};

export const sendEmail = async (req, res, next) => {
  try {
    const actor = requireAdminPermission(
      req,
      res,
      ["send_notifications"],
      "You do not have permission to send notifications."
    );
    if (!actor) {
      return;
    }

    const { errors, payload } = validateSendEmailPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    const log = await queueEmailNotification(payload);
    emitNotificationEvent({
      eventType: "notifications.email.queued",
      topic: "notifications",
      actor: {
        uid: actor.uid,
        email: actor.email,
        roles: actor.roles
      },
      audience: {
        roles: ["admin", "owner", "superadmin", "manager"]
      },
      payload: {
        logId: log.id,
        status: log.status,
        recipients: String(log.to || "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .length
      }
    });
    return res.status(202).json({
      message: "Notification queued.",
      log
    });
  } catch (error) {
    return next(error);
  }
};

export const listLogs = async (req, res, next) => {
  try {
    const actor = requireAdminPermission(
      req,
      res,
      ["send_notifications"],
      "You do not have permission to view notification logs."
    );
    if (!actor) {
      return;
    }

    const limit = Number(req.query.limit || 50);
    const logs = await getRecentNotificationLogs(limit);
    return res.status(200).json(logs);
  } catch (error) {
    return next(error);
  }
};

export const patchLogStatus = async (req, res, next) => {
  try {
    const actor = requireAdminPermission(
      req,
      res,
      ["send_notifications"],
      "You do not have permission to update notification logs."
    );
    if (!actor) {
      return;
    }

    const { status, errorMessage, error } = validatePatchStatusPayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const updated = await updateNotificationStatus({
      id: req.params.id,
      status,
      errorMessage
    });

    if (!updated) {
      return res.status(404).json({ message: "Notification log not found" });
    }

    emitNotificationEvent({
      eventType: "notifications.log.status-updated",
      topic: "notifications",
      actor: {
        uid: actor.uid,
        email: actor.email,
        roles: actor.roles
      },
      audience: {
        roles: ["admin", "owner", "superadmin", "manager"]
      },
      payload: {
        logId: updated.id,
        status: updated.status
      }
    });

    return res.status(200).json(updated);
  } catch (error) {
    return next(error);
  }
};

export const putLog = async (req, res, next) => {
  try {
    const actor = requireAdminPermission(
      req,
      res,
      ["send_notifications"],
      "You do not have permission to update notification logs."
    );
    if (!actor) {
      return;
    }

    const { payload, errors } = buildNotificationLogUpdatePayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        message:
          "Provide at least one field to update: channel, to, subject, message, status, providerMessageId, scheduledAt, sentAt, errorMessage"
      });
    }

    const updated = await replaceNotificationLog({
      id: req.params.id,
      payload
    });

    if (!updated) {
      return res.status(404).json({ message: "Notification log not found" });
    }

    emitNotificationEvent({
      eventType: "notifications.log.updated",
      topic: "notifications",
      actor: {
        uid: actor.uid,
        email: actor.email,
        roles: actor.roles
      },
      audience: {
        roles: ["admin", "owner", "superadmin", "manager"]
      },
      payload: {
        logId: updated.id,
        status: updated.status
      }
    });

    return res.status(200).json(updated);
  } catch (error) {
    return next(error);
  }
};

export const deleteLog = async (req, res, next) => {
  try {
    const actor = requireAdminPermission(
      req,
      res,
      ["send_notifications"],
      "You do not have permission to delete notification logs."
    );
    if (!actor) {
      return;
    }

    const deleted = await removeNotificationLog(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Notification log not found" });
    }

    emitNotificationEvent({
      eventType: "notifications.log.deleted",
      topic: "notifications",
      actor: {
        uid: actor.uid,
        email: actor.email,
        roles: actor.roles
      },
      audience: {
        roles: ["admin", "owner", "superadmin", "manager"]
      },
      payload: {
        logId: deleted.id
      }
    });

    return res.status(200).json({
      message: "Notification log deleted successfully.",
      id: deleted.id
    });
  } catch (error) {
    return next(error);
  }
};
