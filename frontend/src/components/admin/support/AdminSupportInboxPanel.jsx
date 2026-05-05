import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle, Clock, Copy, Download, Eye, Paperclip, RotateCcw, Send, UserCheck } from 'lucide-react'
import {
  assignSupportTicket,
  formatSupportSlaCountdown,
  getSupportCenterSnapshot,
  markSupportTicketReadByAdmin,
  refreshSupportStateFromBackend,
  reopenSupportTicket,
  resolveSupportTicket,
  retrySupportMessage,
  sendAdminSupportMessage,
  subscribeSupportCenter,
  SUPPORT_MESSAGE_STATUS,
  SUPPORT_SENDER,
  SUPPORT_TICKET_STATUS,
} from '../../../utils/supportCenter'
import DotLottiePreloader from '../../common/DotLottiePreloader'
import SupportAttachmentPreviewModal from '../../common/SupportAttachmentPreviewModal'
import {
  buildSupportAttachmentPreview,
  createSupportAttachmentsFromFiles,
  getSupportAttachmentBlob,
} from '../../../utils/supportAttachments'
import { playSupportNotificationSound, SUPPORT_NOTIFICATION_INITIAL_DELAY_MS } from '../../../utils/supportNotificationSound'
import { isAdminNotificationSoundEnabled } from '../../../utils/adminSecurityPreferences'

const buildAdminQuickReplies = (adminFirstName = 'Support') => ([
  `Hi, my name is ${adminFirstName} from Kiamina Accounting Services. We are here to serve you. Please introduce yourself by telling us your name and your email.`,
  'For security, please confirm the email address linked to your account.',
  'For security, please confirm the registered business name on your account.',
  'For security, please share the folder name and approximate upload date of your latest file.',
  'For security, please confirm the phone number on your profile (last 4 digits only).',
])

const toTrimmedValue = (value = '') => String(value || '').trim()
const GENERIC_ADMIN_TOKENS = new Set(['admin', 'administrator', 'senior', 'super', 'support', 'agent', 'system'])
const GENERIC_ADMIN_NAME_PATTERN = /^(admin|administrator|senior admin|super admin|support agent|agent|system administrator)$/i

const capitalizeWord = (value = '') => {
  const normalized = toTrimmedValue(value)
  if (!normalized) return ''
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
}

const toFirstMeaningfulName = (fullName = '') => {
  const normalized = toTrimmedValue(fullName)
  if (!normalized || GENERIC_ADMIN_NAME_PATTERN.test(normalized.toLowerCase())) return ''
  const firstMeaningfulPart = normalized
    .split(/\s+/)
    .map((part) => toTrimmedValue(part))
    .find((part) => part && !GENERIC_ADMIN_TOKENS.has(part.toLowerCase()))
  return capitalizeWord(firstMeaningfulPart)
}

const toNameFromEmail = (email = '') => {
  const localPart = toTrimmedValue(email).toLowerCase().split('@')[0] || ''
  const candidate = localPart
    .split(/[._-]+/)
    .map((part) => toTrimmedValue(part))
    .find((part) => part && !GENERIC_ADMIN_TOKENS.has(part.toLowerCase()))
  return capitalizeWord(candidate)
}

const resolveAdminFirstName = ({ fullName = '', email = '' } = {}) => (
  toFirstMeaningfulName(fullName) || toNameFromEmail(email) || 'Support'
)

