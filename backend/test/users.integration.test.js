import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

let mongoServer;
let app;
let connectToDatabase;
let User;
let setupError = null;

const ensureSetup = (t) => {
  if (!setupError) {
    return true;
  }

  t.skip(`Mongo integration setup unavailable: ${setupError.message}`);
  return false;
};

test.before(async () => {
  process.env.NODE_ENV = "test";
  process.env.SERVICE_NAME = "users-service-test";
  process.env.MONGO_DB_NAME = "kiamina_users_integration";
  process.env.DOCUMENTS_SERVICE_URL = "";
  process.env.DOCUMENTS_SERVICE_TIMEOUT_MS = "500";
  process.env.AUTH_SERVICE_URL = "";
  process.env.AUTH_SERVICE_TIMEOUT_MS = "500";
  process.env.NOTIFICATIONS_SERVICE_URL = "";
  process.env.NOTIFICATIONS_SERVICE_TIMEOUT_MS = "500";
  process.env.MONGOMS_RUNTIME_DOWNLOAD = process.env.MONGOMS_RUNTIME_DOWNLOAD || "0";

  try {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();

    ({ default: app } = await import("../services/users-service/src/app.js"));
    ({ connectToDatabase } = await import("../services/users-service/src/config/db.js"));
    ({ User } = await import("../services/users-service/src/models/User.model.js"));

    await connectToDatabase();
  } catch (error) {
    setupError = error;
  }
});

test.beforeEach(async () => {
  if (setupError) {
    return;
  }

  await User.deleteMany({});
});

test.after(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }

  if (mongoServer) {
    await mongoServer.stop();
  }
});

test("users integration: admin dashboard stores support leads and newsletters", async (t) => {
  if (!ensureSetup(t)) return;

  const adminUid = "admin_uid_1";
  const adminEmail = "admin@example.com";

  await User.create({
    uid: adminUid,
    email: adminEmail,
    roles: ["admin"],
    displayName: "Admin User"
  });

  const patchResponse = await request(app)
    .patch("/api/v1/users/me/admin-dashboard")
    .set("x-user-id", adminUid)
    .set("x-user-email", adminEmail)
    .set("x-user-roles", "admin")
    .send({
      defaultLandingPage: "support-leads",
      securityPreferences: {
        sessionTimeout: "60",
        emailNotificationPreference: true,
        activityAlertPreference: true,
        twoFactorEnabled: true,
        notificationSoundEnabled: false
      },
      adminProfile: {
        firstName: "Ada",
        lastName: "Admin",
        jobTitle: "Operations Lead"
      },
      supportLeads: [
        {
          leadId: "lead_001",
          fullName: "Beta Client",
          email: "beta@example.com",
          status: "new",
          source: "support-form"
        }
      ],
      newsletters: [
        {
          email: "subscribed@example.com",
          status: "subscribed",
          source: "website"
        },
        {
          email: "unsubscribed@example.com",
          status: "unsubscribed",
          source: "import"
        }
      ],
      workSessions: [
        {
          id: "work_001",
          adminEmail: adminEmail,
          adminName: "Admin User",
          clockInAt: "2026-04-18T08:00:00.000Z"
        }
      ],
      sentNotifications: [
        {
          id: "sent_001",
          title: "Kiamina update",
          message: "Notification delivered."
        }
      ],
      notificationDrafts: [
        {
          id: "draft_001",
          title: "Reminder draft",
          message: "Remember to review documents."
        }
      ],
      scheduledNotifications: [
        {
          id: "sched_001",
          title: "Scheduled alert",
          status: "Scheduled"
        }
      ],
      trashEntries: [
        {
          id: "trash_001",
          entityType: "notification-draft",
          entityLabel: "Reminder draft"
        }
      ]
    });

  assert.equal(patchResponse.status, 200);
  assert.equal(patchResponse.body?.adminProfile?.firstName, "Ada");
  assert.equal(patchResponse.body?.dashboard?.securityPreferences?.sessionTimeout, "60");
  assert.equal(patchResponse.body?.dashboard?.securityPreferences?.notificationSoundEnabled, false);
  assert.equal(patchResponse.body?.dashboard?.supportLeads?.length, 1);
  assert.equal(patchResponse.body?.dashboard?.newsletters?.length, 2);
  assert.equal(patchResponse.body?.dashboard?.workSessions?.length, 1);
  assert.equal(patchResponse.body?.dashboard?.sentNotifications?.length, 1);
  assert.equal(patchResponse.body?.dashboard?.notificationDrafts?.length, 1);
  assert.equal(patchResponse.body?.dashboard?.scheduledNotifications?.length, 1);
  assert.equal(patchResponse.body?.dashboard?.trashEntries?.length, 1);
  assert.equal(patchResponse.body?.dashboard?.stats?.openSupportLeads, 1);
  assert.equal(patchResponse.body?.dashboard?.stats?.newsletterSubscribers, 1);
  assert.equal(patchResponse.body?.dashboard?.stats?.newsletterUnsubscribed, 1);

  const getResponse = await request(app)
    .get("/api/v1/users/me/admin-dashboard")
    .set("x-user-id", adminUid)
    .set("x-user-email", adminEmail)
    .set("x-user-roles", "admin");

  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.body?.dashboard?.securityPreferences?.notificationSoundEnabled, false);
  assert.equal(getResponse.body?.dashboard?.supportLeads?.length, 1);
  assert.equal(getResponse.body?.dashboard?.newsletters?.length, 2);
  assert.equal(getResponse.body?.dashboard?.workSessions?.length, 1);
  assert.equal(getResponse.body?.dashboard?.notificationDrafts?.length, 1);
  assert.equal(getResponse.body?.dashboard?.scheduledNotifications?.length, 1);
  assert.equal(getResponse.body?.dashboard?.sentNotifications?.length, 1);
  assert.equal(getResponse.body?.dashboard?.trashEntries?.length, 1);
});

