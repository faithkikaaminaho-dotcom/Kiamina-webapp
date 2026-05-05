import mongoose from "mongoose";

const ACCOUNT_ROLES = ["client", "admin", "accountant", "manager", "owner", "superadmin"];
const ACCOUNT_STATUSES = ["active", "disabled", "suspended", "pending"];
const AUTH_PROVIDERS = ["email-password", "google", "otp", "invite", "sso"];
const LOGIN_METHODS = ["password", "otp", "google", "token", "invite"];

const authAccountSchema = new mongoose.Schema(
  {
    uid: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true
    },
    fullName: {
      type: String,
      default: ""
    },
    role: {
      type: String,
      enum: ACCOUNT_ROLES,
      default: "client"
    },
    provider: {
      type: String,
      enum: AUTH_PROVIDERS,
      default: "email-password"
    },
    providers: {
      type: [String],
      enum: AUTH_PROVIDERS,
      default: []
    },
    hasPassword: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: "active"
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    phoneVerified: {
      type: Boolean,
      default: false
    },
    onboardingStartedAt: {
      type: Date,
      default: null
    },
    onboardingCompletedAt: {
      type: Date,
      default: null
    },
    lastLoginAt: {
      type: Date,
      default: null,
      index: true
    },
    lastLoginIp: {
      type: String,
      default: ""
    },
    lastLoginUserAgent: {
      type: String,
      default: ""
    },
    lastLoginMethod: {
      type: String,
      enum: [...LOGIN_METHODS, ""],
      default: ""
    }
  },
  {
    timestamps: true
  }
);

authAccountSchema.index({ email: 1, role: 1 });

export const AuthAccount = mongoose.model("AuthAccount", authAccountSchema);
