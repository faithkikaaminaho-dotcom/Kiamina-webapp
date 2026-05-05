import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, MessageCircle, Paperclip, X } from 'lucide-react'
import DotLottiePreloader from '../../common/DotLottiePreloader'
import SupportAttachmentPreviewModal from '../../common/SupportAttachmentPreviewModal'
import {
  ensureClientSupportThread,
  formatSupportSlaCountdown,
  getSupportCenterSnapshot,
  hydrateSupportLeadNetworkProfile,
  initializeAnonymousSupportLead,
  markSupportTicketReadByClient,
  requestHumanSupport,
  retrySupportMessage,
  sendClientSupportMessage,
  startNewClientSupportThread,
  subscribeSupportCenter,
  SUPPORT_MESSAGE_STATUS,
  SUPPORT_SENDER,
  SUPPORT_TICKET_STATUS,
} from '../../../utils/supportCenter'
import {
  buildSupportAttachmentPreview,
  createSupportAttachmentsFromFiles,
} from '../../../utils/supportAttachments'
import {
  playSupportNotificationSound,
  primeSupportNotificationSound,
  SUPPORT_NOTIFICATION_INITIAL_DELAY_MS,
} from '../../../utils/supportNotificationSound'

const SUPPORT_QUICK_PROMPTS = [
  'How do I upload documents?',
  'Show me expenses guidance',
  'Connect me to an agent',
]

const formatSupportMessageTimestamp = (value = '') => {
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

const formatSupportFileSize = (value = 0) => {
  const bytes = Number(value) || 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const normalizeSupportName = (value = '') => String(value || '').trim()
const normalizeSupportEmail = (value = '') => String(value || '').trim().toLowerCase()
const isValidSupportEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeSupportEmail(value))

const getSupportRoleLabel = (sender = '') => {
  if (sender === SUPPORT_SENDER.AGENT) return 'AGENT'
  if (sender === SUPPORT_SENDER.BOT) return 'BOT'
  if (sender === SUPPORT_SENDER.SYSTEM) return 'SYSTEM'
  return 'YOU'
}

const getSupportStatusHint = (ticket = null, nowMs = Date.now()) => {
  if (!ticket) return 'Bot available. Type "agent" for human support.'
  if (ticket.status === SUPPORT_TICKET_STATUS.RESOLVED) {
    return 'Ticket resolved. Send a new message to open another ticket.'
  }
  if (ticket.status === SUPPORT_TICKET_STATUS.ASSIGNED) {
    return `Human agent connected${ticket.assignedAdminName ? `: ${ticket.assignedAdminName}` : ''}.`
  }
  if (ticket.channel === 'human') {
    const slaHint = formatSupportSlaCountdown(ticket.slaDueAtIso, nowMs)
    return slaHint ? `Agent requested. ${slaHint}.` : 'Agent requested. Waiting for assignment.'
  }
  return 'Bot available. Type "agent" for human support.'
}

const isSupportTicketActive = (ticket = null) => (
  ticket && ticket.status !== SUPPORT_TICKET_STATUS.RESOLVED
)

const getClientStatusBadgeClass = (status = '') => {
  if (status === SUPPORT_TICKET_STATUS.RESOLVED) return 'bg-success-bg text-success'
  if (status === SUPPORT_TICKET_STATUS.ASSIGNED) return 'bg-info-bg text-primary'
  return 'bg-warning-bg text-warning'
}

const CLIENT_SUPPORT_FOCUS_TICKET_STORAGE_KEY = 'kiaminaClientSupportFocusTicketId'

function useClientSupportSession({
  clientEmail = '',
  clientName = 'Client User',
  businessName = '',
  preferredTicketId = '',
  autoInitialize = false,
  markAsRead = false,
}) {
  const [supportSnapshot, setSupportSnapshot] = useState(() => getSupportCenterSnapshot())
  const normalizedEmail = String(clientEmail || '').trim().toLowerCase()
  const normalizedName = String(clientName || '').trim() || 'Client User'
  const normalizedBusinessName = String(businessName || '').trim()

  useEffect(() => {
    const unsubscribe = subscribeSupportCenter((snapshot) => setSupportSnapshot(snapshot))
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!autoInitialize || !normalizedEmail) return
    void ensureClientSupportThread({
      clientEmail: normalizedEmail,
      clientName: normalizedName,
      businessName: normalizedBusinessName,
    })
  }, [autoInitialize, normalizedEmail, normalizedName, normalizedBusinessName])

  const tickets = useMemo(() => {
    const rawTickets = Array.isArray(supportSnapshot?.tickets) ? supportSnapshot.tickets : []
    return rawTickets
      .filter((ticket) => String(ticket?.clientEmail || '').toLowerCase() === normalizedEmail)
      .sort((left, right) => (Date.parse(right.updatedAtIso || '') || 0) - (Date.parse(left.updatedAtIso || '') || 0))
  }, [supportSnapshot, normalizedEmail])

  const activeTicket = useMemo(() => {
    const normalizedPreferredTicketId = String(preferredTicketId || '').trim()
    if (normalizedPreferredTicketId) {
      const matchedTicket = tickets.find((ticket) => ticket.id === normalizedPreferredTicketId)
      if (matchedTicket) return matchedTicket
    }
    return tickets.find((ticket) => ticket.status !== SUPPORT_TICKET_STATUS.RESOLVED) || tickets[0] || null
  }, [preferredTicketId, tickets])

  const messages = useMemo(() => (
    Array.isArray(activeTicket?.messages) ? activeTicket.messages : []
  ), [activeTicket])

  const unreadCount = useMemo(() => (
    tickets.reduce((total, ticket) => total + Number(ticket.unreadByClient || 0), 0)
  ), [tickets])

  useEffect(() => {
    if (!markAsRead) return
    tickets.forEach((ticket) => {
      if (ticket?.id && Number(ticket?.unreadByClient || 0) > 0) {
        markSupportTicketReadByClient(ticket.id)
      }
    })
  }, [markAsRead, tickets, activeTicket?.id, messages.length])

  return {
    tickets,
    activeTicket,
    messages,
    unreadCount,
    ensureThread: () => ensureClientSupportThread({
      clientEmail: normalizedEmail,
      clientName: normalizedName,
      businessName: normalizedBusinessName,
    }),
    sendMessage: ({ text = '', attachments = [] } = {}) => sendClientSupportMessage({
      clientEmail: normalizedEmail,
      clientName: normalizedName,
      businessName: normalizedBusinessName,
      ticketId: activeTicket?.id || '',
      text,
      attachments,
    }),
    requestAgent: () => requestHumanSupport({
      clientEmail: normalizedEmail,
      clientName: normalizedName,
      businessName: normalizedBusinessName,
      ticketId: activeTicket?.id || '',
    }),
    startNewChat: () => startNewClientSupportThread({
      clientEmail: normalizedEmail,
      clientName: normalizedName,
      businessName: normalizedBusinessName,
    }),
    retryMessage: (messageId = '') => retrySupportMessage({
      ticketId: activeTicket?.id || '',
      messageId,
    }),
  }
}

