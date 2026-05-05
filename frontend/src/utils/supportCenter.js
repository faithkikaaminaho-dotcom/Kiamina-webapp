import { apiFetch, getApiAccessToken, getApiSessionId } from './apiClient'

const SUPPORT_TICKETS_STORAGE_KEY = 'kiaminaSupportTickets'
const SUPPORT_LEADS_STORAGE_KEY = 'kiaminaSupportLeads'
const SUPPORT_LEAD_SEQUENCE_STORAGE_KEY = 'kiaminaSupportLeadSequence'
const SUPPORT_ANON_LEAD_SESSION_STORAGE_KEY = 'kiaminaSupportAnonLeadSession'
const SUPPORT_CLIENT_READ_STORAGE_KEY = 'kiaminaSupportReadByClient'
const SUPPORT_ADMIN_READ_STORAGE_KEY = 'kiaminaSupportReadByAdmin'
const SUPPORT_ASSIGNED_ADMIN_META_STORAGE_KEY = 'kiaminaSupportAssignedAdminMeta'
const AGENT_REQUEST_PATTERN = /(agent|human|person|representative|support team)/i
const MESSAGE_FAIL_PROBABILITY = 0.12
const SUPPORT_COMPANY_NAME = 'Kiamina Accounting Services'
const GENERIC_AGENT_NAME_PATTERN = /^(admin|administrator|senior admin|super admin|support agent|agent|system administrator)$/i
const GENERIC_AGENT_TOKENS = new Set(['admin', 'administrator', 'senior', 'super', 'support', 'agent', 'system'])
const LEAD_ALIAS_DOMAIN = 'lead.kiamina.local'
const LEAD_EMAIL_PATTERN = /^lead-(\d+)@lead\.kiamina\.local$/i
const ANONYMOUS_SUPPORT_SESSION_PREFIX = 'anon-session'

const LEAD_ORGANIZATION_TYPE = Object.freeze({
  BUSINESS: 'business',
  NON_PROFIT: 'non-profit',
  INDIVIDUAL: 'individual',
  UNKNOWN: '',
})

const LEAD_CATEGORY = Object.freeze({
  INQUIRY_FOLLOW_UP: 'Inquiry_FollowUP',
  NEWSLETTER_SUBSCRIBER: 'Newsletter_Subscriber',
  GENERAL: 'General',
})

const LEAD_INTAKE_STAGE = Object.freeze({
  FULL_NAME: 'awaiting_full_name',
  EMAIL: 'awaiting_email',
  INQUIRY: 'awaiting_inquiry',
  COMPLETE: 'complete',
})
const SUPPORT_LEAD_STATUS_VALUES = new Set(['new', 'contacted', 'qualified', 'converted', 'closed'])
const NEWSLETTER_STATUS_VALUES = new Set(['subscribed', 'unsubscribed', 'bounced'])

const SUPPORT_TIMEZONE = 'Africa/Lagos'
const SUPPORT_WORKING_HOURS_TEXT = 'Mon-Fri 8:00 AM - 5:00 PM, Sat-Sun 9:00 AM - 1:00 PM (WAT)'
const SUPPORT_AGENT_OFFLINE_TEXT = `Human agents are currently offline. Working hours: ${SUPPORT_WORKING_HOURS_TEXT}.`
const SUPPORT_BACKEND_REFRESH_STALE_MS = 45000
const LEAD_GEO_LOOKUP_ENDPOINTS = Object.freeze([
  { key: 'ipwho', url: 'https://ipwho.is/' },
  { key: 'ipapi', url: 'https://ipapi.co/json/' },
  { key: 'ipinfo', url: 'https://ipinfo.io/json' },
  { key: 'ipify', url: 'https://api.ipify.org?format=json' },
])

const SUPPORT_TICKET_STATUS = Object.freeze({
  OPEN: 'open',
  ASSIGNED: 'assigned',
  RESOLVED: 'resolved',
})

const SUPPORT_CHANNEL = Object.freeze({
  BOT: 'bot',
  HUMAN: 'human',
})

const SUPPORT_MESSAGE_STATUS = Object.freeze({
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
  TYPING: 'typing',
})

const SUPPORT_SENDER = Object.freeze({
  CLIENT: 'client',
  AGENT: 'agent',
  BOT: 'bot',
  SYSTEM: 'system',
})

const BOT_WELCOME_TEXT = 'Hi. I am Kiamina Support Bot. I can help with Kiamina services, onboarding, uploads, tax, payroll, settings, and human support.'

function capitalizeWord(value = '') {
  const normalized = toTrimmedValue(value)
  if (!normalized) return ''
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
}

function getNameFromEmail(email = '') {
  const localPart = toEmail(email).split('@')[0] || ''
  const candidate = localPart
    .split(/[._-]+/)
    .map((part) => toTrimmedValue(part))
    .find((part) => part && !GENERIC_AGENT_TOKENS.has(part.toLowerCase()))
  return capitalizeWord(candidate)
}

function getAgentDisplayName(value = '', email = '') {
  const normalizedName = toTrimmedValue(value)
  const parts = normalizedName
    .split(/\s+/)
    .map((part) => toTrimmedValue(part))
    .filter(Boolean)
  const firstMeaningfulPart = parts.find((part) => !GENERIC_AGENT_TOKENS.has(part.toLowerCase()))

  if (firstMeaningfulPart && !GENERIC_AGENT_NAME_PATTERN.test(normalizedName.toLowerCase())) {
    return capitalizeWord(firstMeaningfulPart)
  }

  const emailName = getNameFromEmail(email)
  if (emailName) return emailName
  if (firstMeaningfulPart) return capitalizeWord(firstMeaningfulPart)
  return 'Support'
}

function buildAgentIntroduction(name = '') {
  return `Hi, this is ${getAgentDisplayName(name)} from ${SUPPORT_COMPANY_NAME}.`
}

function buildAgentHandoffMessage(name = '') {
  return `Hi, this is ${getAgentDisplayName(name)} from ${SUPPORT_COMPANY_NAME}. I will assist you from here. How may I help you?`
}

const listenerSet = new Set()
let storageListenerBound = false
let backendRefreshLastCompletedAtMs = 0
let supportState = {
  tickets: [],
  leads: [],
}

