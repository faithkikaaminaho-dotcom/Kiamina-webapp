import { apiFetch } from './apiClient'

const buildJsonHeaders = () => ({
  'Content-Type': 'application/json',
})

const getJson = async (path) => {
  try {
    const response = await apiFetch(path, {
      method: 'GET',
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { message: String(error?.message || 'Network request failed.') },
    }
  }
}

const postJson = async (path, payload = {}) => {
  try {
    const response = await apiFetch(path, {
      method: 'POST',
      headers: buildJsonHeaders(),
      body: JSON.stringify(payload || {}),
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { message: String(error?.message || 'Network request failed.') },
    }
  }
}

const patchJson = async (path, payload = {}) => {
  try {
    const response = await apiFetch(path, {
      method: 'PATCH',
      headers: buildJsonHeaders(),
      body: JSON.stringify(payload || {}),
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { message: String(error?.message || 'Network request failed.') },
    }
  }
}

const deleteJson = async (path) => {
  try {
    const response = await apiFetch(path, {
      method: 'DELETE',
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { message: String(error?.message || 'Network request failed.') },
    }
  }
}

export const fetchPublicClientTeamInvite = async ({
  token = '',
  companyId = '',
} = {}) => {
  const params = new URLSearchParams()
  if (token) params.set('invite', String(token || '').trim())
  if (companyId) params.set('company', String(companyId || '').trim())
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return getJson(`/api/users/public/client-team-invite${suffix}`)
}

export const fetchMyClientTeam = async () => (
  getJson('/api/users/me/client-team')
)

export const createClientTeamInvite = async ({
  email = '',
  role = 'manager',
  inviteBaseUrl = '',
} = {}) => (
  postJson('/api/users/me/client-team/invites', {
    email: String(email || '').trim().toLowerCase(),
    role: String(role || 'manager').trim().toLowerCase(),
    inviteBaseUrl: String(inviteBaseUrl || '').trim(),
  })
)

export const acceptClientTeamInvite = async ({
  token = '',
  companyId = '',
  email = '',
  fullName = '',
} = {}) => (
  postJson('/api/users/me/client-team/invites/accept', {
    token: String(token || '').trim(),
    companyId: String(companyId || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    fullName: String(fullName || '').trim(),
  })
)

export const cancelClientTeamInvite = async ({
  inviteId = '',
} = {}) => (
  patchJson(`/api/users/me/client-team/invites/${encodeURIComponent(String(inviteId || '').trim())}`, {})
)

export const updateClientTeamMember = async ({
  memberId = '',
  role = 'viewer',
} = {}) => (
  patchJson(`/api/users/me/client-team/members/${encodeURIComponent(String(memberId || '').trim())}`, {
    role: String(role || 'viewer').trim().toLowerCase(),
  })
)

export const removeClientTeamMember = async ({
  memberId = '',
} = {}) => (
  deleteJson(`/api/users/me/client-team/members/${encodeURIComponent(String(memberId || '').trim())}`)
)
