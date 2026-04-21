import mongoose from "mongoose";

const clientProfileSchema = new mongoose.Schema(
  {
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    otherNames: { type: String, default: "" },
    fullName: { type: String, default: "" },
    phoneCountryCode: { type: String, default: "+234" },
    phoneLocalNumber: { type: String, default: "" },
    phone: { type: String, default: "" },
    roleInCompany: { type: String, default: "" },
    language: { type: String, default: "English" },
    address1: { type: String, default: "" },
    address2: { type: String, default: "" },
    city: { type: String, default: "" },
    postalCode: { type: String, default: "" },
    addressCountry: { type: String, default: "Nigeria" }
  },
  { _id: false }
);

const entityProfileSchema = new mongoose.Schema(
  {
    businessType: {
      type: String,
      enum: ["", "individual", "business", "non-profit"],
      default: ""
    },
    businessName: { type: String, default: "" },
    country: { type: String, default: "" },
    currency: { type: String, default: "NGN" },
    industry: { type: String, default: "" },
    industryOther: { type: String, default: "" },
    cacNumber: { type: String, default: "" },
    tin: { type: String, default: "" },
    reportingCycle: { type: String, default: "" },
    startMonth: { type: String, default: "" },
    financialYearEndMonth: { type: String, default: "" },
    financialYearStartMonth: { type: String, default: "" }
  },
  { _id: false }
);

const onboardingSchema = new mongoose.Schema(
  {
    currentStep: { type: Number, default: 1, min: 1 },
    completed: { type: Boolean, default: false },
    skipped: { type: Boolean, default: false },
    verificationPending: { type: Boolean, default: true },
    completedAt: { type: Date, default: null },
    skippedAt: { type: Date, default: null }
  },
  { _id: false }
);

const identityVerificationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "submitted", "verified", "rejected"],
      default: "pending"
    },
    idType: { type: String, default: "" },
    idNumber: { type: String, default: "" },
    submittedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    locked: { type: Boolean, default: false }
  },
  { _id: false }
);

const businessVerificationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "submitted", "verified", "rejected"],
      default: "pending"
    },
    registrationDocumentName: { type: String, default: "" },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    locked: { type: Boolean, default: false }
  },
  { _id: false }
);

const verificationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "submitted", "verified", "rejected", "suspended"],
      default: "pending"
    },
    profileStepCompleted: { type: Boolean, default: false },
    identityStepCompleted: { type: Boolean, default: false },
    businessStepCompleted: { type: Boolean, default: false },
    stepsCompleted: { type: Number, default: 0, min: 0, max: 3 },
    fullyVerifiedAt: { type: Date, default: null },
    identity: {
      type: identityVerificationSchema,
      default: () => ({})
    },
    business: {
      type: businessVerificationSchema,
      default: () => ({})
    }
  },
  { _id: false }
);

const signupCaptureSchema = new mongoose.Schema(
  {
    signupIp: { type: String, default: "" },
    signupLocation: { type: String, default: "" },
    signupSource: { type: String, default: "" },
    capturePage: { type: String, default: "" },
    capturePath: { type: String, default: "" }
  },
  { _id: false }
);

const notificationPreferencesSchema = new mongoose.Schema(
  {
    inAppEnabled: { type: Boolean, default: true },
    soundEnabled: { type: Boolean, default: true },
    documentApproved: { type: Boolean, default: true },
    documentRejected: { type: Boolean, default: true },
    documentInfoRequested: { type: Boolean, default: true },
    verificationUpdates: { type: Boolean, default: true },
    accountSuspended: { type: Boolean, default: true },
    adminMessages: { type: Boolean, default: true },
    emailNewUploads: { type: Boolean, default: true },
    emailApprovals: { type: Boolean, default: true },
    emailWeeklySummary: { type: Boolean, default: true },
    emailSecurityAlerts: { type: Boolean, default: true }
  },
  { _id: false }
);

const clientDashboardSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: "" },
    businessCountry: { type: String, default: "" },
    baseCurrency: { type: String, default: "NGN" },
    defaultLandingPage: { type: String, default: "dashboard" },
    showGreeting: { type: Boolean, default: true },
    compactMode: { type: Boolean, default: false },
    widgets: {
      type: [String],
      default: ["verification", "documents", "notifications", "recent-activity"]
    },
    favoritePages: {
      type: [String],
      default: []
    },
    lastVisitedPage: { type: String, default: "dashboard" },
    lastVisitedAt: { type: Date, default: null }
  },
  { _id: false }
);

const clientWorkspaceSchema = new mongoose.Schema(
  {
    documents: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        expenses: [],
        sales: [],
        bankStatements: [],
        uploadHistory: [],
        resolvedDocuments: [],
        expenseClassOptions: [],
        salesClassOptions: []
      })
    },
    activityLog: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    onboardingState: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        currentStep: 1,
        completed: false,
        skipped: false,
        verificationPending: true,
        data: {}
      })
    },
    settingsProfile: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },
    verificationDocs: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },
    statusControl: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },
    notificationSettings: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },
    notifications: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    teamMembers: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    teamInvites: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    teamAccess: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },
    accountSettings: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },
    profilePhoto: {
      type: String,
      default: ""
    },
    companyLogo: {
      type: String,
      default: ""
    },
    updatedAt: {
      type: Date,
      default: null
    }
  },
  { _id: false }
);