const safeParseJson = (rawValue, fallback) => {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : fallback
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

const toTrimmedValue = (value = '') => String(value || '').trim()
const toEmail = (value = '') => toTrimmedValue(value).toLowerCase()
const nowIso = () => new Date().toISOString()
const addHoursIso = (sourceIso, hours) => new Date((Date.parse(sourceIso) || Date.now()) + (hours * 60 * 60 * 1000)).toISOString()
const createId = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`

const readCurrentCapturePath = () => {
  if (typeof window === 'undefined') return '/'
  const rawPath = toTrimmedValue(window.location.pathname) || '/'
  return rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath
}

const resolveCapturePageFromPath = (pathname = '/') => {
  const rawPath = toTrimmedValue(pathname) || '/'
  const normalizedPath = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath
  if (normalizedPath === '/' || normalizedPath === '/home') return 'home'
  if (normalizedPath === '/about') return 'about'
  if (normalizedPath === '/services') return 'services'
  if (normalizedPath === '/insights') return 'insights'
  if (normalizedPath === '/careers') return 'careers'
  if (normalizedPath === '/contact') return 'contact'
  if (normalizedPath === '/login') return 'login'
  if (normalizedPath === '/signup') return 'signup'
  return normalizedPath.replace(/^\//, '') || 'home'
}

const buildLeadCaptureContext = ({
  capturePage = '',
  capturePath = '',
} = {}) => {
  const resolvedPath = toTrimmedValue(capturePath) || readCurrentCapturePath()
  return {
    capturePage: toTrimmedValue(capturePage) || resolveCapturePageFromPath(resolvedPath),
    capturePath: resolvedPath,
  }
}

const normalizeLeadOrganizationType = (value = '') => {
  const normalized = toTrimmedValue(value).toLowerCase()
  if (normalized === LEAD_ORGANIZATION_TYPE.BUSINESS) return LEAD_ORGANIZATION_TYPE.BUSINESS
  if (normalized === LEAD_ORGANIZATION_TYPE.NON_PROFIT) return LEAD_ORGANIZATION_TYPE.NON_PROFIT
  if (normalized === LEAD_ORGANIZATION_TYPE.INDIVIDUAL) return LEAD_ORGANIZATION_TYPE.INDIVIDUAL
  return LEAD_ORGANIZATION_TYPE.UNKNOWN
}

const normalizeLeadCategory = (value = '') => {
  const normalized = toTrimmedValue(value)
  if (normalized === LEAD_CATEGORY.INQUIRY_FOLLOW_UP) return LEAD_CATEGORY.INQUIRY_FOLLOW_UP
  if (normalized === LEAD_CATEGORY.NEWSLETTER_SUBSCRIBER) return LEAD_CATEGORY.NEWSLETTER_SUBSCRIBER
  return LEAD_CATEGORY.GENERAL
}

const normalizeLeadCategories = (...values) => {
  const nextCategories = []
  const seen = new Set()
  const pushCategory = (candidate) => {
    const normalized = normalizeLeadCategory(candidate)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    nextCategories.push(normalized)
  }

  values.forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => pushCategory(entry))
      return
    }
    const normalizedValue = toTrimmedValue(value)
    if (!normalizedValue) return
    normalizedValue
      .split(/[|,]/)
      .map((entry) => toTrimmedValue(entry))
      .filter(Boolean)
      .forEach((entry) => pushCategory(entry))
  })

  return nextCategories
}

const hasLeadCategory = (leadOrTicket = {}, category = '') => {
  const normalizedCategory = normalizeLeadCategory(category)
  if (!normalizedCategory || normalizedCategory === LEAD_CATEGORY.GENERAL) return false
  const categories = normalizeLeadCategories(
    leadOrTicket?.leadCategories,
    leadOrTicket?.leadCategory,
  )
  return categories.includes(normalizedCategory)
}

const normalizeLeadIntakeStage = (value = '') => {
  const normalized = toTrimmedValue(value)
  if (normalized === LEAD_INTAKE_STAGE.FULL_NAME) return LEAD_INTAKE_STAGE.FULL_NAME
  if (normalized === LEAD_INTAKE_STAGE.EMAIL) return LEAD_INTAKE_STAGE.EMAIL
  if (normalized === LEAD_INTAKE_STAGE.INQUIRY) return LEAD_INTAKE_STAGE.INQUIRY
  if (normalized === LEAD_INTAKE_STAGE.COMPLETE) return LEAD_INTAKE_STAGE.COMPLETE
  return ''
}

const buildLeadAliasEmail = (leadNumber = 0) => `lead-${Math.max(1, Number(leadNumber) || 1)}@${LEAD_ALIAS_DOMAIN}`

const parseLeadNumberFromAlias = (clientEmail = '') => {
  const match = toEmail(clientEmail).match(LEAD_EMAIL_PATTERN)
  if (!match) return 0
  const parsed = Number(match[1] || 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}
const isLeadAliasEmail = (clientEmail = '') => LEAD_EMAIL_PATTERN.test(toEmail(clientEmail))

const isValidEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail(value))

const getLeadIntakeStage = (lead = {}) => {
  const presetStage = normalizeLeadIntakeStage(lead.intakeStage)
  const hasFullName = Boolean(toTrimmedValue(lead.fullName))
  const hasEmail = isValidEmail(lead.contactEmail)
  const hasInquiry = Boolean(toTrimmedValue(lead.inquiryText))

  if (presetStage === LEAD_INTAKE_STAGE.FULL_NAME) return LEAD_INTAKE_STAGE.FULL_NAME
  if (presetStage === LEAD_INTAKE_STAGE.EMAIL && hasFullName) return LEAD_INTAKE_STAGE.EMAIL
  if (presetStage === LEAD_INTAKE_STAGE.INQUIRY && hasFullName && hasEmail) return LEAD_INTAKE_STAGE.INQUIRY
  if (presetStage === LEAD_INTAKE_STAGE.COMPLETE && hasFullName && hasEmail && hasInquiry) return LEAD_INTAKE_STAGE.COMPLETE

  if (!hasFullName) return LEAD_INTAKE_STAGE.FULL_NAME
  if (!hasEmail) return LEAD_INTAKE_STAGE.EMAIL
  if (!hasInquiry) return LEAD_INTAKE_STAGE.INQUIRY
  return LEAD_INTAKE_STAGE.COMPLETE
}

const buildLeadIntakePrompt = ({
  stage = LEAD_INTAKE_STAGE.FULL_NAME,
  firstName = '',
} = {}) => {
  if (stage === LEAD_INTAKE_STAGE.FULL_NAME) {
    return 'Please enter your full name. Example: "My name is Richard Mike."'
  }
  if (stage === LEAD_INTAKE_STAGE.EMAIL) {
    return `${firstName ? `Thanks ${firstName}. ` : ''}Please drop your email address.`
  }
  if (stage === LEAD_INTAKE_STAGE.INQUIRY) {
    return 'How may we help you today? You can also type "agent" if you want a human agent.'
  }
  return ''
}

const getFirstName = (fullName = '') => (
  toTrimmedValue(fullName).split(/\s+/).filter(Boolean)[0] || ''
)

const normalizeIntakeFullName = (value = '') => {
  const normalized = toTrimmedValue(value).replace(/\s+/g, ' ')
  if (!normalized) return ''
  const introMatch = normalized.match(/^my name is\s+(.+)$/i)
  const candidate = toTrimmedValue(introMatch ? introMatch[1] : normalized)
  return candidate.replace(/[.]+$/, '').trim()
}

const getSupportLocalTimeParts = (referenceDate = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: SUPPORT_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(referenceDate)
  const weekdayShort = toTrimmedValue(parts.find((part) => part.type === 'weekday')?.value).toLowerCase()
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0)
  return {
    weekdayShort,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  }
}

export const isSupportAgentOnline = (referenceDate = new Date()) => {
  const { weekdayShort, hour, minute } = getSupportLocalTimeParts(referenceDate)
  const isWeekend = weekdayShort === 'sat' || weekdayShort === 'sun'
  const startHour = isWeekend ? 9 : 8
  const endHour = isWeekend ? 13 : 17
  const decimalHour = hour + (minute / 60)
  return decimalHour >= startHour && decimalHour < endHour
}

const normalizeAttachment = (attachment = {}, index = 0) => ({
  id: toTrimmedValue(attachment.id) || createId(`ATT${index}`),
  name: toTrimmedValue(attachment.name) || `attachment-${index + 1}`,
  type: toTrimmedValue(attachment.type) || 'application/octet-stream',
  size: Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : 0,
  cacheKey: toTrimmedValue(attachment.cacheKey),
  previewDataUrl: toTrimmedValue(attachment.previewDataUrl),
})

const normalizeMessage = (message = {}, index = 0) => ({
  id: toTrimmedValue(message.id) || createId(`MSG${index}`),
  sender: toTrimmedValue(message.sender) || SUPPORT_SENDER.SYSTEM,
  senderName: toTrimmedValue(message.senderName) || '',
  text: String(message.text || ''),
  createdAtIso: toTrimmedValue(message.createdAtIso) || nowIso(),
  deliveryStatus: toTrimmedValue(message.deliveryStatus) || SUPPORT_MESSAGE_STATUS.SENT,
  deliveryError: toTrimmedValue(message.deliveryError),
  retryCount: Number.isFinite(Number(message.retryCount)) ? Number(message.retryCount) : 0,
  readByClient: Boolean(message.readByClient),
  readByAdmin: Boolean(message.readByAdmin),
  isTyping: Boolean(message.isTyping),
  attachments: (Array.isArray(message.attachments) ? message.attachments : [])
    .map((attachment, attachmentIndex) => normalizeAttachment(attachment, attachmentIndex)),
})

const normalizeLead = (lead = {}, index = 0) => {
  const inferredNumber = parseLeadNumberFromAlias(lead.clientEmail)
  const normalizedLeadNumber = Number.isFinite(Number(lead.leadNumber))
    && Number(lead.leadNumber) > 0
    ? Math.floor(Number(lead.leadNumber))
    : (inferredNumber || index + 1)
  const normalizedClientEmail = toEmail(lead.clientEmail) || buildLeadAliasEmail(normalizedLeadNumber)
  const normalizedLabel = toTrimmedValue(lead.leadLabel) || `Lead ${normalizedLeadNumber}`
  const normalizedLocation = toTrimmedValue(lead.location)
    || [
      toTrimmedValue(lead.city),
      toTrimmedValue(lead.region),
      toTrimmedValue(lead.country),
    ].filter(Boolean).join(', ')
  const inferredCategory = String(lead.source || '').toLowerCase().includes('newsletter')
    ? LEAD_CATEGORY.NEWSLETTER_SUBSCRIBER
    : LEAD_CATEGORY.INQUIRY_FOLLOW_UP
  const normalizedCategories = normalizeLeadCategories(
    lead.leadCategories,
    lead.leadCategory,
    inferredCategory,
  )
  const normalizedCategory = normalizedCategories.includes(LEAD_CATEGORY.INQUIRY_FOLLOW_UP)
    ? LEAD_CATEGORY.INQUIRY_FOLLOW_UP
    : (normalizedCategories[0] || LEAD_CATEGORY.GENERAL)
  const inferredIntakeStage = (
    normalizedCategories.includes(LEAD_CATEGORY.INQUIRY_FOLLOW_UP)
      ? getLeadIntakeStage(lead)
      : LEAD_INTAKE_STAGE.COMPLETE
  )
  return {
    id: toTrimmedValue(lead.id) || createId(`LEAD${normalizedLeadNumber}`),
    leadNumber: normalizedLeadNumber,
    leadLabel: normalizedLabel,
    clientEmail: normalizedClientEmail,
    fullName: toTrimmedValue(lead.fullName),
    contactEmail: toEmail(lead.contactEmail || lead.email),
    organizationType: normalizeLeadOrganizationType(lead.organizationType),
    ipAddress: toTrimmedValue(lead.ipAddress),
    city: toTrimmedValue(lead.city),
    region: toTrimmedValue(lead.region),
    country: toTrimmedValue(lead.country),
    location: normalizedLocation,
    capturePage: toTrimmedValue(lead.capturePage),
    capturePath: toTrimmedValue(lead.capturePath),
    leadCategory: normalizedCategory,
    leadCategories: normalizedCategories,
    inquiryText: String(lead.inquiryText || ''),
    intakeStage: inferredIntakeStage,
    intakeComplete: inferredIntakeStage === LEAD_INTAKE_STAGE.COMPLETE,
    createdAtIso: toTrimmedValue(lead.createdAtIso) || nowIso(),
    updatedAtIso: toTrimmedValue(lead.updatedAtIso) || nowIso(),
    source: toTrimmedValue(lead.source) || 'support-chat',
    supportStatus: toTrimmedValue(lead.supportStatus || lead.status).toLowerCase(),
    newsletterStatus: toTrimmedValue(lead.newsletterStatus).toLowerCase(),
    assignedToUid: toTrimmedValue(lead.assignedToUid),
    leadNotes: toTrimmedValue(lead.leadNotes || lead.notes),
  }
}

const normalizeTicket = (ticket = {}, index = 0) => {
  const normalizedMessages = (Array.isArray(ticket.messages) ? ticket.messages : [])
    .map((message, messageIndex) => normalizeMessage(message, messageIndex))
  const latestMessage = normalizedMessages[normalizedMessages.length - 1]
  const normalizedLeadCategories = normalizeLeadCategories(ticket.leadCategories, ticket.leadCategory)
  const normalizedLeadCategory = normalizedLeadCategories.includes(LEAD_CATEGORY.INQUIRY_FOLLOW_UP)
    ? LEAD_CATEGORY.INQUIRY_FOLLOW_UP
    : (normalizedLeadCategories[0] || LEAD_CATEGORY.GENERAL)
  return {
    id: toTrimmedValue(ticket.id) || createId(`SUP${index}`),
    clientEmail: toEmail(ticket.clientEmail),
    clientName: toTrimmedValue(ticket.clientName) || 'Client User',
    businessName: toTrimmedValue(ticket.businessName),
    status: toTrimmedValue(ticket.status) || SUPPORT_TICKET_STATUS.OPEN,
    channel: toTrimmedValue(ticket.channel) || SUPPORT_CHANNEL.BOT,
    createdAtIso: toTrimmedValue(ticket.createdAtIso) || nowIso(),
    updatedAtIso: toTrimmedValue(ticket.updatedAtIso) || latestMessage?.createdAtIso || nowIso(),
    assignedAdminName: toTrimmedValue(ticket.assignedAdminName),
    assignedAdminEmail: toEmail(ticket.assignedAdminEmail),
    unreadByClient: Number.isFinite(Number(ticket.unreadByClient)) ? Number(ticket.unreadByClient) : 0,
    unreadByAdmin: Number.isFinite(Number(ticket.unreadByAdmin)) ? Number(ticket.unreadByAdmin) : 0,
    slaDueAtIso: toTrimmedValue(ticket.slaDueAtIso),
    resolvedAtIso: toTrimmedValue(ticket.resolvedAtIso),
    isLead: Boolean(ticket.isLead),
    leadId: toTrimmedValue(ticket.leadId),
    leadLabel: toTrimmedValue(ticket.leadLabel),
    leadFullName: toTrimmedValue(ticket.leadFullName),
    leadContactEmail: toEmail(ticket.leadContactEmail),
    leadOrganizationType: normalizeLeadOrganizationType(ticket.leadOrganizationType),
    leadCategory: normalizedLeadCategory,
    leadCategories: normalizedLeadCategories,
    leadInquiryText: String(ticket.leadInquiryText || ''),
    leadIntakeStage: normalizeLeadIntakeStage(ticket.leadIntakeStage) || LEAD_INTAKE_STAGE.COMPLETE,
    leadIpAddress: toTrimmedValue(ticket.leadIpAddress),
    leadLocation: toTrimmedValue(ticket.leadLocation),
    messages: normalizedMessages,
  }
}

const sortTickets = (tickets = []) => (
  [...tickets].sort((left, right) => (
    (Date.parse(right.updatedAtIso || '') || 0) - (Date.parse(left.updatedAtIso || '') || 0)
  ))
)

const sortLeads = (leads = []) => (
  [...leads].sort((left, right) => {
    const byUpdated = (Date.parse(right.updatedAtIso || '') || 0) - (Date.parse(left.updatedAtIso || '') || 0)
    if (byUpdated !== 0) return byUpdated
    return (Number(left.leadNumber) || 0) - (Number(right.leadNumber) || 0)
  })
)

const parseAdminDashboardLeadCollections = (payload = {}) => {
  const dashboard = payload?.dashboard && typeof payload.dashboard === 'object'
    ? payload.dashboard
    : {}
  return {
    supportLeads: Array.isArray(dashboard.supportLeads) ? dashboard.supportLeads : [],
    newsletters: Array.isArray(dashboard.newsletters) ? dashboard.newsletters : [],
  }
}

const mapAdminSupportLeadToLocalLead = (entry = {}, index = 0) => {
  const normalizedEmail = toEmail(entry?.email)
  const fallbackLabel = toTrimmedValue(entry?.companyName)
    || toTrimmedValue(entry?.fullName)
    || normalizedEmail
    || `Lead ${index + 1}`
  return normalizeLead({
    id: toTrimmedValue(entry?.leadId) || createId(`LEADADM${index + 1}`),
    leadNumber: index + 1,
    leadLabel: fallbackLabel,
    clientEmail: normalizedEmail || buildLeadAliasEmail(index + 1),
    fullName: toTrimmedValue(entry?.fullName),
    contactEmail: normalizedEmail,
    leadCategory: LEAD_CATEGORY.INQUIRY_FOLLOW_UP,
    leadCategories: [LEAD_CATEGORY.INQUIRY_FOLLOW_UP],
    inquiryText: toTrimmedValue(entry?.interest) || toTrimmedValue(entry?.notes),
    source: toTrimmedValue(entry?.source) || 'support-form',
    createdAtIso: toTrimmedValue(entry?.createdAt),
    updatedAtIso: toTrimmedValue(entry?.updatedAt) || toTrimmedValue(entry?.createdAt),
    supportStatus: toTrimmedValue(entry?.status).toLowerCase(),
    assignedToUid: toTrimmedValue(entry?.assignedToUid),
    leadNotes: toTrimmedValue(entry?.notes),
  }, index)
}

const mapAdminNewsletterToLocalLead = (entry = {}, index = 0) => {
  const normalizedEmail = toEmail(entry?.email)
  const normalizedFullName = toTrimmedValue(entry?.fullName)
  const fallbackLabel = normalizedFullName || normalizedEmail || `Newsletter ${index + 1}`
  return normalizeLead({
    id: `NEWS-${normalizedEmail || index + 1}`,
    leadNumber: index + 1,
    leadLabel: fallbackLabel,
    clientEmail: normalizedEmail || buildLeadAliasEmail(index + 1),
    fullName: normalizedFullName,
    contactEmail: normalizedEmail,
    leadCategory: LEAD_CATEGORY.NEWSLETTER_SUBSCRIBER,
    leadCategories: [LEAD_CATEGORY.NEWSLETTER_SUBSCRIBER],
    inquiryText: '',
    source: toTrimmedValue(entry?.source) || 'newsletter-subscription',
    createdAtIso: toTrimmedValue(entry?.subscribedAt),
    updatedAtIso: toTrimmedValue(entry?.lastEngagedAt) || toTrimmedValue(entry?.subscribedAt),
    newsletterStatus: toTrimmedValue(entry?.status).toLowerCase(),
  }, index)
}

const mapAdminDashboardCollectionsToLocalLeads = ({
  supportLeads = [],
  newsletters = [],
} = {}) => {
  const combined = [
    ...(Array.isArray(supportLeads) ? supportLeads : []).map((entry, index) => mapAdminSupportLeadToLocalLead(entry, index)),
    ...(Array.isArray(newsletters) ? newsletters : []).map((entry, index) => mapAdminNewsletterToLocalLead(entry, index)),
  ]
  const byKey = new Map()
  combined.forEach((lead, index) => {
    const normalizedLead = normalizeLead(lead, index)
    const normalizedEmail = toEmail(normalizedLead.contactEmail || normalizedLead.clientEmail)
    const categoryKey = normalizeLeadCategories(normalizedLead.leadCategories, normalizedLead.leadCategory).sort().join('|')
    const key = `${toTrimmedValue(normalizedLead.id) || normalizedEmail}::${normalizedEmail}::${categoryKey}`
    const existing = byKey.get(key)
    const nextUpdatedAt = Date.parse(normalizedLead.updatedAtIso || '') || 0
    const existingUpdatedAt = Date.parse(existing?.updatedAtIso || '') || 0
    if (!existing || nextUpdatedAt >= existingUpdatedAt) {
      byKey.set(key, normalizedLead)
    }
  })
  return sortLeads(Array.from(byKey.values()))
}

const buildAdminDashboardCollectionsFromLocalLeads = (leads = []) => {
  const supportLeads = []
  const newslettersByEmail = new Map()
  const supportLeadKeySet = new Set()

  ;(Array.isArray(leads) ? leads : []).forEach((lead, index) => {
    const normalizedLead = normalizeLead(lead, index)
    const normalizedCategories = normalizeLeadCategories(
      normalizedLead.leadCategories,
      normalizedLead.leadCategory,
    )
    const hasNewsletterCategory = normalizedCategories.includes(LEAD_CATEGORY.NEWSLETTER_SUBSCRIBER)
    const hasInquiryCategory = normalizedCategories.includes(LEAD_CATEGORY.INQUIRY_FOLLOW_UP) || !hasNewsletterCategory
    const normalizedEmail = toEmail(normalizedLead.contactEmail || normalizedLead.clientEmail)
    const createdAtIso = toTrimmedValue(normalizedLead.createdAtIso) || nowIso()
    const updatedAtIso = toTrimmedValue(normalizedLead.updatedAtIso) || createdAtIso

    if (hasInquiryCategory) {
      const leadId = toTrimmedValue(normalizedLead.id) || createId(`LEADSYNC${index + 1}`)
      const supportKey = `${leadId}:${normalizedEmail}`
      const normalizedSupportStatus = SUPPORT_LEAD_STATUS_VALUES.has(normalizedLead.supportStatus)
        ? normalizedLead.supportStatus
        : 'new'
      if (!supportLeadKeySet.has(supportKey)) {
        supportLeadKeySet.add(supportKey)
        supportLeads.push({
          leadId,
          fullName: toTrimmedValue(normalizedLead.fullName),
          email: normalizedEmail,
          companyName: toTrimmedValue(normalizedLead.leadLabel),
          phone: '',
          source: toTrimmedValue(normalizedLead.source) || 'support-form',
          status: normalizedSupportStatus,
          interest: toTrimmedValue(normalizedLead.inquiryText),
          assignedToUid: toTrimmedValue(normalizedLead.assignedToUid),
          notes: toTrimmedValue(normalizedLead.leadNotes),
          createdAt: createdAtIso,
          updatedAt: updatedAtIso,
        })
      }
    }

    if (hasNewsletterCategory && normalizedEmail) {
      const normalizedNewsletterStatus = NEWSLETTER_STATUS_VALUES.has(normalizedLead.newsletterStatus)
        ? normalizedLead.newsletterStatus
        : 'subscribed'
      const candidateNewsletter = {
        email: normalizedEmail,
        fullName: toTrimmedValue(normalizedLead.fullName),
        status: normalizedNewsletterStatus,
        source: toTrimmedValue(normalizedLead.source) || 'newsletter-subscription',
        tags: ['newsletter'],
        subscribedAt: createdAtIso,
        lastEngagedAt: updatedAtIso,
      }
      const existing = newslettersByEmail.get(normalizedEmail)
      const existingUpdatedAt = Date.parse(existing?.lastEngagedAt || '') || 0
      const nextUpdatedAt = Date.parse(candidateNewsletter.lastEngagedAt || '') || 0
      if (!existing || nextUpdatedAt >= existingUpdatedAt) {
        newslettersByEmail.set(normalizedEmail, candidateNewsletter)
      }
    }
  })

  return {
    supportLeads: supportLeads.sort((left, right) => (
      String(left.leadId || '').localeCompare(String(right.leadId || ''))
    )),
    newsletters: Array.from(newslettersByEmail.values()).sort((left, right) => (
      String(left.email || '').localeCompare(String(right.email || ''))
    )),
  }
}

const serializeAdminDashboardLeadCollections = (payload = {}) => {
  const normalized = {
    supportLeads: Array.isArray(payload?.supportLeads) ? payload.supportLeads : [],
    newsletters: Array.isArray(payload?.newsletters) ? payload.newsletters : [],
  }
  return JSON.stringify(normalized)
}

const patchAdminDashboardLeadCollections = async (payload = {}) => (
  requestJson('/api/users/me/admin-dashboard', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      supportLeads: Array.isArray(payload?.supportLeads) ? payload.supportLeads : [],
      newsletters: Array.isArray(payload?.newsletters) ? payload.newsletters : [],
    }),
  })
)

const syncAdminDashboardLeadCollections = async ({
  force = false,
  localLeads = supportState.leads,
} = {}) => {
  if (!isBackendSupportAvailable() || !isBackendAdminActor()) {
    return { ok: false, reason: 'not-admin-session' }
  }
  const payload = buildAdminDashboardCollectionsFromLocalLeads(localLeads)
  const signature = serializeAdminDashboardLeadCollections(payload)
  if (!force && signature === backendAdminDashboardLeadSyncSignature) {
    return { ok: true, skipped: true }
  }
  const response = await patchAdminDashboardLeadCollections(payload)
  if (!response.ok) {
    return { ok: false, message: response.message || 'Unable to sync admin dashboard leads.' }
  }
  backendAdminDashboardLeadSyncSignature = signature
  return { ok: true }
}

const scheduleAdminDashboardLeadCollectionsSync = ({
  force = false,
  delayMs = ADMIN_DASHBOARD_LEAD_SYNC_DELAY_MS,
} = {}) => {
  if (!isBackendSupportAvailable() || !isBackendAdminActor()) return
  if (typeof window === 'undefined') {
    void syncAdminDashboardLeadCollections({ force })
    return
  }
  if (backendAdminDashboardLeadSyncTimer) {
    window.clearTimeout(backendAdminDashboardLeadSyncTimer)
    backendAdminDashboardLeadSyncTimer = null
  }
  backendAdminDashboardLeadSyncTimer = window.setTimeout(() => {
    backendAdminDashboardLeadSyncTimer = null
    void syncAdminDashboardLeadCollections({ force })
  }, Math.max(0, Number(delayMs) || 0))
}

const readSupportTickets = () => {
  if (typeof localStorage === 'undefined') return []
  const parsed = safeParseJson(localStorage.getItem(SUPPORT_TICKETS_STORAGE_KEY), [])
  if (!Array.isArray(parsed)) return []
  return sortTickets(parsed.map((ticket, index) => normalizeTicket(ticket, index)))
}

const readSupportLeads = () => {
  if (typeof localStorage === 'undefined') return []
  const parsed = safeParseJson(localStorage.getItem(SUPPORT_LEADS_STORAGE_KEY), [])
  if (!Array.isArray(parsed)) return []
  return sortLeads(parsed.map((lead, index) => normalizeLead(lead, index)))
}

const readLeadSequence = () => {
  if (typeof localStorage === 'undefined') return 0
  const parsed = Number(localStorage.getItem(SUPPORT_LEAD_SEQUENCE_STORAGE_KEY) || 0)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

const persistLeadSequence = (value = 0) => {
  if (typeof localStorage === 'undefined') return
  const numeric = Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0
  localStorage.setItem(SUPPORT_LEAD_SEQUENCE_STORAGE_KEY, String(numeric))
}

const updateLeadSequenceFromLeads = (leads = []) => {
  const maxLeadNumber = leads.reduce((highest, lead) => (
    Math.max(highest, Number(lead.leadNumber) || 0)
  ), 0)
  const nextSequence = Math.max(readLeadSequence(), maxLeadNumber)
  persistLeadSequence(nextSequence)
  return nextSequence
}

const nextLeadSequence = () => {
  const current = readLeadSequence()
  const next = Math.max(1, current + 1)
  persistLeadSequence(next)
  return next
}

const persistSupportTickets = (tickets = []) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(SUPPORT_TICKETS_STORAGE_KEY, JSON.stringify(sortTickets(tickets)))
}

const persistSupportLeads = (leads = []) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(SUPPORT_LEADS_STORAGE_KEY, JSON.stringify(sortLeads(leads)))
  updateLeadSequenceFromLeads(leads)
}

const toSnapshot = () => ({
  tickets: supportState.tickets.map((ticket) => ({
    ...ticket,
    messages: ticket.messages.map((message) => ({
      ...message,
      attachments: message.attachments.map((attachment) => ({ ...attachment })),
    })),
  })),
  leads: supportState.leads.map((lead) => ({ ...lead })),
})

const emitSupportState = () => {
  const snapshot = toSnapshot()
  listenerSet.forEach((listener) => {
    try {
      listener(snapshot)
    } catch {
      // Ignore subscriber errors to avoid breaking other listeners.
    }
  })
}

const replaceTicket = (tickets = [], nextTicket = null) => {
  if (!nextTicket?.id) return sortTickets(tickets)
  const exists = tickets.some((ticket) => ticket.id === nextTicket.id)
  if (!exists) return sortTickets([...tickets, nextTicket])
  return sortTickets(tickets.map((ticket) => (ticket.id === nextTicket.id ? nextTicket : ticket)))
}

const replaceLead = (leads = [], nextLead = null) => {
  if (!nextLead?.id) return sortLeads(leads)
  const exists = leads.some((lead) => lead.id === nextLead.id)
  if (!exists) return sortLeads([...leads, nextLead])
  return sortLeads(leads.map((lead) => (lead.id === nextLead.id ? nextLead : lead)))
}

const updateSupportTickets = (updater) => {
  const currentTickets = supportState.tickets
  const updatedTickets = sortTickets(typeof updater === 'function' ? updater(currentTickets) : currentTickets)
  supportState = {
    ...supportState,
    tickets: updatedTickets,
  }
  persistSupportTickets(updatedTickets)
  emitSupportState()
  return updatedTickets
}

const updateSupportLeads = (updater) => {
  const currentLeads = supportState.leads
  const updatedLeads = sortLeads(typeof updater === 'function' ? updater(currentLeads) : currentLeads)
  supportState = {
    ...supportState,
    leads: updatedLeads,
  }
  persistSupportLeads(updatedLeads)
  emitSupportState()
  if (isBackendAdminActor()) {
    scheduleAdminDashboardLeadCollectionsSync()
  }
  return updatedLeads
}

const bindStorageListener = () => {
  if (storageListenerBound || typeof window === 'undefined') return
  storageListenerBound = true
  window.addEventListener('storage', (event) => {
    if (
      event.key !== SUPPORT_TICKETS_STORAGE_KEY
      && event.key !== SUPPORT_LEADS_STORAGE_KEY
      && event.key !== SUPPORT_LEAD_SEQUENCE_STORAGE_KEY
      && event.key !== SUPPORT_ANON_LEAD_SESSION_STORAGE_KEY
    ) return
    supportState = {
      tickets: readSupportTickets(),
      leads: readSupportLeads(),
    }
    emitSupportState()
  })
}

const createImmediateMessage = ({
  sender = SUPPORT_SENDER.SYSTEM,
  senderName = '',
  text = '',
  attachments = [],
  readByClient = false,
  readByAdmin = false,
}) => ({
  id: createId('MSG'),
  sender,
  senderName,
  text: String(text || ''),
  createdAtIso: nowIso(),
  deliveryStatus: SUPPORT_MESSAGE_STATUS.SENT,
  deliveryError: '',
  retryCount: 0,
  readByClient,
  readByAdmin,
  attachments: (Array.isArray(attachments) ? attachments : []).map((attachment, index) => normalizeAttachment(attachment, index)),
})

const createPendingMessage = ({
  sender = SUPPORT_SENDER.CLIENT,
  senderName = '',
  text = '',
  attachments = [],
  retryCount = 0,
}) => ({
  id: createId('MSG'),
  sender,
  senderName,
  text: String(text || ''),
  createdAtIso: nowIso(),
  deliveryStatus: SUPPORT_MESSAGE_STATUS.SENDING,
  deliveryError: '',
  retryCount,
  readByClient: sender === SUPPORT_SENDER.CLIENT,
  readByAdmin: sender === SUPPORT_SENDER.AGENT,
  attachments: (Array.isArray(attachments) ? attachments : []).map((attachment, index) => normalizeAttachment(attachment, index)),
})

const createTypingMessage = ({
  id = '',
  sender = SUPPORT_SENDER.BOT,
  senderName = 'Kiamina Support Bot',
} = {}) => ({
  id: toTrimmedValue(id) || createId('MSGTYPING'),
  sender,
  senderName,
  text: '',
  createdAtIso: nowIso(),
  deliveryStatus: SUPPORT_MESSAGE_STATUS.TYPING,
  deliveryError: '',
  retryCount: 0,
  readByClient: false,
  readByAdmin: false,
  isTyping: true,
  attachments: [],
})

const getTicketById = (tickets = [], ticketId = '') => (
  tickets.find((ticket) => ticket.id === ticketId) || null
)

const getLeadById = (leads = [], leadId = '') => (
  leads.find((lead) => lead.id === leadId) || null
)

const getLeadByClientEmail = (leads = [], clientEmail = '') => {
  const normalizedEmail = toEmail(clientEmail)
  if (!normalizedEmail) return null
  return leads.find((lead) => lead.clientEmail === normalizedEmail) || null
}

const clearAnonymousLeadSessionByClientEmail = (clientEmail = '') => {
  if (typeof localStorage === 'undefined') return
  const normalizedClientEmail = toEmail(clientEmail)
  if (!normalizedClientEmail) return
  const savedSession = safeParseJson(localStorage.getItem(SUPPORT_ANON_LEAD_SESSION_STORAGE_KEY), null)
  const savedClientEmail = toEmail(savedSession?.clientEmail)
  if (!savedClientEmail || savedClientEmail !== normalizedClientEmail) return
  try {
    localStorage.removeItem(SUPPORT_ANON_LEAD_SESSION_STORAGE_KEY)
  } catch {
    // Ignore localStorage removal failures.
  }
}

const persistAnonymousLeadSession = ({
  leadId = '',
  leadLabel = '',
  clientEmail = '',
  anonymousSessionId = '',
  backendTicketId = '',
} = {}) => {
  if (typeof localStorage === 'undefined') return
  const normalizedClientEmail = toEmail(clientEmail)
  const normalizedAnonymousSessionId = toTrimmedValue(anonymousSessionId)
  if (!normalizedClientEmail && !normalizedAnonymousSessionId) return
  const existingSession = safeParseJson(localStorage.getItem(SUPPORT_ANON_LEAD_SESSION_STORAGE_KEY), {})
  try {
    localStorage.setItem(SUPPORT_ANON_LEAD_SESSION_STORAGE_KEY, JSON.stringify({
      ...(existingSession && typeof existingSession === 'object' ? existingSession : {}),
      leadId: toTrimmedValue(leadId),
      leadLabel: toTrimmedValue(leadLabel),
      clientEmail: normalizedClientEmail || toEmail(existingSession?.clientEmail),
      anonymousSessionId: normalizedAnonymousSessionId || toTrimmedValue(existingSession?.anonymousSessionId),
      backendTicketId: toTrimmedValue(backendTicketId) || toTrimmedValue(existingSession?.backendTicketId),
      createdAtIso: nowIso(),
    }))
  } catch {
    // Ignore session persistence failures.
  }
}

const buildAnonymousSupportSessionId = () => (
  `${ANONYMOUS_SUPPORT_SESSION_PREFIX}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
)

