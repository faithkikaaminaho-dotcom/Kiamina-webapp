import { useEffect, useMemo, useState } from 'react'
import {
  ShieldCheck,
  Users,
  UserPlus,
  Mail,
  Copy,
  ArrowLeftRight,
  AlertCircle,
  CheckCircle,
  Ban,
  Trash2,
  KeyRound,
  Info,
  LogOut,
  Loader2,
} from 'lucide-react'
import DotLottiePreloader from '../../common/DotLottiePreloader'
import {
  ADMIN_LEVELS,
  ADMIN_PERMISSION_DEFINITIONS,
  getDefaultPermissionsForAdminLevel,
  getAdminLevelLabel,
  getEffectiveAdminPermissions,
  isOwnerAdminLevel,
  normalizeAdminLevel,
  normalizeAdminAccount,
  normalizeAdminInvite,
  normalizeRoleWithLegacyFallback,
  sanitizeAdminPermissions,
  isAdminAccount,
  isAdminInvitePending,
} from '../adminIdentity'
import {
  getClientAssignmentsForClientEmail,
  readClientAssignmentsFromStorage,
  setClientAssignmentsForClient,
} from '../adminAssignments'
import { getNetworkAwareDurationMs } from '../../../utils/networkRuntime'
import { verifyIdentityWithDojah } from '../../../utils/dojahIdentity'
import { apiFetch, clearApiAccessToken, clearApiSessionId } from '../../../utils/apiClient'
import {
  DEFAULT_ADMIN_SECURITY_PREFERENCES,
  getAdminSecurityStorageKey,
  normalizeAdminSecurityPreferences,
} from '../../../utils/adminSecurityPreferences'

const ACCOUNTS_STORAGE_KEY = 'kiaminaAccounts'
const ADMIN_INVITES_STORAGE_KEY = 'kiaminaAdminInvites'
const ADMIN_ACTIVITY_STORAGE_KEY = 'kiaminaAdminActivityLog'
const ADMIN_SETTINGS_STORAGE_KEY = 'kiaminaAdminSettings'
const ADMIN_TRASH_STORAGE_KEY = 'kiaminaAdminTrash'
const CLIENT_SESSION_CONTROL_STORAGE_KEY = 'kiaminaClientSessionControl'
const ADMIN_CLIENT_MANAGEMENT_SYNC_EVENT = 'kiamina:admin-client-management-sync'
const ADMIN_ACTIVITY_SYNC_EVENT = 'kiamina:admin-activity-sync'
const ADMIN_INVITE_EXPIRY_HOURS = 48
const adminEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const maskPhoneNumber = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length <= 4) return value || 'your registered phone number'
  return `*** *** ${digits.slice(-4)}`
}

const passwordStrengthRegex = /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
const waitForNetworkAwareDelay = () => new Promise((resolve) => {
  if (typeof window === 'undefined') {
    resolve()
    return
  }
  window.setTimeout(resolve, getNetworkAwareDurationMs('search'))
})
const generateStrongPassword = (length = 14) => {
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const numbers = '23456789'
  const special = '!@#$%^&*_-+=?'
  const allChars = `${lower}${upper}${numbers}${special}`
  const safeLength = Number.isFinite(length) ? Math.max(8, Math.min(64, Math.floor(length))) : 14

  const nextRandomIndex = (max) => {
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const randomValues = new Uint32Array(1)
      window.crypto.getRandomValues(randomValues)
      return randomValues[0] % max
    }
    return Math.floor(Math.random() * max)
  }

  const requiredChars = [
    lower[nextRandomIndex(lower.length)],
    upper[nextRandomIndex(upper.length)],
    numbers[nextRandomIndex(numbers.length)],
    special[nextRandomIndex(special.length)],
  ]
  const generated = [...requiredChars]
  while (generated.length < safeLength) {
    generated.push(allChars[nextRandomIndex(allChars.length)])
  }
  for (let index = generated.length - 1; index > 0; index -= 1) {
    const swapIndex = nextRandomIndex(index + 1)
    const current = generated[index]
    generated[index] = generated[swapIndex]
    generated[swapIndex] = current
  }

  return generated.join('')
}

const readArrayFromStorage = (key) => {
  try {
    const savedValue = localStorage.getItem(key)
    const parsedValue = savedValue ? JSON.parse(savedValue) : []
    return Array.isArray(parsedValue) ? parsedValue : []
  } catch {
    return []
  }
}

const writeArrayToStorage = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value))
}

const normalizeStoredAccounts = (accounts) => accounts.map((account) => {
  const normalizedRole = normalizeRoleWithLegacyFallback(account.role, account.email || '')
  if (normalizedRole !== 'admin') return { ...account, role: normalizedRole }
  return normalizeAdminAccount(account)
})

const readAccounts = () => normalizeStoredAccounts(readArrayFromStorage(ACCOUNTS_STORAGE_KEY))
const writeAccounts = (accounts) => writeArrayToStorage(ACCOUNTS_STORAGE_KEY, normalizeStoredAccounts(accounts))

const readInvites = () => readArrayFromStorage(ADMIN_INVITES_STORAGE_KEY).map(normalizeAdminInvite)
const writeInvites = (invites) => writeArrayToStorage(ADMIN_INVITES_STORAGE_KEY, invites.map(normalizeAdminInvite))

const getAdminAccounts = (accounts) => accounts.filter((account) => isAdminAccount(account))
const getClientAccounts = (accounts) => (
  accounts
    .filter((account) => normalizeRoleWithLegacyFallback(account.role, account.email || '') === 'client')
    .sort((left, right) => String(left.fullName || left.email || '').localeCompare(String(right.fullName || right.email || '')))
)

const mapBackendClientToSettingsAccount = (entry = {}) => {
  const normalizedEmail = String(entry?.email || '').trim().toLowerCase()
  const clientProfile = entry?.clientProfile && typeof entry.clientProfile === 'object' ? entry.clientProfile : {}
  const entityProfile = entry?.entityProfile && typeof entry.entityProfile === 'object' ? entry.entityProfile : {}
  const clientWorkspace = entry?.clientWorkspace && typeof entry.clientWorkspace === 'object' ? entry.clientWorkspace : {}
  const settingsProfile = clientWorkspace?.settingsProfile && typeof clientWorkspace.settingsProfile === 'object'
    ? clientWorkspace.settingsProfile
    : {}
  const fullName = String(
    entry?.displayName
    || clientProfile?.fullName
    || settingsProfile?.fullName
    || normalizedEmail
    || ''
  ).trim()
  const businessName = String(
    entry?.businessName
    || entityProfile?.businessName
    || settingsProfile?.businessName
    || ''
  ).trim()

  return {
    uid: String(entry?.uid || '').trim(),
    email: normalizedEmail,
    fullName,
    businessName,
    status: String(entry?.status || 'active').trim().toLowerCase() || 'active',
    verificationStatus: String(entry?.verificationStatus || '').trim(),
    onboardingCompleted: Boolean(entry?.onboardingCompleted),
    role: 'client',
    createdAt: entry?.createdAt || '',
    updatedAt: entry?.updatedAt || '',
  }
}

const normalizeBackendClientSettingsAccounts = (clients = []) => (
  (Array.isArray(clients) ? clients : [])
    .map((entry) => mapBackendClientToSettingsAccount(entry))
    .filter((account) => account.email)
    .sort((left, right) => String(left.fullName || left.email || '').localeCompare(String(right.fullName || right.email || '')))
)

const readPersistedAuthUser = () => {
  if (typeof window === 'undefined') return null
  try {
    const sessionUser = sessionStorage.getItem('kiaminaAuthUser')
    if (sessionUser) {
      return {
        storageType: 'session',
        user: JSON.parse(sessionUser),
      }
    }
  } catch {
    // Ignore malformed session auth payloads.
  }

  try {
    const persistentUser = localStorage.getItem('kiaminaAuthUser')
    return persistentUser
      ? {
          storageType: 'local',
          user: JSON.parse(persistentUser),
        }
      : null
  } catch {
    return null
  }
}

const writePersistedAuthUser = (nextUser, storageType = 'local') => {
  if (typeof window === 'undefined' || !nextUser || typeof nextUser !== 'object') return
  const serialized = JSON.stringify(nextUser)
  if (storageType === 'session') {
    sessionStorage.setItem('kiaminaAuthUser', serialized)
    return
  }
  localStorage.setItem('kiaminaAuthUser', serialized)
}

const mergeBackendAdminAccountsIntoLocal = (staff = []) => {
  const existingAccounts = readAccounts()
  const nonAdminAccounts = existingAccounts.filter((account) => !isAdminAccount(account))
  const existingAdminByEmail = new Map(
    getAdminAccounts(existingAccounts)
      .map((account) => [String(account.email || '').trim().toLowerCase(), account]),
  )

  const nextAdminAccounts = (Array.isArray(staff) ? staff : [])
    .map((entry) => {
      const normalizedEmail = String(entry?.email || '').trim().toLowerCase()
      if (!normalizedEmail) return null
      const existingAccount = existingAdminByEmail.get(normalizedEmail) || {}
      const backendSecurityPreferences = entry?.dashboardSecurityPreferences && typeof entry.dashboardSecurityPreferences === 'object'
        ? entry.dashboardSecurityPreferences
        : undefined
      return normalizeAdminAccount({
        ...existingAccount,
        uid: String(entry?.uid || existingAccount.uid || '').trim(),
        email: normalizedEmail,
        fullName: String(
          entry?.adminProfile?.displayName
          || entry?.displayName
          || existingAccount.fullName
          || normalizedEmail.split('@')[0]
          || 'Admin User'
        ).trim(),
        role: 'admin',
        status: String(entry?.status || existingAccount.status || 'active').trim().toLowerCase() || 'active',
        adminLevel: String(entry?.adminAccess?.adminLevel || existingAccount.adminLevel || '').trim(),
        adminPermissions: Array.isArray(entry?.adminAccess?.adminPermissions)
          ? entry.adminAccess.adminPermissions
          : existingAccount.adminPermissions,
        mustChangePassword: Boolean(entry?.adminAccess?.mustChangePassword),
        roleInCompany: String(entry?.adminProfile?.jobTitle || existingAccount.roleInCompany || '').trim(),
        department: String(entry?.adminProfile?.department || existingAccount.department || '').trim(),
        phoneNumber: String(entry?.adminProfile?.phone || existingAccount.phoneNumber || '').trim(),
        adminSecurityPreferences: backendSecurityPreferences || existingAccount.adminSecurityPreferences,
        createdAt: entry?.createdAt || existingAccount.createdAt || '',
        updatedAt: entry?.updatedAt || existingAccount.updatedAt || '',
      })
    })
    .filter(Boolean)

  writeAccounts([...nonAdminAccounts, ...nextAdminAccounts])
  return nextAdminAccounts
}

const createInviteToken = () => (
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
)

const formatDateTime = (value) => {
  const parsedTime = Date.parse(value || '')
  if (!Number.isFinite(parsedTime)) return '--'
  return new Date(parsedTime).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

const getAdminInviteExpiryIso = () => (
  new Date(Date.now() + (ADMIN_INVITE_EXPIRY_HOURS * 60 * 60 * 1000)).toISOString()
)
const ADMIN_GOV_ID_TYPES_NIGERIA = ['International Passport', 'NIN', "Voter's Card", "Driver's Licence"]
const ADMIN_GOV_ID_TYPE_INTERNATIONAL = 'Government Issued ID'
const PHONE_COUNTRY_CODE_OPTIONS = [
  { value: '+234', label: 'NG +234' },
  { value: '+1', label: 'US/CA +1' },
  { value: '+44', label: 'UK +44' },
  { value: '+61', label: 'AU +61' },
]
const normalizeAdminVerificationCountry = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized || normalized === 'nigeria') return 'Nigeria'
  return 'International'
}
const getAdminGovernmentIdOptions = (country = 'Nigeria') => (
  country === 'Nigeria'
    ? ADMIN_GOV_ID_TYPES_NIGERIA
    : [ADMIN_GOV_ID_TYPE_INTERNATIONAL]
)
const normalizeAdminGovernmentIdType = (value = '', country = 'Nigeria') => {
  const normalizedValue = String(value || '').trim().toLowerCase()
  if (!normalizedValue) return ''
  const options = getAdminGovernmentIdOptions(country)
  return options.find((option) => option.toLowerCase() === normalizedValue) || ''
}
const resolvePhoneParts = (value = '', fallbackCode = '+234') => {
  const raw = String(value || '').trim()
  const option = PHONE_COUNTRY_CODE_OPTIONS.find((item) => raw.startsWith(item.value))
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
    code: option.value,
    number: raw.slice(option.value.length).trim(),
  }
}
const formatPhoneNumber = (code = '+234', number = '') => {
  const normalizedCode = String(code || '').trim() || '+234'
  const normalizedNumber = String(number || '').trim()
  if (!normalizedNumber) return ''
  return `${normalizedCode} ${normalizedNumber}`.trim()
}

const getProfileStorageKey = (email = '') => `kiaminaAdminProfile:${email.trim().toLowerCase()}`
const getClientSessionControl = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CLIENT_SESSION_CONTROL_STORAGE_KEY) || '{}')
    const byEmail = parsed?.byEmail && typeof parsed.byEmail === 'object' ? parsed.byEmail : {}
    return {
      globalLogoutAtIso: parsed?.globalLogoutAtIso || '',
      byEmail,
      updatedAtIso: parsed?.updatedAtIso || '',
      updatedBy: parsed?.updatedBy || '',
    }
  } catch {
    return {
      globalLogoutAtIso: '',
      byEmail: {},
      updatedAtIso: '',
      updatedBy: '',
    }
  }
}
const writeClientSessionControl = (value) => {
  localStorage.setItem(CLIENT_SESSION_CONTROL_STORAGE_KEY, JSON.stringify(value))
}