const adminAccessSchema = new mongoose.Schema(
  {
    adminLevel: { type: String, default: "" },
    adminPermissions: {
      type: [String],
      default: []
    },
    mustChangePassword: {
      type: Boolean,
      default: false
    }
  },
  { _id: false }
);

const adminProfileSchema = new mongoose.Schema(
  {
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    displayName: { type: String, default: "" },
    jobTitle: { type: String, default: "" },
    department: { type: String, default: "" },
    phone: { type: String, default: "" },
    timezone: { type: String, default: "Africa/Lagos" }
  },
  { _id: false }
);

const adminSecurityPreferencesSchema = new mongoose.Schema(
  {
    sessionTimeout: { type: String, default: "30" },
    emailNotificationPreference: { type: Boolean, default: true },
    activityAlertPreference: { type: Boolean, default: true },
    twoFactorEnabled: { type: Boolean, default: true },
    notificationSoundEnabled: { type: Boolean, default: true }
  },
  { _id: false }
);

const supportLeadSchema = new mongoose.Schema(
  {
    leadId: { type: String, default: "" },
    fullName: { type: String, default: "" },
    email: { type: String, default: "" },
    companyName: { type: String, default: "" },
    phone: { type: String, default: "" },
    leadIpAddress: { type: String, default: "" },
    leadCountry: { type: String, default: "" },
    leadLocation: { type: String, default: "" },
    capturePage: { type: String, default: "" },
    capturePath: { type: String, default: "" },
    source: { type: String, default: "support-form" },
    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "converted", "closed"],
      default: "new"
    },
    interest: { type: String, default: "" },
    assignedToUid: { type: String, default: "" },
    notes: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const newsletterRecipientSchema = new mongoose.Schema(
  {
    email: { type: String, default: "" },
    fullName: { type: String, default: "" },
    leadIpAddress: { type: String, default: "" },
    leadCountry: { type: String, default: "" },
    leadLocation: { type: String, default: "" },
    capturePage: { type: String, default: "" },
    capturePath: { type: String, default: "" },
    status: {
      type: String,
      enum: ["subscribed", "unsubscribed", "bounced"],
      default: "subscribed"
    },
    source: { type: String, default: "website" },
    tags: {
      type: [String],
      default: []
    },
    subscribedAt: { type: Date, default: Date.now },
    lastEngagedAt: { type: Date, default: null }
  },
  { _id: false }
);

const adminDashboardSchema = new mongoose.Schema(
  {
    defaultLandingPage: { type: String, default: "admin-dashboard" },
    compactMode: { type: Boolean, default: false },
    widgets: {
      type: [String],
      default: ["overview", "support-leads", "newsletters", "team-activity"]
    },
    favoritePages: {
      type: [String],
      default: []
    },
    securityPreferences: {
      type: adminSecurityPreferencesSchema,
      default: () => ({})
    },
    lastVisitedPage: { type: String, default: "admin-dashboard" },
    lastVisitedAt: { type: Date, default: null },
    supportLeads: {
      type: [supportLeadSchema],
      default: []
    },
    newsletters: {
      type: [newsletterRecipientSchema],
      default: []
    },
    workSessions: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    sentNotifications: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    notificationDrafts: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    scheduledNotifications: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    trashEntries: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    stats: {
      openSupportLeads: { type: Number, min: 0, default: 0 },
      newsletterSubscribers: { type: Number, min: 0, default: 0 },
      newsletterUnsubscribed: { type: Number, min: 0, default: 0 }
    }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    uid: {
      type: String,
      required: true,
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
    displayName: {
      type: String,
      default: ""
    },
    roles: {
      type: [String],
      default: ["client"]
    },
    status: {
      type: String,
      enum: ["active", "disabled", "suspended"],
      default: "active"
    },
    clientProfile: {
      type: clientProfileSchema,
      default: () => ({})
    },
    entityProfile: {
      type: entityProfileSchema,
      default: () => ({})
    },
    onboarding: {
      type: onboardingSchema,
      default: () => ({})
    },
    verification: {
      type: verificationSchema,
      default: () => ({})
    },
    signupCapture: {
      type: signupCaptureSchema,
      default: () => ({})
    },
    notificationPreferences: {
      type: notificationPreferencesSchema,
      default: () => ({})
    },
    adminProfile: {
      type: adminProfileSchema,
      default: () => ({})
    },
    adminAccess: {
      type: adminAccessSchema,
      default: () => ({})
    },
    adminDashboard: {
      type: adminDashboardSchema,
      default: () => ({})
    },
    clientDashboard: {
      type: clientDashboardSchema,
      default: () => ({})
    },
    clientWorkspace: {
      type: clientWorkspaceSchema,
      default: () => ({})
    }
  },
  {
    timestamps: true
  }
);

export const User = mongoose.model("User", userSchema);