const getAnonymousSupportSessionId = ({
  createIfMissing = true,
  clientEmail = '',
  leadId = '',
  leadLabel = '',
  backendTicketId = '',
} = {}) => {
  if (typeof localStorage === 'undefined') return ''
  const savedSession = safeParseJson(localStorage.getItem(SUPPORT_ANON_LEAD_SESSION_STORAGE_KEY), null)
  const existingSessionId = toTrimmedValue(savedSession?.anonymousSessionId)
  if (existingSessionId) {
    if (clientEmail || leadId || leadLabel || backendTicketId) {
      persistAnonymousLeadSession({
        leadId: leadId || savedSession?.leadId,
        leadLabel: leadLabel || savedSession?.leadLabel,
        clientEmail: clientEmail || savedSession?.clientEmail,
        anonymousSessionId: existingSessionId,
        backendTicketId: backendTicketId || savedSession?.backendTicketId,
      })
    }
    return existingSessionId
  }
  if (!createIfMissing) return ''
  const generatedSessionId = buildAnonymousSupportSessionId()
  persistAnonymousLeadSession({
    leadId: leadId || savedSession?.leadId,
    leadLabel: leadLabel || savedSession?.leadLabel,
    clientEmail: clientEmail || savedSession?.clientEmail,
    anonymousSessionId: generatedSessionId,
    backendTicketId: backendTicketId || savedSession?.backendTicketId,
  })
  return generatedSessionId
}

const getLeadByContactEmail = (leads = [], contactEmail = '') => {
  const normalizedContactEmail = toEmail(contactEmail)
  if (!normalizedContactEmail) return null
  return leads.find((lead) => (
    toEmail(lead.contactEmail) === normalizedContactEmail
    || toEmail(lead.clientEmail) === normalizedContactEmail
  )) || null
}

const getLatestClientTicket = (tickets = [], clientEmail = '') => (
  sortTickets(tickets.filter((ticket) => ticket.clientEmail === clientEmail))[0] || null
)

const getActiveClientTicket = (tickets = [], clientEmail = '') => {
  const scoped = sortTickets(tickets.filter((ticket) => ticket.clientEmail === clientEmail))
  const active = scoped.find((ticket) => ticket.status !== SUPPORT_TICKET_STATUS.RESOLVED)
  return active || scoped[0] || null
}

const updateTicketWithMessage = ({
  ticket,
  message,
  incrementClientUnread = false,
  incrementAdminUnread = false,
}) => {
  if (!ticket || !message) return ticket
  return {
    ...ticket,
    messages: [...ticket.messages, message],
    updatedAtIso: message.createdAtIso || nowIso(),
    unreadByClient: ticket.unreadByClient + (incrementClientUnread ? 1 : 0),
    unreadByAdmin: ticket.unreadByAdmin + (incrementAdminUnread ? 1 : 0),
  }
}

const hasRecentOfflineNotice = (ticket = null) => {
  if (!ticket || !Array.isArray(ticket.messages)) return false
  const latestNotice = [...ticket.messages]
    .reverse()
    .find((message) => (
      message?.sender === SUPPORT_SENDER.SYSTEM
      && toTrimmedValue(message?.text) === SUPPORT_AGENT_OFFLINE_TEXT
    ))
  if (!latestNotice) return false
  const noticeMs = Date.parse(latestNotice.createdAtIso || '')
  if (!Number.isFinite(noticeMs)) return true
  const hoursSinceNotice = (Date.now() - noticeMs) / (60 * 60 * 1000)
  return hoursSinceNotice <= 6
}

const appendAgentOfflineNoticeIfNeeded = (ticket = null) => {
  if (!ticket) return ticket
  if (isSupportAgentOnline()) return ticket
  if (hasRecentOfflineNotice(ticket)) return ticket
  const offlineMessage = createImmediateMessage({
    sender: SUPPORT_SENDER.SYSTEM,
    senderName: SUPPORT_COMPANY_NAME,
    text: SUPPORT_AGENT_OFFLINE_TEXT,
  })
  return updateTicketWithMessage({
    ticket,
    message: offlineMessage,
    incrementClientUnread: true,
  })
}

const appendLeadIntakePromptIfNeeded = ({
  ticket = null,
  stage = LEAD_INTAKE_STAGE.COMPLETE,
  firstName = '',
} = {}) => {
  if (!ticket || stage === LEAD_INTAKE_STAGE.COMPLETE) return ticket
  const promptText = buildLeadIntakePrompt({ stage, firstName })
  if (!promptText) return ticket
  const alreadyPresent = Array.isArray(ticket.messages) && ticket.messages.some((message) => (
    message?.sender === SUPPORT_SENDER.BOT
    && toTrimmedValue(message?.text) === promptText
  ))
  if (alreadyPresent) return ticket
  const promptMessage = createImmediateMessage({
    sender: SUPPORT_SENDER.BOT,
    senderName: 'Kiamina Support Bot',
    text: promptText,
  })
  return updateTicketWithMessage({
    ticket,
    message: promptMessage,
    incrementClientUnread: true,
  })
}

const applyLeadToTicket = (ticket = {}, lead = null) => {
  if (!ticket || !lead) return ticket
  return normalizeTicket({
    ...ticket,
    isLead: true,
    leadId: lead.id,
    leadLabel: lead.leadLabel,
    leadFullName: lead.fullName,
    leadContactEmail: lead.contactEmail,
    leadOrganizationType: lead.organizationType,
    leadCategory: lead.leadCategory,
    leadCategories: lead.leadCategories,
    leadInquiryText: lead.inquiryText,
    leadIntakeStage: lead.intakeStage,
    leadIpAddress: lead.ipAddress,
    leadLocation: lead.location,
    clientName: lead.leadLabel || ticket.clientName || 'Lead',
  })
}

const ensureClientTicket = ({
  tickets = [],
  leads = [],
  clientEmail = '',
  clientName = 'Client User',
  businessName = '',
  forceNew = false,
}) => {
  const normalizedEmail = toEmail(clientEmail)
  if (!normalizedEmail) return { tickets, ticket: null }
  const lead = getLeadByClientEmail(leads, normalizedEmail)

  const existingTicket = !forceNew ? getLatestClientTicket(tickets, normalizedEmail) : null
  if (existingTicket) {
    const leadCategories = normalizeLeadCategories(
      lead?.leadCategories,
      lead?.leadCategory,
      existingTicket?.leadCategories,
      existingTicket?.leadCategory,
    )
    const leadCategory = leadCategories.includes(LEAD_CATEGORY.INQUIRY_FOLLOW_UP)
      ? LEAD_CATEGORY.INQUIRY_FOLLOW_UP
      : (leadCategories[0] || LEAD_CATEGORY.GENERAL)
    const hasInquiryCategory = leadCategories.includes(LEAD_CATEGORY.INQUIRY_FOLLOW_UP)
    const hasClientMessage = Array.isArray(existingTicket.messages) && existingTicket.messages.some((message) => (
      message?.sender === SUPPORT_SENDER.CLIENT && toTrimmedValue(message?.text)
    ))
    let leadIntakeStage = (
      normalizeLeadIntakeStage(existingTicket.leadIntakeStage)
      || normalizeLeadIntakeStage(lead?.intakeStage)
      || LEAD_INTAKE_STAGE.COMPLETE
    )
    if (hasInquiryCategory && !hasClientMessage) {
      leadIntakeStage = LEAD_INTAKE_STAGE.FULL_NAME
    }

    const refreshed = {
      ...existingTicket,
      clientName: lead?.leadLabel || toTrimmedValue(clientName) || existingTicket.clientName || 'Client User',
      businessName: toTrimmedValue(businessName) || existingTicket.businessName || '',
      isLead: Boolean(lead) || Boolean(existingTicket.isLead),
      leadId: lead?.id || existingTicket.leadId || '',
      leadLabel: lead?.leadLabel || existingTicket.leadLabel || '',
      leadFullName: lead?.fullName || existingTicket.leadFullName || '',
      leadContactEmail: lead?.contactEmail || existingTicket.leadContactEmail || '',
      leadOrganizationType: lead?.organizationType || existingTicket.leadOrganizationType || '',
      leadCategory,
      leadCategories,
      leadInquiryText: lead?.inquiryText || existingTicket.leadInquiryText || '',
      leadIntakeStage,
      leadIpAddress: lead?.ipAddress || existingTicket.leadIpAddress || '',
      leadLocation: lead?.location || existingTicket.leadLocation || '',
    }
    const withIntakePrompt = appendLeadIntakePromptIfNeeded({
      ticket: refreshed,
      stage: hasInquiryCategory ? leadIntakeStage : LEAD_INTAKE_STAGE.COMPLETE,
      firstName: getFirstName(lead?.fullName || refreshed.leadFullName),
    })
    const withOfflineNotice = appendAgentOfflineNoticeIfNeeded(withIntakePrompt)
    return {
      tickets: replaceTicket(tickets, withOfflineNotice),
      ticket: withOfflineNotice,
    }
  }

  const leadCategories = lead
    ? normalizeLeadCategories(lead?.leadCategories, lead?.leadCategory, LEAD_CATEGORY.INQUIRY_FOLLOW_UP)
    : []
  const hasInquiryCategory = leadCategories.includes(LEAD_CATEGORY.INQUIRY_FOLLOW_UP)
  const leadCategory = hasInquiryCategory
    ? LEAD_CATEGORY.INQUIRY_FOLLOW_UP
    : (leadCategories[0] || LEAD_CATEGORY.GENERAL)
  const leadIntakeStage = (lead && hasInquiryCategory)
    ? LEAD_INTAKE_STAGE.FULL_NAME
    : LEAD_INTAKE_STAGE.COMPLETE
  const leadIntakePrompt = (lead && hasInquiryCategory)
    ? buildLeadIntakePrompt({ stage: leadIntakeStage, firstName: getFirstName(lead?.fullName) })
    : ''
  const greeting = createImmediateMessage({
    sender: SUPPORT_SENDER.BOT,
    senderName: 'Kiamina Support Bot',
    text: BOT_WELCOME_TEXT,
    readByClient: true,
    readByAdmin: true,
  })
  const intakePromptMessage = leadIntakePrompt
    ? createImmediateMessage({
        sender: SUPPORT_SENDER.BOT,
        senderName: 'Kiamina Support Bot',
        text: leadIntakePrompt,
        readByClient: true,
        readByAdmin: true,
      })
    : null
  const createdAtIso = nowIso()
  const nextTicket = normalizeTicket({
    id: createId('SUP'),
    clientEmail: normalizedEmail,
    clientName: lead?.leadLabel || toTrimmedValue(clientName) || 'Client User',
    businessName: toTrimmedValue(businessName),
    status: SUPPORT_TICKET_STATUS.OPEN,
    channel: SUPPORT_CHANNEL.BOT,
    createdAtIso,
    updatedAtIso: createdAtIso,
    unreadByClient: 0,
    unreadByAdmin: 0,
    slaDueAtIso: '',
    resolvedAtIso: '',
    isLead: Boolean(lead),
    leadId: lead?.id || '',
    leadLabel: lead?.leadLabel || '',
    leadFullName: lead?.fullName || '',
    leadContactEmail: lead?.contactEmail || '',
    leadOrganizationType: lead?.organizationType || '',
    leadCategory,
    leadCategories,
    leadInquiryText: lead?.inquiryText || '',
    leadIntakeStage,
    leadIpAddress: lead?.ipAddress || '',
    leadLocation: lead?.location || '',
    messages: intakePromptMessage ? [greeting, intakePromptMessage] : [greeting],
  })
  const withOfflineNotice = appendAgentOfflineNoticeIfNeeded(nextTicket)
  return {
    tickets: replaceTicket(tickets, withOfflineNotice),
    ticket: withOfflineNotice,
  }
}

const shouldMessageDeliveryFail = ({
  sender = SUPPORT_SENDER.CLIENT,
  retryCount = 0,
  text = '',
}) => {
  if (!(sender === SUPPORT_SENDER.CLIENT || sender === SUPPORT_SENDER.AGENT)) return false
  if (/^\/fail\b/i.test(String(text || '').trim()) && retryCount === 0) return true
  const probability = retryCount > 0 ? MESSAGE_FAIL_PROBABILITY * 0.25 : MESSAGE_FAIL_PROBABILITY
  return Math.random() < probability
}

const queueMessageDelivery = ({
  ticketId = '',
  messageId = '',
  sender = SUPPORT_SENDER.CLIENT,
  retryCount = 0,
  text = '',
  onSent,
}) => {
  const minDelay = 320
  const maxDelay = 980
  const delayMs = minDelay + Math.floor(Math.random() * (maxDelay - minDelay))
  setTimeout(() => {
    const failed = shouldMessageDeliveryFail({ sender, retryCount, text })
    let shouldRunOnSent = false
    updateSupportTickets((tickets) => {
      const ticket = getTicketById(tickets, ticketId)
      if (!ticket) return tickets
      const targetMessage = ticket.messages.find((message) => message.id === messageId)
      if (!targetMessage) return tickets
      if (targetMessage.deliveryStatus !== SUPPORT_MESSAGE_STATUS.SENDING) return tickets

      const nextMessage = {
        ...targetMessage,
        deliveryStatus: failed ? SUPPORT_MESSAGE_STATUS.FAILED : SUPPORT_MESSAGE_STATUS.SENT,
        deliveryError: failed ? 'Delivery failed. Retry this message.' : '',
      }
      shouldRunOnSent = !failed

      const nextMessages = ticket.messages.map((message) => (message.id === messageId ? nextMessage : message))
      const nextTicket = {
        ...ticket,
        messages: nextMessages,
        updatedAtIso: nowIso(),
        unreadByClient: ticket.unreadByClient + (!failed && (sender === SUPPORT_SENDER.AGENT || sender === SUPPORT_SENDER.BOT || sender === SUPPORT_SENDER.SYSTEM) ? 1 : 0),
        unreadByAdmin: ticket.unreadByAdmin + (!failed && sender === SUPPORT_SENDER.CLIENT ? 1 : 0),
      }
      return replaceTicket(tickets, nextTicket)
    })
    if (shouldRunOnSent && typeof onSent === 'function') onSent()
  }, delayMs)
}

const queueBotReplyDisplay = ({
  ticketId = '',
  replyText = '',
  replyMessage = null,
} = {}) => {
  const normalizedTicketId = toTrimmedValue(ticketId)
  const normalizedReplyText = String(replyText || replyMessage?.text || '').trim()
  if (!normalizedTicketId || !normalizedReplyText) return

  const typingMessageId = `typing-${normalizedTicketId}`
  updateSupportTickets((tickets) => {
    const ticket = getTicketById(tickets, normalizedTicketId)
    if (!ticket) return tickets
    if (ticket.status === SUPPORT_TICKET_STATUS.RESOLVED) return tickets
    if (ticket.channel !== SUPPORT_CHANNEL.BOT) return tickets
    if (ticket.messages.some((message) => message.id === typingMessageId || message.isTyping)) {
      return tickets
    }
    const typingMessage = createTypingMessage({ id: typingMessageId })
    return replaceTicket(tickets, updateTicketWithMessage({
      ticket,
      message: typingMessage,
      incrementClientUnread: false,
    }))
  })

  const baseDelayMs = 1200
  const variableDelayMs = Math.min(2400, Math.max(700, normalizedReplyText.length * 18))
  const delayMs = baseDelayMs + Math.floor(Math.random() * 500) + variableDelayMs

  setTimeout(() => {
    updateSupportTickets((tickets) => {
      const ticket = getTicketById(tickets, normalizedTicketId)
      if (!ticket) return tickets
      if (ticket.status === SUPPORT_TICKET_STATUS.RESOLVED) return tickets
      if (ticket.channel !== SUPPORT_CHANNEL.BOT) return tickets

      const withoutTyping = ticket.messages.filter((message) => message.id !== typingMessageId && !message.isTyping)
      const nextBotMessage = normalizeMessage(replyMessage || createImmediateMessage({
        sender: SUPPORT_SENDER.BOT,
        senderName: 'Kiamina Support Bot',
        text: normalizedReplyText,
      }))
      const mergedMessages = withoutTyping.some((message) => message.id === nextBotMessage.id)
        ? withoutTyping
        : [...withoutTyping, nextBotMessage]
      return replaceTicket(tickets, normalizeTicket({
        ...ticket,
        messages: mergedMessages.sort((left, right) => (
          (Date.parse(left.createdAtIso || '') || 0) - (Date.parse(right.createdAtIso || '') || 0)
        )),
        updatedAtIso: nextBotMessage.createdAtIso || nowIso(),
        unreadByClient: Number(ticket.unreadByClient || 0) + 1,
      }))
    })
  }, delayMs)
}

const appendBotReply = ({ ticketId = '', promptText = '' }) => {
  queueBotReplyDisplay({
    ticketId,
    replyText: buildSupportBotReply(promptText),
  })
}

const shouldRequestAgent = (text = '') => AGENT_REQUEST_PATTERN.test(String(text || '').trim())

const findMessage = (ticket = null, messageId = '') => (
  ticket?.messages?.find((message) => message.id === messageId) || null
)