const appendActivityLog = (entry) => {
  const existingLogs = readArrayFromStorage(ADMIN_ACTIVITY_STORAGE_KEY)
  const nextLogs = [
    {
      id: `LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...entry,
    },
    ...existingLogs,
  ]
  writeArrayToStorage(ADMIN_ACTIVITY_STORAGE_KEY, nextLogs)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ADMIN_ACTIVITY_SYNC_EVENT))
    window.dispatchEvent(new Event('kiamina:admin-dashboard-realtime-sync'))
  }
}

const appendAdminTrashEntry = (entry = {}) => {
  const existingEntries = readArrayFromStorage(ADMIN_TRASH_STORAGE_KEY)
  const nextEntry = {
    id: entry.id || `TRASH-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`,
    entityType: entry.entityType || 'unknown',
    entityLabel: entry.entityLabel || 'Deleted Item',
    description: entry.description || '',
    deletedByName: entry.deletedByName || 'Admin User',
    deletedAtIso: entry.deletedAtIso || new Date().toISOString(),
    payload: entry.payload && typeof entry.payload === 'object' ? entry.payload : {},
  }
  writeArrayToStorage(ADMIN_TRASH_STORAGE_KEY, [nextEntry, ...existingEntries])
}

const getAdminSettings = () => {
  try {
    const saved = localStorage.getItem(ADMIN_SETTINGS_STORAGE_KEY)
    if (!saved) {
      return {
        allowSelfSignup: false,
        enforceMfa: true,
        auditRetentionDays: '90',
        impersonationEnabled: true,
      }
    }
    const parsed = JSON.parse(saved)
    return {
      allowSelfSignup: Boolean(parsed.allowSelfSignup),
      enforceMfa: parsed.enforceMfa !== false,
      auditRetentionDays: `${parsed.auditRetentionDays || '90'}`,
      impersonationEnabled: parsed.impersonationEnabled !== false,
    }
  } catch {
    return {
      allowSelfSignup: false,
      enforceMfa: true,
      auditRetentionDays: '90',
      impersonationEnabled: true,
    }
  }
}

function AdminSettingsPage({
  showToast,
  currentAdminAccount,
  runWithSlowRuntimeWatch,
  onCurrentAdminEmailUpdated,
  onRequestAdminImpersonation,
}) {
  const currentAdmin = useMemo(
    () => normalizeAdminAccount(currentAdminAccount || {}),
    [currentAdminAccount],
  )
  const currentAdminLevel = currentAdmin.adminLevel || ADMIN_LEVELS.SUPER
  const isOwnerAdmin = isOwnerAdminLevel(currentAdminLevel)
  const isSuperAdmin = currentAdminLevel === ADMIN_LEVELS.SUPER
  const canManagePrivilegedAdminActions = isOwnerAdmin || isSuperAdmin

  const [adminAccounts, setAdminAccounts] = useState(() => getAdminAccounts(readAccounts()))
  const [clientAccounts, setClientAccounts] = useState(() => getClientAccounts(readAccounts()))
  const [clientAssignments, setClientAssignments] = useState(() => readClientAssignmentsFromStorage())
  const [selectedClientEmails, setSelectedClientEmails] = useState([])
  const [adminInvites, setAdminInvites] = useState(readInvites)
  const [systemSettings, setSystemSettings] = useState(getAdminSettings)
  const [lockedFieldNotice, setLockedFieldNotice] = useState('')
  const [formError, setFormError] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [generatedInviteLink, setGeneratedInviteLink] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [permissionEditor, setPermissionEditor] = useState(null)
  const [createdAdminCredentialPacket, setCreatedAdminCredentialPacket] = useState(null)

  const [profileForm, setProfileForm] = useState({
    fullName: currentAdmin.fullName || '',
    email: currentAdmin.email || '',
    roleInCompany: currentAdmin.roleInCompany || '',
    department: currentAdmin.department || '',
    phoneCountryCode: resolvePhoneParts(currentAdmin.phoneNumber || '').code,
    phoneNumber: resolvePhoneParts(currentAdmin.phoneNumber || '').number,
  })

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [emailChangeForm, setEmailChangeForm] = useState({
    nextEmail: '',
    otpCode: '',
  })
  const [emailChangeChallenge, setEmailChangeChallenge] = useState(null)

  const [securityForm, setSecurityForm] = useState({
    ...DEFAULT_ADMIN_SECURITY_PREFERENCES,
  })

  const [createAdminForm, setCreateAdminForm] = useState({
    fullName: '',
    email: '',
    roleInCompany: '',
    department: '',
    phoneCountryCode: '+234',
    phoneNumber: '',
    password: '',
    workCountry: 'Nigeria',
    governmentIdType: '',
    governmentIdNumber: '',
    governmentIdFile: '',
    residentialAddress: '',
    ownerPrivateKey: '',
    adminLevel: ADMIN_LEVELS.AREA_ACCOUNTANT,
    permissions: getDefaultPermissionsForAdminLevel(ADMIN_LEVELS.AREA_ACCOUNTANT),
  })
  const [isCreateAdminIdentityVerifying, setIsCreateAdminIdentityVerifying] = useState(false)
  const [createAdminIdentityVerification, setCreateAdminIdentityVerification] = useState({
    status: '',
    message: '',
  })
  const [createAdminIdUploadKey, setCreateAdminIdUploadKey] = useState(0)

  const [inviteForm, setInviteForm] = useState({
    email: '',
    adminLevel: ADMIN_LEVELS.AREA_ACCOUNTANT,
    permissions: getDefaultPermissionsForAdminLevel(ADMIN_LEVELS.AREA_ACCOUNTANT),
  })

  const deriveBackendRoleFromAdminLevel = (adminLevel = '') => {
    const normalizedLevel = normalizeAdminLevel(adminLevel)
    if (normalizedLevel === ADMIN_LEVELS.OWNER) return 'owner'
    if (normalizedLevel === ADMIN_LEVELS.SUPER) return 'superadmin'
    return 'admin'
  }

  const syncAdminStaffToBackend = async ({
    uid = '',
    status,
    adminLevel,
    permissions,
    fullName,
    roleInCompany,
    department,
    phoneNumber,
  } = {}) => {
    const normalizedUid = String(uid || '').trim()
    if (!normalizedUid) return { ok: false }

    const nameParts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ')

    try {
      const response = await apiFetch(`/api/users/admin/staff/${encodeURIComponent(normalizedUid)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(status ? { status } : {}),
          adminProfile: {
            firstName,
            lastName,
            displayName: String(fullName || '').trim(),
            jobTitle: String(roleInCompany || '').trim(),
            department: String(department || '').trim(),
            phone: String(phoneNumber || '').trim(),
            timezone: 'Africa/Lagos',
          },
          adminAccess: {
            adminLevel: normalizeAdminLevel(adminLevel),
            adminPermissions: Array.isArray(permissions) ? permissions : [],
            mustChangePassword: false,
          },
        }),
      })
      return { ok: response.ok }
    } catch {
      return { ok: false }
    }
  }

  const refreshAdminData = async () => {
    const accounts = readAccounts()
    setClientAccounts(getClientAccounts(accounts))
    setAdminInvites(readInvites())
    setClientAssignments(readClientAssignmentsFromStorage())

    try {
      const response = await apiFetch('/api/users/admin/client-management?limit=200&sortBy=updatedAt&sortOrder=desc')
      const payload = await response.json().catch(() => ({}))
      if (response.ok && Array.isArray(payload?.clients)) {
        setClientAccounts(normalizeBackendClientSettingsAccounts(payload.clients))
      }
    } catch {
      // Fall back to the local client registry below.
    }

    try {
      const response = await apiFetch('/api/users/admin/staff')
      const payload = await response.json().catch(() => ({}))
      if (response.ok && Array.isArray(payload?.staff)) {
        setAdminAccounts(mergeBackendAdminAccountsIntoLocal(payload.staff))
        return
      }
    } catch {
      // Fall back to the local mirror below.
    }

    setAdminAccounts(getAdminAccounts(readAccounts()))
  }

  useEffect(() => {
    void refreshAdminData()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleClientManagementSync = () => {
      void refreshAdminData()
    }
    const handleWindowFocus = () => {
      void refreshAdminData()
    }

    window.addEventListener(ADMIN_CLIENT_MANAGEMENT_SYNC_EVENT, handleClientManagementSync)
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      window.removeEventListener(ADMIN_CLIENT_MANAGEMENT_SYNC_EVENT, handleClientManagementSync)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [])

  useEffect(() => {
    const validClientEmailSet = new Set(
      clientAccounts
        .map((account) => account.email?.trim()?.toLowerCase())
        .filter(Boolean),
    )
    setSelectedClientEmails((previous) => previous.filter((email) => validClientEmailSet.has(email)))
  }, [clientAccounts])

  useEffect(() => {
    const normalizedEmail = currentAdmin.email?.trim()?.toLowerCase() || ''
    const phoneParts = resolvePhoneParts(currentAdmin.phoneNumber || '')
    const fallbackProfile = {
      fullName: currentAdmin.fullName || '',
      email: currentAdmin.email || '',
      roleInCompany: currentAdmin.roleInCompany || '',
      department: currentAdmin.department || '',
      phoneCountryCode: phoneParts.code,
      phoneNumber: phoneParts.number,
    }

    try {
      const savedProfile = localStorage.getItem(getProfileStorageKey(normalizedEmail))
      if (savedProfile) {
        const parsedProfile = JSON.parse(savedProfile)
        setProfileForm({
          fullName: parsedProfile.fullName || fallbackProfile.fullName,
          email: fallbackProfile.email,
          roleInCompany: parsedProfile.roleInCompany || fallbackProfile.roleInCompany,
          department: parsedProfile.department || fallbackProfile.department,
          phoneCountryCode: parsedProfile.phoneCountryCode || resolvePhoneParts(parsedProfile.phoneNumber || fallbackProfile.phoneNumber, fallbackProfile.phoneCountryCode).code,
          phoneNumber: resolvePhoneParts(parsedProfile.phoneNumber || fallbackProfile.phoneNumber, parsedProfile.phoneCountryCode || fallbackProfile.phoneCountryCode).number,
        })
      } else {
        setProfileForm(fallbackProfile)
      }
    } catch {
      setProfileForm(fallbackProfile)
    }

    try {
      const savedSecurity = localStorage.getItem(getAdminSecurityStorageKey(normalizedEmail))
      if (savedSecurity) {
        const parsedSecurity = JSON.parse(savedSecurity)
        setSecurityForm(normalizeAdminSecurityPreferences(parsedSecurity))
      } else if (currentAdmin.adminSecurityPreferences && typeof currentAdmin.adminSecurityPreferences === 'object') {
        setSecurityForm(normalizeAdminSecurityPreferences(currentAdmin.adminSecurityPreferences))
      } else {
        setSecurityForm(normalizeAdminSecurityPreferences())
      }
    } catch {
      if (currentAdmin.adminSecurityPreferences && typeof currentAdmin.adminSecurityPreferences === 'object') {
        setSecurityForm(normalizeAdminSecurityPreferences(currentAdmin.adminSecurityPreferences))
      } else {
        setSecurityForm(normalizeAdminSecurityPreferences())
      }
    }
  }, [
    currentAdmin.adminSecurityPreferences,
    currentAdmin.email,
    currentAdmin.fullName,
    currentAdmin.roleInCompany,
    currentAdmin.department,
    currentAdmin.phoneNumber,
  ])

  useEffect(() => {
    setEmailChangeForm({ nextEmail: '', otpCode: '' })
    setEmailChangeChallenge(null)
  }, [currentAdmin.email])

  const permissionDefinitions = ADMIN_PERMISSION_DEFINITIONS
  const currentAdminPermissions = getEffectiveAdminPermissions(currentAdmin)
  const areaAccountantAdmins = useMemo(
    () => adminAccounts
      .filter((account) => normalizeAdminLevel(account.adminLevel) === ADMIN_LEVELS.AREA_ACCOUNTANT)
      .filter((account) => account.status !== 'suspended')
      .sort((left, right) => String(left.fullName || left.email || '').localeCompare(String(right.fullName || right.email || ''))),
    [adminAccounts],
  )
  const assignmentByClientEmail = useMemo(
    () => {
      const map = new Map()
      clientAssignments.forEach((entry) => {
        const normalizedClientEmail = String(entry?.clientEmail || '').trim().toLowerCase()
        if (!normalizedClientEmail) return
        const existing = map.get(normalizedClientEmail) || []
        map.set(normalizedClientEmail, [...existing, entry])
      })
      return map
    },
    [clientAssignments],
  )
  const normalizePermissionSelection = (permissions = []) => (
    sanitizeAdminPermissions(permissions)
  )
  const resolvePermissionSelection = (permissions = [], fallbackLevel = ADMIN_LEVELS.AREA_ACCOUNTANT) => {
    const sanitized = normalizePermissionSelection(permissions)
    if (sanitized.length > 0) return sanitized
    return getDefaultPermissionsForAdminLevel(fallbackLevel).slice(0, 1)
  }
  const togglePermissionFromList = (sourcePermissions = [], permissionId = '') => {
    const normalizedPermissionId = String(permissionId || '').trim()
    if (!normalizedPermissionId) return normalizePermissionSelection(sourcePermissions)
    const sanitized = normalizePermissionSelection(sourcePermissions)
    if (sanitized.includes(normalizedPermissionId)) {
      return sanitized.filter((id) => id !== normalizedPermissionId)
    }
    return [...sanitized, normalizedPermissionId]
  }

  const latestPendingInvites = adminInvites
    .filter((invite) => isAdminInvitePending(invite))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 4)
  const allowDemoInvite = import.meta.env.DEV === true
  const normalizedCreateAdminWorkCountry = normalizeAdminVerificationCountry(createAdminForm.workCountry)
  const createAdminGovIdOptions = getAdminGovernmentIdOptions(normalizedCreateAdminWorkCountry)
  const isCreateAdminOwnerLevel = normalizeAdminLevel(createAdminForm.adminLevel) === ADMIN_LEVELS.OWNER

  const notify = (type, message) => {
    if (typeof showToast === 'function') showToast(type, message)
  }
  const appendScopedActivityLog = (entry = {}) => {
    appendActivityLog({
      adminName: entry.adminName || currentAdmin.fullName || 'Admin User',
      adminEmail: currentAdmin.email || '',
      adminLevel: currentAdmin.adminLevel || ADMIN_LEVELS.SUPER,
      ...entry,
    })
  }
  const copyTextToClipboard = async (value = '') => {
    const text = String(value || '')
    if (!text.trim()) return false
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch {
      // Fallback below
    }
    try {
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.setAttribute('readonly', '')
      textArea.style.position = 'absolute'
      textArea.style.left = '-9999px'
      document.body.appendChild(textArea)
      textArea.select()
      const copied = document.execCommand('copy')
      document.body.removeChild(textArea)
      return copied
    } catch {
      return false
    }
  }

  const saveProfile = async () => {
    const normalizedEmail = currentAdmin.email?.trim()?.toLowerCase()
    if (!normalizedEmail) return
    if (!profileForm.fullName.trim()) {
      setFormError('Full name is required.')
      return
    }

    const normalizedProfilePhoneNumber = formatPhoneNumber(profileForm.phoneCountryCode, profileForm.phoneNumber)
    setFormError('')

    try {
      const nameParts = profileForm.fullName.trim().split(/\s+/).filter(Boolean)
      const response = await apiFetch('/api/users/me/admin-dashboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminProfile: {
            firstName: nameParts[0] || '',
            lastName: nameParts.slice(1).join(' '),
            displayName: profileForm.fullName.trim(),
            jobTitle: profileForm.roleInCompany.trim(),
            department: profileForm.department.trim(),
            phone: normalizedProfilePhoneNumber,
            timezone: 'Africa/Lagos',
          },
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        setFormError(payload?.message || 'Unable to save admin profile right now.')
        return
      }
    } catch {
      setFormError('Unable to save admin profile right now.')
      return
    }

    const allAccounts = readAccounts()
    const matchIndex = allAccounts.findIndex((account) => account.email?.trim()?.toLowerCase() === normalizedEmail)
    if (matchIndex === -1) {
      setFormError('Unable to locate your admin account.')
      return
    }

    const nextAccounts = [...allAccounts]
    nextAccounts[matchIndex] = normalizeAdminAccount({
      ...nextAccounts[matchIndex],
      fullName: profileForm.fullName.trim(),
      roleInCompany: profileForm.roleInCompany.trim(),
      department: profileForm.department.trim(),
      phoneNumber: normalizedProfilePhoneNumber,
    })
    writeAccounts(nextAccounts)
    const updatedCurrentAdminAccount = nextAccounts[matchIndex]
    localStorage.setItem(
      getProfileStorageKey(normalizedEmail),
      JSON.stringify({
        fullName: profileForm.fullName.trim(),
        roleInCompany: profileForm.roleInCompany.trim(),
        department: profileForm.department.trim(),
        phoneCountryCode: profileForm.phoneCountryCode || '+234',
        phoneNumber: normalizedProfilePhoneNumber,
      }),
    )

    appendScopedActivityLog({
      action: 'Updated admin profile settings',
      details: normalizedEmail,
    })
    if (typeof onCurrentAdminEmailUpdated === 'function') {
      onCurrentAdminEmailUpdated({
        previousEmail: normalizedEmail,
        nextEmail: normalizedEmail,
        nextFullName: updatedCurrentAdminAccount.fullName || profileForm.fullName.trim(),
        nextRoleInCompany: updatedCurrentAdminAccount.roleInCompany || profileForm.roleInCompany.trim(),
        nextDepartment: updatedCurrentAdminAccount.department || profileForm.department.trim(),
        nextPhoneNumber: updatedCurrentAdminAccount.phoneNumber || normalizedProfilePhoneNumber,
        nextAdminLevel: updatedCurrentAdminAccount.adminLevel,
        nextAdminPermissions: updatedCurrentAdminAccount.adminPermissions,
        nextStatus: updatedCurrentAdminAccount.status,
      })
    }
    refreshAdminData()
    notify('success', 'Profile settings saved.')
  }

  const saveSystemSettings = () => {
    localStorage.setItem(ADMIN_SETTINGS_STORAGE_KEY, JSON.stringify(systemSettings))
    appendScopedActivityLog({
      action: 'Updated system settings',
      details: `MFA: ${systemSettings.enforceMfa ? 'enabled' : 'disabled'}`,
    })
    notify('success', 'System settings saved.')
  }

  const saveSecuritySettings = async () => {
    const normalizedEmail = currentAdmin.email?.trim()?.toLowerCase()
    if (!normalizedEmail) return
    const normalizedSecurityForm = normalizeAdminSecurityPreferences(securityForm)

    try {
      const response = await apiFetch('/api/users/me/admin-dashboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          securityPreferences: normalizedSecurityForm,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFormError(payload?.message || 'Unable to save security preferences right now.')
        return
      }
    } catch {
      setFormError('Unable to save security preferences right now.')
      return
    }

    localStorage.setItem(
      getAdminSecurityStorageKey(normalizedEmail),
      JSON.stringify(normalizedSecurityForm),
    )
    setSecurityForm(normalizedSecurityForm)

    const persistedAuth = readPersistedAuthUser()
    if (persistedAuth?.user && String(persistedAuth.user.email || '').trim().toLowerCase() === normalizedEmail) {
      writePersistedAuthUser({
        ...persistedAuth.user,
        adminSecurityPreferences: normalizedSecurityForm,
      }, persistedAuth.storageType)
    }

    appendScopedActivityLog({
      action: 'Updated security preferences',
      details: normalizedEmail,
    })
    notify('success', 'Security preferences saved.')
  }

  const updatePassword = async () => {
    const normalizedEmail = currentAdmin.email?.trim()?.toLowerCase()
    if (!normalizedEmail) return

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setFormError('Complete all password fields.')
      return
    }
    if (!passwordStrengthRegex.test(passwordForm.newPassword)) {
      setFormError('New password must include at least one number and one special character.')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setFormError('New password and confirm password must match.')
      return
    }

    setFormError('')
    try {
      const response = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
          confirmPassword: passwordForm.confirmPassword,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFormError(payload?.message || 'Unable to update your password right now.')
        return
      }
    } catch {
      setFormError('Unable to update your password right now.')
      return
    }

    const allAccounts = readAccounts()
    const matchIndex = allAccounts.findIndex((account) => account.email?.trim()?.toLowerCase() === normalizedEmail)
    if (matchIndex !== -1) {
      const nextAccounts = [...allAccounts]
      nextAccounts[matchIndex] = {
        ...nextAccounts[matchIndex],
        password: passwordForm.newPassword,
        mustChangePassword: false,
      }
      writeAccounts(nextAccounts)
    }
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    })
    appendScopedActivityLog({
      action: 'Changed admin password',
      details: normalizedEmail,
    })
    notify('success', 'Password updated.')
  }

  const requestEmailChangeOtp = async () => {
    if (!isSuperAdmin) {
      setFormError('Only Super Admin can change login email.')
      return
    }

    const currentEmail = currentAdmin.email?.trim()?.toLowerCase() || ''
    const nextEmail = emailChangeForm.nextEmail.trim().toLowerCase()
    const fallbackPhoneParts = resolvePhoneParts(currentAdmin.phoneNumber || '', profileForm.phoneCountryCode || '+234')
    const smsPhone = formatPhoneNumber(
      profileForm.phoneCountryCode || fallbackPhoneParts.code,
      profileForm.phoneNumber || fallbackPhoneParts.number,
    )

    if (!currentEmail) {
      setFormError('Unable to locate your current login email.')
      return
    }
    if (!nextEmail || !adminEmailRegex.test(nextEmail)) {
      setFormError('Enter a valid new login email.')
      return
    }
    if (nextEmail === currentEmail) {
      setFormError('New login email must be different from current email.')
      return
    }
    if (!smsPhone) {
      setFormError('Add a phone number in Profile Settings before requesting SMS OTP.')
      return
    }

    const allAccounts = readAccounts()
    const alreadyExists = allAccounts.some(
      (account) => account.email?.trim()?.toLowerCase() === nextEmail,
    )
    if (alreadyExists) {
      setFormError('An account with that email already exists.')
      return
    }

    setFormError('')
    setEmailChangeForm((prev) => ({ ...prev, otpCode: '' }))
    try {
      const response = await apiFetch('/api/auth/send-sms-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: smsPhone,
          purpose: 'admin-email-change',
          email: nextEmail,
          currentEmail,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFormError(payload?.message || 'Unable to send SMS OTP right now.')
        return
      }
      const expiresAt = Number(payload?.expiresAt || 0)
      setEmailChangeChallenge({
        requestId: payload?.requestId || Date.now(),
        currentEmail,
        nextEmail,
        phoneNumber: smsPhone,
        expiresAt: Number.isFinite(expiresAt) && expiresAt > Date.now()
          ? expiresAt
          : (Date.now() + (5 * 60 * 1000)),
      })
      notify('success', `SMS OTP sent to ${maskPhoneNumber(smsPhone)}.`)
    } catch {
      setFormError('SMS OTP service is unavailable. Please try again later.')
    }
  }

  const verifyEmailChangeOtpAndUpdate = async () => {
    if (!isSuperAdmin) {
      setFormError('Only Super Admin can change login email.')
      return
    }
    if (!emailChangeChallenge?.nextEmail || !emailChangeChallenge?.currentEmail) {
      setFormError('Request an SMS OTP before verification.')
      return
    }

    const code = emailChangeForm.otpCode.trim()
    if (!/^\d{6}$/.test(code)) {
      setFormError('Enter the 6-digit OTP sent to your phone.')
      return
    }
    if (Date.now() > Number(emailChangeChallenge.expiresAt || 0)) {
      setEmailChangeChallenge(null)
      setEmailChangeForm((prev) => ({ ...prev, otpCode: '' }))
      setFormError('OTP expired. Request a new SMS OTP.')
      return
    }

    try {
      const response = await apiFetch('/api/auth/verify-sms-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: emailChangeChallenge.phoneNumber,
          otp: code,
          purpose: 'admin-email-change',
          email: emailChangeChallenge.nextEmail,
          currentEmail: emailChangeChallenge.currentEmail,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFormError(payload?.message || 'Incorrect or expired OTP code.')
        return
      }
    } catch {
      setFormError('Unable to verify SMS OTP right now. Please try again later.')
      return
    }

    const previousEmail = emailChangeChallenge.currentEmail
    const nextEmail = emailChangeChallenge.nextEmail
    const allAccounts = readAccounts()
    const accountIndex = allAccounts.findIndex(
      (account) => account.email?.trim()?.toLowerCase() === previousEmail,
    )
    if (accountIndex === -1) {
      setFormError('Unable to locate your admin account.')
      return
    }
    const conflictingIndex = allAccounts.findIndex(
      (account) => account.email?.trim()?.toLowerCase() === nextEmail,
    )
    if (conflictingIndex !== -1 && conflictingIndex !== accountIndex) {
      setFormError('An account with that email already exists.')
      return
    }

    const nextAccounts = [...allAccounts]
    nextAccounts[accountIndex] = normalizeAdminAccount({
      ...nextAccounts[accountIndex],
      email: nextEmail,
    })
    writeAccounts(nextAccounts)

    const previousProfileKey = getProfileStorageKey(previousEmail)
    const nextProfileKey = getProfileStorageKey(nextEmail)
    const profileValue = localStorage.getItem(previousProfileKey)
    if (profileValue) {
      localStorage.setItem(nextProfileKey, profileValue)
      if (nextProfileKey !== previousProfileKey) {
        localStorage.removeItem(previousProfileKey)
      }
    }

    const previousSecurityKey = getAdminSecurityStorageKey(previousEmail)
    const nextSecurityKey = getAdminSecurityStorageKey(nextEmail)
    const securityValue = localStorage.getItem(previousSecurityKey)
    if (securityValue) {
      localStorage.setItem(nextSecurityKey, securityValue)
      if (nextSecurityKey !== previousSecurityKey) {
        localStorage.removeItem(previousSecurityKey)
      }
    }

    appendScopedActivityLog({
      action: 'Changed admin login email',
      details: `${previousEmail} -> ${nextEmail}`,
    })

    if (typeof onCurrentAdminEmailUpdated === 'function') {
      onCurrentAdminEmailUpdated({
        previousEmail,
        nextEmail,
      })
    }

    setProfileForm((prev) => ({ ...prev, email: nextEmail }))
    setEmailChangeForm({ nextEmail: '', otpCode: '' })
    setEmailChangeChallenge(null)
    setFormError('')
    refreshAdminData()
    notify('success', 'Login email updated successfully.')
  }

  const queueCreateAdmin = () => {
    const normalizedWorkCountry = normalizeAdminVerificationCountry(createAdminForm.workCountry)
    const normalizedGovernmentIdType = normalizeAdminGovernmentIdType(createAdminForm.governmentIdType, normalizedWorkCountry)
    const normalizedGovernmentIdNumber = String(createAdminForm.governmentIdNumber || '').trim()
    const normalizedResidentialAddress = String(createAdminForm.residentialAddress || '').trim()
    const normalizedOwnerPrivateKey = String(createAdminForm.ownerPrivateKey || '').trim()
    const normalizedRoleInCompany = String(createAdminForm.roleInCompany || '').trim()
    const normalizedDepartment = String(createAdminForm.department || '').trim()
    const normalizedPhoneNumber = formatPhoneNumber(createAdminForm.phoneCountryCode, createAdminForm.phoneNumber)
    const normalizedTargetLevel = normalizeAdminLevel(createAdminForm.adminLevel)
    const isCreatingOwner = normalizedTargetLevel === ADMIN_LEVELS.OWNER
    if (isCreatingOwner && !isOwnerAdmin) {
      const message = 'Only Owner can create another Owner account.'
      setFormError(message)
      notify('error', message)
      return
    }
    if (
      !createAdminForm.fullName.trim()
      || !createAdminForm.email.trim()
      || !normalizedRoleInCompany
      || !normalizedDepartment
      || !normalizedPhoneNumber
      || !createAdminForm.password
    ) {
      const message = 'Complete all create-admin fields.'
      setFormError(message)
      notify('error', message)
      return
    }
    if (isCreatingOwner && normalizedOwnerPrivateKey.length < 12) {
      const message = 'Owner private key must be at least 12 characters.'
      setFormError(message)
      notify('error', message)
      return
    }
    if (!passwordStrengthRegex.test(createAdminForm.password)) {
      const message = 'Admin password must include at least one number and one special character.'
      setFormError(message)
      notify('error', message)
      return
    }
    const selectedPermissions = normalizePermissionSelection(createAdminForm.permissions)
    if (selectedPermissions.length < 1) {
      const message = 'Select at least one permission for this admin.'
      setFormError(message)
      notify('error', message)
      return
    }
    setFormError('')
    setConfirmAction({
      type: 'create-admin',
      payload: {
        ...createAdminForm,
        permissions: selectedPermissions,
        email: createAdminForm.email.trim().toLowerCase(),
        fullName: createAdminForm.fullName.trim(),
        roleInCompany: normalizedRoleInCompany,
        department: normalizedDepartment,
        phoneNumber: normalizedPhoneNumber,
        phoneCountryCode: createAdminForm.phoneCountryCode || '+234',
        workCountry: normalizedWorkCountry,
        governmentIdType: isCreatingOwner ? '' : normalizedGovernmentIdType,
        governmentIdNumber: isCreatingOwner ? '' : normalizedGovernmentIdNumber,
        governmentIdFile: isCreatingOwner ? '' : String(createAdminForm.governmentIdFile || '').trim(),
        residentialAddress: normalizedResidentialAddress,
        ownerPrivateKey: isCreatingOwner ? normalizedOwnerPrivateKey : '',
        adminLevel: normalizedTargetLevel,
      },
    })
  }

  const resetCreateAdminIdentityVerification = () => {
    setCreateAdminIdentityVerification({ status: '', message: '' })
  }

  const verifyCreateAdminIdentity = async () => {
    if (isCreateAdminOwnerLevel) {
      setCreateAdminIdentityVerification({
        status: 'verified',
        message: 'Owner role does not require ID verification.',
      })
      return
    }
    const fullName = String(createAdminForm.fullName || '').trim()
    const idType = String(createAdminForm.governmentIdType || '').trim()
    const cardNumber = String(createAdminForm.governmentIdNumber || '').trim()
    if (!fullName || !idType || !cardNumber) {
      const message = 'Full name, government ID type, and ID card number are required before verification.'
      setFormError(message)
      notify('error', message)
      return
    }
    if (!createAdminForm.governmentIdFile) {
      const message = 'Upload government ID before verification.'
      setFormError(message)
      notify('error', message)
      return
    }

    setFormError('')
    setIsCreateAdminIdentityVerifying(true)
    setCreateAdminIdentityVerification({ status: 'verifying', message: 'Identifying...' })
    const verifyResult = await verifyIdentityWithDojah({
      fullName,
      idType,
      cardNumber,
    })
    if (!verifyResult.ok) {
      setCreateAdminIdentityVerification({
        status: 'failed',
        message: 'Verification failed. Please re-upload.',
      })
      setCreateAdminForm((prev) => ({
        ...prev,
        governmentIdFile: '',
      }))
      setCreateAdminIdUploadKey((prev) => prev + 1)
      setIsCreateAdminIdentityVerifying(false)
      notify('error', 'Verification failed. Please re-upload.')
      return
    }
    setCreateAdminIdentityVerification({
      status: 'verified',
      message: 'Identity verified successfully.',
    })
    setIsCreateAdminIdentityVerifying(false)
    notify('success', 'Identity verified successfully.')
  }

  const applyGeneratedCreateAdminPassword = () => {
    const generatedPassword = generateStrongPassword(14)
    setCreateAdminForm((prev) => ({ ...prev, password: generatedPassword }))
    setFormError('')
    notify('success', 'Strong temporary password generated.')
  }

  const copyCreatedAdminSignupInfo = async () => {
    if (!createdAdminCredentialPacket) return
    const ownerPrivateKeyLine = createdAdminCredentialPacket.ownerPrivateKey
      ? `Owner Private Key: ${createdAdminCredentialPacket.ownerPrivateKey}`
      : null
    const copied = await copyTextToClipboard(
      [
        `Admin Name: ${createdAdminCredentialPacket.fullName}`,
        `Role: ${getAdminLevelLabel(createdAdminCredentialPacket.adminLevel)}`,
        `Work Email: ${createdAdminCredentialPacket.email}`,
        `Temporary Password: ${createdAdminCredentialPacket.password}`,
        ownerPrivateKeyLine,
        `Admin Login URL: ${createdAdminCredentialPacket.loginUrl}`,
        'Instruction: Sign in and immediately create your permanent password in Admin Settings.',
      ].filter(Boolean).join('\n'),
    )
    if (copied) {
      notify('success', 'Signup information copied.')
      return
    }
    notify('error', 'Unable to copy signup information on this browser.')
  }

  const queueInviteAdmin = () => {
    if (!inviteForm.email.trim()) {
      setFormError('Invite email is required.')
      return
    }
    if (normalizeAdminLevel(inviteForm.adminLevel) === ADMIN_LEVELS.OWNER && !isOwnerAdmin) {
      setFormError('Only Owner can send Owner invites.')
      return
    }
    const selectedPermissions = normalizePermissionSelection(inviteForm.permissions)
    if (selectedPermissions.length < 1) {
      setFormError('Select at least one permission for this invite.')
      return
    }
    setFormError('')
    setConfirmAction({
      type: 'invite-admin',
      payload: {
        ...inviteForm,
        permissions: selectedPermissions,
        email: inviteForm.email.trim().toLowerCase(),
      },
    })
  }

  const queueDemoInvite = () => {
    if (!allowDemoInvite) {
      setFormError('Demo invite is disabled in this environment.')
      notify('error', 'Demo invite is disabled in this environment.')
      return
    }
    if (normalizeAdminLevel(inviteForm.adminLevel) === ADMIN_LEVELS.OWNER && !isOwnerAdmin) {
      setFormError('Only Owner can send Owner invites.')
      notify('error', 'Only Owner can send Owner invites.')
      return
    }
    const selectedPermissions = normalizePermissionSelection(inviteForm.permissions)
    if (selectedPermissions.length < 1) {
      setFormError('Select at least one permission for this invite.')
      notify('error', 'Select at least one permission for this invite.')
      return
    }
    const demoEmail = `demo.admin.${Date.now()}@demo.kiamina.local`
    setFormError('')
    setConfirmAction({
      type: 'invite-admin',
      payload: {
        ...inviteForm,
        permissions: selectedPermissions,
        email: demoEmail,
      },
    })
  }

  const queueDeleteAdminInvite = (invite) => {
    const token = String(invite?.token || '').trim()
    if (!token) return
    setFormError('')
    setConfirmAction({
      type: 'delete-admin-invite',
      payload: {
        token,
        email: String(invite?.email || '').trim().toLowerCase(),
        adminLevel: normalizeAdminLevel(invite?.adminLevel || ADMIN_LEVELS.AREA_ACCOUNTANT),
      },
    })
  }

  const copyGeneratedInviteLink = async () => {
    const inviteLink = String(generatedInviteLink || '').trim()
    if (!inviteLink) {
      notify('error', 'Generate an invite first.')
      return
    }
    const copied = await copyTextToClipboard(inviteLink)
    if (copied) {
      notify('success', 'Invite link copied.')
      return
    }
    notify('error', 'Unable to copy invite link on this browser.')
  }

  const openGeneratedInviteSetup = () => {
    const inviteLink = String(generatedInviteLink || '').trim()
    if (!inviteLink) {
      notify('error', 'Generate an invite first.')
      return
    }
    let opened = false
    try {
      const popup = window.open(inviteLink, '_blank', 'noopener,noreferrer')
      opened = Boolean(popup)
    } catch {
      opened = false
    }
    if (opened) return
    try {
      window.location.assign(inviteLink)
    } catch {
      notify('error', 'Unable to open invite setup page.')
    }
  }

  const updateCreateAdminPermissions = (updater) => {
    setCreateAdminForm((prev) => {
      const nextPermissions = typeof updater === 'function'
        ? updater(normalizePermissionSelection(prev.permissions))
        : normalizePermissionSelection(updater)
      return {
        ...prev,
        permissions: normalizePermissionSelection(nextPermissions),
      }
    })
  }

  const updateInvitePermissions = (updater) => {
    setInviteForm((prev) => {
      const nextPermissions = typeof updater === 'function'
        ? updater(normalizePermissionSelection(prev.permissions))
        : normalizePermissionSelection(updater)
      return {
        ...prev,
        permissions: normalizePermissionSelection(nextPermissions),
      }
    })
  }

  const openPermissionEditor = (account) => {
    const normalizedEmail = account?.email?.trim()?.toLowerCase() || ''
    if (!normalizedEmail) return
    const initialPermissions = resolvePermissionSelection(
      account?.adminPermissions,
      normalizeAdminLevel(account?.adminLevel),
    )
    setPermissionEditor({
      email: normalizedEmail,
      fullName: account?.fullName || account?.email || 'Admin User',
      adminLevel: normalizeAdminLevel(account?.adminLevel),
      permissions: initialPermissions,
    })
    setFormError('')
  }

  const closePermissionEditor = () => {
    setPermissionEditor(null)
  }

  const queueUpdateAdminPermissions = () => {
    if (!permissionEditor?.email) return
    const selectedPermissions = normalizePermissionSelection(permissionEditor.permissions)
    if (selectedPermissions.length < 1) {
      setFormError('Select at least one permission before saving.')
      return
    }
    setFormError('')
    setConfirmAction({
      type: 'update-admin-permissions',
      payload: {
        email: permissionEditor.email,
        fullName: permissionEditor.fullName,
        adminLevel: permissionEditor.adminLevel,
        permissions: selectedPermissions,
      },
    })
  }

  const queueAccountStatusChange = (type, account) => {
    setConfirmAction({
      type,
      payload: {
        email: account.email,
        fullName: account.fullName,
      },
    })
  }

  const queueAccountRoleChange = (account, nextAdminLevel) => {
    const previousAdminLevel = normalizeAdminLevel(account?.adminLevel)
    const normalizedNextLevel = normalizeAdminLevel(nextAdminLevel)
    if (!account?.email || previousAdminLevel === normalizedNextLevel) return
    setFormError('')
    setConfirmAction({
      type: 'change-admin-role',
      payload: {
        email: account.email,
        fullName: account.fullName,
        previousAdminLevel,
        nextAdminLevel: normalizedNextLevel,
      },
    })
  }

  const queueResetAdminPassword = (account) => {
    if (!account?.email) return
    setFormError('')
    setConfirmAction({
      type: 'reset-admin-password',
      payload: {
        email: account.email,
        fullName: account.fullName,
      },
    })
  }

  const queueClientAreaAssignment = ({
    clientEmail = '',
    assignedAccountantEmails = [],
    previousAssignedAccountantEmails = [],
  }) => {
    const normalizedClientEmail = clientEmail.trim().toLowerCase()
    if (!normalizedClientEmail) return
    const normalizedAssignedAccountantEmails = [...new Set(
      (Array.isArray(assignedAccountantEmails) ? assignedAccountantEmails : [])
        .map((email) => String(email || '').trim().toLowerCase())
        .filter(Boolean),
    )].sort()
    const normalizedPreviousAssignedAccountantEmails = [...new Set(
      (Array.isArray(previousAssignedAccountantEmails) ? previousAssignedAccountantEmails : [])
        .map((email) => String(email || '').trim().toLowerCase())
        .filter(Boolean),
    )].sort()
    if (JSON.stringify(normalizedAssignedAccountantEmails) === JSON.stringify(normalizedPreviousAssignedAccountantEmails)) return
    setFormError('')
    setConfirmAction({
      type: 'assign-client-area-accountant',
      payload: {
        clientEmail: normalizedClientEmail,
        assignedAccountantEmails: normalizedAssignedAccountantEmails,
        previousAssignedAccountantEmails: normalizedPreviousAssignedAccountantEmails,
      },
    })
  }

  const queueImpersonateAdmin = (account) => {
    const targetEmail = String(account?.email || '').trim().toLowerCase()
    const selfEmail = String(currentAdmin.email || '').trim().toLowerCase()
    if (!targetEmail || targetEmail === selfEmail) {
      setFormError('Select another admin account to impersonate.')
      return
    }
    setFormError('')
    setConfirmAction({
      type: 'impersonate-admin',
      payload: {
        email: targetEmail,
        fullName: account?.fullName || targetEmail,
        adminLevel: normalizeAdminLevel(account?.adminLevel),
      },
    })
  }

  const toggleClientSelection = (email = '') => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return
    setSelectedClientEmails((previous) => (
      previous.includes(normalizedEmail)
        ? previous.filter((value) => value !== normalizedEmail)
        : [...previous, normalizedEmail]
    ))
  }

  const toggleSelectAllClients = () => {
    const normalizedClientEmails = clientAccounts
      .map((account) => account.email?.trim()?.toLowerCase())
      .filter(Boolean)
    if (normalizedClientEmails.length === 0) {
      setSelectedClientEmails([])
      return
    }
    setSelectedClientEmails((previous) => (
      previous.length === normalizedClientEmails.length ? [] : normalizedClientEmails
    ))
  }

  const queueLogoutSelectedClients = () => {
    const emails = [...new Set(selectedClientEmails.map((email) => email.trim().toLowerCase()).filter(Boolean))]
    if (emails.length === 0) {
      setFormError('Select at least one client user to log out.')
      return
    }
    setFormError('')
    setConfirmAction({
      type: 'logout-selected-clients',
      payload: { emails },
    })
  }

  const queueLogoutAllClients = () => {
    if (!canManagePrivilegedAdminActions) {
      setFormError('Only Owner or Super Admin can log out all users.')
      notify('error', 'Only Owner or Super Admin can log out all users.')
      return
    }
    const totalClients = clientAccounts.length
    if (totalClients === 0) {
      setFormError('No client users found.')
      return
    }
    setFormError('')
    setConfirmAction({
      type: 'logout-all-clients',
      payload: { totalClients },
    })
  }

  const confirmQueuedAction = async () => {
    if (!confirmAction?.type) return
    setIsBusy(true)
    try {
      const executeAction = async () => {
        await waitForNetworkAwareDelay()
        const privilegedAdminActionTypes = new Set([
          'create-admin',
          'invite-admin',
          'suspend-admin',
          'activate-admin',
          'delete-admin',
          'change-admin-role',
          'reset-admin-password',
          'update-admin-permissions',
          'delete-admin-invite',
          'impersonate-admin',
          'assign-client-area-accountant',
          'logout-all-clients',
        ])
        if (privilegedAdminActionTypes.has(confirmAction.type) && !canManagePrivilegedAdminActions) {
          setFormError('Only Owner or Super Admin can perform this action.')
          return
        }

        if (confirmAction.type === 'create-admin') {
          const targetAdminLevel = normalizeAdminLevel(confirmAction.payload.adminLevel)
          const isOwnerTarget = targetAdminLevel === ADMIN_LEVELS.OWNER
          if (isOwnerTarget && !isOwnerAdmin) {
            const message = 'Only Owner can create another Owner account.'
            setFormError(message)
            notify('error', message)
            return
          }
          const allAccounts = readAccounts()
          const exists = allAccounts.some(
            (account) => account.email?.trim()?.toLowerCase() === confirmAction.payload.email,
          )
          if (exists) {
            const message = 'An account with that email already exists.'
            setFormError(message)
            notify('error', message)
            return
          }

          let createdUid = ''
          try {
            const createResponse = await apiFetch('/api/auth/admin/accounts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: confirmAction.payload.email,
                fullName: confirmAction.payload.fullName,
                password: confirmAction.payload.password,
                role: deriveBackendRoleFromAdminLevel(targetAdminLevel),
                status: 'active',
              }),
            })
            const createPayload = await createResponse.json().catch(() => ({}))
            if (!createResponse.ok) {
              setFormError(createPayload?.message || 'Unable to create admin account right now.')
              return
            }
            createdUid = String(createPayload?.account?.uid || '').trim()
          } catch {
            setFormError('Unable to create admin account right now.')
            return
          }

          if (createdUid) {
            try {
              await apiFetch('/api/users/sync-from-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  uid: createdUid,
                  email: confirmAction.payload.email,
                  displayName: confirmAction.payload.fullName,
                  roles: ['admin'],
                }),
              })
            } catch {
              // Best effort. Admin can still sign in because auth account creation already succeeded.
            }
            await syncAdminStaffToBackend({
              uid: createdUid,
              status: 'active',
              adminLevel: targetAdminLevel,
              permissions: resolvePermissionSelection(
                confirmAction.payload.permissions,
                targetAdminLevel,
              ),
              fullName: confirmAction.payload.fullName,
              roleInCompany: confirmAction.payload.roleInCompany || '',
              department: confirmAction.payload.department || '',
              phoneNumber: confirmAction.payload.phoneNumber || '',
            })
          }

          const createdAdmin = normalizeAdminAccount({
            uid: createdUid,
            fullName: confirmAction.payload.fullName,
            email: confirmAction.payload.email,
            password: confirmAction.payload.password,
            roleInCompany: confirmAction.payload.roleInCompany || '',
            department: confirmAction.payload.department || '',
            phoneNumber: confirmAction.payload.phoneNumber || '',
            phoneCountryCode: confirmAction.payload.phoneCountryCode || '+234',
            workCountry: confirmAction.payload.workCountry || 'Nigeria',
            governmentIdType: confirmAction.payload.governmentIdType || '',
            governmentIdNumber: confirmAction.payload.governmentIdNumber || '',
            governmentIdFile: confirmAction.payload.governmentIdFile || '',
            governmentIdVerifiedAt: isOwnerTarget ? '' : new Date().toISOString(),
            residentialAddress: confirmAction.payload.residentialAddress || '',
            ownerPrivateKey: confirmAction.payload.ownerPrivateKey || '',
            role: 'admin',
            adminLevel: targetAdminLevel,
            adminPermissions: resolvePermissionSelection(
              confirmAction.payload.permissions,
              targetAdminLevel,
            ),
            status: 'active',
            mustChangePassword: true,
            createdBy: currentAdmin.email,
            createdAt: new Date().toISOString(),
          })

          writeAccounts([...allAccounts, createdAdmin])
          appendScopedActivityLog({
            action: 'Created admin account',
            details: `${createdAdmin.email} (${getAdminLevelLabel(createdAdmin.adminLevel)})`,
          })
          setCreatedAdminCredentialPacket({
            fullName: createdAdmin.fullName || createdAdmin.email,
            email: createdAdmin.email,
            password: confirmAction.payload.password,
            adminLevel: createdAdmin.adminLevel,
            ownerPrivateKey: isOwnerTarget ? (confirmAction.payload.ownerPrivateKey || '') : '',
            loginUrl: `${window.location.origin}/admin/login`,
          })
          setCreateAdminForm({
            fullName: '',
            email: '',
            roleInCompany: '',
            department: '',
            phoneCountryCode: '+234',
            phoneNumber: '',
            password: '',
            workCountry: 'Nigeria',
            governmentIdType: '',
            governmentIdNumber: '',
            governmentIdFile: '',
            residentialAddress: '',
            ownerPrivateKey: '',
            adminLevel: ADMIN_LEVELS.AREA_ACCOUNTANT,
            permissions: getDefaultPermissionsForAdminLevel(ADMIN_LEVELS.AREA_ACCOUNTANT),
          })
          setCreateAdminIdentityVerification({ status: '', message: '' })
          setCreateAdminIdUploadKey((prev) => prev + 1)
          refreshAdminData()
          notify('success', 'Admin account created successfully.')
        }

        if (confirmAction.type === 'invite-admin') {
          const inviteAdminLevel = normalizeAdminLevel(confirmAction.payload.adminLevel)
          if (inviteAdminLevel === ADMIN_LEVELS.OWNER && !isOwnerAdmin) {
            setFormError('Only Owner can send Owner invites.')
            return
          }
          const allAccounts = readAccounts()
          const existingAccount = allAccounts.find(
            (account) => account.email?.trim()?.toLowerCase() === confirmAction.payload.email,
          )
          if (existingAccount && isAdminAccount(existingAccount)) {
            setFormError('That email is already an admin account.')
            return
          }

          const existingInvites = readInvites().filter(
            (invite) => invite.email !== confirmAction.payload.email || !isAdminInvitePending(invite),
          )
          const createdInvite = normalizeAdminInvite({
            id: `INV-${Date.now()}`,
            token: createInviteToken(),
            email: confirmAction.payload.email,
            adminLevel: inviteAdminLevel,
            adminPermissions: resolvePermissionSelection(
              confirmAction.payload.permissions,
              inviteAdminLevel,
            ),
            status: 'pending',
            invitedBy: currentAdmin.email || '',
            createdAt: new Date().toISOString(),
            expiresAt: getAdminInviteExpiryIso(),
          })

          const nextInvites = [createdInvite, ...existingInvites]
          writeInvites(nextInvites)
          setAdminInvites(nextInvites)
          setInviteForm({
            email: '',
            adminLevel: ADMIN_LEVELS.AREA_ACCOUNTANT,
            permissions: getDefaultPermissionsForAdminLevel(ADMIN_LEVELS.AREA_ACCOUNTANT),
          })
          const inviteUrl = `${window.location.origin}/admin/setup?invite=${encodeURIComponent(createdInvite.token)}`
          setGeneratedInviteLink(inviteUrl)
          appendScopedActivityLog({
            action: 'Sent admin invite',
            details: `${createdInvite.email} (${getAdminLevelLabel(createdInvite.adminLevel)})`,
          })
          notify('success', 'Admin invitation created.')
        }

        if (confirmAction.type === 'delete-admin-invite') {
          const targetToken = String(confirmAction.payload?.token || '').trim()
          if (!targetToken) return
          const existingInvites = readInvites()
          const targetInvite = existingInvites.find((invite) => invite.token === targetToken)
          if (!targetInvite) {
            setFormError('Invite not found.')
            return
          }
          if (normalizeAdminLevel(targetInvite.adminLevel) === ADMIN_LEVELS.OWNER && !isOwnerAdmin) {
            setFormError('Only Owner can delete an Owner invite.')
            return
          }
          appendAdminTrashEntry({
            entityType: 'admin-invite',
            entityLabel: targetInvite.email || 'Admin Invite',
            description: `Invite deleted (${getAdminLevelLabel(targetInvite.adminLevel)}).`,
            deletedByName: currentAdmin.fullName || currentAdmin.email || 'Admin User',
            payload: {
              invite: targetInvite,
            },
          })
          const nextInvites = existingInvites.filter((invite) => invite.token !== targetToken)
          writeInvites(nextInvites)
          setAdminInvites(nextInvites)
          appendScopedActivityLog({
            action: 'Deleted admin invite',
            details: `${targetInvite.email} (${getAdminLevelLabel(targetInvite.adminLevel)})`,
          })
          notify('success', 'Invite deleted successfully.')
        }

        if (confirmAction.type === 'update-admin-permissions') {
          const targetEmail = confirmAction.payload.email?.trim()?.toLowerCase()
          const selectedPermissions = resolvePermissionSelection(
            confirmAction.payload.permissions,
            confirmAction.payload.adminLevel,
          )
          if (!targetEmail) return

          const allAccounts = readAccounts()
          const targetIndex = allAccounts.findIndex(
            (account) => account.email?.trim()?.toLowerCase() === targetEmail,
          )
          if (targetIndex === -1) {
            setFormError('Admin account not found.')
            return
          }
          const targetAdminLevel = normalizeAdminLevel(allAccounts[targetIndex]?.adminLevel)
          if (targetAdminLevel === ADMIN_LEVELS.OWNER && !isOwnerAdmin) {
            setFormError('Only Owner can change Owner permissions.')
            return
          }
          if (targetAdminLevel === ADMIN_LEVELS.SUPER && !isOwnerAdmin) {
            setFormError('Only Owner can change Super Admin permissions.')
            return
          }

          allAccounts[targetIndex] = normalizeAdminAccount({
            ...allAccounts[targetIndex],
            adminPermissions: selectedPermissions,
          })
          writeAccounts(allAccounts)
          await syncAdminStaffToBackend({
            uid: allAccounts[targetIndex]?.uid || '',
            status: allAccounts[targetIndex]?.status || 'active',
            adminLevel: allAccounts[targetIndex]?.adminLevel,
            permissions: selectedPermissions,
            fullName: allAccounts[targetIndex]?.fullName || '',
            roleInCompany: allAccounts[targetIndex]?.roleInCompany || '',
            department: allAccounts[targetIndex]?.department || '',
            phoneNumber: allAccounts[targetIndex]?.phoneNumber || '',
          })
          appendScopedActivityLog({
            action: 'Updated admin permissions',
            details: `${targetEmail} now has ${selectedPermissions.length} permission(s).`,
          })
          refreshAdminData()
          notify('success', `Permissions updated for ${targetEmail}.`)
          closePermissionEditor()
        }

        if (confirmAction.type === 'impersonate-admin') {
          const targetEmail = String(confirmAction.payload?.email || '').trim().toLowerCase()
          if (!targetEmail) {
            setFormError('Admin account not found.')
            return
          }
          if (typeof onRequestAdminImpersonation !== 'function') {
            setFormError('Impersonation handler is unavailable.')
            return
          }
          const result = await onRequestAdminImpersonation(targetEmail)
          if (!result?.ok) {
            setFormError(result?.message || 'Unable to start impersonation.')
            return
          }
          notify('success', `Now impersonating ${confirmAction.payload?.fullName || targetEmail}.`)
        }

        if (confirmAction.type === 'suspend-admin' || confirmAction.type === 'activate-admin') {
          const targetEmail = confirmAction.payload.email?.trim()?.toLowerCase()
          if (!targetEmail) return
          if (targetEmail === currentAdmin.email?.trim()?.toLowerCase()) {
            setFormError('You cannot change your own admin status.')
            return
          }

          const allAccounts = readAccounts()
          const targetIndex = allAccounts.findIndex(
            (account) => account.email?.trim()?.toLowerCase() === targetEmail,
          )
          if (targetIndex === -1) {
            setFormError('Admin account not found.')
            return
          }
          const targetAdminLevel = normalizeAdminLevel(allAccounts[targetIndex]?.adminLevel)
          if (targetAdminLevel === ADMIN_LEVELS.OWNER && !isOwnerAdmin) {
            setFormError('Only Owner can update Owner account status.')
            return
          }
          if (targetAdminLevel === ADMIN_LEVELS.SUPER && !isOwnerAdmin) {
            setFormError('Only Owner can update Super Admin status.')
            return
          }

          const nextStatus = confirmAction.type === 'suspend-admin' ? 'suspended' : 'active'
          const targetUid = String(allAccounts[targetIndex]?.uid || '').trim()
          if (targetUid) {
            try {
              const response = await apiFetch(`/api/auth/admin/accounts/${encodeURIComponent(targetUid)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  status: nextStatus,
                }),
              })
              const payload = await response.json().catch(() => ({}))
              if (!response.ok) {
                setFormError(payload?.message || 'Unable to update admin status right now.')
                return
              }
            } catch {
              setFormError('Unable to update admin status right now.')
              return
            }
          }
          allAccounts[targetIndex] = normalizeAdminAccount({
            ...allAccounts[targetIndex],
            status: nextStatus,
          })
          writeAccounts(allAccounts)
          await syncAdminStaffToBackend({
            uid: targetUid,
            status: nextStatus,
            adminLevel: allAccounts[targetIndex]?.adminLevel,
            permissions: allAccounts[targetIndex]?.adminPermissions,
            fullName: allAccounts[targetIndex]?.fullName || '',
            roleInCompany: allAccounts[targetIndex]?.roleInCompany || '',
            department: allAccounts[targetIndex]?.department || '',
            phoneNumber: allAccounts[targetIndex]?.phoneNumber || '',
          })
          appendScopedActivityLog({
            action: `${nextStatus === 'suspended' ? 'Suspended' : 'Activated'} admin account`,
            details: targetEmail,
          })
          refreshAdminData()
          notify('success', `Admin ${nextStatus === 'suspended' ? 'suspended' : 'activated'} successfully.`)
        }

        if (confirmAction.type === 'delete-admin') {
          const targetEmail = confirmAction.payload.email?.trim()?.toLowerCase()
          if (!targetEmail) return
          if (targetEmail === currentAdmin.email?.trim()?.toLowerCase()) {
            setFormError('You cannot delete your own account.')
            return
          }

          const allAccounts = readAccounts()
          const targetAccount = allAccounts.find(
            (account) => account.email?.trim()?.toLowerCase() === targetEmail,
          )
          if (!targetAccount) {
            setFormError('Admin account not found.')
            return
          }
          const targetAdminLevel = normalizeAdminLevel(targetAccount.adminLevel)
          if (targetAdminLevel === ADMIN_LEVELS.OWNER && !isOwnerAdmin) {
            setFormError('Only Owner can delete an Owner account.')
            return
          }
          if (targetAdminLevel === ADMIN_LEVELS.SUPER && !isOwnerAdmin) {
            setFormError('Only Owner can delete a Super Admin account.')
            return
          }
          const targetUid = String(targetAccount?.uid || '').trim()
          if (targetUid) {
            try {
              const response = await apiFetch(`/api/auth/account/${encodeURIComponent(targetUid)}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'admin-account-deleted' }),
              })
              const payload = await response.json().catch(() => ({}))
              if (!response.ok) {
                setFormError(payload?.message || 'Unable to delete admin account right now.')
                return
              }
            } catch {
              setFormError('Unable to delete admin account right now.')
              return
            }
          }
          appendAdminTrashEntry({
            entityType: 'admin-account',
            entityLabel: targetAccount.fullName || targetEmail,
            description: `Admin account deleted (${getAdminLevelLabel(targetAccount.adminLevel)}).`,
            deletedByName: currentAdmin.fullName || currentAdmin.email || 'Admin User',
            payload: {
              account: targetAccount,
            },
          })
          const nextAccounts = allAccounts.filter(
            (account) => account.email?.trim()?.toLowerCase() !== targetEmail,
          )
          writeAccounts(nextAccounts)
          appendScopedActivityLog({
            action: 'Deleted admin account',
            details: targetEmail,
          })
          refreshAdminData()
          notify('success', 'Admin account deleted.')
        }

        if (confirmAction.type === 'change-admin-role') {
          const targetEmail = confirmAction.payload.email?.trim()?.toLowerCase()
          const nextAdminLevel = normalizeAdminLevel(confirmAction.payload.nextAdminLevel)
          if (!targetEmail) return
          if (targetEmail === currentAdmin.email?.trim()?.toLowerCase()) {
            setFormError('For security, you cannot change your own role from this panel.')
            return
          }

          const allAccounts = readAccounts()
          const targetIndex = allAccounts.findIndex(
            (account) => account.email?.trim()?.toLowerCase() === targetEmail,
          )
          if (targetIndex === -1) {
            setFormError('Admin account not found.')
            return
          }

          const previousAdminLevel = normalizeAdminLevel(allAccounts[targetIndex].adminLevel)
          if ((previousAdminLevel === ADMIN_LEVELS.OWNER || nextAdminLevel === ADMIN_LEVELS.OWNER) && !isOwnerAdmin) {
            setFormError('Only Owner can assign or change Owner role.')
            return
          }
          if (previousAdminLevel === ADMIN_LEVELS.SUPER && !isOwnerAdmin) {
            setFormError('Only Owner can change Super Admin role.')
            return
          }
          if (previousAdminLevel === nextAdminLevel) return
          const targetUid = String(allAccounts[targetIndex]?.uid || '').trim()
          if (targetUid) {
            try {
              const response = await apiFetch(`/api/auth/admin/accounts/${encodeURIComponent(targetUid)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  role: deriveBackendRoleFromAdminLevel(nextAdminLevel),
                }),
              })
              const payload = await response.json().catch(() => ({}))
              if (!response.ok) {
                setFormError(payload?.message || 'Unable to update admin role right now.')
                return
              }
            } catch {
              setFormError('Unable to update admin role right now.')
              return
            }
          }
          allAccounts[targetIndex] = normalizeAdminAccount({
            ...allAccounts[targetIndex],
            adminLevel: nextAdminLevel,
            adminPermissions: getDefaultPermissionsForAdminLevel(nextAdminLevel),
          })
          writeAccounts(allAccounts)
          await syncAdminStaffToBackend({
            uid: targetUid,
            status: allAccounts[targetIndex]?.status || 'active',
            adminLevel: nextAdminLevel,
            permissions: allAccounts[targetIndex]?.adminPermissions,
            fullName: allAccounts[targetIndex]?.fullName || '',
            roleInCompany: allAccounts[targetIndex]?.roleInCompany || '',
            department: allAccounts[targetIndex]?.department || '',
            phoneNumber: allAccounts[targetIndex]?.phoneNumber || '',
          })

          const previousLabel = getAdminLevelLabel(previousAdminLevel)
          const nextLabel = getAdminLevelLabel(nextAdminLevel)
          appendScopedActivityLog({
            action: 'Changed admin role',
            details: `Admin role changed from ${previousLabel} to ${nextLabel} by ${getAdminLevelLabel(currentAdminLevel)}.`,
          })
          refreshAdminData()
          notify('success', `Role updated: ${previousLabel} -> ${nextLabel}.`)
        }

        if (confirmAction.type === 'reset-admin-password') {
          const targetEmail = confirmAction.payload.email?.trim()?.toLowerCase()
          if (!targetEmail) return
          if (targetEmail === currentAdmin.email?.trim()?.toLowerCase()) {
            setFormError('Use profile security controls to reset your own password.')
            return
          }
          const allAccounts = readAccounts()
          const targetIndex = allAccounts.findIndex(
            (account) => account.email?.trim()?.toLowerCase() === targetEmail,
          )
          if (targetIndex === -1) {
            setFormError('Admin account not found.')
            return
          }
          const targetAdminLevel = normalizeAdminLevel(allAccounts[targetIndex]?.adminLevel)
          if (targetAdminLevel === ADMIN_LEVELS.OWNER && !isOwnerAdmin) {
            setFormError('Only Owner can reset Owner password.')
            return
          }
          if (targetAdminLevel === ADMIN_LEVELS.SUPER && !isOwnerAdmin) {
            setFormError('Only Owner can reset Super Admin password.')
            return
          }
          const targetUid = String(allAccounts[targetIndex]?.uid || '').trim()
          let tempPassword = ''
          if (targetUid) {
            try {
              const response = await apiFetch(`/api/auth/admin/accounts/${encodeURIComponent(targetUid)}/reset-password`, {
                method: 'POST',
              })
              const payload = await response.json().catch(() => ({}))
              if (!response.ok) {
                setFormError(payload?.message || 'Unable to reset password right now.')
                return
              }
              tempPassword = String(payload?.temporaryPassword || '').trim()
            } catch {
              setFormError('Unable to reset password right now.')
              return
            }
          } else {
            tempPassword = `Temp@${Math.floor(100000 + Math.random() * 900000)}`
          }
          allAccounts[targetIndex] = {
            ...allAccounts[targetIndex],
            password: tempPassword,
            mustChangePassword: true,
          }
          writeAccounts(allAccounts)
          await syncAdminStaffToBackend({
            uid: targetUid,
            status: allAccounts[targetIndex]?.status || 'active',
            adminLevel: allAccounts[targetIndex]?.adminLevel,
            permissions: allAccounts[targetIndex]?.adminPermissions,
            fullName: allAccounts[targetIndex]?.fullName || '',
            roleInCompany: allAccounts[targetIndex]?.roleInCompany || '',
            department: allAccounts[targetIndex]?.department || '',
            phoneNumber: allAccounts[targetIndex]?.phoneNumber || '',
          })
          appendScopedActivityLog({
            action: 'Reset admin password',
            details: `${targetEmail} temporary password issued by ${getAdminLevelLabel(currentAdminLevel)}.`,
          })
          refreshAdminData()
          notify('success', `Temporary password for ${targetEmail}: ${tempPassword}`)
        }

        if (confirmAction.type === 'assign-client-area-accountant') {
          const normalizedClientEmail = String(confirmAction.payload?.clientEmail || '').trim().toLowerCase()
          const normalizedAssignedEmails = [...new Set(
            (Array.isArray(confirmAction.payload?.assignedAccountantEmails) ? confirmAction.payload.assignedAccountantEmails : [])
              .map((email) => String(email || '').trim().toLowerCase())
              .filter(Boolean),
          )]
          const previousAssignedEmails = [...new Set(
            (Array.isArray(confirmAction.payload?.previousAssignedAccountantEmails) ? confirmAction.payload.previousAssignedAccountantEmails : [])
              .map((email) => String(email || '').trim().toLowerCase())
              .filter(Boolean),
          )]
          if (!normalizedClientEmail) return

          const assignmentResult = setClientAssignmentsForClient({
            clientEmail: normalizedClientEmail,
            assignedAccountantEmails: normalizedAssignedEmails,
            assignedBy: currentAdmin.email || '',
          })
          if (!assignmentResult.ok) {
            setFormError(assignmentResult.message || 'Unable to update client assignment.')
            return
          }
          setClientAssignments(Array.isArray(assignmentResult.assignments) ? assignmentResult.assignments : [])

          const clientName = clientAccounts.find(
            (account) => account.email?.trim()?.toLowerCase() === normalizedClientEmail,
          )?.fullName || normalizedClientEmail
          const resolveAccountantLabel = (email) => (
            areaAccountantAdmins.find((account) => account.email?.trim()?.toLowerCase() === email)?.fullName || email
          )
          const previousName = previousAssignedEmails.length > 0
            ? previousAssignedEmails.map((email) => resolveAccountantLabel(email)).join(', ')
            : 'Unassigned'
          const assignedName = normalizedAssignedEmails.length > 0
            ? normalizedAssignedEmails.map((email) => resolveAccountantLabel(email)).join(', ')
            : 'Unassigned'

          appendScopedActivityLog({
            action: 'Updated Area Accountant assignment',
            details: `${clientName}: ${previousName} -> ${assignedName}.`,
          })
          notify('success', `Assignment updated for ${clientName}.`)
        }

        if (confirmAction.type === 'logout-all-clients' || confirmAction.type === 'logout-selected-clients') {
          const nowIso = new Date().toISOString()
          const controlState = getClientSessionControl()
          const nextByEmail = {
            ...(controlState.byEmail || {}),
          }

          if (confirmAction.type === 'logout-selected-clients') {
            const targetEmails = Array.isArray(confirmAction.payload?.emails)
              ? confirmAction.payload.emails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean)
              : []
            targetEmails.forEach((email) => {
              nextByEmail[email] = nowIso
            })
            writeClientSessionControl({
              ...controlState,
              byEmail: nextByEmail,
              updatedAtIso: nowIso,
              updatedBy: currentAdmin.email || '',
            })
            appendScopedActivityLog({
              action: 'Forced logout for selected client users',
              details: `${targetEmails.length} user(s)`,
            })
            notify('success', `${targetEmails.length} selected user(s) have been logged out.`)
            setSelectedClientEmails([])
          }

          if (confirmAction.type === 'logout-all-clients') {
            writeClientSessionControl({
              ...controlState,
              byEmail: nextByEmail,
              globalLogoutAtIso: nowIso,
              updatedAtIso: nowIso,
              updatedBy: currentAdmin.email || '',
            })
            appendScopedActivityLog({
              action: 'Forced logout for all client users',
              details: `${confirmAction.payload?.totalClients || clientAccounts.length} user(s)`,
            })
            notify('success', 'All client users have been logged out.')
            setSelectedClientEmails([])
          }
        }
      }

      if (typeof runWithSlowRuntimeWatch === 'function') {
        await runWithSlowRuntimeWatch(executeAction, 'Applying admin settings...')
      } else {
        await executeAction()
      }
    } finally {
      setIsBusy(false)
      setConfirmAction(null)
    }
  }

  return (
    <div
      className="animate-fade-in"
      style={{ fontFamily: "'Helvetica Now', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">Admin Settings</h2>
          <p className="text-sm text-text-muted mt-1">Governance, security controls, and admin lifecycle management.</p>
        </div>
        <div className="h-9 px-3 rounded-md border border-border-light bg-white text-xs text-text-secondary inline-flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          {getAdminLevelLabel(currentAdminLevel)}
        </div>
      </div>

      {formError && (
        <div className="mb-4 rounded-md border border-error/25 bg-error-bg px-3 py-2 text-xs text-error">
          {formError}
        </div>
      )}

      {lockedFieldNotice && (
        <div className="mb-4 rounded-md border border-border-light bg-[#F8FAFF] px-3 py-2 text-xs text-text-secondary inline-flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-primary" />
          {lockedFieldNotice}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 bg-white rounded-lg shadow-card border border-border-light p-6">
          <h3 className="text-base font-semibold text-text-primary">1. Profile Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Full Name</label>
              <input
                type="text"
                value={profileForm.fullName}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, fullName: event.target.value }))}
                className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-text-primary">Email</label>
                <button
                  type="button"
                  onClick={() => setLockedFieldNotice(
                    isSuperAdmin
                      ? 'Use "Change Login Email (SMS OTP)" in Security Settings to update this field.'
                      : 'Only Super Admin can change login email.',
                  )}
                  className="text-xs text-primary hover:text-primary-light"
                  title={isSuperAdmin ? 'Use SMS OTP verification to update login email.' : 'This field cannot be modified.'}
                >
                  {isSuperAdmin ? 'How to change?' : 'Why locked?'}
                </button>
              </div>
              <input
                type="email"
                value={profileForm.email}
                readOnly
                className="w-full h-10 px-3 border border-border-light rounded-md text-sm bg-background text-text-muted cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Role in Company</label>
              <input
                type="text"
                value={profileForm.roleInCompany}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, roleInCompany: event.target.value }))}
                className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Department</label>
              <input
                type="text"
                value={profileForm.department}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, department: event.target.value }))}
                className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Phone Number</label>
              <div className="grid grid-cols-[130px_1fr] gap-2">
                <select
                  value={profileForm.phoneCountryCode || '+234'}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, phoneCountryCode: event.target.value }))}
                  className="h-10 px-2 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                >
                  {PHONE_COUNTRY_CODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={profileForm.phoneNumber}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, phoneNumber: event.target.value }))}
                  className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={saveProfile}
              className="h-10 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors"
            >
              Save Profile
            </button>
          </div>
        </section>

        <section className="bg-white rounded-lg shadow-card border border-border-light p-6">
          <h3 className="text-base font-semibold text-text-primary">2. Permission Overview</h3>
          {canManagePrivilegedAdminActions ? (
            <div className="mt-4 rounded-md border border-success/30 bg-success-bg px-3 py-3 text-sm text-success inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Full System Access
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {currentAdminPermissions.map((permissionId) => (
                <div
                  key={permissionId}
                  className="h-8 px-2.5 rounded border border-border-light text-xs text-text-secondary inline-flex items-center gap-2"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-success" />
                  {ADMIN_PERMISSION_DEFINITIONS.find((permission) => permission.id === permissionId)?.label || permissionId}
                </div>
              ))}
              {currentAdminPermissions.length === 0 && (
                <p className="text-sm text-text-muted">No permissions assigned.</p>
              )}
            </div>
          )}
        </section>

        <section className="xl:col-span-3 bg-white rounded-lg shadow-card border border-border-light p-6">
          <h3 className="text-base font-semibold text-text-primary">3. Security Settings</h3>
          {Boolean(currentAdmin.mustChangePassword) && (
            <div className="mt-3 rounded-md border border-warning/30 bg-warning-bg px-3 py-2">
              <p className="text-xs text-warning">
                You are signed in with a temporary password. Create a permanent password now.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Session Timeout</label>
                <select
                  value={securityForm.sessionTimeout}
                  onChange={(event) => setSecurityForm((prev) => ({ ...prev, sessionTimeout: event.target.value }))}
                  className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">60 minutes</option>
                  <option value="120">120 minutes</option>
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={securityForm.emailNotificationPreference}
                  onChange={(event) => setSecurityForm((prev) => ({ ...prev, emailNotificationPreference: event.target.checked }))}
                  className="w-4 h-4 accent-primary"
                />
                Email notification preference
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={securityForm.activityAlertPreference}
                  onChange={(event) => setSecurityForm((prev) => ({ ...prev, activityAlertPreference: event.target.checked }))}
                  className="w-4 h-4 accent-primary"
                />
                Activity alert preference
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={securityForm.notificationSoundEnabled}
                  onChange={(event) => setSecurityForm((prev) => ({ ...prev, notificationSoundEnabled: event.target.checked }))}
                  className="w-4 h-4 accent-primary"
                />
                Notification sound alerts
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={securityForm.twoFactorEnabled}
                  onChange={(event) => setSecurityForm((prev) => ({ ...prev, twoFactorEnabled: event.target.checked }))}
                  className="w-4 h-4 accent-primary"
                />
                Enable Two-Factor Authentication
              </label>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={saveSecuritySettings}
                  className="h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors"
                >
                  Save Security Preferences
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem('kiaminaAuthUser')
                    localStorage.removeItem('kiaminaAuthUser')
                    clearApiAccessToken()
                    clearApiSessionId()
                    notify('success', 'All active sessions have been cleared locally.')
                  }}
                  className="h-9 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background transition-colors"
                >
                  Logout All Devices
                </button>
              </div>
              <div className="mt-4 rounded-lg border border-border-light p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-text-primary">Client Session Control</p>
                  <span className="text-xs text-text-muted">{selectedClientEmails.length} selected</span>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Force logout selected users or all users. They will be redirected to login.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSelectAllClients}
                    className="h-8 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background transition-colors"
                  >
                    {selectedClientEmails.length === clientAccounts.length && clientAccounts.length > 0 ? 'Clear Selection' : 'Select All'}
                  </button>
                  <button
                    type="button"
                    onClick={queueLogoutSelectedClients}
                    disabled={selectedClientEmails.length === 0}
                    className="h-8 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Logout Selected
                  </button>
                  <button
                    type="button"
                    onClick={queueLogoutAllClients}
                    disabled={!canManagePrivilegedAdminActions || clientAccounts.length === 0}
                    className="h-8 px-2.5 border border-error/50 rounded text-xs font-medium text-error hover:bg-error-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Logout All Users
                  </button>
                </div>
                {!canManagePrivilegedAdminActions && (
                  <p className="text-xs text-text-muted mt-2">Only Owner or Super Admin can use "Logout All Users".</p>
                )}
                <div className="mt-3 max-h-40 overflow-y-auto rounded border border-border-light">
                  {clientAccounts.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-text-muted text-center">No client users found.</div>
                  ) : (
                    clientAccounts.map((account) => {
                      const normalizedEmail = account.email?.trim()?.toLowerCase() || ''
                      const isChecked = selectedClientEmails.includes(normalizedEmail)
                      return (
                        <label key={account.email} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border-light last:border-b-0 text-xs">
                          <span className="inline-flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleClientSelection(normalizedEmail)}
                              className="w-4 h-4 accent-primary"
                            />
                            <span className="text-text-primary truncate">{account.fullName || account.email}</span>
                          </span>
                          <span className="text-text-muted truncate">{account.email}</span>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-border-light p-4">
                <h4 className="text-sm font-semibold text-text-primary inline-flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-primary" />
                  Change Password
                </h4>
                <div className="space-y-3 mt-4">
                  <input
                    type="password"
                    placeholder="Current Password"
                    value={passwordForm.currentPassword}
                    onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                    className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                  />
                  <input
                    type="password"
                    placeholder="New Password"
                    value={passwordForm.newPassword}
                    onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                    className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                  />
                  <input
                    type="password"
                    placeholder="Confirm New Password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                    className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={updatePassword}
                    className="h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors"
                  >
                    Update Password
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-border-light p-4">
                <h4 className="text-sm font-semibold text-text-primary">Change Login Email (SMS OTP)</h4>
                <p className="text-xs text-text-muted mt-1">
                  Available to Super Admin only. OTP is sent to your profile phone number.
                </p>
                {!isSuperAdmin ? (
                  <p className="text-xs text-text-muted mt-3">Only Super Admin can update login email.</p>
                ) : (
                  <div className="space-y-3 mt-4">
                    <input
                      type="email"
                      placeholder="New Login Email"
                      value={emailChangeForm.nextEmail}
                      onChange={(event) => setEmailChangeForm((prev) => ({ ...prev, nextEmail: event.target.value }))}
                      className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void requestEmailChangeOtp()}
                        className="h-9 px-3 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background transition-colors"
                      >
                        Send SMS OTP
                      </button>
                    </div>
                    {emailChangeChallenge && (
                      <p className="text-xs text-text-secondary">
                        OTP sent to {maskPhoneNumber(emailChangeChallenge.phoneNumber)}. It expires in 5 minutes.
                      </p>
                    )}
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Enter 6-digit OTP"
                      value={emailChangeForm.otpCode}
                      onChange={(event) => setEmailChangeForm((prev) => ({ ...prev, otpCode: event.target.value.replace(/\D/g, '').slice(0, 6) }))}
                      className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => void verifyEmailChangeOtpAndUpdate()}
                      className="h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors"
                    >
                      Verify OTP & Update Email
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="xl:col-span-3 bg-white rounded-lg shadow-card border border-border-light p-6">
          <h3 className="text-base font-semibold text-text-primary">System Controls</h3>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4">
            <label className="flex items-center gap-3 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={systemSettings.allowSelfSignup}
                onChange={(event) => setSystemSettings((prev) => ({ ...prev, allowSelfSignup: event.target.checked }))}
                className="w-4 h-4 accent-primary"
              />
              Allow client self-signup
            </label>
            <label className="flex items-center gap-3 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={systemSettings.enforceMfa}
                onChange={(event) => setSystemSettings((prev) => ({ ...prev, enforceMfa: event.target.checked }))}
                className="w-4 h-4 accent-primary"
              />
              Enforce MFA for admin access
            </label>
            <label className="flex items-center gap-3 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={systemSettings.impersonationEnabled !== false}
                  onChange={(event) => setSystemSettings((prev) => ({ ...prev, impersonationEnabled: event.target.checked }))}
                  disabled={!canManagePrivilegedAdminActions}
                  className="w-4 h-4 accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
                Enable client impersonation
              </label>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Audit Log Retention (Days)</label>
              <input
                type="number"
                min="1"
                value={systemSettings.auditRetentionDays}
                onChange={(event) => setSystemSettings((prev) => ({ ...prev, auditRetentionDays: event.target.value }))}
                className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          {!canManagePrivilegedAdminActions && (
            <p className="text-xs text-text-muted mt-3">Only Owner or Super Admin can toggle impersonation controls.</p>
          )}
          <div className="mt-4">
            <button
              type="button"
              onClick={saveSystemSettings}
              className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background transition-colors"
            >
              Save System Controls
            </button>
          </div>
        </section>

        <section className="xl:col-span-3 bg-white rounded-lg shadow-card border border-border-light p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">4. Admin Management</h3>
            {!canManagePrivilegedAdminActions && (
              <div className="text-xs text-warning bg-warning-bg border border-warning/30 px-2.5 py-1.5 rounded inline-flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                Owner or Super Admin only
              </div>
            )}
          </div>

          {!canManagePrivilegedAdminActions ? (
            <div className="mt-4 rounded-lg border border-border-light bg-background p-4">
              <p className="text-sm font-medium text-text-primary">Insufficient Permissions</p>
              <p className="text-sm text-text-muted mt-1">You do not have access to admin lifecycle controls.</p>
            </div>
          ) : (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="rounded-lg border border-border-light p-4">
                  <h4 className="text-sm font-semibold text-text-primary inline-flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Create Admin
                  </h4>
                  <div className="space-y-3 mt-4">
                    <input
                      type="text"
                      placeholder="Full Name"
                      value={createAdminForm.fullName}
                      onChange={(event) => {
                        setCreateAdminForm((prev) => ({ ...prev, fullName: event.target.value }))
                        resetCreateAdminIdentityVerification()
                      }}
                      className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                    />
                    <input
                      type="email"
                      placeholder="Work Email"
                      value={createAdminForm.email}
                      onChange={(event) => setCreateAdminForm((prev) => ({ ...prev, email: event.target.value }))}
                      className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Role in Company"
                        value={createAdminForm.roleInCompany}
                        onChange={(event) => setCreateAdminForm((prev) => ({ ...prev, roleInCompany: event.target.value }))}
                        className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                      />
                      <input
                        type="text"
                        placeholder="Department"
                        value={createAdminForm.department}
                        onChange={(event) => setCreateAdminForm((prev) => ({ ...prev, department: event.target.value }))}
                        className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div className="grid grid-cols-[130px_1fr] gap-2">
                      <select
                        value={createAdminForm.phoneCountryCode || '+234'}
                        onChange={(event) => setCreateAdminForm((prev) => ({ ...prev, phoneCountryCode: event.target.value }))}
                        className="h-10 px-2 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                      >
                        {PHONE_COUNTRY_CODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <input
                        type="tel"
                        placeholder="Phone Number"
                        value={createAdminForm.phoneNumber}
                        onChange={(event) => setCreateAdminForm((prev) => ({ ...prev, phoneNumber: event.target.value }))}
                        className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                    {!isCreateAdminOwnerLevel && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select
                            value={normalizedCreateAdminWorkCountry}
                            onChange={(event) => {
                              setCreateAdminForm((prev) => ({
                                ...prev,
                                workCountry: normalizeAdminVerificationCountry(event.target.value),
                                governmentIdType: '',
                                governmentIdNumber: '',
                                governmentIdFile: '',
                              }))
                              resetCreateAdminIdentityVerification()
                            }}
                            className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                          >
                            <option value="Nigeria">Nigeria</option>
                            <option value="International">Outside Nigeria</option>
                          </select>
                          <select
                            value={createAdminForm.governmentIdType}
                            onChange={(event) => {
                              setCreateAdminForm((prev) => ({ ...prev, governmentIdType: event.target.value }))
                              resetCreateAdminIdentityVerification()
                            }}
                            className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                          >
                            <option value="">Government ID Type</option>
                            {createAdminGovIdOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                        <input
                          type="text"
                          placeholder={normalizedCreateAdminWorkCountry === 'Nigeria' ? 'Government ID Number (NIN / Passport / Voter ID / Driver Licence)' : 'Government ID Number'}
                          value={createAdminForm.governmentIdNumber}
                          onChange={(event) => {
                            setCreateAdminForm((prev) => ({ ...prev, governmentIdNumber: event.target.value }))
                            resetCreateAdminIdentityVerification()
                          }}
                          className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                        />
                        <p className="text-xs text-text-muted">
                          Nigeria: International Passport, NIN, Voter&apos;s Card, or Driver&apos;s Licence. Outside Nigeria: government-issued ID.
                        </p>
                        <div className="space-y-2 rounded-md border border-border-light bg-background px-3 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Government ID Upload</label>
                            {createAdminForm.governmentIdFile && (
                              <span className="text-xs text-success">Uploaded: {createAdminForm.governmentIdFile}</span>
                            )}
                          </div>
                          <input
                            key={createAdminIdUploadKey}
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                              const file = event.target.files?.[0] || null
                              setCreateAdminForm((prev) => ({
                                ...prev,
                                governmentIdFile: file?.name || '',
                              }))
                              resetCreateAdminIdentityVerification()
                            }}
                            className="w-full h-10 px-3 border border-border rounded-md text-sm file:mr-2 file:border-0 file:bg-white file:px-2 file:py-1"
                          />
                          <button
                            type="button"
                            onClick={() => void verifyCreateAdminIdentity()}
                            disabled={isCreateAdminIdentityVerifying}
                            className="h-9 px-3 border border-primary text-primary rounded-md text-xs font-semibold hover:bg-primary-tint transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                          >
                            {isCreateAdminIdentityVerifying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {isCreateAdminIdentityVerifying ? 'Checking...' : 'Optional Identity Check'}
                          </button>
                          <p className="text-xs text-text-muted">
                            Verification is optional in the MVP. You can create the admin account without completing this step.
                          </p>
                          {createAdminIdentityVerification.message && (
                            <p
                              className={`text-xs ${
                                createAdminIdentityVerification.status === 'verified'
                                  ? 'text-success'
                                  : createAdminIdentityVerification.status === 'failed'
                                    ? 'text-error'
                                    : 'text-text-muted'
                              }`}
                            >
                              {createAdminIdentityVerification.message}
                            </p>
                          )}
                        </div>
                      </>
                    )}
                    {isCreateAdminOwnerLevel && (
                      <div className="rounded-md border border-border-light bg-[#FAFBFF] px-3 py-2">
                        <p className="text-xs text-text-secondary">Government ID verification is optional in the MVP.</p>
                      </div>
                    )}
                    <input
                      type="text"
                      placeholder="Residential Address (Optional)"
                      value={createAdminForm.residentialAddress}
                      onChange={(event) => setCreateAdminForm((prev) => ({ ...prev, residentialAddress: event.target.value }))}
                      className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                    />
                    {isCreateAdminOwnerLevel && (
                      <input
                        type="password"
                        placeholder="Owner Private Key (min 12 characters)"
                        value={createAdminForm.ownerPrivateKey}
                        onChange={(event) => setCreateAdminForm((prev) => ({ ...prev, ownerPrivateKey: event.target.value }))}
                        className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                      />
                    )}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          placeholder="Temporary Password"
                          value={createAdminForm.password}
                          onChange={(event) => setCreateAdminForm((prev) => ({ ...prev, password: event.target.value }))}
                          className="flex-1 min-w-[220px] h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={applyGeneratedCreateAdminPassword}
                          className="h-10 px-3 border border-border rounded-md text-xs font-medium text-text-primary hover:bg-background transition-colors"
                        >
                          Generate Strong Password
                        </button>
                      </div>
                      <p className="text-xs text-text-muted">
                        Use at least 8 characters with one number and one special character.
                      </p>
                    </div>
                    <select
                      value={createAdminForm.adminLevel}
                      onChange={(event) => {
                        setCreateAdminForm((prev) => ({
                          ...prev,
                          adminLevel: event.target.value,
                          ownerPrivateKey: '',
                          permissions: getDefaultPermissionsForAdminLevel(event.target.value),
                        }))
                        resetCreateAdminIdentityVerification()
                      }}
                      className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                    >
                      {isOwnerAdmin && <option value={ADMIN_LEVELS.OWNER}>Owner</option>}
                      <option value={ADMIN_LEVELS.SUPER}>Super Admin</option>
                      <option value={ADMIN_LEVELS.AREA_ACCOUNTANT}>Area Accountant Admin</option>
                      <option value={ADMIN_LEVELS.CUSTOMER_SERVICE}>Customer Service Admin</option>
                      <option value={ADMIN_LEVELS.TECHNICAL_SUPPORT}>Technical Support Admin</option>
                    </select>

                    <div className="rounded-md border border-border-light p-3">
                      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Role Permission Set</p>
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <button
                          type="button"
                          onClick={() => updateCreateAdminPermissions(getDefaultPermissionsForAdminLevel(createAdminForm.adminLevel))}
                          className="h-7 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background"
                        >
                          Reset to Role Default
                        </button>
                        <button
                          type="button"
                          onClick={() => updateCreateAdminPermissions(permissionDefinitions.map((permission) => permission.id))}
                          className="h-7 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background"
                        >
                          Select All
                        </button>
                        <span className="text-xs text-text-muted">{createAdminForm.permissions.length} selected</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {permissionDefinitions.map((permission) => {
                          const checked = createAdminForm.permissions.includes(permission.id)
                          return (
                            <label key={`create-${permission.id}`} className="h-8 px-2.5 rounded border border-border-light bg-white text-xs text-text-secondary inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => updateCreateAdminPermissions((previous) => togglePermissionFromList(previous, permission.id))}
                                className="w-3.5 h-3.5 accent-primary"
                              />
                              <span className={checked ? 'text-text-primary' : 'text-text-secondary'}>{permission.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={queueCreateAdmin}
                      className="h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors"
                    >
                      Create Admin Account
                    </button>
                    <p className="text-xs text-text-muted">
                      After clicking create, confirm the action in the popup.
                    </p>
                    {createdAdminCredentialPacket && (
                      <div className="rounded-md border border-border-light bg-background p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Created Admin Signup Packet</p>
                          <button
                            type="button"
                            onClick={() => void copyCreatedAdminSignupInfo()}
                            className="h-7 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-white inline-flex items-center gap-1.5"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy Signup Info
                          </button>
                        </div>
                        <p className="text-xs text-text-secondary">
                          {createdAdminCredentialPacket.fullName} ({createdAdminCredentialPacket.email})
                        </p>
                        <p className="text-xs text-text-secondary">Role: {getAdminLevelLabel(createdAdminCredentialPacket.adminLevel)}</p>
                        <p className="text-xs text-text-secondary break-all">Temporary Password: {createdAdminCredentialPacket.password}</p>
                        {createdAdminCredentialPacket.ownerPrivateKey && (
                          <p className="text-xs text-text-secondary break-all">Owner Private Key: {createdAdminCredentialPacket.ownerPrivateKey}</p>
                        )}
                        <p className="text-xs text-text-secondary break-all">Login URL: {createdAdminCredentialPacket.loginUrl}</p>
                        <p className="text-[11px] text-text-muted">Share this packet securely. The admin should change to a permanent password immediately.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border-light p-4">
                  <h4 className="text-sm font-semibold text-text-primary inline-flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-primary" />
                    Invite Admin
                  </h4>
                  <div className="space-y-3 mt-4">
                    <input
                      type="email"
                      placeholder="Invite Email"
                      value={inviteForm.email}
                      onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))}
                      className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                    />
                    <select
                      value={inviteForm.adminLevel}
                      onChange={(event) => setInviteForm((prev) => ({
                        ...prev,
                        adminLevel: event.target.value,
                        permissions: getDefaultPermissionsForAdminLevel(event.target.value),
                      }))}
                      className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                    >
                      {isOwnerAdmin && <option value={ADMIN_LEVELS.OWNER}>Owner Invite</option>}
                      <option value={ADMIN_LEVELS.SUPER}>Super Admin Invite</option>
                      <option value={ADMIN_LEVELS.AREA_ACCOUNTANT}>Area Accountant Invite</option>
                      <option value={ADMIN_LEVELS.CUSTOMER_SERVICE}>Customer Service Invite</option>
                      <option value={ADMIN_LEVELS.TECHNICAL_SUPPORT}>Technical Support Invite</option>
                    </select>
                    <div className="rounded-md border border-border-light p-3">
                      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Role Permission Set</p>
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <button
                          type="button"
                          onClick={() => updateInvitePermissions(getDefaultPermissionsForAdminLevel(inviteForm.adminLevel))}
                          className="h-7 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background"
                        >
                          Reset to Role Default
                        </button>
                        <button
                          type="button"
                          onClick={() => updateInvitePermissions(permissionDefinitions.map((permission) => permission.id))}
                          className="h-7 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background"
                        >
                          Select All
                        </button>
                        <span className="text-xs text-text-muted">{inviteForm.permissions.length} selected</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {permissionDefinitions.map((permission) => {
                          const checked = inviteForm.permissions.includes(permission.id)
                          return (
                            <label key={`invite-${permission.id}`} className="h-8 px-2.5 rounded border border-border-light bg-white text-xs text-text-secondary inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => updateInvitePermissions((previous) => togglePermissionFromList(previous, permission.id))}
                                className="w-3.5 h-3.5 accent-primary"
                              />
                              <span className={checked ? 'text-text-primary' : 'text-text-secondary'}>{permission.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={queueInviteAdmin}
                      className="h-9 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background transition-colors inline-flex items-center gap-2"
                    >
                      <Mail className="w-4 h-4" />
                      Generate Invite
                    </button>
                    {allowDemoInvite && (
                      <button
                        type="button"
                        onClick={queueDemoInvite}
                        className="h-9 px-4 border border-primary/40 rounded-md text-sm font-medium text-primary hover:bg-primary-tint transition-colors inline-flex items-center gap-2"
                      >
                        <Mail className="w-4 h-4" />
                        Generate Demo Invite
                      </button>
                    )}
                    {generatedInviteLink && (
                      <div className="rounded-md border border-border-light bg-background px-3 py-2">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-xs text-text-muted">Invite Link</p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void copyGeneratedInviteLink()}
                              className="h-7 px-2 border border-border rounded text-xs font-medium text-text-primary hover:bg-white inline-flex items-center gap-1"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copy
                            </button>
                            <button
                              type="button"
                              onClick={openGeneratedInviteSetup}
                              className="h-7 px-2 border border-primary/40 rounded text-xs font-medium text-primary hover:bg-white"
                            >
                              Open Setup
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-text-primary break-all">{generatedInviteLink}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border-light overflow-hidden">
                <div className="px-4 py-3 bg-[#F9FAFB] border-b border-border-light">
                  <p className="text-sm font-semibold text-text-primary">Admin Directory</p>
                </div>
                <div className="md:hidden p-3 space-y-3">
                  {adminAccounts.map((account) => {
                    const isSelfAccount = account.email?.trim()?.toLowerCase() === currentAdmin.email?.trim()?.toLowerCase()
                    const normalizedAccountLevel = normalizeAdminLevel(account.adminLevel)
                    const canManageProtectedLevel = isOwnerAdmin
                      || (normalizedAccountLevel !== ADMIN_LEVELS.OWNER && normalizedAccountLevel !== ADMIN_LEVELS.SUPER)
                    const canManageAccount = !isSelfAccount && canManageProtectedLevel
                    return (
                      <div key={`admin-mobile-${account.email}`} className="rounded-md border border-border-light bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-text-primary truncate">{account.fullName || account.email}</p>
                            <p className="text-xs text-text-secondary break-all mt-1">{account.email}</p>
                          </div>
                          <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${account.status === 'suspended' ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success'}`}>
                            {account.status === 'suspended' ? 'Suspended' : 'Active'}
                          </span>
                        </div>
                        <div className="mt-3">
                          <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1">Role</p>
                          {canManagePrivilegedAdminActions && canManageAccount ? (
                            <select
                              value={normalizeAdminLevel(account.adminLevel)}
                              onChange={(event) => queueAccountRoleChange(account, event.target.value)}
                              className="w-full h-8 px-2.5 border border-border rounded text-xs text-text-primary focus:outline-none focus:border-primary"
                            >
                              {isOwnerAdmin && <option value={ADMIN_LEVELS.OWNER}>Owner</option>}
                              <option value={ADMIN_LEVELS.SUPER}>Super Admin</option>
                              <option value={ADMIN_LEVELS.AREA_ACCOUNTANT}>Area Accountant Admin</option>
                              <option value={ADMIN_LEVELS.CUSTOMER_SERVICE}>Customer Service Admin</option>
                              <option value={ADMIN_LEVELS.TECHNICAL_SUPPORT}>Technical Support Admin</option>
                            </select>
                          ) : (
                            <p className="text-sm text-text-primary">{getAdminLevelLabel(account.adminLevel)}</p>
                          )}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={!canManageAccount}
                            onClick={() => queueAccountStatusChange(account.status === 'suspended' ? 'activate-admin' : 'suspend-admin', account)}
                            className="h-8 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            {account.status === 'suspended' ? 'Activate' : 'Suspend'}
                          </button>
                          <button
                            type="button"
                            disabled={!canManageAccount}
                            onClick={() => queueResetAdminPassword(account)}
                            className="h-8 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            Reset
                          </button>
                          <button
                            type="button"
                            disabled={!canManageAccount}
                            onClick={() => queueImpersonateAdmin(account)}
                            className="h-8 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                            Impersonate
                          </button>
                          <button
                            type="button"
                            disabled={!canManageAccount}
                            onClick={() => openPermissionEditor(account)}
                            className="h-8 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Permissions
                          </button>
                          <button
                            type="button"
                            disabled={!canManageAccount}
                            onClick={() => queueAccountStatusChange('delete-admin', account)}
                            className="col-span-2 h-8 px-2.5 border border-error/50 rounded text-xs font-medium text-error hover:bg-error-bg disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Admin
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[980px]">
                    <thead>
                      <tr className="bg-[#FCFDFF]">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Name</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Email</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Role</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminAccounts.map((account) => {
                        const isSelfAccount = account.email?.trim()?.toLowerCase() === currentAdmin.email?.trim()?.toLowerCase()
                        const normalizedAccountLevel = normalizeAdminLevel(account.adminLevel)
                        const canManageProtectedLevel = isOwnerAdmin
                          || (normalizedAccountLevel !== ADMIN_LEVELS.OWNER && normalizedAccountLevel !== ADMIN_LEVELS.SUPER)
                        const canManageAccount = !isSelfAccount && canManageProtectedLevel
                        return (
                          <tr key={account.email} className="border-t border-border-light hover:bg-background">
                            <td className="px-4 py-3 text-sm text-text-primary">{account.fullName}</td>
                            <td className="px-4 py-3 text-sm text-text-secondary">{account.email}</td>
                            <td className="px-4 py-3 text-sm">
                              {canManagePrivilegedAdminActions && canManageAccount ? (
                                <select
                                  value={normalizeAdminLevel(account.adminLevel)}
                                  onChange={(event) => queueAccountRoleChange(account, event.target.value)}
                                  className="h-8 min-w-[190px] px-2.5 border border-border rounded text-xs text-text-primary focus:outline-none focus:border-primary"
                                >
                                  {isOwnerAdmin && <option value={ADMIN_LEVELS.OWNER}>Owner</option>}
                                  <option value={ADMIN_LEVELS.SUPER}>Super Admin</option>
                                  <option value={ADMIN_LEVELS.AREA_ACCOUNTANT}>Area Accountant Admin</option>
                                  <option value={ADMIN_LEVELS.CUSTOMER_SERVICE}>Customer Service Admin</option>
                                  <option value={ADMIN_LEVELS.TECHNICAL_SUPPORT}>Technical Support Admin</option>
                                </select>
                              ) : (
                                getAdminLevelLabel(account.adminLevel)
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${account.status === 'suspended' ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success'}`}>
                                {account.status === 'suspended' ? 'Suspended' : 'Active'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={!canManageAccount}
                                  onClick={() => queueAccountStatusChange(account.status === 'suspended' ? 'activate-admin' : 'suspend-admin', account)}
                                  className="h-8 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                  {account.status === 'suspended' ? 'Activate' : 'Suspend'}
                                </button>
                                <button
                                  type="button"
                                  disabled={!canManageAccount}
                                  onClick={() => queueResetAdminPassword(account)}
                                  className="h-8 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                  Reset Password
                                </button>
                                <button
                                  type="button"
                                  disabled={!canManageAccount}
                                  onClick={() => queueImpersonateAdmin(account)}
                                  className="h-8 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                                >
                                  <ArrowLeftRight className="w-3.5 h-3.5" />
                                  Impersonate
                                </button>
                                <button
                                  type="button"
                                  disabled={!canManageAccount}
                                  onClick={() => openPermissionEditor(account)}
                                  className="h-8 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  Permissions
                                </button>
                                <button
                                  type="button"
                                  disabled={!canManageAccount}
                                  onClick={() => queueAccountStatusChange('delete-admin', account)}
                                  className="h-8 px-2.5 border border-error/50 rounded text-xs font-medium text-error hover:bg-error-bg disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-border-light overflow-hidden">
                <div className="px-4 py-3 bg-[#F9FAFB] border-b border-border-light">
                  <p className="text-sm font-semibold text-text-primary">Operations Assignment: Area Accountant</p>
                  <p className="text-xs text-text-muted mt-1">Assign each client to an Area Accountant. Area Accountant access is restricted to assigned clients only.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="bg-[#FCFDFF]">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Client</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Email</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Assigned Area Accountants</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Assigned At</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Assign / Reassign</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientAccounts.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-sm text-text-muted text-center">No client accounts found.</td>
                        </tr>
                      )}
                      {clientAccounts.map((account) => {
                        const clientEmail = account.email?.trim()?.toLowerCase() || ''
                        const assignments = assignmentByClientEmail.get(clientEmail)
                          || getClientAssignmentsForClientEmail(clientEmail, clientAssignments)
                        const assignedEmails = [...new Set(
                          (Array.isArray(assignments) ? assignments : [])
                            .map((entry) => String(entry?.assignedAccountantEmail || '').trim().toLowerCase())
                            .filter(Boolean),
                        )]
                        const assignedLabel = assignedEmails.length > 0
                          ? assignedEmails.map((email) => (
                            areaAccountantAdmins.find((admin) => admin.email?.trim()?.toLowerCase() === email)?.fullName || email
                          )).join(', ')
                          : 'Unassigned'
                        const latestAssignedAtIso = (Array.isArray(assignments) ? assignments : [])
                          .map((entry) => entry?.assignedAt)
                          .filter((value) => Number.isFinite(Date.parse(value || '')))
                          .sort((left, right) => Date.parse(right || '') - Date.parse(left || ''))[0] || ''
                        return (
                          <tr key={`assignment-${account.email}`} className="border-t border-border-light hover:bg-background">
                            <td className="px-4 py-3 text-sm text-text-primary">{account.fullName || account.businessName || '--'}</td>
                            <td className="px-4 py-3 text-sm text-text-secondary">{account.email || '--'}</td>
                            <td className="px-4 py-3 text-sm text-text-primary">{assignedLabel}</td>
                            <td className="px-4 py-3 text-sm text-text-secondary">{latestAssignedAtIso ? formatDateTime(latestAssignedAtIso) : '--'}</td>
                            <td className="px-4 py-3 text-sm">
                              <select
                                multiple
                                value={assignedEmails}
                                onChange={(event) => {
                                  const nextAssignedEmails = Array.from(event.target.selectedOptions).map((option) => option.value)
                                  queueClientAreaAssignment({
                                    clientEmail,
                                    assignedAccountantEmails: nextAssignedEmails,
                                    previousAssignedAccountantEmails: assignedEmails,
                                  })
                                }}
                                className="min-h-[92px] min-w-[230px] px-2.5 py-1.5 border border-border rounded text-xs text-text-primary focus:outline-none focus:border-primary"
                              >
                                {areaAccountantAdmins.map((admin) => (
                                  <option key={`assign-${admin.email}`} value={admin.email}>
                                    {admin.fullName || admin.email}
                                  </option>
                                ))}
                              </select>
                              <p className="text-[11px] text-text-muted mt-1">Hold Ctrl/Command to select multiple.</p>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {areaAccountantAdmins.length === 0 && (
                  <div className="px-4 py-3 border-t border-border-light text-xs text-warning bg-warning-bg">
                    No active Area Accountant admin is available. Create one to assign clients.
                  </div>
                )}
              </div>

              {latestPendingInvites.length > 0 && (
                <div className="rounded-lg border border-border-light overflow-hidden">
                  <div className="px-4 py-3 bg-[#F9FAFB] border-b border-border-light">
                    <p className="text-sm font-semibold text-text-primary">Pending Invites</p>
                    <p className="text-xs text-text-muted mt-1">Admin invite links expire after {ADMIN_INVITE_EXPIRY_HOURS} hours.</p>
                  </div>
                  <div className="md:hidden p-3 space-y-3">
                    {latestPendingInvites.map((invite) => (
                      <div key={`pending-invite-mobile-${invite.token}`} className="rounded-md border border-border-light bg-white p-3">
                        <p className="text-sm font-medium text-text-primary break-all">{invite.email}</p>
                        <p className="text-xs text-text-secondary mt-1">{getAdminLevelLabel(invite.adminLevel)}</p>
                        <p className="text-xs text-text-muted mt-2">Created: {formatDateTime(invite.createdAt)}</p>
                        <p className="text-xs text-text-muted">Expires: {formatDateTime(invite.expiresAt)}</p>
                        {canManagePrivilegedAdminActions && (
                          <button
                            type="button"
                            onClick={() => queueDeleteAdminInvite(invite)}
                            className="mt-3 h-8 px-3 border border-error/50 rounded text-xs font-medium text-error hover:bg-error-bg inline-flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Invite
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full min-w-[760px]">
                      <thead>
                        <tr className="bg-[#FCFDFF]">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Email</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Role</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Created</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Expires</th>
                          {canManagePrivilegedAdminActions && (
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Actions</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {latestPendingInvites.map((invite) => (
                          <tr key={invite.token} className="border-t border-border-light hover:bg-background">
                            <td className="px-4 py-3 text-sm text-text-primary break-all">{invite.email}</td>
                            <td className="px-4 py-3 text-sm text-text-secondary">{getAdminLevelLabel(invite.adminLevel)}</td>
                            <td className="px-4 py-3 text-sm text-text-secondary">{formatDateTime(invite.createdAt)}</td>
                            <td className="px-4 py-3 text-sm text-text-secondary">{formatDateTime(invite.expiresAt)}</td>
                            {canManagePrivilegedAdminActions && (
                              <td className="px-4 py-3 text-sm">
                                <button
                                  type="button"
                                  onClick={() => queueDeleteAdminInvite(invite)}
                                  className="h-8 px-2.5 border border-error/50 rounded text-xs font-medium text-error hover:bg-error-bg inline-flex items-center gap-1.5"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {permissionEditor && (
        <div className="fixed inset-0 z-[225] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white border border-border-light rounded-xl shadow-card p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-text-primary">Edit Admin Permissions</h4>
                <p className="text-sm text-text-secondary mt-1">
                  {permissionEditor.fullName} ({permissionEditor.email})
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Role: {getAdminLevelLabel(permissionEditor.adminLevel)}
                </p>
              </div>
              <button
                type="button"
                onClick={closePermissionEditor}
                className="h-8 px-3 border border-border rounded-md text-xs font-medium text-text-primary hover:bg-background transition-colors"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-text-muted mt-4">Choose one or more permissions. At least one permission is required.</p>

            <div className="flex flex-wrap items-center gap-2 mt-3 mb-3">
              <button
                type="button"
                onClick={() => setPermissionEditor((prev) => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    permissions: getDefaultPermissionsForAdminLevel(prev.adminLevel),
                  }
                })}
                className="h-7 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background"
              >
                Reset to Role Default
              </button>
              <button
                type="button"
                onClick={() => setPermissionEditor((prev) => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    permissions: permissionDefinitions.map((permission) => permission.id),
                  }
                })}
                className="h-7 px-2.5 border border-border rounded text-xs font-medium text-text-primary hover:bg-background"
              >
                Select All
              </button>
              <span className="text-xs text-text-muted">{permissionEditor.permissions.length} selected</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {permissionDefinitions.map((permission) => {
                const checked = permissionEditor.permissions.includes(permission.id)
                return (
                  <label
                    key={`edit-${permission.id}`}
                    className="h-8 px-2.5 rounded border border-border-light bg-white text-xs text-text-secondary inline-flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setPermissionEditor((prev) => {
                        if (!prev) return prev
                        return {
                          ...prev,
                          permissions: togglePermissionFromList(prev.permissions, permission.id),
                        }
                      })}
                      className="w-3.5 h-3.5 accent-primary"
                    />
                    <span className={checked ? 'text-text-primary' : 'text-text-secondary'}>{permission.label}</span>
                  </label>
                )
              })}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closePermissionEditor}
                className="h-9 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={queueUpdateAdminPermissions}
                className="h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors"
              >
                Save Permission Set
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-[220] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-border-light rounded-xl shadow-card p-6">
            <h4 className="text-lg font-semibold text-text-primary">Confirm Action</h4>
            <p className="text-sm text-text-secondary mt-2">
              {confirmAction.type === 'create-admin' && 'Create this admin account?'}
              {confirmAction.type === 'invite-admin' && 'Generate this admin invitation?'}
              {confirmAction.type === 'update-admin-permissions' && (
                `Save permission changes for ${confirmAction.payload?.email || 'this admin'}?`
              )}
              {confirmAction.type === 'impersonate-admin' && (
                `Impersonate ${confirmAction.payload?.fullName || confirmAction.payload?.email || 'this admin'}?`
              )}
              {confirmAction.type === 'suspend-admin' && 'Suspend this admin account?'}
              {confirmAction.type === 'activate-admin' && 'Activate this admin account?'}
              {confirmAction.type === 'delete-admin' && 'Delete this admin account? This cannot be undone.'}
              {confirmAction.type === 'delete-admin-invite' && 'Delete this pending invite? This cannot be undone.'}
              {confirmAction.type === 'change-admin-role' && (
                `Change admin role from ${getAdminLevelLabel(confirmAction.payload?.previousAdminLevel)} to ${getAdminLevelLabel(confirmAction.payload?.nextAdminLevel)}?`
              )}
              {confirmAction.type === 'reset-admin-password' && `Reset password for ${confirmAction.payload?.email || 'this admin'}?`}
              {confirmAction.type === 'assign-client-area-accountant' && (
                `${Array.isArray(confirmAction.payload?.assignedAccountantEmails) && confirmAction.payload.assignedAccountantEmails.length > 0
                  ? `Assign ${confirmAction.payload?.clientEmail || 'client'} to ${confirmAction.payload.assignedAccountantEmails.length} Area Accountant(s)?`
                  : `Clear Area Accountant assignment for ${confirmAction.payload?.clientEmail || 'client'}?`}`
              )}
              {confirmAction.type === 'logout-selected-clients' && `Force logout for ${confirmAction.payload?.emails?.length || 0} selected user(s)?`}
              {confirmAction.type === 'logout-all-clients' && `Force logout for all ${confirmAction.payload?.totalClients || 0} user(s)?`}
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={isBusy}
                className="h-9 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmQueuedAction()}
                disabled={isBusy}
                className="h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {isBusy && <DotLottiePreloader size={18} />}
                {isBusy ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminSettingsPage
