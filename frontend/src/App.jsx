import { useState, useEffect, useMemo, useRef } from 'react'
import { CheckCircle, AlertCircle, X, ShieldAlert, ArrowLeftRight } from 'lucide-react'
import {
  Sidebar as ClientSidebar,
  TopBar as ClientTopBar,
  DashboardPage as ClientDashboardPage,
  UploadHistoryPage as ClientUploadHistoryPage,
  ResolvedDocumentsPage as ClientResolvedDocumentsPage,
  RecentActivitiesPage as ClientRecentActivitiesPage,
  SupportPage as ClientSupportPage,
  ClientSupportWidget,
} from './components/client/dashboard/ClientDashboardViews'
import {
  DocumentFoldersPage as ClientDocumentFoldersPage,
  FolderFilesPage as ClientFolderFilesPage,
} from './components/client/dashboard/ClientDocumentsWorkspace'
import ClientSettingsPage from './components/client/settings/ClientSettingsPage'
import ClientAddDocumentModal from './components/client/documents/ClientAddDocumentModal'
import AuthExperience from './components/auth/AuthExperience'
import ClientOnboardingExperience from './components/client/onboarding/ClientOnboardingExperience'
import AdminWorkspace from './components/admin/AdminWorkspace'
import AdminLoginPortal from './components/admin/auth/AdminLoginPortal'
import AdminAccountSetup from './components/admin/auth/AdminAccountSetup'
import { ADMIN_PAGE_IDS, ADMIN_DEFAULT_PAGE } from './components/admin/adminConfig'
import {
  ADMIN_LEVELS,
  FULL_ADMIN_PERMISSION_IDS,
  getAdminLevelLabel,
  canImpersonateForAdminLevel,
  hasAdminPermission,
  normalizeAdminLevel,
  normalizeAdminAccount,
  normalizeAdminInvite,
  isAdminInvitePending,
} from './components/admin/adminIdentity'
import { getScopedStorageKey } from './utils/storage'
import {
  buildFileCacheKey,
  deleteCachedFileBlob,
  getCachedFileBlob,
  putCachedFileBlob,
} from './utils/fileCache'
import DotLottiePreloader from './components/common/DotLottiePreloader'
import { getNetworkAwareDurationMs, getNetworkConnectionSnapshot, isPageReloadNavigation } from './utils/networkRuntime'
import { apiFetch, clearApiAccessToken, clearApiSessionId, getApiSessionId, setApiAccessToken } from './utils/apiClient'
import {
  fetchClientDashboardOverviewFromBackend,
  fetchClientWorkspaceFromBackend,
  fetchSocialAuthAccountStatus,
  patchClientWorkspaceToBackend,
  persistClientOnboardingToBackend,
  recordAuthLoginSession,
  registerAuthAccountRecord,
  syncAuthenticatedUserToBackend,
  subscribeToRealtimeEvents,
} from './utils/clientBackendBridge'
import {
  acceptClientTeamInvite as acceptClientTeamInviteFromBackend,
  fetchPublicClientTeamInvite,
} from './utils/clientTeamApi'
import {
  applyEmailVerificationCode,
  clearFirebaseAuthSession,
  completePasswordResetWithCode,
  inspectEmailVerificationCode,
  inspectPasswordResetCode,
  startGoogleSignInRedirect,
} from './utils/firebaseAuthClient'
import {
  isClientNotificationSoundPrimed,
  playClientNotificationSound,
  primeClientNotificationSound,
} from './utils/clientNotificationSound'
import {
  isClientNotificationEnabled,
  normalizeClientNotificationSettings,
  isClientNotificationSoundEnabled,
  persistClientNotificationSettings,
  readClientNotificationSettings,
} from './utils/clientNotificationPreferences'
import {
  buildClientEmailVerificationLink,
  buildClientResetPasswordLink,
} from './utils/authLinks'
import { refreshSupportStateFromBackend } from './utils/supportCenter'
import {
  deleteDocumentFromBackend,
  downloadDocumentBlobFromBackend,
  uploadDocumentToBackend,
} from './utils/documentsApi'
import PreliminaryCorporateSite from './components/preliminary/PreliminaryCorporateSite'

const CLIENT_PAGE_IDS = ['dashboard', 'expenses', 'sales', 'bank-statements', 'upload-history', 'resolved-documents', 'recent-activities', 'support', 'settings']
const CLIENT_DOCUMENT_PAGE_IDS = ['expenses', 'sales', 'bank-statements']
const APP_PAGE_IDS = [...CLIENT_PAGE_IDS, ...ADMIN_PAGE_IDS]
const PUBLIC_SITE_PAGE_IDS = ['home', 'about', 'services', 'insights', 'careers', 'contact']
const PUBLIC_SITE_PAGE_BY_PATH = {
  '/': 'home',
  '/home': 'home',
  '/about': 'about',
  '/services': 'services',
  '/insights': 'insights',
  '/careers': 'careers',
  '/contact': 'contact',
}
const normalizeAppPathname = (pathname = '/') => {
  const rawPath = String(pathname || '/').trim() || '/'
  return rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath
}
const resolvePublicSitePageFromPathname = (pathname = '/') => (
  PUBLIC_SITE_PAGE_BY_PATH[normalizeAppPathname(pathname)] || null
)
const CLIENT_ONBOARDING_TOTAL_STEPS = 2
const CLIENT_ONBOARDING_STATE_VERSION = 3
const ADMIN_INVITES_STORAGE_KEY = 'kiaminaAdminInvites'
const ADMIN_ACTIVITY_STORAGE_KEY = 'kiaminaAdminActivityLog'
const ADMIN_ACTIVITY_SYNC_EVENT = 'kiamina:admin-activity-sync'
const ADMIN_SETTINGS_STORAGE_KEY = 'kiaminaAdminSettings'
const IMPERSONATION_SESSION_STORAGE_KEY = 'kiaminaImpersonationSession'
const ADMIN_IMPERSONATION_SESSION_STORAGE_KEY = 'kiaminaAdminImpersonationSession'
const CLIENT_DOCUMENTS_STORAGE_KEY = 'kiaminaClientDocuments'
const CLIENT_ACTIVITY_STORAGE_KEY = 'kiaminaClientActivityLog'
const CLIENT_STATUS_CONTROL_STORAGE_KEY = 'kiaminaClientStatusControl'
const CLIENT_SESSION_CONTROL_STORAGE_KEY = 'kiaminaClientSessionControl'
const CLIENT_BRIEF_NOTIFICATIONS_STORAGE_KEY = 'kiaminaClientBriefNotifications'
const CLIENT_SETTINGS_REDIRECT_SECTION_KEY = 'kiaminaClientSettingsRedirectSection'
const CLIENT_ASSIGNMENTS_STORAGE_KEY = 'kiaminaClientAssignments'
const CLIENT_TEAM_INVITES_STORAGE_KEY = 'clientTeamInvites'
const CLIENT_TEAM_MEMBERS_STORAGE_KEY = 'clientTeamMembers'
const CLIENT_TEAM_ACCESS_STORAGE_KEY = 'kiaminaClientTeamAccess'
const IMPERSONATION_IDLE_TIMEOUT_MS = 10 * 60 * 1000
const ADMIN_GOV_ID_TYPES_NIGERIA = ['International Passport', 'NIN', "Voter's Card", "Driver's Licence"]
const ADMIN_GOV_ID_TYPE_INTERNATIONAL = 'Government Issued ID'
const FIREBASE_WEB_API_KEY = String(import.meta.env.VITE_FIREBASE_WEB_API_KEY || '').trim()
const GOOGLE_AUTH_DEBUG = Boolean(import.meta.env.DEV)

const logGoogleAppDebug = (...args) => {
  if (!GOOGLE_AUTH_DEBUG) return
  console.info('[google-auth-app]', ...args)
}
const STRICT_BACKEND_DELIVERY = (
  String(import.meta.env.VITE_STRICT_BACKEND_DELIVERY || 'true').trim().toLowerCase() !== 'false'
)
const createOwnerBootstrapStatusState = () => ({
  loading: false,
  checked: false,
  canBootstrap: false,
  adminAccountCount: 0,
  message: '',
})

const inferRoleFromEmail = (email = '') => {
  const normalized = email.trim().toLowerCase()
  if (normalized.startsWith('admin@')) return 'admin'
  if (normalized.endsWith('@admin.kiamina.local')) return 'admin'
  return 'client'
}

const normalizeBackendRole = (role, email = '') => {
  const normalizedRole = String(role || '').trim().toLowerCase()
  if (
    normalizedRole === 'client'
    || normalizedRole === 'admin'
    || normalizedRole === 'owner'
    || normalizedRole === 'superadmin'
  ) {
    return normalizedRole
  }
  return inferRoleFromEmail(email)
}

const normalizeRole = (role, email = '') => {
  const normalizedRole = normalizeBackendRole(role, email)
  if (normalizedRole === 'owner' || normalizedRole === 'superadmin') return 'admin'
  return normalizedRole
}

const deriveBackendAdminRoleFromLevel = (adminLevel = '') => {
  const normalizedLevel = normalizeAdminLevel(adminLevel)
  if (normalizedLevel === ADMIN_LEVELS.OWNER) return 'owner'
  if (normalizedLevel === ADMIN_LEVELS.SUPER) return 'superadmin'
  return 'admin'
}

const deriveAdminLevelFromBackendRole = (role = '') => {
  const normalizedRole = String(role || '').trim().toLowerCase()
  if (normalizedRole === 'owner') return ADMIN_LEVELS.OWNER
  if (normalizedRole === 'superadmin') return ADMIN_LEVELS.SUPER
  return ADMIN_LEVELS.AREA_ACCOUNTANT
}

const normalizeAdminVerificationCountry = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized || normalized === 'nigeria') return 'Nigeria'
  return 'International'
}

const getAdminGovIdTypeOptions = (country = 'Nigeria') => (
  country === 'Nigeria'
    ? ADMIN_GOV_ID_TYPES_NIGERIA
    : [ADMIN_GOV_ID_TYPE_INTERNATIONAL]
)

const normalizeAdminGovernmentIdType = (value = '', country = 'Nigeria') => {
  const normalizedValue = String(value || '').trim().toLowerCase()
  if (!normalizedValue) return ''
  const options = getAdminGovIdTypeOptions(country)
  return options.find((option) => option.toLowerCase() === normalizedValue) || ''
}

const normalizeAccount = (account = {}) => {
  const createdAtIso = [
    account.createdAt,
    account.createdAtIso,
    account.dateCreated,
    account.registeredAt,
  ].find((value) => Number.isFinite(Date.parse(value || '')))
    || new Date().toISOString()
  const normalizedRole = normalizeRole(account.role, account.email || '')
  if (normalizedRole !== 'admin') {
    return {
      ...account,
      role: normalizedRole,
      createdAt: account.createdAt || createdAtIso,
    }
  }
  return normalizeAdminAccount({
    ...account,
    role: 'admin',
    createdAt: account.createdAt || createdAtIso,
  })
}

const normalizeUser = (user) => {
  if (!user) return null
  const normalizedRole = normalizeRole(user.role, user.email || '')
  if (normalizedRole !== 'admin') {
    return {
      ...user,
      role: normalizedRole,
    }
  }
  return normalizeAdminAccount({
    ...user,
    role: 'admin',
  })
}

const readErrorMessageFromResponse = async (response) => {
  try {
    const payload = await response.json()
    return String(payload?.message || payload?.error || '').trim()
  } catch {
    return ''
  }
}

const requestFirebaseIdentityToolkit = async ({
  endpoint = '',
  payload = {},
} = {}) => {
  if (!FIREBASE_WEB_API_KEY || !endpoint) {
    return { ok: false, status: 0, data: null }
  }

  const abortController = typeof AbortController === 'function' ? new AbortController() : null
  const timeoutId = abortController
    ? setTimeout(() => abortController.abort(), 10000)
    : null

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortController?.signal,
      },
    )
    const data = await response.json().catch(() => ({}))
    return {
      ok: response.ok,
      status: response.status,
      data,
    }
  } catch {
    return { ok: false, status: 0, data: null }
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

const createFirebaseAccountWithCredentials = async ({
  email = '',
  password = '',
  fullName = '',
} = {}) => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedPassword = String(password || '')
  const normalizedFullName = String(fullName || '').trim()
  if (!normalizedEmail || !normalizedPassword) {
    return { ok: false, idToken: '', uid: '', email: '', message: 'Email and password are required.' }
  }

  const signupResponse = await requestFirebaseIdentityToolkit({
    endpoint: 'accounts:signUp',
    payload: {
      email: normalizedEmail,
      password: normalizedPassword,
      returnSecureToken: true,
    },
  })
  if (!signupResponse.ok) {
    const firebaseCode = String(signupResponse.data?.error?.message || '').trim().toUpperCase()
    if (firebaseCode.includes('EMAIL_EXISTS')) {
      return {
        ok: false,
        idToken: '',
        uid: '',
        email: '',
        message: 'An account already exists for this email. Sign in instead or use a different email address.',
      }
    }
    return { ok: false, idToken: '', uid: '', email: '', message: 'Unable to create account right now.' }
  }

  const idToken = String(signupResponse.data?.idToken || '').trim()
  if (idToken && normalizedFullName) {
    await requestFirebaseIdentityToolkit({
      endpoint: 'accounts:update',
      payload: {
        idToken,
        displayName: normalizedFullName,
        returnSecureToken: false,
      },
    })
  }

  return {
    ok: true,
    idToken,
    uid: String(signupResponse.data?.localId || '').trim(),
    email: String(signupResponse.data?.email || normalizedEmail).trim().toLowerCase(),
    message: '',
  }
}

const lookupFirebaseSignInMethods = async (email = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) {
    return { ok: false, methods: [], registered: false, message: 'Email is required.' }
  }

  const lookupResponse = await requestFirebaseIdentityToolkit({
    endpoint: 'accounts:createAuthUri',
    payload: {
      identifier: normalizedEmail,
      continueUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
    },
  })

  if (!lookupResponse.ok) {
    return { ok: false, methods: [], registered: false, message: 'Unable to verify email availability right now.' }
  }

  const methods = Array.isArray(lookupResponse.data?.signinMethods)
    ? lookupResponse.data.signinMethods.map((method) => String(method || '').trim().toLowerCase()).filter(Boolean)
    : []
  const legacyProviders = Array.isArray(lookupResponse.data?.allProviders)
    ? lookupResponse.data.allProviders.map((provider) => String(provider || '').trim().toLowerCase()).filter(Boolean)
    : []
  const combinedMethods = [...new Set([...methods, ...legacyProviders])]

  return {
    ok: true,
    methods: combinedMethods,
    registered: Boolean(lookupResponse.data?.registered || combinedMethods.length > 0),
    message: '',
  }
}

const resolveIdentityFromAuthTokens = async ({
  idToken = '',
  accessToken = '',
  sessionId = '',
} = {}) => {
  const normalizedIdToken = String(idToken || '').trim()
  const normalizedAccessToken = String(accessToken || '').trim()
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedIdToken && !normalizedAccessToken) {
    return { ok: false, uid: '', email: '', roles: [], emailVerified: false, message: 'Missing authentication token.' }
  }

  try {
    const response = await apiFetch('/api/auth/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: normalizedIdToken,
        accessToken: normalizedAccessToken,
        sessionId: normalizedSessionId,
      }),
    })
    if (!response.ok) {
      const message = await readErrorMessageFromResponse(response)
      return { ok: false, uid: '', email: '', roles: [], emailVerified: false, message: message || 'Unable to verify token.' }
    }
    const payload = await response.json().catch(() => ({}))
    const roles = Array.isArray(payload?.roles) ? payload.roles : []
    return {
      ok: true,
      uid: String(payload?.uid || '').trim(),
      email: String(payload?.email || '').trim().toLowerCase(),
      emailVerified: Boolean(payload?.emailVerified),
      roles: roles.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean),
      message: '',
    }
  } catch {
    const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()
    const endpointHint = apiBaseUrl ? `${apiBaseUrl}/auth/verify-token` : '/api/v1/auth/verify-token'
    return {
      ok: false,
      uid: '',
      email: '',
      roles: [],
      emailVerified: false,
      message: `Unable to verify token. Ensure backend is running and reachable at ${endpointHint}.`,
    }
  }
}

const getDefaultPageForRole = (role = 'client') => (role === 'admin' ? ADMIN_DEFAULT_PAGE : 'dashboard')

const buildKeywordSuggestions = (values = [], limit = 20) => {
  const seen = new Set()
  const keywords = []
  ;(Array.isArray(values) ? values : []).forEach((value) => {
    String(value || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .forEach((token) => {
        if (seen.has(token)) return
        seen.add(token)
        keywords.push(token)
      })
  })
  return keywords.slice(0, Math.max(1, limit))
}

const getCategoryLabelFromPageId = (pageId = '') => {
  if (pageId === 'sales') return 'Sales'
  if (pageId === 'bank-statements') return 'Bank Statements'
  return 'Expenses'
}

const getAdminSystemSettings = () => {
  try {
    const saved = localStorage.getItem(ADMIN_SETTINGS_STORAGE_KEY)
    if (!saved) {
      return {
        impersonationEnabled: true,
      }
    }
    const parsed = JSON.parse(saved)
    return {
      impersonationEnabled: parsed?.impersonationEnabled !== false,
    }
  } catch {
    return {
      impersonationEnabled: true,
    }
  }
}

const formatAdminActivityTimestamp = (value = '') => {
  const parsed = Date.parse(value)
  const sourceDate = Number.isFinite(parsed) ? new Date(parsed) : new Date()
  return sourceDate.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

const readAdminActivityLog = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(ADMIN_ACTIVITY_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const appendAdminActivityLog = (entry = {}) => {
  const existing = readAdminActivityLog()
  const timestampIso = new Date().toISOString()
  const logEntry = {
    id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    adminName: entry.adminName || 'Admin User',
    adminEmail: String(entry.adminEmail || '').trim().toLowerCase(),
    adminLevel: entry.adminLevel || ADMIN_LEVELS.SUPER,
    impersonatedBy: String(entry.impersonatedBy || '').trim().toLowerCase(),
    action: entry.action || 'Admin action',
    affectedUser: entry.affectedUser || '--',
    details: entry.details || '--',
    timestamp: timestampIso,
  }
  localStorage.setItem(ADMIN_ACTIVITY_STORAGE_KEY, JSON.stringify([logEntry, ...existing]))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ADMIN_ACTIVITY_SYNC_EVENT))
    window.dispatchEvent(new Event('kiamina:admin-dashboard-realtime-sync'))
  }
  return {
    ...logEntry,
    timestamp: formatAdminActivityTimestamp(timestampIso),
  }
}

const cloneDocumentRows = (rows = []) => (
  Array.isArray(rows) ? rows.map((row) => ({ ...row })) : []
)

const formatClientDocumentTimestamp = (value) => {
  const parsed = Date.parse(value || '')
  const sourceDate = Number.isFinite(parsed) ? new Date(parsed) : new Date()
  return sourceDate.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

const readClientSessionControl = () => {
  if (typeof localStorage === 'undefined') {
    return {
      globalLogoutAtIso: '',
      byEmail: {},
    }
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(CLIENT_SESSION_CONTROL_STORAGE_KEY) || '{}')
    const byEmail = parsed?.byEmail && typeof parsed.byEmail === 'object' ? parsed.byEmail : {}
    return {
      globalLogoutAtIso: parsed?.globalLogoutAtIso || '',
      byEmail,
    }
  } catch {
    return {
      globalLogoutAtIso: '',
      byEmail: {},
    }
  }
}

const readClientBriefNotifications = (email = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail || typeof localStorage === 'undefined') return []
  const scopedKey = getScopedStorageKey(CLIENT_BRIEF_NOTIFICATIONS_STORAGE_KEY, normalizedEmail)
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedKey) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const CLIENT_NOTIFICATION_INBOX_STORAGE_KEY = 'kiaminaClientNotificationInbox'
const CLIENT_SUPPORT_FOCUS_TICKET_STORAGE_KEY = 'kiaminaClientSupportFocusTicketId'

const normalizeClientNotificationEntry = (entry = {}) => {
  const id = String(entry?.id || '').trim()
  if (!id) return null
  return {
    ...entry,
    id,
    read: Boolean(entry?.read),
    linkPage: String(entry?.linkPage || '').trim(),
    ticketId: String(entry?.ticketId || '').trim(),
    messageId: String(entry?.messageId || '').trim(),
  }
}

const readClientNotificationInbox = (email = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail || typeof localStorage === 'undefined') return []
  const scopedKey = getScopedStorageKey(CLIENT_NOTIFICATION_INBOX_STORAGE_KEY, normalizedEmail)
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedKey) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => normalizeClientNotificationEntry(entry))
      .filter(Boolean)
      .slice(0, 80)
  } catch {
    return []
  }
}

const persistClientNotificationInbox = (email = '', notifications = []) => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail || typeof localStorage === 'undefined') return
  const scopedKey = getScopedStorageKey(CLIENT_NOTIFICATION_INBOX_STORAGE_KEY, normalizedEmail)
  const safeNotifications = (Array.isArray(notifications) ? notifications : [])
    .map((entry) => normalizeClientNotificationEntry(entry))
    .filter(Boolean)
    .slice(0, 80)
  localStorage.setItem(scopedKey, JSON.stringify(safeNotifications))
}

const mergeClientNotifications = (existing = [], incoming = []) => {
  const byId = new Map()
  ;[...(Array.isArray(incoming) ? incoming : []), ...(Array.isArray(existing) ? existing : [])]
    .forEach((entry) => {
      const normalized = normalizeClientNotificationEntry(entry)
      if (!normalized) return
      const previous = byId.get(normalized.id)
      if (!previous) {
        byId.set(normalized.id, normalized)
        return
      }
      byId.set(normalized.id, {
        ...previous,
        ...normalized,
        read: Boolean(previous.read || normalized.read),
      })
    })
  return Array.from(byId.values()).slice(0, 80)
}

const mapNotificationRecordToClientEntry = (item = {}, index = 0, existingById = new Map()) => {
  const notificationId = String(item?.id || `CBN-FALLBACK-${Date.now()}-${index}`).trim()
  if (!notificationId) return null
  const title = String(item?.title || 'New Update').trim()
  const body = String(item?.body || item?.message || '').trim()
  const composedMessage = body ? `${title}: ${body}` : title
  const sentAtIso = String(item?.sentAtIso || item?.createdAtIso || new Date().toISOString()).trim()
  const normalizedType = String(item?.type || 'info').trim().toLowerCase()
  const allowedLinkPage = APP_PAGE_IDS.includes(String(item?.linkPage || '').trim())
    ? String(item.linkPage).trim()
    : 'dashboard'
  const linkCategoryId = CLIENT_DOCUMENT_PAGE_IDS.includes(allowedLinkPage) ? allowedLinkPage : ''
  return {
    id: notificationId,
    type: normalizedType || 'info',
    title,
    body,
    message: composedMessage,
    timestamp: formatClientDocumentTimestamp(sentAtIso),
    sentAtIso,
    read: Boolean(item?.read || existingById.get(notificationId)?.read),
    forceDelivery: (
      item?.forceDelivery === true
      || String(item?.forceDelivery || '').trim().toLowerCase() === 'true'
    ),
    priority: String(item?.priority || 'normal').trim().toLowerCase(),
    link: String(item?.link || '').trim(),
    linkPage: allowedLinkPage,
    categoryId: String(item?.categoryId || linkCategoryId).trim(),
    folderId: String(item?.folderId || '').trim(),
    fileId: String(item?.fileId || '').trim(),
    documentId: String(item?.documentId || '').trim(),
    ticketId: String(item?.ticketId || '').trim(),
    messageId: String(item?.messageId || '').trim(),
  }
}

const mapNotificationRecordsToClientEntries = (rows = [], existingInbox = []) => {
  const inboxById = new Map(
    (Array.isArray(existingInbox) ? existingInbox : [])
      .map((entry) => normalizeClientNotificationEntry(entry))
      .filter(Boolean)
      .map((entry) => [entry.id, entry]),
  )
  return (Array.isArray(rows) ? rows : [])
    .map((item, index) => mapNotificationRecordToClientEntry(item, index, inboxById))
    .filter(Boolean)
}

const markClientBriefNotificationRead = (email = '', notificationId = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedId = String(notificationId || '').trim()
  if (!normalizedEmail || !normalizedId || typeof localStorage === 'undefined') return
  const scopedKey = getScopedStorageKey(CLIENT_BRIEF_NOTIFICATIONS_STORAGE_KEY, normalizedEmail)
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedKey) || '[]')
    const rows = Array.isArray(parsed) ? parsed : []
    const nextRows = rows.map((row, index) => {
      const rowId = String(row?.id || `CBN-FALLBACK-${index}`).trim()
      if (rowId !== normalizedId) return row
      return {
        ...(row && typeof row === 'object' ? row : {}),
        read: true,
      }
    })
    localStorage.setItem(scopedKey, JSON.stringify(nextRows))
  } catch {
    // ignore malformed storage payloads
  }
}

const markAllClientBriefNotificationsRead = (email = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail || typeof localStorage === 'undefined') return
  const scopedKey = getScopedStorageKey(CLIENT_BRIEF_NOTIFICATIONS_STORAGE_KEY, normalizedEmail)
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedKey) || '[]')
    const rows = Array.isArray(parsed) ? parsed : []
    const nextRows = rows.map((row) => ({
      ...(row && typeof row === 'object' ? row : {}),
      read: true,
    }))
    localStorage.setItem(scopedKey, JSON.stringify(nextRows))
  } catch {
    // ignore malformed storage payloads
  }
}

const markClientNotificationInboxRead = (email = '', notificationId = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedId = String(notificationId || '').trim()
  if (!normalizedEmail || !normalizedId) return
  const inbox = readClientNotificationInbox(normalizedEmail)
  const nextInbox = inbox.map((entry) => (
    entry.id === normalizedId ? { ...entry, read: true } : entry
  ))
  persistClientNotificationInbox(normalizedEmail, nextInbox)
}

const markAllClientNotificationInboxRead = (email = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return
  const inbox = readClientNotificationInbox(normalizedEmail)
  const nextInbox = inbox.map((entry) => ({ ...entry, read: true }))
  persistClientNotificationInbox(normalizedEmail, nextInbox)
}

const toIsoDate = (value) => {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString()
}

const buildFileSnapshot = (file = {}) => ({
  fileId: file.fileId || '',
  filename: file.filename || 'Document',
  extension: file.extension || (file.filename?.split('.').pop()?.toUpperCase() || 'FILE'),
  status: file.status || 'Pending Review',
  class: file.class || file.expenseClass || file.salesClass || '',
  classId: file.classId || '',
  className: file.className || file.class || file.expenseClass || file.salesClass || '',
  paymentMethod: file.paymentMethod || '',
  invoice: file.invoice || '',
  invoiceNumber: file.invoiceNumber || '',
  fileCacheKey: file.fileCacheKey || '',
  folderId: file.folderId || '',
  folderName: file.folderName || '',
  backendDocumentId: file.backendDocumentId || '',
  backendStorageProvider: file.backendStorageProvider || '',
  backendStoragePath: file.backendStoragePath || '',
  previewUrl: file.previewUrl || null,
})

const normalizeDocumentWorkflowStatus = (value, fallback = 'Pending Review') => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return fallback
  if (normalized === 'pending' || normalized === 'pending review') return 'Pending Review'
  if (normalized === 'approved') return 'Approved'
  if (normalized === 'rejected') return 'Rejected'
  if (normalized === 'info requested' || normalized === 'needs clarification') return 'Info Requested'
  if (normalized === 'draft') return 'Pending Review'
  if (normalized === 'deleted') return 'Deleted'
  return fallback
}

const readScopedClientStatusControl = (email = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return {}
  const scopedKey = getScopedStorageKey(CLIENT_STATUS_CONTROL_STORAGE_KEY, normalizedEmail)
  try {
    const scopedValue = JSON.parse(localStorage.getItem(scopedKey) || 'null')
    if (scopedValue && typeof scopedValue === 'object') return scopedValue
  } catch {
    // ignore malformed scoped status control payload
  }
  try {
    const fallbackValue = JSON.parse(localStorage.getItem(CLIENT_STATUS_CONTROL_STORAGE_KEY) || 'null')
    return fallbackValue && typeof fallbackValue === 'object' ? fallbackValue : {}
  } catch {
    return {}
  }
}

const resolveClientVerificationState = ({
  email = '',
  accountStatus = '',
} = {}) => {
  const normalizedAccountStatus = String(accountStatus || '').trim().toLowerCase()
  if (normalizedAccountStatus === 'suspended') return 'suspended'

  const statusControl = readScopedClientStatusControl(email)
  const normalizedCompliance = String(statusControl?.verificationStatus || '').trim().toLowerCase()

  if (
    normalizedCompliance === 'suspended'
    || normalizedCompliance.includes('suspended')
  ) {
    return 'suspended'
  }

  if (
    normalizedCompliance.includes('fully compliant')
    || normalizedCompliance === 'verified'
    || normalizedCompliance === 'approved'
    || normalizedCompliance === 'compliant'
  ) {
    return 'verified'
  }

  if (
    normalizedCompliance.includes('action required')
    || normalizedCompliance === 'rejected'
    || normalizedCompliance.includes('clarification')
    || normalizedCompliance.includes('info requested')
  ) {
    return 'rejected'
  }

  return 'verified'
}

const createVersionEntry = ({
  versionNumber = 1,
  action = 'Uploaded',
  performedBy = 'Client User',
  timestamp,
  notes = '',
  fileSnapshot = {},
}) => ({
  versionNumber,
  action,
  performedBy,
  timestamp,
  notes,
  fileSnapshot: buildFileSnapshot(fileSnapshot),
})

const createFileActivityEntry = ({
  actionType = 'upload',
  description = 'File activity',
  performedBy = 'Client User',
  timestamp,
}) => ({
  id: `FACT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  actionType,
  description,
  performedBy,
  timestamp,
})

const ensureFolderStructuredRecords = (rows = [], categoryKey = 'expenses') => {
  const safeRows = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : []
  const categoryPrefix = categoryKey === 'sales'
    ? 'SAL'
    : categoryKey === 'bankStatements'
      ? 'BNK'
      : 'EXP'
  const categoryLabel = categoryKey === 'sales'
    ? 'Sales'
    : categoryKey === 'bankStatements'
      ? 'Bank Statements'
      : 'Expenses'

  const createFileId = (folderId, index) => {
    const serialPart = String(index + 1).padStart(3, '0')
    const token = folderId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-8)
    return `${categoryPrefix}-${token}-${serialPart}`
  }

  const normalizeFile = (sourceFile = {}, folderId, index, folderName = 'Folder') => {
    const file = sourceFile && typeof sourceFile === 'object' ? sourceFile : {}
    const classValue = file.class || file.className || file.expenseClass || file.salesClass || ''
    const classId = file.classId || (classValue ? buildClassId(classValue) : '')
    const timestamp = file.date || formatClientDocumentTimestamp()
    const timestampIso = file.updatedAtIso || file.createdAtIso || toIsoDate(file.date)
    const fileId = file.fileId || createFileId(folderId, index)
    const normalizePreviewUrl = (value = '') => {
      const normalized = String(value || '').trim()
      if (!normalized) return ''
      return normalized.toLowerCase().startsWith('blob:') ? '' : normalized
    }
    const normalizedPreviewUrl = normalizePreviewUrl(file.previewUrl || '')
    const actorName = file.user || 'Client User'
    const normalizedIsDeleted = Boolean(file.isDeleted || file.status === 'Deleted')
    const normalizedStatus = normalizedIsDeleted
      ? 'Deleted'
      : normalizeDocumentWorkflowStatus(file.status || 'Pending Review')
    const normalizedIsLocked = normalizedStatus === 'Approved' || Boolean(file.isLocked)
    const rawVersions = Array.isArray(file.versions) ? file.versions : []
    const normalizedVersions = rawVersions.length > 0
      ? rawVersions.map((entry, entryIndex) => ({
        versionNumber: entry.versionNumber || entry.version || entryIndex + 1,
        action: entry.action || 'Updated',
        performedBy: entry.performedBy || actorName,
        timestamp: entry.timestamp || toIsoDate(entry.date || timestamp),
        notes: entry.notes || '',
        fileSnapshot: buildFileSnapshot(entry.fileSnapshot || {
          ...file,
          filename: entry.filename || file.filename,
          extension: file.extension,
          previewUrl: normalizePreviewUrl(entry.previewUrl || file.previewUrl || ''),
          folderId,
          folderName,
        }),
      }))
      : [createVersionEntry({
        versionNumber: 1,
        action: 'Uploaded',
        performedBy: actorName,
        timestamp: timestampIso,
        notes: 'Initial upload.',
        fileSnapshot: {
          ...file,
          folderId,
          folderName,
          status: normalizedStatus,
          class: classValue,
          classId,
          className: classValue,
        },
      })]
    const rawActivityLog = Array.isArray(file.activityLog) ? file.activityLog : []
    const normalizedActivityLog = rawActivityLog.length > 0
      ? rawActivityLog.map((entry) => ({
        id: entry.id || `FACT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        actionType: entry.actionType || 'info',
        description: entry.description || entry.action || 'File activity',
        performedBy: entry.performedBy || actorName,
        timestamp: entry.timestamp || timestampIso,
      }))
      : [createFileActivityEntry({
        actionType: 'upload',
        description: 'File uploaded.',
        performedBy: actorName,
        timestamp: timestampIso,
      })]
    const rawUploadInfo = file.uploadInfo || {}
    const normalizedUploadInfo = {
      originalUploadedAtIso: rawUploadInfo.originalUploadedAtIso || file.createdAtIso || timestampIso,
      originalUploadSource: rawUploadInfo.originalUploadSource || file.uploadSource || 'browse-file',
      originalUploadedBy: rawUploadInfo.originalUploadedBy || actorName,
      device: rawUploadInfo.device || 'Web Browser',
      ipAddress: rawUploadInfo.ipAddress || '--',
      lastModifiedAtIso: rawUploadInfo.lastModifiedAtIso || file.updatedAtIso || timestampIso,
      replacements: Array.isArray(rawUploadInfo.replacements) ? rawUploadInfo.replacements : [],
      totalVersions: rawUploadInfo.totalVersions || normalizedVersions.length,
    }
    return {
      ...file,
      id: file.id || `${folderId}-FILE-${String(index + 1).padStart(3, '0')}`,
      folderId,
      fileId,
      filename: file.filename || `Document ${index + 1}`,
      extension: file.extension || (file.filename?.split('.').pop()?.toUpperCase() || 'FILE'),
      previewUrl: normalizedPreviewUrl,
      status: normalizedStatus,
      isLocked: normalizedIsLocked,
      lockedAtIso: file.lockedAtIso || (normalizedIsLocked ? timestampIso : null),
      approvedBy: file.approvedBy || '',
      approvedAtIso: file.approvedAtIso || null,
      rejectedBy: file.rejectedBy || '',
      rejectedAtIso: file.rejectedAtIso || null,
      rejectionReason: file.rejectionReason || '',
      unlockedBy: file.unlockedBy || '',
      unlockedAtIso: file.unlockedAtIso || null,
      unlockReason: file.unlockReason || '',
      user: file.user || 'Client User',
      date: timestamp,
      createdAtIso: file.createdAtIso || timestampIso,
      updatedAtIso: file.updatedAtIso || timestampIso,
      deletedAtIso: file.deletedAtIso || null,
      isDeleted: normalizedIsDeleted,
      class: classValue,
      classId,
      className: classValue,
      expenseClass: file.expenseClass || classValue,
      salesClass: file.salesClass || classValue,
      vendorName: file.vendorName || '',
      confidentialityLevel: file.confidentialityLevel || 'Standard',
      processingPriority: file.processingPriority || 'Normal',
      internalNotes: file.internalNotes || '',
      ...(categoryKey === 'expenses' ? { paymentMethod: file.paymentMethod || '' } : {}),
      ...(categoryKey === 'sales' ? {
        invoice: file.invoice || '',
        invoiceNumber: file.invoiceNumber || '',
      } : {}),
      folderName,
      versions: normalizedVersions,
      activityLog: normalizedActivityLog,
      uploadInfo: normalizedUploadInfo,
    }
  }

  const normalizeFolder = (sourceFolder = {}, folderIndex = 0) => {
    const folder = sourceFolder && typeof sourceFolder === 'object' ? sourceFolder : {}
    const folderId = folder.id || `F-${Date.now().toString(36).toUpperCase()}-${String(folderIndex + 1).padStart(2, '0')}`
    const folderName = folder.folderName || `${categoryLabel} Folder ${folderIndex + 1}`
    const createdAtIso = folder.createdAtIso || toIsoDate(folder.createdAtDisplay || folder.date)
    const sourceFiles = Array.isArray(folder.files) ? folder.files : []
    return {
      id: folderId,
      isFolder: true,
      folderName,
      category: folder.category || categoryLabel,
      user: folder.user || 'Client User',
      createdAtIso,
      createdAtDisplay: folder.createdAtDisplay || formatClientDocumentTimestamp(createdAtIso),
      date: folder.date || formatClientDocumentTimestamp(createdAtIso),
      files: sourceFiles.map((file, fileIndex) => normalizeFile(file, folderId, fileIndex, folderName)),
    }
  }

  const folderRows = safeRows.filter((row) => row?.isFolder).map((folder, index) => normalizeFolder(folder, index))
  const legacyRows = safeRows.filter((row) => !row?.isFolder)

  if (legacyRows.length === 0) return folderRows

  const migrationFolderId = `F-MIG-${categoryPrefix}-${Date.now().toString(36).toUpperCase()}`
  const migrationCreatedAt = new Date().toISOString()
  const migrationFolderName = `Migrated ${categoryLabel} Files`
  const migrationFolder = {
    id: migrationFolderId,
    isFolder: true,
    folderName: migrationFolderName,
    category: categoryLabel,
    user: legacyRows[0]?.user || 'Client User',
    createdAtIso: migrationCreatedAt,
    createdAtDisplay: formatClientDocumentTimestamp(migrationCreatedAt),
    date: formatClientDocumentTimestamp(migrationCreatedAt),
    files: legacyRows.map((row, index) => normalizeFile(row, migrationFolderId, index, migrationFolderName)),
  }

  return [migrationFolder, ...folderRows]
}

const flattenFolderFilesForDashboard = (records = [], categoryId = 'expenses') => {
  const categoryLabel = categoryId === 'sales'
    ? 'Sales'
    : categoryId === 'bank-statements'
      ? 'Bank Statement'
      : 'Expense'

  const safeRecords = Array.isArray(records) ? records : []
  return safeRecords.flatMap((record) => {
    if (record?.isFolder) {
      if (record.archived) return []
      return (record.files || [])
        .filter((file) => !file?.isDeleted)
        .map((file) => ({
        ...file,
        categoryId,
        category: categoryLabel,
      }))
    }
    if (record?.isDeleted) return []
    return [{
      ...record,
      categoryId,
      category: record?.category || categoryLabel,
    }]
  })
}

const updateFirstPendingFileStatus = (records = [], nextStatus = 'Approved') => {
  let updated = false
  const nextRecords = records.map((record) => {
    if (updated) return record
    if (!record?.isFolder) {
      if (record?.isDeleted) return record
      const normalizedStatus = normalizeDocumentWorkflowStatus(record.status || 'Pending Review')
      if (normalizedStatus !== 'Pending Review') return record
      updated = true
      return {
        ...record,
        status: nextStatus,
        recordStatus: mapUiStatusToRecordStatus(nextStatus),
      }
    }
    const files = Array.isArray(record.files) ? record.files : []
    const pendingIndex = files.findIndex((file) => (
      !file?.isDeleted
      && normalizeDocumentWorkflowStatus(file.status || 'Pending Review') === 'Pending Review'
    ))
    if (pendingIndex === -1) return record
    const nextFiles = [...files]
    nextFiles[pendingIndex] = { ...nextFiles[pendingIndex], status: nextStatus }
    updated = true
    return {
      ...record,
      files: nextFiles,
    }
  })
  return { updated, records: nextRecords }
}

const resolveCategoryIdFromHistoryLabel = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized.includes('sales')) return 'sales'
  if (normalized.includes('bank')) return 'bank-statements'
  return 'expenses'
}

const normalizeClassOptions = (values = []) => {
  const byKey = new Map()
  ;(Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim()
    if (!normalized) return
    const key = normalized.toLowerCase()
    if (byKey.has(key)) return
    byKey.set(key, normalized)
  })
  return Array.from(byKey.values())
}

const buildClassId = (name = '') => {
  const normalized = String(name || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const token = normalized.slice(0, 16)
  return token ? `CLS-${token}` : `CLS-${Date.now().toString(36).toUpperCase()}`
}

const mapUiStatusToRecordStatus = (status = '') => {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'approved') return 'posted'
  if (normalized === 'deleted' || normalized === 'archived' || normalized === 'rejected') return 'archived'
  return 'draft'
}

const createDefaultClientDocuments = () => {
  return {
    expenses: [],
    sales: [],
    bankStatements: [],
    uploadHistory: [],
    resolvedDocuments: [],
    expenseClassOptions: [],
    salesClassOptions: [],
  }
}

const CLIENT_WORKSPACE_MEMORY_CACHE = new Map()

const getClientWorkspaceCache = (email = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return null
  return CLIENT_WORKSPACE_MEMORY_CACHE.get(normalizedEmail) || null
}

const setClientWorkspaceCache = (email = '', workspace = {}) => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return
  const existing = getClientWorkspaceCache(normalizedEmail) || {}
  const nextWorkspace = workspace && typeof workspace === 'object' ? { ...workspace } : {}
  if (Object.prototype.hasOwnProperty.call(nextWorkspace, 'profilePhoto')) {
    const normalizedProfilePhoto = String(nextWorkspace.profilePhoto || '').trim()
    nextWorkspace.profilePhoto = /^blob:/i.test(normalizedProfilePhoto) ? '' : normalizedProfilePhoto
  }
  if (Object.prototype.hasOwnProperty.call(nextWorkspace, 'companyLogo')) {
    const normalizedCompanyLogo = String(nextWorkspace.companyLogo || '').trim()
    nextWorkspace.companyLogo = /^blob:/i.test(normalizedCompanyLogo) ? '' : normalizedCompanyLogo
  }
  CLIENT_WORKSPACE_MEMORY_CACHE.set(normalizedEmail, {
    ...existing,
    ...nextWorkspace,
  })
}

const readScopedStorageJson = (baseKey = '', email = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedBaseKey = String(baseKey || '').trim()
  if (!normalizedEmail || !normalizedBaseKey || typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(getScopedStorageKey(normalizedBaseKey, normalizedEmail))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

const writeScopedStorageJson = (baseKey = '', email = '', payload = null) => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedBaseKey = String(baseKey || '').trim()
  if (!normalizedEmail || !normalizedBaseKey || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      getScopedStorageKey(normalizedBaseKey, normalizedEmail),
      JSON.stringify(payload && typeof payload === 'object' ? payload : {}),
    )
  } catch {
    // Ignore local storage persistence failures.
  }
}

const normalizeUploadHistoryRows = (rows = [], ownerEmail = '') => (
  (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row === 'object' && !row.isFolder)
    .map((row) => ({
      ...row,
      isFolder: false,
      ownerEmail: String(row?.ownerEmail || ownerEmail || '').trim().toLowerCase(),
      categoryId: row?.categoryId || resolveCategoryIdFromHistoryLabel(row?.category || ''),
      status: normalizeDocumentWorkflowStatus(row?.status || 'Pending Review'),
      timestampIso: String(row?.timestampIso || row?.createdAtIso || row?.updatedAtIso || row?.date || '').trim(),
    }))
)

const readClientDocuments = (email, ownerName = '') => {
  const fallback = createDefaultClientDocuments(ownerName)
  if (!email) return fallback
  const workspaceCache = getClientWorkspaceCache(email)
  const parsed = workspaceCache?.documents
  if (!parsed || typeof parsed !== 'object') return fallback
  return {
    expenses: Array.isArray(parsed.expenses) ? cloneDocumentRows(parsed.expenses) : fallback.expenses,
    sales: Array.isArray(parsed.sales) ? cloneDocumentRows(parsed.sales) : fallback.sales,
    bankStatements: Array.isArray(parsed.bankStatements) ? cloneDocumentRows(parsed.bankStatements) : fallback.bankStatements,
    uploadHistory: normalizeUploadHistoryRows(
      Array.isArray(parsed.uploadHistory) ? cloneDocumentRows(parsed.uploadHistory) : fallback.uploadHistory,
      email,
    ),
    resolvedDocuments: Array.isArray(parsed.resolvedDocuments) ? cloneDocumentRows(parsed.resolvedDocuments) : fallback.resolvedDocuments,
    expenseClassOptions: normalizeClassOptions(parsed.expenseClassOptions || fallback.expenseClassOptions),
    salesClassOptions: normalizeClassOptions(parsed.salesClassOptions || fallback.salesClassOptions),
  }
}

const persistClientDocuments = (email, documents) => {
  if (!email || !documents) return
  const sanitizePreviewUrl = (value = '') => {
    const normalized = String(value || '').trim()
    if (!normalized) return ''
    return /^blob:/i.test(normalized) ? '' : normalized
  }
  const sanitizeFile = (file = {}) => {
    const safeVersions = Array.isArray(file.versions)
      ? file.versions.map((version = {}, index) => {
        const safeSnapshot = version.fileSnapshot && typeof version.fileSnapshot === 'object'
          ? {
            ...version.fileSnapshot,
            previewUrl: sanitizePreviewUrl(version.fileSnapshot.previewUrl || ''),
          }
          : version.fileSnapshot
        return {
          ...version,
          versionNumber: version.versionNumber || version.version || index + 1,
          previewUrl: sanitizePreviewUrl(version.previewUrl || ''),
          fileSnapshot: safeSnapshot,
        }
      })
      : file.versions
    const nextFile = {
      ...file,
      previewUrl: sanitizePreviewUrl(file.previewUrl || ''),
      versions: safeVersions,
    }
    if ('rawFile' in nextFile) {
      delete nextFile.rawFile
    }
    return nextFile
  }
  const sanitizeCategoryRows = (rows = []) => (
    (Array.isArray(rows) ? rows : []).map((row) => {
      if (!row?.isFolder) return sanitizeFile(row)
      return {
        ...row,
        files: (Array.isArray(row.files) ? row.files : []).map((file) => sanitizeFile(file)),
      }
    })
  )
  const payload = {
    ...documents,
    expenses: sanitizeCategoryRows(documents.expenses),
    sales: sanitizeCategoryRows(documents.sales),
    bankStatements: sanitizeCategoryRows(documents.bankStatements),
    uploadHistory: normalizeUploadHistoryRows(documents.uploadHistory, email),
    resolvedDocuments: Array.isArray(documents.resolvedDocuments) ? cloneDocumentRows(documents.resolvedDocuments) : [],
    expenseClassOptions: normalizeClassOptions(documents.expenseClassOptions),
    salesClassOptions: normalizeClassOptions(documents.salesClassOptions),
  }
  setClientWorkspaceCache(email, {
    documents: payload,
  })
}

const appendClientActivityLog = (email, entry = {}) => {
  const normalizedEmail = email?.trim()?.toLowerCase()
  if (!normalizedEmail) return null
  const workspaceCache = getClientWorkspaceCache(normalizedEmail) || {}
  const existing = Array.isArray(workspaceCache.activityLog) ? workspaceCache.activityLog : []

  const timestampIso = new Date().toISOString()
  const logEntry = {
    id: `CLLOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    actorName: entry.actorName || 'Client User',
    actorRole: entry.actorRole || 'client',
    action: entry.action || 'Client activity',
    details: entry.details || '--',
    timestamp: timestampIso,
  }
  setClientWorkspaceCache(normalizedEmail, {
    activityLog: [logEntry, ...existing],
  })
  return logEntry
}

const readClientActivityLogEntries = (email) => {
  const normalizedEmail = email?.trim()?.toLowerCase()
  if (!normalizedEmail) return []
  const workspaceCache = getClientWorkspaceCache(normalizedEmail)
  return Array.isArray(workspaceCache?.activityLog) ? workspaceCache.activityLog : []
}

const normalizeVerificationDocs = (payload = {}) => ({
  govId: String(payload?.govId || '').trim(),
  govIdType: String(payload?.govIdType || '').trim(),
  govIdNumber: String(payload?.govIdNumber || payload?.governmentIdNumber || '').trim(),
  govIdVerifiedAt: String(payload?.govIdVerifiedAt || '').trim(),
  govIdVerificationStatus: String(payload?.govIdVerificationStatus || '').trim(),
  govIdClarityStatus: String(payload?.govIdClarityStatus || '').trim(),
  businessReg: String(payload?.businessReg || '').trim(),
  businessRegFileCacheKey: String(payload?.businessRegFileCacheKey || '').trim(),
  businessRegMimeType: String(payload?.businessRegMimeType || '').trim(),
  businessRegSize: Math.max(0, Number(payload?.businessRegSize || 0)),
  businessRegUploadedAt: String(payload?.businessRegUploadedAt || '').trim(),
  businessRegVerificationStatus: String(payload?.businessRegVerificationStatus || '').trim(),
  businessRegSubmittedAt: String(payload?.businessRegSubmittedAt || '').trim(),
})

const normalizeAccountSettings = (payload = {}) => {
  const twoStepEnabled = Boolean(payload?.twoStepEnabled || payload?.smsMfaEnabled)
  return {
    twoStepEnabled,
    twoStepMethod: twoStepEnabled
      ? 'sms'
      : String(payload?.twoStepMethod || '').trim().toLowerCase(),
    verifiedPhoneNumber: String(
      payload?.verifiedPhoneNumber
      || payload?.phoneNumber
      || '',
    ).replace(/\s+/g, '').trim(),
    recoveryEmail: String(payload?.recoveryEmail || payload?.email || '').trim().toLowerCase(),
    enabledAt: String(payload?.enabledAt || '').trim(),
    lastVerifiedAt: String(payload?.lastVerifiedAt || payload?.enabledAt || '').trim(),
  }
}

const resolveSettingsProfileNameParts = (payload = {}) => {
  const fallbackParts = String(payload?.fullName || '').trim().split(/\s+/).filter(Boolean)
  const firstName = String(payload?.firstName || fallbackParts[0] || '').trim()
  const lastName = String(payload?.lastName || (fallbackParts.length > 1 ? fallbackParts[fallbackParts.length - 1] : '') || '').trim()
  const otherNames = String(
    payload?.otherNames
    || (fallbackParts.length > 2 ? fallbackParts.slice(1, -1).join(' ') : ''),
  ).trim()
  return { firstName, lastName, otherNames }
}

const buildSettingsProfileFullName = (payload = {}) => {
  const names = resolveSettingsProfileNameParts(payload)
  return [names.firstName, names.otherNames, names.lastName].filter(Boolean).join(' ').trim()
}

const normalizeSettingsProfile = (payload = {}) => {
  const names = resolveSettingsProfileNameParts(payload)
  const resolvedPhone = String(payload?.phone || '').trim()
  const resolvedPhoneCountryCode = String(payload?.phoneCountryCode || '').trim()
  const resolvedPhoneLocalNumber = String(payload?.phoneLocalNumber || '').replace(/\D/g, '').trim()
  return {
    firstName: names.firstName,
    lastName: names.lastName,
    otherNames: names.otherNames,
    fullName: buildSettingsProfileFullName(payload) || String(payload?.fullName || '').trim(),
    email: String(payload?.email || '').trim().toLowerCase(),
    phone: resolvedPhone,
    phoneCountryCode: resolvedPhoneCountryCode,
    phoneLocalNumber: resolvedPhoneLocalNumber,
    roleInCompany: String(payload?.roleInCompany || '').trim(),
    address: String(payload?.address1 || payload?.address || '').trim(),
    address1: String(payload?.address1 || payload?.address || '').trim(),
    address2: String(payload?.address2 || '').trim(),
    city: String(payload?.city || '').trim(),
    postalCode: String(payload?.postalCode || '').trim(),
    addressCountry: String(payload?.addressCountry || payload?.country || '').trim(),
    businessType: String(payload?.businessType || '').trim(),
    businessName: String(payload?.businessName || '').trim(),
    country: String(payload?.country || payload?.addressCountry || '').trim(),
    currency: String(payload?.currency || '').trim(),
    language: String(payload?.language || '').trim(),
    industry: String(payload?.industry || '').trim(),
    industryOther: String(payload?.industryOther || '').trim(),
    cacNumber: String(payload?.cacNumber || '').trim(),
    tin: String(payload?.tin || '').trim(),
    reportingCycle: String(payload?.reportingCycle || '').trim(),
    startMonth: String(payload?.startMonth || '').trim(),
  }
}

const TEAM_AFFILIATION_BUSINESS_FIELDS = Object.freeze([
  'businessType',
  'businessName',
  'country',
  'currency',
  'industry',
  'industryOther',
  'cacNumber',
  'tin',
  'reportingCycle',
  'startMonth',
])

const normalizeClientTeamRoleValue = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'manager') return 'manager'
  if (normalized === 'accountant') return 'accountant'
  if (normalized === 'viewer') return 'viewer'
  return 'owner'
}

const hasMeaningfulValue = (value) => {
  if (typeof value === 'string') return value.trim().length > 0
  return value !== null && value !== undefined && value !== ''
}

const buildClientTeamAffiliationState = ({
  authUser = null,
  settingsProfile = {},
  onboardingData = {},
  companyName = '',
} = {}) => {
  const normalizedRole = normalizeClientTeamRoleValue(authUser?.clientTeamRole || '')
  const ownerEmail = String(authUser?.clientTeamOwnerEmail || '').trim().toLowerCase()
  const ownerName = String(authUser?.clientTeamOwnerName || '').trim()
  const isTeamMember = normalizedRole !== 'owner' && Boolean(ownerEmail || ownerName)
  if (!isTeamMember) return null

  const normalizedSettingsProfile = normalizeSettingsProfile(settingsProfile || {})
  const normalizedOnboardingData = onboardingData && typeof onboardingData === 'object' ? onboardingData : {}

  return {
    isTeamMember: true,
    role: normalizedRole || 'viewer',
    companyId: String(authUser?.clientTeamCompanyId || '').trim(),
    ownerEmail,
    ownerName,
    accountType: String(authUser?.clientAccountType || '').trim() || 'team-member',
    companyName: String(
      authUser?.clientTeamCompanyName
      || normalizedSettingsProfile.businessName
      || normalizedOnboardingData.businessName
      || companyName
      || ''
    ).trim(),
    businessType: String(
      authUser?.clientTeamBusinessType
      || normalizedSettingsProfile.businessType
      || normalizedOnboardingData.businessType
      || ''
    ).trim(),
    country: String(
      authUser?.clientTeamCountry
      || normalizedSettingsProfile.country
      || normalizedOnboardingData.country
      || ''
    ).trim(),
    currency: String(
      authUser?.clientTeamCurrency
      || normalizedSettingsProfile.currency
      || normalizedOnboardingData.currency
      || 'NGN'
    ).trim(),
    industry: String(normalizedSettingsProfile.industry || normalizedOnboardingData.industry || '').trim(),
    industryOther: String(normalizedSettingsProfile.industryOther || normalizedOnboardingData.industryOther || '').trim(),
    cacNumber: String(normalizedSettingsProfile.cacNumber || normalizedOnboardingData.cacNumber || '').trim(),
    tin: String(normalizedSettingsProfile.tin || normalizedOnboardingData.tin || '').trim(),
    reportingCycle: String(normalizedSettingsProfile.reportingCycle || normalizedOnboardingData.reportingCycle || '').trim(),
    startMonth: String(normalizedSettingsProfile.startMonth || normalizedOnboardingData.startMonth || '').trim(),
  }
}

const applyTeamAffiliationBusinessFields = ({
  data = {},
  affiliation = null,
} = {}) => {
  const source = data && typeof data === 'object' ? data : {}
  if (!affiliation?.isTeamMember) return source

  const next = { ...source }
  TEAM_AFFILIATION_BUSINESS_FIELDS.forEach((field) => {
    if (!hasMeaningfulValue(next[field]) && hasMeaningfulValue(affiliation[field])) {
      next[field] = affiliation[field]
    }
  })
  return next
}

const sanitizeProfileNameFieldForBackend = (value = '') => (
  String(value || '')
    .replace(/[^A-Za-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
)

const normalizeClientNameDraft = (payload = {}) => {
  const source = {
    fullName: String(payload?.fullName || payload?.displayName || '').trim(),
    firstName: String(payload?.firstName || '').trim(),
    lastName: String(payload?.lastName || '').trim(),
    otherNames: String(payload?.otherNames || '').trim(),
  }
  const names = resolveSettingsProfileNameParts(source)
  const fullName = [names.firstName, names.otherNames, names.lastName].filter(Boolean).join(' ').trim()
  return {
    firstName: names.firstName,
    lastName: names.lastName,
    otherNames: names.otherNames,
    fullName,
  }
}

const SUPPORTED_PHONE_COUNTRY_CODES = ['+234', '+44', '+61', '+1']
const CLIENT_PHONE_LOCAL_NUMBER_REGEX = /^\d{10,11}$/

const sanitizePhoneDigitsOnly = (value = '') => String(value || '').replace(/\D/g, '')

const sanitizeClientPhoneLocalNumber = (value = '') => sanitizePhoneDigitsOnly(value).slice(0, 11)

const normalizeClientPhoneLocalNumber = (value = '') => {
  const normalizedDigits = sanitizeClientPhoneLocalNumber(value)
  if (!CLIENT_PHONE_LOCAL_NUMBER_REGEX.test(normalizedDigits)) {
    return {
      rawDigits: normalizedDigits,
      localDigits: '',
      valid: false,
    }
  }
  return {
    rawDigits: normalizedDigits,
    localDigits: normalizedDigits.length === 11 && normalizedDigits.startsWith('0')
      ? normalizedDigits.slice(1)
      : normalizedDigits,
    valid: true,
  }
}

const resolveSupportedPhoneCountryCode = (value = '') => {
  const raw = String(value || '').trim()
  if (!raw.startsWith('+')) return ''
  const supportedCode = [...SUPPORTED_PHONE_COUNTRY_CODES]
    .sort((left, right) => right.length - left.length)
    .find((code) => raw.startsWith(code))
  if (supportedCode) return supportedCode
  const fallbackMatch = raw.match(/^\+\d{1,4}/)
  return fallbackMatch ? fallbackMatch[0] : ''
}

const normalizeClientPhoneForBackend = ({
  phone = '',
  phoneCountryCode = '',
  phoneLocalNumber = '',
} = {}) => {
  const explicitCountryCode = String(phoneCountryCode || '').trim()
  const explicitPhoneInfo = normalizeClientPhoneLocalNumber(phoneLocalNumber)
  const explicitLocalNumber = explicitPhoneInfo.localDigits
  if (explicitLocalNumber) {
    const resolvedCountryCode = explicitCountryCode || '+234'
    return {
      phoneCountryCode: resolvedCountryCode,
      phoneLocalNumber: explicitLocalNumber,
      compactPhone: `${resolvedCountryCode}${explicitLocalNumber}`.replace(/\s+/g, ''),
      displayPhone: `${resolvedCountryCode} ${explicitLocalNumber}`.trim(),
    }
  }

  const rawPhone = String(phone || '').trim()
  if (!rawPhone) {
    return {
      phoneCountryCode: explicitCountryCode || '+234',
      phoneLocalNumber: '',
      compactPhone: '',
      displayPhone: '',
    }
  }

  const compactRawPhone = rawPhone.replace(/\s+/g, '')
  const compactRawDigits = sanitizePhoneDigitsOnly(compactRawPhone)
  const resolvedCountryCode = explicitCountryCode || resolveSupportedPhoneCountryCode(rawPhone) || '+234'
  const countryDigits = sanitizePhoneDigitsOnly(resolvedCountryCode)
  const derivedPhoneInfo = normalizeClientPhoneLocalNumber(
    countryDigits && compactRawDigits.startsWith(countryDigits)
      ? compactRawDigits.slice(countryDigits.length)
      : compactRawDigits,
  )
  const derivedLocalNumber = derivedPhoneInfo.localDigits

  return {
    phoneCountryCode: resolvedCountryCode,
    phoneLocalNumber: derivedLocalNumber,
    compactPhone: derivedLocalNumber ? `${resolvedCountryCode}${derivedLocalNumber}` : compactRawPhone,
    displayPhone: derivedLocalNumber ? `${resolvedCountryCode} ${derivedLocalNumber}`.trim() : rawPhone,
  }
}

const normalizeBusinessTypeForBackend = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'individual') return 'individual'
  if (normalized === 'business') return 'business'
  if (normalized === 'non-profit' || normalized === 'non profit' || normalized === 'nonprofit') return 'non-profit'
  return ''
}

const readCurrentCapturePath = () => {
  if (typeof window === 'undefined') return '/'
  return normalizeAppPathname(window.location.pathname || '/')
}

const resolveCapturePageFromPath = (pathname = '/') => {
  const normalizedPath = normalizeAppPathname(pathname)
  const resolvedPublicPage = resolvePublicSitePageFromPathname(normalizedPath)
  if (resolvedPublicPage) return resolvedPublicPage
  if (normalizedPath === '/login') return 'login'
  if (normalizedPath === '/signup') return 'signup'
  if (normalizedPath === '/admin/login') return 'admin-login'
  if (normalizedPath === '/admin/setup') return 'admin-setup'
  if (normalizedPath === '/team/setup') return 'team-setup'
  return normalizedPath.replace(/^\//, '') || 'home'
}

const normalizeSignupCapturePayload = (signupCapture = {}) => {
  const source = signupCapture && typeof signupCapture === 'object' ? signupCapture : {}
  return {
    signupIp: String(source.signupIp || '').trim(),
    signupLocation: String(source.signupLocation || '').trim(),
    signupSource: String(source.signupSource || '').trim(),
    capturePage: String(source.capturePage || '').trim(),
    capturePath: String(source.capturePath || '').trim(),
  }
}

const hasSignupCapturePayloadValues = (signupCapture = {}) => {
  const normalized = normalizeSignupCapturePayload(signupCapture)
  return Object.values(normalized).some((value) => Boolean(String(value || '').trim()))
}

const buildSignupCapturePayload = ({
  signupSource = '',
  signupLocation = '',
  capturePage = '',
  capturePath = '',
} = {}) => {
  const resolvedPath = String(capturePath || readCurrentCapturePath()).trim() || '/'
  return {
    signupIp: '',
    signupLocation: String(signupLocation || '').trim(),
    signupSource: String(signupSource || '').trim(),
    capturePage: String(capturePage || resolveCapturePageFromPath(resolvedPath)).trim(),
    capturePath: resolvedPath,
  }
}

const buildClientProfilePayloadForBackend = (profile = {}) => {
  const phoneParts = normalizeClientPhoneForBackend({
    phone: profile?.phone,
    phoneCountryCode: profile?.phoneCountryCode,
    phoneLocalNumber: profile?.phoneLocalNumber,
  })
  const signupCapture = normalizeSignupCapturePayload(profile?.signupCapture)

  return {
    firstName: sanitizeProfileNameFieldForBackend(profile?.firstName || ''),
    lastName: sanitizeProfileNameFieldForBackend(profile?.lastName || ''),
    otherNames: sanitizeProfileNameFieldForBackend(profile?.otherNames || ''),
    phoneCountryCode: phoneParts.phoneCountryCode,
    phoneLocalNumber: phoneParts.phoneLocalNumber,
    roleInCompany: String(profile?.roleInCompany || '').trim(),
    address1: String(profile?.address1 || profile?.address || '').trim(),
    address2: String(profile?.address2 || '').trim(),
    city: String(profile?.city || '').trim(),
    postalCode: String(profile?.postalCode || '').trim(),
    addressCountry: String(profile?.addressCountry || profile?.country || '').trim(),
    businessType: normalizeBusinessTypeForBackend(profile?.businessType || ''),
    businessName: String(profile?.businessName || '').trim(),
    country: String(profile?.country || '').trim(),
    currency: String(profile?.currency || '').trim().toUpperCase(),
    language: String(profile?.language || '').trim(),
    industry: String(profile?.industry || '').trim(),
    industryOther: String(profile?.industryOther || '').trim(),
    cacNumber: String(profile?.cacNumber || '').trim(),
    tin: String(profile?.tin || '').trim(),
    reportingCycle: String(profile?.reportingCycle || '').trim(),
    startMonth: String(profile?.startMonth || '').trim(),
    ...(hasSignupCapturePayloadValues(signupCapture)
      ? {
          signupCapture,
        }
      : {}),
  }
}

const checkClientPhoneAvailability = async (phoneNumber = '') => {
  const normalizedPhone = normalizeClientPhoneLocalNumber(phoneNumber)
  const normalizedPhoneNumber = normalizedPhone.rawDigits
  if (!normalizedPhoneNumber) {
    return { ok: true, available: true, message: '' }
  }
  if (!normalizedPhone.valid) {
    return {
      ok: false,
      available: false,
      message: 'Phone number must be 10 or 11 digits.',
    }
  }

  try {
    const query = new URLSearchParams({ phoneNumber: normalizedPhoneNumber }).toString()
    const response = await apiFetch(`/api/users/public/phone-availability?${query}`, {
      method: 'GET',
    })
    const data = await response.json().catch(() => ({}))
    return {
      ok: response.ok,
      available: Boolean(data?.available),
      message: String(data?.message || '').trim(),
    }
  } catch {
    return {
      ok: false,
      available: false,
      message: 'Unable to verify phone number right now.',
    }
  }
}

const persistClientProfileToBackend = async ({
  authorizationToken = '',
  profile = {},
} = {}) => {
  const token = String(authorizationToken || '').trim()
  if (!token) {
    return { ok: false, status: 0, message: 'Missing authorization token.' }
  }

  try {
    const response = await apiFetch('/api/users/me/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(buildClientProfilePayloadForBackend(profile)),
    })
    const data = await response.json().catch(() => ({}))
    return {
      ok: response.ok,
      status: response.status,
      data,
      message: String(data?.message || '').trim(),
    }
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      message: 'Unable to save profile right now.',
    }
  }
}

const issueSmsOtpChallenge = async ({
  phoneNumber = '',
  purpose = 'mfa',
  email = '',
} = {}) => {
  try {
    const response = await apiFetch('/api/auth/send-sms-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: String(phoneNumber || '').trim(),
        purpose: String(purpose || 'mfa').trim().toLowerCase(),
        email: String(email || '').trim().toLowerCase(),
      }),
    })
    const data = await response.json().catch(() => ({}))
    return {
      ok: response.ok,
      status: response.status,
      expiresAt: String(data?.expiresAt || '').trim(),
      previewOtp: String(data?.previewOtp || '').trim(),
      message: String(data?.message || '').trim(),
    }
  } catch {
    return {
      ok: false,
      status: 0,
      expiresAt: '',
      previewOtp: '',
      message: 'Unable to send verification code right now.',
    }
  }
}

const verifySmsOtpChallengeCode = async ({
  phoneNumber = '',
  purpose = 'mfa',
  email = '',
  otp = '',
} = {}) => {
  try {
    const response = await apiFetch('/api/auth/verify-sms-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: String(phoneNumber || '').trim(),
        purpose: String(purpose || 'mfa').trim().toLowerCase(),
        email: String(email || '').trim().toLowerCase(),
        otp: String(otp || '').trim(),
      }),
    })
    if (!response.ok) {
      const message = await readErrorMessageFromResponse(response)
      return { ok: false, message: message || 'Incorrect verification code.' }
    }
    return { ok: true, message: 'SMS OTP verified successfully.' }
  } catch {
    return { ok: false, message: 'Unable to verify OTP right now.' }
  }
}

const readScopedSettingsProfile = (email = '') => {
  const workspaceCache = getClientWorkspaceCache(email)
  return normalizeSettingsProfile(workspaceCache?.settingsProfile || {})
}

const readScopedVerificationDocs = (email = '') => {
  const workspaceCache = getClientWorkspaceCache(email)
  return normalizeVerificationDocs(workspaceCache?.verificationDocs || {})
}

const readScopedAccountSettings = (email = '') => {
  const workspaceCache = getClientWorkspaceCache(email)
  return normalizeAccountSettings(workspaceCache?.accountSettings || {})
}

const persistScopedVerificationDocs = (email = '', docs = {}) => {
  const normalizedDocs = normalizeVerificationDocs(docs)
  setClientWorkspaceCache(email, {
    verificationDocs: normalizedDocs,
  })
}

const persistScopedAccountSettings = (email = '', settings = {}) => {
  const normalizedSettings = normalizeAccountSettings(settings)
  setClientWorkspaceCache(email, {
    accountSettings: normalizedSettings,
  })
}

const persistScopedNotificationSettings = (email = '', settings = {}) => {
  const normalizedSettings = normalizeClientNotificationSettings(settings)
  setClientWorkspaceCache(email, {
    notificationSettings: normalizedSettings,
  })
  persistClientNotificationSettings(email, normalizedSettings)
  return normalizedSettings
}

const removeScopedClientArtifacts = (email = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return

  const scopedBaseKeys = [
    'settingsFormData',
    'kiaminaOnboardingState',
    'notificationSettings',
    'verificationDocs',
    'profilePhoto',
    'companyLogo',
    CLIENT_DOCUMENTS_STORAGE_KEY,
    CLIENT_ACTIVITY_STORAGE_KEY,
    CLIENT_STATUS_CONTROL_STORAGE_KEY,
    CLIENT_BRIEF_NOTIFICATIONS_STORAGE_KEY,
    'kiaminaClientTeamMembers',
    'kiaminaClientTeamInvites',
  ]
  scopedBaseKeys.forEach((baseKey) => {
    localStorage.removeItem(getScopedStorageKey(baseKey, normalizedEmail))
  })

  try {
    const keysToRemove = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key) continue
      if (key.toLowerCase().endsWith(`:${normalizedEmail}`)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key))
  } catch {
    // no-op
  }

  try {
    const control = JSON.parse(localStorage.getItem(CLIENT_SESSION_CONTROL_STORAGE_KEY) || 'null')
    if (control && typeof control === 'object' && control.byEmail && typeof control.byEmail === 'object') {
      const nextByEmail = { ...control.byEmail }
      if (nextByEmail[normalizedEmail]) {
        delete nextByEmail[normalizedEmail]
        localStorage.setItem(CLIENT_SESSION_CONTROL_STORAGE_KEY, JSON.stringify({
          ...control,
          byEmail: nextByEmail,
        }))
      }
    }
  } catch {
    // no-op
  }

  try {
    const assignments = JSON.parse(localStorage.getItem(CLIENT_ASSIGNMENTS_STORAGE_KEY) || '[]')
    if (Array.isArray(assignments)) {
      const filteredAssignments = assignments.filter((entry) => (
        String(entry?.clientEmail || '').trim().toLowerCase() !== normalizedEmail
      ))
      localStorage.setItem(CLIENT_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(filteredAssignments))
    }
  } catch {
    // no-op
  }
}

const resolveVerificationProgress = ({
  onboardingData = {},
  settingsDocs = {},
  settingsProfile = {},
} = {}) => {
  const normalizedOnboardingDocs = normalizeVerificationDocs(onboardingData || {})
  const normalizedSettingsDocs = normalizeVerificationDocs(settingsDocs || {})
  const normalizedSettingsProfile = normalizeSettingsProfile(settingsProfile || {})
  const mergedDocs = {
    govId: normalizedSettingsDocs.govId || normalizedOnboardingDocs.govId,
    govIdType: normalizedSettingsDocs.govIdType || normalizedOnboardingDocs.govIdType,
    govIdNumber: normalizedSettingsDocs.govIdNumber || normalizedOnboardingDocs.govIdNumber,
    govIdVerifiedAt: normalizedSettingsDocs.govIdVerifiedAt || normalizedOnboardingDocs.govIdVerifiedAt,
    govIdVerificationStatus: normalizedSettingsDocs.govIdVerificationStatus || normalizedOnboardingDocs.govIdVerificationStatus,
    govIdClarityStatus: normalizedSettingsDocs.govIdClarityStatus || normalizedOnboardingDocs.govIdClarityStatus,
    businessReg: normalizedSettingsDocs.businessReg || normalizedOnboardingDocs.businessReg,
    businessRegFileCacheKey: normalizedSettingsDocs.businessRegFileCacheKey || normalizedOnboardingDocs.businessRegFileCacheKey,
    businessRegMimeType: normalizedSettingsDocs.businessRegMimeType || normalizedOnboardingDocs.businessRegMimeType,
    businessRegSize: normalizedSettingsDocs.businessRegSize || normalizedOnboardingDocs.businessRegSize,
    businessRegUploadedAt: normalizedSettingsDocs.businessRegUploadedAt || normalizedOnboardingDocs.businessRegUploadedAt,
    businessRegVerificationStatus: normalizedSettingsDocs.businessRegVerificationStatus || normalizedOnboardingDocs.businessRegVerificationStatus,
    businessRegSubmittedAt: normalizedSettingsDocs.businessRegSubmittedAt || normalizedOnboardingDocs.businessRegSubmittedAt,
  }
  const profileStepCompleted = Boolean(
    normalizedSettingsProfile.fullName
    && normalizedSettingsProfile.email
    && normalizedSettingsProfile.phone
    && normalizedSettingsProfile.address,
  )
  // Business verification is disabled for the MVP, so this retired step stays satisfied.
  const businessStepCompleted = true
  return {
    profile: normalizedSettingsProfile,
    docs: mergedDocs,
    hasAnyDocs: Boolean(
      mergedDocs.govId
      || mergedDocs.businessReg
      || profileStepCompleted,
    ),
    profileStepCompleted,
    businessStepCompleted,
    stepsCompleted: Number(profileStepCompleted) + Number(businessStepCompleted),
  }
}

function App() {
  const defaultOnboardingData = {
    firstName: '',
    lastName: '',
    otherNames: '',
    email: '',
    phone: '',
    roleInCompany: '',
    address1: '',
    address2: '',
    city: '',
    postalCode: '',
    addressCountry: '',
    businessType: '',
    businessName: '',
    country: '',
    industry: '',
    industryOther: '',
    cacNumber: '',
    tin: '',
    reportingCycle: '',
    startMonth: '',
    currency: 'NGN',
    language: 'English',
    primaryContact: '',
    servicesNeeded: [],
    govId: '',
    govIdType: '',
    govIdNumber: '',
    govIdVerifiedAt: '',
    govIdVerificationStatus: '',
    govIdClarityStatus: '',
    businessReg: '',
    defaultLandingPage: 'dashboard',
    notifyEmail: true,
    notifyCompliance: true,
    uploadPreference: 'standard',
  }

  const getSavedScopedJson = (baseKey, email) => {
    const workspaceCache = getClientWorkspaceCache(email) || {}
    if (baseKey === 'settingsFormData') {
      return workspaceCache.settingsProfile || readScopedStorageJson(baseKey, email) || null
    }
    if (baseKey === 'kiaminaOnboardingState') {
      return workspaceCache.onboardingState || readScopedStorageJson(baseKey, email) || null
    }
    return null
  }
  const getSavedCompanyName = (email, fallback = '') => {
    const parsed = getSavedScopedJson('settingsFormData', email)
    return parsed?.businessName?.trim() || fallback
  }
  const getSavedClientFirstName = (email, fallback = 'Client') => {
    const parsed = getSavedScopedJson('settingsFormData', email)
    if (!parsed || typeof parsed !== 'object') return fallback
    const normalizedProfile = normalizeSettingsProfile(parsed)
    return normalizedProfile.firstName || normalizedProfile.fullName?.trim()?.split(/\s+/)?.[0] || fallback
  }
  const getSavedScopedString = (baseKey, email) => {
    const workspaceCache = getClientWorkspaceCache(email) || {}
    if (baseKey === 'profilePhoto') return normalizePersistentClientAssetUrl(workspaceCache.profilePhoto || '')
    if (baseKey === 'companyLogo') return normalizePersistentClientAssetUrl(workspaceCache.companyLogo || '')
    return null
  }
  const getSavedProfilePhoto = (email) => getSavedScopedString('profilePhoto', email)
  const getSavedCompanyLogo = (email) => getSavedScopedString('companyLogo', email)
  const getSavedAccounts = () => {
    try {
      const saved = localStorage.getItem('kiaminaAccounts')
      const parsed = saved ? JSON.parse(saved) : []
      if (!Array.isArray(parsed)) return []

      const normalized = parsed.map(normalizeAccount)
      if (saved && JSON.stringify(parsed) !== JSON.stringify(normalized)) {
        localStorage.setItem('kiaminaAccounts', JSON.stringify(normalized))
      }
      return normalized
    } catch {
      return []
    }
  }
  const resetStoredClientAndAdminSessions = () => {
    const savedAccounts = getSavedAccounts()
    const adminAccounts = savedAccounts.filter((account) => (
      normalizeRole(account?.role, account?.email || '') === 'admin'
    ))
    savedAccounts.forEach((account) => {
      const normalizedEmail = String(account?.email || '').trim().toLowerCase()
      if (!normalizedEmail) return
      removeScopedClientArtifacts(normalizedEmail)
    })
    localStorage.setItem('kiaminaAccounts', JSON.stringify(adminAccounts))
    sessionStorage.removeItem('kiaminaAuthUser')
    localStorage.removeItem('kiaminaAuthUser')
    clearApiAccessToken()
    clearApiSessionId()
    persistImpersonationSession(null)
    persistAdminImpersonationSession(null)
    window.sessionStorage.removeItem(IMPERSONATION_SESSION_STORAGE_KEY)
    window.localStorage.removeItem(IMPERSONATION_SESSION_STORAGE_KEY)
    window.sessionStorage.removeItem(ADMIN_IMPERSONATION_SESSION_STORAGE_KEY)
    window.localStorage.removeItem(ADMIN_IMPERSONATION_SESSION_STORAGE_KEY)
    void clearFirebaseAuthSession()
  }
  const getSavedAdminInvites = () => {
    try {
      const saved = localStorage.getItem(ADMIN_INVITES_STORAGE_KEY)
      const parsed = saved ? JSON.parse(saved) : []
      if (!Array.isArray(parsed)) return []
      return parsed.map(normalizeAdminInvite)
    } catch {
      return []
    }
  }
  const saveAdminInvites = (invites) => {
    localStorage.setItem(ADMIN_INVITES_STORAGE_KEY, JSON.stringify(invites.map(normalizeAdminInvite)))
  }
  const getAdminInviteByToken = (token = '') => {
    const normalizedToken = token.trim()
    if (!normalizedToken) return null
    const invites = getSavedAdminInvites()
    return invites.find((invite) => invite.token === normalizedToken) || null
  }
  const normalizeClientTeamRole = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'owner') return 'owner'
    if (normalized === 'manager') return 'manager'
    if (normalized === 'accountant') return 'accountant'
    if (normalized === 'viewer') return 'viewer'
    return 'viewer'
  }
  const getClientTeamAccessProfile = (email = '') => {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!normalizedEmail) return null
    try {
      const saved = localStorage.getItem(getScopedStorageKey(CLIENT_TEAM_ACCESS_STORAGE_KEY, normalizedEmail))
      if (!saved) return null
      const parsed = JSON.parse(saved)
      if (!parsed || typeof parsed !== 'object') return null
      return {
        role: normalizeClientTeamRole(parsed.role),
        companyId: String(parsed.companyId || '').trim(),
        ownerEmail: String(parsed.ownerEmail || '').trim().toLowerCase(),
        ownerName: String(parsed.ownerName || '').trim(),
        companyName: String(parsed.companyName || '').trim(),
        businessType: String(parsed.businessType || '').trim(),
        country: String(parsed.country || '').trim(),
        currency: String(parsed.currency || '').trim(),
        accountType: String(parsed.accountType || '').trim(),
      }
    } catch {
      return null
    }
  }
  const saveClientTeamAccessProfile = ({
    email = '',
    role = 'viewer',
    companyId = '',
    ownerEmail = '',
    ownerName = '',
    companyName = '',
    businessType = '',
    country = '',
    currency = '',
    accountType = '',
  } = {}) => {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!normalizedEmail) return null
    const payload = {
      role: normalizeClientTeamRole(role),
      companyId: String(companyId || '').trim(),
      ownerEmail: String(ownerEmail || '').trim().toLowerCase(),
      ownerName: String(ownerName || '').trim(),
      companyName: String(companyName || '').trim(),
      businessType: String(businessType || '').trim(),
      country: String(country || '').trim(),
      currency: String(currency || '').trim(),
      accountType: String(accountType || '').trim(),
    }
    try {
      localStorage.setItem(
        getScopedStorageKey(CLIENT_TEAM_ACCESS_STORAGE_KEY, normalizedEmail),
        JSON.stringify(payload),
      )
    } catch {
      return null
    }
    return payload
  }
  const applyClientTeamAccessProfile = (user = {}) => {
    const accessProfile = getClientTeamAccessProfile(user?.email)
    if (!accessProfile) return user
    return {
      ...user,
      clientTeamRole: accessProfile.role || user?.clientTeamRole || 'owner',
      clientTeamCompanyId: accessProfile.companyId || user?.clientTeamCompanyId || '',
      clientTeamOwnerEmail: accessProfile.ownerEmail || user?.clientTeamOwnerEmail || '',
      clientTeamOwnerName: accessProfile.ownerName || user?.clientTeamOwnerName || '',
      clientTeamCompanyName: accessProfile.companyName || user?.clientTeamCompanyName || '',
      clientTeamBusinessType: accessProfile.businessType || user?.clientTeamBusinessType || '',
      clientTeamCountry: accessProfile.country || user?.clientTeamCountry || '',
      clientTeamCurrency: accessProfile.currency || user?.clientTeamCurrency || '',
      clientAccountType: accessProfile.accountType || user?.clientAccountType || '',
    }
  }
  const isClientTeamInviteExpired = (invite = {}) => {
    const expiryMs = Date.parse(invite?.expiresAt || '')
    if (!Number.isFinite(expiryMs)) return true
    return Date.now() > expiryMs
  }
  const getClientTeamInviteStatus = (invite = {}) => {
    const normalizedStatus = String(invite?.status || '').trim().toLowerCase()
    if (normalizedStatus === 'accepted') return 'accepted'
    if (normalizedStatus === 'cancelled' || normalizedStatus === 'canceled' || normalizedStatus === 'revoked') return 'cancelled'
    if (normalizedStatus === 'expired') return 'expired'
    return isClientTeamInviteExpired(invite) ? 'expired' : 'pending'
  }
  const getClientTeamInviteByTokenFromStorage = ({
    token = '',
    companyId = '',
  } = {}) => {
    const normalizedToken = String(token || '').trim()
    const normalizedCompanyId = String(companyId || '').trim()
    if (!normalizedToken || typeof localStorage === 'undefined') return null
    const inviteKeys = Object.keys(localStorage).filter((key) => (
      key === CLIENT_TEAM_INVITES_STORAGE_KEY
      || key.startsWith(`${CLIENT_TEAM_INVITES_STORAGE_KEY}:`)
    ))

    for (const inviteKey of inviteKeys) {
      try {
        const parsed = JSON.parse(localStorage.getItem(inviteKey) || '[]')
        const inviteEntries = Array.isArray(parsed) ? parsed : []
        const invite = inviteEntries.find((entry) => {
          if (String(entry?.token || '').trim() !== normalizedToken) return false
          if (!normalizedCompanyId) return true
          return String(entry?.companyId || '').trim() === normalizedCompanyId
        })
        if (!invite) continue

        const ownerEmail = inviteKey.includes(':')
          ? inviteKey.split(':').slice(1).join(':').trim().toLowerCase()
          : ''
        return {
          invite: {
            ...invite,
            email: String(invite?.email || '').trim().toLowerCase(),
            role: normalizeClientTeamRole(invite?.role),
            companyId: String(invite?.companyId || '').trim(),
            invitedBy: String(invite?.invitedBy || '').trim(),
            status: getClientTeamInviteStatus(invite),
          },
          ownerEmail,
          invitesStorageKey: inviteKey,
          membersStorageKey: ownerEmail ? getScopedStorageKey(CLIENT_TEAM_MEMBERS_STORAGE_KEY, ownerEmail) : CLIENT_TEAM_MEMBERS_STORAGE_KEY,
        }
      } catch {
        // ignore malformed invite payloads
      }
    }
    return null
  }
  const acceptClientTeamInviteFromStorage = ({
    token = '',
    companyId = '',
    fullName = '',
    email = '',
  } = {}) => {
    const inviteLookup = getClientTeamInviteByTokenFromStorage({ token, companyId })
    if (!inviteLookup || inviteLookup.invite.status !== 'pending') {
      return { ok: false, message: 'Invite link is invalid or has expired.' }
    }

    const normalizedEmail = String(email || inviteLookup.invite.email || '').trim().toLowerCase()
    if (!normalizedEmail) {
      return { ok: false, message: 'Invite email is invalid.' }
    }

    const acceptedAt = new Date().toISOString()
    try {
      const existingInvites = JSON.parse(localStorage.getItem(inviteLookup.invitesStorageKey) || '[]')
      const nextInvites = (Array.isArray(existingInvites) ? existingInvites : []).map((entry) => (
        String(entry?.token || '').trim() === String(inviteLookup.invite.token || '').trim()
          ? {
            ...entry,
            status: 'accepted',
            acceptedAt,
          }
          : entry
      ))
      localStorage.setItem(inviteLookup.invitesStorageKey, JSON.stringify(nextInvites))
    } catch {
      return { ok: false, message: 'Unable to update invite status right now.' }
    }

    try {
      const existingMembers = JSON.parse(localStorage.getItem(inviteLookup.membersStorageKey) || '[]')
      const memberEntries = Array.isArray(existingMembers) ? existingMembers : []
      const existingIndex = memberEntries.findIndex((entry) => (
        String(entry?.email || '').trim().toLowerCase() === normalizedEmail
      ))
      const nextMember = {
        ...(existingIndex >= 0 ? memberEntries[existingIndex] : {}),
        id: existingIndex >= 0
          ? String(memberEntries[existingIndex]?.id || '').trim() || `TM-${Date.now()}-${Math.floor(Math.random() * 1000)}`
          : `TM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        email: normalizedEmail,
        fullName: String(fullName || memberEntries[existingIndex]?.fullName || normalizedEmail).trim(),
        role: normalizeClientTeamRole(inviteLookup.invite.role),
        companyId: String(inviteLookup.invite.companyId || '').trim(),
        status: 'Active',
        joinedAt: acceptedAt,
        isPrimaryOwner: false,
      }
      const nextMembers = [...memberEntries]
      if (existingIndex >= 0) nextMembers[existingIndex] = nextMember
      else nextMembers.unshift(nextMember)
      localStorage.setItem(inviteLookup.membersStorageKey, JSON.stringify(nextMembers))
    } catch {
      return { ok: false, message: 'Unable to add the invited team member right now.' }
    }

    saveClientTeamAccessProfile({
      email: normalizedEmail,
      role: inviteLookup.invite.role,
      companyId: inviteLookup.invite.companyId,
      ownerEmail: inviteLookup.ownerEmail,
      ownerName: inviteLookup.invite.invitedBy,
    })

    return {
      ok: true,
      invite: inviteLookup.invite,
      ownerEmail: inviteLookup.ownerEmail,
    }
  }
  const buildClientTeamInviteLookup = (payload = {}) => {
    const invite = payload?.invite && typeof payload.invite === 'object'
      ? payload.invite
      : null
    if (!invite?.token) return null
    const owner = payload?.owner && typeof payload.owner === 'object'
      ? payload.owner
      : {}
    return {
      invite: {
        ...invite,
        email: String(invite?.email || '').trim().toLowerCase(),
        role: normalizeClientTeamRole(invite?.role),
        companyId: String(invite?.companyId || '').trim(),
        invitedBy: String(invite?.invitedBy || owner?.fullName || '').trim(),
        status: getClientTeamInviteStatus(invite),
      },
      ownerEmail: String(owner?.email || '').trim().toLowerCase(),
      invitesStorageKey: '',
      membersStorageKey: '',
    }
  }
  const buildPendingClientTeamInvitePlaceholder = ({
    token = '',
    companyId = '',
    email = '',
  } = {}) => {
    const normalizedToken = String(token || '').trim()
    const normalizedCompanyId = String(companyId || '').trim()
    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!normalizedToken || !normalizedCompanyId || !normalizedEmail) return null
    return {
      invite: {
        token: normalizedToken,
        companyId: normalizedCompanyId,
        email: normalizedEmail,
        role: 'viewer',
        invitedBy: '',
        status: 'pending',
      },
      ownerEmail: '',
      invitesStorageKey: '',
      membersStorageKey: '',
    }
  }
  const getClientTeamInviteByToken = async ({
    token = '',
    companyId = '',
  } = {}) => {
    const normalizedToken = String(token || '').trim()
    const normalizedCompanyId = String(companyId || '').trim()
    if (!normalizedToken) return null

    const backendLookup = await fetchPublicClientTeamInvite({
      token: normalizedToken,
      companyId: normalizedCompanyId,
    })
    if (backendLookup.ok) {
      return buildClientTeamInviteLookup(backendLookup.data)
    }

    const storageLookup = getClientTeamInviteByTokenFromStorage({
      token: normalizedToken,
      companyId: normalizedCompanyId,
    })
    if (storageLookup) return storageLookup

    return null
  }
  const acceptClientTeamInvite = async ({
    token = '',
    companyId = '',
    fullName = '',
    email = '',
  } = {}) => {
    const normalizedToken = String(token || '').trim()
    const normalizedCompanyId = String(companyId || '').trim()
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const backendResult = await acceptClientTeamInviteFromBackend({
      token: normalizedToken,
      companyId: normalizedCompanyId,
      email: normalizedEmail,
      fullName: String(fullName || '').trim(),
    })
    if (backendResult.ok) {
      const teamAccess = backendResult.data?.teamAccess && typeof backendResult.data.teamAccess === 'object'
        ? backendResult.data.teamAccess
        : {}
      saveClientTeamAccessProfile({
        email: normalizedEmail,
        role: teamAccess.role || backendResult.data?.invite?.role || 'viewer',
        companyId: teamAccess.companyId || normalizedCompanyId,
        ownerEmail: teamAccess.ownerEmail || backendResult.data?.owner?.email || '',
        ownerName: teamAccess.ownerName || backendResult.data?.owner?.fullName || '',
        companyName: teamAccess.companyName || backendResult.data?.owner?.companyName || '',
        businessType: teamAccess.businessType || backendResult.data?.owner?.businessType || '',
        country: teamAccess.country || backendResult.data?.owner?.country || '',
        currency: teamAccess.currency || backendResult.data?.owner?.currency || '',
        accountType: teamAccess.accountType || 'team-member',
      })
      return {
        ok: true,
        invite: backendResult.data?.invite || null,
        ownerEmail: String(teamAccess.ownerEmail || backendResult.data?.owner?.email || '').trim().toLowerCase(),
      }
    }

    return acceptClientTeamInviteFromStorage({
      token: normalizedToken,
      companyId: normalizedCompanyId,
      fullName,
      email: normalizedEmail,
    })
  }
  const getStoredAuthUser = () => {
    try {
      const sessionUser = sessionStorage.getItem('kiaminaAuthUser')
      if (sessionUser) return applyClientTeamAccessProfile(normalizeUser(JSON.parse(sessionUser)))
      const persistentUser = localStorage.getItem('kiaminaAuthUser')
      return persistentUser ? applyClientTeamAccessProfile(normalizeUser(JSON.parse(persistentUser))) : null
    } catch {
      return null
    }
  }
  const resetStoredAdminBootstrapState = () => {
    const savedAccounts = getSavedAccounts()
    const nonAdminAccounts = savedAccounts.filter((account) => (
      normalizeRole(account?.role, account?.email || '') !== 'admin'
    ))
    localStorage.setItem('kiaminaAccounts', JSON.stringify(nonAdminAccounts))

    localStorage.removeItem(ADMIN_INVITES_STORAGE_KEY)
    localStorage.removeItem(ADMIN_ACTIVITY_STORAGE_KEY)
    localStorage.removeItem(ADMIN_SETTINGS_STORAGE_KEY)
    localStorage.removeItem(CLIENT_ASSIGNMENTS_STORAGE_KEY)
    window.localStorage.removeItem(IMPERSONATION_SESSION_STORAGE_KEY)
    window.localStorage.removeItem(ADMIN_IMPERSONATION_SESSION_STORAGE_KEY)
    window.sessionStorage.removeItem(IMPERSONATION_SESSION_STORAGE_KEY)
    window.sessionStorage.removeItem(ADMIN_IMPERSONATION_SESSION_STORAGE_KEY)

    Object.keys(localStorage)
      .filter((key) => key.startsWith('kiaminaAdminProfile:'))
      .forEach((key) => localStorage.removeItem(key))

    const storedAuthUser = getStoredAuthUser()
    const shouldClearStoredAdminSession = normalizeRole(
      storedAuthUser?.role,
      storedAuthUser?.email || '',
    ) === 'admin'

    if (shouldClearStoredAdminSession) {
      sessionStorage.removeItem('kiaminaAuthUser')
      localStorage.removeItem('kiaminaAuthUser')
      clearApiAccessToken()
      clearApiSessionId()
      void clearFirebaseAuthSession()
    }

    persistImpersonationSession(null)
    persistAdminImpersonationSession(null)

    return {
      clearedAdminSession: shouldClearStoredAdminSession,
      removedAdminAccounts: Math.max(0, savedAccounts.length - nonAdminAccounts.length),
    }
  }
  const normalizeBooleanish = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    const normalized = String(value || '').trim().toLowerCase()
    if (['true', '1', 'yes'].includes(normalized)) return true
    if (['false', '0', 'no'].includes(normalized)) return false
    return fallback
  }
  const normalizePersistentClientAssetUrl = (value = '') => {
    const normalized = String(value || '').trim()
    if (!normalized) return ''
    return /^blob:/i.test(normalized) ? '' : normalized
  }
  const mergePersistentClientAssetUrl = (preferredValue = '', fallbackValue = '') => {
    const normalizedPreferred = normalizePersistentClientAssetUrl(preferredValue)
    if (normalizedPreferred) return normalizedPreferred
    return normalizePersistentClientAssetUrl(fallbackValue)
  }
  const createDefaultOnboardingState = () => ({
    version: CLIENT_ONBOARDING_STATE_VERSION,
    currentStep: 1,
    completed: false,
    skipped: false,
    verificationPending: false,
    data: { ...defaultOnboardingData },
  })
  const mergeOnboardingDataValues = (...sources) => {
    const merged = {}
    Object.keys(defaultOnboardingData).forEach((key) => {
      for (const source of sources) {
        if (!source || typeof source !== 'object') continue
        const nextValue = source[key]
        if (nextValue === undefined || nextValue === null) continue
        if (typeof nextValue === 'string' && !nextValue.trim()) continue
        if (Array.isArray(nextValue) && nextValue.length === 0) continue
        merged[key] = nextValue
      }
    })
    return merged
  }
  const buildOnboardingDataSeed = ({
    settingsProfile = {},
    fallbackEmail = '',
    fallbackFullName = '',
  } = {}) => {
    const normalizedProfile = normalizeSettingsProfile(settingsProfile)
    const normalizedFullName = String(
      normalizedProfile.fullName || fallbackFullName || '',
    ).trim()
    return {
      ...defaultOnboardingData,
      firstName: normalizedProfile.firstName || '',
      lastName: normalizedProfile.lastName || '',
      otherNames: normalizedProfile.otherNames || '',
      email: String(normalizedProfile.email || fallbackEmail || '').trim().toLowerCase(),
      phone: normalizedProfile.phoneLocalNumber || normalizedProfile.phone || '',
      roleInCompany: normalizedProfile.roleInCompany || '',
      address1: normalizedProfile.address1 || normalizedProfile.address || '',
      address2: normalizedProfile.address2 || '',
      city: normalizedProfile.city || '',
      postalCode: normalizedProfile.postalCode || '',
      addressCountry: normalizedProfile.addressCountry || normalizedProfile.country || '',
      businessType: normalizedProfile.businessType || '',
      businessName: normalizedProfile.businessName || '',
      country: normalizedProfile.country || normalizedProfile.addressCountry || '',
      industry: normalizedProfile.industry || '',
      industryOther: normalizedProfile.industryOther || '',
      cacNumber: normalizedProfile.cacNumber || '',
      tin: normalizedProfile.tin || '',
      reportingCycle: normalizedProfile.reportingCycle || '',
      startMonth: normalizedProfile.startMonth || '',
      currency: normalizedProfile.currency || 'NGN',
      language: normalizedProfile.language || 'English',
      primaryContact: normalizedFullName,
    }
  }
  const normalizeOnboardingState = (payload = {}, fallback = null) => {
    const source = payload && typeof payload === 'object' ? payload : {}
    const fallbackState = fallback && typeof fallback === 'object' ? fallback : createDefaultOnboardingState()
    return {
      version: CLIENT_ONBOARDING_STATE_VERSION,
      currentStep: Math.min(
        CLIENT_ONBOARDING_TOTAL_STEPS,
        Math.max(1, Number(source.currentStep ?? fallbackState.currentStep) || 1),
      ),
      completed: source.completed !== undefined
        ? normalizeBooleanish(source.completed, false)
        : normalizeBooleanish(fallbackState.completed, false),
      skipped: source.skipped !== undefined
        ? normalizeBooleanish(source.skipped, false)
        : normalizeBooleanish(fallbackState.skipped, false),
      verificationPending: source.verificationPending !== undefined
        ? normalizeBooleanish(source.verificationPending, false)
        : normalizeBooleanish(fallbackState.verificationPending, false),
      data: {
        ...defaultOnboardingData,
        ...mergeOnboardingDataValues(
          fallbackState.data && typeof fallbackState.data === 'object' ? fallbackState.data : {},
          source.data && typeof source.data === 'object' ? source.data : {},
        ),
      },
    }
  }
  const mergeOnboardingStates = ({
    savedState = null,
    cachedState = null,
    fetchedState = null,
    settingsProfile = {},
    fallbackEmail = '',
    fallbackFullName = '',
  } = {}) => {
    const normalizedSavedState = normalizeOnboardingState(savedState, createDefaultOnboardingState())
    const normalizedCachedState = normalizeOnboardingState(cachedState, normalizedSavedState)
    const normalizedFetchedState = normalizeOnboardingState(fetchedState, normalizedCachedState)
    const seedData = buildOnboardingDataSeed({
      settingsProfile,
      fallbackEmail,
      fallbackFullName,
    })

    const completed = Boolean(
      normalizedSavedState.completed
      || normalizedCachedState.completed
      || normalizedFetchedState.completed
    )
    const skipped = !completed && Boolean(
      normalizedSavedState.skipped
      || normalizedCachedState.skipped
      || normalizedFetchedState.skipped
    )
    const currentStep = completed || skipped
      ? CLIENT_ONBOARDING_TOTAL_STEPS
      : Math.min(
        CLIENT_ONBOARDING_TOTAL_STEPS,
        Math.max(
          1,
          Number(normalizedSavedState.currentStep || 1),
          Number(normalizedCachedState.currentStep || 1),
          Number(normalizedFetchedState.currentStep || 1),
        ),
      )
    const verificationPending = false

    return {
      version: CLIENT_ONBOARDING_STATE_VERSION,
      currentStep,
      completed,
      skipped,
      verificationPending,
      data: {
        ...seedData,
        ...mergeOnboardingDataValues(
          seedData,
          normalizedSavedState.data,
          normalizedCachedState.data,
          normalizedFetchedState.data,
        ),
      },
    }
  }
  const getSavedOnboardingState = (email) => {
    const parsed = getSavedScopedJson('kiaminaOnboardingState', email)
    return mergeOnboardingStates({
      savedState: parsed,
      settingsProfile: getSavedScopedJson('settingsFormData', email) || {},
      fallbackEmail: email,
    })
  }
  const getStoredImpersonationSession = () => {
    try {
      const saved = sessionStorage.getItem(IMPERSONATION_SESSION_STORAGE_KEY)
      if (!saved) return null
      const parsed = JSON.parse(saved)
      if (!parsed?.clientEmail || !parsed?.adminEmail) return null
      return parsed
    } catch {
      return null
    }
  }
  const persistImpersonationSession = (session) => {
    if (!session) {
      sessionStorage.removeItem(IMPERSONATION_SESSION_STORAGE_KEY)
      return
    }
    sessionStorage.setItem(IMPERSONATION_SESSION_STORAGE_KEY, JSON.stringify(session))
  }
  const detectAuthStorageType = () => {
    if (localStorage.getItem('kiaminaAuthUser')) return 'local'
    if (sessionStorage.getItem('kiaminaAuthUser')) return 'session'
    return 'session'
  }
  const getStoredAdminImpersonationSession = () => {
    const candidates = [
      sessionStorage.getItem(ADMIN_IMPERSONATION_SESSION_STORAGE_KEY),
      localStorage.getItem(ADMIN_IMPERSONATION_SESSION_STORAGE_KEY),
    ]
    for (const raw of candidates) {
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw)
        const originalAdminEmail = String(parsed?.originalAdminEmail || '').trim().toLowerCase()
        const impersonatedAdminEmail = String(parsed?.impersonatedAdminEmail || '').trim().toLowerCase()
        if (!originalAdminEmail || !impersonatedAdminEmail) continue
        return {
          originalAdminEmail,
          originalAdminName: parsed?.originalAdminName || 'Super Admin',
          originalAdminLevel: parsed?.originalAdminLevel || ADMIN_LEVELS.SUPER,
          impersonatedAdminEmail,
          impersonatedAdminName: parsed?.impersonatedAdminName || 'Admin User',
          impersonatedAdminLevel: parsed?.impersonatedAdminLevel || ADMIN_LEVELS.AREA_ACCOUNTANT,
          startedAt: Number(parsed?.startedAt || Date.now()),
        }
      } catch {
        // continue
      }
    }
    return null
  }
  const persistAdminImpersonationSession = (session, storageType = 'session') => {
    sessionStorage.removeItem(ADMIN_IMPERSONATION_SESSION_STORAGE_KEY)
    localStorage.removeItem(ADMIN_IMPERSONATION_SESSION_STORAGE_KEY)
    if (!session) return
    const nextRaw = JSON.stringify(session)
    if (storageType === 'local') {
      localStorage.setItem(ADMIN_IMPERSONATION_SESSION_STORAGE_KEY, nextRaw)
      return
    }
    sessionStorage.setItem(ADMIN_IMPERSONATION_SESSION_STORAGE_KEY, nextRaw)
  }

  const initialAuthUser = getStoredAuthUser()
  const initialImpersonationSession = getStoredImpersonationSession()
  const initialAdminImpersonationSession = getStoredAdminImpersonationSession()
  const initialScopedClientEmail = initialImpersonationSession?.clientEmail || initialAuthUser?.email
  const initialDocumentOwner = initialImpersonationSession?.clientName
    || initialAuthUser?.fullName
    || 'Client User'
  const initialClientDocuments = readClientDocuments(initialScopedClientEmail, initialDocumentOwner)
  const initialClientActivityRecords = readClientActivityLogEntries(initialScopedClientEmail)
  const [authMode, setAuthMode] = useState('login')
  const [authUser, setAuthUser] = useState(initialAuthUser)
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(initialAuthUser))
  const [showAuth, setShowAuth] = useState(false)
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [publicSitePage, setPublicSitePage] = useState('home')
  const [isPublicSiteView, setIsPublicSiteView] = useState(() => (
    Boolean(resolvePublicSitePageFromPathname(typeof window === 'undefined' ? '/' : window.location.pathname))
  ))
  const [adminSetupToken, setAdminSetupToken] = useState('')
  const [isAdminSetupRouteActive, setIsAdminSetupRouteActive] = useState(() => (
    normalizeAppPathname(typeof window === 'undefined' ? '/' : window.location.pathname) === '/admin/setup'
  ))
  const [pendingClientTeamInvite, setPendingClientTeamInvite] = useState(() => {
    if (typeof window === 'undefined') return null
    if (normalizeAppPathname(window.location.pathname || '/') !== '/team/setup') return null
    const params = new URLSearchParams(window.location.search || '')
    return buildPendingClientTeamInvitePlaceholder({
      token: params.get('invite') || '',
      companyId: params.get('company') || '',
      email: params.get('email') || '',
    })
  })
  const [clientTeamInviteSetupMessage, setClientTeamInviteSetupMessage] = useState(() => {
    if (typeof window === 'undefined') return ''
    if (normalizeAppPathname(window.location.pathname || '/') !== '/team/setup') return ''
    return 'Checking invite details...'
  })
  const [ownerBootstrapStatus, setOwnerBootstrapStatus] = useState(() => createOwnerBootstrapStatusState())
  const [adminSetupSuccessState, setAdminSetupSuccessState] = useState(null)
  const [impersonationSession, setImpersonationSession] = useState(initialImpersonationSession)
  const [adminImpersonationSession, setAdminImpersonationSession] = useState(initialAdminImpersonationSession)
  const [pendingImpersonationClient, setPendingImpersonationClient] = useState(null)
  const [onboardingState, setOnboardingState] = useState(() => getSavedOnboardingState(initialScopedClientEmail))
  const [settingsProfileSnapshot, setSettingsProfileSnapshot] = useState(() => {
    const onboardingProgress = resolveVerificationProgress({
      onboardingData: getSavedOnboardingState(initialScopedClientEmail).data,
      settingsDocs: readScopedVerificationDocs(initialScopedClientEmail),
      settingsProfile: readScopedSettingsProfile(initialScopedClientEmail),
    })
    return onboardingProgress.profile
  })
  const [verificationDocsSnapshot, setVerificationDocsSnapshot] = useState(() => {
    const onboardingProgress = resolveVerificationProgress({
      onboardingData: getSavedOnboardingState(initialScopedClientEmail).data,
      settingsDocs: readScopedVerificationDocs(initialScopedClientEmail),
      settingsProfile: readScopedSettingsProfile(initialScopedClientEmail),
    })
    return onboardingProgress.docs
  })
  const [accountSettingsSnapshot, setAccountSettingsSnapshot] = useState(() => (
    readScopedAccountSettings(initialScopedClientEmail)
  ))
  const [notificationSettingsSnapshot, setNotificationSettingsSnapshot] = useState(() => (
    readClientNotificationSettings(initialScopedClientEmail)
  ))
  const [otpChallenge, setOtpChallenge] = useState(null)
  const [pendingGoogleSocialAuth, setPendingGoogleSocialAuth] = useState(null)
  const [passwordResetEmail, setPasswordResetEmail] = useState('')
  const [emailVerificationEmail, setEmailVerificationEmail] = useState('')
  const [activePage, setActivePage] = useState(() => getDefaultPageForRole(initialAuthUser?.role))
  const [activeFolderRoute, setActiveFolderRoute] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [modalInitialCategory, setModalInitialCategory] = useState('expenses')
  const [expenseDocuments, setExpenseDocuments] = useState(() => ensureFolderStructuredRecords(initialClientDocuments.expenses, 'expenses'))
  const [salesDocuments, setSalesDocuments] = useState(() => ensureFolderStructuredRecords(initialClientDocuments.sales, 'sales'))
  const [bankStatementDocuments, setBankStatementDocuments] = useState(() => ensureFolderStructuredRecords(initialClientDocuments.bankStatements, 'bankStatements'))
  const [expenseClassOptions, setExpenseClassOptions] = useState(() => normalizeClassOptions(initialClientDocuments.expenseClassOptions))
  const [salesClassOptions, setSalesClassOptions] = useState(() => normalizeClassOptions(initialClientDocuments.salesClassOptions))
  const [uploadHistoryRecords, setUploadHistoryRecords] = useState(initialClientDocuments.uploadHistory)
  const [resolvedDocumentRecords, setResolvedDocumentRecords] = useState(initialClientDocuments.resolvedDocuments)
  const [clientActivityRecords, setClientActivityRecords] = useState(initialClientActivityRecords)
  const [toast, setToast] = useState(null)
  const [profilePhoto, setProfilePhoto] = useState(() => getSavedProfilePhoto(initialScopedClientEmail))
  const [companyLogo, setCompanyLogo] = useState(() => getSavedCompanyLogo(initialScopedClientEmail))
  const [companyName, setCompanyName] = useState(() => getSavedCompanyName(initialScopedClientEmail))
  const [clientDashboardOverview, setClientDashboardOverview] = useState(null)
  const [clientFirstName, setClientFirstName] = useState(() => {
    const fallbackName = initialImpersonationSession?.clientName?.trim()?.split(/\s+/)?.[0]
      || initialAuthUser?.fullName?.trim()?.split(/\s+/)?.[0]
      || 'Client'
    return getSavedClientFirstName(initialScopedClientEmail, fallbackName)
  })
  
  const [userNotifications, setUserNotifications] = useState([])
  const [dashboardSearchTerm, setDashboardSearchTerm] = useState('')
  const [dashboardSearchResults, setDashboardSearchResults] = useState([])
  const [dashboardSearchState, setDashboardSearchState] = useState('idle')
  const [isDashboardBootstrapLoading, setIsDashboardBootstrapLoading] = useState(
    () => Boolean(initialAuthUser && isPageReloadNavigation()),
  )
  const [isSlowRuntimeOverlayVisible, setIsSlowRuntimeOverlayVisible] = useState(false)
  const [slowRuntimeOverlayMessage, setSlowRuntimeOverlayMessage] = useState('Please wait...')
  const dashboardSearchRequestRef = useRef(0)
  const dashboardSearchTimeoutRef = useRef(null)
  const dashboardBootstrapTimerRef = useRef(null)
  const deliveredBriefNotificationIdsRef = useRef(new Set())
  const verificationLockToastAtRef = useRef(0)
  const slowRuntimeRevealTimerRef = useRef(null)
  const slowRuntimeHideTimerRef = useRef(null)
  const slowRuntimeOperationCountRef = useRef(0)
  const slowRuntimeMinVisibleUntilRef = useRef(0)
  const slowRuntimeMessageRef = useRef('Please wait...')
  const slowRuntimeVisibleRef = useRef(false)
  const clientWorkspaceSyncSignaturesRef = useRef(new Map())
  const clientProfileSyncSignaturesRef = useRef(new Map())
  
  const currentUserRole = normalizeRole(authUser?.role, authUser?.email || '')
  const isAdminView = currentUserRole === 'admin'
  const isAdminImpersonationActive = Boolean(
    adminImpersonationSession
    && String(authUser?.email || '').trim().toLowerCase() === String(adminImpersonationSession.impersonatedAdminEmail || '').trim().toLowerCase(),
  )
  useEffect(() => {
    if (!adminImpersonationSession) return
    const currentEmail = String(authUser?.email || '').trim().toLowerCase()
    const impersonatedEmail = String(adminImpersonationSession.impersonatedAdminEmail || '').trim().toLowerCase()
    if (!currentEmail || currentEmail !== impersonatedEmail) {
      setAdminImpersonationSession(null)
      persistAdminImpersonationSession(null)
    }
  }, [adminImpersonationSession, authUser?.email])
  const dashboardRecords = useMemo(() => ([
    ...flattenFolderFilesForDashboard(expenseDocuments, 'expenses'),
    ...flattenFolderFilesForDashboard(salesDocuments, 'sales'),
    ...flattenFolderFilesForDashboard(bankStatementDocuments, 'bank-statements'),
  ]), [expenseDocuments, salesDocuments, bankStatementDocuments])
  const dashboardSearchEntries = useMemo(() => {
    const entries = []
    const seen = new Set()
    const pushEntry = ({
      id,
      label,
      description = '',
      keywords = [],
      pageId = 'dashboard',
      categoryId = '',
      folderId = '',
    }) => {
      const normalizedLabel = String(label || '').trim()
      if (!normalizedLabel) return
      const normalizedDescription = String(description || '').trim()
      const normalizedCategoryId = String(categoryId || '').trim()
      const normalizedFolderId = String(folderId || '').trim()
      const dedupeKey = String(id || `${pageId}:${normalizedCategoryId}:${normalizedFolderId}:${normalizedLabel}`).toLowerCase()
      if (seen.has(dedupeKey)) return
      seen.add(dedupeKey)
      const searchValues = [
        normalizedLabel,
        normalizedDescription,
        ...(Array.isArray(keywords) ? keywords : []),
      ]
      entries.push({
        id: dedupeKey,
        label: normalizedLabel,
        description: normalizedDescription,
        pageId: APP_PAGE_IDS.includes(pageId) ? pageId : 'dashboard',
        categoryId: normalizedCategoryId,
        folderId: normalizedFolderId,
        searchText: searchValues
          .map((value) => String(value || '').trim().toLowerCase())
          .filter(Boolean)
          .join(' '),
      })
    }

    const appendFolderEntries = (rows = [], categoryId = 'expenses') => {
      const categoryLabel = getCategoryLabelFromPageId(categoryId)
      ;(Array.isArray(rows) ? rows : [])
        .filter((row) => row?.isFolder)
        .forEach((folder) => {
          pushEntry({
            id: `folder-${categoryId}-${folder.id || folder.folderName || ''}`,
            label: folder.folderName || folder.id || `${categoryLabel} Folder`,
            description: `${categoryLabel} folder`,
            keywords: [folder.id, folder.user, categoryLabel, 'folder'],
            pageId: categoryId,
            categoryId,
            folderId: folder.id || '',
          })
        })
    }

    appendFolderEntries(expenseDocuments, 'expenses')
    appendFolderEntries(salesDocuments, 'sales')
    appendFolderEntries(bankStatementDocuments, 'bank-statements')

    dashboardRecords.forEach((record, index) => {
      const categoryId = record.categoryId || resolveCategoryIdFromHistoryLabel(record.category || '')
      const categoryLabel = getCategoryLabelFromPageId(categoryId)
      pushEntry({
        id: `file-${categoryId}-${record.fileId || record.id || index}`,
        label: record.filename || record.fileId || `Document ${index + 1}`,
        description: `${categoryLabel}${record.folderName ? ` / ${record.folderName}` : ''}`,
        keywords: [
          record.fileId,
          record.folderName,
          record.folderId,
          record.category,
          record.class,
          record.status,
          record.extension || record.type,
          record.user,
          categoryLabel,
          'file',
        ],
        pageId: categoryId,
        categoryId,
        folderId: record.folderId || '',
      })
    })

    ;(Array.isArray(uploadHistoryRecords) ? uploadHistoryRecords : []).forEach((item, index) => {
      if (!item || item.isFolder) return
      const categoryId = item.categoryId || resolveCategoryIdFromHistoryLabel(item.category || '')
      const categoryLabel = getCategoryLabelFromPageId(categoryId)
      const shouldOpenFolder = Boolean(categoryId && item.folderId)
      pushEntry({
        id: `upload-${item.id || `${categoryId}-${index}`}`,
        label: item.filename || item.fileId || `Upload ${index + 1}`,
        description: shouldOpenFolder ? `Upload History / ${categoryLabel}` : 'Upload History',
        keywords: [
          item.fileId,
          item.category,
          item.type,
          item.status,
          item.user,
          categoryLabel,
          'upload',
          'history',
        ],
        pageId: shouldOpenFolder ? categoryId : 'upload-history',
        categoryId: shouldOpenFolder ? categoryId : '',
        folderId: shouldOpenFolder ? item.folderId : '',
      })
    })

    ;(Array.isArray(resolvedDocumentRecords) ? resolvedDocumentRecords : []).forEach((item, index) => {
      if (!item) return
      pushEntry({
        id: `resolved-${item.id || `${item.fileId || index}`}`,
        label: item.title || item.filename || `Resolved Document ${index + 1}`,
        description: 'Resolved Documents',
        keywords: [
          item.filename,
          item.fileId,
          item.ticketReference,
          item.signatureName,
          item.sentByName,
          'resolved',
          'document',
        ],
        pageId: 'resolved-documents',
      })
    })

    ;(Array.isArray(clientActivityRecords) ? clientActivityRecords : []).forEach((item, index) => {
      pushEntry({
        id: `activity-${item.id || index}`,
        label: item.action || item.details || `Activity ${index + 1}`,
        description: 'Recent Activities',
        keywords: [
          item.details,
          item.actorName,
          item.actorRole,
          item.timestamp,
          'activity',
          'recent',
        ],
        pageId: 'recent-activities',
      })
    })

    return entries
  }, [
    dashboardRecords,
    expenseDocuments,
    salesDocuments,
    bankStatementDocuments,
    uploadHistoryRecords,
    resolvedDocumentRecords,
    clientActivityRecords,
  ])
  const previousClientStatusSnapshotRef = useRef(null)

  const isImpersonatingClient = Boolean(
    isAuthenticated
      && isAdminView
      && impersonationSession?.clientEmail
      && impersonationSession?.adminEmail?.toLowerCase() === (authUser?.email || '').toLowerCase(),
  )
  const scopedClientEmail = isImpersonatingClient
    ? impersonationSession.clientEmail
    : authUser?.email
  const normalizedScopedClientEmail = (scopedClientEmail || '').trim().toLowerCase()
  const clientTeamAffiliation = isImpersonatingClient
    ? null
    : buildClientTeamAffiliationState({
        authUser,
        settingsProfile: settingsProfileSnapshot,
        onboardingData: onboardingState.data,
        companyName,
      })
  const scopedClientUid = String(
    isImpersonatingClient
      ? (
        impersonationSession?.clientUid
        || getSavedAccounts().find((account) => (
          String(account?.email || '').trim().toLowerCase() === normalizedScopedClientEmail
        ))?.uid
        || ''
      )
      : (authUser?.uid || ''),
  ).trim()
  const verificationProgress = useMemo(() => (
    resolveVerificationProgress({
      onboardingData: onboardingState.data,
      settingsDocs: verificationDocsSnapshot,
      settingsProfile: settingsProfileSnapshot,
    })
  ), [onboardingState.data, settingsProfileSnapshot, verificationDocsSnapshot])
  const verificationStepsCompleted = verificationProgress.stepsCompleted
  const onboardingHasBeenDismissed = Boolean(onboardingState.completed || onboardingState.skipped)
  const scopedClientAccountStatus = normalizedScopedClientEmail
    ? (
      getSavedAccounts().find((account) => (
        account.email?.trim()?.toLowerCase() === normalizedScopedClientEmail
      ))?.status || ''
    )
    : ''
  const dashboardVerificationState = resolveClientVerificationState({
    email: normalizedScopedClientEmail,
    verificationPending: Boolean(onboardingState.verificationPending),
    accountStatus: isImpersonatingClient
      ? scopedClientAccountStatus
      : (authUser?.status || scopedClientAccountStatus),
    verificationStepsCompleted,
  })
  const scopedClientStatusControl = readScopedClientStatusControl(normalizedScopedClientEmail)
  const normalizeBooleanFlag = (value) => {
    if (value === true) return true
    const normalized = String(value || '').trim().toLowerCase()
    return normalized === 'true' || normalized === 'yes' || normalized === '1'
  }
  const hasIsoTimestamp = (value) => Number.isFinite(Date.parse(value || ''))
  /*
  const identityVerificationApprovedByAdmin = Boolean(
    verificationProgress.identityStepCompleted
    || normalizeBooleanFlag(scopedClientStatusControl?.identityVerificationApproved)
    || hasIsoTimestamp(scopedClientStatusControl?.identityVerificationApprovedAt)
    || (
      String(dashboardVerificationState || '').toLowerCase() === 'verified'
      && verificationProgress.identityStepCompleted
    ),
  )
  */
  const businessVerificationApprovedByAdmin = Boolean(
    normalizeBooleanFlag(scopedClientStatusControl?.businessVerificationApproved)
    || hasIsoTimestamp(scopedClientStatusControl?.businessVerificationApprovedAt)
    || String(dashboardVerificationState || '').toLowerCase() === 'verified',
  )
  const isBusinessVerificationComplete = true
  // Identity verification is also bypassed in MVP mode.
  const isIdentityVerificationComplete = true
  const isClientVerificationLocked = false

  const getNotificationPageFromRecord = (record = {}) => {
    if (record.categoryId) return record.categoryId
    const normalizedCategory = (record.category || '').toLowerCase()
    if (normalizedCategory.includes('sales')) return 'sales'
    if (normalizedCategory.includes('bank')) return 'bank-statements'
    return 'expenses'
  }

  const resolveNotificationDocumentLocation = (notification = {}) => {
    const normalizeKey = (value = '') => String(value || '').trim().toLowerCase()
    const normalizedCategory = String(notification?.categoryId || notification?.linkPage || '').trim()
    const normalizedFolderId = String(notification?.folderId || '').trim()
    const normalizedFileId = normalizeKey(notification?.fileId || '')
    const normalizedDocumentId = normalizeKey(notification?.documentId || '')

    if (CLIENT_DOCUMENT_PAGE_IDS.includes(normalizedCategory) && normalizedFolderId) {
      return {
        categoryId: normalizedCategory,
        folderId: normalizedFolderId,
      }
    }

    const matchesNotificationToRecord = (record = {}) => {
      const recordFileId = normalizeKey(record?.fileId || '')
      const recordId = normalizeKey(record?.id || '')
      if (normalizedFileId && recordFileId && normalizedFileId === recordFileId) return true
      if (normalizedDocumentId && recordId && normalizedDocumentId === recordId) return true
      return false
    }

    const dashboardMatch = dashboardRecords.find((record) => (
      !record?.isFolder && matchesNotificationToRecord(record)
    ))
    if (dashboardMatch) {
      return {
        categoryId: String(dashboardMatch.categoryId || getNotificationPageFromRecord(dashboardMatch)).trim(),
        folderId: String(dashboardMatch.folderId || '').trim(),
      }
    }

    const uploadHistoryMatch = (Array.isArray(uploadHistoryRecords) ? uploadHistoryRecords : []).find((record) => (
      !record?.isFolder && matchesNotificationToRecord(record)
    ))
    if (uploadHistoryMatch) {
      return {
        categoryId: String(
          uploadHistoryMatch.categoryId
          || resolveCategoryIdFromHistoryLabel(uploadHistoryMatch.category || ''),
        ).trim(),
        folderId: String(uploadHistoryMatch.folderId || '').trim(),
      }
    }

    if (normalizedFolderId) {
      const folderMatch = dashboardRecords.find((record) => String(record?.folderId || '').trim() === normalizedFolderId)
      if (folderMatch) {
        return {
          categoryId: String(folderMatch.categoryId || getNotificationPageFromRecord(folderMatch)).trim(),
          folderId: normalizedFolderId,
        }
      }
    }

    return {
      categoryId: '',
      folderId: '',
    }
  }

  const resolveNotificationLinkPage = (notification = {}) => {
    const rawLink = String(notification?.link || '').trim()
    if (!rawLink || typeof window === 'undefined') return ''

    try {
      const url = new URL(rawLink, window.location.origin)
      const normalizedPath = normalizeAppPathname(url.pathname || '/')
      if (normalizedPath === '/' || normalizedPath === '/dashboard') return 'dashboard'
      const pageToken = normalizedPath.replace(/^\/+/, '').split('/')[0] || ''
      return APP_PAGE_IDS.includes(pageToken) ? pageToken : ''
    } catch {
      return ''
    }
  }

  const shouldRouteNotificationToSupport = (notification = {}) => {
    const normalizedType = String(notification?.type || '').trim().toLowerCase()
    const normalizedLinkPage = String(notification?.linkPage || '').trim().toLowerCase()
    const normalizedCategoryId = String(notification?.categoryId || '').trim().toLowerCase()
    const normalizedLink = String(notification?.link || '').trim().toLowerCase()
    const linkedPage = resolveNotificationLinkPage(notification)
    return Boolean(
      String(notification?.ticketId || '').trim()
      || normalizedLinkPage === 'support'
      || normalizedCategoryId === 'support'
      || linkedPage === 'support'
      || normalizedLink.includes('/support')
      || normalizedType === 'support'
      || normalizedType === 'chatbot'
      || normalizedType.startsWith('support.')
      || normalizedType.startsWith('chatbot.')
    )
  }

  useEffect(() => {
    if (!isAuthenticated || isAdminView) {
      previousClientStatusSnapshotRef.current = null
      return
    }

    const normalizedVerificationStatus = String(scopedClientStatusControl?.verificationStatus || '').trim().toLowerCase()
    const normalizedAccountStatus = String(authUser?.status || scopedClientAccountStatus || '').trim().toLowerCase()
    const isSuspended = normalizedAccountStatus === 'suspended'
      || normalizedVerificationStatus.includes('suspended')
    const statusSnapshot = {
      isSuspended,
      suspensionMessage: String(scopedClientStatusControl?.suspensionMessage || '').trim(),
    }

    const previousSnapshot = previousClientStatusSnapshotRef.current
    if (!previousSnapshot) {
      previousClientStatusSnapshotRef.current = statusSnapshot
      return
    }

    const timestamp = new Date().toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    const nextNotifications = []

    if (!previousSnapshot.isSuspended && statusSnapshot.isSuspended) {
      nextNotifications.push({
        id: `N-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'suspended',
        message: statusSnapshot.suspensionMessage
          ? `Account suspended: ${statusSnapshot.suspensionMessage}`
          : 'Account suspended. Contact support for details.',
        timestamp,
        read: false,
        priority: 'critical',
        linkPage: 'settings',
      })
    }

    if (nextNotifications.length > 0) {
      const clientNotificationSettings = readClientNotificationSettings(normalizedScopedClientEmail)
      const filteredNotifications = nextNotifications.filter((entry) => (
        isClientNotificationEnabled(entry, clientNotificationSettings)
      ))
      if (filteredNotifications.length > 0) {
        setUserNotifications((prev) => [...filteredNotifications, ...prev].slice(0, 80))
        if (isClientNotificationSoundEnabled(clientNotificationSettings)) {
          playClientNotificationSound()
        }
      }
    }

    previousClientStatusSnapshotRef.current = statusSnapshot
  }, [
    authUser?.status,
    isAdminView,
    isAuthenticated,
    scopedClientAccountStatus,
    scopedClientStatusControl?.suspensionMessage,
    scopedClientStatusControl?.verificationStatus,
    normalizedScopedClientEmail,
  ])

  const getResolvedCurrentAdminAccount = () => {
    if (!isAuthenticated || !isAdminView || !authUser?.email) return null
    const accounts = getSavedAccounts()
    const match = accounts.find((account) => account.email.toLowerCase() === authUser.email.toLowerCase())
    if (match) return normalizeAdminAccount(match)
      return normalizeAdminAccount({
        fullName: authUser.fullName,
        email: authUser.email,
        role: 'admin',
        adminLevel: authUser.adminLevel || deriveAdminLevelFromBackendRole(authUser.role),
        adminPermissions: Array.isArray(authUser.adminPermissions) ? authUser.adminPermissions : [],
        adminSecurityPreferences: authUser.adminSecurityPreferences && typeof authUser.adminSecurityPreferences === 'object'
          ? authUser.adminSecurityPreferences
          : undefined,
        roleInCompany: authUser.roleInCompany || '',
        department: authUser.department || '',
        phoneNumber: authUser.phoneNumber || '',
        mustChangePassword: Boolean(authUser.mustChangePassword),
        status: authUser.status || 'active',
    })
  }
  const currentAdminAccount = getResolvedCurrentAdminAccount()
  const adminSystemSettings = getAdminSystemSettings()
  const impersonationEnabled = adminSystemSettings.impersonationEnabled !== false
  const canImpersonateClients = Boolean(
    currentAdminAccount && (
      canImpersonateForAdminLevel(currentAdminAccount.adminLevel)
      || hasAdminPermission(currentAdminAccount, 'impersonate_clients')
    ),
  )
  const getCurrentAdminLogContext = () => ({
    adminName: authUser?.fullName || currentAdminAccount?.fullName || 'Admin User',
    adminEmail: String(authUser?.email || currentAdminAccount?.email || '').trim().toLowerCase(),
    adminLevel: currentAdminAccount?.adminLevel || ADMIN_LEVELS.SUPER,
    impersonatedBy: isAdminImpersonationActive
      ? String(adminImpersonationSession?.originalAdminEmail || '').trim().toLowerCase()
      : '',
  })
  const logAdminActivity = (entry = {}) => {
    appendAdminActivityLog({
      ...getCurrentAdminLogContext(),
      ...entry,
    })
  }

  const touchImpersonationActivity = () => {
    if (isImpersonatingClient) {
      setImpersonationSession((prev) => {
        if (!prev) return prev
        const next = { ...prev, lastActivityAt: Date.now() }
        persistImpersonationSession(next)
        return next
      })
    }
  }

  const showVerificationGateToast = (message = 'Verify your account to continue. Redirecting to profile settings.') => {
    const now = Date.now()
    if (now - verificationLockToastAtRef.current < 1400) return
    verificationLockToastAtRef.current = now
    showToast('error', message)
  }

  const routeClientToVerificationSettings = ({
    replace = false,
    section = 'user-profile',
    toastMessage = 'Verify your account to continue. Redirecting to profile settings.',
  } = {}) => {
    try {
      sessionStorage.setItem(CLIENT_SETTINGS_REDIRECT_SECTION_KEY, section || 'user-profile')
    } catch {
      // no-op
    }
    setActivePage('settings')
    setActiveFolderRoute(null)
    setIsMobileSidebarOpen(false)
    setIsPublicSiteView(false)
    try {
      if (replace) history.replaceState({}, '', '/settings')
      else history.pushState({}, '', '/settings')
    } catch {
      // ignore
    }
    showVerificationGateToast(toastMessage)
  }

  const shouldBlockClientNavigationByVerification = (targetPage = '') => (
    isClientVerificationLocked && String(targetPage || '').trim() !== 'settings'
  )

  // Navigation helpers: keep `activePage` and URL in sync without adding a router
  const handleSetActivePage = (page, { replace = false } = {}) => {
    if (shouldBlockClientNavigationByVerification(page)) {
      routeClientToVerificationSettings({ replace })
      return
    }
    touchImpersonationActivity()
    setActivePage(page)
    setActiveFolderRoute(null)
    setIsMobileSidebarOpen(false)
    setIsPublicSiteView(false)
    const path = page === 'dashboard' ? '/dashboard' : `/${page}`
    try {
      if (replace) history.replaceState({}, '', path)
      else history.pushState({}, '', path)
    } catch {
      // ignore
    }
  }

  const handleOpenFolderRoute = (category, folderId, { replace = false } = {}) => {
    if (!category || !folderId) return
    if (shouldBlockClientNavigationByVerification(category)) {
      routeClientToVerificationSettings({ replace })
      return
    }
    touchImpersonationActivity()
    setActivePage(category)
    setActiveFolderRoute({ category, folderId })
    setIsMobileSidebarOpen(false)
    setIsPublicSiteView(false)
    const encodedId = encodeURIComponent(folderId)
    const path = `/${category}/folder/${encodedId}`
    try {
      if (replace) history.replaceState({}, '', path)
      else history.pushState({}, '', path)
    } catch {
      // ignore
    }
  }

  const beginSlowRuntimeWatch = (message = 'Please wait...') => {
    const resolvedMessage = String(message || '').trim() || 'Please wait...'
    slowRuntimeMessageRef.current = resolvedMessage
    setSlowRuntimeOverlayMessage(resolvedMessage)

    slowRuntimeOperationCountRef.current += 1
    if (slowRuntimeHideTimerRef.current) {
      window.clearTimeout(slowRuntimeHideTimerRef.current)
      slowRuntimeHideTimerRef.current = null
    }

    if (!slowRuntimeVisibleRef.current && !slowRuntimeRevealTimerRef.current) {
      const revealDelayMs = getNetworkAwareDurationMs('slow-threshold')
      slowRuntimeRevealTimerRef.current = window.setTimeout(() => {
        slowRuntimeRevealTimerRef.current = null
        if (slowRuntimeOperationCountRef.current <= 0) return
        slowRuntimeMinVisibleUntilRef.current = Date.now() + getNetworkAwareDurationMs('runtime-min-visible')
        setSlowRuntimeOverlayMessage(slowRuntimeMessageRef.current)
        setIsSlowRuntimeOverlayVisible(true)
      }, revealDelayMs)
    }

    return () => {
      slowRuntimeOperationCountRef.current = Math.max(0, slowRuntimeOperationCountRef.current - 1)
      if (slowRuntimeOperationCountRef.current > 0) return

      if (slowRuntimeRevealTimerRef.current) {
        window.clearTimeout(slowRuntimeRevealTimerRef.current)
        slowRuntimeRevealTimerRef.current = null
      }

      const hideOverlay = () => {
        slowRuntimeMinVisibleUntilRef.current = 0
        setIsSlowRuntimeOverlayVisible(false)
      }

      if (!slowRuntimeVisibleRef.current) {
        hideOverlay()
        return
      }

      const remainingVisibleMs = slowRuntimeMinVisibleUntilRef.current - Date.now()
      if (remainingVisibleMs <= 0) {
        hideOverlay()
        return
      }

      slowRuntimeHideTimerRef.current = window.setTimeout(() => {
        slowRuntimeHideTimerRef.current = null
        hideOverlay()
      }, remainingVisibleMs)
    }
  }

  const runWithSlowRuntimeWatch = async (work, message = 'Please wait...') => {
    const stopWatching = beginSlowRuntimeWatch(message)
    try {
      return await work()
    } finally {
      stopWatching()
    }
  }

  const dismissDashboardSearchFeedback = () => {
    if (dashboardSearchTimeoutRef.current) {
      window.clearTimeout(dashboardSearchTimeoutRef.current)
      dashboardSearchTimeoutRef.current = null
    }
    setDashboardSearchState('idle')
    setDashboardSearchResults([])
  }

  const runDashboardSearch = (value = dashboardSearchTerm) => {
    const nextTerm = String(value || '')
    const normalizedQuery = nextTerm.trim().toLowerCase()
    setDashboardSearchTerm(nextTerm)

    if (!normalizedQuery) {
      dismissDashboardSearchFeedback()
      return
    }

    if (dashboardSearchTimeoutRef.current) {
      window.clearTimeout(dashboardSearchTimeoutRef.current)
      dashboardSearchTimeoutRef.current = null
    }

    const requestId = dashboardSearchRequestRef.current + 1
    dashboardSearchRequestRef.current = requestId
    setDashboardSearchState('loading')
    setDashboardSearchResults([])
    const searchDelayMs = getNetworkAwareDurationMs('search')

    dashboardSearchTimeoutRef.current = window.setTimeout(() => {
      if (dashboardSearchRequestRef.current !== requestId) return

      const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean)
      const matches = dashboardSearchEntries
        .map((entry) => {
          const label = entry.label.toLowerCase()
          const matchesAllTokens = queryTokens.every((token) => entry.searchText.includes(token))
          if (!matchesAllTokens) return null

          let score = 0
          if (label === normalizedQuery) score += 260
          if (label.startsWith(normalizedQuery)) score += 160
          if (label.includes(normalizedQuery)) score += 90
          queryTokens.forEach((token) => {
            if (label.startsWith(token)) score += 30
            else if (label.includes(token)) score += 12
          })
          score -= Math.min(36, Math.floor(label.length / 5))
          return {
            ...entry,
            score,
          }
        })
        .filter(Boolean)
        .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
        .slice(0, 8)
        .map(({ score, ...entry }) => entry)

      if (matches.length === 0) {
        setDashboardSearchResults([])
        setDashboardSearchState('empty')
        return
      }

      setDashboardSearchResults(matches)
      setDashboardSearchState('ready')
    }, searchDelayMs)
  }

  const handleDashboardSearchTermChange = (value = '') => {
    runDashboardSearch(value)
  }

  const handleDashboardSearchSubmit = (value = dashboardSearchTerm) => {
    runDashboardSearch(value)
  }

  const handleDashboardSearchResultSelect = (result) => {
    if (!result || typeof result !== 'object') return

    dismissDashboardSearchFeedback()
    setDashboardSearchTerm(String(result.label || dashboardSearchTerm || '').trim())

    const categoryId = String(result.categoryId || '').trim()
    const folderId = String(result.folderId || '').trim()
    if (categoryId && folderId) {
      handleOpenFolderRoute(categoryId, folderId)
      return
    }

    const targetPage = APP_PAGE_IDS.includes(result.pageId) ? result.pageId : 'dashboard'
    handleSetActivePage(targetPage)
  }

  useEffect(() => {
    if (authMode !== 'signup' && pendingGoogleSocialAuth) {
      setPendingGoogleSocialAuth(null)
    }
  }, [authMode, pendingGoogleSocialAuth])

  const navigateToPublicSitePage = (page = 'home', { replace = false } = {}) => {
    const resolvedPage = PUBLIC_SITE_PAGE_IDS.includes(page) ? page : 'home'
    const nextPath = resolvedPage === 'home' ? '/' : `/${resolvedPage}`
    setShowAuth(false)
    setShowAdminLogin(false)
    setIsPublicSiteView(true)
    setPendingGoogleSocialAuth(null)
    setEmailVerificationEmail('')
    setPasswordResetEmail('')
    setAdminSetupToken('')
    setIsAdminSetupRouteActive(false)
    setPendingClientTeamInvite(null)
    setClientTeamInviteSetupMessage('')
    setActiveFolderRoute(null)
    setPublicSitePage(resolvedPage)
    try {
      if (replace) history.replaceState({}, '', nextPath)
      else history.pushState({}, '', nextPath)
    } catch {}
  }

  const navigateToAuth = (mode = 'login', { replace = false } = {}) => {
    const normalizedMode = ['login', 'signup', 'forgot-password', 'reset-password', 'email-verification'].includes(String(mode || '').trim().toLowerCase())
      ? String(mode || '').trim().toLowerCase()
      : 'login'
    setAuthMode(normalizedMode)
    setShowAuth(true)
    setShowAdminLogin(false)
    setIsPublicSiteView(false)
    if (normalizedMode !== 'signup') {
      setPendingGoogleSocialAuth(null)
    }
    if (normalizedMode !== 'reset-password') {
      setPasswordResetEmail('')
    }
    if (normalizedMode !== 'email-verification') {
      setEmailVerificationEmail('')
    }
    setAdminSetupSuccessState(null)
    setAdminSetupToken('')
    setIsAdminSetupRouteActive(false)
    setPendingClientTeamInvite(null)
    setClientTeamInviteSetupMessage('')
    const resetEmailQuery = normalizedMode === 'reset-password' && passwordResetEmail
      ? `&email=${encodeURIComponent(String(passwordResetEmail || '').trim().toLowerCase())}`
      : ''
    const verificationEmailQuery = normalizedMode === 'email-verification' && emailVerificationEmail
      ? `&email=${encodeURIComponent(String(emailVerificationEmail || '').trim().toLowerCase())}`
      : ''
    const authPath = normalizedMode === 'signup'
      ? '/signup'
      : normalizedMode === 'forgot-password'
        ? '/login?mode=forgot-password'
        : normalizedMode === 'reset-password'
          ? `/login?mode=reset-password${resetEmailQuery}`
          : normalizedMode === 'email-verification'
            ? `/login?mode=email-verification${verificationEmailQuery}`
          : '/login'
    try {
      if (replace) history.replaceState({}, '', authPath)
      else history.pushState({}, '', authPath)
    } catch {}
  }

  const handlePublicGetStarted = ({ replace = false } = {}) => {
    if (isAuthenticated) {
      const destination = getDefaultPageForRole(authUser?.role || currentUserRole || 'client')
      handleSetActivePage(destination, { replace })
      return
    }
    navigateToAuth('signup', { replace })
  }

  const navigateToAdminLogin = ({ replace = false } = {}) => {
    setAuthMode('login')
    setShowAuth(false)
    setShowAdminLogin(true)
    setIsPublicSiteView(false)
    setPendingGoogleSocialAuth(null)
    setEmailVerificationEmail('')
    setPasswordResetEmail('')
    setAdminSetupSuccessState(null)
    setAdminSetupToken('')
    setIsAdminSetupRouteActive(false)
    setPendingClientTeamInvite(null)
    setClientTeamInviteSetupMessage('')
    try {
      if (replace) history.replaceState({}, '', '/admin/login')
      else history.pushState({}, '', '/admin/login')
    } catch {}
  }

  const navigateToAdminSetup = ({ replace = false, inviteToken = '' } = {}) => {
    const normalizedInviteToken = String(inviteToken || '').trim()
    setAuthMode('login')
    setShowAuth(false)
    setShowAdminLogin(false)
    setIsPublicSiteView(false)
    setPendingGoogleSocialAuth(null)
    setEmailVerificationEmail('')
    setPasswordResetEmail('')
    setAdminSetupSuccessState(null)
    setAdminSetupToken(normalizedInviteToken)
    setIsAdminSetupRouteActive(true)
    setPendingClientTeamInvite(null)
    setClientTeamInviteSetupMessage('')
    try {
      const nextPath = normalizedInviteToken
        ? `/admin/setup?invite=${encodeURIComponent(normalizedInviteToken)}`
        : '/admin/setup'
      if (replace) history.replaceState({}, '', nextPath)
      else history.pushState({}, '', nextPath)
    } catch {}
  }

  const handleContinueToAdminFromSetup = () => {
    setAdminSetupSuccessState(null)
    setShowAuth(false)
    setShowAdminLogin(false)
    setIsPublicSiteView(false)
    setAdminSetupToken('')
    setIsAdminSetupRouteActive(false)
    setPendingClientTeamInvite(null)
    setClientTeamInviteSetupMessage('')
    setPublicSitePage('home')
    setActiveFolderRoute(null)
    setActivePage(ADMIN_DEFAULT_PAGE)
    try {
      history.replaceState({}, '', `/${ADMIN_DEFAULT_PAGE}`)
    } catch {}
  }

  const handleReturnToAdminLoginFromSetup = async () => {
    setAdminSetupSuccessState(null)
    setPendingClientTeamInvite(null)
    setClientTeamInviteSetupMessage('')
    if (isAuthenticated) {
      try {
        const activeSessionId = String(getApiSessionId() || '').trim()
        await apiFetch('/api/auth/logout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: 'admin-setup-login-redirect',
            ...(activeSessionId ? { sessionId: activeSessionId } : {}),
          }),
        })
      } catch {
        // Best-effort remote logout; local cleanup continues.
      }
      setIsAuthenticated(false)
      setAuthUser(null)
      setImpersonationSession(null)
      setAdminImpersonationSession(null)
      setPendingGoogleSocialAuth(null)
      setPendingImpersonationClient(null)
      persistImpersonationSession(null)
      persistAdminImpersonationSession(null)
      sessionStorage.removeItem('kiaminaAuthUser')
      localStorage.removeItem('kiaminaAuthUser')
      clearApiAccessToken()
      clearApiSessionId()
      await clearFirebaseAuthSession()
    }
    navigateToAdminLogin({ replace: true })
  }

  useEffect(() => {
    slowRuntimeVisibleRef.current = isSlowRuntimeOverlayVisible
  }, [isSlowRuntimeOverlayVisible])

  useEffect(() => {
    if (dashboardBootstrapTimerRef.current) {
      window.clearTimeout(dashboardBootstrapTimerRef.current)
      dashboardBootstrapTimerRef.current = null
    }

    const shouldShowBootstrapLoader = Boolean(
      isAuthenticated
      && !showAuth
      && !showAdminLogin
      && !isAdminSetupRouteActive
      && isPageReloadNavigation(),
    )

    if (!shouldShowBootstrapLoader) {
      setIsDashboardBootstrapLoading(false)
      return
    }

    const connectionSnapshot = getNetworkConnectionSnapshot()
    const isSlowConnection = (
      connectionSnapshot.saveData
      || connectionSnapshot.effectiveType === 'slow-2g'
      || connectionSnapshot.effectiveType === '2g'
      || connectionSnapshot.effectiveType === '3g'
      || (Number(connectionSnapshot.downlink || 0) > 0 && Number(connectionSnapshot.downlink || 0) < 2)
      || Number(connectionSnapshot.rtt || 0) > 320
    )

    if (!isSlowConnection) {
      setIsDashboardBootstrapLoading(false)
      return
    }

    setIsDashboardBootstrapLoading(true)
    dashboardBootstrapTimerRef.current = window.setTimeout(() => {
      dashboardBootstrapTimerRef.current = null
      setIsDashboardBootstrapLoading(false)
    }, getNetworkAwareDurationMs('dashboard-refresh'))
  }, [isAuthenticated, showAuth, showAdminLogin, isAdminSetupRouteActive])

  useEffect(() => () => {
    if (dashboardSearchTimeoutRef.current) {
      window.clearTimeout(dashboardSearchTimeoutRef.current)
      dashboardSearchTimeoutRef.current = null
    }
    if (dashboardBootstrapTimerRef.current) {
      window.clearTimeout(dashboardBootstrapTimerRef.current)
      dashboardBootstrapTimerRef.current = null
    }
    if (slowRuntimeRevealTimerRef.current) {
      window.clearTimeout(slowRuntimeRevealTimerRef.current)
      slowRuntimeRevealTimerRef.current = null
    }
    if (slowRuntimeHideTimerRef.current) {
      window.clearTimeout(slowRuntimeHideTimerRef.current)
      slowRuntimeHideTimerRef.current = null
    }
    slowRuntimeOperationCountRef.current = 0
    slowRuntimeMinVisibleUntilRef.current = 0
    slowRuntimeVisibleRef.current = false
  }, [])

  useEffect(() => {
    // Initialize route from URL on first load
    let isCancelled = false
    const syncFromLocation = () => {
      const path = normalizeAppPathname(window.location.pathname || '/')
      if (path !== '/admin/setup') {
        setAdminSetupSuccessState(null)
      }
      if (path === '/team/setup') {
        const params = new URLSearchParams(window.location.search || '')
        const token = params.get('invite') || ''
        const companyId = params.get('company') || ''
        const email = params.get('email') || ''
        const invitePlaceholder = buildPendingClientTeamInvitePlaceholder({
          token,
          companyId,
          email,
        })
        setShowAuth(true)
        setShowAdminLogin(false)
        setIsPublicSiteView(false)
        setAdminSetupToken('')
        setIsAdminSetupRouteActive(false)
        setActiveFolderRoute(null)
        setPublicSitePage('home')
        setAuthMode('signup')
        setPasswordResetEmail('')
        setEmailVerificationEmail('')
        setPendingClientTeamInvite(invitePlaceholder)
        setClientTeamInviteSetupMessage('Checking invite details...')
        void (async () => {
          const inviteLookup = await getClientTeamInviteByToken({
            token,
            companyId,
            email,
          })
          if (isCancelled) return
          setPendingClientTeamInvite(inviteLookup)
          if (!inviteLookup || inviteLookup.invite.status !== 'pending') {
            setClientTeamInviteSetupMessage('This team invite is invalid or has expired. Ask the primary owner for a fresh invite link.')
            return
          }
          setClientTeamInviteSetupMessage(
            `You were invited by ${inviteLookup.invite.invitedBy || 'the primary owner'} to join this workspace as ${normalizeClientTeamRole(inviteLookup.invite.role)}. Create your account with the invited email below.`,
          )
        })()
        return
      }
      const publicSitePageCandidate = resolvePublicSitePageFromPathname(path)
      if (publicSitePageCandidate) {
        setShowAuth(false)
        setShowAdminLogin(false)
        setIsPublicSiteView(true)
        setAdminSetupToken('')
        setIsAdminSetupRouteActive(false)
        setPendingClientTeamInvite(null)
        setClientTeamInviteSetupMessage('')
        setActiveFolderRoute(null)
        setPublicSitePage(publicSitePageCandidate)
        return
      }
      if (path === '/login' || path === '/signup' || path === '/auth') {
        const params = new URLSearchParams(window.location.search || '')
        const requestedMode = String(params.get('mode') || '').trim().toLowerCase()
        const resetEmail = String(params.get('email') || '').trim().toLowerCase()
        const verificationEmail = String(params.get('email') || '').trim().toLowerCase()
        const resolvedAuthMode = path === '/signup'
          ? 'signup'
          : (requestedMode === 'forgot-password' || requestedMode === 'reset-password' || requestedMode === 'email-verification')
            ? requestedMode
            : 'login'
        setShowAuth(true)
        setShowAdminLogin(false)
        setIsPublicSiteView(false)
        setAdminSetupToken('')
        setIsAdminSetupRouteActive(false)
        setPendingClientTeamInvite(null)
        setClientTeamInviteSetupMessage('')
        setActiveFolderRoute(null)
        setPublicSitePage('home')
        setAuthMode(resolvedAuthMode)
        setPasswordResetEmail(resolvedAuthMode === 'reset-password' ? resetEmail : '')
        setEmailVerificationEmail(resolvedAuthMode === 'email-verification' ? verificationEmail : '')
        return
      }
      if (path === '/admin/login') {
        setShowAuth(false)
        setShowAdminLogin(true)
        setIsPublicSiteView(false)
        setAdminSetupToken('')
        setIsAdminSetupRouteActive(false)
        setPendingClientTeamInvite(null)
        setClientTeamInviteSetupMessage('')
        setActiveFolderRoute(null)
        setPublicSitePage('home')
        setAuthMode('login')
        setPasswordResetEmail('')
        setEmailVerificationEmail('')
        return
      }
      if (path === '/admin/setup') {
        const inviteToken = new URLSearchParams(window.location.search).get('invite') || ''
        setShowAuth(false)
        setShowAdminLogin(false)
        setIsPublicSiteView(false)
        setAdminSetupToken(inviteToken)
        setIsAdminSetupRouteActive(true)
        setPendingClientTeamInvite(null)
        setClientTeamInviteSetupMessage('')
        setActiveFolderRoute(null)
        setPublicSitePage('home')
        setAuthMode('login')
        setPasswordResetEmail('')
        setEmailVerificationEmail('')
        return
      }
      if (path === '/reset-auth') {
        resetStoredClientAndAdminSessions()
        setAuthUser(null)
        setIsAuthenticated(false)
        setShowAuth(true)
        setShowAdminLogin(false)
        setIsPublicSiteView(false)
        setAdminSetupToken('')
        setIsAdminSetupRouteActive(false)
        setPendingClientTeamInvite(null)
        setClientTeamInviteSetupMessage('')
        setImpersonationSession(null)
        setAdminImpersonationSession(null)
        setPendingGoogleSocialAuth(null)
        setPendingImpersonationClient(null)
        setOtpChallenge(null)
        setActiveFolderRoute(null)
        setPublicSitePage('home')
        setAuthMode('login')
        setPasswordResetEmail('')
        setEmailVerificationEmail('')
        try {
          history.replaceState({}, '', '/login')
        } catch {
          // ignore
        }
        return
      }
      if (path === '/reset-admin-setup') {
        const resetResult = resetStoredAdminBootstrapState()
        const currentRole = normalizeRole(authUser?.role, authUser?.email || '')
        if (resetResult.clearedAdminSession || currentRole === 'admin') {
          setAuthUser(null)
          setIsAuthenticated(false)
        }
        setShowAuth(false)
        setShowAdminLogin(false)
        setIsPublicSiteView(false)
        setAdminSetupSuccessState(null)
        setAdminSetupToken('')
        setIsAdminSetupRouteActive(true)
        setPendingClientTeamInvite(null)
        setClientTeamInviteSetupMessage('')
        setImpersonationSession(null)
        setAdminImpersonationSession(null)
        setPendingGoogleSocialAuth(null)
        setPendingImpersonationClient(null)
        setOtpChallenge(null)
        setActiveFolderRoute(null)
        setPublicSitePage('home')
        setAuthMode('login')
        setPasswordResetEmail('')
        setEmailVerificationEmail('')
        try {
          history.replaceState({}, '', '/admin/setup')
        } catch {
          // ignore
        }
        return
      }
      const folderRouteMatch = path.match(/^\/(expenses|sales|bank-statements)\/folder\/([^/]+)$/)
      if (folderRouteMatch) {
        const folderCategory = folderRouteMatch[1]
        const folderId = decodeURIComponent(folderRouteMatch[2] || '')
        setShowAuth(false)
        setShowAdminLogin(false)
        setIsPublicSiteView(false)
        setAdminSetupToken('')
        setIsAdminSetupRouteActive(false)
        setPendingClientTeamInvite(null)
        setClientTeamInviteSetupMessage('')
        setPublicSitePage('home')
        setActivePage(folderCategory)
        setActiveFolderRoute({ category: folderCategory, folderId })
        return
      }
      const candidate = path.replace(/^\//, '')
      if (candidate === 'chat') {
        setShowAuth(false)
        setShowAdminLogin(false)
        setIsPublicSiteView(false)
        setAdminSetupToken('')
        setIsAdminSetupRouteActive(false)
        setPendingClientTeamInvite(null)
        setClientTeamInviteSetupMessage('')
        setPublicSitePage('home')
        setActiveFolderRoute(null)
        setActivePage('support')
        return
      }
      if (APP_PAGE_IDS.includes(candidate)) {
        setShowAuth(false)
        setShowAdminLogin(false)
        setIsPublicSiteView(false)
        setAdminSetupToken('')
        setIsAdminSetupRouteActive(false)
        setPendingClientTeamInvite(null)
        setClientTeamInviteSetupMessage('')
        setPublicSitePage('home')
        setActiveFolderRoute(null)
        setActivePage(candidate)
        setPasswordResetEmail('')
        return
      }
      setShowAuth(false)
      setShowAdminLogin(false)
      setAdminSetupToken('')
      setIsAdminSetupRouteActive(false)
      setPendingClientTeamInvite(null)
      setClientTeamInviteSetupMessage('')
      setActiveFolderRoute(null)
      setPasswordResetEmail('')
      if (isAuthenticated) {
        setPublicSitePage('home')
        setIsPublicSiteView(true)
        setActivePage(getDefaultPageForRole(initialAuthUser?.role))
        return
      }
      setPublicSitePage('home')
      setIsPublicSiteView(true)
    }

    syncFromLocation()

    const onPop = () => syncFromLocation()
    window.addEventListener('popstate', onPop)
    return () => {
      isCancelled = true
      window.removeEventListener('popstate', onPop)
    }
  }, [initialAuthUser?.role, isAuthenticated])

  useEffect(() => {
    const shouldCheckOwnerBootstrap = (
      (!adminSetupToken && isAdminSetupRouteActive)
      || (showAdminLogin && !isAuthenticated)
    )

    if (!shouldCheckOwnerBootstrap) {
      setOwnerBootstrapStatus(createOwnerBootstrapStatusState())
      return
    }

    let isCancelled = false
    setOwnerBootstrapStatus((previous) => ({
      ...previous,
      loading: true,
      checked: previous.checked,
    }))

    ;(async () => {
      const status = await fetchOwnerBootstrapStatus()
      if (isCancelled) return
      setOwnerBootstrapStatus({
        loading: false,
        checked: true,
        canBootstrap: Boolean(status.canBootstrap),
        adminAccountCount: Math.max(0, Number(status.adminAccountCount || 0)),
        message: String(status.message || '').trim(),
      })
    })()

    return () => {
      isCancelled = true
    }
  }, [adminSetupToken, isAdminSetupRouteActive, isAuthenticated, showAdminLogin])

  useEffect(() => {
    if (!showAdminLogin || isAuthenticated) return
    if (!ownerBootstrapStatus.checked || ownerBootstrapStatus.loading) return
    if (!ownerBootstrapStatus.canBootstrap) return

    resetStoredAdminBootstrapState()
    navigateToAdminSetup({ replace: true })
  }, [
    isAuthenticated,
    ownerBootstrapStatus.canBootstrap,
    ownerBootstrapStatus.checked,
    ownerBootstrapStatus.loading,
    showAdminLogin,
  ])

  useEffect(() => {
    if (!isClientVerificationLocked) return
    if (activePage === 'settings' || activePage === 'dashboard') return
    routeClientToVerificationSettings({ replace: true })
  }, [activePage, isClientVerificationLocked])

  useEffect(() => {
    if (isAuthenticated && isAdminView) return
    if (!impersonationSession) return
    setImpersonationSession(null)
    persistImpersonationSession(null)
  }, [isAuthenticated, isAdminView, impersonationSession])

  useEffect(() => {
    if (!scopedClientEmail) {
      clientWorkspaceSyncSignaturesRef.current.clear()
      setClientActivityRecords([])
      setSettingsProfileSnapshot(normalizeSettingsProfile({}))
      setVerificationDocsSnapshot(normalizeVerificationDocs({}))
      setAccountSettingsSnapshot(normalizeAccountSettings({}))
      return
    }

    const token = String(authUser?.firebaseIdToken || '').trim()
    if (!token || isImpersonatingClient) {
      const savedOnboardingState = getSavedOnboardingState(scopedClientEmail)
      setOnboardingState(savedOnboardingState)
      const savedSettingsProfile = readScopedSettingsProfile(scopedClientEmail)
      const savedVerificationProgress = resolveVerificationProgress({
        onboardingData: savedOnboardingState.data,
        settingsDocs: readScopedVerificationDocs(scopedClientEmail),
        settingsProfile: savedSettingsProfile,
      })
      setSettingsProfileSnapshot(savedVerificationProgress.profile)
      setVerificationDocsSnapshot(savedVerificationProgress.docs)
      setAccountSettingsSnapshot(readScopedAccountSettings(scopedClientEmail))
      const scopedWorkspaceCache = getClientWorkspaceCache(scopedClientEmail) || {}
      const scopedNotificationSettings = persistScopedNotificationSettings(
        scopedClientEmail,
        scopedWorkspaceCache.notificationSettings && typeof scopedWorkspaceCache.notificationSettings === 'object'
          ? scopedWorkspaceCache.notificationSettings
          : readClientNotificationSettings(scopedClientEmail),
      )
      setNotificationSettingsSnapshot(scopedNotificationSettings)
      const fallbackCompanyName = impersonationSession?.businessName || ''
      const fallbackFirstName = impersonationSession?.clientName?.trim()?.split(/\s+/)?.[0]
        || authUser?.fullName?.trim()?.split(/\s+/)?.[0]
        || 'Client'
      setCompanyName(getSavedCompanyName(scopedClientEmail, fallbackCompanyName))
      setClientFirstName(getSavedClientFirstName(scopedClientEmail, fallbackFirstName))
      setProfilePhoto(getSavedProfilePhoto(scopedClientEmail))
      setCompanyLogo(getSavedCompanyLogo(scopedClientEmail))
      const fallbackOwnerName = impersonationSession?.clientName || authUser?.fullName || fallbackFirstName
      const scopedDocuments = readClientDocuments(scopedClientEmail, fallbackOwnerName)
      setExpenseDocuments(ensureFolderStructuredRecords(scopedDocuments.expenses, 'expenses'))
      setSalesDocuments(ensureFolderStructuredRecords(scopedDocuments.sales, 'sales'))
      setBankStatementDocuments(ensureFolderStructuredRecords(scopedDocuments.bankStatements, 'bankStatements'))
      setExpenseClassOptions(normalizeClassOptions(scopedDocuments.expenseClassOptions))
      setSalesClassOptions(normalizeClassOptions(scopedDocuments.salesClassOptions))
      setUploadHistoryRecords(scopedDocuments.uploadHistory)
      setResolvedDocumentRecords(scopedDocuments.resolvedDocuments)
      setClientActivityRecords(readClientActivityLogEntries(scopedClientEmail))
      return
    }

    let isCancelled = false
    ;(async () => {
      const response = await fetchClientWorkspaceFromBackend({
        authorizationToken: token,
      })
      if (!response.ok || !response.data || typeof response.data !== 'object' || isCancelled) {
        return
      }

      const fetchedWorkspace = response.data.workspace && typeof response.data.workspace === 'object'
        ? response.data.workspace
        : {}
      const existingWorkspaceCache = getClientWorkspaceCache(scopedClientEmail) || {}
      const savedOnboardingState = getSavedOnboardingState(scopedClientEmail)
      const mergedSettingsProfile = {
        ...(existingWorkspaceCache.settingsProfile && typeof existingWorkspaceCache.settingsProfile === 'object'
          ? existingWorkspaceCache.settingsProfile
          : {}),
        ...(fetchedWorkspace.settingsProfile && typeof fetchedWorkspace.settingsProfile === 'object'
          ? fetchedWorkspace.settingsProfile
          : {}),
      }
      const mergedOnboardingState = mergeOnboardingStates({
        savedState: savedOnboardingState,
        cachedState: existingWorkspaceCache.onboardingState,
        fetchedState: fetchedWorkspace.onboardingState,
        settingsProfile: mergedSettingsProfile,
        fallbackEmail: scopedClientEmail,
        fallbackFullName: authUser?.fullName || '',
      })
      const mergedProfilePhoto = mergePersistentClientAssetUrl(
        fetchedWorkspace.profilePhoto,
        existingWorkspaceCache.profilePhoto,
      )
      const mergedCompanyLogo = mergePersistentClientAssetUrl(
        fetchedWorkspace.companyLogo,
        existingWorkspaceCache.companyLogo,
      )
      const workspace = {
        ...existingWorkspaceCache,
        ...fetchedWorkspace,
        onboardingState: mergedOnboardingState,
        settingsProfile: mergedSettingsProfile,
        profilePhoto: mergedProfilePhoto,
        companyLogo: mergedCompanyLogo,
        verificationDocs: {
          ...(existingWorkspaceCache.verificationDocs && typeof existingWorkspaceCache.verificationDocs === 'object'
            ? existingWorkspaceCache.verificationDocs
            : {}),
          ...(fetchedWorkspace.verificationDocs && typeof fetchedWorkspace.verificationDocs === 'object'
            ? fetchedWorkspace.verificationDocs
            : {}),
        },
        statusControl: {
          ...(existingWorkspaceCache.statusControl && typeof existingWorkspaceCache.statusControl === 'object'
            ? existingWorkspaceCache.statusControl
            : {}),
          ...(fetchedWorkspace.statusControl && typeof fetchedWorkspace.statusControl === 'object'
            ? fetchedWorkspace.statusControl
            : {}),
        },
        notificationSettings: {
          ...(existingWorkspaceCache.notificationSettings && typeof existingWorkspaceCache.notificationSettings === 'object'
            ? existingWorkspaceCache.notificationSettings
            : {}),
          ...(fetchedWorkspace.notificationSettings && typeof fetchedWorkspace.notificationSettings === 'object'
            ? fetchedWorkspace.notificationSettings
            : {}),
        },
        notifications: Array.isArray(fetchedWorkspace.notifications)
          ? fetchedWorkspace.notifications
          : (Array.isArray(existingWorkspaceCache.notifications) ? existingWorkspaceCache.notifications : []),
        accountSettings: {
          ...(existingWorkspaceCache.accountSettings && typeof existingWorkspaceCache.accountSettings === 'object'
            ? existingWorkspaceCache.accountSettings
            : {}),
          ...(fetchedWorkspace.accountSettings && typeof fetchedWorkspace.accountSettings === 'object'
            ? fetchedWorkspace.accountSettings
            : {}),
        },
      }
      setClientWorkspaceCache(scopedClientEmail, workspace)

      const fallbackFirstName = authUser?.fullName?.trim()?.split(/\s+/)?.[0] || 'Client'
      const nextOnboardingState = mergeOnboardingStates({
        savedState: savedOnboardingState,
        cachedState: existingWorkspaceCache.onboardingState,
        fetchedState: workspace.onboardingState,
        settingsProfile: workspace.settingsProfile,
        fallbackEmail: scopedClientEmail,
        fallbackFullName: authUser?.fullName || '',
      })

      const settingsProfile = normalizeSettingsProfile(workspace.settingsProfile || {})
      const verificationDocs = normalizeVerificationDocs(workspace.verificationDocs || {})
      const accountSettings = normalizeAccountSettings(workspace.accountSettings || {})
      const mappedWorkspaceNotifications = mapNotificationRecordsToClientEntries(
        Array.isArray(workspace.notifications) ? workspace.notifications : [],
        readClientNotificationInbox(scopedClientEmail),
      )
      const nextUserNotifications = mappedWorkspaceNotifications.length > 0
        ? mergeClientNotifications(readClientNotificationInbox(scopedClientEmail), mappedWorkspaceNotifications)
        : readClientNotificationInbox(scopedClientEmail)
      const notificationSettings = persistScopedNotificationSettings(
        scopedClientEmail,
        workspace.notificationSettings && typeof workspace.notificationSettings === 'object'
          ? workspace.notificationSettings
          : readClientNotificationSettings(scopedClientEmail),
      )
      const verificationProgress = resolveVerificationProgress({
        onboardingData: nextOnboardingState.data,
        settingsDocs: verificationDocs,
        settingsProfile,
      })
      const normalizedScopedEmail = String(scopedClientEmail || '').trim().toLowerCase()
      if (normalizedScopedEmail) {
        const initialWorkspacePayload = {
          documents: workspace.documents && typeof workspace.documents === 'object'
            ? workspace.documents
            : createDefaultClientDocuments(),
          activityLog: Array.isArray(workspace.activityLog) ? workspace.activityLog : [],
          onboardingState: nextOnboardingState,
          settingsProfile: workspace.settingsProfile && typeof workspace.settingsProfile === 'object'
            ? workspace.settingsProfile
            : settingsProfile,
          verificationDocs: verificationProgress.docs,
          statusControl: workspace.statusControl && typeof workspace.statusControl === 'object'
            ? workspace.statusControl
            : {},
          notificationSettings: workspace.notificationSettings && typeof workspace.notificationSettings === 'object'
            ? workspace.notificationSettings
            : {},
          notifications: Array.isArray(workspace.notifications)
            ? workspace.notifications
            : [],
          accountSettings: workspace.accountSettings && typeof workspace.accountSettings === 'object'
            ? workspace.accountSettings
            : accountSettings,
          profilePhoto: mergedProfilePhoto,
          companyLogo: mergedCompanyLogo,
        }
        clientWorkspaceSyncSignaturesRef.current.set(
          normalizedScopedEmail,
          JSON.stringify(initialWorkspacePayload),
        )
      }
      const docs = readClientDocuments(scopedClientEmail, authUser?.fullName || fallbackFirstName)
      writeScopedStorageJson('kiaminaOnboardingState', scopedClientEmail, nextOnboardingState)

      setOnboardingState(nextOnboardingState)
      setSettingsProfileSnapshot(verificationProgress.profile)
      setVerificationDocsSnapshot(verificationProgress.docs)
      setAccountSettingsSnapshot(accountSettings)
      setNotificationSettingsSnapshot(notificationSettings)
      setUserNotifications(nextUserNotifications)
      setCompanyName(settingsProfile.businessName?.trim() || '')
      setClientFirstName(settingsProfile.firstName || fallbackFirstName)
      setProfilePhoto(mergedProfilePhoto)
      setCompanyLogo(mergedCompanyLogo)
      setExpenseDocuments(ensureFolderStructuredRecords(docs.expenses, 'expenses'))
      setSalesDocuments(ensureFolderStructuredRecords(docs.sales, 'sales'))
      setBankStatementDocuments(ensureFolderStructuredRecords(docs.bankStatements, 'bankStatements'))
      setExpenseClassOptions(normalizeClassOptions(docs.expenseClassOptions))
      setSalesClassOptions(normalizeClassOptions(docs.salesClassOptions))
      setUploadHistoryRecords(docs.uploadHistory)
      setResolvedDocumentRecords(docs.resolvedDocuments)
      setClientActivityRecords(readClientActivityLogEntries(scopedClientEmail))
    })()

    return () => {
      isCancelled = true
    }
  }, [scopedClientEmail, impersonationSession?.businessName, impersonationSession?.clientName, authUser?.fullName, authUser?.firebaseIdToken, isImpersonatingClient])

  useEffect(() => {
    if (!isImpersonatingClient || !impersonationSession) return
    const timeoutId = window.setInterval(() => {
      const lastActivityAt = impersonationSession.lastActivityAt || impersonationSession.startedAt || 0
      if (Date.now() - lastActivityAt <= IMPERSONATION_IDLE_TIMEOUT_MS) return
      logAdminActivity({
        adminName: impersonationSession.adminName || authUser?.fullName || 'Admin User',
        action: 'Impersonation session expired',
        affectedUser: impersonationSession.businessName || impersonationSession.clientEmail || '--',
        details: `Impersonation session expired due to inactivity for ${impersonationSession.businessName || impersonationSession.clientEmail}.`,
      })
      setImpersonationSession(null)
      persistImpersonationSession(null)
      setPendingImpersonationClient(null)
      setActivePage(ADMIN_DEFAULT_PAGE)
      setActiveFolderRoute(null)
      try {
        history.replaceState({}, '', `/${ADMIN_DEFAULT_PAGE}`)
      } catch {
        // ignore
      }
      showToast('error', 'Client view session expired due to inactivity.')
    }, 10000)
    return () => window.clearInterval(timeoutId)
  }, [isImpersonatingClient, impersonationSession, authUser?.fullName])

  useEffect(() => {
    if (!isImpersonatingClient) return
    const touchSessionActivity = () => {
      setImpersonationSession((prev) => {
        if (!prev) return prev
        const now = Date.now()
        if (now - (prev.lastActivityAt || 0) < 12000) return prev
        const next = { ...prev, lastActivityAt: now }
        persistImpersonationSession(next)
        return next
      })
    }

    const events = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart']
    events.forEach((eventName) => window.addEventListener(eventName, touchSessionActivity, { passive: true }))
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, touchSessionActivity))
    }
  }, [isImpersonatingClient])

  useEffect(() => {
    if (!scopedClientEmail) return
    persistClientDocuments(scopedClientEmail, {
      expenses: expenseDocuments,
      sales: salesDocuments,
      bankStatements: bankStatementDocuments,
      uploadHistory: uploadHistoryRecords,
      resolvedDocuments: resolvedDocumentRecords,
      expenseClassOptions,
      salesClassOptions,
    })
  }, [
    scopedClientEmail,
    expenseDocuments,
    salesDocuments,
    bankStatementDocuments,
    uploadHistoryRecords,
    resolvedDocumentRecords,
    expenseClassOptions,
    salesClassOptions,
  ])

  useEffect(() => {
    const normalizedScopedEmail = String(scopedClientEmail || '').trim().toLowerCase()
    if (!normalizedScopedEmail || isImpersonatingClient) return
    const authorizationToken = String(authUser?.firebaseIdToken || '').trim()
    if (!authorizationToken) return

    const workspaceCache = getClientWorkspaceCache(normalizedScopedEmail) || {}
    const workspacePayload = {
      documents: {
        expenses: expenseDocuments,
        sales: salesDocuments,
        bankStatements: bankStatementDocuments,
        uploadHistory: uploadHistoryRecords,
        resolvedDocuments: resolvedDocumentRecords,
        expenseClassOptions,
        salesClassOptions,
      },
      activityLog: Array.isArray(clientActivityRecords) ? clientActivityRecords : [],
      onboardingState: normalizeOnboardingState(onboardingState),
      settingsProfile: workspaceCache.settingsProfile && typeof workspaceCache.settingsProfile === 'object'
        ? workspaceCache.settingsProfile
        : settingsProfileSnapshot,
      verificationDocs: verificationDocsSnapshot,
      statusControl: workspaceCache.statusControl && typeof workspaceCache.statusControl === 'object'
        ? workspaceCache.statusControl
        : {},
      notificationSettings: workspaceCache.notificationSettings && typeof workspaceCache.notificationSettings === 'object'
        ? workspaceCache.notificationSettings
        : {},
      accountSettings: workspaceCache.accountSettings && typeof workspaceCache.accountSettings === 'object'
        ? workspaceCache.accountSettings
        : accountSettingsSnapshot,
      profilePhoto: normalizePersistentClientAssetUrl(profilePhoto || ''),
      companyLogo: normalizePersistentClientAssetUrl(companyLogo || ''),
    }

    setClientWorkspaceCache(normalizedScopedEmail, workspacePayload)
    const serializedPayload = JSON.stringify(workspacePayload)
    if (clientWorkspaceSyncSignaturesRef.current.get(normalizedScopedEmail) === serializedPayload) {
      return
    }

    const timeoutId = window.setTimeout(async () => {
      const response = await patchClientWorkspaceToBackend({
        authorizationToken,
        workspacePayload,
      })
      if (response.ok) {
        clientWorkspaceSyncSignaturesRef.current.set(normalizedScopedEmail, serializedPayload)
      }
    }, 450)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    scopedClientEmail,
    isImpersonatingClient,
    authUser?.firebaseIdToken,
    expenseDocuments,
    salesDocuments,
    bankStatementDocuments,
    uploadHistoryRecords,
    resolvedDocumentRecords,
    expenseClassOptions,
    salesClassOptions,
    clientActivityRecords,
    onboardingState,
    settingsProfileSnapshot,
    verificationDocsSnapshot,
    accountSettingsSnapshot,
    profilePhoto,
    companyLogo,
  ])

  useEffect(() => {
    const normalizedScopedEmail = String(scopedClientEmail || '').trim().toLowerCase()
    if (!normalizedScopedEmail || isImpersonatingClient || currentUserRole !== 'client') return
    const authorizationToken = String(authUser?.firebaseIdToken || '').trim()
    const sessionId = String(authUser?.sessionId || getApiSessionId() || '').trim()
    if (!authorizationToken || !sessionId) return

    const workspaceCache = getClientWorkspaceCache(normalizedScopedEmail) || {}
    const settingsProfile = workspaceCache.settingsProfile && typeof workspaceCache.settingsProfile === 'object'
      ? workspaceCache.settingsProfile
      : {}
    const profilePayload = buildClientProfilePayloadForBackend(settingsProfile)
    const hasAnyProfileValues = Boolean(
      profilePayload.firstName
      || profilePayload.lastName
      || profilePayload.otherNames
      || profilePayload.phoneLocalNumber
      || profilePayload.businessType
      || profilePayload.businessName
      || profilePayload.country
      || profilePayload.address1
      || profilePayload.tin
      || profilePayload.cacNumber
    )
    if (!hasAnyProfileValues) return

    const signature = JSON.stringify(profilePayload)
    if (clientProfileSyncSignaturesRef.current.get(normalizedScopedEmail) === signature) {
      return
    }

    let cancelled = false
    ;(async () => {
      const response = await persistClientProfileToBackend({
        authorizationToken,
        profile: settingsProfile,
      })
      if (cancelled || !response.ok) return
      clientProfileSyncSignaturesRef.current.set(normalizedScopedEmail, signature)
    })()

    return () => {
      cancelled = true
    }
  }, [
    scopedClientEmail,
    isImpersonatingClient,
    currentUserRole,
    authUser?.firebaseIdToken,
    authUser?.sessionId,
    settingsProfileSnapshot,
  ])

  useEffect(() => {
    const extractClasses = (records = []) => (
      records.flatMap((record) => (
        record?.isFolder
          ? (record.files || []).map((file) => (file.class || file.className || file.expenseClass || file.salesClass || '').trim())
          : [(record.class || record.className || record.expenseClass || record.salesClass || '').trim()]
      ))
        .filter(Boolean)
    )

    const extractedExpense = normalizeClassOptions(extractClasses(expenseDocuments))
    const extractedSales = normalizeClassOptions(extractClasses(salesDocuments))
    setExpenseClassOptions((prev) => normalizeClassOptions([...prev, ...extractedExpense]))
    setSalesClassOptions((prev) => normalizeClassOptions([...prev, ...extractedSales]))
  }, [expenseDocuments, salesDocuments])

  const persistOnboardingState = (nextState, emailOverride) => {
    const targetEmail = emailOverride ?? scopedClientEmail
    const normalizedState = mergeOnboardingStates({
      savedState: onboardingState,
      cachedState: getClientWorkspaceCache(targetEmail)?.onboardingState,
      fetchedState: nextState,
      settingsProfile: readScopedSettingsProfile(targetEmail),
      fallbackEmail: targetEmail,
      fallbackFullName: isImpersonatingClient
        ? (impersonationSession?.clientName || authUser?.fullName || '')
        : (authUser?.fullName || ''),
    })
    setOnboardingState(normalizedState)
    setClientWorkspaceCache(targetEmail, {
      onboardingState: normalizedState,
    })
    writeScopedStorageJson('kiaminaOnboardingState', targetEmail, normalizedState)
  }

  const setOnboardingData = (updater) => {
    const targetEmail = scopedClientEmail
    const rawNextData = typeof updater === 'function' ? updater(onboardingState.data) : updater
    const nextData = applyTeamAffiliationBusinessFields({
      data: rawNextData,
      affiliation: clientTeamAffiliation,
    })
    persistOnboardingState({ ...onboardingState, data: nextData }, targetEmail)
    const nextVerificationProgress = resolveVerificationProgress({
      onboardingData: nextData,
      settingsDocs: readScopedVerificationDocs(targetEmail),
      settingsProfile: readScopedSettingsProfile(targetEmail),
    })
    setSettingsProfileSnapshot(nextVerificationProgress.profile)
    setVerificationDocsSnapshot(nextVerificationProgress.docs)
    persistScopedVerificationDocs(targetEmail, nextVerificationProgress.docs)
    const existing = settingsProfileSnapshot && typeof settingsProfileSnapshot === 'object'
      ? settingsProfileSnapshot
      : {}
    const effectiveFullName = isImpersonatingClient
      ? (impersonationSession?.clientName || existing.fullName || '')
      : (authUser?.fullName || existing.fullName || '')
    const existingNameParts = resolveSettingsProfileNameParts(existing)
    const resolvedOnboardingNames = {
      firstName: String(nextData.firstName || existingNameParts.firstName || '').trim(),
      lastName: String(nextData.lastName || existingNameParts.lastName || '').trim(),
      otherNames: String(nextData.otherNames || existingNameParts.otherNames || '').trim(),
    }
    const resolvedFullName = buildSettingsProfileFullName(resolvedOnboardingNames)
      || String(nextData.primaryContact || effectiveFullName).trim()
      || effectiveFullName
    const resolvedPhone = sanitizeClientPhoneLocalNumber(
      Object.prototype.hasOwnProperty.call(nextData, 'phone')
        ? nextData.phone
        : (existing.phoneLocalNumber || existing.phone || ''),
    )
    const resolvedPhoneCountryCode = String(existing.phoneCountryCode || '+234').trim() || '+234'
    const merged = {
      ...existing,
      fullName: resolvedFullName,
      firstName: resolvedOnboardingNames.firstName,
      lastName: resolvedOnboardingNames.lastName,
      otherNames: resolvedOnboardingNames.otherNames,
      email: String(targetEmail || nextData.email || existing.email || '').trim().toLowerCase(),
      phone: resolvedPhone,
      phoneCountryCode: resolvedPhoneCountryCode,
      phoneLocalNumber: resolvedPhone,
      roleInCompany: String(nextData.roleInCompany ?? existing.roleInCompany ?? '').trim(),
      address: nextData.address1 ?? nextData.address ?? existing.address1 ?? existing.address ?? '',
      address1: nextData.address1 ?? nextData.address ?? existing.address1 ?? existing.address ?? '',
      address2: nextData.address2 ?? existing.address2 ?? '',
      city: nextData.city ?? existing.city ?? '',
      postalCode: nextData.postalCode ?? existing.postalCode ?? '',
      addressCountry: nextData.addressCountry ?? existing.addressCountry ?? nextData.country ?? existing.country ?? '',
      businessType: nextData.businessType ?? existing.businessType ?? '',
      businessName: nextData.businessName ?? existing.businessName ?? '',
      country: nextData.country ?? existing.country ?? '',
      industry: nextData.industry ?? existing.industry ?? '',
      industryOther: nextData.industryOther ?? existing.industryOther ?? '',
      cacNumber: nextData.cacNumber ?? existing.cacNumber ?? '',
      tin: nextData.tin ?? existing.tin ?? '',
      reportingCycle: nextData.reportingCycle ?? existing.reportingCycle ?? '',
      startMonth: nextData.startMonth ?? existing.startMonth ?? '',
      currency: nextData.currency ?? existing.currency ?? '',
      language: nextData.language ?? existing.language ?? '',
    }
    setClientWorkspaceCache(targetEmail, {
      settingsProfile: merged,
    })
    const normalizedProfile = normalizeSettingsProfile(merged)
    setSettingsProfileSnapshot(normalizedProfile)
    setCompanyName(merged.businessName?.trim() || '')
    setClientFirstName(normalizedProfile.firstName || 'Client')
    if (isImpersonatingClient) {
      logAdminActivity({
        adminName: impersonationSession?.adminName || authUser?.fullName || 'Admin User',
        action: 'Updated client onboarding data in impersonation mode',
        affectedUser: impersonationSession?.businessName || targetEmail,
        details: 'Admin updated onboarding and profile data while in impersonation mode.',
      })
    }
  }

  const setOnboardingStep = (step) => {
    persistOnboardingState({
      ...onboardingState,
      currentStep: Math.min(CLIENT_ONBOARDING_TOTAL_STEPS, Math.max(1, step)),
    }, scopedClientEmail)
  }

  const syncProfileToSettings = (fullName, email, nameDraft = null) => {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!normalizedEmail) return
    const existing = readScopedSettingsProfile(normalizedEmail)
    const normalizedDraft = normalizeClientNameDraft({
      ...existing,
      ...(nameDraft && typeof nameDraft === 'object' ? nameDraft : {}),
      fullName: fullName || nameDraft?.fullName || existing.fullName || '',
    })
    const next = {
      ...existing,
      fullName: normalizedDraft.fullName || fullName || existing.fullName || '',
      firstName: normalizedDraft.firstName || existing.firstName || '',
      lastName: normalizedDraft.lastName || existing.lastName || '',
      otherNames: normalizedDraft.otherNames || existing.otherNames || '',
      email: normalizedEmail,
    }
    setClientWorkspaceCache(normalizedEmail, {
      settingsProfile: next,
    })
    if (String(scopedClientEmail || '').trim().toLowerCase() === normalizedEmail) {
      setSettingsProfileSnapshot(normalizeSettingsProfile(next))
    }
  }

  const appendScopedClientLog = (action, details) => {
    if (!scopedClientEmail) return
    const actorName = isImpersonatingClient
      ? (impersonationSession?.adminName || authUser?.fullName || 'Admin User')
      : (authUser?.fullName || clientFirstName || 'Client User')
    const actorRole = isImpersonatingClient ? 'admin' : 'client'
    const logEntry = appendClientActivityLog(scopedClientEmail, {
      actorName,
      actorRole,
      action,
      details,
    })
    if (logEntry) {
      setClientActivityRecords((prev) => [logEntry, ...prev])
    }
  }

  const showToast = (type, message) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  const refreshClientDashboardOverview = async ({ authorizationToken = '' } = {}) => {
    if (!isAuthenticated) return { ok: false }
    if (isAdminView && !isImpersonatingClient) return { ok: false }

    const token = String(authorizationToken || authUser?.firebaseIdToken || '').trim()
    if (!token) return { ok: false }

    const response = await fetchClientDashboardOverviewFromBackend({
      authorizationToken: token,
    })
    if (!response.ok || !response.data || typeof response.data !== 'object') {
      return { ok: false }
    }

    setClientDashboardOverview(response.data)
    return { ok: true, data: response.data }
  }

  const refreshClientWorkspaceArtifactsFromBackend = async ({ authorizationToken = '' } = {}) => {
    if (!isAuthenticated) return { ok: false }
    if (isAdminView && !isImpersonatingClient) return { ok: false }

    const token = String(authorizationToken || authUser?.firebaseIdToken || '').trim()
    const normalizedScopedEmail = String(scopedClientEmail || '').trim().toLowerCase()
    if (!token || !normalizedScopedEmail) return { ok: false }

    const response = await fetchClientWorkspaceFromBackend({
      authorizationToken: token,
    })
    if (!response.ok || !response.data || typeof response.data !== 'object') {
      return { ok: false }
    }

    const fetchedWorkspace = response.data.workspace && typeof response.data.workspace === 'object'
      ? response.data.workspace
      : {}
    const existingWorkspaceCache = getClientWorkspaceCache(normalizedScopedEmail) || {}
    const nextWorkspace = {
      ...existingWorkspaceCache,
      ...fetchedWorkspace,
      documents: fetchedWorkspace.documents && typeof fetchedWorkspace.documents === 'object'
        ? fetchedWorkspace.documents
        : existingWorkspaceCache.documents,
      activityLog: Array.isArray(fetchedWorkspace.activityLog)
        ? fetchedWorkspace.activityLog
        : existingWorkspaceCache.activityLog,
      notifications: Array.isArray(fetchedWorkspace.notifications)
        ? fetchedWorkspace.notifications
        : (Array.isArray(existingWorkspaceCache.notifications) ? existingWorkspaceCache.notifications : []),
    }

    setClientWorkspaceCache(normalizedScopedEmail, nextWorkspace)

    const fallbackFirstName = authUser?.fullName?.trim()?.split(/\s+/)?.[0] || 'Client'
    const documents = readClientDocuments(normalizedScopedEmail, authUser?.fullName || fallbackFirstName)
    setExpenseDocuments(ensureFolderStructuredRecords(documents.expenses, 'expenses'))
    setSalesDocuments(ensureFolderStructuredRecords(documents.sales, 'sales'))
    setBankStatementDocuments(ensureFolderStructuredRecords(documents.bankStatements, 'bankStatements'))
    setExpenseClassOptions(normalizeClassOptions(documents.expenseClassOptions))
    setSalesClassOptions(normalizeClassOptions(documents.salesClassOptions))
    setUploadHistoryRecords(documents.uploadHistory)
    setResolvedDocumentRecords(documents.resolvedDocuments)
    setClientActivityRecords(readClientActivityLogEntries(normalizedScopedEmail))
    setUserNotifications(
      mergeClientNotifications(
        readClientNotificationInbox(normalizedScopedEmail),
        mapNotificationRecordsToClientEntries(nextWorkspace.notifications, readClientNotificationInbox(normalizedScopedEmail)),
      ),
    )

    return { ok: true, data: response.data }
  }

  const syncClientNotificationReadStateToBackend = async ({
    nextNotifications = [],
    authorizationToken = '',
  } = {}) => {
    const token = String(authorizationToken || authUser?.firebaseIdToken || '').trim()
    const normalizedScopedEmail = String(scopedClientEmail || '').trim().toLowerCase()
    if (!token || !normalizedScopedEmail || isImpersonatingClient || currentUserRole !== 'client') {
      return { ok: false }
    }

    const workspaceCache = getClientWorkspaceCache(normalizedScopedEmail) || {}
    const notificationPayload = (Array.isArray(nextNotifications) ? nextNotifications : [])
      .map((entry) => normalizeClientNotificationEntry(entry))
      .filter(Boolean)
      .map((entry) => ({
        id: entry.id,
        type: entry.type || 'info',
        title: entry.title || '',
        body: entry.body || '',
        message: entry.body || entry.message || '',
        sentAtIso: entry.sentAtIso || '',
        read: Boolean(entry.read),
        forceDelivery: Boolean(entry.forceDelivery),
        priority: entry.priority || 'normal',
        link: entry.link || '',
        linkPage: entry.linkPage || '',
        categoryId: entry.categoryId || '',
        folderId: entry.folderId || '',
        fileId: entry.fileId || '',
        documentId: entry.documentId || '',
        ticketId: entry.ticketId || '',
        messageId: entry.messageId || '',
      }))

    setClientWorkspaceCache(normalizedScopedEmail, {
      notifications: notificationPayload,
    })

    return patchClientWorkspaceToBackend({
      authorizationToken: token,
      workspacePayload: {
        notifications: notificationPayload,
      },
    })
  }

  useEffect(() => {
    if (!isAuthenticated) return
    const authorizationToken = String(authUser?.firebaseIdToken || '').trim()
    if (!authorizationToken) return

    let supportRefreshTimer = null
    let dashboardRefreshTimer = null
    let workspaceRefreshTimer = null
    void refreshSupportStateFromBackend()
    const scheduleSupportRefresh = () => {
      if (supportRefreshTimer) return
      supportRefreshTimer = window.setTimeout(() => {
        supportRefreshTimer = null
        void refreshSupportStateFromBackend()
      }, 250)
    }
    const scheduleClientDashboardRefresh = () => {
      if (dashboardRefreshTimer) return
      dashboardRefreshTimer = window.setTimeout(() => {
        dashboardRefreshTimer = null
        void refreshClientDashboardOverview({ authorizationToken })
      }, 300)
    }
    const scheduleClientWorkspaceRefresh = () => {
      if (workspaceRefreshTimer) return
      workspaceRefreshTimer = window.setTimeout(() => {
        workspaceRefreshTimer = null
        void refreshClientWorkspaceArtifactsFromBackend({ authorizationToken })
      }, 300)
    }

    const subscription = subscribeToRealtimeEvents({
      scope: isAdminView && !isImpersonatingClient ? 'all' : 'me',
      topics: ['support', 'chatbot', 'notifications', 'users'],
      onEvent: (event) => {
        const eventType = String(event?.eventType || '').trim().toLowerCase()
        if (!eventType) return

        if (
          eventType.startsWith('support.')
          || eventType.startsWith('chatbot.')
          || eventType.startsWith('notifications.')
        ) {
          scheduleSupportRefresh()
          window.dispatchEvent(new Event('kiamina:admin-dashboard-realtime-sync'))
        }

        if (eventType === 'admin.client-management.updated') {
          window.dispatchEvent(new Event('kiamina:admin-client-management-sync'))
          window.dispatchEvent(new Event('kiamina:admin-dashboard-realtime-sync'))
        }

        if (eventType === 'admin.dashboard.updated') {
          scheduleSupportRefresh()
          window.dispatchEvent(new Event('kiamina:admin-dashboard-realtime-sync'))
        }

        if (
          isAdminView
          && !isImpersonatingClient
          && eventType === 'client.workspace.updated'
        ) {
          window.dispatchEvent(new Event('kiamina:admin-client-management-sync'))
          window.dispatchEvent(new Event('kiamina:admin-dashboard-realtime-sync'))
        }

        if (
          !isImpersonatingClient
          && currentUserRole === 'client'
          && (
            eventType === 'client.dashboard.updated'
            || eventType === 'client.profile.updated'
          )
        ) {
          scheduleClientDashboardRefresh()
        }

        if (
          !isImpersonatingClient
          && currentUserRole === 'client'
          && eventType === 'client.workspace.updated'
        ) {
          scheduleClientDashboardRefresh()
          scheduleClientWorkspaceRefresh()
        }

        if (
          !isImpersonatingClient
          && currentUserRole === 'client'
          && normalizedScopedClientEmail
          && (
            eventType === 'support.message.created'
            || eventType === 'support.ticket.created'
            || eventType === 'support.ticket.updated'
            || eventType.startsWith('chatbot.')
          )
        ) {
          const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {}
          const sentAtIso = String(event?.createdAt || new Date().toISOString()).trim()
          const eventId = String(event?.eventId || `${eventType}-${Date.now()}`).trim()
          const title = eventType === 'support.message.created'
            ? 'Support Reply'
            : eventType === 'support.ticket.created'
              ? 'Support Ticket Created'
              : eventType === 'support.ticket.updated'
                ? 'Support Ticket Updated'
                : 'Support Update'
          const body = eventType === 'support.message.created'
            ? 'New message received from support.'
            : eventType === 'support.ticket.created'
              ? 'Your support ticket has been created.'
              : eventType === 'support.ticket.updated'
                ? 'Your support ticket was updated.'
                : 'Your support conversation was updated.'
          const nextNotification = normalizeClientNotificationEntry({
            id: eventId,
            type: eventType.startsWith('chatbot.') ? 'chatbot' : 'support',
            title,
            body,
            message: `${title}: ${body}`,
            timestamp: formatClientDocumentTimestamp(sentAtIso),
            sentAtIso,
            read: false,
            priority: 'normal',
            linkPage: 'support',
            ticketId: String(payload?.ticketId || '').trim(),
            messageId: String(payload?.messageId || '').trim(),
          })
          if (nextNotification) {
            setUserNotifications((previous) => {
              const next = mergeClientNotifications(previous, [nextNotification])
              persistClientNotificationInbox(normalizedScopedClientEmail, next)
              return next
            })
          }
        }
      },
    })

    return () => {
      if (supportRefreshTimer) window.clearTimeout(supportRefreshTimer)
      if (dashboardRefreshTimer) window.clearTimeout(dashboardRefreshTimer)
      if (workspaceRefreshTimer) window.clearTimeout(workspaceRefreshTimer)
      subscription.close()
    }
  }, [isAuthenticated, authUser?.firebaseIdToken, isAdminView, isImpersonatingClient, currentUserRole, normalizedScopedClientEmail])

  const hydrateAuthenticatedUserFromBackend = async ({
    fallbackUid = '',
    fallbackEmail = '',
    fallbackFullName = '',
    fallbackRole = 'client',
    authorizationToken = '',
    signupCapture = null,
  } = {}) => {
    const normalizedFallbackUid = String(fallbackUid || '').trim()
    const normalizedFallbackEmail = String(fallbackEmail || '').trim().toLowerCase()
    const normalizedFallbackFullName = String(fallbackFullName || '').trim()
    const normalizedBackendFallbackRole = normalizeBackendRole(fallbackRole, normalizedFallbackEmail)
    const normalizedFallbackRole = normalizeRole(normalizedBackendFallbackRole, normalizedFallbackEmail)
    const token = String(authorizationToken || '').trim()
    if (!token) {
      return {
        ok: true,
        user: normalizeUser({
          uid: normalizedFallbackUid,
          fullName: normalizedFallbackFullName || 'User',
          email: normalizedFallbackEmail,
          role: normalizedFallbackRole,
          status: 'active',
          adminLevel: deriveAdminLevelFromBackendRole(normalizedFallbackRole),
          adminPermissions: [],
          firebaseIdToken: '',
        }),
      }
    }

    try {
      if (normalizedFallbackUid && normalizedFallbackEmail) {
        await syncAuthenticatedUserToBackend({
          authorizationToken: token,
          uid: normalizedFallbackUid,
          email: normalizedFallbackEmail,
          displayName: normalizedFallbackFullName,
          roles: [normalizedBackendFallbackRole],
          signupCapture: hasSignupCapturePayloadValues(signupCapture)
            ? normalizeSignupCapturePayload(signupCapture)
            : undefined,
        })
      }
      const response = await apiFetch('/api/users/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        return {
          ok: true,
          user: normalizeUser({
            uid: normalizedFallbackUid,
            fullName: normalizedFallbackFullName || 'User',
            email: normalizedFallbackEmail,
            role: normalizedFallbackRole,
            status: 'active',
            adminLevel: deriveAdminLevelFromBackendRole(normalizedFallbackRole),
            adminPermissions: [],
            firebaseIdToken: token,
          }),
        }
      }
      const payload = await response.json().catch(() => ({}))
      const roles = Array.isArray(payload?.roles)
        ? payload.roles.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean)
        : []
      const resolvedRole = roles.includes('admin')
        ? 'admin'
        : (roles[0] || normalizedFallbackRole || 'client')
      const resolvedEmail = String(payload?.email || normalizedFallbackEmail).trim().toLowerCase()
      const resolvedFullName = String(
        payload?.displayName
        || payload?.clientProfile?.fullName
        || normalizedFallbackFullName
        || resolvedEmail.split('@')[0]
        || 'User',
      ).trim()
      const backendTeamAccess = payload?.clientWorkspace?.teamAccess && typeof payload.clientWorkspace.teamAccess === 'object'
        ? payload.clientWorkspace.teamAccess
        : {}

      return {
        ok: true,
        user: normalizeUser({
          uid: String(payload?.uid || normalizedFallbackUid).trim(),
          fullName: resolvedFullName,
          email: resolvedEmail,
          role: resolvedRole,
          status: String(payload?.status || 'active').trim().toLowerCase() || 'active',
          adminLevel: String(payload?.adminAccess?.adminLevel || '').trim() || deriveAdminLevelFromBackendRole(resolvedRole),
          adminPermissions: Array.isArray(payload?.adminAccess?.adminPermissions)
            ? payload.adminAccess.adminPermissions
            : [],
          adminSecurityPreferences: payload?.adminDashboard?.securityPreferences && typeof payload.adminDashboard.securityPreferences === 'object'
            ? payload.adminDashboard.securityPreferences
            : (payload?.adminSecurityPreferences && typeof payload.adminSecurityPreferences === 'object'
              ? payload.adminSecurityPreferences
              : undefined),
          mustChangePassword: Boolean(payload?.adminAccess?.mustChangePassword),
          roleInCompany: String(payload?.adminProfile?.jobTitle || '').trim(),
          department: String(payload?.adminProfile?.department || '').trim(),
          phoneNumber: String(payload?.adminProfile?.phone || '').trim(),
          ...(backendTeamAccess.role
            ? {
                clientTeamRole: normalizeClientTeamRole(backendTeamAccess.role || ''),
                clientTeamCompanyId: String(backendTeamAccess.companyId || '').trim(),
                clientTeamOwnerEmail: String(backendTeamAccess.ownerEmail || '').trim().toLowerCase(),
                clientTeamOwnerName: String(backendTeamAccess.ownerName || '').trim(),
                clientTeamCompanyName: String(backendTeamAccess.companyName || '').trim(),
                clientTeamBusinessType: String(backendTeamAccess.businessType || '').trim(),
                clientTeamCountry: String(backendTeamAccess.country || '').trim(),
                clientTeamCurrency: String(backendTeamAccess.currency || '').trim(),
                clientAccountType: String(backendTeamAccess.accountType || '').trim() || 'team-member',
              }
            : {}),
          firebaseIdToken: token,
        }),
      }
    } catch {
      return {
        ok: true,
        user: normalizeUser({
          uid: normalizedFallbackUid,
          fullName: normalizedFallbackFullName || 'User',
          email: normalizedFallbackEmail,
          role: normalizedFallbackRole,
          status: 'active',
          adminLevel: deriveAdminLevelFromBackendRole(normalizedFallbackRole),
          adminPermissions: [],
          firebaseIdToken: token,
        }),
      }
    }
  }

  const persistAuthenticatedUserRecord = (user, storageType = 'local') => {
    const normalizedUser = applyClientTeamAccessProfile(normalizeUser({
      ...user,
      sessionIssuedAtIso: new Date().toISOString(),
    }))
    if (!normalizedUser) return null
    if (storageType === 'local') {
      localStorage.setItem('kiaminaAuthUser', JSON.stringify(normalizedUser))
      sessionStorage.removeItem('kiaminaAuthUser')
    } else {
      sessionStorage.setItem('kiaminaAuthUser', JSON.stringify(normalizedUser))
      localStorage.removeItem('kiaminaAuthUser')
    }
    return normalizedUser
  }

  const persistAuthUser = (user, remember = true) => {
    const normalizedUser = persistAuthenticatedUserRecord(user, remember ? 'local' : 'session')
    if (!normalizedUser) return

    setAuthUser(normalizedUser)
    setIsAuthenticated(true)
    setShowAuth(false)
    setShowAdminLogin(false)
    setAdminSetupSuccessState(null)
    setAdminSetupToken('')
    setIsAdminSetupRouteActive(false)
    setImpersonationSession(null)
    setAdminImpersonationSession(null)
    setPendingImpersonationClient(null)
    persistImpersonationSession(null)
    persistAdminImpersonationSession(null)
    const nextOnboardingState = getSavedOnboardingState(normalizedUser.email)
    setOnboardingState(nextOnboardingState)
    setCompanyName(getSavedCompanyName(normalizedUser.email))
    setClientFirstName(getSavedClientFirstName(normalizedUser.email, normalizedUser.fullName?.trim()?.split(/\s+/)?.[0] || 'Client'))

    const normalizedRole = normalizeRole(normalizedUser.role, normalizedUser.email)
    const shouldOpenPublicHome = (
      normalizedRole === 'client'
      && Boolean(nextOnboardingState.completed || nextOnboardingState.skipped)
    )
    const defaultPage = getDefaultPageForRole(normalizedUser.role)
    setActivePage(defaultPage)
    setActiveFolderRoute(null)
    setPublicSitePage('home')
    setIsPublicSiteView(shouldOpenPublicHome)
    try {
      if (shouldOpenPublicHome) {
        history.replaceState({}, '', '/')
      } else {
        history.replaceState({}, '', defaultPage === 'dashboard' ? '/dashboard' : `/${defaultPage}`)
      }
    } catch {
      // ignore
    }
  }

  const issueEmailOtp = async (email, purpose = 'login') => {
    const normalizedEmail = email?.trim()?.toLowerCase()
    if (!normalizedEmail) {
      return { ok: false, message: 'Email is required.' }
    }
    const startedAt = Date.now()

    let result = {
      ok: false,
      message: 'Unable to send OTP right now.',
      previewOtp: '',
      dispatchQueued: false,
      deliveryError: '',
    }
    try {
      const response = await apiFetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, purpose }),
      })
      const payload = await response.json().catch(() => ({}))
      const responseMessage = String(payload?.message || '').trim()
      const previewOtp = String(payload?.previewOtp || '').trim()
      const deliveryError = String(payload?.deliveryError || '').trim()
      const dispatchQueued = payload?.dispatchQueued !== false
      result = {
        ok: response.ok,
        message: responseMessage || (response.ok ? 'OTP sent successfully.' : 'Unable to send OTP right now.'),
        previewOtp,
        dispatchQueued,
        deliveryError,
      }
    } catch {
      result = {
        ok: false,
        message: 'Unable to send OTP right now.',
        previewOtp: '',
        dispatchQueued: false,
        deliveryError: '',
      }
    }

    const minimumDelayMs = getNetworkAwareDurationMs('search')
    const elapsedMs = Date.now() - startedAt
    const remainingMs = Math.max(0, minimumDelayMs - elapsedMs)
    if (remainingMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, remainingMs))
    }

    if (result.ok && STRICT_BACKEND_DELIVERY && result.dispatchQueued === false) {
      return {
        ok: false,
        message: result.deliveryError || 'OTP delivery failed. Please try again shortly.',
        previewOtp: '',
        dispatchQueued: false,
        deliveryError: result.deliveryError || 'otp-delivery-failed',
      }
    }

    return result
  }

  const issuePasswordResetLink = async (email) => {
    const normalizedEmail = email?.trim()?.toLowerCase()
    if (!normalizedEmail) return { ok: false, message: 'Email is required.' }
    const startedAt = Date.now()

    const resetLink = buildClientResetPasswordLink(normalizedEmail)

    let result = { ok: false, message: 'Unable to send password reset link.' }
    try {
      const response = await apiFetch('/api/auth/send-password-reset-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          resetLink,
        }),
      })
      if (!response.ok) {
        const errorMessage = await readErrorMessageFromResponse(response)
        result = { ok: false, message: errorMessage || 'Unable to send password reset link.' }
      } else {
        const payload = await response.json().catch(() => ({}))
        const successMessage = String(payload?.message || '').trim()
        const dispatchQueued = payload?.dispatchQueued !== false
        if (!dispatchQueued && STRICT_BACKEND_DELIVERY) {
          result = {
            ok: false,
            message: 'Password reset delivery failed. Please try again shortly.',
          }
        } else {
          result = { ok: true, message: successMessage || 'Password reset link sent. Please check your email.' }
        }
      }
    } catch {
      result = { ok: false, message: 'Unable to send password reset link.' }
    }

    const minimumDelayMs = getNetworkAwareDurationMs('search')
    const elapsedMs = Date.now() - startedAt
    const remainingMs = Math.max(0, minimumDelayMs - elapsedMs)
    if (remainingMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, remainingMs))
    }

    return result
  }

  const issueEmailVerificationLink = async (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!normalizedEmail) return { ok: false, message: 'Email is required.' }
    const startedAt = Date.now()

    const verificationLink = buildClientEmailVerificationLink(normalizedEmail)

    let result = { ok: false, message: 'Unable to send verification email right now.' }
    try {
      const response = await apiFetch('/api/auth/send-email-verification-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          verificationLink,
        }),
      })
      if (!response.ok) {
        const errorMessage = await readErrorMessageFromResponse(response)
        result = {
          ok: false,
          message: errorMessage || 'Unable to send verification email right now.',
        }
      } else {
        const payload = await response.json().catch(() => ({}))
        const successMessage = String(payload?.message || '').trim()
        const dispatchQueued = payload?.dispatchQueued !== false
        if (!dispatchQueued && STRICT_BACKEND_DELIVERY) {
          result = {
            ok: false,
            message: 'Verification email delivery failed. Please try again shortly.',
          }
        } else {
          result = {
            ok: true,
            message: successMessage || 'Verification email sent successfully.',
          }
        }
      }
    } catch {
      result = { ok: false, message: 'Unable to send verification email right now.' }
    }

    const minimumDelayMs = getNetworkAwareDurationMs('search')
    const elapsedMs = Date.now() - startedAt
    const remainingMs = Math.max(0, minimumDelayMs - elapsedMs)
    if (remainingMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, remainingMs))
    }

    return result
  }

  const authenticatePasswordCredentials = async ({ email = '', password = '' } = {}) => {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedPassword = String(password || '')
    if (!normalizedEmail || !normalizedPassword) {
      return {
        ok: false,
        locked: false,
        status: 400,
        idToken: '',
        uid: '',
        email: '',
        message: 'Email and password are required.',
      }
    }

    try {
      const response = await apiFetch('/api/auth/authenticate-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          password: normalizedPassword,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          ok: false,
          locked: response.status === 423,
          status: response.status,
          idToken: '',
          uid: '',
          email: normalizedEmail,
          message: String(payload?.message || '').trim(),
        }
      }
      return {
        ok: true,
        locked: false,
        status: response.status,
        idToken: String(payload?.idToken || '').trim(),
        uid: String(payload?.uid || '').trim(),
        email: String(payload?.email || normalizedEmail).trim().toLowerCase(),
        message: String(payload?.message || '').trim(),
      }
    } catch {
      return {
        ok: false,
        locked: false,
        status: 0,
        idToken: '',
        uid: '',
        email: normalizedEmail,
        message: 'Unable to verify credentials right now.',
      }
    }
  }

  const persistClientProfileNamesToBackend = async ({
    authorizationToken = '',
    firstName = '',
    lastName = '',
    otherNames = '',
    signupCapture = null,
  } = {}) => {
    const token = String(authorizationToken || '').trim()
    if (!token) return { ok: false, status: 0 }

    const payload = {
      firstName: sanitizeProfileNameFieldForBackend(firstName),
      lastName: sanitizeProfileNameFieldForBackend(lastName),
      otherNames: sanitizeProfileNameFieldForBackend(otherNames),
    }
    const normalizedSignupCapture = normalizeSignupCapturePayload(signupCapture)
    if (hasSignupCapturePayloadValues(normalizedSignupCapture)) {
      payload.signupCapture = normalizedSignupCapture
    }

    if (!payload.firstName && !payload.lastName && !payload.otherNames && !payload.signupCapture) {
      return { ok: false, status: 0 }
    }

    try {
      const response = await apiFetch('/api/users/me/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
      return { ok: response.ok, status: response.status }
    } catch {
      return { ok: false, status: 0 }
    }
  }

  const fetchOwnerBootstrapStatus = async () => {
    try {
      const response = await apiFetch('/api/auth/bootstrap-owner-status', {
        method: 'GET',
      })
      if (!response.ok) {
        const errorMessage = await readErrorMessageFromResponse(response)
        return {
          ok: false,
          canBootstrap: false,
          adminAccountCount: 0,
          message: errorMessage || 'Unable to verify owner bootstrap status right now.',
        }
      }
      const payload = await response.json().catch(() => ({}))
      return {
        ok: true,
        canBootstrap: Boolean(payload?.canBootstrapOwner),
        adminAccountCount: Math.max(0, Number(payload?.adminAccountCount || 0)),
        message: String(payload?.message || '').trim(),
      }
    } catch {
      return {
        ok: false,
        canBootstrap: false,
        adminAccountCount: 0,
        message: 'Unable to verify owner bootstrap status right now.',
      }
    }
  }

  const handleSocialLogin = async (provider, providedNameDraft = null) => {
    const normalizedProvider = String(provider || '').trim().toLowerCase()
    logGoogleAppDebug('handleSocialLogin:start', {
      provider: normalizedProvider,
      authMode,
      hasProvidedNameDraft: Boolean(providedNameDraft),
      hasGoogleContext: Boolean(pendingGoogleSocialAuth),
    })
    if (normalizedProvider !== 'google') {
      showToast('error', 'Authentication failed. Please try again.')
      return { ok: false, message: 'Authentication failed. Please try again.' }
    }

    const resolvedMode = String(authMode || 'login').trim().toLowerCase()
    const isSignupMode = resolvedMode === 'signup'
    const signupCapture = isSignupMode
      ? buildSignupCapturePayload({
          signupSource: `${normalizedProvider || 'social'}-signup`,
          capturePage: 'signup',
          capturePath: '/signup',
        })
      : null
    try {
      const isSubmittedFromPrompt = (
        typeof providedNameDraft === 'string'
        || (providedNameDraft && typeof providedNameDraft === 'object')
      )

      let googleContext = null

      if (isSubmittedFromPrompt) {
        googleContext = pendingGoogleSocialAuth
        if (!googleContext?.idToken || !googleContext?.email) {
          setPendingGoogleSocialAuth(null)
          return { ok: false, message: 'Google session expired. Please continue with Google again.' }
        }
      } else {
        const redirectResult = await startGoogleSignInRedirect({
          intent: isSignupMode ? 'signup' : 'login',
        })
        if (!redirectResult.ok) {
          return { ok: false, message: redirectResult.message || 'Unable to authenticate with Google right now.' }
        }
        googleContext = {
          provider: 'google',
          idToken: redirectResult.idToken,
          uid: redirectResult.uid,
          email: redirectResult.email,
          photoURL: redirectResult.photoURL,
          profile: normalizeClientNameDraft({
            fullName: redirectResult.fullName,
            firstName: redirectResult.firstName,
            lastName: redirectResult.lastName,
            otherNames: redirectResult.otherNames,
          }),
        }
      }

      if (!googleContext?.idToken || !googleContext?.email) {
        setPendingGoogleSocialAuth(null)
        return { ok: false, message: 'Google sign-in session is incomplete. Please try again.' }
      }

      const submittedProfile = normalizeClientNameDraft(
        typeof providedNameDraft === 'string'
          ? { fullName: providedNameDraft }
          : (providedNameDraft || {}),
      )
      const contextProfile = normalizeClientNameDraft(googleContext.profile || {})
      const effectiveProfile = normalizeClientNameDraft({
        firstName: submittedProfile.firstName || contextProfile.firstName,
        lastName: submittedProfile.lastName || contextProfile.lastName,
        otherNames: submittedProfile.otherNames || contextProfile.otherNames,
        fullName: submittedProfile.fullName || contextProfile.fullName,
      })

      const resolvedFullName = String(
        effectiveProfile.fullName
        || googleContext?.profile?.fullName
        || googleContext.email?.split('@')?.[0]
        || 'Client User',
      ).trim()

      const identityResult = await resolveIdentityFromAuthTokens({ idToken: googleContext.idToken })
      logGoogleAppDebug('verify-token', {
        ok: identityResult.ok,
        email: identityResult.email,
        roles: identityResult.roles,
        message: identityResult.message || '',
      })
      if (!identityResult.ok) {
        setPendingGoogleSocialAuth(null)
        return { ok: false, message: identityResult.message || 'Unable to verify token.' }
      }

      const resolvedEmail = String(identityResult.email || googleContext.email || '').trim().toLowerCase()
      if (!resolvedEmail) {
        setPendingGoogleSocialAuth(null)
        return { ok: false, message: 'Google account email is required to continue.' }
      }

      const socialAccountStatus = await fetchSocialAuthAccountStatus({
        idToken: googleContext.idToken,
        provider: 'google',
      })
      const socialAccountRecord = socialAccountStatus?.data && typeof socialAccountStatus.data === 'object'
        ? socialAccountStatus.data
        : {}
      const registeredProvider = String(socialAccountRecord.provider || '').trim().toLowerCase()
      const accountExistsForGoogleEmail = Boolean(socialAccountRecord.exists)
      const accountMatchesGoogle = Boolean(socialAccountRecord.matchesProvider)

      if (!socialAccountStatus.ok) {
        if (isSignupMode) setPendingGoogleSocialAuth(null)
        return {
          ok: false,
          message: String(socialAccountRecord.message || 'Unable to verify your Google account right now.').trim(),
        }
      }

      if (!isSignupMode && accountExistsForGoogleEmail && !accountMatchesGoogle) {
        return {
          ok: false,
          message: registeredProvider === 'email-password'
            ? 'This email is registered with email and password. Sign in with your email address and password instead.'
            : 'This email is already linked to a different sign-in method. Use the original sign-in method for this account.',
        }
      }

      if (isSignupMode && accountExistsForGoogleEmail && accountMatchesGoogle) {
        if (isSignupMode) setPendingGoogleSocialAuth(null)
        return {
          ok: false,
          message: 'This Google account is already registered. Sign in instead.',
        }
      }

      if (isSignupMode && accountExistsForGoogleEmail && !accountMatchesGoogle) {
        if (isSignupMode) setPendingGoogleSocialAuth(null)
        return {
          ok: false,
          message: registeredProvider === 'email-password'
            ? 'An account already exists for this email. Sign in with your email and password instead.'
            : 'This email is already linked to a different sign-in method. Use the original sign-in method for this account.',
        }
      }

      const resolvedRoles = Array.isArray(identityResult.roles)
        ? identityResult.roles.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean)
        : []
      const hasAdminRole = resolvedRoles.includes('admin')
      if (hasAdminRole) {
        if (isSignupMode) setPendingGoogleSocialAuth(null)
        return { ok: false, message: 'This Google account has admin access. Use /admin/login.' }
      }

      const fallbackRole = 'client'
      const shouldCreateGoogleClient = !accountExistsForGoogleEmail
      const shouldSeedGoogleOnboarding = isSignupMode || shouldCreateGoogleClient
      const shouldConfirmGoogleProfile = !isSubmittedFromPrompt && shouldSeedGoogleOnboarding
      if (shouldConfirmGoogleProfile) {
        setPendingGoogleSocialAuth(googleContext)
        return {
          ok: false,
          requiresProfileCompletion: true,
          provider: normalizedProvider,
          profile: effectiveProfile,
        }
      }

      if (shouldSeedGoogleOnboarding && (!effectiveProfile.firstName || !effectiveProfile.lastName)) {
        return { ok: false, message: 'First and last name are required to continue.' }
      }

      const googlePhotoUrl = normalizePersistentClientAssetUrl(googleContext.photoURL || '')
      const existingAccountHasPassword = socialAccountRecord.hasPassword === undefined
        ? false
        : Boolean(socialAccountRecord.hasPassword)
      const registerResult = await registerAuthAccountRecord({
        uid: identityResult.uid || googleContext.uid || '',
        email: resolvedEmail,
        fullName: resolvedFullName,
        role: fallbackRole,
        provider: 'google',
        hasPassword: accountExistsForGoogleEmail ? existingAccountHasPassword : false,
        status: 'active',
        emailVerified: true,
      })
      logGoogleAppDebug('register-account', {
        ok: registerResult.ok,
        status: registerResult.status,
        data: registerResult.data || null,
      })
      if (!registerResult.ok) {
        if (isSignupMode) setPendingGoogleSocialAuth(null)
        return {
          ok: false,
          message: String(registerResult?.data?.message || 'Unable to register account right now.').trim(),
        }
      }

      const rememberSession = true
      const loginSessionResult = await recordAuthLoginSession({
        uid: identityResult.uid || googleContext.uid || '',
        email: resolvedEmail,
        role: fallbackRole,
        loginMethod: 'google',
        remember: rememberSession,
        mfaCompleted: true,
      })
      logGoogleAppDebug('login-session', {
        ok: loginSessionResult.ok,
        status: loginSessionResult.status,
        data: loginSessionResult.data || null,
      })
      if (!loginSessionResult.ok) {
        if (isSignupMode) setPendingGoogleSocialAuth(null)
        return {
          ok: false,
          message: String(loginSessionResult?.data?.message || 'Unable to start login session.').trim(),
        }
      }
      const issuedSessionId = String(loginSessionResult?.data?.session?.sessionId || '').trim()

      const hydratedProfile = await hydrateAuthenticatedUserFromBackend({
        fallbackUid: identityResult.uid || googleContext.uid || '',
        fallbackEmail: resolvedEmail,
        fallbackFullName: resolvedFullName,
        fallbackRole,
        authorizationToken: googleContext.idToken,
        signupCapture,
      })
      logGoogleAppDebug('hydrate-user', {
        ok: hydratedProfile.ok,
        user: hydratedProfile.user || null,
      })

      const registeredAccountPayload = registerResult?.data?.account && typeof registerResult.data.account === 'object'
        ? registerResult.data.account
        : (registerResult?.data && typeof registerResult.data === 'object' ? registerResult.data : {})
      const googleAccountHasPassword = registeredAccountPayload.hasPassword === undefined
        ? existingAccountHasPassword
        : Boolean(registeredAccountPayload.hasPassword)
      const user = applyClientTeamAccessProfile(normalizeUser({
        ...(hydratedProfile.user || {}),
        fullName: String(hydratedProfile?.user?.fullName || resolvedFullName).trim() || resolvedFullName,
        authProvider: 'google',
        provider: 'google',
        hasPassword: googleAccountHasPassword,
        profilePhoto: googlePhotoUrl || hydratedProfile?.user?.profilePhoto || '',
        sessionId: issuedSessionId,
        firebaseIdToken: googleContext.idToken,
      }))
      logGoogleAppDebug('persist-user', {
        email: user?.email,
        role: user?.role,
        sessionId: user?.sessionId,
      })

      persistAuthUser(user, rememberSession)
      setApiAccessToken(googleContext.idToken, { remember: rememberSession })
      syncProfileToSettings(user.fullName, user.email, effectiveProfile)
      if (fallbackRole === 'client' && googlePhotoUrl) {
        setProfilePhoto(googlePhotoUrl)
        setClientWorkspaceCache(user.email, { profilePhoto: googlePhotoUrl })
      }

      if (fallbackRole === 'client') {
        await persistClientProfileNamesToBackend({
          authorizationToken: googleContext.idToken,
          firstName: effectiveProfile.firstName,
          lastName: effectiveProfile.lastName,
          otherNames: effectiveProfile.otherNames,
          signupCapture,
        })

        if (shouldSeedGoogleOnboarding) {
          persistOnboardingState({
            currentStep: 1,
            completed: false,
            skipped: false,
            verificationPending: false,
            data: {
              ...defaultOnboardingData,
              firstName: effectiveProfile.firstName || '',
              lastName: effectiveProfile.lastName || '',
              otherNames: effectiveProfile.otherNames || '',
              email: user.email || '',
              phone: '',
              roleInCompany: '',
              businessName: '',
              primaryContact: user.fullName || resolvedFullName,
            },
          }, user.email)
          appendClientActivityLog(user.email, {
            actorName: user.fullName || 'Client User',
            actorRole: 'client',
            action: 'Client account created',
            details: isSignupMode
              ? 'Client completed Google signup.'
              : 'Client created a new account via Google login.',
          })
        } else {
          appendClientActivityLog(user.email, {
            actorName: user.fullName || 'Client User',
            actorRole: 'client',
            action: 'Client login',
            details: 'Client authenticated successfully via Google.',
          })
        }

        await refreshClientDashboardOverview({ authorizationToken: googleContext.idToken })
      }

      setPendingGoogleSocialAuth(null)
      showToast('success', 'Authentication successful.')
      return { ok: true }
    } catch (error) {
      logGoogleAppDebug('handleSocialLogin:failed', {
        message: String(error?.message || '').trim(),
      })
      if (isSignupMode) setPendingGoogleSocialAuth(null)
      const fallbackMessage = 'Unable to authenticate with Google right now. Please try again.'
      return {
        ok: false,
        message: String(error?.message || '').trim() || fallbackMessage,
      }
    }
  }

  const handleLogin = async ({ email, password, remember }) => {
    const loginFailureMessage = 'Incorrect email or password'
    const loginLockoutMessage = 'Your account has been temporarily locked due to multiple failed login attempts.'
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedPassword = String(password || '')
    if (!normalizedEmail || !normalizedPassword) {
      return { ok: false, message: loginFailureMessage }
    }

    const firebaseAuthResult = await authenticatePasswordCredentials({
      email: normalizedEmail,
      password: normalizedPassword,
    })
    if (!firebaseAuthResult.ok || !firebaseAuthResult.idToken) {
      return {
        ok: false,
        message: firebaseAuthResult.locked
          ? loginLockoutMessage
          : loginFailureMessage,
      }
    }

    const identityResult = await resolveIdentityFromAuthTokens({ idToken: firebaseAuthResult.idToken })
    if (!identityResult.ok) {
      return { ok: false, message: identityResult.message || 'Unable to verify token.' }
    }

    const resolvedRoles = Array.isArray(identityResult.roles)
      ? identityResult.roles.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean)
      : []
    if (resolvedRoles.includes('admin')) {
      return { ok: false, message: 'Use /admin/login to access the Admin Portal.' }
    }

    let accountSettings = readScopedAccountSettings(normalizedEmail)
    if (!(accountSettings.twoStepEnabled && accountSettings.verifiedPhoneNumber)) {
      const workspaceResult = await fetchClientWorkspaceFromBackend({
        authorizationToken: firebaseAuthResult.idToken,
      })
      const workspace = workspaceResult?.ok && workspaceResult?.data?.workspace && typeof workspaceResult.data.workspace === 'object'
        ? workspaceResult.data.workspace
        : {}
      accountSettings = normalizeAccountSettings(workspace.accountSettings || {})
    }
    const smsTwoStepEnabled = Boolean(accountSettings.twoStepEnabled && accountSettings.verifiedPhoneNumber)

    if (smsTwoStepEnabled) {
      const smsOtpResult = await issueSmsOtpChallenge({
        phoneNumber: accountSettings.verifiedPhoneNumber,
        purpose: 'mfa',
        email: firebaseAuthResult.email || normalizedEmail,
      })
      if (!smsOtpResult.ok) {
        return { ok: false, message: smsOtpResult.message || 'Unable to send verification code right now.' }
      }
      setOtpChallenge({
        requestId: Date.now(),
        purpose: 'client-login',
        verificationPurpose: 'mfa',
        transport: 'sms',
        phoneNumber: accountSettings.verifiedPhoneNumber,
        email: firebaseAuthResult.email || normalizedEmail,
        remember: Boolean(remember),
        role: 'client',
        firebaseIdToken: firebaseAuthResult.idToken,
        uid: firebaseAuthResult.uid,
        previewOtp: smsOtpResult.previewOtp || '',
        dispatchQueued: true,
        deliveryError: '',
      })
      return { ok: true, requiresOtp: true }
    }

    const otpResult = await issueEmailOtp(normalizedEmail, 'client-login')
    if (!otpResult.ok) {
      return { ok: false, message: otpResult.message || 'Unable to send OTP right now.' }
    }
    setOtpChallenge({
      requestId: Date.now(),
      purpose: 'client-login',
      verificationPurpose: 'client-login',
      transport: 'email',
      email: firebaseAuthResult.email || normalizedEmail,
      remember: Boolean(remember),
      role: 'client',
      firebaseIdToken: firebaseAuthResult.idToken,
      uid: firebaseAuthResult.uid,
      previewOtp: otpResult.previewOtp || '',
      dispatchQueued: otpResult.dispatchQueued !== false,
      deliveryError: otpResult.deliveryError || '',
    })
    return { ok: true, requiresOtp: true }
  }

  const handleAdminLogin = async ({ email, password, remember, ownerPrivateKey }) => {
    const loginFailureMessage = 'Admin email or password incorrect.'
    const loginLockoutMessage = 'Your account has been temporarily locked due to multiple failed login attempts.'
    const normalizedEmail = email?.trim()?.toLowerCase()
    if (!normalizedEmail || !password) {
      return { ok: false, message: loginFailureMessage }
    }

    const firebaseAuthResult = await authenticatePasswordCredentials({
      email: normalizedEmail,
      password,
    })
    if (!firebaseAuthResult.ok || !firebaseAuthResult.idToken) {
      return {
        ok: false,
        message: firebaseAuthResult.locked ? loginLockoutMessage : loginFailureMessage,
      }
    }

    const persistedAdminAccount = getSavedAccounts().find((account) => (
      String(account?.email || '').trim().toLowerCase() === normalizedEmail
      && normalizeRole(account?.role, account?.email || '') === 'admin'
    ))
    const normalizedPersistedAdminAccount = persistedAdminAccount
      ? normalizeAdminAccount(persistedAdminAccount)
      : null
    const desiredBackendAdminRole = normalizedPersistedAdminAccount
      ? deriveBackendAdminRoleFromLevel(normalizedPersistedAdminAccount.adminLevel)
      : 'admin'

    if (normalizedPersistedAdminAccount) {
      const upgradeResult = await registerAuthAccountRecord({
        uid: firebaseAuthResult.uid || '',
        email: firebaseAuthResult.email || normalizedEmail,
        fullName: normalizedPersistedAdminAccount.fullName || normalizedEmail,
        role: desiredBackendAdminRole,
        provider: 'email-password',
        status: 'active',
      })
      if (!upgradeResult.ok) {
        return { ok: false, message: loginFailureMessage }
      }
    }

    const adminAccountStatus = await fetchSocialAuthAccountStatus({
      idToken: firebaseAuthResult.idToken,
      provider: 'email-password',
    })
    const normalizedBackendAccountRole = String(adminAccountStatus?.data?.role || '').trim().toLowerCase()
    const isBackendAdminAccount = (
      adminAccountStatus.ok
      && Boolean(adminAccountStatus?.data?.accountExists)
      && (
        normalizedBackendAccountRole === 'admin'
        || normalizedBackendAccountRole === 'owner'
        || normalizedBackendAccountRole === 'superadmin'
      )
      && String(adminAccountStatus?.data?.status || 'active').trim().toLowerCase() === 'active'
    )
    if (!isBackendAdminAccount) {
      return { ok: false, message: loginFailureMessage }
    }

    if (normalizedBackendAccountRole === 'owner') {
      const normalizedOwnerPrivateKey = String(ownerPrivateKey || '').trim()
      const expectedOwnerPrivateKey = String(normalizedPersistedAdminAccount?.ownerPrivateKey || '').trim()
      if (!normalizedOwnerPrivateKey || !expectedOwnerPrivateKey || normalizedOwnerPrivateKey !== expectedOwnerPrivateKey) {
        return { ok: false, message: loginFailureMessage }
      }
    }

    const otpResult = await issueEmailOtp(normalizedEmail, 'admin-login')
    if (!otpResult.ok) {
      return { ok: false, message: otpResult.message || 'Unable to send OTP right now.' }
    }
    setOtpChallenge({
      requestId: Date.now(),
      purpose: 'admin-login',
      email: firebaseAuthResult.email || normalizedEmail,
      remember: Boolean(remember),
      role: 'admin',
      firebaseIdToken: firebaseAuthResult.idToken,
      uid: firebaseAuthResult.uid,
      ownerPrivateKey: String(ownerPrivateKey || '').trim(),
      backendRole: normalizedBackendAccountRole || desiredBackendAdminRole,
      previewOtp: otpResult.previewOtp || '',
      dispatchQueued: otpResult.dispatchQueued !== false,
      deliveryError: otpResult.deliveryError || '',
    })
    return { ok: true, requiresOtp: true }
  }

  const handleLogout = () => {
    setIsLogoutConfirmOpen(true)
  }

  const cancelLogout = () => {
    if (isLoggingOut) return
    setIsLogoutConfirmOpen(false)
  }

  const confirmLogout = async () => {
    if (isLoggingOut) return
    const wasAdmin = currentUserRole === 'admin'
    setIsLoggingOut(true)
    await new Promise((resolve) => setTimeout(resolve, getNetworkAwareDurationMs('search')))
    try {
      const activeSessionId = String(getApiSessionId() || '').trim()
      await apiFetch('/api/auth/logout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'logout',
          ...(activeSessionId ? { sessionId: activeSessionId } : {}),
        }),
      })
    } catch {
      // Best-effort remote logout; local cleanup continues.
    }
    setIsLogoutConfirmOpen(false)
    setIsModalOpen(false)
    setIsAuthenticated(false)
    setAuthUser(null)
    setImpersonationSession(null)
    setAdminImpersonationSession(null)
    setAdminSetupSuccessState(null)
    setPendingGoogleSocialAuth(null)
    setPendingImpersonationClient(null)
    persistImpersonationSession(null)
    persistAdminImpersonationSession(null)
    setAuthMode('login')
    setActivePage(getDefaultPageForRole('client'))
    setActiveFolderRoute(null)
    sessionStorage.removeItem('kiaminaAuthUser')
    localStorage.removeItem('kiaminaAuthUser')
    clearApiAccessToken()
    clearApiSessionId()
    await clearFirebaseAuthSession()
    setIsLoggingOut(false)
    if (wasAdmin) {
      navigateToAdminLogin({ replace: true })
    } else {
      navigateToAuth('login', { replace: true })
    }
    showToast('success', 'You have successfully logged out.')
  }

  const handleDeleteClientAccount = async ({
    reason = '',
    reasonOther = '',
    retentionIntent = '',
    acknowledgedPermanentDeletion = false,
  } = {}) => {
    const normalizedEmail = String(authUser?.email || '').trim().toLowerCase()
    if (!normalizedEmail || currentUserRole !== 'client') {
      return { ok: false, message: 'Unable to delete this account.' }
    }
    if (!acknowledgedPermanentDeletion) {
      return { ok: false, message: 'You must acknowledge permanent deletion to continue.' }
    }

    const deletionReason = String(reason || '').trim() || 'Not provided'
    const deletionReasonDetail = String(reasonOther || '').trim()
    const retentionResponse = String(retentionIntent || '').trim() || 'Not provided'

    try {
      const deleteUserResponse = await apiFetch('/api/users/me', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: deletionReason,
          reasonOther: deletionReasonDetail,
          retentionIntent: retentionResponse,
        }),
      })
      if (!deleteUserResponse.ok) {
        const message = await readErrorMessageFromResponse(deleteUserResponse)
        if (deleteUserResponse.status === 401) {
          return { ok: false, message: message || 'Please sign in again before deleting your account.' }
        }
        return { ok: false, message: message || 'Unable to delete account right now.' }
      }
    } catch {
      return { ok: false, message: 'Unable to delete account right now.' }
    }

    const accounts = getSavedAccounts()
    const targetAccount = accounts.find((account) => (
      String(account?.email || '').trim().toLowerCase() === normalizedEmail
    ))
    if (targetAccount) {
      const nextAccounts = accounts.filter((account) => (
        String(account?.email || '').trim().toLowerCase() !== normalizedEmail
      ))
      localStorage.setItem('kiaminaAccounts', JSON.stringify(nextAccounts))
    }
    removeScopedClientArtifacts(normalizedEmail)

    appendAdminActivityLog({
      adminName: 'Client Self-Service',
      adminEmail: normalizedEmail,
      adminLevel: ADMIN_LEVELS.SUPER,
      action: 'Client account deleted (backend)',
      affectedUser: targetAccount?.businessName || targetAccount?.fullName || normalizedEmail,
      details: [
        `Reason: ${deletionReason}${deletionReasonDetail ? ` (${deletionReasonDetail})` : ''}`,
        `Retention response: ${retentionResponse}`,
        'Client confirmed permanent account deletion.',
      ].join(' '),
    })

    setIsLogoutConfirmOpen(false)
    setIsModalOpen(false)
    setIsAuthenticated(false)
    setAuthUser(null)
    setImpersonationSession(null)
    setAdminImpersonationSession(null)
    setPendingImpersonationClient(null)
    persistImpersonationSession(null)
    persistAdminImpersonationSession(null)
    setAuthMode('login')
    setActivePage(getDefaultPageForRole('client'))
    setActiveFolderRoute(null)
    sessionStorage.removeItem('kiaminaAuthUser')
    localStorage.removeItem('kiaminaAuthUser')
    clearApiAccessToken()
    clearApiSessionId()
    navigateToAuth('login', { replace: true })
    showToast('success', 'Your account was deleted permanently.')
    return { ok: true }
  }

  useEffect(() => {
    if (!isAuthenticated || currentUserRole === 'admin' || !authUser?.email) return undefined

    const normalizedEmail = String(authUser.email || '').trim().toLowerCase()
    if (!normalizedEmail) return undefined

    const sessionIssuedAtMs = Date.parse(authUser.sessionIssuedAtIso || '') || 0
    const shouldForceLogout = () => {
      const control = readClientSessionControl()
      const globalLogoutAtMs = Date.parse(control.globalLogoutAtIso || '') || 0
      const userLogoutAtMs = Date.parse(control.byEmail?.[normalizedEmail] || '') || 0
      return Math.max(globalLogoutAtMs, userLogoutAtMs) > sessionIssuedAtMs
    }

    const forceClientLogout = () => {
      setIsLogoutConfirmOpen(false)
      setIsModalOpen(false)
      setIsAuthenticated(false)
      setAuthUser(null)
      setImpersonationSession(null)
      setAdminImpersonationSession(null)
      setPendingImpersonationClient(null)
      persistImpersonationSession(null)
      persistAdminImpersonationSession(null)
      setAuthMode('login')
      setActivePage(getDefaultPageForRole('client'))
      setActiveFolderRoute(null)
      sessionStorage.removeItem('kiaminaAuthUser')
      localStorage.removeItem('kiaminaAuthUser')
      clearApiAccessToken()
      clearApiSessionId()
      navigateToAuth('login', { replace: true })
      showToast('error', 'Your session was ended by an administrator. Please log in again.')
    }

    if (shouldForceLogout()) {
      forceClientLogout()
      return undefined
    }

    const handleStorage = (event) => {
      if (event.key !== CLIENT_SESSION_CONTROL_STORAGE_KEY) return
      if (shouldForceLogout()) forceClientLogout()
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [isAuthenticated, currentUserRole, authUser?.email, authUser?.sessionIssuedAtIso])

  useEffect(() => {
    deliveredBriefNotificationIdsRef.current = new Set()
  }, [normalizedScopedClientEmail, isAuthenticated, currentUserRole])

  useEffect(() => {
    if (!isAuthenticated || currentUserRole === 'admin') {
      setUserNotifications([])
      return
    }
    const normalizedEmail = String(normalizedScopedClientEmail || '').trim().toLowerCase()
    if (!normalizedEmail) {
      setUserNotifications([])
      return
    }
    setUserNotifications(readClientNotificationInbox(normalizedEmail))
  }, [isAuthenticated, currentUserRole, normalizedScopedClientEmail])

  useEffect(() => {
    if (!isAuthenticated || currentUserRole === 'admin') return
    const normalizedEmail = String(normalizedScopedClientEmail || '').trim().toLowerCase()
    if (!normalizedEmail) return
    persistClientNotificationInbox(normalizedEmail, userNotifications)
  }, [userNotifications, isAuthenticated, currentUserRole, normalizedScopedClientEmail])

  useEffect(() => {
    if (!isAuthenticated || (isAdminView && !isImpersonatingClient)) {
      setClientDashboardOverview(null)
      return undefined
    }

    const authorizationToken = String(authUser?.firebaseIdToken || '').trim()
    if (!authorizationToken) {
      setClientDashboardOverview(null)
      return undefined
    }

    let isDisposed = false
    const loadOverview = async () => {
      const response = await fetchClientDashboardOverviewFromBackend({ authorizationToken })
      if (isDisposed || !response.ok || !response.data || typeof response.data !== 'object') return
      setClientDashboardOverview(response.data)
    }

    loadOverview()
    const intervalId = window.setInterval(loadOverview, 45000)
    return () => {
      isDisposed = true
      window.clearInterval(intervalId)
    }
  }, [
    isAuthenticated,
    isAdminView,
    isImpersonatingClient,
    normalizedScopedClientEmail,
    authUser?.firebaseIdToken,
  ])

  useEffect(() => {
    if (!isAuthenticated || currentUserRole === 'admin') return undefined
    const handlePrimer = () => {
      if (isClientNotificationSoundPrimed()) return
      primeClientNotificationSound()
    }
    window.addEventListener('pointerdown', handlePrimer, { passive: true })
    window.addEventListener('keydown', handlePrimer, { passive: true })
    window.addEventListener('touchstart', handlePrimer, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', handlePrimer)
      window.removeEventListener('keydown', handlePrimer)
      window.removeEventListener('touchstart', handlePrimer)
    }
  }, [isAuthenticated, currentUserRole])

  useEffect(() => {
    if (!isAuthenticated || currentUserRole === 'admin') return undefined
    const normalizedEmail = String(normalizedScopedClientEmail || '').trim().toLowerCase()
    if (!normalizedEmail) return undefined

    const briefStorageKey = getScopedStorageKey(CLIENT_BRIEF_NOTIFICATIONS_STORAGE_KEY, normalizedEmail)
    const syncBriefNotifications = () => {
      const queued = readClientBriefNotifications(normalizedEmail)
      if (!queued.length) return
      const unseen = queued.filter((item, index) => {
        const id = String(item?.id || `CBN-FALLBACK-${index}`).trim()
        if (!id || deliveredBriefNotificationIdsRef.current.has(id)) return false
        deliveredBriefNotificationIdsRef.current.add(id)
        return true
      })
      if (unseen.length === 0) return

      const inboxSnapshot = readClientNotificationInbox(normalizedEmail)
      const inboxById = new Map(
        inboxSnapshot
          .map((entry) => normalizeClientNotificationEntry(entry))
          .filter(Boolean)
          .map((entry) => [entry.id, entry]),
      )
      const clientNotificationSettings = readClientNotificationSettings(normalizedEmail)
      const mapped = unseen
        .map((item, index) => mapNotificationRecordToClientEntry(item, index, inboxById))
        .filter((entry) => entry && isClientNotificationEnabled(entry, clientNotificationSettings))
      if (mapped.length === 0) return

      const freshUnread = mapped.filter((entry) => !entry.read && !inboxById.has(entry.id))
      setUserNotifications((previous) => mergeClientNotifications(previous, mapped))
      if (freshUnread.length > 0) {
        if (isClientNotificationSoundEnabled(clientNotificationSettings)) {
          playClientNotificationSound()
        }
        const previewMessage = freshUnread[0]?.message || 'You have a new notification.'
        showToast('info', previewMessage.length > 140 ? `${previewMessage.slice(0, 137)}...` : previewMessage)
      }
    }

    syncBriefNotifications()
    const intervalId = window.setInterval(syncBriefNotifications, 4000)
    const handleStorage = (event) => {
      if (!event.key || event.key === briefStorageKey) {
        syncBriefNotifications()
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.clearInterval(intervalId)
    }
  }, [isAuthenticated, currentUserRole, normalizedScopedClientEmail])

  const handleSignup = async ({
    firstName,
    lastName,
    otherNames,
    phoneNumber,
    companyName,
    businessType,
    country,
    email,
    password,
    confirmPassword,
    agree,
    teamInviteToken = '',
    teamInviteCompanyId = '',
  }) => {
    const signupPasswordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
    const normalizedNameDraft = normalizeClientNameDraft({ firstName, lastName, otherNames })
    const normalizedFullName = String(normalizedNameDraft.fullName || '').trim()
    const normalizedPhoneNumber = sanitizeClientPhoneLocalNumber(phoneNumber)
    const normalizedCompanyName = String(companyName || '').trim()
    const normalizedBusinessType = String(businessType || '').trim()
    const normalizedCountry = String(country || '').trim()
    const normalizedEmail = email.trim().toLowerCase()
    const inviteLookup = teamInviteToken
      ? await getClientTeamInviteByToken({
        token: teamInviteToken,
        companyId: teamInviteCompanyId,
        email: normalizedEmail,
      })
      : null
    if (teamInviteToken && (!inviteLookup || inviteLookup.invite.status !== 'pending')) {
      return { ok: false, message: 'This team invite is invalid or has expired.' }
    }

    if (inviteLookup && normalizedEmail !== String(inviteLookup.invite.email || '').trim().toLowerCase()) {
      return { ok: false, message: 'Use the invited email address to complete team onboarding.' }
    }

    const inviteOwner = inviteLookup?.owner && typeof inviteLookup.owner === 'object'
      ? inviteLookup.owner
      : {}
    const resolvedSignupCompanyName = inviteLookup
      ? String(normalizedCompanyName || inviteOwner.companyName || '').trim()
      : normalizedCompanyName
    const resolvedSignupBusinessType = inviteLookup
      ? String(normalizedBusinessType || inviteOwner.businessType || '').trim()
      : normalizedBusinessType
    const resolvedSignupCountry = inviteLookup
      ? String(normalizedCountry || inviteOwner.country || '').trim()
      : normalizedCountry
    const resolvedSignupCurrency = inviteLookup
      ? String(inviteOwner.currency || '').trim()
      : ''

    const signupCapture = buildSignupCapturePayload({
      signupSource: inviteLookup ? 'team-invite-signup' : 'email-signup',
      signupLocation: normalizedCountry,
      capturePage: inviteLookup ? 'team-setup' : 'signup',
      capturePath: inviteLookup ? '/team/setup' : '/signup',
    })
    if (
      !normalizedFullName
      || !email.trim()
      || !normalizedPhoneNumber
      || !password
      || !confirmPassword
    ) {
      return { ok: false, message: 'Please complete all required fields.' }
    }
    if (!signupPasswordRegex.test(password)) {
      return { ok: false, message: 'Password does not meet security requirements.' }
    }
    if (!CLIENT_PHONE_LOCAL_NUMBER_REGEX.test(normalizedPhoneNumber)) {
      return { ok: false, message: 'Phone number must be 10 or 11 digits.' }
    }
    if (password !== confirmPassword) {
      return { ok: false, message: 'Passwords do not match.' }
    }
    if (!agree) {
      return { ok: false, message: 'Please complete all required fields.' }
    }

    const existingEmailMethods = await lookupFirebaseSignInMethods(email)
    if (!existingEmailMethods.ok) {
      return { ok: false, message: existingEmailMethods.message || 'Unable to verify email availability right now.' }
    }
    if (existingEmailMethods.registered) {
      const supportsGoogle = existingEmailMethods.methods.some((method) => method.includes('google'))
      return {
        ok: false,
        message: supportsGoogle
          ? 'An account already exists for this email. Sign in with Google or use a different email address.'
          : 'An account already exists for this email. Sign in instead or use a different email address.',
      }
    }

    const phoneAvailability = await checkClientPhoneAvailability(normalizedPhoneNumber)
    if (!phoneAvailability.ok || !phoneAvailability.available) {
      return {
        ok: false,
        message: phoneAvailability.message || 'This phone number is already assigned to another account.',
      }
    }

    const otpResult = await issueEmailOtp(normalizedEmail, 'signup')
    if (!otpResult.ok) {
      return { ok: false, message: otpResult.message || 'Unable to send OTP right now.' }
    }
    setOtpChallenge({
      requestId: Date.now(),
      purpose: 'signup',
      email: normalizedEmail,
      remember: true,
      previewOtp: otpResult.previewOtp || '',
      dispatchQueued: otpResult.dispatchQueued !== false,
      deliveryError: otpResult.deliveryError || '',
      pendingSignup: {
        firstName: normalizedNameDraft.firstName,
        lastName: normalizedNameDraft.lastName,
        otherNames: normalizedNameDraft.otherNames,
        fullName: normalizedFullName,
        phoneNumber: normalizedPhoneNumber,
        companyName: resolvedSignupCompanyName,
        businessType: resolvedSignupBusinessType,
        country: resolvedSignupCountry,
        currency: resolvedSignupCurrency,
        email: normalizedEmail,
        password,
        role: 'client',
        createdAt: new Date().toISOString(),
        signupCapture,
        teamInvite: inviteLookup
          ? {
            token: String(inviteLookup.invite.token || '').trim(),
            companyId: String(inviteLookup.invite.companyId || '').trim(),
            ownerEmail: String(inviteLookup.ownerEmail || '').trim().toLowerCase(),
            ownerName: String(inviteLookup.invite.invitedBy || '').trim(),
            role: normalizeClientTeamRole(inviteLookup.invite.role),
          }
          : null,
      },
    })
    return { ok: true, requiresOtp: true }
  }

  const handleAdminSetupCreateAccount = async ({
    inviteToken,
    bootstrapOwner,
    fullName,
    email,
    roleInCompany,
    department,
    phoneNumber,
    workCountry,
    governmentIdType,
    governmentIdNumber,
    identityVerificationPassed,
    residentialAddress,
    ownerPrivateKey,
    confirmOwnerPrivateKey,
    password,
    confirmPassword,
  }) => {
    const normalizedToken = inviteToken?.trim() || ''
    const isOwnerBootstrapFlow = Boolean(bootstrapOwner)
    const invite = isOwnerBootstrapFlow ? null : getAdminInviteByToken(normalizedToken)
    if (!isOwnerBootstrapFlow && !isAdminInvitePending(invite)) {
      return { ok: false, message: 'Invitation link is invalid or has expired.' }
    }

    let invitedAdminLevel = ADMIN_LEVELS.AREA_ACCOUNTANT
    let invitePermissions = []
    if (isOwnerBootstrapFlow) {
      const ownerBootstrapEligibility = await fetchOwnerBootstrapStatus()
      if (!ownerBootstrapEligibility.ok) {
        return {
          ok: false,
          message: ownerBootstrapEligibility.message || 'Unable to verify owner bootstrap status right now.',
        }
      }
      if (!ownerBootstrapEligibility.canBootstrap) {
        return {
          ok: false,
          message: 'Owner account already exists. Sign in via /admin/login or use a valid invite link.',
        }
      }
      invitedAdminLevel = ADMIN_LEVELS.OWNER
      invitePermissions = [...FULL_ADMIN_PERMISSION_IDS]
    } else {
      invitedAdminLevel = normalizeAdminLevel(invite?.adminLevel || ADMIN_LEVELS.AREA_ACCOUNTANT)
      invitePermissions = Array.isArray(invite?.adminPermissions) ? invite.adminPermissions : []
    }

    const normalizedEmail = email?.trim()?.toLowerCase() || ''
    const normalizedRoleInCompany = String(roleInCompany || '').trim()
    const normalizedDepartment = String(department || '').trim()
    const normalizedPhoneNumber = String(phoneNumber || '').trim()
    const normalizedWorkCountry = normalizeAdminVerificationCountry(workCountry)
    const normalizedGovernmentIdType = normalizeAdminGovernmentIdType(governmentIdType, normalizedWorkCountry)
    const normalizedGovernmentIdNumber = String(governmentIdNumber || '').trim()
    const normalizedResidentialAddress = String(residentialAddress || '').trim()
    const isOwnerInvite = invitedAdminLevel === ADMIN_LEVELS.OWNER
    const normalizedOwnerPrivateKey = String(ownerPrivateKey || '').trim()
    const normalizedConfirmOwnerPrivateKey = String(confirmOwnerPrivateKey || '').trim()
    if (
      !fullName?.trim()
      || !normalizedEmail
      || !normalizedRoleInCompany
      || !normalizedDepartment
      || !normalizedPhoneNumber
      || !normalizedWorkCountry
      || !password
      || !confirmPassword
    ) {
      return { ok: false, message: 'Please complete all required fields.' }
    }
    if (isOwnerInvite) {
      if (!normalizedOwnerPrivateKey || !normalizedConfirmOwnerPrivateKey) {
        return { ok: false, message: 'Owner private key and confirmation are required.' }
      }
      if (normalizedOwnerPrivateKey !== normalizedConfirmOwnerPrivateKey) {
        return { ok: false, message: 'Owner private key confirmation does not match.' }
      }
      if (normalizedOwnerPrivateKey.length < 12) {
        return { ok: false, message: 'Owner private key must be at least 12 characters.' }
      }
    } else if (
      !normalizedGovernmentIdType
      || !normalizedGovernmentIdNumber
      || !identityVerificationPassed
      || !normalizedResidentialAddress
    ) {
      return { ok: false, message: 'Please complete all required fields.' }
    }
    if (!isOwnerBootstrapFlow && normalizedEmail !== String(invite?.email || '').trim().toLowerCase()) {
      return { ok: false, message: 'Work email must match your invitation email.' }
    }
    if (normalizedPhoneNumber.replace(/\D/g, '').length < 7) {
      return { ok: false, message: 'Enter a valid phone number.' }
    }
    if (!isOwnerInvite && normalizedGovernmentIdNumber.length < 4) {
      return { ok: false, message: 'Enter a valid government ID number.' }
    }
    const signupPasswordRegex = /^(?=.*\d)(?=.*[^A-Za-z0-9]).+$/
    if (!signupPasswordRegex.test(password)) {
      return { ok: false, message: 'Password must include at least one number and one special character.' }
    }
    if (password !== confirmPassword) {
      return { ok: false, message: 'Please complete all required fields.' }
    }

    const otpResult = await issueEmailOtp(normalizedEmail, 'admin-setup')
    if (!otpResult.ok) {
      return { ok: false, message: otpResult.message || 'Unable to send OTP right now.' }
    }
    setOtpChallenge({
      requestId: Date.now(),
      purpose: 'admin-setup',
      email: normalizedEmail,
      remember: true,
      previewOtp: otpResult.previewOtp || '',
      dispatchQueued: otpResult.dispatchQueued !== false,
      deliveryError: otpResult.deliveryError || '',
      inviteToken: isOwnerBootstrapFlow ? '' : normalizedToken,
      pendingSignup: {
        fullName: fullName.trim(),
        email: normalizedEmail,
        roleInCompany: normalizedRoleInCompany,
        department: normalizedDepartment,
        phoneNumber: normalizedPhoneNumber,
        workCountry: normalizedWorkCountry,
        governmentIdType: isOwnerInvite ? '' : normalizedGovernmentIdType,
        governmentIdNumber: isOwnerInvite ? '' : normalizedGovernmentIdNumber,
        governmentIdVerifiedAt: isOwnerInvite ? '' : new Date().toISOString(),
        residentialAddress: normalizedResidentialAddress,
        ownerPrivateKey: isOwnerInvite ? normalizedOwnerPrivateKey : '',
        password,
        role: deriveBackendAdminRoleFromLevel(invitedAdminLevel),
        ownerBootstrap: isOwnerBootstrapFlow,
        adminLevel: invitedAdminLevel,
        adminPermissions: invitePermissions,
        status: 'active',
        createdAt: new Date().toISOString(),
      },
    })
    return { ok: true, requiresOtp: true }
  }

  const handleVerifyOtp = async (code) => {
    if (!otpChallenge?.email) return { ok: false, message: 'Incorrect verification code.' }
    await new Promise((resolve) => window.setTimeout(resolve, getNetworkAwareDurationMs('search')))

    const normalizedEmail = String(otpChallenge.email || '').trim().toLowerCase()
    const normalizedPurpose = String(otpChallenge.purpose || 'login').trim().toLowerCase()
    const normalizedVerificationPurpose = String(
      otpChallenge.verificationPurpose || otpChallenge.purpose || 'login',
    ).trim().toLowerCase()
    const normalizedTransport = String(otpChallenge.transport || 'email').trim().toLowerCase()
    const normalizedCode = String(code || '').trim()
    if (!normalizedEmail || !normalizedCode) {
      return { ok: false, message: 'Incorrect verification code.' }
    }
    let adminSetupSuccessPayload = null

    if (normalizedTransport === 'sms') {
      const smsVerifyResult = await verifySmsOtpChallengeCode({
        phoneNumber: String(otpChallenge.phoneNumber || '').trim(),
        purpose: normalizedVerificationPurpose,
        email: normalizedEmail,
        otp: normalizedCode,
      })
      if (!smsVerifyResult.ok) {
        return { ok: false, message: smsVerifyResult.message || 'Incorrect verification code.' }
      }
    } else {
      try {
        const verifyResponse = await apiFetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: normalizedEmail,
            purpose: normalizedVerificationPurpose,
            otp: normalizedCode,
          }),
        })
        if (!verifyResponse.ok) {
          const verifyErrorMessage = await readErrorMessageFromResponse(verifyResponse)
          return { ok: false, message: verifyErrorMessage || 'Incorrect verification code.' }
        }
      } catch {
        return { ok: false, message: 'Unable to verify OTP right now.' }
      }
    }

    if (normalizedPurpose === 'signup' || normalizedPurpose === 'admin-setup') {
      const pendingSignup = otpChallenge.pendingSignup
      const pendingSignupNameDraft = normalizeClientNameDraft({
        firstName: pendingSignup?.firstName,
        lastName: pendingSignup?.lastName,
        otherNames: pendingSignup?.otherNames,
        fullName: pendingSignup?.fullName,
      })
      const pendingSignupFullName = String(
        pendingSignupNameDraft.fullName
        || pendingSignup?.fullName
        || [pendingSignup?.firstName, pendingSignup?.otherNames, pendingSignup?.lastName].filter(Boolean).join(' ')
        || '',
      ).trim()
      if (!pendingSignup?.email || !pendingSignupFullName || !pendingSignup?.password) {
        return { ok: false, message: 'Invalid signup challenge payload.' }
      }
      if (normalizedPurpose === 'admin-setup') {
        const pendingAdminLevel = normalizeAdminLevel(pendingSignup?.adminLevel || ADMIN_LEVELS.AREA_ACCOUNTANT)
        const isOwnerSignup = pendingAdminLevel === ADMIN_LEVELS.OWNER
        const hasProfileFields = Boolean(
          String(pendingSignup?.roleInCompany || '').trim()
          && String(pendingSignup?.department || '').trim()
          && String(pendingSignup?.phoneNumber || '').trim()
          && String(pendingSignup?.workCountry || '').trim()
          && (isOwnerSignup
            ? String(pendingSignup?.ownerPrivateKey || '').trim()
            : (
              String(pendingSignup?.governmentIdType || '').trim()
              && String(pendingSignup?.governmentIdNumber || '').trim()
              && String(pendingSignup?.residentialAddress || '').trim()
            )),
        )
        if (!hasProfileFields) {
          return { ok: false, message: 'Please complete all required profile fields.' }
        }
      }

      const firebaseSignupResult = await createFirebaseAccountWithCredentials({
        email: pendingSignup.email,
        password: pendingSignup.password,
        fullName: pendingSignupFullName,
      })
      if (!firebaseSignupResult.ok || !firebaseSignupResult.idToken) {
        return { ok: false, message: firebaseSignupResult.message || 'Unable to create account right now.' }
      }

      const fallbackRole = normalizeRole(pendingSignup.role || 'client', pendingSignup.email)
      const registerResult = await registerAuthAccountRecord({
        uid: firebaseSignupResult.uid || '',
        email: pendingSignup.email,
        fullName: pendingSignupFullName,
        role: fallbackRole,
        provider: 'email-password',
        hasPassword: true,
        status: pendingSignup.status || 'active',
        emailVerified: true,
      })
      if (!registerResult.ok) {
        return {
          ok: false,
          message: String(registerResult?.data?.message || 'Unable to register account right now.').trim(),
        }
      }

      if (normalizedPurpose === 'signup' && fallbackRole === 'client') {
        await syncAuthenticatedUserToBackend({
          authorizationToken: firebaseSignupResult.idToken,
          uid: firebaseSignupResult.uid || '',
          email: pendingSignup.email,
          displayName: pendingSignupFullName,
          roles: [fallbackRole],
          signupCapture: normalizeSignupCapturePayload(pendingSignup.signupCapture),
        })
        await persistClientProfileToBackend({
          authorizationToken: firebaseSignupResult.idToken,
          profile: {
            firstName: pendingSignupNameDraft.firstName,
            lastName: pendingSignupNameDraft.lastName,
            otherNames: pendingSignupNameDraft.otherNames,
            phone: pendingSignup.phoneNumber || '',
            businessType: pendingSignup.businessType || '',
            businessName: pendingSignup.companyName || '',
            country: pendingSignup.country || '',
            currency: pendingSignup.currency || '',
            signupCapture: pendingSignup.signupCapture || {},
          },
        })
        syncProfileToSettings(pendingSignupFullName, pendingSignup.email, pendingSignupNameDraft)
        setClientWorkspaceCache(pendingSignup.email, {
          settingsProfile: {
            ...readScopedSettingsProfile(pendingSignup.email),
            fullName: pendingSignupFullName,
            firstName: pendingSignupNameDraft.firstName,
            lastName: pendingSignupNameDraft.lastName,
            otherNames: pendingSignupNameDraft.otherNames,
            email: pendingSignup.email,
            phone: pendingSignup.phoneNumber || '',
            phoneCountryCode: '+234',
            phoneLocalNumber: pendingSignup.phoneNumber || '',
            roleInCompany: pendingSignup.roleInCompany || '',
            address1: pendingSignup.address1 || '',
            address2: pendingSignup.address2 || '',
            city: pendingSignup.city || '',
            postalCode: pendingSignup.postalCode || '',
            addressCountry: pendingSignup.addressCountry || pendingSignup.country || '',
            businessType: pendingSignup.businessType || '',
            businessName: pendingSignup.companyName || '',
            country: pendingSignup.country || '',
            currency: pendingSignup.currency || '',
          },
        })
        persistOnboardingState({
          currentStep: 1,
          completed: false,
          skipped: false,
          verificationPending: false,
          data: {
            ...defaultOnboardingData,
            firstName: pendingSignupNameDraft.firstName,
            lastName: pendingSignupNameDraft.lastName,
            otherNames: pendingSignupNameDraft.otherNames,
            email: pendingSignup.email,
            phone: pendingSignup.phoneNumber || '',
            roleInCompany: pendingSignup.roleInCompany || '',
            address1: pendingSignup.address1 || '',
            address2: pendingSignup.address2 || '',
            city: pendingSignup.city || '',
            postalCode: pendingSignup.postalCode || '',
            addressCountry: pendingSignup.addressCountry || pendingSignup.country || '',
            businessType: pendingSignup.businessType || '',
            businessName: pendingSignup.companyName || '',
            country: pendingSignup.country || '',
            currency: pendingSignup.currency || '',
            primaryContact: pendingSignupFullName,
          },
        }, pendingSignup.email)

        appendClientActivityLog(pendingSignup.email, {
          actorName: pendingSignupFullName || 'Client User',
          actorRole: 'client',
          action: 'Client account created',
          details: 'Client completed signup and verified OTP.',
        })

        const acceptedTeamInvite = pendingSignup?.teamInvite && typeof pendingSignup.teamInvite === 'object'
          ? await acceptClientTeamInvite({
            token: String(pendingSignup.teamInvite.token || '').trim(),
            companyId: String(pendingSignup.teamInvite.companyId || '').trim(),
            fullName: pendingSignupFullName,
            email: pendingSignup.email,
          })
          : { ok: true }
        if (!acceptedTeamInvite.ok) {
          return { ok: false, message: acceptedTeamInvite.message || 'Unable to activate the team invite right now.' }
        }

        if (pendingSignup?.teamInvite) {
          setPendingClientTeamInvite(null)
          setClientTeamInviteSetupMessage('')
          try {
            history.replaceState(
              {},
              '',
              '/dashboard',
            )
          } catch {
            // ignore
          }
        }
      }

      const loginSessionResult = await recordAuthLoginSession({
        uid: firebaseSignupResult.uid || '',
        email: pendingSignup.email,
        role: fallbackRole,
        loginMethod: 'otp',
        remember: true,
        mfaCompleted: true,
      })
      if (!loginSessionResult.ok) {
        return {
          ok: false,
          message: String(loginSessionResult?.data?.message || 'Unable to start login session.').trim(),
        }
      }
      const issuedSessionId = String(loginSessionResult?.data?.session?.sessionId || '').trim()

      const hydratedProfile = await hydrateAuthenticatedUserFromBackend({
        fallbackUid: firebaseSignupResult.uid || '',
        fallbackEmail: pendingSignup.email,
        fallbackFullName: pendingSignupFullName,
        fallbackRole,
        authorizationToken: firebaseSignupResult.idToken,
      })
      const user = normalizeUser({
        ...(hydratedProfile.user || {}),
        roleInCompany: pendingSignup.roleInCompany,
        authProvider: fallbackRole === 'client' ? 'email-password' : undefined,
        hasPassword: fallbackRole === 'client' ? true : undefined,
        department: pendingSignup.department,
        phoneNumber: pendingSignup.phoneNumber,
        workCountry: pendingSignup.workCountry,
        governmentIdType: pendingSignup.governmentIdType,
        governmentIdNumber: pendingSignup.governmentIdNumber,
        governmentIdVerifiedAt: pendingSignup.governmentIdVerifiedAt || '',
        residentialAddress: pendingSignup.residentialAddress,
        adminLevel: pendingSignup.adminLevel,
        adminPermissions: pendingSignup.adminPermissions,
        sessionId: issuedSessionId,
        firebaseIdToken: firebaseSignupResult.idToken,
      })

      persistAuthUser(user, true)
      setApiAccessToken(firebaseSignupResult.idToken, { remember: true })
      syncProfileToSettings(user.fullName, user.email, pendingSignupNameDraft)

      if (user.role === 'client') {
        await persistClientProfileNamesToBackend({
          authorizationToken: firebaseSignupResult.idToken,
          firstName: pendingSignupNameDraft.firstName,
          lastName: pendingSignupNameDraft.lastName,
          otherNames: pendingSignupNameDraft.otherNames,
        })
        persistOnboardingState({
          currentStep: 1,
          completed: false,
          skipped: false,
          verificationPending: false,
          data: {
            ...defaultOnboardingData,
            firstName: pendingSignupNameDraft.firstName,
            lastName: pendingSignupNameDraft.lastName,
            otherNames: pendingSignupNameDraft.otherNames,
            email: user.email || '',
            phone: pendingSignup.phoneNumber || '',
            roleInCompany: pendingSignup.roleInCompany || '',
            address1: pendingSignup.address1 || '',
            address2: pendingSignup.address2 || '',
            city: pendingSignup.city || '',
            postalCode: pendingSignup.postalCode || '',
            addressCountry: pendingSignup.addressCountry || pendingSignup.country || '',
            businessType: pendingSignup.businessType || '',
            businessName: pendingSignup.companyName || '',
            country: pendingSignup.country || '',
            currency: pendingSignup.currency || '',
            primaryContact: user.fullName || pendingSignupFullName,
          },
        }, user.email)
        appendClientActivityLog(user.email, {
          actorName: user.fullName || 'Client User',
          actorRole: 'client',
          action: 'Client account created',
          details: 'Client completed signup and verified OTP.',
        })
      }

      if (normalizedPurpose === 'admin-setup') {
        try {
          const normalizedAdminEmail = String(pendingSignup.email || '').trim().toLowerCase()
          const profileStorageKey = `kiaminaAdminProfile:${normalizedAdminEmail}`
          localStorage.setItem(profileStorageKey, JSON.stringify({
            fullName: pendingSignupFullName,
            roleInCompany: pendingSignup.roleInCompany || '',
            department: pendingSignup.department || '',
            phoneNumber: pendingSignup.phoneNumber || '',
            workCountry: pendingSignup.workCountry || 'Nigeria',
            governmentIdType: pendingSignup.governmentIdType || '',
            governmentIdNumber: pendingSignup.governmentIdNumber || '',
            governmentIdVerifiedAt: pendingSignup.governmentIdVerifiedAt || '',
            residentialAddress: pendingSignup.residentialAddress || '',
          }))

          const existingAccounts = getSavedAccounts()
          const existingAdminIndex = existingAccounts.findIndex((account) => (
            String(account?.email || '').trim().toLowerCase() === normalizedAdminEmail
          ))
          const nextAdminAccount = normalizeAdminAccount({
            ...(existingAdminIndex >= 0 ? existingAccounts[existingAdminIndex] : {}),
            uid: String(user?.uid || firebaseSignupResult.uid || '').trim(),
            fullName: pendingSignupFullName,
            email: normalizedAdminEmail,
            role: 'admin',
            status: 'active',
            roleInCompany: pendingSignup.roleInCompany || '',
            department: pendingSignup.department || '',
            phoneNumber: pendingSignup.phoneNumber || '',
            workCountry: pendingSignup.workCountry || 'Nigeria',
            governmentIdType: pendingSignup.governmentIdType || '',
            governmentIdNumber: pendingSignup.governmentIdNumber || '',
            governmentIdVerifiedAt: pendingSignup.governmentIdVerifiedAt || '',
            residentialAddress: pendingSignup.residentialAddress || '',
            ownerPrivateKey: String(pendingSignup.ownerPrivateKey || '').trim(),
            adminLevel: normalizeAdminLevel(pendingSignup.adminLevel || ADMIN_LEVELS.SUPER),
            adminPermissions: Array.isArray(pendingSignup.adminPermissions)
              ? pendingSignup.adminPermissions
              : FULL_ADMIN_PERMISSION_IDS,
          })
          const nextAccounts = [...existingAccounts]
          if (existingAdminIndex >= 0) {
            nextAccounts[existingAdminIndex] = nextAdminAccount
          } else {
            nextAccounts.push(nextAdminAccount)
          }
          localStorage.setItem('kiaminaAccounts', JSON.stringify(nextAccounts))
        } catch {
          // no-op
        }

        if (otpChallenge.inviteToken) {
          const invites = getSavedAdminInvites()
          const inviteIndex = invites.findIndex((invite) => invite.token === otpChallenge.inviteToken)
          if (inviteIndex !== -1) {
            const nextInvites = [...invites]
            nextInvites[inviteIndex] = normalizeAdminInvite({
              ...nextInvites[inviteIndex],
              status: 'accepted',
              acceptedAt: new Date().toISOString(),
            })
            saveAdminInvites(nextInvites)
          }
        }

        if (pendingSignup?.ownerBootstrap) {
          setOwnerBootstrapStatus({
            loading: false,
            checked: true,
            canBootstrap: false,
            adminAccountCount: Math.max(1, Number(ownerBootstrapStatus.adminAccountCount || 0)),
            message: 'Owner bootstrap is disabled because an admin account already exists.',
          })
        }

        adminSetupSuccessPayload = {
          fullName: user.fullName || pendingSignupFullName,
          email: String(pendingSignup.email || user.email || '').trim().toLowerCase(),
          roleInCompany: String(pendingSignup.roleInCompany || user.roleInCompany || '').trim(),
          department: String(pendingSignup.department || user.department || '').trim(),
          adminLevel: normalizeAdminLevel(pendingSignup.adminLevel || user.adminLevel || ADMIN_LEVELS.AREA_ACCOUNTANT),
          isOwnerBootstrap: Boolean(pendingSignup?.ownerBootstrap),
        }
      }

      if (user.role === 'client' && firebaseSignupResult.idToken) {
        await refreshClientDashboardOverview({ authorizationToken: firebaseSignupResult.idToken })
      }
    } else {
      const firebaseIdToken = String(otpChallenge?.firebaseIdToken || '').trim()
      if (!firebaseIdToken) {
        return { ok: false, message: 'Authentication session expired. Please sign in again.' }
      }

      const identityResult = await resolveIdentityFromAuthTokens({ idToken: firebaseIdToken })
      if (!identityResult.ok) {
        return { ok: false, message: identityResult.message || 'Unable to verify token.' }
      }

      const fallbackRole = normalizedPurpose === 'admin-login'
        ? normalizeBackendRole(String(otpChallenge?.backendRole || '').trim() || 'admin', normalizedEmail)
        : 'client'
      const resolvedEmail = identityResult.email || normalizedEmail
      const registerResult = await registerAuthAccountRecord({
        uid: identityResult.uid || '',
        email: resolvedEmail,
        fullName: '',
        role: fallbackRole,
        provider: 'email-password',
        status: 'active',
        emailVerified: Boolean(identityResult.emailVerified),
      })
      if (!registerResult.ok) {
        return {
          ok: false,
          message: String(registerResult?.data?.message || 'Unable to register account right now.').trim(),
        }
      }

      const shouldRememberSession = Boolean(otpChallenge.remember)
      const loginSessionResult = await recordAuthLoginSession({
        uid: identityResult.uid || '',
        email: resolvedEmail,
        role: fallbackRole,
        loginMethod: 'otp',
        remember: shouldRememberSession,
        mfaCompleted: true,
      })
      if (!loginSessionResult.ok) {
        return {
          ok: false,
          message: String(loginSessionResult?.data?.message || 'Unable to start login session.').trim(),
        }
      }
      const issuedSessionId = String(loginSessionResult?.data?.session?.sessionId || '').trim()

      const hydratedProfile = await hydrateAuthenticatedUserFromBackend({
        fallbackUid: identityResult.uid || '',
        fallbackEmail: resolvedEmail,
        fallbackFullName: resolvedEmail.split('@')[0],
        fallbackRole,
        authorizationToken: firebaseIdToken,
      })
      const user = applyClientTeamAccessProfile(normalizeUser({
        ...(hydratedProfile.user || {}),
        sessionId: issuedSessionId,
        firebaseIdToken,
      }))
      if (normalizedPurpose === 'admin-login' && normalizeRole(user.role, user.email) !== 'admin') {
        return { ok: false, message: 'This account does not have admin access.' }
      }
      if (normalizedPurpose === 'client-login' && normalizeRole(user.role, user.email) === 'admin') {
        return { ok: false, message: 'Use /admin/login to access the Admin Portal.' }
      }

      persistAuthUser(user, shouldRememberSession)
      setApiAccessToken(firebaseIdToken, { remember: shouldRememberSession })
      syncProfileToSettings(user.fullName, user.email)
      if (normalizeRole(user.role, user.email) === 'client') {
        appendClientActivityLog(user.email, {
          actorName: user.fullName || 'Client User',
          actorRole: 'client',
          action: 'Client login',
          details: 'Client authenticated successfully via OTP.',
        })
        await refreshClientDashboardOverview({ authorizationToken: firebaseIdToken })
      }
    }

    setOtpChallenge(null)
    if (adminSetupSuccessPayload) {
      setAdminSetupSuccessState(adminSetupSuccessPayload)
      setShowAuth(false)
      setShowAdminLogin(false)
      setIsPublicSiteView(false)
      setAdminSetupToken('')
      setIsAdminSetupRouteActive(true)
      setPublicSitePage('home')
      setActiveFolderRoute(null)
      setActivePage(ADMIN_DEFAULT_PAGE)
      try {
        history.replaceState({}, '', '/admin/setup')
      } catch {
        // ignore
      }
      showToast(
        'success',
        adminSetupSuccessPayload.isOwnerBootstrap
          ? 'Owner account created successfully.'
          : 'Admin account created successfully.',
      )
      return { ok: true, adminSetupCompleted: true }
    }
    showToast('success', 'Verification successful.')
    return { ok: true }
  }

  const handleResendOtp = async () => {
    if (!otpChallenge?.email) return { ok: false }
    await new Promise((resolve) => window.setTimeout(resolve, getNetworkAwareDurationMs('search')))
    const transport = String(otpChallenge.transport || 'email').trim().toLowerCase()
    if (transport === 'sms') {
      const smsOtpResult = await issueSmsOtpChallenge({
        phoneNumber: otpChallenge.phoneNumber,
        purpose: otpChallenge.verificationPurpose || 'mfa',
        email: otpChallenge.email,
      })
      if (!smsOtpResult.ok) {
        return { ok: false, message: smsOtpResult.message || 'Unable to send verification code right now.' }
      }
      setOtpChallenge((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          requestId: Date.now(),
          previewOtp: smsOtpResult.previewOtp || '',
          dispatchQueued: true,
          deliveryError: '',
        }
      })
      return { ok: true, message: smsOtpResult.message || 'A new verification code has been sent.' }
    }

    const otpResult = await issueEmailOtp(otpChallenge.email, otpChallenge.verificationPurpose || otpChallenge.purpose || 'login')
    if (!otpResult.ok) {
      return { ok: false, message: otpResult.message || 'Unable to send OTP right now.' }
    }
    setOtpChallenge((previous) => {
      if (!previous) return previous
      return {
        ...previous,
        requestId: Date.now(),
        previewOtp: otpResult.previewOtp || '',
        dispatchQueued: otpResult.dispatchQueued !== false,
        deliveryError: otpResult.deliveryError || '',
      }
    })
    return { ok: true, message: otpResult.message || 'A new OTP has been sent.' }
  }

  const handleCancelOtp = () => {
    setOtpChallenge(null)
  }

  const handleRequestPasswordReset = async (email) => {
    const normalizedEmail = email?.trim()?.toLowerCase()
    if (!normalizedEmail) {
      return { ok: false, message: 'Please enter a valid email address.' }
    }

    const resetResult = await issuePasswordResetLink(normalizedEmail)
    if (!resetResult.ok) {
      return { ok: false, message: resetResult.message || 'Unable to send password reset link.' }
    }

    return {
      ok: true,
      email: normalizedEmail,
      message: 'If an account exists for this email, a password reset link has been sent.',
    }
  }

  const handleChangePassword = async ({
    currentPassword = '',
    newPassword = '',
    confirmPassword = '',
  } = {}) => {
    const normalizedCurrentPassword = String(currentPassword || '')
    const normalizedNewPassword = String(newPassword || '')
    const normalizedConfirmPassword = String(confirmPassword || '')
    if (!normalizedCurrentPassword || !normalizedNewPassword || !normalizedConfirmPassword) {
      return { ok: false, message: 'Please complete all required fields.' }
    }
    if (normalizedNewPassword !== normalizedConfirmPassword) {
      return { ok: false, message: 'Passwords do not match.' }
    }

    const strengthRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
    if (!strengthRegex.test(normalizedNewPassword)) {
      return { ok: false, message: 'Password does not meet security requirements.' }
    }

    try {
      const response = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: normalizedCurrentPassword,
          newPassword: normalizedNewPassword,
        }),
      })
      if (!response.ok) {
        const message = await readErrorMessageFromResponse(response)
        return { ok: false, message: message || 'Unable to update your password right now.' }
      }
      const payload = await response.json().catch(() => ({}))
      return {
        ok: true,
        message: String(payload?.message || '').trim() || 'Your password has been updated successfully.',
      }
    } catch {
      return { ok: false, message: 'Unable to update your password right now.' }
    }
  }

  const handleResolvePasswordResetCode = async (oobCode) => {
    const result = await inspectPasswordResetCode(oobCode)
    if (result.ok && result.email) {
      setPasswordResetEmail(result.email)
    }
    return result
  }

  const handleUpdatePassword = async ({ oobCode, password, confirmPassword }) => {
    if (!oobCode || !password || !confirmPassword) {
      return { ok: false, message: 'Please complete all required fields.' }
    }
    if (password !== confirmPassword) {
      return { ok: false, message: 'Passwords do not match.' }
    }

    const strengthRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
    if (!strengthRegex.test(password)) {
      return { ok: false, message: 'Password does not meet security requirements.' }
    }

    const result = await completePasswordResetWithCode(oobCode, password)
    if (!result.ok) {
      return { ok: false, message: result.message || 'Reset link is invalid or expired.' }
    }

    const normalizedResetEmail = String(passwordResetEmail || '').trim().toLowerCase()
    if (normalizedResetEmail) {
      await registerAuthAccountRecord({
        email: normalizedResetEmail,
        fullName: authUser?.fullName || normalizedResetEmail.split('@')[0],
        role: normalizeRole(authUser?.role || 'client', normalizedResetEmail),
        provider: 'email-password',
        hasPassword: true,
        status: 'active',
        emailVerified: true,
      })
      if (String(authUser?.email || '').trim().toLowerCase() === normalizedResetEmail) {
        const nextAuthUser = normalizeUser({
          ...authUser,
          authProvider: authUser?.authProvider || 'email-password',
          hasPassword: true,
        })
        persistAuthenticatedUserRecord(nextAuthUser, localStorage.getItem('kiaminaAuthUser') ? 'local' : 'session')
        setAuthUser(nextAuthUser)
      }
    }

    setPasswordResetEmail('')
    setAuthMode('login')
    showToast('success', result.message || 'Your password has been updated successfully. You can now sign in.')
    return { ok: true, message: result.message || 'Your password has been updated successfully. You can now sign in.' }
  }

  const handleResendVerificationEmail = async (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!normalizedEmail) {
      return { ok: false, message: 'Please enter a valid email address.' }
    }

    const result = await issueEmailVerificationLink(normalizedEmail)
    if (!result.ok) {
      return { ok: false, message: result.message || 'Unable to send verification email right now.' }
    }

    setEmailVerificationEmail(normalizedEmail)
    return {
      ok: true,
      email: normalizedEmail,
      message: 'A verification link has been sent to your email. Please verify your email address to activate your account.',
    }
  }

  const handleVerifyEmailAddress = async (oobCode) => {
    const inspectionResult = await inspectEmailVerificationCode(oobCode)
    if (!inspectionResult.ok) {
      return {
        ok: false,
        email: '',
        message: inspectionResult.message || 'Verification link expired. Please request a new one.',
      }
    }

    const verificationResult = await applyEmailVerificationCode(oobCode)
    if (!verificationResult.ok) {
      return {
        ok: false,
        email: inspectionResult.email || '',
        message: verificationResult.message || 'Verification link expired. Please request a new one.',
      }
    }

    setEmailVerificationEmail(inspectionResult.email || '')
    return {
      ok: true,
      email: inspectionResult.email || '',
      message: verificationResult.message || 'Email verified successfully.',
    }
  }

  const handleAdminActionLog = ({ action, affectedUser, details }) => {
    logAdminActivity({
      adminName: authUser?.fullName || 'Admin User',
      action,
      affectedUser,
      details,
    })
  }

  const handleCurrentAdminEmailUpdated = (payload = {}) => {
    const {
      previousEmail = '',
      nextEmail = '',
      nextFullName = '',
      nextRoleInCompany = '',
      nextDepartment = '',
      nextPhoneNumber = '',
      nextAdminLevel = '',
      nextAdminPermissions = [],
      nextStatus = '',
    } = payload
    const normalizedNextEmail = String(nextEmail || '').trim().toLowerCase()
    if (!normalizedNextEmail) return
    const normalizedPreviousEmail = String(previousEmail || authUser?.email || '').trim().toLowerCase()
    const currentAuthEmail = String(authUser?.email || '').trim().toLowerCase()
    if (currentAuthEmail && normalizedPreviousEmail && currentAuthEmail !== normalizedPreviousEmail) return

    const hasNextFullName = Object.prototype.hasOwnProperty.call(payload, 'nextFullName')
    const hasNextRoleInCompany = Object.prototype.hasOwnProperty.call(payload, 'nextRoleInCompany')
    const hasNextDepartment = Object.prototype.hasOwnProperty.call(payload, 'nextDepartment')
    const hasNextPhoneNumber = Object.prototype.hasOwnProperty.call(payload, 'nextPhoneNumber')
    const hasNextAdminLevel = Object.prototype.hasOwnProperty.call(payload, 'nextAdminLevel')
    const hasNextAdminPermissions = Object.prototype.hasOwnProperty.call(payload, 'nextAdminPermissions')
    const hasNextStatus = Object.prototype.hasOwnProperty.call(payload, 'nextStatus')

    const trimmedNextFullName = String(nextFullName || '').trim()
    const trimmedNextRoleInCompany = String(nextRoleInCompany || '').trim()
    const trimmedNextDepartment = String(nextDepartment || '').trim()
    const trimmedNextPhoneNumber = String(nextPhoneNumber || '').trim()
    const normalizedNextAdminLevel = String(nextAdminLevel || '').trim()
    const normalizedNextStatus = String(nextStatus || '').trim()
    const normalizedNextAdminPermissions = Array.isArray(nextAdminPermissions)
      ? nextAdminPermissions
      : []

    const nextAuthUser = normalizeUser({
      ...(authUser || {}),
      email: normalizedNextEmail,
      fullName: hasNextFullName ? trimmedNextFullName : (authUser?.fullName || ''),
      roleInCompany: hasNextRoleInCompany ? trimmedNextRoleInCompany : (authUser?.roleInCompany || ''),
      department: hasNextDepartment ? trimmedNextDepartment : (authUser?.department || ''),
      phoneNumber: hasNextPhoneNumber ? trimmedNextPhoneNumber : (authUser?.phoneNumber || ''),
      adminLevel: hasNextAdminLevel ? normalizedNextAdminLevel : (authUser?.adminLevel || ''),
      adminPermissions: hasNextAdminPermissions
        ? normalizedNextAdminPermissions
        : (authUser?.adminPermissions || []),
      status: hasNextStatus ? normalizedNextStatus : (authUser?.status || 'active'),
      sessionIssuedAtIso: new Date().toISOString(),
    })
    if (!nextAuthUser) return

    setAuthUser(nextAuthUser)
    setIsAuthenticated(true)

    const authStorageType = detectAuthStorageType()
    persistAuthenticatedUserRecord(nextAuthUser, authStorageType === 'local' ? 'local' : 'session')

    setImpersonationSession((previousSession) => {
      if (!previousSession) return previousSession
      const sessionAdminEmail = String(previousSession.adminEmail || '').trim().toLowerCase()
      if (sessionAdminEmail && sessionAdminEmail !== normalizedPreviousEmail) return previousSession
      const nextSession = {
        ...previousSession,
        adminEmail: normalizedNextEmail,
      }
      persistImpersonationSession(nextSession)
      return nextSession
    })
    setAdminImpersonationSession((previousSession) => {
      if (!previousSession) return previousSession
      let didChange = false
      const nextSession = { ...previousSession }
      if (nextSession.originalAdminEmail === normalizedPreviousEmail) {
        nextSession.originalAdminEmail = normalizedNextEmail
        didChange = true
      }
      if (nextSession.impersonatedAdminEmail === normalizedPreviousEmail) {
        nextSession.impersonatedAdminEmail = normalizedNextEmail
        didChange = true
      }
      if (!didChange) return previousSession
      persistAdminImpersonationSession(nextSession, authStorageType === 'local' ? 'local' : 'session')
      return nextSession
    })
  }

  const exitAdminImpersonationMode = ({ silent = false } = {}) => {
    const activeSession = adminImpersonationSession
    if (!activeSession) return { ok: false, message: 'No active admin impersonation session.' }
    const originalEmail = String(activeSession.originalAdminEmail || '').trim().toLowerCase()
    if (!originalEmail) {
      setAdminImpersonationSession(null)
      persistAdminImpersonationSession(null)
      return { ok: false, message: 'Original admin session is unavailable.' }
    }

    const accounts = getSavedAccounts()
    const originalAccount = accounts.find((account) => account.email?.trim()?.toLowerCase() === originalEmail)
    if (!originalAccount || normalizeRole(originalAccount.role, originalAccount.email) !== 'admin') {
      setAdminImpersonationSession(null)
      persistAdminImpersonationSession(null)
      return { ok: false, message: 'Original admin account was not found.' }
    }

    const storageType = detectAuthStorageType()
    const restoredUser = persistAuthenticatedUserRecord(originalAccount, storageType === 'local' ? 'local' : 'session')
    if (!restoredUser) {
      return { ok: false, message: 'Unable to restore original admin session.' }
    }

    const previousImpersonatedName = activeSession.impersonatedAdminName || activeSession.impersonatedAdminEmail || 'Admin User'
    setAuthUser(restoredUser)
    setIsAuthenticated(true)
    setShowAuth(false)
    setShowAdminLogin(false)
    setAdminSetupToken('')
    setIsAdminSetupRouteActive(false)
    setImpersonationSession(null)
    setPendingImpersonationClient(null)
    persistImpersonationSession(null)
    setAdminImpersonationSession(null)
    persistAdminImpersonationSession(null)
    setActivePage(ADMIN_DEFAULT_PAGE)
    setActiveFolderRoute(null)
    try {
      history.replaceState({}, '', `/${ADMIN_DEFAULT_PAGE}`)
    } catch {
      // ignore
    }
    appendAdminActivityLog({
      adminName: activeSession.originalAdminName || restoredUser.fullName || 'Super Admin',
      adminEmail: originalEmail,
      adminLevel: activeSession.originalAdminLevel || ADMIN_LEVELS.SUPER,
      action: 'Admin impersonation ended',
      affectedUser: previousImpersonatedName,
      details: `Super Admin exited impersonation for ${previousImpersonatedName}.`,
    })
    if (!silent) {
      showToast('success', 'Returned to Super Admin session.')
    }
    return { ok: true }
  }

  const handleRequestAdminImpersonation = async (targetAdminEmail = '') => {
    const targetEmail = String(targetAdminEmail || '').trim().toLowerCase()
    if (!targetEmail) return { ok: false, message: 'Admin account not found.' }
    const currentAdminLevel = normalizeAdminLevel(currentAdminAccount?.adminLevel || ADMIN_LEVELS.SUPER)
    if (currentAdminLevel !== ADMIN_LEVELS.OWNER && currentAdminLevel !== ADMIN_LEVELS.SUPER) {
      return { ok: false, message: 'Only Owner or Super Admin can impersonate admin accounts.' }
    }
    if (isImpersonatingClient) {
      return { ok: false, message: 'Exit client impersonation mode before impersonating an admin.' }
    }

    const currentEmail = String(authUser?.email || '').trim().toLowerCase()
    if (!currentEmail) return { ok: false, message: 'Current admin session is unavailable.' }
    if (targetEmail === currentEmail) return { ok: false, message: 'Cannot impersonate your own account.' }

    const accounts = getSavedAccounts()
    const targetAccount = accounts.find((account) => account.email?.trim()?.toLowerCase() === targetEmail)
    if (!targetAccount || normalizeRole(targetAccount.role, targetAccount.email) !== 'admin') {
      return { ok: false, message: 'Admin account not found.' }
    }
    if (targetAccount.status === 'suspended') {
      return { ok: false, message: 'Cannot impersonate a suspended admin account.' }
    }

    if (adminImpersonationSession) {
      const cleanup = exitAdminImpersonationMode({ silent: true })
      if (!cleanup.ok) return cleanup
    }

    const storageType = detectAuthStorageType()
    const sessionPayload = {
      originalAdminEmail: currentEmail,
      originalAdminName: authUser?.fullName || currentAdminAccount.fullName || 'Super Admin',
      originalAdminLevel: currentAdminAccount.adminLevel || ADMIN_LEVELS.SUPER,
      impersonatedAdminEmail: targetEmail,
      impersonatedAdminName: targetAccount.fullName || targetAccount.email || 'Admin User',
      impersonatedAdminLevel: targetAccount.adminLevel || ADMIN_LEVELS.AREA_ACCOUNTANT,
      startedAt: Date.now(),
    }
    persistAdminImpersonationSession(sessionPayload, storageType === 'local' ? 'local' : 'session')
    setAdminImpersonationSession(sessionPayload)

    const impersonatedUser = persistAuthenticatedUserRecord(targetAccount, storageType === 'local' ? 'local' : 'session')
    if (!impersonatedUser) {
      setAdminImpersonationSession(null)
      persistAdminImpersonationSession(null)
      return { ok: false, message: 'Unable to start impersonation session.' }
    }

    setAuthUser(impersonatedUser)
    setIsAuthenticated(true)
    setShowAuth(false)
    setShowAdminLogin(false)
    setAdminSetupToken('')
    setIsAdminSetupRouteActive(false)
    setImpersonationSession(null)
    setPendingImpersonationClient(null)
    persistImpersonationSession(null)
    setActivePage(ADMIN_DEFAULT_PAGE)
    setActiveFolderRoute(null)
    try {
      history.replaceState({}, '', `/${ADMIN_DEFAULT_PAGE}`)
    } catch {
      // ignore
    }

    appendAdminActivityLog({
      adminName: sessionPayload.originalAdminName,
      adminEmail: sessionPayload.originalAdminEmail,
      adminLevel: sessionPayload.originalAdminLevel,
      action: 'Admin impersonation started',
      affectedUser: `${sessionPayload.impersonatedAdminName} (${getAdminLevelLabel(sessionPayload.impersonatedAdminLevel)})`,
      details: `Super Admin started impersonation for ${sessionPayload.impersonatedAdminEmail}.`,
    })
    return { ok: true }
  }

  const handleRequestImpersonation = (clientRecord) => {
    if (!clientRecord?.email) return
    if (!impersonationEnabled) {
      showToast('error', 'Insufficient Permissions')
      return
    }
    if (!canImpersonateClients) {
      showToast('error', 'Insufficient Permissions')
      return
    }
    setPendingImpersonationClient(clientRecord)
  }

  const enterImpersonationMode = () => {
    if (!pendingImpersonationClient?.email || !authUser?.email) return
    if (!impersonationEnabled || !canImpersonateClients) {
      showToast('error', 'Insufficient Permissions')
      setPendingImpersonationClient(null)
      return
    }

    const now = Date.now()
    const nextSession = {
      adminEmail: authUser.email.toLowerCase(),
      adminName: authUser.fullName || 'Admin User',
      clientEmail: pendingImpersonationClient.email.toLowerCase(),
      clientUid: String(
        pendingImpersonationClient.uid
        || getSavedAccounts().find((account) => (
          String(account?.email || '').trim().toLowerCase() === pendingImpersonationClient.email.toLowerCase()
        ))?.uid
        || '',
      ).trim(),
      clientName: pendingImpersonationClient.primaryContact || pendingImpersonationClient.businessName || 'Client',
      businessName: pendingImpersonationClient.businessName || 'Client Account',
      cri: pendingImpersonationClient.cri || '',
      startedAt: now,
      lastActivityAt: now,
    }
    setImpersonationSession(nextSession)
    persistImpersonationSession(nextSession)
    setPendingImpersonationClient(null)
    setOnboardingState(getSavedOnboardingState(nextSession.clientEmail))
    setCompanyName(getSavedCompanyName(nextSession.clientEmail, nextSession.businessName))
    setClientFirstName(getSavedClientFirstName(nextSession.clientEmail, nextSession.clientName))
    setActivePage('dashboard')
    setActiveFolderRoute(null)
    try {
      history.replaceState({}, '', '/dashboard')
    } catch {
      // ignore
    }

    logAdminActivity({
      adminName: nextSession.adminName,
      action: 'Client impersonation started',
      affectedUser: nextSession.businessName,
      details: `Admin (${nextSession.adminName}) impersonated Business (${nextSession.businessName}).`,
    })
    showToast('success', 'Entered client view mode.')
  }

  const exitImpersonationMode = ({ expired = false } = {}) => {
    if (!impersonationSession) return
    logAdminActivity({
      adminName: impersonationSession.adminName || authUser?.fullName || 'Admin User',
      action: expired ? 'Client impersonation expired' : 'Client impersonation ended',
      affectedUser: impersonationSession.businessName || impersonationSession.clientEmail || '--',
      details: expired
        ? `Impersonation for ${impersonationSession.businessName || impersonationSession.clientEmail} ended due to inactivity.`
        : `Admin exited client view mode for ${impersonationSession.businessName || impersonationSession.clientEmail}.`,
    })
    setImpersonationSession(null)
    persistImpersonationSession(null)
    setPendingImpersonationClient(null)
    setActivePage(ADMIN_DEFAULT_PAGE)
    setActiveFolderRoute(null)
    try {
      history.replaceState({}, '', `/${ADMIN_DEFAULT_PAGE}`)
    } catch {
      // ignore
    }
    showToast(expired ? 'error' : 'success', expired ? 'Client view session expired.' : 'Exited client view mode.')
  }

  const handleForceVerificationApproval = () => {
    if (!isImpersonatingClient || !scopedClientEmail) return
    const nextState = {
      ...onboardingState,
      verificationPending: false,
      completed: true,
      skipped: false,
    }
    persistOnboardingState(nextState, scopedClientEmail)
    logAdminActivity({
      adminName: impersonationSession?.adminName || authUser?.fullName || 'Admin User',
      action: 'Forced verification approval in impersonation mode',
      affectedUser: impersonationSession?.businessName || scopedClientEmail,
      details: 'Admin force-approved client verification while in impersonation mode.',
    })
    showToast('success', 'Verification status force-approved.')
  }

  const handleCorrectCri = () => {
    if (!isImpersonatingClient || !scopedClientEmail) return
    const input = window.prompt('Enter corrected CRI', impersonationSession?.cri || '')
    if (!input) return
    const workspaceCache = getClientWorkspaceCache(scopedClientEmail) || {}
    const existing = workspaceCache.settingsProfile && typeof workspaceCache.settingsProfile === 'object'
      ? workspaceCache.settingsProfile
      : {}
    const next = {
      ...existing,
      cri: input.trim(),
    }
    setClientWorkspaceCache(scopedClientEmail, {
      settingsProfile: next,
    })
    setImpersonationSession((prev) => {
      if (!prev) return prev
      const updated = { ...prev, cri: input.trim(), lastActivityAt: Date.now() }
      persistImpersonationSession(updated)
      return updated
    })
    logAdminActivity({
      adminName: impersonationSession?.adminName || authUser?.fullName || 'Admin User',
      action: 'Corrected CRI in impersonation mode',
      affectedUser: impersonationSession?.businessName || scopedClientEmail,
      details: `Admin corrected CRI to ${input.trim()} while in impersonation mode.`,
    })
    showToast('success', 'Client CRI corrected.')
  }

  const handleOverrideDocumentStatus = () => {
    if (!isImpersonatingClient) return
    let updated = false
    setExpenseDocuments((prev) => {
      if (updated) return prev
      const result = updateFirstPendingFileStatus(prev, 'Approved')
      updated = result.updated
      return result.records
    })
    if (!updated) {
      setSalesDocuments((prev) => {
        if (updated) return prev
        const result = updateFirstPendingFileStatus(prev, 'Approved')
        updated = result.updated
        return result.records
      })
    }
    if (!updated) {
      setBankStatementDocuments((prev) => {
        if (updated) return prev
        const result = updateFirstPendingFileStatus(prev, 'Approved')
        updated = result.updated
        return result.records
      })
    }

    if (updated) {
      logAdminActivity({
        adminName: impersonationSession?.adminName || authUser?.fullName || 'Admin User',
        action: 'Overrode document status in impersonation mode',
        affectedUser: impersonationSession?.businessName || scopedClientEmail || '--',
        details: 'Admin overrode a pending document status to approved while in impersonation mode.',
      })
      showToast('success', 'Document status overridden.')
      return
    }
    showToast('error', 'No pending documents available for override.')
  }

  const showClientToast = (type, message) => {
    showToast(type, message)
    const activityByMessage = {
      'Changes saved successfully.': {
        action: 'Updated client settings',
        details: 'Client saved updates to profile, business, tax, or address settings.',
      },
      'Verification submitted successfully.': {
        action: 'Submitted verification',
        details: 'Client submitted verification documents for review.',
      },
      'Submitted. Awaiting approval.': {
        action: 'Submitted verification',
        details: 'Client submitted verification documents for review.',
      },
      'Notification preferences updated.': {
        action: 'Updated notification preferences',
        details: 'Client updated notification settings.',
      },
      'Password reset link sent. Please check your email.': {
        action: 'Requested password reset',
        details: 'Client requested a secure password reset link from account settings.',
      },
      'Your password has been updated successfully.': {
        action: 'Updated password',
        details: 'Client changed their account password from account settings.',
      },
      'Two-step verification enabled.': {
        action: 'Enabled two-step verification',
        details: 'Client enabled SMS verification for sensitive account actions.',
      },
      'Two-step verification turned off.': {
        action: 'Disabled two-step verification',
        details: 'Client disabled SMS verification for sensitive account actions.',
      },
      'Documents uploaded successfully.': {
        action: 'Uploaded documents',
        details: 'Client uploaded one or more documents.',
      },
    }
    const fallbackAction = type === 'success' ? 'Client action' : 'Client warning'
    const mapped = activityByMessage[message] || {
      action: fallbackAction,
      details: message,
    }
    appendScopedClientLog(mapped.action, mapped.details)

    if (!isImpersonatingClient) return
    const detailsByMessage = {
      'Changes saved successfully.': 'Admin updated tax details while in impersonation mode.',
      'Verification submitted successfully.': 'Admin submitted verification on behalf of client while in impersonation mode.',
      'Submitted. Awaiting approval.': 'Admin submitted verification on behalf of client while in impersonation mode.',
      'Notification preferences updated.': 'Admin updated notification settings while in impersonation mode.',
      'Password reset link sent. Please check your email.': 'Admin triggered a password reset link while in impersonation mode.',
      'Your password has been updated successfully.': 'Admin changed the client password while in impersonation mode.',
      'Two-step verification enabled.': 'Admin enabled two-step verification while in impersonation mode.',
      'Two-step verification turned off.': 'Admin disabled two-step verification while in impersonation mode.',
      'Documents uploaded successfully.': 'Admin uploaded document on behalf of client.',
    }
    const details = detailsByMessage[message] || `Admin ${impersonationSession?.adminName || authUser?.fullName || 'Admin User'} action in client view: ${message}`
    logAdminActivity({
      adminName: impersonationSession?.adminName || authUser?.fullName || 'Admin User',
      action: type === 'success' ? 'Impersonation action' : 'Impersonation warning',
      affectedUser: impersonationSession?.businessName || scopedClientEmail || '--',
      details,
    })
  }

  const handleSettingsVerificationDocsChange = (nextDocs = {}) => {
    const normalizedDocs = normalizeVerificationDocs(nextDocs)
    setVerificationDocsSnapshot((previous) => {
      if (
        previous.govId === normalizedDocs.govId
        && previous.govIdType === normalizedDocs.govIdType
        && previous.govIdNumber === normalizedDocs.govIdNumber
        && previous.govIdVerifiedAt === normalizedDocs.govIdVerifiedAt
        && previous.govIdVerificationStatus === normalizedDocs.govIdVerificationStatus
        && previous.govIdClarityStatus === normalizedDocs.govIdClarityStatus
        && previous.businessReg === normalizedDocs.businessReg
        && previous.businessRegFileCacheKey === normalizedDocs.businessRegFileCacheKey
        && previous.businessRegMimeType === normalizedDocs.businessRegMimeType
        && Number(previous.businessRegSize || 0) === Number(normalizedDocs.businessRegSize || 0)
        && previous.businessRegUploadedAt === normalizedDocs.businessRegUploadedAt
        && previous.businessRegVerificationStatus === normalizedDocs.businessRegVerificationStatus
        && previous.businessRegSubmittedAt === normalizedDocs.businessRegSubmittedAt
      ) {
        return previous
      }
      return normalizedDocs
    })
    if (scopedClientEmail) {
      persistScopedVerificationDocs(scopedClientEmail, normalizedDocs)
    }
  }

  const handleAccountSettingsChange = (nextSettings = {}) => {
    const normalizedSettings = normalizeAccountSettings(nextSettings)
    const targetEmail = String(scopedClientEmail || normalizedSettings.recoveryEmail || '').trim().toLowerCase()
    if (targetEmail) {
      const workspaceCache = getClientWorkspaceCache(targetEmail) || {}
      const existingSettings = workspaceCache.accountSettings && typeof workspaceCache.accountSettings === 'object'
        ? workspaceCache.accountSettings
        : {}
      setClientWorkspaceCache(targetEmail, {
        accountSettings: {
          ...existingSettings,
          ...(nextSettings && typeof nextSettings === 'object' ? nextSettings : {}),
          ...normalizedSettings,
        },
      })
      persistScopedAccountSettings(targetEmail, normalizedSettings)
    }
    setAccountSettingsSnapshot((previous) => {
      if (
        previous.twoStepEnabled === normalizedSettings.twoStepEnabled
        && previous.twoStepMethod === normalizedSettings.twoStepMethod
        && previous.verifiedPhoneNumber === normalizedSettings.verifiedPhoneNumber
        && previous.recoveryEmail === normalizedSettings.recoveryEmail
        && previous.enabledAt === normalizedSettings.enabledAt
        && previous.lastVerifiedAt === normalizedSettings.lastVerifiedAt
      ) {
        return previous
      }
      return normalizedSettings
    })
  }

  const handleNotificationSettingsChange = (nextSettings = {}) => {
    const targetEmail = String(scopedClientEmail || '').trim().toLowerCase()
    const normalizedSettings = targetEmail
      ? persistScopedNotificationSettings(targetEmail, nextSettings)
      : normalizeClientNotificationSettings(nextSettings)
    setNotificationSettingsSnapshot((previous) => {
      if (JSON.stringify(previous || {}) === JSON.stringify(normalizedSettings || {})) {
        return previous
      }
      return normalizedSettings
    })
  }

  const handleSettingsProfileChange = async (nextProfile = {}) => {
    const normalizedProfile = normalizeSettingsProfile(nextProfile)
    const targetEmail = String(scopedClientEmail || normalizedProfile.email || '').trim().toLowerCase()
    const authorizationToken = String(authUser?.firebaseIdToken || '').trim()

    if (!isImpersonatingClient && currentUserRole === 'client' && authorizationToken) {
      const profileResult = await persistClientProfileToBackend({
        authorizationToken,
        profile: nextProfile,
      })
      if (!profileResult.ok) {
        return {
          ok: false,
          message: profileResult.message || 'Unable to save profile right now.',
        }
      }
      if (targetEmail) {
        const signature = JSON.stringify(buildClientProfilePayloadForBackend(nextProfile))
        clientProfileSyncSignaturesRef.current.set(targetEmail, signature)
      }
    }

    if (targetEmail) {
      const workspaceCache = getClientWorkspaceCache(targetEmail) || {}
      const existingSettings = workspaceCache.settingsProfile && typeof workspaceCache.settingsProfile === 'object'
        ? workspaceCache.settingsProfile
        : {}
      setClientWorkspaceCache(targetEmail, {
        settingsProfile: {
          ...existingSettings,
          ...(nextProfile && typeof nextProfile === 'object' ? nextProfile : {}),
          ...normalizedProfile,
        },
      })
    }
    setSettingsProfileSnapshot((previous) => {
      const previousSignature = JSON.stringify(normalizeSettingsProfile(previous))
      const nextSignature = JSON.stringify(normalizedProfile)
      if (previousSignature === nextSignature) {
        return previous
      }
      return normalizedProfile
    })
    if (typeof setCompanyName === 'function') {
      setCompanyName(String(nextProfile?.businessName || '').trim())
    }
    if (typeof setClientFirstName === 'function') {
      setClientFirstName(normalizedProfile.firstName || 'Client')
    }
    if (
      !isImpersonatingClient
      && currentUserRole === 'client'
      && targetEmail
      && targetEmail === String(authUser?.email || '').trim().toLowerCase()
    ) {
      syncCurrentUserEmail({
        previousEmail: targetEmail,
        nextEmail: targetEmail,
        nextFullName: normalizedProfile.fullName || authUser?.fullName || '',
        nextRoleInCompany: normalizedProfile.roleInCompany || authUser?.roleInCompany || '',
      })
    }
    return { ok: true, profile: normalizedProfile }
  }

  const handleClientAssetChange = async (nextAssets = {}) => {
    const normalizedScopedEmail = String(scopedClientEmail || '').trim().toLowerCase()
    const normalizedProfilePhoto = Object.prototype.hasOwnProperty.call(nextAssets, 'profilePhoto')
      ? normalizePersistentClientAssetUrl(nextAssets.profilePhoto)
      : undefined
    const normalizedCompanyLogo = Object.prototype.hasOwnProperty.call(nextAssets, 'companyLogo')
      ? normalizePersistentClientAssetUrl(nextAssets.companyLogo)
      : undefined

    if (normalizedProfilePhoto !== undefined) {
      setProfilePhoto(normalizedProfilePhoto)
    }
    if (normalizedCompanyLogo !== undefined) {
      setCompanyLogo(normalizedCompanyLogo)
    }

    if (normalizedScopedEmail) {
      const workspaceCache = getClientWorkspaceCache(normalizedScopedEmail) || {}
      const nextWorkspace = {}
      if (normalizedProfilePhoto !== undefined) {
        nextWorkspace.profilePhoto = normalizedProfilePhoto
      }
      if (normalizedCompanyLogo !== undefined) {
        nextWorkspace.companyLogo = normalizedCompanyLogo
      }
      if (Object.keys(nextWorkspace).length > 0) {
        setClientWorkspaceCache(normalizedScopedEmail, nextWorkspace)
      }
    }

    return { ok: true }
  }

  const handleSkipOnboarding = async () => {
    const nextSkippedState = {
      ...onboardingState,
      skipped: true,
      completed: false,
      verificationPending: false,
    }
    persistOnboardingState(nextSkippedState, scopedClientEmail)
    const authorizationToken = String(authUser?.firebaseIdToken || '').trim()
    if (!isImpersonatingClient && currentUserRole === 'client' && authorizationToken) {
      await patchClientWorkspaceToBackend({
        authorizationToken,
        workspacePayload: {
          onboardingState: mergeOnboardingStates({
            savedState: onboardingState,
            fetchedState: nextSkippedState,
            settingsProfile: readScopedSettingsProfile(scopedClientEmail),
            fallbackEmail: scopedClientEmail,
            fallbackFullName: authUser?.fullName || '',
          }),
        },
      })
    }
    if (isImpersonatingClient) {
      logAdminActivity({
        adminName: impersonationSession?.adminName || authUser?.fullName || 'Admin User',
        action: 'Skipped onboarding in impersonation mode',
        affectedUser: impersonationSession?.businessName || scopedClientEmail || '--',
        details: 'Admin skipped onboarding steps while in impersonation mode.',
      })
    }
    appendScopedClientLog('Skipped onboarding', 'Onboarding flow was skipped. Setup can be completed later from Settings.')
    showToast('success', 'Onboarding skipped. You can complete setup later.')
  }

  const handleCompleteOnboarding = async (finalData) => {
    const resolvedFinalData = applyTeamAffiliationBusinessFields({
      data: finalData,
      affiliation: clientTeamAffiliation,
    })
    const finalVerificationProgress = resolveVerificationProgress({
      onboardingData: resolvedFinalData,
      settingsDocs: readScopedVerificationDocs(scopedClientEmail),
      settingsProfile: readScopedSettingsProfile(scopedClientEmail),
    })
    const verificationPending = false

    persistOnboardingState({
      currentStep: CLIENT_ONBOARDING_TOTAL_STEPS,
      completed: true,
      skipped: false,
      verificationPending,
      data: resolvedFinalData,
    }, scopedClientEmail)
    setSettingsProfileSnapshot(finalVerificationProgress.profile)
    setVerificationDocsSnapshot(finalVerificationProgress.docs)
    persistScopedVerificationDocs(scopedClientEmail, finalVerificationProgress.docs)

    const workspaceCache = getClientWorkspaceCache(scopedClientEmail) || {}
    const existing = workspaceCache.settingsProfile && typeof workspaceCache.settingsProfile === 'object'
      ? workspaceCache.settingsProfile
      : {}
    const effectiveFullName = isImpersonatingClient
      ? (impersonationSession?.clientName || existing.fullName || '')
      : (authUser?.fullName || existing.fullName || '')
    const existingNameParts = resolveSettingsProfileNameParts(existing)
    const resolvedOnboardingNames = {
      firstName: String(resolvedFinalData.firstName || existingNameParts.firstName || '').trim(),
      lastName: String(resolvedFinalData.lastName || existingNameParts.lastName || '').trim(),
      otherNames: String(resolvedFinalData.otherNames || existingNameParts.otherNames || '').trim(),
    }
    const resolvedFullName = buildSettingsProfileFullName(resolvedOnboardingNames)
      || String(resolvedFinalData.primaryContact || effectiveFullName).trim()
      || effectiveFullName
    const resolvedPhone = sanitizeClientPhoneLocalNumber(
      Object.prototype.hasOwnProperty.call(resolvedFinalData, 'phone')
        ? resolvedFinalData.phone
        : (existing.phoneLocalNumber || existing.phone || ''),
    )
    const resolvedPhoneCountryCode = String(existing.phoneCountryCode || '+234').trim() || '+234'
    const merged = {
      ...existing,
      fullName: resolvedFullName,
      firstName: resolvedOnboardingNames.firstName,
      lastName: resolvedOnboardingNames.lastName,
      otherNames: resolvedOnboardingNames.otherNames,
      email: String(scopedClientEmail || resolvedFinalData.email || existing.email || '').trim().toLowerCase(),
      phone: resolvedPhone,
      phoneCountryCode: resolvedPhoneCountryCode,
      phoneLocalNumber: resolvedPhone,
      roleInCompany: String(resolvedFinalData.roleInCompany ?? existing.roleInCompany ?? '').trim(),
      address: resolvedFinalData.address1 ?? resolvedFinalData.address ?? existing.address1 ?? existing.address ?? '',
      address1: resolvedFinalData.address1 ?? resolvedFinalData.address ?? existing.address1 ?? existing.address ?? '',
      address2: resolvedFinalData.address2 ?? existing.address2 ?? '',
      city: resolvedFinalData.city ?? existing.city ?? '',
      postalCode: resolvedFinalData.postalCode ?? existing.postalCode ?? '',
      addressCountry: resolvedFinalData.addressCountry ?? existing.addressCountry ?? resolvedFinalData.country ?? existing.country ?? '',
      businessType: resolvedFinalData.businessType,
      businessName: resolvedFinalData.businessName,
      country: resolvedFinalData.country,
      industry: resolvedFinalData.industry,
      industryOther: resolvedFinalData.industryOther,
      cacNumber: resolvedFinalData.cacNumber,
      tin: resolvedFinalData.tin,
      reportingCycle: resolvedFinalData.reportingCycle,
      startMonth: resolvedFinalData.startMonth,
      currency: resolvedFinalData.currency,
      language: resolvedFinalData.language,
    }
    setClientWorkspaceCache(scopedClientEmail, {
      settingsProfile: merged,
    })
    const normalizedProfile = normalizeSettingsProfile(merged)
    setSettingsProfileSnapshot(normalizedProfile)
    setCompanyName(merged.businessName?.trim() || '')
    setClientFirstName(normalizedProfile.firstName || 'Client')

    const defaultLandingPage = isImpersonatingClient
      ? 'dashboard'
      : (resolvedFinalData.defaultLandingPage || getDefaultPageForRole(currentUserRole))
    handleSetActivePage(defaultLandingPage, { replace: true })

    const authorizationToken = String(authUser?.firebaseIdToken || '').trim()
    if (!isImpersonatingClient && currentUserRole === 'client' && authorizationToken) {
      await persistClientOnboardingToBackend({
        authorizationToken,
        email: scopedClientEmail || authUser?.email || '',
        fullName: merged.fullName || authUser?.fullName || resolvedFinalData.primaryContact || '',
        onboardingData: resolvedFinalData,
        defaultLandingPage,
      })
      await refreshClientDashboardOverview({ authorizationToken })
    }

    if (isImpersonatingClient) {
      logAdminActivity({
        adminName: impersonationSession?.adminName || authUser?.fullName || 'Admin User',
        action: 'Completed onboarding in impersonation mode',
        affectedUser: impersonationSession?.businessName || scopedClientEmail || '--',
        details: 'Admin completed onboarding and verification submission while in impersonation mode.',
      })
    }
    appendScopedClientLog('Completed onboarding', 'Onboarding steps and verification details were completed.')
    showToast('success', 'Account setup completed successfully.')
  }

  const handleAddDocument = (categoryOverride = '') => {
    if (isAdminView && !isImpersonatingClient) return
    if (isClientVerificationLocked) {
      routeClientToVerificationSettings({ replace: true })
      return
    }
    if (!isIdentityVerificationComplete) {
      routeClientToVerificationSettings({
        replace: true,
        // section: 'identity',
        section: 'business-profile',
        // toastMessage: 'Complete identity verification before uploading documents.',
        toastMessage: 'Complete business verification before uploading documents.',
      })
      return
    }

    const fallbackCategory = activePage === 'bank-statements'
      ? 'bank-statements'
      : activePage === 'sales'
        ? 'sales'
        : 'expenses'
    setModalInitialCategory(categoryOverride || fallbackCategory)
    setIsModalOpen(true)
  }

  const handleCreateClassOption = (categoryId, className) => {
    const normalized = normalizeClassOptions([className])[0]
    if (!normalized) return
    if (categoryId === 'sales') {
      setSalesClassOptions((prev) => normalizeClassOptions([...prev, normalized]))
      return
    }
    if (categoryId === 'expenses') {
      setExpenseClassOptions((prev) => normalizeClassOptions([...prev, normalized]))
      return
    }
    setExpenseClassOptions((prev) => normalizeClassOptions([...prev, normalized]))
    setSalesClassOptions((prev) => normalizeClassOptions([...prev, normalized]))
  }

  const collectBackendDocumentIds = (file = {}) => {
    const ids = new Set()
    const registerId = (value) => {
      const normalized = String(value || '').trim()
      if (normalized) ids.add(normalized)
    }

    registerId(file.backendDocumentId)
    ;(Array.isArray(file.versions) ? file.versions : []).forEach((version = {}) => {
      registerId(version.backendDocumentId)
      const snapshot = version.fileSnapshot && typeof version.fileSnapshot === 'object'
        ? version.fileSnapshot
        : {}
      registerId(snapshot.backendDocumentId)
    })

    return Array.from(ids)
  }

  const collectFileCacheKeys = (file = {}) => {
    const keys = new Set()
    const registerKey = (value) => {
      const normalized = String(value || '').trim()
      if (normalized) keys.add(normalized)
    }

    registerKey(file.fileCacheKey)
    ;(Array.isArray(file.versions) ? file.versions : []).forEach((version = {}) => {
      registerKey(version.fileCacheKey)
      const snapshot = version.fileSnapshot && typeof version.fileSnapshot === 'object'
        ? version.fileSnapshot
        : {}
      registerKey(snapshot.fileCacheKey)
    })

    return Array.from(keys)
  }

  const ensureClientDocumentAvailable = async (file = {}) => {
    const normalizedOwnerEmail = String(
      normalizedScopedClientEmail
      || scopedClientEmail
      || authUser?.email
      || '',
    ).trim().toLowerCase()
    const normalizedFileId = String(file?.fileId || '').trim()
    const normalizedCacheKey = String(
      file?.fileCacheKey
      || buildFileCacheKey({
        ownerEmail: normalizedOwnerEmail,
        fileId: normalizedFileId,
      }),
    ).trim()
    const filePatch = normalizedCacheKey && normalizedCacheKey !== String(file?.fileCacheKey || '').trim()
      ? { fileCacheKey: normalizedCacheKey }
      : {}

    if (file?.rawFile instanceof Blob) {
      return {
        ok: true,
        blob: file.rawFile,
        filePatch,
        message: '',
      }
    }

    if (normalizedCacheKey) {
      const cachedBlob = await getCachedFileBlob(normalizedCacheKey)
      if (cachedBlob instanceof Blob) {
        return {
          ok: true,
          blob: cachedBlob,
          filePatch,
          message: '',
        }
      }
    }

    const backendDocumentId = String(file?.backendDocumentId || '').trim()
    if (!backendDocumentId) {
      return {
        ok: false,
        blob: null,
        filePatch,
        message: 'This file is unavailable for preview or download.',
      }
    }

    const downloadResult = await downloadDocumentBlobFromBackend(backendDocumentId)
    if (!downloadResult.ok || !(downloadResult.blob instanceof Blob)) {
      return {
        ok: false,
        blob: null,
        filePatch,
        message: downloadResult.message || 'Unable to download this file right now.',
      }
    }

    if (normalizedCacheKey) {
      await putCachedFileBlob(normalizedCacheKey, downloadResult.blob, {
        filename: file?.filename || downloadResult.fileName || 'document',
        mimeType: downloadResult.contentType,
      })
    }

    return {
      ok: true,
      blob: downloadResult.blob,
      filePatch,
      message: '',
    }
  }

  const deleteClientDocumentArtifacts = async (targetFiles = []) => {
    const files = Array.isArray(targetFiles) ? targetFiles : [targetFiles]
    const backendDocumentIds = Array.from(new Set(files.flatMap((file) => collectBackendDocumentIds(file))))
    const cacheKeys = Array.from(new Set(files.flatMap((file) => collectFileCacheKeys(file))))

    const deleteResults = await Promise.allSettled(
      backendDocumentIds.map((documentId) => deleteDocumentFromBackend(documentId)),
    )
    const failedDeletes = []
    deleteResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        failedDeletes.push(backendDocumentIds[index])
        return
      }
      if (!result.value?.ok && Number(result.value?.status || 0) !== 404) {
        failedDeletes.push(backendDocumentIds[index])
      }
    })

    if (failedDeletes.length > 0) {
      return {
        ok: false,
        message: 'Unable to delete one or more backend files. Please retry.',
      }
    }

    await Promise.allSettled(cacheKeys.map((cacheKey) => deleteCachedFileBlob(cacheKey)))
    return {
      ok: true,
      message: '',
    }
  }

  const uploadClientDocumentAsset = async ({
    file,
    category = 'other',
    className = '',
    metadata = {},
    tags = [],
  } = {}) => {
    if (!scopedClientUid) {
      throw new Error('The client account is missing a backend UID. Sign in again and retry.')
    }

    return uploadDocumentToBackend({
      file,
      ownerUserId: scopedClientUid,
      category,
      className,
      metadata,
      tags,
    })
  }

  const handleUpload = async ({
    category,
    folderName,
    documentOwner,
    uploadedItems,
    metadataMode = 'single',
    sharedDetails = {},
    individualDetails = {},
  }) => {
    if (!isIdentityVerificationComplete) {
      // return { ok: false, message: 'Complete identity verification before uploading documents.' }
      return { ok: false, message: 'Complete business verification before uploading documents.' }
    }
    if (!category) return { ok: false, message: 'Please select a document category.' }
    if (!folderName?.trim()) return { ok: false, message: 'Please provide a folder name.' }
    if (!documentOwner?.trim()) return { ok: false, message: 'Please provide the document owner.' }
    if (!Array.isArray(uploadedItems) || uploadedItems.length === 0) {
      return { ok: false, message: 'Please upload at least one file.' }
    }

    return runWithSlowRuntimeWatch(async () => {
      const categoryConfig = {
        expenses: { prefix: 'EXP', label: 'Expense', setter: setExpenseDocuments },
        sales: { prefix: 'SAL', label: 'Sales', setter: setSalesDocuments },
        'bank-statements': { prefix: 'BNK', label: 'Bank Statement', setter: setBankStatementDocuments },
      }

      const selectedConfig = categoryConfig[category]
      if (!selectedConfig) return { ok: false, message: 'Please select a document category.' }

      const resolveFileDetails = (item) => {
        if (metadataMode === 'individual') return individualDetails?.[item.key] || {}
        return sharedDetails || {}
      }

      const missingClass = uploadedItems.some((item) => !(resolveFileDetails(item)?.class || '').trim())
      if (missingClass) return { ok: false, message: 'Class is required before uploading.' }

      const ownerName = documentOwner?.trim() || 'Client User'
      const ownerEmail = (
        normalizedScopedClientEmail
        || scopedClientEmail
        || authUser?.email
        || ''
      ).trim().toLowerCase()
      if (!scopedClientUid) {
        return { ok: false, message: 'The client account is missing a backend UID. Sign in again and retry.' }
      }
      const createdAtIso = new Date().toISOString()
      const createdAtDisplay = formatClientDocumentTimestamp(createdAtIso)
      const folderId = `F-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const folderToken = folderId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-8)
      const buildFileReference = (index) => `${selectedConfig.prefix}-${folderToken}-${String(index + 1).padStart(3, '0')}`

      const files = []
      const uploadedBackendFiles = []
      try {
        for (let index = 0; index < uploadedItems.length; index += 1) {
          const item = uploadedItems[index]
          if (!(item?.rawFile instanceof Blob)) {
            throw new Error(`"${item?.name || 'Document'}" is missing its file payload.`)
          }

          const metadata = resolveFileDetails(item)
          const classValue = String(metadata?.class || '').replace(/\s+/g, ' ').trim()
          const classId = buildClassId(classValue)
          const confidentialityLevel = metadata?.confidentialityLevel || 'Standard'
          const processingPriority = metadata?.processingPriority || 'Normal'
          const internalNotes = (metadata?.internalNotes || '').trim()
          const vendorName = (metadata?.vendorName || '').trim()
          const paymentMethod = String(metadata?.paymentMethod || '').trim()
          const invoice = String(metadata?.invoice || '').trim()
          const invoiceNumber = String(metadata?.invoiceNumber || '').trim()
          const fileCreatedAtIso = new Date().toISOString()
          const uploadSource = item.uploadSource || 'browse-file'
          const fileId = buildFileReference(index)
          const fileCacheKey = buildFileCacheKey({ ownerEmail, fileId })
          const backendDocument = await uploadClientDocumentAsset({
            file: item.rawFile,
            category,
            className: classValue,
            metadata: {
              folderId,
              folderName: folderName.trim(),
              fileId,
              ownerName,
              ownerEmail,
              uploadSource,
              confidentialityLevel,
              processingPriority,
              internalNotes,
              vendorName,
              paymentMethod,
              invoice,
              invoiceNumber,
            },
          })

          uploadedBackendFiles.push({
            backendDocumentId: backendDocument?.id || '',
            fileCacheKey,
          })

          if (fileCacheKey) {
            await putCachedFileBlob(fileCacheKey, item.rawFile, { filename: item.name })
          }

          const previewUrl = item.previewUrl || URL.createObjectURL(item.rawFile)
          const uploadSourceLabel = uploadSource === 'drag-drop'
            ? 'Drag & Drop'
            : uploadSource === 'browse-folder'
              ? 'Browse Folder'
              : 'Browse Files'
          const baseFile = {
            folderId,
            folderName: folderName.trim(),
            fileId,
            filename: item.name,
            extension: item.extension || (item.name?.split('.').pop()?.toUpperCase() || 'FILE'),
            status: 'Pending Review',
            class: classValue,
            classId,
            className: classValue,
            expenseClass: category === 'expenses' ? classValue : '',
            salesClass: category === 'sales' ? classValue : '',
            fileCacheKey,
            backendDocumentId: backendDocument?.id || '',
            backendStorageProvider: backendDocument?.storageProvider || '',
            backendStoragePath: backendDocument?.storagePath || '',
            previewUrl,
            ...(category === 'expenses' ? { paymentMethod } : {}),
            ...(category === 'sales' ? { invoice, invoiceNumber } : {}),
          }

          files.push({
            id: `${folderId}-FILE-${String(index + 1).padStart(3, '0')}`,
            folderId,
            folderName: folderName.trim(),
            fileId,
            fileCacheKey,
            filename: item.name,
            extension: baseFile.extension,
            status: 'Pending Review',
            user: ownerName,
            date: createdAtDisplay,
            createdAtIso: fileCreatedAtIso,
            updatedAtIso: fileCreatedAtIso,
            deletedAtIso: null,
            isDeleted: false,
            isLocked: false,
            lockedAtIso: null,
            approvedBy: '',
            approvedAtIso: null,
            rejectedBy: '',
            rejectedAtIso: null,
            rejectionReason: '',
            unlockedBy: '',
            unlockedAtIso: null,
            unlockReason: '',
            class: classValue,
            classId,
            className: classValue,
            expenseClass: category === 'expenses' ? classValue : '',
            salesClass: category === 'sales' ? classValue : '',
            vendorName,
            confidentialityLevel,
            processingPriority,
            internalNotes,
            ...(category === 'expenses' ? { paymentMethod } : {}),
            ...(category === 'sales' ? { invoice, invoiceNumber } : {}),
            backendDocumentId: backendDocument?.id || '',
            backendStorageProvider: backendDocument?.storageProvider || '',
            backendStoragePath: backendDocument?.storagePath || '',
            previewUrl,
            rawFile: item.rawFile,
            uploadSource,
            uploadInfo: {
              originalUploadedAtIso: fileCreatedAtIso,
              originalUploadSource: uploadSource,
              originalUploadedBy: ownerName,
              device: 'Web Browser',
              ipAddress: '--',
              lastModifiedAtIso: fileCreatedAtIso,
              replacements: [],
              totalVersions: 1,
            },
            versions: [
              createVersionEntry({
                versionNumber: 1,
                action: 'Uploaded',
                performedBy: ownerName,
                timestamp: fileCreatedAtIso,
                notes: `Initial upload via ${uploadSourceLabel}.`,
                fileSnapshot: baseFile,
              }),
            ],
            activityLog: [
              createFileActivityEntry({
                actionType: 'upload',
                description: `File uploaded via ${uploadSourceLabel}.`,
                performedBy: ownerName,
                timestamp: fileCreatedAtIso,
              }),
            ],
          })
        }
      } catch (error) {
        await deleteClientDocumentArtifacts(uploadedBackendFiles)
        return {
          ok: false,
          message: String(error?.message || 'Unable to upload documents right now.'),
        }
      }

      if (category === 'expenses') {
        const classValues = files.map((file) => file.class).filter(Boolean)
        if (classValues.length > 0) {
          setExpenseClassOptions((prev) => normalizeClassOptions([...prev, ...classValues]))
        }
      }
      if (category === 'sales') {
        const classValues = files.map((file) => file.class).filter(Boolean)
        if (classValues.length > 0) {
          setSalesClassOptions((prev) => normalizeClassOptions([...prev, ...classValues]))
        }
      }

      const folderRecord = {
        id: folderId,
        isFolder: true,
        folderName: folderName.trim(),
        category: selectedConfig.label,
        user: ownerName,
        createdAtIso,
        createdAtDisplay,
        date: createdAtDisplay,
        files,
      }

      selectedConfig.setter((prev) => [folderRecord, ...prev])
      setUploadHistoryRecords((prev) => [
        ...files.map((file, index) => ({
          id: `UP-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`,
          filename: file.filename,
          type: file.extension || 'FILE',
          categoryId: category,
          category: selectedConfig.label,
          date: file.date || createdAtDisplay,
          user: ownerName,
          ownerEmail,
          status: file.status || 'Pending Review',
          isFolder: false,
          folderId: folderRecord.id,
          fileId: file.fileId,
          uploadSource: file.uploadSource || 'browse-file',
        })),
        ...(Array.isArray(prev) ? prev.filter((row) => !row?.isFolder) : []),
      ])

      appendScopedClientLog(
        'Uploaded files',
        `[${selectedConfig.label}] Uploaded ${files.length} file(s) to folder "${folderRecord.folderName}" (${folderRecord.id}).`,
      )

      setIsModalOpen(false)
      showClientToast('success', 'Documents uploaded successfully.')
      const authorizationToken = String(authUser?.firebaseIdToken || '').trim()
      if (authorizationToken) {
        await refreshClientDashboardOverview({ authorizationToken })
      }
      return { ok: true }
    }, 'Uploading files...')
  }

  const supportClientEmail = String(
    normalizedScopedClientEmail
    || scopedClientEmail
    || authUser?.email
    || '',
  ).trim().toLowerCase()
  const supportClientName = String(
    isImpersonatingClient
      ? (impersonationSession?.clientName || clientFirstName || 'Client User')
      : (authUser?.fullName || clientFirstName || 'Client User'),
  ).trim() || 'Client User'
  const supportBusinessName = String(
    impersonationSession?.businessName
    || companyName
    || '',
  ).trim()
  const clientBusinessCountry = String(
    settingsProfileSnapshot?.country
    || onboardingState.data?.country
    || '',
  ).trim()
  const isClientDashboardPageActive = Boolean(
    (!isAdminView || isImpersonatingClient)
    && activePage === 'dashboard',
  )
  const isClientDashboardOverviewLoading = Boolean(
    isClientDashboardPageActive
    && isDashboardBootstrapLoading,
  )

  const renderClientPage = () => {
    if (isDashboardBootstrapLoading && activePage !== 'dashboard') {
      return (
        <div className="animate-fade-in space-y-5">
          <div className="bg-white rounded-lg border border-border-light shadow-card p-4">
            <DotLottiePreloader size={110} label="Loading dashboard..." className="w-full justify-start" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={`workspace-skeleton-${item}`} className="h-24 bg-white rounded-lg border border-border-light shadow-card animate-pulse" />
            ))}
          </div>
          <div className="h-72 bg-white rounded-lg border border-border-light shadow-card animate-pulse" />
        </div>
      )
    }

    const logDocumentWorkspaceActivity = (categoryId, action, details) => {
      const categoryLabel = categoryId === 'sales'
        ? 'Sales'
        : categoryId === 'bank-statements'
          ? 'Bank Statements'
          : 'Expenses'
      appendScopedClientLog(action, `[${categoryLabel}] ${details}`)
    }

    const downloadBusinessName = String(impersonationSession?.businessName || companyName || '').trim()
    const renderDocumentWorkspace = ({ categoryId, title, records, setRecords }) => {
      const impersonationBusinessName = impersonationSession?.businessName || companyName || 'Client Account'
      const appendFileUploadHistory = ({
        filename,
        extension,
        fileId,
        folderId,
        uploadedBy,
        ownerEmail,
        uploadSource,
        timestampIso,
        status = 'Pending Review',
      } = {}) => {
        const timestamp = timestampIso || new Date().toISOString()
        setUploadHistoryRecords((prev) => [{
          id: `UP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          filename: filename || '--',
          type: extension || 'FILE',
          categoryId,
          category: title,
          timestampIso: timestamp,
          date: formatClientDocumentTimestamp(timestamp),
          user: uploadedBy || authUser?.fullName || clientFirstName || 'Client User',
          ownerEmail: String(ownerEmail || normalizedScopedClientEmail || scopedClientEmail || authUser?.email || '').trim().toLowerCase(),
          status,
          isFolder: false,
          folderId: folderId || '',
          fileId: fileId || '',
          uploadSource: uploadSource || 'browse-file',
        }, ...(Array.isArray(prev) ? prev.filter((row) => !row?.isFolder) : [])])
      }
      const isFolderRoute = activeFolderRoute?.category === categoryId && Boolean(activeFolderRoute?.folderId)
      if (isFolderRoute) {
        const folder = records.find((row) => row?.isFolder && row.id === activeFolderRoute.folderId) || null
        return (
          <ClientFolderFilesPage
            categoryId={categoryId}
            categoryTitle={title}
            records={records}
            folder={folder}
            setRecords={setRecords}
            onLogActivity={(action, details) => logDocumentWorkspaceActivity(categoryId, action, details)}
            onBack={() => handleSetActivePage(categoryId, { replace: true })}
            onOpenFolder={(folderId) => handleOpenFolderRoute(categoryId, folderId)}
            onNavigateDashboard={() => handleSetActivePage('dashboard')}
            isImpersonatingClient={isImpersonatingClient}
            impersonationBusinessName={impersonationBusinessName}
            downloadBusinessName={downloadBusinessName}
            showToast={showClientToast}
            onRecordUploadHistory={appendFileUploadHistory}
            onEnsureFileAvailable={ensureClientDocumentAvailable}
            onDeleteBackendDocuments={deleteClientDocumentArtifacts}
            onUploadDocumentToBackend={uploadClientDocumentAsset}
            globalSearchTerm={dashboardSearchTerm}
            onGlobalSearchTermChange={setDashboardSearchTerm}
          />
        )
      }

      return (
        <ClientDocumentFoldersPage
          categoryId={categoryId}
          title={title}
          records={records}
          setRecords={setRecords}
          onLogActivity={(action, details) => logDocumentWorkspaceActivity(categoryId, action, details)}
          onAddDocument={handleAddDocument}
          onOpenFolder={(folderId) => handleOpenFolderRoute(categoryId, folderId)}
          onNavigateDashboard={() => handleSetActivePage('dashboard')}
          isImpersonatingClient={isImpersonatingClient}
          impersonationBusinessName={impersonationBusinessName}
          showToast={showClientToast}
          onDeleteBackendDocuments={deleteClientDocumentArtifacts}
          globalSearchTerm={dashboardSearchTerm}
          onGlobalSearchTermChange={setDashboardSearchTerm}
        />
      )
    }

    switch (activePage) {
      case 'dashboard':
        return (
          <ClientDashboardPage
            onAddDocument={handleAddDocument}
            setActivePage={handleSetActivePage}
            verificationState={dashboardVerificationState}
            records={dashboardRecords}
            activityLogs={clientActivityRecords}
            documentSummary={clientDashboardOverview?.documentSummary || null}
            isLoading={isClientDashboardOverviewLoading}
            showSlowNetworkOverlay={isSlowRuntimeOverlayVisible}
          />
        )
      case 'expenses':
        return renderDocumentWorkspace({
          categoryId: 'expenses',
          title: 'Expenses',
          records: expenseDocuments,
          setRecords: setExpenseDocuments,
        })
      case 'sales':
        return renderDocumentWorkspace({
          categoryId: 'sales',
          title: 'Sales',
          records: salesDocuments,
          setRecords: setSalesDocuments,
        })
      case 'bank-statements':
        return renderDocumentWorkspace({
          categoryId: 'bank-statements',
          title: 'Bank Statements',
          records: bankStatementDocuments,
          setRecords: setBankStatementDocuments,
        })
      case 'upload-history':
        return (
          <ClientUploadHistoryPage
            records={uploadHistoryRecords}
            expenseRecords={expenseDocuments}
            salesRecords={salesDocuments}
            bankStatementRecords={bankStatementDocuments}
            ownerEmail={normalizedScopedClientEmail}
            downloadBusinessName={downloadBusinessName}
            onOpenFileLocation={(categoryId, folderId) => handleOpenFolderRoute(categoryId, folderId)}
            showToast={showClientToast}
            onEnsureFileAvailable={ensureClientDocumentAvailable}
            globalSearchTerm={dashboardSearchTerm}
            onGlobalSearchTermChange={setDashboardSearchTerm}
          />
        )
      case 'resolved-documents':
        return (
          <ClientResolvedDocumentsPage
            records={resolvedDocumentRecords}
            onRecordsChange={setResolvedDocumentRecords}
            downloadBusinessName={downloadBusinessName}
            showToast={showClientToast}
            globalSearchTerm={dashboardSearchTerm}
            onGlobalSearchTermChange={setDashboardSearchTerm}
          />
        )
      case 'recent-activities':
        return (
          <ClientRecentActivitiesPage
            records={dashboardRecords}
            activityLogs={clientActivityRecords}
            globalSearchTerm={dashboardSearchTerm}
            onGlobalSearchTermChange={setDashboardSearchTerm}
          />
        )
      case 'support':
        return (
          <ClientSupportPage
            clientEmail={supportClientEmail}
            clientName={supportClientName}
            businessName={supportBusinessName}
          />
        )
      case 'settings':
        return (
          // identityApprovedByAdmin={identityVerificationApprovedByAdmin}
          <ClientSettingsPage
            showToast={showClientToast}
            profilePhoto={profilePhoto}
            setProfilePhoto={setProfilePhoto}
            companyLogo={companyLogo}
            setCompanyLogo={setCompanyLogo}
            setCompanyName={setCompanyName}
            setClientFirstName={setClientFirstName}
            settingsStorageKey={getScopedStorageKey('settingsFormData', scopedClientEmail)}
            clientEmail={normalizedScopedClientEmail}
            clientName={isImpersonatingClient ? (impersonationSession?.clientName || authUser?.fullName || '') : (authUser?.fullName || '')}
            verificationState={dashboardVerificationState}
            businessApprovedByAdmin={businessVerificationApprovedByAdmin}
            clientTeamRole={isImpersonatingClient ? 'owner' : (authUser?.clientTeamRole || 'owner')}
            clientTeamOwnerEmail={isImpersonatingClient ? '' : (authUser?.clientTeamOwnerEmail || '')}
            clientTeamOwnerName={isImpersonatingClient ? '' : (authUser?.clientTeamOwnerName || '')}
            clientTeamAffiliation={isImpersonatingClient ? null : clientTeamAffiliation}
            initialSettingsProfile={settingsProfileSnapshot}
            initialVerificationDocs={verificationDocsSnapshot}
            initialAccountSettings={accountSettingsSnapshot}
            initialNotificationSettings={notificationSettingsSnapshot}
            onSettingsProfileChange={handleSettingsProfileChange}
            onClientAssetChange={handleClientAssetChange}
            onVerificationDocsChange={handleSettingsVerificationDocsChange}
            onAccountSettingsChange={handleAccountSettingsChange}
            onNotificationSettingsChange={handleNotificationSettingsChange}
            verificationLockEnforced={isClientVerificationLocked}
            canManageAccountSecurity={!isImpersonatingClient && !isAdminView}
            authProvider={authUser?.authProvider || authUser?.provider || ''}
            hasPassword={authUser?.hasPassword}
            onRequestPasswordResetLink={issuePasswordResetLink}
            onChangePassword={handleChangePassword}
            canDeleteAccount={!isImpersonatingClient && !isAdminView}
            onDeleteAccount={handleDeleteClientAccount}
          />
        )
      default:
        return (
          <ClientDashboardPage
            onAddDocument={handleAddDocument}
            setActivePage={handleSetActivePage}
            verificationState={dashboardVerificationState}
            records={dashboardRecords}
            activityLogs={clientActivityRecords}
            documentSummary={clientDashboardOverview?.documentSummary || null}
            isLoading={isClientDashboardOverviewLoading}
            showSlowNetworkOverlay={isSlowRuntimeOverlayVisible}
          />
        )
    }
  }

  const activeAdminInvite = adminSetupToken ? getAdminInviteByToken(adminSetupToken) : null

  const clientOtpChallenge = otpChallenge && (otpChallenge.purpose === 'signup' || otpChallenge.purpose === 'client-login')
    ? otpChallenge
    : null
  const adminLoginOtpChallenge = otpChallenge?.purpose === 'admin-login' ? otpChallenge : null
  const adminSetupOtpChallenge = otpChallenge?.purpose === 'admin-setup' ? otpChallenge : null
  const shouldShowAdminSetupScreen = Boolean(isAdminSetupRouteActive && (!isAuthenticated || adminSetupSuccessState))

  const needsOnboarding = isAuthenticated
    && (isImpersonatingClient || !isAdminView)
    && !onboardingState.completed
    && !onboardingState.skipped
  const shouldShowAuthenticatedClientPublicSite = Boolean(
    isAuthenticated
    && !isAdminView
    && !isImpersonatingClient
    && !needsOnboarding
    && isPublicSiteView,
  )
  const shouldShowDashboardBootstrapLoader = Boolean(
    isDashboardBootstrapLoading
    && isAuthenticated
    && isAdminView
    && !showAuth
    && !showAdminLogin
    && !isAdminSetupRouteActive
    && !isClientDashboardOverviewLoading
  )

  return (
    <div className="min-h-screen w-full bg-background">
      {shouldShowDashboardBootstrapLoader && (
        <div className="fixed inset-0 z-[230] bg-white/95 backdrop-blur-[1px] flex items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-2xl border border-border-light bg-white shadow-card px-6 py-10 text-center">
            <DotLottiePreloader size={230} className="w-full justify-center" />
          </div>
        </div>
      )}
      {isSlowRuntimeOverlayVisible && !isClientDashboardOverviewLoading && (
        <div className="fixed inset-0 z-[225] bg-black/25 flex items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-2xl border border-border-light bg-white shadow-card px-6 py-10 text-center">
            <DotLottiePreloader size={220} className="w-full justify-center" />
            <p className="mt-3 text-sm font-medium text-text-primary">{slowRuntimeOverlayMessage}</p>
          </div>
        </div>
      )}
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-3 sm:top-6 sm:right-6 z-[200] rounded-lg shadow-lg p-4 flex items-center gap-3 min-w-[280px] max-w-[calc(100vw-1.5rem)] sm:max-w-[420px] ${toast.type === 'success' ? 'bg-success-bg border-l-4 border-success' : 'bg-error-bg border-l-4 border-error'}`}>
          {toast.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
          )}
          <span className={`text-sm font-medium ${toast.type === 'success' ? 'text-success' : 'text-error'}`}>
            {toast.message}
          </span>
          <button 
            onClick={() => setToast(null)}
            className="ml-auto text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isLogoutConfirmOpen && (
        <div className="fixed inset-0 z-[210] bg-black/35 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-border-light rounded-xl shadow-card p-6">
            <h3 className="text-lg font-semibold text-text-primary">Confirm Logout</h3>
            <p className="text-sm text-text-secondary mt-2">Are you sure you want to log out of your account?</p>
            <p className="text-xs text-text-muted mt-2">For security reasons, you will need to sign in again to access your dashboard.</p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={cancelLogout}
                disabled={isLoggingOut}
                className="h-9 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmLogout()}
                disabled={isLoggingOut}
                className="h-9 px-4 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {isLoggingOut ? (
                  <>
                    <DotLottiePreloader size={20} />
                    <span>Processing...</span>
                  </>
                ) : 'Logout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingImpersonationClient && (
        <div className="fixed inset-0 z-[214] bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-border-light rounded-xl shadow-card p-6">
            <h3 className="text-xl font-semibold text-text-primary">Enter Client View Mode</h3>
            <p className="text-sm text-text-secondary mt-2">
              You are about to access this client&apos;s account as a support administrator. All actions will be logged.
            </p>
            <div className="mt-4 rounded-lg border border-border-light bg-background px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Target Business</p>
              <p className="text-sm font-semibold text-text-primary mt-1">{pendingImpersonationClient.businessName}</p>
              <p className="text-xs text-text-muted mt-1">{pendingImpersonationClient.email}</p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingImpersonationClient(null)}
                className="h-9 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={enterImpersonationMode}
                className="h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors"
              >
                Enter Client View
              </button>
            </div>
          </div>
        </div>
      )}

      {shouldShowAdminSetupScreen ? (
        <AdminAccountSetup
          invite={activeAdminInvite}
          ownerBootstrapStatus={ownerBootstrapStatus}
          successState={adminSetupSuccessState}
          otpChallenge={adminSetupOtpChallenge}
          onCreateAccount={handleAdminSetupCreateAccount}
          onVerifyOtp={handleVerifyOtp}
          onResendOtp={handleResendOtp}
          onCancelOtp={handleCancelOtp}
          onContinueToAdmin={handleContinueToAdminFromSetup}
          onReturnToAdminLogin={handleReturnToAdminLoginFromSetup}
        />
      ) : !isAuthenticated ? (
        showAdminLogin ? (
          <AdminLoginPortal
            onLogin={handleAdminLogin}
            otpChallenge={adminLoginOtpChallenge}
            onVerifyOtp={handleVerifyOtp}
            onResendOtp={handleResendOtp}
            onCancelOtp={handleCancelOtp}
            onStartOwnerSetup={() => navigateToAdminSetup()}
            onSwitchToClientLogin={() => navigateToAuth('login', { replace: true })}
          />
        ) : showAuth ? (
          <AuthExperience
            mode={authMode}
            setMode={setAuthMode}
            onLogin={handleLogin}
            onSignup={handleSignup}
            onSocialLogin={handleSocialLogin}
            pendingSocialPrompt={pendingGoogleSocialAuth}
            onCancelSocialNamePrompt={() => setPendingGoogleSocialAuth(null)}
            onRequestPasswordReset={handleRequestPasswordReset}
            onResolvePasswordResetCode={handleResolvePasswordResetCode}
            onUpdatePassword={handleUpdatePassword}
            onResendVerificationEmail={handleResendVerificationEmail}
            onVerifyEmailAddress={handleVerifyEmailAddress}
            verificationEmail={emailVerificationEmail}
            passwordResetEmail={passwordResetEmail}
            setPasswordResetEmail={setPasswordResetEmail}
            otpChallenge={clientOtpChallenge}
            onVerifyOtp={handleVerifyOtp}
            onResendOtp={handleResendOtp}
            onCancelOtp={handleCancelOtp}
            signupPrefill={pendingClientTeamInvite ? {
              email: pendingClientTeamInvite.invite.email,
              lockEmail: true,
              inviteToken: pendingClientTeamInvite.invite.token,
              companyId: pendingClientTeamInvite.invite.companyId,
            } : null}
            signupContextNotice={authMode === 'signup' ? clientTeamInviteSetupMessage : ''}
          />
        ) : (
          <PreliminaryCorporateSite
            activePage={publicSitePage}
            onNavigatePage={(pageId) => navigateToPublicSitePage(pageId)}
            onGetStarted={() => handlePublicGetStarted()}
            onLogin={() => navigateToAuth('login')}
            onOpenAdminPortal={() => navigateToAdminLogin()}
            onOpenOwnerSetup={() => navigateToAdminSetup()}
            isAuthenticated={false}
            onOpenDashboard={() => handleSetActivePage('dashboard')}
          />
        )
      ) : shouldShowAuthenticatedClientPublicSite ? (
        <PreliminaryCorporateSite
          activePage={publicSitePage}
          onNavigatePage={(pageId) => navigateToPublicSitePage(pageId)}
          onGetStarted={() => handleSetActivePage('dashboard')}
          onLogin={() => handleSetActivePage('dashboard')}
          onOpenAdminPortal={() => navigateToAdminLogin()}
          onOpenOwnerSetup={() => navigateToAdminSetup()}
          isAuthenticated
          onOpenDashboard={() => handleSetActivePage('dashboard')}
        />
      ) : needsOnboarding ? (
        <ClientOnboardingExperience
          currentStep={onboardingState.currentStep}
          setCurrentStep={setOnboardingStep}
          data={onboardingState.data}
          setData={setOnboardingData}
          onSkip={handleSkipOnboarding}
          onComplete={handleCompleteOnboarding}
          showToast={showClientToast}
          teamAffiliation={clientTeamAffiliation}
        />
      ) : isAdminView && !isImpersonatingClient ? (
        <>
          {isAdminImpersonationActive && (
            <div className="fixed top-0 left-0 right-0 z-[215] bg-warning-bg border-b border-warning/30">
              <div className="min-h-12 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-warning">
                  <ShieldAlert className="w-4 h-4" />
                  <span className="font-medium">
                    You are impersonating {adminImpersonationSession?.impersonatedAdminName || 'an admin'}.
                  </span>
                  <span className="text-xs text-text-secondary">All actions are logged with admin level.</span>
                </div>
                <button
                  type="button"
                  onClick={() => exitAdminImpersonationMode({ silent: false })}
                  className="h-8 px-3 rounded bg-success text-white text-xs font-semibold hover:bg-[#0a6a41] transition-colors inline-flex items-center gap-1.5"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  Exit Admin Impersonation
                </button>
              </div>
            </div>
          )}
          <div className={isAdminImpersonationActive ? 'pt-12' : ''}>
            <AdminWorkspace
              activePage={activePage}
              setActivePage={handleSetActivePage}
              onLogout={handleLogout}
              showToast={showToast}
              adminFirstName={authUser?.fullName?.trim()?.split(/\s+/)?.[0] || clientFirstName}
              currentAdminAccount={currentAdminAccount}
              onRequestImpersonation={handleRequestImpersonation}
              onRequestAdminImpersonation={handleRequestAdminImpersonation}
              impersonationEnabled={impersonationEnabled}
              onAdminActionLog={handleAdminActionLog}
              onCurrentAdminEmailUpdated={handleCurrentAdminEmailUpdated}
            />
          </div>
        </>
      ) : (
        <>
          {isImpersonatingClient && (
            <div className="fixed top-0 left-0 right-0 z-[215] bg-error-bg border-b border-error/30">
              <div className="min-h-12 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="hidden md:flex items-center gap-2 text-sm text-error">
                  <ShieldAlert className="w-4 h-4" />
                  <span className="font-medium">You are viewing this account as Admin.</span>
                  <span className="text-xs text-text-secondary">All actions are logged.</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:ml-auto">
                  <button
                    type="button"
                    onClick={handleOverrideDocumentStatus}
                    className="h-8 px-2.5 rounded border border-error/40 text-xs font-medium text-error hover:bg-error/10 transition-colors"
                  >
                    Override Doc Status
                  </button>
                  <button
                    type="button"
                    onClick={handleForceVerificationApproval}
                    className="h-8 px-2.5 rounded border border-error/40 text-xs font-medium text-error hover:bg-error/10 transition-colors"
                  >
                    Force Verify
                  </button>
                  <button
                    type="button"
                    onClick={handleCorrectCri}
                    className="h-8 px-2.5 rounded border border-error/40 text-xs font-medium text-error hover:bg-error/10 transition-colors"
                  >
                    Correct CRI
                  </button>
                  <button
                    type="button"
                    onClick={() => exitImpersonationMode({ expired: false })}
                    className="h-8 px-3 rounded bg-success text-white text-xs font-semibold hover:bg-[#0a6a41] transition-colors inline-flex items-center gap-1.5"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    Exit Client View
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className={`flex min-h-screen w-full bg-background ${isImpersonatingClient ? 'pt-16 md:pt-12' : ''}`}>
            <ClientSidebar
              activePage={activePage}
              setActivePage={handleSetActivePage}
              companyLogo={companyLogo}
              companyName={companyName}
              businessCountry={clientBusinessCountry}
              isBusinessVerified={isBusinessVerificationComplete}
              onOpenHomePage={() => navigateToPublicSitePage('home')}
              onLogout={handleLogout}
              isMobileOpen={isMobileSidebarOpen}
              onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />

            <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
              <ClientTopBar
                profilePhoto={isImpersonatingClient ? null : profilePhoto}
                clientFirstName={clientFirstName}
                activePage={activePage}
                showDashboardGreeting={clientDashboardOverview?.dashboard?.showGreeting !== false}
                isIdentityVerified={isIdentityVerificationComplete}
                notifications={userNotifications}
                onOpenSidebar={() => setIsMobileSidebarOpen(true)}
                onOpenProfile={() => handleSetActivePage('settings')}
                onNotificationClick={(notification) => {
                  let nextNotifications = []
                  setUserNotifications((prev) => {
                    nextNotifications = prev.map((item) => (
                      item.id === notification.id ? { ...item, read: true } : item
                    ))
                    return nextNotifications
                  })
                  markClientBriefNotificationRead(normalizedScopedClientEmail, notification?.id)
                  markClientNotificationInboxRead(normalizedScopedClientEmail, notification?.id)
                  void syncClientNotificationReadStateToBackend({ nextNotifications })
                  const resolvedLocation = resolveNotificationDocumentLocation(notification)
                  if (resolvedLocation.categoryId && resolvedLocation.folderId) {
                    handleOpenFolderRoute(resolvedLocation.categoryId, resolvedLocation.folderId, { replace: true })
                    return
                  }
                  if (resolvedLocation.categoryId && CLIENT_DOCUMENT_PAGE_IDS.includes(resolvedLocation.categoryId)) {
                    handleSetActivePage(resolvedLocation.categoryId, { replace: true })
                    return
                  }
                  if (shouldRouteNotificationToSupport(notification)) {
                    if (typeof localStorage !== 'undefined' && notification?.ticketId) {
                      localStorage.setItem(CLIENT_SUPPORT_FOCUS_TICKET_STORAGE_KEY, String(notification.ticketId).trim())
                    }
                    handleSetActivePage('support', { replace: true })
                    return
                  }
                  if (notification.linkPage) {
                    handleSetActivePage(notification.linkPage, { replace: true })
                    return
                  }
                  const linkedPage = resolveNotificationLinkPage(notification)
                  if (linkedPage) {
                    handleSetActivePage(linkedPage, { replace: true })
                    return
                  }
                  if (notification.documentId || notification.fileId) {
                    handleSetActivePage('upload-history', { replace: true })
                  }
                }}
                onMarkAllRead={() => {
                  let nextNotifications = []
                  setUserNotifications(prev => {
                    nextNotifications = prev.map(n => ({ ...n, read: true }))
                    return nextNotifications
                  })
                  markAllClientBriefNotificationsRead(normalizedScopedClientEmail)
                  markAllClientNotificationInboxRead(normalizedScopedClientEmail)
                  void syncClientNotificationReadStateToBackend({ nextNotifications })
                }}
                isImpersonationMode={isImpersonatingClient}
                roleLabel={isImpersonatingClient ? 'Client (Admin View)' : 'Client'}
                forceClientIcon={isImpersonatingClient}
                searchTerm={dashboardSearchTerm}
                onSearchTermChange={handleDashboardSearchTermChange}
                onSearchSubmit={handleDashboardSearchSubmit}
                searchPlaceholder="Search folders, files, upload history, and activities..."
                searchState={dashboardSearchState}
                searchResults={dashboardSearchResults}
                onSearchResultSelect={handleDashboardSearchResultSelect}
                onSearchResultsDismiss={dismissDashboardSearchFeedback}
              />
              <main className="p-4 sm:p-6 flex-1 overflow-auto">
                {renderClientPage()}
              </main>
            </div>
            {!isImpersonatingClient && activePage !== 'support' && (
              <ClientSupportWidget
                clientEmail={supportClientEmail}
                clientName={supportClientName}
                businessName={supportBusinessName}
              />
            )}
            {isModalOpen && <ClientAddDocumentModal
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              initialCategory={modalInitialCategory}
              onUpload={handleUpload}
              showToast={showClientToast}
              expenseClassOptions={expenseClassOptions}
              salesClassOptions={salesClassOptions}
              onCreateClassOption={handleCreateClassOption}
            />}
          </div>
        </>
      )}
    </div>
  )
}

export default App