function SupportMessagesList({
  messages = [],
  onRetry,
  onPreviewAttachment,
  className = 'h-[420px]',
}) {
  return (
    <div className={`${className} overflow-y-auto p-3 space-y-2 bg-white`}>
      {messages.map((message) => {
        const isUser = message.sender === SUPPORT_SENDER.CLIENT
        const isAgent = message.sender === SUPPORT_SENDER.AGENT
        const isSystem = message.sender === SUPPORT_SENDER.SYSTEM
        const isSending = message.deliveryStatus === SUPPORT_MESSAGE_STATUS.SENDING
        const isFailed = message.deliveryStatus === SUPPORT_MESSAGE_STATUS.FAILED
        const isTyping = message.deliveryStatus === SUPPORT_MESSAGE_STATUS.TYPING || message.isTyping
        const bubbleClass = isUser
          ? 'bg-primary text-white border border-primary'
          : isAgent
            ? 'bg-[#153585]/10 border border-[#153585]/20 text-text-primary'
            : isSystem
              ? 'bg-warning-bg/80 border border-warning/35 text-text-primary'
              : 'bg-background border border-border-light text-text-primary'
        return (
          <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 ${bubbleClass}`}>
              <div className={`text-[10px] font-semibold tracking-wide ${isUser ? 'text-white/80' : 'text-text-muted'}`}>
                {getSupportRoleLabel(message.sender)}
              </div>
              {isTyping ? (
                <div className="mt-2 inline-flex items-center gap-1.5 text-sm text-text-secondary">
                  <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
                  <span className="h-2 w-2 rounded-full bg-current animate-pulse [animation-delay:180ms]" />
                  <span className="h-2 w-2 rounded-full bg-current animate-pulse [animation-delay:360ms]" />
                </div>
              ) : (
                <p className="text-sm mt-1 leading-snug whitespace-pre-wrap">{message.text || '(No text)'}</p>
              )}
              {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {message.attachments.map((attachment) => (
                    <button
                      type="button"
                      key={attachment.id}
                      onClick={() => onPreviewAttachment?.(attachment)}
                      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs mr-1 ${
                        isUser ? 'bg-white/15 border-white/20 text-white' : 'bg-white border-border-light text-text-secondary'
                      }`}
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>{attachment.name}</span>
                      <span className={isUser ? 'text-white/80' : 'text-text-muted'}>({formatSupportFileSize(attachment.size)})</span>
                    </button>
                  ))}
                </div>
              )}
              <div className={`mt-1 flex items-center gap-2 text-[11px] ${isUser ? 'text-white/80' : 'text-text-muted'}`}>
                {!isTyping && <span>{formatSupportMessageTimestamp(message.createdAtIso)}</span>}
                {isTyping && <span>Typing...</span>}
                {isSending && <span>Sending...</span>}
                {isFailed && (
                  <>
                    <span className={isUser ? 'text-[#FFE5E5]' : 'text-error'}>Failed</span>
                    <button type="button" onClick={() => onRetry?.(message.id)} className={isUser ? 'underline text-white' : 'underline text-primary'}>
                      Retry
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SupportComposer({
  draftMessage,
  setDraftMessage,
  attachments,
  setAttachments,
  onSend,
  isSending,
  placeholder,
  attachmentOwnerEmail = '',
  onPreviewAttachment,
  onAttachmentError,
}) {
  const attachmentInputRef = useRef(null)

  return (
    <>
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {attachments.map((attachment) => (
            <span key={attachment.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-text-secondary bg-background max-w-full">
              <Paperclip className="w-3.5 h-3.5" />
              <button
                type="button"
                onClick={() => onPreviewAttachment?.(attachment)}
                className="truncate max-w-[180px] text-left hover:underline"
              >
                {attachment.name}
              </button>
              <button type="button" onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== attachment.id))} className="text-text-muted hover:text-text-primary">
                x
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <input
          ref={attachmentInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const selectedFiles = Array.from(event.target.files || [])
            event.target.value = ''
            void (async () => {
              const remainingCount = Math.max(0, 5 - attachments.length)
              if (remainingCount <= 0 || selectedFiles.length === 0) return
              try {
                const nextAttachments = await createSupportAttachmentsFromFiles(selectedFiles, {
                  ownerEmail: attachmentOwnerEmail,
                  maxCount: remainingCount,
                })
                setAttachments((prev) => [...prev, ...nextAttachments].slice(0, 5))
              } catch {
                onAttachmentError?.('Unable to attach file(s). Please try again.')
              }
            })()
          }}
        />
        <button type="button" onClick={() => attachmentInputRef.current?.click()} className="h-10 px-3 border border-border rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-background" title="Attach files">
          <Paperclip className="w-4 h-4" />
        </button>
        <input
          type="text"
          value={draftMessage}
          onChange={(event) => setDraftMessage(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') onSend() }}
          placeholder={placeholder}
          className="flex-1 h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary w-full"
        />
        <button type="button" onClick={onSend} disabled={(!draftMessage.trim() && attachments.length === 0) || isSending} className="h-10 px-3 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1 w-full sm:w-auto">
          {isSending ? <DotLottiePreloader size={18} label="Sending..." labelClassName="text-sm text-white" /> : <>Send <ArrowUpRight className="w-4 h-4" /></>}
        </button>
      </div>
    </>
  )
}

function ClientSupportExperience({ clientEmail = '', clientName = 'Client User', businessName = '', embedded = false }) {
  const defaultIdentityName = normalizeSupportName(clientName)
  const defaultIdentityEmail = normalizeSupportEmail(clientEmail)
  const isSignedUpUser = isValidSupportEmail(defaultIdentityEmail)
  const [leadSession, setLeadSession] = useState(null)
  const leadAliasEmail = normalizeSupportEmail(leadSession?.clientEmail || '')
  const leadLabel = normalizeSupportName(leadSession?.leadLabel || '')
  const [draftMessage, setDraftMessage] = useState('')
  const [composerAttachments, setComposerAttachments] = useState([])
  const [isOpen, setIsOpen] = useState(!embedded)
  const [composerError, setComposerError] = useState('')
  const [attachmentPreview, setAttachmentPreview] = useState(null)
  const [nowMs, setNowMs] = useState(Date.now())
  const [selectedTicketId, setSelectedTicketId] = useState('')
  const previousUnreadCountRef = useRef(0)
  const hasUnreadCountInitializedRef = useRef(false)
  const effectiveClientName = isSignedUpUser
    ? (defaultIdentityName || 'Client User')
    : (leadLabel || 'Lead')
  const effectiveClientEmail = isSignedUpUser
    ? defaultIdentityEmail
    : leadAliasEmail
  const canCompose = Boolean(effectiveClientEmail)
  const support = useClientSupportSession({
    clientEmail: effectiveClientEmail,
    clientName: effectiveClientName || 'Client User',
    businessName,
    preferredTicketId: selectedTicketId,
    autoInitialize: (embedded ? isOpen : true) && Boolean(effectiveClientEmail),
    markAsRead: (embedded ? isOpen : true) && Boolean(effectiveClientEmail),
  })

  const activeTicket = support.activeTicket
  const messages = support.messages
  const unreadCount = support.unreadCount
  const isResolvedTicket = activeTicket?.status === SUPPORT_TICKET_STATUS.RESOLVED
  const statusHint = canCompose
    ? getSupportStatusHint(activeTicket, nowMs)
    : 'Initializing support session...'
  const isSending = messages.some((message) => message.sender === SUPPORT_SENDER.CLIENT && message.deliveryStatus === SUPPORT_MESSAGE_STATUS.SENDING)

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const availableTickets = Array.isArray(support.tickets) ? support.tickets : []
    if (availableTickets.length === 0) {
      setSelectedTicketId('')
      return
    }
    const hasSelectedTicket = availableTickets.some((ticket) => ticket.id === selectedTicketId)
    if (!hasSelectedTicket) {
      const defaultTicket = availableTickets.find((ticket) => ticket.status !== SUPPORT_TICKET_STATUS.RESOLVED) || availableTickets[0]
      setSelectedTicketId(defaultTicket?.id || '')
    }
  }, [selectedTicketId, support.tickets])

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    const pendingFocusTicketId = String(localStorage.getItem(CLIENT_SUPPORT_FOCUS_TICKET_STORAGE_KEY) || '').trim()
    if (!pendingFocusTicketId) return
    const matchingTicket = support.tickets.find((ticket) => ticket.id === pendingFocusTicketId)
    if (!matchingTicket) return
    setSelectedTicketId(matchingTicket.id)
    localStorage.removeItem(CLIENT_SUPPORT_FOCUS_TICKET_STORAGE_KEY)
    if (embedded) {
      setIsOpen(true)
    }
  }, [embedded, support.tickets])

  useEffect(() => {
    const handlePrimer = () => {
      primeSupportNotificationSound()
    }
    window.addEventListener('pointerdown', handlePrimer, { passive: true })
    window.addEventListener('keydown', handlePrimer, { passive: true })
    window.addEventListener('touchstart', handlePrimer, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', handlePrimer)
      window.removeEventListener('keydown', handlePrimer)
      window.removeEventListener('touchstart', handlePrimer)
    }
  }, [])

  useEffect(() => {
    let delayedSoundTimer = null
    const nextUnreadCount = Number(unreadCount || 0)
    if (!hasUnreadCountInitializedRef.current) {
      hasUnreadCountInitializedRef.current = true
      previousUnreadCountRef.current = nextUnreadCount
      const chatVisible = embedded ? Boolean(isOpen) : true
      const windowActive = typeof document !== 'undefined'
        ? (document.visibilityState === 'visible' && document.hasFocus())
        : true
      if (nextUnreadCount > 0 && (!chatVisible || !windowActive)) {
        delayedSoundTimer = window.setTimeout(() => {
          playSupportNotificationSound()
        }, SUPPORT_NOTIFICATION_INITIAL_DELAY_MS)
      }
      return () => {
        if (delayedSoundTimer) window.clearTimeout(delayedSoundTimer)
      }
    }

    const previousUnreadCount = previousUnreadCountRef.current
    previousUnreadCountRef.current = nextUnreadCount
    if (nextUnreadCount <= previousUnreadCount) return

    const chatVisible = embedded ? Boolean(isOpen) : true
    const windowActive = typeof document !== 'undefined'
      ? (document.visibilityState === 'visible' && document.hasFocus())
      : true
    if (!chatVisible || !windowActive) {
      playSupportNotificationSound()
    }

    return () => {
      if (delayedSoundTimer) window.clearTimeout(delayedSoundTimer)
    }
  }, [unreadCount, embedded, isOpen])

  useEffect(() => {
    if (isSignedUpUser) {
      setLeadSession(null)
      return
    }
    const leadBootstrap = initializeAnonymousSupportLead()
    if (!leadBootstrap.ok) return
    setLeadSession({
      leadId: leadBootstrap.leadId,
      leadLabel: leadBootstrap.leadLabel,
      clientEmail: leadBootstrap.clientEmail,
    })
    void hydrateSupportLeadNetworkProfile({
      clientEmail: leadBootstrap.clientEmail,
    })
  }, [isSignedUpUser])
  useEffect(() => {
    if (!canCompose) return
    if (embedded && !isOpen) return
    void support.ensureThread()
  }, [canCompose, embedded, isOpen])

  const handleSend = async () => {
    if (!canCompose) {
      setComposerError('Support session is still initializing. Please wait a moment and try again.')
      return
    }
    const result = await support.sendMessage({
      text: draftMessage.trim(),
      attachments: composerAttachments,
    })
    if (!result.ok) {
      setComposerError(result.message || 'Unable to send support message.')
      return
    }
    if (result.ticketId) {
      setSelectedTicketId(String(result.ticketId).trim())
    }
    setComposerError('')
    setDraftMessage('')
    setComposerAttachments([])
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

  const handleStartNewChat = async () => {
    if (!canCompose) {
      setComposerError('Support session is still initializing. Please wait a moment and try again.')
      return
    }
    const result = await support.startNewChat()
    if (!result.ok) {
      setComposerError(result.message || 'Unable to start a new chat right now.')
      return
    }
    if (result.ticketId) {
      setSelectedTicketId(String(result.ticketId).trim())
    }
    setComposerError('')
    setDraftMessage('')
    setComposerAttachments([])
  }

  const handleRequestAgent = async () => {
    if (!canCompose) return
    const result = await support.requestAgent()
    if (!result?.ok) {
      setComposerError(result?.message || 'Unable to request a human agent right now.')
      return
    }
    setComposerError('')
  }

  const handleRetryMessage = async (messageId = '') => {
    const result = await support.retryMessage(messageId)
    if (!result?.ok) {
      setComposerError(result?.message || 'Unable to retry this message.')
      return
    }
    setComposerError('')
  }

  useEffect(() => () => {
    if (attachmentPreview?.objectUrl) URL.revokeObjectURL(attachmentPreview.objectUrl)
  }, [attachmentPreview?.objectUrl])

  const content = (
    <div className={`${embedded ? 'w-[calc(100vw-1rem)] sm:w-[390px] max-w-[calc(100vw-1rem)]' : 'w-full'} bg-white border border-border-light rounded-lg shadow-card overflow-hidden`}>
      <div className="px-4 py-3 border-b border-border-light bg-background/60">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Support Chat</h4>
            <p className="text-xs text-text-muted">{statusHint}</p>
            {!isSignedUpUser && leadLabel && (
              <p className="text-[11px] text-text-muted mt-0.5">Tracking as {leadLabel}</p>
            )}
            {activeTicket?.status && (
              <div className="mt-1">
                <span className={`inline-flex items-center h-5 px-2 rounded text-[10px] font-semibold uppercase ${getClientStatusBadgeClass(activeTicket.status)}`}>
                  {activeTicket.status}
                </span>
              </div>
            )}
            {activeTicket?.slaDueAtIso && <p className="text-[11px] text-warning mt-0.5">{formatSupportSlaCountdown(activeTicket.slaDueAtIso, nowMs)}</p>}
          </div>
          <div className="flex items-center gap-2">
            {canCompose && (
              <button
                type="button"
                onClick={handleStartNewChat}
                className="h-8 px-2.5 rounded border border-border text-xs font-medium text-text-primary hover:bg-white"
              >
                New Chat
              </button>
            )}
            {embedded && (
              <button type="button" onClick={() => setIsOpen(false)} className="w-7 h-7 rounded-md border border-border-light text-text-secondary hover:text-text-primary hover:bg-white">
                <X className="w-4 h-4 mx-auto" />
              </button>
            )}
          </div>
        </div>
      </div>
      <SupportMessagesList
        messages={messages}
        onRetry={(messageId) => void handleRetryMessage(messageId)}
        onPreviewAttachment={openAttachmentPreview}
        className={embedded ? 'h-[52vh] sm:h-[22rem]' : 'h-[56vh] sm:h-[420px]'}
      />
      <div className="px-3 pt-3 pb-2 border-t border-border-light">
        {isResolvedTicket ? (
          <div className="rounded-md border border-border-light bg-background p-3">
            <p className="text-sm font-medium text-text-primary">This ticket is resolved.</p>
            <p className="text-xs text-text-muted mt-1">Use New Chat above to open another support ticket.</p>
          </div>
        ) : (
          <>
            {activeTicket?.channel !== 'human' && (
              <div className="flex flex-wrap gap-2 mb-2">
                {SUPPORT_QUICK_PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => setDraftMessage(prompt)} className="text-xs h-7 px-2.5 rounded border border-border bg-background text-text-secondary hover:text-text-primary">
                    {prompt}
                  </button>
                ))}
                {isSupportTicketActive(activeTicket) && (
                  <button type="button" onClick={() => void handleRequestAgent()} className="text-xs h-7 px-2.5 rounded border border-border bg-background text-text-secondary hover:text-text-primary">
                    Request Human Agent
                  </button>
                )}
              </div>
            )}
            <SupportComposer
              draftMessage={draftMessage}
              setDraftMessage={setDraftMessage}
              attachments={composerAttachments}
              setAttachments={setComposerAttachments}
              onSend={() => void handleSend()}
              isSending={isSending || !canCompose}
              placeholder={activeTicket?.channel === 'human' ? 'Message support agent...' : 'Ask the support bot or type "agent"...'}
              attachmentOwnerEmail={effectiveClientEmail || defaultIdentityEmail}
              onPreviewAttachment={openAttachmentPreview}
              onAttachmentError={(errorMessage) => setComposerError(errorMessage)}
            />
          </>
        )}
        {composerError && <p className="text-xs text-error mt-2">{composerError}</p>}
      </div>
      <SupportAttachmentPreviewModal preview={attachmentPreview} onClose={closeAttachmentPreview} />
    </div>
  )

  if (!embedded) {
    return (
      <div className="animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h1 className="text-2xl font-semibold text-text-primary">Support</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-card border border-border-light p-5">
            <h3 className="text-base font-semibold text-text-primary">Contact Section</h3>
            <p className="text-sm text-text-secondary mt-2">Use chat for fast support. For escalations, contact the team directly.</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-md border border-border-light bg-background p-3"><p className="text-xs text-text-muted uppercase tracking-wide">Email</p><p className="text-text-primary mt-1">info@kiaminaaccounting.com</p></div>
              <div className="rounded-md border border-border-light bg-background p-3"><p className="text-xs text-text-muted uppercase tracking-wide">Phone / WhatsApp</p><p className="text-text-primary mt-1">+2349064962073</p></div>
              <div className="rounded-md border border-border-light bg-background p-3"><p className="text-xs text-text-muted uppercase tracking-wide">Hours</p><p className="text-text-primary mt-1">Mon-Fri, 8:00 AM - 5:00 PM</p><p className="text-text-primary mt-1">Sat-Sun, 9:00 AM - 1:00 PM</p></div>
              {activeTicket?.id && <div className="rounded-md border border-border-light bg-background p-3"><p className="text-xs text-text-muted uppercase tracking-wide">Ticket</p><p className="text-text-primary mt-1">{activeTicket.id}</p></div>}
            </div>
          </div>
          <div className="lg:col-span-2">{content}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-3 right-3 sm:bottom-5 sm:right-5 z-[120] max-w-[calc(100vw-1rem)]">
      {isOpen && <div className="mb-2 sm:mb-3">{content}</div>}
      <button type="button" onClick={() => setIsOpen((prev) => !prev)} className="h-11 px-4 rounded-full bg-primary text-white shadow-card hover:bg-primary-light inline-flex items-center gap-2 relative ml-auto">
        <MessageCircle className="w-4 h-4" />
        <span className="text-sm font-medium">Support</span>
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1.5 rounded-full bg-error text-white text-[10px] font-semibold inline-flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  )
}

function ClientSupportPageExperience(props) {
  return <ClientSupportExperience {...props} embedded={false} />
}

function ClientSupportWidgetExperience(props) {
  return <ClientSupportExperience {...props} embedded />
}

export {
  ClientSupportPageExperience,
  ClientSupportWidgetExperience,
}