test("users integration: admin staff endpoint returns stored admin access metadata", async (t) => {
  if (!ensureSetup(t)) return;

  const ownerUid = "owner_uid_staff";
  const ownerEmail = "owner-staff@example.com";
  const adminUid = "admin_uid_staff";
  const adminEmail = "admin-staff@example.com";

  await User.create({
    uid: ownerUid,
    email: ownerEmail,
    roles: ["owner"],
    displayName: "Owner Staff",
    adminAccess: {
      adminLevel: "owner",
      adminPermissions: ["manage_admins"],
      mustChangePassword: false
    }
  });

  await User.create({
    uid: adminUid,
    email: adminEmail,
    roles: ["admin"],
    displayName: "Area Admin",
    status: "active",
    adminProfile: {
      displayName: "Area Admin",
      jobTitle: "Area Accountant",
      department: "Operations",
      phone: "+234 8012345678"
    },
    adminAccess: {
      adminLevel: "area-accountant",
      adminPermissions: ["view_clients"],
      mustChangePassword: true
    },
    adminDashboard: {
      securityPreferences: {
        sessionTimeout: "15",
        notificationSoundEnabled: false
      }
    }
  });

  const response = await request(app)
    .get("/api/v1/users/admin/staff")
    .set("x-user-id", ownerUid)
    .set("x-user-email", ownerEmail)
    .set("x-user-roles", "owner");

  assert.equal(response.status, 200);
  assert.equal(response.body?.total, 2);
  const staffRow = response.body?.staff?.find((entry) => entry.uid === adminUid);
  assert.ok(staffRow);
  assert.equal(staffRow?.adminProfile?.jobTitle, "Area Accountant");
  assert.equal(staffRow?.adminAccess?.mustChangePassword, true);
  assert.deepEqual(staffRow?.adminAccess?.adminPermissions, ["view_businesses"]);
  assert.equal(staffRow?.dashboardSecurityPreferences?.sessionTimeout, "15");
  assert.equal(staffRow?.dashboardSecurityPreferences?.notificationSoundEnabled, false);
});

