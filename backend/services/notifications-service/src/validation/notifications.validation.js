import Joi from "joi";

const CHANNELS = ["email", "sms", "push", "webhook"];
const STATUSES = ["queued", "sent", "failed"];
const EMAIL_SCHEMA = Joi.string()
  .trim()
  .lowercase()
  .email({ tlds: { allow: false } });

const normalizeString = (value) => String(value ?? "").trim();
const normalizeSource = (body) =>
  body && typeof body === "object" && !Array.isArray(body) ? body : {};

const toErrors = (error) => {
  if (!error) {
    return [];
  }

  return error.details.map((detail) => detail.message.replace(/"/g, ""));
};

const normalizeEmailList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((email) => normalizeString(email).toLowerCase())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  }

  return null;
};

const normalizeDate = (value) => {
  if (value === null) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const sendEmailSchema = Joi.object({
  subject: Joi.string().trim().allow("").max(200).default("").messages({
    "string.max": "subject must be at most 200 characters"
  }),
  message: Joi.string().trim().required().max(5000).messages({
    "any.required": "message is required",
    "string.empty": "message is required",
    "string.max": "message must be at most 5000 characters"
  })
});

const contactFormSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required().messages({
    "any.required": "name is required",
    "string.empty": "name is required",
    "string.min": "name must be at least 2 characters",
    "string.max": "name must be at most 120 characters"
  }),
  email: EMAIL_SCHEMA.required().messages({
    "any.required": "email is required",
    "string.empty": "email is required",
    "string.email": "email must be a valid email address"
  }),
  company: Joi.string().trim().allow("").max(160).default("").messages({
    "string.max": "company must be at most 160 characters"
  }),
  service: Joi.string().trim().allow("").max(120).default("").messages({
    "string.max": "service must be at most 120 characters"
  }),
  message: Joi.string().trim().min(10).max(5000).required().messages({
    "any.required": "message is required",
    "string.empty": "message is required",
    "string.min": "message must be at least 10 characters",
    "string.max": "message must be at most 5000 characters"
  })
});

const patchStatusSchema = Joi.object({
  status: Joi.string().trim().lowercase().required().valid(...STATUSES).messages({
    "any.required": "status is required",
    "string.empty": "status is required",
    "any.only": "status must be one of: queued, sent, failed"
  }),
  errorMessage: Joi.string().trim().allow("").max(500).optional().messages({
    "string.max": "errorMessage must be at most 500 characters"
  })
});

const channelSchema = Joi.string().trim().lowercase().valid(...CHANNELS).messages({
  "any.only": "channel must be one of: email, sms, push, webhook"
});
const subjectSchema = Joi.string().trim().allow("").max(200).messages({
  "string.max": "subject must be at most 200 characters"
});
const messageSchema = Joi.string().trim().required().max(5000).messages({
  "any.required": "message cannot be empty",
  "string.empty": "message cannot be empty",
  "string.max": "message must be at most 5000 characters"
});
const statusSchema = Joi.string().trim().lowercase().valid(...STATUSES).messages({
  "any.only": "status must be one of: queued, sent, failed"
});
const providerMessageIdSchema = Joi.string().trim().allow("").max(255).messages({
  "string.max": "providerMessageId must be at most 255 characters"
});
const errorMessageSchema = Joi.string().trim().allow("").max(500).messages({
  "string.max": "errorMessage must be at most 500 characters"
});

const validateEmailList = (emails) => {
  if (!emails || emails.length === 0) {
    return "to must be a valid email or comma-separated list of emails";
  }

  const invalid = emails.some((email) => EMAIL_SCHEMA.validate(email).error);
  if (invalid) {
    return "to contains invalid email addresses";
  }

  return "";
};

