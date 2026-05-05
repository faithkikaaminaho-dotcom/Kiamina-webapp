import express from "express";
import {
  deleteLog,
  listLogs,
  putLog,
  patchLogStatus,
  sendContactFormEmail,
  sendEmail
} from "../../controllers/notifications.controller.js";
import supportRoutes from "./support.routes.js";
import chatbotRoutes from "./chatbot.routes.js";
import knowledgeBaseRoutes from "./knowledge-base.routes.js";
import insightsRoutes from "./insights.routes.js";
import realtimeEventsRoutes from "./realtime-events.routes.js";

const router = express.Router();

router.post("/contact", sendContactFormEmail);
router.post("/send-email", sendEmail);
router.get("/logs", listLogs);
router.put("/logs/:id", putLog);
router.patch("/logs/:id/status", patchLogStatus);
router.delete("/logs/:id", deleteLog);
router.use("/support", supportRoutes);
router.use("/chatbot", chatbotRoutes);
router.use("/knowledge-base", knowledgeBaseRoutes);
router.use("/insights", insightsRoutes);
router.use("/events", realtimeEventsRoutes);

export default router;
