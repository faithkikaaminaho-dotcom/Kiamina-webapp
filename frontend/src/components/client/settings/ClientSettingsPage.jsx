import { useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard,
  DollarSign,
  TrendingUp,
  Building2,
  Upload,
  Settings,
  LogOut,
  Search,
  Bell,
  ChevronDown,
  Plus,
  Eye,
  X,
  FileUp,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  FileText,
  FileSpreadsheet,
  File,
  ChevronRight,
  User,
  CheckCircle,
  AlertCircle,
  UploadCloud,
  MapPin,
  Building,
  Lock,
  Users,
  UserPlus,
  Copy,
  Trash2,
  Loader2,
} from 'lucide-react'
import { INDUSTRY_OPTIONS } from '../../../data/client/mockData'
import {
  normalizeClientNotificationSettings,
  persistClientNotificationSettings,
  readClientNotificationSettings,
} from '../../../utils/clientNotificationPreferences'
import { apiFetch } from '../../../utils/apiClient'
import {
  cancelClientTeamInvite,
  createClientTeamInvite,
  fetchMyClientTeam,
  removeClientTeamMember,
  updateClientTeamMember,
} from '../../../utils/clientTeamApi'

const SETTINGS_REDIRECT_SECTION_KEY = 'kiaminaClientSettingsRedirectSection'
// import { verifyIdentityWithDojah } from '../../../utils/dojahIdentity'
// const GOVERNMENT_ID_TYPE_OPTIONS = ['NIN', "Voter's Card", 'International Passport', "Driver's Licence"]
// const MIN_GOV_ID_FILE_SIZE_BYTES = 80 * 1024
// const MIN_GOV_ID_IMAGE_WIDTH = 600
// const MIN_GOV_ID_IMAGE_HEIGHT = 400
const PHONE_COUNTRY_CODE_OPTIONS = [
  { value: '+234', label: 'NG +234' },
  { value: '+1', label: 'US/CA +1' },
  { value: '+44', label: 'UK +44' },
  { value: '+61', label: 'AU +61' },
]
const PHONE_COUNTRY_CODE_DIGIT_OPTIONS = PHONE_COUNTRY_CODE_OPTIONS
  .map((option) => ({
    code: option.value,
    digits: option.value.replace(/\D/g, ''),
  }))
  .sort((left, right) => right.digits.length - left.digits.length)
const ACCOUNT_DELETE_REASON_OPTIONS = [
  'Too expensive',
  'Missing features',
  'Using another platform',
  'Temporary break',
  'Other',
]
const ACCOUNT_DELETE_RETENTION_OPTIONS = [
  'I want support to help me fix this instead',
  'I may return later',
  'I want to delete permanently now',
]
const PHONE_LOCAL_NUMBER_REGEX = /^\d{10,11}$/
const CLIENT_IN_APP_NOTIFICATION_OPTIONS = [
  {
    key: 'inAppEnabled',
    label: 'Enable in-app notifications',
    desc: 'Show notification updates in your dashboard and top bar.',
  },
  {
    key: 'soundEnabled',
    label: 'Notification sound',
    desc: 'Play a sound when a new in-app notification arrives.',
    requiresInApp: true,
  },
  {
    key: 'documentApproved',
    label: 'Document approved updates',
    desc: 'Get notified when submitted documents are approved.',
    requiresInApp: true,
  },
  {
    key: 'documentRejected',
    label: 'Document rejected updates',
    desc: 'Get notified when submitted documents are rejected.',
    requiresInApp: true,
  },
  {
    key: 'documentInfoRequested',
    label: 'Document info requests',
    desc: 'Get notified when more details are requested for a document.',
    requiresInApp: true,
  },
  {
    key: 'verificationUpdates',
    label: 'Verification updates',
    desc: 'Get notified when your verification status changes.',
    requiresInApp: true,
  },
  {
    key: 'accountSuspended',
    label: 'Account suspension alerts',
    desc: 'Get notified if account access is restricted.',
    requiresInApp: true,
  },
  {
    key: 'adminMessages',
    label: 'Admin messages',
    desc: 'Receive direct notices and reminders sent by admins. Critical forced messages can still be delivered.',
    requiresInApp: true,
  },
]
const CLIENT_EMAIL_NOTIFICATION_OPTIONS = [
  {
    key: 'emailNewUploads',
    label: 'Email for new uploads',
    desc: 'Receive email alerts when new documents are uploaded to your account.',
  },
  {
    key: 'emailApprovals',
    label: 'Email for document decisions',
    desc: 'Receive email alerts when documents are approved or rejected.',
  },
  {
    key: 'emailWeeklySummary',
    label: 'Weekly email summary',
    desc: 'Receive a weekly digest of your account activity.',
  },
  {
    key: 'emailSecurityAlerts',
    label: 'Security alert emails',
    desc: 'Receive email alerts about suspicious sign-ins or security events.',
  },
]
const CLIENT_NOTIFICATION_EDITABLE_KEYS = [
  ...CLIENT_IN_APP_NOTIFICATION_OPTIONS.map((item) => item.key),
  ...CLIENT_EMAIL_NOTIFICATION_OPTIONS.map((item) => item.key),
]
const PASSWORD_SECURITY_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
const CLIENT_IMAGE_ASSET_MAX_SIZE_BYTES = 5 * 1024 * 1024
const DEFAULT_ACCOUNT_SETTINGS = Object.freeze({
  twoStepEnabled: false,
  twoStepMethod: '',
  verifiedPhoneNumber: '',
  recoveryEmail: '',
  enabledAt: '',
  lastVerifiedAt: '',
})
const normalizeAccountSettingsState = (payload = {}) => {
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
const resolvePhoneParts = (value = '', fallbackCode = '+234') => {
  const raw = String(value || '').trim()
  const matchingOption = PHONE_COUNTRY_CODE_OPTIONS.find((option) => raw.startsWith(option.value))
  const compactDigits = raw.replace(/\D/g, '')
  const digitMatchedOption = !matchingOption && compactDigits
    ? PHONE_COUNTRY_CODE_DIGIT_OPTIONS.find((option) => compactDigits.startsWith(option.digits))
    : null
  if (!raw) {
    return {
      code: fallbackCode,
      number: '',
    }
  }
  if (!matchingOption) {
    if (digitMatchedOption) {
      const derivedNumber = compactDigits.slice(digitMatchedOption.digits.length)
      return {
        code: digitMatchedOption.code,
        number: derivedNumber.length === 11 && derivedNumber.startsWith('0')
          ? derivedNumber.slice(1)
          : derivedNumber,
      }
    }
    return {
      code: fallbackCode,
      number: compactDigits || raw,
    }
  }
  const derivedNumber = raw.slice(matchingOption.value.length).replace(/\D/g, '').trim()
  return {
    code: matchingOption.value,
    number: derivedNumber.length === 11 && derivedNumber.startsWith('0')
      ? derivedNumber.slice(1)
      : derivedNumber,
  }
}
const formatPhoneNumber = (code = '+234', number = '') => {
  const normalizedCode = String(code || '').trim() || '+234'
  const normalizedNumber = normalizePhoneLocalNumber(number)
  if (!normalizedNumber) return ''
  return `${normalizedCode} ${normalizedNumber}`.trim()
}
const sanitizeLettersOnly = (value = '') => (
  String(value || '')
    .replace(/[^A-Za-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart()
)
const toTitleCaseValue = (value = '') => (
  String(value || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
)
const sanitizeDigitsOnly = (value = '') => String(value || '').replace(/\D/g, '')
const sanitizePhoneInputDigits = (value = '') => sanitizeDigitsOnly(value).slice(0, 11)
const normalizePhoneLocalNumber = (value = '') => {
  const digits = sanitizePhoneInputDigits(value)
  if (!PHONE_LOCAL_NUMBER_REGEX.test(digits)) return ''
  return digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits
}
const sanitizeAlphaNumeric = (value = '') => String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
const splitFullName = (value = '') => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return {
      firstName: '',
      lastName: '',
      otherNames: '',
    }
  }
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: '',
      otherNames: '',
    }
  }
  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1],
    otherNames: parts.slice(1, -1).join(' '),
  }
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
const padTwoDigits = (value) => String(value).padStart(2, '0')
const FINANCIAL_MONTH_OPTIONS = Object.freeze(
  FINANCIAL_MONTH_NAMES.map((monthName, index) => ({
    value: padTwoDigits(index + 1),
    label: monthName,
  })),
)
const resolveFinancialBoundaryMonth = (value = '') => {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const canonicalMatch = raw.match(/^(\d{2})-(?:\d{2}|LAST)$/i)
  if (canonicalMatch) {
    const month = Number(canonicalMatch[1])
    if (month >= 1 && month <= 12) return padTwoDigits(month)
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const month = Number(isoMatch[2])
    if (month >= 1 && month <= 12) return padTwoDigits(month)
  }

  const firstLastMatch = raw.match(/^(First|Last)\s+day\s+of\s+([A-Za-z]+)$/i)
  if (firstLastMatch) {
    const monthName = firstLastMatch[2].toLowerCase()
    const month = FINANCIAL_MONTH_LOOKUP[monthName]
    if (month) return padTwoDigits(month)
  }

  const shortMatch = raw.match(/^(\d{1,2})\s+([A-Za-z]+)$/)
  if (shortMatch) {
    const month = FINANCIAL_MONTH_LOOKUP[String(shortMatch[2] || '').toLowerCase()]
    if (month) return padTwoDigits(month)
  }

  const numericMonth = Number(raw)
  if (Number.isFinite(numericMonth) && numericMonth >= 1 && numericMonth <= 12) {
    return padTwoDigits(numericMonth)
  }

  const byName = FINANCIAL_MONTH_LOOKUP[raw.toLowerCase()]
  if (byName) return padTwoDigits(byName)

  return ''
}
const normalizeFinancialBoundaryDate = (value = '', boundary = 'start') => {
  const monthToken = resolveFinancialBoundaryMonth(value)
  if (!monthToken) return ''
  return boundary === 'end' ? `${monthToken}-LAST` : `${monthToken}-01`
}
const getFinancialBoundaryMonth = (value = '') => resolveFinancialBoundaryMonth(value)
const getFinancialBoundaryMonthName = (value = '') => {
  const monthToken = resolveFinancialBoundaryMonth(value)
  if (!monthToken) return ''
  const monthIndex = Number(monthToken) - 1
  if (monthIndex < 0 || monthIndex >= FINANCIAL_MONTH_NAMES.length) return ''
  return FINANCIAL_MONTH_NAMES[monthIndex]
}
const formatFinancialBoundaryDisplay = (value = '', boundary = 'start') => {
  const monthName = getFinancialBoundaryMonthName(value)
  if (!monthName) return ''
  return boundary === 'end'
    ? `Last day of ${monthName}`
    : `First day of ${monthName}`
}