const formatTimestamp = (value = '') => {
  const parsed = Date.parse(value || '')
  if (!Number.isFinite(parsed)) return '--'
  return new Date(parsed).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

const formatBytes = (size = 0) => {
  const numeric = Number(size) || 0
  if (numeric < 1024) return `${numeric} B`
  if (numeric < 1024 * 1024) return `${(numeric / 1024).toFixed(1)} KB`
  return `${(numeric / (1024 * 1024)).toFixed(1)} MB`
}

const statusBadgeClass = (status = '') => {
  if (status === SUPPORT_TICKET_STATUS.ASSIGNED) return 'bg-info-bg text-primary'
  if (status === SUPPORT_TICKET_STATUS.RESOLVED) return 'bg-success-bg text-success'
  return 'bg-warning-bg text-warning'
}

const senderBadgeClass = (sender = '') => {
  if (sender === SUPPORT_SENDER.CLIENT) return 'bg-primary text-white'
  if (sender === SUPPORT_SENDER.AGENT) return 'bg-[#153585]/10 text-primary'
  if (sender === SUPPORT_SENDER.BOT) return 'bg-background text-text-secondary'
  return 'bg-border-light text-text-secondary'
}

const formatLeadOrganizationType = (value = '') => {
  const normalized = toTrimmedValue(value).toLowerCase()
  if (normalized === 'business') return 'Business'
  if (normalized === 'non-profit') return 'Non-profit'
  if (normalized === 'individual') return 'Individual'
  return '--'
}
const formatLeadCategory = (value = '', list = []) => {
  const categories = []
  const pushCategory = (entry = '') => {
    const normalized = toTrimmedValue(entry)
    if (!normalized || categories.includes(normalized)) return
    categories.push(normalized)
  }
  ;(Array.isArray(list) ? list : []).forEach((entry) => pushCategory(entry))
  pushCategory(value)
  if (categories.length === 0) return '--'
  return categories.map((entry) => {
    if (entry === 'Inquiry_FollowUP') return 'Inquiry Follow-up'
    if (entry === 'Newsletter_Subscriber') return 'Newsletter Subscriber'
    return entry
  }).join(', ')
}
const SUPPORT_INBOX_FOCUS_EMAIL_KEY = 'kiaminaSupportInboxFocusEmail'
const SUPPORT_INBOX_FOCUS_TICKET_KEY = 'kiaminaSupportInboxFocusTicketId'

function AdminSupportInboxPanel({
  showToast,
  currentAdminAccount,
  onAdminActionLog,
}) {
  const [supportSnapshot, setSupportSnapshot] = useState(() => getSupportCenterSnapshot())
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedUserEmail, setSelectedUserEmail] = useState('')
  const [selectedTicketId, setSelectedTicketId] = useState('')
  const [replyDraft, setReplyDraft] = useState('')
  const [replyAttachments, setReplyAttachments] = useState([])
  const [isReplying, setIsReplying] = useState(false)
  const [composerError, setComposerError] = useState('')
  const [attachmentPreview, setAttachmentPreview] = useState(null)
  const [attachmentContextMenu, setAttachmentContextMenu] = useState(null)
  const [nowMs, setNowMs] = useState(Date.now())
  const unreadByTicketRef = useRef(new Map())
  const hasInitializedUnreadRef = useRef(false)
  const fileInputRef = useRef(null)
  const attachmentMenuRef = useRef(null)
  const currentAdminEmail = toTrimmedValue(currentAdminAccount?.email).toLowerCase()

  useEffect(() => {
    void refreshSupportStateFromBackend()
    const unsubscribe = subscribeSupportCenter((snapshot) => {
      setSupportSnapshot(snapshot)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30000)
    return () => window.clearInterval(intervalId)
  }, [])

  const tickets = useMemo(() => {
    const rawTickets = Array.isArray(supportSnapshot?.tickets) ? supportSnapshot.tickets : []
    return rawTickets
      .filter((ticket) => ticket && typeof ticket === 'object')
      .sort((left, right) => (Date.parse(right.updatedAtIso || '') || 0) - (Date.parse(left.updatedAtIso || '') || 0))
  }, [supportSnapshot])

  useEffect(() => {
    let delayedSoundTimer = null
    const nextUnreadMap = new Map()
    tickets.forEach((ticket) => {
      nextUnreadMap.set(ticket.id, Number(ticket?.unreadByAdmin || 0))
    })

    if (!hasInitializedUnreadRef.current) {
      hasInitializedUnreadRef.current = true
      unreadByTicketRef.current = nextUnreadMap
      const totalUnreadCount = [...nextUnreadMap.values()].reduce((total, count) => total + Number(count || 0), 0)
      const windowActive = typeof document !== 'undefined'
        ? (document.visibilityState === 'visible' && document.hasFocus())
        : true
      if (totalUnreadCount > 0 && (!selectedTicketId || !windowActive) && isAdminNotificationSoundEnabled(currentAdminEmail)) {
        delayedSoundTimer = window.setTimeout(() => {
          playSupportNotificationSound()
        }, SUPPORT_NOTIFICATION_INITIAL_DELAY_MS)
      }
      return () => {
        if (delayedSoundTimer) window.clearTimeout(delayedSoundTimer)
      }
    }

    let shouldPlaySound = false
    nextUnreadMap.forEach((nextCount, ticketId) => {
      const previousCount = Number(unreadByTicketRef.current.get(ticketId) || 0)
      if (nextCount <= previousCount) return
      const isSelectedTicket = ticketId === selectedTicketId
      const windowActive = typeof document !== 'undefined'
        ? (document.visibilityState === 'visible' && document.hasFocus())
        : true
      if (!isSelectedTicket || !windowActive) {
        shouldPlaySound = true
      }
    })
    unreadByTicketRef.current = nextUnreadMap
    if (shouldPlaySound && isAdminNotificationSoundEnabled(currentAdminEmail)) playSupportNotificationSound()

    return () => {
      if (delayedSoundTimer) window.clearTimeout(delayedSoundTimer)
    }
  }, [tickets, selectedTicketId, currentAdminEmail])

  const userGroups = useMemo(() => {
    const groupedUsers = new Map()
    tickets.forEach((ticket) => {
      const userKey = toTrimmedValue(ticket.clientEmail) || `unknown-${ticket.id}`
      const existing = groupedUsers.get(userKey) || {
        clientEmail: userKey,
        clientName: '',
        businessName: '',
        isLead: false,
        leadId: '',
        leadLabel: '',
        leadCategory: '',
        leadCategories: [],
        leadFullName: '',
        leadContactEmail: '',
        leadOrganizationType: '',
        leadIpAddress: '',
        leadLocation: '',
        unreadByAdmin: 0,
        latestUpdatedAtIso: '',
        tickets: [],
      }
      const updatedGroup = {
        ...existing,
        leadCategories: [
          ...new Set([
            ...(Array.isArray(existing.leadCategories) ? existing.leadCategories : []),
            ...(Array.isArray(ticket.leadCategories) ? ticket.leadCategories : []),
            toTrimmedValue(ticket.leadCategory),
          ].filter(Boolean)),
        ],
      }
      const hydratedGroup = {
        ...existing,
        clientName: existing.clientName || toTrimmedValue(ticket.clientName),
        businessName: existing.businessName || toTrimmedValue(ticket.businessName),
        isLead: existing.isLead || Boolean(ticket.isLead),
        leadId: existing.leadId || toTrimmedValue(ticket.leadId),
        leadLabel: existing.leadLabel || toTrimmedValue(ticket.leadLabel),
        leadCategory: existing.leadCategory || toTrimmedValue(ticket.leadCategory),
        leadCategories: updatedGroup.leadCategories,
        leadFullName: existing.leadFullName || toTrimmedValue(ticket.leadFullName),
        leadContactEmail: existing.leadContactEmail || toTrimmedValue(ticket.leadContactEmail),
        leadOrganizationType: existing.leadOrganizationType || toTrimmedValue(ticket.leadOrganizationType),
        leadIpAddress: existing.leadIpAddress || toTrimmedValue(ticket.leadIpAddress),
        leadLocation: existing.leadLocation || toTrimmedValue(ticket.leadLocation),
        unreadByAdmin: existing.unreadByAdmin + Number(ticket.unreadByAdmin || 0),
        latestUpdatedAtIso: (
          (Date.parse(ticket.updatedAtIso || '') || 0) > (Date.parse(existing.latestUpdatedAtIso || '') || 0)
            ? ticket.updatedAtIso
            : existing.latestUpdatedAtIso
        ),
        tickets: [...existing.tickets, ticket].sort((left, right) => (Date.parse(right.updatedAtIso || '') || 0) - (Date.parse(left.updatedAtIso || '') || 0)),
      }
      groupedUsers.set(userKey, hydratedGroup)
    })
    return [...groupedUsers.values()].sort(
      (left, right) => (Date.parse(right.latestUpdatedAtIso || '') || 0) - (Date.parse(left.latestUpdatedAtIso || '') || 0),
    )
  }, [tickets])

  const filteredUserGroups = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return userGroups
    return userGroups.filter((userGroup) => {
      const matchesUser = [
        userGroup.businessName,
        userGroup.clientName,
        userGroup.clientEmail,
        userGroup.leadLabel,
        userGroup.leadCategory,
        (Array.isArray(userGroup.leadCategories) ? userGroup.leadCategories.join(' ') : ''),
        userGroup.leadFullName,
        userGroup.leadContactEmail,
        userGroup.leadOrganizationType,
        userGroup.leadIpAddress,
        userGroup.leadLocation,
      ].some((value) => String(value || '').toLowerCase().includes(query))
      if (matchesUser) return true
      return userGroup.tickets.some((ticket) => {
        const lastMessage = ticket.messages?.[ticket.messages.length - 1]
        return [
          ticket.id,
          ticket.status,
          lastMessage?.text,
        ].some((value) => String(value || '').toLowerCase().includes(query))
      })
    })
  }, [userGroups, searchTerm])

  const selectedUserGroup = useMemo(
    () => filteredUserGroups.find((userGroup) => userGroup.clientEmail === selectedUserEmail) || null,
    [filteredUserGroups, selectedUserEmail],
  )

  const filteredTickets = useMemo(() => {
    const scopedTickets = Array.isArray(selectedUserGroup?.tickets) ? selectedUserGroup.tickets : []
    return scopedTickets.filter((ticket) => !statusFilter || ticket.status === statusFilter)
  }, [selectedUserGroup, statusFilter])

  useEffect(() => {
    if (filteredUserGroups.length === 0) {
      setSelectedUserEmail('')
      setSelectedTicketId('')
      return
    }
    const exists = filteredUserGroups.some((userGroup) => userGroup.clientEmail === selectedUserEmail)
    if (!exists) setSelectedUserEmail(filteredUserGroups[0].clientEmail)
  }, [filteredUserGroups, selectedUserEmail])

  useEffect(() => {
    if (filteredTickets.length === 0) {
      setSelectedTicketId('')
      return
    }
    const exists = filteredTickets.some((ticket) => ticket.id === selectedTicketId)
    if (!exists) setSelectedTicketId(filteredTickets[0].id)
  }, [filteredTickets, selectedTicketId])

  useEffect(() => {
    if (typeof localStorage === 'undefined' || filteredUserGroups.length === 0) return
    const pendingFocusTicketId = toTrimmedValue(localStorage.getItem(SUPPORT_INBOX_FOCUS_TICKET_KEY))
    if (pendingFocusTicketId) {
      const matchingUser = filteredUserGroups.find((userGroup) => (
        Array.isArray(userGroup.tickets) && userGroup.tickets.some((ticket) => ticket.id === pendingFocusTicketId)
      ))
      if (matchingUser) {
        setSelectedUserEmail(matchingUser.clientEmail)
        setSelectedTicketId(pendingFocusTicketId)
        localStorage.removeItem(SUPPORT_INBOX_FOCUS_TICKET_KEY)
        localStorage.removeItem(SUPPORT_INBOX_FOCUS_EMAIL_KEY)
        return
      }
    }
    const pendingFocusEmail = toTrimmedValue(localStorage.getItem(SUPPORT_INBOX_FOCUS_EMAIL_KEY)).toLowerCase()
    if (!pendingFocusEmail) return
    const matchingUser = filteredUserGroups.find((userGroup) => (
      toTrimmedValue(userGroup.clientEmail).toLowerCase() === pendingFocusEmail
    ))
    if (!matchingUser) return
    setSelectedUserEmail(matchingUser.clientEmail)
    setSelectedTicketId(matchingUser.tickets?.[0]?.id || '')
    localStorage.removeItem(SUPPORT_INBOX_FOCUS_EMAIL_KEY)
  }, [filteredUserGroups])

  const selectedTicket = useMemo(() => (
    filteredTickets.find((ticket) => ticket.id === selectedTicketId) || null
  ), [filteredTickets, selectedTicketId])

  useEffect(() => {
    if (!selectedTicket?.id) return
    markSupportTicketReadByAdmin(selectedTicket.id)
  }, [selectedTicket?.id, selectedTicket?.messages?.length])

  const isResolved = selectedTicket?.status === SUPPORT_TICKET_STATUS.RESOLVED
  const isAssigned = selectedTicket?.status === SUPPORT_TICKET_STATUS.ASSIGNED
  const canAssign = Boolean(selectedTicket?.id) && !isAssigned && !isResolved
  const canResolve = Boolean(selectedTicket?.id) && !isResolved
  const adminActorName = useMemo(() => resolveAdminFirstName({
    fullName: currentAdminAccount?.fullName,
    email: currentAdminAccount?.email,
  }), [currentAdminAccount?.fullName, currentAdminAccount?.email])
  const adminQuickReplies = useMemo(() => buildAdminQuickReplies(adminActorName), [adminActorName])
  const adminActorEmail = toTrimmedValue(currentAdminAccount?.email)

  const handleAssign = async () => {
    if (!selectedTicket?.id) return
    const result = await assignSupportTicket({
      ticketId: selectedTicket.id,
      adminName: adminActorName,
      adminEmail: adminActorEmail,
    })
    if (!result.ok) {
      showToast?.('error', result.message || 'Unable to assign ticket.')
      return
    }
    showToast?.('success', `Ticket ${selectedTicket.id} assigned to ${adminActorName}.`)
    onAdminActionLog?.({
      action: 'Assigned support ticket',
      affectedUser: selectedTicket.businessName || selectedTicket.clientEmail || '--',
      details: `Ticket ${selectedTicket.id} assigned to ${adminActorName}.`,
    })
  }

  const handleResolve = async () => {
    if (!selectedTicket?.id) return
    const result = await resolveSupportTicket({
      ticketId: selectedTicket.id,
      adminName: adminActorName,
    })
    if (!result.ok) {
      showToast?.('error', result.message || 'Unable to resolve ticket.')
      return
    }
    showToast?.('success', `Ticket ${selectedTicket.id} marked as resolved.`)
    onAdminActionLog?.({
      action: 'Resolved support ticket',
      affectedUser: selectedTicket.businessName || selectedTicket.clientEmail || '--',
      details: `Ticket ${selectedTicket.id} resolved by ${adminActorName}.`,
    })
  }

  const handleReopen = async () => {
    if (!selectedTicket?.id) return
    const result = await reopenSupportTicket({
      ticketId: selectedTicket.id,
      adminName: adminActorName,
    })
    if (!result.ok) {
      showToast?.('error', result.message || 'Unable to reopen ticket.')
      return
    }
    showToast?.('success', `Ticket ${selectedTicket.id} reopened.`)
    onAdminActionLog?.({
      action: 'Reopened support ticket',
      affectedUser: selectedTicket.businessName || selectedTicket.clientEmail || '--',
      details: `Ticket ${selectedTicket.id} reopened by ${adminActorName}.`,
    })
  }

  const handleRetry = async (messageId) => {
    if (!selectedTicket?.id || !messageId) return
    const result = await retrySupportMessage({
      ticketId: selectedTicket.id,
      messageId,
    })
    if (!result.ok) {
      showToast?.('error', result.message || 'Unable to retry message.')
      return
    }
    showToast?.('success', 'Retry queued.')
  }

  const handleSendReply = async () => {
    if (!selectedTicket?.id || isReplying) return
    const textValue = toTrimmedValue(replyDraft)
    if (!textValue && replyAttachments.length === 0) return
    setIsReplying(true)
    const result = await sendAdminSupportMessage({
      ticketId: selectedTicket.id,
      adminName: adminActorName,
      adminEmail: adminActorEmail,
      text: textValue,
      attachments: replyAttachments,
    })
    if (!result.ok) {
      showToast?.('error', result.message || 'Unable to send reply.')
      setIsReplying(false)
      return
    }
    setComposerError('')
    onAdminActionLog?.({
      action: 'Replied to support ticket',
      affectedUser: selectedTicket.businessName || selectedTicket.clientEmail || '--',
      details: `Reply queued for ticket ${selectedTicket.id}.`,
    })
    setReplyDraft('')
    setReplyAttachments([])
    setIsReplying(false)
  }

  const closeAttachmentPreview = () => {
    setAttachmentPreview((previous) => {
      if (previous?.objectUrl) URL.revokeObjectURL(previous.objectUrl)
      return null
    })
  }

  const openAttachmentPreview = async (attachment) => {
    const previewResult = await buildSupportAttachmentPreview(attachment)
    if (!previewResult.ok) {
      setComposerError(previewResult.message || 'Unable to preview this attachment.')
      return
    }
    setComposerError('')
    setAttachmentPreview((previous) => {
      if (previous?.objectUrl) URL.revokeObjectURL(previous.objectUrl)
      return previewResult
    })
  }

  const closeAttachmentContextMenu = () => setAttachmentContextMenu(null)

  const openAttachmentContextMenu = (event, attachment) => {
    event.preventDefault()
    if (!attachment) return
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720
    const menuWidth = 196
    const menuHeight = 132
    const left = Math.max(8, Math.min(event.clientX || 0, viewportWidth - menuWidth - 8))
    const top = Math.max(8, Math.min(event.clientY || 0, viewportHeight - menuHeight - 8))
    setAttachmentContextMenu({
      attachment,
      left,
      top,
    })
  }

  const downloadAttachment = async (attachment) => {
    if (!attachment) return
    const blob = await getSupportAttachmentBlob(attachment)
    if (!(blob instanceof Blob)) {
      setComposerError('Unable to download this attachment.')
      return
    }
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = attachment.name || 'attachment'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 500)
  }

  const copyAttachmentName = async (attachment) => {
    const attachmentName = toTrimmedValue(attachment?.name)
    if (!attachmentName) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(attachmentName)
        showToast?.('success', 'Attachment name copied.')
      }
    } catch {
      setComposerError('Unable to copy attachment name.')
    }
  }

  useEffect(() => () => {
    if (attachmentPreview?.objectUrl) URL.revokeObjectURL(attachmentPreview.objectUrl)
  }, [attachmentPreview?.objectUrl])

  useEffect(() => {
    if (!attachmentContextMenu) return undefined
    const handlePointerDown = (event) => {
      if (attachmentMenuRef.current?.contains(event.target)) return
      setAttachmentContextMenu(null)
    }
    const handleKeydown = (event) => {
      if (event.key === 'Escape') setAttachmentContextMenu(null)
    }
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [attachmentContextMenu])

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[520px_minmax(0,1fr)] gap-6">
      <div className="bg-white rounded-lg shadow-card border border-border-light">
        <div className="p-4 border-b border-border-light">
          <h3 className="text-sm font-semibold text-text-primary">Support Inbox</h3>
          <p className="text-xs text-text-muted mt-1">Track client support tickets and respond in-thread.</p>
        </div>
        <div className="p-4 space-y-3 border-b border-border-light">
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search users or tickets..."
            className="w-full h-9 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-full h-9 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All Statuses</option>
            <option value={SUPPORT_TICKET_STATUS.OPEN}>Open</option>
            <option value={SUPPORT_TICKET_STATUS.ASSIGNED}>Assigned</option>
            <option value={SUPPORT_TICKET_STATUS.RESOLVED}>Resolved</option>
          </select>
        </div>
        <div className="max-h-[620px] overflow-auto">
          {filteredUserGroups.length === 0 ? (
            <div className="px-4 py-8 text-sm text-text-muted text-center">
              No support users yet.
            </div>
          ) : (
            <>
              <div className="px-3 py-3 border-b border-border-light bg-background/40">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Users</p>
                <div className="mt-2 max-h-44 overflow-y-auto space-y-1">
                  {filteredUserGroups.map((userGroup) => {
                    const isSelectedUser = userGroup.clientEmail === selectedUserEmail
                    const userLabel = userGroup.isLead
                      ? (userGroup.leadLabel || userGroup.clientName || userGroup.clientEmail)
                      : (userGroup.businessName || userGroup.clientName || userGroup.clientEmail)
                    return (
                      <button
                        key={userGroup.clientEmail}
                        type="button"
                        onClick={() => {
                          setSelectedUserEmail(userGroup.clientEmail)
                          setSelectedTicketId(userGroup.tickets?.[0]?.id || '')
                        }}
                        className={`w-full text-left rounded-md border px-2.5 py-2 transition-colors ${
                          isSelectedUser ? 'border-primary/35 bg-primary-tint/50' : 'border-border-light bg-white hover:bg-background'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-text-primary truncate">{userLabel}</p>
                          {userGroup.unreadByAdmin > 0 && (
                            <span className="inline-flex items-center h-5 min-w-[20px] justify-center px-1.5 rounded-full bg-primary text-white text-[10px] font-semibold">
                              {userGroup.unreadByAdmin}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-text-muted mt-1 truncate">
                          {userGroup.isLead
                            ? (userGroup.leadContactEmail || userGroup.clientEmail)
                            : userGroup.clientEmail}
                        </p>
                        {userGroup.isLead && (
                          <p className="text-[11px] text-text-muted mt-1 truncate">
                            {formatLeadCategory(userGroup.leadCategory, userGroup.leadCategories)} | {formatLeadOrganizationType(userGroup.leadOrganizationType)} | {userGroup.leadLocation || '--'}
                          </p>
                        )}
                        <p className="text-[11px] text-text-muted mt-1">{userGroup.tickets.length} ticket(s)</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="px-3 py-2 border-b border-border-light bg-white">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {selectedUserGroup
                    ? `Tickets - ${
                      selectedUserGroup.isLead
                        ? (selectedUserGroup.leadLabel || selectedUserGroup.clientName || selectedUserGroup.clientEmail)
                        : (selectedUserGroup.businessName || selectedUserGroup.clientName || selectedUserGroup.clientEmail)
                    }`
                    : 'Select a user to view tickets'}
                </p>
              </div>

              {!selectedUserGroup ? (
                <div className="px-4 py-6 text-sm text-text-muted text-center">
                  Select a user to view chats.
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="px-4 py-6 text-sm text-text-muted text-center">
                  No tickets found for this user with the current filter.
                </div>
              ) : (
                <table className="w-full min-w-[500px] border-collapse">
                  <thead className="sticky top-0 z-10 bg-background">
                    <tr className="border-b border-border-light">
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">Ticket</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">Status</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">Updated</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">Last Message</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">Unread</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map((ticket) => {
                      const isSelected = ticket.id === selectedTicketId
                      const lastMessage = ticket.messages?.[ticket.messages.length - 1]
                      const ticketOwnerLabel = ticket.isLead
                        ? (ticket.leadLabel || ticket.clientName || ticket.clientEmail)
                        : (ticket.businessName || ticket.clientName || ticket.clientEmail)
                      const ticketOwnerEmail = ticket.isLead
                        ? (ticket.leadContactEmail || ticket.clientEmail)
                        : ticket.clientEmail
                      return (
                        <tr
                          key={ticket.id}
                          tabIndex={0}
                          onClick={() => setSelectedTicketId(ticket.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setSelectedTicketId(ticket.id)
                            }
                          }}
                          className={`cursor-pointer border-b border-border-light transition-colors ${
                            isSelected ? 'bg-primary-tint/50' : 'hover:bg-background'
                          }`}
                        >
                          <td className="px-3 py-2 align-top">
                            <p className="text-xs font-semibold text-text-primary">{ticket.id}</p>
                            <p className="text-[11px] text-text-muted mt-1 truncate max-w-[170px]">{ticketOwnerLabel}</p>
                            <p className="text-[11px] text-text-muted mt-1 truncate max-w-[170px]">{ticketOwnerEmail || '--'}</p>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <span className={`inline-flex items-center h-5 px-2 rounded text-[10px] font-semibold uppercase ${statusBadgeClass(ticket.status)}`}>
                              {ticket.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <p className="text-xs text-text-secondary">{formatTimestamp(ticket.updatedAtIso)}</p>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <p className="text-xs text-text-secondary truncate max-w-[170px]">{lastMessage?.text || 'No messages yet.'}</p>
                          </td>
                          <td className="px-3 py-2 align-top">
                            {ticket.unreadByAdmin > 0 ? (
                              <span className="inline-flex items-center h-5 min-w-[20px] justify-center px-1.5 rounded-full bg-primary text-white text-[10px] font-semibold">
                                {ticket.unreadByAdmin}
                              </span>
                            ) : (
                              <span className="text-xs text-text-muted">0</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light overflow-hidden">
        {!selectedTicket ? (
          <div className="h-full min-h-[520px] lg:min-h-[640px] flex items-center justify-center text-sm text-text-muted">
            Select a support ticket to view conversation.
          </div>
        ) : (
          <div className="h-full flex flex-col min-h-[520px] lg:min-h-[640px]">
            <div className="px-5 py-4 border-b border-border-light bg-background/60">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">
                    {selectedTicket.isLead
                      ? (selectedTicket.leadLabel || selectedTicket.clientName || selectedTicket.clientEmail)
                      : (selectedTicket.businessName || selectedTicket.clientName || selectedTicket.clientEmail)}
                  </h3>
                  <p className="text-xs text-text-muted mt-1">
                    {selectedTicket.isLead
                      ? `${selectedTicket.leadFullName || '--'} | ${selectedTicket.leadContactEmail || selectedTicket.clientEmail} | ${formatLeadOrganizationType(selectedTicket.leadOrganizationType)}`
                      : `${selectedTicket.clientName} | ${selectedTicket.clientEmail}`
                    } | Ticket {selectedTicket.id}
                  </p>
                  {selectedTicket.isLead && (
                    <p className="text-[11px] text-text-muted mt-1">
                      Category: {formatLeadCategory(selectedTicket.leadCategory, selectedTicket.leadCategories)} | IP: {selectedTicket.leadIpAddress || '--'} | Location: {selectedTicket.leadLocation || '--'}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-semibold uppercase ${statusBadgeClass(selectedTicket.status)}`}>
                      {selectedTicket.status}
                    </span>
                    {selectedTicket.assignedAdminName && (
                      <span className="inline-flex items-center h-6 px-2.5 rounded text-xs font-medium bg-background text-text-secondary">
                        Assigned: {selectedTicket.assignedAdminName}
                      </span>
                    )}
                    {selectedTicket.slaDueAtIso && (
                      <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded text-xs font-medium bg-warning-bg text-warning">
                        <Clock className="w-3.5 h-3.5" />
                        {formatSupportSlaCountdown(selectedTicket.slaDueAtIso, nowMs)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canAssign && (
                    <button
                      type="button"
                      onClick={() => void handleAssign()}
                      className="h-8 px-3 rounded-md border border-border text-text-primary text-xs font-medium hover:bg-background inline-flex items-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Assign to Me
                    </button>
                  )}
                  {canResolve && (
                    <button
                      type="button"
                      onClick={() => void handleResolve()}
                      className="h-8 px-3 rounded-md bg-success text-white text-xs font-semibold hover:bg-[#0a6a41] inline-flex items-center gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Resolve
                    </button>
                  )}
                  {isResolved && (
                    <button
                      type="button"
                      onClick={() => void handleReopen()}
                      className="h-8 px-3 rounded-md border border-border text-text-primary text-xs font-medium hover:bg-background inline-flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {selectedTicket.messages.length === 0 ? (
                <div className="text-sm text-text-muted text-center py-8">No messages yet.</div>
              ) : (
                selectedTicket.messages.map((message) => {
                  const isAgent = message.sender === SUPPORT_SENDER.AGENT
                  const isClient = message.sender === SUPPORT_SENDER.CLIENT
                  const isSystem = message.sender === SUPPORT_SENDER.SYSTEM
                  const isFailed = message.deliveryStatus === SUPPORT_MESSAGE_STATUS.FAILED
                  const isSending = message.deliveryStatus === SUPPORT_MESSAGE_STATUS.SENDING
                  const bubbleClass = isAgent
                    ? 'bg-primary-tint/60 border-primary/25'
                    : isClient
                      ? 'bg-background border-border-light'
                      : isSystem
                        ? 'bg-warning-bg/80 border-warning/35'
                        : 'bg-[#153585]/8 border-[#153585]/20'
                  return (
                    <div key={message.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-lg border px-3 py-2 ${bubbleClass}`}>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center h-5 px-2 rounded text-[10px] font-semibold uppercase ${senderBadgeClass(message.sender)}`}>
                            {message.sender}
                          </span>
                          <span className="text-[11px] text-text-muted">{message.senderName || '--'}</span>
                        </div>
                        <p className="text-sm text-text-primary mt-1 whitespace-pre-wrap">{message.text || '(No text)'}</p>
                        {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {message.attachments.map((attachment) => (
                              <button
                                type="button"
                                key={attachment.id}
                                onClick={() => openAttachmentPreview(attachment)}
                                onContextMenu={(event) => openAttachmentContextMenu(event, attachment)}
                                className="inline-flex items-center gap-1 rounded bg-white border border-border-light px-2 py-1 text-xs text-text-secondary mr-1"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                                <span>{attachment.name}</span>
                                <span className="text-text-muted">({formatBytes(attachment.size)})</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-2 text-[11px]">
                          <span className="text-text-muted">{formatTimestamp(message.createdAtIso)}</span>
                          {isSending && <span className="text-warning">Sending...</span>}
                          {isFailed && (
                            <>
                              <span className="text-error inline-flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Failed
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleRetry(message.id)}
                                className="text-primary hover:underline"
                              >
                                Retry
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="px-4 py-3 border-t border-border-light">
              <div className="flex flex-wrap gap-2 mb-2">
                {adminQuickReplies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => setReplyDraft(reply)}
                    className="h-7 px-2.5 rounded border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-background"
                  >
                    {reply}
                  </button>
                ))}
              </div>
              {replyAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {replyAttachments.map((attachment) => (
                    <span key={attachment.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-text-secondary bg-background max-w-full">
                      <Paperclip className="w-3.5 h-3.5" />
                      <button
                        type="button"
                        onClick={() => void openAttachmentPreview(attachment)}
                        onContextMenu={(event) => openAttachmentContextMenu(event, attachment)}
                        className="truncate max-w-[180px] text-left hover:underline"
                      >
                        {attachment.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplyAttachments((prev) => prev.filter((item) => item.id !== attachment.id))}
                        className="text-text-muted hover:text-text-primary"
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const selectedFiles = Array.from(event.target.files || [])
                    event.target.value = ''
                    void (async () => {
                      const remainingCount = Math.max(0, 5 - replyAttachments.length)
                      if (remainingCount <= 0 || selectedFiles.length === 0) return
                      try {
                        const nextAttachments = await createSupportAttachmentsFromFiles(selectedFiles, {
                          ownerEmail: selectedTicket?.clientEmail || 'support-chat',
                          maxCount: remainingCount,
                        })
                        setReplyAttachments((prev) => [...prev, ...nextAttachments].slice(0, 5))
                      } catch {
                        setComposerError('Unable to attach file(s). Please try again.')
                      }
                    })()
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-10 px-3 border border-border rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-background"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <textarea
                  value={replyDraft}
                  onChange={(event) => setReplyDraft(event.target.value)}
                  placeholder={isResolved ? 'Reopen ticket to continue the conversation.' : 'Type a support reply...'}
                  className="flex-1 min-h-[44px] max-h-36 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-primary resize-y w-full"
                  disabled={isResolved || isReplying}
                />
                <button
                  type="button"
                  onClick={() => void handleSendReply()}
                  disabled={(toTrimmedValue(replyDraft).length === 0 && replyAttachments.length === 0) || isResolved || isReplying}
                  className="h-10 px-3 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
                >
                  {isReplying ? (
                    <DotLottiePreloader size={16} label="Sending..." labelClassName="text-xs text-white" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send
                    </>
                  )}
                </button>
              </div>
              {composerError && <p className="text-xs text-error mt-2">{composerError}</p>}
            </div>
          </div>
        )}
      </div>
      {attachmentContextMenu && (
        <div
          ref={attachmentMenuRef}
          className="fixed z-[260] w-48 rounded-lg border border-border-light bg-white shadow-card p-1"
          style={{
            left: `${attachmentContextMenu.left}px`,
            top: `${attachmentContextMenu.top}px`,
          }}
        >
          <button
            type="button"
            onClick={() => {
              void openAttachmentPreview(attachmentContextMenu.attachment)
              closeAttachmentContextMenu()
            }}
            className="w-full h-8 px-2 rounded text-left text-xs text-text-primary hover:bg-background inline-flex items-center gap-2"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
          <button
            type="button"
            onClick={() => {
              void downloadAttachment(attachmentContextMenu.attachment)
              closeAttachmentContextMenu()
            }}
            className="w-full h-8 px-2 rounded text-left text-xs text-text-primary hover:bg-background inline-flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
          <button
            type="button"
            onClick={() => {
              void copyAttachmentName(attachmentContextMenu.attachment)
              closeAttachmentContextMenu()
            }}
            className="w-full h-8 px-2 rounded text-left text-xs text-text-primary hover:bg-background inline-flex items-center gap-2"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy File Name
          </button>
        </div>
      )}
      <SupportAttachmentPreviewModal preview={attachmentPreview} onClose={closeAttachmentPreview} />
    </div>
  )
}

export default AdminSupportInboxPanel