export const buildSupportBotReply = (inputText = '') => {
  const text = String(inputText || '').toLowerCase()
  if (text.includes('upload') || text.includes('document') || text.includes('file')) {
    return 'Document upload guide: open Expenses, Sales, or Bank Statements, choose the right folder, upload the file, complete the required class or metadata, then submit for review.'
  }
  if (text.includes('expense')) {
    return 'Expenses guide: open Expenses, upload into the correct folder, complete the class and supporting details, then track the review outcome from the folder view and upload history.'
  }
  if (text.includes('sales') || text.includes('invoice') || text.includes('revenue')) {
    return 'Sales guide: open Sales, upload the document, complete the class and invoice details, then monitor the review status from the workspace.'
  }
  if (text.includes('bank')) {
    return 'Bank statement guide: open Bank Statements, upload the statement, set the correct period details, then monitor status updates from the workspace.'
  }
  if (text.includes('setting') || text.includes('profile') || text.includes('account')) {
    return 'Settings guide: update your profile, business details, tax information, verification records, notification preferences, and account security from the Settings page.'
  }
  if (text.includes('verification') || text.includes('identity') || text.includes('kyc')) {
    return 'Verification guide: go to Settings, open the verification section, upload the requested records, and submit them for review. Kiamina will update the status after assessment.'
  }
  if (text.includes('onboarding') || text.includes('workspace setup')) {
    return 'Onboarding covers profile confirmation first, then business and accounting setup so Kiamina can prepare your client workspace correctly.'
  }
  if (text.includes('tax') || text.includes('vat') || text.includes('compliance') || text.includes('tin')) {
    return 'Kiamina supports tax compliance, filing readiness, and finance-control setup. You can also keep your tax details current from Settings so document reviews stay aligned.'
  }
  if (text.includes('payroll') || text.includes('salary')) {
    return 'Kiamina payroll support covers payroll processing, compliance checks, journals, and reconciliation support for your reporting cycle.'
  }
  if (text.includes('bookkeeping') || text.includes('financial reporting') || text.includes('financial modeling')) {
    return 'Kiamina service lines include bookkeeping, financial reporting, financial modeling, payroll processing, and tax compliance with a structured, audit-ready approach.'
  }
  if (text.includes('newsletter') || text.includes('insight') || text.includes('article')) {
    return 'You can subscribe to Kiamina updates from the website or client landing page to receive accounting, tax, payroll, and advisory insights.'
  }
  if (text.includes('time') || text.includes('hours') || text.includes('open') || text.includes('working hour')) {
    return `Human support working hours are ${SUPPORT_WORKING_HOURS_TEXT}. Outside those hours, I can still capture your details and question for follow-up.`
  }
  if (shouldRequestAgent(text)) {
    return isSupportAgentOnline()
      ? 'I can help you connect with a human agent now. Type your question clearly and I will escalate it.'
      : `Human agents are currently offline. Working hours are ${SUPPORT_WORKING_HOURS_TEXT}. I can still capture your details and inquiry now.`
  }
  return 'I can help with Kiamina services, onboarding, uploads, tax, payroll, settings, and verification. Type "agent" if you need human support.'
}

export const formatSupportSlaCountdown = (slaDueAtIso = '', referenceMs = Date.now()) => {
  const dueMs = Date.parse(slaDueAtIso || '')
  if (!Number.isFinite(dueMs)) return ''
  const deltaMs = dueMs - referenceMs
  const prefix = deltaMs >= 0 ? 'Due in' : 'Overdue by'
  const absoluteMinutes = Math.max(1, Math.round(Math.abs(deltaMs) / 60000))
  const hours = Math.floor(absoluteMinutes / 60)
  const minutes = absoluteMinutes % 60
  if (hours > 0) return `${prefix} ${hours}h ${minutes}m`
  return `${prefix} ${minutes}m`
}

export const initializeAnonymousSupportLead = () => {
  if (typeof localStorage === 'undefined') {
    return { ok: false, message: 'Support lead session is unavailable in this environment.' }
  }

  const savedSession = safeParseJson(localStorage.getItem(SUPPORT_ANON_LEAD_SESSION_STORAGE_KEY), null)
  const savedClientEmail = toEmail(savedSession?.clientEmail)
  const savedAnonymousSessionId = toTrimmedValue(savedSession?.anonymousSessionId)
  if (savedClientEmail) {
    let existingLead = getLeadByClientEmail(supportState.leads, savedClientEmail)
    if (!existingLead) {
      const fallbackNumber = parseLeadNumberFromAlias(savedClientEmail) || nextLeadSequence()
      const recreatedLead = normalizeLead({
        id: toTrimmedValue(savedSession?.leadId),
        leadNumber: fallbackNumber,
        leadLabel: toTrimmedValue(savedSession?.leadLabel) || `Lead ${fallbackNumber}`,
        clientEmail: savedClientEmail,
        leadCategory: LEAD_CATEGORY.INQUIRY_FOLLOW_UP,
        source: 'chat-inquiry',
        createdAtIso: nowIso(),
        updatedAtIso: nowIso(),
      })
      updateSupportLeads((leads) => replaceLead(leads, recreatedLead))
      existingLead = recreatedLead
    }
    if (existingLead && (!existingLead.ipAddress || !existingLead.location)) {
      void hydrateSupportLeadNetworkProfile({ clientEmail: existingLead.clientEmail })
    }
    void syncPublicSupportLeadToBackend({ lead: existingLead })
    const anonymousSessionId = getAnonymousSupportSessionId({
      createIfMissing: true,
      leadId: existingLead.id,
      leadLabel: existingLead.leadLabel,
      clientEmail: existingLead.clientEmail,
      backendTicketId: toTrimmedValue(savedSession?.backendTicketId),
    }) || savedAnonymousSessionId
    return {
      ok: true,
      lead: existingLead,
      leadId: existingLead.id,
      leadLabel: existingLead.leadLabel,
      clientEmail: existingLead.clientEmail,
      anonymousSessionId,
      backendTicketId: toTrimmedValue(savedSession?.backendTicketId),
    }
  }

  const nextLeadNumber = nextLeadSequence()
  const captureContext = buildLeadCaptureContext()
  const nextLead = normalizeLead({
    id: createId('LEAD'),
    leadNumber: nextLeadNumber,
    leadLabel: `Lead ${nextLeadNumber}`,
    clientEmail: buildLeadAliasEmail(nextLeadNumber),
    leadCategory: LEAD_CATEGORY.INQUIRY_FOLLOW_UP,
    capturePage: captureContext.capturePage,
    capturePath: captureContext.capturePath,
    createdAtIso: nowIso(),
    updatedAtIso: nowIso(),
    source: 'chat-inquiry',
  })
  updateSupportLeads((leads) => replaceLead(leads, nextLead))
  const anonymousSessionId = getAnonymousSupportSessionId({
    createIfMissing: true,
    leadId: nextLead.id,
    leadLabel: nextLead.leadLabel,
    clientEmail: nextLead.clientEmail,
  })
  persistAnonymousLeadSession({
    leadId: nextLead.id,
    leadLabel: nextLead.leadLabel,
    clientEmail: nextLead.clientEmail,
    anonymousSessionId,
  })
  if (!nextLead.ipAddress || !nextLead.location) {
    void hydrateSupportLeadNetworkProfile({ clientEmail: nextLead.clientEmail })
  }
  void syncPublicSupportLeadToBackend({ lead: nextLead })
  return {
    ok: true,
    lead: nextLead,
    leadId: nextLead.id,
    leadLabel: nextLead.leadLabel,
    clientEmail: nextLead.clientEmail,
    anonymousSessionId,
  }
}

const refreshLeadLinkedTickets = (lead = null) => {
  if (!lead?.id) return
  updateSupportTickets((tickets) => (
    tickets.map((ticket) => {
      const isLinked = ticket.leadId === lead.id || ticket.clientEmail === lead.clientEmail
      if (!isLinked) return ticket
      return applyLeadToTicket(ticket, lead)
    })
  ))
}

export const updateSupportLeadProfile = ({
  clientEmail = '',
  fullName = '',
  contactEmail = '',
  organizationType = LEAD_ORGANIZATION_TYPE.UNKNOWN,
} = {}) => {
  const normalizedClientEmail = toEmail(clientEmail)
  if (!normalizedClientEmail) return { ok: false, message: 'Lead identity is missing.' }
  let nextLead = null
  updateSupportLeads((leads) => {
    const existingLead = getLeadByClientEmail(leads, normalizedClientEmail)
    if (!existingLead) return leads
    nextLead = normalizeLead({
      ...existingLead,
      fullName: toTrimmedValue(fullName) || existingLead.fullName,
      contactEmail: toEmail(contactEmail) || existingLead.contactEmail,
      organizationType: normalizeLeadOrganizationType(organizationType) || existingLead.organizationType,
      leadCategories: normalizeLeadCategories(existingLead.leadCategories, existingLead.leadCategory),
      leadCategory: existingLead.leadCategory || LEAD_CATEGORY.INQUIRY_FOLLOW_UP,
      updatedAtIso: nowIso(),
    })
    return replaceLead(leads, nextLead)
  })
  if (!nextLead) return { ok: false, message: 'Lead record was not found.' }
  refreshLeadLinkedTickets(nextLead)
  return { ok: true, lead: nextLead }
}

export const registerNewsletterSubscriberLead = async ({
  contactEmail = '',
  fullName = '',
  serviceFocus = '',
  capturePage = '',
  capturePath = '',
} = {}) => {
  const normalizedContactEmail = toEmail(contactEmail)
  if (!isValidEmail(normalizedContactEmail)) {
    return { ok: false, message: 'A valid email is required.' }
  }

  const normalizedName = toTrimmedValue(fullName)
  const captureContext = buildLeadCaptureContext({ capturePage, capturePath })
  let nextLead = null
  updateSupportLeads((leads) => {
    const existingLead = getLeadByContactEmail(leads, normalizedContactEmail)
    if (existingLead) {
      nextLead = normalizeLead({
        ...existingLead,
        fullName: normalizedName || existingLead.fullName,
        contactEmail: normalizedContactEmail,
        leadCategories: normalizeLeadCategories(
          existingLead.leadCategories,
          existingLead.leadCategory,
          LEAD_CATEGORY.NEWSLETTER_SUBSCRIBER,
        ),
        leadCategory: LEAD_CATEGORY.NEWSLETTER_SUBSCRIBER,
        source: 'newsletter-subscription',
        capturePage: existingLead.capturePage || captureContext.capturePage,
        capturePath: existingLead.capturePath || captureContext.capturePath,
        updatedAtIso: nowIso(),
      })
      return replaceLead(leads, nextLead)
    }

    const nextLeadNumber = nextLeadSequence()
    nextLead = normalizeLead({
      id: createId('LEAD'),
      leadNumber: nextLeadNumber,
      leadLabel: `Lead ${nextLeadNumber}`,
      clientEmail: normalizedContactEmail,
      fullName: normalizedName,
      contactEmail: normalizedContactEmail,
      organizationType: LEAD_ORGANIZATION_TYPE.UNKNOWN,
      leadCategory: LEAD_CATEGORY.NEWSLETTER_SUBSCRIBER,
      source: 'newsletter-subscription',
      capturePage: captureContext.capturePage,
      capturePath: captureContext.capturePath,
      createdAtIso: nowIso(),
      updatedAtIso: nowIso(),
    })
    return replaceLead(leads, nextLead)
  })

  if (!nextLead) return { ok: false, message: 'Unable to save newsletter lead.' }
  refreshLeadLinkedTickets(nextLead)
  if (!nextLead.ipAddress || !nextLead.location) {
    void hydrateSupportLeadNetworkProfile({ clientEmail: nextLead.clientEmail })
  }
  const syncResult = await syncPublicNewsletterLeadToBackend({
    lead: nextLead,
    serviceFocus,
  })
  if (!syncResult.ok && !syncResult.skipped) {
    return { ok: false, message: syncResult.message || 'Unable to sync newsletter subscription.' }
  }
  return { ok: true, lead: nextLead }
}

export const deleteSupportLead = ({
  leadId = '',
  clientEmail = '',
} = {}) => {
  const normalizedLeadId = toTrimmedValue(leadId)
  const normalizedClientEmail = toEmail(clientEmail)
  if (!normalizedLeadId && !normalizedClientEmail) {
    return { ok: false, message: 'Lead identifier is required.' }
  }

  let removedLead = null
  updateSupportLeads((leads) => {
    const targetLead = normalizedLeadId
      ? getLeadById(leads, normalizedLeadId)
      : getLeadByClientEmail(leads, normalizedClientEmail)
    if (!targetLead) return leads
    removedLead = targetLead
    return leads.filter((lead) => lead.id !== targetLead.id)
  })

  if (!removedLead) {
    return { ok: false, message: 'Lead was not found.' }
  }

  const removedLeadId = toTrimmedValue(removedLead.id)
  const removedLeadClientEmail = toEmail(removedLead.clientEmail)
  let removedTickets = []
  const shouldRemoveLinkedTickets = !isBackendAdminActor()
  if (shouldRemoveLinkedTickets) {
    updateSupportTickets((tickets) => {
      removedTickets = tickets.filter((ticket) => (
        Boolean(ticket?.isLead)
        && (
          (removedLeadId && toTrimmedValue(ticket.leadId) === removedLeadId)
          || (removedLeadClientEmail && toEmail(ticket.clientEmail) === removedLeadClientEmail)
        )
      ))
      if (removedTickets.length === 0) return tickets
      const removedTicketIds = new Set(removedTickets.map((ticket) => ticket.id))
      return tickets.filter((ticket) => !removedTicketIds.has(ticket.id))
    })
  }

  clearAnonymousLeadSessionByClientEmail(removedLeadClientEmail)

  return {
    ok: true,
    lead: removedLead,
    tickets: removedTickets,
    removedTicketCount: removedTickets.length,
  }
}

export const restoreSupportLead = ({
  lead = null,
  tickets = [],
} = {}) => {
  if (!lead || typeof lead !== 'object') {
    return { ok: false, message: 'Lead payload is required for restore.' }
  }

  const normalizedLead = normalizeLead(lead, 0)
  updateSupportLeads((leads) => replaceLead(leads, normalizedLead))

  const normalizedTickets = (Array.isArray(tickets) ? tickets : [])
    .filter((ticket) => ticket && typeof ticket === 'object')
    .map((ticket, index) => normalizeTicket(ticket, index))
    .map((ticket) => applyLeadToTicket(ticket, normalizedLead))

  const uniqueTickets = []
  const seenTicketIds = new Set()
  normalizedTickets.forEach((ticket) => {
    const normalizedTicketId = toTrimmedValue(ticket.id)
    if (!normalizedTicketId || seenTicketIds.has(normalizedTicketId)) return
    seenTicketIds.add(normalizedTicketId)
    uniqueTickets.push(ticket)
  })

  if (uniqueTickets.length > 0) {
    updateSupportTickets((existingTickets) => (
      uniqueTickets.reduce((nextTickets, ticket) => replaceTicket(nextTickets, ticket), existingTickets)
    ))
  }

  refreshLeadLinkedTickets(normalizedLead)
  return {
    ok: true,
    lead: normalizedLead,
    restoredTicketCount: uniqueTickets.length,
  }
}

const fetchJsonWithTimeout = async (url = '', timeoutMs = 5000) => {
  const abortController = typeof AbortController === 'function' ? new AbortController() : null
  const timeoutId = abortController ? setTimeout(() => abortController.abort(), timeoutMs) : null
  try {
    return await fetch(url, {
      method: 'GET',
      signal: abortController?.signal,
    })
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

const normalizeLeadGeoProfile = (payload = {}, providerKey = '') => {
  const source = toTrimmedValue(providerKey).toLowerCase()
  if (source === 'ipwho' && payload?.success === false) {
    return {
      ipAddress: '',
      city: '',
      region: '',
      country: '',
      location: '',
    }
  }
  const ipAddress = toTrimmedValue(
    payload?.ip
    || payload?.ip_address
    || payload?.query
    || payload?.ipAddress,
  )
  const city = toTrimmedValue(payload?.city)
  const region = toTrimmedValue(payload?.region || payload?.region_name)
  const country = toTrimmedValue(payload?.country || payload?.country_name)
  const location = toTrimmedValue(payload?.location)
    || [city, region, country].filter(Boolean).join(', ')
  return {
    ipAddress,
    city,
    region,
    country,
    location,
  }
}

const fetchLeadGeoProfile = async () => {
  if (typeof fetch !== 'function') return { ok: false, message: 'Network API unavailable.' }

  for (const endpoint of LEAD_GEO_LOOKUP_ENDPOINTS) {
    try {
      const response = await fetchJsonWithTimeout(endpoint.url, 5000)
      if (!response?.ok) continue
      const payload = await response.json().catch(() => null)
      if (!payload || typeof payload !== 'object') continue
      const profile = normalizeLeadGeoProfile(payload, endpoint.key)
      if (!profile.ipAddress && !profile.location) continue
      return {
        ok: true,
        ...profile,
      }
    } catch {
      // Try the next provider.
    }
  }

  return { ok: false, message: 'IP profile lookup failed.' }
}

export const hydrateSupportLeadNetworkProfile = async ({
  clientEmail = '',
} = {}) => {
  const normalizedClientEmail = toEmail(clientEmail)
  if (!normalizedClientEmail) return { ok: false, message: 'Lead identity is missing.' }
  const currentLead = getLeadByClientEmail(supportState.leads, normalizedClientEmail)
  if (!currentLead) return { ok: false, message: 'Lead record not found.' }
  if (currentLead.ipAddress && currentLead.location) {
    return { ok: true, lead: currentLead }
  }
  const lookupResult = await fetchLeadGeoProfile()
  if (!lookupResult.ok) return lookupResult

  let nextLead = null
  updateSupportLeads((leads) => {
    const existingLead = getLeadByClientEmail(leads, normalizedClientEmail)
    if (!existingLead) return leads
    nextLead = normalizeLead({
      ...existingLead,
      ipAddress: lookupResult.ipAddress || existingLead.ipAddress,
      city: lookupResult.city || existingLead.city,
      region: lookupResult.region || existingLead.region,
      country: lookupResult.country || existingLead.country,
      location: lookupResult.location || existingLead.location,
      updatedAtIso: nowIso(),
    })
    return replaceLead(leads, nextLead)
  })
  if (!nextLead) return { ok: false, message: 'Unable to update lead network profile.' }
  refreshLeadLinkedTickets(nextLead)
  void syncPublicSupportLeadToBackend({ lead: nextLead })
  return { ok: true, lead: nextLead }
}

export const getSupportCenterSnapshot = () => toSnapshot()

export const subscribeSupportCenter = (listener) => {
  if (typeof listener !== 'function') return () => {}
  listenerSet.add(listener)
  listener(toSnapshot())
  void maybeRefreshSupportStateFromBackend()
  return () => {
    listenerSet.delete(listener)
  }
}

let backendRefreshPromise = null
let cachedKnowledgeBaseHint = ''
let backendAdminDashboardLeadSyncTimer = null
let backendAdminDashboardLeadSyncSignature = ''
const ADMIN_DASHBOARD_LEAD_SYNC_DELAY_MS = 350

const readIsoMapFromStorage = (storageKey) => {
  if (typeof localStorage === 'undefined') return {}
  const parsed = safeParseJson(localStorage.getItem(storageKey), {})
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return Object.entries(parsed).reduce((accumulator, [key, value]) => {
    const normalizedKey = toTrimmedValue(key)
    const normalizedValue = toTrimmedValue(value)
    if (!normalizedKey || !normalizedValue) return accumulator
    accumulator[normalizedKey] = normalizedValue
    return accumulator
  }, {})
}

const persistIsoMapToStorage = (storageKey, payload = {}) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(storageKey, JSON.stringify(payload && typeof payload === 'object' ? payload : {}))
}

const readAssignedAdminMetaMap = () => {
  if (typeof localStorage === 'undefined') return {}
  const parsed = safeParseJson(localStorage.getItem(SUPPORT_ASSIGNED_ADMIN_META_STORAGE_KEY), {})
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return parsed
}

const persistAssignedAdminMetaMap = (payload = {}) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(SUPPORT_ASSIGNED_ADMIN_META_STORAGE_KEY, JSON.stringify(payload && typeof payload === 'object' ? payload : {}))
}

const getStoredAuthUserForSupport = () => {
  if (typeof window === 'undefined') return null
  const sessionUser = safeParseJson(window.sessionStorage.getItem('kiaminaAuthUser'), null)
  if (sessionUser && typeof sessionUser === 'object') return sessionUser
  const localUser = safeParseJson(window.localStorage.getItem('kiaminaAuthUser'), null)
  if (localUser && typeof localUser === 'object') return localUser
  return null
}

const isPublicSupportRoute = () => {
  if (typeof window === 'undefined') return false
  const pathname = toTrimmedValue(window.location.pathname) || '/'
  return (
    pathname === '/'
    || pathname === '/home'
    || pathname === '/about'
    || pathname === '/services'
    || pathname === '/insights'
    || pathname === '/careers'
    || pathname === '/contact'
    || pathname === '/login'
    || pathname === '/signup'
    || pathname === '/admin/login'
    || pathname === '/admin/setup'
  )
}

const isBackendSupportAvailable = () => {
  const authUser = getStoredAuthUserForSupport()
  if (!toTrimmedValue(authUser?.email)) return false
  if (isPublicSupportRoute()) return false
  return Boolean(getApiAccessToken() || getApiSessionId())
}

