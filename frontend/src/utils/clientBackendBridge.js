import { apiFetch, setApiSessionId } from './apiClient'

const buildJsonHeaders = (authorizationToken = '') => {
  const headers = {
    'Content-Type': 'application/json',
  }
  const token = String(authorizationToken || '').trim()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

const splitNameParts = (value = '') => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return { firstName: '', lastName: '', otherNames: '' }
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '', otherNames: '' }
  }
  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1],
    otherNames: parts.slice(1, -1).join(' '),
  }
}

const normalizeBusinessType = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'non profit') return 'non-profit'
  if (normalized === 'non-profit') return 'non-profit'
  if (normalized === 'business') return 'business'
  if (normalized === 'individual') return 'individual'
  return ''
}

const postJson = async (path, payload, { authorizationToken = '' } = {}) => {
  try {
    const response = await apiFetch(path, {
      method: 'POST',
      headers: buildJsonHeaders(authorizationToken),
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

const patchJson = async (path, payload, { authorizationToken = '' } = {}) => {
  try {
    const response = await apiFetch(path, {
      method: 'PATCH',
      headers: buildJsonHeaders(authorizationToken),
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

const getJson = async (path, { authorizationToken = '' } = {}) => {
  try {
    const response = await apiFetch(path, {
      method: 'GET',
      headers: buildJsonHeaders(authorizationToken),
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

export const registerAuthAccountRecord = async ({
  uid = '',
  email = '',
  fullName = '',
  role = 'client',
  provider = 'email-password',
  status = 'active',
  hasPassword = undefined,
  emailVerified = false,
  phoneVerified = false,
} = {}) => (
  postJson('/api/auth/register-account', {
    uid: String(uid || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    fullName: String(fullName || '').trim(),
    role: String(role || 'client').trim().toLowerCase(),
    provider: String(provider || 'email-password').trim().toLowerCase(),
    status: String(status || 'active').trim().toLowerCase(),
    hasPassword: hasPassword === undefined
      ? String(provider || '').trim().toLowerCase() === 'email-password'
      : Boolean(hasPassword),
    emailVerified: Boolean(emailVerified),
    phoneVerified: Boolean(phoneVerified),
  })
)

export const recordAuthLoginSession = async ({
  uid = '',
  email = '',
  role = 'client',
  loginMethod = 'otp',
  remember = false,
  mfaCompleted = true,
} = {}) => {
  const sessionTtlMinutes = remember ? 10080 : 720
  const response = await postJson('/api/auth/login-session', {
    uid: String(uid || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    role: String(role || 'client').trim().toLowerCase(),
    loginMethod: String(loginMethod || 'otp').trim().toLowerCase(),
    sessionTtlMinutes,
    mfaCompleted: Boolean(mfaCompleted),
  })
  const sessionId = String(response?.data?.session?.sessionId || '').trim()
  if (response.ok && sessionId) {
    setApiSessionId(sessionId, { remember: Boolean(remember) })
  }
  return response
}

export const fetchSocialAuthAccountStatus = async ({
  idToken = '',
  provider = 'google',
} = {}) => (
  postJson('/api/auth/social-account-status', {
    idToken: String(idToken || '').trim(),
    provider: String(provider || 'google').trim().toLowerCase(),
  })
)

export const syncAuthenticatedUserToBackend = async ({
  authorizationToken = '',
  uid = '',
  email = '',
  displayName = '',
  roles = [],
  signupCapture = undefined,
} = {}) => (
  postJson('/api/users/sync-from-auth', {
    uid: String(uid || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    displayName: String(displayName || '').trim(),
    roles: Array.isArray(roles)
      ? roles
        .map((role) => String(role || '').trim().toLowerCase())
        .filter(Boolean)
      : [],
    ...(signupCapture && typeof signupCapture === 'object'
      ? {
          signupCapture,
        }
      : {}),
  }, {
    authorizationToken: String(authorizationToken || '').trim(),
  })
)

export const persistClientOnboardingToBackend = async ({
  authorizationToken = '',
  email = '',
  fullName = '',
  onboardingData = {},
  defaultLandingPage = 'dashboard',
} = {}) => {
  const token = String(authorizationToken || '').trim()
  if (!token) {
    return { ok: false, profileOk: false, dashboardOk: false, reason: 'missing-token' }
  }

  const fallbackFullName = String(fullName || onboardingData?.primaryContact || '').trim()
  const explicitNameParts = {
    firstName: String(onboardingData?.firstName || '').trim(),
    lastName: String(onboardingData?.lastName || '').trim(),
    otherNames: String(onboardingData?.otherNames || '').trim(),
  }
  const nameParts = (
    explicitNameParts.firstName
    || explicitNameParts.lastName
    || explicitNameParts.otherNames
  )
    ? explicitNameParts
    : splitNameParts(fallbackFullName)
  const businessType = normalizeBusinessType(onboardingData?.businessType)
  const normalizedPhone = String(onboardingData?.phone || '').replace(/\D/g, '').slice(0, 11)

  const profilePayload = {
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    otherNames: nameParts.otherNames,
    phoneCountryCode: '+234',
    phoneLocalNumber: normalizedPhone,
    roleInCompany: String(onboardingData?.roleInCompany || '').trim(),
    language: String(onboardingData?.language || '').trim() || 'English',
    address1: String(onboardingData?.address1 || onboardingData?.address || '').trim(),
    address2: String(onboardingData?.address2 || '').trim(),
    city: String(onboardingData?.city || '').trim(),
    postalCode: String(onboardingData?.postalCode || '').trim(),
    addressCountry: String(onboardingData?.addressCountry || onboardingData?.country || '').trim(),
    businessType,
    businessName: String(onboardingData?.businessName || '').trim(),
    country: String(onboardingData?.country || '').trim(),
    currency: String(onboardingData?.currency || '').trim() || 'NGN',
    industry: String(onboardingData?.industry || '').trim(),
    industryOther: String(onboardingData?.industryOther || '').trim(),
    cacNumber: String(onboardingData?.cacNumber || '').trim(),
    tin: String(onboardingData?.tin || '').trim(),
    reportingCycle: String(onboardingData?.reportingCycle || '').trim(),
    startMonth: String(onboardingData?.startMonth || '').trim(),
  }
  const dashboardPayload = {
    defaultLandingPage: String(defaultLandingPage || 'dashboard').trim() || 'dashboard',
    lastVisitedPage: String(defaultLandingPage || 'dashboard').trim() || 'dashboard',
    showGreeting: true,
  }

  const profileResponse = await patchJson('/api/users/me/profile', profilePayload, {
    authorizationToken: token,
  })
  const dashboardResponse = await patchJson('/api/users/me/client-dashboard', dashboardPayload, {
    authorizationToken: token,
  })

  return {
    ok: Boolean(profileResponse.ok || dashboardResponse.ok),
    profileOk: Boolean(profileResponse.ok),
    dashboardOk: Boolean(dashboardResponse.ok),
    profileStatus: profileResponse.status,
    dashboardStatus: dashboardResponse.status,
  }
}

export const fetchClientDashboardOverviewFromBackend = async ({
  authorizationToken = '',
} = {}) => {
  const token = String(authorizationToken || '').trim()
  if (!token) {
    return { ok: false, status: 0, data: null }
  }
  try {
    const response = await apiFetch('/api/users/me/client-dashboard/overview', {
      method: 'GET',
      headers: buildJsonHeaders(token),
    })
    const data = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    return { ok: false, status: 0, data: { message: String(error?.message || 'Network request failed.') } }
  }
}

export const fetchClientWorkspaceFromBackend = async ({
  authorizationToken = '',
} = {}) => {
  const token = String(authorizationToken || '').trim()
  if (!token) {
    return { ok: false, status: 0, data: null }
  }
  return getJson('/api/users/me/client-workspace', {
    authorizationToken: token,
  })
}

export const patchClientWorkspaceToBackend = async ({
  authorizationToken = '',
  workspacePayload = {},
} = {}) => {
  const token = String(authorizationToken || '').trim()
  if (!token) {
    return { ok: false, status: 0, data: null }
  }
  return patchJson('/api/users/me/client-workspace', workspacePayload, {
    authorizationToken: token,
  })
}

export const fetchAdminClientManagementFromBackend = async ({
  authorizationToken = '',
  query = {},
} = {}) => {
  const token = String(authorizationToken || '').trim()
  if (!token) {
    return { ok: false, status: 0, data: null }
  }

  const searchParams = new URLSearchParams()
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    searchParams.set(key, String(value))
  })
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : ''
  return getJson(`/api/users/admin/client-management${suffix}`, {
    authorizationToken: token,
  })
}

export const patchAdminClientFromBackend = async ({
  authorizationToken = '',
  uid = '',
  payload = {},
} = {}) => {
  const token = String(authorizationToken || '').trim()
  const normalizedUid = String(uid || '').trim()
  if (!token || !normalizedUid) {
    return { ok: false, status: 0, data: null }
  }
  return patchJson(`/api/users/admin/client-management/clients/${encodeURIComponent(normalizedUid)}`, payload, {
    authorizationToken: token,
  })
}

const normalizeApiBaseUrl = (value = '') => {
  const raw = String(value || '').trim()
  if (!raw) return '/api/v1'
  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

export const subscribeToRealtimeEvents = ({
  scope = 'me',
  types = [],
  topics = [],
  onEvent = () => {},
  onError = () => {},
} = {}) => {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return { close: () => {} }
  }

  const params = new URLSearchParams()
  params.set('scope', scope === 'all' ? 'all' : 'me')
  if (Array.isArray(types) && types.length > 0) {
    params.set('types', [...new Set(types.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))].join(','))
  }
  if (Array.isArray(topics) && topics.length > 0) {
    params.set('topics', [...new Set(topics.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))].join(','))
  }

  const baseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || '/api/v1')
  const streamUrl = `${baseUrl}/notifications/events/stream?${params.toString()}`
  const eventSource = new EventSource(streamUrl, { withCredentials: true })

  const handleEvent = (rawEvent) => {
    try {
      const payload = JSON.parse(String(rawEvent?.data || '{}'))
      onEvent(payload)
    } catch {
      // ignore malformed payloads
    }
  }

  eventSource.addEventListener('event', handleEvent)
  eventSource.addEventListener('ready', handleEvent)
  eventSource.addEventListener('heartbeat', () => {})
  eventSource.onerror = (error) => {
    onError(error)
  }

  return {
    close: () => {
      eventSource.removeEventListener('event', handleEvent)
      eventSource.removeEventListener('ready', handleEvent)
      eventSource.close()
    },
  }
}
