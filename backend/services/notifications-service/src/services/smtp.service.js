import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter;

const isConfigured = () =>
  Boolean(env.smtpHost && env.smtpUser && env.smtpPass && env.smtpFromEmail);

const normalizeRecipientList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const getTransporter = () => {
  if (!isConfigured()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      requireTLS: env.smtpRequireTls,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }

  return transporter;
};

export const sendEmailViaSmtp = async ({ to, subject, message, replyTo = "" }) => {
  const smtpTransporter = getTransporter();
  if (!smtpTransporter) {
    return {
      sent: false,
      reason: "SMTP not configured"
    };
  }

  const recipients = normalizeRecipientList(to);
  if (recipients.length === 0) {
    return {
      sent: false,
      reason: "smtp-invalid-recipient"
    };
  }

  const info = await smtpTransporter.sendMail({
    from: env.smtpFromName
      ? `"${env.smtpFromName}" <${env.smtpFromEmail}>`
      : env.smtpFromEmail,
    to: recipients.join(","),
    subject: subject || "Kiamina Notification",
    text: message,
    html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.5">${String(message || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</pre>`,
    ...(replyTo ? { replyTo } : {})
  });

  const accepted = Array.isArray(info.accepted)
    ? info.accepted.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  const rejected = Array.isArray(info.rejected)
    ? info.rejected.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  const pending = Array.isArray(info.pending)
    ? info.pending.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  const acceptedEmails = new Set(accepted.map((entry) => entry.toLowerCase()));
  const missingAcceptedRecipients = accepted.length > 0
    ? recipients.filter((entry) => !acceptedEmails.has(entry.toLowerCase()))
    : [];

  if (rejected.length > 0 || missingAcceptedRecipients.length > 0) {
    return {
      sent: false,
      provider: "smtp",
      reason: "smtp-recipient-not-accepted",
      messageId: info.messageId || "",
      accepted,
      rejected,
      pending,
      response: info.response || ""
    };
  }

  return {
    sent: true,
    provider: "smtp",
    messageId: info.messageId || "",
    accepted,
    rejected,
    pending,
    response: info.response || ""
  };
};
