import { User } from "../models/User.model.js";

export const upsertUserFromAuth = async ({ uid, email, displayName, roles }) => {
  const updatePayload = {
    email: email.toLowerCase()
  };

  const normalizedDisplayName = String(displayName ?? "").trim();
  if (normalizedDisplayName) {
    updatePayload.displayName = normalizedDisplayName;
  }

  if (Array.isArray(roles) && roles.length > 0) {
    updatePayload.roles = roles;
  }

  return User.findOneAndUpdate(
    { uid },
    {
      $set: updatePayload
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
};

export const findUserByUid = async (uid) => User.findOne({ uid });

export const findUserByEmail = async (email) =>
  User.findOne({ email: String(email || "").trim().toLowerCase() });

export const findUserByClientTeamInvite = async ({ token = "" } = {}) => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return null;
  }

  return User.findOne({
    "clientWorkspace.teamInvites.token": normalizedToken
  });
};

export const findUserByClientPhone = async ({
  excludeUid = "",
  phoneCountryCode = "",
  phoneLocalNumber = "",
  phoneVariants = []
} = {}) => {
  const normalizedCountryCode = String(phoneCountryCode || "").trim();
  const normalizedLocalNumber = String(phoneLocalNumber || "").trim();
  const variants = [...new Set(
    (Array.isArray(phoneVariants) ? phoneVariants : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];

  if (!normalizedCountryCode && !normalizedLocalNumber && variants.length === 0) {
    return null;
  }

  const filters = [];
  if (normalizedCountryCode || normalizedLocalNumber) {
    filters.push({
      "clientProfile.phoneCountryCode": normalizedCountryCode,
      "clientProfile.phoneLocalNumber": normalizedLocalNumber
    });
  }
  if (variants.length > 0) {
    filters.push({ "clientProfile.phone": { $in: variants } });
    filters.push({ "clientWorkspace.accountSettings.verifiedPhoneNumber": { $in: variants } });
  }

  const query = filters.length === 1 ? filters[0] : { $or: filters };
  if (excludeUid) {
    query.uid = { $ne: String(excludeUid || "").trim() };
  }

  return User.findOne(query);
};

export const findUserById = async (id) => User.findById(id);

export const listUsers = async ({
  filter = {},
  sort = { updatedAt: -1 },
  skip = 0,
  limit = 50
} = {}) =>
  User.find(filter)
    .sort(sort)
    .skip(Math.max(0, Number(skip) || 0))
    .limit(Math.max(1, Number(limit) || 50));

export const countUsers = async (filter = {}) => User.countDocuments(filter);

export const updateUserById = async (id, payload) =>
  User.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true
  });

export const updateUserByUid = async (uid, payload) =>
  User.findOneAndUpdate({ uid }, payload, {
    new: true,
    runValidators: true
  });

export const deleteUserById = async (id) => User.findByIdAndDelete(id);

export const deleteUserByUid = async (uid) => User.findOneAndDelete({ uid });
