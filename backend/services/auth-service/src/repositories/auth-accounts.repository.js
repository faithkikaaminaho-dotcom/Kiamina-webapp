import { AuthAccount } from "../models/AuthAccount.model.js";

export const findAuthAccountByUid = async (uid) => AuthAccount.findOne({ uid });

export const findAuthAccountByEmail = async (email) =>
  AuthAccount.findOne({ email: String(email || "").trim().toLowerCase() });

export const upsertAuthAccountByUid = async ({ uid, payload }) =>
  AuthAccount.findOneAndUpdate(
    { uid },
    {
      $set: payload
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true
    }
  );

export const updateAuthAccountByUid = async ({ uid, payload }) =>
  AuthAccount.findOneAndUpdate(
    { uid },
    {
      $set: payload
    },
    {
      new: true,
      runValidators: true
    }
  );

export const updateAuthAccountLoginMeta = async ({
  uid,
  lastLoginAt,
  lastLoginIp,
  lastLoginUserAgent,
  lastLoginMethod
}) =>
  AuthAccount.findOneAndUpdate(
    { uid },
    {
      $set: {
        lastLoginAt,
        lastLoginIp,
        lastLoginUserAgent,
        lastLoginMethod
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

export const deleteAuthAccountByUid = async (uid) =>
  AuthAccount.findOneAndDelete({
    uid
  });

export const countAuthAccountsByRoles = async (roles = []) => {
  const normalizedRoles = (Array.isArray(roles) ? roles : [])
    .map((role) => String(role || "").trim().toLowerCase())
    .filter(Boolean);

  if (normalizedRoles.length === 0) {
    return 0;
  }

  return AuthAccount.countDocuments({
    role: { $in: normalizedRoles }
  });
};

export const listAuthAccounts = async ({
  filter = {},
  sort = { updatedAt: -1 },
  limit = 200
} = {}) =>
  AuthAccount.find(filter)
    .sort(sort)
    .limit(Math.max(1, Number(limit) || 200));