const isBackendAnonymousSupportAvailable = () => hasApiCapabilities()

const getStoredAnonymousSupportSession = () => {
  if (typeof localStorage === 'undefined') return null
  const parsed = safeParseJson(localStorage.getItem(SUPPORT_ANON_LEAD_SESSION_STORAGE_KEY), null)
  if (!parsed || typeof parsed !== 'object') return null
  return parsed
}

const getActiveAnonymousSupportSessionId = ({
  createIfMissing = true,
  clientEmail = '',
  leadId = '',
  leadLabel = '',
  backendTicketId = '',
} = {}) => getAnonymousSupportSessionId({
  createIfMissing,
  clientEmail,
  leadId,
  leadLabel,
  backendTicketId,
})

const isBackendAdminActor = () => {
  const authUser = getStoredAuthUserForSupport()
  const normalizedRole = toTrimmedValue(authUser?.role).toLowerCase()
  return normalizedRole === 'admin' || normalizedRole === 'owner' || normalizedRole === 'superadmin' || normalizedRole === 'manager'
}

const getActorIdentity = () => {
  const authUser = getStoredAuthUserForSupport() || {}
  return {
    uid: toTrimmedValue(authUser.uid),
    email: toEmail(authUser.email),
    fullName: toTrimmedValue(authUser.fullName) || 'Client User',
  }
}

const hasApiCapabilities = () => typeof fetch === 'function'

const requestJson = async (path, options = {}) => {
  if (!hasApiCapabilities()) {
    return { ok: false, status: 0, data: null, message: 'Network API unavailable.' }
  }
  try {
    const response = await apiFetch(path, options)
    const data = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, data, message: toTrimmedValue(data?.message) }
  } catch (error) {
    return { ok: false, status: 0, data: null, message: String(error?.message || 'Network request failed.') }
  }
}

const syncPublicSupportLeadToBackend = async ({
  lead = null,
} = {}) => {
  if (!lead || typeof lead !== 'object' || !hasApiCapabilities() || isBackendAdminActor()) {
    return { ok: false, skipped: true }
  }

  const normalizedLead = normalizeLead(lead)
  const supportCategories = normalizeLeadCategories(
    normalizedLead.leadCategories,
    normalizedLead.leadCategory,
  )
  if (!supportCategories.includes(LEAD_CATEGORY.INQUIRY_FOLLOW_UP)) {
    return { ok: false, skipped: true }
  }

  const response = await requestJson('/api/users/public/support-leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      leadId: toTrimmedValue(normalizedLead.id),
      fullName: toTrimmedValue(normalizedLead.fullName),
      email: toEmail(normalizedLead.contactEmail || normalizedLead.clientEmail),
      companyName: toTrimmedValue(normalizedLead.leadLabel),
      leadIpAddress: toTrimmedValue(normalizedLead.ipAddress),
      leadCountry: toTrimmedValue(normalizedLead.country),
      leadLocation: toTrimmedValue(normalizedLead.location),
      capturePage: toTrimmedValue(normalizedLead.capturePage),
      capturePath: toTrimmedValue(normalizedLead.capturePath),
      source: toTrimmedValue(normalizedLead.source) || 'support-chat',
      status: toTrimmedValue(normalizedLead.supportStatus) || 'new',
      interest: toTrimmedValue(normalizedLead.inquiryText),
      notes: [
        toTrimmedValue(normalizedLead.leadNotes),
      ].filter(Boolean).join(' | '),
      createdAt: toTrimmedValue(normalizedLead.createdAtIso) || nowIso(),
      updatedAt: toTrimmedValue(normalizedLead.updatedAtIso) || nowIso(),
    }),
  })

  return response.ok
    ? { ok: true, data: response.data }
    : { ok: false, message: response.message || 'Unable to sync support lead.' }
}

const syncPublicNewsletterLeadToBackend = async ({
  lead = null,
  serviceFocus = '',
} = {}) => {
  if (!lead || typeof lead !== 'object' || !hasApiCapabilities() || isBackendAdminActor()) {
    return { ok: false, skipped: true }
  }

  const normalizedLead = normalizeLead(lead)
  const newsletterCategories = normalizeLeadCategories(
    normalizedLead.leadCategories,
    normalizedLead.leadCategory,
  )
  const normalizedEmail = toEmail(normalizedLead.contactEmail || normalizedLead.clientEmail)
  if (!newsletterCategories.includes(LEAD_CATEGORY.NEWSLETTER_SUBSCRIBER) || !normalizedEmail) {
    return { ok: false, skipped: true }
  }

  const tags = ['newsletter']
  const normalizedServiceFocus = toTrimmedValue(serviceFocus)
  if (normalizedServiceFocus) {
    tags.push(normalizedServiceFocus)
  }

  const response = await requestJson('/api/users/public/newsletters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: normalizedEmail,
      fullName: toTrimmedValue(normalizedLead.fullName),
      leadIpAddress: toTrimmedValue(normalizedLead.ipAddress),
      leadCountry: toTrimmedValue(normalizedLead.country),
      leadLocation: toTrimmedValue(normalizedLead.location),
      capturePage: toTrimmedValue(normalizedLead.capturePage),
      capturePath: toTrimmedValue(normalizedLead.capturePath),
      status: toTrimmedValue(normalizedLead.newsletterStatus) || 'subscribed',
      source: toTrimmedValue(normalizedLead.source) || 'newsletter-subscription',
      tags,
      subscribedAt: toTrimmedValue(normalizedLead.createdAtIso) || nowIso(),
      lastEngagedAt: toTrimmedValue(normalizedLead.updatedAtIso) || nowIso(),
    }),
  })

  return response.ok
    ? { ok: true, data: response.data }
    : { ok: false, message: response.message || 'Unable to sync newsletter subscription.' }
}

const mapBackendSupportStatusToLocal = (status = '') => {
  const normalized = toTrimmedValue(status).toLowerCase()
  if (normalized === 'resolved' || normalized === 'closed') return SUPPORT_TICKET_STATUS.RESOLVED
  if (normalized === 'in-progress' || normalized === 'waiting-user') return SUPPORT_TICKET_STATUS.ASSIGNED
  return SUPPORT_TICKET_STATUS.OPEN
}

const isBackendSupportTicketId = (ticketId = '') => toTrimmedValue(ticketId).startsWith('sup_')

const mapBackendSupportChannelToLocal = ({ status = '', channel = '' } = {}) => {
  const localStatus = mapBackendSupportStatusToLocal(status)
  if (localStatus === SUPPORT_TICKET_STATUS.RESOLVED) return SUPPORT_CHANNEL.HUMAN
  const normalizedChannel = toTrimmedValue(channel).toLowerCase()
  if (normalizedChannel === 'chatbot') return SUPPORT_CHANNEL.BOT
  if (localStatus === SUPPORT_TICKET_STATUS.ASSIGNED) return SUPPORT_CHANNEL.HUMAN
  return SUPPORT_CHANNEL.BOT
}

const mapBackendSupportSender = (senderType = '') => {
  const normalized = toTrimmedValue(senderType).toLowerCase()
  if (normalized === 'agent') return SUPPORT_SENDER.AGENT
  if (normalized === 'user') return SUPPORT_SENDER.CLIENT
  return SUPPORT_SENDER.SYSTEM
}

const mapBackendChatSender = (role = '') => {
  const normalized = toTrimmedValue(role).toLowerCase()
  if (normalized === 'assistant') return SUPPORT_SENDER.BOT
  if (normalized === 'user') return SUPPORT_SENDER.CLIENT
  return SUPPORT_SENDER.SYSTEM
}

const toOutgoingSupportAttachments = (attachments = []) => (
  (Array.isArray(attachments) ? attachments : []).map((attachment) => ({
    name: toTrimmedValue(attachment?.name) || 'attachment',
    url: toTrimmedValue(attachment?.previewDataUrl),
    contentType: toTrimmedValue(attachment?.type),
    size: Number.isFinite(Number(attachment?.size)) ? Number(attachment.size) : 0,
  }))
)

const mapSupportMessagesFromBackend = (messages = []) => (
  (Array.isArray(messages) ? messages : []).map((entry, index) => normalizeMessage({
    id: toTrimmedValue(entry?.id || entry?._id) || createId(`MSGSUP${index}`),
    sender: mapBackendSupportSender(entry?.senderType),
    senderName: toTrimmedValue(entry?.senderDisplayName) || (entry?.senderType === 'agent' ? 'Support Agent' : ''),
    text: String(entry?.content || ''),
    createdAtIso: toTrimmedValue(entry?.createdAt) || toTrimmedValue(entry?.updatedAt) || nowIso(),
    deliveryStatus: SUPPORT_MESSAGE_STATUS.SENT,
    deliveryError: '',
    retryCount: 0,
    attachments: (Array.isArray(entry?.attachments) ? entry.attachments : []).map((attachment, attachmentIndex) => normalizeAttachment({
      id: toTrimmedValue(attachment?.id) || createId(`ATTSUP${attachmentIndex}`),
      name: toTrimmedValue(attachment?.name),
      type: toTrimmedValue(attachment?.contentType),
      size: Number.isFinite(Number(attachment?.size)) ? Number(attachment.size) : 0,
      cacheKey: '',
      previewDataUrl: toTrimmedValue(attachment?.url).startsWith('data:') ? toTrimmedValue(attachment?.url) : '',
    }, attachmentIndex)),
  }, index))
)

const mapChatMessagesFromBackend = (messages = [], { sessionId = '' } = {}) => {
  const normalizedMessages = (Array.isArray(messages) ? messages : []).map((entry, index) => normalizeMessage({
    id: toTrimmedValue(entry?.id || entry?._id) || createId(`MSGCHAT${index}`),
    sender: mapBackendChatSender(entry?.role),
    senderName: mapBackendChatSender(entry?.role) === SUPPORT_SENDER.BOT ? 'Kiamina Support Bot' : '',
    text: String(entry?.content || ''),
    createdAtIso: toTrimmedValue(entry?.createdAt) || toTrimmedValue(entry?.updatedAt) || nowIso(),
    deliveryStatus: SUPPORT_MESSAGE_STATUS.SENT,
    deliveryError: '',
    retryCount: 0,
    attachments: [],
  }, index))
  if (normalizedMessages.length > 0) return normalizedMessages
  return [normalizeMessage({
    id: `${sessionId || createId('CHAT')}-WELCOME`,
    sender: SUPPORT_SENDER.BOT,
    senderName: 'Kiamina Support Bot',
    text: cachedKnowledgeBaseHint || BOT_WELCOME_TEXT,
    createdAtIso: nowIso(),
    deliveryStatus: SUPPORT_MESSAGE_STATUS.SENT,
    attachments: [],
  })]
}

const mergeBackendChatSessionIntoState = ({
  session = {},
  clientEmail = '',
  clientName = 'Client User',
  businessName = '',
  messages = [],
} = {}) => {
  const normalizedSessionId = toTrimmedValue(session?.sessionId)
  if (!normalizedSessionId) return
  const normalizedMessages = mapChatMessagesFromBackend(messages, { sessionId: normalizedSessionId })
  updateSupportTickets((tickets) => {
    const existingTicket = getTicketById(tickets, normalizedSessionId)
    const existingMessages = Array.isArray(existingTicket?.messages) ? existingTicket.messages : []
    const mergedMessages = [...existingMessages]
    normalizedMessages.forEach((message) => {
      if (!mergedMessages.some((entry) => entry.id === message.id)) {
        mergedMessages.push(message)
      }
    })
    mergedMessages.sort((left, right) => (
      (Date.parse(left.createdAtIso || '') || 0) - (Date.parse(right.createdAtIso || '') || 0)
    ))

    const nextTicket = normalizeTicket({
      ...(existingTicket || {}),
      id: normalizedSessionId,
      clientEmail: toEmail(clientEmail) || toEmail(existingTicket?.clientEmail),
      clientName: toTrimmedValue(clientName) || toTrimmedValue(existingTicket?.clientName) || 'Client User',
      businessName: toTrimmedValue(businessName) || toTrimmedValue(existingTicket?.businessName),
      status: toTrimmedValue(session?.status) === 'active' ? SUPPORT_TICKET_STATUS.OPEN : SUPPORT_TICKET_STATUS.RESOLVED,
      channel: SUPPORT_CHANNEL.BOT,
      createdAtIso: toTrimmedValue(session?.startedAt) || toTrimmedValue(session?.createdAt) || toTrimmedValue(existingTicket?.createdAtIso) || nowIso(),
      updatedAtIso: toTrimmedValue(session?.lastMessageAt) || mergedMessages[mergedMessages.length - 1]?.createdAtIso || toTrimmedValue(existingTicket?.updatedAtIso) || nowIso(),
      resolvedAtIso: toTrimmedValue(session?.endedAt) || '',
      messages: mergedMessages,
    })
    return replaceTicket(tickets, nextTicket)
  })
}

const mergeBackendSupportMessageIntoState = ({
  ticketId = '',
  ticket = null,
  message = null,
  clientEmail = '',
  clientName = 'Client User',
  businessName = '',
} = {}) => {
  const normalizedTicketId = toTrimmedValue(ticketId || ticket?.ticketId)
  if (!normalizedTicketId || !message) return
  const normalizedMessage = mapSupportMessagesFromBackend([message])[0]
  if (!normalizedMessage) return

  updateSupportTickets((tickets) => {
    const existingTicket = getTicketById(tickets, normalizedTicketId)
    const existingMessages = Array.isArray(existingTicket?.messages) ? existingTicket.messages : []
    const mergedMessages = existingMessages.some((entry) => entry.id === normalizedMessage.id)
      ? existingMessages
      : [...existingMessages, normalizedMessage]

    const nextTicket = normalizeTicket({
      ...(existingTicket || {}),
      id: normalizedTicketId,
      clientEmail: toEmail(clientEmail) || toEmail(existingTicket?.clientEmail),
      clientName: toTrimmedValue(clientName) || toTrimmedValue(existingTicket?.clientName) || 'Client User',
      businessName: toTrimmedValue(businessName) || toTrimmedValue(existingTicket?.businessName),
      status: mapBackendSupportStatusToLocal(ticket?.status || existingTicket?.status),
      channel: toTrimmedValue(existingTicket?.channel) || SUPPORT_CHANNEL.HUMAN,
      createdAtIso: toTrimmedValue(ticket?.createdAt) || toTrimmedValue(existingTicket?.createdAtIso) || nowIso(),
      updatedAtIso: toTrimmedValue(message?.createdAt) || toTrimmedValue(message?.updatedAt) || nowIso(),
      assignedAdminName: toTrimmedValue(ticket?.assignedAdminName) || toTrimmedValue(existingTicket?.assignedAdminName),
      assignedAdminEmail: toEmail(ticket?.assignedAdminEmail || existingTicket?.assignedAdminEmail),
      messages: mergedMessages.sort((left, right) => (
        (Date.parse(left.createdAtIso || '') || 0) - (Date.parse(right.createdAtIso || '') || 0)
      )),
    })
    return replaceTicket(tickets, nextTicket)
  })
}

const mergeLocalTransientMessages = (backendTicket = {}, localTicket = null) => {
  const backendMessages = Array.isArray(backendTicket?.messages) ? backendTicket.messages : []
  const localMessages = Array.isArray(localTicket?.messages) ? localTicket.messages : []
  const mergedMessages = [...backendMessages]

  localMessages.forEach((message) => {
    const status = toTrimmedValue(message?.deliveryStatus)
    const isTransient = (
      status === SUPPORT_MESSAGE_STATUS.SENDING
      || status === SUPPORT_MESSAGE_STATUS.FAILED
      || status === SUPPORT_MESSAGE_STATUS.TYPING
    )
    if (!isTransient) return
    if (mergedMessages.some((entry) => entry.id === message.id)) return
    mergedMessages.push(normalizeMessage(message))
  })

  return normalizeTicket({
    ...backendTicket,
    messages: mergedMessages.sort((left, right) => (
      (Date.parse(left.createdAtIso || '') || 0) - (Date.parse(right.createdAtIso || '') || 0)
    )),
    updatedAtIso: mergedMessages[mergedMessages.length - 1]?.createdAtIso || backendTicket?.updatedAtIso || nowIso(),
  })
}

const applyLeadMetadataToTicket = (ticket = {}, leadRows = supportState.leads) => {
  const lead = getLeadByClientEmail(leadRows, ticket.clientEmail)
  if (!lead) return ticket
  return normalizeTicket({
    ...ticket,
    isLead: true,
    leadId: lead.id,
    leadLabel: lead.leadLabel,
    leadFullName: lead.fullName,
    leadContactEmail: lead.contactEmail,
    leadOrganizationType: lead.organizationType,
    leadCategory: lead.leadCategory,
    leadCategories: lead.leadCategories,
    leadInquiryText: lead.inquiryText,
    leadIntakeStage: lead.intakeStage,
    leadIpAddress: lead.ipAddress,
    leadLocation: lead.location,
    clientName: lead.leadLabel || ticket.clientName,
  })
}

const computeUnreadCount = ({
  messages = [],
  senderAllowList = [],
  sinceIso = '',
} = {}) => {
  const sinceMs = Date.parse(sinceIso || '')
  return (Array.isArray(messages) ? messages : []).reduce((count, message) => {
    if (!senderAllowList.includes(message.sender)) return count
    const messageMs = Date.parse(message.createdAtIso || '')
    if (Number.isFinite(sinceMs) && Number.isFinite(messageMs) && messageMs <= sinceMs) return count
    return count + 1
  }, 0)
}

const withComputedUnreadCounts = (ticket = {}) => {
  const clientReadMap = readIsoMapFromStorage(SUPPORT_CLIENT_READ_STORAGE_KEY)
  const adminReadMap = readIsoMapFromStorage(SUPPORT_ADMIN_READ_STORAGE_KEY)
  const clientReadAtIso = toTrimmedValue(clientReadMap[ticket.id] || '')
  const adminReadAtIso = toTrimmedValue(adminReadMap[ticket.id] || '')
  const messages = Array.isArray(ticket.messages) ? ticket.messages : []
  return {
    ...ticket,
    unreadByClient: computeUnreadCount({
      messages,
      senderAllowList: [SUPPORT_SENDER.AGENT, SUPPORT_SENDER.BOT, SUPPORT_SENDER.SYSTEM],
      sinceIso: clientReadAtIso,
    }),
    unreadByAdmin: computeUnreadCount({
      messages,
      senderAllowList: [SUPPORT_SENDER.CLIENT],
      sinceIso: adminReadAtIso,
    }),
  }
}

const refreshKnowledgeBaseHint = async () => {
  const response = await requestJson('/api/notifications/knowledge-base/articles/search?q=support&limit=1')
  if (!response.ok || !Array.isArray(response.data) || response.data.length === 0) return
  const first = response.data[0] || {}
  const title = toTrimmedValue(first.title)
  const summary = toTrimmedValue(first.summary)
  if (!title && !summary) return
  cachedKnowledgeBaseHint = title && summary
    ? `Tip from Knowledge Base: ${title}. ${summary}`
    : `Tip from Knowledge Base: ${title || summary}`
}

export const refreshSupportStateFromBackend = async () => {
  const hasAuthenticatedBackend = isBackendSupportAvailable()
  const hasAnonymousBackend = !hasAuthenticatedBackend && isBackendAnonymousSupportAvailable()
  if (!hasAuthenticatedBackend && !hasAnonymousBackend) {
    return { ok: false, message: 'Network API unavailable.' }
  }
  if (backendRefreshPromise) return backendRefreshPromise

  backendRefreshPromise = (async () => {
    const adminActor = hasAuthenticatedBackend && isBackendAdminActor()
    const actor = getActorIdentity()
    const assignedAdminMeta = readAssignedAdminMetaMap()
    const anonymousSession = getStoredAnonymousSupportSession()
    const anonymousSessionId = hasAnonymousBackend
      ? getActiveAnonymousSupportSessionId({
        createIfMissing: false,
        clientEmail: toEmail(anonymousSession?.clientEmail),
        leadId: toTrimmedValue(anonymousSession?.leadId),
        leadLabel: toTrimmedValue(anonymousSession?.leadLabel),
        backendTicketId: toTrimmedValue(anonymousSession?.backendTicketId),
      })
      : ''
    let adminDashboardCollections = { supportLeads: [], newsletters: [] }
    let hasAdminDashboardPayload = false

    if (adminActor) {
      const adminDashboardResponse = await requestJson('/api/users/me/admin-dashboard')
      if (adminDashboardResponse.ok && adminDashboardResponse.data && typeof adminDashboardResponse.data === 'object') {
        adminDashboardCollections = parseAdminDashboardLeadCollections(adminDashboardResponse.data)
        hasAdminDashboardPayload = true
      }
    }

    if (!hasAuthenticatedBackend && !anonymousSessionId) {
      return { ok: false, message: 'Anonymous support session is unavailable.' }
    }

    const ticketListResponse = hasAuthenticatedBackend
      ? await requestJson(`/api/notifications/support/tickets?scope=${adminActor ? 'all' : 'own'}&limit=100`)
      : await requestJson(
        `/api/notifications/support/public/tickets?sessionId=${encodeURIComponent(anonymousSessionId)}&limit=100`,
      )
    if (!ticketListResponse.ok || !Array.isArray(ticketListResponse.data)) {
      return { ok: false, message: ticketListResponse.message || 'Unable to load support tickets.' }
    }

    const supportTicketRecords = ticketListResponse.data
    const supportMessageResponses = await Promise.all(supportTicketRecords.map((ticket) => (
      hasAuthenticatedBackend
        ? requestJson(`/api/notifications/support/tickets/${encodeURIComponent(ticket.ticketId)}/messages?limit=200`)
        : requestJson(
          `/api/notifications/support/public/tickets/${encodeURIComponent(ticket.ticketId)}/messages?sessionId=${encodeURIComponent(anonymousSessionId)}&limit=200`,
        )
    )))

    const mappedSupportTickets = supportTicketRecords.map((ticket, index) => {
      const messages = mapSupportMessagesFromBackend(supportMessageResponses[index]?.data)
      const assignmentMeta = assignedAdminMeta[ticket.ticketId] || {}
      const metadata = ticket?.metadata && typeof ticket.metadata === 'object' ? ticket.metadata : {}
      const metadataLeadLabel = toTrimmedValue(metadata.leadLabel)
      const metadataFullName = toTrimmedValue(metadata.fullName)
      const metadataContactEmail = toEmail(metadata.contactEmail)
      const metadataOrganizationType = normalizeLeadOrganizationType(metadata.organizationType)
      const metadataLeadCategory = normalizeLeadCategories(
        metadata.leadCategories,
        metadata.leadCategory,
        metadata.anonymous ? LEAD_CATEGORY.INQUIRY_FOLLOW_UP : '',
      )
      const assignedAdminName = (
        toTrimmedValue(ticket.assignedAdminName)
        || toTrimmedValue(assignmentMeta.name)
        || (toTrimmedValue(ticket.assignedToUid) === actor.uid ? actor.fullName : '')
      )
      const assignedAdminEmail = (
        toEmail(ticket.assignedAdminEmail)
        || toEmail(assignmentMeta.email)
        || (toTrimmedValue(ticket.assignedToUid) === actor.uid ? actor.email : '')
      )
      const ticketOwnerEmail = toEmail(ticket.ownerEmail)
      const anonymousClientEmail = !hasAuthenticatedBackend
        ? toEmail(anonymousSession?.clientEmail)
        : ''
      const ticketClientEmail = anonymousClientEmail || ticketOwnerEmail
      const isLeadTicket = Boolean(metadata.anonymous) || isLeadAliasEmail(ticketClientEmail) || isLeadAliasEmail(ticketOwnerEmail)
      return normalizeTicket({
        id: ticket.ticketId,
        clientEmail: ticketClientEmail,
        clientName: metadataLeadLabel || metadataFullName || toTrimmedValue(anonymousSession?.leadLabel) || toTrimmedValue(ticket.ownerEmail) || 'Client User',
        businessName: '',
        status: mapBackendSupportStatusToLocal(ticket.status),
        channel: mapBackendSupportChannelToLocal({ status: ticket.status, channel: ticket.channel }),
        createdAtIso: toTrimmedValue(ticket.openedAt) || toTrimmedValue(ticket.createdAt) || nowIso(),
        updatedAtIso: toTrimmedValue(ticket.updatedAt) || toTrimmedValue(ticket.lastMessageAt) || nowIso(),
        assignedAdminName,
        assignedAdminEmail,
        unreadByClient: 0,
        unreadByAdmin: 0,
        slaDueAtIso: '',
        resolvedAtIso: toTrimmedValue(ticket.resolvedAt),
        isLead: isLeadTicket,
        leadId: toTrimmedValue(metadata.leadId),
        leadLabel: metadataLeadLabel,
        leadFullName: metadataFullName,
        leadContactEmail: metadataContactEmail,
        leadOrganizationType: metadataOrganizationType,
        leadCategory: metadataLeadCategory[0] || LEAD_CATEGORY.GENERAL,
        leadCategories: metadataLeadCategory,
        leadInquiryText: toTrimmedValue(metadata.inquiryText),
        leadIntakeStage: normalizeLeadIntakeStage(metadata.intakeStage) || LEAD_INTAKE_STAGE.COMPLETE,
        leadIpAddress: toTrimmedValue(metadata.sourceIp),
        leadLocation: toTrimmedValue(metadata.location),
        messages,
      })
    })

    let mappedChatTickets = []
    if (hasAuthenticatedBackend && !adminActor) {
      await refreshKnowledgeBaseHint()
      const chatSessionsResponse = await requestJson('/api/notifications/chatbot/sessions?scope=own&limit=30')
      const chatSessions = Array.isArray(chatSessionsResponse.data) ? chatSessionsResponse.data : []
      const chatMessageResponses = await Promise.all(chatSessions.map((session) => (
        requestJson(`/api/notifications/chatbot/sessions/${encodeURIComponent(session.sessionId)}/messages?limit=200`)
      )))
      mappedChatTickets = chatSessions
        .filter((session) => !toTrimmedValue(session.escalatedToTicketId))
        .map((session, index) => normalizeTicket({
          id: session.sessionId,
          clientEmail: toEmail(session.ownerEmail) || actor.email,
          clientName: actor.fullName,
          businessName: '',
          status: session.status === 'active' ? SUPPORT_TICKET_STATUS.OPEN : SUPPORT_TICKET_STATUS.RESOLVED,
          channel: SUPPORT_CHANNEL.BOT,
          createdAtIso: toTrimmedValue(session.startedAt) || toTrimmedValue(session.createdAt) || nowIso(),
          updatedAtIso: toTrimmedValue(session.lastMessageAt) || toTrimmedValue(session.updatedAt) || nowIso(),
          assignedAdminName: '',
          assignedAdminEmail: '',
          unreadByClient: 0,
          unreadByAdmin: 0,
          slaDueAtIso: '',
          resolvedAtIso: toTrimmedValue(session.endedAt),
          isLead: false,
          leadId: '',
          leadLabel: '',
          leadFullName: '',
          leadContactEmail: '',
          leadOrganizationType: '',
          leadCategory: LEAD_CATEGORY.GENERAL,
          leadCategories: [],
          leadInquiryText: '',
          leadIntakeStage: LEAD_INTAKE_STAGE.COMPLETE,
          leadIpAddress: '',
          leadLocation: '',
          messages: mapChatMessagesFromBackend(chatMessageResponses[index]?.data, { sessionId: session.sessionId }),
        }))
    }

    let nextLeads = sortLeads(supportState.leads)
    if (adminActor && hasAdminDashboardPayload) {
      nextLeads = mapAdminDashboardCollectionsToLocalLeads(adminDashboardCollections)
      if (nextLeads.length === 0 && supportState.leads.length > 0) {
        const migrationResult = await syncAdminDashboardLeadCollections({
          force: true,
          localLeads: supportState.leads,
        })
        if (migrationResult.ok) {
          nextLeads = sortLeads(
            supportState.leads.map((lead, index) => normalizeLead(lead, index)),
          )
        }
      }
      const normalizedCollections = buildAdminDashboardCollectionsFromLocalLeads(nextLeads)
      backendAdminDashboardLeadSyncSignature = serializeAdminDashboardLeadCollections(normalizedCollections)
    }

    const leadRowsForTicketMetadata = adminActor
      ? nextLeads
      : supportState.leads

    const localLeadTickets = supportState.tickets.filter((ticket) => {
      const email = toEmail(ticket.clientEmail)
      return email && LEAD_EMAIL_PATTERN.test(email)
    })
    const combinedTickets = sortTickets([
      ...mappedSupportTickets,
      ...mappedChatTickets,
      ...localLeadTickets.filter((ticket) => (
        !mappedSupportTickets.some((backendTicket) => backendTicket.id === ticket.id)
        && !mappedChatTickets.some((backendTicket) => backendTicket.id === ticket.id)
      )),
    ])
      .map((ticket) => applyLeadMetadataToTicket(ticket, leadRowsForTicketMetadata))
      .map((ticket) => mergeLocalTransientMessages(
        ticket,
        supportState.tickets.find((localTicket) => localTicket.id === ticket.id) || null,
      ))
      .map((ticket) => withComputedUnreadCounts(ticket))

    if (!hasAuthenticatedBackend && anonymousSessionId) {
      const activeBackendTicket = supportTicketRecords.find((ticket) => (
        mapBackendSupportStatusToLocal(ticket?.status) !== SUPPORT_TICKET_STATUS.RESOLVED
      )) || supportTicketRecords[0]
      const activeBackendTicketId = toTrimmedValue(activeBackendTicket?.ticketId)
      if (activeBackendTicketId || anonymousSession?.backendTicketId) {
        persistAnonymousLeadSession({
          leadId: toTrimmedValue(anonymousSession?.leadId),
          leadLabel: toTrimmedValue(anonymousSession?.leadLabel),
          clientEmail: toEmail(anonymousSession?.clientEmail),
          anonymousSessionId,
          backendTicketId: activeBackendTicketId || toTrimmedValue(anonymousSession?.backendTicketId),
        })
      }
    }

    supportState = {
      ...supportState,
      tickets: combinedTickets,
      leads: nextLeads,
    }
    persistSupportTickets(combinedTickets)
    persistSupportLeads(nextLeads)
    backendRefreshLastCompletedAtMs = Date.now()
    emitSupportState()
    return { ok: true, ticketCount: combinedTickets.length, leadCount: nextLeads.length }
  })()
    .finally(() => {
      backendRefreshPromise = null
    })

  return backendRefreshPromise
}

const maybeRefreshSupportStateFromBackend = async ({
  maxAgeMs = SUPPORT_BACKEND_REFRESH_STALE_MS,
} = {}) => {
  const refreshAgeMs = Date.now() - backendRefreshLastCompletedAtMs
  if (backendRefreshPromise) return backendRefreshPromise
  if (backendRefreshLastCompletedAtMs > 0 && refreshAgeMs < Math.max(0, Number(maxAgeMs) || 0)) {
    return {
      ok: true,
      skipped: true,
      ticketCount: supportState.tickets.length,
      leadCount: supportState.leads.length,
    }
  }
  return refreshSupportStateFromBackend()
}

const ensureBackendChatSession = async ({
  clientEmail = '',
  clientName = 'Client User',
  businessName = '',
  reuseActive = true,
} = {}) => {
  const normalizedEmail = toEmail(clientEmail)
  const response = await requestJson('/api/notifications/chatbot/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'web',
      reuseActive,
      context: {
        clientEmail: normalizedEmail,
        clientName: toTrimmedValue(clientName),
        businessName: toTrimmedValue(businessName),
      },
    }),
  })
  if (!response.ok) {
    return { ok: false, message: response.message || 'Unable to initialize chatbot session.' }
  }
  const sessionId = toTrimmedValue(response?.data?.session?.sessionId)
  if (!sessionId) {
    return { ok: false, message: 'Chatbot session response is invalid.' }
  }
  return { ok: true, sessionId, session: response.data.session }
}

const buildAnonymousSupportTicketSubject = ({
  clientName = '',
  businessName = '',
} = {}) => {
  const normalizedClientName = toTrimmedValue(clientName)
  const normalizedBusinessName = toTrimmedValue(businessName)
  if (normalizedBusinessName) return `Support request from ${normalizedBusinessName}`
  if (normalizedClientName) return `Support request from ${normalizedClientName}`
  return 'Anonymous support request'
}

const ensureBackendAnonymousSupportTicket = async ({
  clientEmail = '',
  clientName = 'Website Visitor',
  businessName = '',
  reuseActive = true,
  forceNew = false,
  initialMessage = '',
} = {}) => {
  const normalizedClientEmail = toEmail(clientEmail)
  if (!normalizedClientEmail || !isLeadAliasEmail(normalizedClientEmail)) {
    return { ok: false, message: 'Anonymous support identity is missing.' }
  }
  if (!isBackendAnonymousSupportAvailable()) {
    return { ok: false, message: 'Network API unavailable.' }
  }

  const lead = getLeadByClientEmail(supportState.leads, normalizedClientEmail)
  const anonymousSession = getStoredAnonymousSupportSession()
  const sessionId = getActiveAnonymousSupportSessionId({
    createIfMissing: true,
    clientEmail: normalizedClientEmail,
    leadId: toTrimmedValue(lead?.id),
    leadLabel: toTrimmedValue(lead?.leadLabel),
    backendTicketId: toTrimmedValue(anonymousSession?.backendTicketId),
  })
  if (!sessionId) {
    return { ok: false, message: 'Anonymous support session is unavailable.' }
  }

  const readCandidateTicketFromList = (rows = []) => {
    const safeRows = Array.isArray(rows) ? rows : []
    const openTicket = safeRows.find((ticket) => {
      const status = toTrimmedValue(ticket?.status).toLowerCase()
      return status !== 'resolved' && status !== 'closed'
    })
    if (openTicket) return openTicket
    return safeRows[0] || null
  }

  if (!forceNew && reuseActive) {
    const listResponse = await requestJson(
      `/api/notifications/support/public/tickets?sessionId=${encodeURIComponent(sessionId)}&limit=30`,
    )
    if (listResponse.ok && Array.isArray(listResponse.data)) {
      const candidateTicket = readCandidateTicketFromList(listResponse.data)
      const candidateTicketId = toTrimmedValue(candidateTicket?.ticketId)
      if (candidateTicketId) {
        persistAnonymousLeadSession({
          leadId: toTrimmedValue(lead?.id),
          leadLabel: toTrimmedValue(lead?.leadLabel),
          clientEmail: normalizedClientEmail,
          anonymousSessionId: sessionId,
          backendTicketId: candidateTicketId,
        })
        return { ok: true, sessionId, ticketId: candidateTicketId, ticket: candidateTicket }
      }
    }
  }

  const createResponse = await requestJson('/api/notifications/support/public/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      leadLabel: toTrimmedValue(lead?.leadLabel),
      fullName: toTrimmedValue(lead?.fullName) || toTrimmedValue(clientName),
      contactEmail: toEmail(lead?.contactEmail),
      organizationType: normalizeLeadOrganizationType(lead?.organizationType),
      subject: buildAnonymousSupportTicketSubject({ clientName, businessName }),
      description: toTrimmedValue(initialMessage),
      priority: 'medium',
      channel: 'web',
      tags: ['anonymous', 'website'],
    }),
  })
  if (!createResponse.ok) {
    return { ok: false, message: createResponse.message || 'Unable to create anonymous support ticket.' }
  }

  const ticketId = toTrimmedValue(createResponse?.data?.ticket?.ticketId)
  if (!ticketId) {
    return { ok: false, message: 'Anonymous support ticket response is invalid.' }
  }

  persistAnonymousLeadSession({
    leadId: toTrimmedValue(lead?.id),
    leadLabel: toTrimmedValue(lead?.leadLabel),
    clientEmail: normalizedClientEmail,
    anonymousSessionId: sessionId,
    backendTicketId: ticketId,
  })
  return {
    ok: true,
    sessionId,
    ticketId,
    ticket: createResponse?.data?.ticket,
  }
}

export const ensureClientSupportThread = async ({
  clientEmail = '',
  clientName = 'Client User',
  businessName = '',
} = {}) => {
  const normalizedEmail = toEmail(clientEmail)
  if (!normalizedEmail) return { ok: false, message: 'Client email is required.' }

  if (isBackendSupportAvailable()) {
    const sessionResult = await ensureBackendChatSession({
      clientEmail: normalizedEmail,
      clientName,
      businessName,
      reuseActive: true,
    })
    if (sessionResult.ok) {
      await refreshSupportStateFromBackend()
      return { ok: true, ticketId: sessionResult.sessionId }
    }
  }

  let ticketId = ''
  updateSupportTickets((tickets) => {
    const result = ensureClientTicket({
      tickets,
      leads: supportState.leads,
      clientEmail: normalizedEmail,
      clientName,
      businessName,
      forceNew: false,
    })
    ticketId = result.ticket?.id || ''
    return result.tickets
  })
  const lead = getLeadByClientEmail(supportState.leads, normalizedEmail)
  if (lead && (!lead.ipAddress || !lead.location)) {
    void hydrateSupportLeadNetworkProfile({ clientEmail: normalizedEmail })
  }
  return { ok: Boolean(ticketId), ticketId }
}

export const startNewClientSupportThread = async ({
  clientEmail = '',
  clientName = 'Client User',
  businessName = '',
} = {}) => {
  const normalizedEmail = toEmail(clientEmail)
  if (!normalizedEmail) return { ok: false, message: 'Client email is required.' }

  if (isBackendSupportAvailable()) {
    const sessionResult = await ensureBackendChatSession({
      clientEmail: normalizedEmail,
      clientName,
      businessName,
      reuseActive: false,
    })
    if (sessionResult.ok) {
      await refreshSupportStateFromBackend()
      return { ok: true, ticketId: sessionResult.sessionId }
    }
  }

  let ticketId = ''
  updateSupportTickets((tickets) => {
    const autoClosedTickets = tickets.map((ticket) => {
      if (ticket.clientEmail !== normalizedEmail) return ticket
      if (ticket.status === SUPPORT_TICKET_STATUS.RESOLVED) return ticket
      const autoCloseMessage = createImmediateMessage({
        sender: SUPPORT_SENDER.SYSTEM,
        senderName: SUPPORT_COMPANY_NAME,
        text: 'This chat was closed automatically because a new chat was started.',
      })
      return updateTicketWithMessage({
        ticket: {
          ...ticket,
          status: SUPPORT_TICKET_STATUS.RESOLVED,
          resolvedAtIso: nowIso(),
          slaDueAtIso: '',
        },
        message: autoCloseMessage,
        incrementClientUnread: true,
      })
    })
    const result = ensureClientTicket({
      tickets: autoClosedTickets,
      leads: supportState.leads,
      clientEmail: normalizedEmail,
      clientName,
      businessName,
      forceNew: true,
    })
    ticketId = result.ticket?.id || ''
    return result.tickets
  })
  const lead = getLeadByClientEmail(supportState.leads, normalizedEmail)
  if (lead && (!lead.ipAddress || !lead.location)) {
    void hydrateSupportLeadNetworkProfile({ clientEmail: normalizedEmail })
  }
  return { ok: Boolean(ticketId), ticketId }
}

const appendOfflineNoticeToTicketById = (ticketId = '') => {
  const normalizedTicketId = toTrimmedValue(ticketId)
  if (!normalizedTicketId) return
  updateSupportTickets((tickets) => {
    const ticket = getTicketById(tickets, normalizedTicketId)
    if (!ticket) return tickets
    const nextTicket = appendAgentOfflineNoticeIfNeeded({
      ...ticket,
      channel: ticket.channel === SUPPORT_CHANNEL.HUMAN ? ticket.channel : SUPPORT_CHANNEL.HUMAN,
      status: ticket.status === SUPPORT_TICKET_STATUS.RESOLVED ? SUPPORT_TICKET_STATUS.OPEN : ticket.status,
      resolvedAtIso: '',
    })
    return replaceTicket(tickets, nextTicket)
  })
}

