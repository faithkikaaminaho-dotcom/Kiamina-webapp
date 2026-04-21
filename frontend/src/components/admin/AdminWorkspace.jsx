import { useEffect, useMemo, useRef, useState } from 'react'
import {
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
} from './AdminViews'
import AdminSettingsPage from './settings/AdminSettingsPage'
import AdminInsightsPage from './insights/AdminInsightsPage'
import { ADMIN_DEFAULT_PAGE } from './adminConfig'
import { isOwnerAdminLevel } from './adminIdentity'
import { apiFetch } from '../../utils/apiClient'
import { getNetworkAwareDurationMs } from '../../utils/networkRuntime'
import DotLottiePreloader from '../common/DotLottiePreloader'
import { getSupportCenterSnapshot, subscribeSupportCenter } from '../../utils/supportCenter'
import {
  playSupportNotificationSound,
  primeSupportNotificationSound,
  SUPPORT_NOTIFICATION_INITIAL_DELAY_MS,
} from '../../utils/supportNotificationSound'
import { isAdminNotificationSoundEnabled } from '../../utils/adminSecurityPreferences'
import {
  canAdminAccessClientScope,
  filterClientsForAdminScope,
  getAssignedClientEmailSetForAdmin,
} from './adminAssignments'
import { subscribeToRealtimeEvents } from '../../utils/clientBackendBridge'

const defaultAdminNotifications = []

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

const safeParseJson = (rawValue, fallback) => {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : fallback
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

const formatAdminRealtimeTimestamp = (value = '') => {
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

const isAdminAccount = (account = {}) => {
  const normalizedRole = String(account?.role || '').trim().toLowerCase()
  const normalizedEmail = String(account?.email || '').trim().toLowerCase()
  return normalizedRole === 'admin'
    || normalizedEmail.startsWith('admin@')
    || normalizedEmail.endsWith('@admin.kiamina.local')
}

const flattenDocumentRowsForSearch = (rows = [], fallbackCategory = '') => (
  (Array.isArray(rows) ? rows : []).flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    if (!row.isFolder) return [{ ...row, category: row.category || fallbackCategory }]
    const files = Array.isArray(row.files) ? row.files : []
    return files.map((file) => ({
      ...file,
      category: file.category || fallbackCategory,
      folderName: file.folderName || row.folderName || '',
    }))
  })
)

const extractClientEmailFromDocumentStorageKey = (storageKey = '') => {
  const prefix = 'kiaminaClientDocuments:'
  if (!String(storageKey).startsWith(prefix)) return ''
  return String(storageKey).slice(prefix.length).trim().toLowerCase()
}

const readAdminSearchSnapshot = (currentAdminAccount = null) => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { clients: [], documents: [], activityLogs: [] }
  }

  const accounts = safeParseJson(localStorage.getItem('kiaminaAccounts'), [])
  const allClients = (Array.isArray(accounts) ? accounts : [])
    .filter((account) => account && typeof account === 'object' && !isAdminAccount(account))
    .map((account, index) => ({
      id: `client-${account.email || index}`,
      businessName: account.businessName || account.companyName || account.fullName || `Client ${index + 1}`,
      fullName: account.fullName || '',
      email: account.email || '',
      country: account.country || '',
      status: account.status || '',
    }))
  const clients = filterClientsForAdminScope(allClients, currentAdminAccount || {})

  const assignedClientEmailSet = getAssignedClientEmailSetForAdmin(currentAdminAccount || {})
  const documentStorageKeys = Object.keys(localStorage)
    .filter((key) => {
      if (!(key === 'kiaminaClientDocuments' || key.startsWith('kiaminaClientDocuments:'))) return false
      if (assignedClientEmailSet === null) return true
      const scopedEmail = extractClientEmailFromDocumentStorageKey(key)
      return Boolean(scopedEmail && assignedClientEmailSet.has(scopedEmail))
    })
  const documentBundles = documentStorageKeys.flatMap((key) => {
    const parsed = safeParseJson(localStorage.getItem(key), null)
    if (!parsed || typeof parsed !== 'object') return []
    return [parsed]
  })

  const documents = documentBundles.flatMap((bundle) => {
    const expenses = flattenDocumentRowsForSearch(bundle.expenses, 'Expense')
    const sales = flattenDocumentRowsForSearch(bundle.sales, 'Sales')
    const bankStatements = flattenDocumentRowsForSearch(bundle.bankStatements, 'Bank Statement')
    const uploadHistory = flattenDocumentRowsForSearch(bundle.uploadHistory, 'Upload History')
    return [...expenses, ...sales, ...bankStatements, ...uploadHistory]
  })
    .filter((row) => row && typeof row === 'object')
    .map((row, index) => ({
      id: `doc-${row.fileId || row.id || row.filename || index}`,
      filename: row.filename || row.fileId || `Document ${index + 1}`,
      category: row.category || '',
      fileId: row.fileId || '',
      folderName: row.folderName || '',
      status: row.status || '',
      user: row.user || '',
    }))

  const activityLogs = safeParseJson(localStorage.getItem('kiaminaAdminActivityLog'), [])
  const viewerCanSeeOwnerActivity = isOwnerAdminLevel(currentAdminAccount?.adminLevel)
  const normalizedActivityLogs = (Array.isArray(activityLogs) ? activityLogs : [])
    .filter((row) => viewerCanSeeOwnerActivity || !isOwnerAdminLevel(row?.adminLevel))
    .map((row, index) => ({
    id: `activity-${row.id || index}`,
    action: row.action || 'Admin action',
    adminLevel: row.adminLevel || '',
    affectedUser: row.affectedUser || '',
    details: row.details || '',
    timestamp: row.timestamp || '',
    }))

  return { clients, documents, activityLogs: normalizedActivityLogs }
}

function AdminAccessDenied({ onReturn }) {
  return (
    <div className="h-full min-h-[420px] bg-white rounded-lg shadow-card border border-border-light p-8 flex items-center justify-center">
      <div className="max-w-md text-center">
        <h2 className="text-2xl font-semibold text-text-primary">Insufficient Permissions</h2>
        <p className="text-sm text-text-secondary mt-2">You do not have access to this feature.</p>
        <button
          type="button"
          onClick={onReturn}
          className="mt-5 h-10 px-4 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-light transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  )
}

function AdminWorkspace({
  activePage,
  setActivePage,
  onLogout,
  showToast,
  adminFirstName,
  currentAdminAccount,
  onRequestImpersonation,
  onRequestAdminImpersonation,
  impersonationEnabled,
  onAdminActionLog,
  onCurrentAdminEmailUpdated,
}) {
  const [adminNotifications, setAdminNotifications] = useState(defaultAdminNotifications)
  const [selectedClientContext, setSelectedClientContext] = useState(null)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [adminSearchTerm, setAdminSearchTerm] = useState('')
  const [adminSearchResults, setAdminSearchResults] = useState([])
  const [adminSearchState, setAdminSearchState] = useState('idle')
  const [searchIndexRevision, setSearchIndexRevision] = useState(0)
  const [isSlowRuntimeOverlayVisible, setIsSlowRuntimeOverlayVisible] = useState(false)
  const [slowRuntimeOverlayMessage, setSlowRuntimeOverlayMessage] = useState('Please wait...')
  const adminSearchRequestRef = useRef(0)
  const adminSearchTimeoutRef = useRef(null)
  const slowRuntimeOperationCountRef = useRef(0)
  const slowRuntimeRevealTimerRef = useRef(null)
  const slowRuntimeHideTimerRef = useRef(null)
  const slowRuntimeMinVisibleUntilRef = useRef(0)
  const slowRuntimeVisibleRef = useRef(false)
  const slowRuntimeMessageRef = useRef('Please wait...')
  const activePageRef = useRef(activePage)
  const supportUnreadRef = useRef(-1)
  const currentAdminEmail = String(currentAdminAccount?.email || '').trim().toLowerCase()
  const liveAdminSearchSnapshot = useMemo(
    () => readAdminSearchSnapshot(currentAdminAccount),
    [searchIndexRevision, currentAdminAccount],
  )
  const adminSearchEntries = useMemo(() => ([
    { id: 'search-admin-dashboard', label: 'Admin Dashboard', description: 'Overview and key admin metrics', pageId: 'admin-dashboard', keywords: ['dashboard', 'overview', 'metrics'] },
    { id: 'search-admin-clients', label: 'Client Management', description: 'Manage client accounts', pageId: 'admin-clients', keywords: ['clients', 'accounts', 'businesses'] },
    { id: 'search-admin-documents', label: 'Document Review Center', description: 'Approve, reject, and request information', pageId: 'admin-documents', keywords: ['documents', 'review', 'approve', 'reject', 'pending'] },
    { id: 'search-admin-leads', label: 'Leads', description: 'Lead registry from support chat', pageId: 'admin-leads', keywords: ['leads', 'prospects', 'support', 'inquiries'] },
    { id: 'search-admin-trash', label: 'Trash', description: 'Restore deleted items or empty trash', pageId: 'admin-trash', keywords: ['trash', 'restore', 'deleted', 'recycle bin'] },
    { id: 'search-admin-insights', label: 'Insights Publishing', description: 'Upload and manage website insight articles', pageId: 'admin-insights', keywords: ['insights', 'article', 'publish', 'thought leadership'] },
    { id: 'search-admin-communications', label: 'Communications Center', description: 'Conversation and communication tools', pageId: 'admin-communications', keywords: ['communications', 'messages', 'broadcast'] },
    { id: 'search-admin-notifications', label: 'Send Notification', description: 'Send bulk or targeted notifications', pageId: 'admin-notifications', keywords: ['notification', 'bulk', 'targeted', 'send'] },
    { id: 'search-admin-work-hours', label: 'Work Hours', description: 'Admin time clock and daily hour tracking', pageId: 'admin-work-hours', keywords: ['work hours', 'clock in', 'clock out', 'timesheet'] },
    { id: 'search-admin-activity', label: 'Activity Log', description: 'System activity audit trail', pageId: 'admin-activity', keywords: ['activity', 'audit', 'logs'] },
    { id: 'search-admin-settings', label: 'Admin Settings', description: 'Manage roles, permissions, and system controls', pageId: 'admin-settings', keywords: ['settings', 'admin', 'permissions', 'roles'] },
    ...liveAdminSearchSnapshot.clients.map((client) => ({
      id: `search-client-${client.id}`,
      label: client.businessName || client.fullName || 'Client Account',
      description: `Client / ${client.email || '--'}`,
      pageId: 'admin-clients',
      keywords: [client.fullName, client.country, client.status, 'client', 'account'],
    })),
    ...liveAdminSearchSnapshot.documents.map((document) => ({
      id: `search-document-${document.id}`,
      label: document.filename,
      description: `Document / ${document.category || 'General'}`,
      pageId: 'admin-documents',
      keywords: [document.fileId, document.folderName, document.status, document.user, 'document', 'review'],
    })),
    ...liveAdminSearchSnapshot.activityLogs.map((log) => ({
      id: `search-activity-${log.id}`,
      label: log.action,
      description: 'Activity Log',
      pageId: 'admin-activity',
      keywords: [log.affectedUser, log.details, log.timestamp, log.adminLevel, 'activity', 'audit'],
    })),
    ...adminNotifications.map((notification, index) => ({
      id: `search-admin-notification-${notification.id || index}`,
      label: notification.message || `Notification ${index + 1}`,
      description: 'Notification item',
      pageId: 'admin-dashboard',
      keywords: [notification.type, notification.timestamp, 'notification'],
    })),
  ].map((entry) => {
    const label = String(entry.label || '').trim()
    const description = String(entry.description || '').trim()
    const keywords = Array.isArray(entry.keywords) ? entry.keywords : []
    return {
      id: entry.id,
      label,
      description,
      pageId: entry.pageId,
      searchText: [label, description, ...keywords]
        .map((value) => String(value || '').toLowerCase())
        .join(' '),
    }
  })), [adminNotifications, liveAdminSearchSnapshot])
  const adminSearchSuggestions = useMemo(() => (
    buildKeywordSuggestions([
      ...adminSearchEntries.flatMap((entry) => [entry.label, entry.description, entry.searchText]),
    ], 24)
  ), [adminSearchEntries])

  const handleMarkNotificationRead = (notificationId) => {
    setAdminNotifications((prev) => prev.map((notification) => (
      notification.id === notificationId ? { ...notification, read: true } : notification
    )))
  }

  const handleMarkAllNotificationsRead = () => {
    setAdminNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })))
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

  const dismissAdminSearchFeedback = () => {
    if (adminSearchTimeoutRef.current) {
      window.clearTimeout(adminSearchTimeoutRef.current)
      adminSearchTimeoutRef.current = null
    }
    setAdminSearchState('idle')
    setAdminSearchResults([])
  }

  const handleAdminSearchTermChange = (value = '') => {
    setAdminSearchTerm(String(value || ''))
    dismissAdminSearchFeedback()
  }

  const handleAdminSearchSubmit = (value = adminSearchTerm) => {
    const nextTerm = String(value || '')
    const normalizedQuery = nextTerm.trim().toLowerCase()
    setAdminSearchTerm(nextTerm)

    if (!normalizedQuery) {
      dismissAdminSearchFeedback()
      return
    }

    if (adminSearchTimeoutRef.current) {
      window.clearTimeout(adminSearchTimeoutRef.current)
      adminSearchTimeoutRef.current = null
    }

    const requestId = adminSearchRequestRef.current + 1
    adminSearchRequestRef.current = requestId
    setAdminSearchState('loading')
    setAdminSearchResults([])

    adminSearchTimeoutRef.current = window.setTimeout(() => {
      if (adminSearchRequestRef.current !== requestId) return

      const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean)
      const matches = adminSearchEntries
        .map((entry) => {
          const label = entry.label.toLowerCase()
          const matchesAllTokens = queryTokens.every((token) => entry.searchText.includes(token))
          if (!matchesAllTokens) return null

          let score = 0
          if (label === normalizedQuery) score += 220
          if (label.startsWith(normalizedQuery)) score += 140
          if (label.includes(normalizedQuery)) score += 80
          queryTokens.forEach((token) => {
            if (label.startsWith(token)) score += 24
            else if (label.includes(token)) score += 10
          })

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
        setAdminSearchResults([])
        setAdminSearchState('empty')
        return
      }

      setAdminSearchResults(matches)
      setAdminSearchState('ready')
    }, getNetworkAwareDurationMs('search'))
  }

  const handleAdminSearchResultSelect = (result) => {
    if (!result || typeof result !== 'object') return
    dismissAdminSearchFeedback()
    setAdminSearchTerm(String(result.label || '').trim())
    setIsMobileSidebarOpen(false)
    setActivePage(result.pageId || ADMIN_DEFAULT_PAGE)
  }

  const openClientContext = (client) => {
    if (!client) return
    setSelectedClientContext(client)
    const normalizedUid = String(client?.uid || '').trim()
    if (!normalizedUid) return
    void (async () => {
      try {
        const response = await apiFetch(`/api/users/admin/client-management/clients/${encodeURIComponent(normalizedUid)}`, {
          method: 'GET',
        })
        if (!response.ok) return
        const detail = await response.json().catch(() => null)
        if (!detail || typeof detail !== 'object') return
        setSelectedClientContext((previous) => (
          previous && String(previous.uid || '').trim() === normalizedUid
            ? { ...previous, ...detail }
            : previous
        ))
      } catch {
        // fall back to the currently selected client context
      }
    })()
  }

  useEffect(() => {
    activePageRef.current = activePage
  }, [activePage])

  useEffect(() => {
    if (!currentAdminEmail) return undefined

    let cancelled = false
    const hydrateAdminStorage = async () => {
      const result = await hydrateAdminDashboardStorageFromBackend()
      if (cancelled || !result?.ok) return
      setSearchIndexRevision((value) => value + 1)
    }

    void hydrateAdminStorage()
    const handleWindowFocus = () => {
      void hydrateAdminStorage()
    }

    window.addEventListener('focus', handleWindowFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [currentAdminEmail])

  useEffect(() => {
    if (!selectedClientContext?.email) return
    if (canAdminAccessClientScope(currentAdminAccount || {}, selectedClientContext.email)) return
    setSelectedClientContext(null)
    if (
      activePage === 'admin-client-profile'
      || activePage === 'admin-client-documents'
      || activePage === 'admin-client-upload-history'
      || activePage === 'admin-client-resolved-documents'
    ) {
      setActivePage('admin-clients')
    }
  }, [activePage, currentAdminAccount, selectedClientContext, setActivePage])

  useEffect(() => {
    const handlePrimer = () => {
      if (!isAdminNotificationSoundEnabled(currentAdminEmail)) return
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
  }, [currentAdminEmail])

  useEffect(() => {
    let delayedSoundTimer = null
    const toUnreadCount = (snapshot = {}) => {
      const tickets = Array.isArray(snapshot?.tickets) ? snapshot.tickets : []
      return tickets.reduce((total, ticket) => total + Number(ticket?.unreadByAdmin || 0), 0)
    }

    supportUnreadRef.current = -1
    const unsubscribe = subscribeSupportCenter((snapshot) => {
      const nextUnreadCount = toUnreadCount(snapshot)
      const previousUnreadCount = supportUnreadRef.current
      supportUnreadRef.current = nextUnreadCount
      if (previousUnreadCount < 0) {
        const windowActive = typeof document !== 'undefined'
          ? (document.visibilityState === 'visible' && document.hasFocus())
          : true
        if (
          nextUnreadCount > 0
          && (activePageRef.current !== 'admin-communications' || !windowActive)
          && isAdminNotificationSoundEnabled(currentAdminEmail)
        ) {
          delayedSoundTimer = window.setTimeout(() => {
            playSupportNotificationSound()
          }, SUPPORT_NOTIFICATION_INITIAL_DELAY_MS)
        }
        return
      }
      if (nextUnreadCount <= previousUnreadCount) return

      const windowActive = typeof document !== 'undefined'
        ? (document.visibilityState === 'visible' && document.hasFocus())
        : true
      if ((activePageRef.current !== 'admin-communications' || !windowActive) && isAdminNotificationSoundEnabled(currentAdminEmail)) {
        playSupportNotificationSound()
      }
    })
    return () => {
      if (delayedSoundTimer) window.clearTimeout(delayedSoundTimer)
      unsubscribe()
    }
  }, [currentAdminEmail])

  useEffect(() => {
    slowRuntimeVisibleRef.current = isSlowRuntimeOverlayVisible
  }, [isSlowRuntimeOverlayVisible])

  useEffect(() => {
    if (!currentAdminEmail) return
    const subscription = subscribeToRealtimeEvents({
      scope: 'all',
      topics: ['support', 'chatbot', 'notifications', 'users'],
      onEvent: (event = {}) => {
        const eventType = String(event?.eventType || '').trim().toLowerCase()
        if (!eventType) return
        const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {}

        let message = ''
        if (eventType.startsWith('support.ticket.')) {
          message = eventType.endsWith('.created')
            ? 'New support ticket created.'
            : 'Support ticket updated.'
        } else if (eventType === 'support.message.created') {
          message = 'New support message received.'
        } else if (eventType.startsWith('chatbot.')) {
          message = 'Chatbot conversation updated.'
        } else if (eventType.startsWith('notifications.')) {
          message = String(payload?.message || 'Notification activity updated.').trim()
        } else if (eventType === 'admin.client-management.updated') {
          message = 'Client management data was updated.'
        } else if (eventType.startsWith('client.')) {
          message = 'Client workspace activity updated.'
        }

        const fallbackMessage = message || `${eventType} event received.`
        const eventId = String(event?.eventId || `${eventType}-${Date.now()}-${Math.floor(Math.random() * 1000)}`)
        const nextNotification = {
          id: eventId,
          message: fallbackMessage,
          timestamp: formatAdminRealtimeTimestamp(event?.createdAt),
          read: false,
          type: eventType,
        }

        setAdminNotifications((prev) => {
          const deduped = [nextNotification, ...prev.filter((item) => item.id !== eventId)]
          return deduped.slice(0, 30)
        })

        window.dispatchEvent(new Event('kiamina:admin-dashboard-realtime-sync'))
        if (eventType === 'admin.client-management.updated') {
          window.dispatchEvent(new Event('kiamina:admin-client-management-sync'))
        }
      },
    })

    return () => {
      subscription.close()
    }
  }, [currentAdminEmail])

  useEffect(() => () => {
    if (adminSearchTimeoutRef.current) {
      window.clearTimeout(adminSearchTimeoutRef.current)
      adminSearchTimeoutRef.current = null
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
    const refreshSearchSnapshot = () => setSearchIndexRevision((value) => value + 1)
    refreshSearchSnapshot()
    window.addEventListener('storage', refreshSearchSnapshot)
    const intervalId = window.setInterval(refreshSearchSnapshot, 4000)
    return () => {
      window.removeEventListener('storage', refreshSearchSnapshot)
      window.clearInterval(intervalId)
    }
  }, [])

  const renderAdminPage = () => {
    if (!canAccessAdminPage(activePage, currentAdminAccount)) {
      return <AdminAccessDenied onReturn={() => setActivePage(ADMIN_DEFAULT_PAGE)} />
    }

    switch (activePage) {
      case 'admin-dashboard':
        return <AdminDashboardPage setActivePage={setActivePage} currentAdminAccount={currentAdminAccount} />
      case 'admin-clients':
        return (
          <AdminClientsPage
            showToast={showToast}
            setActivePage={setActivePage}
            onRequestImpersonation={onRequestImpersonation}
            currentAdminAccount={currentAdminAccount}
            impersonationEnabled={impersonationEnabled}
            onAdminActionLog={onAdminActionLog}
            onOpenClientProfile={openClientContext}
            onOpenClientDocuments={openClientContext}
            onOpenClientUploadHistory={openClientContext}
            onOpenClientResolvedDocuments={openClientContext}
          />
        )
      case 'admin-client-profile':
        return (
          <AdminClientProfilePage
            client={selectedClientContext}
            setActivePage={setActivePage}
            showToast={showToast}
            onAdminActionLog={onAdminActionLog}
            currentAdminAccount={currentAdminAccount}
          />
        )
      case 'admin-client-documents':
        return (
          <AdminClientDocumentsPage
            client={selectedClientContext}
            setActivePage={setActivePage}
            showToast={showToast}
            onAdminActionLog={onAdminActionLog}
            currentAdminAccount={currentAdminAccount}
          />
        )
      case 'admin-client-upload-history':
        return (
          <AdminClientUploadHistoryPage
            client={selectedClientContext}
            setActivePage={setActivePage}
            currentAdminAccount={currentAdminAccount}
          />
        )
      case 'admin-client-resolved-documents':
        return (
          <AdminClientResolvedDocumentsPage
            client={selectedClientContext}
            setActivePage={setActivePage}
            showToast={showToast}
            onAdminActionLog={onAdminActionLog}
            currentAdminAccount={currentAdminAccount}
          />
        )
      case 'admin-documents':
        return (
          <AdminDocumentReviewCenter
            showToast={showToast}
            currentAdminAccount={currentAdminAccount}
            runWithSlowRuntimeWatch={runWithSlowRuntimeWatch}
          />
        )
      case 'admin-leads':
        return (
          <AdminSupportLeadsPage
            setActivePage={setActivePage}
            showToast={showToast}
            currentAdminAccount={currentAdminAccount}
            onAdminActionLog={onAdminActionLog}
          />
        )
      case 'admin-communications':
        return (
          <AdminCommunicationsCenter
            showToast={showToast}
            currentAdminAccount={currentAdminAccount}
            onAdminActionLog={onAdminActionLog}
            setActivePage={setActivePage}
          />
        )
      case 'admin-notifications':
        return <AdminSendNotificationPage showToast={showToast} runWithSlowRuntimeWatch={runWithSlowRuntimeWatch} />
      case 'admin-work-hours':
        return <AdminWorkHoursPage currentAdminAccount={currentAdminAccount} />
      case 'admin-insights':
        return (
          <AdminInsightsPage
            showToast={showToast}
            currentAdminAccount={currentAdminAccount}
            onAdminActionLog={onAdminActionLog}
          />
        )
      case 'admin-activity':
        return <AdminActivityLogPage currentAdminAccount={currentAdminAccount} />
      case 'admin-trash':
        return (
          <AdminTrashPage
            showToast={showToast}
            currentAdminAccount={currentAdminAccount}
            onAdminActionLog={onAdminActionLog}
          />
        )
      case 'admin-settings':
        return (
          <AdminSettingsPage
            showToast={showToast}
            currentAdminAccount={currentAdminAccount}
            runWithSlowRuntimeWatch={runWithSlowRuntimeWatch}
            onCurrentAdminEmailUpdated={onCurrentAdminEmailUpdated}
            onRequestAdminImpersonation={onRequestAdminImpersonation}
          />
        )
      default:
        return <AdminDashboardPage setActivePage={setActivePage} currentAdminAccount={currentAdminAccount} />
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AdminSidebar
        activePage={activePage}
        setActivePage={setActivePage}
        onLogout={onLogout}
        currentAdminAccount={currentAdminAccount}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        <AdminTopBar
          adminFirstName={adminFirstName}
          notifications={adminNotifications}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          currentAdminAccount={currentAdminAccount}
          onOpenSidebar={() => setIsMobileSidebarOpen(true)}
          searchTerm={adminSearchTerm}
          onSearchTermChange={handleAdminSearchTermChange}
          onSearchSubmit={handleAdminSearchSubmit}
          searchSuggestions={adminSearchSuggestions}
          searchState={adminSearchState}
          searchResults={adminSearchResults}
          onSearchResultSelect={handleAdminSearchResultSelect}
          onSearchResultsDismiss={dismissAdminSearchFeedback}
          onAdminActionLog={onAdminActionLog}
        />
        <main className="p-4 sm:p-6 flex-1 overflow-auto">
          {renderAdminPage()}
        </main>
        {isSlowRuntimeOverlayVisible && (
          <div className="fixed inset-0 z-[225] bg-black/25 flex items-center justify-center p-6">
            <div className="w-full max-w-lg rounded-2xl border border-border-light bg-white shadow-card px-6 py-10 text-center">
              <DotLottiePreloader size={220} className="w-full justify-center" />
              <p className="mt-3 text-sm font-medium text-text-primary">{slowRuntimeOverlayMessage}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminWorkspace
export { ADMIN_DEFAULT_PAGE }