export const validateSendEmailPayload = (body) => {
  const source = normalizeSource(body);
  const to = normalizeEmailList(source.to);
  const { value, error } = sendEmailSchema.validate(
    {
      subject: source.subject,
      message: source.message
    },
    {
      abortEarly: false,
      convert: true,
      stripUnknown: true
    }
  );

  const errors = toErrors(error);
  const toError = validateEmailList(to);
  if (toError) {
    errors.unshift(toError);
  }

  return {
    errors,
    payload: {
      to: to || [],
      subject: value?.subject || "",
      message: value?.message || ""
    }
  };
};

export const validateContactFormPayload = (body) => {
  const source = normalizeSource(body);
  const { value, error } = contactFormSchema.validate(source, {
    abortEarly: false,
    convert: true,
    stripUnknown: true
  });

  return {
    errors: toErrors(error),
    payload: {
      name: value?.name || "",
      email: value?.email || "",
      company: value?.company || "",
      service: value?.service || "",
      message: value?.message || ""
    }
  };
};

export const validatePatchStatusPayload = (body) => {
  const source = normalizeSource(body);
  const { value, error } = patchStatusSchema.validate(source, {
    abortEarly: false,
    convert: true,
    stripUnknown: true
  });

  if (error) {
    return { error: toErrors(error)[0] || "status is required" };
  }

  return {
    status: value.status,
    errorMessage: value.errorMessage
  };
};

export const buildNotificationLogUpdatePayload = (body) => {
  const source = normalizeSource(body);
  const payload = {};
  const errors = [];

  if (source.channel !== undefined) {
    const channel = normalizeString(source.channel).toLowerCase();
    const { error } = channelSchema.validate(channel);
    if (error) {
      errors.push("channel must be one of: email, sms, push, webhook");
    } else {
      payload.channel = channel;
    }
  }

  if (source.to !== undefined) {
    const to = normalizeEmailList(source.to);
    if (!to || to.length === 0 || to.some((email) => EMAIL_SCHEMA.validate(email).error)) {
      errors.push("to must contain valid email addresses");
    } else {
      payload.to = to.join(",");
    }
  }

  if (source.subject !== undefined) {
    const subject = normalizeString(source.subject);
    const { error } = subjectSchema.validate(subject);
    if (error) {
      errors.push("subject must be at most 200 characters");
    } else {
      payload.subject = subject;
    }
  }

  if (source.message !== undefined) {
    const message = normalizeString(source.message);
    const { error } = messageSchema.validate(message);
    if (error) {
      errors.push(
        message ? "message must be at most 5000 characters" : "message cannot be empty"
      );
    } else {
      payload.message = message;
    }
  }

  if (source.status !== undefined) {
    const status = normalizeString(source.status).toLowerCase();
    const { error } = statusSchema.validate(status);
    if (error) {
      errors.push("status must be one of: queued, sent, failed");
    } else {
      payload.status = status;
    }
  }

  if (source.providerMessageId !== undefined) {
    const providerMessageId = normalizeString(source.providerMessageId);
    const { error } = providerMessageIdSchema.validate(providerMessageId);
    if (error) {
      errors.push("providerMessageId must be at most 255 characters");
    } else {
      payload.providerMessageId = providerMessageId;
    }
  }

  if (source.scheduledAt !== undefined) {
    const scheduledAt = normalizeDate(source.scheduledAt);
    if (scheduledAt === null && source.scheduledAt !== null) {
      errors.push("scheduledAt must be a valid date");
    } else {
      payload.scheduledAt = scheduledAt;
    }
  }

  if (source.sentAt !== undefined) {
    const sentAt = normalizeDate(source.sentAt);
    if (sentAt === null && source.sentAt !== null) {
      errors.push("sentAt must be a valid date");
    } else {
      payload.sentAt = sentAt;
    }
  }

  if (source.errorMessage !== undefined) {
    const errorMessage = normalizeString(source.errorMessage);
    const { error } = errorMessageSchema.validate(errorMessage);
    if (error) {
      errors.push("errorMessage must be at most 500 characters");
    } else {
      payload.errorMessage = errorMessage;
    }
  }

  return { payload, errors };
};