const appendWaitingNoticeToTicketById = (ticketId = '') => {
  const normalizedTicketId = toTrimmedValue(ticketId)
  if (!normalizedTicketId) return
  updateSupportTickets((tickets) => {
    const ticket = getTicketById(tickets, normalizedTicketId)
    if (!ticket) return tickets
    const latestMessage = Array.isArray(ticket.messages) ? ticket.messages[ticket.messages.length - 1] : null
    if (
      latestMessage?.sender === SUPPORT_SENDER.SYSTEM
      && toTrimmedValue(latestMessage?.text) === 'Please wait, an agent will be with you shortly.'
    ) {
      return tickets
    }
    const waitingNotice = createImmediateMessage({
      sender: SUPPORT_SENDER.SYSTEM,
      senderName: SUPPORT_COMPANY_NAME,
      text: 'Please wait, an agent will be with you shortly.',
    })
    const nextTicket = updateTicketWithMessage({
      ticket: {
        ...ticket,
        channel: SUPPORT_CHANNEL.HUMAN,
        status: ticket.status === SUPPORT_TICKET_STATUS.RESOLVED ? SUPPORT_TICKET_STATUS.OPEN : ticket.status,
        resolvedAtIso: '',
        slaDueAtIso: addHoursIso(nowIso(), 2),
      },
      message: waitingNotice,
      incrementClientUnread: true,
    })
    return replaceTicket(tickets, nextTicket)
  })
}

export const requestHumanSupport = async ({
  clientEmail = '',
  clientName = 'Client User',
  businessName = '',
  ticketId = '',
} = {}) => {
  const normalizedEmail = toEmail(clientEmail)
  const normalizedTicketId = toTrimmedValue(ticketId)
  const selectedTicket = normalizedTicketId ? getTicketById(supportState.tickets, normalizedTicketId) : null
  const latestClientMessage = (Array.isArray(selectedTicket?.messages) ? selectedTicket.messages : [])
    .filter((message) => message.sender === SUPPORT_SENDER.CLIENT)
    .slice(-1)[0]
  const supportAgentsOnline = isSupportAgentOnline()

  if (isBackendSupportTicketId(normalizedTicketId) && selectedTicket?.status !== SUPPORT_TICKET_STATUS.RESOLVED) {
    if (!supportAgentsOnline) {
      appendOfflineNoticeToTicketById(normalizedTicketId)
    } else {
      appendWaitingNoticeToTicketById(normalizedTicketId)
    }
    return { ok: true, ticketId: normalizedTicketId }
  }

  if (isBackendSupportAvailable()) {
    const fallbackSessionResult = await ensureBackendChatSession({
      clientEmail: normalizedEmail,
      clientName,
      businessName,
      reuseActive: true,
    })
    const sessionId = (
      (selectedTicket?.channel === SUPPORT_CHANNEL.BOT ? selectedTicket.id : '')
      || (normalizedTicketId.startsWith('chat_') ? normalizedTicketId : '')
      || (fallbackSessionResult.ok ? fallbackSessionResult.sessionId : '')
    )

    if (sessionId) {
      const escalateResponse = await requestJson(`/api/notifications/chatbot/sessions/${encodeURIComponent(sessionId)}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: `Support request from ${toTrimmedValue(clientName) || 'Client User'}`,
          summary: toTrimmedValue(latestClientMessage?.text) || `Escalation request for ${normalizedEmail || 'client account'}.`,
          priority: 'medium',
        }),
      })

      if (escalateResponse.ok) {
        const escalatedTicketId = toTrimmedValue(escalateResponse?.data?.ticketId) || normalizedTicketId
        await refreshSupportStateFromBackend()
        if (!supportAgentsOnline && escalatedTicketId) {
          appendOfflineNoticeToTicketById(escalatedTicketId)
        }
        return {
          ok: true,
          ticketId: escalatedTicketId,
        }
      }
    }
  }

  if (isLeadAliasEmail(normalizedEmail) && isBackendAnonymousSupportAvailable()) {
    const anonymousTicketResult = await ensureBackendAnonymousSupportTicket({
      clientEmail: normalizedEmail,
      clientName,
      businessName,
      reuseActive: true,
      forceNew: false,
      initialMessage: toTrimmedValue(latestClientMessage?.text) || toTrimmedValue(selectedTicket?.leadInquiryText),
    })
    if (anonymousTicketResult.ok && anonymousTicketResult.ticketId) {
      await refreshSupportStateFromBackend()
      if (!supportAgentsOnline) {
        appendOfflineNoticeToTicketById(anonymousTicketResult.ticketId)
      }
      return { ok: true, ticketId: anonymousTicketResult.ticketId }
    }
  }

  if (!supportAgentsOnline) {
    let offlineTicketId = normalizedTicketId
    updateSupportTickets((tickets) => {
      let workingTickets = tickets
      let targetTicket = normalizedTicketId ? getTicketById(workingTickets, normalizedTicketId) : null

      if (!targetTicket) {
        const ensureResult = ensureClientTicket({
          tickets: workingTickets,
          leads: supportState.leads,
          clientEmail: normalizedEmail,
          clientName,
          businessName,
        })
        workingTickets = ensureResult.tickets
        targetTicket = ensureResult.ticket
        offlineTicketId = targetTicket?.id || ''
      }

      if (!targetTicket) return workingTickets
      const nextTicket = appendAgentOfflineNoticeIfNeeded({
        ...targetTicket,
        channel: SUPPORT_CHANNEL.HUMAN,
        status: targetTicket.status === SUPPORT_TICKET_STATUS.RESOLVED ? SUPPORT_TICKET_STATUS.OPEN : targetTicket.status,
        resolvedAtIso: '',
        slaDueAtIso: '',
      })
      return replaceTicket(workingTickets, nextTicket)
    })
    return { ok: Boolean(offlineTicketId), ticketId: offlineTicketId }
  }

  let nextTicketId = normalizedTicketId
  updateSupportTickets((tickets) => {
    let workingTickets = tickets
    let targetTicket = normalizedTicketId ? getTicketById(workingTickets, normalizedTicketId) : null

    if (!targetTicket) {
      const ensureResult = ensureClientTicket({
        tickets: workingTickets,
        leads: supportState.leads,
        clientEmail: normalizedEmail,
        clientName,
        businessName,
      })
      workingTickets = ensureResult.tickets
      targetTicket = ensureResult.ticket
      nextTicketId = targetTicket?.id || ''
    }

    if (!targetTicket) return workingTickets
    if (targetTicket.channel === SUPPORT_CHANNEL.HUMAN && targetTicket.status !== SUPPORT_TICKET_STATUS.RESOLVED) {
      return workingTickets
    }

    const waitingNotice = createImmediateMessage({
      sender: SUPPORT_SENDER.SYSTEM,
      senderName: SUPPORT_COMPANY_NAME,
      text: 'Please wait, an agent will be with you shortly.',
    })
    const nextTicket = updateTicketWithMessage({
      ticket: {
        ...targetTicket,
        channel: SUPPORT_CHANNEL.HUMAN,
        status: targetTicket.status === SUPPORT_TICKET_STATUS.RESOLVED ? SUPPORT_TICKET_STATUS.OPEN : targetTicket.status,
        resolvedAtIso: '',
        slaDueAtIso: addHoursIso(nowIso(), 2),
      },
      message: waitingNotice,
      incrementClientUnread: true,
    })
    return replaceTicket(workingTickets, nextTicket)
  })
  return { ok: Boolean(nextTicketId), ticketId: nextTicketId }
}

const appendLeadIntakeBotMessage = ({
  ticketId = '',
  text = '',
} = {}) => {
  const normalizedText = toTrimmedValue(text)
  if (!toTrimmedValue(ticketId) || !normalizedText) return
  updateSupportTickets((tickets) => {
    const ticket = getTicketById(tickets, ticketId)
    if (!ticket) return tickets
    const botMessage = createImmediateMessage({
      sender: SUPPORT_SENDER.BOT,
      senderName: 'Kiamina Support Bot',
      text: normalizedText,
    })
    const nextTicket = updateTicketWithMessage({
      ticket,
      message: botMessage,
      incrementClientUnread: true,
    })
    return replaceTicket(tickets, nextTicket)
  })
}

const updateLeadById = (leadId = '', updater = null) => {
  const normalizedLeadId = toTrimmedValue(leadId)
  if (!normalizedLeadId || typeof updater !== 'function') return null
  let nextLead = null
  updateSupportLeads((leads) => {
    const lead = getLeadById(leads, normalizedLeadId)
    if (!lead) return leads
    const candidate = updater(lead)
    if (!candidate) return leads
    nextLead = normalizeLead({
      ...lead,
      ...candidate,
      updatedAtIso: nowIso(),
    })
    return replaceLead(leads, nextLead)
  })
  if (nextLead) refreshLeadLinkedTickets(nextLead)
  if (nextLead) {
    void syncPublicSupportLeadToBackend({ lead: nextLead })
    if (normalizeLeadCategories(nextLead.leadCategories, nextLead.leadCategory).includes(LEAD_CATEGORY.NEWSLETTER_SUBSCRIBER)) {
      void syncPublicNewsletterLeadToBackend({ lead: nextLead })
    }
  }
  return nextLead
}

const handleLeadIntakeOnDeliveredMessage = ({
  ticketId = '',
  messageId = '',
} = {}) => {
  const ticket = getTicketById(supportState.tickets, ticketId)
  if (!ticket || !ticket.isLead) return { handled: false }
  if (!hasLeadCategory(ticket, LEAD_CATEGORY.INQUIRY_FOLLOW_UP)) return { handled: false }

  const deliveredMessage = findMessage(ticket, messageId)
  if (!deliveredMessage || deliveredMessage.sender !== SUPPORT_SENDER.CLIENT) return { handled: false }
  const userText = toTrimmedValue(deliveredMessage.text)
  const lead = getLeadById(supportState.leads, ticket.leadId) || getLeadByClientEmail(supportState.leads, ticket.clientEmail)
  if (!lead) return { handled: false }

  const stage = normalizeLeadIntakeStage(ticket.leadIntakeStage) || getLeadIntakeStage(lead)
  if (stage === LEAD_INTAKE_STAGE.COMPLETE) {
    return { handled: false }
  }

  if (stage === LEAD_INTAKE_STAGE.FULL_NAME) {
    const normalizedFullName = normalizeIntakeFullName(userText)
    if (!normalizedFullName || isValidEmail(normalizedFullName)) {
      appendLeadIntakeBotMessage({
        ticketId,
        text: buildLeadIntakePrompt({ stage: LEAD_INTAKE_STAGE.FULL_NAME }),
      })
      return { handled: true }
    }
    const updatedLead = updateLeadById(lead.id, () => ({
      fullName: normalizedFullName,
      intakeStage: LEAD_INTAKE_STAGE.EMAIL,
      intakeComplete: false,
      leadCategories: normalizeLeadCategories(lead.leadCategories, lead.leadCategory, LEAD_CATEGORY.INQUIRY_FOLLOW_UP),
      leadCategory: LEAD_CATEGORY.INQUIRY_FOLLOW_UP,
    }))
    appendLeadIntakeBotMessage({
      ticketId,
      text: buildLeadIntakePrompt({
        stage: LEAD_INTAKE_STAGE.EMAIL,
        firstName: getFirstName(updatedLead?.fullName || normalizedFullName),
      }),
    })
    return { handled: true }
  }

  if (stage === LEAD_INTAKE_STAGE.EMAIL) {
    if (!isValidEmail(userText)) {
      appendLeadIntakeBotMessage({
        ticketId,
        text: 'Please share a valid email address so we can follow up with you.',
      })
      return { handled: true }
    }
    const normalizedContactEmail = toEmail(userText)
    const existingLeadByEmail = getLeadByContactEmail(supportState.leads, normalizedContactEmail)
    if (existingLeadByEmail && existingLeadByEmail.id !== lead.id) {
      let mergedLead = null
      updateSupportLeads((leads) => {
        const baseLead = getLeadById(leads, existingLeadByEmail.id) || existingLeadByEmail
        mergedLead = normalizeLead({
          ...baseLead,
          fullName: baseLead.fullName || lead.fullName,
          contactEmail: normalizedContactEmail,
          leadCategories: normalizeLeadCategories(
            baseLead.leadCategories,
            baseLead.leadCategory,
            lead.leadCategories,
            lead.leadCategory,
            LEAD_CATEGORY.INQUIRY_FOLLOW_UP,
          ),
          leadCategory: LEAD_CATEGORY.INQUIRY_FOLLOW_UP,
          intakeStage: LEAD_INTAKE_STAGE.INQUIRY,
          intakeComplete: false,
          updatedAtIso: nowIso(),
        })
        const filteredLeads = leads.filter((entry) => (
          entry.id !== lead.id && entry.id !== baseLead.id
        ))
        return replaceLead(filteredLeads, mergedLead)
      })

      if (mergedLead) {
        void syncPublicSupportLeadToBackend({ lead: mergedLead })
        updateSupportTickets((tickets) => (
          tickets.map((item) => {
            const sameLead = toTrimmedValue(item.leadId) === toTrimmedValue(lead.id)
            const sameClientEmail = toEmail(item.clientEmail) === toEmail(lead.clientEmail)
            const sameMergedLead = toTrimmedValue(item.leadId) === toTrimmedValue(mergedLead.id)
            if (!sameLead && !sameClientEmail && !sameMergedLead) return item
            return normalizeTicket({
              ...item,
              isLead: true,
              leadId: mergedLead.id,
              leadLabel: mergedLead.leadLabel,
              leadFullName: mergedLead.fullName,
              leadContactEmail: mergedLead.contactEmail,
              leadOrganizationType: mergedLead.organizationType,
              leadCategory: mergedLead.leadCategory,
              leadCategories: mergedLead.leadCategories,
              leadInquiryText: mergedLead.inquiryText,
              leadIntakeStage: item.id === ticketId ? LEAD_INTAKE_STAGE.INQUIRY : item.leadIntakeStage,
              leadIpAddress: mergedLead.ipAddress,
              leadLocation: mergedLead.location,
              clientName: mergedLead.leadLabel || item.clientName,
            })
          })
        ))
        persistAnonymousLeadSession({
          leadId: mergedLead.id,
          leadLabel: mergedLead.leadLabel,
          clientEmail: mergedLead.clientEmail,
        })
      }
    } else {
      updateLeadById(lead.id, () => ({
        contactEmail: normalizedContactEmail,
        intakeStage: LEAD_INTAKE_STAGE.INQUIRY,
        intakeComplete: false,
        leadCategories: normalizeLeadCategories(lead.leadCategories, lead.leadCategory, LEAD_CATEGORY.INQUIRY_FOLLOW_UP),
        leadCategory: LEAD_CATEGORY.INQUIRY_FOLLOW_UP,
      }))
    }
    appendLeadIntakeBotMessage({
      ticketId,
      text: buildLeadIntakePrompt({ stage: LEAD_INTAKE_STAGE.INQUIRY }),
    })
    return { handled: true }
  }

  if (stage === LEAD_INTAKE_STAGE.INQUIRY) {
    if (!userText) {
      appendLeadIntakeBotMessage({
        ticketId,
        text: buildLeadIntakePrompt({ stage: LEAD_INTAKE_STAGE.INQUIRY }),
      })
      return { handled: true }
    }
    updateLeadById(lead.id, () => ({
      inquiryText: userText,
      intakeStage: LEAD_INTAKE_STAGE.COMPLETE,
      intakeComplete: true,
      leadCategories: normalizeLeadCategories(lead.leadCategories, lead.leadCategory, LEAD_CATEGORY.INQUIRY_FOLLOW_UP),
      leadCategory: LEAD_CATEGORY.INQUIRY_FOLLOW_UP,
    }))
    return {
      handled: true,
      stageCompleted: true,
      inquiryText: userText,
    }
  }

  return { handled: false }
}

export const sendClientSupportMessage = async ({
  clientEmail = '',
  clientName = 'Client User',
  businessName = '',
  ticketId = '',
  text = '',
  attachments = [],
} = {}) => {
  const normalizedEmail = toEmail(clientEmail)
  const normalizedTicketId = toTrimmedValue(ticketId)
  const messageText = String(text || '')
  const normalizedAttachments = (Array.isArray(attachments) ? attachments : []).map((attachment, index) => normalizeAttachment(attachment, index))
  const selectedTicket = normalizedTicketId ? getTicketById(supportState.tickets, normalizedTicketId) : null
  const activeSupportTicket = sortTickets(supportState.tickets.filter((ticket) => (
    ticket.clientEmail === normalizedEmail
    && ticket.status !== SUPPORT_TICKET_STATUS.RESOLVED
    && isBackendSupportTicketId(ticket.id)
  )))[0] || null
  const targetSupportTicket = isBackendSupportTicketId(selectedTicket?.id) ? selectedTicket : activeSupportTicket
  if (!normalizedEmail) return { ok: false, message: 'Client email is required.' }
  if (!toTrimmedValue(messageText) && normalizedAttachments.length === 0) return { ok: false, message: 'Message cannot be empty.' }

  if (isBackendSupportAvailable()) {
    const shouldUseSupportTicket = Boolean(targetSupportTicket) || normalizedAttachments.length > 0
    if (shouldUseSupportTicket) {
      let supportTicketId = toTrimmedValue(targetSupportTicket?.id)
      let createdSupportTicket = null

      if (!supportTicketId) {
        const createTicketResponse = await requestJson('/api/notifications/support/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: toTrimmedValue(messageText).slice(0, 180) || 'Support request with attachment',
            description: '',
            priority: 'medium',
            channel: 'web',
            tags: ['attachment'],
          }),
        })
        if (createTicketResponse.ok) {
          supportTicketId = toTrimmedValue(createTicketResponse?.data?.ticket?.ticketId)
          createdSupportTicket = createTicketResponse?.data?.ticket || null
        }
      }

      if (supportTicketId) {
        const supportMessageResponse = await requestJson(`/api/notifications/support/tickets/${encodeURIComponent(supportTicketId)}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: toTrimmedValue(messageText) || 'Attachment uploaded by client.',
            senderDisplayName: toTrimmedValue(clientName) || 'Client User',
            visibility: 'public',
            attachments: toOutgoingSupportAttachments(normalizedAttachments),
          }),
        })
        if (supportMessageResponse.ok) {
          mergeBackendSupportMessageIntoState({
            ticketId: supportTicketId,
            ticket: createdSupportTicket || targetSupportTicket,
            message: supportMessageResponse?.data?.data,
            clientEmail: normalizedEmail,
            clientName,
            businessName,
          })
          void refreshSupportStateFromBackend()
          return {
            ok: true,
            ticketId: supportTicketId,
            messageId: toTrimmedValue(supportMessageResponse?.data?.data?.id || supportMessageResponse?.data?.data?._id),
          }
        }
      }
    }

    const sessionResult = await ensureBackendChatSession({
      clientEmail: normalizedEmail,
      clientName,
      businessName,
      reuseActive: true,
    })
    if (sessionResult.ok) {
      const chatMessageResponse = await requestJson(`/api/notifications/chatbot/sessions/${encodeURIComponent(sessionResult.sessionId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: toTrimmedValue(messageText),
          includeCitations: true,
        }),
      })
      if (chatMessageResponse.ok) {
        if (shouldRequestAgent(messageText)) {
          await requestHumanSupport({
            clientEmail: normalizedEmail,
            clientName,
            businessName,
            ticketId: sessionResult.sessionId,
          })
        } else {
          mergeBackendChatSessionIntoState({
            session: chatMessageResponse?.data?.session || sessionResult.session,
            clientEmail: normalizedEmail,
            clientName,
            businessName,
            messages: [
              chatMessageResponse?.data?.userMessage,
            ].filter(Boolean),
          })
          if (chatMessageResponse?.data?.assistantMessage) {
            queueBotReplyDisplay({
              ticketId: sessionResult.sessionId,
              replyMessage: mapChatMessagesFromBackend([
                chatMessageResponse.data.assistantMessage,
              ], { sessionId: sessionResult.sessionId })[0] || null,
            })
          }
        }
        return {
          ok: true,
          ticketId: sessionResult.sessionId,
          messageId: toTrimmedValue(chatMessageResponse?.data?.userMessage?.id || chatMessageResponse?.data?.userMessage?._id),
        }
      }
    }
  }

  if (isLeadAliasEmail(normalizedEmail) && isBackendAnonymousSupportAvailable()) {
    const shouldUseAnonymousSupportTicket = Boolean(targetSupportTicket) || normalizedAttachments.length > 0
    if (shouldUseAnonymousSupportTicket) {
      const lead = getLeadByClientEmail(supportState.leads, normalizedEmail)
      let supportTicketId = toTrimmedValue(targetSupportTicket?.id)
      let createdSupportTicket = null
      let anonymousSessionId = getActiveAnonymousSupportSessionId({
        createIfMissing: true,
        clientEmail: normalizedEmail,
        leadId: toTrimmedValue(lead?.id),
        leadLabel: toTrimmedValue(lead?.leadLabel),
        backendTicketId: supportTicketId,
      })

      if (!supportTicketId) {
        const anonymousTicketResult = await ensureBackendAnonymousSupportTicket({
          clientEmail: normalizedEmail,
          clientName,
          businessName,
          reuseActive: true,
          forceNew: false,
          initialMessage: '',
        })
        if (anonymousTicketResult.ok) {
          supportTicketId = toTrimmedValue(anonymousTicketResult.ticketId)
          createdSupportTicket = anonymousTicketResult.ticket || null
          anonymousSessionId = toTrimmedValue(anonymousTicketResult.sessionId) || anonymousSessionId
        }
      }

      if (supportTicketId && anonymousSessionId) {
        const supportMessageResponse = await requestJson(`/api/notifications/support/public/tickets/${encodeURIComponent(supportTicketId)}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: anonymousSessionId,
            content: toTrimmedValue(messageText) || 'Attachment uploaded by client.',
            senderDisplayName: toTrimmedValue(clientName) || toTrimmedValue(lead?.fullName) || toTrimmedValue(lead?.leadLabel) || 'Website Visitor',
            attachments: toOutgoingSupportAttachments(normalizedAttachments),
          }),
        })
        if (supportMessageResponse.ok) {
          mergeBackendSupportMessageIntoState({
            ticketId: supportTicketId,
            ticket: createdSupportTicket || targetSupportTicket,
            message: supportMessageResponse?.data?.data,
            clientEmail: normalizedEmail,
            clientName,
            businessName,
          })
          void refreshSupportStateFromBackend()
          return {
            ok: true,
            ticketId: supportTicketId,
            messageId: toTrimmedValue(supportMessageResponse?.data?.data?.id || supportMessageResponse?.data?.data?._id),
          }
        }
      }
    }
  }

  let queuedTicketId = ''
  let messageId = ''
  let queuedText = messageText
  updateSupportTickets((tickets) => {
    let ensureResult = ensureClientTicket({
      tickets,
      leads: supportState.leads,
      clientEmail: normalizedEmail,
      clientName,
      businessName,
      forceNew: false,
    })
    let ticket = ensureResult.ticket
    if (ticket?.status === SUPPORT_TICKET_STATUS.RESOLVED) {
      ensureResult = ensureClientTicket({
        tickets: ensureResult.tickets,
        leads: supportState.leads,
        clientEmail: normalizedEmail,
        clientName,
        businessName,
        forceNew: true,
      })
      ticket = ensureResult.ticket
    }
    if (!ticket) return tickets

    const pendingMessage = createPendingMessage({
      sender: SUPPORT_SENDER.CLIENT,
      senderName: toTrimmedValue(clientName) || 'Client User',
      text: queuedText,
      attachments: normalizedAttachments,
      retryCount: 0,
    })
    queuedTicketId = ticket.id
    messageId = pendingMessage.id

    const nextTicket = updateTicketWithMessage({
      ticket,
      message: pendingMessage,
    })
    return replaceTicket(ensureResult.tickets, nextTicket)
  })

  if (!queuedTicketId || !messageId) return { ok: false, message: 'Unable to queue message.' }

  queueMessageDelivery({
    ticketId: queuedTicketId,
    messageId,
    sender: SUPPORT_SENDER.CLIENT,
    retryCount: 0,
    text: queuedText,
    onSent: () => {
      const intakeResult = handleLeadIntakeOnDeliveredMessage({
        ticketId: queuedTicketId,
        messageId,
      })
      if (intakeResult.handled && !intakeResult.stageCompleted) return

      const snapshot = getSupportCenterSnapshot()
      const ticket = getTicketById(snapshot.tickets, queuedTicketId)
      const deliveredMessage = findMessage(ticket, messageId)
      if (!ticket || !deliveredMessage) return
      const effectivePromptText = intakeResult.stageCompleted
        ? (intakeResult.inquiryText || deliveredMessage.text)
        : deliveredMessage.text
      if (shouldRequestAgent(effectivePromptText)) {
        requestHumanSupport({
          clientEmail: normalizedEmail,
          clientName,
          businessName,
          ticketId: queuedTicketId,
        })
        return
      }
      if (ticket.channel === SUPPORT_CHANNEL.BOT) {
        appendBotReply({ ticketId: queuedTicketId, promptText: effectivePromptText })
      }
    },
  })

  return { ok: true, ticketId: queuedTicketId, messageId }
}