function SettingsPage({
  showToast,
  profilePhoto,
  setProfilePhoto,
  companyLogo,
  setCompanyLogo,
  setCompanyName,
  setClientFirstName,
  settingsStorageKey,
  clientEmail = '',
  clientName = '',
  clientTeamRole = 'owner',
  clientTeamOwnerEmail = '',
  clientTeamOwnerName = '',
  clientTeamAffiliation = null,
  initialSettingsProfile = {},
  initialVerificationDocs = {},
  initialAccountSettings = {},
  initialNotificationSettings = {},
  onSettingsProfileChange,
  onClientAssetChange,
  onVerificationDocsChange,
  onAccountSettingsChange,
  onNotificationSettingsChange,
  verificationLockEnforced = false,
  canManageAccountSecurity = false,
  authProvider = '',
  hasPassword = undefined,
  onRequestPasswordResetLink,
  onChangePassword,
  canDeleteAccount = false,
  onDeleteAccount,
}) {
  const [activeSection, setActiveSection] = useState('user-profile')
  const [editMode, setEditMode] = useState({
    'account-settings': false,
    'user-profile': false,
    'notifications': false,
    'team-management': false,
    'business-profile': false,
    'tax-details': false,
    'registered-address': false,
  })

  const scopedStorageSuffix = settingsStorageKey?.includes(':')
    ? settingsStorageKey.split(':').slice(1).join(':')
    : ''
  const getScopedClientKey = (baseKey) => (
    scopedStorageSuffix ? `${baseKey}:${scopedStorageSuffix}` : baseKey
  )
  const verificationDocsKey = getScopedClientKey('verificationDocs')
  const profilePhotoKey = getScopedClientKey('profilePhoto')
  const companyLogoKey = getScopedClientKey('companyLogo')
  const teamMembersKey = getScopedClientKey('clientTeamMembers')
  const teamInvitesKey = getScopedClientKey('clientTeamInvites')
  const legacySettingsStorageEnabled = String(
    import.meta.env.VITE_ENABLE_LEGACY_SETTINGS_STORAGE_CACHE || '',
  ).trim().toLowerCase() === 'true'

  const readLegacyJson = (key, fallbackValue) => {
    if (!legacySettingsStorageEnabled || typeof localStorage === 'undefined') return fallbackValue
    try {
      const saved = localStorage.getItem(key)
      if (!saved) return fallbackValue
      const parsed = JSON.parse(saved)
      return parsed ?? fallbackValue
    } catch {
      return fallbackValue
    }
  }
  const writeLegacyJson = (key, value) => {
    if (!legacySettingsStorageEnabled || typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // no-op
    }
  }
  const writeLegacyString = (key, value) => {
    if (!legacySettingsStorageEnabled || typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(key, String(value || ''))
    } catch {
      // no-op
    }
  }

  // Initialize form data from localStorage
  const getInitialFormData = () => {
    const fallbackData = {
      firstName: '',
      lastName: '',
      otherNames: '',
      fullName: '',
      email: '',
      phone: '',
      phoneCountryCode: '+234',
      phoneLocalNumber: '',
      roleInCompany: '',
      businessType: '',
      cacNumber: '',
      businessName: '',
      country: '',
      currency: 'NGN',
      language: 'English',
      industry: '',
      industryOther: '',
      tin: '',
      reportingCycle: '',
      startMonth: '',
      address1: '',
      address2: '',
      city: '',
      postalCode: '',
      addressCountry: 'Nigeria',
    }
    const settingsProfile = initialSettingsProfile && typeof initialSettingsProfile === 'object'
      ? initialSettingsProfile
      : {}
    const legacyProfile = readLegacyJson(settingsStorageKey || 'settingsFormData', {})
    const parsed = legacySettingsStorageEnabled ? legacyProfile : settingsProfile
    const normalizeField = (value = '') => String(value || '').trim()
    const merged = {
      ...fallbackData,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      email: normalizeField(settingsProfile?.email || parsed?.email || clientEmail).toLowerCase(),
      firstName: normalizeField(settingsProfile?.firstName || parsed?.firstName),
      lastName: normalizeField(settingsProfile?.lastName || parsed?.lastName),
      otherNames: normalizeField(settingsProfile?.otherNames || parsed?.otherNames),
      fullName: normalizeField(settingsProfile?.fullName || parsed?.fullName),
      phone: normalizeField(settingsProfile?.phone || parsed?.phone),
      roleInCompany: normalizeField(settingsProfile?.roleInCompany || parsed?.roleInCompany),
      businessType: normalizeField(settingsProfile?.businessType || parsed?.businessType),
      businessName: normalizeField(settingsProfile?.businessName || parsed?.businessName),
      country: normalizeField(settingsProfile?.country || parsed?.country),
      currency: normalizeField(settingsProfile?.currency || parsed?.currency || 'NGN'),
      language: normalizeField(settingsProfile?.language || parsed?.language || 'English'),
      industry: normalizeField(settingsProfile?.industry || parsed?.industry),
      industryOther: normalizeField(settingsProfile?.industryOther || parsed?.industryOther),
      tin: normalizeField(settingsProfile?.tin || parsed?.tin),
      reportingCycle: normalizeField(settingsProfile?.reportingCycle || parsed?.reportingCycle),
      startMonth: normalizeField(settingsProfile?.startMonth || parsed?.startMonth),
      address1: normalizeField(settingsProfile?.address1 || settingsProfile?.address || parsed?.address1 || parsed?.address),
      address2: normalizeField(settingsProfile?.address2 || parsed?.address2),
      city: normalizeField(settingsProfile?.city || parsed?.city),
      postalCode: normalizeField(settingsProfile?.postalCode || parsed?.postalCode),
      addressCountry: normalizeField(settingsProfile?.addressCountry || parsed?.addressCountry || settingsProfile?.country || parsed?.country || 'Nigeria'),
      cacNumber: normalizeField(settingsProfile?.cacNumber || parsed?.cacNumber),
      cri: normalizeField(settingsProfile?.cri || parsed?.cri),
    }
    const fallbackCode = String(merged.phoneCountryCode || '+234').trim() || '+234'
    const storedPhoneValue = merged.phoneLocalNumber || merged.phone
    const phoneParts = resolvePhoneParts(storedPhoneValue, fallbackCode)
    const parsedNameParts = splitFullName(merged.fullName)
    const resolvedFirstName = String(merged.firstName || parsedNameParts.firstName || '').trim()
    const resolvedLastName = String(merged.lastName || parsedNameParts.lastName || '').trim()
    const resolvedOtherNames = String(merged.otherNames || parsedNameParts.otherNames || '').trim()
    const normalizedFinancialYearStart = normalizeFinancialBoundaryDate(merged.startMonth, 'start')
    const normalizedFinancialYearEnd = normalizeFinancialBoundaryDate(merged.reportingCycle, 'end')
    return {
      ...merged,
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      otherNames: resolvedOtherNames,
      fullName: [resolvedFirstName, resolvedOtherNames, resolvedLastName].filter(Boolean).join(' ').trim(),
      phoneCountryCode: phoneParts.code,
      phone: phoneParts.number,
      phoneLocalNumber: phoneParts.number,
      startMonth: normalizedFinancialYearStart || merged.startMonth || '',
      reportingCycle: normalizedFinancialYearEnd || merged.reportingCycle || '',
    }
  }

  const [formData, setFormData] = useState(getInitialFormData)
  const [draftData, setDraftData] = useState(getInitialFormData)
  const [errors, setErrors] = useState({})
  const readNotificationPreferences = () => {
    const localSettings = readClientNotificationSettings(clientEmail || '')
    const backendSettings = initialNotificationSettings && typeof initialNotificationSettings === 'object'
      ? initialNotificationSettings
      : {}
    return normalizeClientNotificationSettings({
      ...localSettings,
      ...backendSettings,
    })
  }
  const [notifications, setNotifications] = useState(readNotificationPreferences)
  const [notificationDraft, setNotificationDraft] = useState(readNotificationPreferences)
  const [verificationDocs, setVerificationDocs] = useState(() => {
    const backendDocs = initialVerificationDocs && typeof initialVerificationDocs === 'object'
      ? initialVerificationDocs
      : {}
    const legacyDocs = readLegacyJson(verificationDocsKey, readLegacyJson('verificationDocs', {}))
    const parsed = legacySettingsStorageEnabled ? legacyDocs : backendDocs
    return {
      govId: null,
      govIdType: '',
      govIdNumber: '',
      govIdVerifiedAt: '',
      govIdVerificationStatus: '',
      govIdClarityStatus: '',
      businessReg: null,
      businessRegFileCacheKey: '',
      businessRegMimeType: '',
      businessRegSize: 0,
      businessRegUploadedAt: '',
      businessRegVerificationStatus: '',
      businessRegSubmittedAt: '',
      ...parsed,
    }
  })
  const [logoFile, setLogoFile] = useState(companyLogo)
  const [photoFile, setPhotoFile] = useState(profilePhoto)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'manager',
  })
  const [generatedInviteLink, setGeneratedInviteLink] = useState('')
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deleteAccountStep, setDeleteAccountStep] = useState(1)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deleteAccountDraft, setDeleteAccountDraft] = useState({
    reason: '',
    reasonOther: '',
    retentionIntent: '',
    acknowledgedPermanentDeletion: false,
  })
  const [accountSettings, setAccountSettings] = useState(() => normalizeAccountSettingsState(initialAccountSettings))
  const [isSendingPasswordResetLink, setIsSendingPasswordResetLink] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordChangeForm, setPasswordChangeForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [securityChallenge, setSecurityChallenge] = useState({
    open: false,
    mode: '',
    otp: '',
    isSending: false,
    isVerifying: false,
    expiresAt: '',
  })
  const [saveConfirmation, setSaveConfirmation] = useState({
    open: false,
    title: '',
    message: '',
  })

  const toTrimmedValue = (value) => String(value || '').trim()
  const buildClientFullName = (payload = {}) => {
    const firstName = toTrimmedValue(payload.firstName)
    const lastName = toTrimmedValue(payload.lastName)
    const otherNames = toTrimmedValue(payload.otherNames)
    return [firstName, otherNames, lastName].filter(Boolean).join(' ').trim()
  }
  const normalizeCriValue = (value = '') => {
    const normalized = toTrimmedValue(value).toUpperCase()
    if (!normalized) return ''
    if (normalized.startsWith('CRI-')) return normalized
    if (normalized.startsWith('CRI')) {
      const suffix = normalized.slice(3).replace(/^[\s:-]+/, '').replace(/[^A-Z0-9-]/g, '')
      return suffix ? `CRI-${suffix}` : ''
    }
    const suffix = normalized.replace(/[^A-Z0-9-]/g, '')
    return suffix ? `CRI-${suffix}` : ''
  }
  const resolveFallbackCri = (seed = '') => {
    const token = toTrimmedValue(seed).replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()
    return token ? `CRI-${token}` : 'CRI-0000'
  }
  const normalizeClientRole = (value = '') => {
    const normalized = toTrimmedValue(value).toLowerCase()
    if (normalized === 'manager') return 'manager'
    if (normalized === 'accountant') return 'accountant'
    if (normalized === 'viewer') return 'viewer'
    return 'owner'
  }
  const toRoleLabel = (value = '') => {
    const normalized = normalizeClientRole(value)
    if (normalized === 'manager') return 'Manager'
    if (normalized === 'accountant') return 'Accountant'
    if (normalized === 'viewer') return 'Viewer'
    return 'Primary Owner'
  }
  const normalizedTeamRole = normalizeClientRole(clientTeamRole)
  const normalizedAuthProvider = toTrimmedValue(authProvider).toLowerCase()
  const passwordIsConfigured = hasPassword === undefined
    ? normalizedAuthProvider !== 'google'
    : Boolean(hasPassword)
  const passwordActionLabel = passwordIsConfigured ? 'Change Password' : 'Add Password'
  const canManageTeam = normalizedTeamRole === 'owner'
  const isAffiliatedTeamMember = Boolean(clientTeamAffiliation?.isTeamMember)
  const affiliatedWorkspaceSections = ['business-profile', 'tax-details']
  const affiliatedWorkspaceFields = [
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
  ]
  const affiliatedWorkspaceOwnerName = toTrimmedValue(clientTeamAffiliation?.ownerName || clientTeamOwnerName) || 'the primary owner'
  const affiliatedWorkspaceOwnerEmail = toTrimmedValue(clientTeamAffiliation?.ownerEmail || clientTeamOwnerEmail).toLowerCase()
  const affiliatedWorkspaceName = toTrimmedValue(clientTeamAffiliation?.companyName || formData.businessName) || 'this company workspace'
  const teamWorkspaceDisplayValues = isAffiliatedTeamMember
    ? {
        businessType: toTrimmedValue(clientTeamAffiliation?.businessType || formData.businessType),
        businessName: toTrimmedValue(clientTeamAffiliation?.companyName || formData.businessName),
        country: toTrimmedValue(clientTeamAffiliation?.country || formData.country),
        currency: toTrimmedValue(clientTeamAffiliation?.currency || formData.currency),
        industry: toTrimmedValue(clientTeamAffiliation?.industry || formData.industry),
        industryOther: toTrimmedValue(clientTeamAffiliation?.industryOther || formData.industryOther),
        cacNumber: toTrimmedValue(clientTeamAffiliation?.cacNumber || formData.cacNumber),
        tin: toTrimmedValue(clientTeamAffiliation?.tin || formData.tin),
        reportingCycle: toTrimmedValue(clientTeamAffiliation?.reportingCycle || formData.reportingCycle),
        startMonth: toTrimmedValue(clientTeamAffiliation?.startMonth || formData.startMonth),
      }
    : null

  const toIsoDateOrNow = (value = '') => {
    const parsed = Date.parse(value || '')
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString()
  }
  const formatDateTime = (value = '') => {
    const parsed = Date.parse(value || '')
    if (!Number.isFinite(parsed)) return '--'
    return new Date(parsed).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  const isInviteExpired = (invite = {}) => {
    const expiryMs = Date.parse(invite?.expiresAt || '')
    if (!Number.isFinite(expiryMs)) return true
    return Date.now() > expiryMs
  }
  const getInviteStatus = (invite = {}) => {
    const status = toTrimmedValue(invite?.status).toLowerCase()
    if (status === 'accepted') return 'Accepted'
    if (status === 'cancelled' || status === 'canceled') return 'Cancelled'
    if (status === 'revoked') return 'Cancelled'
    if (status === 'expired') return 'Expired'
    if (isInviteExpired(invite)) return 'Expired'
    return 'Pending'
  }
  const normalizeInviteRecord = (invite = {}, companyId = '') => {
    const normalizedEmail = toTrimmedValue(invite?.email).toLowerCase()
    return {
      id: toTrimmedValue(invite?.id) || `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      email: normalizedEmail,
      role: normalizeClientRole(invite?.role),
      invitedBy: toTrimmedValue(invite?.invitedBy) || 'Primary Owner',
      companyId: toTrimmedValue(invite?.companyId) || companyId,
      token: toTrimmedValue(invite?.token),
      expiresAt: toIsoDateOrNow(invite?.expiresAt),
      status: getInviteStatus(invite),
      createdAt: toIsoDateOrNow(invite?.createdAt),
      acceptedAt: invite?.acceptedAt ? toIsoDateOrNow(invite.acceptedAt) : '',
      cancelledAt: invite?.cancelledAt ? toIsoDateOrNow(invite.cancelledAt) : '',
      singleUse: invite?.singleUse !== false,
      reason: toTrimmedValue(invite?.reason),
    }
  }
  const normalizeTeamMemberRecord = (member = {}, companyId = '') => {
    const normalizedEmail = toTrimmedValue(member?.email).toLowerCase()
    if (!normalizedEmail) return null
    const normalizedRole = normalizeClientRole(member?.role)
    return {
      id: toTrimmedValue(member?.id) || `TM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      email: normalizedEmail,
      fullName: toTrimmedValue(member?.fullName) || normalizedEmail,
      role: normalizedRole,
      companyId: toTrimmedValue(member?.companyId) || companyId,
      status: toTrimmedValue(member?.status) || 'Active',
      joinedAt: toIsoDateOrNow(member?.joinedAt),
      isPrimaryOwner: normalizedRole === 'owner' || Boolean(member?.isPrimaryOwner),
    }
  }
  const buildCompanyId = (seed = '') => {
    const normalized = toTrimmedValue(seed).toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!normalized) return 'CMP-LOCAL-0001'
    return `CMP-${normalized.slice(0, 12).toUpperCase()}`
  }

  const resolvedClientEmail = toTrimmedValue(clientEmail || formData.email || scopedStorageSuffix).toLowerCase()
  const resolvedClientCri = normalizeCriValue(formData.cri || draftData.cri) || resolveFallbackCri(resolvedClientEmail || formData.businessName)
  const companyId = buildCompanyId(resolvedClientEmail || formData.businessName)
  const ownerDisplayName = toTrimmedValue(buildClientFullName(formData) || clientName || 'Primary Owner')
  const ownerMemberId = `TM-OWNER-${companyId}`
  const ownerFallbackEmail = resolvedClientEmail || 'owner@company.local'
  const ownerFallbackName = ownerDisplayName || 'Primary Owner'
  const initialOwnerMember = normalizeTeamMemberRecord({
    id: ownerMemberId,
    email: ownerFallbackEmail,
    fullName: ownerFallbackName,
    role: 'owner',
    status: 'Active',
    joinedAt: new Date().toISOString(),
    isPrimaryOwner: true,
  }, companyId)

  const [teamMembers, setTeamMembers] = useState(() => {
    const parsed = readLegacyJson(teamMembersKey, [])
    const normalized = (Array.isArray(parsed) ? parsed : [])
      .map((member) => normalizeTeamMemberRecord(member, companyId))
      .filter(Boolean)
    if (normalized.length === 0 && initialOwnerMember) return [initialOwnerMember]
    return normalized
  })
  const [teamInvites, setTeamInvites] = useState(() => {
    const parsed = readLegacyJson(teamInvitesKey, [])
    return (Array.isArray(parsed) ? parsed : [])
      .map((invite) => normalizeInviteRecord(invite, companyId))
      .filter((invite) => invite.email && invite.token)
  })
  const [isTeamSyncing, setIsTeamSyncing] = useState(false)
  const applyBackendTeamState = (payload = {}) => {
    const normalizedMembers = (Array.isArray(payload?.members) ? payload.members : [])
      .map((member) => normalizeTeamMemberRecord(member, companyId))
      .filter(Boolean)
    const normalizedInvites = (Array.isArray(payload?.invites) ? payload.invites : [])
      .map((invite) => normalizeInviteRecord(invite, companyId))
      .filter((invite) => invite.email && invite.token)
    setTeamMembers(normalizedMembers.length > 0 ? normalizedMembers : (initialOwnerMember ? [initialOwnerMember] : []))
    setTeamInvites(normalizedInvites)
  }

  const normalizedProfileForVerification = {
    fullName: buildClientFullName(formData),
    email: toTrimmedValue(formData.email).toLowerCase(),
    phone: formatPhoneNumber(formData.phoneCountryCode, formData.phone),
    address: toTrimmedValue(formData.address1),
    businessType: toTrimmedValue(formData.businessType),
    country: toTrimmedValue(formData.country || formData.addressCountry),
  }
  const buildSettingsProfilePayload = (source = {}) => {
    const normalizedSource = source && typeof source === 'object' ? source : {}
    return {
      ...normalizedSource,
      fullName: buildClientFullName(normalizedSource),
      email: toTrimmedValue(normalizedSource.email).toLowerCase(),
      phone: formatPhoneNumber(normalizedSource.phoneCountryCode, normalizedSource.phone),
      address: toTrimmedValue(normalizedSource.address1),
      businessType: toTrimmedValue(normalizedSource.businessType),
      country: toTrimmedValue(normalizedSource.country || normalizedSource.addressCountry),
      reportingCycle: normalizeFinancialBoundaryDate(normalizedSource.reportingCycle, 'end'),
      startMonth: normalizeFinancialBoundaryDate(normalizedSource.startMonth, 'start'),
      phoneCountryCode: toTrimmedValue(normalizedSource.phoneCountryCode || '+234') || '+234',
      phoneLocalNumber: toTrimmedValue(normalizedSource.phone),
    }
  }
  const buildSecurityPhoneNumber = (source = {}) => {
    const countryCode = toTrimmedValue(source.phoneCountryCode || '+234') || '+234'
    const localNumber = normalizePhoneLocalNumber(source.phone || source.phoneLocalNumber || '')
    if (!localNumber) return ''
    return `${countryCode}${localNumber}`.replace(/\s+/g, '')
  }
  const hasProfileField = (source, field) => Object.prototype.hasOwnProperty.call(source || {}, field)
  const buildIncomingSettingsFormPatch = (source = {}) => {
    const normalizedSource = source && typeof source === 'object' ? source : {}
    const next = {}
    const hasNameField = (
      hasProfileField(normalizedSource, 'firstName')
      || hasProfileField(normalizedSource, 'lastName')
      || hasProfileField(normalizedSource, 'otherNames')
      || hasProfileField(normalizedSource, 'fullName')
    )
    const hasPhoneField = hasProfileField(normalizedSource, 'phone')

    if (hasNameField) {
      next.firstName = toTrimmedValue(normalizedSource.firstName)
      next.lastName = toTrimmedValue(normalizedSource.lastName)
      next.otherNames = toTrimmedValue(normalizedSource.otherNames)
      next.fullName = buildClientFullName(normalizedSource) || toTrimmedValue(normalizedSource.fullName)
    }
    if (hasProfileField(normalizedSource, 'email') || clientEmail) {
      next.email = toTrimmedValue(normalizedSource.email || clientEmail).toLowerCase()
    }
    if (hasPhoneField) {
      const phoneParts = resolvePhoneParts(normalizedSource.phone || '')
      next.phone = phoneParts.number
      next.phoneCountryCode = phoneParts.code || '+234'
      next.phoneLocalNumber = phoneParts.number
    }
    if (hasProfileField(normalizedSource, 'address1') || hasProfileField(normalizedSource, 'address')) {
      next.address1 = toTrimmedValue(normalizedSource.address1 || normalizedSource.address)
    }
    if (hasProfileField(normalizedSource, 'address2')) next.address2 = toTrimmedValue(normalizedSource.address2)
    if (hasProfileField(normalizedSource, 'city')) next.city = toTrimmedValue(normalizedSource.city)
    if (hasProfileField(normalizedSource, 'postalCode')) next.postalCode = toTrimmedValue(normalizedSource.postalCode)
    if (hasProfileField(normalizedSource, 'addressCountry') || hasProfileField(normalizedSource, 'country')) {
      next.addressCountry = toTrimmedValue(normalizedSource.addressCountry || normalizedSource.country || 'Nigeria')
    }
    if (hasProfileField(normalizedSource, 'roleInCompany')) next.roleInCompany = toTrimmedValue(normalizedSource.roleInCompany)
    if (hasProfileField(normalizedSource, 'businessType')) next.businessType = toTrimmedValue(normalizedSource.businessType)
    if (hasProfileField(normalizedSource, 'businessName')) next.businessName = toTrimmedValue(normalizedSource.businessName)
    if (hasProfileField(normalizedSource, 'country')) next.country = toTrimmedValue(normalizedSource.country)
    if (hasProfileField(normalizedSource, 'currency')) next.currency = toTrimmedValue(normalizedSource.currency || 'NGN')
    if (hasProfileField(normalizedSource, 'language')) next.language = toTrimmedValue(normalizedSource.language || 'English')
    if (hasProfileField(normalizedSource, 'industry')) next.industry = toTrimmedValue(normalizedSource.industry)
    if (hasProfileField(normalizedSource, 'industryOther')) next.industryOther = toTrimmedValue(normalizedSource.industryOther)
    if (hasProfileField(normalizedSource, 'tin')) next.tin = toTrimmedValue(normalizedSource.tin)
    if (hasProfileField(normalizedSource, 'reportingCycle')) {
      next.reportingCycle = normalizeFinancialBoundaryDate(normalizedSource.reportingCycle, 'end')
    }
    if (hasProfileField(normalizedSource, 'startMonth')) {
      next.startMonth = normalizeFinancialBoundaryDate(normalizedSource.startMonth, 'start')
    }
    if (hasProfileField(normalizedSource, 'cacNumber')) next.cacNumber = toTrimmedValue(normalizedSource.cacNumber)
    if (hasProfileField(normalizedSource, 'cri')) next.cri = toTrimmedValue(normalizedSource.cri)

    return next
  }
  const initialSettingsProfileSyncSignature = JSON.stringify(buildIncomingSettingsFormPatch(initialSettingsProfile))
  const lastAppliedSettingsProfileSyncSignatureRef = useRef('')
  const initialVerificationDocsSyncSignature = JSON.stringify(initialVerificationDocs || {})
  const lastAppliedVerificationDocsSyncSignatureRef = useRef('')
  const initialAccountSettingsSyncSignature = JSON.stringify(normalizeAccountSettingsState(initialAccountSettings))
  const lastAppliedAccountSettingsSyncSignatureRef = useRef('')
  const initialNotificationSettingsSyncSignature = `${String(clientEmail || '').trim().toLowerCase()}::${JSON.stringify(normalizeClientNotificationSettings(initialNotificationSettings))}`
  const lastAppliedNotificationSettingsSyncSignatureRef = useRef('')
  const profileStepCompleted = Boolean(
    normalizedProfileForVerification.fullName
    && normalizedProfileForVerification.email
    && normalizedProfileForVerification.phone
    && normalizedProfileForVerification.address,
  )
  const businessVerificationNotice = 'Business verification is turned off for the MVP. You can continue without uploads or approval.'
  const sectionSaveCopy = {
    'user-profile': {
      title: 'Profile Updated',
      message: 'Your profile changes have been saved successfully.',
    },
    'business-profile': {
      title: 'Business Profile Updated',
      message: 'Your business profile changes have been saved successfully.',
    },
    'tax-details': {
      title: 'Tax Details Updated',
      message: 'Your tax details have been saved successfully.',
    },
    'registered-address': {
      title: 'Address Updated',
      message: 'Your registered address has been saved successfully.',
    },
    notifications: {
      title: 'Notifications Updated',
      message: 'Your notification preferences have been saved successfully.',
    },
  }
  /*
  const identityDocumentCaptured = Boolean(
    toTrimmedValue(verificationDocs.govId)
    && toTrimmedValue(verificationDocs.govIdType)
    && toTrimmedValue(verificationDocs.govIdNumber),
  )
  const identityVerifiedByAutomation = Boolean(
    identityDocumentCaptured && toTrimmedValue(verificationDocs.govIdVerifiedAt),
  )
  const identityLockedForClient = Boolean(identityVerifiedByAutomation)
  const identityVerified = Boolean(identityVerifiedByAutomation)
  const canStartBusinessVerification = Boolean(identityVerified)
  */
  const nextVerificationSection = 'user-profile'
  const teamInviteUnlocked = true
  const activePendingInvites = teamInvites.filter((invite) => getInviteStatus(invite) === 'Pending')
  const hasNotificationChanges = CLIENT_NOTIFICATION_EDITABLE_KEYS.some((key) => (
    Boolean(notificationDraft[key]) !== Boolean(notifications[key])
  ))
  const resolvedSecurityPhoneNumber = buildSecurityPhoneNumber(draftData)
  const verifiedSecurityPhoneMismatch = Boolean(
    accountSettings.twoStepEnabled
    && accountSettings.verifiedPhoneNumber
    && resolvedSecurityPhoneNumber
    && accountSettings.verifiedPhoneNumber !== resolvedSecurityPhoneNumber,
  )

  useEffect(() => {
    setLogoFile(companyLogo || null)
  }, [companyLogo])

  useEffect(() => {
    setPhotoFile(profilePhoto || null)
  }, [profilePhoto])

  useEffect(() => {
    const profile = initialSettingsProfile && typeof initialSettingsProfile === 'object'
      ? initialSettingsProfile
      : null
    if (!profile) return
    const nextFromBackend = buildIncomingSettingsFormPatch(profile)
    if (Object.keys(nextFromBackend).length === 0) return
    if (lastAppliedSettingsProfileSyncSignatureRef.current === initialSettingsProfileSyncSignature) return
    lastAppliedSettingsProfileSyncSignatureRef.current = initialSettingsProfileSyncSignature

    setFormData((previous) => {
      const hasChanges = Object.entries(nextFromBackend).some(([key, value]) => previous?.[key] !== value)
      if (!hasChanges) return previous
      return {
        ...previous,
        ...nextFromBackend,
      }
    })
    if (!Object.values(editMode).some(Boolean)) {
      setDraftData((previous) => {
        const hasChanges = Object.entries(nextFromBackend).some(([key, value]) => previous?.[key] !== value)
        if (!hasChanges) return previous
        return {
          ...previous,
          ...nextFromBackend,
        }
      })
    }
  }, [initialSettingsProfile, initialSettingsProfileSyncSignature])

  useEffect(() => {
    const docs = initialVerificationDocs && typeof initialVerificationDocs === 'object'
      ? initialVerificationDocs
      : null
    if (!docs) return
    if (lastAppliedVerificationDocsSyncSignatureRef.current === initialVerificationDocsSyncSignature) return
    lastAppliedVerificationDocsSyncSignatureRef.current = initialVerificationDocsSyncSignature
    setVerificationDocs((previous) => {
      const hasChanges = Object.entries(docs).some(([key, value]) => previous?.[key] !== value)
      if (!hasChanges) return previous
      return {
        ...previous,
        ...docs,
      }
    })
  }, [initialVerificationDocs, initialVerificationDocsSyncSignature])

  useEffect(() => {
    const nextAccountSettings = normalizeAccountSettingsState(initialAccountSettings)
    if (lastAppliedAccountSettingsSyncSignatureRef.current === initialAccountSettingsSyncSignature) return
    lastAppliedAccountSettingsSyncSignatureRef.current = initialAccountSettingsSyncSignature
    setAccountSettings((previous) => {
      if (
        previous.twoStepEnabled === nextAccountSettings.twoStepEnabled
        && previous.twoStepMethod === nextAccountSettings.twoStepMethod
        && previous.verifiedPhoneNumber === nextAccountSettings.verifiedPhoneNumber
        && previous.recoveryEmail === nextAccountSettings.recoveryEmail
        && previous.enabledAt === nextAccountSettings.enabledAt
        && previous.lastVerifiedAt === nextAccountSettings.lastVerifiedAt
      ) {
        return previous
      }
      return nextAccountSettings
    })
  }, [initialAccountSettings, initialAccountSettingsSyncSignature])

  useEffect(() => {
    const normalizedSettings = readNotificationPreferences()
    if (lastAppliedNotificationSettingsSyncSignatureRef.current === initialNotificationSettingsSyncSignature) return
    lastAppliedNotificationSettingsSyncSignatureRef.current = initialNotificationSettingsSyncSignature
    setNotifications((previous) => {
      if (JSON.stringify(previous || {}) === JSON.stringify(normalizedSettings || {})) {
        return previous
      }
      return normalizedSettings
    })
    setNotificationDraft((previous) => {
      if (JSON.stringify(previous || {}) === JSON.stringify(normalizedSettings || {})) {
        return previous
      }
      return normalizedSettings
    })
    persistClientNotificationSettings(clientEmail || '', normalizedSettings)
  }, [clientEmail, initialNotificationSettings, initialNotificationSettingsSyncSignature])

  useEffect(() => {
    try {
      const pendingSection = sessionStorage.getItem(SETTINGS_REDIRECT_SECTION_KEY)
      if (!pendingSection) return
      const normalizedPendingSection = pendingSection === 'identity' ? 'business-profile' : pendingSection
      if (
        normalizedPendingSection === 'user-profile'
        || normalizedPendingSection === 'account-settings'
        || normalizedPendingSection === 'business-profile'
        || normalizedPendingSection === 'team-management'
      ) {
        setActiveSection(normalizedPendingSection)
      }
      sessionStorage.removeItem(SETTINGS_REDIRECT_SECTION_KEY)
    } catch {
      // no-op
    }
  }, [])

  useEffect(() => {
    if (typeof onVerificationDocsChange !== 'function') return
    onVerificationDocsChange(verificationDocs)
  }, [onVerificationDocsChange, verificationDocs])

  useEffect(() => {
    if (!verificationLockEnforced) return
    if (activeSection === 'user-profile') return
    setActiveSection('user-profile')
  }, [activeSection, verificationLockEnforced])

  useEffect(() => {
    if (teamInviteUnlocked) return
    if (activeSection !== 'team-management') return
    setActiveSection(nextVerificationSection)
  }, [activeSection, nextVerificationSection, teamInviteUnlocked])

  useEffect(() => {
    if (!ownerFallbackEmail) return
    setTeamMembers((previous) => {
      const existing = Array.isArray(previous) ? previous : []
      const ownerIndex = existing.findIndex((member) => member?.isPrimaryOwner || normalizeClientRole(member?.role) === 'owner')
      if (ownerIndex === -1) {
        const fallbackOwner = normalizeTeamMemberRecord({
          id: ownerMemberId,
          email: ownerFallbackEmail,
          fullName: ownerFallbackName,
          role: 'owner',
          status: 'Active',
          joinedAt: new Date().toISOString(),
          isPrimaryOwner: true,
        }, companyId)
        return fallbackOwner ? [fallbackOwner, ...existing] : existing
      }
      const currentOwner = existing[ownerIndex]
      const nextOwner = {
        ...currentOwner,
        id: currentOwner.id || ownerMemberId,
        email: resolvedClientEmail || currentOwner.email || ownerFallbackEmail,
        fullName: ownerDisplayName || currentOwner.fullName || ownerFallbackName,
        role: 'owner',
        isPrimaryOwner: true,
        companyId,
      }
      const ownerUnchanged = (
        currentOwner.id === nextOwner.id
        && currentOwner.email === nextOwner.email
        && currentOwner.fullName === nextOwner.fullName
        && currentOwner.role === nextOwner.role
        && Boolean(currentOwner.isPrimaryOwner) === Boolean(nextOwner.isPrimaryOwner)
        && currentOwner.companyId === nextOwner.companyId
      )
      if (ownerUnchanged) return existing
      const next = [...existing]
      next[ownerIndex] = nextOwner
      return next
    })
  }, [companyId, ownerDisplayName, ownerFallbackEmail, ownerFallbackName, ownerMemberId, resolvedClientEmail])

  useEffect(() => {
    let isCancelled = false
    if (!resolvedClientEmail) return () => {
      isCancelled = true
    }

    setIsTeamSyncing(true)
    ;(async () => {
      const response = await fetchMyClientTeam()
      if (isCancelled) return
      if (response.ok && response.data && typeof response.data === 'object') {
        applyBackendTeamState(response.data)
      }
      setIsTeamSyncing(false)
    })()

    return () => {
      isCancelled = true
    }
  }, [resolvedClientEmail])

  useEffect(() => {
    writeLegacyJson(teamMembersKey, teamMembers)
  }, [teamMembers, teamMembersKey])

  useEffect(() => {
    writeLegacyJson(teamInvitesKey, teamInvites.map((invite) => normalizeInviteRecord(invite, companyId)))
  }, [companyId, teamInvites, teamInvitesKey])

  useEffect(() => {
    setTeamInvites((previous) => {
      let changed = false
      const next = (Array.isArray(previous) ? previous : []).map((invite) => {
        const normalized = normalizeInviteRecord(invite, companyId)
        if (normalized.status !== invite.status) changed = true
        return normalized
      })
      return changed ? next : previous
    })
  }, [companyId])

  useEffect(() => {
    if (teamInviteUnlocked) return
    if (!activePendingInvites.length) return
    setTeamInvites((previous) => (
      (Array.isArray(previous) ? previous : []).map((invite) => {
        if (getInviteStatus(invite) !== 'Pending') return invite
        return {
          ...invite,
          status: 'Cancelled',
          reason: 'verification-revoked',
          cancelledAt: new Date().toISOString(),
        }
      })
    ))
    showToast('error', 'Verification changed. Pending team invites were cancelled automatically.')
  }, [activePendingInvites.length, showToast, teamInviteUnlocked])

  // Fields that become admin-controlled after initial successful save.
  const adminOnlyFields = ['firstName', 'lastName', 'otherNames', 'email', 'cacNumber', 'businessName', 'tin']
  const complianceLockedFields = ['email', 'businessType', 'country']

  const [lockedAdminFields, setLockedAdminFields] = useState(() => {
    const initialData = getInitialFormData()
    return adminOnlyFields.reduce((acc, field) => {
      const value = initialData[field]
      acc[field] = typeof value === 'string' && value.trim().length > 0
      return acc
    }, {})
  })

  const hasValue = (value) => {
    if (typeof value === 'string') return value.trim().length > 0
    return value !== null && value !== undefined && value !== ''
  }

  const isComplianceLocked = (field) => {
    return complianceLockedFields.includes(field) && hasValue(formData[field])
  }

  const isFieldLocked = (field) => {
    if (
      field === 'firstName'
      || field === 'lastName'
      || field === 'otherNames'
      || field === 'fullName'
    ) {
      return false
    }
    if (isAffiliatedTeamMember && affiliatedWorkspaceFields.includes(field)) {
      return true
    }
    return Boolean(lockedAdminFields[field]) || isComplianceLocked(field)
  }

  const showLockedFieldToast = () => {
    if (isAffiliatedTeamMember) {
      showToast('error', `These workspace details are inherited from ${affiliatedWorkspaceName} and can only be changed by ${affiliatedWorkspaceOwnerName}.`)
      return
    }
    showToast('error', 'This information is system-controlled and cannot be edited. To change this information, please contact support.')
  }

  const handleLockedFieldClick = (fieldName) => {
    showLockedFieldToast()
    if (fieldName) {
      setErrors(prev => ({ ...prev, [fieldName]: prev[fieldName] || '' }))
    }
  }

  const handleSectionSelect = (sectionId = '') => {
    const normalizedSection = String(sectionId || '').trim()
    if (!normalizedSection) return
    if (verificationLockEnforced && normalizedSection !== 'user-profile') {
      showToast('error', 'Verify your account before accessing other settings sections.')
      setActiveSection('user-profile')
      return
    }
    setActiveSection(normalizedSection)
  }

  const navItems = [
    { id: 'user-profile', label: 'User Profile', icon: User },
    { id: 'account-settings', label: 'Account Settings', icon: Settings },
    { id: 'notifications', label: 'Notification Settings', icon: Bell },
    // { id: 'identity', label: 'Identity Verification', icon: Shield },
    { id: 'team-management', label: 'Team Management', icon: Users },
  ]

  const businessNavItems = [
    { id: 'business-profile', label: 'Business Profile', icon: Building },
    { id: 'tax-details', label: 'Tax Details', icon: DollarSign },
    { id: 'registered-address', label: 'Registered Address', icon: MapPin },
  ]

  const countries = ['Nigeria', 'UK', 'US', 'Canada', 'Australia']

  const handleInputChange = (field, value) => {
    if (isFieldLocked(field)) {
      handleLockedFieldClick(field)
      return
    }
    if (
      field === 'businessType'
      && toTrimmedValue(formData.businessType).toLowerCase() === 'individual'
      && toTrimmedValue(value).toLowerCase() !== 'individual'
    ) {
      showToast('error', 'Business type change from Individual can only be handled by Super Admin or Technical Support Admin.')
      return
    }

    const rawValue = typeof value === 'string' ? value : value
    const normalizedValue = (() => {
      if (field === 'firstName' || field === 'lastName' || field === 'otherNames') {
        return sanitizeLettersOnly(rawValue)
      }
      if (field === 'phone') {
        return sanitizePhoneInputDigits(rawValue)
      }
      if (field === 'cacNumber') {
        return sanitizeAlphaNumeric(rawValue)
      }
      if (field === 'startMonth') {
        return normalizeFinancialBoundaryDate(rawValue, 'start')
      }
      if (field === 'reportingCycle') {
        return normalizeFinancialBoundaryDate(rawValue, 'end')
      }
      return rawValue
    })()

    setDraftData(prev => {
      const next = { ...prev, [field]: normalizedValue }
      if (field === 'businessType' && value === 'Individual') {
        next.cacNumber = ''
      }
      return next
    })

    setErrors(prev => {
      const nextErrors = { ...prev, [field]: '' }
      if (field === 'businessType' && value === 'Individual') {
        nextErrors.cacNumber = ''
      }
      return nextErrors
    })
  }

  const startSectionEdit = (section) => {
    if (isAffiliatedTeamMember && affiliatedWorkspaceSections.includes(section)) {
      showLockedFieldToast()
      return
    }
    setDraftData(formData)
    if (section === 'user-profile') {
      setPhotoFile(profilePhoto || null)
    }
    if (section === 'business-profile') {
      setLogoFile(companyLogo || null)
    }
    setErrors({})
    setEditMode(prev => ({ ...prev, [section]: true }))
  }

  const cancelSectionEdit = (section) => {
    setDraftData(formData)
    if (section === 'user-profile') {
      setPhotoFile(profilePhoto || null)
    }
    if (section === 'business-profile') {
      setLogoFile(companyLogo || null)
    }
    setErrors({})
    setEditMode(prev => ({ ...prev, [section]: false }))
  }

  const handleNotificationChange = (key) => {
    setNotificationDraft((prev) => normalizeClientNotificationSettings({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const startNotificationEdit = () => {
    setNotificationDraft(notifications)
    setEditMode((prev) => ({ ...prev, notifications: true }))
  }

  const cancelNotificationEdit = () => {
    setNotificationDraft(notifications)
    setEditMode((prev) => ({ ...prev, notifications: false }))
  }

  const scrollToFirstInvalidField = (newErrors) => {
    const firstInvalidField = Object.keys(newErrors)[0]
    if (!firstInvalidField) return
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const el = document.getElementById(`settings-${firstInvalidField}`)
        if (!el) return

        const prefersReducedMotion = typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const rect = el.getBoundingClientRect()
        const viewportHeight = typeof window.innerHeight === 'number' ? window.innerHeight : 0
        const shouldScroll = rect.top < 96 || rect.bottom > Math.max(0, viewportHeight - 32)

        if (shouldScroll) {
          el.scrollIntoView({
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
            block: 'nearest',
          })
        }

        if (typeof el.focus === 'function' && document.activeElement !== el) {
          try {
            el.focus({ preventScroll: true })
          } catch {
            el.focus()
          }
        }
      })
    })
  }

  const validateProfile = (data) => {
    const newErrors = {}
    if (!hasValue(data.firstName)) newErrors.firstName = 'This field is required.'
    if (!hasValue(data.lastName)) newErrors.lastName = 'This field is required.'
    if (!hasValue(data.email)) newErrors.email = 'This field is required.'
    if (!hasValue(data.phone)) newErrors.phone = 'This field is required.'
    if (hasValue(data.phone) && !/^\d+$/.test(String(data.phone || ''))) {
      newErrors.phone = 'Phone number can only contain numbers.'
    } else if (hasValue(data.phone) && !PHONE_LOCAL_NUMBER_REGEX.test(sanitizePhoneInputDigits(data.phone))) {
      newErrors.phone = 'Phone number must be 10 or 11 digits.'
    }
    if (!hasValue(data.address1)) newErrors.address1 = 'This field is required.'
    return newErrors
  }

  const validateBusiness = (data) => {
    const newErrors = {}
    if (!hasValue(data.businessType)) newErrors.businessType = 'This field is required.'
    if ((data.businessType === 'Business' || data.businessType === 'Non-Profit') && !hasValue(data.cacNumber)) {
      const isNigeriaRegistration = (data.country || '').trim().toLowerCase() === 'nigeria' || !hasValue(data.country)
      newErrors.cacNumber = isNigeriaRegistration ? 'CAC registration number is required.' : 'Business registration number is required.'
    }
    if (hasValue(data.cacNumber)) {
      const normalizedRegistration = sanitizeAlphaNumeric(data.cacNumber)
      if (!/^(RC|BN|IT)/.test(normalizedRegistration)) {
        newErrors.cacNumber = 'Registration number must start with RC, BN, or IT.'
      }
    }
    if (!hasValue(data.businessName)) newErrors.businessName = 'This field is required.'
    if (!hasValue(data.country)) newErrors.country = 'This field is required.'
    if (!hasValue(data.currency)) newErrors.currency = 'This field is required.'
    if (!hasValue(data.language)) newErrors.language = 'This field is required.'
    if (!hasValue(data.industry)) newErrors.industry = 'This field is required.'
    if (data.industry === 'Others' && !hasValue(data.industryOther)) newErrors.industryOther = 'This field is required.'
    return newErrors
  }

  const validateTax = (data) => {
    const newErrors = {}
    if (!hasValue(data.tin)) newErrors.tin = 'This field is required.'
    const normalizedFinancialYearEnd = normalizeFinancialBoundaryDate(data.reportingCycle, 'end')
    const normalizedFinancialYearStart = normalizeFinancialBoundaryDate(data.startMonth, 'start')
    if (!hasValue(normalizedFinancialYearEnd)) newErrors.reportingCycle = 'Financial Year End is required.'
    if (!hasValue(normalizedFinancialYearStart)) newErrors.startMonth = 'Financial Year Start is required.'
    return newErrors
  }

  const validateAddress = (data) => {
    const newErrors = {}
    if (!hasValue(data.address1)) newErrors.address1 = 'This field is required.'
    if (!hasValue(data.city)) newErrors.city = 'This field is required.'
    if (!hasValue(data.postalCode)) newErrors.postalCode = 'This field is required.'
    if (!hasValue(data.addressCountry)) newErrors.addressCountry = 'This field is required.'
    return newErrors
  }

  const saveSection = async (section, validateFn, lockableFields = []) => {
    const newErrors = validateFn(draftData)
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      showToast('error', 'Please complete all required fields.')
      scrollToFirstInvalidField(newErrors)
      return false
    }

    const updatedData = {
      ...draftData,
      firstName: toTitleCaseValue(sanitizeLettersOnly(draftData.firstName)),
      lastName: toTitleCaseValue(sanitizeLettersOnly(draftData.lastName)),
      otherNames: toTitleCaseValue(sanitizeLettersOnly(draftData.otherNames)),
      phone: sanitizePhoneInputDigits(draftData.phone),
      cacNumber: sanitizeAlphaNumeric(draftData.cacNumber),
      startMonth: normalizeFinancialBoundaryDate(draftData.startMonth, 'start'),
      reportingCycle: normalizeFinancialBoundaryDate(draftData.reportingCycle, 'end'),
    }
    updatedData.fullName = buildClientFullName(updatedData)
    const normalizedPhoneNumber = formatPhoneNumber(updatedData.phoneCountryCode, updatedData.phone)
    const persistedData = {
      ...updatedData,
      phone: normalizedPhoneNumber,
      phoneCountryCode: updatedData.phoneCountryCode || '+234',
      phoneLocalNumber: updatedData.phone || '',
    }
    if (typeof onSettingsProfileChange === 'function') {
      const saveResult = await onSettingsProfileChange(buildSettingsProfilePayload(persistedData))
      if (saveResult?.ok === false) {
        showToast('error', saveResult.message || 'Unable to save your profile right now.')
        return false
      }
    }
    if (section === 'user-profile' && photoFile !== profilePhoto) {
      if (typeof onClientAssetChange === 'function') {
        const assetResult = await onClientAssetChange({ profilePhoto: photoFile || '' })
        if (assetResult?.ok === false) {
          showToast('error', assetResult.message || 'Unable to save your profile picture right now.')
          return false
        }
      } else {
        setProfilePhoto(photoFile || '')
      }
      writeLegacyString(profilePhotoKey, photoFile || '')
    }
    if (section === 'business-profile' && logoFile !== companyLogo) {
      if (typeof onClientAssetChange === 'function') {
        const assetResult = await onClientAssetChange({ companyLogo: logoFile || '' })
        if (assetResult?.ok === false) {
          showToast('error', assetResult.message || 'Unable to save your company logo right now.')
          return false
        }
      } else {
        setCompanyLogo(logoFile || '')
      }
      writeLegacyString(companyLogoKey, logoFile || '')
    }
    setFormData({
      ...updatedData,
      phoneCountryCode: persistedData.phoneCountryCode,
      phoneLocalNumber: persistedData.phoneLocalNumber,
    })
    writeLegacyJson(settingsStorageKey || 'settingsFormData', persistedData)
    if (typeof setCompanyName === 'function') {
      setCompanyName(updatedData.businessName?.trim() || '')
    }
    if (typeof setClientFirstName === 'function') {
      setClientFirstName(updatedData.firstName?.trim() || 'Client')
    }
    setLockedAdminFields(prev => {
      const next = { ...prev }
      lockableFields.forEach((field) => {
        if (hasValue(updatedData[field])) next[field] = true
      })
      return next
    })
    setEditMode(prev => ({ ...prev, [section]: false }))
    setErrors({})
    const confirmationCopy = sectionSaveCopy[section] || {
      title: 'Changes Saved',
      message: 'Your changes have been saved successfully.',
    }
    setSaveConfirmation({
      open: true,
      title: confirmationCopy.title,
      message: confirmationCopy.message,
    })
    showToast('success', 'Changes saved successfully.')
    return true
  }

  const handleSaveProfile = async (event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    await saveSection('user-profile', validateProfile, ['firstName', 'lastName', 'otherNames', 'email'])
  }

  const handleSaveNotifications = (event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    const normalized = persistClientNotificationSettings(clientEmail || '', notificationDraft)
    setNotifications(normalized)
    setNotificationDraft(normalized)
    if (typeof onNotificationSettingsChange === 'function') {
      onNotificationSettingsChange(normalized)
    }
    setEditMode((prev) => ({ ...prev, notifications: false }))
    const confirmationCopy = sectionSaveCopy.notifications
    setSaveConfirmation({
      open: true,
      title: confirmationCopy.title,
      message: confirmationCopy.message,
    })
    showToast('success', 'Notification preferences updated.')
  }

  /*
  const handleSubmitVerification = async () => {
    if (identityLockedForClient) {
      showToast('success', 'Identity verification is already completed.')
      return
    }
    if (!verificationDocs.govId || !verificationDocs.govIdType || !verificationDocs.govIdNumber) {
      showToast('error', 'Government ID, ID type, and ID card number are required.')
      return
    }
    const normalizedFullName = buildClientFullName(formData)
    if (!normalizedFullName) {
      showToast('error', 'First and last name are required in profile before identity verification.')
      return
    }
    if (verificationDocs.govIdClarityStatus !== 'clear') {
      showToast('error', 'Government ID is not clear. Please re-upload.')
      return
    }

    setIsIdentitySubmitting(true)
    setVerificationDocs((prev) => {
      const next = {
        ...prev,
        govIdVerifiedAt: '',
        govIdVerificationStatus: 'verifying',
      }
      writeLegacyJson(verificationDocsKey, next)
      return next
    })

    const verifyResult = await verifyIdentityWithDojah({
      fullName: normalizedFullName,
      idType: verificationDocs.govIdType,
      cardNumber: verificationDocs.govIdNumber,
    })

    if (!verifyResult.ok) {
      setVerificationDocs((prev) => {
        const next = {
          ...prev,
          govId: '',
          govIdVerifiedAt: '',
          govIdVerificationStatus: 'failed',
        }
        writeLegacyJson(verificationDocsKey, next)
        return next
      })
      setIsIdentitySubmitting(false)
      showToast('error', 'Verification failed. Please re-upload.')
      return
    }

    setVerificationDocs((prev) => {
      const next = {
        ...prev,
        govIdVerifiedAt: new Date().toISOString(),
        govIdVerificationStatus: 'verified',
      }
      writeLegacyJson(verificationDocsKey, next)
      return next
    })
    setIsIdentitySubmitting(false)
    showToast('success', 'Identity verification completed successfully.')
  }

  const verifyGovernmentIdClarity = (file) => new Promise((resolve) => {
    if (!file) {
      resolve({ ok: false, message: 'No file selected.' })
      return
    }
    if (!file.type?.startsWith('image/')) {
      resolve({ ok: false, message: 'Government ID must be an image file.' })
      return
    }
    if (file.size < MIN_GOV_ID_FILE_SIZE_BYTES) {
      resolve({ ok: false, message: 'Government ID is not clear, re-upload.' })
      return
    }
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => {
      const isClear = image.width >= MIN_GOV_ID_IMAGE_WIDTH && image.height >= MIN_GOV_ID_IMAGE_HEIGHT
      URL.revokeObjectURL(objectUrl)
      if (!isClear) {
        resolve({ ok: false, message: 'Government ID is not clear, re-upload.' })
        return
      }
      resolve({ ok: true, message: 'Government ID verified successfully.' })
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ ok: false, message: 'Unable to read image. Re-upload a clear government ID.' })
    }
    image.src = objectUrl
  })
  */

  const handleSaveBusiness = async (event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    const requiresRegistrationNumber = draftData.businessType === 'Business' || draftData.businessType === 'Non-Profit'
    const lockableFields = requiresRegistrationNumber ? ['cacNumber', 'businessName'] : ['businessName']
    const didSave = await saveSection('business-profile', validateBusiness, lockableFields)
    if (didSave && String(draftData.businessType || '').trim().toLowerCase() === 'individual') {
      setVerificationDocs((prev) => {
        const next = {
          ...prev,
          businessReg: '',
          businessRegFileCacheKey: '',
          businessRegMimeType: '',
          businessRegSize: 0,
          businessRegUploadedAt: '',
          businessRegVerificationStatus: '',
          businessRegSubmittedAt: '',
        }
        writeLegacyJson(verificationDocsKey, next)
        return next
      })
    }
  }

  const handleSaveTax = async (event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    await saveSection('tax-details', validateTax, ['tin'])
  }

  const handleSaveAddress = async (event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    await saveSection('registered-address', validateAddress)
  }

  const handleFileUpload = async (docType, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const resetInput = () => {
      if (e?.target) e.target.value = ''
    }

    /*
    if (docType === 'govId') {
      if (identityLockedForClient) {
        showToast('error', 'Identity is already verified and locked. Contact admin for changes.')
        resetInput()
        return
      }
      if (!verificationDocs.govIdType) {
        showToast('error', 'Select government ID type before uploading.')
        resetInput()
        return
      }
      const clarityResult = await verifyGovernmentIdClarity(file)
      if (!clarityResult.ok) {
        setVerificationDocs((prev) => {
          const next = {
            ...prev,
            govId: '',
            govIdVerifiedAt: '',
            govIdVerificationStatus: 'failed',
            govIdClarityStatus: 'not-clear',
          }
          writeLegacyJson(verificationDocsKey, next)
          return next
        })
        showToast('error', clarityResult.message)
        resetInput()
        return
      }
      setVerificationDocs((prev) => {
        const next = {
          ...prev,
          govId: file.name,
          govIdVerifiedAt: '',
          govIdVerificationStatus: 'pending',
          govIdClarityStatus: 'clear',
        }
        writeLegacyJson(verificationDocsKey, next)
        return next
      })
      showToast('success', clarityResult.message)
      resetInput()
      return
    }

    if (docType === 'businessReg' && !canStartBusinessVerification) {
      showToast('error', 'Complete identity verification before business verification starts.')
      resetInput()
      return
    }
    */

    if (docType === 'businessReg') {
      showToast('success', businessVerificationNotice)
      resetInput()
      return
    }

    setVerificationDocs((prev) => {
      const next = {
        ...prev,
        [docType]: file.name,
      }
      if (docType === 'businessReg') {
        next.businessRegVerificationStatus = ''
        next.businessRegSubmittedAt = ''
      }
      writeLegacyJson(verificationDocsKey, next)
      return next
    })
    resetInput()
  }

  const handleLogoUpload = (e) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return

    if (!file.type?.startsWith('image/')) {
      showToast('error', 'Invalid file format. Please upload an image file.')
      input.value = ''
      return
    }

    if (file.size > CLIENT_IMAGE_ASSET_MAX_SIZE_BYTES) {
      showToast('error', 'Company logo must be 5 MB or less.')
      input.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '').trim()
      if (!dataUrl) {
        showToast('error', 'Unable to read selected image file.')
        input.value = ''
        return
      }
      setLogoFile(dataUrl)
      showToast('success', 'Company logo ready to save.')
      input.value = ''
    }
    reader.onerror = () => {
      showToast('error', 'Invalid file format. Please upload an image file.')
      input.value = ''
    }
    reader.readAsDataURL(file)
  }

  const handlePhotoUpload = (e) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return

    if (!file.type?.startsWith('image/')) {
      showToast('error', 'Invalid file format. Please upload an image file.')
      input.value = ''
      return
    }

    if (file.size > CLIENT_IMAGE_ASSET_MAX_SIZE_BYTES) {
      showToast('error', 'Profile picture must be 5 MB or less.')
      input.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '').trim()
      if (!dataUrl) {
        showToast('error', 'Unable to read selected image file.')
        input.value = ''
        return
      }
      setPhotoFile(dataUrl)
      showToast('success', 'Profile picture ready to save.')
      input.value = ''
    }
    reader.onerror = () => {
      showToast('error', 'Invalid file format. Please upload an image file.')
      input.value = ''
    }
    reader.readAsDataURL(file)
  }

  const getInviteLink = (invite = {}) => {
    const token = toTrimmedValue(invite?.token)
    if (!token) return ''
    const encodedToken = encodeURIComponent(token)
    const encodedCompanyId = encodeURIComponent(toTrimmedValue(invite?.companyId || companyId))
    const encodedEmail = encodeURIComponent(toTrimmedValue(invite?.email).toLowerCase())
    return `${window.location.origin}/team/setup?invite=${encodedToken}&company=${encodedCompanyId}&email=${encodedEmail}`
  }

  const handleOpenInviteModal = () => {
    if (!canManageTeam) {
      showToast('error', 'Only the primary account owner can invite team members.')
      return
    }
    setGeneratedInviteLink('')
    setInviteForm({ email: '', role: 'manager' })
    setIsInviteModalOpen(true)
  }

  const handleCreateInvite = async () => {
    if (!canManageTeam) {
      showToast('error', 'Only the primary account owner can invite team members.')
      return
    }

    const normalizedEmail = toTrimmedValue(inviteForm.email).toLowerCase()
    const normalizedRole = normalizeClientRole(inviteForm.role)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      showToast('error', 'Enter a valid email address.')
      return
    }
    if (normalizedEmail === resolvedClientEmail) {
      showToast('error', 'Primary account owner cannot invite their own email.')
      return
    }

    const alreadyMember = teamMembers.some((member) => member.email === normalizedEmail)
    if (alreadyMember) {
      showToast('error', 'This user is already a team member.')
      return
    }
    const duplicatePending = teamInvites.some((invite) => invite.email === normalizedEmail && getInviteStatus(invite) === 'Pending')
    if (duplicatePending) {
      showToast('error', 'A pending invite already exists for this email.')
      return
    }

    setIsTeamSyncing(true)
    const response = await createClientTeamInvite({
      email: normalizedEmail,
      role: normalizedRole,
      inviteBaseUrl: window.location.origin,
    })
    setIsTeamSyncing(false)
    if (!response.ok || !response.data || typeof response.data !== 'object') {
      showToast('error', response.data?.message || 'Unable to create the invite right now.')
      return
    }

    applyBackendTeamState(response.data)
    const inviteRecord = normalizeInviteRecord(response.data?.invite || {}, companyId)
    const inviteLink = String(response.data?.inviteUrl || getInviteLink(inviteRecord)).trim()
    setGeneratedInviteLink(inviteLink)
    showToast(
      response.data?.emailQueued === false
        ? 'success'
        : 'success',
      response.data?.emailQueued === false
        ? 'Invite created. Email delivery could not be confirmed, so copy the link and send it manually if needed.'
        : 'Invite created and emailed. Link expires in 48 hours and can be used once.',
    )
  }

  const handleCopyInviteLink = async (invite = null) => {
    const inviteLink = invite ? getInviteLink(invite) : toTrimmedValue(generatedInviteLink)
    if (!inviteLink) {
      showToast('error', 'No invite link available to copy.')
      return
    }
    try {
      await navigator.clipboard.writeText(inviteLink)
      showToast('success', 'Invite link copied.')
    } catch {
      showToast('error', 'Unable to copy invite link on this browser.')
    }
  }

  const handleCancelInvite = async (inviteId = '') => {
    if (!canManageTeam) {
      showToast('error', 'Only the primary account owner can cancel invites.')
      return
    }
    const normalizedId = toTrimmedValue(inviteId)
    if (!normalizedId) return
    setIsTeamSyncing(true)
    const response = await cancelClientTeamInvite({ inviteId: normalizedId })
    setIsTeamSyncing(false)
    if (!response.ok || !response.data || typeof response.data !== 'object') {
      showToast('error', response.data?.message || 'Unable to cancel invite right now.')
      return
    }
    applyBackendTeamState(response.data)
    showToast('success', 'Invite cancelled.')
  }

  const handleTeamRoleChange = async (memberId = '', nextRole = '') => {
    if (!canManageTeam) {
      showToast('error', 'Only the primary account owner can change team roles.')
      return
    }
    const normalizedId = toTrimmedValue(memberId)
    if (!normalizedId) return
    const normalizedRole = normalizeClientRole(nextRole)
    setIsTeamSyncing(true)
    const response = await updateClientTeamMember({
      memberId: normalizedId,
      role: normalizedRole,
    })
    setIsTeamSyncing(false)
    if (!response.ok || !response.data || typeof response.data !== 'object') {
      showToast('error', response.data?.message || 'Unable to update team role right now.')
      return
    }
    applyBackendTeamState(response.data)
    showToast('success', 'Team role updated.')
  }

  const handleRemoveTeamMember = async (memberId = '') => {
    if (!canManageTeam) {
      showToast('error', 'Only the primary account owner can remove team members.')
      return
    }
    const normalizedId = toTrimmedValue(memberId)
    if (!normalizedId) return
    setIsTeamSyncing(true)
    const response = await removeClientTeamMember({ memberId: normalizedId })
    setIsTeamSyncing(false)
    if (!response.ok || !response.data || typeof response.data !== 'object') {
      showToast('error', response.data?.message || 'Unable to remove team member right now.')
      return
    }
    applyBackendTeamState(response.data)
    showToast('success', 'Team member removed.')
  }

  const persistAccountSettings = (nextSettings = {}) => {
    const normalizedSettings = normalizeAccountSettingsState({
      ...DEFAULT_ACCOUNT_SETTINGS,
      ...accountSettings,
      ...(nextSettings && typeof nextSettings === 'object' ? nextSettings : {}),
      recoveryEmail: resolvedClientEmail || accountSettings.recoveryEmail || '',
    })
    setAccountSettings(normalizedSettings)
    if (typeof onAccountSettingsChange === 'function') {
      onAccountSettingsChange(normalizedSettings)
    }
    return normalizedSettings
  }

  const resetSecurityChallenge = () => {
    setSecurityChallenge({
      open: false,
      mode: '',
      otp: '',
      isSending: false,
      isVerifying: false,
      expiresAt: '',
    })
  }

  const closeSecurityChallenge = () => {
    if (securityChallenge.isSending || securityChallenge.isVerifying) return
    resetSecurityChallenge()
  }

  const readResponseMessage = async (response) => {
    const payload = await response.json().catch(() => ({}))
    return String(payload?.message || payload?.error || '').trim()
  }

  const startSecurityChallenge = async (mode = '') => {
    if (!canManageAccountSecurity) {
      showToast('error', 'Account security actions are available only in your direct client session.')
      return false
    }
    if (!resolvedClientEmail) {
      showToast('error', 'A valid account email is required before you continue.')
      return false
    }
    if (!resolvedSecurityPhoneNumber) {
      showToast('error', 'Add a valid phone number in User Profile before using two-step verification.')
      setActiveSection('user-profile')
      return false
    }

    setSecurityChallenge({
      open: true,
      mode,
      otp: '',
      isSending: true,
      isVerifying: false,
      expiresAt: '',
    })

    try {
      const response = await apiFetch('/api/auth/send-sms-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: resolvedSecurityPhoneNumber,
          purpose: 'mfa',
          email: resolvedClientEmail,
        }),
      })
      if (!response.ok) {
        const message = await readResponseMessage(response)
        showToast('error', message || 'Unable to send a verification code right now.')
        resetSecurityChallenge()
        return false
      }

      const payload = await response.json().catch(() => ({}))
      setSecurityChallenge({
        open: true,
        mode,
        otp: '',
        isSending: false,
        isVerifying: false,
        expiresAt: String(payload?.expiresAt || '').trim(),
      })
      showToast('success', 'Verification code sent to your saved phone number.')
      return true
    } catch {
      showToast('error', 'Unable to send a verification code right now.')
      resetSecurityChallenge()
      return false
    }
  }

  const handlePasswordResetAction = async () => {
    if (!canManageAccountSecurity) {
      showToast('error', 'Password changes are available only in your direct client session.')
      return
    }
    if (!resolvedClientEmail) {
      showToast('error', 'A valid account email is required before you continue.')
      return
    }
    if (typeof onRequestPasswordResetLink !== 'function') {
      showToast('error', 'Password reset is unavailable right now.')
      return
    }
    setIsSendingPasswordResetLink(true)
    const result = await onRequestPasswordResetLink(resolvedClientEmail)
    setIsSendingPasswordResetLink(false)
    showToast(
      result?.ok ? 'success' : 'error',
      result?.message || `Unable to send ${passwordActionLabel.toLowerCase()} email.`,
    )
  }

  const validatePasswordChangeForm = () => {
    const normalizedCurrentPassword = String(passwordChangeForm.currentPassword || '')
    const normalizedNewPassword = String(passwordChangeForm.newPassword || '')
    const normalizedConfirmPassword = String(passwordChangeForm.confirmPassword || '')
    if (!normalizedCurrentPassword || !normalizedNewPassword || !normalizedConfirmPassword) {
      return 'Please complete all required fields.'
    }
    if (normalizedNewPassword !== normalizedConfirmPassword) {
      return 'Passwords do not match.'
    }
    if (!PASSWORD_SECURITY_REGEX.test(normalizedNewPassword)) {
      return 'Password does not meet security requirements.'
    }
    if (normalizedCurrentPassword === normalizedNewPassword) {
      return 'New password must be different from your current password.'
    }
    return ''
  }

  const submitPasswordChange = async () => {
    const validationMessage = validatePasswordChangeForm()
    if (validationMessage) {
      showToast('error', validationMessage)
      return false
    }
    if (typeof onChangePassword !== 'function') {
      showToast('error', 'Password change is unavailable right now.')
      return false
    }

    setIsChangingPassword(true)
    const result = await onChangePassword({
      currentPassword: passwordChangeForm.currentPassword,
      newPassword: passwordChangeForm.newPassword,
      confirmPassword: passwordChangeForm.confirmPassword,
    })
    setIsChangingPassword(false)
    showToast(result?.ok ? 'success' : 'error', result?.message || 'Unable to update your password right now.')
    if (!result?.ok) return false

    setPasswordChangeForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    })
    return true
  }

  const resetDeleteAccountFlow = () => {
    setDeleteAccountStep(1)
    setDeleteAccountDraft({
      reason: '',
      reasonOther: '',
      retentionIntent: '',
      acknowledgedPermanentDeletion: false,
    })
    setIsDeletingAccount(false)
  }

  const handleOpenDeleteAccountModal = async ({ bypassSecurityChallenge = false } = {}) => {
    if (!canDeleteAccount) {
      showToast('error', 'Account deletion is available only in your direct client session.')
      return
    }
    if (accountSettings.twoStepEnabled && !bypassSecurityChallenge) {
      await startSecurityChallenge('delete-account')
      return
    }
    resetDeleteAccountFlow()
    setIsDeleteModalOpen(true)
  }

  const handleCloseDeleteAccountModal = () => {
    if (isDeletingAccount) return
    setIsDeleteModalOpen(false)
    resetDeleteAccountFlow()
  }

  const completeSecurityChallenge = async () => {
    const normalizedOtp = sanitizeDigitsOnly(securityChallenge.otp)
    if (!normalizedOtp) {
      showToast('error', 'Enter the verification code sent to your phone.')
      return
    }
    if (!resolvedSecurityPhoneNumber || !resolvedClientEmail) {
      showToast('error', 'Missing account details for verification.')
      return
    }

    setSecurityChallenge((previous) => ({
      ...previous,
      otp: normalizedOtp,
      isVerifying: true,
    }))

    try {
      const response = await apiFetch('/api/auth/verify-sms-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: resolvedSecurityPhoneNumber,
          purpose: 'mfa',
          otp: normalizedOtp,
          email: resolvedClientEmail,
        }),
      })
      if (!response.ok) {
        const message = await readResponseMessage(response)
        setSecurityChallenge((previous) => ({ ...previous, isVerifying: false }))
        showToast('error', message || 'Verification code is invalid or expired.')
        return
      }

      const nowIso = new Date().toISOString()
      const mode = securityChallenge.mode
      resetSecurityChallenge()

      if (mode === 'enable-two-step') {
        persistAccountSettings({
          twoStepEnabled: true,
          twoStepMethod: 'sms',
          verifiedPhoneNumber: resolvedSecurityPhoneNumber,
          recoveryEmail: resolvedClientEmail,
          enabledAt: accountSettings.enabledAt || nowIso,
          lastVerifiedAt: nowIso,
        })
        showToast('success', 'Two-step verification enabled.')
        return
      }

      if (mode === 'disable-two-step') {
        persistAccountSettings({
          twoStepEnabled: false,
          twoStepMethod: '',
          verifiedPhoneNumber: '',
          recoveryEmail: resolvedClientEmail,
          enabledAt: '',
          lastVerifiedAt: nowIso,
        })
        showToast('success', 'Two-step verification turned off.')
        return
      }

      if (mode === 'password-reset') {
        if (typeof onRequestPasswordResetLink !== 'function') {
          showToast('error', 'Password reset is unavailable right now.')
          return
        }
        setIsSendingPasswordResetLink(true)
        const result = await onRequestPasswordResetLink(resolvedClientEmail)
        setIsSendingPasswordResetLink(false)
        showToast(result?.ok ? 'success' : 'error', result?.message || 'Unable to send password reset link.')
        return
      }

      if (mode === 'change-password') {
        await submitPasswordChange()
        return
      }

      if (mode === 'delete-account') {
        resetDeleteAccountFlow()
        setIsDeleteModalOpen(true)
        showToast('success', 'Verification successful. You can continue deleting your account.')
      }
    } catch {
      setSecurityChallenge((previous) => ({ ...previous, isVerifying: false }))
      showToast('error', 'Unable to verify this code right now.')
    }
  }

  const goToNextDeleteStep = async () => {
    if (deleteAccountStep === 1) {
      if (!deleteAccountDraft.reason) {
        showToast('error', 'Select a reason before continuing.')
        return
      }
      if (deleteAccountDraft.reason === 'Other' && !deleteAccountDraft.reasonOther.trim()) {
        showToast('error', 'Please tell us why you want to delete this account.')
        return
      }
      setDeleteAccountStep(2)
      return
    }
    if (deleteAccountStep === 2) {
      if (!deleteAccountDraft.retentionIntent) {
        showToast('error', 'Please answer this question before continuing.')
        return
      }
      setDeleteAccountStep(3)
      return
    }
    if (!deleteAccountDraft.acknowledgedPermanentDeletion) {
      showToast('error', 'Confirm permanent deletion before submitting.')
      return
    }
    if (typeof onDeleteAccount !== 'function') {
      showToast('error', 'Account deletion is unavailable right now.')
      return
    }
    setIsDeletingAccount(true)
    const result = await onDeleteAccount(deleteAccountDraft)
    if (!result?.ok) {
      setIsDeletingAccount(false)
      showToast('error', result?.message || 'Unable to delete account.')
      return
    }
    setIsDeletingAccount(false)
    setIsDeleteModalOpen(false)
    resetDeleteAccountFlow()
  }

  const industries = INDUSTRY_OPTIONS

  const renderReadonlyField = (label, value, required = false) => {
    const missing = required && !hasValue(value)
    const displayValue = missing ? 'Not Provided' : (hasValue(value) ? value : '-')

    return (
      <div className="rounded-md border border-border-light bg-background/40 px-3 py-2.5">
        <div className="flex items-center gap-1 text-[11px] font-medium text-text-secondary uppercase tracking-wide">
          <span>{label}</span>
          {required && <span className="text-error">*</span>}
          {missing && <AlertCircle className="w-3.5 h-3.5 text-error" />}
        </div>
        <div className={`mt-1 text-sm font-medium ${missing ? 'text-error' : 'text-text-primary'}`}>
          {displayValue}
        </div>
      </div>
    )
  }

  const renderLockedField = (field, label, required = false) => {
    const value = draftData[field]
    const missing = required && !hasValue(value)
    const errorMessage = errors[field]

    return (
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1.5">
          {label} {required && <span className="text-error">*</span>}
          {missing && <AlertCircle className="inline w-3.5 h-3.5 text-error ml-1" />}
        </label>
        <button
          id={`settings-${field}`}
          type="button"
          onClick={() => handleLockedFieldClick(field)}
          className={`w-full h-10 px-3 border rounded-md bg-gray-100 text-left flex items-center justify-between ${
            errorMessage ? 'border-error' : 'border-gray-200'
          }`}
        >
          <span className={`text-sm ${missing ? 'text-error' : 'text-text-primary'}`}>
            {missing ? 'Not Provided' : value}
          </span>
          <Lock className="w-4 h-4 text-text-muted" />
        </button>
        {errorMessage && <p className="text-xs text-error mt-1">{errorMessage}</p>}
      </div>
    )
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'user-profile': {
        const isProfileEditMode = editMode['user-profile']
        const firstNameLocked = isFieldLocked('firstName')
        const lastNameLocked = isFieldLocked('lastName')
        const otherNamesLocked = isFieldLocked('otherNames')
        const emailLocked = isFieldLocked('email')

        return (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-1">User Profile</h3>
                <p className="text-sm text-text-muted">Manage your personal information</p>
                <p className="text-xs text-text-muted mt-1">Fields marked with <span className="text-error">*</span> are mandatory.</p>
              </div>
              <button
                onClick={() => isProfileEditMode ? cancelSectionEdit('user-profile') : startSectionEdit('user-profile')}
                className={`h-9 px-4 rounded-md text-sm font-medium transition-colors ${
                  isProfileEditMode ? 'bg-error-bg text-error hover:bg-error/10' : 'bg-primary text-white hover:bg-primary-light'
                }`}
              >
                {isProfileEditMode ? 'Cancel Edit' : 'Edit'}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-semibold overflow-hidden bg-primary">
                {photoFile ? (
                  <img src={photoFile} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  `${(formData.firstName || 'C').charAt(0)}${(formData.lastName || '').charAt(0)}`.toUpperCase()
                )}
              </div>
              {isProfileEditMode && (
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    id="photo-upload"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                  <label htmlFor="photo-upload" className="h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors cursor-pointer inline-flex items-center">
                    Upload Photo
                  </label>
                </div>
              )}
            </div>

            {!isProfileEditMode ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderReadonlyField('First Name', formData.firstName, true)}
                {renderReadonlyField('Last Name', formData.lastName, true)}
                {renderReadonlyField('Other Names', formData.otherNames, false)}
                {renderReadonlyField('Email Address', formData.email, true)}
                {renderReadonlyField('Phone Number', formatPhoneNumber(formData.phoneCountryCode, formData.phone), true)}
                {renderReadonlyField('Address', formData.address1, true)}
                {renderReadonlyField('Role in Company', formData.roleInCompany, false)}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {firstNameLocked ? (
                    renderLockedField('firstName', 'First Name', true)
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">First Name <span className="text-error">*</span></label>
                      <input
                        id="settings-firstName"
                        type="text"
                        placeholder="Enter your first name"
                        value={draftData.firstName}
                        onChange={(e) => handleInputChange('firstName', e.target.value)}
                        className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.firstName ? 'border-error' : 'border-border'}`}
                      />
                      {errors.firstName && <p className="text-xs text-error mt-1">{errors.firstName}</p>}
                    </div>
                  )}

                  {lastNameLocked ? (
                    renderLockedField('lastName', 'Last Name', true)
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Last Name <span className="text-error">*</span></label>
                      <input
                        id="settings-lastName"
                        type="text"
                        placeholder="Enter your last name"
                        value={draftData.lastName}
                        onChange={(e) => handleInputChange('lastName', e.target.value)}
                        className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.lastName ? 'border-error' : 'border-border'}`}
                      />
                      {errors.lastName && <p className="text-xs text-error mt-1">{errors.lastName}</p>}
                    </div>
                  )}

                  {otherNamesLocked ? (
                    renderLockedField('otherNames', 'Other Names')
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Other Names</label>
                      <input
                        id="settings-otherNames"
                        type="text"
                        placeholder="Enter other names"
                        value={draftData.otherNames}
                        onChange={(e) => handleInputChange('otherNames', e.target.value)}
                        className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.otherNames ? 'border-error' : 'border-border'}`}
                      />
                      {errors.otherNames && <p className="text-xs text-error mt-1">{errors.otherNames}</p>}
                    </div>
                  )}

                  {emailLocked ? (
                    renderLockedField('email', 'Email Address', true)
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Email Address <span className="text-error">*</span></label>
                      <input
                        id="settings-email"
                        type="email"
                        placeholder="name@company.com"
                        value={draftData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.email ? 'border-error' : 'border-border'}`}
                      />
                      {errors.email && <p className="text-xs text-error mt-1">{errors.email}</p>}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Phone Number <span className="text-error">*</span></label>
                    <div className="grid grid-cols-[130px_1fr] gap-2">
                      <select
                        value={draftData.phoneCountryCode || '+234'}
                        onChange={(e) => handleInputChange('phoneCountryCode', e.target.value)}
                        className="h-10 px-2 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                      >
                        {PHONE_COUNTRY_CODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <input
                        id="settings-phone"
                        type="tel"
                        placeholder="Enter phone number"
                        value={draftData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.phone ? 'border-error' : 'border-border'}`}
                      />
                    </div>
                    {errors.phone && <p className="text-xs text-error mt-1">{errors.phone}</p>}
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Address <span className="text-error">*</span></label>
                    <input
                      id="settings-address1"
                      type="text"
                      placeholder="Enter your residential address"
                      value={draftData.address1}
                      onChange={(e) => handleInputChange('address1', e.target.value)}
                      className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.address1 ? 'border-error' : 'border-border'}`}
                    />
                    {errors.address1 && <p className="text-xs text-error mt-1">{errors.address1}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Role in Company</label>
                    <input
                      id="settings-roleInCompany"
                      type="text"
                      placeholder="e.g., Finance Manager"
                      value={draftData.roleInCompany}
                      onChange={(e) => handleInputChange('roleInCompany', e.target.value)}
                      className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                    />
                    <p className="text-xs text-text-muted mt-1">Enter your official role within the organization.</p>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    className="h-10 px-6 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </>
            )}
          </div>
        )
      }

      case 'account-settings': {
        const securityActionsDisabled = !canManageAccountSecurity
        const twoStepStatusClass = accountSettings.twoStepEnabled
          ? 'bg-success-bg text-success'
          : 'bg-background text-text-secondary'
        const resolvedVerifiedPhone = accountSettings.verifiedPhoneNumber || resolvedSecurityPhoneNumber

        return (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-1">Account Settings</h3>
                <p className="text-sm text-text-muted">Manage password recovery, two-step verification, and sensitive account actions.</p>
              </div>
              <span className={`inline-flex items-center h-8 px-3 rounded-full text-xs font-medium ${twoStepStatusClass}`}>
                {accountSettings.twoStepEnabled ? 'Two-Step Enabled' : 'Two-Step Disabled'}
              </span>
            </div>

            {securityActionsDisabled && (
              <div className="rounded-lg border border-warning/30 bg-warning-bg/40 p-4">
                <p className="text-sm font-semibold text-text-primary">Direct Client Session Required</p>
                <p className="text-sm text-text-secondary mt-1">
                  Password changes and security controls can only be managed in your own client session.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border-light bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Sign-In Email</p>
                <p className="mt-2 text-sm font-semibold text-text-primary">{resolvedClientEmail || 'Not configured'}</p>
                <p className="mt-2 text-xs text-text-muted">
                  Password reset links and account-security notices are sent to this email.
                </p>
              </div>
              <div className="rounded-lg border border-border-light bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Security Phone</p>
                <p className="mt-2 text-sm font-semibold text-text-primary">{resolvedVerifiedPhone || 'Add a phone number in User Profile'}</p>
                <p className="mt-2 text-xs text-text-muted">
                  SMS verification codes will be sent to this number when two-step verification is enabled.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border-light bg-white p-4">
              <div className="flex flex-col gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">{passwordActionLabel}</h4>
                  <p className="text-sm text-text-secondary mt-1">
                    {passwordIsConfigured
                      ? 'We will send a secure email confirmation link before you choose a new password.'
                      : 'You signed in with Google, so no password is set yet. We will email you a secure link to add one.'}
                  </p>
                </div>
                <div className="rounded-md border border-border-light bg-background/40 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Email Confirmation Required</p>
                  <p className="mt-1 text-xs text-text-muted">
                    The link goes to your sign-in email and confirms ownership before any password is added or changed.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={handlePasswordResetAction}
                    disabled={securityActionsDisabled || isSendingPasswordResetLink || !resolvedClientEmail}
                    className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    {isSendingPasswordResetLink && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isSendingPasswordResetLink ? 'Sending...' : `Email ${passwordActionLabel} Link`}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border-light bg-white p-4 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">Two-Step Verification</h4>
                  <p className="text-sm text-text-secondary mt-1">
                    Require an SMS code before sensitive account actions such as account deletion.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (accountSettings.twoStepEnabled) {
                      void startSecurityChallenge('disable-two-step')
                      return
                    }
                    void startSecurityChallenge('enable-two-step')
                  }}
                  disabled={securityActionsDisabled || securityChallenge.isSending || securityChallenge.isVerifying}
                  className={`h-9 px-4 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2 ${
                    accountSettings.twoStepEnabled
                      ? 'border border-border text-text-primary hover:bg-background'
                      : 'bg-primary text-white hover:bg-primary-light'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {(securityChallenge.isSending || securityChallenge.isVerifying) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {accountSettings.twoStepEnabled ? 'Turn Off' : 'Turn On'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-md border border-border-light bg-background/40 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Status</p>
                  <p className="mt-1 text-sm font-semibold text-text-primary">
                    {accountSettings.twoStepEnabled ? 'Enabled' : 'Disabled'}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {accountSettings.twoStepEnabled
                      ? 'SMS verification is active for sensitive account actions.'
                      : 'No extra verification is required for sensitive account actions.'}
                  </p>
                </div>
                <div className="rounded-md border border-border-light bg-background/40 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Verified Number</p>
                  <p className="mt-1 text-sm font-semibold text-text-primary">
                    {accountSettings.verifiedPhoneNumber || 'Not verified yet'}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {accountSettings.lastVerifiedAt
                      ? `Last verified ${formatDateTime(accountSettings.lastVerifiedAt)}.`
                      : 'Verify your current phone number to turn this on.'}
                  </p>
                </div>
              </div>

              {verifiedSecurityPhoneMismatch && (
                <div className="rounded-md border border-warning/30 bg-warning-bg/40 px-3 py-3">
                  <p className="text-sm font-semibold text-text-primary">Phone number changed</p>
                  <p className="text-sm text-text-secondary mt-1">
                    Your saved profile phone number is different from the verified number used for two-step verification.
                    Turn two-step verification off and on again to verify the new number.
                  </p>
                </div>
              )}

              {!resolvedSecurityPhoneNumber && (
                <div className="rounded-md border border-warning/30 bg-warning-bg/40 px-3 py-3">
                  <p className="text-sm font-semibold text-text-primary">Phone number required</p>
                  <p className="text-sm text-text-secondary mt-1">
                    Add a valid phone number in User Profile before you enable two-step verification.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSection('user-profile')}
                    className="mt-3 h-8 px-3 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary-light transition-colors"
                  >
                    Open User Profile
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border-light bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">Security Alert Emails</h4>
                  <p className="text-sm text-text-secondary mt-1">
                    Manage email alerts for unusual activity and security notices in Notification Settings.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSection('notifications')}
                  className="h-9 px-4 rounded-md border border-border text-sm font-medium text-text-primary hover:bg-background transition-colors"
                >
                  Open Notifications
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-error/30 bg-error-bg/30 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">Delete Account</h4>
                  <p className="text-sm text-text-secondary mt-1">
                    Permanently delete your account and remove access to this client workspace.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { void handleOpenDeleteAccountModal() }}
                  disabled={!canDeleteAccount}
                  className="h-9 px-4 rounded-md border border-error text-error text-sm font-medium hover:bg-error-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        )
      }

      case 'notifications': {
        const isEditingNotifications = editMode['notifications']
        return (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-1">Notification Settings</h3>
                <p className="text-sm text-text-muted">Control in-app and email updates for your account.</p>
              </div>
              {isEditingNotifications ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelNotificationEdit}
                    className="h-9 px-4 rounded-md border border-border text-sm font-medium text-text-primary hover:bg-background transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNotifications}
                    disabled={!hasNotificationChanges}
                    className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startNotificationEdit}
                  className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-light transition-colors"
                >
                  Edit
                </button>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border-light bg-white p-4">
              <h4 className="text-sm font-semibold text-text-primary">In-App Notifications</h4>
              {CLIENT_IN_APP_NOTIFICATION_OPTIONS.map((item) => {
                const isItemDisabled = !isEditingNotifications || (item.requiresInApp && !notificationDraft.inAppEnabled)
                return (
                  <label
                    key={item.key}
                    className={`flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                      isItemDisabled ? 'border-border-light bg-background/50 opacity-65' : 'border-border bg-background'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(notificationDraft[item.key])}
                      onChange={() => !isItemDisabled && handleNotificationChange(item.key)}
                      disabled={isItemDisabled}
                      className={`w-4 h-4 mt-0.5 accent-primary ${isItemDisabled ? 'cursor-not-allowed' : ''}`}
                    />
                    <span>
                      <span className="block text-sm font-medium text-text-primary">{item.label}</span>
                      <span className="block text-xs text-text-muted mt-0.5">{item.desc}</span>
                    </span>
                  </label>
                )
              })}
            </div>

            <div className="space-y-3 rounded-lg border border-border-light bg-white p-4">
              <h4 className="text-sm font-semibold text-text-primary">Email Notifications</h4>
              {CLIENT_EMAIL_NOTIFICATION_OPTIONS.map((item) => {
                const isItemDisabled = !isEditingNotifications
                return (
                  <label
                    key={item.key}
                    className={`flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                      isItemDisabled ? 'border-border-light bg-background/50 opacity-65' : 'border-border bg-background'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(notificationDraft[item.key])}
                      onChange={() => !isItemDisabled && handleNotificationChange(item.key)}
                      disabled={isItemDisabled}
                      className={`w-4 h-4 mt-0.5 accent-primary ${isItemDisabled ? 'cursor-not-allowed' : ''}`}
                    />
                    <span>
                      <span className="block text-sm font-medium text-text-primary">{item.label}</span>
                      <span className="block text-xs text-text-muted mt-0.5">{item.desc}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )
      }

      case 'identity': {
        /*
        const isIdentityEditMode = editMode['identity']
        Original disabled UI kept here for later restore:
        - Government ID type selector
        - ID card number input
        - Government ID upload dropzone
        - Dojah submission button wired to handleSubmitVerification
        */
        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-border-light bg-background/40 p-4">
              <h3 className="text-lg font-semibold text-text-primary">Identity Verification Removed</h3>
              <p className="text-sm text-text-secondary mt-1">
                Identity and business verification are both disabled for the MVP. Continue with your profile and workspace settings.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection('user-profile')}
              className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-light transition-colors"
            >
              Open User Profile
            </button>
          </div>
        )
      }

      case 'team-management': {
        return (
          <div className="space-y-6">
            <div className="rounded-lg border border-border-light bg-white overflow-hidden">
              <div className="border-b border-border-light bg-background/40 px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-tint px-3 py-1 text-xs font-semibold text-primary">
                      <Clock className="w-3.5 h-3.5" />
                      Coming Soon
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-text-primary">Team Management</h3>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                      We are preparing workspace collaboration tools for inviting teammates, assigning roles, and controlling access across your accounting workflow.
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-white">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
                {[
                  {
                    title: 'Invite Teammates',
                    description: 'Add accountants, managers, and viewers to the right company workspace.',
                    icon: UserPlus,
                  },
                  {
                    title: 'Role-Based Access',
                    description: 'Control what each teammate can see, upload, approve, and manage.',
                    icon: Lock,
                  },
                  {
                    title: 'Audit-Ready Activity',
                    description: 'Track team actions clearly across documents, support, and settings.',
                    icon: CheckCircle,
                  },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.title} className="rounded-lg border border-border-light bg-background/30 p-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-primary shadow-sm">
                        <Icon className="w-4 h-4" />
                      </div>
                      <p className="mt-4 text-sm font-semibold text-text-primary">{item.title}</p>
                      <p className="mt-2 text-xs leading-6 text-text-secondary">{item.description}</p>
                    </div>
                  )
                })}
              </div>

              <div className="border-t border-border-light px-5 py-4">
                <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-white p-4">
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Not available yet</p>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">
                      Team invites and role changes are paused while we finish the access-control flow. Existing accounts can continue using the workspace normally.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }

      case 'business-profile': {
        const isBusinessEditMode = editMode['business-profile']
        const businessSectionLockedForTeamMember = isAffiliatedTeamMember
        const readonlyBusinessType = teamWorkspaceDisplayValues?.businessType || formData.businessType
        const readonlyBusinessName = teamWorkspaceDisplayValues?.businessName || formData.businessName
        const readonlyBusinessCountry = teamWorkspaceDisplayValues?.country || formData.country
        const readonlyBusinessCurrency = teamWorkspaceDisplayValues?.currency || formData.currency
        const readonlyIndustry = teamWorkspaceDisplayValues?.industry || formData.industry
        const readonlyIndustryOther = teamWorkspaceDisplayValues?.industryOther || formData.industryOther
        const readonlyCacNumber = teamWorkspaceDisplayValues?.cacNumber || formData.cacNumber
        const businessTypeLocked = isFieldLocked('businessType')
        const cacLocked = isFieldLocked('cacNumber')
        const businessNameLocked = isFieldLocked('businessName')
        const countryLocked = isFieldLocked('country')
        const needsCac = draftData.businessType === 'Business' || draftData.businessType === 'Non-Profit'
        const isNigeriaRegistration = (draftData.country || readonlyBusinessCountry || '').trim().toLowerCase() === 'nigeria' || !(draftData.country || readonlyBusinessCountry)
        const registrationNumberLabel = isNigeriaRegistration ? 'CAC Registration Number' : 'Business Registration Number'
        const registrationNumberPlaceholder = isNigeriaRegistration ? 'e.g., BN123456, RC123456, or IT123456' : 'e.g., BR123456'

        return (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-1">Business Profile</h3>
                <p className="text-sm text-text-muted">Manage your business information</p>
                <p className="text-xs text-text-muted mt-1">Fields marked with <span className="text-error">*</span> are mandatory.</p>
              </div>
              <button
                onClick={() => isBusinessEditMode ? cancelSectionEdit('business-profile') : startSectionEdit('business-profile')}
                disabled={businessSectionLockedForTeamMember}
                className={`h-9 px-4 rounded-md text-sm font-medium transition-colors ${
                  businessSectionLockedForTeamMember
                    ? 'bg-gray-100 text-text-muted cursor-not-allowed'
                    : (isBusinessEditMode ? 'bg-error-bg text-error hover:bg-error/10' : 'bg-primary text-white hover:bg-primary-light')
                }`}
              >
                {businessSectionLockedForTeamMember ? 'Owner Controlled' : (isBusinessEditMode ? 'Cancel Edit' : 'Edit')}
              </button>
            </div>

            {businessSectionLockedForTeamMember && (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
                <p className="text-sm font-semibold text-text-primary">Inherited Business Profile</p>
                <p className="text-sm text-text-secondary mt-1">
                  Business details for {affiliatedWorkspaceName} are inherited from {affiliatedWorkspaceOwnerName} and remain read-only here.
                </p>
              </div>
            )}

            {!isBusinessEditMode ? (
              <>
                <div className="rounded-md border border-border-light bg-background/40 px-3 py-2.5">
                  <div className="flex items-center gap-1 text-[11px] font-medium text-text-secondary uppercase tracking-wide">
                    <span>Customer Reference ID (CRI)</span>
                    <Lock className="w-3.5 h-3.5 text-text-muted" />
                  </div>
                  <div className="mt-1 text-sm font-medium text-text-primary">{resolvedClientCri}</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderReadonlyField('Business Type', readonlyBusinessType, true)}
                  {(readonlyBusinessType === 'Business' || readonlyBusinessType === 'Non-Profit' || readonlyBusinessType === 'business' || readonlyBusinessType === 'non-profit') && renderReadonlyField(
                    ((readonlyBusinessCountry || '').trim().toLowerCase() === 'nigeria' || !readonlyBusinessCountry) ? 'CAC Registration Number' : 'Business Registration Number',
                    readonlyCacNumber,
                    true
                  )}
                  {renderReadonlyField('Business Name', readonlyBusinessName, true)}
                  {renderReadonlyField('Country of Registration', readonlyBusinessCountry, true)}
                  {renderReadonlyField('Base Currency', readonlyBusinessCurrency, true)}
                  {renderReadonlyField('Account Language', formData.language, true)}
                  {renderReadonlyField('Industry', readonlyIndustry, true)}
                  {readonlyIndustry === 'Others' && renderReadonlyField('Please Specify Your Industry', readonlyIndustryOther, true)}
                </div>
                <div className="border border-border rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-text-primary mb-4">Business Verification</h4>
                  <div className="rounded-md border border-primary/20 bg-primary-tint/40 px-3 py-2.5 text-sm text-text-secondary">
                    {businessVerificationNotice}
                  </div>
                </div>
                <div className="border border-border rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-text-primary mb-4">Company Branding</h4>
                  <div className="rounded-md border border-border-light bg-background/40 p-4 flex items-center gap-4">
                    {logoFile ? (
                      <div className="w-24 h-16 rounded border border-border-light bg-white p-2 flex items-center justify-center">
                        <img src={logoFile} alt="Company Logo" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-24 h-16 rounded border border-border-light bg-white p-2 flex items-center justify-center text-xs text-text-muted">
                        No Logo
                      </div>
                    )}
                    <div>
                      <p className={`text-sm font-medium ${logoFile ? 'text-text-primary' : 'text-error'}`}>{logoFile ? 'Logo' : 'Not Provided'}</p>
                      <p className="text-xs text-text-muted mt-1">Max size: 5 MB. Accepted formats: image files.</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Customer Reference ID (CRI)</label>
                  <button
                    type="button"
                    onClick={showLockedFieldToast}
                    className="w-full h-10 px-3 border border-gray-200 rounded-md bg-gray-100 text-left flex items-center justify-between"
                  >
                    <span className="text-sm text-text-primary">{resolvedClientCri}</span>
                    <Lock className="w-4 h-4 text-text-muted" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {businessTypeLocked ? (
                    <>
                      {renderLockedField('businessType', 'Business Type', true)}
                      {toTrimmedValue(formData.businessType).toLowerCase() === 'individual' && (
                        <div className="rounded-md border border-warning/30 bg-warning-bg/40 px-3 py-2.5 text-xs text-text-secondary md:col-span-2">
                          To change from Individual to Business or Non-Profit, contact Super Admin or Technical Support Admin.
                        </div>
                      )}
                    </>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Business Type <span className="text-error">*</span></label>
                      <select
                        id="settings-businessType"
                        value={draftData.businessType}
                        onChange={(e) => handleInputChange('businessType', e.target.value)}
                        className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.businessType ? 'border-error' : 'border-border'}`}
                      >
                        <option value="">Select business type</option>
                        <option>Business</option>
                        <option>Non-Profit</option>
                        <option>Individual</option>
                      </select>
                      {errors.businessType && <p className="text-xs text-error mt-1">{errors.businessType}</p>}
                    </div>
                  )}

                  {needsCac && (
                    cacLocked ? (
                      renderLockedField('cacNumber', registrationNumberLabel, true)
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">{registrationNumberLabel} <span className="text-error">*</span></label>
                        <input
                          id="settings-cacNumber"
                          type="text"
                          value={draftData.cacNumber}
                          placeholder={registrationNumberPlaceholder}
                          onChange={(e) => handleInputChange('cacNumber', e.target.value)}
                          className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.cacNumber ? 'border-error' : 'border-border'}`}
                        />
                        {errors.cacNumber && <p className="text-xs text-error mt-1">{errors.cacNumber}</p>}
                      </div>
                    )
                  )}

                  {businessNameLocked ? (
                    renderLockedField('businessName', 'Business Name', true)
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Business Name <span className="text-error">*</span></label>
                      <input
                        id="settings-businessName"
                        type="text"
                        value={draftData.businessName}
                        onChange={(e) => handleInputChange('businessName', e.target.value)}
                        className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.businessName ? 'border-error' : 'border-border'}`}
                      />
                      {errors.businessName && <p className="text-xs text-error mt-1">{errors.businessName}</p>}
                    </div>
                  )}

                  {countryLocked ? (
                    renderLockedField('country', 'Country of Registration', true)
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Country of Registration <span className="text-error">*</span></label>
                      <select
                        id="settings-country"
                        value={draftData.country}
                        onChange={(e) => handleInputChange('country', e.target.value)}
                        className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.country ? 'border-error' : 'border-border'}`}
                      >
                        <option value="">Select country</option>
                        {countries.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {errors.country && <p className="text-xs text-error mt-1">{errors.country}</p>}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Base Currency <span className="text-error">*</span></label>
                    <select
                      id="settings-currency"
                      value={draftData.currency}
                      onChange={(e) => handleInputChange('currency', e.target.value)}
                      className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.currency ? 'border-error' : 'border-border'}`}
                    >
                      <option value="NGN">NGN - Nigerian Naira</option>
                      <option value="USD">USD - US Dollar</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GBP">GBP - British Pound</option>
                    </select>
                    {errors.currency && <p className="text-xs text-error mt-1">{errors.currency}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Account Language <span className="text-error">*</span></label>
                    <select
                      id="settings-language"
                      value={draftData.language}
                      onChange={(e) => handleInputChange('language', e.target.value)}
                      className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.language ? 'border-error' : 'border-border'}`}
                    >
                      <option value="">Select language</option>
                      <option>English</option>
                      <option>French</option>
                      <option>Portuguese</option>
                    </select>
                    {errors.language && <p className="text-xs text-error mt-1">{errors.language}</p>}
                  </div>

                  <div className={draftData.industry === 'Others' ? 'col-span-2' : ''}>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Industry <span className="text-error">*</span></label>
                    <select
                      id="settings-industry"
                      value={draftData.industry}
                      onChange={(e) => handleInputChange('industry', e.target.value)}
                      className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.industry ? 'border-error' : 'border-border'}`}
                    >
                      <option value="">Select industry</option>
                      {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                    </select>
                    {errors.industry && <p className="text-xs text-error mt-1">{errors.industry}</p>}
                  </div>

                  {draftData.industry === 'Others' && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Please specify your industry <span className="text-error">*</span></label>
                      <input
                        id="settings-industryOther"
                        type="text"
                        value={draftData.industryOther}
                        onChange={(e) => handleInputChange('industryOther', e.target.value)}
                        className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.industryOther ? 'border-error' : 'border-border'}`}
                      />
                      {errors.industryOther && <p className="text-xs text-error mt-1">{errors.industryOther}</p>}
                    </div>
                  )}
                </div>

                <div className="border border-border rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-text-primary mb-4">Company Branding</h4>
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                    <UploadCloud className="w-10 h-10 mx-auto mb-3 text-text-muted" />
                    <input
                      type="file"
                      id="business-logo-upload"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                    <label htmlFor="business-logo-upload" className="h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors cursor-pointer inline-flex items-center">
                      {logoFile ? 'Change Logo' : 'Upload Company Logo'}
                    </label>
                    <p className="text-xs text-text-muted mt-3">Max size: 5 MB. Accepted formats: image files.</p>
                    {logoFile && (
                      <div className="mt-4 flex items-center justify-center gap-3">
                        <div className="w-20 h-14 rounded border border-border-light bg-white p-2 flex items-center justify-center">
                          <img src={logoFile} alt="Company Logo" className="w-full h-full object-contain" />
                        </div>
                        <p className="text-sm text-success font-medium">Uploaded: Logo</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border border-border rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-text-primary mb-4">Business Verification</h4>
                  <div className="rounded-md border border-primary/20 bg-primary-tint/40 px-3 py-3 text-sm text-text-secondary">
                    {businessVerificationNotice}
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={handleSaveBusiness}
                    className="h-10 px-6 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </>
            )}
          </div>
        )
      }

      case 'tax-details': {
        const isTaxEditMode = editMode['tax-details']
        const taxSectionLockedForTeamMember = isAffiliatedTeamMember
        const tinLocked = isFieldLocked('tin')
        const readonlyTin = teamWorkspaceDisplayValues?.tin || formData.tin
        const readonlyReportingCycle = teamWorkspaceDisplayValues?.reportingCycle || formData.reportingCycle
        const readonlyStartMonth = teamWorkspaceDisplayValues?.startMonth || formData.startMonth
        const financialYearEndDisplay = formatFinancialBoundaryDisplay(readonlyReportingCycle, 'end')
        const financialYearStartDisplay = formatFinancialBoundaryDisplay(readonlyStartMonth, 'start')
        const financialYearEndMonth = getFinancialBoundaryMonth(draftData.reportingCycle)
        const financialYearStartMonth = getFinancialBoundaryMonth(draftData.startMonth)
        return (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-1">Tax Details</h3>
                <p className="text-sm text-text-muted">Configure your financial year dates</p>
                <p className="text-xs text-text-muted mt-1">Fields marked with <span className="text-error">*</span> are mandatory.</p>
              </div>
              <button
                onClick={() => isTaxEditMode ? cancelSectionEdit('tax-details') : startSectionEdit('tax-details')}
                disabled={taxSectionLockedForTeamMember}
                className={`h-9 px-4 rounded-md text-sm font-medium transition-colors ${
                  taxSectionLockedForTeamMember
                    ? 'bg-gray-100 text-text-muted cursor-not-allowed'
                    : (isTaxEditMode ? 'bg-error-bg text-error hover:bg-error/10' : 'bg-primary text-white hover:bg-primary-light')
                }`}
              >
                {taxSectionLockedForTeamMember ? 'Owner Controlled' : (isTaxEditMode ? 'Cancel Edit' : 'Edit')}
              </button>
            </div>

            {taxSectionLockedForTeamMember && (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
                <p className="text-sm font-semibold text-text-primary">Inherited Tax Setup</p>
                <p className="text-sm text-text-secondary mt-1">
                  Tax and reporting fields follow the workspace owned by {affiliatedWorkspaceOwnerName}, so they are read-only for team members.
                </p>
              </div>
            )}

            {!isTaxEditMode ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderReadonlyField('TIN (Tax Identification Number)', readonlyTin, true)}
                {renderReadonlyField('Financial Year End', financialYearEndDisplay, true)}
                {renderReadonlyField('Financial Year Start', financialYearStartDisplay, true)}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tinLocked ? (
                    renderLockedField('tin', 'TIN (Tax Identification Number)', true)
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">TIN (Tax Identification Number) <span className="text-error">*</span></label>
                      <input
                        id="settings-tin"
                        type="text"
                        value={draftData.tin}
                        onChange={(e) => handleInputChange('tin', e.target.value)}
                        className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.tin ? 'border-error' : 'border-border'}`}
                      />
                      {errors.tin && <p className="text-xs text-error mt-1">{errors.tin}</p>}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Financial Year End <span className="text-error">*</span></label>
                    <select
                      id="settings-reportingCycle"
                      value={financialYearEndMonth}
                      onChange={(e) => handleInputChange('reportingCycle', e.target.value)}
                      className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.reportingCycle ? 'border-error' : 'border-border'}`}
                    >
                      <option value="">Select month</option>
                      {FINANCIAL_MONTH_OPTIONS.map((option) => (
                        <option key={`fy-end-${option.value}`} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    {errors.reportingCycle && <p className="text-xs text-error mt-1">{errors.reportingCycle}</p>}
                    {!errors.reportingCycle && (
                      <p className="text-xs text-text-muted mt-1">Always saved as the last day of the selected month.</p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Financial Year Start <span className="text-error">*</span></label>
                    <select
                      id="settings-startMonth"
                      value={financialYearStartMonth}
                      onChange={(e) => handleInputChange('startMonth', e.target.value)}
                      className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.startMonth ? 'border-error' : 'border-border'}`}
                    >
                      <option value="">Select month</option>
                      {FINANCIAL_MONTH_OPTIONS.map((option) => (
                        <option key={`fy-start-${option.value}`} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    {errors.startMonth ? (
                      <p className="text-xs text-error mt-1">{errors.startMonth}</p>
                    ) : (
                      <p className="text-xs text-text-muted mt-1">Always saved as the first day of the selected month.</p>
                    )}
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={handleSaveTax}
                    className="h-10 px-6 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </>
            )}
          </div>
        )
      }

      case 'registered-address': {
        const isAddressEditMode = editMode['registered-address']
        return (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-1">Registered Address</h3>
                <p className="text-sm text-text-muted">Your official business address</p>
                <p className="text-xs text-text-muted mt-1">Fields marked with <span className="text-error">*</span> are mandatory.</p>
              </div>
              <button
                onClick={() => isAddressEditMode ? cancelSectionEdit('registered-address') : startSectionEdit('registered-address')}
                className={`h-9 px-4 rounded-md text-sm font-medium transition-colors ${
                  isAddressEditMode ? 'bg-error-bg text-error hover:bg-error/10' : 'bg-primary text-white hover:bg-primary-light'
                }`}
              >
                {isAddressEditMode ? 'Cancel Edit' : 'Edit'}
              </button>
            </div>

            {!isAddressEditMode ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-2">{renderReadonlyField('Address Line 1', formData.address1, true)}</div>
                <div className="col-span-2">{renderReadonlyField('Address Line 2', formData.address2, false)}</div>
                {renderReadonlyField('City/Town', formData.city, true)}
                {renderReadonlyField('Postal/Zip Code', formData.postalCode, true)}
                <div className="col-span-2">{renderReadonlyField('Country', formData.addressCountry, true)}</div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Address Line 1 <span className="text-error">*</span></label>
                    <input
                      id="settings-address1"
                      type="text"
                      value={draftData.address1}
                      onChange={(e) => handleInputChange('address1', e.target.value)}
                      className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.address1 ? 'border-error' : 'border-border'}`}
                    />
                    {errors.address1 && <p className="text-xs text-error mt-1">{errors.address1}</p>}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Address Line 2</label>
                    <input
                      id="settings-address2"
                      type="text"
                      value={draftData.address2}
                      onChange={(e) => handleInputChange('address2', e.target.value)}
                      className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">City/Town <span className="text-error">*</span></label>
                    <input
                      id="settings-city"
                      type="text"
                      value={draftData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.city ? 'border-error' : 'border-border'}`}
                    />
                    {errors.city && <p className="text-xs text-error mt-1">{errors.city}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Postal/Zip Code <span className="text-error">*</span></label>
                    <input
                      id="settings-postalCode"
                      type="text"
                      value={draftData.postalCode}
                      onChange={(e) => handleInputChange('postalCode', e.target.value)}
                      className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.postalCode ? 'border-error' : 'border-border'}`}
                    />
                    {errors.postalCode && <p className="text-xs text-error mt-1">{errors.postalCode}</p>}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Country <span className="text-error">*</span></label>
                    <select
                      id="settings-addressCountry"
                      value={draftData.addressCountry}
                      onChange={(e) => handleInputChange('addressCountry', e.target.value)}
                      className={`w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:border-primary ${errors.addressCountry ? 'border-error' : 'border-border'}`}
                    >
                      <option value="">Select country</option>
                      {countries.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {errors.addressCountry && <p className="text-xs text-error mt-1">{errors.addressCountry}</p>}
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={handleSaveAddress}
                    className="h-10 px-6 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </>
            )}
          </div>
        )
      }

      default:
        return null
    }
  }

  return (
    <div>
      {saveConfirmation.open && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border-light bg-white p-6 shadow-card">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success-bg text-success">
                <CheckCircle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-text-primary">{saveConfirmation.title}</h3>
                <p className="mt-2 text-sm text-text-secondary">{saveConfirmation.message}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSaveConfirmation({ open: false, title: '', message: '' })}
                className="h-10 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-light transition-colors"
              >
                Okay
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Business Settings</h1>
      </div>

      {verificationLockEnforced && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning-bg/50 px-4 py-3">
          <p className="text-sm font-semibold text-text-primary">Verify your account</p>
          <p className="text-sm text-text-secondary mt-1">
            Complete at least 1 of 3 verification steps to unlock dashboard actions.
          </p>
          <button
            type="button"
            onClick={() => setActiveSection('user-profile')}
            className="mt-3 h-8 px-3 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary-light transition-colors"
          >
            Open User Profile
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Left Navigation */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <div className="bg-white rounded-lg shadow-card p-4">
            <div className="space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSectionSelect(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                    activeSection === item.id
                      ? 'bg-primary-tint text-primary border-l-[3px] border-primary'
                      : 'text-text-secondary hover:bg-background hover:text-text-primary border-l-[3px] border-transparent'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
            </div>
            <div className="my-4 border-t border-border-light"></div>
            <div className="space-y-1">
              {businessNavItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSectionSelect(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                    activeSection === item.id
                      ? 'bg-primary-tint text-primary border-l-[3px] border-primary'
                      : 'text-text-secondary hover:bg-background hover:text-text-primary border-l-[3px] border-transparent'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Content */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-lg shadow-card p-4 sm:p-6">
            {renderSection()}
          </div>
        </div>
      </div>

      {securityChallenge.open && (
        <div className="fixed inset-0 z-[165] bg-black/35 p-4 flex items-center justify-center">
          <div className="w-full max-w-lg rounded-lg border border-border-light bg-white shadow-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-text-primary">Security Verification</h4>
                <p className="text-xs text-text-muted mt-1">
                  Enter the SMS verification code sent to {resolvedSecurityPhoneNumber || 'your saved phone number'}.
                </p>
              </div>
              <button
                type="button"
                onClick={closeSecurityChallenge}
                disabled={securityChallenge.isSending || securityChallenge.isVerifying}
                className="h-8 w-8 rounded border border-border-light text-text-secondary hover:text-text-primary hover:bg-background inline-flex items-center justify-center disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-md border border-border-light bg-background/40 px-3 py-3">
                <p className="text-sm font-medium text-text-primary">
                  {securityChallenge.mode === 'enable-two-step' && 'Enable two-step verification'}
                  {securityChallenge.mode === 'disable-two-step' && 'Turn off two-step verification'}
                  {securityChallenge.mode === 'password-reset' && 'Confirm password reset request'}
                  {securityChallenge.mode === 'change-password' && 'Confirm password change request'}
                  {securityChallenge.mode === 'delete-account' && 'Confirm account deletion access'}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {securityChallenge.expiresAt
                    ? `Code expires ${formatDateTime(securityChallenge.expiresAt)}.`
                    : 'A fresh code has been sent to your phone.'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={securityChallenge.otp}
                  onChange={(event) => setSecurityChallenge((previous) => ({
                    ...previous,
                    otp: sanitizeDigitsOnly(event.target.value).slice(0, 6),
                  }))}
                  placeholder="Enter 6-digit code"
                  className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => { void startSecurityChallenge(securityChallenge.mode) }}
                disabled={securityChallenge.isSending || securityChallenge.isVerifying}
                className="h-9 px-4 rounded-md border border-border text-sm font-medium text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {securityChallenge.isSending ? 'Sending...' : 'Resend Code'}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeSecurityChallenge}
                  disabled={securityChallenge.isSending || securityChallenge.isVerifying}
                  className="h-9 px-4 rounded-md border border-border text-sm font-medium text-text-primary hover:bg-background disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={completeSecurityChallenge}
                  disabled={securityChallenge.isSending || securityChallenge.isVerifying}
                  className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {securityChallenge.isVerifying && <Loader2 className="w-4 h-4 animate-spin" />}
                  {securityChallenge.isVerifying ? 'Verifying...' : 'Verify Code'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isInviteModalOpen && (
        <div className="fixed inset-0 z-[160] bg-black/30 backdrop-blur-[1px] p-4 flex items-center justify-center">
          <div className="w-full max-w-md rounded-lg border border-border-light bg-white shadow-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-text-primary">Invite Team Member</h4>
                <p className="text-xs text-text-muted mt-1">Links expire in 48 hours and can only be used once.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="h-8 w-8 rounded border border-border-light text-text-secondary hover:text-text-primary hover:bg-background inline-flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Email Address</label>
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((previous) => ({ ...previous, email: e.target.value }))}
                  className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm((previous) => ({ ...previous, role: e.target.value }))}
                  className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                >
                  <option value="manager">Manager</option>
                  <option value="accountant">Accountant</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>

              {generatedInviteLink && (
                <div className="rounded-md border border-border-light bg-background/40 p-3">
                  <p className="text-xs text-text-muted">Generated Invite Link</p>
                  <p className="text-xs text-text-primary mt-1 break-all">{generatedInviteLink}</p>
                  <button
                    type="button"
                    onClick={() => handleCopyInviteLink()}
                    className="mt-2 h-8 px-2.5 rounded border border-border text-xs font-medium text-text-primary hover:bg-background inline-flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Invite Link
                  </button>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="h-9 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleCreateInvite}
                className="h-9 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors"
              >
                Create Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[170] bg-black/40 p-4 flex items-center justify-center">
          <div className="w-full max-w-xl rounded-lg border border-border-light bg-white shadow-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-text-primary">Delete Account</h4>
                <p className="text-xs text-text-muted mt-1">Step {deleteAccountStep} of 3</p>
              </div>
              <button
                type="button"
                onClick={handleCloseDeleteAccountModal}
                disabled={isDeletingAccount}
                className="h-8 w-8 rounded border border-border-light text-text-secondary hover:text-text-primary hover:bg-background inline-flex items-center justify-center disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {deleteAccountStep === 1 && (
                <>
                  <p className="text-sm font-medium text-text-primary">Why do you want to delete your account?</p>
                  <div className="space-y-2">
                    {ACCOUNT_DELETE_REASON_OPTIONS.map((option) => (
                      <label key={option} className="flex items-center gap-2 text-sm text-text-secondary">
                        <input
                          type="radio"
                          name="delete-reason"
                          checked={deleteAccountDraft.reason === option}
                          onChange={() => setDeleteAccountDraft((previous) => ({ ...previous, reason: option }))}
                          className="accent-primary"
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                  {deleteAccountDraft.reason === 'Other' && (
                    <textarea
                      value={deleteAccountDraft.reasonOther}
                      onChange={(event) => setDeleteAccountDraft((previous) => ({ ...previous, reasonOther: event.target.value }))}
                      placeholder="Please tell us your reason."
                      className="w-full h-24 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-primary resize-none"
                    />
                  )}
                </>
              )}

              {deleteAccountStep === 2 && (
                <>
                  <p className="text-sm font-medium text-text-primary">Before deleting, what would you like us to do?</p>
                  <div className="space-y-2">
                    {ACCOUNT_DELETE_RETENTION_OPTIONS.map((option) => (
                      <label key={option} className="flex items-center gap-2 text-sm text-text-secondary">
                        <input
                          type="radio"
                          name="delete-retention"
                          checked={deleteAccountDraft.retentionIntent === option}
                          onChange={() => setDeleteAccountDraft((previous) => ({ ...previous, retentionIntent: option }))}
                          className="accent-primary"
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </>
              )}

              {deleteAccountStep === 3 && (
                <>
                  <div className="rounded-md border border-error/30 bg-error-bg/30 px-3 py-3">
                    <p className="text-sm font-semibold text-text-primary">Permanent deletion warning</p>
                    <p className="text-sm text-text-secondary mt-1">
                      If you delete this account, all your records and uploaded details will be permanently lost.
                    </p>
                  </div>
                  <label className="flex items-start gap-2 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={deleteAccountDraft.acknowledgedPermanentDeletion}
                      onChange={(event) => setDeleteAccountDraft((previous) => ({
                        ...previous,
                        acknowledgedPermanentDeletion: event.target.checked,
                      }))}
                      className="mt-0.5 accent-primary"
                    />
                    I understand this action is permanent and cannot be undone.
                  </label>
                </>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDeleteAccountStep((previous) => Math.max(1, previous - 1))}
                disabled={isDeletingAccount || deleteAccountStep === 1}
                className="h-9 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCloseDeleteAccountModal}
                  disabled={isDeletingAccount}
                  className="h-9 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={goToNextDeleteStep}
                  disabled={isDeletingAccount}
                  className="h-9 px-4 bg-error text-white rounded-md text-sm font-medium hover:bg-error/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteAccountStep < 3 ? 'Continue' : (isDeletingAccount ? 'Deleting...' : 'Delete Permanently')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default SettingsPage