test("users integration: client-management permissions allow document updates but block settings and notifications", async (t) => {
  if (!ensureSetup(t)) return;

  const adminUid = "admin_uid_permissions_client";
  const adminEmail = "admin-permissions-client@example.com";
  const clientUid = "client_uid_permissions_client";
  const clientEmail = "client-permissions@example.com";

  await User.create({
    uid: adminUid,
    email: adminEmail,
    roles: ["admin"],
    displayName: "Area Accountant",
    adminAccess: {
      adminLevel: "area-accountant",
      adminPermissions: [],
      mustChangePassword: false
    }
  });

  await User.create({
    uid: clientUid,
    email: clientEmail,
    roles: ["client"],
    displayName: "Permission Scoped Client",
    status: "active",
    entityProfile: {
      businessName: "Permission Scoped Ltd",
      country: "Nigeria",
      currency: "NGN",
      businessType: "business"
    }
  });

  const listResponse = await request(app)
    .get("/api/v1/users/admin/client-management")
    .set("x-user-id", adminUid)
    .set("x-user-email", adminEmail)
    .set("x-user-roles", "admin")
    .query({ q: "Permission", limit: 10, page: 1 });

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body?.clients?.[0]?.uid, clientUid);

  const detailResponse = await request(app)
    .get(`/api/v1/users/admin/client-management/clients/${clientUid}`)
    .set("x-user-id", adminUid)
    .set("x-user-email", adminEmail)
    .set("x-user-roles", "admin");

  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.body?.uid, clientUid);

  const businessPatchResponse = await request(app)
    .patch(`/api/v1/users/admin/client-management/clients/${clientUid}`)
    .set("x-user-id", adminUid)
    .set("x-user-email", adminEmail)
    .set("x-user-roles", "admin")
    .send({
      businessName: "Updated Permission Scoped Ltd"
    });

  assert.equal(businessPatchResponse.status, 403);
  assert.match(businessPatchResponse.body?.message || "", /client settings/i);

  const documentPatchResponse = await request(app)
    .patch(`/api/v1/users/admin/client-management/clients/${clientUid}`)
    .set("x-user-id", adminUid)
    .set("x-user-email", adminEmail)
    .set("x-user-roles", "admin")
    .send({
      documents: {
        expenses: [{ id: "exp_permission_1", fileName: "receipt.pdf" }]
      }
    });

  assert.equal(documentPatchResponse.status, 200);
  assert.equal(
    documentPatchResponse.body?.clientWorkspace?.documents?.expenses?.[0]?.fileName,
    "receipt.pdf"
  );

  const notificationPatchResponse = await request(app)
    .patch(`/api/v1/users/admin/client-management/clients/${clientUid}`)
    .set("x-user-id", adminUid)
    .set("x-user-email", adminEmail)
    .set("x-user-roles", "admin")
    .send({
      notifications: [{ id: "notif_permission_1", title: "Test notification" }]
    });

  assert.equal(notificationPatchResponse.status, 403);
  assert.match(notificationPatchResponse.body?.message || "", /notifications/i);
});

test("users integration: admin staff endpoints reject admins without staff-management permissions", async (t) => {
  if (!ensureSetup(t)) return;

  const adminUid = "admin_uid_staff_limited";
  const adminEmail = "admin-staff-limited@example.com";
  const targetUid = "admin_uid_staff_target";
  const targetEmail = "admin-staff-target@example.com";

  await User.create({
    uid: adminUid,
    email: adminEmail,
    roles: ["admin"],
    displayName: "Limited Admin",
    adminAccess: {
      adminLevel: "customer_service",
      adminPermissions: ["send_notifications"],
      mustChangePassword: false
    }
  });

  await User.create({
    uid: targetUid,
    email: targetEmail,
    roles: ["admin"],
    displayName: "Target Admin",
    adminAccess: {
      adminLevel: "technical_support",
      adminPermissions: ["edit_client_settings"],
      mustChangePassword: false
    }
  });

  const listResponse = await request(app)
    .get("/api/v1/users/admin/staff")
    .set("x-user-id", adminUid)
    .set("x-user-email", adminEmail)
    .set("x-user-roles", "admin");

  assert.equal(listResponse.status, 403);
  assert.match(listResponse.body?.message || "", /permission to access admin staff/i);

  const patchResponse = await request(app)
    .patch(`/api/v1/users/admin/staff/${targetUid}`)
    .set("x-user-id", adminUid)
    .set("x-user-email", adminEmail)
    .set("x-user-roles", "admin")
    .send({
      adminProfile: {
        firstName: "Updated",
        lastName: "Admin"
      }
    });

  assert.equal(patchResponse.status, 403);
  assert.match(patchResponse.body?.message || "", /admin staff profiles/i);
});

test("users integration: manage-users admin can update staff profile but not admin roles", async (t) => {
  if (!ensureSetup(t)) return;

  const adminUid = "admin_uid_staff_manager";
  const adminEmail = "admin-staff-manager@example.com";
  const targetUid = "admin_uid_staff_profile_target";
  const targetEmail = "admin-staff-profile-target@example.com";

  await User.create({
    uid: adminUid,
    email: adminEmail,
    roles: ["admin"],
    displayName: "Staff Manager",
    adminAccess: {
      adminLevel: "super",
      adminPermissions: ["manage_users"],
      mustChangePassword: false
    }
  });

  await User.create({
    uid: targetUid,
    email: targetEmail,
    roles: ["admin"],
    displayName: "Profile Target",
    adminAccess: {
      adminLevel: "technical_support",
      adminPermissions: ["edit_client_settings"],
      mustChangePassword: false
    }
  });

  const profilePatchResponse = await request(app)
    .patch(`/api/v1/users/admin/staff/${targetUid}`)
    .set("x-user-id", adminUid)
    .set("x-user-email", adminEmail)
    .set("x-user-roles", "admin")
    .send({
      adminProfile: {
        firstName: "Profile",
        lastName: "Updated",
        displayName: "Profile Updated"
      }
    });

  assert.equal(profilePatchResponse.status, 200);
  assert.equal(profilePatchResponse.body?.adminProfile?.displayName, "Profile Updated");

  const accessPatchResponse = await request(app)
    .patch(`/api/v1/users/admin/staff/${targetUid}`)
    .set("x-user-id", adminUid)
    .set("x-user-email", adminEmail)
    .set("x-user-roles", "admin")
    .send({
      adminAccess: {
        adminLevel: "customer_service",
        adminPermissions: ["send_notifications"],
        mustChangePassword: false
      }
    });

  assert.equal(accessPatchResponse.status, 403);
  assert.match(accessPatchResponse.body?.message || "", /admin roles or security settings/i);
});

test("users integration: non-admin actor cannot access admin dashboard endpoint", async (t) => {
  if (!ensureSetup(t)) return;

  const response = await request(app)
    .get("/api/v1/users/me/admin-dashboard")
    .set("x-user-id", "client_uid_1")
    .set("x-user-email", "client@example.com")
    .set("x-user-roles", "client");

  assert.equal(response.status, 403);
  assert.match(response.body?.message || "", /only admin users/i);
});

test("users integration: client workspace patch and get endpoints persist workspace payload", async (t) => {
  if (!ensureSetup(t)) return;

  const uid = "client_workspace_uid";
  const email = "workspace-client@example.com";

  await User.create({
    uid,
    email,
    roles: ["client"],
    displayName: "Workspace Client"
  });

  const patchResponse = await request(app)
    .patch("/api/v1/users/me/client-workspace")
    .set("x-user-id", uid)
    .set("x-user-email", email)
    .set("x-user-roles", "client")
    .send({
      documents: {
        expenses: [{ id: "exp_1", fileName: "receipt.pdf" }]
      },
      activityLog: [{ id: "act_1", action: "uploaded-document" }],
      notificationSettings: { inAppEnabled: true },
      profilePhoto: "https://cdn.example.com/profile.png"
    });

  assert.equal(patchResponse.status, 200);
  assert.equal(patchResponse.body?.uid, uid);
  assert.equal(
    patchResponse.body?.workspace?.documents?.expenses?.[0]?.fileName,
    "receipt.pdf"
  );
  assert.equal(
    patchResponse.body?.workspace?.profilePhoto,
    "https://cdn.example.com/profile.png"
  );

  const getResponse = await request(app)
    .get("/api/v1/users/me/client-workspace")
    .set("x-user-id", uid)
    .set("x-user-email", email)
    .set("x-user-roles", "client");

  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.body?.uid, uid);
  assert.equal(
    getResponse.body?.workspace?.activityLog?.[0]?.action,
    "uploaded-document"
  );
});

