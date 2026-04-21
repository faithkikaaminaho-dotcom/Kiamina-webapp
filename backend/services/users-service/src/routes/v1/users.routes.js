import express from "express";
import {
  deleteMeClientTeamMember,
  deleteAdminClientManagementClient,
  getAdminClientManagement,
  getAdminClientManagementClient,
  getAdminStaff,
  getMeClientTeam,
  postPublicNewsletter,
  getPublicClientTeamInviteByToken,
  postPublicSupportLead,
  getPublicPhoneAvailability,
  getMeAdminDashboard,
  getMeClientDashboard,
  getMeClientDashboardOverview,
  getMeClientWorkspace,
  getById,
  getMe,
  patchMeClientTeamInvite,
  patchMeClientTeamMember,
  patchAdminStaffByUid,
  postMeClientTeamInvite,
  postMeClientTeamInviteAccept,
  removeMe,
  patchAdminClientManagementClient,
  patchMeAdminDashboard,
  patchMeClientDashboard,
  patchMeClientWorkspace,
  patchMeProfile,
  putById,
  removeById,
  syncFromAuth
} from "../../controllers/users.controller.js";

const router = express.Router();

router.get("/public/phone-availability", getPublicPhoneAvailability);
router.post("/public/support-leads", postPublicSupportLead);
router.post("/public/newsletters", postPublicNewsletter);
router.get("/public/client-team-invite", getPublicClientTeamInviteByToken);
router.post("/sync-from-auth", syncFromAuth);
router.get("/me", getMe);
router.delete("/me", removeMe);
router.patch("/me/profile", patchMeProfile);
router.get("/me/client-dashboard", getMeClientDashboard);
router.get("/me/client-dashboard/overview", getMeClientDashboardOverview);
router.patch("/me/client-dashboard", patchMeClientDashboard);
router.get("/me/client-workspace", getMeClientWorkspace);
router.patch("/me/client-workspace", patchMeClientWorkspace);
router.get("/me/client-team", getMeClientTeam);
router.post("/me/client-team/invites", postMeClientTeamInvite);
router.post("/me/client-team/invites/accept", postMeClientTeamInviteAccept);
router.patch("/me/client-team/invites/:inviteId", patchMeClientTeamInvite);
router.patch("/me/client-team/members/:memberId", patchMeClientTeamMember);
router.delete("/me/client-team/members/:memberId", deleteMeClientTeamMember);
router.get("/me/admin-dashboard", getMeAdminDashboard);
router.patch("/me/admin-dashboard", patchMeAdminDashboard);
router.get("/admin/staff", getAdminStaff);
router.patch("/admin/staff/:uid", patchAdminStaffByUid);
router.get("/admin/client-management", getAdminClientManagement);
router.get("/admin/client-management/clients/:uid", getAdminClientManagementClient);
router.patch("/admin/client-management/clients/:uid", patchAdminClientManagementClient);
router.delete("/admin/client-management/clients/:uid", deleteAdminClientManagementClient);
router.get("/:id", getById);
router.put("/:id", putById);
router.delete("/:id", removeById);

export default router;