export const sendAdminSupportMessage = async ({
  ticketId = '',
  adminName = '',
  adminEmail = '',
  text = '',
  attachments = [],
} = {}) => {
  const messageText = String(text || '')
  const normalizedAttachments = (Array.isArray(attachments) ? attachments : []).map((attachment, index) => normalizeAttachment(attachment, index))
  if (!toTrimmedValue(ticketId)) return { ok: false, message: 'Ticket is required.' }
  if (!toTrimmedValue(messageText) && normalizedAttachments.length === 0) return { ok: false, message: 'Reply cannot be empty.' }

  if (isBackendSupportAvailable()) {
    const actor = getActorIdentity()
    await requestJson(`/api/notifications/support/tickets/${encodeURIComponent(ticketId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'in-progress',
        assignedToUid: actor.uid,
      }),
    })
    const response = await requestJson(`/api/notifications/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: messageText,
        senderDisplayName: getAgentDisplayName(adminName, adminEmail),
        visibility: 'public',
        attachments: toOutgoingSupportAttachments(normalizedAttachments),
      }),
    })
    if (response.ok) {
      const assignedAdminMeta = readAssignedAdminMetaMap()
      assignedAdminMeta[ticketId] = {
        name: getAgentDisplayName(adminName, adminEmail),
        email: toEmail(adminEmail) || actor.email,
      }
      persistAssignedAdminMetaMap(assignedAdminMeta)
      await refreshSupportStateFromBackend()
      return {
        ok: true,
        ticketId,
        messageId: toTrimmedValue(response?.data?.data?.id || response?.data?.data?._id),
      }
    }
  }

  let messageId = ''
  updateSupportTickets((tickets) => {
    const ticket = getTicketById(tickets, ticketId)
    if (!ticket) return tickets
    if (ticket.status === SUPPORT_TICKET_STATUS.RESOLVED) return tickets
    const normalizedAdminName = getAgentDisplayName(
      adminName || ticket.assignedAdminName,
      adminEmail || ticket.assignedAdminEmail,
    )
    const hasPriorAgentReply = ticket.messages.some((message) => message.sender === SUPPORT_SENDER.AGENT)
    const trimmedMessageText = toTrimmedValue(messageText)
    const composedMessageText = hasPriorAgentReply
      ? messageText
      : (trimmedMessageText ? `${buildAgentHandoffMessage(normalizedAdminName)} ${trimmedMessageText}` : buildAgentHandoffMessage(normalizedAdminName))

    const pendingMessage = createPendingMessage({
      sender: SUPPORT_SENDER.AGENT,
      senderName: normalizedAdminName,
      text: composedMessageText,
      attachments: normalizedAttachments,
      retryCount: 0,
    })
    messageId = pendingMessage.id
    const nextTicket = updateTicketWithMessage({
      ticket: {
        ...ticket,
        status: SUPPORT_TICKET_STATUS.ASSIGNED,
        channel: SUPPORT_CHANNEL.HUMAN,
        assignedAdminName: normalizedAdminName,
        assignedAdminEmail: toEmail(adminEmail) || ticket.assignedAdminEmail,
        resolvedAtIso: '',
        slaDueAtIso: addHoursIso(nowIso(), 1),
      },
      message: pendingMessage,
    })
    return replaceTicket(tickets, nextTicket)
  })

  if (!messageId) return { ok: false, message: 'Unable to queue reply.' }

  queueMessageDelivery({
    ticketId,
    messageId,
    sender: SUPPORT_SENDER.AGENT,
    retryCount: 0,
    text: messageText,
  })
  return { ok: true, ticketId, messageId }
}

export const retrySupportMessage = async ({
  ticketId = '',
  messageId = '',
} = {}) => {
  if (!toTrimmedValue(ticketId) || !toTrimmedValue(messageId)) {
    return { ok: false, message: 'Ticket and message are required.' }
  }

  if (isBackendSupportAvailable() || (isBackendAnonymousSupportAvailable() && toTrimmedValue(ticketId).startsWith('sup_'))) {
    await refreshSupportStateFromBackend()
    return { ok: false, message: 'Message retry is not required for delivered backend messages.' }
  }

  let queuedSender = SUPPORT_SENDER.CLIENT
  let queuedText = ''
  let queuedRetryCount = 0
  let canQueue = false
  updateSupportTickets((tickets) => {
    const ticket = getTicketById(tickets, ticketId)
    if (!ticket) return tickets
    const targetMessage = findMessage(ticket, messageId)
    if (!targetMessage || targetMessage.deliveryStatus !== SUPPORT_MESSAGE_STATUS.FAILED) return tickets

    queuedSender = targetMessage.sender
    queuedText = targetMessage.text
    queuedRetryCount = (targetMessage.retryCount || 0) + 1
    canQueue = true

    const nextMessage = {
      ...targetMessage,
      deliveryStatus: SUPPORT_MESSAGE_STATUS.SENDING,
      deliveryError: '',
      retryCount: queuedRetryCount,
    }
    const nextMessages = ticket.messages.map((message) => (
      message.id === messageId ? nextMessage : message
    ))
    const nextTicket = {
      ...ticket,
      updatedAtIso: nowIso(),
      messages: nextMessages,
    }
    return replaceTicket(tickets, nextTicket)
  })

  if (!canQueue) return { ok: false, message: 'Message is not retryable.' }

  queueMessageDelivery({
    ticketId,
    messageId,
    sender: queuedSender,
    retryCount: queuedRetryCount,
    text: queuedText,
    onSent: () => {
      if (queuedSender !== SUPPORT_SENDER.CLIENT) return
      const intakeResult = handleLeadIntakeOnDeliveredMessage({
        ticketId,
        messageId,
      })
      if (intakeResult.handled && !intakeResult.stageCompleted) return
      const snapshot = getSupportCenterSnapshot()
      const ticket = getTicketById(snapshot.tickets, ticketId)
      const deliveredMessage = findMessage(ticket, messageId)
      if (!ticket || !deliveredMessage) return
      const effectivePromptText = intakeResult.stageCompleted
        ? (intakeResult.inquiryText || deliveredMessage.text)
        : deliveredMessage.text
      if (shouldRequestAgent(effectivePromptText)) {
        requestHumanSupport({
          clientEmail: ticket.clientEmail,
          clientName: ticket.clientName,
          businessName: ticket.businessName,
          ticketId,
        })
        return
      }
      if (ticket.channel === SUPPORT_CHANNEL.BOT) {
        appendBotReply({ ticketId, promptText: effectivePromptText })
      }
    },
  })
  return { ok: true, ticketId, messageId }
}

export const markSupportTicketReadByClient = (ticketId = '') => {
  if (!toTrimmedValue(ticketId)) return
  const readMap = readIsoMapFromStorage(SUPPORT_CLIENT_READ_STORAGE_KEY)
  readMap[ticketId] = nowIso()
  persistIsoMapToStorage(SUPPORT_CLIENT_READ_STORAGE_KEY, readMap)

  if (isBackendSupportAvailable()) {
    updateSupportTickets((tickets) => (
      tickets.map((ticket) => (
        ticket.id === ticketId ? withComputedUnreadCounts(ticket) : ticket
      ))
    ))
    return
  }

  updateSupportTickets((tickets) => {
    const ticket = getTicketById(tickets, ticketId)
    if (!ticket) return tickets
    if (!ticket.unreadByClient) return tickets
    const nextTicket = {
      ...ticket,
      unreadByClient: 0,
      messages: ticket.messages.map((message) => (
        message.sender === SUPPORT_SENDER.CLIENT ? message : { ...message, readByClient: true }
      )),
    }
    return replaceTicket(tickets, nextTicket)
  })
}

export const markSupportTicketReadByAdmin = (ticketId = '') => {
  if (!toTrimmedValue(ticketId)) return
  const readMap = readIsoMapFromStorage(SUPPORT_ADMIN_READ_STORAGE_KEY)
  readMap[ticketId] = nowIso()
  persistIsoMapToStorage(SUPPORT_ADMIN_READ_STORAGE_KEY, readMap)

  if (isBackendSupportAvailable()) {
    updateSupportTickets((tickets) => (
      tickets.map((ticket) => (
        ticket.id === ticketId ? withComputedUnreadCounts(ticket) : ticket
      ))
    ))
    return
  }

  updateSupportTickets((tickets) => {
    const ticket = getTicketById(tickets, ticketId)
    if (!ticket) return tickets
    if (!ticket.unreadByAdmin) return tickets
    const nextTicket = {
      ...ticket,
      unreadByAdmin: 0,
      messages: ticket.messages.map((message) => (
        message.sender === SUPPORT_SENDER.AGENT ? message : { ...message, readByAdmin: true }
      )),
    }
    return replaceTicket(tickets, nextTicket)
  })
}

export const assignSupportTicket = async ({
  ticketId = '',
  adminName = '',
  adminEmail = '',
} = {}) => {
  if (!toTrimmedValue(ticketId)) return { ok: false, message: 'Ticket is required.' }

  if (isBackendSupportAvailable()) {
    const actor = getActorIdentity()
    const response = await requestJson(`/api/notifications/support/tickets/${encodeURIComponent(ticketId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'in-progress',
        assignedToUid: actor.uid,
      }),
    })
    if (response.ok) {
      const assignedAdminMeta = readAssignedAdminMetaMap()
      assignedAdminMeta[ticketId] = {
        name: getAgentDisplayName(adminName, adminEmail),
        email: toEmail(adminEmail) || actor.email,
      }
      persistAssignedAdminMetaMap(assignedAdminMeta)
      await refreshSupportStateFromBackend()
      return { ok: true, ticketId }
    }
  }

  let updated = false
  updateSupportTickets((tickets) => {
    const ticket = getTicketById(tickets, ticketId)
    if (!ticket) return tickets
    if (ticket.status === SUPPORT_TICKET_STATUS.RESOLVED) return tickets
    const normalizedAdminName = getAgentDisplayName(
      adminName || ticket.assignedAdminName,
      adminEmail || ticket.assignedAdminEmail,
    )
    const hasPriorAgentReply = ticket.messages.some((message) => message.sender === SUPPORT_SENDER.AGENT)
    const assignmentMessage = hasPriorAgentReply
      ? createImmediateMessage({
          sender: SUPPORT_SENDER.SYSTEM,
          senderName: SUPPORT_COMPANY_NAME,
          text: `Ticket assigned to ${normalizedAdminName}.`,
        })
      : createImmediateMessage({
          sender: SUPPORT_SENDER.AGENT,
          senderName: normalizedAdminName,
          text: buildAgentHandoffMessage(normalizedAdminName),
        })
    const nextTicket = updateTicketWithMessage({
      ticket: {
        ...ticket,
        status: SUPPORT_TICKET_STATUS.ASSIGNED,
        channel: SUPPORT_CHANNEL.HUMAN,
        assignedAdminName: normalizedAdminName,
        assignedAdminEmail: toEmail(adminEmail) || ticket.assignedAdminEmail,
        resolvedAtIso: '',
        slaDueAtIso: addHoursIso(nowIso(), 1),
      },
      message: assignmentMessage,
      incrementClientUnread: true,
    })
    updated = true
    return replaceTicket(tickets, nextTicket)
  })
  return updated ? { ok: true, ticketId } : { ok: false, message: 'Unable to assign ticket.' }
}

export const resolveSupportTicket = async ({
  ticketId = '',
  adminName = '',
} = {}) => {
  if (!toTrimmedValue(ticketId)) return { ok: false, message: 'Ticket is required.' }

  if (isBackendSupportAvailable()) {
    const response = await requestJson(`/api/notifications/support/tickets/${encodeURIComponent(ticketId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'resolved',
      }),
    })
    if (response.ok) {
      await refreshSupportStateFromBackend()
      return { ok: true, ticketId }
    }
  }

  let updated = false
  updateSupportTickets((tickets) => {
    const ticket = getTicketById(tickets, ticketId)
    if (!ticket) return tickets
    if (ticket.status === SUPPORT_TICKET_STATUS.RESOLVED) return tickets
    const normalizedAdminName = getAgentDisplayName(adminName, ticket.assignedAdminEmail)
    const resolutionMessage = createImmediateMessage({
      sender: SUPPORT_SENDER.SYSTEM,
      senderName: SUPPORT_COMPANY_NAME,
      text: `Ticket resolved by ${normalizedAdminName}.`,
    })
    const nextTicket = updateTicketWithMessage({
      ticket: {
        ...ticket,
        status: SUPPORT_TICKET_STATUS.RESOLVED,
        resolvedAtIso: nowIso(),
        slaDueAtIso: '',
      },
      message: resolutionMessage,
      incrementClientUnread: true,
    })
    updated = true
    return replaceTicket(tickets, nextTicket)
  })
  return updated ? { ok: true, ticketId } : { ok: false, message: 'Unable to resolve ticket.' }
}

export const reopenSupportTicket = async ({
  ticketId = '',
  adminName = '',
} = {}) => {
  if (!toTrimmedValue(ticketId)) return { ok: false, message: 'Ticket is required.' }

  if (isBackendSupportAvailable()) {
    const response = await requestJson(`/api/notifications/support/tickets/${encodeURIComponent(ticketId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'open',
      }),
    })
    if (response.ok) {
      await refreshSupportStateFromBackend()
      return { ok: true, ticketId }
    }
  }

  let updated = false
  updateSupportTickets((tickets) => {
    const ticket = getTicketById(tickets, ticketId)
    if (!ticket) return tickets
    if (ticket.status !== SUPPORT_TICKET_STATUS.RESOLVED) return tickets
    const normalizedAdminName = getAgentDisplayName(adminName, ticket.assignedAdminEmail)
    const reopenMessage = createImmediateMessage({
      sender: SUPPORT_SENDER.SYSTEM,
      senderName: SUPPORT_COMPANY_NAME,
      text: `Ticket reopened by ${normalizedAdminName}.`,
    })
    const nextTicket = updateTicketWithMessage({
      ticket: {
        ...ticket,
        status: SUPPORT_TICKET_STATUS.OPEN,
        channel: SUPPORT_CHANNEL.HUMAN,
        resolvedAtIso: '',
        slaDueAtIso: addHoursIso(nowIso(), 2),
      },
      message: reopenMessage,
      incrementClientUnread: true,
    })
    updated = true
    return replaceTicket(tickets, nextTicket)
  })
  return updated ? { ok: true, ticketId } : { ok: false, message: 'Unable to reopen ticket.' }
}

supportState = {
  tickets: readSupportTickets(),
  leads: readSupportLeads(),
}
updateLeadSequenceFromLeads(supportState.leads)
bindStorageListener()
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    void maybeRefreshSupportStateFromBackend()
  })
}
void refreshSupportStateFromBackend()

export {
  SUPPORT_TICKETS_STORAGE_KEY,
  SUPPORT_LEADS_STORAGE_KEY,
  SUPPORT_TICKET_STATUS,
  SUPPORT_CHANNEL,
  SUPPORT_MESSAGE_STATUS,
  SUPPORT_SENDER,
  LEAD_ORGANIZATION_TYPE,
  LEAD_CATEGORY,
}