test("users integration: client profile updates no longer stay pending because retired verification steps are auto-satisfied", async (t) => {
  if (!ensureSetup(t)) return;

  const uid = "client_profile_uid";
  const email = "profile-client@example.com";

  await User.create({
    uid,
    email,
    roles: ["client"],
    displayName: "Profile Client"
  });

  const response = await request(app)
    .patch("/api/v1/users/me/profile")
    .set("x-user-id", uid)
    .set("x-user-email", email)
    .set("x-user-roles", "client")
    .send({
      firstName: "Ada",
      lastName: "Client",
      phoneCountryCode: "+234",
      phoneLocalNumber: "8012345678",
      businessType: "business",
      businessName: "Kiamina Test Client",
      country: "Nigeria",
      currency: "NGN"
    });

  assert.equal(response.status, 200);
  assert.equal(response.body?.verification?.profileStepCompleted, true);
  assert.equal(response.body?.verification?.stepsCompleted, 3);
  assert.equal(response.body?.verification?.status, "verified");
  assert.equal(response.body?.onboarding?.verificationPending, false);
});

test("users integration: sync-from-auth migrates an existing email record to a new uid", async (t) => {
  if (!ensureSetup(t)) return;

  await User.create({
    uid: "legacy_user_uid",
    email: "migrate-user@example.com",
    roles: ["client"],
    displayName: "Legacy Display Name",
    clientProfile: {
      firstName: "Legacy",
      lastName: "Client",
      fullName: "Legacy Client"
    },
    entityProfile: {
      businessName: "Legacy Business",
      country: "Nigeria",
      currency: "NGN",
      businessType: "business"
    }
  });

  const response = await request(app)
    .post("/api/v1/users/sync-from-auth")
    .set("x-user-id", "firebase_user_uid")
    .set("x-user-email", "migrate-user@example.com")
    .set("x-user-roles", "client")
    .send({
      uid: "firebase_user_uid",
      email: "migrate-user@example.com",
      displayName: "Migrated Display Name",
      roles: ["client"]
    });

  assert.equal(response.status, 200);
  assert.equal(response.body?.uid, "firebase_user_uid");
  assert.equal(response.body?.displayName, "Migrated Display Name");
  assert.equal(response.body?.clientProfile?.firstName, "Legacy");
  assert.equal(response.body?.entityProfile?.businessName, "Legacy Business");

  const legacyUser = await User.findOne({ uid: "legacy_user_uid" }).lean();
  assert.equal(legacyUser, null);

  const migratedUser = await User.findOne({
    uid: "firebase_user_uid",
    email: "migrate-user@example.com"
  }).lean();
  assert.ok(migratedUser);
  assert.equal(migratedUser?.clientProfile?.lastName, "Client");
});

