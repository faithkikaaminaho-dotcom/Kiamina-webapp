import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdminClientManagementUpdatePayload,
  buildAdminDashboardUpdatePayload,
  buildAdminStaffUpdatePayload,
  buildClientDashboardUpdatePayload,
  buildClientProfileUpdatePayload,
  buildClientWorkspaceUpdatePayload,
  validateAdminClientManagementListQuery,
  validateSyncFromAuthPayload
} from "../services/users-service/src/validation/users.validation.js";

test("users: sync-from-auth validator accepts valid payload", () => {
  const { errors, payload } = validateSyncFromAuthPayload({
    uid: "uid_1",
    email: "Member@Example.com",
    displayName: "Member Name",
    roles: ["client", "admin"]
  });

  assert.deepEqual(errors, []);
  assert.equal(payload.email, "member@example.com");
  assert.deepEqual(payload.roles, ["client", "admin"]);
});

test("users: profile payload normalizes names and financial month", () => {
  const { errors, payload } = buildClientProfileUpdatePayload({
    firstName: "jane",
    lastName: "doe",
    businessType: "Business",
    reportingCycle: "March"
  });

  assert.deepEqual(errors, []);
  assert.equal(payload["clientProfile.firstName"], "Jane");
  assert.equal(payload["clientProfile.lastName"], "Doe");
  assert.equal(payload["entityProfile.businessType"], "business");
  assert.equal(payload["entityProfile.financialYearEndMonth"], "03");
});

test("users: dashboard payload rejects unknown default page", () => {
  const { errors } = buildClientDashboardUpdatePayload({
    defaultLandingPage: "unknown-page"
  });

  assert.ok(
    errors.includes(
      "defaultLandingPage must be one of: dashboard, expenses, sales, bank-statements, upload-history, recent-activities, support, settings"
    )
  );
});

test("users: admin dashboard payload builds support leads and newsletters", () => {
  const { errors, payload } = buildAdminDashboardUpdatePayload({
    defaultLandingPage: "support-leads",
    supportLeads: [{ email: "lead@example.com", status: "new" }],
    newsletters: [{ email: "newsletter@example.com", status: "subscribed" }],
    workSessions: [{ id: "ws_1", adminEmail: "admin@example.com" }],
    notificationDrafts: [{ id: "draft_1", title: "Draft title" }],
    scheduledNotifications: [{ id: "schedule_1", status: "Scheduled" }],
    sentNotifications: [{ id: "sent_1", title: "Sent title" }],
    trashEntries: [{ id: "trash_1", entityType: "notification-draft" }]
  });

  assert.deepEqual(errors, []);
  assert.equal(payload["adminDashboard.defaultLandingPage"], "support-leads");
  assert.equal(payload["adminDashboard.supportLeads"].length, 1);
  assert.equal(payload["adminDashboard.newsletters"].length, 1);
  assert.equal(payload["adminDashboard.workSessions"].length, 1);
  assert.equal(payload["adminDashboard.notificationDrafts"].length, 1);
  assert.equal(payload["adminDashboard.scheduledNotifications"].length, 1);
  assert.equal(payload["adminDashboard.sentNotifications"].length, 1);
  assert.equal(payload["adminDashboard.trashEntries"].length, 1);
  assert.equal(payload["adminDashboard.stats.openSupportLeads"], 1);
  assert.equal(payload["adminDashboard.stats.newsletterSubscribers"], 1);
});

test("users: client workspace payload accepts mixed workspace sections", () => {
  const { errors, payload } = buildClientWorkspaceUpdatePayload({
    documents: { expenses: [{ id: "doc_1" }] },
    activityLog: [{ type: "upload" }],
    profilePhoto: "https://cdn.example.com/profile.png"
  });

  assert.deepEqual(errors, []);
  assert.deepEqual(payload["clientWorkspace.documents"], { expenses: [{ id: "doc_1" }] });
  assert.deepEqual(payload["clientWorkspace.activityLog"], [{ type: "upload" }]);
  assert.equal(payload["clientWorkspace.profilePhoto"], "https://cdn.example.com/profile.png");
});

test("users: admin client management list query parser normalizes values", () => {
  const { errors, payload } = validateAdminClientManagementListQuery({
    q: " Acme ",
    page: "2",
    limit: "25",
    sortBy: "businessName",
    sortOrder: "asc",
    onboardingCompleted: "true"
  });

  assert.deepEqual(errors, []);
  assert.equal(payload.q, "Acme");
  assert.equal(payload.page, 2);
  assert.equal(payload.limit, 25);
  assert.equal(payload.sortBy, "businessName");
  assert.equal(payload.sortOrder, "asc");
  assert.equal(payload.onboardingCompleted, true);
});

test("users: admin client management payload normalizes verification and tags", () => {
  const { errors, payload } = buildAdminClientManagementUpdatePayload({
    verificationStatus: "verified",
    assignedToUid: " area_admin_1 ",
    tags: ["Priority", "priority", "VAT"]
  });

  assert.deepEqual(errors, []);
  assert.equal(payload["verification.status"], "verified");
  assert.equal(payload["clientWorkspace.statusControl.assignedToUid"], "area_admin_1");
  assert.deepEqual(payload["clientWorkspace.statusControl.tags"], ["priority", "vat"]);
});

test("users: admin staff payload normalizes admin access aliases", () => {
  const { errors, payload } = buildAdminStaffUpdatePayload({
    adminAccess: {
      adminLevel: "area-accountant",
      adminPermissions: ["manage_admins", "view_clients", "manage_admin_roles"],
      mustChangePassword: true
    }
  });

  assert.deepEqual(errors, []);
  assert.equal(payload["adminAccess.adminLevel"], "area_accountant");
  assert.deepEqual(payload["adminAccess.adminPermissions"], [
    "manage_users",
    "manage_admin_roles",
    "view_businesses"
  ]);
  assert.equal(payload["adminAccess.mustChangePassword"], true);
});
