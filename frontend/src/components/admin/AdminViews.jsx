import { useState, useEffect, useMemo, useRef } from 'react'
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Bell,
  ShieldCheck,
  FileText,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Search,
  X,
  Download,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Send,
  MessageSquare,
  Edit2,
  Trash2,
  Calendar,
  Building2,
  User,
  Clock,
  Filter,
  UsersRound,
  Building,
  AlertCircle,
  CheckSquare,
  XCircle,
  HelpCircle,
  Mail,
  Activity,
  Flag,
  Pin,
  Eye,
  MoreHorizontal,
  ShieldAlert,
  ArrowLeft,
  Menu,
} from 'lucide-react'
import {
  ADMIN_LEVELS,
  getAdminLevelLabel,
  hasAdminPermission,
  isAdminInvitePending,
  isOperationsAdminLevel,
  isOwnerAdminLevel,
  isSuperAdminLevel,
  isTechnicalAdminLevel,
  normalizeAdminLevel,
  normalizeAdminAccount,
  normalizeAdminInvite,
  normalizeRoleWithLegacyFallback,
} from './adminIdentity'
import {
  CLIENT_ASSIGNMENTS_STORAGE_KEY,
  canAdminAccessClientScope,
  filterClientsForAdminScope,
  readClientAssignmentsFromStorage,
} from './adminAssignments'
import { apiFetch } from '../../utils/apiClient'
import { buildClientResetPasswordLink } from '../../utils/authLinks'
import KiaminaLogo from '../common/KiaminaLogo'
import DotLottiePreloader from '../common/DotLottiePreloader'
import { downloadObjectRowsAsXlsx } from '../../utils/excelWorkbook'
import { getNetworkAwareDurationMs } from '../../utils/networkRuntime'
import { playSupportNotificationSound, SUPPORT_NOTIFICATION_INITIAL_DELAY_MS } from '../../utils/supportNotificationSound'
import { isAdminNotificationSoundEnabled } from '../../utils/adminSecurityPreferences'
import { buildClientDownloadFilename } from '../../utils/downloadFilename'
import { buildFileCacheKey, getCachedFileBlob, putCachedFileBlob } from '../../utils/fileCache'
import {
  buildSupportAttachmentPreview,
  getSupportAttachmentBlob,
  getSupportAttachmentKind,
} from '../../utils/supportAttachments'
import AdminSupportInboxPanel from './support/AdminSupportInboxPanel'
import {
  deleteSupportLead,
  getSupportCenterSnapshot,
  LEAD_CATEGORY,
  refreshSupportStateFromBackend,
  restoreSupportLead,
  subscribeSupportCenter,
  SUPPORT_TICKET_STATUS,
} from '../../utils/supportCenter'
const DEFAULT_ADMIN_ACCOUNT = {
  id: 'ADMIN-CURRENT',
  fullName: 'Admin User',
  email: '',
  role: 'admin',
  adminLevel: ADMIN_LEVELS.SUPER,
}

const ACCOUNTS_STORAGE_KEY = 'kiaminaAccounts'
const ADMIN_ACTIVITY_STORAGE_KEY = 'kiaminaAdminActivityLog'
const ADMIN_WORK_SESSIONS_STORAGE_KEY = 'kiaminaAdminWorkSessions'
const ADMIN_WORK_SESSIONS_SYNC_EVENT = 'kiamina:admin-work-sessions-sync'
const ADMIN_WORK_INACTIVITY_PAUSE_MS = 30 * 60 * 1000
const ADMIN_BREAK_START_HOUR = 13
const ADMIN_BREAK_END_HOUR = 14
const ADMIN_BREAK_DURATION_MS = Math.max(0, ADMIN_BREAK_END_HOUR - ADMIN_BREAK_START_HOUR) * 60 * 60 * 1000
const ADMIN_WORK_ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
const ADMIN_SENT_NOTIFICATIONS_STORAGE_KEY = 'kiaminaAdminSentNotifications'
const ADMIN_NOTIFICATION_DRAFTS_STORAGE_KEY = 'kiaminaAdminNotificationDrafts'
const ADMIN_NOTIFICATION_EDIT_DRAFT_STORAGE_KEY = 'kiaminaAdminNotificationEditDraftId'
const ADMIN_SCHEDULED_NOTIFICATIONS_STORAGE_KEY = 'kiaminaAdminScheduledNotifications'
const CLIENT_BRIEF_NOTIFICATIONS_STORAGE_KEY = 'kiaminaClientBriefNotifications'
const ADMIN_TRASH_STORAGE_KEY = 'kiaminaAdminTrash'
const CLIENT_DOCUMENTS_STORAGE_KEY = 'kiaminaClientDocuments'
const CLIENT_ACTIVITY_STORAGE_KEY = 'kiaminaClientActivityLog'
const CLIENT_STATUS_CONTROL_STORAGE_KEY = 'kiaminaClientStatusControl'
const ACCOUNT_CREATED_AT_FALLBACK_STORAGE_KEY = 'kiaminaAccountCreatedAtFallback'
const ADMIN_INVITES_STORAGE_KEY = 'kiaminaAdminInvites'
const ADMIN_NOTIFICATIONS_SYNC_EVENT = 'kiamina:admin-notifications-sync'
const ADMIN_CLIENT_MANAGEMENT_SYNC_EVENT = 'kiamina:admin-client-management-sync'
const ADMIN_ACTIVITY_SYNC_EVENT = 'kiamina:admin-activity-sync'
const ADMIN_DASHBOARD_STORAGE_MIGRATION_KEY_PREFIX = 'kiaminaAdminDashboardStorageBackendSynced'
const ADMIN_DASHBOARD_STORAGE_SYNC_DEBOUNCE_MS = 400
const DASHBOARD_REFRESH_INTERVAL_MS = 15000
const DASHBOARD_INVITE_EXPIRING_SOON_MS = 12 * 60 * 60 * 1000
const DASHBOARD_SCHEDULED_SOON_MS = 24 * 60 * 60 * 1000
const COMPLIANCE_STATUS = {
  FULL: '?? Fully Compliant',
  ACTION: '?? Action Required',
  PENDING: '?? Verification Pending',
}
const COMPLIANCE_STATUS_OPTIONS = [
  COMPLIANCE_STATUS.FULL,
  COMPLIANCE_STATUS.ACTION,
  COMPLIANCE_STATUS.PENDING,
]
const waitForNetworkAwareDelay = (context = 'search') => new Promise((resolve) => {
  if (typeof window === 'undefined') {
    resolve()
    return
  }
  window.setTimeout(resolve, getNetworkAwareDurationMs(context))
})
const ADMIN_PAGE_PERMISSION_RULES = {
  'admin-documents': ['view_documents'],
  'admin-leads': ['client_assistance'],
  'admin-communications': ['send_notifications', 'client_assistance'],
  'admin-notifications': ['send_notifications'],
  'admin-clients': ['view_businesses', 'view_assigned_clients'],
  'admin-activity': ['view_activity_logs'],
  'admin-trash': ['client_assistance'],
  'admin-client-profile': ['view_businesses', 'view_assigned_clients', 'view_client_settings'],
  'admin-client-documents': ['view_documents'],
  'admin-client-upload-history': ['view_documents', 'view_upload_history'],
  'admin-client-resolved-documents': ['view_documents'],
}
const ADMIN_PAGE_LEVEL_RULES = {
  'admin-work-hours': [
    ADMIN_LEVELS.SUPER,
    ADMIN_LEVELS.AREA_ACCOUNTANT,
    ADMIN_LEVELS.CUSTOMER_SERVICE,
    ADMIN_LEVELS.TECHNICAL_SUPPORT,
  ],
}

const CATEGORY_BUCKET_CONFIG = {
  expenses: { bundleKey: 'expenses', label: 'Expense' },
  sales: { bundleKey: 'sales', label: 'Sales' },
  'bank-statements': { bundleKey: 'bankStatements', label: 'Bank Statement' },
}

const DOCUMENT_REVIEW_STATUS = {
  PENDING_REVIEW: 'Pending Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  INFO_REQUESTED: 'Info Requested',
  DELETED: 'Deleted',
}

const normalizeDocumentReviewStatus = (value, fallback = DOCUMENT_REVIEW_STATUS.PENDING_REVIEW) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return fallback
  if (normalized === 'pending' || normalized === 'pending review') return DOCUMENT_REVIEW_STATUS.PENDING_REVIEW
  if (normalized === 'approved') return DOCUMENT_REVIEW_STATUS.APPROVED
  if (normalized === 'rejected') return DOCUMENT_REVIEW_STATUS.REJECTED
  if (normalized === 'info requested' || normalized === 'needs clarification') return DOCUMENT_REVIEW_STATUS.INFO_REQUESTED
  if (normalized === 'draft') return DOCUMENT_REVIEW_STATUS.PENDING_REVIEW
  if (normalized === 'deleted') return DOCUMENT_REVIEW_STATUS.DELETED
  return fallback
}

const safeParseJson = (rawValue, fallback) => {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : fallback
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

const BACKEND_CLIENT_ROWS_CACHE = {
  initialized: false,
  clients: [],
  summary: {},
  fetchedAtIso: '',
}
let backendClientRowsRefreshPromise = null
let pendingAdminDashboardStoragePatch = {}
let adminDashboardStorageSyncTimer = null
let adminDashboardStorageSyncInFlight = false

const readStoredAuthUserForAdminData = () => {
  if (typeof window === 'undefined') return null
  const sessionUser = safeParseJson(sessionStorage.getItem('kiaminaAuthUser'), null)
  if (sessionUser && typeof sessionUser === 'object') return sessionUser
  const localUser = safeParseJson(localStorage.getItem('kiaminaAuthUser'), null)
  if (localUser && typeof localUser === 'object') return localUser
  return null
}

const isBackendAdminClientManagementEnabled = () => {
  const authUser = readStoredAuthUserForAdminData()
  if (!authUser) return false
  const normalizedEmail = toTrimmedValue(authUser.email).toLowerCase()
  if (!normalizedEmail) return false
  const normalizedRole = normalizeRoleWithLegacyFallback(authUser.role, normalizedEmail)
  return normalizedRole === 'admin'
}

const mapBackendVerificationStatusToCompliance = (value = '') => {
  const normalized = toTrimmedValue(value).toLowerCase()
  if (normalized === 'verified') return COMPLIANCE_STATUS.FULL
  if (normalized === 'rejected' || normalized === 'suspended') return COMPLIANCE_STATUS.ACTION
  return COMPLIANCE_STATUS.PENDING
}

const mapBackendClientRowToClientRow = (row = {}, index = 0) => {
  const normalizedEmail = toTrimmedValue(row.email).toLowerCase()
  const clientProfile = row?.clientProfile && typeof row.clientProfile === 'object' ? row.clientProfile : {}
  const entityProfile = row?.entityProfile && typeof row.entityProfile === 'object' ? row.entityProfile : {}
  const onboarding = row?.onboarding && typeof row.onboarding === 'object' ? row.onboarding : {}
  const verification = row?.verification && typeof row.verification === 'object' ? row.verification : {}
  const notificationPreferences = row?.notificationPreferences && typeof row.notificationPreferences === 'object'
    ? row.notificationPreferences
    : {}
  const clientDashboard = row?.clientDashboard && typeof row.clientDashboard === 'object' ? row.clientDashboard : {}
  const clientWorkspace = row?.clientWorkspace && typeof row.clientWorkspace === 'object' ? row.clientWorkspace : {}
  const settingsProfile = clientWorkspace?.settingsProfile && typeof clientWorkspace.settingsProfile === 'object'
    ? clientWorkspace.settingsProfile
    : {}
  const verificationStatus = mapBackendVerificationStatusToCompliance(row.verificationStatus)
  const onboardingCompleted = Boolean(row.onboardingCompleted)
  const displayName = (
    toTrimmedValue(row.displayName)
    || toTrimmedValue(clientProfile.fullName)
    || toTrimmedValue(settingsProfile.fullName)
    || normalizedEmail
    || `Client ${index + 1}`
  )
  const businessName = (
    toTrimmedValue(row.businessName)
    || toTrimmedValue(entityProfile.businessName)
    || toTrimmedValue(settingsProfile.businessName)
    || displayName
    || 'Unassigned Business'
  )
  const fallbackCriToken = toTrimmedValue(row.uid).replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()
  const cri = fallbackCriToken ? `CRI-${fallbackCriToken}` : `CRI-${String(index + 1).padStart(4, '0')}`
  const createdAtIso = toTrimmedValue(row.createdAt)
  const accountStatus = toTrimmedValue(row.status).toLowerCase()
  const isSuspended = accountStatus === 'suspended'
  const settings = {
    firstName: toTrimmedValue(clientProfile.firstName) || toTrimmedValue(settingsProfile.firstName),
    lastName: toTrimmedValue(clientProfile.lastName) || toTrimmedValue(settingsProfile.lastName),
    otherNames: toTrimmedValue(clientProfile.otherNames) || toTrimmedValue(settingsProfile.otherNames),
    fullName: toTrimmedValue(clientProfile.fullName) || toTrimmedValue(settingsProfile.fullName) || displayName,
    businessName,
    country: toTrimmedValue(row.country) || toTrimmedValue(entityProfile.country) || toTrimmedValue(settingsProfile.country),
    businessType: toTrimmedValue(row.businessType) || toTrimmedValue(entityProfile.businessType) || toTrimmedValue(settingsProfile.businessType),
    currency: toTrimmedValue(row.currency) || toTrimmedValue(entityProfile.currency) || toTrimmedValue(settingsProfile.currency) || 'NGN',
    cri,
  }

  return {
    id: toTrimmedValue(row.uid) || `CL-${String(index + 1).padStart(4, '0')}`,
    uid: toTrimmedValue(row.uid),
    businessName,
    cri,
    primaryContact: displayName,
    email: normalizedEmail || '--',
    country: toTrimmedValue(row.country) || '--',
    verificationStatus,
    onboardingStatus: onboardingCompleted ? 'Completed' : 'In Progress',
    subscriptionStatus: isSuspended ? 'Suspended' : 'Active',
    dateCreated: createdAtIso ? formatTimestamp(createdAtIso) : '--',
    clientStatus: isSuspended ? 'Suspended' : 'Active',
    suspensionMessage: '',
    assignedAreaAccountantEmail: toTrimmedValue(row.assignedToUid),
    assignedAreaAccountantEmails: toTrimmedValue(row.assignedToUid) ? [toTrimmedValue(row.assignedToUid)] : [],
    assignedAreaAccountantName: toTrimmedValue(row.assignedToUid),
    assignedAreaAccountantNames: toTrimmedValue(row.assignedToUid) ? [toTrimmedValue(row.assignedToUid)] : [],
    assignedAreaAssignedAt: '',
    assignedAreaAssignedBy: '',
    rawAccount: {
      uid: toTrimmedValue(row.uid),
      email: normalizedEmail,
      fullName: displayName,
      businessName,
      country: toTrimmedValue(row.country) || toTrimmedValue(entityProfile.country),
      status: accountStatus || 'active',
      role: 'client',
      createdAt: createdAtIso,
    },
    settings,
    onboarding: {
      completed: onboardingCompleted,
      skipped: Boolean(onboarding.skipped),
      verificationPending: onboarding.verificationPending ?? (toTrimmedValue(row.verificationStatus).toLowerCase() !== 'verified'),
      data: onboarding?.data && typeof onboarding.data === 'object' ? onboarding.data : {},
    },
    verification: {
      ...verification,
    },
    verificationDocs: clientWorkspace?.verificationDocs && typeof clientWorkspace.verificationDocs === 'object'
      ? clientWorkspace.verificationDocs
      : {},
    notificationSettings: clientWorkspace?.notificationSettings && typeof clientWorkspace.notificationSettings === 'object'
      ? clientWorkspace.notificationSettings
      : notificationPreferences,
    profilePhoto: toTrimmedValue(clientWorkspace.profilePhoto),
    companyLogo: toTrimmedValue(clientWorkspace.companyLogo),
    clientProfile,
    entityProfile,
    clientDashboard,
    clientWorkspace,
    statusControl: {
      verificationStatus,
      assignedToUid: toTrimmedValue(row.assignedToUid),
      updatedAt: toTrimmedValue(row.updatedAt),
    },
  }
}

const refreshAdminClientRowsFromBackend = async ({ force = false } = {}) => {
  if (!isBackendAdminClientManagementEnabled()) {
    return { ok: false, reason: 'not-admin-session' }
  }
  if (backendClientRowsRefreshPromise && !force) {
    return backendClientRowsRefreshPromise
  }

  backendClientRowsRefreshPromise = (async () => {
    try {
      const response = await apiFetch('/api/users/admin/client-management?limit=200&sortBy=updatedAt&sortOrder=desc')
      const data = await response.json().catch(() => null)
      if (!response.ok || !data || typeof data !== 'object' || !Array.isArray(data.clients)) {
        BACKEND_CLIENT_ROWS_CACHE.initialized = true
        BACKEND_CLIENT_ROWS_CACHE.clients = []
        BACKEND_CLIENT_ROWS_CACHE.summary = {}
        BACKEND_CLIENT_ROWS_CACHE.fetchedAtIso = new Date().toISOString()
        return { ok: false, reason: 'request-failed' }
      }

      BACKEND_CLIENT_ROWS_CACHE.initialized = true
      BACKEND_CLIENT_ROWS_CACHE.clients = data.clients.map((entry, index) => mapBackendClientRowToClientRow(entry, index))
      BACKEND_CLIENT_ROWS_CACHE.summary = data.summary && typeof data.summary === 'object'
        ? data.summary
        : {}
      BACKEND_CLIENT_ROWS_CACHE.fetchedAtIso = new Date().toISOString()
      return { ok: true, clients: BACKEND_CLIENT_ROWS_CACHE.clients, summary: BACKEND_CLIENT_ROWS_CACHE.summary }
    } catch {
      BACKEND_CLIENT_ROWS_CACHE.initialized = true
      BACKEND_CLIENT_ROWS_CACHE.clients = []
      BACKEND_CLIENT_ROWS_CACHE.summary = {}
      BACKEND_CLIENT_ROWS_CACHE.fetchedAtIso = new Date().toISOString()
      return { ok: false, reason: 'network-error' }
    }
  })()
    .finally(() => {
      backendClientRowsRefreshPromise = null
    })

  return backendClientRowsRefreshPromise
}

const fetchAdminClientRowByUidFromBackend = async (uid = '') => {
  const normalizedUid = String(uid || '').trim()
  if (!normalizedUid) return null
  try {
    const response = await apiFetch(`/api/users/admin/client-management/clients/${encodeURIComponent(normalizedUid)}`)
    const data = await response.json().catch(() => null)
    if (!response.ok || !data || typeof data !== 'object') return null
    return mapBackendClientRowToClientRow(data, 0)
  } catch {
    return null
  }
}

const formatTimestamp = (value) => {
  const parsedDate = Date.parse(value || '')
  if (!Number.isFinite(parsedDate)) return value || '--'
  return new Date(parsedDate).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

const normalizeIsoTimestamp = (value = '') => {
  const parsedDate = Date.parse(value || '')
  if (!Number.isFinite(parsedDate)) return ''
  return new Date(parsedDate).toISOString()
}

const toLocalDateKey = (value = '') => {
  const parsedDate = Date.parse(value || '')
  if (!Number.isFinite(parsedDate)) return ''
  const date = new Date(parsedDate)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getLocalDateMsFromDateKey = (dateKey = '') => {
  const [yearRaw, monthRaw, dayRaw] = String(dateKey || '').split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return 0
  const localDate = new Date(year, month - 1, day)
  return localDate.getTime()
}

const formatLocalDateKey = (dateKey = '') => {
  const dateMs = getLocalDateMsFromDateKey(dateKey)
  if (!Number.isFinite(dateMs) || dateMs <= 0) return '--'
  return new Date(dateMs).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  })
}

const normalizeWorkPauseSegments = (pauseSegments = []) => (
  (Array.isArray(pauseSegments) ? pauseSegments : [])
    .map((segment) => {
      const startAt = normalizeIsoTimestamp(segment?.startAt || segment?.pauseStartAt || '')
      const endAt = normalizeIsoTimestamp(segment?.endAt || segment?.pauseEndAt || '')
      if (!startAt || !endAt) return null
      const startMs = Date.parse(startAt)
      const endMs = Date.parse(endAt)
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
      return {
        startAt,
        endAt,
        reason: String(segment?.reason || '').trim() || 'pause',
      }
    })
    .filter(Boolean)
    .sort((left, right) => (Date.parse(left.startAt) || 0) - (Date.parse(right.startAt) || 0))
)

const mergeIntervals = (intervals = []) => {
  const normalizedIntervals = (Array.isArray(intervals) ? intervals : [])
    .map((interval) => {
      const startMs = Number(interval?.startMs)
      const endMs = Number(interval?.endMs)
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
      return { startMs, endMs }
    })
    .filter(Boolean)
    .sort((left, right) => left.startMs - right.startMs)
  const mergedIntervals = []
  normalizedIntervals.forEach((interval) => {
    const previousInterval = mergedIntervals[mergedIntervals.length - 1]
    if (!previousInterval || interval.startMs > previousInterval.endMs) {
      mergedIntervals.push({ ...interval })
      return
    }
    previousInterval.endMs = Math.max(previousInterval.endMs, interval.endMs)
  })
  return mergedIntervals
}

const getBreakOverlapMsForInterval = (startMs, endMs) => {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0
  let overlapMs = 0
  const cursorDate = new Date(startMs)
  cursorDate.setHours(0, 0, 0, 0)
  const endDate = new Date(endMs)
  endDate.setHours(0, 0, 0, 0)
  while (cursorDate.getTime() <= endDate.getTime()) {
    const breakStartMs = new Date(
      cursorDate.getFullYear(),
      cursorDate.getMonth(),
      cursorDate.getDate(),
      ADMIN_BREAK_START_HOUR,
      0,
      0,
      0,
    ).getTime()
    const breakEndMs = new Date(
      cursorDate.getFullYear(),
      cursorDate.getMonth(),
      cursorDate.getDate(),
      ADMIN_BREAK_END_HOUR,
      0,
      0,
      0,
    ).getTime()
    overlapMs += Math.max(0, Math.min(endMs, breakEndMs) - Math.max(startMs, breakStartMs))
    cursorDate.setDate(cursorDate.getDate() + 1)
  }
  return overlapMs
}

const getBreakWindowMsForDateKey = (dateKey = '') => {
  const [yearRaw, monthRaw, dayRaw] = String(dateKey || '').split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return { breakStartMs: 0, breakEndMs: 0 }
  }
  const breakStartMs = new Date(year, month - 1, day, ADMIN_BREAK_START_HOUR, 0, 0, 0).getTime()
  const breakEndMs = new Date(year, month - 1, day, ADMIN_BREAK_END_HOUR, 0, 0, 0).getTime()
  return { breakStartMs, breakEndMs }
}

const getPaidBreakBonusMsForSessions = (sessions = [], dateKey = '', nowMs = Date.now()) => {
  const normalizedDateKey = String(dateKey || '').trim()
  if (!normalizedDateKey) return 0
  const { breakStartMs } = getBreakWindowMsForDateKey(normalizedDateKey)
  if (!Number.isFinite(breakStartMs) || breakStartMs <= 0) return 0

  let earliestClockInMs = Number.POSITIVE_INFINITY
  let latestPresenceMs = 0
  ;(Array.isArray(sessions) ? sessions : []).forEach((session) => {
    const clockInMs = Date.parse(session?.clockInAt || '')
    if (!Number.isFinite(clockInMs)) return
    const sessionDateKey = toLocalDateKey(session?.clockInAt || '')
    if (sessionDateKey !== normalizedDateKey) return
    earliestClockInMs = Math.min(earliestClockInMs, clockInMs)
    const clockOutMs = session?.clockOutAt ? Date.parse(session.clockOutAt) : Number(nowMs)
    if (Number.isFinite(clockOutMs)) {
      latestPresenceMs = Math.max(latestPresenceMs, clockOutMs)
    }
  })

  if (!Number.isFinite(earliestClockInMs) || earliestClockInMs >= breakStartMs) return 0
  if (!Number.isFinite(latestPresenceMs) || latestPresenceMs < breakStartMs) return 0
  return ADMIN_BREAK_DURATION_MS
}

const getWorkSessionActiveIntervals = (session = {}, nowMs = Date.now()) => {
  const startMs = Date.parse(session?.clockInAt || '')
  if (!Number.isFinite(startMs)) return []
  const endMs = session?.clockOutAt ? Date.parse(session.clockOutAt) : Number(nowMs)
  if (!Number.isFinite(endMs) || endMs <= startMs) return []

  const pausedIntervals = normalizeWorkPauseSegments(session?.pauseSegments)
    .map((segment) => {
      const segmentStartMs = Math.max(startMs, Date.parse(segment.startAt))
      const segmentEndMs = Math.min(endMs, Date.parse(segment.endAt))
      if (!Number.isFinite(segmentStartMs) || !Number.isFinite(segmentEndMs) || segmentEndMs <= segmentStartMs) return null
      return { startMs: segmentStartMs, endMs: segmentEndMs }
    })
    .filter(Boolean)

  const activePauseStartMs = Date.parse(session?.pauseStartedAt || '')
  if (
    !session?.clockOutAt
    && Number.isFinite(activePauseStartMs)
    && activePauseStartMs < endMs
  ) {
    pausedIntervals.push({
      startMs: Math.max(startMs, activePauseStartMs),
      endMs,
    })
  }

  const mergedPausedIntervals = mergeIntervals(pausedIntervals)
  const activeIntervals = []
  let cursorMs = startMs
  mergedPausedIntervals.forEach((pauseInterval) => {
    if (pauseInterval.startMs > cursorMs) {
      activeIntervals.push({
        startMs: cursorMs,
        endMs: pauseInterval.startMs,
      })
    }
    cursorMs = Math.max(cursorMs, pauseInterval.endMs)
  })
  if (cursorMs < endMs) {
    activeIntervals.push({
      startMs: cursorMs,
      endMs,
    })
  }
  return activeIntervals
}

const getWorkSessionStatus = (session = {}) => {
  if (session?.clockOutAt) return 'Completed'
  if (session?.pauseStartedAt) return 'Paused'
  return 'Active'
}

const getAdminWorkSessionsFromStorage = () => {
  const storedSessions = safeParseJson(localStorage.getItem(ADMIN_WORK_SESSIONS_STORAGE_KEY), [])
  if (!Array.isArray(storedSessions)) return []
  return storedSessions
    .map((session, index) => {
      const clockInAt = normalizeIsoTimestamp(session?.clockInAt || session?.startedAt || session?.timestamp || '')
      if (!clockInAt) return null
      const clockOutAt = normalizeIsoTimestamp(session?.clockOutAt || session?.endedAt || '')
      const normalizedAdminLevel = normalizeAdminLevel(session?.adminLevel || ADMIN_LEVELS.SUPER)
      const pauseStartedAtRaw = normalizeIsoTimestamp(session?.pauseStartedAt || '')
      const pauseStartedAtMs = Date.parse(pauseStartedAtRaw || '')
      const clockInMs = Date.parse(clockInAt)
      const clockOutMs = Date.parse(clockOutAt || '')
      const hasOpenPause = Number.isFinite(pauseStartedAtMs)
        && pauseStartedAtMs >= clockInMs
        && (!clockOutAt || pauseStartedAtMs < clockOutMs)
      return {
        id: session?.id || `WORK-${index + 1}-${Date.parse(clockInAt)}`,
        adminName: String(session?.adminName || 'Admin User').trim() || 'Admin User',
        adminEmail: String(session?.adminEmail || '').trim().toLowerCase(),
        adminLevel: normalizedAdminLevel,
        adminLevelLabel: getAdminLevelLabel(normalizedAdminLevel),
        clockInAt,
        clockOutAt: clockOutAt && Date.parse(clockOutAt) >= Date.parse(clockInAt) ? clockOutAt : '',
        pauseSegments: normalizeWorkPauseSegments(session?.pauseSegments),
        pauseStartedAt: hasOpenPause ? pauseStartedAtRaw : '',
        pauseReason: hasOpenPause ? (String(session?.pauseReason || '').trim() || 'pause') : '',
      }
    })
    .filter(Boolean)
    .sort((left, right) => (Date.parse(right.clockInAt) || 0) - (Date.parse(left.clockInAt) || 0))
}

const writeAdminWorkSessionsToStorage = (sessions = [], { syncToBackend = true } = {}) => {
  const normalizedSessions = Array.isArray(sessions) ? sessions : []
  localStorage.setItem(ADMIN_WORK_SESSIONS_STORAGE_KEY, JSON.stringify(normalizedSessions))
  if (syncToBackend) {
    queueAdminDashboardStorageSync({
      workSessions: normalizedSessions,
    })
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ADMIN_WORK_SESSIONS_SYNC_EVENT))
  }
}

const getWorkSessionDurationMs = (session = {}, nowMs = Date.now()) => {
  const activeIntervals = getWorkSessionActiveIntervals(session, nowMs)
  const grossActiveMs = activeIntervals.reduce(
    (totalMs, interval) => totalMs + (interval.endMs - interval.startMs),
    0,
  )
  const breakOverlapMs = activeIntervals.reduce(
    (totalMs, interval) => totalMs + getBreakOverlapMsForInterval(interval.startMs, interval.endMs),
    0,
  )
  return Math.max(0, grossActiveMs - breakOverlapMs)
}

const formatWorkDuration = (durationMs = 0) => {
  const totalMinutes = Math.max(0, Math.floor(Number(durationMs || 0) / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const getActiveAdminWorkSessionForEmail = (sessions = [], adminEmail = '') => {
  const normalizedEmail = String(adminEmail || '').trim().toLowerCase()
  if (!normalizedEmail) return null
  const activeSessions = (Array.isArray(sessions) ? sessions : [])
    .filter((session) => (
      !session?.clockOutAt
      && String(session?.adminEmail || '').trim().toLowerCase() === normalizedEmail
    ))
    .sort((left, right) => (Date.parse(right?.clockInAt || '') || 0) - (Date.parse(left?.clockInAt || '') || 0))
  return activeSessions[0] || null
}

const readAccountCreatedAtFallbackMap = () => {
  const parsed = safeParseJson(localStorage.getItem(ACCOUNT_CREATED_AT_FALLBACK_STORAGE_KEY), {})
  if (!parsed || typeof parsed !== 'object') return {}
  return parsed
}

const writeAccountCreatedAtFallbackMap = (map = {}) => {
  localStorage.setItem(ACCOUNT_CREATED_AT_FALLBACK_STORAGE_KEY, JSON.stringify(map))
}

const resolveAccountCreatedAtIso = (account = {}, normalizedEmail = '', fallbackMap = {}) => {
  const candidates = [
    account.createdAt,
    account.createdAtIso,
    account.dateCreated,
    account.registeredAt,
  ]
  const fromAccount = candidates.find((value) => Number.isFinite(Date.parse(value || '')))
  if (fromAccount) return new Date(fromAccount).toISOString()
  if (normalizedEmail && Number.isFinite(Date.parse(fallbackMap[normalizedEmail] || ''))) {
    return new Date(fallbackMap[normalizedEmail]).toISOString()
  }
  if (!normalizedEmail) return ''
  const now = new Date().toISOString()
  fallbackMap[normalizedEmail] = now
  return now
}

const toDateTimeLocalValue = (value = '') => {
  const parsedDate = Date.parse(value || '')
  if (!Number.isFinite(parsedDate)) return ''
  const sourceDate = new Date(parsedDate)
  const timezoneOffsetMs = sourceDate.getTimezoneOffset() * 60000
  return new Date(parsedDate - timezoneOffsetMs).toISOString().slice(0, 16)
}

const getScopedStorageObject = (baseKey, email) => {
  const normalizedEmail = (email || '').trim().toLowerCase()
  const scopedKey = normalizedEmail ? `${baseKey}:${normalizedEmail}` : baseKey
  const scopedValue = safeParseJson(localStorage.getItem(scopedKey), null)
  if (scopedValue && typeof scopedValue === 'object') return scopedValue
  const fallbackValue = safeParseJson(localStorage.getItem(baseKey), null)
  return fallbackValue && typeof fallbackValue === 'object' ? fallbackValue : {}
}

const getScopedStorageArray = (baseKey, email) => {
  const normalizedEmail = (email || '').trim().toLowerCase()
  const scopedKey = normalizedEmail ? `${baseKey}:${normalizedEmail}` : baseKey
  const scopedValue = safeParseJson(localStorage.getItem(scopedKey), null)
  if (Array.isArray(scopedValue)) return scopedValue
  const fallbackValue = safeParseJson(localStorage.getItem(baseKey), null)
  return Array.isArray(fallbackValue) ? fallbackValue : []
}

const getScopedStorageString = (baseKey, email) => {
  const normalizedEmail = (email || '').trim().toLowerCase()
  const scopedKey = normalizedEmail ? `${baseKey}:${normalizedEmail}` : baseKey
  const scopedValue = localStorage.getItem(scopedKey)
  if (scopedValue) return scopedValue
  return localStorage.getItem(baseKey) || ''
}

const writeScopedStorageObject = (baseKey, email, value) => {
  const normalizedEmail = (email || '').trim().toLowerCase()
  const scopedKey = normalizedEmail ? `${baseKey}:${normalizedEmail}` : baseKey
  localStorage.setItem(scopedKey, JSON.stringify(value))
}

const writeScopedStorageString = (baseKey, email, value) => {
  const normalizedEmail = (email || '').trim().toLowerCase()
  const scopedKey = normalizedEmail ? `${baseKey}:${normalizedEmail}` : baseKey
  localStorage.setItem(scopedKey, value)
}

const removeScopedStorageValue = (baseKey, email) => {
  const normalizedEmail = (email || '').trim().toLowerCase()
  if (!normalizedEmail) return
  localStorage.removeItem(`${baseKey}:${normalizedEmail}`)
}

const migrateScopedClientData = (fromEmail, toEmail) => {
  const sourceEmail = (fromEmail || '').trim().toLowerCase()
  const targetEmail = (toEmail || '').trim().toLowerCase()
  if (!sourceEmail || !targetEmail || sourceEmail === targetEmail) return

  const keysToMove = [
    'settingsFormData',
    'kiaminaOnboardingState',
    'notificationSettings',
    'verificationDocs',
    'profilePhoto',
    'companyLogo',
    CLIENT_DOCUMENTS_STORAGE_KEY,
    CLIENT_ACTIVITY_STORAGE_KEY,
    CLIENT_STATUS_CONTROL_STORAGE_KEY,
  ]

  keysToMove.forEach((baseKey) => {
    const sourceKey = `${baseKey}:${sourceEmail}`
    const targetKey = `${baseKey}:${targetEmail}`
    const sourceValue = localStorage.getItem(sourceKey)
    if (sourceValue === null) return
    localStorage.setItem(targetKey, sourceValue)
    localStorage.removeItem(sourceKey)
  })
}

const appendScopedClientActivityLog = (email, entry = {}) => {
  const normalizedEmail = (email || '').trim().toLowerCase()
  if (!normalizedEmail) return []
  const key = `${CLIENT_ACTIVITY_STORAGE_KEY}:${normalizedEmail}`
  const existing = safeParseJson(localStorage.getItem(key), [])
  const list = Array.isArray(existing) ? existing : []
  const nextEntry = {
    id: `CLLOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    actorName: entry.actorName || 'Admin User',
    actorRole: entry.actorRole || 'admin',
    action: entry.action || 'Client activity',
    details: entry.details || '--',
    timestamp: new Date().toISOString(),
  }
  const nextList = [nextEntry, ...list]
  localStorage.setItem(key, JSON.stringify(nextList))
  return nextList
}

const writeClientDocumentBundle = (email = '', bundle = {}) => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return null
  const key = `${CLIENT_DOCUMENTS_STORAGE_KEY}:${normalizedEmail}`
  localStorage.setItem(key, JSON.stringify(bundle && typeof bundle === 'object' ? bundle : {}))
  return bundle
}

const persistAdminClientWorkspaceArtifacts = async ({
  client = {},
  documents = null,
  activityLog = null,
} = {}) => {
  const normalizedUid = String(client?.uid || '').trim()
  if (!normalizedUid) {
    return { ok: false, skipped: true }
  }
  const payload = {}
  if (documents && typeof documents === 'object') payload.documents = documents
  if (Array.isArray(activityLog)) payload.activityLog = activityLog
  if (Object.keys(payload).length === 0) {
    return { ok: false, skipped: true }
  }

  try {
    const response = await apiFetch(`/api/users/admin/client-management/clients/${encodeURIComponent(normalizedUid)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await response.json().catch(() => null)
    return { ok: response.ok, data }
  } catch (error) {
    return {
      ok: false,
      data: { message: String(error?.message || 'Unable to synchronize client workspace.') },
    }
  }
}

const toTrimmedValue = (value) => String(value || '').trim()
const normalizeBooleanPreference = (value = false) => (
  value === true || String(value || '').trim().toLowerCase() === 'true'
)
const hasMeaningfulClientDataValue = (value) => {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return Boolean(value.trim())
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}
const mergeClientDataObjects = (preferred = {}, fallback = {}) => {
  const base = fallback && typeof fallback === 'object' && !Array.isArray(fallback)
    ? { ...fallback }
    : {}
  if (!preferred || typeof preferred !== 'object' || Array.isArray(preferred)) return base
  Object.entries(preferred).forEach(([key, value]) => {
    if (hasMeaningfulClientDataValue(value)) {
      base[key] = value
    }
  })
  return base
}
const PHONE_COUNTRY_CODE_OPTIONS = ['+234', '+1', '+44', '+61']
const resolvePhoneParts = (value = '', fallbackCode = '+234') => {
  const raw = String(value || '').trim()
  const option = PHONE_COUNTRY_CODE_OPTIONS.find((countryCode) => raw.startsWith(countryCode))
  if (!raw) {
    return {
      code: fallbackCode,
      number: '',
    }
  }
  if (!option) {
    return {
      code: fallbackCode,
      number: raw,
    }
  }
  return {
    code: option,
    number: raw.slice(option.length).trim(),
  }
}
const formatPhoneNumber = (code = '+234', number = '') => {
  const normalizedCode = String(code || '').trim() || '+234'
  const normalizedNumber = String(number || '').trim()
  if (!normalizedNumber) return ''
  return `${normalizedCode} ${normalizedNumber}`.trim()
}
const FINANCIAL_MONTH_NAMES = Object.freeze([
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
])
const FINANCIAL_MONTH_LOOKUP = Object.freeze(
  FINANCIAL_MONTH_NAMES.reduce((acc, monthName, index) => {
    acc[monthName.toLowerCase()] = index + 1
    acc[monthName.slice(0, 3).toLowerCase()] = index + 1
    return acc
  }, {}),
)
const padMonth = (value) => String(value).padStart(2, '0')
const FINANCIAL_MONTH_OPTIONS = Object.freeze(
  FINANCIAL_MONTH_NAMES.map((monthName, index) => ({
    value: padMonth(index + 1),
    label: monthName,
  })),
)
const getFinancialBoundaryMonth = (value = '') => {
  const raw = toTrimmedValue(value)
  if (!raw) return ''

  const canonicalMatch = raw.match(/^(\d{2})-(?:\d{2}|LAST)$/i)
  if (canonicalMatch) {
    const month = Number(canonicalMatch[1])
    if (month >= 1 && month <= 12) return padMonth(month)
  }

  const isoMatch = raw.match(/^\d{4}-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const month = Number(isoMatch[1])
    if (month >= 1 && month <= 12) return padMonth(month)
  }

  const firstLastMatch = raw.match(/^(First|Last)\s+day\s+of\s+([A-Za-z]+)$/i)
  if (firstLastMatch) {
    const month = FINANCIAL_MONTH_LOOKUP[toTrimmedValue(firstLastMatch[2]).toLowerCase()]
    if (month) return padMonth(month)
  }

  const shortMonthMatch = raw.match(/^(\d{1,2})\s+([A-Za-z]+)$/)
  if (shortMonthMatch) {
    const month = FINANCIAL_MONTH_LOOKUP[toTrimmedValue(shortMonthMatch[2]).toLowerCase()]
    if (month) return padMonth(month)
  }

  const numericMonth = Number(raw)
  if (Number.isFinite(numericMonth) && numericMonth >= 1 && numericMonth <= 12) {
    return padMonth(numericMonth)
  }

  const monthByName = FINANCIAL_MONTH_LOOKUP[raw.toLowerCase()]
  if (monthByName) return padMonth(monthByName)

  return ''
}
const normalizeFinancialBoundaryDate = (value = '', boundary = 'start') => {
  const month = getFinancialBoundaryMonth(value)
  if (!month) return ''
  return boundary === 'end' ? `${month}-LAST` : `${month}-01`
}
const formatFinancialBoundaryDisplay = (value = '', boundary = 'start') => {
  const month = getFinancialBoundaryMonth(value)
  if (!month) return ''
  const monthIndex = Number(month) - 1
  const monthName = FINANCIAL_MONTH_NAMES[monthIndex]
  if (!monthName) return ''
  return boundary === 'end'
    ? `Last day of ${monthName}`
    : `First day of ${monthName}`
}

const toIsoOrFallback = (value, fallback = new Date().toISOString()) => {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback
}

const emitAdminNotificationsSync = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(ADMIN_NOTIFICATIONS_SYNC_EVENT))
}

const getAdminDashboardStorageMigrationKey = () => {
  const authUser = readStoredAuthUserForAdminData()
  const normalizedEmail = String(authUser?.email || '').trim().toLowerCase()
  return normalizedEmail
    ? `${ADMIN_DASHBOARD_STORAGE_MIGRATION_KEY_PREFIX}:${normalizedEmail}`
    : ADMIN_DASHBOARD_STORAGE_MIGRATION_KEY_PREFIX
}

const hasAdminDashboardStorageMigrationCompleted = () => {
  if (typeof window === 'undefined') return false
  return String(localStorage.getItem(getAdminDashboardStorageMigrationKey()) || '').trim() === '1'
}

const markAdminDashboardStorageMigrationCompleted = () => {
  if (typeof window === 'undefined') return
  localStorage.setItem(getAdminDashboardStorageMigrationKey(), '1')
}

const createNotificationDraftId = () => (
  `DRF-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`
)

const createScheduledNotificationId = () => (
  `SCH-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`
)

const normalizeSentNotification = (notification = {}, index = 0) => ({
  id: toTrimmedValue(notification.id) || `SN-${index + 1}`,
  title: toTrimmedValue(notification.title) || 'Untitled Notification',
  message: String(notification.message || ''),
  audience: toTrimmedValue(notification.audience) || 'Users',
  dateSent: toTrimmedValue(notification.dateSent) || formatTimestamp(notification.sentAtIso || new Date().toISOString()),
  openRate: toTrimmedValue(notification.openRate) || '--',
  status: toTrimmedValue(notification.status) || 'Delivered',
  sentAtIso: toTrimmedValue(notification.sentAtIso) || new Date().toISOString(),
})

const readAdminSentNotificationsFromStorage = () => {
  const stored = safeParseJson(localStorage.getItem(ADMIN_SENT_NOTIFICATIONS_STORAGE_KEY), null)
  const source = Array.isArray(stored) ? stored : []
  return source.map((notification, index) => normalizeSentNotification(notification, index))
}

const persistAdminSentNotificationsToStorage = (notifications = [], { syncToBackend = true } = {}) => {
  const normalized = (Array.isArray(notifications) ? notifications : [])
    .map((notification, index) => normalizeSentNotification(notification, index))
  localStorage.setItem(ADMIN_SENT_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(normalized))
  if (syncToBackend) {
    queueAdminDashboardStorageSync({
      sentNotifications: normalized,
    })
  }
  emitAdminNotificationsSync()
}

const normalizeNotificationDraft = (draft = {}) => ({
  id: toTrimmedValue(draft.id) || createNotificationDraftId(),
  mode: toTrimmedValue(draft.mode) === 'targeted' ? 'targeted' : 'bulk',
  bulkAudience: toTrimmedValue(draft.bulkAudience) || 'all-users',
  deliveryMode: toTrimmedValue(draft.deliveryMode) === 'scheduled' ? 'scheduled' : 'now',
  title: String(draft.title || ''),
  message: String(draft.message || ''),
  link: String(draft.link || ''),
  priority: toTrimmedValue(draft.priority) || 'normal',
  scheduledForIso: toTrimmedValue(draft.scheduledForIso) ? toIsoOrFallback(draft.scheduledForIso, '') : '',
  searchUser: String(draft.searchUser || ''),
  selectedUsers: Array.isArray(draft.selectedUsers) ? [...draft.selectedUsers] : [],
  forceAdminMessage: normalizeBooleanPreference(draft.forceAdminMessage),
  filters: {
    business: toTrimmedValue(draft.filters?.business),
    country: toTrimmedValue(draft.filters?.country),
    role: toTrimmedValue(draft.filters?.role),
    verificationStatus: toTrimmedValue(draft.filters?.verificationStatus),
    registrationStage: toTrimmedValue(draft.filters?.registrationStage),
  },
  status: 'Draft',
  createdAtIso: toTrimmedValue(draft.createdAtIso) || new Date().toISOString(),
  updatedAtIso: toTrimmedValue(draft.updatedAtIso) || new Date().toISOString(),
})

const readAdminNotificationDraftsFromStorage = () => {
  const stored = safeParseJson(localStorage.getItem(ADMIN_NOTIFICATION_DRAFTS_STORAGE_KEY), [])
  if (!Array.isArray(stored)) return []
  return stored
    .map((draft) => normalizeNotificationDraft(draft))
    .sort((left, right) => (Date.parse(right.updatedAtIso || '') || 0) - (Date.parse(left.updatedAtIso || '') || 0))
}

const persistAdminNotificationDraftsToStorage = (drafts = [], { syncToBackend = true } = {}) => {
  const normalized = (Array.isArray(drafts) ? drafts : [])
    .map((draft) => normalizeNotificationDraft(draft))
    .sort((left, right) => (Date.parse(right.updatedAtIso || '') || 0) - (Date.parse(left.updatedAtIso || '') || 0))
  localStorage.setItem(ADMIN_NOTIFICATION_DRAFTS_STORAGE_KEY, JSON.stringify(normalized))
  if (syncToBackend) {
    queueAdminDashboardStorageSync({
      notificationDrafts: normalized,
    })
  }
  emitAdminNotificationsSync()
}

const upsertAdminNotificationDraftInStorage = (draft = {}) => {
  const normalizedDraft = normalizeNotificationDraft(draft)
  const existingDrafts = readAdminNotificationDraftsFromStorage()
  const hasMatch = existingDrafts.some((item) => item.id === normalizedDraft.id)
  const nextDrafts = hasMatch
    ? existingDrafts.map((item) => (item.id === normalizedDraft.id ? normalizedDraft : item))
    : [normalizedDraft, ...existingDrafts]
  persistAdminNotificationDraftsToStorage(nextDrafts)
  return normalizedDraft
}

const removeAdminNotificationDraftFromStorage = (draftId = '') => {
  const normalizedDraftId = toTrimmedValue(draftId)
  if (!normalizedDraftId) return
  const nextDrafts = readAdminNotificationDraftsFromStorage().filter((draft) => draft.id !== normalizedDraftId)
  persistAdminNotificationDraftsToStorage(nextDrafts)
}

const normalizeScheduledNotificationStatus = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'sent') return 'Sent'
  if (normalized === 'cancelled') return 'Cancelled'
  if (normalized === 'failed') return 'Failed'
  if (normalized === 'sending') return 'Sending'
  return 'Scheduled'
}

const normalizeScheduledNotification = (entry = {}, index = 0) => {
  const createdAtIso = toIsoOrFallback(entry.createdAtIso)
  const scheduledForIso = toIsoOrFallback(entry.scheduledForIso, createdAtIso)
  return {
    id: toTrimmedValue(entry.id) || createScheduledNotificationId(),
    mode: toTrimmedValue(entry.mode) === 'targeted' ? 'targeted' : 'bulk',
    bulkAudience: toTrimmedValue(entry.bulkAudience) || 'all-users',
    title: toTrimmedValue(entry.title) || `Scheduled Notification ${index + 1}`,
    message: String(entry.message || ''),
    link: toTrimmedValue(entry.link),
    priority: toTrimmedValue(entry.priority) || 'normal',
    selectedUsers: Array.isArray(entry.selectedUsers) ? [...entry.selectedUsers] : [],
    forceAdminMessage: normalizeBooleanPreference(entry.forceAdminMessage),
    status: normalizeScheduledNotificationStatus(entry.status),
    createdAtIso,
    updatedAtIso: toIsoOrFallback(entry.updatedAtIso, createdAtIso),
    scheduledForIso,
    sentAtIso: toTrimmedValue(entry.sentAtIso) ? toIsoOrFallback(entry.sentAtIso, '') : '',
    lastAttemptAtIso: toTrimmedValue(entry.lastAttemptAtIso) ? toIsoOrFallback(entry.lastAttemptAtIso, '') : '',
    recipientCount: Number(entry.recipientCount || 0),
    emailSuccessCount: Number(entry.emailSuccessCount || 0),
    emailFailureCount: Number(entry.emailFailureCount || 0),
    sentNotificationId: toTrimmedValue(entry.sentNotificationId),
    deliveryOrigin: toTrimmedValue(entry.deliveryOrigin) || 'scheduled',
  }
}

const readAdminScheduledNotificationsFromStorage = () => {
  const stored = safeParseJson(localStorage.getItem(ADMIN_SCHEDULED_NOTIFICATIONS_STORAGE_KEY), [])
  if (!Array.isArray(stored)) return []
  return stored
    .map((entry, index) => normalizeScheduledNotification(entry, index))
    .sort((left, right) => (Date.parse(left.scheduledForIso || '') || 0) - (Date.parse(right.scheduledForIso || '') || 0))
}

const persistAdminScheduledNotificationsToStorage = (entries = [], { syncToBackend = true } = {}) => {
  const normalized = (Array.isArray(entries) ? entries : [])
    .map((entry, index) => normalizeScheduledNotification(entry, index))
    .sort((left, right) => (Date.parse(left.scheduledForIso || '') || 0) - (Date.parse(right.scheduledForIso || '') || 0))
  localStorage.setItem(ADMIN_SCHEDULED_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(normalized))
  if (syncToBackend) {
    queueAdminDashboardStorageSync({
      scheduledNotifications: normalized,
    })
  }
  emitAdminNotificationsSync()
}

const upsertAdminScheduledNotificationInStorage = (entry = {}) => {
  const normalizedEntry = normalizeScheduledNotification(entry)
  const existingEntries = readAdminScheduledNotificationsFromStorage()
  const hasMatch = existingEntries.some((item) => item.id === normalizedEntry.id)
  const nextEntries = hasMatch
    ? existingEntries.map((item) => (item.id === normalizedEntry.id ? normalizedEntry : item))
    : [...existingEntries, normalizedEntry]
  persistAdminScheduledNotificationsToStorage(nextEntries)
  return normalizedEntry
}

const removeAdminScheduledNotificationFromStorage = (scheduledId = '') => {
  const normalizedId = toTrimmedValue(scheduledId)
  if (!normalizedId) return
  const nextEntries = readAdminScheduledNotificationsFromStorage().filter((entry) => entry.id !== normalizedId)
  persistAdminScheduledNotificationsToStorage(nextEntries)
}

const normalizeNotificationRecipient = (recipient = {}, index = 0) => {
  const normalizedEmail = String(recipient.email || '').trim().toLowerCase()
  return {
    id: toTrimmedValue(recipient.id) || `REC-${index + 1}`,
    uid: toTrimmedValue(recipient.uid),
    fullName: toTrimmedValue(recipient.fullName) || normalizedEmail || `User ${index + 1}`,
    email: normalizedEmail,
    businessName: toTrimmedValue(recipient.businessName) || 'Unknown Business',
    role: toTrimmedValue(recipient.role) || 'Client',
    country: toTrimmedValue(recipient.country) || '--',
    verificationStatus: toTrimmedValue(recipient.verificationStatus) || 'Pending',
    registrationStage: toTrimmedValue(recipient.registrationStage) || 'Onboarding',
  }
}

const getNotificationRecipientsDirectory = () => {
  const byEmail = new Map()
  const pushRecipient = (recipient = {}) => {
    const normalized = normalizeNotificationRecipient(recipient)
    if (!normalized.email) return
    byEmail.set(normalized.email, normalized)
  }

  const rawAccounts = safeParseJson(localStorage.getItem(ACCOUNTS_STORAGE_KEY), [])
  if (Array.isArray(rawAccounts)) {
    rawAccounts.forEach((account, index) => {
      const normalizedEmail = String(account?.email || '').trim().toLowerCase()
      if (!normalizedEmail) return
      const normalizedRole = normalizeRoleWithLegacyFallback(account?.role, normalizedEmail)
      if (normalizedRole === 'admin') return
      pushRecipient({
        id: account?.id || `ACC-${index + 1}`,
        uid: account?.uid || '',
        fullName: account?.fullName || normalizedEmail,
        email: normalizedEmail,
        businessName: account?.businessName || account?.companyName || '',
        role: account?.role || (normalizedRole === 'client' ? 'Client' : 'User'),
      })
    })
  }

  const clientRows = readClientRows()
  clientRows.forEach((client, index) => {
    pushRecipient({
      id: client.id || `CLI-${index + 1}`,
      uid: client.uid || client.id || '',
      fullName: client.primaryContact || client.businessName || client.email,
      email: client.email,
      businessName: client.businessName,
      role: 'Client',
      country: client.country,
      verificationStatus: String(client.verificationStatus || '').includes('Fully')
        ? 'Verified'
        : String(client.verificationStatus || '').includes('Action')
          ? 'Rejected'
          : 'Pending',
      registrationStage: client.onboardingStatus === 'Completed' ? 'Completed' : 'Onboarding',
    })
  })

  return Array.from(byEmail.values())
    .filter((recipient) => recipient.email)
    .sort((left, right) => left.fullName.localeCompare(right.fullName))
}

const resolveNotificationRecipients = ({
  mode = 'bulk',
  bulkAudience = 'all-users',
  selectedUsers = [],
} = {}) => {
  const directory = getNotificationRecipientsDirectory()
  if (mode === 'targeted') {
    const selectedIdSet = new Set((Array.isArray(selectedUsers) ? selectedUsers : []).map((id) => String(id)))
    return directory.filter((recipient) => selectedIdSet.has(String(recipient.id)))
  }
  if (bulkAudience === 'pending-verification') {
    return directory.filter((recipient) => recipient.verificationStatus === 'Pending')
  }
  if (bulkAudience === 'all-accountants') {
    return directory.filter((recipient) => recipient.role.toLowerCase() === 'accountant')
  }
  if (bulkAudience === 'all-businesses') {
    return directory.filter((recipient) => recipient.businessName && recipient.businessName !== 'Unknown Business')
  }
  return directory
}

const getNotificationAudienceLabel = ({
  mode = 'bulk',
  bulkAudience = 'all-users',
  selectedUsers = [],
} = {}) => {
  if (mode === 'targeted') return `${selectedUsers.length} Selected Users`
  return bulkAudience
    .split('-')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')
}

const readClientBriefNotificationsFromStorage = (email = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return []
  const scopedKey = `${CLIENT_BRIEF_NOTIFICATIONS_STORAGE_KEY}:${normalizedEmail}`
  const stored = safeParseJson(localStorage.getItem(scopedKey), [])
  if (!Array.isArray(stored)) return []
  return stored
}

const appendClientBriefNotificationsToStorage = (email = '', entries = []) => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const additions = Array.isArray(entries) ? entries : []
  if (!normalizedEmail || additions.length === 0) return
  const scopedKey = `${CLIENT_BRIEF_NOTIFICATIONS_STORAGE_KEY}:${normalizedEmail}`
  const existingEntries = readClientBriefNotificationsFromStorage(normalizedEmail)
  localStorage.setItem(scopedKey, JSON.stringify([...additions, ...existingEntries].slice(0, 100)))
}

const deliverNotificationEmail = async ({
  recipient,
  notification,
  sentAtIso,
  deliveryOrigin = 'manual',
}) => {
  if (!recipient?.email) return false
  try {
    const response = await apiFetch('/api/notifications/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipient.email,
        subject: notification.title,
        message: notification.message,
        link: notification.link || '',
        priority: notification.priority || 'normal',
        sentAtIso,
        deliveryOrigin,
      }),
    })
    return response.ok
  } catch {
    return false
  }
}

const deliverClientBellNotification = async ({
  recipient,
  notification,
}) => {
  const normalizedUid = String(recipient?.uid || '').trim()
  if (!normalizedUid) return false

  const notificationEntry = {
    id: `CBN-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`,
    type: 'admin-notification',
    title: String(notification?.title || '').trim() || 'New Update',
    message: String(notification?.message || '').trim(),
    body: String(notification?.message || '').trim(),
    link: String(notification?.link || '').trim(),
    priority: String(notification?.priority || 'normal').trim().toLowerCase() || 'normal',
    forceDelivery: Boolean(notification?.forceDelivery),
    sentAtIso: String(notification?.sentAtIso || new Date().toISOString()).trim(),
    read: false,
  }

  try {
    const response = await apiFetch(`/api/users/admin/client-management/clients/${encodeURIComponent(normalizedUid)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notifications: [notificationEntry],
      }),
    })
    return response.ok
  } catch {
    return false
  }
}

const dispatchAdminNotification = async ({
  mode = 'bulk',
  bulkAudience = 'all-users',
  selectedUsers = [],
  title = '',
  message = '',
  link = '',
  priority = 'normal',
  forceAdminMessage = false,
  deliveryOrigin = 'manual',
}) => {
  const recipients = resolveNotificationRecipients({ mode, bulkAudience, selectedUsers })
  const sentAtIso = new Date().toISOString()
  const normalizedTitle = toTrimmedValue(title) || 'Untitled Notification'
  const normalizedMessage = String(message || '')
  const normalizedLink = toTrimmedValue(link)
  const normalizedPriority = toTrimmedValue(priority) || 'normal'
  const shouldForceAdminMessage = normalizeBooleanPreference(forceAdminMessage)
  const normalizedAudience = getNotificationAudienceLabel({ mode, bulkAudience, selectedUsers })

  if (recipients.length === 0) {
    return {
      ok: false,
      reason: 'empty-recipients',
      recipients: [],
      recipientCount: 0,
      sentNotification: null,
      emailSuccessCount: 0,
      emailFailureCount: 0,
    }
  }

  const emailResults = await Promise.all(
    recipients.map((recipient) => deliverNotificationEmail({
      recipient,
      notification: {
        title: normalizedTitle,
        message: normalizedMessage,
        link: normalizedLink,
        priority: normalizedPriority,
      },
      sentAtIso,
      deliveryOrigin,
    })),
  )
  const bellResults = await Promise.all(
    recipients.map((recipient) => deliverClientBellNotification({
      recipient,
      notification: {
        title: normalizedTitle,
        message: normalizedMessage,
        link: normalizedLink,
        priority: normalizedPriority,
        forceDelivery: shouldForceAdminMessage,
        sentAtIso,
      },
    })),
  )
  const emailSuccessCount = emailResults.filter(Boolean).length
  const emailFailureCount = Math.max(0, recipients.length - emailSuccessCount)
  const bellSuccessCount = bellResults.filter(Boolean).length
  const bellFailureCount = Math.max(0, recipients.length - bellSuccessCount)
  if (emailSuccessCount <= 0 && bellSuccessCount <= 0) {
    return {
      ok: false,
      reason: 'notification-delivery-failed',
      recipients,
      recipientCount: recipients.length,
      sentNotification: null,
      emailSuccessCount,
      emailFailureCount,
      bellSuccessCount,
      bellFailureCount,
    }
  }

  const sentNotification = normalizeSentNotification({
    id: `SN-${Date.now().toString(36).toUpperCase()}`,
    title: normalizedTitle,
    message: normalizedMessage,
    audience: normalizedAudience,
    dateSent: formatTimestamp(sentAtIso),
    openRate: '--',
    status: emailFailureCount > 0 || bellFailureCount > 0 ? 'Partially Delivered' : 'Delivered',
    sentAtIso,
  })
  persistAdminSentNotificationsToStorage([
    sentNotification,
    ...readAdminSentNotificationsFromStorage(),
  ])

  return {
    ok: true,
    recipients,
    recipientCount: recipients.length,
    sentNotification,
    emailSuccessCount,
    emailFailureCount,
    bellSuccessCount,
    bellFailureCount,
  }
}

let scheduledNotificationProcessorPromise = null

const runScheduledNotificationProcessor = async () => {
  if (scheduledNotificationProcessorPromise) return scheduledNotificationProcessorPromise
  scheduledNotificationProcessorPromise = (async () => {
    const nowMs = Date.now()
    const scheduledEntries = readAdminScheduledNotificationsFromStorage()
    const dueEntries = scheduledEntries.filter((entry) => (
      entry.status === 'Scheduled'
      && Number.isFinite(Date.parse(entry.scheduledForIso || ''))
      && Date.parse(entry.scheduledForIso) <= nowMs
    ))

    if (dueEntries.length === 0) {
      return { processedCount: 0, deliveredCount: 0, failedCount: 0 }
    }

    const processingById = new Map(dueEntries.map((entry) => [
      entry.id,
      {
        ...entry,
        status: 'Sending',
        updatedAtIso: new Date().toISOString(),
        lastAttemptAtIso: new Date().toISOString(),
      },
    ]))
    const sendingSnapshot = scheduledEntries.map((entry) => processingById.get(entry.id) || entry)
    persistAdminScheduledNotificationsToStorage(sendingSnapshot)

    let deliveredCount = 0
    let failedCount = 0
    let updatedEntries = [...sendingSnapshot]
    for (const entry of dueEntries) {
      const result = await dispatchAdminNotification({
        mode: entry.mode,
        bulkAudience: entry.bulkAudience,
        selectedUsers: entry.selectedUsers,
        title: entry.title,
        message: entry.message,
        link: entry.link,
        priority: entry.priority,
        forceAdminMessage: entry.forceAdminMessage,
        deliveryOrigin: 'scheduled',
      })

      const nowIso = new Date().toISOString()
      const nextStatus = result.ok ? 'Sent' : 'Failed'
      if (result.ok) deliveredCount += 1
      else failedCount += 1
      updatedEntries = updatedEntries.map((candidate) => (
        candidate.id === entry.id
          ? normalizeScheduledNotification({
            ...candidate,
            status: nextStatus,
            sentAtIso: result.sentNotification?.sentAtIso || candidate.sentAtIso || '',
            updatedAtIso: nowIso,
            lastAttemptAtIso: nowIso,
            recipientCount: result.recipientCount || 0,
            emailSuccessCount: result.emailSuccessCount || 0,
            emailFailureCount: result.emailFailureCount || 0,
            sentNotificationId: result.sentNotification?.id || '',
          })
          : candidate
      ))
    }

    persistAdminScheduledNotificationsToStorage(updatedEntries)
    return {
      processedCount: dueEntries.length,
      deliveredCount,
      failedCount,
    }
  })()

  try {
    return await scheduledNotificationProcessorPromise
  } finally {
    scheduledNotificationProcessorPromise = null
  }
}

const createAdminTrashEntryId = () => (
  `TRASH-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`
)

const normalizeAdminTrashEntry = (entry = {}, index = 0) => ({
  id: toTrimmedValue(entry.id) || `TRASH-${index + 1}`,
  entityType: toTrimmedValue(entry.entityType) || 'unknown',
  entityLabel: toTrimmedValue(entry.entityLabel) || 'Deleted Item',
  description: String(entry.description || ''),
  deletedByName: toTrimmedValue(entry.deletedByName) || 'Admin User',
  deletedAtIso: toTrimmedValue(entry.deletedAtIso) || new Date().toISOString(),
  payload: entry.payload && typeof entry.payload === 'object' ? entry.payload : {},
})

const readAdminTrashEntriesFromStorage = () => {
  const stored = safeParseJson(localStorage.getItem(ADMIN_TRASH_STORAGE_KEY), [])
  if (!Array.isArray(stored)) return []
  return stored
    .map((entry, index) => normalizeAdminTrashEntry(entry, index))
    .sort((left, right) => (Date.parse(right.deletedAtIso || '') || 0) - (Date.parse(left.deletedAtIso || '') || 0))
}

const persistAdminTrashEntriesToStorage = (entries = [], { syncToBackend = true } = {}) => {
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .map((entry, index) => normalizeAdminTrashEntry(entry, index))
    .sort((left, right) => (Date.parse(right.deletedAtIso || '') || 0) - (Date.parse(left.deletedAtIso || '') || 0))
  localStorage.setItem(ADMIN_TRASH_STORAGE_KEY, JSON.stringify(normalizedEntries))
  if (syncToBackend) {
    queueAdminDashboardStorageSync({
      trashEntries: normalizedEntries,
    })
  }
  emitAdminNotificationsSync()
}

const appendAdminTrashEntryToStorage = (entry = {}) => {
  const normalizedEntry = normalizeAdminTrashEntry({
    ...entry,
    id: toTrimmedValue(entry.id) || createAdminTrashEntryId(),
    deletedAtIso: toTrimmedValue(entry.deletedAtIso) || new Date().toISOString(),
  })
  const existingEntries = readAdminTrashEntriesFromStorage()
  persistAdminTrashEntriesToStorage([normalizedEntry, ...existingEntries])
  return normalizedEntry
}

const removeAdminTrashEntryFromStorage = (entryId = '') => {
  const normalizedEntryId = toTrimmedValue(entryId)
  if (!normalizedEntryId) return
  const nextEntries = readAdminTrashEntriesFromStorage().filter((entry) => entry.id !== normalizedEntryId)
  persistAdminTrashEntriesToStorage(nextEntries)
}

const clearAdminTrashEntriesFromStorage = () => {
  localStorage.removeItem(ADMIN_TRASH_STORAGE_KEY)
  queueAdminDashboardStorageSync({
    trashEntries: [],
  })
  emitAdminNotificationsSync()
}

const readAdminDashboardStorageCollectionsFromLocal = () => ({
  workSessions: getAdminWorkSessionsFromStorage(),
  sentNotifications: readAdminSentNotificationsFromStorage(),
  notificationDrafts: readAdminNotificationDraftsFromStorage(),
  scheduledNotifications: readAdminScheduledNotificationsFromStorage(),
  trashEntries: readAdminTrashEntriesFromStorage(),
})

const applyAdminDashboardStorageCollectionsToLocal = (dashboard = {}, { syncToBackend = false } = {}) => {
  if (dashboard.workSessions !== undefined) {
    writeAdminWorkSessionsToStorage(
      Array.isArray(dashboard.workSessions) ? dashboard.workSessions : [],
      { syncToBackend },
    )
  }
  if (dashboard.sentNotifications !== undefined) {
    persistAdminSentNotificationsToStorage(
      Array.isArray(dashboard.sentNotifications) ? dashboard.sentNotifications : [],
      { syncToBackend },
    )
  }
  if (dashboard.notificationDrafts !== undefined) {
    persistAdminNotificationDraftsToStorage(
      Array.isArray(dashboard.notificationDrafts) ? dashboard.notificationDrafts : [],
      { syncToBackend },
    )
  }
  if (dashboard.scheduledNotifications !== undefined) {
    persistAdminScheduledNotificationsToStorage(
      Array.isArray(dashboard.scheduledNotifications) ? dashboard.scheduledNotifications : [],
      { syncToBackend },
    )
  }
  if (dashboard.trashEntries !== undefined) {
    persistAdminTrashEntriesToStorage(
      Array.isArray(dashboard.trashEntries) ? dashboard.trashEntries : [],
      { syncToBackend },
    )
  }
}

const queueAdminDashboardStorageSync = (partialPayload = {}) => {
  if (typeof window === 'undefined' || !isBackendAdminClientManagementEnabled()) return

  const nextEntries = Object.entries(partialPayload || {})
    .filter(([key, value]) => (
      ['workSessions', 'sentNotifications', 'notificationDrafts', 'scheduledNotifications', 'trashEntries'].includes(key)
      && Array.isArray(value)
    ))

  if (nextEntries.length === 0) return

  pendingAdminDashboardStoragePatch = {
    ...pendingAdminDashboardStoragePatch,
    ...Object.fromEntries(nextEntries),
  }

  if (adminDashboardStorageSyncTimer) {
    window.clearTimeout(adminDashboardStorageSyncTimer)
  }

  adminDashboardStorageSyncTimer = window.setTimeout(() => {
    adminDashboardStorageSyncTimer = null
    void flushAdminDashboardStorageSync()
  }, ADMIN_DASHBOARD_STORAGE_SYNC_DEBOUNCE_MS)
}

const flushAdminDashboardStorageSync = async () => {
  if (adminDashboardStorageSyncInFlight) return

  const payload = pendingAdminDashboardStoragePatch
  if (Object.keys(payload).length === 0) return

  pendingAdminDashboardStoragePatch = {}
  adminDashboardStorageSyncInFlight = true
  let requestFailed = false

  try {
    const response = await apiFetch('/api/users/me/admin-dashboard', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      requestFailed = true
      pendingAdminDashboardStoragePatch = {
        ...payload,
        ...pendingAdminDashboardStoragePatch,
      }
      return
    }

    const dashboard = data?.dashboard && typeof data.dashboard === 'object' ? data.dashboard : null
    if (dashboard) {
      applyAdminDashboardStorageCollectionsToLocal(dashboard, { syncToBackend: false })
    }
    markAdminDashboardStorageMigrationCompleted()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kiamina:admin-dashboard-realtime-sync'))
    }
  } catch {
    requestFailed = true
    pendingAdminDashboardStoragePatch = {
      ...payload,
      ...pendingAdminDashboardStoragePatch,
    }
  } finally {
    adminDashboardStorageSyncInFlight = false
    if (!requestFailed && Object.keys(pendingAdminDashboardStoragePatch).length > 0) {
      if (adminDashboardStorageSyncTimer) {
        window.clearTimeout(adminDashboardStorageSyncTimer)
      }
      adminDashboardStorageSyncTimer = window.setTimeout(() => {
        adminDashboardStorageSyncTimer = null
        void flushAdminDashboardStorageSync()
      }, ADMIN_DASHBOARD_STORAGE_SYNC_DEBOUNCE_MS)
    }
  }
}

const applyHydratedAdminDashboardCollections = ({
  dashboard = {},
  localCollections = {},
  migrationCompleted = false,
} = {}) => {
  const resolvedDashboard = {}
  const backfillPayload = {}
  const fieldNames = [
    'workSessions',
    'sentNotifications',
    'notificationDrafts',
    'scheduledNotifications',
    'trashEntries',
  ]

  fieldNames.forEach((fieldName) => {
    const backendRows = Array.isArray(dashboard[fieldName]) ? dashboard[fieldName] : []
    const localRows = Array.isArray(localCollections[fieldName]) ? localCollections[fieldName] : []

    if (backendRows.length > 0 || migrationCompleted || localRows.length === 0) {
      resolvedDashboard[fieldName] = backendRows
      return
    }

    backfillPayload[fieldName] = localRows
  })

  applyAdminDashboardStorageCollectionsToLocal(resolvedDashboard, { syncToBackend: false })
  return { backfillPayload }
}

const hydrateAdminDashboardStorageFromBackend = async () => {
  if (typeof window === 'undefined' || !isBackendAdminClientManagementEnabled()) {
    return { ok: false, skipped: true }
  }

  try {
    const response = await apiFetch('/api/users/me/admin-dashboard', {
      method: 'GET',
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data || typeof data !== 'object') {
      return { ok: false, skipped: true }
    }

    const dashboard = data?.dashboard && typeof data.dashboard === 'object' ? data.dashboard : {}
    const migrationCompleted = hasAdminDashboardStorageMigrationCompleted()
    const localCollections = readAdminDashboardStorageCollectionsFromLocal()
    const { backfillPayload } = applyHydratedAdminDashboardCollections({
      dashboard,
      localCollections,
      migrationCompleted,
    })

    if (Object.keys(backfillPayload).length > 0) {
      queueAdminDashboardStorageSync(backfillPayload)
    } else {
      markAdminDashboardStorageMigrationCompleted()
    }

    window.dispatchEvent(new Event('kiamina:admin-dashboard-realtime-sync'))
    return { ok: true, dashboard }
  } catch {
    return { ok: false, skipped: true }
  }
}

const normalizeComplianceStatus = (value, fallback = COMPLIANCE_STATUS.PENDING) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return fallback

  if (
    normalized.includes('fully compliant')
    || normalized === 'verified'
    || normalized === 'approved'
    || normalized === 'compliant'
  ) {
    return COMPLIANCE_STATUS.FULL
  }

  if (
    normalized.includes('action required')
    || normalized === 'suspended'
    || normalized === 'rejected'
    || normalized.includes('clarification')
    || normalized.includes('info requested')
  ) {
    return COMPLIANCE_STATUS.ACTION
  }

  if (
    normalized.includes('verification pending')
    || normalized === 'pending'
    || normalized.includes('awaiting')
  ) {
    return COMPLIANCE_STATUS.PENDING
  }

  return fallback
}

const isActionRequiredStatus = (status) => (
  normalizeComplianceStatus(status, '') === COMPLIANCE_STATUS.ACTION
)

const CLIENT_VERIFICATION_LOCK_MESSAGE = 'Client is not fully verified. Document decisions are locked until full verification.'

const requiresClientFullVerificationForReviewDecision = (status = '') => {
  const normalizedStatus = normalizeDocumentReviewStatus(status, DOCUMENT_REVIEW_STATUS.PENDING_REVIEW)
  return (
    normalizedStatus === DOCUMENT_REVIEW_STATUS.APPROVED
    || normalizedStatus === DOCUMENT_REVIEW_STATUS.REJECTED
    || normalizedStatus === DOCUMENT_REVIEW_STATUS.INFO_REQUESTED
  )
}

const isClientFullyVerifiedForDocumentReview = (clientEmail = '') => {
  const normalizedEmail = String(clientEmail || '').trim().toLowerCase()
  if (!normalizedEmail) return false
  const client = readClientRows().find((item) => item.email === normalizedEmail)
  const normalizedCompliance = normalizeComplianceStatus(client?.verificationStatus, COMPLIANCE_STATUS.PENDING)
  return normalizedCompliance === COMPLIANCE_STATUS.FULL
}

const createClientDocumentFallback = () => ({
  expenses: [],
  sales: [],
  bankStatements: [],
  uploadHistory: [],
  resolvedDocuments: [],
})

const readClientDocumentBundle = (client) => {
  const email = (client?.email || '').trim().toLowerCase()
  if (!email) return createClientDocumentFallback(client)

  const workspaceDocuments = client?.clientWorkspace?.documents
  const scopedKey = `${CLIENT_DOCUMENTS_STORAGE_KEY}:${email}`
  const scopedValue = safeParseJson(localStorage.getItem(scopedKey), null)
  const fallbackValue = safeParseJson(localStorage.getItem(CLIENT_DOCUMENTS_STORAGE_KEY), null)
  const source = workspaceDocuments && typeof workspaceDocuments === 'object'
    ? workspaceDocuments
    : scopedValue && typeof scopedValue === 'object'
      ? scopedValue
      : (fallbackValue && typeof fallbackValue === 'object' ? fallbackValue : null)

  if (!source) return createClientDocumentFallback(client)

  const fallback = createClientDocumentFallback(client)
  const normalizedExpenses = Array.isArray(source.expenses) ? source.expenses : fallback.expenses
  const normalizedSales = Array.isArray(source.sales) ? source.sales : fallback.sales
  const normalizedBankStatements = Array.isArray(source.bankStatements) ? source.bankStatements : fallback.bankStatements
  const normalizedUploadHistory = Array.isArray(source.uploadHistory)
    ? source.uploadHistory
    : [...normalizedExpenses, ...normalizedSales, ...normalizedBankStatements].map((item, index) => ({
      id: `UPL-${index + 1}-${item.id}`,
      filename: item.filename || 'Document',
      type: item.extension || (item.filename?.split('.').pop() || 'FILE').toUpperCase(),
      category: item.category || 'Expense',
      date: item.date || '--',
      user: item.user || client?.primaryContact || 'Client User',
      status: normalizeDocumentReviewStatus(item.status || DOCUMENT_REVIEW_STATUS.PENDING_REVIEW),
      businessName: client?.businessName || '--',
    }))

  return {
    expenses: normalizedExpenses.map((row) => ({ ...row, category: 'Expense' })),
    sales: normalizedSales.map((row) => ({ ...row, category: 'Sales' })),
    bankStatements: normalizedBankStatements.map((row) => ({ ...row, category: 'Bank Statement' })),
    uploadHistory: normalizedUploadHistory.map((row) => ({ ...row })),
    resolvedDocuments: Array.isArray(source.resolvedDocuments) ? source.resolvedDocuments.map((row) => ({ ...row })) : [],
  }
}

const readClientActivityLogs = (client) => {
  const email = (client?.email || '').trim().toLowerCase()
  const workspaceLogs = Array.isArray(client?.clientWorkspace?.activityLog) ? client.clientWorkspace.activityLog : null
  const rawLogs = workspaceLogs || getScopedStorageArray(CLIENT_ACTIVITY_STORAGE_KEY, email)
  const normalizedLogs = rawLogs.map((entry, index) => ({
    id: entry?.id || `CLLOG-${index + 1}`,
    action: entry?.action || 'Client activity',
    details: entry?.details || '--',
    actorName: entry?.actorName || client?.primaryContact || 'Client User',
    actorRole: entry?.actorRole || 'client',
    timestamp: formatTimestamp(entry?.timestamp),
    _sortMs: Date.parse(entry?.timestamp || '') || 0,
  })).sort((left, right) => right._sortMs - left._sortMs)
  return normalizedLogs
}

const toTimestamp = (value) => {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeDocumentType = (row = {}) => (
  (row.extension || row.type || row.filename?.split('.').pop() || 'FILE').toUpperCase()
)

const MIME_TYPE_BY_EXTENSION = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  md: 'text/markdown',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const getDocumentMimeType = (document = {}) => {
  const explicitMimeType = String(document?.mimeType || document?.type || '').trim()
  if (explicitMimeType) return explicitMimeType
  const extension = String(document?.extension || document?.filename?.split('.').pop() || '')
    .trim()
    .toLowerCase()
  return MIME_TYPE_BY_EXTENSION[extension] || 'application/octet-stream'
}

const buildDocumentAttachmentPayload = (document = {}) => {
  const name = String(document?.filename || 'Document').trim() || 'Document'
  const type = getDocumentMimeType(document)
  const previewUrl = String(document?.previewUrl || '').trim()
  const resolvedPreviewDataUrl = previewUrl.startsWith('data:') ? previewUrl : ''
  const ownerEmail = String(document?.source?.clientEmail || '').trim().toLowerCase()
  const fileId = String(document?.fileId || document?.source?.fileId || '').trim()
  const fallbackCacheKey = buildFileCacheKey({
    ownerEmail,
    fileId,
  })
  return {
    name,
    type,
    size: Number(document?.size || 0),
    cacheKey: String(document?.fileCacheKey || document?.source?.fileCacheKey || fallbackCacheKey || '').trim(),
    previewDataUrl: resolvedPreviewDataUrl,
    directPreviewUrl: previewUrl,
  }
}

const flattenDocumentRows = (rows = []) => {
  const safeRows = Array.isArray(rows) ? rows : []
  return safeRows.flatMap((row, rowIndex) => {
    if (!row?.isFolder) {
      return [{ ...row, __rowIndex: rowIndex }]
    }
    const files = Array.isArray(row.files) ? row.files : []
    return files.map((file, fileIndex) => ({
      ...file,
      folderId: file.folderId || row.id,
      folderName: file.folderName || row.folderName || '',
      __rowIndex: `${rowIndex}-${fileIndex}`,
    }))
  })
}

const buildReviewFileSnapshot = (row = {}, nextStatus = DOCUMENT_REVIEW_STATUS.PENDING_REVIEW) => ({
  filename: row.filename || 'Document',
  extension: normalizeDocumentType(row),
  status: normalizeDocumentReviewStatus(nextStatus),
  class: row.class || row.expenseClass || row.salesClass || '',
  folderId: row.folderId || '',
  folderName: row.folderName || '',
  previewUrl: row.previewUrl || null,
})

const normalizeReviewDocumentRow = (client, bucketKey, row, index) => ({
  id: `${client.email || 'client'}:${bucketKey}:${row.id || row.fileId || index}`,
  filename: row.filename || 'Document',
  fileId: row.fileId || '',
  fileCacheKey: row.fileCacheKey || '',
  previewUrl: row.previewUrl || '',
  mimeType: row.mimeType || '',
  size: Number(row.size || 0),
  rawFile: row.rawFile || null,
  category: row.category || (bucketKey === 'bankStatements' ? 'Bank Statement' : bucketKey === 'sales' ? 'Sales' : 'Expense'),
  user: row.user || client.primaryContact || 'Client User',
  businessName: client.businessName || '--',
  date: row.date || '--',
  status: normalizeDocumentReviewStatus(row.status || DOCUMENT_REVIEW_STATUS.PENDING_REVIEW),
  priority: row.priority || row.processingPriority || 'Normal',
  confidentiality: row.confidentiality || row.confidentialityLevel || 'Internal',
  notes: row.notes || row.internalNotes || '',
  isLocked: Boolean(row.isLocked) || normalizeDocumentReviewStatus(row.status) === DOCUMENT_REVIEW_STATUS.APPROVED,
  approvedBy: row.approvedBy || '',
  approvedAtIso: row.approvedAtIso || null,
  rejectedBy: row.rejectedBy || '',
  rejectedAtIso: row.rejectedAtIso || null,
  rejectionReason: row.rejectionReason || '',
  extension: normalizeDocumentType(row),
  source: {
    clientEmail: client.email,
    bucketKey,
    rowId: row.id,
    fileId: row.fileId || '',
    folderId: row.folderId || '',
    filename: row.filename || '',
    date: row.date || '',
    category: row.category || '',
    fileCacheKey: row.fileCacheKey || '',
  },
})

const readAllDocumentsForReview = (adminAccount = null) => {
  const allClients = readClientRows()
  const clients = filterClientsForAdminScope(allClients, adminAccount || {})
  const documents = []
  clients.forEach((client) => {
    const bundle = readClientDocumentBundle(client)
    const bucketRows = [
      ['expenses', bundle.expenses || []],
      ['sales', bundle.sales || []],
      ['bankStatements', bundle.bankStatements || []],
    ]
    bucketRows.forEach(([bucketKey, rows]) => {
      flattenDocumentRows(rows).forEach((row, index) => {
        documents.push(normalizeReviewDocumentRow(client, bucketKey, row, index))
      })
    })
  })
  if (documents.length > 0) return documents
  return []
}

const matchDocumentRow = (row, source = {}) => (
  (source.rowId !== undefined && source.rowId !== null && String(row.id) === String(source.rowId))
  || (source.fileId && row.fileId && String(row.fileId) === String(source.fileId))
  || (
    source.filename
    && String(row.filename || '').toLowerCase() === String(source.filename).toLowerCase()
    && (
      !source.date
      || String(row.date || '') === String(source.date)
    )
  )
)

const updateClientDocumentReviewStatus = (document, nextStatus, notes = '', options = {}) => {
  if (!document?.source?.clientEmail || !document?.source?.bucketKey) return null
  const clientEmail = document.source.clientEmail.trim().toLowerCase()
  if (!clientEmail) return null

  const normalizedNextStatus = normalizeDocumentReviewStatus(nextStatus, DOCUMENT_REVIEW_STATUS.PENDING_REVIEW)
  const performedBy = toTrimmedValue(options?.performedBy) || 'Admin User'
  const unlockReason = toTrimmedValue(options?.unlockReason)
  const timestampIso = new Date().toISOString()

  const client = readClientRows().find((item) => item.email === clientEmail)
  if (
    requiresClientFullVerificationForReviewDecision(normalizedNextStatus)
    && !isClientFullyVerifiedForDocumentReview(clientEmail)
  ) {
    return null
  }
  const bundle = readClientDocumentBundle(client || { email: clientEmail })
  const targetBucket = document.source.bucketKey
  const targetRows = Array.isArray(bundle[targetBucket]) ? bundle[targetBucket] : []

  let updatedTarget = false
  const applyStatusToFile = (row = {}) => {
    if (!matchDocumentRow(row, document.source)) return row
    const previousStatus = normalizeDocumentReviewStatus(row.status || DOCUMENT_REVIEW_STATUS.PENDING_REVIEW)
    const isUnlockingApproved = (
      previousStatus === DOCUMENT_REVIEW_STATUS.APPROVED
      && normalizedNextStatus === DOCUMENT_REVIEW_STATUS.PENDING_REVIEW
    )
    if (isUnlockingApproved && !unlockReason) return row

    updatedTarget = true
    let nextNotes = notes || row.notes || ''
    let versionAction = `Status changed to ${normalizedNextStatus}`
    let activityType = 'status-change'
    let activityDescription = `${row.filename || document.filename || 'Document'} status changed to ${normalizedNextStatus}.`
    const nextPatch = {
      status: normalizedNextStatus,
      notes: nextNotes,
      updatedAtIso: timestampIso,
    }

    if (normalizedNextStatus === DOCUMENT_REVIEW_STATUS.APPROVED) {
      versionAction = 'Approved'
      activityDescription = `File approved by ${performedBy}.`
      nextPatch.isLocked = true
      nextPatch.lockedAtIso = timestampIso
      nextPatch.approvedBy = performedBy
      nextPatch.approvedAtIso = timestampIso
      nextPatch.unlockedBy = ''
      nextPatch.unlockedAtIso = null
      nextPatch.unlockReason = ''
    } else if (normalizedNextStatus === DOCUMENT_REVIEW_STATUS.REJECTED) {
      versionAction = 'Rejected'
      activityDescription = `File rejected by ${performedBy}${nextNotes ? ` - Reason: ${nextNotes}.` : '.'}`
      nextPatch.isLocked = false
      nextPatch.lockedAtIso = null
      nextPatch.rejectedBy = performedBy
      nextPatch.rejectedAtIso = timestampIso
      nextPatch.rejectionReason = nextNotes || row.rejectionReason || ''
    } else if (normalizedNextStatus === DOCUMENT_REVIEW_STATUS.INFO_REQUESTED) {
      versionAction = 'Info Requested'
      activityDescription = `Information requested by ${performedBy}${nextNotes ? ` - ${nextNotes}.` : '.'}`
      nextPatch.isLocked = false
      nextPatch.lockedAtIso = null
      nextPatch.requiredAction = nextNotes || row.requiredAction || ''
      nextPatch.infoRequestDetails = nextNotes || row.infoRequestDetails || ''
      nextPatch.adminComment = nextNotes || row.adminComment || ''
      nextPatch.adminNotes = nextNotes || row.adminNotes || ''
    } else if (normalizedNextStatus === DOCUMENT_REVIEW_STATUS.PENDING_REVIEW) {
      nextPatch.isLocked = false
      nextPatch.lockedAtIso = null
      if (isUnlockingApproved) {
        versionAction = 'Unlocked'
        activityType = 'unlock'
        activityDescription = `File unlocked by ${performedBy} - Reason: ${unlockReason}.`
        nextPatch.unlockedBy = performedBy
        nextPatch.unlockedAtIso = timestampIso
        nextPatch.unlockReason = unlockReason
      }
    }

    const nextRow = {
      ...row,
      ...nextPatch,
    }
    const previousVersions = Array.isArray(nextRow.versions) ? nextRow.versions : []
    const previousActivityLog = Array.isArray(nextRow.activityLog) ? nextRow.activityLog : []
    const versionNumber = previousVersions.length + 1
    const versionEntry = {
      versionNumber,
      action: versionAction,
      performedBy,
      timestamp: timestampIso,
      notes: nextNotes || '',
      fileSnapshot: buildReviewFileSnapshot(nextRow, normalizedNextStatus),
    }
    const activityEntry = {
      id: `FACT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      actionType: activityType,
      description: activityDescription,
      performedBy,
      timestamp: timestampIso,
    }
    return {
      ...nextRow,
      versions: [...previousVersions, versionEntry],
      activityLog: [...previousActivityLog, activityEntry],
      uploadInfo: {
        ...(nextRow.uploadInfo || {}),
        lastModifiedAtIso: timestampIso,
        totalVersions: versionNumber,
      },
    }
  }

  const nextTargetRows = targetRows.map((row) => {
    if (!row?.isFolder) return applyStatusToFile(row)
    const sourceFiles = Array.isArray(row.files) ? row.files : []
    return {
      ...row,
      files: sourceFiles.map((file) => applyStatusToFile(file)),
    }
  })

  if (!updatedTarget) return null

  const nextUploadHistory = (Array.isArray(bundle.uploadHistory) ? bundle.uploadHistory : []).map((row) => {
    const matchesFileId = (
      document.source.fileId
      && row.fileId
      && String(row.fileId) === String(document.source.fileId)
    )
    const matchesFileName = String(row.filename || '').toLowerCase() === String(document.source.filename || '').toLowerCase()
    if (!matchesFileId && !matchesFileName) return row
    return {
      ...row,
      status: normalizedNextStatus,
    }
  })

  const nextBundle = {
    ...bundle,
    [targetBucket]: nextTargetRows,
    uploadHistory: nextUploadHistory,
  }
  writeClientDocumentBundle(clientEmail, nextBundle)

  const activityAction = normalizedNextStatus === DOCUMENT_REVIEW_STATUS.APPROVED
    ? 'File approved by Admin.'
    : normalizedNextStatus === DOCUMENT_REVIEW_STATUS.REJECTED
      ? `File rejected by Admin${notes ? ` - Reason: ${notes}.` : '.'}`
      : normalizedNextStatus === DOCUMENT_REVIEW_STATUS.INFO_REQUESTED
        ? `Info requested by Admin${notes ? ` - ${notes}.` : '.'}`
        : normalizedNextStatus === DOCUMENT_REVIEW_STATUS.PENDING_REVIEW && unlockReason
          ? `File unlocked by Super Admin - Reason: ${unlockReason}.`
          : `Document review updated to ${normalizedNextStatus}.`

  const nextActivityLog = appendScopedClientActivityLog(clientEmail, {
    actorName: performedBy,
    actorRole: 'admin',
    action: activityAction,
    details: `${document.filename || 'Document'} status changed to ${normalizedNextStatus}.`,
  })

  const linkPage = targetBucket === 'sales'
    ? 'sales'
    : targetBucket === 'bankStatements'
      ? 'bank-statements'
      : 'expenses'
  const notificationType = normalizedNextStatus === DOCUMENT_REVIEW_STATUS.APPROVED
    ? 'approved'
    : normalizedNextStatus === DOCUMENT_REVIEW_STATUS.REJECTED
      ? 'rejected'
      : normalizedNextStatus === DOCUMENT_REVIEW_STATUS.INFO_REQUESTED
        ? 'info'
        : 'status'
  const notificationMessage = normalizedNextStatus === DOCUMENT_REVIEW_STATUS.APPROVED
    ? `${document.filename || 'Document'} was approved.`
    : normalizedNextStatus === DOCUMENT_REVIEW_STATUS.REJECTED
      ? `${document.filename || 'Document'} was rejected${notes ? `: ${notes}` : '.'}`
      : normalizedNextStatus === DOCUMENT_REVIEW_STATUS.INFO_REQUESTED
        ? `${document.filename || 'Document'} needs more information${notes ? `: ${notes}` : '.'}`
        : `${document.filename || 'Document'} status changed to ${normalizedNextStatus}.`
  appendClientBriefNotificationsToStorage(clientEmail, [{
    id: `DOC-STATUS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: notificationType,
    title: 'Document Update',
    message: notificationMessage,
    priority: normalizedNextStatus === DOCUMENT_REVIEW_STATUS.REJECTED
      ? 'critical'
      : normalizedNextStatus === DOCUMENT_REVIEW_STATUS.INFO_REQUESTED
        ? 'important'
        : 'info',
    sentAtIso: timestampIso,
    linkPage,
    fileId: document.source?.fileId || '',
    documentId: document.source?.rowId || '',
    folderId: document.source?.folderId || '',
  }])

  return {
    bundle: nextBundle,
    activityLog: nextActivityLog,
  }
}

const readClientRows = () => {
  if (isBackendAdminClientManagementEnabled()) {
    if (BACKEND_CLIENT_ROWS_CACHE.initialized) {
      return Array.isArray(BACKEND_CLIENT_ROWS_CACHE.clients)
        ? BACKEND_CLIENT_ROWS_CACHE.clients
        : []
    }
    return []
  }

  const rawAccounts = safeParseJson(localStorage.getItem(ACCOUNTS_STORAGE_KEY), [])
  if (!Array.isArray(rawAccounts)) return []
  const createdAtFallbackMap = readAccountCreatedAtFallbackMap()
  let didUpdateFallbackMap = false
  let didUpdateAccounts = false

  const normalizedAccounts = rawAccounts.map((account) => {
    const normalizedEmail = account?.email?.trim()?.toLowerCase() || ''
    const resolvedCreatedAtIso = resolveAccountCreatedAtIso(account, normalizedEmail, createdAtFallbackMap)
    if (normalizedEmail && resolvedCreatedAtIso && createdAtFallbackMap[normalizedEmail] !== resolvedCreatedAtIso) {
      createdAtFallbackMap[normalizedEmail] = resolvedCreatedAtIso
      didUpdateFallbackMap = true
    }
    const accountCreatedAt = account?.createdAt || resolvedCreatedAtIso
    if (accountCreatedAt && account?.createdAt !== accountCreatedAt) {
      didUpdateAccounts = true
      return {
        ...account,
        createdAt: accountCreatedAt,
      }
    }
    return account
  })
  if (didUpdateFallbackMap) writeAccountCreatedAtFallbackMap(createdAtFallbackMap)
  if (didUpdateAccounts) {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(normalizedAccounts))
  }

  const clientAccounts = normalizedAccounts.filter((account) => (
    normalizeRoleWithLegacyFallback(account?.role, account?.email || '') === 'client'
  ))
  const assignmentByClientEmail = new Map()
  readClientAssignmentsFromStorage().forEach((entry) => {
    const normalizedClientEmail = (entry?.clientEmail || '').trim().toLowerCase()
    if (!normalizedClientEmail) return
    const existing = assignmentByClientEmail.get(normalizedClientEmail) || []
    assignmentByClientEmail.set(normalizedClientEmail, [...existing, entry])
  })
  const areaAdminDirectoryByEmail = new Map(
    normalizedAccounts
      .filter((account) => (
        normalizeRoleWithLegacyFallback(account?.role, account?.email || '') === 'admin'
        && normalizeAdminLevel(account?.adminLevel) === ADMIN_LEVELS.AREA_ACCOUNTANT
      ))
      .map((account) => {
        const normalizedEmail = (account?.email || '').trim().toLowerCase()
        return [
          normalizedEmail,
          {
            email: normalizedEmail,
            fullName: account?.fullName || account?.email || 'Area Accountant',
            status: account?.status === 'suspended' ? 'suspended' : 'active',
          },
        ]
      })
      .filter(([email]) => Boolean(email)),
  )

  return clientAccounts.map((account, index) => {
    const normalizedEmail = account?.email?.trim()?.toLowerCase() || ''
    const settings = getScopedStorageObject('settingsFormData', normalizedEmail)
    const onboarding = getScopedStorageObject('kiaminaOnboardingState', normalizedEmail)
    const statusControl = getScopedStorageObject(CLIENT_STATUS_CONTROL_STORAGE_KEY, normalizedEmail)
    const verificationDocs = getScopedStorageObject('verificationDocs', normalizedEmail)
    const notificationSettings = getScopedStorageObject('notificationSettings', normalizedEmail)
    const profilePhoto = getScopedStorageString('profilePhoto', normalizedEmail)
    const companyLogo = getScopedStorageString('companyLogo', normalizedEmail)
    const createdAt = account?.createdAt || account?.dateCreated || ''
    const assignments = assignmentByClientEmail.get(normalizedEmail) || []
    const assignedAreaAccountantEmails = [...new Set(
      assignments
        .map((entry) => (entry?.assignedAccountantEmail || '').trim().toLowerCase())
        .filter(Boolean),
    )]
    const assignedAreaAccountantNames = assignedAreaAccountantEmails.map((email) => (
      areaAdminDirectoryByEmail.get(email)?.fullName || email
    ))
    const latestAssignment = assignments
      .filter((entry) => Number.isFinite(Date.parse(entry?.assignedAt || '')))
      .sort((left, right) => Date.parse(right?.assignedAt || '') - Date.parse(left?.assignedAt || ''))[0] || null
    const onboardingCompleted = Boolean(onboarding?.completed)
    const onboardingSkipped = Boolean(onboarding?.skipped)
    const verificationPending = onboarding?.verificationPending !== undefined
      ? Boolean(onboarding.verificationPending)
      : true
    const accountSuspended = account.status === 'suspended'
    const statusVerification = normalizeComplianceStatus(statusControl?.verificationStatus, '')
    let verificationStatus = statusVerification || (verificationPending ? COMPLIANCE_STATUS.PENDING : COMPLIANCE_STATUS.FULL)
    if (accountSuspended && verificationStatus === COMPLIANCE_STATUS.FULL) {
      verificationStatus = COMPLIANCE_STATUS.ACTION
    }

    const cri = settings.cri || `CRI-${String(index + 1).padStart(4, '0')}`
    const businessName = settings.businessName?.trim() || account.businessName || account.companyName || 'Unassigned Business'

    return {
      id: account.id || `CL-${String(index + 1).padStart(4, '0')}`,
      businessName,
      cri,
      primaryContact: settings.fullName?.trim() || account.fullName || 'Not set',
      email: normalizedEmail || '--',
      country: settings.country || '--',
      verificationStatus,
      onboardingStatus: onboardingCompleted ? 'Completed' : (onboardingSkipped ? 'Skipped' : 'In Progress'),
      subscriptionStatus: account.subscriptionStatus || 'Active',
      dateCreated: createdAt ? formatTimestamp(createdAt) : '--',
      clientStatus: accountSuspended ? 'Suspended' : 'Active',
      suspensionMessage: statusControl?.suspensionMessage || '',
      assignedAreaAccountantEmail: assignedAreaAccountantEmails[0] || '',
      assignedAreaAccountantEmails,
      assignedAreaAccountantName: assignedAreaAccountantNames.join(', '),
      assignedAreaAccountantNames,
      assignedAreaAssignedAt: latestAssignment?.assignedAt || '',
      assignedAreaAssignedBy: latestAssignment?.assignedBy || '',
      rawAccount: account,
      settings,
      onboarding,
      verificationDocs,
      notificationSettings,
      profilePhoto,
      companyLogo,
      statusControl,
    }
  })
}

const getActivityLogsFromStorage = (viewerAccount = null) => {
  const normalizedViewer = normalizeAdminAccount({
    ...DEFAULT_ADMIN_ACCOUNT,
    role: 'admin',
    ...(viewerAccount || {}),
  })
  const canViewOwnerActivity = isOwnerAdminLevel(normalizedViewer.adminLevel)
  const storedLogs = safeParseJson(localStorage.getItem(ADMIN_ACTIVITY_STORAGE_KEY), [])
  if (!Array.isArray(storedLogs)) return []
  return storedLogs
    .filter((log) => {
      if (canViewOwnerActivity) return true
      return !isOwnerAdminLevel(log?.adminLevel || ADMIN_LEVELS.SUPER)
    })
    .map((log, index) => ({
      id: log.id || `LOG-STORED-${index}`,
      adminName: log.adminName || 'Admin User',
      adminEmail: log.adminEmail || '',
      adminLevel: normalizeAdminLevel(log.adminLevel || ADMIN_LEVELS.SUPER),
      adminLevelLabel: getAdminLevelLabel(log.adminLevel || ADMIN_LEVELS.SUPER),
      impersonatedBy: log.impersonatedBy || '',
      action: log.action || 'Admin action',
      affectedUser: log.affectedUser || '--',
      details: log.details || '--',
      timestamp: formatTimestamp(log.timestamp),
      __sortTs: Date.parse(log.timestamp || '') || 0,
    }))
    .sort((left, right) => right.__sortTs - left.__sortTs)
}

const hasAnyPermission = (account, permissionIds = []) => {
  if (!Array.isArray(permissionIds) || permissionIds.length === 0) return true
  return permissionIds.some((permissionId) => hasAdminPermission(account, permissionId))
}

const hasLeadCategoryMatch = (lead = {}, category = '') => {
  const normalizedCategory = String(category || '').trim()
  if (!normalizedCategory) return false
  const categories = [
    ...(Array.isArray(lead?.leadCategories) ? lead.leadCategories : []),
    lead?.leadCategory,
  ]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
  return categories.includes(normalizedCategory)
}

const buildAdminDashboardSnapshot = (adminAccount = null) => {
  const normalizedAdmin = normalizeAdminAccount({
    ...DEFAULT_ADMIN_ACCOUNT,
    role: 'admin',
    ...(adminAccount || {}),
  })
  const nowMs = Date.now()
  const todayKey = toLocalDateKey(new Date(nowMs).toISOString())
  const clients = filterClientsForAdminScope(readClientRows(), normalizedAdmin)
  const clientEmailSet = new Set(
    clients
      .map((client) => String(client?.email || '').trim().toLowerCase())
      .filter(Boolean),
  )
  // Dashboard pipeline metrics are global for visibility across all admin levels.
  const documents = readAllDocumentsForReview()
  const supportSnapshot = getSupportCenterSnapshot()
  const tickets = Array.isArray(supportSnapshot?.tickets) ? supportSnapshot.tickets : []
  const leads = Array.isArray(supportSnapshot?.leads) ? supportSnapshot.leads : []
  const workSessions = getAdminWorkSessionsFromStorage()
  const activityLogs = getActivityLogsFromStorage(normalizedAdmin)
  const inviteEntries = safeParseJson(localStorage.getItem(ADMIN_INVITES_STORAGE_KEY), [])
  const pendingInvites = (Array.isArray(inviteEntries) ? inviteEntries : [])
    .map((invite) => normalizeAdminInvite(invite))
    .filter((invite) => isAdminInvitePending(invite))
  const scheduledNotifications = readAdminScheduledNotificationsFromStorage()
  const notificationDrafts = readAdminNotificationDraftsFromStorage()
  const trashEntries = readAdminTrashEntriesFromStorage()

  const openTickets = tickets.filter((ticket) => ticket.status === SUPPORT_TICKET_STATUS.OPEN).length
  const assignedTickets = tickets.filter((ticket) => ticket.status === SUPPORT_TICKET_STATUS.ASSIGNED).length
  const resolvedTickets = tickets.filter((ticket) => ticket.status === SUPPORT_TICKET_STATUS.RESOLVED).length
  const unresolvedTickets = tickets.length - resolvedTickets
  const unreadSupportCount = tickets.reduce((total, ticket) => total + Number(ticket?.unreadByAdmin || 0), 0)
  const unattendedTickets = tickets.filter((ticket) => (
    ticket.status === SUPPORT_TICKET_STATUS.OPEN
    && Number(ticket?.unreadByAdmin || 0) > 0
  )).length

  const inquiryLeadCount = leads.filter((lead) => hasLeadCategoryMatch(lead, LEAD_CATEGORY.INQUIRY_FOLLOW_UP)).length
  const newsletterLeadCount = leads.filter((lead) => hasLeadCategoryMatch(lead, LEAD_CATEGORY.NEWSLETTER_SUBSCRIBER)).length

  const normalizedDocumentStatus = (status) => normalizeDocumentReviewStatus(status, DOCUMENT_REVIEW_STATUS.PENDING_REVIEW)
  const pendingDocuments = documents.filter((document) => normalizedDocumentStatus(document.status) === DOCUMENT_REVIEW_STATUS.PENDING_REVIEW).length
  const infoRequestedDocuments = documents.filter((document) => normalizedDocumentStatus(document.status) === DOCUMENT_REVIEW_STATUS.INFO_REQUESTED).length
  const rejectedDocuments = documents.filter((document) => normalizedDocumentStatus(document.status) === DOCUMENT_REVIEW_STATUS.REJECTED).length
  const approvedDocuments = documents.filter((document) => normalizedDocumentStatus(document.status) === DOCUMENT_REVIEW_STATUS.APPROVED).length
  const approvedTodayDocuments = documents.filter((document) => (
    normalizedDocumentStatus(document.status) === DOCUMENT_REVIEW_STATUS.APPROVED
    && toLocalDateKey(document?.approvedAtIso || document?.date || '') === todayKey
  )).length

  const scopedAssignments = readClientAssignmentsFromStorage().filter((assignment) => (
    clientEmailSet.has(String(assignment?.clientEmail || '').trim().toLowerCase())
  ))
  const assignmentByClientEmail = new Map()
  scopedAssignments.forEach((assignment) => {
    const normalizedClientEmail = String(assignment?.clientEmail || '').trim().toLowerCase()
    const normalizedAssignedEmail = String(assignment?.assignedAccountantEmail || '').trim().toLowerCase()
    if (!normalizedClientEmail || !normalizedAssignedEmail) return
    if (!assignmentByClientEmail.has(normalizedClientEmail)) {
      assignmentByClientEmail.set(normalizedClientEmail, new Set())
    }
    assignmentByClientEmail.get(normalizedClientEmail).add(normalizedAssignedEmail)
  })
  const multiAssignedClientCount = [...assignmentByClientEmail.values()].filter((assignedSet) => assignedSet.size > 1).length
  const unassignedClientCount = clients.filter((client) => (
    !assignmentByClientEmail.has(String(client?.email || '').trim().toLowerCase())
  )).length

  const openSessions = workSessions.filter((session) => !session?.clockOutAt)
  const activeSessions = openSessions.filter((session) => !session?.pauseStartedAt)
  const pausedSessions = openSessions.filter((session) => Boolean(session?.pauseStartedAt))
  const activeWorkerCount = new Set(activeSessions.map((session) => session.adminEmail || session.adminName).filter(Boolean)).size
  const pausedWorkerCount = new Set(pausedSessions.map((session) => session.adminEmail || session.adminName).filter(Boolean)).size
  const openWorkerCount = new Set(openSessions.map((session) => session.adminEmail || session.adminName).filter(Boolean)).size
  const todayWorkSessions = workSessions.filter((session) => toLocalDateKey(session?.clockInAt || '') === todayKey)
  const todayTrackedDurationMs = todayWorkSessions.reduce(
    (total, session) => total + getWorkSessionDurationMs(session, nowMs),
    0,
  )
  const normalizedAdminEmail = String(normalizedAdmin?.email || '').trim().toLowerCase()
  const personalTodayTrackedDurationMs = todayWorkSessions
    .filter((session) => String(session?.adminEmail || '').trim().toLowerCase() === normalizedAdminEmail)
    .reduce((total, session) => total + getWorkSessionDurationMs(session, nowMs), 0)
  const personalActiveSession = getActiveAdminWorkSessionForEmail(workSessions, normalizedAdminEmail)
  const personalWorkStatus = personalActiveSession
    ? (personalActiveSession.pauseStartedAt ? 'Paused' : 'Active')
    : 'Clocked Out'

  const operationsLogCount = activityLogs.filter((log) => isOperationsAdminLevel(log?.adminLevel)).length
  const technicalLogCount = activityLogs.filter((log) => isTechnicalAdminLevel(log?.adminLevel)).length
  const superLogCount = activityLogs.filter((log) => isSuperAdminLevel(log?.adminLevel)).length
  const todayStartMs = new Date(nowMs)
  todayStartMs.setHours(0, 0, 0, 0)
  const todayActivityCount = activityLogs.filter((log) => Number(log?.__sortTs || 0) >= todayStartMs.getTime()).length

  const pendingInviteCount = pendingInvites.length
  const expiringSoonInviteCount = pendingInvites.filter((invite) => {
    const expiryMs = Date.parse(invite?.expiresAt || '')
    return Number.isFinite(expiryMs) && expiryMs >= nowMs && (expiryMs - nowMs) <= DASHBOARD_INVITE_EXPIRING_SOON_MS
  }).length
  const scheduledPendingCount = scheduledNotifications.filter((entry) => entry?.status === 'Scheduled').length
  const scheduledDueSoonCount = scheduledNotifications.filter((entry) => {
    if (entry?.status !== 'Scheduled') return false
    const scheduledMs = Date.parse(entry?.scheduledForIso || '')
    return Number.isFinite(scheduledMs) && scheduledMs >= nowMs && (scheduledMs - nowMs) <= DASHBOARD_SCHEDULED_SOON_MS
  }).length

  return {
    clients,
    totalClients: clients.length,
    pendingComplianceClients: clients.filter((client) => normalizeComplianceStatus(client?.verificationStatus, '') === COMPLIANCE_STATUS.PENDING).length,
    actionRequiredClients: clients.filter((client) => normalizeComplianceStatus(client?.verificationStatus, '') === COMPLIANCE_STATUS.ACTION).length,
    unassignedClientCount,
    multiAssignedClientCount,
    totalAssignments: scopedAssignments.length,
    documents,
    totalDocuments: documents.length,
    pendingDocuments,
    infoRequestedDocuments,
    rejectedDocuments,
    approvedDocuments,
    approvedTodayDocuments,
    openTickets,
    assignedTickets,
    resolvedTickets,
    unresolvedTickets,
    unreadSupportCount,
    unattendedTickets,
    totalLeads: leads.length,
    inquiryLeadCount,
    newsletterLeadCount,
    activeWorkerCount,
    pausedWorkerCount,
    openWorkerCount,
    todayTrackedDurationMs,
    personalTodayTrackedDurationMs,
    personalWorkStatus,
    openWorkSessionCount: openSessions.length,
    todayWorkSessionCount: todayWorkSessions.length,
    operationsLogCount,
    technicalLogCount,
    superLogCount,
    activityLogCount: activityLogs.length,
    todayActivityCount,
    recentActivityLogs: activityLogs.slice(0, 5),
    pendingInviteCount,
    expiringSoonInviteCount,
    scheduledPendingCount,
    scheduledDueSoonCount,
    draftNotificationCount: notificationDrafts.length,
    trashCount: trashEntries.length,
  }
}

const canAccessAdminPage = (pageId, account) => {
  const levelRestrictions = ADMIN_PAGE_LEVEL_RULES[pageId]
  if (Array.isArray(levelRestrictions) && levelRestrictions.length > 0) {
    const normalizedAdminLevel = normalizeAdminLevel(account?.adminLevel || ADMIN_LEVELS.SUPER)
    if (!levelRestrictions.includes(normalizedAdminLevel)) return false
  }
  const requiredPermissions = ADMIN_PAGE_PERMISSION_RULES[pageId]
  if (!requiredPermissions) return true
  return hasAnyPermission(account, requiredPermissions)
}

// Sidebar Component
function AdminSidebar({
  activePage,
  setActivePage,
  onLogout,
  currentAdminAccount,
  isMobileOpen = false,
  onCloseMobile,
}) {
  const [leadCount, setLeadCount] = useState(() => {
    const snapshot = getSupportCenterSnapshot()
    return Array.isArray(snapshot?.leads) ? snapshot.leads.length : 0
  })
  const [supportUnreadCount, setSupportUnreadCount] = useState(() => {
    const snapshot = getSupportCenterSnapshot()
    const tickets = Array.isArray(snapshot?.tickets) ? snapshot.tickets : []
    return tickets.reduce((total, ticket) => total + Number(ticket?.unreadByAdmin || 0), 0)
  })
  const [trashCount, setTrashCount] = useState(() => readAdminTrashEntriesFromStorage().length)

  const navItems = [
    { id: 'admin-dashboard', label: 'Admin Dashboard', icon: LayoutDashboard, badgeCount: 0, badgeTone: 'neutral', section: 'core' },
    { id: 'admin-documents', label: 'Document Review', icon: FileText, badgeCount: 0, badgeTone: 'neutral', section: 'operations' },
    { id: 'admin-clients', label: 'Client Management', icon: Users, badgeCount: 0, badgeTone: 'neutral', section: 'operations' },
    { id: 'admin-work-hours', label: 'Work Hours', icon: Clock, badgeCount: 0, badgeTone: 'neutral', section: 'operations' },
    { id: 'admin-leads', label: 'Leads', icon: UsersRound, badgeCount: leadCount, badgeTone: 'neutral', section: 'technical' },
    { id: 'admin-communications', label: 'Communications', icon: Mail, badgeCount: supportUnreadCount, badgeTone: 'alert', section: 'technical' },
    { id: 'admin-notifications', label: 'Send Notification', icon: Send, badgeCount: 0, badgeTone: 'neutral', section: 'technical' },
    { id: 'admin-insights', label: 'Insights Publishing', icon: Edit2, badgeCount: 0, badgeTone: 'neutral', section: 'technical' },
  ]

  const footerNavItems = [
    { id: 'admin-activity', label: 'Activity Log', icon: Activity, badgeCount: 0, badgeTone: 'neutral', section: 'operations' },
    { id: 'admin-trash', label: 'Trash', icon: Trash2, badgeCount: trashCount, badgeTone: 'neutral', section: 'technical' },
    { id: 'admin-settings', label: 'Admin Settings', icon: Settings, badgeCount: 0, badgeTone: 'neutral', section: 'core' },
  ]
  const sectionLabels = {
    core: 'Workspace',
    operations: 'Operations Section',
    technical: 'Technical Section',
    super: 'Super Admin Panel',
  }
  const sectionOrder = ['core', 'operations', 'technical', 'super']

  const displayAdmin = normalizeAdminAccount({
    ...DEFAULT_ADMIN_ACCOUNT,
    role: 'admin',
    ...currentAdminAccount,
  })
  const displayRoleLabel = String(displayAdmin.roleInCompany || '').trim() || getAdminLevelLabel(displayAdmin.adminLevel)
  const visibleNavItems = navItems.filter((item) => canAccessAdminPage(item.id, displayAdmin))
  const visibleFooterNavItems = footerNavItems.filter((item) => canAccessAdminPage(item.id, displayAdmin))
  const groupedMainNavItems = sectionOrder
    .map((sectionKey) => ({
      sectionKey,
      label: sectionLabels[sectionKey],
      items: visibleNavItems.filter((item) => item.section === sectionKey),
    }))
    .filter((entry) => entry.items.length > 0)
  const groupedFooterNavItems = sectionOrder
    .map((sectionKey) => ({
      sectionKey,
      label: sectionLabels[sectionKey],
      items: visibleFooterNavItems.filter((item) => item.section === sectionKey),
    }))
    .filter((entry) => entry.items.length > 0)
  const handleNavSelect = (pageId) => {
    setActivePage(pageId)
    onCloseMobile?.()
  }

  useEffect(() => {
    const syncSupportStats = (snapshot) => {
      const leads = Array.isArray(snapshot?.leads) ? snapshot.leads : []
      const tickets = Array.isArray(snapshot?.tickets) ? snapshot.tickets : []
      setLeadCount(leads.length)
      setSupportUnreadCount(tickets.reduce((total, ticket) => total + Number(ticket?.unreadByAdmin || 0), 0))
    }
    syncSupportStats(getSupportCenterSnapshot())
    const unsubscribe = subscribeSupportCenter((snapshot) => syncSupportStats(snapshot))

    const syncTrashStats = () => setTrashCount(readAdminTrashEntriesFromStorage().length)
    syncTrashStats()
    const handleStorage = (event) => {
      if (!event.key || event.key === ADMIN_TRASH_STORAGE_KEY) {
        syncTrashStats()
      }
    }
    const runProcessor = () => {
      void runScheduledNotificationProcessor()
    }
    runProcessor()
    const processorIntervalId = window.setInterval(runProcessor, 15000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') runProcessor()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener(ADMIN_NOTIFICATIONS_SYNC_EVENT, runProcessor)
    window.addEventListener(ADMIN_NOTIFICATIONS_SYNC_EVENT, syncTrashStats)
    window.addEventListener('storage', handleStorage)
    return () => {
      unsubscribe()
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(ADMIN_NOTIFICATIONS_SYNC_EVENT, runProcessor)
      window.removeEventListener(ADMIN_NOTIFICATIONS_SYNC_EVENT, syncTrashStats)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(processorIntervalId)
    }
  }, [])

  const getBadgeClasses = (badgeTone = 'neutral') => (
    badgeTone === 'alert'
      ? 'bg-error text-white'
      : 'bg-background border border-border-light text-text-secondary'
  )
  const renderNavButton = (item) => (
    <button
      key={item.id}
      onClick={() => handleNavSelect(item.id)}
      className={"w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all " + (activePage === item.id ? 'bg-primary-tint text-primary border-l-[3px] border-primary' : 'text-text-secondary hover:bg-background hover:text-text-primary border-l-[3px] border-transparent')}
    >
      <item.icon className="w-5 h-5" />
      <span className="flex-1 text-left truncate">{item.label}</span>
      {(item.id === 'admin-leads' || item.id === 'admin-trash' || Number(item.badgeCount || 0) > 0) && (
        <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold ${getBadgeClasses(item.badgeTone)}`}>
          {Number(item.badgeCount) > 99 ? '99+' : Number(item.badgeCount)}
        </span>
      )}
    </button>
  )

  return (
    <>
      {isMobileOpen && (
        <button
          type="button"
          onClick={() => onCloseMobile?.()}
          aria-label="Close admin navigation"
          className="fixed inset-0 bg-black/35 z-40 lg:hidden"
        />
      )}
      <aside className={`w-64 bg-white border-r border-border fixed left-0 top-0 h-screen flex flex-col z-50 transform transition-transform duration-200 ease-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="p-4 border-b border-border-light">
          <KiaminaLogo className="h-11 w-auto" />
          <div className="text-[11px] text-text-muted uppercase tracking-wide mt-2">Admin Control</div>
        </div>

        <div className="p-4 border-b border-border-light">
          <div className="text-sm font-medium text-text-primary">{displayAdmin.fullName}</div>
          <div className="text-xs text-text-muted mt-1">Role: {displayRoleLabel}</div>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {groupedMainNavItems.map((group) => (
            <div key={`main-${group.sectionKey}`} className="mb-1">
              {group.sectionKey !== 'core' && (
                <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => renderNavButton(item))}
            </div>
          ))}
        </nav>

        <div className="px-4 py-2">
          <div className="border-t border-border-light"></div>
        </div>

        <div className="pb-3">
          {groupedFooterNavItems.map((group) => (
            <div key={`footer-${group.sectionKey}`} className="mb-1">
              <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                {group.label}
              </p>
              {group.items.map((item) => renderNavButton(item))}
            </div>
          ))}
        </div>

        <div className="py-3 border-t border-border-light">
          <button
            onClick={() => {
              onCloseMobile?.()
              onLogout()
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-text-secondary hover:bg-background hover:text-text-primary transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>
    </>
  )
}

// Admin Top Bar with notifications dropdown
function AdminTopBar({
  adminFirstName,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  currentAdminAccount,
  onOpenSidebar,
  searchTerm = '',
  onSearchTermChange,
  onSearchSubmit,
  searchSuggestions = [],
  searchState = 'idle',
  searchResults = [],
  onSearchResultSelect,
  onSearchResultsDismiss,
  onAdminActionLog,
}) {
  const [showNotifications, setShowNotifications] = useState(false)
  const notificationRef = useRef(null)
  const searchRef = useRef(null)
  const inactivityLastActivityAtRef = useRef(Date.now())
  const unreadCount = notifications.filter(n => !n.read).length
  const topBarSearchListId = 'admin-topbar-search-suggestions'
  const resolvedSearchTerm = String(searchTerm || '')
  const resolvedSuggestions = Array.isArray(searchSuggestions) ? searchSuggestions : []
  const resolvedSearchState = String(searchState || 'idle')
  const resolvedSearchResults = Array.isArray(searchResults) ? searchResults : []
  const shouldShowSearchPanel = resolvedSearchState !== 'idle'
  const displayAdmin = normalizeAdminAccount({
    ...DEFAULT_ADMIN_ACCOUNT,
    role: 'admin',
    ...currentAdminAccount,
  })
  const displayRoleLabel = String(displayAdmin.roleInCompany || '').trim() || getAdminLevelLabel(displayAdmin.adminLevel)
  const displayFirstName = String(displayAdmin.fullName || '').trim().split(/\s+/)[0]
    || String(adminFirstName || '').trim()
    || 'Administrator'
  const [workSessions, setWorkSessions] = useState(() => getAdminWorkSessionsFromStorage())
  const [workNowMs, setWorkNowMs] = useState(() => Date.now())
  const normalizedAdminEmail = String(displayAdmin?.email || '').trim().toLowerCase()
  const activeWorkSession = useMemo(
    () => getActiveAdminWorkSessionForEmail(workSessions, normalizedAdminEmail),
    [workSessions, normalizedAdminEmail],
  )
  const isActiveWorkSessionPaused = Boolean(
    activeWorkSession?.pauseStartedAt && !activeWorkSession?.clockOutAt,
  )
  const workClockLabel = isActiveWorkSessionPaused
    ? `Paused ${formatTimestamp(activeWorkSession?.pauseStartedAt)}`
    : activeWorkSession
      ? `Clocked In ${formatTimestamp(activeWorkSession.clockInAt)}`
    : 'Not Clocked In'
  const workClockDurationLabel = activeWorkSession
    ? formatWorkDuration(getWorkSessionDurationMs(activeWorkSession, workNowMs))
    : ''
  const workClockStateNote = isActiveWorkSessionPaused
    ? 'Inactive for 30+ mins. Click Resume to continue.'
    : 'If clocked in before 1:00 PM, break 1:00 PM - 2:00 PM is credited.'

  const syncWorkSessions = () => setWorkSessions(getAdminWorkSessionsFromStorage())

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false)
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        onSearchResultsDismiss?.()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onSearchResultsDismiss])

  useEffect(() => {
    syncWorkSessions()
    const handleStorage = (event) => {
      if (!event.key || event.key === ADMIN_WORK_SESSIONS_STORAGE_KEY) {
        syncWorkSessions()
      }
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener(ADMIN_WORK_SESSIONS_SYNC_EVENT, syncWorkSessions)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(ADMIN_WORK_SESSIONS_SYNC_EVENT, syncWorkSessions)
    }
  }, [])

  useEffect(() => {
    const markActiveNow = () => {
      inactivityLastActivityAtRef.current = Date.now()
    }
    markActiveNow()
    ADMIN_WORK_ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, markActiveNow)
    })
    window.addEventListener('focus', markActiveNow)
    document.addEventListener('visibilitychange', markActiveNow)
    return () => {
      ADMIN_WORK_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, markActiveNow)
      })
      window.removeEventListener('focus', markActiveNow)
      document.removeEventListener('visibilitychange', markActiveNow)
    }
  }, [])

  useEffect(() => {
    if (!activeWorkSession || isActiveWorkSessionPaused) return undefined
    const intervalId = window.setInterval(() => {
      const idleForMs = Date.now() - inactivityLastActivityAtRef.current
      if (idleForMs < ADMIN_WORK_INACTIVITY_PAUSE_MS) return
      const sessions = getAdminWorkSessionsFromStorage()
      const activeIndex = sessions.findIndex((session) => session.id === activeWorkSession.id)
      if (activeIndex === -1) return
      const targetSession = sessions[activeIndex]
      if (targetSession?.clockOutAt || targetSession?.pauseStartedAt) return
      const nowIso = new Date().toISOString()
      sessions[activeIndex] = {
        ...targetSession,
        pauseStartedAt: nowIso,
        pauseReason: 'inactivity',
      }
      writeAdminWorkSessionsToStorage(sessions)
      setWorkNowMs(Date.now())
      onAdminActionLog?.({
        action: 'Work session auto-paused',
        affectedUser: displayAdmin.fullName || 'Admin User',
        details: `Auto-paused after 30 minutes inactivity at ${formatTimestamp(nowIso)}`,
      })
    }, 15000)
    return () => window.clearInterval(intervalId)
  }, [activeWorkSession?.id, isActiveWorkSessionPaused, onAdminActionLog, displayAdmin.fullName])

  useEffect(() => {
    if (!activeWorkSession || isActiveWorkSessionPaused) return undefined
    const intervalId = window.setInterval(() => setWorkNowMs(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [activeWorkSession?.id, isActiveWorkSessionPaused])

  const handleWorkClockToggle = () => {
    if (!normalizedAdminEmail) return
    const nowIso = new Date().toISOString()
    const sessions = getAdminWorkSessionsFromStorage()
    const nextSessions = [...sessions]
    const activeIndex = nextSessions.findIndex((session) => (
      !session.clockOutAt && String(session.adminEmail || '').trim().toLowerCase() === normalizedAdminEmail
    ))

    if (activeIndex >= 0) {
      const activeSession = nextSessions[activeIndex]
      if (activeSession?.pauseStartedAt) {
        const pausedStartedAtMs = Date.parse(activeSession.pauseStartedAt)
        const resumedAtMs = Date.parse(nowIso)
        const nextPauseSegments = Array.isArray(activeSession.pauseSegments)
          ? [...activeSession.pauseSegments]
          : []
        if (Number.isFinite(pausedStartedAtMs) && Number.isFinite(resumedAtMs) && resumedAtMs > pausedStartedAtMs) {
          nextPauseSegments.push({
            startAt: activeSession.pauseStartedAt,
            endAt: nowIso,
            reason: activeSession.pauseReason || 'pause',
          })
        }
        nextSessions[activeIndex] = {
          ...activeSession,
          pauseSegments: normalizeWorkPauseSegments(nextPauseSegments),
          pauseStartedAt: '',
          pauseReason: '',
        }
        writeAdminWorkSessionsToStorage(nextSessions)
        inactivityLastActivityAtRef.current = Date.now()
        setWorkNowMs(Date.now())
        onAdminActionLog?.({
          action: 'Resumed work session',
          affectedUser: displayAdmin.fullName || 'Admin User',
          details: `Resumed work session at ${formatTimestamp(nowIso)}`,
        })
        return
      }
      nextSessions[activeIndex] = {
        ...activeSession,
        clockOutAt: nowIso,
      }
      writeAdminWorkSessionsToStorage(nextSessions)
      setWorkNowMs(Date.now())
      onAdminActionLog?.({
        action: 'Clocked out',
        affectedUser: displayAdmin.fullName || 'Admin User',
        details: `Ended work session at ${formatTimestamp(nowIso)}`,
      })
      return
    }

    nextSessions.unshift({
      id: `WORK-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      adminName: displayAdmin.fullName || 'Admin User',
      adminEmail: normalizedAdminEmail,
      adminLevel: normalizeAdminLevel(displayAdmin.adminLevel || ADMIN_LEVELS.SUPER),
      clockInAt: nowIso,
      clockOutAt: '',
      pauseSegments: [],
      pauseStartedAt: '',
      pauseReason: '',
    })
    writeAdminWorkSessionsToStorage(nextSessions)
    inactivityLastActivityAtRef.current = Date.now()
    setWorkNowMs(Date.now())
    onAdminActionLog?.({
      action: 'Clocked in',
      affectedUser: displayAdmin.fullName || 'Admin User',
      details: `Started work session at ${formatTimestamp(nowIso)}`,
    })
  }

  return (
    <header className="h-14 bg-white border-b border-border flex items-center justify-between px-3 sm:px-4 lg:px-6 sticky top-0 z-40 gap-2">
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <button
          type="button"
          onClick={() => onOpenSidebar?.()}
          className="w-9 h-9 border border-border rounded-md text-text-secondary hover:text-text-primary hover:border-primary lg:hidden inline-flex items-center justify-center flex-shrink-0"
          aria-label="Open admin navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3">
          <h1 className="hidden sm:block text-sm font-semibold text-text-primary uppercase tracking-wide truncate">Admin Console</h1>
          <div className="relative w-full sm:max-w-[18rem] lg:max-w-[22rem]" ref={searchRef}>
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={resolvedSearchTerm}
              onChange={(event) => onSearchTermChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onSearchSubmit?.(resolvedSearchTerm)
                  return
                }
                if (event.key === 'Escape') {
                  onSearchResultsDismiss?.()
                }
              }}
              placeholder="Search admin workspace..."
              list={resolvedSuggestions.length > 0 ? topBarSearchListId : undefined}
              className="w-full h-9 pl-9 pr-10 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            />
            {resolvedSearchState === 'loading' && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                <DotLottiePreloader size={18} />
              </div>
            )}
            {resolvedSuggestions.length > 0 && (
              <datalist id={topBarSearchListId}>
                {resolvedSuggestions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            )}
            {shouldShowSearchPanel && (
              <div className="absolute left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-card z-[55] max-h-72 overflow-y-auto">
                {resolvedSearchState === 'loading' ? (
                  <div className="px-3 py-3 text-sm text-text-secondary">
                    <DotLottiePreloader size={22} label="Searching..." className="w-full justify-start" />
                  </div>
                ) : resolvedSearchState === 'empty' ? (
                  <div className="px-3 py-3 text-sm text-text-muted">No item found</div>
                ) : (
                  resolvedSearchResults.map((result) => (
                    <button
                      key={result.id || `${result.pageId || 'page'}-${result.label || ''}`}
                      type="button"
                      onClick={() => onSearchResultSelect?.(result)}
                      className="w-full px-3 py-2.5 text-left hover:bg-background border-b last:border-b-0 border-border-light"
                    >
                      <p className="text-sm font-medium text-text-primary truncate">{result.label}</p>
                      {result.description && (
                        <p className="text-xs text-text-muted mt-0.5 truncate">{result.description}</p>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden xl:block text-right mr-1">
          <p className="text-[11px] font-medium text-text-primary">{workClockLabel}</p>
          {activeWorkSession && (
            <p className="text-[11px] text-success">Session: {workClockDurationLabel}</p>
          )}
          <p className={`text-[10px] mt-0.5 ${isActiveWorkSessionPaused ? 'text-warning' : 'text-text-muted'}`}>
            {workClockStateNote}
          </p>
        </div>
        <button
          type="button"
          onClick={handleWorkClockToggle}
          disabled={!normalizedAdminEmail}
          className={`h-8 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
            isActiveWorkSessionPaused
              ? 'bg-warning-bg text-warning hover:bg-warning/20'
              : activeWorkSession
              ? 'bg-error-bg text-error hover:bg-error/20'
              : 'bg-primary-tint text-primary hover:bg-primary/15'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isActiveWorkSessionPaused ? 'Resume' : (activeWorkSession ? 'Clock Out' : 'Clock In')}
        </button>
        <div className="relative" ref={notificationRef}>
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative w-9 h-9 rounded-full flex items-center justify-center text-text-secondary hover:bg-background transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-4 h-4 bg-error rounded-full border-2 border-white text-[10px] text-white flex items-center justify-center">{unreadCount}</span>
            )}
          </button>
          
          {showNotifications && (
            <div className="absolute right-0 top-12 w-[min(24rem,calc(100vw-1rem))] bg-white border border-border rounded-lg shadow-card z-50">
              <div className="p-3 border-b border-border-light flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onMarkAllNotificationsRead?.()}
                    className="text-xs text-primary hover:underline"
                  >
                    Mark all as read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-text-muted text-sm">No notifications</div>
                ) : (
                  notifications.map(notification => (
                    <div 
                      key={notification.id} 
                      className={`p-3 border-b border-border-light hover:bg-background cursor-pointer ${!notification.read ? 'bg-primary-tint' : ''}`}
                      onClick={() => onMarkNotificationRead && onMarkNotificationRead(notification.id)}
                    >
                      <div className="flex items-start gap-2">
                        <Bell className="w-4 h-4 text-text-muted mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-text-primary">{notification.message}</p>
                          <p className="text-xs text-text-muted mt-1">{notification.timestamp}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <div className="pl-3 border-l border-border">
          <p className="text-sm font-medium text-text-primary">{displayFirstName}</p>
          <p className="text-[11px] text-text-muted">{displayRoleLabel}</p>
        </div>
      </div>
    </header>
  )
}

// Admin Dashboard Page
function AdminDashboardPage({ setActivePage, currentAdminAccount }) {
  const normalizedAdmin = useMemo(() => normalizeAdminAccount({
    ...DEFAULT_ADMIN_ACCOUNT,
    role: 'admin',
    ...currentAdminAccount,
  }), [currentAdminAccount])
  const [dashboard, setDashboard] = useState(() => buildAdminDashboardSnapshot(normalizedAdmin))

  useEffect(() => {
    const syncDashboard = () => setDashboard(buildAdminDashboardSnapshot(normalizedAdmin))
    const refreshDashboard = async () => {
      await refreshSupportStateFromBackend()
      await refreshAdminClientRowsFromBackend()
      syncDashboard()
    }
    void refreshDashboard()
    const supportUnsubscribe = subscribeSupportCenter(() => syncDashboard())
    const intervalId = window.setInterval(() => {
      void refreshDashboard()
    }, DASHBOARD_REFRESH_INTERVAL_MS)
    window.addEventListener('storage', syncDashboard)
    window.addEventListener(ADMIN_WORK_SESSIONS_SYNC_EVENT, syncDashboard)
    window.addEventListener(ADMIN_NOTIFICATIONS_SYNC_EVENT, syncDashboard)
    window.addEventListener(ADMIN_CLIENT_MANAGEMENT_SYNC_EVENT, refreshDashboard)
    window.addEventListener('kiamina:admin-dashboard-realtime-sync', syncDashboard)
    return () => {
      supportUnsubscribe()
      window.clearInterval(intervalId)
      window.removeEventListener('storage', syncDashboard)
      window.removeEventListener(ADMIN_WORK_SESSIONS_SYNC_EVENT, syncDashboard)
      window.removeEventListener(ADMIN_NOTIFICATIONS_SYNC_EVENT, syncDashboard)
      window.removeEventListener(ADMIN_CLIENT_MANAGEMENT_SYNC_EVENT, refreshDashboard)
      window.removeEventListener('kiamina:admin-dashboard-realtime-sync', syncDashboard)
    }
  }, [normalizedAdmin])

  const documentCoveragePercent = dashboard.totalDocuments > 0
    ? Math.round((dashboard.approvedDocuments / dashboard.totalDocuments) * 100)
    : 0
  const kpiCards = [
    {
      label: 'Visible Clients',
      value: dashboard.totalClients,
      caption: `${dashboard.pendingComplianceClients} pending verification`,
      icon: Users,
      tone: 'bg-info-bg text-primary',
      targetPage: 'admin-clients',
    },
    {
      label: 'Pending Review',
      value: dashboard.pendingDocuments,
      caption: `${dashboard.infoRequestedDocuments} info requested`,
      icon: FileText,
      tone: 'bg-warning-bg text-warning',
      targetPage: 'admin-documents',
    },
    {
      label: 'Approved Today',
      value: dashboard.approvedTodayDocuments,
      caption: `${documentCoveragePercent}% document approval coverage`,
      icon: CheckCircle,
      tone: 'bg-success-bg text-success',
      targetPage: 'admin-documents',
    },
    {
      label: 'Support Unread',
      value: dashboard.unreadSupportCount,
      caption: `${dashboard.unresolvedTickets} unresolved tickets`,
      icon: MessageSquare,
      tone: 'bg-error-bg text-error',
      targetPage: 'admin-communications',
    },
    {
      label: 'Lead Pipeline',
      value: dashboard.totalLeads,
      caption: `${dashboard.inquiryLeadCount} inquiry / ${dashboard.newsletterLeadCount} newsletter`,
      icon: UsersRound,
      tone: 'bg-primary-tint text-primary',
      targetPage: 'admin-leads',
    },
    {
      label: 'Admins Clocked In',
      value: dashboard.openWorkerCount,
      caption: `${dashboard.activeWorkerCount} active, ${dashboard.pausedWorkerCount} paused`,
      icon: Clock,
      tone: 'bg-background text-text-primary',
      targetPage: 'admin-work-hours',
    },
  ]
  const priorityItems = [
    {
      label: 'Pending Document Reviews',
      value: dashboard.pendingDocuments,
      description: 'Files waiting for action.',
      targetPage: 'admin-documents',
    },
    {
      label: 'Unattended Support Tickets',
      value: dashboard.unattendedTickets,
      description: 'Open tickets with unread messages.',
      targetPage: 'admin-communications',
    },
    {
      label: 'Clients Without Assignment',
      value: dashboard.unassignedClientCount,
      description: 'No Area Accountant assigned yet.',
      targetPage: 'admin-settings',
    },
    {
      label: 'Invites Expiring Within 12h',
      value: dashboard.expiringSoonInviteCount,
      description: 'Pending admin invite links nearing expiry.',
      targetPage: 'admin-settings',
    },
  ]

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">Admin Dashboard</h2>
          <p className="text-sm text-text-muted mt-1">Live operations, technical, and support snapshot.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-border-light bg-white px-3 py-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span className="text-xs text-text-secondary">
            Signed in as {normalizedAdmin.fullName || 'Admin User'} ({getAdminLevelLabel(normalizedAdmin.adminLevel)})
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {kpiCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => setActivePage(card.targetPage)}
            className="bg-white rounded-lg shadow-card p-4 flex items-start gap-3 text-left hover:shadow-card-hover transition-shadow"
          >
            <div className={`w-10 h-10 rounded-md flex items-center justify-center ${card.tone}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold text-text-primary leading-tight">{card.value}</p>
              <p className="text-xs text-text-secondary mt-1 uppercase tracking-wide">{card.label}</p>
              <p className="text-xs text-text-muted mt-1">{card.caption}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-card border border-border-light p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-text-primary">1. Priority Queue</h3>
            <button type="button" onClick={() => setActivePage('admin-documents')} className="text-xs text-primary hover:underline">Open Review</button>
          </div>
          <div className="mt-4 space-y-3">
            {priorityItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setActivePage(item.targetPage)}
                className="w-full rounded-md border border-border-light px-3 py-2 text-left hover:bg-background transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-text-primary">{item.label}</p>
                  <span className="text-sm font-semibold text-primary">{item.value}</span>
                </div>
                <p className="text-xs text-text-muted mt-1">{item.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-card border border-border-light p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-text-primary">2. Document Pipeline</h3>
            <button type="button" onClick={() => setActivePage('admin-documents')} className="text-xs text-primary hover:underline">Open Documents</button>
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Total Documents</span>
              <span className="text-sm font-semibold text-text-primary">{dashboard.totalDocuments}</span>
            </div>
            <div className="h-2 rounded-full bg-background overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${documentCoveragePercent}%` }} />
            </div>
            <p className="text-xs text-text-muted">{documentCoveragePercent}% approved coverage</p>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-md border border-border-light p-3">
                <p className="text-xs text-text-muted uppercase tracking-wide">Pending</p>
                <p className="text-base font-semibold text-warning mt-1">{dashboard.pendingDocuments}</p>
              </div>
              <div className="rounded-md border border-border-light p-3">
                <p className="text-xs text-text-muted uppercase tracking-wide">Info Requested</p>
                <p className="text-base font-semibold text-primary mt-1">{dashboard.infoRequestedDocuments}</p>
              </div>
              <div className="rounded-md border border-border-light p-3">
                <p className="text-xs text-text-muted uppercase tracking-wide">Rejected</p>
                <p className="text-base font-semibold text-error mt-1">{dashboard.rejectedDocuments}</p>
              </div>
              <div className="rounded-md border border-border-light p-3">
                <p className="text-xs text-text-muted uppercase tracking-wide">Approved Today</p>
                <p className="text-base font-semibold text-success mt-1">{dashboard.approvedTodayDocuments}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-card border border-border-light p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-text-primary">3. Support Funnel</h3>
            <button type="button" onClick={() => setActivePage('admin-communications')} className="text-xs text-primary hover:underline">Open Inbox</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Open</p>
              <p className="text-base font-semibold text-warning mt-1">{dashboard.openTickets}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Assigned</p>
              <p className="text-base font-semibold text-primary mt-1">{dashboard.assignedTickets}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Resolved</p>
              <p className="text-base font-semibold text-success mt-1">{dashboard.resolvedTickets}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Unread</p>
              <p className="text-base font-semibold text-error mt-1">{dashboard.unreadSupportCount}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Inquiry Leads</p>
              <p className="text-base font-semibold text-text-primary mt-1">{dashboard.inquiryLeadCount}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Newsletter Leads</p>
              <p className="text-base font-semibold text-text-primary mt-1">{dashboard.newsletterLeadCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-card border border-border-light p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-text-primary">4. Workforce Pulse</h3>
            <button type="button" onClick={() => setActivePage('admin-work-hours')} className="text-xs text-primary hover:underline">Open Work Hours</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Clocked In</p>
              <p className="text-base font-semibold text-text-primary mt-1">{dashboard.openWorkerCount}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Active / Paused</p>
              <p className="text-base font-semibold text-text-primary mt-1">{dashboard.activeWorkerCount} / {dashboard.pausedWorkerCount}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Today Work Time</p>
              <p className="text-base font-semibold text-primary mt-1">{formatWorkDuration(dashboard.todayTrackedDurationMs)}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">My Work Status</p>
              <p className="text-base font-semibold text-text-primary mt-1">{dashboard.personalWorkStatus}</p>
              <p className="text-xs text-text-muted mt-1">{formatWorkDuration(dashboard.personalTodayTrackedDurationMs)} today</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-card border border-border-light p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-text-primary">5. Activity Pulse</h3>
            <button type="button" onClick={() => setActivePage('admin-activity')} className="text-xs text-primary hover:underline">Open Activity Log</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Operations</p>
              <p className="text-base font-semibold text-text-primary mt-1">{dashboard.operationsLogCount}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Technical</p>
              <p className="text-base font-semibold text-text-primary mt-1">{dashboard.technicalLogCount}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Super Admin</p>
              <p className="text-base font-semibold text-text-primary mt-1">{dashboard.superLogCount}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Today</p>
              <p className="text-base font-semibold text-primary mt-1">{dashboard.todayActivityCount}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {dashboard.recentActivityLogs.length > 0 ? dashboard.recentActivityLogs.map((log) => (
              <div key={log.id} className="rounded-md border border-border-light px-3 py-2">
                <p className="text-sm font-medium text-text-primary">{log.action}</p>
                <p className="text-xs text-text-muted mt-1">{log.adminName} / {log.timestamp}</p>
              </div>
            )) : (
              <p className="text-sm text-text-muted">No activity logs yet.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-card border border-border-light p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-text-primary">6. System Queue</h3>
            <button type="button" onClick={() => setActivePage('admin-settings')} className="text-xs text-primary hover:underline">Open Settings</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Pending Invites</p>
              <p className="text-base font-semibold text-text-primary mt-1">{dashboard.pendingInviteCount}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Expiring Soon</p>
              <p className="text-base font-semibold text-warning mt-1">{dashboard.expiringSoonInviteCount}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Draft Notifications</p>
              <p className="text-base font-semibold text-text-primary mt-1">{dashboard.draftNotificationCount}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Scheduled (24h)</p>
              <p className="text-base font-semibold text-primary mt-1">{dashboard.scheduledDueSoonCount}/{dashboard.scheduledPendingCount}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Trash Items</p>
              <p className="text-base font-semibold text-text-primary mt-1">{dashboard.trashCount}</p>
            </div>
            <div className="rounded-md border border-border-light p-3">
              <p className="text-xs text-text-muted uppercase tracking-wide">Multi-Assigned Clients</p>
              <p className="text-base font-semibold text-success mt-1">{dashboard.multiAssignedClientCount}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button type="button" onClick={() => setActivePage('admin-settings')} className="h-9 rounded-md border border-border text-xs font-medium text-text-primary hover:bg-background">Admin Settings</button>
            <button type="button" onClick={() => setActivePage('admin-communications')} className="h-9 rounded-md border border-border text-xs font-medium text-text-primary hover:bg-background">Communications</button>
            <button type="button" onClick={() => setActivePage('admin-trash')} className="h-9 rounded-md border border-border text-xs font-medium text-text-primary hover:bg-background">Trash</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Client Management Page
function AdminClientsPage({
  showToast,
  setActivePage,
  onRequestImpersonation,
  currentAdminAccount,
  impersonationEnabled,
  onAdminActionLog,
  onOpenClientProfile,
  onOpenClientDocuments,
  onOpenClientUploadHistory,
  onOpenClientResolvedDocuments,
}) {
  const [clients, setClients] = useState(() => readClientRows())
  const [clientAssignments, setClientAssignments] = useState(() => readClientAssignmentsFromStorage())
  const [searchTerm, setSearchTerm] = useState('')
  const [openActionMenuId, setOpenActionMenuId] = useState(null)
  const actionMenuRef = useRef(null)
  const resolvedAdminAccount = normalizeAdminAccount({
    role: 'admin',
    ...currentAdminAccount,
  })
  const isSuperAdmin = resolvedAdminAccount?.adminLevel === ADMIN_LEVELS.SUPER
  const hasPermission = (permissionId) => (
    isSuperAdmin || hasAdminPermission(resolvedAdminAccount, permissionId)
  )

  const canViewDocuments = hasPermission('view_documents')
  const canViewUploadHistory = hasPermission('view_upload_history')
  const canViewResolvedDocuments = canViewDocuments
  const canSendNotifications = hasPermission('send_notifications')
  const canManageUsers = hasPermission('manage_users')
  const canImpersonateClients = hasPermission('impersonate_clients')
  const canViewBusinesses = hasPermission('view_businesses') || hasPermission('view_assigned_clients')
  const canViewClientSettings = canViewBusinesses || hasPermission('view_client_settings') || hasPermission('edit_client_settings')

  useEffect(() => {
    let isDisposed = false
    const refreshClients = async () => {
      await refreshAdminClientRowsFromBackend()
      if (isDisposed) return
      setClients(readClientRows())
    }
    void refreshClients()
    const handleStorage = (event) => {
      if (!event.key || event.key === CLIENT_ASSIGNMENTS_STORAGE_KEY) {
        setClientAssignments(readClientAssignmentsFromStorage())
      }
      if (!event.key || event.key === ACCOUNTS_STORAGE_KEY || event.key === CLIENT_ASSIGNMENTS_STORAGE_KEY) {
        void refreshClients()
      }
    }
    const handleClientManagementSync = () => {
      void refreshClients()
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener(ADMIN_CLIENT_MANAGEMENT_SYNC_EVENT, handleClientManagementSync)
    const intervalId = window.setInterval(() => {
      void refreshClients()
    }, 15000)
    return () => {
      isDisposed = true
      window.clearInterval(intervalId)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(ADMIN_CLIENT_MANAGEMENT_SYNC_EVENT, handleClientManagementSync)
    }
  }, [])

  useEffect(() => {
    const closeActionMenu = (event) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target)) {
        setOpenActionMenuId(null)
      }
    }
    document.addEventListener('mousedown', closeActionMenu)
    return () => document.removeEventListener('mousedown', closeActionMenu)
  }, [])

  const refreshClientRows = async () => {
    await refreshAdminClientRowsFromBackend()
    setClients(readClientRows())
  }

  const getStatusBadge = (status) => {
    const normalizedCompliance = normalizeComplianceStatus(status, '')
    if (normalizedCompliance === COMPLIANCE_STATUS.FULL) return 'bg-success-bg text-success'
    if (normalizedCompliance === COMPLIANCE_STATUS.ACTION) return 'bg-warning-bg text-warning'
    if (normalizedCompliance === COMPLIANCE_STATUS.PENDING) return 'bg-error-bg text-error'

    if (status === 'Completed' || status === 'Active') return 'bg-success-bg text-success'
    if (status === 'In Progress') return 'bg-warning-bg text-warning'
    if (status === 'Suspended') return 'bg-error-bg text-error'
    return 'bg-info-bg text-primary'
  }

  const scopedClients = filterClientsForAdminScope(clients, resolvedAdminAccount, clientAssignments)
  const filteredClients = scopedClients.filter((client) => {
    const haystack = [
      client.businessName,
      client.cri,
      client.primaryContact,
      client.email,
      client.country,
      client.assignedAreaAccountantName,
    ].join(' ').toLowerCase()
    return haystack.includes(searchTerm.trim().toLowerCase())
  })

  const safeToast = (type, message) => {
    if (typeof showToast === 'function') showToast(type, message)
  }

  const appendActionLog = (action, client, details = '') => {
    if (typeof onAdminActionLog !== 'function') return
    onAdminActionLog({
      action,
      affectedUser: client.businessName,
      details: details || `${action} - ${client.businessName}`,
    })
  }

  const updateClientAccount = (clientEmail, updater) => {
    const storedAccounts = safeParseJson(localStorage.getItem(ACCOUNTS_STORAGE_KEY), [])
    if (!Array.isArray(storedAccounts)) return false

    const targetIndex = storedAccounts.findIndex((account) => (
      (account?.email || '').trim().toLowerCase() === clientEmail.trim().toLowerCase()
    ))
    if (targetIndex === -1) return false

    const nextAccounts = [...storedAccounts]
    nextAccounts[targetIndex] = updater(nextAccounts[targetIndex])
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(nextAccounts))
    void refreshClientRows()
    return true
  }

  const handleClientAction = async (actionId, client) => {
    setOpenActionMenuId(null)
    if (!canAdminAccessClientScope(resolvedAdminAccount, client?.email, clientAssignments)) {
      safeToast('error', 'Insufficient Permissions')
      return
    }

    if (actionId === 'view-profile') {
      if (!canViewClientSettings) {
        safeToast('error', 'Insufficient Permissions')
        return
      }
      onOpenClientProfile?.(client)
      setActivePage?.('admin-client-profile')
      safeToast('success', `Opened profile for ${client.businessName}.`)
      appendActionLog('Viewed client profile', client)
      return
    }
    if (actionId === 'view-documents') {
      if (!canViewDocuments) {
        safeToast('error', 'Insufficient Permissions')
        return
      }
      onOpenClientDocuments?.(client)
      setActivePage?.('admin-client-documents')
      safeToast('success', `Opened document vault for ${client.businessName}.`)
      appendActionLog('Opened client documents', client)
      return
    }
    if (actionId === 'view-upload-history') {
      if (!canViewUploadHistory) {
        safeToast('error', 'Insufficient Permissions')
        return
      }
      onOpenClientUploadHistory?.(client)
      setActivePage?.('admin-client-upload-history')
      safeToast('success', `Opened upload history for ${client.businessName}.`)
      appendActionLog('Opened client upload history', client)
      return
    }
    if (actionId === 'view-resolved-documents') {
      if (!canViewResolvedDocuments) {
        safeToast('error', 'Insufficient Permissions')
        return
      }
      onOpenClientResolvedDocuments?.(client)
      setActivePage?.('admin-client-resolved-documents')
      safeToast('success', `Opened resolved document delivery for ${client.businessName}.`)
      appendActionLog('Opened resolved document delivery', client)
      return
    }
    if (actionId === 'reset-password') {
      if (!canManageUsers) {
        safeToast('error', 'Insufficient Permissions')
        return
      }
      if (client?.uid) {
        try {
          const normalizedEmail = toTrimmedValue(client?.email).toLowerCase()
          if (!normalizedEmail) {
            safeToast('error', 'Client email is required for password reset.')
            return
          }
          const resetLink = buildClientResetPasswordLink(normalizedEmail)
          const response = await apiFetch('/api/auth/send-password-reset-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: normalizedEmail,
              resetLink,
            }),
          })
          const payload = await response.json().catch(() => null)
          const dispatchQueued = payload?.dispatchQueued !== false
          if (!response.ok || !dispatchQueued) {
            const message = toTrimmedValue(payload?.message) || 'Unable to queue password reset email.'
            safeToast('error', message)
            return
          }
          safeToast('success', `Password reset link queued for ${client.businessName}.`)
          appendActionLog('Password reset link sent', client, `Password reset link queued for ${normalizedEmail}`)
          return
        } catch {
          safeToast('error', 'Unable to queue password reset email.')
          return
        }
      }
      const nextPassword = `Temp@${Math.floor(100000 + Math.random() * 900000)}`
      const updated = updateClientAccount(client.email, (account) => ({ ...account, password: nextPassword }))
      if (!updated) {
        safeToast('error', 'Unable to reset client password.')
        return
      }
      safeToast('success', `Temporary password generated for ${client.businessName}.`)
      appendActionLog('Reset client password', client, `Temporary password issued for ${client.email}`)
      return
    }
    if (actionId === 'toggle-status') {
      if (!canManageUsers) {
        safeToast('error', 'Insufficient Permissions')
        return
      }
      const isSuspended = client.clientStatus === 'Suspended'
      const nextStatus = isSuspended ? 'active' : 'suspended'
      if (client?.uid) {
        try {
          const response = await apiFetch(`/api/users/admin/client-management/clients/${encodeURIComponent(client.uid)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: nextStatus,
            }),
          })
          if (!response.ok) {
            const payload = await response.json().catch(() => null)
            const message = toTrimmedValue(payload?.message) || 'Unable to update client status.'
            safeToast('error', message)
            return
          }
          await refreshClientRows()
          window.dispatchEvent(new Event(ADMIN_CLIENT_MANAGEMENT_SYNC_EVENT))
          window.dispatchEvent(new Event('kiamina:admin-dashboard-realtime-sync'))
        } catch {
          safeToast('error', 'Unable to update client status.')
          return
        }
      } else {
        const updated = updateClientAccount(client.email, (account) => ({ ...account, status: nextStatus }))
        if (!updated) {
          safeToast('error', 'Unable to update client status.')
          return
        }
      }
      safeToast('success', `${client.businessName} has been ${isSuspended ? 'activated' : 'suspended'}.`)
      appendActionLog(isSuspended ? 'Activated client account' : 'Suspended client account', client)
      return
    }
    if (actionId === 'send-notification') {
      if (!canSendNotifications) {
        safeToast('error', 'Insufficient Permissions')
        return
      }
      setActivePage?.('admin-notifications')
      safeToast('success', `Preparing notification for ${client.businessName}.`)
      appendActionLog('Prepared client notification', client)
      return
    }
    if (actionId === 'impersonate') {
      if (!impersonationEnabled) {
        safeToast('error', 'Impersonation system is currently disabled.')
        return
      }
      if (!canImpersonateClients) {
        safeToast('error', 'Insufficient Permissions')
        return
      }
      onRequestImpersonation?.(client)
    }
  }

  const actionItemsForClient = (client) => ([
    { id: 'view-profile', label: 'View Client Profile', disabled: !canViewClientSettings, disabledMessage: 'Insufficient Permissions' },
    { id: 'view-documents', label: 'View Documents', disabled: !canViewDocuments, disabledMessage: 'Insufficient Permissions' },
    { id: 'view-upload-history', label: 'View Upload History', disabled: !canViewUploadHistory, disabledMessage: 'Insufficient Permissions' },
    { id: 'view-resolved-documents', label: 'Resolved Documents Delivery', disabled: !canViewResolvedDocuments, disabledMessage: 'Insufficient Permissions' },
    { id: 'reset-password', label: 'Reset Password', disabled: !canManageUsers, disabledMessage: 'Insufficient Permissions' },
    { id: 'toggle-status', label: client.clientStatus === 'Suspended' ? 'Activate Account' : 'Suspend Account', disabled: !canManageUsers, disabledMessage: 'Insufficient Permissions' },
    { id: 'send-notification', label: 'Send Notification', disabled: !canSendNotifications, disabledMessage: 'Insufficient Permissions' },
    {
      id: 'impersonate',
      label: 'Impersonate Client (View As Client)',
      disabled: !canImpersonateClients || !impersonationEnabled,
      disabledMessage: !impersonationEnabled ? 'Impersonation system is currently disabled.' : 'Insufficient Permissions',
    },
  ])

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">Client Management</h2>
          <p className="text-sm text-text-muted mt-1">
            {normalizeAdminLevel(resolvedAdminAccount.adminLevel) === ADMIN_LEVELS.AREA_ACCOUNTANT
              ? 'View and review clients assigned to your Area Accountant account.'
              : 'View, manage, and assist client accounts.'}
          </p>
        </div>
        <div className="w-full lg:w-80 relative">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search business, CRI, contact, email..."
            className="w-full h-10 pl-9 pr-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {!impersonationEnabled && (
        <div className="mb-4 h-10 px-3 rounded-md bg-warning-bg border border-warning/30 text-warning text-sm inline-flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" />
          Impersonation is currently disabled by system policy.
        </div>
      )}

      <div className="md:hidden space-y-3">
        {filteredClients.length === 0 && (
          <div className="bg-white rounded-lg shadow-card border border-border-light px-4 py-8 text-center text-sm text-text-muted">
            {normalizeAdminLevel(resolvedAdminAccount.adminLevel) === ADMIN_LEVELS.AREA_ACCOUNTANT
              ? 'No assigned client accounts found.'
              : 'No client accounts found.'}
          </div>
        )}
        {filteredClients.map((client) => (
          <div key={client.id} className="bg-white rounded-lg shadow-card border border-border-light p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">{client.businessName}</p>
                <p className="text-xs text-text-muted mt-1">{client.cri}</p>
              </div>
              <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${getStatusBadge(client.verificationStatus)}`}>
                {client.verificationStatus}
              </span>
            </div>
            <div className="mt-3 space-y-1.5 text-xs text-text-secondary">
              <p><span className="text-text-muted">Contact:</span> {client.primaryContact}</p>
              <p><span className="text-text-muted">Email:</span> {client.email}</p>
              <p><span className="text-text-muted">Country:</span> {client.country}</p>
              <p><span className="text-text-muted">Assigned Area:</span> {client.assignedAreaAccountantName || '--'}</p>
              <p><span className="text-text-muted">Created:</span> {client.dateCreated}</p>
            </div>
            <details className="mt-3">
              <summary className="h-8 px-3 border border-border rounded-md text-xs font-medium text-text-primary inline-flex items-center cursor-pointer select-none">
                Actions
              </summary>
              <div className="mt-2 space-y-1">
                {actionItemsForClient(client).map((item) => {
                  const isImpersonateAction = item.id === 'impersonate'
                  const isRestricted = Boolean(item.disabled)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.disabled) {
                          safeToast('error', item.disabledMessage || 'Insufficient Permissions')
                          return
                        }
                        void handleClientAction(item.id, client)
                      }}
                      className={`w-full px-3 py-2 rounded-md border border-border-light text-left text-sm transition-colors inline-flex items-center gap-2 ${isImpersonateAction ? 'text-primary font-medium' : 'text-text-primary'} ${isRestricted ? 'opacity-70 cursor-not-allowed' : 'hover:bg-background'}`}
                    >
                      {isImpersonateAction && <ShieldCheck className="w-4 h-4" />}
                      {item.label}
                      {isRestricted && <span className="ml-auto text-[10px] text-warning uppercase tracking-wide">Restricted</span>}
                    </button>
                  )
                })}
              </div>
            </details>
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-white rounded-lg shadow-card border border-border-light">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px]">
          <thead>
            <tr className="bg-[#F9FAFB]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Business Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">CRI</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Primary Contact</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Email</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Assigned Area</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Country</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Compliance State</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Onboarding Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Subscription Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Date Created</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-sm text-text-muted">
                  {normalizeAdminLevel(resolvedAdminAccount.adminLevel) === ADMIN_LEVELS.AREA_ACCOUNTANT
                    ? 'No assigned client accounts found.'
                    : 'No client accounts found.'}
                </td>
              </tr>
            )}
            {filteredClients.map((client) => (
              <tr key={client.id} className="border-t border-border-light hover:bg-[#F9FAFB]">
                <td className="px-4 py-3.5 text-sm font-medium text-text-primary">{client.businessName}</td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{client.cri}</td>
                <td className="px-4 py-3.5 text-sm text-text-primary">{client.primaryContact}</td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{client.email}</td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{client.assignedAreaAccountantName || '--'}</td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{client.country}</td>
                <td className="px-4 py-3.5 text-sm">
                  <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${getStatusBadge(client.verificationStatus)}`}>
                    {client.verificationStatus}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-sm">
                  <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${getStatusBadge(client.onboardingStatus)}`}>
                    {client.onboardingStatus}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-sm">
                  <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${getStatusBadge(client.subscriptionStatus)}`}>
                    {client.subscriptionStatus}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{client.dateCreated}</td>
                <td className="px-4 py-3.5 text-sm">
                  <div className="relative inline-block" ref={openActionMenuId === client.id ? actionMenuRef : null}>
                    <button
                      type="button"
                      onClick={() => setOpenActionMenuId((prev) => (prev === client.id ? null : client.id))}
                      className="h-8 w-8 border border-border rounded-md inline-flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-background"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {openActionMenuId === client.id && (
                      <div className="absolute right-0 top-10 w-64 bg-white border border-border-light rounded-md shadow-card z-40 py-1">
                        {actionItemsForClient(client).map((item) => {
                          const isImpersonateAction = item.id === 'impersonate'
                          const isRestricted = Boolean(item.disabled)
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                if (item.disabled) {
                                  safeToast('error', item.disabledMessage || 'Insufficient Permissions')
                                  return
                                }
                                void handleClientAction(item.id, client)
                              }}
                              className={`w-full px-3 py-2 text-left text-sm transition-colors inline-flex items-center gap-2 ${isImpersonateAction ? 'text-primary font-medium' : 'text-text-primary'} ${isRestricted ? 'opacity-70 cursor-not-allowed' : 'hover:bg-background'}`}
                            >
                              {isImpersonateAction && <ShieldCheck className="w-4 h-4" />}
                              {item.label}
                              {isRestricted && <span className="ml-auto text-[10px] text-warning uppercase tracking-wide">Restricted</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

function AdminClientPageHeader({ client, title, subtitle, setActivePage }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <button
          type="button"
          onClick={() => setActivePage?.('admin-clients')}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Client Management
        </button>
        <h2 className="text-2xl font-semibold text-text-primary">{title}</h2>
        <p className="text-sm text-text-muted mt-1">{subtitle}</p>
      </div>
      <div className="bg-white border border-border-light rounded-lg px-4 py-3 min-w-[260px]">
        <p className="text-xs uppercase tracking-wide text-text-muted">Client Account</p>
        <p className="text-sm font-semibold text-text-primary mt-1">{client?.businessName || '--'}</p>
        <p className="text-xs text-text-muted mt-1">{client?.email || '--'}</p>
      </div>
    </div>
  )
}

function AdminClientProfilePage({ client, setActivePage, showToast, onAdminActionLog, currentAdminAccount }) {
  const [clientSnapshot, setClientSnapshot] = useState(client)

  useEffect(() => {
    setClientSnapshot(client)
  }, [client])
  const safeClient = clientSnapshot || client || null
  const resolvedAdminAccount = normalizeAdminAccount({
    role: 'admin',
    ...currentAdminAccount,
  })
  const isSuperAdmin = resolvedAdminAccount.adminLevel === ADMIN_LEVELS.SUPER
  const canViewClientProfile = (
    isSuperAdmin
    || hasAdminPermission(resolvedAdminAccount, 'view_businesses')
    || hasAdminPermission(resolvedAdminAccount, 'view_assigned_clients')
    || hasAdminPermission(resolvedAdminAccount, 'view_client_settings')
    || hasAdminPermission(resolvedAdminAccount, 'edit_client_settings')
  )
  const canEditClientSettings = (
    isSuperAdmin
    || hasAdminPermission(resolvedAdminAccount, 'edit_client_settings')
    || hasAdminPermission(resolvedAdminAccount, 'manage_technical_client_config')
  )
  const normalizedEmail = (safeClient?.email || '').trim().toLowerCase()
  const normalizedClientUid = toTrimmedValue(safeClient?.uid || safeClient?.rawAccount?.uid)
  const storedSettings = useMemo(
    () => getScopedStorageObject('settingsFormData', normalizedEmail),
    [normalizedEmail],
  )
  const storedOnboarding = useMemo(
    () => getScopedStorageObject('kiaminaOnboardingState', normalizedEmail),
    [normalizedEmail],
  )
  const storedStatusControl = useMemo(
    () => getScopedStorageObject(CLIENT_STATUS_CONTROL_STORAGE_KEY, normalizedEmail),
    [normalizedEmail],
  )
  const storedVerificationDocs = useMemo(
    () => getScopedStorageObject('verificationDocs', normalizedEmail),
    [normalizedEmail],
  )
  const storedNotificationSettings = useMemo(
    () => getScopedStorageObject('notificationSettings', normalizedEmail),
    [normalizedEmail],
  )
  const settings = useMemo(
    () => mergeClientDataObjects(safeClient?.settings, storedSettings),
    [safeClient?.settings, storedSettings],
  )
  const onboarding = useMemo(() => {
    const backendOnboarding = safeClient?.onboarding && typeof safeClient.onboarding === 'object'
      ? safeClient.onboarding
      : {}
    return {
      ...storedOnboarding,
      ...backendOnboarding,
      data: mergeClientDataObjects(backendOnboarding?.data, storedOnboarding?.data),
    }
  }, [safeClient?.onboarding, storedOnboarding])
  const statusControl = useMemo(
    () => mergeClientDataObjects(safeClient?.statusControl, storedStatusControl),
    [safeClient?.statusControl, storedStatusControl],
  )
  const verificationDocs = useMemo(
    () => mergeClientDataObjects(safeClient?.verificationDocs, storedVerificationDocs),
    [safeClient?.verificationDocs, storedVerificationDocs],
  )
  const notificationSettings = useMemo(
    () => mergeClientDataObjects(safeClient?.notificationSettings, storedNotificationSettings),
    [safeClient?.notificationSettings, storedNotificationSettings],
  )
  const profilePhoto = toTrimmedValue(safeClient?.profilePhoto) || getScopedStorageString('profilePhoto', normalizedEmail)
  const companyLogo = toTrimmedValue(safeClient?.companyLogo) || getScopedStorageString('companyLogo', normalizedEmail)
  const onboardingData = onboarding?.data || {}
  const clientLogs = readClientActivityLogs({ ...clientSnapshot, settings, onboarding })

  useEffect(() => {
    let cancelled = false
    if (!normalizedClientUid) return undefined

    const syncClientSnapshot = async () => {
      const refreshed = await fetchAdminClientRowByUidFromBackend(normalizedClientUid)
      if (!cancelled && refreshed) {
        setClientSnapshot(refreshed)
      }
    }

    void syncClientSnapshot()
    return () => {
      cancelled = true
    }
  }, [normalizedClientUid])

  const [verificationStatusDraft, setVerificationStatusDraft] = useState(
    normalizeComplianceStatus(statusControl?.verificationStatus || safeClient?.verificationStatus || '', COMPLIANCE_STATUS.PENDING),
  )
  const [suspensionMessage, setSuspensionMessage] = useState(
    statusControl?.suspensionMessage || safeClient?.suspensionMessage || '',
  )
  const [isSavingVerificationStatus, setIsSavingVerificationStatus] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isEditingIdentityAssets, setIsEditingIdentityAssets] = useState(false)
  const [isSavingIdentityAssets, setIsSavingIdentityAssets] = useState(false)
  const [isOpeningBusinessDocument, setIsOpeningBusinessDocument] = useState(false)
  const [isDownloadingBusinessDocument, setIsDownloadingBusinessDocument] = useState(false)
  const [identityDraft, setIdentityDraft] = useState(() => ({
    profilePhoto: profilePhoto || '',
    companyLogo: companyLogo || '',
    // govId: verificationDocs.govId || '',
    // govIdType: verificationDocs.govIdType || '',
    businessReg: verificationDocs.businessReg || '',
  }))
  const [profileDraft, setProfileDraft] = useState(() => ({
    primaryContact: safeClient?.primaryContact || settings.fullName || '',
    businessName: safeClient?.businessName || settings.businessName || onboardingData.businessName || '',
    businessType: safeClient?.businessType || settings.businessType || onboardingData.businessType || '',
    phoneCountryCode: resolvePhoneParts(settings.phone || '').code,
    phone: resolvePhoneParts(settings.phone || '').number,
    roleInCompany: settings.roleInCompany || '',
    country: safeClient?.country || settings.country || onboardingData.country || '',
    industry: settings.industry || onboardingData.industry || '',
    tin: settings.tin || onboardingData.tin || '',
    reportingCycle: normalizeFinancialBoundaryDate(settings.reportingCycle || onboardingData.reportingCycle || '', 'end'),
    startMonth: normalizeFinancialBoundaryDate(settings.startMonth || onboardingData.startMonth || '', 'start'),
    currency: settings.currency || onboardingData.currency || 'NGN',
    language: settings.language || onboardingData.language || 'English',
    businessReg: settings.cacNumber || settings.businessReg || onboardingData.cacNumber || onboardingData.businessReg || '',
    address1: settings.address1 || '',
    address2: settings.address2 || '',
    city: settings.city || '',
    postalCode: settings.postalCode || '',
    addressCountry: settings.addressCountry || settings.country || onboardingData.country || '',
  }))

  useEffect(() => {
    setVerificationStatusDraft(normalizeComplianceStatus(statusControl?.verificationStatus || safeClient?.verificationStatus || '', COMPLIANCE_STATUS.PENDING))
    setSuspensionMessage(statusControl?.suspensionMessage || safeClient?.suspensionMessage || '')
  }, [statusControl?.verificationStatus, statusControl?.suspensionMessage, safeClient?.verificationStatus, safeClient?.suspensionMessage])

  const normalizeBooleanFlag = (value) => {
    if (value === true) return true
    const normalized = String(value || '').trim().toLowerCase()
    return normalized === 'true' || normalized === 'yes' || normalized === '1'
  }
  const hasIsoTimestamp = (value) => Number.isFinite(Date.parse(value || ''))
  /*
  const hasIdentityDocumentSubmission = Boolean(
    toTrimmedValue(verificationDocs.govId)
    && toTrimmedValue(verificationDocs.govIdType)
    && toTrimmedValue(verificationDocs.govIdNumber),
  )
  const identityVerifiedByAutomation = Boolean(toTrimmedValue(verificationDocs.govIdVerifiedAt))
  const identityVerificationApproved = Boolean(
    identityVerifiedByAutomation
    || normalizeBooleanFlag(statusControl?.identityVerificationApproved)
    || hasIsoTimestamp(statusControl?.identityVerificationApprovedAt),
  )
  */
  const hasBusinessDocumentSubmission = Boolean(toTrimmedValue(verificationDocs.businessReg))
  const businessVerificationApproved = Boolean(
    normalizeBooleanFlag(statusControl?.businessVerificationApproved)
    || hasIsoTimestamp(statusControl?.businessVerificationApprovedAt),
  )
  const getPreferredClientValue = (...candidates) => {
    for (const candidate of candidates) {
      const normalizedCandidate = toTrimmedValue(candidate)
      if (normalizedCandidate) return normalizedCandidate
    }
    return ''
  }
  const businessVerificationDocumentName = getPreferredClientValue(verificationDocs.businessReg)
  const businessVerificationDocumentCacheKey = getPreferredClientValue(verificationDocs.businessRegFileCacheKey)
  const businessVerificationDocumentUploadedAt = getPreferredClientValue(verificationDocs.businessRegUploadedAt)
  const businessVerificationDocumentSize = Math.max(0, Number(verificationDocs.businessRegSize || 0))
  const businessVerificationDocumentSizeLabel = businessVerificationDocumentSize > 0
    ? `${Math.max(1, Math.round(businessVerificationDocumentSize / 1024))} KB`
    : '--'
  const phoneForVerification = formatPhoneNumber(
    resolvePhoneParts(settings.phone || '').code,
    resolvePhoneParts(settings.phone || '').number,
  )
  const verificationAddress = [
    settings.address1,
    settings.address2,
    settings.city,
    settings.postalCode,
    settings.addressCountry || settings.country || onboardingData.country,
  ].map((value) => toTrimmedValue(value)).filter(Boolean).join(', ')
  const businessVerificationDetailRows = [
    ['Business Name', getPreferredClientValue(settings.businessName, onboardingData.businessName, safeClient?.businessName)],
    ['Business Type', getPreferredClientValue(settings.businessType, onboardingData.businessType, safeClient?.businessType)],
    ['Registration Number', getPreferredClientValue(settings.cacNumber, settings.businessReg, onboardingData.cacNumber, onboardingData.businessReg, profileDraft.businessReg)],
    ['Tax Identification Number', getPreferredClientValue(settings.tin, onboardingData.tin)],
    ['Industry', getPreferredClientValue(settings.industry, onboardingData.industry)],
    ['Country', getPreferredClientValue(settings.country, onboardingData.country, safeClient?.country)],
    ['Primary Contact', getPreferredClientValue(settings.fullName, safeClient?.primaryContact)],
    ['Contact Phone', getPreferredClientValue(phoneForVerification)],
    ['Registered Address', getPreferredClientValue(verificationAddress)],
    ['Account Email', getPreferredClientValue(normalizedEmail, safeClient?.email)],
  ]

  useEffect(() => {
    setIdentityDraft({
      profilePhoto: profilePhoto || '',
      companyLogo: companyLogo || '',
      businessReg: verificationDocs.businessReg || '',
    })
    setIsEditingIdentityAssets(false)
  }, [safeClient?.id, safeClient?.email, profilePhoto, companyLogo, verificationDocs.businessReg])

  useEffect(() => {
    setProfileDraft({
      primaryContact: safeClient?.primaryContact || settings.fullName || '',
      businessName: safeClient?.businessName || settings.businessName || onboardingData.businessName || '',
      businessType: safeClient?.businessType || settings.businessType || onboardingData.businessType || '',
      phoneCountryCode: resolvePhoneParts(settings.phone || '').code,
      phone: resolvePhoneParts(settings.phone || '').number,
      roleInCompany: settings.roleInCompany || '',
      country: safeClient?.country || settings.country || onboardingData.country || '',
      industry: settings.industry || onboardingData.industry || '',
      tin: settings.tin || onboardingData.tin || '',
      reportingCycle: normalizeFinancialBoundaryDate(settings.reportingCycle || onboardingData.reportingCycle || '', 'end'),
      startMonth: normalizeFinancialBoundaryDate(settings.startMonth || onboardingData.startMonth || '', 'start'),
      currency: settings.currency || onboardingData.currency || 'NGN',
      language: settings.language || onboardingData.language || 'English',
      businessReg: settings.cacNumber || settings.businessReg || onboardingData.cacNumber || onboardingData.businessReg || '',
      address1: settings.address1 || '',
      address2: settings.address2 || '',
      city: settings.city || '',
      postalCode: settings.postalCode || '',
      addressCountry: settings.addressCountry || settings.country || onboardingData.country || '',
    })
    setIsEditingProfile(false)
  }, [safeClient?.id, safeClient?.email, safeClient?.primaryContact, safeClient?.businessName, safeClient?.businessType, safeClient?.country, settings, onboardingData])

  if (!safeClient) {
    return (
      <div className="bg-white rounded-lg shadow-card border border-border-light p-8">
        <p className="text-sm text-text-secondary">Select a client from Client Management to view profile details.</p>
        <button
          type="button"
          onClick={() => setActivePage?.('admin-clients')}
          className="mt-4 h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light"
        >
          Return to Client Management
        </button>
      </div>
    )
  }
  if (!canViewClientProfile || !canAdminAccessClientScope(resolvedAdminAccount, normalizedEmail)) {
    return (
      <div className="bg-white rounded-lg shadow-card border border-border-light p-8">
        <p className="text-sm text-text-secondary">You do not have access to this client profile.</p>
        <button
          type="button"
          onClick={() => setActivePage?.('admin-clients')}
          className="mt-4 h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light"
        >
          Return to Client Management
        </button>
      </div>
    )
  }

  const pushClientVerificationBellNotification = ({
    type = 'info',
    message = '',
    priority = 'important',
  } = {}) => {
    if (!normalizedEmail) return
    const normalizedMessage = toTrimmedValue(message)
    if (!normalizedMessage) return
    appendClientBriefNotificationsToStorage(normalizedEmail, [{
      id: `VER-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type,
      title: 'Verification Update',
      message: normalizedMessage,
      priority,
      sentAtIso: new Date().toISOString(),
      read: false,
      linkPage: 'settings',
    }])
  }

  const mapComplianceStatusToBackendVerificationStatus = (status = '') => {
    const normalized = normalizeComplianceStatus(status, COMPLIANCE_STATUS.PENDING)
    if (normalized === COMPLIANCE_STATUS.FULL) return 'verified'
    if (normalized === COMPLIANCE_STATUS.ACTION) return 'suspended'
    return 'pending'
  }

  const saveVerificationStatus = async (forcedStatus) => {
    if (!canEditClientSettings) {
      showToast?.('error', 'Insufficient Permissions')
      return
    }
    if (!normalizedEmail) return
    const nextVerificationStatus = normalizeComplianceStatus(forcedStatus || verificationStatusDraft, COMPLIANCE_STATUS.PENDING)
    const nextSuspensionMessage = isActionRequiredStatus(nextVerificationStatus) ? suspensionMessage.trim() : ''

    setIsSavingVerificationStatus(true)
    try {
      let backendSynchronized = false
      if (normalizedClientUid) {
        try {
          const response = await apiFetch(`/api/users/admin/client-management/clients/${encodeURIComponent(normalizedClientUid)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              verificationStatus: mapComplianceStatusToBackendVerificationStatus(nextVerificationStatus),
              verificationPending: nextVerificationStatus !== COMPLIANCE_STATUS.FULL,
              statusReason: nextSuspensionMessage,
            }),
          })
          if (response.ok) {
            backendSynchronized = true
            await refreshAdminClientRowsFromBackend({ force: true })
            window.dispatchEvent(new Event(ADMIN_CLIENT_MANAGEMENT_SYNC_EVENT))
            window.dispatchEvent(new Event('kiamina:admin-dashboard-realtime-sync'))
          }
        } catch {
          // Fall through to local fallback persistence.
        }
      }

      const accounts = safeParseJson(localStorage.getItem(ACCOUNTS_STORAGE_KEY), [])
      const nextAccounts = Array.isArray(accounts) ? [...accounts] : []
      const accountIndex = nextAccounts.findIndex((account) => (
        (account?.email || '').trim().toLowerCase() === normalizedEmail
      ))
      if (accountIndex !== -1) {
        nextAccounts[accountIndex] = {
          ...nextAccounts[accountIndex],
          status: 'active',
        }
        localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(nextAccounts))
      }

      const onboardingState = getScopedStorageObject('kiaminaOnboardingState', normalizedEmail)
      writeScopedStorageObject('kiaminaOnboardingState', normalizedEmail, {
        ...onboardingState,
        verificationPending: nextVerificationStatus !== COMPLIANCE_STATUS.FULL,
      })

      const nowIso = new Date().toISOString()
      const currentStatusControl = getScopedStorageObject(CLIENT_STATUS_CONTROL_STORAGE_KEY, normalizedEmail)
      const nextStatusControl = {
        ...currentStatusControl,
        verificationStatus: nextVerificationStatus,
        suspensionMessage: nextSuspensionMessage,
        updatedAt: nowIso,
      }
      if (nextVerificationStatus === COMPLIANCE_STATUS.FULL) {
        // nextStatusControl.identityVerificationApproved = true
        nextStatusControl.businessVerificationApproved = true
        // nextStatusControl.identityVerificationApprovedAt = currentStatusControl?.identityVerificationApprovedAt || nowIso
        nextStatusControl.businessVerificationApprovedAt = currentStatusControl?.businessVerificationApprovedAt || nowIso
      }
      writeScopedStorageObject(CLIENT_STATUS_CONTROL_STORAGE_KEY, normalizedEmail, nextStatusControl)

      appendScopedClientActivityLog(normalizedEmail, {
        actorName: 'Admin User',
        actorRole: 'admin',
        action: 'Updated compliance status',
        details: `Compliance state changed to ${nextVerificationStatus}.${nextSuspensionMessage ? ` Note: ${nextSuspensionMessage}` : ''}`,
      })

      onAdminActionLog?.({
        action: 'Updated client compliance state',
        affectedUser: safeClient.businessName || normalizedEmail,
        details: `Set compliance state to ${nextVerificationStatus}.${nextSuspensionMessage ? ` Note: ${nextSuspensionMessage}` : ''}`,
      })

      if (nextVerificationStatus === COMPLIANCE_STATUS.FULL) {
        pushClientVerificationBellNotification({
          type: 'approved',
          message: 'Verification approved. Your account is fully verified.',
          priority: 'important',
        })
      } else if (nextVerificationStatus === COMPLIANCE_STATUS.ACTION) {
        pushClientVerificationBellNotification({
          type: 'info',
          message: nextSuspensionMessage
            ? `Verification update requires your attention: ${nextSuspensionMessage}`
            : 'Verification update requires your attention.',
          priority: 'important',
        })
      } else {
        pushClientVerificationBellNotification({
          type: 'info',
          message: 'Verification status was updated and is now pending review.',
          priority: 'normal',
        })
      }

      const refreshed = readClientRows().find((row) => row.email === normalizedEmail)
      if (refreshed) setClientSnapshot(refreshed)
      setVerificationStatusDraft(nextVerificationStatus)
      if (!isActionRequiredStatus(nextVerificationStatus)) setSuspensionMessage('')
      if (backendSynchronized) {
        showToast?.('success', 'Client compliance state updated and synced to backend.')
      } else {
        showToast?.('success', 'Client compliance state updated.')
      }
    } finally {
      setIsSavingVerificationStatus(false)
    }
  }

  /*
  const saveIdentityVerificationApproval = (approved) => {
    if (!canEditClientSettings) {
      showToast?.('error', 'Insufficient Permissions')
      return
    }
    if (!normalizedEmail) return
    if (approved && !hasIdentityDocumentSubmission) {
      showToast?.('error', 'Government ID and ID type are required before identity approval.')
      return
    }
    const nowIso = new Date().toISOString()
    const currentStatusControl = getScopedStorageObject(CLIENT_STATUS_CONTROL_STORAGE_KEY, normalizedEmail)
    const nextStatusControl = {
      ...currentStatusControl,
      identityVerificationApproved: Boolean(approved),
      identityVerificationApprovedAt: approved ? nowIso : '',
      updatedAt: nowIso,
    }
    if (!approved) {
      nextStatusControl.businessVerificationApproved = false
      nextStatusControl.businessVerificationApprovedAt = ''
      if (normalizeComplianceStatus(nextStatusControl.verificationStatus, '') === COMPLIANCE_STATUS.FULL) {
        nextStatusControl.verificationStatus = COMPLIANCE_STATUS.PENDING
      }
    }
    writeScopedStorageObject(CLIENT_STATUS_CONTROL_STORAGE_KEY, normalizedEmail, nextStatusControl)

    const onboardingState = getScopedStorageObject('kiaminaOnboardingState', normalizedEmail)
    const businessApprovedNext = Boolean(
      normalizeBooleanFlag(nextStatusControl.businessVerificationApproved)
      || hasIsoTimestamp(nextStatusControl.businessVerificationApprovedAt),
    )
    writeScopedStorageObject('kiaminaOnboardingState', normalizedEmail, {
      ...onboardingState,
      verificationPending: !(approved && businessApprovedNext),
    })

    appendScopedClientActivityLog(normalizedEmail, {
      actorName: 'Admin User',
      actorRole: 'admin',
      action: approved ? 'Approved identity verification' : 'Revoked identity verification',
      details: approved
        ? 'Identity verification approved by admin.'
        : 'Identity verification approval revoked by admin.',
    })
    onAdminActionLog?.({
      action: approved ? 'Approved identity verification' : 'Revoked identity verification',
      affectedUser: safeClient.businessName || normalizedEmail,
      details: approved
        ? 'Identity verification approved from Admin Client Profile.'
        : 'Identity verification approval was revoked from Admin Client Profile.',
    })
    pushClientVerificationBellNotification({
      type: approved ? 'approved' : 'info',
      message: approved
        ? 'Identity verification approved.'
        : 'Identity verification approval was revoked.',
      priority: approved ? 'important' : 'normal',
    })

    const refreshed = readClientRows().find((row) => row.email === normalizedEmail)
    if (refreshed) setClientSnapshot(refreshed)
    if (!approved) {
      setVerificationStatusDraft(COMPLIANCE_STATUS.PENDING)
    }
    showToast?.('success', approved ? 'Identity verification approved.' : 'Identity verification approval revoked.')
  }
  */

  const saveBusinessVerificationApproval = (approved) => {
    if (!canEditClientSettings) {
      showToast?.('error', 'Insufficient Permissions')
      return
    }
    if (!normalizedEmail) return
    // if (approved && !identityVerificationApproved) {
    //   showToast?.('error', 'Identity verification must be completed before business verification.')
    //   return
    // }
    if (approved && !hasBusinessDocumentSubmission) {
      showToast?.('error', 'Business registration document is required before business approval.')
      return
    }

    const nowIso = new Date().toISOString()
    const currentStatusControl = getScopedStorageObject(CLIENT_STATUS_CONTROL_STORAGE_KEY, normalizedEmail)
    const nextStatusControl = {
      ...currentStatusControl,
      businessVerificationApproved: Boolean(approved),
      businessVerificationApprovedAt: approved ? nowIso : '',
      updatedAt: nowIso,
    }
    if (approved) {
      nextStatusControl.verificationStatus = COMPLIANCE_STATUS.FULL
      nextStatusControl.suspensionMessage = ''
    } else if (normalizeComplianceStatus(nextStatusControl.verificationStatus, '') === COMPLIANCE_STATUS.FULL) {
      nextStatusControl.verificationStatus = COMPLIANCE_STATUS.PENDING
    }
    writeScopedStorageObject(CLIENT_STATUS_CONTROL_STORAGE_KEY, normalizedEmail, nextStatusControl)

    const onboardingState = getScopedStorageObject('kiaminaOnboardingState', normalizedEmail)
    writeScopedStorageObject('kiaminaOnboardingState', normalizedEmail, {
      ...onboardingState,
      verificationPending: !approved,
    })

    appendScopedClientActivityLog(normalizedEmail, {
      actorName: 'Admin User',
      actorRole: 'admin',
      action: approved ? 'Approved business verification' : 'Revoked business verification',
      details: approved
        ? 'Business verification approved by admin.'
        : 'Business verification approval revoked by admin.',
    })
    onAdminActionLog?.({
      action: approved ? 'Approved business verification' : 'Revoked business verification',
      affectedUser: safeClient.businessName || normalizedEmail,
      details: approved
        ? 'Business verification approved from Admin Client Profile.'
        : 'Business verification approval was revoked from Admin Client Profile.',
    })
    pushClientVerificationBellNotification({
      type: approved ? 'approved' : 'info',
      message: approved
        ? 'Business verification approved.'
        : 'Business verification approval was revoked.',
      priority: approved ? 'important' : 'normal',
    })

    const refreshed = readClientRows().find((row) => row.email === normalizedEmail)
    if (refreshed) setClientSnapshot(refreshed)
    setVerificationStatusDraft(approved ? COMPLIANCE_STATUS.FULL : COMPLIANCE_STATUS.PENDING)
    showToast?.('success', approved ? 'Business verification approved.' : 'Business verification approval revoked.')
  }

  const handleOpenBusinessVerificationDocument = async () => {
    if (isOpeningBusinessDocument) return
    if (!businessVerificationDocumentName) {
      showToast?.('error', 'No business document has been uploaded by this client.')
      return
    }
    if (!businessVerificationDocumentCacheKey) {
      showToast?.('error', 'Document preview is unavailable for this submission. Ask the client to re-upload.')
      return
    }
    setIsOpeningBusinessDocument(true)
    try {
      const blob = await getCachedFileBlob(businessVerificationDocumentCacheKey)
      if (!(blob instanceof Blob)) {
        showToast?.('error', 'This uploaded document is no longer available for viewing.')
        return
      }
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
    } finally {
      setIsOpeningBusinessDocument(false)
    }
  }

  const handleDownloadBusinessVerificationDocument = async () => {
    if (isDownloadingBusinessDocument) return
    if (!businessVerificationDocumentName) {
      showToast?.('error', 'No business document has been uploaded by this client.')
      return
    }
    if (!businessVerificationDocumentCacheKey) {
      showToast?.('error', 'Download is unavailable for this submission. Ask the client to re-upload.')
      return
    }
    setIsDownloadingBusinessDocument(true)
    try {
      const blob = await getCachedFileBlob(businessVerificationDocumentCacheKey)
      if (!(blob instanceof Blob)) {
        showToast?.('error', 'This uploaded document is no longer available for download.')
        return
      }
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = buildClientDownloadFilename({
        businessName: safeClient?.businessName || '',
        fileName: businessVerificationDocumentName || 'business-registration-document',
        fallbackFileName: 'business-registration-document',
      })
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    } finally {
      setIsDownloadingBusinessDocument(false)
    }
  }

  const mapBusinessTypeToBackendValue = (value = '') => {
    const normalized = toTrimmedValue(value).toLowerCase()
    if (normalized === 'individual') return 'individual'
    if (normalized === 'business') return 'business'
    if (normalized === 'non-profit' || normalized === 'non profit') return 'non-profit'
    return ''
  }

  const saveProfileChanges = async () => {
    if (!canEditClientSettings) {
      showToast?.('error', 'Insufficient Permissions')
      return
    }
    if (!normalizedEmail) return
    const nextPrimaryContact = toTrimmedValue(profileDraft.primaryContact)
    const nextBusinessName = toTrimmedValue(profileDraft.businessName)
    const nextBusinessType = toTrimmedValue(profileDraft.businessType)
    const isIndividualBusinessType = nextBusinessType.toLowerCase() === 'individual'
    const nextBusinessRegistration = isIndividualBusinessType ? '' : toTrimmedValue(profileDraft.businessReg)
    if (!nextPrimaryContact || !nextBusinessName) {
      showToast?.('error', 'Primary contact and business name are required.')
      return
    }

    setIsSavingProfile(true)
    try {
      let backendSynchronized = false
      if (normalizedClientUid) {
        try {
          const backendPayload = {
            businessName: nextBusinessName,
            businessType: mapBusinessTypeToBackendValue(nextBusinessType),
            country: toTrimmedValue(profileDraft.country),
            currency: toTrimmedValue(profileDraft.currency) || 'NGN',
          }
          const response = await apiFetch(`/api/users/admin/client-management/clients/${encodeURIComponent(normalizedClientUid)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(backendPayload),
          })
          if (response.ok) {
            backendSynchronized = true
            await refreshAdminClientRowsFromBackend({ force: true })
            window.dispatchEvent(new Event(ADMIN_CLIENT_MANAGEMENT_SYNC_EVENT))
            window.dispatchEvent(new Event('kiamina:admin-dashboard-realtime-sync'))
          }
        } catch {
          // Fall through to local fallback persistence.
        }
      }

      const nextSettings = {
        ...getScopedStorageObject('settingsFormData', normalizedEmail),
        fullName: nextPrimaryContact,
        businessName: nextBusinessName,
        businessType: nextBusinessType,
        phone: formatPhoneNumber(profileDraft.phoneCountryCode, profileDraft.phone),
        roleInCompany: toTrimmedValue(profileDraft.roleInCompany),
        country: toTrimmedValue(profileDraft.country),
        industry: toTrimmedValue(profileDraft.industry),
        tin: toTrimmedValue(profileDraft.tin),
        reportingCycle: normalizeFinancialBoundaryDate(profileDraft.reportingCycle, 'end'),
        startMonth: normalizeFinancialBoundaryDate(profileDraft.startMonth, 'start'),
        currency: toTrimmedValue(profileDraft.currency) || 'NGN',
        language: toTrimmedValue(profileDraft.language) || 'English',
        cacNumber: nextBusinessRegistration,
        businessReg: nextBusinessRegistration,
        address1: toTrimmedValue(profileDraft.address1),
        address2: toTrimmedValue(profileDraft.address2),
        city: toTrimmedValue(profileDraft.city),
        postalCode: toTrimmedValue(profileDraft.postalCode),
        addressCountry: toTrimmedValue(profileDraft.addressCountry),
      }
      writeScopedStorageObject('settingsFormData', normalizedEmail, nextSettings)

      const onboardingState = getScopedStorageObject('kiaminaOnboardingState', normalizedEmail)
      writeScopedStorageObject('kiaminaOnboardingState', normalizedEmail, {
        ...onboardingState,
        data: {
          ...(onboardingState?.data || {}),
          businessType: nextBusinessType,
          businessName: nextBusinessName,
          country: toTrimmedValue(profileDraft.country),
          industry: toTrimmedValue(profileDraft.industry),
          tin: toTrimmedValue(profileDraft.tin),
          reportingCycle: normalizeFinancialBoundaryDate(profileDraft.reportingCycle, 'end'),
          startMonth: normalizeFinancialBoundaryDate(profileDraft.startMonth, 'start'),
          currency: toTrimmedValue(profileDraft.currency) || 'NGN',
          language: toTrimmedValue(profileDraft.language) || 'English',
          cacNumber: nextBusinessRegistration,
          businessReg: nextBusinessRegistration,
        },
      })

      const accounts = safeParseJson(localStorage.getItem(ACCOUNTS_STORAGE_KEY), [])
      if (Array.isArray(accounts)) {
        const nextAccounts = [...accounts]
        const accountIndex = nextAccounts.findIndex((account) => (
          (account?.email || '').trim().toLowerCase() === normalizedEmail
        ))
        if (accountIndex !== -1) {
          nextAccounts[accountIndex] = {
            ...nextAccounts[accountIndex],
            fullName: nextPrimaryContact,
            businessName: nextBusinessName,
            companyName: nextBusinessName,
          }
          localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(nextAccounts))
        }
      }

      appendScopedClientActivityLog(normalizedEmail, {
        actorName: 'Admin User',
        actorRole: 'admin',
        action: 'Updated client profile',
        details: 'Client profile fields were edited in Admin Client Profile.',
      })

      onAdminActionLog?.({
        action: 'Edited client profile',
        affectedUser: nextBusinessName,
        details: 'Updated profile fields (contact, business, address, and compliance metadata).',
      })

      const refreshed = readClientRows().find((row) => row.email === normalizedEmail)
      if (refreshed) setClientSnapshot(refreshed)
      setIsEditingProfile(false)
      if (backendSynchronized) {
        showToast?.('success', 'Client profile updated and synced to backend.')
      } else {
        showToast?.('success', 'Client profile updated.')
      }
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleIdentityImageUpload = (field, file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setIdentityDraft((prev) => ({ ...prev, [field]: String(reader.result || '') }))
    }
    reader.onerror = () => {
      showToast?.('error', 'Unable to read selected image file.')
    }
    reader.readAsDataURL(file)
  }

  const saveIdentityAssets = () => {
    if (!canEditClientSettings) {
      showToast?.('error', 'Insufficient Permissions')
      return
    }
    if (!normalizedEmail) return
    setIsSavingIdentityAssets(true)
    try {
      const nextProfilePhoto = toTrimmedValue(identityDraft.profilePhoto)
      const nextCompanyLogo = toTrimmedValue(identityDraft.companyLogo)
      if (nextProfilePhoto) writeScopedStorageString('profilePhoto', normalizedEmail, nextProfilePhoto)
      else removeScopedStorageValue('profilePhoto', normalizedEmail)
      if (nextCompanyLogo) writeScopedStorageString('companyLogo', normalizedEmail, nextCompanyLogo)
      else removeScopedStorageValue('companyLogo', normalizedEmail)

      const nextVerificationDocs = {
        ...getScopedStorageObject('verificationDocs', normalizedEmail),
        // govId: toTrimmedValue(identityDraft.govId),
        // govIdType: toTrimmedValue(identityDraft.govIdType),
        businessReg: toTrimmedValue(identityDraft.businessReg),
      }
      writeScopedStorageObject('verificationDocs', normalizedEmail, nextVerificationDocs)

      appendScopedClientActivityLog(normalizedEmail, {
        actorName: 'Admin User',
        actorRole: 'admin',
        action: 'Updated verification assets',
        details: 'Updated profile photo, company logo, or business verification document references.',
      })

      onAdminActionLog?.({
        action: 'Edited client verification assets',
        affectedUser: safeClient.businessName || normalizedEmail,
        details: 'Updated profile picture, company logo, and business verification asset metadata.',
      })

      const refreshed = readClientRows().find((row) => row.email === normalizedEmail)
      if (refreshed) setClientSnapshot(refreshed)
      setIsEditingIdentityAssets(false)
      showToast?.('success', 'Verification assets updated.')
    } finally {
      setIsSavingIdentityAssets(false)
    }
  }

  const profileFields = [
    ['Primary Contact', safeClient.primaryContact || settings.fullName],
    ['Work Email', safeClient.email || settings.email],
    ['Phone', settings.phone],
    ['Role in Company', settings.roleInCompany],
    ['Business Type', settings.businessType || onboardingData.businessType],
    ['Business Name', safeClient.businessName || settings.businessName || onboardingData.businessName],
    ['Country', safeClient.country || settings.country || onboardingData.country],
    ['Industry', settings.industry || onboardingData.industry],
    ['TIN', settings.tin || onboardingData.tin],
    ['Financial Year End', formatFinancialBoundaryDisplay(settings.reportingCycle || onboardingData.reportingCycle, 'end')],
    ['Financial Year Start', formatFinancialBoundaryDisplay(settings.startMonth || onboardingData.startMonth, 'start')],
    ['Currency', settings.currency || onboardingData.currency],
    ['Language', settings.language || onboardingData.language],
    ['Business Reg / CAC', settings.cacNumber || settings.businessReg || onboardingData.cacNumber || onboardingData.businessReg],
    ['Address Line 1', settings.address1],
    ['Address Line 2', settings.address2],
    ['City', settings.city],
    ['Postal Code', settings.postalCode],
    ['Address Country', settings.addressCountry],
  ]

  return (
    <div className="animate-fade-in">
      <AdminClientPageHeader
        client={safeClient}
        title="Client Profile"
        subtitle="Complete profile, onboarding, and compliance details for this client account."
        setActivePage={setActivePage}
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Compliance Status</p>
          <p className="text-lg font-semibold text-text-primary mt-1">{safeClient.verificationStatus || '--'}</p>
        </div>
        <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Onboarding Status</p>
          <p className="text-lg font-semibold text-text-primary mt-1">{safeClient.onboardingStatus || '--'}</p>
        </div>
        <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Subscription Status</p>
          <p className="text-lg font-semibold text-text-primary mt-1">{safeClient.subscriptionStatus || '--'}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light p-6 mb-6">
        <h3 className="text-base font-semibold text-text-primary">Compliance Control</h3>
        <p className="text-sm text-text-muted mt-1">Set this client to a compliance state.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Compliance State</label>
            <select
              value={verificationStatusDraft}
              onChange={(event) => setVerificationStatusDraft(event.target.value)}
              disabled={!canEditClientSettings}
              className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            >
              {COMPLIANCE_STATUS_OPTIONS.map((statusLabel) => (
                <option key={statusLabel} value={statusLabel}>{statusLabel}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-text-primary mb-1.5">Action Required Note (Optional)</label>
            <textarea
              value={suspensionMessage}
              onChange={(event) => setSuspensionMessage(event.target.value)}
              placeholder="Document the required action for this client."
              className="w-full h-20 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-primary resize-none"
              disabled={!canEditClientSettings || !isActionRequiredStatus(verificationStatusDraft)}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3">
          {/*
          <div className="rounded-md border border-border-light bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-text-muted">Identity Verification</p>
              <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-semibold ${identityVerificationApproved ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'}`}>
                {identityVerificationApproved ? 'Auto Verified' : 'Pending'}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-2">
              {hasIdentityDocumentSubmission
                ? 'Stage 2 is automatic. Identity is completed once ID checks pass.'
                : 'Waiting for Government ID type, card number, and ID image submission.'}
            </p>
          </div>
          */}
          <div className="rounded-md border border-border-light bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-text-muted">Business Verification</p>
              <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-semibold ${businessVerificationApproved ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'}`}>
                {businessVerificationApproved ? 'Approved' : 'Pending'}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-2">
              {hasBusinessDocumentSubmission
                ? 'Business registration document submitted.'
                : 'Waiting for business registration document.'}
            </p>
            <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="rounded-md border border-border-light bg-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Uploaded Document</p>
                <p className="text-sm text-text-primary mt-1 break-all">{businessVerificationDocumentName || '--'}</p>
                <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-text-muted">
                  <p>Uploaded: {hasIsoTimestamp(businessVerificationDocumentUploadedAt) ? formatTimestamp(businessVerificationDocumentUploadedAt) : '--'}</p>
                  <p>Size: {businessVerificationDocumentSizeLabel}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { void handleOpenBusinessVerificationDocument() }}
                    disabled={!hasBusinessDocumentSubmission || isOpeningBusinessDocument}
                    className="h-8 px-3 border border-border rounded-md text-xs font-medium text-text-primary hover:bg-background disabled:opacity-60"
                  >
                    {isOpeningBusinessDocument ? 'Opening...' : 'View Document'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleDownloadBusinessVerificationDocument() }}
                    disabled={!hasBusinessDocumentSubmission || isDownloadingBusinessDocument}
                    className="h-8 px-3 border border-border rounded-md text-xs font-medium text-text-primary hover:bg-background disabled:opacity-60"
                  >
                    {isDownloadingBusinessDocument ? 'Preparing...' : 'Download'}
                  </button>
                </div>
              </div>
              <div className="rounded-md border border-border-light bg-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Business Details (Settings Snapshot)</p>
                <div className="mt-2 grid grid-cols-1 gap-1.5">
                  {businessVerificationDetailRows.map(([label, value]) => (
                    <p key={label} className="text-xs text-text-secondary">
                      <span className="text-text-muted">{label}:</span> {value || '--'}
                    </p>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => saveBusinessVerificationApproval(true)}
                disabled={!canEditClientSettings || isSavingVerificationStatus || businessVerificationApproved || !hasBusinessDocumentSubmission}
                className="h-8 px-3 border border-success text-success rounded-md text-xs font-semibold hover:bg-success-bg transition-colors disabled:opacity-60"
              >
                Approve Business
              </button>
              <button
                type="button"
                onClick={() => saveBusinessVerificationApproval(false)}
                disabled={!canEditClientSettings || isSavingVerificationStatus || !businessVerificationApproved}
                className="h-8 px-3 border border-error text-error rounded-md text-xs font-semibold hover:bg-error-bg transition-colors disabled:opacity-60"
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => saveVerificationStatus(COMPLIANCE_STATUS.FULL)}
            disabled={!canEditClientSettings || isSavingVerificationStatus}
            className="h-10 px-4 mr-2 border border-success text-success rounded-md text-sm font-semibold hover:bg-success-bg transition-colors disabled:opacity-60"
          >
            Mark Full Compliance
          </button>
          <button
            type="button"
            onClick={saveVerificationStatus}
            disabled={!canEditClientSettings || isSavingVerificationStatus}
            className="h-10 px-4 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-60"
          >
            {isSavingVerificationStatus ? 'Saving...' : 'Save Compliance State'}
          </button>
        </div>
        {!canEditClientSettings && (
          <p className="text-xs text-text-muted mt-3">View-only mode. This role cannot edit client settings.</p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light p-6 mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Profile & Verification Assets</h3>
            <p className="text-sm text-text-muted mt-1">Manage client images and business verification document references.</p>
            {/* Previous title: Profile & Identity Assets */}
          </div>
          {!isEditingIdentityAssets && canEditClientSettings ? (
            <button
              type="button"
              onClick={() => setIsEditingIdentityAssets(true)}
              className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background inline-flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit Assets
            </button>
          ) : isEditingIdentityAssets && canEditClientSettings ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIdentityDraft({
                    profilePhoto: profilePhoto || '',
                    companyLogo: companyLogo || '',
                    // govId: verificationDocs.govId || '',
                    // govIdType: verificationDocs.govIdType || '',
                    businessReg: verificationDocs.businessReg || '',
                  })
                  setIsEditingIdentityAssets(false)
                }}
                className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveIdentityAssets}
                disabled={isSavingIdentityAssets}
                className="h-10 px-4 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-60"
              >
                {isSavingIdentityAssets ? 'Saving...' : 'Save Assets'}
              </button>
            </div>
          ) : (
            <span className="text-xs text-text-muted">View only</span>
          )}
        </div>

        {isEditingIdentityAssets && canEditClientSettings ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <div className="rounded-md border border-border-light bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Profile Picture</p>
                <div className="mt-3 w-24 h-24 rounded-full overflow-hidden border border-border-light bg-white flex items-center justify-center">
                  {identityDraft.profilePhoto ? (
                    <img src={identityDraft.profilePhoto} alt="Client Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-text-muted" />
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleIdentityImageUpload('profilePhoto', event.target.files?.[0])}
                    className="block w-full text-xs text-text-secondary"
                  />
                  <button
                    type="button"
                    onClick={() => setIdentityDraft((prev) => ({ ...prev, profilePhoto: '' }))}
                    className="h-8 px-2.5 border border-border rounded-md text-xs text-text-primary hover:bg-white"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="rounded-md border border-border-light bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Company Logo</p>
                <div className="mt-3 w-28 h-20 rounded border border-border-light bg-white p-2 flex items-center justify-center">
                  {identityDraft.companyLogo ? (
                    <img src={identityDraft.companyLogo} alt="Company Logo" className="w-full h-full object-contain" />
                  ) : (
                    <Building2 className="w-8 h-8 text-text-muted" />
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleIdentityImageUpload('companyLogo', event.target.files?.[0])}
                    className="block w-full text-xs text-text-secondary"
                  />
                  <button
                    type="button"
                    onClick={() => setIdentityDraft((prev) => ({ ...prev, companyLogo: '' }))}
                    className="h-8 px-2.5 border border-border rounded-md text-xs text-text-primary hover:bg-white"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
            {/* Government-issued ID and Government ID Type inputs are intentionally commented out for now. */}
            <div className="grid grid-cols-1 mt-6">
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Business Registration Document</label>
                <input value={identityDraft.businessReg} onChange={(event) => setIdentityDraft((prev) => ({ ...prev, businessReg: event.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <div className="rounded-md border border-border-light bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Profile Picture</p>
                <div className="mt-3 w-24 h-24 rounded-full overflow-hidden border border-border-light bg-white flex items-center justify-center">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="Client Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-text-muted" />
                  )}
                </div>
              </div>
              <div className="rounded-md border border-border-light bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Company Logo</p>
                <div className="mt-3 w-28 h-20 rounded border border-border-light bg-white p-2 flex items-center justify-center">
                  {companyLogo ? (
                    <img src={companyLogo} alt="Company Logo" className="w-full h-full object-contain" />
                  ) : (
                    <Building2 className="w-8 h-8 text-text-muted" />
                  )}
                </div>
              </div>
            </div>
            {/* Government-issued ID and Government ID Type display cards are intentionally commented out for now. */}
            <div className="grid grid-cols-1 mt-6">
              {[
                ['Business Registration Document', verificationDocs.businessReg],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-border-light bg-background px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
                  <p className="text-sm text-text-primary mt-1">{value || '--'}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light p-6 mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Client Information</h3>
            <p className="text-sm text-text-muted mt-1">Edit client profile and business metadata from here.</p>
          </div>
          {!isEditingProfile && canEditClientSettings ? (
            <button
              type="button"
              onClick={() => setIsEditingProfile(true)}
              className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background inline-flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit Profile
            </button>
          ) : isEditingProfile && canEditClientSettings ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setProfileDraft({
                    primaryContact: safeClient?.primaryContact || settings.fullName || '',
                    businessName: safeClient?.businessName || settings.businessName || onboardingData.businessName || '',
                    businessType: safeClient?.businessType || settings.businessType || onboardingData.businessType || '',
                    phoneCountryCode: resolvePhoneParts(settings.phone || '').code,
                    phone: resolvePhoneParts(settings.phone || '').number,
                    roleInCompany: settings.roleInCompany || '',
                    country: safeClient?.country || settings.country || onboardingData.country || '',
                    industry: settings.industry || onboardingData.industry || '',
                    tin: settings.tin || onboardingData.tin || '',
                    reportingCycle: normalizeFinancialBoundaryDate(settings.reportingCycle || onboardingData.reportingCycle || '', 'end'),
                    startMonth: normalizeFinancialBoundaryDate(settings.startMonth || onboardingData.startMonth || '', 'start'),
                    currency: settings.currency || onboardingData.currency || 'NGN',
                    language: settings.language || onboardingData.language || 'English',
                    businessReg: settings.cacNumber || settings.businessReg || onboardingData.cacNumber || onboardingData.businessReg || '',
                    address1: settings.address1 || '',
                    address2: settings.address2 || '',
                    city: settings.city || '',
                    postalCode: settings.postalCode || '',
                    addressCountry: settings.addressCountry || settings.country || onboardingData.country || '',
                  })
                  setIsEditingProfile(false)
                }}
                className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveProfileChanges}
                disabled={isSavingProfile}
                className="h-10 px-4 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-60"
              >
                {isSavingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          ) : (
            <span className="text-xs text-text-muted">View only</span>
          )}
        </div>

        {isEditingProfile && canEditClientSettings ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Primary Contact</label>
              <input value={profileDraft.primaryContact} onChange={(event) => setProfileDraft((prev) => ({ ...prev, primaryContact: event.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Business Name</label>
              <input value={profileDraft.businessName} onChange={(event) => setProfileDraft((prev) => ({ ...prev, businessName: event.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Business Type</label>
              <select
                value={profileDraft.businessType}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, businessType: event.target.value }))}
                className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary bg-white"
              >
                <option value="">Select business type</option>
                <option value="Business">Business</option>
                <option value="Non-Profit">Non-Profit</option>
                <option value="Individual">Individual</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Work Email</label>
              <input value={safeClient.email || ''} disabled className="w-full h-10 px-3 border border-border rounded-md text-sm bg-background text-text-muted" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Phone</label>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <select
                  value={profileDraft.phoneCountryCode || '+234'}
                  onChange={(event) => setProfileDraft((prev) => ({ ...prev, phoneCountryCode: event.target.value }))}
                  className="h-10 px-2 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                >
                  {PHONE_COUNTRY_CODE_OPTIONS.map((countryCode) => (
                    <option key={countryCode} value={countryCode}>{countryCode}</option>
                  ))}
                </select>
                <input
                  value={profileDraft.phone}
                  onChange={(event) => setProfileDraft((prev) => ({ ...prev, phone: event.target.value }))}
                  className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Role in Company</label>
              <input value={profileDraft.roleInCompany} onChange={(event) => setProfileDraft((prev) => ({ ...prev, roleInCompany: event.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Country</label>
              <input value={profileDraft.country} onChange={(event) => setProfileDraft((prev) => ({ ...prev, country: event.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Industry</label>
              <input value={profileDraft.industry} onChange={(event) => setProfileDraft((prev) => ({ ...prev, industry: event.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">TIN</label>
              <input value={profileDraft.tin} onChange={(event) => setProfileDraft((prev) => ({ ...prev, tin: event.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Business Reg / CAC</label>
              <input
                value={profileDraft.businessReg}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, businessReg: event.target.value }))}
                disabled={String(profileDraft.businessType || '').trim().toLowerCase() === 'individual'}
                className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary disabled:bg-background disabled:text-text-muted"
              />
              {String(profileDraft.businessType || '').trim().toLowerCase() === 'individual' && (
                <p className="text-[11px] text-text-muted mt-1">Not required for Individual business type.</p>
              )}
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Financial Year End</label>
              <select
                value={getFinancialBoundaryMonth(profileDraft.reportingCycle)}
                onChange={(event) => {
                  const normalized = normalizeFinancialBoundaryDate(event.target.value, 'end')
                  setProfileDraft((prev) => ({ ...prev, reportingCycle: normalized }))
                }}
                className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Select month</option>
                {FINANCIAL_MONTH_OPTIONS.map((option) => (
                  <option key={`admin-fy-end-${option.value}`} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-text-muted mt-1">Always saved as the last day of the selected month.</p>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Financial Year Start</label>
              <select
                value={getFinancialBoundaryMonth(profileDraft.startMonth)}
                onChange={(event) => {
                  const normalized = normalizeFinancialBoundaryDate(event.target.value, 'start')
                  setProfileDraft((prev) => ({ ...prev, startMonth: normalized }))
                }}
                className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Select month</option>
                {FINANCIAL_MONTH_OPTIONS.map((option) => (
                  <option key={`admin-fy-start-${option.value}`} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-text-muted mt-1">Always saved as the first day of the selected month.</p>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Currency</label>
              <input value={profileDraft.currency} onChange={(event) => setProfileDraft((prev) => ({ ...prev, currency: event.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Language</label>
              <input value={profileDraft.language} onChange={(event) => setProfileDraft((prev) => ({ ...prev, language: event.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Address Line 1</label>
              <input value={profileDraft.address1} onChange={(event) => setProfileDraft((prev) => ({ ...prev, address1: event.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Address Line 2</label>
              <input value={profileDraft.address2} onChange={(event) => setProfileDraft((prev) => ({ ...prev, address2: event.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">City</label>
              <input value={profileDraft.city} onChange={(event) => setProfileDraft((prev) => ({ ...prev, city: event.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Postal Code</label>
              <input value={profileDraft.postalCode} onChange={(event) => setProfileDraft((prev) => ({ ...prev, postalCode: event.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-text-muted mb-1">Address Country</label>
              <input value={profileDraft.addressCountry} onChange={(event) => setProfileDraft((prev) => ({ ...prev, addressCountry: event.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
            {profileFields.map(([label, value]) => (
              <div key={label} className="rounded-md border border-border-light bg-background px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
                <p className="text-sm text-text-primary mt-1">{value || '--'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light p-6 mb-6">
        <h3 className="text-base font-semibold text-text-primary">Notification Preferences</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
          {[
            ['New Upload Alerts', notificationSettings.newUploads],
            ['Approval Alerts', notificationSettings.approvals],
            ['Weekly Summary', notificationSettings.weeklySummary],
            ['Compliance Alerts', notificationSettings.compliance],
            ['Security Alerts', notificationSettings.security],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-border-light bg-background px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
              <p className={`text-sm font-medium mt-1 ${value ? 'text-success' : 'text-text-secondary'}`}>
                {value ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-text-primary">Client Activity Logs</h3>
          <p className="text-xs text-text-muted">Auditable timeline of this client&apos;s activity.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F9FAFB]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Details</th>
              </tr>
            </thead>
            <tbody>
              {clientLogs.map((log) => (
                <tr key={log.id} className="border-t border-border-light hover:bg-[#F9FAFB]">
                  <td className="px-4 py-3.5 text-sm text-text-secondary">{log.timestamp}</td>
                  <td className="px-4 py-3.5 text-sm text-text-primary">{log.actorName}</td>
                  <td className="px-4 py-3.5 text-sm text-text-secondary uppercase">{log.actorRole}</td>
                  <td className="px-4 py-3.5 text-sm font-medium text-text-primary">{log.action}</td>
                  <td className="px-4 py-3.5 text-sm text-text-secondary">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function AdminClientDocumentsPage({ client, setActivePage, showToast, onAdminActionLog, currentAdminAccount }) {
  const [activeCategory, setActiveCategory] = useState('expenses')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')
  const [documentBundle, setDocumentBundle] = useState(() => readClientDocumentBundle(client))
  const safeClient = client || null
  const resolvedAdminAccount = normalizeAdminAccount({
    role: 'admin',
    ...currentAdminAccount,
  })
  const isSuperAdmin = resolvedAdminAccount.adminLevel === ADMIN_LEVELS.SUPER
  const canReviewDocuments = (
    isSuperAdmin
    || hasAdminPermission(resolvedAdminAccount, 'approve_documents')
    || hasAdminPermission(resolvedAdminAccount, 'reject_documents')
  )
  const canRequestInfo = isSuperAdmin || hasAdminPermission(resolvedAdminAccount, 'request_info_documents')
  const isClientFullyVerified = isClientFullyVerifiedForDocumentReview(safeClient?.email || '')

  useEffect(() => {
    if (!safeClient) return
    setDocumentBundle(readClientDocumentBundle(safeClient))
  }, [safeClient?.email, safeClient?.id])

  if (!safeClient) {
    return (
      <div className="bg-white rounded-lg shadow-card border border-border-light p-8">
        <p className="text-sm text-text-secondary">Select a client from Client Management to view client documents.</p>
        <button
          type="button"
          onClick={() => setActivePage?.('admin-clients')}
          className="mt-4 h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light"
        >
          Return to Client Management
        </button>
      </div>
    )
  }
  if (!canAdminAccessClientScope(resolvedAdminAccount, safeClient.email)) {
    return (
      <div className="bg-white rounded-lg shadow-card border border-border-light p-8">
        <p className="text-sm text-text-secondary">You do not have access to this client document vault.</p>
        <button
          type="button"
          onClick={() => setActivePage?.('admin-clients')}
          className="mt-4 h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light"
        >
          Return to Client Management
        </button>
      </div>
    )
  }

  const canUnlockApproved = isSuperAdmin
  const adminActorName = currentAdminAccount?.fullName || 'Admin User'
  const documents = documentBundle
  const recordsByCategory = {
    expenses: flattenDocumentRows(documents.expenses || []),
    sales: flattenDocumentRows(documents.sales || []),
    'bank-statements': flattenDocumentRows(documents.bankStatements || []),
  }
  const activeRows = recordsByCategory[activeCategory] || []

  const filteredRows = activeRows
    .filter((row) => {
      const filename = row.filename || ''
      const fileId = row.fileId || ''
      const user = row.user || ''
      const extension = (row.extension || row.type || filename.split('.').pop() || '').toUpperCase()
      const matchesSearch = [filename, fileId, user].join(' ').toLowerCase().includes(searchTerm.trim().toLowerCase())
      const matchesStatus = !filterStatus || normalizeDocumentReviewStatus(row.status || DOCUMENT_REVIEW_STATUS.PENDING_REVIEW) === filterStatus
      const matchesType = !filterType || extension === filterType
      return matchesSearch && matchesStatus && matchesType
    })
    .sort((left, right) => {
      if (sortBy === 'alphabetical') {
        const compareValue = (left.filename || '').localeCompare(right.filename || '')
        return sortOrder === 'asc' ? compareValue : -compareValue
      }
      const compareValue = toTimestamp(left.date) - toTimestamp(right.date)
      return sortOrder === 'asc' ? compareValue : -compareValue
    })

  const categoryTabs = [
    { id: 'expenses', label: 'Expenses', count: recordsByCategory.expenses.length },
    { id: 'sales', label: 'Sales', count: recordsByCategory.sales.length },
    { id: 'bank-statements', label: 'Bank Statements', count: recordsByCategory['bank-statements'].length },
  ]
  const statusOptions = [
    DOCUMENT_REVIEW_STATUS.PENDING_REVIEW,
    DOCUMENT_REVIEW_STATUS.APPROVED,
    DOCUMENT_REVIEW_STATUS.REJECTED,
    DOCUMENT_REVIEW_STATUS.INFO_REQUESTED,
  ]
  const typeOptions = [...new Set(activeRows.map((row) => (row.extension || row.type || row.filename?.split('.').pop() || '').toUpperCase()).filter(Boolean))]

  const clearFilters = () => {
    setSearchTerm('')
    setFilterStatus('')
    setFilterType('')
  }

  const handleDocumentStatusChange = async (row, nextStatus) => {
    if (!canReviewDocuments) {
      showToast?.('error', 'Insufficient Permissions')
      return
    }
    const currentStatus = normalizeDocumentReviewStatus(row.status || DOCUMENT_REVIEW_STATUS.PENDING_REVIEW)
    const normalizedNextStatus = normalizeDocumentReviewStatus(nextStatus, DOCUMENT_REVIEW_STATUS.PENDING_REVIEW)
    if (
      normalizedNextStatus === DOCUMENT_REVIEW_STATUS.INFO_REQUESTED
      && !canRequestInfo
    ) {
      showToast?.('error', 'Insufficient Permissions')
      return
    }
    if (normalizedNextStatus === currentStatus) return
    if (
      requiresClientFullVerificationForReviewDecision(normalizedNextStatus)
      && !isClientFullyVerified
    ) {
      showToast?.('error', CLIENT_VERIFICATION_LOCK_MESSAGE)
      return
    }

    let notes = row.notes || ''
    let unlockReason = ''
    if (
      currentStatus === DOCUMENT_REVIEW_STATUS.APPROVED
      && normalizedNextStatus === DOCUMENT_REVIEW_STATUS.PENDING_REVIEW
    ) {
      if (!canUnlockApproved) {
        showToast?.('error', 'Only a super admin can unlock an approved file.')
        return
      }
      const input = window.prompt('Provide unlock reason (required)', '')
      if (input === null) return
      if (!input.trim()) {
        showToast?.('error', 'Unlock reason is required.')
        return
      }
      unlockReason = input.trim()
    }
    if (normalizedNextStatus === DOCUMENT_REVIEW_STATUS.REJECTED || normalizedNextStatus === DOCUMENT_REVIEW_STATUS.INFO_REQUESTED) {
      const promptMessage = normalizedNextStatus === DOCUMENT_REVIEW_STATUS.REJECTED
        ? 'Provide rejection reason'
        : 'Provide information request message'
      const input = window.prompt(promptMessage, notes || '')
      if (input === null) return
      if (!input.trim()) {
        showToast?.('error', 'Please provide a message for this status change.')
        return
      }
      notes = input.trim()
    }

    const bucket = CATEGORY_BUCKET_CONFIG[activeCategory]?.bundleKey || 'expenses'
    const reviewDocument = normalizeReviewDocumentRow(safeClient, bucket, row, 0)
    const updateResult = updateClientDocumentReviewStatus(reviewDocument, normalizedNextStatus, notes, {
      performedBy: adminActorName,
      unlockReason,
    })
    if (!updateResult?.bundle) {
      showToast?.(
        'error',
        requiresClientFullVerificationForReviewDecision(normalizedNextStatus)
          ? CLIENT_VERIFICATION_LOCK_MESSAGE
          : 'Unable to update document status.',
      )
      return
    }

    setDocumentBundle(updateResult.bundle)
    const syncResult = await persistAdminClientWorkspaceArtifacts({
      client: safeClient,
      documents: updateResult.bundle,
      activityLog: updateResult.activityLog,
    })
    if (!syncResult.ok && !syncResult.skipped) {
      showToast?.('error', syncResult?.data?.message || 'Document status updated locally, but backend sync failed.')
    }
    onAdminActionLog?.({
      action: 'Reviewed client document',
      affectedUser: safeClient.businessName,
      details: `${row.filename} set to ${normalizedNextStatus}.${unlockReason ? ` Unlock reason: ${unlockReason}.` : ''}`,
    })
    showToast?.('success', `Document status updated to ${normalizedNextStatus}.`)
  }

  return (
    <div className="animate-fade-in">
      <AdminClientPageHeader
        client={safeClient}
        title="Client Documents"
        subtitle="Client-specific documents grouped by expense, sales, and bank statements."
        setActivePage={setActivePage}
      />

      <div className="bg-white rounded-lg shadow-card border border-border-light p-4 mb-6">
        <div className="flex items-center gap-3">
          {categoryTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveCategory(tab.id)}
              className={`h-10 px-4 rounded-md text-sm font-medium transition-colors ${activeCategory === tab.id ? 'bg-primary text-white' : 'bg-background text-text-secondary hover:text-text-primary'}`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by file name, file ID, or uploader..."
              className="w-full h-10 pl-9 pr-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
            className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All Status</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(event) => setFilterType(event.target.value)}
            className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All Types</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="date">Sort by Date</option>
            <option value="alphabetical">Sort Alphabetical</option>
          </select>
          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="h-10 px-3 border border-border rounded-md text-sm text-text-primary hover:bg-background"
          >
            {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
          </button>
          {(searchTerm || filterStatus || filterType) && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-10 px-3 text-sm text-error hover:bg-error-bg rounded-md"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light overflow-hidden">
        {!canReviewDocuments && (
          <div className="px-4 py-3 border-b border-border-light bg-[#FCFDFF] text-xs text-text-muted">
            View-only mode. This role can review document details but cannot change review status.
          </div>
        )}
        {!isClientFullyVerified && (
          <div className="px-4 py-3 border-b border-border-light bg-warning-bg text-xs text-warning">
            {CLIENT_VERIFICATION_LOCK_MESSAGE}
          </div>
        )}
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">File Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">File ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Uploaded By</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Review State</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
                  No documents found for this category.
                </td>
              </tr>
            )}
            {filteredRows.map((row) => {
              const normalizedStatus = normalizeDocumentReviewStatus(row.status || DOCUMENT_REVIEW_STATUS.PENDING_REVIEW)
              return (
              <tr key={row.id} className="border-t border-border-light hover:bg-[#F9FAFB]">
                <td className="px-4 py-3.5 text-sm text-text-primary font-medium">{row.filename || '--'}</td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{row.fileId || '--'}</td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{(row.extension || row.type || row.filename?.split('.').pop() || '--').toUpperCase()}</td>
                <td className="px-4 py-3.5 text-sm text-text-primary">{row.user || '--'}</td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{row.date || '--'}</td>
                <td className="px-4 py-3.5 text-sm">
                  <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${
                    normalizedStatus === DOCUMENT_REVIEW_STATUS.APPROVED
                      ? 'bg-success-bg text-success'
                      : normalizedStatus === DOCUMENT_REVIEW_STATUS.REJECTED
                        ? 'bg-error-bg text-error'
                        : normalizedStatus === DOCUMENT_REVIEW_STATUS.INFO_REQUESTED
                          ? 'bg-info-bg text-primary'
                        : 'bg-warning-bg text-warning'
                  }`}>
                    {normalizedStatus}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-sm">
                  <select
                    value={normalizedStatus}
                    onChange={(event) => handleDocumentStatusChange(row, event.target.value)}
                    disabled={!canReviewDocuments}
                    className="h-8 px-2.5 border border-border rounded-md text-xs focus:outline-none focus:border-primary"
                  >
                    <option value={DOCUMENT_REVIEW_STATUS.PENDING_REVIEW}>Pending Review</option>
                    <option value={DOCUMENT_REVIEW_STATUS.APPROVED} disabled={!isClientFullyVerified}>Approved</option>
                    <option value={DOCUMENT_REVIEW_STATUS.REJECTED} disabled={!isClientFullyVerified}>Rejected</option>
                    <option value={DOCUMENT_REVIEW_STATUS.INFO_REQUESTED} disabled={!canRequestInfo || !isClientFullyVerified}>Info Requested</option>
                  </select>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AdminClientUploadHistoryPage({ client, setActivePage, currentAdminAccount }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')
  const resolvedAdminAccount = normalizeAdminAccount({
    role: 'admin',
    ...currentAdminAccount,
  })

  if (!client) {
    return (
      <div className="bg-white rounded-lg shadow-card border border-border-light p-8">
        <p className="text-sm text-text-secondary">Select a client from Client Management to view upload history.</p>
        <button
          type="button"
          onClick={() => setActivePage?.('admin-clients')}
          className="mt-4 h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light"
        >
          Return to Client Management
        </button>
      </div>
    )
  }
  if (!canAdminAccessClientScope(resolvedAdminAccount, client.email)) {
    return (
      <div className="bg-white rounded-lg shadow-card border border-border-light p-8">
        <p className="text-sm text-text-secondary">You do not have access to this client upload history.</p>
        <button
          type="button"
          onClick={() => setActivePage?.('admin-clients')}
          className="mt-4 h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light"
        >
          Return to Client Management
        </button>
      </div>
    )
  }

  const documents = readClientDocumentBundle(client)
  const records = documents.uploadHistory || []
  const typeOptions = [...new Set(records.map((row) => (row.type || row.extension || row.filename?.split('.').pop() || '').toUpperCase()).filter(Boolean))]

  const filteredRows = records
    .filter((row) => {
      const dateText = row.date || ''
      const typeText = (row.type || row.extension || row.filename?.split('.').pop() || '').toUpperCase()
      const matchesSearch = `${row.filename || ''} ${row.user || ''}`.toLowerCase().includes(searchTerm.trim().toLowerCase())
      const matchesDate = !filterDate || dateText.includes(filterDate)
      const matchesType = !filterType || typeText === filterType
      const matchesCategory = !filterCategory || row.category === filterCategory
      return matchesSearch && matchesDate && matchesType && matchesCategory
    })
    .sort((left, right) => {
      if (sortBy === 'name') {
        const compareValue = (left.filename || '').localeCompare(right.filename || '')
        return sortOrder === 'asc' ? compareValue : -compareValue
      }
      const compareValue = toTimestamp(left.date) - toTimestamp(right.date)
      return sortOrder === 'asc' ? compareValue : -compareValue
    })

  const clearFilters = () => {
    setSearchTerm('')
    setFilterDate('')
    setFilterType('')
    setFilterCategory('')
  }

  return (
    <div className="animate-fade-in">
      <AdminClientPageHeader
        client={client}
        title="Client Upload History"
        subtitle="Historical upload timeline for this client account."
        setActivePage={setActivePage}
      />

      <div className="bg-white rounded-lg shadow-card border border-border-light p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by file name or uploader..."
              className="w-full h-10 pl-9 pr-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <input
            type="date"
            value={filterDate}
            onChange={(event) => setFilterDate(event.target.value)}
            className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          />
          <select
            value={filterType}
            onChange={(event) => setFilterType(event.target.value)}
            className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All Types</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={(event) => setFilterCategory(event.target.value)}
            className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All Categories</option>
            <option value="Expense">Expenses</option>
            <option value="Sales">Sales</option>
            <option value="Bank Statement">Bank Statement</option>
          </select>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
          </select>
          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="h-10 px-3 border border-border rounded-md text-sm text-text-primary hover:bg-background"
          >
            {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
          </button>
          {(searchTerm || filterDate || filterType || filterCategory) && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-10 px-3 text-sm text-error hover:bg-error-bg rounded-md"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">File Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Upload Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Uploaded By</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                  No upload history found.
                </td>
              </tr>
            )}
            {filteredRows.map((row) => {
              const normalizedStatus = normalizeDocumentReviewStatus(row.status || DOCUMENT_REVIEW_STATUS.PENDING_REVIEW)
              return (
              <tr key={row.id} className="border-t border-border-light hover:bg-[#F9FAFB]">
                <td className="px-4 py-3.5 text-sm text-text-primary font-medium">{row.filename || '--'}</td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{(row.type || row.extension || row.filename?.split('.').pop() || '--').toUpperCase()}</td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{row.category || '--'}</td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{row.date || '--'}</td>
                <td className="px-4 py-3.5 text-sm text-text-primary">{row.user || '--'}</td>
                <td className="px-4 py-3.5 text-sm">
                  <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${
                    normalizedStatus === DOCUMENT_REVIEW_STATUS.APPROVED
                      ? 'bg-success-bg text-success'
                      : normalizedStatus === DOCUMENT_REVIEW_STATUS.REJECTED
                        ? 'bg-error-bg text-error'
                        : normalizedStatus === DOCUMENT_REVIEW_STATUS.INFO_REQUESTED
                          ? 'bg-info-bg text-primary'
                        : 'bg-warning-bg text-warning'
                  }`}>
                    {normalizedStatus}
                  </span>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AdminClientResolvedDocumentsPage({
  client,
  setActivePage,
  showToast,
  onAdminActionLog,
  currentAdminAccount,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [records, setRecords] = useState(() => readClientDocumentBundle(client).resolvedDocuments || [])
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [ticketReference, setTicketReference] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [signatureName, setSignatureName] = useState(String(currentAdminAccount?.fullName || 'Admin User').trim() || 'Admin User')
  const [signatureAppliedAtIso, setSignatureAppliedAtIso] = useState('')
  const [isSending, setIsSending] = useState(false)
  const resolvedAdminAccount = normalizeAdminAccount({
    role: 'admin',
    ...currentAdminAccount,
  })
  const isSuperAdmin = resolvedAdminAccount.adminLevel === ADMIN_LEVELS.SUPER
  const canViewDocuments = isSuperAdmin || hasAdminPermission(resolvedAdminAccount, 'view_documents')
  const canUploadResolvedDocuments = isOperationsAdminLevel(resolvedAdminAccount.adminLevel)
  const safeClient = client || null
  const normalizedClientEmail = String(safeClient?.email || '').trim().toLowerCase()
  const adminDisplayName = String(resolvedAdminAccount.fullName || 'Admin User').trim() || 'Admin User'
  const adminDisplayEmail = String(resolvedAdminAccount.email || '').trim().toLowerCase()

  useEffect(() => {
    if (!safeClient) {
      setRecords([])
      return
    }
    setRecords(readClientDocumentBundle(safeClient).resolvedDocuments || [])
  }, [safeClient, normalizedClientEmail])

  useEffect(() => {
    if (signatureName) return
    setSignatureName(adminDisplayName)
  }, [adminDisplayName, signatureName])

  if (!safeClient) {
    return (
      <div className="bg-white rounded-lg shadow-card border border-border-light p-8">
        <p className="text-sm text-text-secondary">Select a client from Client Management to deliver resolved documents.</p>
        <button
          type="button"
          onClick={() => setActivePage?.('admin-clients')}
          className="mt-4 h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light"
        >
          Return to Client Management
        </button>
      </div>
    )
  }
  if (!canAdminAccessClientScope(resolvedAdminAccount, safeClient.email)) {
    return (
      <div className="bg-white rounded-lg shadow-card border border-border-light p-8">
        <p className="text-sm text-text-secondary">You do not have access to this client resolved document delivery page.</p>
        <button
          type="button"
          onClick={() => setActivePage?.('admin-clients')}
          className="mt-4 h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light"
        >
          Return to Client Management
        </button>
      </div>
    )
  }
  if (!canViewDocuments) {
    return (
      <div className="bg-white rounded-lg shadow-card border border-border-light p-8">
        <p className="text-sm text-text-secondary">Insufficient Permissions</p>
        <button
          type="button"
          onClick={() => setActivePage?.('admin-clients')}
          className="mt-4 h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light"
        >
          Return to Client Management
        </button>
      </div>
    )
  }

  const clearComposer = () => {
    setTitle('')
    setNotes('')
    setTicketReference('')
    setSelectedFile(null)
    setSignatureAppliedAtIso('')
  }

  const handleApplySignature = () => {
    if (!canUploadResolvedDocuments) {
      showToast?.('error', 'Only Owner Admin, Super Admin, and Accountant Admin can deliver resolved documents.')
      return
    }
    const normalizedSignature = String(signatureName || '').trim()
    if (!normalizedSignature) {
      showToast?.('error', 'Enter signature name before applying e-signature.')
      return
    }
    setSignatureName(normalizedSignature)
    setSignatureAppliedAtIso(new Date().toISOString())
    showToast?.('success', 'E-signature applied.')
  }

  const handleSendResolvedDocument = async () => {
    if (!canUploadResolvedDocuments) {
      showToast?.('error', 'Only Owner Admin, Super Admin, and Accountant Admin can deliver resolved documents.')
      return
    }
    if (isSending) return
    if (!selectedFile) {
      showToast?.('error', 'Select a file to send.')
      return
    }
    const normalizedTitle = String(title || '').trim()
    if (!normalizedTitle) {
      showToast?.('error', 'Document title is required.')
      return
    }
    const normalizedSignature = String(signatureName || '').trim()
    if (!normalizedSignature || !signatureAppliedAtIso) {
      showToast?.('error', 'Apply e-signature before sending.')
      return
    }

    setIsSending(true)
    try {
      const nowIso = new Date().toISOString()
      const fileId = `RSDOC-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      const fileCacheKey = buildFileCacheKey({
        ownerEmail: normalizedClientEmail,
        fileId,
      })
      if (!fileCacheKey) {
        showToast?.('error', 'Unable to create file cache key for this document.')
        return
      }
      const cached = await putCachedFileBlob(fileCacheKey, selectedFile, {
        filename: selectedFile.name,
        mimeType: selectedFile.type,
        size: selectedFile.size,
      })
      if (!cached) {
        showToast?.('error', 'Unable to cache this document for delivery.')
        return
      }

      const extension = normalizeDocumentType({
        filename: selectedFile.name,
        extension: selectedFile.name.split('.').pop() || '',
        type: selectedFile.type || '',
      })
      const record = {
        id: `RSD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        fileId,
        clientEmail: normalizedClientEmail,
        title: normalizedTitle,
        notes: String(notes || '').trim(),
        ticketReference: String(ticketReference || '').trim(),
        filename: selectedFile.name,
        extension,
        mimeType: selectedFile.type || 'application/octet-stream',
        size: Number(selectedFile.size || 0),
        fileCacheKey,
        status: 'sent',
        sentAtIso: nowIso,
        sentByName: adminDisplayName,
        sentByEmail: adminDisplayEmail,
        signatureName: normalizedSignature,
        signatureAtIso: signatureAppliedAtIso,
        signatureMode: 'typed',
      }
      const bundle = readClientDocumentBundle(safeClient)
      const nextRows = [record, ...(Array.isArray(bundle.resolvedDocuments) ? bundle.resolvedDocuments : []).filter((item) => item.id !== record.id)]
      const nextBundle = {
        ...bundle,
        resolvedDocuments: nextRows,
      }
      writeClientDocumentBundle(normalizedClientEmail, nextBundle)
      setRecords(nextRows)

      const nextActivityLog = appendScopedClientActivityLog(normalizedClientEmail, {
        actorName: adminDisplayName,
        actorRole: 'admin',
        action: 'Delivered resolved document',
        details: `${record.filename} was delivered to client with e-signature.`,
      })
      const syncResult = await persistAdminClientWorkspaceArtifacts({
        client: safeClient,
        documents: nextBundle,
        activityLog: nextActivityLog,
      })
      if (!syncResult.ok && !syncResult.skipped) {
        showToast?.('error', syncResult?.data?.message || 'Resolved document delivered locally, but backend sync failed.')
      }
      appendClientBriefNotificationsToStorage(normalizedClientEmail, [{
        id: `RSD-NOTIFY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: 'important',
        title: 'Resolved Document Available',
        message: `${record.title} is ready for download.`,
        priority: 'important',
        sentAtIso: nowIso,
        linkPage: 'resolved-documents',
        fileId: record.fileId,
        documentId: record.id,
      }])
      onAdminActionLog?.({
        action: 'Delivered resolved document',
        affectedUser: safeClient.businessName || safeClient.email || '--',
        details: `${record.filename} signed by ${record.signatureName} and sent to ${normalizedClientEmail}.`,
      })

      clearComposer()
      showToast?.('success', 'Resolved document sent to client successfully.')
    } finally {
      setIsSending(false)
    }
  }

  const handleAdminDownload = async (row = {}) => {
    const cacheKey = String(row.fileCacheKey || '').trim()
    if (!cacheKey) {
      showToast?.('error', 'Download is unavailable for this document.')
      return
    }
    const blob = await getCachedFileBlob(cacheKey)
    if (!(blob instanceof Blob)) {
      showToast?.('error', 'This file is no longer available for download.')
      return
    }
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = buildClientDownloadFilename({
      businessName: safeClient.businessName || '',
      fileName: row.filename || row.title || 'resolved-document',
    })
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  }

  const filteredRows = records
    .filter((row) => {
      const query = searchTerm.trim().toLowerCase()
      if (!query) return true
      return [
        row.title,
        row.filename,
        row.notes,
        row.ticketReference,
        row.sentByName,
        row.signatureName,
      ].join(' ').toLowerCase().includes(query)
    })
    .sort((left, right) => (
      (Date.parse(right.sentAtIso || '') || 0) - (Date.parse(left.sentAtIso || '') || 0)
    ))

  const totalDownloads = records.reduce((total, row) => total + Number(row.downloadCount || 0), 0)
  const selectedFileLabel = selectedFile
    ? `${selectedFile.name} (${Math.max(0, Math.round(Number(selectedFile.size || 0) / 1024))} KB)`
    : 'No file selected'

  return (
    <div className="animate-fade-in">
      <AdminClientPageHeader
        client={safeClient}
        title="Resolved Document Delivery"
        subtitle="Upload final resolved files, apply e-signature, and deliver to client."
        setActivePage={setActivePage}
      />

      <div className="bg-white rounded-lg shadow-card border border-border-light p-5 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Compose Delivery</h3>
            <p className="text-xs text-text-muted mt-1">A signed record will be available in the client&apos;s Resolved Documents section.</p>
          </div>
          <div className="rounded-md border border-border-light px-3 py-2 bg-background">
            <p className="text-[11px] uppercase tracking-wide text-text-muted">Client Downloads</p>
            <p className="text-sm font-semibold text-text-primary mt-1">{totalDownloads}</p>
          </div>
        </div>
        {!canUploadResolvedDocuments && (
          <div className="mt-4 rounded-md border border-warning/30 bg-warning-bg/40 px-3 py-2.5 text-sm text-text-secondary">
            Read-only mode: only Owner Admin, Super Admin, and Accountant Admin can upload resolved documents.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Document Title *</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Final VAT reconciliation report"
              disabled={!canUploadResolvedDocuments || isSending}
              className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Issue / Ticket Reference</label>
            <input
              type="text"
              value={ticketReference}
              onChange={(event) => setTicketReference(event.target.value)}
              placeholder="SUP-2026-0042"
              disabled={!canUploadResolvedDocuments || isSending}
              className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Resolution Notes</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Summary of the fix or reconciliation done for this client."
              disabled={!canUploadResolvedDocuments || isSending}
              className="w-full h-24 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Upload Final File *</label>
            <div className="rounded-md border border-border-light bg-background p-3">
              <input
                type="file"
                disabled={!canUploadResolvedDocuments || isSending}
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] || null
                  setSelectedFile(nextFile)
                  if (nextFile && !String(title || '').trim()) {
                    setTitle(String(nextFile.name || '').trim())
                  }
                }}
                className="block w-full text-sm text-text-primary file:mr-3 file:py-2 file:px-3 file:border file:border-border file:rounded-md file:text-xs file:font-semibold file:bg-white file:text-text-primary"
              />
              <p className="text-xs text-text-muted mt-2">{selectedFileLabel}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-border-light bg-[#FCFDFF] p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Admin E-Signature</h4>
              <p className="text-xs text-text-muted mt-1">Apply signature before sending this document to the client.</p>
            </div>
            {signatureAppliedAtIso && (
              <span className="inline-flex items-center h-6 px-2.5 rounded text-[11px] font-medium bg-success-bg text-success">
                Signed {formatTimestamp(signatureAppliedAtIso)}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="text"
              value={signatureName}
              onChange={(event) => {
                setSignatureName(event.target.value)
                setSignatureAppliedAtIso('')
              }}
              placeholder="Enter signer name"
              disabled={!canUploadResolvedDocuments || isSending}
              className="flex-1 min-w-[220px] h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={handleApplySignature}
              disabled={!canUploadResolvedDocuments || isSending}
              className="h-10 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light"
            >
              Apply E-Signature
            </button>
          </div>
          {signatureName && (
            <div className="mt-3 rounded-md border border-border-light bg-white px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-text-muted">Signature Preview</p>
              <p className="text-lg text-text-primary mt-1" style={{ fontFamily: '"Brush Script MT", "Segoe Script", cursive' }}>
                {signatureName}
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={clearComposer}
            disabled={isSending || !canUploadResolvedDocuments}
            className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background disabled:opacity-60"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => void handleSendResolvedDocument()}
            disabled={isSending || !canUploadResolvedDocuments}
            className="h-10 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light disabled:opacity-60 inline-flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {isSending ? 'Sending...' : 'Sign & Send to Client'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light p-4 mb-4">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search delivered documents..."
            className="w-full h-10 pl-9 pr-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Document</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Signed By</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Sent At</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Client Downloads</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                  No resolved documents delivered yet.
                </td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-t border-border-light hover:bg-[#F9FAFB]">
                <td className="px-4 py-3.5 text-sm">
                  <p className="font-medium text-text-primary">{row.title || row.filename || '--'}</p>
                  <p className="text-xs text-text-secondary mt-1">{row.filename || '--'}{row.ticketReference ? ` / ${row.ticketReference}` : ''}</p>
                  {row.notes && (
                    <p className="text-xs text-text-muted mt-1 truncate max-w-[30rem]">{row.notes}</p>
                  )}
                </td>
                <td className="px-4 py-3.5 text-sm text-text-primary">
                  <p>{row.signatureName || row.sentByName || '--'}</p>
                  <p className="text-xs text-text-muted mt-1">{formatTimestamp(row.signatureAtIso || row.sentAtIso)}</p>
                </td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{formatTimestamp(row.sentAtIso)}</td>
                <td className="px-4 py-3.5 text-sm text-text-primary">
                  {Number(row.downloadCount || 0)}
                  {row.lastDownloadedAtIso && (
                    <p className="text-xs text-text-muted mt-1">{formatTimestamp(row.lastDownloadedAtIso)}</p>
                  )}
                </td>
                <td className="px-4 py-3.5 text-sm">
                  <button
                    type="button"
                    onClick={() => void handleAdminDownload(row)}
                    className="h-8 px-3 border border-border rounded-md text-xs font-medium text-text-primary hover:bg-background inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Document Review Center with Preview Panel
function AdminDocumentReviewCenter({ showToast, currentAdminAccount, runWithSlowRuntimeWatch }) {
  const resolvedAdminAccount = normalizeAdminAccount({
    role: 'admin',
    ...currentAdminAccount,
  })
  const isSuperAdmin = resolvedAdminAccount.adminLevel === ADMIN_LEVELS.SUPER
  const canReviewDocuments = (
    isSuperAdmin
    || hasAdminPermission(resolvedAdminAccount, 'approve_documents')
    || hasAdminPermission(resolvedAdminAccount, 'reject_documents')
  )
  const canRequestInfo = isSuperAdmin || hasAdminPermission(resolvedAdminAccount, 'request_info_documents')
  const canCommentDocuments = isSuperAdmin || hasAdminPermission(resolvedAdminAccount, 'comment_documents')
  const currentAdminCommentId = (resolvedAdminAccount.email || resolvedAdminAccount.id || '').trim().toLowerCase()
  const [documents, setDocuments] = useState(() => readAllDocumentsForReview(resolvedAdminAccount))
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterCategory, setFilterCategory] = useState('All')
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')
  const [zoom, setZoom] = useState(100)
  const [showFullscreen, setShowFullscreen] = useState(false)
  const [comments, setComments] = useState({})
  const [newComment, setNewComment] = useState('')
  const [editingComment, setEditingComment] = useState(null)
  const [editedCommentText, setEditedCommentText] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectionModal, setShowRejectionModal] = useState(false)
  const [isProcessingReviewAction, setIsProcessingReviewAction] = useState(false)
  const [selectedDocumentPreview, setSelectedDocumentPreview] = useState(null)
  const [isSelectedDocumentPreviewLoading, setIsSelectedDocumentPreviewLoading] = useState(false)
  const [selectedDocumentPreviewError, setSelectedDocumentPreviewError] = useState('')
  const selectedDocumentPreviewCleanupRef = useRef({
    objectUrl: '',
    shouldRevoke: false,
  })
  const canUnlockApproved = isSuperAdmin
  const adminActorName = currentAdminAccount?.fullName || 'Admin User'
  const selectedDocumentClientFullyVerified = selectedDocument?.source?.clientEmail
    ? isClientFullyVerifiedForDocumentReview(selectedDocument.source.clientEmail)
    : true
  const selectedDocumentDecisionLocked = Boolean(selectedDocument?.source?.clientEmail) && !selectedDocumentClientFullyVerified

  useEffect(() => {
    let isDisposed = false
    const syncFromStorage = () => {
      const nextRows = readAllDocumentsForReview(resolvedAdminAccount)
      if (isDisposed) return
      setDocuments(nextRows)
      setSelectedDocument((prev) => {
        if (!prev) return prev
        return nextRows.find((item) => item.id === prev.id) || null
      })
    }
    const refreshDocuments = async () => {
      await refreshAdminClientRowsFromBackend()
      syncFromStorage()
    }
    void refreshDocuments()
    window.addEventListener('storage', syncFromStorage)
    window.addEventListener(ADMIN_CLIENT_MANAGEMENT_SYNC_EVENT, refreshDocuments)
    const intervalId = window.setInterval(syncFromStorage, 4000)
    return () => {
      isDisposed = true
      window.removeEventListener('storage', syncFromStorage)
      window.removeEventListener(ADMIN_CLIENT_MANAGEMENT_SYNC_EVENT, refreshDocuments)
      window.clearInterval(intervalId)
    }
  }, [resolvedAdminAccount.adminLevel, resolvedAdminAccount.email])

  const clearSelectedDocumentPreview = () => {
    const { objectUrl, shouldRevoke } = selectedDocumentPreviewCleanupRef.current || {}
    if (shouldRevoke && objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl)
      } catch {
        // ignore object-url cleanup failures
      }
    }
    selectedDocumentPreviewCleanupRef.current = {
      objectUrl: '',
      shouldRevoke: false,
    }
    setSelectedDocumentPreview(null)
    setSelectedDocumentPreviewError('')
    setIsSelectedDocumentPreviewLoading(false)
  }

  useEffect(() => () => {
    const { objectUrl, shouldRevoke } = selectedDocumentPreviewCleanupRef.current || {}
    if (shouldRevoke && objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl)
      } catch {
        // ignore object-url cleanup failures
      }
    }
  }, [])

  useEffect(() => {
    let isCancelled = false
    const loadSelectedDocumentPreview = async () => {
      clearSelectedDocumentPreview()
      if (!selectedDocument) return
      setIsSelectedDocumentPreviewLoading(true)
      const attachmentPayload = buildDocumentAttachmentPayload(selectedDocument)
      const previewResult = await buildSupportAttachmentPreview({
        name: attachmentPayload.name,
        type: attachmentPayload.type,
        size: attachmentPayload.size,
        cacheKey: attachmentPayload.cacheKey,
        previewDataUrl: attachmentPayload.previewDataUrl,
      })
      if (isCancelled) return

      if (previewResult.ok) {
        setSelectedDocumentPreview(previewResult)
        selectedDocumentPreviewCleanupRef.current = {
          objectUrl: previewResult.objectUrl || '',
          shouldRevoke: Boolean(previewResult.objectUrl),
        }
        setSelectedDocumentPreviewError(previewResult.message || '')
        setIsSelectedDocumentPreviewLoading(false)
        return
      }

      if (attachmentPayload.directPreviewUrl) {
        setSelectedDocumentPreview({
          ok: true,
          kind: getSupportAttachmentKind(attachmentPayload.type, attachmentPayload.name),
          name: attachmentPayload.name,
          type: attachmentPayload.type,
          size: attachmentPayload.size,
          objectUrl: attachmentPayload.directPreviewUrl,
          message: previewResult.message || '',
        })
        selectedDocumentPreviewCleanupRef.current = {
          objectUrl: '',
          shouldRevoke: false,
        }
        setSelectedDocumentPreviewError(previewResult.message || '')
        setIsSelectedDocumentPreviewLoading(false)
        return
      }

      setSelectedDocumentPreview(null)
      selectedDocumentPreviewCleanupRef.current = {
        objectUrl: '',
        shouldRevoke: false,
      }
      setSelectedDocumentPreviewError(previewResult.message || 'Preview is unavailable for this file.')
      setIsSelectedDocumentPreviewLoading(false)
    }

    void loadSelectedDocumentPreview()
    return () => {
      isCancelled = true
    }
  }, [
    selectedDocument?.id,
    selectedDocument?.previewUrl,
    selectedDocument?.fileCacheKey,
    selectedDocument?.fileId,
    selectedDocument?.source?.clientEmail,
    selectedDocument?.extension,
    selectedDocument?.filename,
    selectedDocument?.size,
    selectedDocument?.mimeType,
  ])

  const filteredDocuments = documents
    .filter((doc) => {
      const matchesSearch = (doc.filename || '').toLowerCase().includes(searchTerm.toLowerCase())
        || (doc.user || '').toLowerCase().includes(searchTerm.toLowerCase())
        || (doc.businessName || '').toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = filterStatus === 'All'
        || normalizeDocumentReviewStatus(doc.status || DOCUMENT_REVIEW_STATUS.PENDING_REVIEW) === filterStatus
      const matchesCategory = filterCategory === 'All' || doc.category === filterCategory
      return matchesSearch && matchesStatus && matchesCategory
    })
    .sort((left, right) => {
      if (sortBy === 'business') {
        const compareValue = (left.businessName || '').localeCompare(right.businessName || '')
        return sortOrder === 'asc' ? compareValue : -compareValue
      }
      if (sortBy === 'name') {
        const compareValue = (left.filename || '').localeCompare(right.filename || '')
        return sortOrder === 'asc' ? compareValue : -compareValue
      }
      const compareValue = toTimestamp(left.date) - toTimestamp(right.date)
      return sortOrder === 'asc' ? compareValue : -compareValue
    })

  const runReviewAction = async (work, message = 'Updating document status...') => {
    if (isProcessingReviewAction) return
    setIsProcessingReviewAction(true)
    const execute = async () => {
      await waitForNetworkAwareDelay('search')
      await work()
    }
    try {
      if (typeof runWithSlowRuntimeWatch === 'function') {
        await runWithSlowRuntimeWatch(execute, message)
      } else {
        await execute()
      }
    } finally {
      setIsProcessingReviewAction(false)
    }
  }

  const handleSelectDocument = (doc) => {
    clearSelectedDocumentPreview()
    setSelectedDocument(doc)
    setZoom(100)
    setShowFullscreen(false)
  }

  const handleClosePreview = () => {
    clearSelectedDocumentPreview()
    setSelectedDocument(null)
    setNewComment('')
    setEditingComment(null)
    setRejectionReason('')
    setShowFullscreen(false)
  }

  const handleAddComment = () => {
    if (!canCommentDocuments) {
      showToast('error', 'Insufficient Permissions')
      return
    }
    if (!newComment.trim() || !selectedDocument) return

    const comment = {
      id: `CMT-${Date.now()}`,
      adminId: currentAdminCommentId || resolvedAdminAccount.id || 'admin-user',
      adminName: resolvedAdminAccount.fullName || 'Admin User',
      adminRole: getAdminLevelLabel(resolvedAdminAccount.adminLevel),
      text: newComment.trim(),
      timestamp: new Date().toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }),
      isEdited: false,
    }

    setComments(prev => ({
      ...prev,
      [selectedDocument.id]: [...(prev[selectedDocument.id] || []), comment]
    }))
    setNewComment('')
    showToast('success', 'Comment posted successfully.')
  }

  const handleEditComment = (commentId) => {
    const docComments = comments[selectedDocument.id] || []
    const comment = docComments.find(c => c.id === commentId)
    if (comment && String(comment.adminId || '').trim().toLowerCase() === currentAdminCommentId) {
      setEditingComment(commentId)
      setEditedCommentText(comment.text)
    }
  }

  const handleSaveEdit = () => {
    if (!editingComment || !editedCommentText.trim()) return

    setComments(prev => ({
      ...prev,
      [selectedDocument.id]: prev[selectedDocument.id].map(c => 
        c.id === editingComment ? { ...c, text: editedCommentText.trim(), isEdited: true } : c
      )
    }))
    setEditingComment(null)
    setEditedCommentText('')
    showToast('success', 'Comment updated successfully.')
  }

  const handleDeleteComment = (commentId) => {
    const docComments = comments[selectedDocument.id] || []
    const comment = docComments.find(c => c.id === commentId)
    if (comment && String(comment.adminId || '').trim().toLowerCase() === currentAdminCommentId) {
      setComments(prev => ({
        ...prev,
        [selectedDocument.id]: prev[selectedDocument.id].filter(c => c.id !== commentId)
      }))
      showToast('success', 'Comment deleted successfully.')
    }
  }

  const applyReviewStatus = async (nextStatus, notes = '', options = {}) => {
    if (!selectedDocument) return false
    const normalizedNextStatus = normalizeDocumentReviewStatus(nextStatus, DOCUMENT_REVIEW_STATUS.PENDING_REVIEW)
    const updatedNote = notes || selectedDocument.notes || ''
    const unlockReason = toTrimmedValue(options?.unlockReason)
    const isDecisionStatus = requiresClientFullVerificationForReviewDecision(normalizedNextStatus)
    const selectedClientEmail = String(selectedDocument?.source?.clientEmail || '').trim().toLowerCase()
    if (
      isDecisionStatus
      && selectedClientEmail
      && !isClientFullyVerifiedForDocumentReview(selectedClientEmail)
    ) {
      showToast('error', CLIENT_VERIFICATION_LOCK_MESSAGE)
      return false
    }

    if (selectedDocument.source) {
      const updateResult = updateClientDocumentReviewStatus(selectedDocument, normalizedNextStatus, updatedNote, {
        performedBy: adminActorName,
        unlockReason,
      })
      if (!updateResult?.bundle) {
        showToast(
          'error',
          isDecisionStatus ? CLIENT_VERIFICATION_LOCK_MESSAGE : 'Unable to update document status.',
        )
        return false
      }
      const syncClient = readClientRows().find((row) => (
        String(row?.email || '').trim().toLowerCase() === selectedClientEmail
      )) || { email: selectedClientEmail, uid: selectedDocument?.source?.clientUid || '' }
      const syncResult = await persistAdminClientWorkspaceArtifacts({
        client: syncClient,
        documents: updateResult.bundle,
        activityLog: updateResult.activityLog,
      })
      if (!syncResult.ok && !syncResult.skipped) {
        showToast('error', syncResult?.data?.message || 'Document status updated locally, but backend sync failed.')
      }
      const nextRows = readAllDocumentsForReview(resolvedAdminAccount)
      setDocuments(nextRows)
      const nextSelected = nextRows.find((row) => row.id === selectedDocument.id)
      setSelectedDocument(nextSelected || null)
      return true
    }

    setDocuments((prev) => prev.map((row) => (
      row.id === selectedDocument.id ? { ...row, status: normalizedNextStatus, notes: updatedNote } : row
    )))
    setSelectedDocument((prev) => (prev ? { ...prev, status: normalizedNextStatus, notes: updatedNote } : prev))
    return true
  }

  const handleApprove = () => {
    if (!canReviewDocuments) {
      showToast('error', 'Insufficient Permissions')
      return
    }
    if (!selectedDocument) return
    void runReviewAction(() => {
      const didApply = applyReviewStatus(DOCUMENT_REVIEW_STATUS.APPROVED)
      if (!didApply) return
      showToast('success', 'Document approved successfully.')
    }, 'Approving document...')
  }

  const handleMarkPending = () => {
    if (!canReviewDocuments) {
      showToast('error', 'Insufficient Permissions')
      return
    }
    if (!selectedDocument) return
    const currentStatus = normalizeDocumentReviewStatus(selectedDocument.status || DOCUMENT_REVIEW_STATUS.PENDING_REVIEW)
    let unlockReason = ''
    if (currentStatus === DOCUMENT_REVIEW_STATUS.APPROVED) {
      if (!canUnlockApproved) {
        showToast('error', 'Only a super admin can unlock an approved file.')
        return
      }
      const input = window.prompt('Provide unlock reason (required)', '')
      if (input === null) return
      if (!input.trim()) {
        showToast('error', 'Unlock reason is required.')
        return
      }
      unlockReason = input.trim()
    }
    void runReviewAction(() => {
      const didApply = applyReviewStatus(DOCUMENT_REVIEW_STATUS.PENDING_REVIEW, selectedDocument.notes || '', { unlockReason })
      if (!didApply) return
      showToast('success', 'Document moved to pending review.')
    }, 'Moving file to pending review...')
  }

  const handleReject = () => {
    if (!canReviewDocuments) {
      showToast('error', 'Insufficient Permissions')
      return
    }
    if (!selectedDocument || !rejectionReason.trim()) return
    void runReviewAction(() => {
      const didApply = applyReviewStatus(DOCUMENT_REVIEW_STATUS.REJECTED, rejectionReason.trim())
      if (!didApply) return
      setShowRejectionModal(false)
      setRejectionReason('')
      showToast('success', 'Document rejected. User has been notified.')
    }, 'Rejecting document...')
  }

  const handleRequestInfo = () => {
    if (!canRequestInfo) {
      showToast('error', 'Insufficient Permissions')
      return
    }
    if (!selectedDocument) return
    const message = window.prompt('Provide an information request message', selectedDocument.notes || '')
    if (message === null) return
    if (!message.trim()) {
      showToast('error', 'Please provide a message for information request.')
      return
    }
    void runReviewAction(() => {
      const didApply = applyReviewStatus(DOCUMENT_REVIEW_STATUS.INFO_REQUESTED, message.trim())
      if (!didApply) return
      showToast('success', 'Information request sent to user.')
    }, 'Sending information request...')
  }

  const handleDownloadSelectedDocument = async () => {
    if (!selectedDocument) return
    const attachmentPayload = buildDocumentAttachmentPayload(selectedDocument)
    const downloadName = buildClientDownloadFilename({
      businessName: selectedDocument.businessName || '',
      fileName: selectedDocument.filename || attachmentPayload.name || 'document',
      fallbackFileName: 'document',
    })
    try {
      const blob = await getSupportAttachmentBlob({
        cacheKey: attachmentPayload.cacheKey,
        previewDataUrl: attachmentPayload.previewDataUrl,
      })
      if (blob instanceof Blob) {
        const objectUrl = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = objectUrl
        anchor.download = downloadName
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
        return
      }

      const directUrl = (
        selectedDocumentPreview?.objectUrl
        || attachmentPayload.directPreviewUrl
        || ''
      ).trim()
      if (!directUrl) {
        showToast('error', 'Download URL is not available for this file.')
        return
      }
      const anchor = document.createElement('a')
      anchor.href = directUrl
      anchor.download = downloadName
      anchor.rel = 'noreferrer'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch {
      showToast('error', 'Unable to download this file.')
    }
  }

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200))
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50))

  const getStatusStyle = (status) => {
    switch (normalizeDocumentReviewStatus(status, DOCUMENT_REVIEW_STATUS.PENDING_REVIEW)) {
      case DOCUMENT_REVIEW_STATUS.APPROVED: return 'bg-success-bg text-success'
      case DOCUMENT_REVIEW_STATUS.PENDING_REVIEW: return 'bg-warning-bg text-warning'
      case DOCUMENT_REVIEW_STATUS.REJECTED: return 'bg-error-bg text-error'
      case DOCUMENT_REVIEW_STATUS.INFO_REQUESTED: return 'bg-info-bg text-primary'
      default: return 'bg-border text-text-secondary'
    }
  }

  const getPriorityStyle = (priority) => {
    switch (priority) {
      case 'High': return 'text-error'
      case 'Low': return 'text-text-muted'
      default: return 'text-text-secondary'
    }
  }

  const previewKind = selectedDocumentPreview?.kind || ''
  const previewObjectUrl = selectedDocumentPreview?.objectUrl || ''
  const previewText = selectedDocumentPreview?.text || ''
  const previewRows = Array.isArray(selectedDocumentPreview?.rows) ? selectedDocumentPreview.rows : []
  const previewSheetName = selectedDocumentPreview?.sheetName || 'Sheet1'
  const previewIsTruncated = Boolean(selectedDocumentPreview?.truncated)
  const previewMessage = selectedDocumentPreview?.message || selectedDocumentPreviewError
  const showImagePreview = Boolean(previewObjectUrl) && previewKind === 'image'
  const showPdfPreview = Boolean(previewObjectUrl) && previewKind === 'pdf'
  const showVideoPreview = Boolean(previewObjectUrl) && previewKind === 'video'
  const showAudioPreview = Boolean(previewObjectUrl) && previewKind === 'audio'
  const showTextPreview = ['text', 'word', 'presentation'].includes(previewKind) && typeof previewText === 'string'
  const showSpreadsheetPreview = previewKind === 'spreadsheet' && Array.isArray(previewRows)
  const showGenericObjectPreview = Boolean(previewObjectUrl)
    && !showImagePreview
    && !showPdfPreview
    && !showVideoPreview
    && !showAudioPreview
  const shouldShowPreviewFallback = !isSelectedDocumentPreviewLoading
    && !showImagePreview
    && !showPdfPreview
    && !showVideoPreview
    && !showAudioPreview
    && !showTextPreview
    && !showSpreadsheetPreview
    && !showGenericObjectPreview

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-text-primary">Document Review Center</h2>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-card p-4 mb-6">
        <div className="flex flex-col xl:flex-row xl:items-center gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-10 pr-4 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
            <Filter className="hidden sm:block w-4 h-4 text-text-muted" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-10 w-full sm:w-auto px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            >
              <option value="All">All Status</option>
              <option value={DOCUMENT_REVIEW_STATUS.PENDING_REVIEW}>Pending Review</option>
              <option value={DOCUMENT_REVIEW_STATUS.APPROVED}>Approved</option>
              <option value={DOCUMENT_REVIEW_STATUS.REJECTED}>Rejected</option>
              <option value={DOCUMENT_REVIEW_STATUS.INFO_REQUESTED}>Info Requested</option>
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="h-10 w-full sm:w-auto px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            >
              <option value="All">All Categories</option>
              <option value="Expense">Expense</option>
              <option value="Sales">Sales</option>
              <option value="Bank Statement">Bank Statement</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-10 w-full sm:w-auto px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            >
              <option value="date">Sort by Date</option>
              <option value="business">Sort by Business</option>
              <option value="name">Sort by Document Name</option>
            </select>
            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="h-10 w-full sm:w-auto px-3 border border-border rounded-md text-sm text-text-primary hover:bg-background"
            >
              {sortOrder === 'desc' ? 'Desc' : 'Asc'}
            </button>
          </div>
        </div>
      </div>

      {/* Document List */}
      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="bg-[#F9FAFB]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Document</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Uploaded By</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Business</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
                  No documents found.
                </td>
              </tr>
            )}
            {filteredDocuments.map((doc) => (
              <tr 
                key={doc.id} 
                className={`border-b border-border-light hover:bg-[#F9FAFB] cursor-pointer ${selectedDocument?.id === doc.id ? 'bg-primary-tint' : ''}`}
                onClick={() => handleSelectDocument(doc)}
              >
                <td className="px-4 py-3.5 text-sm font-medium text-primary">{doc.filename}</td>
                <td className="px-4 py-3.5 text-sm">{doc.category}</td>
                <td className="px-4 py-3.5 text-sm">{doc.user}</td>
                <td className="px-4 py-3.5 text-sm">{doc.businessName}</td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{doc.date}</td>
                <td className="px-4 py-3.5 text-sm font-medium">{doc.priority}</td>
                <td className="px-4 py-3.5 text-sm">
                  <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${getStatusStyle(doc.status)}`}>
                    {normalizeDocumentReviewStatus(doc.status || DOCUMENT_REVIEW_STATUS.PENDING_REVIEW)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Document Preview Panel */}
      {selectedDocument && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border-light">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">Document Preview</h3>
                <p className="text-sm text-text-secondary">{selectedDocument.filename}</p>
              </div>
              <button onClick={handleClosePreview} className="p-2 hover:bg-background rounded-md transition-colors">
                <X className="w-5 h-5 text-text-secondary" />
              </button>
            </div>

            {/* Content */}
            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
              {/* Left: Document Viewer */}
              <div className="flex-1 bg-[#F9FAFB] p-6 overflow-auto">
                <div className="bg-white rounded-lg shadow-card p-4 min-h-[500px]">
                  <div className="h-full rounded-md border border-border-light bg-white overflow-auto">
                    {isSelectedDocumentPreviewLoading && (
                      <div className="h-full min-h-[420px] flex items-center justify-center">
                        <DotLottiePreloader size={180} label="Loading preview..." labelClassName="text-xs text-text-muted" />
                      </div>
                    )}
                    {!isSelectedDocumentPreviewLoading && showImagePreview && (
                      <div className="p-3 flex items-center justify-center min-h-[420px]">
                        <img
                          src={previewObjectUrl}
                          alt={selectedDocument.filename || 'Document preview'}
                          className="max-w-full max-h-[72vh] rounded-md border border-border-light"
                          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
                        />
                      </div>
                    )}
                    {!isSelectedDocumentPreviewLoading && showPdfPreview && (
                      <iframe
                        title={selectedDocument.filename || 'Document preview'}
                        src={previewObjectUrl}
                        className="w-full h-[72vh]"
                        style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
                      />
                    )}
                    {!isSelectedDocumentPreviewLoading && showVideoPreview && (
                      <div className="p-3">
                        <video controls src={previewObjectUrl} className="w-full max-h-[72vh] rounded-md border border-border-light bg-black" />
                      </div>
                    )}
                    {!isSelectedDocumentPreviewLoading && showAudioPreview && (
                      <div className="p-4">
                        <audio controls src={previewObjectUrl} className="w-full" />
                      </div>
                    )}
                    {!isSelectedDocumentPreviewLoading && showTextPreview && (
                      <pre
                        className="p-4 text-sm text-text-primary whitespace-pre-wrap break-words"
                        style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}
                      >
                        {previewText || '(No text content found)'}
                      </pre>
                    )}
                    {!isSelectedDocumentPreviewLoading && showSpreadsheetPreview && (
                      <div className="overflow-auto">
                        <div className="px-3 py-2 border-b border-border-light bg-background text-xs text-text-secondary">
                          Sheet: {previewSheetName}
                        </div>
                        {previewRows.length === 0 ? (
                          <div className="px-3 py-4 text-sm text-text-muted">No spreadsheet rows available.</div>
                        ) : (
                          <table className="min-w-full text-xs sm:text-sm">
                            <tbody>
                              {previewRows.map((row, rowIndex) => (
                                <tr key={`review-sheet-row-${rowIndex}`} className="border-b border-border-light">
                                  {row.map((cell, cellIndex) => (
                                    <td key={`review-sheet-cell-${rowIndex}-${cellIndex}`} className="px-2 py-1.5 text-text-primary align-top whitespace-pre-wrap break-words max-w-[240px]">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {previewIsTruncated && (
                          <div className="px-3 py-2 text-xs text-text-muted border-t border-border-light bg-background">
                            Preview truncated to the first rows.
                          </div>
                        )}
                      </div>
                    )}
                    {!isSelectedDocumentPreviewLoading && showGenericObjectPreview && (
                      <div className="p-4">
                        <p className="text-sm text-text-secondary">{previewMessage || 'Preview is limited for this file type.'}</p>
                        <a
                          href={previewObjectUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 text-primary hover:underline text-sm"
                        >
                          Open in new tab
                        </a>
                      </div>
                    )}
                    {shouldShowPreviewFallback && (
                      <div className="h-full min-h-[420px] flex items-center justify-center p-6">
                        <div className="text-center">
                          <FileText className="w-14 h-14 text-text-muted mx-auto mb-3" />
                          <p className="text-sm text-text-secondary">
                            {previewMessage || 'Preview is unavailable for this file type.'}
                          </p>
                          <button
                            type="button"
                            onClick={() => void handleDownloadSelectedDocument()}
                            className="mt-4 h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors inline-flex items-center gap-2"
                          >
                            <Download className="w-4 h-4" />
                            Download Document
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Metadata Panel */}
              <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border-light p-4 overflow-y-auto">
                <h4 className="text-sm font-semibold text-text-primary mb-4">Document Metadata</h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-text-muted uppercase tracking-wide">Document Name</label>
                    <p className="text-sm text-text-primary mt-1">{selectedDocument.filename}</p>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted uppercase tracking-wide">Category</label>
                    <p className="text-sm text-text-primary mt-1">{selectedDocument.category}</p>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted uppercase tracking-wide">Uploaded By</label>
                    <p className="text-sm text-text-primary mt-1">{selectedDocument.user}</p>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted uppercase tracking-wide">Business Name</label>
                    <p className="text-sm text-text-primary mt-1">{selectedDocument.businessName}</p>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted uppercase tracking-wide">Upload Date</label>
                    <p className="text-sm text-text-primary mt-1">{selectedDocument.date}</p>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted uppercase tracking-wide">Priority</label>
                    <p className={`text-sm font-medium mt-1 ${getPriorityStyle(selectedDocument.priority)}`}>{selectedDocument.priority}</p>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted uppercase tracking-wide">Status</label>
                    <p className="text-sm mt-1">
                      <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${getStatusStyle(selectedDocument.status)}`}>
                        {normalizeDocumentReviewStatus(selectedDocument.status || DOCUMENT_REVIEW_STATUS.PENDING_REVIEW)}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted uppercase tracking-wide">Confidentiality Level</label>
                    <p className="text-sm text-text-primary mt-1">{selectedDocument.confidentiality}</p>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted uppercase tracking-wide">Internal Notes</label>
                    <p className="text-sm text-text-secondary mt-1">{selectedDocument.notes || 'No notes'}</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 pt-4 border-t border-border-light space-y-2">
                  {!canReviewDocuments && (
                    <p className="text-xs text-text-muted mb-2">View-only mode. This role cannot approve, reject, or change review state.</p>
                  )}
                  {selectedDocumentDecisionLocked && (
                    <p className="text-xs text-warning mb-2">{CLIENT_VERIFICATION_LOCK_MESSAGE}</p>
                  )}
                  <div className="flex items-center gap-2 mb-4">
                    <button onClick={handleZoomOut} className="p-2 hover:bg-background rounded-md transition-colors" title="Zoom Out">
                      <ZoomOut className="w-4 h-4 text-text-secondary" />
                    </button>
                    <span className="text-sm text-text-secondary">{zoom}%</span>
                    <button onClick={handleZoomIn} className="p-2 hover:bg-background rounded-md transition-colors" title="Zoom In">
                      <ZoomIn className="w-4 h-4 text-text-secondary" />
                    </button>
                    <div className="flex-1"></div>
                    <button
                      type="button"
                      onClick={() => void handleDownloadSelectedDocument()}
                      className="p-2 hover:bg-background rounded-md transition-colors"
                      title="Download"
                    >
                      <Download className="w-4 h-4 text-text-secondary" />
                    </button>
                    <button onClick={() => setShowFullscreen(true)} className="p-2 hover:bg-background rounded-md transition-colors" title="Fullscreen">
                      <Maximize2 className="w-4 h-4 text-text-secondary" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleApprove}
                      disabled={!canReviewDocuments || selectedDocumentDecisionLocked || isProcessingReviewAction}
                      className="h-9 bg-success text-white rounded-md text-sm font-medium hover:bg-success/90 transition-colors flex items-center justify-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => setShowRejectionModal(true)}
                      disabled={!canReviewDocuments || selectedDocumentDecisionLocked || isProcessingReviewAction}
                      className="h-9 bg-error text-white rounded-md text-sm font-medium hover:bg-error/90 transition-colors flex items-center justify-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      onClick={handleRequestInfo}
                      disabled={!canRequestInfo || selectedDocumentDecisionLocked || isProcessingReviewAction}
                      className="h-9 bg-warning text-white rounded-md text-sm font-medium hover:bg-warning/90 transition-colors flex items-center justify-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <HelpCircle className="w-4 h-4" />
                      Request Info
                    </button>
                    <button
                      onClick={handleMarkPending}
                      disabled={!canReviewDocuments || isProcessingReviewAction}
                      className="h-9 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors flex items-center justify-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <Clock className="w-4 h-4" />
                      Pending Review
                    </button>
                  </div>
                </div>

                {/* Admin Comments Section */}
                <div className="mt-6 pt-4 border-t border-border-light">
                  <h4 className="text-sm font-semibold text-text-primary mb-4">Admin Comments</h4>
                  
                  <div className="space-y-3 mb-4">
                    {(comments[selectedDocument.id] || []).map(comment => (
                      <div key={comment.id} className="bg-background rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-text-muted" />
                            <span className="text-sm font-medium text-text-primary">{comment.adminName}</span>
                            <span className="text-xs text-text-muted">({comment.adminRole})</span>
                          </div>
                          {String(comment.adminId || '').trim().toLowerCase() === currentAdminCommentId && (
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => handleEditComment(comment.id)}
                                className="p-1 hover:bg-border rounded transition-colors"
                              >
                                <Edit2 className="w-3 h-3 text-text-muted" />
                              </button>
                              <button 
                                onClick={() => handleDeleteComment(comment.id)}
                                className="p-1 hover:bg-border rounded transition-colors"
                              >
                                <Trash2 className="w-3 h-3 text-text-muted" />
                              </button>
                            </div>
                          )}
                        </div>
                        {editingComment === comment.id ? (
                          <div>
                            <textarea
                              value={editedCommentText}
                              onChange={(e) => setEditedCommentText(e.target.value)}
                              className="w-full h-20 p-2 border border-border rounded-md text-sm focus:outline-none focus:border-primary resize-none"
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <button 
                                onClick={() => setEditingComment(null)}
                                className="h-7 px-3 border border-border rounded text-xs font-medium text-text-secondary hover:bg-background"
                              >
                                Cancel
                              </button>
                              <button 
                                onClick={handleSaveEdit}
                                className="h-7 px-3 bg-primary text-white rounded text-xs font-medium hover:bg-primary-light"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-text-secondary">{comment.text}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Clock className="w-3 h-3 text-text-muted" />
                          <span className="text-xs text-text-muted">{comment.timestamp}</span>
                          {comment.isEdited && <span className="text-xs text-text-muted">(edited)</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder={canCommentDocuments ? 'Add a comment...' : 'This role cannot post comments.'}
                      disabled={!canCommentDocuments}
                      className="w-full h-20 p-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary resize-none"
                    />
                    <button 
                      onClick={handleAddComment}
                      disabled={!canCommentDocuments || !newComment.trim()}
                      className="mt-2 h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      Post Comment
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Reason Modal */}
      {showRejectionModal && (
        <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-4 border-b border-border-light">
              <h3 className="text-lg font-semibold text-text-primary">Reject Document</h3>
              <p className="text-sm text-text-secondary mt-1">Please provide a reason for rejection.</p>
            </div>
            <div className="p-4">
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter rejection reason..."
                className="w-full h-32 p-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary resize-none"
              />
            </div>
            <div className="p-4 border-t border-border-light flex justify-end gap-3">
              <button 
                onClick={() => { setShowRejectionModal(false); setRejectionReason('') }}
                disabled={isProcessingReviewAction}
                className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background"
              >
                Cancel
              </button>
              <button 
                onClick={handleReject}
                disabled={!rejectionReason.trim() || isProcessingReviewAction}
                className="h-10 px-4 bg-error text-white rounded-md text-sm font-medium hover:bg-error/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {isProcessingReviewAction ? (
                  <>
                    <DotLottiePreloader size={18} />
                    <span>Processing...</span>
                  </>
                ) : 'Reject Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Preview */}
      {showFullscreen && (
        <div className="fixed inset-0 z-[120] bg-black flex items-center justify-center">
          <button 
            onClick={() => setShowFullscreen(false)}
            className="absolute top-4 right-4 p-2 bg-white/10 rounded-md text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="w-full h-full p-12 overflow-auto">
            {showImagePreview && (
              <img
                src={previewObjectUrl}
                alt={selectedDocument?.filename || 'Document preview'}
                className="max-w-full max-h-full mx-auto"
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
              />
            )}
            {showPdfPreview && (
              <iframe
                title={selectedDocument?.filename || 'Document preview fullscreen'}
                src={previewObjectUrl}
                className="w-full h-full"
              />
            )}
            {showTextPreview && (
              <pre className="text-white whitespace-pre-wrap break-words" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}>
                {previewText || '(No text content found)'}
              </pre>
            )}
            {!showImagePreview && !showPdfPreview && !showTextPreview && (
              <div className="text-white text-center mt-24">
                <FileText className="w-24 h-24 mx-auto mb-4 opacity-50" />
                <p>{previewMessage || 'Fullscreen preview is unavailable for this file type.'}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const SUPPORT_INBOX_FOCUS_EMAIL_KEY = 'kiaminaSupportInboxFocusEmail'

function AdminSupportLeadsPage({ setActivePage, showToast, currentAdminAccount, onAdminActionLog }) {
  const [supportSnapshot, setSupportSnapshot] = useState(() => getSupportCenterSnapshot())
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [ticketFilter, setTicketFilter] = useState('all')
  const [sortBy, setSortBy] = useState('updated-desc')
  const adminActorName = toTrimmedValue(currentAdminAccount?.fullName)
    || toTrimmedValue(currentAdminAccount?.firstName)
    || 'Admin User'

  useEffect(() => {
    void refreshSupportStateFromBackend()
    const unsubscribe = subscribeSupportCenter((snapshot) => setSupportSnapshot(snapshot))
    return unsubscribe
  }, [])

  const tickets = Array.isArray(supportSnapshot?.tickets) ? supportSnapshot.tickets : []
  const leads = useMemo(() => {
    const rawLeads = Array.isArray(supportSnapshot?.leads) ? supportSnapshot.leads : []
    const rows = rawLeads
      .filter((lead) => lead && typeof lead === 'object')
      .map((lead) => {
        const normalizedLeadId = toTrimmedValue(lead.id)
        const normalizedClientEmail = toTrimmedValue(lead.clientEmail).toLowerCase()
        const linkedTickets = tickets.filter((ticket) => {
          const ticketLeadId = toTrimmedValue(ticket?.leadId)
          const ticketClientEmail = toTrimmedValue(ticket?.clientEmail).toLowerCase()
          return (
            (normalizedLeadId && ticketLeadId === normalizedLeadId)
            || (normalizedClientEmail && ticketClientEmail === normalizedClientEmail)
          )
        })
        const latestTicket = [...linkedTickets]
          .sort((left, right) => (Date.parse(right.updatedAtIso || '') || 0) - (Date.parse(left.updatedAtIso || '') || 0))[0] || null
        const latestUpdatedAtIso = (
          (Date.parse(lead.updatedAtIso || '') || 0) > (Date.parse(latestTicket?.updatedAtIso || '') || 0)
            ? lead.updatedAtIso
            : (latestTicket?.updatedAtIso || lead.updatedAtIso)
        )
        return {
          ...lead,
          ticketCount: linkedTickets.length,
          openTicketCount: linkedTickets.filter((ticket) => ticket.status !== SUPPORT_TICKET_STATUS.RESOLVED).length,
          latestUpdatedAtIso,
        }
      })
    return rows.sort((left, right) => (Date.parse(right.latestUpdatedAtIso || '') || 0) - (Date.parse(left.latestUpdatedAtIso || '') || 0))
  }, [supportSnapshot, tickets])

  const getLeadCategoryList = (lead = {}) => {
    const categories = []
    const pushCategory = (value = '') => {
      const normalized = toTrimmedValue(value)
      if (!normalized || categories.includes(normalized)) return
      categories.push(normalized)
    }
    ;(Array.isArray(lead.leadCategories) ? lead.leadCategories : []).forEach((entry) => pushCategory(entry))
    pushCategory(lead.leadCategory)
    return categories
  }

  const filteredLeads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const toCategorySearchText = (lead = {}) => (
      getLeadCategoryList(lead)
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
    )

    const scopedLeads = leads
      .filter((lead) => (
        !query
          || [
            lead.leadLabel,
            toCategorySearchText(lead),
            lead.fullName,
            lead.contactEmail,
            lead.organizationType,
            lead.ipAddress,
            lead.location,
            lead.clientEmail,
          ].some((value) => String(value || '').toLowerCase().includes(query))
      ))
      .filter((lead) => {
        if (categoryFilter === 'all') return true
        const categories = getLeadCategoryList(lead)
        const hasInquiry = categories.includes('Inquiry_FollowUP')
        const hasNewsletter = categories.includes('Newsletter_Subscriber')
        if (categoryFilter === 'inquiry') return hasInquiry
        if (categoryFilter === 'newsletter') return hasNewsletter
        if (categoryFilter === 'mixed') return hasInquiry && hasNewsletter
        return true
      })
      .filter((lead) => {
        if (typeFilter === 'all') return true
        const normalizedType = toTrimmedValue(lead.organizationType).toLowerCase()
        if (typeFilter === 'unknown') return !normalizedType
        return normalizedType === typeFilter
      })
      .filter((lead) => {
        if (ticketFilter === 'all') return true
        const openCount = Number(lead.openTicketCount || 0)
        if (ticketFilter === 'open') return openCount > 0
        if (ticketFilter === 'closed') return openCount === 0
        return true
      })

    return [...scopedLeads].sort((left, right) => {
      if (sortBy === 'updated-asc') {
        return (Date.parse(left.latestUpdatedAtIso || '') || 0) - (Date.parse(right.latestUpdatedAtIso || '') || 0)
      }
      if (sortBy === 'label-asc') {
        return String(left.leadLabel || '').localeCompare(String(right.leadLabel || ''))
      }
      if (sortBy === 'label-desc') {
        return String(right.leadLabel || '').localeCompare(String(left.leadLabel || ''))
      }
      if (sortBy === 'email-asc') {
        return String(left.contactEmail || '').localeCompare(String(right.contactEmail || ''))
      }
      if (sortBy === 'email-desc') {
        return String(right.contactEmail || '').localeCompare(String(left.contactEmail || ''))
      }
      if (sortBy === 'open-desc') {
        return Number(right.openTicketCount || 0) - Number(left.openTicketCount || 0)
      }
      if (sortBy === 'open-asc') {
        return Number(left.openTicketCount || 0) - Number(right.openTicketCount || 0)
      }
      return (Date.parse(right.latestUpdatedAtIso || '') || 0) - (Date.parse(left.latestUpdatedAtIso || '') || 0)
    })
  }, [leads, searchTerm, categoryFilter, typeFilter, ticketFilter, sortBy])

  const formatLeadType = (value = '') => {
    const normalized = toTrimmedValue(value).toLowerCase()
    if (normalized === 'business') return 'Business'
    if (normalized === 'non-profit') return 'Non-profit'
    if (normalized === 'individual') return 'Individual'
    return '--'
  }

  const formatLeadCategory = (value = '', list = []) => {
    const resolved = []
    const pushCategory = (entry = '') => {
      const normalized = toTrimmedValue(entry)
      if (!normalized || resolved.includes(normalized)) return
      resolved.push(normalized)
    }
    ;(Array.isArray(list) ? list : []).forEach((entry) => pushCategory(entry))
    pushCategory(value)
    if (resolved.length === 0) return '--'
    return resolved
      .map((entry) => {
        if (entry === 'Inquiry_FollowUP') return 'Inquiry Follow-up'
        if (entry === 'Newsletter_Subscriber') return 'Newsletter Subscriber'
        return entry
      })
      .join(', ')
  }

  const handleExportLeadsToExcel = async () => {
    if (filteredLeads.length === 0) {
      showToast?.('error', 'No leads available to export.')
      return
    }
    const exportRows = filteredLeads.map((lead, index) => ({
      'S/N': index + 1,
      Type: 'Lead',
      Category: formatLeadCategory(lead.leadCategory, lead.leadCategories),
      'Full Name': lead.fullName || '',
      Email: lead.contactEmail || '',
      Organization: formatLeadType(lead.organizationType),
      'IP Address': lead.ipAddress || '',
      Location: lead.location || '',
      'Open Tickets': Number(lead.openTicketCount || 0),
      'All Tickets': Number(lead.ticketCount || 0),
      Updated: formatTimestamp(lead.latestUpdatedAtIso || lead.updatedAtIso),
    }))
    const exportStamp = new Date().toISOString().slice(0, 19).replaceAll('-', '').replaceAll(':', '').replace('T', '')
    await downloadObjectRowsAsXlsx({
      rows: exportRows,
      sheetName: 'Leads',
      fileName: `Kiamina_Leads_${exportStamp}.xlsx`,
    })
    showToast?.('success', `Exported ${filteredLeads.length} lead(s) to Excel.`)
  }

  const handleOpenInbox = (leadClientEmail = '') => {
    const normalizedEmail = toTrimmedValue(leadClientEmail).toLowerCase()
    if (normalizedEmail) {
      try {
        localStorage.setItem(SUPPORT_INBOX_FOCUS_EMAIL_KEY, normalizedEmail)
      } catch {
        // Ignore storage write failure.
      }
    }
    setActivePage?.('admin-communications')
  }

  const handleDeleteLead = (lead = null) => {
    if (!lead || typeof lead !== 'object') return
    const leadLabel = toTrimmedValue(lead.leadLabel) || toTrimmedValue(lead.fullName) || toTrimmedValue(lead.contactEmail) || 'this lead'
    const confirmed = window.confirm(`Move ${leadLabel} to trash? You can restore later from Admin Trash.`)
    if (!confirmed) return

    const deleteResult = deleteSupportLead({
      leadId: lead.id,
      clientEmail: lead.clientEmail,
    })
    if (!deleteResult.ok) {
      showToast?.('error', deleteResult.message || 'Unable to delete lead.')
      return
    }

    appendAdminTrashEntryToStorage({
      entityType: 'lead',
      entityLabel: leadLabel,
      description: `Lead removed with ${deleteResult.removedTicketCount || 0} linked support ticket(s).`,
      deletedByName: adminActorName,
      payload: {
        lead: deleteResult.lead || lead,
        tickets: Array.isArray(deleteResult.tickets) ? deleteResult.tickets : [],
        removedAtIso: new Date().toISOString(),
      },
    })

    onAdminActionLog?.({
      adminName: adminActorName,
      action: 'Deleted lead',
      affectedUser: leadLabel,
      details: `Moved to trash (${deleteResult.removedTicketCount || 0} ticket(s) archived).`,
    })
    showToast?.('success', `${leadLabel} moved to trash.`)
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">Leads</h2>
          <p className="text-sm text-text-secondary mt-1">Track inquiry and newsletter leads with contact and routing details.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-text-muted">Showing {filteredLeads.length} of {leads.length} lead(s)</div>
          <button
            type="button"
            onClick={() => void handleExportLeadsToExcel()}
            disabled={filteredLeads.length === 0}
            className="h-9 px-3 rounded-md border border-border text-sm font-medium text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light">
        <div className="p-4 border-b border-border-light">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search lead name, category, email, type, IP, or location..."
              className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary md:col-span-2"
            />
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-10 px-3 border border-border rounded-md text-sm bg-white focus:outline-none focus:border-primary"
            >
              <option value="all">All Categories</option>
              <option value="inquiry">Inquiry Follow-up</option>
              <option value="newsletter">Newsletter Subscriber</option>
              <option value="mixed">Mixed Categories</option>
            </select>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="h-10 px-3 border border-border rounded-md text-sm bg-white focus:outline-none focus:border-primary"
            >
              <option value="all">All Types</option>
              <option value="business">Business</option>
              <option value="non-profit">Non-profit</option>
              <option value="individual">Individual</option>
              <option value="unknown">Unknown</option>
            </select>
            <select
              value={ticketFilter}
              onChange={(event) => setTicketFilter(event.target.value)}
              className="h-10 px-3 border border-border rounded-md text-sm bg-white focus:outline-none focus:border-primary"
            >
              <option value="all">All Tickets</option>
              <option value="open">Open Tickets</option>
              <option value="closed">No Open Tickets</option>
            </select>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="h-10 px-3 border border-border rounded-md text-sm bg-white focus:outline-none focus:border-primary md:col-span-2 xl:col-span-2"
            >
              <option value="updated-desc">Sort: Updated (Newest)</option>
              <option value="updated-asc">Sort: Updated (Oldest)</option>
              <option value="label-asc">Sort: Lead Label (A-Z)</option>
              <option value="label-desc">Sort: Lead Label (Z-A)</option>
              <option value="email-asc">Sort: Email (A-Z)</option>
              <option value="email-desc">Sort: Email (Z-A)</option>
              <option value="open-desc">Sort: Open Tickets (High-Low)</option>
              <option value="open-asc">Sort: Open Tickets (Low-High)</option>
            </select>
          </div>
        </div>

        {filteredLeads.length === 0 ? (
          <div className="px-4 py-10 text-sm text-text-muted text-center">
            No leads found yet.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[1200px] border-collapse">
              <thead className="bg-background border-b border-border-light">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">S/N</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Full Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Organization</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">IP Address</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Open Tickets</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">All Tickets</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Updated</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead, index) => (
                  <tr key={lead.id} className="border-b border-border-light hover:bg-background transition-colors">
                    <td className="px-4 py-3.5 text-sm font-semibold text-text-primary">{index + 1}</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">Lead</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{formatLeadCategory(lead.leadCategory, lead.leadCategories)}</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{lead.fullName || '--'}</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{lead.contactEmail || '--'}</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{formatLeadType(lead.organizationType)}</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{lead.ipAddress || '--'}</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{lead.location || '--'}</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{lead.openTicketCount || 0}</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{lead.ticketCount || 0}</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{formatTimestamp(lead.latestUpdatedAtIso || lead.updatedAtIso)}</td>
                    <td className="px-4 py-3.5 text-sm">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenInbox(lead.clientEmail)}
                          className="h-8 px-3 rounded-md border border-border text-xs font-medium text-text-primary hover:bg-white"
                        >
                          Open Support Inbox
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLead(lead)}
                          className="h-8 px-3 rounded-md border border-error/50 text-xs font-medium text-error hover:bg-error/10"
                        >
                          Delete Lead
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function AdminTrashPage({ showToast, currentAdminAccount, onAdminActionLog }) {
  const [trashEntries, setTrashEntries] = useState(() => readAdminTrashEntriesFromStorage())
  const adminActorName = toTrimmedValue(currentAdminAccount?.fullName)
    || toTrimmedValue(currentAdminAccount?.firstName)
    || 'Admin User'

  useEffect(() => {
    const syncTrash = () => setTrashEntries(readAdminTrashEntriesFromStorage())
    syncTrash()
    const handleStorage = (event) => {
      if (!event.key || event.key === ADMIN_TRASH_STORAGE_KEY) {
        syncTrash()
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const formatEntityType = (value = '') => {
    const normalized = toTrimmedValue(value).toLowerCase()
    if (normalized === 'lead') return 'Lead'
    if (normalized === 'notification-draft') return 'Notification Draft'
    if (normalized === 'admin-account') return 'Admin Account'
    if (normalized === 'admin-invite') return 'Admin Invite'
    return normalized || 'Unknown'
  }

  const refreshTrash = () => setTrashEntries(readAdminTrashEntriesFromStorage())

  const handleRestoreEntry = (entry = null) => {
    if (!entry || typeof entry !== 'object') return
    if (entry.entityType === 'lead') {
      const restoreResult = restoreSupportLead({
        lead: entry.payload?.lead,
        tickets: entry.payload?.tickets,
      })
      if (!restoreResult.ok) {
        showToast?.('error', restoreResult.message || 'Unable to restore this lead.')
        return
      }
      removeAdminTrashEntryFromStorage(entry.id)
      refreshTrash()
      onAdminActionLog?.({
        adminName: adminActorName,
        action: 'Restored lead',
        affectedUser: entry.entityLabel || 'Lead',
        details: `Restored from trash with ${restoreResult.restoredTicketCount || 0} ticket(s).`,
      })
      showToast?.('success', `${entry.entityLabel || 'Lead'} restored from trash.`)
      return
    }
    if (entry.entityType === 'notification-draft') {
      const draft = entry.payload?.draft
      if (!draft || typeof draft !== 'object') {
        showToast?.('error', 'Draft payload is missing.')
        return
      }
      upsertAdminNotificationDraftInStorage(draft)
      removeAdminTrashEntryFromStorage(entry.id)
      refreshTrash()
      onAdminActionLog?.({
        adminName: adminActorName,
        action: 'Restored notification draft',
        affectedUser: entry.entityLabel || '(Untitled draft)',
        details: 'Notification draft restored from trash.',
      })
      showToast?.('success', 'Draft restored from trash.')
      return
    }
    if (entry.entityType === 'admin-account') {
      const accountPayload = entry.payload?.account
      const normalizedEmail = toTrimmedValue(accountPayload?.email).toLowerCase()
      if (!normalizedEmail) {
        showToast?.('error', 'Admin account payload is missing.')
        return
      }
      const existingAccounts = safeParseJson(localStorage.getItem(ACCOUNTS_STORAGE_KEY), [])
      const safeAccounts = Array.isArray(existingAccounts) ? existingAccounts : []
      const hasAccount = safeAccounts.some((account) => toTrimmedValue(account?.email).toLowerCase() === normalizedEmail)
      if (hasAccount) {
        showToast?.('error', 'An account with this email already exists.')
        return
      }
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify([
        ...safeAccounts,
        normalizeAdminAccount(accountPayload || {}),
      ]))
      removeAdminTrashEntryFromStorage(entry.id)
      refreshTrash()
      onAdminActionLog?.({
        adminName: adminActorName,
        action: 'Restored admin account',
        affectedUser: entry.entityLabel || normalizedEmail,
        details: 'Admin account restored from trash.',
      })
      showToast?.('success', `${entry.entityLabel || 'Admin account'} restored.`)
      return
    }
    if (entry.entityType === 'admin-invite') {
      const invitePayload = entry.payload?.invite
      const normalizedInviteToken = toTrimmedValue(invitePayload?.token)
      if (!normalizedInviteToken) {
        showToast?.('error', 'Admin invite payload is missing.')
        return
      }
      const existingInvites = safeParseJson(localStorage.getItem(ADMIN_INVITES_STORAGE_KEY), [])
      const safeInvites = Array.isArray(existingInvites) ? existingInvites : []
      const hasInvite = safeInvites.some((invite) => toTrimmedValue(invite?.token) === normalizedInviteToken)
      if (hasInvite) {
        showToast?.('error', 'This invite already exists.')
        return
      }
      localStorage.setItem(ADMIN_INVITES_STORAGE_KEY, JSON.stringify([
        normalizeAdminInvite(invitePayload || {}),
        ...safeInvites,
      ]))
      removeAdminTrashEntryFromStorage(entry.id)
      refreshTrash()
      onAdminActionLog?.({
        adminName: adminActorName,
        action: 'Restored admin invite',
        affectedUser: entry.entityLabel || invitePayload?.email || 'Admin Invite',
        details: 'Admin invite restored from trash.',
      })
      showToast?.('success', `${entry.entityLabel || 'Admin invite'} restored.`)
      return
    }
    const storageRecords = Array.isArray(entry.payload?.records) ? entry.payload.records : []
    if (storageRecords.length > 0) {
      storageRecords.forEach((record) => {
        const key = toTrimmedValue(record?.key)
        if (!key) return
        if (record?.value === null || record?.value === undefined) {
          localStorage.removeItem(key)
          return
        }
        localStorage.setItem(key, String(record.value))
      })
      removeAdminTrashEntryFromStorage(entry.id)
      refreshTrash()
      onAdminActionLog?.({
        adminName: adminActorName,
        action: 'Restored record from trash',
        affectedUser: entry.entityLabel || 'Stored record',
        details: 'Restored structured storage record from trash payload.',
      })
      showToast?.('success', `${entry.entityLabel || 'Item'} restored from trash.`)
      return
    }
    showToast?.('error', 'Unable to restore this item from the current payload.')
  }

  const handleDeletePermanently = (entry = null) => {
    if (!entry || typeof entry !== 'object') return
    const confirmed = window.confirm(`Delete ${entry.entityLabel || 'this item'} permanently from trash?`)
    if (!confirmed) return
    removeAdminTrashEntryFromStorage(entry.id)
    refreshTrash()
    onAdminActionLog?.({
      adminName: adminActorName,
      action: 'Emptied trash item',
      affectedUser: entry.entityLabel || 'Trash item',
      details: `Permanently removed ${formatEntityType(entry.entityType)} from trash.`,
    })
    showToast?.('success', 'Item removed permanently.')
  }

  const handleEmptyTrash = () => {
    if (trashEntries.length === 0) return
    const confirmed = window.confirm('Empty trash permanently? This cannot be undone.')
    if (!confirmed) return
    clearAdminTrashEntriesFromStorage()
    refreshTrash()
    onAdminActionLog?.({
      adminName: adminActorName,
      action: 'Emptied trash',
      affectedUser: `${trashEntries.length} item(s)`,
      details: 'All trash items were permanently removed.',
    })
    showToast?.('success', 'Trash emptied.')
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">Trash</h2>
          <p className="text-sm text-text-secondary mt-1">Recover deleted admin records or remove them permanently.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-text-muted">Items: {trashEntries.length}</div>
          <button
            type="button"
            onClick={handleEmptyTrash}
            disabled={trashEntries.length === 0}
            className="h-9 px-3 rounded-md border border-error/50 text-xs font-semibold text-error hover:bg-error/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Empty Trash
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light overflow-hidden">
        {trashEntries.length === 0 ? (
          <div className="px-4 py-10 text-sm text-text-muted text-center">
            Trash is empty.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead className="bg-background border-b border-border-light">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">S/N</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Deleted By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Deleted At</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trashEntries.map((entry, index) => (
                  <tr key={entry.id} className="border-b border-border-light hover:bg-background transition-colors">
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{index + 1}</td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-text-primary">{entry.entityLabel || '--'}</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{formatEntityType(entry.entityType)}</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{entry.description || '--'}</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{entry.deletedByName || '--'}</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{formatTimestamp(entry.deletedAtIso)}</td>
                    <td className="px-4 py-3.5 text-sm">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleRestoreEntry(entry)}
                          className="h-8 px-3 rounded-md border border-border text-xs font-medium text-text-primary hover:bg-white"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePermanently(entry)}
                          className="h-8 px-3 rounded-md border border-error/50 text-xs font-medium text-error hover:bg-error/10"
                        >
                          Delete Permanently
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// Communications Center (Message Center)
function AdminCommunicationsCenter({ showToast, currentAdminAccount, onAdminActionLog, setActivePage }) {
  const [activeTab, setActiveTab] = useState('sent')
  const [notifications, setNotifications] = useState(() => readAdminSentNotificationsFromStorage())
  const [drafts, setDrafts] = useState(() => readAdminNotificationDraftsFromStorage())
  const [scheduledNotifications, setScheduledNotifications] = useState(() => readAdminScheduledNotificationsFromStorage())
  const [supportSnapshot, setSupportSnapshot] = useState(() => getSupportCenterSnapshot())
  const supportUnreadRef = useRef(-1)
  const currentAdminEmail = toTrimmedValue(currentAdminAccount?.email).toLowerCase()

  useEffect(() => {
    const refreshNotifications = () => {
      setNotifications(readAdminSentNotificationsFromStorage())
      setDrafts(readAdminNotificationDraftsFromStorage())
      setScheduledNotifications(readAdminScheduledNotificationsFromStorage())
    }
    refreshNotifications()
    const refreshIntervalId = window.setInterval(refreshNotifications, 4000)
    window.addEventListener(ADMIN_NOTIFICATIONS_SYNC_EVENT, refreshNotifications)
    window.addEventListener('storage', refreshNotifications)
    return () => {
      window.removeEventListener('storage', refreshNotifications)
      window.removeEventListener(ADMIN_NOTIFICATIONS_SYNC_EVENT, refreshNotifications)
      window.clearInterval(refreshIntervalId)
    }
  }, [])

  useEffect(() => {
    void refreshSupportStateFromBackend()
    const unsubscribe = subscribeSupportCenter((snapshot) => setSupportSnapshot(snapshot))
    return unsubscribe
  }, [])

  const supportUnreadCount = useMemo(() => {
    const tickets = Array.isArray(supportSnapshot?.tickets) ? supportSnapshot.tickets : []
    return tickets.reduce((total, ticket) => total + Number(ticket?.unreadByAdmin || 0), 0)
  }, [supportSnapshot])

  useEffect(() => {
    let delayedSoundTimer = null
    const nextUnreadCount = Number(supportUnreadCount || 0)
    if (supportUnreadRef.current < 0) {
      supportUnreadRef.current = nextUnreadCount
      const windowActive = typeof document !== 'undefined'
        ? (document.visibilityState === 'visible' && document.hasFocus())
        : true
      if (nextUnreadCount > 0 && (activeTab !== 'support' || !windowActive) && isAdminNotificationSoundEnabled(currentAdminEmail)) {
        delayedSoundTimer = window.setTimeout(() => {
          playSupportNotificationSound()
        }, SUPPORT_NOTIFICATION_INITIAL_DELAY_MS)
      }
      return () => {
        if (delayedSoundTimer) window.clearTimeout(delayedSoundTimer)
      }
    }
    const previousUnreadCount = supportUnreadRef.current
    supportUnreadRef.current = nextUnreadCount
    if (nextUnreadCount <= previousUnreadCount) return

    const windowActive = typeof document !== 'undefined'
      ? (document.visibilityState === 'visible' && document.hasFocus())
      : true
    if ((activeTab !== 'support' || !windowActive) && isAdminNotificationSoundEnabled(currentAdminEmail)) {
      playSupportNotificationSound()
    }

    return () => {
      if (delayedSoundTimer) window.clearTimeout(delayedSoundTimer)
    }
  }, [supportUnreadCount, activeTab, currentAdminEmail])

  const handleEditDraft = (draftId = '') => {
    const normalizedDraftId = toTrimmedValue(draftId)
    if (!normalizedDraftId) return
    localStorage.setItem(ADMIN_NOTIFICATION_EDIT_DRAFT_STORAGE_KEY, normalizedDraftId)
    setActivePage?.('admin-notifications')
  }

  const handleDeleteDraft = (draftId = '') => {
    const normalizedDraftId = toTrimmedValue(draftId)
    if (!normalizedDraftId) return
    const draft = drafts.find((item) => item.id === normalizedDraftId)
    if (draft) {
      appendAdminTrashEntryToStorage({
        entityType: 'notification-draft',
        entityLabel: draft.title || '(Untitled draft)',
        description: draft.message || '',
        deletedByName: toTrimmedValue(currentAdminAccount?.fullName) || 'Admin User',
        payload: { draft },
      })
    }
    removeAdminNotificationDraftFromStorage(normalizedDraftId)
    setDrafts(readAdminNotificationDraftsFromStorage())
    showToast?.('success', 'Draft moved to trash.')
  }

  const handleCancelScheduled = (scheduledId = '') => {
    const normalizedId = toTrimmedValue(scheduledId)
    if (!normalizedId) return
    const existingEntries = readAdminScheduledNotificationsFromStorage()
    const target = existingEntries.find((entry) => entry.id === normalizedId)
    if (!target || target.status === 'Sent' || target.status === 'Cancelled') return
    const nowIso = new Date().toISOString()
    const nextEntries = existingEntries.map((entry) => (
      entry.id === normalizedId
        ? normalizeScheduledNotification({
          ...entry,
          status: 'Cancelled',
          updatedAtIso: nowIso,
        })
        : entry
    ))
    persistAdminScheduledNotificationsToStorage(nextEntries)
    setScheduledNotifications(nextEntries)
    showToast?.('success', 'Scheduled notification cancelled.')
  }

  const handleSendScheduledNow = async (scheduledId = '') => {
    const normalizedId = toTrimmedValue(scheduledId)
    if (!normalizedId) return
    const existingEntries = readAdminScheduledNotificationsFromStorage()
    const target = existingEntries.find((entry) => entry.id === normalizedId)
    if (!target || target.status === 'Sent' || target.status === 'Cancelled') return

    const nowIso = new Date().toISOString()
    const nextEntries = existingEntries.map((entry) => (
      entry.id === normalizedId
        ? normalizeScheduledNotification({
          ...entry,
          status: 'Scheduled',
          scheduledForIso: nowIso,
          updatedAtIso: nowIso,
        })
        : entry
    ))
    persistAdminScheduledNotificationsToStorage(nextEntries)
    setScheduledNotifications(nextEntries)
    const result = await runScheduledNotificationProcessor()
    if ((result?.processedCount || 0) > 0) {
      showToast?.('success', 'Scheduled notification sent.')
    } else {
      showToast?.('error', 'Unable to send scheduled notification now.')
    }
  }

  const getScheduledStatusStyle = (status = '') => {
    if (status === 'Sent') return 'bg-success-bg text-success'
    if (status === 'Cancelled') return 'bg-background text-text-muted'
    if (status === 'Failed') return 'bg-error-bg text-error'
    if (status === 'Sending') return 'bg-warning-bg text-warning'
    return 'bg-primary-tint text-primary'
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-text-primary">Communications Center</h2>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-card mb-6">
        <div className="flex border-b border-border-light">
          <button
            onClick={() => setActiveTab('sent')}
            className={`flex-1 h-12 px-4 text-sm font-medium transition-colors ${activeTab === 'sent' ? 'text-primary border-b-2 border-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Sent Notifications
          </button>
          <button
            onClick={() => setActiveTab('drafts')}
            className={`flex-1 h-12 px-4 text-sm font-medium transition-colors ${activeTab === 'drafts' ? 'text-primary border-b-2 border-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Drafts
          </button>
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`flex-1 h-12 px-4 text-sm font-medium transition-colors ${activeTab === 'scheduled' ? 'text-primary border-b-2 border-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Scheduled
          </button>
          <button
            onClick={() => setActiveTab('support')}
            className={`flex-1 h-12 px-4 text-sm font-medium transition-colors ${activeTab === 'support' ? 'text-primary border-b-2 border-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <span className="inline-flex items-center gap-2">
              <span>Support Inbox</span>
              {supportUnreadCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-error text-white text-[10px] font-semibold">
                  {supportUnreadCount > 99 ? '99+' : supportUnreadCount}
                </span>
              )}
            </span>
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'sent' && (
            <div className="space-y-4">
              {notifications.map(notification => (
                <div key={notification.id} className="border border-border-light rounded-lg p-4 hover:shadow-card transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-text-primary">{notification.title}</h4>
                      <p className="text-sm text-text-secondary mt-1">{notification.message}</p>
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4 text-text-muted" />
                          <span className="text-xs text-text-muted">{notification.audience}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4 text-text-muted" />
                          <span className="text-xs text-text-muted">{notification.dateSent}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Eye className="w-4 h-4 text-text-muted" />
                          <span className="text-xs text-text-muted">Open Rate: {notification.openRate}</span>
                        </div>
                      </div>
                    </div>
                    <span className="inline-flex items-center h-6 px-2.5 rounded text-xs font-medium bg-success-bg text-success">
                      {notification.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'drafts' && (
            <div className="space-y-4">
              {drafts.map(draft => (
                <div key={draft.id} className="border border-border-light rounded-lg p-4 hover:shadow-card transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-text-primary">{draft.title || '(Untitled draft)'}</h4>
                      <p className="text-sm text-text-secondary mt-1 whitespace-pre-wrap">{draft.message || 'No message body yet.'}</p>
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4 text-text-muted" />
                          <span className="text-xs text-text-muted">
                            {draft.mode === 'targeted'
                              ? `Targeted (${Array.isArray(draft.selectedUsers) ? draft.selectedUsers.length : 0} users)`
                              : `Bulk (${draft.bulkAudience || 'all-users'})`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4 text-text-muted" />
                          <span className="text-xs text-text-muted">{formatTimestamp(draft.updatedAtIso)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleEditDraft(draft.id)}
                          className="text-xs text-primary hover:underline"
                        >
                          Edit Draft
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDraft(draft.id)}
                          className="text-xs text-error hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <span className="inline-flex items-center h-6 px-2.5 rounded text-xs font-medium bg-warning-bg text-warning">
                      {draft.status}
                    </span>
                  </div>
                </div>
              ))}
              {drafts.length === 0 && (
                <div className="text-center py-8 text-text-muted">
                  <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No drafts</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'scheduled' && (
            <div className="space-y-4">
              {scheduledNotifications.map((item) => (
                <div key={item.id} className="border border-border-light rounded-lg p-4 hover:shadow-card transition-shadow">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-text-primary">{item.title}</h4>
                      <p className="text-sm text-text-secondary mt-1">{item.message || '--'}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-3">
                        <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                          <Users className="w-3.5 h-3.5" />
                          {getNotificationAudienceLabel({
                            mode: item.mode,
                            bulkAudience: item.bulkAudience,
                            selectedUsers: item.selectedUsers,
                          })}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                          <Calendar className="w-3.5 h-3.5" />
                          Scheduled {formatTimestamp(item.scheduledForIso)}
                        </span>
                        {item.sentAtIso && (
                          <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                            <Clock className="w-3.5 h-3.5" />
                            Sent {formatTimestamp(item.sentAtIso)}
                          </span>
                        )}
                        {item.emailSuccessCount > 0 && (
                          <span className="text-xs text-text-muted">
                            Email: {item.emailSuccessCount} delivered
                            {item.emailFailureCount > 0 ? `, ${item.emailFailureCount} failed` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${getScheduledStatusStyle(item.status)}`}>
                        {item.status}
                      </span>
                      {item.status === 'Scheduled' && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleSendScheduledNow(item.id)}
                            className="h-8 px-3 rounded-md border border-border text-xs font-medium text-text-primary hover:bg-background"
                          >
                            Send Now
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelScheduled(item.id)}
                            className="h-8 px-3 rounded-md border border-error/40 text-xs font-medium text-error hover:bg-error/10"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {scheduledNotifications.length === 0 && (
                <div className="text-center py-8 text-text-muted">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No scheduled notifications</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'support' && (
            <AdminSupportInboxPanel
              showToast={showToast}
              currentAdminAccount={currentAdminAccount}
              onAdminActionLog={onAdminActionLog}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// Send Notification Page
function AdminSendNotificationPage({ showToast, runWithSlowRuntimeWatch }) {
  const [mode, setMode] = useState('bulk') // 'bulk' or 'targeted'
  const [bulkAudience, setBulkAudience] = useState('all-users')
  const [deliveryMode, setDeliveryMode] = useState('now')
  const [scheduledForLocal, setScheduledForLocal] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('')
  const [priority, setPriority] = useState('normal')
  const [forceAdminMessage, setForceAdminMessage] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [activeDraftId, setActiveDraftId] = useState('')
  const [draftSavedAtIso, setDraftSavedAtIso] = useState('')
  const [recipientsDirectory, setRecipientsDirectory] = useState(() => getNotificationRecipientsDirectory())
  
  // Targeted notification filters
  const [searchUser, setSearchUser] = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [filters, setFilters] = useState({
    business: '',
    country: '',
    role: '',
    verificationStatus: '',
    registrationStage: '',
  })

  useEffect(() => {
    const refreshRecipients = () => setRecipientsDirectory(getNotificationRecipientsDirectory())
    refreshRecipients()
    window.addEventListener('storage', refreshRecipients)
    window.addEventListener(ADMIN_NOTIFICATIONS_SYNC_EVENT, refreshRecipients)
    return () => {
      window.removeEventListener('storage', refreshRecipients)
      window.removeEventListener(ADMIN_NOTIFICATIONS_SYNC_EVENT, refreshRecipients)
    }
  }, [])

  useEffect(() => {
    const draftIdToEdit = toTrimmedValue(localStorage.getItem(ADMIN_NOTIFICATION_EDIT_DRAFT_STORAGE_KEY))
    if (!draftIdToEdit) return
    const draft = readAdminNotificationDraftsFromStorage().find((item) => item.id === draftIdToEdit)
    localStorage.removeItem(ADMIN_NOTIFICATION_EDIT_DRAFT_STORAGE_KEY)
    if (!draft) return
    setMode(draft.mode || 'bulk')
    setBulkAudience(draft.bulkAudience || 'all-users')
    setDeliveryMode(draft.deliveryMode === 'scheduled' ? 'scheduled' : 'now')
    setScheduledForLocal(toDateTimeLocalValue(draft.scheduledForIso || ''))
    setTitle(draft.title || '')
    setMessage(draft.message || '')
    setLink(draft.link || '')
    setPriority(draft.priority || 'normal')
    setForceAdminMessage(normalizeBooleanPreference(draft.forceAdminMessage))
    setSearchUser(draft.searchUser || '')
    setSelectedUsers(Array.isArray(draft.selectedUsers) ? draft.selectedUsers : [])
    setFilters({
      business: draft.filters?.business || '',
      country: draft.filters?.country || '',
      role: draft.filters?.role || '',
      verificationStatus: draft.filters?.verificationStatus || '',
      registrationStage: draft.filters?.registrationStage || '',
    })
    setActiveDraftId(draft.id)
    setDraftSavedAtIso(draft.updatedAtIso || '')
    showToast?.('success', 'Draft loaded for editing.')
  }, [showToast])

  const scheduledForIso = Number.isFinite(Date.parse(scheduledForLocal || ''))
    ? new Date(scheduledForLocal).toISOString()
    : ''
  const isScheduledForFuture = deliveryMode !== 'scheduled'
    || (scheduledForIso && (Date.parse(scheduledForIso) > Date.now()))
  const hasAnyDraftContent = Boolean(
    scheduledForLocal
    || title.trim()
    || message.trim()
    || link.trim()
    || searchUser.trim()
    || selectedUsers.length > 0
    || forceAdminMessage
    || Object.values(filters).some((value) => toTrimmedValue(value)),
  )
  const isMessageReadyToSend = Boolean(
    title.trim()
    && message.trim()
    && (mode === 'bulk' || selectedUsers.length > 0)
    && isScheduledForFuture,
  )

  const buildDraftPayload = (draftId = activeDraftId || createNotificationDraftId()) => ({
    id: draftId,
    mode,
    bulkAudience,
    deliveryMode,
    scheduledForIso: deliveryMode === 'scheduled' ? scheduledForIso : '',
    title,
    message,
    link,
    priority,
    forceAdminMessage,
    searchUser,
    selectedUsers,
    filters,
    createdAtIso: draftSavedAtIso || new Date().toISOString(),
    updatedAtIso: new Date().toISOString(),
  })

  const saveDraft = ({ announce = false } = {}) => {
    if (!hasAnyDraftContent) {
      if (announce) showToast?.('error', 'Add content before saving a draft.')
      return null
    }
    const draft = upsertAdminNotificationDraftInStorage(buildDraftPayload())
    setActiveDraftId(draft.id)
    setDraftSavedAtIso(draft.updatedAtIso)
    if (announce) showToast?.('success', 'Draft saved.')
    return draft
  }

  useEffect(() => {
    if (!hasAnyDraftContent) {
      if (activeDraftId) {
        removeAdminNotificationDraftFromStorage(activeDraftId)
        setActiveDraftId('')
        setDraftSavedAtIso('')
      }
      return
    }
    if (isMessageReadyToSend) return
    const autosaveId = window.setTimeout(() => {
      saveDraft({ announce: false })
    }, 450)
    return () => window.clearTimeout(autosaveId)
  }, [
    hasAnyDraftContent,
    isMessageReadyToSend,
    activeDraftId,
    mode,
    bulkAudience,
    deliveryMode,
    scheduledForLocal,
    title,
    message,
    link,
    priority,
    forceAdminMessage,
    searchUser,
    selectedUsers,
    filters,
  ])

  const filteredUsers = recipientsDirectory.filter(user => {
    const matchesSearch = searchUser === '' || 
      user.fullName.toLowerCase().includes(searchUser.toLowerCase()) ||
      user.email.toLowerCase().includes(searchUser.toLowerCase()) ||
      user.businessName.toLowerCase().includes(searchUser.toLowerCase())
    
    const matchesBusiness = !filters.business || user.businessName === filters.business
    const matchesCountry = !filters.country || user.country === filters.country
    const matchesRole = !filters.role || user.role === filters.role
    const matchesVerification = !filters.verificationStatus || user.verificationStatus === filters.verificationStatus
    const matchesRegistration = !filters.registrationStage || user.registrationStage === filters.registrationStage

    return matchesSearch && matchesBusiness && matchesCountry && matchesRole && matchesVerification && matchesRegistration
  })

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const handleSend = () => {
    if (isSending) return
    if (deliveryMode === 'scheduled' && !scheduledForIso) {
      saveDraft({ announce: true })
      showToast('error', 'Select a valid schedule date and time.')
      return
    }
    if (deliveryMode === 'scheduled' && !isScheduledForFuture) {
      saveDraft({ announce: true })
      showToast('error', 'Scheduled time must be in the future.')
      return
    }
    if (!isMessageReadyToSend) {
      saveDraft({ announce: true })
      showToast('error', 'Complete required fields before sending. Saved to drafts.')
      return
    }
    setShowConfirm(true)
  }

  const confirmSend = async () => {
    if (isSending) return
    setIsSending(true)
    const executeSend = async () => {
      await waitForNetworkAwareDelay('search')
      if (deliveryMode === 'scheduled') {
        const scheduledAtIso = Number.isFinite(Date.parse(scheduledForLocal || ''))
          ? new Date(scheduledForLocal).toISOString()
          : ''
        if (!scheduledAtIso || Date.parse(scheduledAtIso) <= Date.now()) {
          showToast('error', 'Scheduled time must be in the future.')
          return
        }

        const recipients = resolveNotificationRecipients({
          mode,
          bulkAudience,
          selectedUsers,
        })
        if (recipients.length === 0) {
          showToast('error', 'No recipients matched this notification.')
          return
        }

        upsertAdminScheduledNotificationInStorage({
          id: createScheduledNotificationId(),
          mode,
          bulkAudience,
          title,
          message,
          link,
          priority,
          forceAdminMessage,
          selectedUsers,
          status: 'Scheduled',
          createdAtIso: new Date().toISOString(),
          updatedAtIso: new Date().toISOString(),
          scheduledForIso: scheduledAtIso,
          recipientCount: recipients.length,
          deliveryOrigin: 'scheduled',
        })
        showToast('success', `Notification scheduled for ${formatTimestamp(scheduledAtIso)}.`)
      } else {
        const sendResult = await dispatchAdminNotification({
          mode,
          bulkAudience,
          selectedUsers,
          title,
          message,
          link,
          priority,
          forceAdminMessage,
          deliveryOrigin: 'manual',
        })
        if (!sendResult.ok) {
          showToast('error', 'No recipients matched this notification.')
          return
        }
        showToast('success', mode === 'bulk'
          ? `Notification sent successfully to ${sendResult.recipientCount} users.`
          : `Notification sent successfully to ${sendResult.recipientCount} users.`)
      }

      if (activeDraftId) {
        removeAdminNotificationDraftFromStorage(activeDraftId)
      }
      setShowConfirm(false)
      setActiveDraftId('')
      setDraftSavedAtIso('')
      setDeliveryMode('now')
      setScheduledForLocal('')
      setTitle('')
      setMessage('')
      setLink('')
      setForceAdminMessage(false)
      setSearchUser('')
      setFilters({
        business: '',
        country: '',
        role: '',
        verificationStatus: '',
        registrationStage: '',
      })
      setSelectedUsers([])
    }
    try {
      if (typeof runWithSlowRuntimeWatch === 'function') {
        await runWithSlowRuntimeWatch(
          executeSend,
          deliveryMode === 'scheduled' ? 'Scheduling notification...' : 'Sending notification...',
        )
      } else {
        await executeSend()
      }
    } finally {
      setIsSending(false)
    }
  }

  const getAudienceCount = () => {
    return resolveNotificationRecipients({
      mode: 'bulk',
      bulkAudience,
      selectedUsers: [],
    }).length
  }

  const bulkAudienceOptions = [
    { id: 'all-users', label: 'All Users', icon: Users },
    { id: 'all-businesses', label: 'All Businesses', icon: Building },
    { id: 'all-accountants', label: 'All Accountants', icon: UsersRound },
    { id: 'pending-verification', label: 'Pending Verification Users', icon: AlertTriangle },
  ].map((option) => ({
    ...option,
    count: resolveNotificationRecipients({
      mode: 'bulk',
      bulkAudience: option.id,
      selectedUsers: [],
    }).length,
  }))

  const getPriorityStyle = (p) => {
    switch (p) {
      case 'important': return 'border-warning text-warning'
      case 'critical': return 'border-error text-error'
      default: return 'border-border text-text-secondary'
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-text-primary">Send Notification</h2>
      </div>

      {/* Mode Selection */}
      <div className="bg-white rounded-lg shadow-card p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <button
            onClick={() => setMode('bulk')}
            className={`w-full p-4 rounded-lg border-2 transition-all ${mode === 'bulk' ? 'border-primary bg-primary-tint' : 'border-border-light hover:border-border'}`}
          >
            <div className="flex items-center gap-3">
              <UsersRound className={`w-6 h-6 ${mode === 'bulk' ? 'text-primary' : 'text-text-muted'}`} />
              <div className="text-left">
                <p className="text-sm font-semibold text-text-primary">Bulk Notification</p>
                <p className="text-xs text-text-secondary">Send to all users or user groups</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => setMode('targeted')}
            className={`w-full p-4 rounded-lg border-2 transition-all ${mode === 'targeted' ? 'border-primary bg-primary-tint' : 'border-border-light hover:border-border'}`}
          >
            <div className="flex items-center gap-3">
              <User className={`w-6 h-6 ${mode === 'targeted' ? 'text-primary' : 'text-text-muted'}`} />
              <div className="text-left">
                <p className="text-sm font-semibold text-text-primary">Custom Targeted Notification</p>
                <p className="text-xs text-text-secondary">Select specific users or filter</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Bulk Notification Form */}
      {mode === 'bulk' && (
        <div className="bg-white rounded-lg shadow-card p-6">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Select Audience</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {bulkAudienceOptions.map(option => (
                  <button
                    key={option.id}
                    onClick={() => setBulkAudience(option.id)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${bulkAudience === option.id ? 'border-primary bg-primary-tint' : 'border-border-light hover:border-border'}`}
                  >
                    <div className="flex items-center gap-3">
                      <option.icon className={`w-5 h-5 ${bulkAudience === option.id ? 'text-primary' : 'text-text-muted'}`} />
                      <div>
                        <p className="text-sm font-medium text-text-primary">{option.label}</p>
                        <p className="text-xs text-text-muted">{option.count} users</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Message Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter notification title..."
                className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Message Body</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter your message..."
                rows={4}
                className="w-full p-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Optional Link</label>
              <input
                type="text"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://example.com/policy"
                className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-border-light bg-background/50 px-3 py-3">
              <input
                type="checkbox"
                checked={forceAdminMessage}
                onChange={(event) => setForceAdminMessage(event.target.checked)}
                className="w-4 h-4 mt-0.5 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium text-text-primary">Force admin message delivery</span>
                <span className="block text-xs text-text-muted mt-0.5">
                  Deliver this admin message even when a client disabled admin-message notifications.
                </span>
              </span>
            </label>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Delivery</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDeliveryMode('now')}
                  className={`h-10 px-3 rounded-md border-2 text-sm font-medium transition-colors ${deliveryMode === 'now' ? 'border-primary text-primary bg-primary-tint' : 'border-border text-text-secondary hover:border-border-light'}`}
                >
                  Send Now
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryMode('scheduled')}
                  className={`h-10 px-3 rounded-md border-2 text-sm font-medium transition-colors ${deliveryMode === 'scheduled' ? 'border-primary text-primary bg-primary-tint' : 'border-border text-text-secondary hover:border-border-light'}`}
                >
                  Schedule
                </button>
              </div>
              {deliveryMode === 'scheduled' && (
                <div className="mt-3">
                  <input
                    type="datetime-local"
                    value={scheduledForLocal}
                    onChange={(event) => setScheduledForLocal(event.target.value)}
                    className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                  />
                  <p className="text-xs text-text-muted mt-1">Scheduled messages send automatically and trigger brief client notifications.</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-border-light">
              <button
                type="button"
                onClick={() => saveDraft({ announce: true })}
                className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background"
              >
                Save Draft
              </button>
              <button
                onClick={() => setShowPreview(true)}
                disabled={!title || !message}
                className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Preview
              </button>
              <button
                onClick={handleSend}
                disabled={!isMessageReadyToSend || isSending}
                className="h-10 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {deliveryMode === 'scheduled' ? 'Schedule Notification' : 'Send Notification'}
              </button>
              {draftSavedAtIso && (
                <span className="text-xs text-text-muted ml-auto">
                  Draft saved {formatTimestamp(draftSavedAtIso)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Targeted Notification Form */}
      {mode === 'targeted' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white rounded-lg shadow-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-5 h-5 text-text-muted" />
              <h3 className="text-sm font-semibold text-text-primary">Filter Users</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Business</label>
                <select
                  value={filters.business}
                  onChange={(e) => setFilters(prev => ({ ...prev, business: e.target.value }))}
                  className="w-full h-9 px-2 border border-border rounded text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">All</option>
                  {[...new Set(recipientsDirectory.map(u => u.businessName))].filter(Boolean).map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Country</label>
                <select
                  value={filters.country}
                  onChange={(e) => setFilters(prev => ({ ...prev, country: e.target.value }))}
                  className="w-full h-9 px-2 border border-border rounded text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">All</option>
                  {[...new Set(recipientsDirectory.map(u => u.country))].filter(Boolean).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Role</label>
                <select
                  value={filters.role}
                  onChange={(e) => setFilters(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full h-9 px-2 border border-border rounded text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">All</option>
                  {[...new Set(recipientsDirectory.map(u => u.role))].filter(Boolean).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Verification</label>
                <select
                  value={filters.verificationStatus}
                  onChange={(e) => setFilters(prev => ({ ...prev, verificationStatus: e.target.value }))}
                  className="w-full h-9 px-2 border border-border rounded text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">All</option>
                  <option value="Verified">Verified</option>
                  <option value="Pending">Pending</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Registration Stage</label>
                <select
                  value={filters.registrationStage}
                  onChange={(e) => setFilters(prev => ({ ...prev, registrationStage: e.target.value }))}
                  className="w-full h-9 px-2 border border-border rounded text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">All</option>
                  <option value="Completed">Completed</option>
                  <option value="Onboarding">Onboarding</option>
                </select>
              </div>
            </div>
          </div>

          {/* User Selection */}
          <div className="bg-white rounded-lg shadow-card p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-semibold text-text-primary">Select Users</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">{selectedUsers.length} selected</span>
                <button
                  onClick={() => setSelectedUsers(filteredUsers.map(u => u.id))}
                  className="text-xs text-primary hover:underline"
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedUsers([])}
                  className="text-xs text-text-muted hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="mb-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  placeholder="Search by name, email, or business..."
                  className="w-full h-10 pl-10 pr-4 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto border border-border-light rounded-lg">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead className="bg-[#F9FAFB] sticky top-0">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left"></th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary">Email</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary">Business</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary">Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user.id} className="border-t border-border-light hover:bg-background cursor-pointer" onClick={() => toggleUserSelection(user.id)}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(user.id)}
                          onChange={() => toggleUserSelection(user.id)}
                          className="w-4 h-4 accent-primary"
                        />
                      </td>
                      <td className="px-3 py-2 text-sm">{user.fullName}</td>
                      <td className="px-3 py-2 text-sm text-text-secondary">{user.email}</td>
                      <td className="px-3 py-2 text-sm">{user.businessName}</td>
                      <td className="px-3 py-2 text-sm">
                        <span className={`inline-flex items-center h-5 px-2 rounded text-xs font-medium ${
                          user.verificationStatus === 'Verified' ? 'bg-success-bg text-success' :
                          user.verificationStatus === 'Pending' ? 'bg-warning-bg text-warning' :
                          'bg-error-bg text-error'
                        }`}>
                          {user.verificationStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>

          {/* Message Composition */}
          <div className="bg-white rounded-lg shadow-card p-6">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Message Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter notification title..."
                  className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Message Body</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter your message..."
                  rows={4}
                  className="w-full p-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Priority Level</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'normal', label: 'Normal' },
                    { id: 'important', label: 'Important' },
                    { id: 'critical', label: 'Critical' },
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPriority(p.id)}
                      className={`flex-1 h-10 px-4 rounded-md text-sm font-medium border-2 transition-all ${priority === p.id ? getPriorityStyle(p.id) : 'border-border text-text-secondary hover:border-border-light'}`}
                    >
                      {p.id === 'critical' && <Flag className="w-4 h-4 inline mr-1" />}
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-border-light bg-background/50 px-3 py-3">
                <input
                  type="checkbox"
                  checked={forceAdminMessage}
                  onChange={(event) => setForceAdminMessage(event.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium text-text-primary">Force admin message delivery</span>
                  <span className="block text-xs text-text-muted mt-0.5">
                    Deliver this admin message even when a client disabled admin-message notifications.
                  </span>
                </span>
              </label>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Delivery</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('now')}
                    className={`h-10 px-3 rounded-md border-2 text-sm font-medium transition-colors ${deliveryMode === 'now' ? 'border-primary text-primary bg-primary-tint' : 'border-border text-text-secondary hover:border-border-light'}`}
                  >
                    Send Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('scheduled')}
                    className={`h-10 px-3 rounded-md border-2 text-sm font-medium transition-colors ${deliveryMode === 'scheduled' ? 'border-primary text-primary bg-primary-tint' : 'border-border text-text-secondary hover:border-border-light'}`}
                  >
                    Schedule
                  </button>
                </div>
                {deliveryMode === 'scheduled' && (
                  <div className="mt-3">
                    <input
                      type="datetime-local"
                      value={scheduledForLocal}
                      onChange={(event) => setScheduledForLocal(event.target.value)}
                      className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                    />
                    <p className="text-xs text-text-muted mt-1">Scheduled messages send automatically and trigger brief client notifications.</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-border-light">
                <button
                  type="button"
                  onClick={() => saveDraft({ announce: true })}
                  className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background"
                >
                  Save Draft
                </button>
                <button
                  onClick={() => setShowPreview(true)}
                  disabled={!title || !message || selectedUsers.length === 0}
                  className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Preview
                </button>
              <button
                onClick={handleSend}
                disabled={!isMessageReadyToSend || isSending}
                className="h-10 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {deliveryMode === 'scheduled'
                  ? `Schedule for ${selectedUsers.length} Users`
                  : `Send to ${selectedUsers.length} Users`}
              </button>
                {draftSavedAtIso && (
                  <span className="text-xs text-text-muted ml-auto">
                    Draft saved {formatTimestamp(draftSavedAtIso)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-4 border-b border-border-light">
              <h3 className="text-lg font-semibold text-text-primary">Notification Preview</h3>
            </div>
            <div className="p-4">
              <div className={`rounded-lg border-2 p-4 ${getPriorityStyle(priority)}`}>
                {priority === 'critical' && (
                  <div className="flex items-center gap-1 text-error mb-2">
                    <Flag className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase">Critical</span>
                  </div>
                )}
                {priority === 'important' && (
                  <div className="flex items-center gap-1 text-warning mb-2">
                    <Flag className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase">Important</span>
                  </div>
                )}
                <h4 className="text-base font-semibold text-text-primary">{title}</h4>
                <p className="text-sm text-text-secondary mt-2">{message}</p>
                {link && (
                  <a href={link} className="text-sm text-primary mt-2 inline-block hover:underline">
                    {link}
                  </a>
                )}
              </div>
              <p className="text-xs text-text-muted mt-3">
                This notification will be sent to {mode === 'bulk' ? getAudienceCount() : selectedUsers.length} recipient(s)
                {deliveryMode === 'scheduled' && scheduledForIso ? ` on ${formatTimestamp(scheduledForIso)}` : ' immediately'}.
                {forceAdminMessage ? ' Forced admin delivery is enabled.' : ''}
              </p>
            </div>
            <div className="p-4 border-t border-border-light flex justify-end">
              <button 
                onClick={() => setShowPreview(false)}
                className="h-10 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-4 border-b border-border-light">
              <h3 className="text-lg font-semibold text-text-primary">Confirm Notification</h3>
            </div>
            <div className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-text-primary">
                    {deliveryMode === 'scheduled'
                      ? `Schedule this notification for ${mode === 'bulk' ? `${getAudienceCount()} users` : `${selectedUsers.length} users`}?`
                      : `Are you sure you want to send this notification to ${mode === 'bulk' ? `${getAudienceCount()} users` : `${selectedUsers.length} users`}?`}
                  </p>
                  <p className="text-xs text-text-muted mt-2">
                    {deliveryMode === 'scheduled' && scheduledForIso
                      ? `Scheduled time: ${formatTimestamp(scheduledForIso)}.`
                      : 'This action cannot be undone.'}
                    {forceAdminMessage ? ' Forced admin delivery is enabled.' : ''}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-border-light flex justify-end gap-3">
              <button 
                onClick={() => setShowConfirm(false)}
                disabled={isSending}
                className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background"
              >
                Cancel
              </button>
              <button 
                onClick={() => void confirmSend()}
                disabled={isSending}
                className="h-10 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {isSending ? (
                  <>
                    <DotLottiePreloader size={18} />
                    <span>{deliveryMode === 'scheduled' ? 'Scheduling...' : 'Sending...'}</span>
                  </>
                ) : (deliveryMode === 'scheduled' ? 'Confirm & Schedule' : 'Confirm & Send')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AdminWorkHoursPage({ currentAdminAccount }) {
  const [sessions, setSessions] = useState(() => getAdminWorkSessionsFromStorage())
  const [searchTerm, setSearchTerm] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [sortField, setSortField] = useState('date')
  const [sortDirection, setSortDirection] = useState('desc')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const normalizedAdmin = normalizeAdminAccount({
    ...DEFAULT_ADMIN_ACCOUNT,
    role: 'admin',
    ...currentAdminAccount,
  })
  const normalizedAdminEmail = String(normalizedAdmin?.email || '').trim().toLowerCase()
  const normalizedAdminLevel = normalizeAdminLevel(normalizedAdmin?.adminLevel || ADMIN_LEVELS.SUPER)
  const canViewAllWorkers = (
    normalizedAdminLevel === ADMIN_LEVELS.SUPER
    || normalizedAdminLevel === ADMIN_LEVELS.AREA_ACCOUNTANT
  )

  useEffect(() => {
    const syncSessions = () => setSessions(getAdminWorkSessionsFromStorage())
    syncSessions()
    const handleStorage = (event) => {
      if (!event.key || event.key === ADMIN_WORK_SESSIONS_STORAGE_KEY) {
        syncSessions()
      }
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener(ADMIN_WORK_SESSIONS_SYNC_EVENT, syncSessions)
    const intervalId = window.setInterval(syncSessions, 60000)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(ADMIN_WORK_SESSIONS_SYNC_EVENT, syncSessions)
      window.clearInterval(intervalId)
    }
  }, [])

  const hasOpenSessions = useMemo(
    () => sessions.some((session) => !session.clockOutAt),
    [sessions],
  )

  useEffect(() => {
    if (!hasOpenSessions) return undefined
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [hasOpenSessions])

  const scopedSessions = useMemo(() => (
    canViewAllWorkers
      ? sessions
      : sessions.filter((session) => String(session?.adminEmail || '').trim().toLowerCase() === normalizedAdminEmail)
  ), [canViewAllWorkers, normalizedAdminEmail, sessions])

  const levelOptions = useMemo(() => {
    const levelSet = new Set(
      scopedSessions.map((session) => normalizeAdminLevel(session.adminLevel || ADMIN_LEVELS.SUPER)),
    )
    return [...levelSet]
      .map((level) => ({ value: level, label: getAdminLevelLabel(level) }))
      .sort((left, right) => left.label.localeCompare(right.label))
  }, [scopedSessions])

  const sessionRows = useMemo(() => (
    scopedSessions.map((session, index) => {
      const clockInAt = session.clockInAt || ''
      const clockOutAt = session.clockOutAt || ''
      const clockInMs = Date.parse(clockInAt) || 0
      const clockOutMs = Date.parse(clockOutAt) || 0
      const durationMs = getWorkSessionDurationMs(session, nowMs)
      const dateKey = toLocalDateKey(clockInAt)
      return {
        id: session.id || `WORK-SESSION-${index + 1}`,
        adminName: session.adminName || 'Admin User',
        adminEmail: session.adminEmail || '--',
        adminLevel: normalizeAdminLevel(session.adminLevel || ADMIN_LEVELS.SUPER),
        adminLevelLabel: getAdminLevelLabel(session.adminLevel || ADMIN_LEVELS.SUPER),
        clockInAt,
        clockOutAt,
        clockInMs,
        clockOutMs,
        durationMs,
        dateKey,
        dateMs: getLocalDateMsFromDateKey(dateKey),
        sessionStatus: getWorkSessionStatus(session),
      }
    })
  ), [scopedSessions, nowMs])

  const aggregatedRows = useMemo(() => {
    const byAdminDay = new Map()
    const statusRank = { Completed: 0, Paused: 1, Active: 2 }

    sessionRows.forEach((session) => {
      const groupKey = `${session.adminEmail || session.adminName}__${session.dateKey}`
      const existing = byAdminDay.get(groupKey)
      if (!existing) {
        byAdminDay.set(groupKey, {
          id: `WORK-DAY-${groupKey}`,
          adminName: session.adminName,
          adminEmail: session.adminEmail,
          adminLevel: session.adminLevel,
          adminLevelLabel: session.adminLevelLabel,
          dateKey: session.dateKey,
          dateMs: session.dateMs,
          dateLabel: formatLocalDateKey(session.dateKey),
          sessionCount: 1,
          totalDurationMs: session.durationMs,
          totalDurationLabel: formatWorkDuration(session.durationMs),
          paidBreakMs: 0,
          paidBreakApplied: false,
          firstClockInAt: session.clockInAt,
          firstClockInMs: session.clockInMs,
          lastClockOutAt: session.clockOutAt,
          lastClockOutMs: session.clockOutMs,
          status: session.sessionStatus,
          statusRank: statusRank[session.sessionStatus] ?? 0,
          sourceSessions: [session],
        })
        return
      }

      existing.sessionCount += 1
      existing.totalDurationMs += session.durationMs
      existing.sourceSessions.push(session)
      if (session.clockInMs > 0 && (existing.firstClockInMs <= 0 || session.clockInMs < existing.firstClockInMs)) {
        existing.firstClockInMs = session.clockInMs
        existing.firstClockInAt = session.clockInAt
      }
      if (session.clockOutMs > existing.lastClockOutMs) {
        existing.lastClockOutMs = session.clockOutMs
        existing.lastClockOutAt = session.clockOutAt
      }
      const nextRank = statusRank[session.sessionStatus] ?? 0
      if (nextRank > existing.statusRank) {
        existing.statusRank = nextRank
        existing.status = session.sessionStatus
      }
    })

    return [...byAdminDay.values()].map((row) => ({
      ...row,
      paidBreakMs: getPaidBreakBonusMsForSessions(row.sourceSessions, row.dateKey, nowMs),
    }))
      .map((row) => {
        const totalDurationWithBreakMs = row.totalDurationMs + row.paidBreakMs
        return {
          ...row,
          totalDurationMs: totalDurationWithBreakMs,
          totalDurationLabel: formatWorkDuration(totalDurationWithBreakMs),
          paidBreakApplied: row.paidBreakMs > 0,
          lastClockOutAt: row.status === 'Completed' ? row.lastClockOutAt : '',
          lastClockOutMs: row.status === 'Completed' ? row.lastClockOutMs : 0,
        }
      })
  }, [sessionRows, nowMs])

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    const nowTimestamp = Date.now()
    return aggregatedRows.filter((row) => {
      if (normalizedSearch) {
        const haystack = [
          row.adminName,
          row.adminEmail,
          row.adminLevelLabel,
          row.dateLabel,
          row.status,
          String(row.sessionCount || ''),
          formatTimestamp(row.firstClockInAt),
          formatTimestamp(row.lastClockOutAt),
        ].join(' ').toLowerCase()
        if (!haystack.includes(normalizedSearch)) return false
      }
      if (canViewAllWorkers && levelFilter !== 'all' && row.adminLevel !== levelFilter) return false
      if (statusFilter !== 'all' && row.status.toLowerCase() !== statusFilter) return false
      if (dateFilter === 'today') {
        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)
        if (row.dateMs < startOfToday.getTime()) return false
      }
      if (dateFilter === 'last7' && row.dateMs < (nowTimestamp - (7 * 24 * 60 * 60 * 1000))) return false
      if (dateFilter === 'last30' && row.dateMs < (nowTimestamp - (30 * 24 * 60 * 60 * 1000))) return false
      return true
    })
  }, [aggregatedRows, canViewAllWorkers, dateFilter, levelFilter, searchTerm, statusFilter])

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows]
    rows.sort((left, right) => {
      if (sortField === 'admin') {
        return left.adminName.localeCompare(right.adminName)
      }
      if (sortField === 'level') {
        return left.adminLevelLabel.localeCompare(right.adminLevelLabel)
      }
      if (sortField === 'duration') {
        return left.totalDurationMs - right.totalDurationMs
      }
      if (sortField === 'status') {
        return left.status.localeCompare(right.status)
      }
      if (sortField === 'sessions') {
        return left.sessionCount - right.sessionCount
      }
      return left.dateMs - right.dateMs
    })
    if (sortDirection === 'desc') rows.reverse()
    return rows
  }, [filteredRows, sortDirection, sortField])

  const totalDurationMs = useMemo(
    () => sortedRows.reduce((total, row) => total + row.totalDurationMs, 0),
    [sortedRows],
  )
  const openRowsCount = useMemo(
    () => sortedRows.filter((row) => row.status === 'Active' || row.status === 'Paused').length,
    [sortedRows],
  )
  const clockInCount = useMemo(
    () => sortedRows.reduce((total, row) => total + row.sessionCount, 0),
    [sortedRows],
  )
  const personalRows = useMemo(() => (
    sortedRows.filter((row) => String(row?.adminEmail || '').trim().toLowerCase() === normalizedAdminEmail)
  ), [normalizedAdminEmail, sortedRows])
  const personalDurationMs = useMemo(
    () => personalRows.reduce((total, row) => total + row.totalDurationMs, 0),
    [personalRows],
  )
  const personalClockInCount = useMemo(
    () => personalRows.reduce((total, row) => total + row.sessionCount, 0),
    [personalRows],
  )
  const personalOpenRowsCount = useMemo(
    () => personalRows.filter((row) => row.status === 'Active' || row.status === 'Paused').length,
    [personalRows],
  )

  const exportRowsToExcel = async () => {
    const exportRows = sortedRows.map((row, index) => ({
      'S/N': index + 1,
      'Admin Name': row.adminName,
      'Admin Email': row.adminEmail,
      'Admin Level': row.adminLevelLabel,
      Date: row.dateLabel,
      'Clock-ins': row.sessionCount,
      'First Clock In': formatTimestamp(row.firstClockInAt),
      'Last Clock Out': row.lastClockOutAt ? formatTimestamp(row.lastClockOutAt) : '--',
      'Break Credit': row.paidBreakApplied ? '1h (Clocked before 1 PM)' : '0h',
      Duration: row.totalDurationLabel,
      'Duration (Hours)': Number((row.totalDurationMs / 3600000).toFixed(2)),
      Status: row.status,
    }))
    await downloadObjectRowsAsXlsx({
      rows: exportRows,
      sheetName: 'Admin Work Hours',
      fileName: `admin-work-hours-${new Date().toISOString().slice(0, 10)}.xlsx`,
    })
  }

  const getStatusTone = (status) => (
    status === 'Active'
      ? 'bg-warning-bg text-warning'
      : status === 'Paused'
        ? 'bg-info-bg text-primary'
        : 'bg-success-bg text-success'
  )

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">Admin Work Hours</h2>
          <p className="text-sm text-text-muted mt-1">
            {canViewAllWorkers
              ? 'Workforce and personal hour summaries for Super Admin and Area Accountant.'
              : 'Your personal work-hour summary and sessions.'}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-border-light bg-white px-3 py-2">
          <Clock className="w-4 h-4 text-primary" />
          <span className="text-xs text-text-secondary">
            Signed in as {normalizedAdmin.fullName || 'Admin User'} ({getAdminLevelLabel(normalizedAdmin.adminLevel)}) / Scope: {canViewAllWorkers ? 'All Workers + Personal' : 'Personal Only'}
          </span>
        </div>
      </div>

      {canViewAllWorkers ? (
        <div className="space-y-4 mb-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted mb-2">Workers Summary</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Workday Rows</p>
                <p className="text-xl font-semibold text-text-primary mt-1">{sortedRows.length}</p>
              </div>
              <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Open Rows</p>
                <p className="text-xl font-semibold text-warning mt-1">{openRowsCount}</p>
              </div>
              <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Clock-ins</p>
                <p className="text-xl font-semibold text-text-primary mt-1">{clockInCount}</p>
              </div>
              <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Total Duration</p>
                <p className="text-xl font-semibold text-primary mt-1">{formatWorkDuration(totalDurationMs)}</p>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted mb-2">My Personal Summary</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">My Workday Rows</p>
                <p className="text-xl font-semibold text-text-primary mt-1">{personalRows.length}</p>
              </div>
              <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">My Open Rows</p>
                <p className="text-xl font-semibold text-warning mt-1">{personalOpenRowsCount}</p>
              </div>
              <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">My Clock-ins</p>
                <p className="text-xl font-semibold text-text-primary mt-1">{personalClockInCount}</p>
              </div>
              <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">My Total Duration</p>
                <p className="text-xl font-semibold text-primary mt-1">{formatWorkDuration(personalDurationMs)}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
            <p className="text-xs uppercase tracking-wide text-text-muted">My Workday Rows</p>
            <p className="text-xl font-semibold text-text-primary mt-1">{sortedRows.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
            <p className="text-xs uppercase tracking-wide text-text-muted">My Open Rows</p>
            <p className="text-xl font-semibold text-warning mt-1">{openRowsCount}</p>
          </div>
          <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
            <p className="text-xs uppercase tracking-wide text-text-muted">My Clock-ins</p>
            <p className="text-xl font-semibold text-text-primary mt-1">{clockInCount}</p>
          </div>
          <div className="bg-white rounded-lg shadow-card border border-border-light p-4">
            <p className="text-xs uppercase tracking-wide text-text-muted">My Total Duration</p>
            <p className="text-xl font-semibold text-primary mt-1">{formatWorkDuration(totalDurationMs)}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-card border border-border-light p-4 mb-5">
        <p className="text-xs text-text-muted mb-3">
          Break hour (1:00 PM - 2:00 PM) is credited once per day when the admin clocked in before 1:00 PM (local timezone).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <div className="xl:col-span-2 relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search admin name, email, status..."
              className="w-full h-10 pl-9 pr-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            />
          </div>
          {canViewAllWorkers ? (
            <select
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value)}
              className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            >
              <option value="all">All Levels</option>
              {levelOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            <div className="h-10 px-3 border border-border-light rounded-md text-sm text-text-muted inline-flex items-center bg-background">
              Personal scope only
            </div>
          )}
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
          </select>
          <button
            type="button"
            onClick={() => void exportRowsToExcel()}
            className="h-10 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-light inline-flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <select
            value={sortField}
            onChange={(event) => setSortField(event.target.value)}
            className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="date">Sort: Date</option>
            <option value="admin">Sort: Admin Name</option>
            <option value="level">Sort: Admin Level</option>
            <option value="duration">Sort: Duration</option>
            <option value="sessions">Sort: Clock-ins</option>
            <option value="status">Sort: Status</option>
          </select>
          <select
            value={sortDirection}
            onChange={(event) => setSortDirection(event.target.value)}
            className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setSearchTerm('')
              setLevelFilter('all')
              setStatusFilter('all')
              setDateFilter('all')
              setSortField('date')
              setSortDirection('desc')
            }}
            className="h-10 px-3 border border-border rounded-md text-sm text-text-primary hover:bg-background"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="md:hidden space-y-3">
        {sortedRows.map((row, index) => (
          <div key={row.id} className="bg-white rounded-lg shadow-card border border-border-light p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-text-primary">{index + 1}. {row.adminName}</p>
                <p className="text-xs text-text-muted mt-0.5">{row.adminEmail}</p>
              </div>
              <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${getStatusTone(row.status)}`}>
                {row.status}
              </span>
            </div>
            <div className="mt-3 space-y-1.5 text-xs text-text-secondary">
              <p><span className="text-text-muted">Level:</span> {row.adminLevelLabel}</p>
              <p><span className="text-text-muted">Date:</span> {row.dateLabel}</p>
              <p><span className="text-text-muted">Clock-ins:</span> {row.sessionCount}</p>
              <p><span className="text-text-muted">First Clock In:</span> {formatTimestamp(row.firstClockInAt)}</p>
              <p><span className="text-text-muted">Last Clock Out:</span> {row.lastClockOutAt ? formatTimestamp(row.lastClockOutAt) : '--'}</p>
              <p><span className="text-text-muted">Break Credit:</span> {row.paidBreakApplied ? '1h' : '0h'}</p>
              <p><span className="text-text-muted">Duration:</span> {row.totalDurationLabel}</p>
            </div>
          </div>
        ))}
        {sortedRows.length === 0 && (
          <div className="bg-white rounded-lg shadow-card border border-border-light p-4 text-sm text-text-muted text-center">
            No work-session record found for this filter set.
          </div>
        )}
      </div>

      <div className="hidden md:block bg-white rounded-lg shadow-card border border-border-light">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="bg-[#F9FAFB]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">S/N</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Admin</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Level</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Clock-ins</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">First In</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Last Out</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Break Credit</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, index) => (
                <tr key={row.id} className="border-b border-border-light hover:bg-[#F9FAFB]">
                  <td className="px-4 py-3.5 text-sm text-text-secondary">{index + 1}</td>
                  <td className="px-4 py-3.5 text-sm font-medium text-text-primary">{row.adminName}</td>
                  <td className="px-4 py-3.5 text-sm text-text-secondary">{row.adminEmail}</td>
                  <td className="px-4 py-3.5 text-sm text-text-secondary">{row.adminLevelLabel}</td>
                  <td className="px-4 py-3.5 text-sm text-text-secondary">{row.dateLabel}</td>
                  <td className="px-4 py-3.5 text-sm text-text-secondary">{row.sessionCount}</td>
                  <td className="px-4 py-3.5 text-sm text-text-secondary">{formatTimestamp(row.firstClockInAt)}</td>
                  <td className="px-4 py-3.5 text-sm text-text-secondary">{row.lastClockOutAt ? formatTimestamp(row.lastClockOutAt) : '--'}</td>
                  <td className="px-4 py-3.5 text-sm text-text-secondary">{row.paidBreakApplied ? '1h' : '0h'}</td>
                  <td className="px-4 py-3.5 text-sm font-medium text-text-primary">{row.totalDurationLabel}</td>
                  <td className="px-4 py-3.5 text-sm">
                    <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${getStatusTone(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-sm text-text-muted text-center">
                    No work-session record found for this filter set.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Activity Log Page
function AdminActivityLogPage({ currentAdminAccount = null }) {
  const [logs, setLogs] = useState(() => getActivityLogsFromStorage(currentAdminAccount))
  const [scopeFilter, setScopeFilter] = useState('all')

  useEffect(() => {
    const syncLogs = () => {
      const storedLogs = getActivityLogsFromStorage(currentAdminAccount)
      setLogs(storedLogs)
    }
    syncLogs()
    const handleStorage = (event) => {
      if (!event.key || event.key === ADMIN_ACTIVITY_STORAGE_KEY) {
        syncLogs()
      }
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener(ADMIN_ACTIVITY_SYNC_EVENT, syncLogs)
    window.addEventListener('focus', syncLogs)
    const intervalId = window.setInterval(syncLogs, 4000)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(ADMIN_ACTIVITY_SYNC_EVENT, syncLogs)
      window.removeEventListener('focus', syncLogs)
      window.clearInterval(intervalId)
    }
  }, [currentAdminAccount])

  const getActionStyle = (action) => {
    if (action.includes('Approved')) return 'bg-success-bg text-success'
    if (action.includes('Rejected')) return 'bg-error-bg text-error'
    if (action.includes('Commented')) return 'bg-info-bg text-primary'
    if (action.includes('Sent bulk')) return 'bg-warning-bg text-warning'
    if (action.includes('Sent targeted')) return 'bg-primary-tint text-primary'
    return 'bg-background text-text-secondary'
  }
  const filteredLogs = useMemo(() => {
    const normalizedFilter = String(scopeFilter || 'all').trim().toLowerCase()
    if (normalizedFilter === 'all') return logs
    return logs.filter((log) => {
      const level = normalizeAdminLevel(log?.adminLevel || ADMIN_LEVELS.SUPER)
      if (normalizedFilter === 'owner') return isOwnerAdminLevel(level)
      if (normalizedFilter === 'super') return isSuperAdminLevel(level)
      if (normalizedFilter === 'area_accountant') return level === ADMIN_LEVELS.AREA_ACCOUNTANT
      if (normalizedFilter === 'customer_service') return level === ADMIN_LEVELS.CUSTOMER_SERVICE
      if (normalizedFilter === 'technical_support') return level === ADMIN_LEVELS.TECHNICAL_SUPPORT
      return false
    })
  }, [logs, scopeFilter])

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
        <h2 className="text-2xl font-semibold text-text-primary">System Activity Log</h2>
        <p className="text-sm text-text-muted">Audit trail for all admin actions</p>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { id: 'all', label: 'All' },
          { id: 'owner', label: 'Owner' },
          { id: 'super', label: 'Super Admin' },
          { id: 'area_accountant', label: 'Area Accountant' },
          { id: 'customer_service', label: 'Customer Service' },
          { id: 'technical_support', label: 'Technical Support' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setScopeFilter(item.id)}
            className={`h-8 px-3 rounded-md text-xs font-medium border transition-colors ${
              scopeFilter === item.id
                ? 'bg-primary-tint text-primary border-primary/35'
                : 'bg-white text-text-secondary border-border hover:bg-background'
            }`}
          >
            {item.label}
          </button>
        ))}
        <span className="text-xs text-text-muted ml-1">{filteredLogs.length} log(s)</span>
      </div>

      <div className="md:hidden space-y-3">
        {filteredLogs.map((log) => (
          <div key={log.id} className="bg-white rounded-lg shadow-card border border-border-light p-4">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Clock className="w-3.5 h-3.5" />
              {log.timestamp}
            </div>
            <p className="text-sm font-semibold text-text-primary mt-2">{log.adminName}</p>
            <div className="mt-2">
              <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${getActionStyle(log.action)}`}>
                {log.action}
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-2">
              <span className="text-text-muted">Admin Level:</span> {log.adminLevelLabel || getAdminLevelLabel(log.adminLevel || ADMIN_LEVELS.SUPER)}
            </p>
            <p className="text-xs text-text-secondary mt-2"><span className="text-text-muted">Affected:</span> {log.affectedUser}</p>
            {log.impersonatedBy && (
              <p className="text-xs text-text-secondary mt-1"><span className="text-text-muted">Impersonated By:</span> {log.impersonatedBy}</p>
            )}
            <p className="text-xs text-text-secondary mt-1"><span className="text-text-muted">Details:</span> {log.details}</p>
          </div>
        ))}
        {filteredLogs.length === 0 && (
          <div className="bg-white rounded-lg shadow-card border border-border-light p-4 text-sm text-text-muted text-center">
            No activity found for this section.
          </div>
        )}
      </div>

      <div className="hidden md:block bg-white rounded-lg shadow-card border border-border-light">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px]">
          <thead>
            <tr className="bg-[#F9FAFB]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Timestamp</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Admin</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Admin Level</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Action</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Affected User(s)</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Impersonated By</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id} className="border-b border-border-light hover:bg-[#F9FAFB]">
                <td className="px-4 py-3.5 text-sm text-text-secondary">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-text-muted" />
                    {log.timestamp}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-sm font-medium">{log.adminName}</td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">
                  {log.adminLevelLabel || getAdminLevelLabel(log.adminLevel || ADMIN_LEVELS.SUPER)}
                </td>
                <td className="px-4 py-3.5 text-sm">
                  <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${getActionStyle(log.action)}`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-sm">{log.affectedUser}</td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{log.impersonatedBy || '--'}</td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{log.details}</td>
              </tr>
            ))}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-sm text-text-muted text-center">No activity found for this section.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

export {
  canAccessAdminPage,
  hydrateAdminDashboardStorageFromBackend,
  AdminSidebar,
  AdminTopBar,
  AdminDashboardPage,
  AdminClientsPage,
  AdminClientProfilePage,
  AdminClientDocumentsPage,
  AdminClientUploadHistoryPage,
  AdminClientResolvedDocumentsPage,
  AdminDocumentReviewCenter,
  AdminSupportLeadsPage,
  AdminTrashPage,
  AdminCommunicationsCenter,
  AdminSendNotificationPage,
  AdminWorkHoursPage,
  AdminActivityLogPage,
}