test("users integration: admin client-management list and patch update client account", async (t) => {
  if (!ensureSetup(t)) return;

  const adminUid = "admin_uid_management";
  const adminEmail = "admin-management@example.com";
  const clientUid = "client_uid_management";
  const clientEmail = "client-management@example.com";

  await User.create({
    uid: adminUid,
    email: adminEmail,
    roles: ["admin"],
    displayName: "Admin Management"
  });

  await User.create({
    uid: clientUid,
    email: clientEmail,
    roles: ["client"],
    displayName: "Client Management",
    status: "active",
    entityProfile: {
      businessName: "Acme Logistics",
      country: "Nigeria",
      currency: "NGN",
      businessType: "business"
    }
  });

  const listResponse = await request(app)
    .get("/api/v1/users/admin/client-management")
    .set("x-user-id", adminUid)
    .set("x-user-email", adminEmail)
    .set("x-user-roles", "admin")
    .query({ q: "Acme", limit: 10, page: 1 });

  assert.equal(listResponse.status, 200);
  assert.ok(Array.isArray(listResponse.body?.clients));
  assert.equal(listResponse.body?.clients?.length, 1);
  assert.equal(listResponse.body?.clients?.[0]?.uid, clientUid);

  const patchResponse = await request(app)
    .patch(`/api/v1/users/admin/client-management/clients/${clientUid}`)
    .set("x-user-id", adminUid)
    .set("x-user-email", adminEmail)
    .set("x-user-roles", "admin")
    .send({
      status: "suspended",
      verificationStatus: "submitted",
      assignedToUid: "area_admin_11",
      tags: ["Priority", "Escalated"]
    });

  assert.equal(patchResponse.status, 200);
  assert.equal(patchResponse.body?.status, "suspended");
  assert.equal(patchResponse.body?.verification?.status, "submitted");
  assert.equal(
    patchResponse.body?.clientWorkspace?.statusControl?.assignedToUid,
    "area_admin_11"
  );
  assert.deepEqual(
    patchResponse.body?.clientWorkspace?.statusControl?.tags,
    ["priority", "escalated"]
  );
});

test("users integration: owner can delete client-management account by uid", async (t) => {
  if (!ensureSetup(t)) return;

  const ownerUid = "owner_uid_management";
  const ownerEmail = "owner-management@example.com";
  const clientUid = "client_uid_delete_management";
  const clientEmail = "client-delete-management@example.com";

  await User.create({
    uid: ownerUid,
    email: ownerEmail,
    roles: ["owner"],
    displayName: "Owner Management"
  });

  await User.create({
    uid: clientUid,
    email: clientEmail,
    roles: ["client"],
    displayName: "Client Delete Management",
    status: "active"
  });

  const response = await request(app)
    .delete(`/api/v1/users/admin/client-management/clients/${clientUid}`)
    .set("x-user-id", ownerUid)
    .set("x-user-email", ownerEmail)
    .set("x-user-roles", "owner")
    .send({
      reason: "cleanup"
    });

  assert.equal(response.status, 200);
  assert.equal(response.body?.uid, clientUid);
  assert.equal(response.body?.cascade?.documents?.attempted, false);
  assert.equal(response.body?.cascade?.auth?.attempted, false);

  const deletedUser = await User.findOne({ uid: clientUid }).lean();
  assert.equal(deletedUser, null);
});

test("users integration: delete /users/me removes user and returns cascade summary", async (t) => {
  if (!ensureSetup(t)) return;

  const uid = "client_delete_uid";
  const email = "client-delete@example.com";

  await User.create({
    uid,
    email,
    roles: ["client"],
    displayName: "Client Delete"
  });

  const response = await request(app)
    .delete("/api/v1/users/me")
    .set("x-user-id", uid)
    .set("x-user-email", email)
    .set("x-user-roles", "client")
    .send({
      reason: "user-requested"
    });

  assert.equal(response.status, 200);
  assert.equal(response.body?.uid, uid);
  assert.equal(response.body?.cascade?.documents?.attempted, false);
  assert.equal(response.body?.cascade?.auth?.attempted, false);

  const deletedUser = await User.findOne({ uid }).lean();
  assert.equal(deletedUser, null);
});

test("users integration: client team invite can be created, resolved publicly, and accepted", async (t) => {
  if (!ensureSetup(t)) return;

  const ownerUid = "client_team_owner_uid";
  const ownerEmail = "owner-team@example.com";
  const inviteeUid = "client_team_member_uid";
  const inviteeEmail = "member-team@example.com";

  await User.create({
    uid: ownerUid,
    email: ownerEmail,
    roles: ["client"],
    displayName: "Workspace Owner",
    entityProfile: {
      businessName: "Team Workspace Ltd",
      country: "Nigeria",
      currency: "NGN",
      businessType: "business"
    },
    clientWorkspace: {
      settingsProfile: {
        fullName: "Workspace Owner",
        businessName: "Team Workspace Ltd"
      }
    }
  });

  const createInviteResponse = await request(app)
    .post("/api/v1/users/me/client-team/invites")
    .set("x-user-id", ownerUid)
    .set("x-user-email", ownerEmail)
    .set("x-user-roles", "client")
    .send({
      email: inviteeEmail,
      role: "manager",
      inviteBaseUrl: "http://localhost:5175"
    });

  assert.equal(createInviteResponse.status, 201);
  assert.equal(createInviteResponse.body?.invites?.length, 1);
  assert.equal(createInviteResponse.body?.invite?.email, inviteeEmail);
  assert.equal(createInviteResponse.body?.invite?.role, "manager");
  assert.match(createInviteResponse.body?.inviteUrl || "", /\/team\/setup\?/i);

  const inviteToken = createInviteResponse.body?.invite?.token;
  const companyId = createInviteResponse.body?.invite?.companyId;

  const publicLookupResponse = await request(app)
    .get("/api/v1/users/public/client-team-invite")
    .query({
      invite: inviteToken,
      company: companyId
    });

  assert.equal(publicLookupResponse.status, 200);
  assert.equal(publicLookupResponse.body?.invite?.email, inviteeEmail);
  assert.equal(publicLookupResponse.body?.invite?.status, "pending");
  assert.equal(publicLookupResponse.body?.owner?.email, ownerEmail);

  const acceptInviteResponse = await request(app)
    .post("/api/v1/users/me/client-team/invites/accept")
    .set("x-user-id", inviteeUid)
    .set("x-user-email", inviteeEmail)
    .set("x-user-roles", "client")
    .send({
      token: inviteToken,
      companyId,
      email: inviteeEmail,
      fullName: "Invited Team Member"
    });

  assert.equal(acceptInviteResponse.status, 200);
  assert.equal(acceptInviteResponse.body?.accepted, true);
  assert.equal(acceptInviteResponse.body?.teamAccess?.role, "manager");
  assert.equal(acceptInviteResponse.body?.teamAccess?.ownerEmail, ownerEmail);
  assert.equal(acceptInviteResponse.body?.teamAccess?.accountType, "team-member");
  assert.equal(acceptInviteResponse.body?.teamAccess?.companyName, "Team Workspace Ltd");

  const ownerRecord = await User.findOne({ uid: ownerUid });
  assert.equal(ownerRecord?.clientWorkspace?.teamInvites?.length || 0, 0);
  assert.equal(ownerRecord?.clientWorkspace?.teamMembers?.length, 2);
  assert.equal(
    ownerRecord?.clientWorkspace?.teamMembers?.find((entry) => entry.email === inviteeEmail)?.role,
    "manager"
  );

  const inviteeRecord = await User.findOne({ uid: inviteeUid });
  assert.equal(inviteeRecord?.clientWorkspace?.teamAccess?.role, "manager");
  assert.equal(inviteeRecord?.clientWorkspace?.teamAccess?.companyId, companyId);
  assert.equal(inviteeRecord?.clientWorkspace?.teamAccess?.ownerEmail, ownerEmail);
  assert.equal(inviteeRecord?.clientWorkspace?.teamAccess?.companyName, "Team Workspace Ltd");
  assert.equal(inviteeRecord?.entityProfile?.businessName, "Team Workspace Ltd");
  assert.equal(inviteeRecord?.entityProfile?.country, "Nigeria");
  assert.equal(inviteeRecord?.entityProfile?.currency, "NGN");
  assert.equal(inviteeRecord?.clientWorkspace?.settingsProfile?.businessName, "Team Workspace Ltd");

  const inviteeTeamResponse = await request(app)
    .get("/api/v1/users/me/client-team")
    .set("x-user-id", inviteeUid)
    .set("x-user-email", inviteeEmail)
    .set("x-user-roles", "client");

  assert.equal(inviteeTeamResponse.status, 200);
  assert.equal(inviteeTeamResponse.body?.owner?.email, ownerEmail);
  assert.equal(inviteeTeamResponse.body?.members?.length, 2);
  assert.equal(inviteeTeamResponse.body?.invites?.length || 0, 0);
});
