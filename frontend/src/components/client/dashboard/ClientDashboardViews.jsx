import { useState, useEffect, useRef } from 'react'
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
  Menu,
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
  ChevronRight,
  User,
  Shield,
  CheckCircle,
  AlertCircle,
  UploadCloud,
  Download,
  FolderOpen,
  MapPin,
  Folder,
  Building,
  MessageCircle,
  XCircle,
  HelpCircle,
  Pin,
  Sun,
  Moon,
  Sunrise,
  Home,
} from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import JSZip from 'jszip'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import KiaminaLogo from '../../common/KiaminaLogo'
import { getCachedFileBlob } from '../../../utils/fileCache'
import { buildClientDownloadFilename } from '../../../utils/downloadFilename'
import { parseFirstWorksheet } from '../../../utils/excelWorkbook'
import { ClientSupportPageExperience, ClientSupportWidgetExperience } from '../support/ClientSupportExperience'
import DotLottiePreloader from '../../common/DotLottiePreloader'
import { registerNewsletterSubscriberLead } from '../../../utils/supportCenter'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const toIsoDate = (date = new Date()) => {
  const source = date instanceof Date ? date : new Date(date)
  const year = source.getFullYear()
  const month = String(source.getMonth() + 1).padStart(2, '0')
  const day = String(source.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const clampFilterDateToToday = (value = '') => {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  const todayIso = toIsoDate(new Date())
  return normalized > todayIso ? todayIso : normalized
}

const buildSearchSuggestions = (values = [], limit = 12) => {
  const seen = new Set()
  const suggestions = []
  ;(Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = String(value || '').trim()
    if (!normalized) return
    const key = normalized.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    suggestions.push(normalized)
  })
  return suggestions.slice(0, Math.max(1, limit))
}

const COUNTRY_ALIAS_TO_CODE = Object.freeze({
  nigeria: 'NG',
  ng: 'NG',
  'united states': 'US',
  usa: 'US',
  us: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  gb: 'GB',
  'great britain': 'GB',
  canada: 'CA',
  ca: 'CA',
  australia: 'AU',
  au: 'AU',
})

const COUNTRY_LABEL_BY_CODE = Object.freeze({
  NG: 'Nigeria',
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
})

const toCountryFlagEmoji = (countryCode = '') => {
  const normalized = String(countryCode || '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized)) return '🏳️'
  return normalized
    .split('')
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join('')
}

const resolveCountryDisplay = (country = '') => {
  const label = String(country || '').trim()
  if (!label) return { label: 'Country Not Set', shortCode: '--', flag: '🏳️' }

  const normalized = label.toLowerCase()
  const resolvedCode = COUNTRY_ALIAS_TO_CODE[normalized]
    || (/^[A-Za-z]{2}$/.test(label) ? label.toUpperCase() : '')
  const shortCode = resolvedCode
    || label.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()
    || '--'

  return {
    label: COUNTRY_LABEL_BY_CODE[resolvedCode] || label,
    shortCode,
    flag: toCountryFlagEmoji(shortCode),
  }
}

const getDashboardGreetingMeta = (firstName = 'Client') => {
  const hour = new Date().getHours()
  if (hour < 12) {
    return {
      icon: Sunrise,
      eyebrow: 'Good morning',
      headline: `Ready for a strong start, ${firstName}?`,
    }
  }
  if (hour < 18) {
    return {
      icon: Sun,
      eyebrow: 'Good afternoon',
      headline: `Keep momentum going, ${firstName}.`,
    }
  }
  return {
    icon: Moon,
    eyebrow: 'Good evening',
    headline: `Here is your dashboard snapshot, ${firstName}.`,
  }
}

const SPREADSHEET_PREVIEW_EXTENSIONS = new Set(['CSV', 'XLS', 'XLSX', 'XLSM', 'XLSB'])
const TEXT_PREVIEW_EXTENSIONS = new Set(['TXT'])
const WORD_PREVIEW_EXTENSIONS = new Set(['DOC', 'DOCX'])
const PRESENTATION_PREVIEW_EXTENSIONS = new Set(['PPT', 'PPTX'])
const OFFICE_EMBED_PREVIEW_EXTENSIONS = new Set(['DOC', 'DOCX', 'XLS', 'XLSX', 'XLSM', 'XLSB', 'PPT', 'PPTX'])
const PDF_PREVIEW_EXTENSIONS = new Set(['PDF'])
const IMAGE_PREVIEW_EXTENSIONS = new Set(['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'BMP'])
const EMPTY_FILE_RECORD = Object.freeze({})
const MIME_EXTENSION_MAP = {
  'application/pdf': 'PDF',
  'text/plain': 'TXT',
  'text/csv': 'CSV',
  'application/csv': 'CSV',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-excel.sheet.macroenabled.12': 'XLSM',
  'application/vnd.ms-excel.sheet.binary.macroenabled.12': 'XLSB',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/jpg': 'JPG',
  'image/gif': 'GIF',
  'image/webp': 'WEBP',
  'image/bmp': 'BMP',
}

const normalizeFileExtension = (value = '') => String(value || '').trim().replace(/^\./, '').toUpperCase()

const getFileNameExtension = (name = '') => {
  const safeName = String(name || '').trim()
  const dotIndex = safeName.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === safeName.length - 1) return ''
  return normalizeFileExtension(safeName.slice(dotIndex + 1))
}

const resolveMimeTypeToExtension = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return ''
  return MIME_EXTENSION_MAP[normalized] || ''
}

const resolveTypeToExtension = (value = '') => {
  const normalized = normalizeFileExtension(value)
  if (normalized && /^[A-Z0-9]{2,6}$/.test(normalized)) return normalized
  return resolveMimeTypeToExtension(value)
}

const getDataUrlMimeType = (value = '') => {
  const source = String(value || '').trim()
  if (!source.toLowerCase().startsWith('data:')) return ''
  const header = source.slice(5, source.indexOf(',') > -1 ? source.indexOf(',') : undefined)
  return String(header.split(';')[0] || '').trim().toLowerCase()
}

const resolvePreviewExtension = (target = {}, fallback = {}) => (
  normalizeFileExtension(target?.extension)
  || normalizeFileExtension(fallback?.extension)
  || resolveTypeToExtension(target?.type)
  || resolveTypeToExtension(fallback?.type)
  || resolveMimeTypeToExtension(target?.mimeType)
  || resolveMimeTypeToExtension(fallback?.mimeType)
  || resolveMimeTypeToExtension(target?.rawFile?.type)
  || resolveMimeTypeToExtension(fallback?.rawFile?.type)
  || resolveMimeTypeToExtension(getDataUrlMimeType(target?.previewUrl || target?.url || target?.fileUrl || target?.documentUrl || ''))
  || resolveMimeTypeToExtension(getDataUrlMimeType(fallback?.previewUrl || fallback?.url || fallback?.fileUrl || fallback?.documentUrl || ''))
  || getFileNameExtension(target?.filename)
  || getFileNameExtension(fallback?.filename)
  || getFileNameExtension(target?.name)
  || getFileNameExtension(fallback?.name)
  || getFileNameExtension(target?.rawFile?.name)
  || getFileNameExtension(fallback?.rawFile?.name)
)

const isHttpUrl = (value = '') => /^https?:\/\//i.test(String(value || '').trim())
const isPrivateOrLocalHostName = (host = '') => {
  const normalizedHost = String(host || '').trim().toLowerCase()
  if (!normalizedHost) return true
  if (
    normalizedHost === 'localhost'
    || normalizedHost === '127.0.0.1'
    || normalizedHost === '0.0.0.0'
    || normalizedHost === '::1'
    || normalizedHost.endsWith('.local')
  ) {
    return true
  }
  if (/^10\./.test(normalizedHost)) return true
  if (/^192\.168\./.test(normalizedHost)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalizedHost)) return true
  return false
}
const isPublicHttpUrl = (value = '') => {
  if (!isHttpUrl(value)) return false
  try {
    const parsed = new URL(String(value || '').trim())
    return !isPrivateOrLocalHostName(parsed.hostname)
  } catch {
    return false
  }
}
const toOfficeEmbedUrl = (value = '') => (
  isPublicHttpUrl(value) ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(String(value || ''))}` : ''
)

const runtimeObjectUrlCache = new WeakMap()
const isBlobLike = (value) => (
  typeof Blob !== 'undefined'
  && value instanceof Blob
)

const getRuntimeObjectUrl = (blob) => {
  if (!isBlobLike(blob)) return ''
  if (!runtimeObjectUrlCache.has(blob)) {
    runtimeObjectUrlCache.set(blob, URL.createObjectURL(blob))
  }
  return runtimeObjectUrlCache.get(blob) || ''
}

const normalizeRuntimePreviewUrl = (value = '', { allowBlob = false } = {}) => {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (!allowBlob && /^blob:/i.test(normalized)) return ''
  return normalized
}

const triggerBrowserDownload = ({
  url = '',
  blob = null,
  fileName = 'document',
} = {}) => {
  const downloadUrl = blob instanceof Blob ? URL.createObjectURL(blob) : String(url || '').trim()
  if (!downloadUrl) return false

  const anchor = document.createElement('a')
  anchor.href = downloadUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)

  if (blob instanceof Blob) {
    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(downloadUrl)
      } catch {
        // ignore object URL cleanup failures
      }
    }, 0)
  }

  return true
}

const readBlobAsText = (blob) => new Promise((resolve, reject) => {
  if (!blob) {
    resolve('')
    return
  }
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(new Error('Unable to read text content'))
  reader.readAsText(blob)
})

const readBlobAsArrayBuffer = (blob) => new Promise((resolve, reject) => {
  if (!blob) {
    resolve(new ArrayBuffer(0))
    return
  }
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result instanceof ArrayBuffer ? reader.result : new ArrayBuffer(0))
  reader.onerror = () => reject(new Error('Unable to read binary content'))
  reader.readAsArrayBuffer(blob)
})

const decodeXmlEntities = (value = '') => (
  String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
)

const extractReadableXmlText = (xmlContent = '') => {
  const xml = String(xmlContent || '')
  if (!xml) return ''
  try {
    const parser = new DOMParser()
    const parsed = parser.parseFromString(xml, 'application/xml')
    const textNodes = Array.from(parsed.getElementsByTagNameNS('*', 't'))
    const value = textNodes.map((node) => (node.textContent || '').trim()).filter(Boolean).join('\n').trim()
    if (value) return value
  } catch {
    // fallback to regex extraction
  }
  const regexMatches = Array.from(xml.matchAll(/<[^:>]+:t[^>]*>([\s\S]*?)<\/[^:>]+:t>/gi))
  const extracted = regexMatches.map((match) => decodeXmlEntities(match[1] || '').trim()).filter(Boolean).join('\n').trim()
  return extracted
}

function StatusBadge({ status }) {
  const styles = {
    'Approved': 'bg-success-bg text-success',
    'Pending Review': 'bg-warning-bg text-warning',
    'Rejected': 'bg-error-bg text-error',
    'Info Requested': 'bg-info-bg text-primary',
    'Needs Clarification': 'bg-info-bg text-primary',
  }
  
  return (
    <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${styles[status] || styles['Pending Review']}`}>
      {status}
    </span>
  )
}

// Category Tag Component
function CategoryTag({ category }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs bg-background text-text-secondary">
      {category}
    </span>
  )
}

// File Type Icon Component
function FileTypeIcon({ type }) {
  const safeType = String(type || 'FILE').trim().toUpperCase() || 'FILE'
  const styles = {
    'PDF': 'bg-error-bg text-error',
    'XLSX': 'bg-success-bg text-success',
    'DOCX': 'bg-info-bg text-primary',
    'CSV': 'bg-warning-bg text-warning',
  }
  
  return (
    <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-semibold ${styles[safeType] || 'bg-background text-text-secondary'}`}>
      {safeType.substring(0, 3)}
    </div>
  )
}

// Empty state component for lists
function EmptyState({ title = 'No records', description = 'There are no items to display.', cta }) {
  return (
    <div className="py-8 text-center">
      <div className="mx-auto w-36 h-36 bg-background rounded-md flex items-center justify-center mb-4">
        <UploadCloud className="w-10 h-10 text-text-muted" />
      </div>
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="text-xs text-text-muted mt-1">{description}</div>
      {cta && (<div className="mt-3">{cta}</div>)}
    </div>
  )
}

function ErrorBanner({ message, onRetry }) {
  if (!message) return null
  return (
    <div className="bg-error-bg border border-error text-error rounded-md px-4 py-3 mb-4 flex items-center justify-between">
      <div className="text-sm">{message}</div>
      {onRetry && (<button onClick={onRetry} className="text-sm underline">Retry</button>)}
    </div>
  )
}

const updateRecordsForFile = (records = [], updated = {}) => (
  records.map((record) => {
    if (record?.isFolder && updated?.folderId && record.id === updated.folderId) {
      return {
        ...record,
        files: (record.files || []).map((file) => (
          file.fileId === updated.fileId ? { ...file, ...updated } : file
        )),
      }
    }
    if (!record?.isFolder && updated?.id !== undefined && record.id === updated.id) {
      return { ...record, ...updated }
    }
    return record
  })
)

const removeFileFromRecords = (records = [], target = {}) => {
  if (target?.folderId && target?.fileId) {
    return records
      .map((record) => {
        if (!record?.isFolder || record.id !== target.folderId) return record
        const nextFiles = (record.files || []).filter((file) => file.fileId !== target.fileId)
        return { ...record, files: nextFiles }
      })
      .filter((record) => {
        if (!record?.isFolder || record.id !== target.folderId) return true
        return (record.files || []).length > 0
      })
  }

  if (target?.id !== undefined) {
    return records.filter((record) => record.id !== target.id)
  }

  return records
}

// Sidebar Component
function Sidebar({
  activePage,
  setActivePage,
  companyLogo,
  companyName,
  businessCountry = '',
  isBusinessVerified = false,
  onOpenHomePage,
  onLogout,
  isMobileOpen = false,
  onCloseMobile,
}) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard Overview', icon: LayoutDashboard },
    { id: 'expenses', label: 'Expenses', icon: DollarSign },
    { id: 'sales', label: 'Sales', icon: TrendingUp },
    { id: 'bank-statements', label: 'Bank Statements', icon: Building2 },
  ]

  const footerNavItems = [
    { id: 'upload-history', label: 'Upload History', icon: Upload },
    { id: 'resolved-documents', label: 'Resolved Documents', icon: FileText },
    { id: 'recent-activities', label: 'Recent Activities', icon: Clock },
    { id: 'support', label: 'Support', icon: MessageCircle },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  const handleNavSelect = (pageId) => {
    setActivePage(pageId)
    onCloseMobile?.()
  }
  const resolvedCompanyName = String(companyName || '').trim()
  const resolvedCountry = resolveCountryDisplay(businessCountry)

  return (
    <>
      {isMobileOpen && (
        <button
          type="button"
          onClick={() => onCloseMobile?.()}
          aria-label="Close navigation"
          className="fixed inset-0 bg-black/35 z-40 lg:hidden"
        />
      )}
      <aside
        className={`w-64 bg-white border-r border-border fixed left-0 top-0 h-screen flex flex-col z-50 transform transition-transform duration-200 ease-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
      {/* Logo */}
      <div className="p-4 border-b border-border-light flex items-center justify-between">
        <button
          type="button"
          onClick={() => handleNavSelect('dashboard')}
          className="inline-flex items-center"
          title="Go to Dashboard Overview"
        >
          <KiaminaLogo className="h-28 w-auto" />
        </button>
        <button
          type="button"
          onClick={() => onCloseMobile?.()}
          className="w-8 h-8 rounded-md border border-border text-text-muted hover:text-text-primary hover:border-primary lg:hidden"
          aria-label="Close menu"
        >
          <X className="w-4 h-4 mx-auto" />
        </button>
      </div>

      {/* Client Info */}
      <div className="p-4 border-b border-border-light">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-white border border-border-light flex items-center justify-center">
            {companyLogo
              ? <img src={companyLogo} alt="Company Logo" className="w-full h-full object-contain" />
              : <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-text-muted">No Logo</span>}
          </div>
          <div className="text-sm font-medium text-text-primary inline-flex items-center gap-1.5">
            <span>{resolvedCompanyName || 'Company Name Not Set'}</span>
            {isBusinessVerified && <CheckCircle className="w-3.5 h-3.5 text-success" />}
          </div>
        </div>
        <button className="flex items-center gap-2 w-full px-3 py-2 bg-background rounded-md text-sm text-text-secondary hover:bg-border-light transition-colors mt-2">
          <span>{resolvedCountry.flag}</span>
          <span>{resolvedCountry.label}</span>
          <span className="ml-auto text-xs text-text-muted">{resolvedCountry.shortCode}</span>
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNavSelect(item.id)}
            className={("w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all " + (activePage === item.id ? 'bg-primary-tint text-primary border-l-[3px] border-primary' : 'text-text-secondary hover:bg-background hover:text-text-primary border-l-[3px] border-transparent'))}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Divider */}
      <div className="px-4 py-2">
        <div className="border-t border-border-light"></div>
      </div>

      {/* Footer Navigation */}
      <div className="pb-3">
        {footerNavItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNavSelect(item.id)}
            className={("w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all " + (activePage === item.id ? 'bg-primary-tint text-primary border-l-[3px] border-primary' : 'text-text-secondary hover:bg-background hover:text-text-primary border-l-[3px] border-transparent'))}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </button>
        ))}
      </div>

      {/* Logout */}
      <div className="py-3 border-t border-border-light">
        <button
          type="button"
          onClick={() => {
            onCloseMobile?.()
            onOpenHomePage?.()
          }}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-text-secondary hover:bg-background hover:text-text-primary transition-colors"
        >
          <Home className="w-5 h-5" />
          Home Page
        </button>
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

// TopBar Component
function TopBar({
  profilePhoto,
  clientFirstName,
  activePage = '',
  showDashboardGreeting = true,
  isIdentityVerified = false,
  notifications = [],
  onNotificationClick,
  onMarkAllRead,
  onOpenProfile,
  onOpenSidebar,
  isImpersonationMode = false,
  roleLabel = 'Client',
  forceClientIcon = false,
  searchTerm = '',
  onSearchTermChange,
  searchPlaceholder = '',
  searchState = 'idle',
  searchResults = [],
  onSearchSubmit,
  onSearchResultSelect,
  onSearchResultsDismiss,
}) {
  const displayName = clientFirstName?.trim() || 'Client'
  const shouldShowDashboardGreeting = showDashboardGreeting && String(activePage || '').trim() === 'dashboard'
  const greetingMeta = getDashboardGreetingMeta(displayName)
  const GreetingIcon = greetingMeta.icon
  const fallbackInitial = displayName.charAt(0).toUpperCase() || 'C'
  const [showNotifications, setShowNotifications] = useState(false)
  const notificationRef = useRef(null)
  const searchRef = useRef(null)
  const unreadCount = notifications.filter(n => !n.read).length
  const resolvedSearchTerm = String(searchTerm || '')
  const resolvedSearchPlaceholder = searchPlaceholder
    || (isImpersonationMode ? 'Search client data (admin view)...' : 'Search transactions, documents...')
  const resolvedSearchState = String(searchState || 'idle')
  const resolvedSearchResults = Array.isArray(searchResults) ? searchResults : []
  const shouldShowSearchPanel = resolvedSearchState !== 'idle'

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

  const handleNotificationClick = (notification) => {
    if (onNotificationClick) {
      onNotificationClick(notification)
    }
    setShowNotifications(false)
  }

  return (
    <header className="h-16 bg-white border-b border-border flex items-center justify-between px-3 sm:px-4 lg:px-6 sticky top-0 z-40 gap-2">
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <button
          type="button"
          onClick={() => onOpenSidebar?.()}
          className="w-9 h-9 border border-border rounded-md text-text-secondary hover:text-text-primary hover:border-primary lg:hidden inline-flex items-center justify-center flex-shrink-0"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        {shouldShowDashboardGreeting && (
          <div className="hidden lg:flex items-center gap-2.5 h-10 px-3 rounded-xl border border-primary/25 bg-gradient-to-r from-primary/10 via-white to-success/10 shadow-sm flex-shrink-0">
            <div className="w-7 h-7 rounded-full bg-white border border-primary/20 text-primary inline-flex items-center justify-center">
              <GreetingIcon className="w-4 h-4" />
            </div>
            <div className="leading-tight min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-text-muted">{greetingMeta.eyebrow}</p>
              <p className="text-xs font-semibold text-text-primary truncate max-w-[15rem]">{greetingMeta.headline}</p>
            </div>
          </div>
        )}
        <div className="relative w-full sm:max-w-[20rem] lg:max-w-[24rem]" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
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
            placeholder={resolvedSearchPlaceholder}
            className="w-full h-9 pl-10 pr-10 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary focus:bg-white transition-colors"
          />
          {resolvedSearchState === 'loading' && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <DotLottiePreloader size={18} />
            </div>
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
      
      <div className="flex items-center gap-3">
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotifications((value) => !value)}
            className="relative w-10 h-9 rounded-md flex items-center justify-center text-text-secondary hover:bg-background"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-error text-white rounded-full text-[10px] flex items-center justify-center">{unreadCount}</span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-1rem))] bg-white border border-border rounded-lg shadow-card z-50">
              <div className="p-3 border-b border-border-light flex items-center justify-between">
                <h3 className="text-sm font-semibold">Notifications</h3>
                <button onClick={() => onMarkAllRead?.()} className="text-xs text-primary hover:underline">Mark all read</button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-4 text-sm text-text-muted">No notifications</div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-3 border-b border-border-light hover:bg-background cursor-pointer ${!notification.read ? 'bg-primary-tint' : ''}`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {notification.type === 'approved' ? <CheckCircle className="w-4 h-4 text-success" /> : notification.type === 'rejected' ? <XCircle className="w-4 h-4 text-error" /> : notification.type === 'info' ? <AlertCircle className="w-4 h-4 text-warning" /> : <UploadCloud className="w-4 h-4 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary">{notification.message}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="w-3 h-3 text-text-muted" />
                            <span className="text-xs text-text-muted">{notification.timestamp}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        
        <button
          type="button"
          onClick={() => onOpenProfile?.()}
          className="flex items-center gap-2 sm:gap-3 sm:pl-3 sm:border-l border-border hover:opacity-90 transition-opacity"
          title="Open Profile Settings"
        >
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-sm font-semibold overflow-hidden">
            {forceClientIcon ? (
              <User className="w-4 h-4" />
            ) : profilePhoto ? (
              <img src={profilePhoto} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              fallbackInitial
            )}
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="text-sm font-medium text-text-primary inline-flex items-center gap-1.5">
              <span>{displayName}</span>
              {isIdentityVerified && <CheckCircle className="w-3.5 h-3.5 text-success" />}
            </span>
            <span className="text-[11px] text-text-muted">{roleLabel || 'Client'}</span>
          </div>
        </button>
      </div>
    </header>
  )
}

// Dashboard Overview Page
function DashboardPage({
  onAddDocument,
  setActivePage,
  records = [],
  activityLogs = [],
  documentSummary = null,
  isLoading = false,
  showSlowNetworkOverlay = false,
}) {
  const parseDateValue = (value = '') => {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  const sortedRecords = [...(Array.isArray(records) ? records : [])]
    .sort((a, b) => (
      parseDateValue(b.updatedAtIso || b.createdAtIso || b.timestampIso || b.date)
      - parseDateValue(a.updatedAtIso || a.createdAtIso || a.timestampIso || a.date)
    ))

  const hasDocumentSummary = Boolean(
    documentSummary
    && typeof documentSummary === 'object'
    && documentSummary.statusCounts
    && documentSummary.categoryCounts,
  )
  const summaryStatus = hasDocumentSummary ? documentSummary.statusCounts : {}
  const summaryCategory = hasDocumentSummary ? documentSummary.categoryCounts : {}
  const localApprovedCount = sortedRecords.filter((record) => record.status === 'Approved').length
  const localPendingCount = sortedRecords.filter((record) => record.status === 'Pending Review').length
  const localRejectedCount = sortedRecords.filter((record) => record.status === 'Rejected').length
  const localExpenseFiles = sortedRecords.filter((record) => record.categoryId === 'expenses' || record.category === 'Expense').length
  const localSalesFiles = sortedRecords.filter((record) => record.categoryId === 'sales' || record.category === 'Sales').length
  const localBankFiles = sortedRecords.filter((record) => (
    record.categoryId === 'bank-statements'
    || record.category === 'Bank Statement'
    || record.category === 'Bank'
  )).length

  // Prefer whichever source reflects more real data so stale backend summaries do not zero out the cards.
  const approvedCount = hasDocumentSummary
    ? Math.max(localApprovedCount, Number(documentSummary.approvedDocuments ?? summaryStatus.ready ?? 0))
    : localApprovedCount
  const pendingCount = hasDocumentSummary
    ? Math.max(
      localPendingCount,
      Number(documentSummary.pendingDocuments ?? ((summaryStatus.processing || 0) + (summaryStatus.toReview || 0) + (summaryStatus.infoRequested || 0))),
    )
    : localPendingCount
  const rejectedCount = hasDocumentSummary
    ? Math.max(localRejectedCount, Number(documentSummary.rejectedDocuments ?? summaryStatus.rejected ?? 0))
    : localRejectedCount
  const totalExpenseFiles = hasDocumentSummary
    ? Math.max(localExpenseFiles, Number(summaryCategory.expenses || 0))
    : localExpenseFiles
  const totalSalesFiles = hasDocumentSummary
    ? Math.max(localSalesFiles, Number(summaryCategory.sales || 0))
    : localSalesFiles
  const totalBankFiles = hasDocumentSummary
    ? Math.max(localBankFiles, Number(summaryCategory.bankStatements || 0))
    : localBankFiles

  // Activity Timeline
  const formatActivityTimestamp = (value = '') => {
    const parsed = parseDateValue(value)
    if (!parsed) return value || 'Just now'
    return new Date(parsed).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  const resolveActivityType = (action = '', details = '') => {
    const text = `${action} ${details}`.toLowerCase()
    if (text.includes('approve')) return 'approval'
    if (text.includes('reject') || text.includes('delete')) return 'rejection'
    if (text.includes('info') || text.includes('clarification')) return 'verification'
    return 'upload'
  }

  const getActivityIcon = (type) => {
    switch (type) {
      case 'upload': return 'bg-primary-tint text-primary'
      case 'approval': return 'bg-success-bg text-success'
      case 'rejection': return 'bg-warning-bg text-warning'
      case 'verification': return 'bg-info-bg text-primary'
      default: return 'bg-background text-text-muted'
    }
  }

  const logDrivenActivities = [...(Array.isArray(activityLogs) ? activityLogs : [])]
    .sort((a, b) => parseDateValue(b.timestamp) - parseDateValue(a.timestamp))
    .slice(0, 8)
    .map((entry, idx) => {
      const type = resolveActivityType(entry.action, entry.details)
      return {
        id: entry.id || `log-${idx}`,
        type,
        message: entry.action || 'Client activity',
        details: entry.details || '',
        timestamp: formatActivityTimestamp(entry.timestamp),
        icon: type === 'approval' ? CheckCircle : type === 'rejection' ? AlertCircle : Upload,
      }
    })

  // fallback derived activities from files when no explicit logs are available
  const derivedActivities = sortedRecords.slice(0, 8).map((r, idx) => {
    let type = 'upload'
    let message = `You uploaded ${r.filename}`
    if (r.status === 'Approved') { type = 'approval'; message = `Admin approved ${r.filename}` }
    if (r.status === 'Rejected') { type = 'rejection'; message = `Admin rejected ${r.filename}` }
    if (r.status === 'Needs Clarification' || r.status === 'Info Requested') { type = 'rejection'; message = `Admin requested more info for ${r.filename}` }
    if (r.versions && r.versions.length > 0) { message = `You updated ${r.filename}` }
    return {
      id: `${r.id}-${idx}`,
      type,
      message,
      details: '',
      timestamp: formatActivityTimestamp(r.date || 'Just now'),
      icon: type === 'approval' ? CheckCircle : type === 'rejection' ? AlertCircle : Upload,
    }
  })
  const timelineActivities = logDrivenActivities.length > 0 ? logDrivenActivities : derivedActivities

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 20,
          font: { size: 12 }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 } }
      },
      y: {
        grid: { color: '#F0F1F2' },
        ticks: {
          font: { size: 11 },
          callback: (value) => '\u20A6' + (value / 1000000).toFixed(0) + 'M'
        }
      }
    }
  }

  const financialData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        label: 'Income',
        data: [85000000, 92000000, 78000000, 110000000, 95000000, 128750000],
        borderColor: '#0D7D4D',
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 3,
      },
      {
        label: 'Expenses',
        data: [32000000, 38000000, 42000000, 35000000, 41000000, 45230000],
        borderColor: '#C92A2A',
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: '#C92A2A'
      }
    ]
  }

  const activityData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      { 
        label: 'Documents',
        data: [52, 68, 45, 72, 58, 85],
        backgroundColor: '#153585',
        borderRadius: 2
      }
    ]
  }

  const stats = [
    { label: 'Total Expenses', value: totalExpenseFiles.toString(), icon: DollarSign, color: 'bg-error-bg text-error', trend: 'Files uploaded', up: true },
    { label: 'Total Sales', value: totalSalesFiles.toString(), icon: TrendingUp, color: 'bg-success-bg text-success', trend: 'Files uploaded', up: true },
    { label: 'Bank Statements', value: totalBankFiles.toString(), icon: Building2, color: 'bg-info-bg text-primary', trend: 'Files uploaded', up: true },
    { label: 'Pending Review', value: pendingCount.toString(), icon: Clock, color: 'bg-warning-bg text-warning', trend: 'Awaiting review', up: false },
    { label: 'Approved Documents', value: approvedCount.toString(), icon: CheckCircle, color: 'bg-success-bg text-success', trend: 'Documents approved', up: true },
    { label: 'Rejected Documents', value: rejectedCount.toString(), icon: X, color: 'bg-error-bg text-error', trend: 'Documents rejected', up: false },
  ]

  const recentExpenses = sortedRecords
    .filter((item) => item.categoryId === 'expenses' || item.category === 'Expense')
    .slice(0, 4)

  const recentSales = sortedRecords
    .filter((item) => item.categoryId === 'sales' || item.category === 'Sales')
    .slice(0, 4)

  const recentBankStatements = sortedRecords
    .filter((item) => item.categoryId === 'bank-statements' || item.category === 'Bank Statement' || item.category === 'Bank')
    .slice(0, 4)

  const loadingStatsPlaceholders = [
    'loading-1',
    'loading-2',
    'loading-3',
    'loading-4',
    'loading-5',
    'loading-6',
  ]

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-start gap-4 w-full">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Dashboard Overview</h1>
            <p className="text-sm text-text-secondary mt-1">Your current document and activity snapshot.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto sm:justify-end">
          <button
            onClick={onAddDocument}
            className="flex items-center justify-center gap-2 h-10 px-5 w-full sm:w-auto sm:shrink-0 whitespace-nowrap bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Document
          </button>
        </div>
      </div>

      <div className="relative">
        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              {loadingStatsPlaceholders.map((id) => (
                <div key={id} className="bg-white rounded-lg shadow-card p-5 flex items-start gap-4 animate-pulse">
                  <div className="w-12 h-12 rounded-md bg-background" />
                  <div className="flex-1">
                    <div className="h-8 w-20 bg-background rounded" />
                    <div className="h-3 w-36 bg-background rounded mt-2" />
                    <div className="h-3 w-24 bg-background rounded mt-3" />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-card">
                <div className="px-5 py-4 border-b border-border-light animate-pulse">
                  <div className="h-4 w-36 bg-background rounded" />
                </div>
                <div className="p-5 space-y-4 animate-pulse">
                  <div className="h-12 bg-background rounded" />
                  <div className="h-12 bg-background rounded" />
                  <div className="h-12 bg-background rounded" />
                  <div className="h-12 bg-background rounded" />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-card">
                <div className="px-5 py-4 border-b border-border-light animate-pulse">
                  <div className="h-4 w-32 bg-background rounded" />
                </div>
                <div className="p-5 space-y-4 animate-pulse">
                  <div className="h-10 bg-background rounded" />
                  <div className="h-10 bg-background rounded" />
                  <div className="h-10 bg-background rounded" />
                  <div className="h-10 bg-background rounded" />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-card">
                <div className="px-5 py-4 border-b border-border-light animate-pulse">
                  <div className="h-4 w-32 bg-background rounded" />
                </div>
                <div className="p-5 space-y-4 animate-pulse">
                  <div className="h-10 bg-background rounded" />
                  <div className="h-10 bg-background rounded" />
                  <div className="h-10 bg-background rounded" />
                  <div className="h-10 bg-background rounded" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 mb-8">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white rounded-lg shadow-card p-5 flex items-start gap-4 hover:shadow-card-hover transition-shadow"
                >
                  <div className={`w-12 h-12 rounded-md flex items-center justify-center ${stat.color}`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[28px] font-semibold text-text-primary leading-tight">{stat.value}</div>
                    <div className="text-[11px] font-medium text-text-secondary uppercase tracking-wide mt-1">{stat.label}</div>
                    <div className={`flex items-center gap-1 text-xs mt-2 ${stat.up ? 'text-success' : 'text-error'}`}>
                      {stat.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {stat.trend}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Activity Timeline & Recent Uploads */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Activity Timeline */}
              <div className="bg-white rounded-lg shadow-card">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
                  <h3 className="text-base font-semibold text-text-primary">Recent Activity</h3>
                  <button
                    onClick={() => setActivePage('recent-activities')}
                    className="text-sm text-primary hover:text-primary-light font-medium flex items-center gap-1"
                  >
                    See All <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="divide-y divide-border-light max-h-80 overflow-y-auto">
                  {(timelineActivities.length === 0) ? (
                    <div className="p-4 text-sm text-text-muted">No recent activity</div>
                  ) : (
                    timelineActivities.map((activity) => (
                      <div key={activity.id} className="px-5 py-3 hover:bg-background transition-colors">
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getActivityIcon(activity.type)}`}>
                            <activity.icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text-primary">{activity.message}</p>
                            {activity.details && <p className="text-xs text-text-secondary mt-0.5">{activity.details}</p>}
                            <p className="text-xs text-text-muted mt-0.5">{activity.timestamp}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              {/* Recent Expenses */}
              <div className="bg-white rounded-lg shadow-card">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
                  <h3 className="text-base font-semibold text-text-primary">Recent Expenses</h3>
                  <button 
                    onClick={() => setActivePage('expenses')}
                    className="text-sm text-primary hover:text-primary-light font-medium flex items-center gap-1"
                  >
                    See All <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="divide-y divide-border-light">
                  {recentExpenses.length === 0 ? (
                    <div className="px-5 py-4 text-sm text-text-muted">No expense files yet.</div>
                  ) : (
                    recentExpenses.map((item) => (
                      <div key={item.fileId || item.id} className="px-5 py-3 hover:bg-background transition-colors">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-text-primary truncate">{item.filename}</div>
                            <div className="text-xs text-text-muted mt-0.5 truncate">{item.class || 'Unclassified'} | {item.date || '--'}</div>
                          </div>
                          <StatusBadge status={item.status || 'Pending Review'} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recent Sales */}
              <div className="bg-white rounded-lg shadow-card">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
                  <h3 className="text-base font-semibold text-text-primary">Recent Sales</h3>
                  <button 
                    onClick={() => setActivePage('sales')}
                    className="text-sm text-primary hover:text-primary-light font-medium flex items-center gap-1"
                  >
                    See All <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="divide-y divide-border-light">
                  {recentSales.length === 0 ? (
                    <div className="px-5 py-4 text-sm text-text-muted">No sales files yet.</div>
                  ) : (
                    recentSales.map((item) => (
                      <div key={item.fileId || item.id} className="px-5 py-3 hover:bg-background transition-colors">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-text-primary truncate">{item.filename}</div>
                            <div className="text-xs text-text-muted mt-0.5 truncate">{item.class || 'Unclassified'} | {item.date || '--'}</div>
                          </div>
                          <StatusBadge status={item.status || 'Pending Review'} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recent Bank Statements */}
              <div className="bg-white rounded-lg shadow-card">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
                  <h3 className="text-base font-semibold text-text-primary">Recent Bank Statements</h3>
                  <button 
                    onClick={() => setActivePage('bank-statements')}
                    className="text-sm text-primary hover:text-primary-light font-medium flex items-center gap-1"
                  >
                    See All <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="divide-y divide-border-light">
                  {recentBankStatements.length === 0 ? (
                    <div className="px-5 py-4 text-sm text-text-muted">No bank statement files yet.</div>
                  ) : (
                    recentBankStatements.map((item) => (
                      <div key={item.fileId || item.id} className="px-5 py-3 hover:bg-background transition-colors">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-text-primary truncate">{item.filename}</div>
                            <div className="text-xs text-text-muted mt-0.5 truncate">{item.class || 'Unclassified'} | {item.date || '--'}</div>
                          </div>
                          <StatusBadge status={item.status || 'Pending Review'} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {isLoading && showSlowNetworkOverlay && (
          <div className="absolute inset-0 z-20 rounded-lg bg-white/65 backdrop-blur-[1px] flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-xl border border-border-light bg-white/90 shadow-card px-4 py-5 text-center">
              <DotLottiePreloader size={170} className="w-full justify-center" />
              <p className="mt-2 text-xs text-text-secondary">Network is taking longer than expected...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Expenses Page
function ExpensesPage({ onAddDocument, records, setRecords }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [viewingFile, setViewingFile] = useState(null)
  const [resubmitModal, setResubmitModal] = useState(null)
  const [expandedFolders, setExpandedFolders] = useState({})

  // Separate folders and regular files
  const folders = records.filter(item => item.isFolder)
  const regularFiles = records.filter(item => !item.isFolder)

  const filteredFolders = folders.filter(folder => {
    const matchesSearch = folder.folderName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        folder.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        folder.user?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        folder.class?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = !filterStatus || folder.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const filteredFiles = regularFiles.filter(file => {
    const matchesSearch = file.filename?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        file.fileId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        file.user?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = !filterStatus || file.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }))
  }

  const handleResubmit = (record) => {
    setResubmitModal(record)
  }

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Approved': return 'bg-success-bg text-success'
      case 'Pending Review':
        return 'bg-warning-bg text-warning'
      case 'Rejected': return 'bg-error-bg text-error'
      case 'Info Requested': return 'bg-info-bg text-primary'
      case 'Needs Clarification': return 'bg-info-bg text-primary'
      default: return 'bg-border text-text-secondary'
    }
  }

  const handleDelete = (id) => {
    if (!confirm('Are you sure you want to delete this file?')) return
    setRecords((prev) => removeFileFromRecords(prev, { id }))
  }

  const handleDeleteFolder = (folderId) => {
    if (!confirm('Are you sure you want to delete this folder and all its files?')) return
    setRecords((prev) => removeFileFromRecords(prev, { id: folderId }))
  }

  const handleDeleteFolderFile = (folderId, fileId, askConfirm = true) => {
    if (askConfirm && !confirm('Are you sure you want to delete this file from the folder?')) return
    setRecords((prev) => removeFileFromRecords(prev, { folderId, fileId }))
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Expenses</h1>
        <button onClick={() => onAddDocument('expenses')} className="flex items-center justify-center gap-2 h-10 px-5 w-full sm:w-auto sm:shrink-0 whitespace-nowrap bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors">
          <Plus className="w-4 h-4" />
          Add Document
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-card p-4 mb-6">
        <div className="flex flex-wrap items-stretch sm:items-center gap-4">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full h-9 pl-10 pr-4 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 w-full sm:w-auto px-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary">
            <option value="">All Status</option>
            <option value="Approved">Approved</option>
            <option value="Pending Review">Pending Review</option>
            <option value="Rejected">Rejected</option>
            <option value="Info Requested">Info Requested</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F9FAFB]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide w-16">SN</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Folder / File</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Class</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Uploaded By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Date & Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Folders */}
              {filteredFolders.length > 0 ? (
                filteredFolders.map((folder, index) => (
                  <>
                    <tr key={folder.id} className="border-b border-border-light hover:bg-[#F9FAFB] transition-colors">
                      <td className="px-4 py-3.5 text-sm">{index + 1}</td>
                      <td className="px-4 py-3.5">
                        <button 
                          onClick={() => toggleFolder(folder.id)} 
                          className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-light"
                        >
                          {expandedFolders[folder.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <Folder className="w-4 h-4 text-primary" />
                          {folder.folderName}
                          <span className="text-xs text-text-muted ml-1">({folder.files?.length || 0} files)</span>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-medium">{folder.id}</td>
                      <td className="px-4 py-3.5 text-sm">{folder.class || '-'}</td>
                      <td className="px-4 py-3.5 text-sm">{folder.user}</td>
                      <td className="px-4 py-3.5 text-sm">{folder.date}</td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={folder.status} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleFolder(folder.id)} className="w-8 h-8 border border-border rounded flex items-center justify-center text-text-secondary hover:border-primary hover:text-primary" title={expandedFolders[folder.id] ? 'Collapse' : 'Expand'}>
                            {expandedFolders[folder.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handleDeleteFolder(folder.id)} className="w-8 h-8 border border-border rounded flex items-center justify-center text-text-secondary hover:border-error hover:text-error" title="Delete">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedFolders[folder.id] && folder.files?.map((file) => (
                      <tr key={`${folder.id}-${file.fileId}`} className="border-b border-border-light bg-gray-50">
                        <td className="px-4 py-2 text-sm text-text-muted"></td>
                        <td className="px-4 py-2 pl-8 text-sm">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-text-muted" />
                            {file.filename}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-text-muted">{file.fileId}</td>
                        <td className="px-4 py-2 text-sm text-text-muted">{file.class || folder.class || '-'}</td>
                        <td className="px-4 py-2 text-sm text-text-muted">{file.user || folder.user}</td>
                        <td className="px-4 py-2 text-sm text-text-muted">{file.date || folder.date}</td>
                        <td className="px-4 py-2">
                          <StatusBadge status={file.status || folder.status} />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setViewingFile({ ...file, folderId: folder.id, folderName: folder.folderName, class: file.class || folder.class || '' })} className="w-8 h-8 border border-border rounded flex items-center justify-center text-text-secondary hover:border-primary hover:text-primary" title="View"><Eye className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteFolderFile(folder.id, file.fileId)} className="w-8 h-8 border border-border rounded flex items-center justify-center text-text-secondary hover:border-error hover:text-error" title="Delete"><X className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </>
                ))
              ) : null}
              
              {/* Regular files (not in folders) */}
              {filteredFiles.length > 0 ? (
                filteredFiles.map((row, index) => (
                  <tr key={row.id} className="border-b border-border-light hover:bg-[#F9FAFB] transition-colors">
                    <td className="px-4 py-3.5 text-sm">{filteredFolders.length + index + 1}</td>
                    <td onClick={() => setViewingFile(row)} className="px-4 py-3.5 text-sm cursor-pointer">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-text-muted" />
                        {row.filename}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm font-medium">{row.fileId}</td>
                    <td className="px-4 py-3.5 text-sm">{row.expenseClass || '-'}</td>
                    <td className="px-4 py-3.5 text-sm">{row.user}</td>
                    <td className="px-4 py-3.5 text-sm">{row.date}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setViewingFile(row)} className="w-8 h-8 border border-border rounded flex items-center justify-center text-text-secondary hover:border-primary hover:text-primary" title="View"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(row.id)} className="w-8 h-8 border border-border rounded flex items-center justify-center text-text-secondary hover:border-error hover:text-error" title="Delete"><X className="w-4 h-4" /></button>
                        {row.status === 'Rejected' && (
                          <button onClick={() => setResubmitModal(row)} className="h-8 px-3 rounded-md bg-primary-tint text-primary text-xs font-medium hover:bg-primary-light">Resubmit</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : null}

              {filteredFolders.length === 0 && filteredFiles.length === 0 && (
                <tr><td colSpan={8}><EmptyState title="No records found" description="Try uploading your first expense or check filters." cta={<button onClick={() => onAddDocument('expenses')} className="h-10 px-5 bg-primary text-white rounded-md text-sm font-medium">Upload Expense</button>} /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewingFile && (
        <FileViewerModal
          file={viewingFile}
          onClose={() => setViewingFile(null)}
          onSave={(updated) => {
            setRecords((prev) => updateRecordsForFile(prev, updated))
            setViewingFile(null)
          }}
          onDelete={(target) => {
            if (confirm('Are you sure you want to delete this file?')) {
              if (viewingFile?.folderId && viewingFile?.fileId) {
                setRecords((prev) => removeFileFromRecords(prev, { folderId: viewingFile.folderId, fileId: viewingFile.fileId }))
              } else {
                const targetId = typeof target === 'object' ? target?.id : target
                setRecords((prev) => removeFileFromRecords(prev, { id: targetId }))
              }
              setViewingFile(null)
            }
          }}
        />
      )}

      {resubmitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setResubmitModal(null)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Resubmit Document</h3>
              <button onClick={() => setResubmitModal(null)}><X className="w-5 h-5" /></button>
            </div>

            <p className="text-sm text-text-muted mb-3">This will keep the existing metadata but allow uploading a new file version. Previous versions are preserved for audit.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-muted">File</label>
                <input type="file" className="w-full" id="resubmit-file-input" />
              </div>

              <div className="pt-4 flex items-center gap-2 justify-end">
                <button onClick={() => setResubmitModal(null)} className="h-9 px-4 border border-border rounded-md text-sm">Cancel</button>
                <button onClick={() => {
                  const input = document.getElementById('resubmit-file-input')
                  if (!input || !input.files || input.files.length === 0) { alert('Please choose a file to resubmit'); return }
                  const newFile = input.files[0]
                  const newPreview = URL.createObjectURL(newFile)
                  setRecords(prev => prev.map(r => {
                    if (r.id !== resubmitModal.id) return r
                    const versions = r.versions ? [...r.versions] : []
                    // Push current as previous version
                    versions.push({ version: versions.length + 1, filename: r.filename, previewUrl: r.previewUrl, date: r.date })
                    return {
                      ...r,
                      filename: newFile.name,
                      rawFile: newFile,
                      previewUrl: newPreview,
                      date: new Date().toLocaleString(),
                      status: 'Pending Review',
                      adminComment: null,
                      requiredAction: null,
                      versions,
                    }
                  }))
                  setResubmitModal(null)
                }} className="h-9 px-4 bg-primary text-white rounded-md text-sm">Resubmit</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )

}

// Home / Landing Page for unauthenticated users
function HomePage({ onGetStarted, onLogin }) {
  const [newsletterName, setNewsletterName] = useState('')
  const [newsletterEmail, setNewsletterEmail] = useState('')
  const [newsletterStatus, setNewsletterStatus] = useState({ type: '', message: '' })

  const handleSubscribeNewsletter = async () => {
    const normalizedEmail = String(newsletterEmail || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setNewsletterStatus({
        type: 'error',
        message: 'Please enter a valid email address.',
      })
      return
    }

    const result = await registerNewsletterSubscriberLead({
      contactEmail: normalizedEmail,
      fullName: String(newsletterName || '').trim(),
      capturePage: 'dashboard',
      capturePath: '/dashboard',
    })
    if (!result.ok) {
      setNewsletterStatus({
        type: 'error',
        message: result.message || 'Unable to subscribe right now.',
      })
      return
    }

    setNewsletterStatus({
      type: 'success',
      message: 'You are subscribed. We will share useful accounting updates.',
    })
    setNewsletterName('')
    setNewsletterEmail('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-4xl w-full bg-white rounded-lg shadow-card p-10 text-center">
        <div className="mb-6">
          <div className="w-14 h-14 bg-primary rounded-md flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-semibold text-text-primary">Kiamina Accounting Services</h1>
          <p className="text-text-muted mt-2">A simple dashboard to upload and manage financial documents.</p>
        </div>

        <div className="flex items-center justify-center gap-4 mt-6">
          <button onClick={onGetStarted} className="h-12 px-6 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light">Get Started</button>
          <button onClick={onLogin} className="h-12 px-6 border border-border rounded-md text-sm font-medium hover:bg-background">Sign In</button>
        </div>

        <div className="mt-8 text-sm text-text-muted">
          <div className="max-w-xl mx-auto rounded-lg border border-border-light bg-background/40 p-4 mb-6 text-left">
            <p className="text-sm font-semibold text-text-primary">Subscribe to Newsletter</p>
            <p className="text-xs text-text-muted mt-1">Get updates and tips from Kiamina Accounting Services.</p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
              <input
                type="text"
                value={newsletterName}
                onChange={(event) => setNewsletterName(event.target.value)}
                placeholder="Full name (optional)"
                className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary bg-white"
              />
              <input
                type="email"
                value={newsletterEmail}
                onChange={(event) => setNewsletterEmail(event.target.value)}
                placeholder="you@company.com"
                className="h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary bg-white"
              />
              <button
                type="button"
                onClick={handleSubscribeNewsletter}
                className="h-10 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light"
              >
                Subscribe
              </button>
            </div>
            {newsletterStatus.message && (
              <p className={`mt-2 text-xs ${newsletterStatus.type === 'error' ? 'text-error' : 'text-success'}`}>
                {newsletterStatus.message}
              </p>
            )}
          </div>
          <nav className="flex items-center gap-4 justify-center">
            <a className="hover:underline">Features</a>
            <a className="hover:underline">Pricing</a>
            <a className="hover:underline">Docs</a>
            <a className="hover:underline">Contact</a>
          </nav>
        </div>
      </div>
    </div>
  )
}

// Sales Page
function SalesPage({ onAddDocument, records, setRecords }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [viewingFile, setViewingFile] = useState(null)
  const [resubmitModal, setResubmitModal] = useState(null)
  const [expandedFolders, setExpandedFolders] = useState({})

  // Separate folders and regular files
  const folders = records.filter(item => item.isFolder)
  const regularFiles = records.filter(item => !item.isFolder)

  const filteredFolders = folders.filter(folder => {
    const matchesSearch = folder.folderName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        folder.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        folder.user?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        folder.class?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = !filterStatus || folder.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const filteredFiles = regularFiles.filter(file => {
    const matchesSearch = file.filename?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        file.fileId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        file.user?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = !filterStatus || file.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }))
  }

  const handleDelete = (id) => {
    if (!confirm('Are you sure you want to delete this file?')) return
    setRecords((prev) => removeFileFromRecords(prev, { id }))
  }

  const handleDeleteFolder = (folderId) => {
    if (!confirm('Are you sure you want to delete this folder and all its files?')) return
    setRecords((prev) => removeFileFromRecords(prev, { id: folderId }))
  }

  const handleDeleteFolderFile = (folderId, fileId, askConfirm = true) => {
    if (askConfirm && !confirm('Are you sure you want to delete this file from the folder?')) return
    setRecords((prev) => removeFileFromRecords(prev, { folderId, fileId }))
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Sales</h1>
        <button onClick={() => onAddDocument('sales')} className="flex items-center justify-center gap-2 h-10 px-5 w-full sm:w-auto sm:shrink-0 whitespace-nowrap bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors">
          <Plus className="w-4 h-4" />Add Document
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-card p-4 mb-6">
        <div className="flex flex-wrap items-stretch sm:items-center gap-4">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full h-9 pl-10 pr-4 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 w-full sm:w-auto px-3 bg-background border border-border rounded-md text-sm">
            <option value="">All Status</option>
            <option value="Approved">Approved</option>
            <option value="Pending Review">Pending Review</option>
            <option value="Rejected">Rejected</option>
            <option value="Info Requested">Info Requested</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F9FAFB]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide w-16">SN</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Folder / File</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Class</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Uploaded By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Date & Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Folders */}
              {filteredFolders.length > 0 ? (
                filteredFolders.map((folder, index) => (
                  <>
                    <tr key={folder.id} className="border-b border-border-light hover:bg-[#F9FAFB]">
                      <td className="px-4 py-3.5 text-sm">{index + 1}</td>
                      <td className="px-4 py-3.5">
                        <button 
                          onClick={() => toggleFolder(folder.id)} 
                          className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-light"
                        >
                          {expandedFolders[folder.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <Folder className="w-4 h-4 text-primary" />
                          {folder.folderName}
                          <span className="text-xs text-text-muted ml-1">({folder.files?.length || 0} files)</span>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-medium">{folder.id}</td>
                      <td className="px-4 py-3.5 text-sm">{folder.class || '-'}</td>
                      <td className="px-4 py-3.5 text-sm">{folder.user}</td>
                      <td className="px-4 py-3.5 text-sm">{folder.date}</td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={folder.status} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleFolder(folder.id)} className="w-8 h-8 border rounded flex items-center justify-center text-text-secondary hover:border-primary" title={expandedFolders[folder.id] ? 'Collapse' : 'Expand'}>
                            {expandedFolders[folder.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handleDeleteFolder(folder.id)} className="w-8 h-8 border rounded flex items-center justify-center text-text-secondary hover:border-error" title="Delete"><X className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                    {expandedFolders[folder.id] && folder.files?.map((file) => (
                      <tr key={`${folder.id}-${file.fileId}`} className="border-b border-border-light bg-gray-50">
                        <td className="px-4 py-2 text-sm text-text-muted"></td>
                        <td className="px-4 py-2 pl-8 text-sm">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-text-muted" />
                            {file.filename}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-text-muted">{file.fileId}</td>
                        <td className="px-4 py-2 text-sm text-text-muted">{file.class || folder.class || '-'}</td>
                        <td className="px-4 py-2 text-sm text-text-muted">{file.user || folder.user}</td>
                        <td className="px-4 py-2 text-sm text-text-muted">{file.date || folder.date}</td>
                        <td className="px-4 py-2">
                          <StatusBadge status={file.status || folder.status} />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setViewingFile({ ...file, folderId: folder.id, folderName: folder.folderName, class: file.class || folder.class || '' })} className="w-8 h-8 border rounded flex items-center justify-center text-text-secondary hover:border-primary" title="View"><Eye className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteFolderFile(folder.id, file.fileId)} className="w-8 h-8 border rounded flex items-center justify-center text-text-secondary hover:border-error" title="Delete"><X className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </>
                ))
              ) : null}
              
              {/* Regular files */}
              {filteredFiles.length > 0 ? (
                filteredFiles.map((row, index) => (
                  <tr key={row.id} className="border-b border-border-light hover:bg-[#F9FAFB]">
                    <td className="px-4 py-3.5 text-sm">{filteredFolders.length + index + 1}</td>
                    <td onClick={() => setViewingFile(row)} className="px-4 py-3.5 text-sm cursor-pointer">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-text-muted" />
                        {row.filename}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm font-medium">{row.fileId}</td>
                    <td className="px-4 py-3.5 text-sm">{row.salesClass || '-'}</td>
                    <td className="px-4 py-3.5 text-sm">{row.user}</td>
                    <td className="px-4 py-3.5 text-sm">{row.date}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setViewingFile(row)} className="w-8 h-8 border rounded flex items-center justify-center text-text-secondary hover:border-primary" title="View"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(row.id)} className="w-8 h-8 border rounded flex items-center justify-center text-text-secondary hover:border-error" title="Delete"><X className="w-4 h-4" /></button>
                        {row.status === 'Rejected' && (
                          <button onClick={() => setResubmitModal(row)} className="h-8 px-3 rounded-md bg-primary-tint text-primary text-xs font-medium hover:bg-primary-light">Resubmit</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : null}

              {filteredFolders.length === 0 && filteredFiles.length === 0 && (
                <tr><td colSpan={8}><EmptyState title="No records found" description="No sales documents yet." cta={<button onClick={() => onAddDocument('sales')} className="h-10 px-5 bg-primary text-white rounded-md text-sm font-medium">Upload Sales</button>} /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewingFile && (
        <FileViewerModal
          file={viewingFile}
          onClose={() => setViewingFile(null)}
          onSave={(updated) => {
            setRecords((prev) => updateRecordsForFile(prev, updated))
            setViewingFile(null)
          }}
          onDelete={(target) => {
            if (confirm('Are you sure you want to delete this file?')) {
              if (viewingFile?.folderId && viewingFile?.fileId) {
                setRecords((prev) => removeFileFromRecords(prev, { folderId: viewingFile.folderId, fileId: viewingFile.fileId }))
              } else {
                const targetId = typeof target === 'object' ? target?.id : target
                setRecords((prev) => removeFileFromRecords(prev, { id: targetId }))
              }
              setViewingFile(null)
            }
          }}
        />
      )}

      {resubmitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setResubmitModal(null)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Resubmit Document</h3>
              <button onClick={() => setResubmitModal(null)}><X className="w-5 h-5" /></button>
            </div>

            <p className="text-sm text-text-muted mb-3">This will keep the existing metadata but allow uploading a new file version. Previous versions are preserved for audit.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-muted">File</label>
                <input type="file" className="w-full" id="resubmit-file-input-sales" />
              </div>

              <div className="pt-4 flex items-center gap-2 justify-end">
                <button onClick={() => setResubmitModal(null)} className="h-9 px-4 border border-border rounded-md text-sm">Cancel</button>
                <button onClick={() => {
                  const input = document.getElementById('resubmit-file-input-sales')
                  if (!input || !input.files || input.files.length === 0) { alert('Please choose a file to resubmit'); return }
                  const newFile = input.files[0]
                  const newPreview = URL.createObjectURL(newFile)
                  setRecords(prev => prev.map(r => {
                    if (r.id !== resubmitModal.id) return r
                    const versions = r.versions ? [...r.versions] : []
                    versions.push({ version: versions.length + 1, filename: r.filename, previewUrl: r.previewUrl, date: r.date })
                    return {
                      ...r,
                      filename: newFile.name,
                      rawFile: newFile,
                      previewUrl: newPreview,
                      date: new Date().toLocaleString(),
                      status: 'Pending Review',
                      adminComment: null,
                      requiredAction: null,
                      versions,
                    }
                  }))
                  setResubmitModal(null)
                }} className="h-9 px-4 bg-primary text-white rounded-md text-sm">Resubmit</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Bank Statements Page
function BankStatementsPage({ onAddDocument, records, setRecords }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [viewingFile, setViewingFile] = useState(null)
  const [resubmitModal, setResubmitModal] = useState(null)
  const [expandedFolders, setExpandedFolders] = useState({})

  // Separate folders and regular files
  const folders = records.filter(item => item.isFolder)
  const regularFiles = records.filter(item => !item.isFolder)

  const filteredFolders = folders.filter(folder => {
    const matchesSearch = folder.folderName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        folder.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        folder.user?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        folder.class?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = !filterStatus || folder.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const filteredFiles = regularFiles.filter(file => {
    const matchesSearch = file.filename?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        file.fileId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        file.user?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = !filterStatus || file.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }))
  }

  const handleDelete = (id) => {
    if (!confirm('Are you sure you want to delete this file?')) return
    setRecords((prev) => removeFileFromRecords(prev, { id }))
  }

  const handleDeleteFolder = (folderId) => {
    if (!confirm('Are you sure you want to delete this folder and all its files?')) return
    setRecords((prev) => removeFileFromRecords(prev, { id: folderId }))
  }

  const handleDeleteFolderFile = (folderId, fileId, askConfirm = true) => {
    if (askConfirm && !confirm('Are you sure you want to delete this file from the folder?')) return
    setRecords((prev) => removeFileFromRecords(prev, { folderId, fileId }))
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Bank Statements</h1>
        <button
          onClick={() => onAddDocument('bank-statements')}
          className="flex items-center justify-center gap-2 h-10 px-5 w-full sm:w-auto sm:shrink-0 whitespace-nowrap bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Document
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-card p-4 mb-6">
        <div className="flex flex-wrap items-stretch sm:items-center gap-4">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full h-9 pl-10 pr-4 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 w-full sm:w-auto px-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary">
            <option value="">All Status</option>
            <option value="Approved">Approved</option>
            <option value="Pending Review">Pending Review</option>
            <option value="Rejected">Rejected</option>
            <option value="Info Requested">Info Requested</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F9FAFB]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide w-16">SN</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Folder / File</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Class</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Uploaded By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Date & Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Folders */}
              {filteredFolders.length > 0 ? (
                filteredFolders.map((folder, index) => (
                  <>
                    <tr key={folder.id} className="border-b border-border-light hover:bg-[#F9FAFB]">
                      <td className="px-4 py-3.5 text-sm">{index + 1}</td>
                      <td className="px-4 py-3.5">
                        <button 
                          onClick={() => toggleFolder(folder.id)} 
                          className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-light"
                        >
                          {expandedFolders[folder.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <Folder className="w-4 h-4 text-primary" />
                          {folder.folderName}
                          <span className="text-xs text-text-muted ml-1">({folder.files?.length || 0} files)</span>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-medium">{folder.id}</td>
                      <td className="px-4 py-3.5 text-sm">{folder.class || '-'}</td>
                      <td className="px-4 py-3.5 text-sm">{folder.user}</td>
                      <td className="px-4 py-3.5 text-sm">{folder.date}</td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={folder.status} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleFolder(folder.id)} className="w-8 h-8 border rounded flex items-center justify-center text-text-secondary hover:border-primary" title={expandedFolders[folder.id] ? 'Collapse' : 'Expand'}>
                            {expandedFolders[folder.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handleDeleteFolder(folder.id)} className="w-8 h-8 border rounded flex items-center justify-center text-text-secondary hover:border-error" title="Delete"><X className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                    {expandedFolders[folder.id] && folder.files?.map((file) => (
                      <tr key={`${folder.id}-${file.fileId}`} className="border-b border-border-light bg-gray-50">
                        <td className="px-4 py-2 text-sm text-text-muted"></td>
                        <td className="px-4 py-2 pl-8 text-sm">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-text-muted" />
                            {file.filename}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-text-muted">{file.fileId}</td>
                        <td className="px-4 py-2 text-sm text-text-muted">{file.class || folder.class || '-'}</td>
                        <td className="px-4 py-2 text-sm text-text-muted">{file.user || folder.user}</td>
                        <td className="px-4 py-2 text-sm text-text-muted">{file.date || folder.date}</td>
                        <td className="px-4 py-2">
                          <StatusBadge status={file.status || folder.status} />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setViewingFile({ ...file, folderId: folder.id, folderName: folder.folderName, class: file.class || folder.class || '' })} className="w-8 h-8 border rounded flex items-center justify-center text-text-secondary hover:border-primary" title="View"><Eye className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteFolderFile(folder.id, file.fileId)} className="w-8 h-8 border rounded flex items-center justify-center text-text-secondary hover:border-error" title="Delete"><X className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </>
                ))
              ) : null}
              
              {/* Regular files */}
              {filteredFiles.length > 0 ? (
                filteredFiles.map((row, index) => (
                  <tr key={row.id} className="border-b border-border-light hover:bg-[#F9FAFB]">
                    <td className="px-4 py-3.5 text-sm">{filteredFolders.length + index + 1}</td>
                    <td onClick={() => setViewingFile(row)} className="px-4 py-3.5 text-sm cursor-pointer">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-text-muted" />
                        {row.filename}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm font-medium">{row.fileId}</td>
                    <td className="px-4 py-3.5 text-sm">-</td>
                    <td className="px-4 py-3.5 text-sm">{row.user}</td>
                    <td className="px-4 py-3.5 text-sm">{row.date}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setViewingFile(row)} className="w-8 h-8 border rounded flex items-center justify-center text-text-secondary hover:border-primary" title="View"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(row.id)} className="w-8 h-8 border rounded flex items-center justify-center text-text-secondary hover:border-error" title="Delete"><X className="w-4 h-4" /></button>
                        {row.status === 'Rejected' && (
                          <button onClick={() => setResubmitModal(row)} className="h-8 px-3 rounded-md bg-primary-tint text-primary text-xs font-medium hover:bg-primary-light">Resubmit</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : null}

              {filteredFolders.length === 0 && filteredFiles.length === 0 && (
                <tr><td colSpan={8}><EmptyState title="No records found" description="No bank statements uploaded." cta={<button onClick={() => onAddDocument('bank-statements')} className="h-10 px-5 bg-primary text-white rounded-md text-sm font-medium">Upload Statement</button>} /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewingFile && (
        <FileViewerModal
          file={viewingFile}
          onClose={() => setViewingFile(null)}
          onSave={(updated) => {
            setRecords((prev) => updateRecordsForFile(prev, updated))
            setViewingFile(null)
          }}
          onDelete={(target) => {
            if (confirm('Are you sure you want to delete this file?')) {
              if (viewingFile?.folderId && viewingFile?.fileId) {
                setRecords((prev) => removeFileFromRecords(prev, { folderId: viewingFile.folderId, fileId: viewingFile.fileId }))
              } else {
                const targetId = typeof target === 'object' ? target?.id : target
                setRecords((prev) => removeFileFromRecords(prev, { id: targetId }))
              }
              setViewingFile(null)
            }
          }}
        />
      )}
      {resubmitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setResubmitModal(null)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Resubmit Document</h3>
              <button onClick={() => setResubmitModal(null)}><X className="w-5 h-5" /></button>
            </div>

            <p className="text-sm text-text-muted mb-3">This will keep the existing metadata but allow uploading a new file version. Previous versions are preserved for audit.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-muted">File</label>
                <input type="file" className="w-full" id="resubmit-file-input-bank" />
              </div>

              <div className="pt-4 flex items-center gap-2 justify-end">
                <button onClick={() => setResubmitModal(null)} className="h-9 px-4 border border-border rounded-md text-sm">Cancel</button>
                <button onClick={() => {
                  const input = document.getElementById('resubmit-file-input-bank')
                  if (!input || !input.files || input.files.length === 0) { alert('Please choose a file to resubmit'); return }
                  const newFile = input.files[0]
                  const newPreview = URL.createObjectURL(newFile)
                  setRecords(prev => prev.map(r => {
                    if (r.id !== resubmitModal.id) return r
                    const versions = r.versions ? [...r.versions] : []
                    versions.push({ version: versions.length + 1, filename: r.filename, previewUrl: r.previewUrl, date: r.date })
                    return {
                      ...r,
                      filename: newFile.name,
                      rawFile: newFile,
                      previewUrl: newPreview,
                      date: new Date().toLocaleString(),
                      status: 'Pending Review',
                      adminComment: null,
                      requiredAction: null,
                      versions,
                    }
                  }))
                  setResubmitModal(null)
                }} className="h-9 px-4 bg-primary text-white rounded-md text-sm">Resubmit</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Upload History Page
function UploadHistoryPage({
  records = [],
  expenseRecords = [],
  salesRecords = [],
  bankStatementRecords = [],
  ownerEmail = '',
  downloadBusinessName = '',
  onOpenFileLocation,
  showToast,
  onEnsureFileAvailable,
  globalSearchTerm = '',
  onGlobalSearchTermChange,
}) {
  const [localSearchTerm, setLocalSearchTerm] = useState('')
  const searchTerm = typeof onGlobalSearchTermChange === 'function'
    ? String(globalSearchTerm || '')
    : localSearchTerm
  const setSearchTerm = (value) => {
    if (typeof onGlobalSearchTermChange === 'function') {
      onGlobalSearchTermChange(value)
      return
    }
    setLocalSearchTerm(value)
  }
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const maxFilterDate = toIsoDate(new Date())
  const [filterType, setFilterType] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAvailability, setFilterAvailability] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')
  const [contextMenu, setContextMenu] = useState(null)
  const [viewingFile, setViewingFile] = useState(null)
  const normalizedOwnerEmail = String(ownerEmail || '').trim().toLowerCase()

  const toDateMs = (value = '') => {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : NaN
  }
  const getEndOfDayMs = (value = '') => {
    if (!value) return NaN
    const parsed = Date.parse(`${value}T23:59:59.999`)
    return Number.isFinite(parsed) ? parsed : NaN
  }
  const resolveCategoryId = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized.includes('sales')) return 'sales'
    if (normalized.includes('bank')) return 'bank-statements'
    return 'expenses'
  }
  const resolveCategoryLabel = (categoryId = '') => {
    if (categoryId === 'sales') return 'Sales'
    if (categoryId === 'bank-statements') return 'Bank Statement'
    return 'Expense'
  }
  const flattenCategoryFiles = (sourceRecords = [], categoryId = 'expenses') => (
    (Array.isArray(sourceRecords) ? sourceRecords : []).flatMap((row) => {
      if (row?.isFolder) {
        const folderId = row.id || ''
        const folderName = row.folderName || ''
        return (Array.isArray(row.files) ? row.files : []).map((file) => ({
          ...file,
          categoryId,
          folderId: file?.folderId || folderId,
          folderName: file?.folderName || folderName,
        }))
      }
      return [{
        ...row,
        categoryId,
      }]
    })
  )
  const getAvailabilityMeta = (availability = 'unavailable') => {
    if (availability === 'available') {
      return {
        label: 'Available',
        className: 'bg-success-bg text-success',
        note: '',
      }
    }
    if (availability === 'moved') {
      return {
        label: 'Moved',
        className: 'bg-warning-bg text-warning',
        note: 'This file has been moved to another location.',
      }
    }
    if (availability === 'deleted') {
      return {
        label: 'Deleted',
        className: 'bg-error-bg text-error',
        note: 'This file has been deleted.',
      }
    }
    return {
      label: 'Unavailable',
      className: 'bg-background text-text-secondary',
      note: 'This file has been deleted or moved to another location.',
    }
  }

  const liveFiles = [
    ...flattenCategoryFiles(expenseRecords, 'expenses'),
    ...flattenCategoryFiles(salesRecords, 'sales'),
    ...flattenCategoryFiles(bankStatementRecords, 'bank-statements'),
  ]
  const liveFileMap = new Map()
  liveFiles.forEach((file) => {
    const fileId = String(file?.fileId || '').trim()
    if (!fileId) return
    const categoryId = file?.categoryId || 'expenses'
    const key = `${categoryId}:${fileId}`
    if (!liveFileMap.has(key)) {
      liveFileMap.set(key, file)
    }
  })

  const scopedRows = normalizedOwnerEmail
    ? (Array.isArray(records) ? records : []).filter((item) => (
      String(item?.ownerEmail || '').trim().toLowerCase() === normalizedOwnerEmail
    ))
    : (Array.isArray(records) ? records : [])
  const enrichedRows = scopedRows
    .filter((item) => item && typeof item === 'object' && !item.isFolder)
    .map((item, index) => {
      const categoryId = item.categoryId || resolveCategoryId(item.category || '')
      const category = item.category || resolveCategoryLabel(categoryId)
      const fileId = String(item.fileId || '').trim()
      const liveFile = fileId ? (liveFileMap.get(`${categoryId}:${fileId}`) || null) : null
      const isLiveDeleted = Boolean(
        liveFile
        && (liveFile.isDeleted || String(liveFile.status || '').trim().toLowerCase() === 'deleted')
      )
      const isMoved = Boolean(
        liveFile
        && !isLiveDeleted
        && String(item.folderId || '').trim()
        && String(liveFile.folderId || '').trim()
        && String(item.folderId || '').trim() !== String(liveFile.folderId || '').trim()
      )
      let availability = 'unavailable'
      if (liveFile && isLiveDeleted) availability = 'deleted'
      else if (liveFile && isMoved) availability = 'moved'
      else if (liveFile) availability = 'available'

      return {
        ...item,
        id: item.id || `UP-${index}-${fileId || item.filename || 'file'}`,
        fileId,
        categoryId,
        category,
        type: String(item.type || '').trim().toUpperCase() || 'FILE',
        availability,
        liveFile,
        canPreview: Boolean(liveFile && !isLiveDeleted),
        canOpenLocation: Boolean(liveFile?.folderId),
      }
    })

  const typeSortPriority = ['PDF', 'DOCX', 'DOC', 'XLSX', 'XLSM', 'XLSB', 'XLS', 'CSV', 'TXT', 'PPTX', 'PPT', 'PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'BMP', 'ZIP', 'RAR', '7Z']
  const getTypeRank = (value = '') => {
    const normalized = String(value || '').trim().toUpperCase()
    const index = typeSortPriority.indexOf(normalized)
    return index === -1 ? 999 : index
  }
  const typeOptions = Array.from(new Set(enrichedRows.map((item) => item.type).filter(Boolean)))
    .sort((left, right) => {
      const leftRank = getTypeRank(left)
      const rightRank = getTypeRank(right)
      if (leftRank !== rightRank) return leftRank - rightRank
      return String(left || '').localeCompare(String(right || ''))
    })
  const uploadSearchSuggestions = buildSearchSuggestions(
    enrichedRows.flatMap((item) => [
      item.filename,
      item.fileId,
      item.type,
      item.category,
      item.user,
      item.availability,
    ]),
    16,
  )
  const uploadHistorySearchListId = 'upload-history-search-suggestions'

  const filteredData = enrichedRows
    .filter((item) => {
      const query = searchTerm.trim().toLowerCase()
      const matchesSearch = !query || (
        String(item.filename || '').toLowerCase().includes(query)
        || String(item.user || '').toLowerCase().includes(query)
        || String(item.fileId || '').toLowerCase().includes(query)
        || String(item.category || '').toLowerCase().includes(query)
      )
      const itemDateMs = toDateMs(item.timestampIso || item.date)
      const normalizedFrom = clampFilterDateToToday(dateFrom)
      const normalizedTo = clampFilterDateToToday(dateTo)
      const fromMs = toDateMs(normalizedFrom)
      const toMs = getEndOfDayMs(normalizedTo)
      const matchesDateFrom = !normalizedFrom || (!Number.isNaN(itemDateMs) && itemDateMs >= fromMs)
      const matchesDateTo = !normalizedTo || (!Number.isNaN(itemDateMs) && itemDateMs <= toMs)
      const matchesType = !filterType || item.type === filterType
      const matchesCategory = !filterCategory || item.categoryId === filterCategory
      const matchesAvailability = !filterAvailability || item.availability === filterAvailability
      return (
        matchesSearch
        && matchesDateFrom
        && matchesDateTo
        && matchesType
        && matchesCategory
        && matchesAvailability
      )
    })
    .sort((a, b) => {
      if (sortBy === 'date') {
        const left = toDateMs(a.timestampIso || a.date)
        const right = toDateMs(b.timestampIso || b.date)
        const safeLeft = Number.isNaN(left) ? 0 : left
        const safeRight = Number.isNaN(right) ? 0 : right
        return sortOrder === 'desc' ? safeRight - safeLeft : safeLeft - safeRight
      }
      const read = (value) => String(value || '').trim().toLowerCase()
      if (sortBy === 'type') {
        const leftRank = getTypeRank(a.type)
        const rightRank = getTypeRank(b.type)
        if (leftRank !== rightRank) {
          return sortOrder === 'desc' ? rightRank - leftRank : leftRank - rightRank
        }
        const typeCompared = read(a.type).localeCompare(read(b.type))
        if (typeCompared !== 0) return sortOrder === 'desc' ? typeCompared * -1 : typeCompared
        const nameCompared = read(a.filename).localeCompare(read(b.filename))
        return sortOrder === 'desc' ? nameCompared * -1 : nameCompared
      }
      const left = sortBy === 'name'
        ? read(a.filename)
        : sortBy === 'category'
            ? read(a.category)
            : sortBy === 'availability'
                ? read(a.availability)
                : read(a.filename)
      const right = sortBy === 'name'
        ? read(b.filename)
        : sortBy === 'category'
            ? read(b.category)
            : sortBy === 'availability'
                ? read(b.availability)
                : read(b.filename)
      const compared = left.localeCompare(right)
      return sortOrder === 'desc' ? compared * -1 : compared
    })

  const activeContextRow = contextMenu
    ? filteredData.find((item) => item.id === contextMenu.rowId) || null
    : null

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null)
    window.addEventListener('click', closeContextMenu)
    window.addEventListener('scroll', closeContextMenu)
    return () => {
      window.removeEventListener('click', closeContextMenu)
      window.removeEventListener('scroll', closeContextMenu)
    }
  }, [])

  const withContextRow = (callback) => {
    if (!activeContextRow) return
    callback(activeContextRow)
    setContextMenu(null)
  }
  const openPreview = (item) => {
    if (!item?.canPreview || !item?.liveFile) {
      showToast?.('error', 'This file is no longer available for preview because it was deleted or moved.')
      return
    }
    setViewingFile({
      ...item.liveFile,
      folderId: item.liveFile.folderId || item.folderId || '',
      folderName: item.liveFile.folderName || '',
    })
  }
  const openFileLocation = (item) => {
    const folderId = item?.liveFile?.folderId || ''
    const categoryId = item?.liveFile?.categoryId || item?.categoryId || ''
    if (!folderId || !categoryId) {
      showToast?.('error', 'Folder location is no longer available for this file.')
      return
    }
    onOpenFileLocation?.(categoryId, folderId)
  }
  const downloadFile = async (item) => {
    if (!item?.canPreview || !item?.liveFile) {
      showToast?.('error', 'This file is no longer available for download.')
      return
    }
    const source = item.liveFile
    const directUrl = normalizeRuntimePreviewUrl(
      source.previewUrl || source.url || source.fileUrl || source.documentUrl || '',
      { allowBlob: false },
    )
    if (!(source.rawFile instanceof Blob) && !directUrl && typeof onEnsureFileAvailable === 'function') {
      const ensured = await onEnsureFileAvailable(source)
      if (!(ensured?.ok && ensured.blob instanceof Blob)) {
        showToast?.('error', ensured?.message || 'Download URL is not available for this file.')
        return
      }
      triggerBrowserDownload({
        blob: ensured.blob,
        fileName: buildClientDownloadFilename({
          businessName: downloadBusinessName,
          fileName: source.filename || item.filename || 'document',
        }),
      })
      return
    }

    if (!triggerBrowserDownload({
      blob: source.rawFile instanceof Blob ? source.rawFile : null,
      url: directUrl,
      fileName: buildClientDownloadFilename({
        businessName: downloadBusinessName,
        fileName: source.filename || item.filename || 'document',
      }),
    })) {
      showToast?.('error', 'Download URL is not available for this file.')
      return
    }
  }

  const resolvedViewingFile = viewingFile
    ? {
      ...viewingFile,
      folderId: viewingFile.folderId || '',
      folderName: viewingFile.folderName || '',
    }
    : null

  const clearFilters = () => {
    setSearchTerm('')
    setDateFrom('')
    setDateTo('')
    setFilterType('')
    setFilterCategory('')
    setFilterAvailability('')
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Upload History</h1>
      </div>

      <div className="bg-white rounded-lg shadow-card p-4 mb-6">
        <div className="flex flex-wrap items-stretch sm:items-center gap-3">
          <div className="relative flex-1 min-w-0 sm:min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search by file name, user, ID, or category..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              list={uploadSearchSuggestions.length > 0 ? uploadHistorySearchListId : undefined}
              className="w-full h-9 pl-10 pr-4 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            />
            {uploadSearchSuggestions.length > 0 && (
              <datalist id={uploadHistorySearchListId}>
                {uploadSearchSuggestions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            )}
          </div>
          <input
            type="date"
            value={dateFrom}
            max={maxFilterDate}
            onChange={(event) => setDateFrom(clampFilterDateToToday(event.target.value))}
            className="h-9 w-full sm:w-auto px-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            title="From date"
          />
          <input
            type="date"
            value={dateTo}
            max={maxFilterDate}
            onChange={(event) => setDateTo(clampFilterDateToToday(event.target.value))}
            className="h-9 w-full sm:w-auto px-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            title="To date"
          />
          <select
            value={filterType}
            onChange={(event) => setFilterType(event.target.value)}
            className="h-9 w-full sm:w-auto px-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All Types</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={(event) => setFilterCategory(event.target.value)}
            className="h-9 w-full sm:w-auto px-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All Categories</option>
            <option value="expenses">Expenses</option>
            <option value="sales">Sales</option>
            <option value="bank-statements">Bank Statements</option>
          </select>
          <select
            value={filterAvailability}
            onChange={(event) => setFilterAvailability(event.target.value)}
            className="h-9 w-full sm:w-auto px-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All Availability</option>
            <option value="available">Available</option>
            <option value="moved">Moved</option>
            <option value="deleted">Deleted</option>
            <option value="unavailable">Unavailable</option>
          </select>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="h-9 w-full sm:w-auto px-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
            <option value="type">Sort by Type</option>
            <option value="category">Sort by Category</option>
            <option value="availability">Sort by Availability</option>
          </select>
          <button
            type="button"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="h-9 w-full sm:w-auto px-3 bg-background border border-border rounded-md text-sm hover:bg-gray-50 flex items-center justify-center gap-1"
          >
            {sortOrder === 'desc' ? '\u2193' : '\u2191'}
          </button>
          {(searchTerm || dateFrom || dateTo || filterType || filterCategory || filterAvailability) && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-9 px-3 text-sm text-error hover:bg-error-bg rounded-md"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F9FAFB]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">File Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">File ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">File Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Upload Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Uploaded By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Availability</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length > 0 ? (
                filteredData.map((row) => {
                  const availability = getAvailabilityMeta(row.availability)
                  return (
                    <tr
                      key={row.id}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        const menuWidth = 224
                        const menuHeight = 134
                        const nextX = Math.min(event.clientX, window.innerWidth - menuWidth - 8)
                        const nextY = Math.min(event.clientY, window.innerHeight - menuHeight - 8)
                        setContextMenu({
                          rowId: row.id,
                          x: Math.max(8, nextX),
                          y: Math.max(8, nextY),
                        })
                      }}
                      className="group border-b border-border-light hover:bg-[#F9FAFB] transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-start gap-3">
                          <FileTypeIcon type={row.type} />
                          <div>
                            <span className="text-sm text-text-primary">{row.filename || '--'}</span>
                            {availability.note && (
                              <p className="text-xs text-text-muted mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                {availability.note}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-medium text-text-primary">{row.fileId || '--'}</td>
                      <td className="px-4 py-3.5 text-sm text-text-secondary">{row.type}</td>
                      <td className="px-4 py-3.5"><CategoryTag category={row.category} /></td>
                      <td className="px-4 py-3.5 text-sm text-text-secondary">{row.date || '--'}</td>
                      <td className="px-4 py-3.5 text-sm text-text-secondary">{row.user || '--'}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-medium ${availability.className}`}>
                          {availability.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openPreview(row)}
                            disabled={!row.canPreview}
                            className="h-8 px-2.5 rounded border border-border text-xs text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => openFileLocation(row)}
                            disabled={!row.canOpenLocation}
                            className="h-8 px-2.5 rounded border border-border text-xs text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Open Folder
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8">
                    <EmptyState title="No records" description="No matching records found." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-[240] w-56 bg-white border border-border rounded-md shadow-card py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => withContextRow(openPreview)}
            disabled={!activeContextRow?.canPreview}
            className="w-full h-9 px-3 text-left text-sm text-text-primary hover:bg-background inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Eye className="w-4 h-4 text-text-muted" />
            Preview
          </button>
          <button
            type="button"
            onClick={() => withContextRow(openFileLocation)}
            disabled={!activeContextRow?.canOpenLocation}
            className="w-full h-9 px-3 text-left text-sm text-text-primary hover:bg-background inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FolderOpen className="w-4 h-4 text-text-muted" />
            Open File Location
          </button>
          <button
            type="button"
            onClick={() => withContextRow((row) => void downloadFile(row))}
            disabled={!activeContextRow?.canPreview}
            className="w-full h-9 px-3 text-left text-sm text-text-primary hover:bg-background inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4 text-text-muted" />
            Download
          </button>
        </div>
      )}

      {resolvedViewingFile && (
        <FileViewerModal
          file={resolvedViewingFile}
          downloadNamePrefix={downloadBusinessName}
          readOnly
          onEnsureFileAvailable={onEnsureFileAvailable}
          onClose={() => setViewingFile(null)}
        />
      )}
    </div>
  )
}

function ResolvedDocumentsPage({
  records = [],
  onRecordsChange,
  downloadBusinessName = '',
  showToast,
  globalSearchTerm = '',
  onGlobalSearchTermChange,
}) {
  const [localSearchTerm, setLocalSearchTerm] = useState('')
  const searchTerm = typeof onGlobalSearchTermChange === 'function'
    ? String(globalSearchTerm || '')
    : localSearchTerm
  const setSearchTerm = (value) => {
    if (typeof onGlobalSearchTermChange === 'function') {
      onGlobalSearchTermChange(value)
      return
    }
    setLocalSearchTerm(value)
  }
  const safeRecords = Array.isArray(records) ? records : []

  const toDisplayTimestamp = (value = '') => {
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

  const filteredRecords = safeRecords
    .filter((row) => {
      const query = String(searchTerm || '').trim().toLowerCase()
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

  const searchSuggestions = buildSearchSuggestions(
    safeRecords.flatMap((row) => [
      row.title,
      row.filename,
      row.ticketReference,
      row.signatureName,
      row.sentByName,
    ]),
    14,
  )
  const searchListId = 'resolved-documents-search-suggestions'
  const totalDelivered = safeRecords.length
  const totalDownloaded = safeRecords.filter((row) => Number(row.downloadCount || 0) > 0).length

  const handleDownload = async (row = {}) => {
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
      businessName: downloadBusinessName,
      fileName: row.filename || row.title || 'resolved-document',
    })
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    const nextTimestampIso = new Date().toISOString()
    onRecordsChange?.((previousRows) => (
      (Array.isArray(previousRows) ? previousRows : []).map((item) => {
        const matches = item.id === row.id || item.fileId === row.fileId
        if (!matches) return item
        return {
          ...item,
          downloadCount: Math.max(0, Number(item.downloadCount || 0)) + 1,
          lastDownloadedAtIso: nextTimestampIso,
        }
      })
    ))
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Resolved Documents</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-card border border-border-light px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-text-muted">Delivered by Admin</p>
          <p className="text-xl font-semibold text-text-primary mt-1">{totalDelivered}</p>
        </div>
        <div className="bg-white rounded-lg shadow-card border border-border-light px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-text-muted">Downloaded</p>
          <p className="text-xl font-semibold text-text-primary mt-1">{totalDownloaded}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light p-4 mb-6">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            list={searchSuggestions.length > 0 ? searchListId : undefined}
            placeholder="Search title, file name, or signer..."
            className="w-full h-10 pl-9 pr-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          />
          {searchSuggestions.length > 0 && (
            <datalist id={searchListId}>
              {searchSuggestions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card border border-border-light overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Document</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Signed By</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Delivered</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                  No resolved documents have been delivered yet.
                </td>
              </tr>
            )}
            {filteredRecords.map((row) => (
              <tr key={row.id} className="border-t border-border-light hover:bg-[#F9FAFB]">
                <td className="px-4 py-3.5 text-sm">
                  <p className="font-medium text-text-primary">{row.title || row.filename || '--'}</p>
                  <p className="text-xs text-text-secondary mt-1">{row.filename || '--'}{row.ticketReference ? ` / ${row.ticketReference}` : ''}</p>
                  {row.notes && <p className="text-xs text-text-muted mt-1 truncate max-w-[28rem]">{row.notes}</p>}
                </td>
                <td className="px-4 py-3.5 text-sm">
                  <p className="text-text-primary">{row.signatureName || row.sentByName || '--'}</p>
                  <p className="text-xs text-text-muted mt-1">{toDisplayTimestamp(row.signatureAtIso || row.sentAtIso)}</p>
                </td>
                <td className="px-4 py-3.5 text-sm text-text-secondary">{toDisplayTimestamp(row.sentAtIso)}</td>
                <td className="px-4 py-3.5 text-sm">
                  <span className="inline-flex items-center h-6 px-2.5 rounded text-xs font-medium bg-success-bg text-success">
                    Ready
                  </span>
                  {Number(row.downloadCount || 0) > 0 && (
                    <p className="text-xs text-text-muted mt-1">
                      Downloaded {Number(row.downloadCount || 0)} time{Number(row.downloadCount || 0) > 1 ? 's' : ''}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3.5 text-sm">
                  <button
                    type="button"
                    onClick={() => void handleDownload(row)}
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

function RecentActivitiesPage({
  records = [],
  activityLogs = [],
  globalSearchTerm = '',
  onGlobalSearchTermChange,
}) {
  const [localSearchTerm, setLocalSearchTerm] = useState('')
  const searchTerm = typeof onGlobalSearchTermChange === 'function'
    ? String(globalSearchTerm || '')
    : localSearchTerm
  const setSearchTerm = (value) => {
    if (typeof onGlobalSearchTermChange === 'function') {
      onGlobalSearchTermChange(value)
      return
    }
    setLocalSearchTerm(value)
  }
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const maxFilterDate = toIsoDate(new Date())
  const [activityType, setActivityType] = useState('')
  const [activitySortBy, setActivitySortBy] = useState('date-desc')
  const toDateMs = (value = '') => {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : NaN
  }
  const endOfDayMs = (value = '') => {
    if (!value) return NaN
    const parsed = Date.parse(`${value}T23:59:59.999`)
    return Number.isFinite(parsed) ? parsed : NaN
  }
  const toDisplayDate = (value) => {
    const parsed = Date.parse(value || '')
    if (Number.isNaN(parsed)) return value || '--'
    return new Date(parsed).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  const inferType = (action = '', details = '') => {
    const text = `${action} ${details}`.toLowerCase()
    if (text.includes('approve')) return 'approved'
    if (text.includes('reject') || text.includes('delete')) return 'rejected'
    if (text.includes('info') || text.includes('clarification')) return 'info'
    return 'upload'
  }

  const sortedLogEntries = [...(Array.isArray(activityLogs) ? activityLogs : [])]
    .sort((a, b) => (Date.parse(b.timestamp || '') || 0) - (Date.parse(a.timestamp || '') || 0))
  const hasLogEntries = sortedLogEntries.length > 0

  const activities = hasLogEntries
    ? sortedLogEntries.map((entry, index) => ({
      id: entry.id || `activity-${index}`,
      type: inferType(entry.action, entry.details),
      activity: entry.action || 'Activity',
      details: entry.details || '--',
      actorName: entry.actorName || 'Client User',
      actorRole: entry.actorRole || 'client',
      date: toDisplayDate(entry.timestamp),
      timestampMs: Date.parse(entry.timestamp || '') || 0,
    }))
    : [...(Array.isArray(records) ? records : [])]
      .sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0))
      .map((record, index) => {
        let type = 'upload'
        let activity = `Uploaded ${record.filename || 'document'}`
        if (record.status === 'Approved') {
          type = 'approved'
          activity = `Approved ${record.filename || 'document'}`
        }
        if (record.status === 'Rejected') {
          type = 'rejected'
          activity = `Rejected ${record.filename || 'document'}`
        }
        if (record.status === 'Needs Clarification' || record.status === 'Info Requested') {
          type = 'info'
          activity = `Info requested for ${record.filename || 'document'}`
        }
        return {
          id: `${record.fileId || record.id}-${index}`,
          type,
          activity,
          details: `File: ${record.filename || '--'} | Category: ${record.category || '--'} | Status: ${record.status || 'Pending Review'}`,
          actorName: 'System',
          actorRole: 'derived',
          date: toDisplayDate(record.date),
          timestampMs: Date.parse(record.date || '') || 0,
        }
      })

  const activitySearchSuggestions = buildSearchSuggestions(
    activities.flatMap((item) => [
      item.activity,
      item.details,
      item.actorName,
      item.actorRole,
      item.type,
    ]),
    16,
  )
  const recentActivitiesSearchListId = 'recent-activities-search-suggestions'

  const filteredActivities = activities.filter((item) => {
    const query = searchTerm.trim().toLowerCase()
    const normalizedFrom = clampFilterDateToToday(dateFrom)
    const normalizedTo = clampFilterDateToToday(dateTo)
    const fromMs = toDateMs(normalizedFrom)
    const toMs = endOfDayMs(normalizedTo)
    const matchesQuery = !query || (
      item.activity.toLowerCase().includes(query)
      || item.details.toLowerCase().includes(query)
      || item.actorName.toLowerCase().includes(query)
      || item.actorRole.toLowerCase().includes(query)
      || item.date.toLowerCase().includes(query)
    )
    const matchesType = !activityType || item.type === activityType
    const stamp = Number.isFinite(item.timestampMs) ? item.timestampMs : Date.parse(item.date || '')
    const matchesFrom = !normalizedFrom || (Number.isFinite(stamp) && stamp >= fromMs)
    const matchesTo = !normalizedTo || (Number.isFinite(stamp) && stamp <= toMs)
    return matchesQuery && matchesType && matchesFrom && matchesTo
  })
  const sortedActivities = [...filteredActivities].sort((left, right) => {
    if (activitySortBy === 'date-asc') {
      return (left.timestampMs || 0) - (right.timestampMs || 0)
    }
    if (activitySortBy === 'role-asc') {
      const compared = String(left.actorRole || '').localeCompare(String(right.actorRole || ''), undefined, { sensitivity: 'base' })
      if (compared !== 0) return compared
      return (right.timestampMs || 0) - (left.timestampMs || 0)
    }
    if (activitySortBy === 'role-desc') {
      const compared = String(right.actorRole || '').localeCompare(String(left.actorRole || ''), undefined, { sensitivity: 'base' })
      if (compared !== 0) return compared
      return (right.timestampMs || 0) - (left.timestampMs || 0)
    }
    return (right.timestampMs || 0) - (left.timestampMs || 0)
  })

  const renderTypeIcon = (type) => {
    if (type === 'approved') return <CheckCircle className="w-4 h-4 text-success" />
    if (type === 'rejected') return <XCircle className="w-4 h-4 text-error" />
    if (type === 'info') return <AlertCircle className="w-4 h-4 text-warning" />
    return <UploadCloud className="w-4 h-4 text-primary" />
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Recent Activities</h1>
      </div>

      <div className="bg-white rounded-lg shadow-card p-4 mb-6">
        <div className="flex flex-wrap items-stretch sm:items-center gap-3">
          <div className="relative flex-1 min-w-0 sm:min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search activities..."
              list={activitySearchSuggestions.length > 0 ? recentActivitiesSearchListId : undefined}
              className="w-full h-9 pl-10 pr-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            />
            {activitySearchSuggestions.length > 0 && (
              <datalist id={recentActivitiesSearchListId}>
                {activitySearchSuggestions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            )}
          </div>
          <select
            value={activityType}
            onChange={(event) => setActivityType(event.target.value)}
            className="h-9 w-full sm:w-auto px-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All Types</option>
            <option value="upload">Upload</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="info">Info Requested</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            max={maxFilterDate}
            onChange={(event) => setDateFrom(clampFilterDateToToday(event.target.value))}
            className="h-9 w-full sm:w-auto px-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            title="From date"
          />
          <input
            type="date"
            value={dateTo}
            max={maxFilterDate}
            onChange={(event) => setDateTo(clampFilterDateToToday(event.target.value))}
            className="h-9 w-full sm:w-auto px-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            title="To date"
          />
          <select
            value={activitySortBy}
            onChange={(event) => setActivitySortBy(event.target.value)}
            className="h-9 w-full sm:w-auto px-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            title="Sort activities"
          >
            <option value="date-desc">Sort: Date (Newest)</option>
            <option value="date-asc">Sort: Date (Oldest)</option>
            <option value="role-asc">Sort: Role (A-Z)</option>
            <option value="role-desc">Sort: Role (Z-A)</option>
          </select>
          {(searchTerm || activityType || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('')
                setActivityType('')
                setDateFrom('')
                setDateTo('')
                setActivitySortBy('date-desc')
              }}
              className="h-9 px-3 text-sm text-error hover:bg-error-bg rounded-md"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F9FAFB]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Activity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Details</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Date</th>
              </tr>
            </thead>
            <tbody>
              {sortedActivities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-text-muted">No activity found.</td>
                </tr>
              ) : (
                sortedActivities.map((row) => (
                  <tr key={row.id} className="border-b border-border-light hover:bg-[#F9FAFB]">
                    <td className="px-4 py-3.5 text-sm text-text-primary">
                      <div className="inline-flex items-center gap-2">
                        {renderTypeIcon(row.type)}
                        <span>{row.activity}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{row.details}</td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{row.actorName}</td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex h-6 items-center rounded px-2.5 text-xs font-medium bg-background text-text-secondary uppercase">
                        {row.actorRole}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">{row.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SupportPage(props) {
  return <ClientSupportPageExperience {...props} />
}

function ClientSupportWidget(props) {
  return <ClientSupportWidgetExperience {...props} />
}

// Reusable file viewer modal used by pages
function FileViewerModal({
  file: incomingFile,
  onClose,
  onSave,
  onDelete,
  onResubmit,
  readOnly = false,
  tagOptions = [],
  downloadNamePrefix = '',
  onEnsureFileAvailable,
}) {
  const file = incomingFile && typeof incomingFile === 'object' ? incomingFile : EMPTY_FILE_RECORD
  const [editData, setEditData] = useState(file)
  const [textPreview, setTextPreview] = useState(null)
  const [tablePreview, setTablePreview] = useState(null)
  const [pdfPreviewImageUrl, setPdfPreviewImageUrl] = useState('')
  const [previewMessage, setPreviewMessage] = useState('')
  const [externalPreviewUrl, setExternalPreviewUrl] = useState('')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showLockedEditNotice, setShowLockedEditNotice] = useState(false)
  const [isCustomTagMode, setIsCustomTagMode] = useState(false)
  const [cachedFileBlob, setCachedFileBlob] = useState(null)
  const [cachedFileCacheKey, setCachedFileCacheKey] = useState('')
  const resubmitInputRef = useRef(null)
  const resolvePreviewUrl = (target = {}) => {
    if (isBlobLike(target?.rawFile)) return getRuntimeObjectUrl(target.rawFile)

    const targetCacheKey = String(target?.fileCacheKey || '').trim()
    if (targetCacheKey && targetCacheKey === cachedFileCacheKey && isBlobLike(cachedFileBlob)) {
      return getRuntimeObjectUrl(cachedFileBlob)
    }

    const directUrl = normalizeRuntimePreviewUrl(
      target?.previewUrl || target?.url || target?.fileUrl || target?.documentUrl || '',
      { allowBlob: false },
    )
    if (directUrl) return directUrl

    const versionRows = Array.isArray(file?.versions) ? file.versions : []
    for (let index = versionRows.length - 1; index >= 0; index -= 1) {
      const version = versionRows[index] || {}
      const snapshot = version.fileSnapshot || {}
      const snapshotCacheKey = String(snapshot.fileCacheKey || version.fileCacheKey || '').trim()
      if (snapshotCacheKey && snapshotCacheKey === cachedFileCacheKey && isBlobLike(cachedFileBlob)) {
        return getRuntimeObjectUrl(cachedFileBlob)
      }
      const versionUrl = normalizeRuntimePreviewUrl((
        snapshot.previewUrl
        || version.previewUrl
        || snapshot.url
        || snapshot.fileUrl
        || snapshot.documentUrl
        || ''
      ), { allowBlob: false })
      if (versionUrl) return versionUrl
    }

    return normalizeRuntimePreviewUrl(
      file?.previewUrl || file?.url || file?.fileUrl || file?.documentUrl || '',
      { allowBlob: false },
    )
  }

  useEffect(() => {
    setEditData(file)
    setTextPreview(null)
    setTablePreview(null)
    setPdfPreviewImageUrl('')
    setPreviewMessage('')
    setExternalPreviewUrl('')
    setIsPreviewLoading(false)
    setSelectedVersion(null)
    setIsEditing(false)
    setShowLockedEditNotice(false)
    setIsCustomTagMode(false)
  }, [file, readOnly])

  const safeEditData = editData && typeof editData === 'object' ? editData : EMPTY_FILE_RECORD

  useEffect(() => {
    let cancelled = false
    const nextCacheKey = String(file?.fileCacheKey || '').trim()
    setCachedFileCacheKey(nextCacheKey)

    if (isBlobLike(file?.rawFile)) {
      setCachedFileBlob(file.rawFile)
      return undefined
    }

    setCachedFileBlob(null)
    if (!nextCacheKey) return undefined

    ;(async () => {
      const cachedBlob = await getCachedFileBlob(nextCacheKey)
      if (cancelled) return
      if (isBlobLike(cachedBlob)) {
        setCachedFileBlob(cachedBlob)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [file])

  useEffect(() => {
    const active = selectedVersion || safeEditData || file
    const ext = resolvePreviewExtension(active, file)
    const needsRichPreview = (
      TEXT_PREVIEW_EXTENSIONS.has(ext)
      || SPREADSHEET_PREVIEW_EXTENSIONS.has(ext)
      || WORD_PREVIEW_EXTENSIONS.has(ext)
      || PRESENTATION_PREVIEW_EXTENSIONS.has(ext)
      || PDF_PREVIEW_EXTENSIONS.has(ext)
    )
    if (!needsRichPreview) {
      setTextPreview(null)
      setTablePreview(null)
      setPdfPreviewImageUrl('')
      setPreviewMessage('')
      setExternalPreviewUrl('')
      setIsPreviewLoading(false)
      return
    }

    let previewUrl = resolvePreviewUrl(active)
    const activeCacheKey = String(active?.fileCacheKey || '').trim()
    let sourceFile = isBlobLike(active?.rawFile)
      ? active.rawFile
      : (activeCacheKey && activeCacheKey === cachedFileCacheKey && isBlobLike(cachedFileBlob) ? cachedFileBlob : null)

    let cancelled = false
    const setIfActive = (callback) => {
      if (cancelled) return
      callback()
    }

    const readPreviewText = async () => {
      if (sourceFile) return readBlobAsText(sourceFile)
      if (!previewUrl) return ''
      const response = await fetch(previewUrl)
      if (!response.ok) throw new Error('Unable to fetch file text preview')
      return response.text()
    }

    const readPreviewArrayBuffer = async () => {
      if (sourceFile) return readBlobAsArrayBuffer(sourceFile)
      if (!previewUrl) return new ArrayBuffer(0)
      const response = await fetch(previewUrl)
      if (!response.ok) throw new Error('Unable to fetch file binary preview')
      return response.arrayBuffer()
    }

    const loadPreview = async () => {
      setIfActive(() => {
        setIsPreviewLoading(true)
        setTextPreview(null)
        setTablePreview(null)
        setPdfPreviewImageUrl('')
        setPreviewMessage('')
        setExternalPreviewUrl('')
      })

      try {
        if (!sourceFile && !previewUrl && typeof onEnsureFileAvailable === 'function') {
          const ensured = await onEnsureFileAvailable(active)
          if (cancelled) return
          if (ensured?.ok && isBlobLike(ensured.blob)) {
            sourceFile = ensured.blob
            const ensuredCacheKey = String(ensured?.filePatch?.fileCacheKey || activeCacheKey || '').trim()
            setIfActive(() => {
              if (ensuredCacheKey) {
                setCachedFileCacheKey(ensuredCacheKey)
              }
              setCachedFileBlob(ensured.blob)
            })
          }
        }

        if (!sourceFile && !previewUrl) {
          setIfActive(() => setPreviewMessage('Preview is unavailable for this file. The saved preview link may have expired.'))
          return
        }

        if (TEXT_PREVIEW_EXTENSIONS.has(ext)) {
          const value = await readPreviewText()
          setIfActive(() => setTextPreview((value || '').trim() || 'File is empty.'))
          return
        }

        if (SPREADSHEET_PREVIEW_EXTENSIONS.has(ext)) {
          const buffer = await readPreviewArrayBuffer()
          const worksheetData = await parseFirstWorksheet(buffer, {
            maxCollectedRows: 1500,
            maxCollectedColumns: 40,
          })
          if (!worksheetData.sheetName) {
            setIfActive(() => setPreviewMessage('No preview data found in this spreadsheet.'))
            return
          }

          const rows = Array.isArray(worksheetData.rows)
            ? worksheetData.rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []))
            : []
          if (rows.length === 0) {
            setIfActive(() => setPreviewMessage('Spreadsheet is empty.'))
            return
          }

          const maxColumns = Math.max(1, Number(worksheetData.totalColumns || 0), ...rows.map((row) => row.length))
          const visibleRowCount = 60
          const visibleColumnCount = Math.min(16, maxColumns)
          const visibleRows = rows
            .slice(0, visibleRowCount)
            .map((row) => Array.from({ length: visibleColumnCount }, (_, columnIndex) => row[columnIndex] || ''))

          setIfActive(() => setTablePreview({
            sheetName: worksheetData.sheetName || 'Sheet1',
            rows: visibleRows,
            totalRows: Number(worksheetData.totalRows || rows.length),
            totalColumns: maxColumns,
            truncatedRows: Number(worksheetData.totalRows || rows.length) > visibleRowCount || Boolean(worksheetData.sourceTruncated),
            truncatedColumns: maxColumns > visibleColumnCount || Boolean(worksheetData.sourceTruncated),
          }))
          return
        }

        if (ext === 'DOCX') {
          const buffer = await readPreviewArrayBuffer()
          const zip = await JSZip.loadAsync(buffer)
          const documentEntry = zip.file('word/document.xml')
          if (!documentEntry) {
            setIfActive(() => setPreviewMessage('This Word document does not contain readable preview content.'))
            return
          }
          const xml = await documentEntry.async('string')
          const value = extractReadableXmlText(xml)
          setIfActive(() => setTextPreview(value || 'No readable text found in this Word document.'))
          return
        }

        if (ext === 'PPTX') {
          const buffer = await readPreviewArrayBuffer()
          const zip = await JSZip.loadAsync(buffer)
          const slideNames = Object.keys(zip.files)
            .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
            .sort((left, right) => {
              const leftIndex = Number((left.match(/slide(\d+)\.xml/i) || [])[1] || 0)
              const rightIndex = Number((right.match(/slide(\d+)\.xml/i) || [])[1] || 0)
              return leftIndex - rightIndex
            })
          if (slideNames.length === 0) {
            setIfActive(() => setPreviewMessage('No readable slide content found in this presentation.'))
            return
          }

          const slideText = []
          for (let index = 0; index < slideNames.length; index += 1) {
            const entryName = slideNames[index]
            const entry = zip.file(entryName)
            if (!entry) continue
            const xml = await entry.async('string')
            const extracted = extractReadableXmlText(xml)
            if (!extracted) continue
            slideText.push(`Slide ${index + 1}\n${extracted}`)
          }

          setIfActive(() => setTextPreview(slideText.join('\n\n') || 'No readable text found in this PowerPoint file.'))
          return
        }

        if (ext === 'DOC' || ext === 'PPT') {
          if (!sourceFile && isHttpUrl(previewUrl)) {
            const embedUrl = toOfficeEmbedUrl(previewUrl)
            if (embedUrl) {
              setIfActive(() => {
                setExternalPreviewUrl(embedUrl)
                setPreviewMessage('')
              })
              return
            }
          }
          setIfActive(() => setPreviewMessage(`Preview for legacy .${ext.toLowerCase()} files is limited. Please download to view fully.`))
          return
        }

        if (PDF_PREVIEW_EXTENSIONS.has(ext)) {
          const buffer = await readPreviewArrayBuffer()
          if (!buffer || buffer.byteLength === 0) {
            setIfActive(() => setPreviewMessage('PDF is empty or unavailable for preview.'))
            return
          }

          const loadingTask = getDocument({ data: buffer })
          const pdf = await loadingTask.promise
          const page = await pdf.getPage(1)
          const viewport = page.getViewport({ scale: 1.2 })
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          if (!context) {
            setIfActive(() => setPreviewMessage('Unable to render PDF preview.'))
            return
          }
          canvas.width = Math.max(1, Math.floor(viewport.width))
          canvas.height = Math.max(1, Math.floor(viewport.height))
          await page.render({ canvasContext: context, viewport }).promise
          const imageUrl = canvas.toDataURL('image/png')
          const pages = Number(pdf.numPages || 0)
          setIfActive(() => {
            setPdfPreviewImageUrl(imageUrl)
            if (pages > 1) {
              setPreviewMessage(`Showing page 1 of ${pages}.`)
            }
          })
          try {
            await pdf.destroy()
          } catch {
            // ignore worker cleanup errors
          }
          return
        }

        setIfActive(() => setPreviewMessage('Preview not available for this file type.'))
      } catch {
        if (!sourceFile && isPublicHttpUrl(previewUrl)) {
          if (OFFICE_EMBED_PREVIEW_EXTENSIONS.has(ext)) {
            const embedUrl = toOfficeEmbedUrl(previewUrl)
            if (embedUrl) {
              setIfActive(() => {
                setExternalPreviewUrl(embedUrl)
                setPreviewMessage('')
              })
              return
            }
          }
          if (ext === 'CSV' || ext === 'TXT') {
            setIfActive(() => {
              setExternalPreviewUrl(previewUrl)
              setPreviewMessage('')
            })
            return
          }
        }
        setIfActive(() => setPreviewMessage('Unable to load preview for this file.'))
      } finally {
        setIfActive(() => setIsPreviewLoading(false))
      }
    }

    loadPreview()

    return () => {
      cancelled = true
    }
  }, [safeEditData, file, selectedVersion, cachedFileBlob, cachedFileCacheKey, onEnsureFileAvailable])

  const renderFilePreview = () => {
    const active = selectedVersion || safeEditData || file
    const ext = resolvePreviewExtension(active, file)
    const url = resolvePreviewUrl(active)

    if (SPREADSHEET_PREVIEW_EXTENSIONS.has(ext)) {
      if (isPreviewLoading && !tablePreview) {
        return (
          <div className="p-4 text-sm text-text-muted">
            <DotLottiePreloader size={26} label="Loading preview..." className="w-full justify-start" />
          </div>
        )
      }
      if (externalPreviewUrl) {
        return <iframe title="spreadsheet-preview" src={externalPreviewUrl} className="w-full h-64" />
      }
      if (tablePreview?.rows?.length > 0) {
        return (
          <div className="max-h-64 overflow-auto">
            <div className="px-3 py-2 border-b border-border-light bg-[#F9FAFB] text-xs text-text-secondary">
              Sheet: {tablePreview.sheetName}
            </div>
            <table className="w-full text-xs">
              <tbody>
                {tablePreview.rows.map((row, rowIndex) => (
                  <tr key={`preview-row-${rowIndex}`} className="border-b border-border-light">
                    {row.map((cell, columnIndex) => (
                      <td
                        key={`preview-cell-${rowIndex}-${columnIndex}`}
                        className={`px-2 py-1.5 align-top ${rowIndex === 0 ? 'font-semibold bg-[#F9FAFB]' : 'text-text-primary'}`}
                      >
                        {cell || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {(tablePreview.truncatedRows || tablePreview.truncatedColumns) && (
              <div className="px-3 py-2 text-xs text-text-muted border-t border-border-light bg-[#F9FAFB]">
                Showing {Math.min(60, tablePreview.totalRows)} of {tablePreview.totalRows} rows
                {tablePreview.truncatedColumns ? ` and first ${Math.min(16, tablePreview.totalColumns)} columns` : ''}.
              </div>
            )}
          </div>
        )
      }
      return (
        <div className="p-4 text-sm text-text-muted">
          {previewMessage || 'Preview not available for this spreadsheet.'}
        </div>
      )
    }

    if (TEXT_PREVIEW_EXTENSIONS.has(ext) || WORD_PREVIEW_EXTENSIONS.has(ext) || PRESENTATION_PREVIEW_EXTENSIONS.has(ext)) {
      if (isPreviewLoading && !textPreview) {
        return (
          <div className="p-4 text-sm text-text-muted">
            <DotLottiePreloader size={26} label="Loading preview..." className="w-full justify-start" />
          </div>
        )
      }
      if (externalPreviewUrl) {
        return <iframe title="document-preview" src={externalPreviewUrl} className="w-full h-64" />
      }
      if (textPreview) {
        return (
          <div className="p-3 text-sm font-mono whitespace-pre-wrap max-h-64 overflow-auto">
            {textPreview}
          </div>
        )
      }
      return (
        <div className="p-4 text-sm text-text-muted">
          {previewMessage || 'Preview not available for this file type. You can download to view.'}
        </div>
      )
    }

    if (PDF_PREVIEW_EXTENSIONS.has(ext)) {
      if (isPreviewLoading) {
        return (
          <div className="p-4 text-sm text-text-muted">
            <DotLottiePreloader size={26} label="Loading preview..." className="w-full justify-start" />
          </div>
        )
      }
      if (pdfPreviewImageUrl) {
        return (
          <div>
            <img src={pdfPreviewImageUrl} alt={active?.filename || file?.filename || 'PDF preview'} className="w-full object-contain max-h-64 bg-white" />
            {previewMessage && (
              <div className="px-3 py-2 text-xs text-text-muted border-t border-border-light bg-[#F9FAFB]">
                {previewMessage}
              </div>
            )}
          </div>
        )
      }
      if (previewMessage) {
        return <div className="p-4 text-sm text-text-muted">{previewMessage}</div>
      }
    }

    if (url && PDF_PREVIEW_EXTENSIONS.has(ext)) {
      return <iframe title="pdf-preview" src={url} className="w-full h-64" />
    }
    if (url && IMAGE_PREVIEW_EXTENSIONS.has(ext)) {
      return <img src={url} alt={active?.filename || file?.filename || 'Preview'} className="w-full object-contain max-h-64" />
    }
    if (url && isPublicHttpUrl(url) && !OFFICE_EMBED_PREVIEW_EXTENSIONS.has(ext)) {
      return <iframe title="file-preview" src={url} className="w-full h-64" />
    }
    return (
      <div className="p-4 text-sm text-text-muted">Preview not available for this file type. You can download to view.</div>
    )
  }

  const displayStatus = safeEditData.status || file.status || 'Pending Review'
  const isDeletedFile = Boolean(safeEditData.isDeleted || file.isDeleted || displayStatus === 'Deleted')
  const isApprovedLocked = !isDeletedFile
    && (Boolean(safeEditData.isLocked || file.isLocked) || String(displayStatus).toLowerCase() === 'approved')
  const effectiveReadOnly = readOnly || isDeletedFile || isApprovedLocked
  const canResubmit = !effectiveReadOnly && ['Rejected', 'Info Requested', 'Needs Clarification'].includes(displayStatus)
  const adminComment = (safeEditData.adminComment || file.adminComment || '').trim()
  const requiredAction = (safeEditData.requiredAction || file.requiredAction || '').trim()
  const adminNotes = (safeEditData.adminNotes || file.adminNotes || '').trim()
  const infoRequestDetails = (safeEditData.infoRequestDetails || file.infoRequestDetails || '').trim()
  const hasAdminFeedback = Boolean(adminComment || requiredAction || adminNotes || infoRequestDetails)
  const paymentMethodOptions = ['Cash', 'Bank Transfer', 'Card', 'Cheque', 'Mobile Money', 'POS', 'Other']
  const versions = Array.isArray(file.versions) ? file.versions : []
  const dynamicTagValues = versions.map((entry) => (
    entry?.fileSnapshot?.class
    || entry?.fileSnapshot?.className
    || entry?.fileSnapshot?.expenseClass
    || entry?.fileSnapshot?.salesClass
    || ''
  ))
  const computedTagOptions = (() => {
    const byKey = new Map()
    ;[
      ...(Array.isArray(tagOptions) ? tagOptions : []),
      ...dynamicTagValues,
    ].forEach((value) => {
      const normalized = String(value || '').replace(/\s+/g, ' ').trim()
      if (!normalized) return
      const key = normalized.toLowerCase()
      if (byKey.has(key)) return
      byKey.set(key, normalized)
    })
    return Array.from(byKey.values())
  })()
  const normalizedCurrentTag = String(safeEditData.class || safeEditData.expenseClass || safeEditData.salesClass || '').trim()
  const matchingTag = computedTagOptions.find((option) => option.toLowerCase() === normalizedCurrentTag.toLowerCase()) || ''
  const showCustomTagInput = isCustomTagMode || Boolean(normalizedCurrentTag && !matchingTag)
  const selectedTagValue = showCustomTagInput ? '__create_new__' : matchingTag
  const currentDownloadUrl = resolvePreviewUrl(editData || file)
  const baseDownloadFileName = safeEditData.filename || file.filename || 'document'
  const resolvedDownloadFileName = buildClientDownloadFilename({
    businessName: downloadNamePrefix,
    fileName: baseDownloadFileName,
  })
  const handleDownloadTarget = async (target = {}, fallbackFileName = 'document') => {
    const nextFileName = buildClientDownloadFilename({
      businessName: downloadNamePrefix,
      fileName: target?.filename || fallbackFileName,
    })
    const directUrl = resolvePreviewUrl(target)
    if (directUrl) {
      triggerBrowserDownload({ url: directUrl, fileName: nextFileName })
      return true
    }

    if (typeof onEnsureFileAvailable !== 'function') {
      return false
    }

    const ensured = await onEnsureFileAvailable(target)
    if (!(ensured?.ok && ensured.blob instanceof Blob)) {
      return false
    }

    const ensuredCacheKey = String(ensured?.filePatch?.fileCacheKey || target?.fileCacheKey || '').trim()
    if (ensuredCacheKey) {
      setCachedFileCacheKey(ensuredCacheKey)
    }
    setCachedFileBlob(ensured.blob)
    triggerBrowserDownload({
      blob: ensured.blob,
      fileName: nextFileName,
    })
    return true
  }

  const uploadInfo = file.uploadInfo || {}
  const sourceLabelMap = {
    'drag-drop': 'Drag & Drop',
    'browse-file': 'Browse Files',
    'browse-folder': 'Browse Folder',
    resubmission: 'Resubmission',
  }
  const formatTimestamp = (value) => {
    const parsed = Date.parse(value || '')
    if (Number.isNaN(parsed)) return '--'
    return new Date(parsed).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }
  const formatDate = (value) => {
    const parsed = Date.parse(value || '')
    if (Number.isNaN(parsed)) return '--'
    return new Date(parsed).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    })
  }
  const formatTime = (value) => {
    const parsed = Date.parse(value || '')
    if (Number.isNaN(parsed)) return '--'
    return new Date(parsed).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }
  const formatStampMeta = (value) => {
    const parsed = Date.parse(value || '')
    if (Number.isNaN(parsed)) return { date: '--', time: '--' }
    const source = new Date(parsed)
    return {
      date: source.toLocaleDateString('en-GB'),
      time: source.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    }
  }
  const approvedStampMeta = formatStampMeta(safeEditData.approvedAtIso || file.approvedAtIso || '')
  const rejectedStampMeta = formatStampMeta(safeEditData.rejectedAtIso || file.rejectedAtIso || '')
  const stampMode = displayStatus === 'Approved'
    ? 'approved'
    : displayStatus === 'Rejected'
      ? 'rejected'
      : ''

  const handleResubmitSelection = (event) => {
    const selectedFile = event.target.files?.[0]
    event.target.value = ''
    if (!selectedFile) return
    if (!onResubmit) return
    onResubmit(safeEditData || file, selectedFile)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border-light flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">Document Details</h3>
          <button onClick={onClose} className="w-8 h-8 border border-border rounded-md text-text-secondary hover:text-text-primary hover:border-primary">
            <X className="w-4 h-4 mx-auto" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[calc(90vh-72px)] overflow-y-auto">
          <div>
            <label className="block text-xs text-text-muted mb-2">Preview</label>
            <div className="relative border border-border rounded-md overflow-hidden bg-background">
              {renderFilePreview()}
              {stampMode && (
                <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center">
                  <div
                    className={`w-[88%] border-4 rounded-xl px-8 py-5 text-center rotate-[-24deg] ${
                      stampMode === 'approved'
                        ? 'border-green-600/35 text-green-700/35'
                        : 'border-red-700/35 text-red-700/35'
                    }`}
                  >
                    <div className="text-5xl font-semibold tracking-[0.2em]">
                      {stampMode === 'approved' ? 'APPROVED' : 'REJECTED'}
                    </div>
                    {stampMode === 'approved' ? (
                      <div className="mt-2 text-xs tracking-wide font-medium">
                        Approved by: {safeEditData.approvedBy || file.approvedBy || 'Admin'} | Date: {approvedStampMeta.date} | Time: {approvedStampMeta.time}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs tracking-wide font-medium">
                        Rejected by: {safeEditData.rejectedBy || file.rejectedBy || 'Admin'} | Date: {rejectedStampMeta.date} | Reason: {(safeEditData.rejectionReason || file.rejectionReason || adminComment || requiredAction || 'Not provided').slice(0, 80)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-muted">File ID</label>
            <div className="py-2 font-medium">{file.fileId}</div>
          </div>

          <div>
            <label className="block text-xs text-text-muted">Date & Time</label>
            <div className="py-2">{file.date}</div>
          </div>
          <fieldset disabled={!isEditing || effectiveReadOnly} className="contents">
            <div>
              <label className="block text-xs text-text-muted">Uploaded By</label>
              <input value={safeEditData.user || ''} onChange={(e) => setEditData(prev => ({ ...prev, user: e.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary" />
            </div>
            <div>
              <label className="block text-xs text-text-muted">Class</label>
              <select
                value={selectedTagValue}
                onChange={(event) => {
                  const nextValue = event.target.value
                  if (nextValue === '__create_new__') {
                    setIsCustomTagMode(true)
                    setEditData(prev => ({
                      ...prev,
                      class: '',
                      classId: '',
                      className: '',
                      expenseClass: '',
                      salesClass: '',
                    }))
                    return
                  }
                  setIsCustomTagMode(false)
                    setEditData(prev => ({
                      ...prev,
                      class: nextValue,
                      classId: nextValue ? `CLS-${nextValue.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16)}` : '',
                      className: nextValue,
                      expenseClass: nextValue,
                      salesClass: nextValue,
                    }))
                }}
                className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary"
              >
                <option value="">Select class</option>
                {computedTagOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
                <option value="__create_new__">Create new class</option>
              </select>
              {showCustomTagInput && (
                <input
                  value={safeEditData.class || safeEditData.expenseClass || safeEditData.salesClass || ''}
                  onChange={(event) => {
                    const nextClass = event.target.value
                    setEditData(prev => ({
                      ...prev,
                      class: nextClass,
                      classId: nextClass ? `CLS-${nextClass.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16)}` : '',
                      className: nextClass,
                      expenseClass: nextClass,
                      salesClass: nextClass,
                    }))
                  }}
                  placeholder="Enter new class"
                  className="w-full h-10 mt-2 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary"
                />
              )}
            </div>
            <div>
              <label className="block text-xs text-text-muted">Vendor</label>
              <input value={safeEditData.vendorName || ''} onChange={(e) => setEditData(prev => ({ ...prev, vendorName: e.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary" />
            </div>
            <div>
              <label className="block text-xs text-text-muted">Confidentiality</label>
              <select
                value={safeEditData.confidentialityLevel || 'Standard'}
                onChange={(e) => setEditData(prev => ({ ...prev, confidentialityLevel: e.target.value }))}
                className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary"
              >
                <option value="Standard">Standard</option>
                <option value="Confidential">Confidential</option>
                <option value="Highly Confidential">Highly Confidential</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted">Priority</label>
              <select
                value={safeEditData.processingPriority || 'Normal'}
                onChange={(e) => setEditData(prev => ({ ...prev, processingPriority: e.target.value }))}
                className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary"
              >
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
            {('expenseDate' in safeEditData || 'expenseDate' in file) && (
              <div>
                <label className="block text-xs text-text-muted">Expense Date</label>
                <input type="date" value={safeEditData.expenseDate || ''} onChange={(e) => setEditData(prev => ({ ...prev, expenseDate: e.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary" />
              </div>
            )}
            {('paymentMethod' in safeEditData || 'paymentMethod' in file) && (
              <div>
                <label className="block text-xs text-text-muted">Payment Method</label>
                <select
                  value={safeEditData.paymentMethod || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                  className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary"
                >
                  <option value="">Select payment method</option>
                  {(safeEditData.paymentMethod || '')
                    && !paymentMethodOptions.some((option) => option.toLowerCase() === (safeEditData.paymentMethod || '').toLowerCase())
                    && <option value={safeEditData.paymentMethod}>{safeEditData.paymentMethod}</option>}
                  {paymentMethodOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            )}
            {('customerName' in safeEditData || 'customerName' in file) && (
              <div>
                <label className="block text-xs text-text-muted">Customer</label>
                <input value={safeEditData.customerName || ''} onChange={(e) => setEditData(prev => ({ ...prev, customerName: e.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary" />
              </div>
            )}
            {('invoice' in safeEditData || 'invoice' in file) && (
              <div>
                <label className="block text-xs text-text-muted">Invoice</label>
                <input value={safeEditData.invoice || ''} onChange={(e) => setEditData(prev => ({ ...prev, invoice: e.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary" />
              </div>
            )}
            {('invoiceNumber' in safeEditData || 'invoiceNumber' in file) && (
              <div>
                <label className="block text-xs text-text-muted">Invoice #</label>
                <input value={safeEditData.invoiceNumber || ''} onChange={(e) => setEditData(prev => ({ ...prev, invoiceNumber: e.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary" />
              </div>
            )}
            <div className="md:col-span-2">
              <label className="block text-xs text-text-muted">Notes</label>
              <textarea
                value={safeEditData.internalNotes || ''}
                onChange={(e) => setEditData(prev => ({ ...prev, internalNotes: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-md text-sm resize-none disabled:bg-background disabled:text-text-secondary"
                rows={3}
              />
            </div>
            {('bankName' in safeEditData || 'bankName' in file) && (
              <div>
                <label className="block text-xs text-text-muted">Bank Name</label>
                <input value={safeEditData.bankName || ''} onChange={(e) => setEditData(prev => ({ ...prev, bankName: e.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary" />
              </div>
            )}
            {('accountName' in safeEditData || 'accountName' in file) && (
              <div>
                <label className="block text-xs text-text-muted">Account Name</label>
                <input value={safeEditData.accountName || ''} onChange={(e) => setEditData(prev => ({ ...prev, accountName: e.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary" />
              </div>
            )}
            {('accountLast4' in safeEditData || 'accountLast4' in file) && (
              <div>
                <label className="block text-xs text-text-muted">Account Last 4</label>
                <input value={safeEditData.accountLast4 || ''} maxLength={4} onChange={(e) => setEditData(prev => ({ ...prev, accountLast4: e.target.value.replace(/\D/g, '').slice(0, 4) }))} className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary" />
              </div>
            )}
            {('statementStartDate' in safeEditData || 'statementStartDate' in file) && (
              <div>
                <label className="block text-xs text-text-muted">Statement Start Date</label>
                <input type="date" value={safeEditData.statementStartDate || ''} onChange={(e) => setEditData(prev => ({ ...prev, statementStartDate: e.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary" />
              </div>
            )}
            {('statementEndDate' in safeEditData || 'statementEndDate' in file) && (
              <div>
                <label className="block text-xs text-text-muted">Statement End Date</label>
                <input type="date" value={safeEditData.statementEndDate || ''} onChange={(e) => setEditData(prev => ({ ...prev, statementEndDate: e.target.value }))} className="w-full h-10 px-3 border border-border rounded-md text-sm disabled:bg-background disabled:text-text-secondary" />
              </div>
            )}
            {('description' in safeEditData || 'description' in file) && (
              <div>
                <label className="block text-xs text-text-muted">Description</label>
                <textarea value={safeEditData.description || ''} onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-sm resize-none disabled:bg-background disabled:text-text-secondary" rows={3} />
              </div>
            )}
          </fieldset>

          <div>
            <label className="block text-xs text-text-muted">Status</label>
            <div className="py-2 inline-flex items-center gap-2">
              {isDeletedFile ? (
                <span className="inline-flex items-center h-6 px-2.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                  Deleted
                </span>
              ) : (
                <StatusBadge status={displayStatus} />
              )}
              {isDeletedFile && <span className="text-xs text-text-muted">Soft deleted file</span>}
            </div>
          </div>
          {displayStatus === 'Approved' && (
            <>
              <div>
                <label className="block text-xs text-text-muted">Approved By</label>
                <div className="py-2 text-sm text-text-primary">{safeEditData.approvedBy || file.approvedBy || '--'}</div>
              </div>
              <div>
                <label className="block text-xs text-text-muted">Approved On</label>
                <div className="py-2 text-sm text-text-primary">{formatTimestamp(safeEditData.approvedAtIso || file.approvedAtIso || '')}</div>
              </div>
              <div>
                <label className="block text-xs text-text-muted">Locked</label>
                <div className="py-2 text-sm text-text-primary">Yes</div>
              </div>
            </>
          )}
          {displayStatus === 'Rejected' && (
            <>
              <div>
                <label className="block text-xs text-text-muted">Rejected By</label>
                <div className="py-2 text-sm text-text-primary">{safeEditData.rejectedBy || file.rejectedBy || '--'}</div>
              </div>
              <div>
                <label className="block text-xs text-text-muted">Rejected On</label>
                <div className="py-2 text-sm text-text-primary">{formatTimestamp(safeEditData.rejectedAtIso || file.rejectedAtIso || '')}</div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-text-muted">Reason</label>
                <div className="py-2 text-sm text-text-primary">{safeEditData.rejectionReason || file.rejectionReason || adminComment || requiredAction || 'No reason provided.'}</div>
              </div>
              <div>
                <label className="block text-xs text-text-muted">Can Be Edited</label>
                <div className="py-2 text-sm text-text-primary">Yes</div>
              </div>
            </>
          )}

          <div className="md:col-span-2 border border-border rounded-md p-3 bg-background">
            <p className="text-xs uppercase tracking-wide text-text-muted mb-2">Upload Information</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-text-muted">Original Upload Date</p>
                <p className="text-text-primary mt-0.5">{formatDate(uploadInfo.originalUploadedAtIso || file.createdAtIso || file.date)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Original Upload Time</p>
                <p className="text-text-primary mt-0.5">{formatTime(uploadInfo.originalUploadedAtIso || file.createdAtIso || file.date)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Uploaded By</p>
                <p className="text-text-primary mt-0.5">{uploadInfo.originalUploadedBy || file.user || '--'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Upload Source</p>
                <p className="text-text-primary mt-0.5">{sourceLabelMap[uploadInfo.originalUploadSource] || uploadInfo.originalUploadSource || '--'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Last Modified</p>
                <p className="text-text-primary mt-0.5">{formatTimestamp(uploadInfo.lastModifiedAtIso || file.updatedAtIso || file.date)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Total Versions</p>
                <p className="text-text-primary mt-0.5">{versions.length}</p>
              </div>
            </div>
          </div>

          {(canResubmit || hasAdminFeedback) && (
            <div className={`md:col-span-2 p-3 rounded-md ${canResubmit ? 'bg-error-bg' : 'bg-background border border-border-light'}`}>
              <label className="block text-xs text-text-muted">Admin Comment</label>
              <div className={`py-2 text-sm ${canResubmit ? 'text-error' : 'text-text-primary'}`}>{adminComment || 'No comment provided.'}</div>
              <label className="block text-xs text-text-muted">Required Action</label>
              <div className={`py-2 text-sm ${canResubmit ? 'text-error' : 'text-text-primary'}`}>{requiredAction || 'No required action provided.'}</div>
              {infoRequestDetails && (
                <>
                  <label className="block text-xs text-text-muted">Info Request Details</label>
                  <div className={`py-2 text-sm ${canResubmit ? 'text-error' : 'text-text-primary'}`}>{infoRequestDetails}</div>
                </>
              )}
              {adminNotes && (
                <>
                  <label className="block text-xs text-text-muted">Admin Notes</label>
                  <div className={`py-2 text-sm ${canResubmit ? 'text-error' : 'text-text-primary'}`}>{adminNotes}</div>
                </>
              )}
            </div>
          )}

          {versions.length > 0 && (
            <div className="md:col-span-2">
              <label className="block text-xs text-text-muted">Version History</label>
              <div className="border border-border rounded-md overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#F9FAFB]">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Version</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Action</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">User</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Time</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.slice().reverse().map((version, idx) => {
                      const snapshot = version.fileSnapshot || {}
                      const previewUrl = normalizeRuntimePreviewUrl(snapshot.previewUrl || version.previewUrl || '', { allowBlob: false })
                      const filename = snapshot.filename || version.filename || file.filename
                      const versionDownloadFileName = buildClientDownloadFilename({
                        businessName: downloadNamePrefix,
                        fileName: filename || 'document',
                      })
                      const versionNumber = version.versionNumber || version.version || idx + 1
                      const canDownloadVersion = !isDeletedFile && Boolean(
                        previewUrl
                        || snapshot.backendDocumentId
                        || version.backendDocumentId
                        || file.backendDocumentId
                      )
                      return (
                        <tr key={`version-row-${versionNumber}-${idx}`} className="border-b border-border-light last:border-b-0">
                          <td className="px-3 py-2 text-sm text-text-primary">
                            <button
                              type="button"
                              onClick={() => setSelectedVersion({
                                ...file,
                                ...snapshot,
                                filename,
                                previewUrl,
                                extension: snapshot.extension || file.extension,
                              })}
                              className="hover:text-primary hover:underline"
                            >
                              v{versionNumber}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-sm text-text-secondary">{version.action || 'Updated'}</td>
                          <td className="px-3 py-2 text-sm text-text-secondary">{version.performedBy || '--'}</td>
                          <td className="px-3 py-2 text-sm text-text-secondary">{formatDate(version.timestamp || version.date)}</td>
                          <td className="px-3 py-2 text-sm text-text-secondary">{formatTime(version.timestamp || version.date)}</td>
                          <td className="px-3 py-2 text-sm">
                            {canDownloadVersion ? (
                              <button
                                type="button"
                                onClick={() => void handleDownloadTarget({
                                  ...file,
                                  ...snapshot,
                                  backendDocumentId: snapshot.backendDocumentId || version.backendDocumentId || file.backendDocumentId || '',
                                  filename,
                                  previewUrl,
                                  extension: snapshot.extension || file.extension,
                                }, versionDownloadFileName)}
                                className="inline-flex h-7 px-2.5 items-center rounded border border-border text-xs text-text-primary hover:bg-background"
                              >
                                Download
                              </button>
                            ) : (
                              <span className="text-xs text-text-muted">Unavailable</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="pt-4 flex items-center gap-2 justify-end">
            {(currentDownloadUrl || safeEditData.backendDocumentId || file.backendDocumentId) ? (
              <button
                type="button"
                onClick={() => void handleDownloadTarget(safeEditData || file, resolvedDownloadFileName)}
                className="h-9 px-4 border border-border rounded-md text-sm text-text-primary hover:bg-background flex items-center justify-center"
              >
                Download
              </button>
            ) : (
              <span className="h-9 px-4 inline-flex items-center rounded-md bg-background text-xs text-text-secondary border border-border">
                Download unavailable
              </span>
            )}
            {!effectiveReadOnly && canResubmit && onResubmit && (
              <>
                <input ref={resubmitInputRef} type="file" className="hidden" onChange={handleResubmitSelection} />
                <button onClick={() => resubmitInputRef.current?.click()} className="h-9 px-4 border border-warning rounded-md text-sm text-warning hover:bg-warning-bg">Resubmit File</button>
              </>
            )}
            {(readOnly || isDeletedFile) ? (
              <span className="h-9 px-4 inline-flex items-center rounded-md bg-background text-xs text-text-secondary border border-border">
                Read-only
              </span>
            ) : (
              <>
                {!isApprovedLocked && (
                  <button onClick={() => { onDelete?.(safeEditData || file) }} className="h-9 px-4 border border-border rounded-md text-sm text-error hover:bg-error-bg">Delete</button>
                )}
                {!isEditing ? (
                  <button
                    onClick={() => {
                      if (isApprovedLocked) {
                        setShowLockedEditNotice(true)
                        return
                      }
                      setIsEditing(true)
                    }}
                    className="h-9 px-4 bg-primary text-white rounded-md text-sm"
                  >
                    Edit
                  </button>
                ) : (
                  <>
                    <button onClick={() => { setEditData(file); setSelectedVersion(null); setIsEditing(false); setIsCustomTagMode(false) }} className="h-9 px-4 border border-border rounded-md text-sm text-text-primary hover:bg-background">Cancel</button>
                    <button onClick={() => { onSave?.(safeEditData); setIsEditing(false); setIsCustomTagMode(false) }} className="h-9 px-4 bg-primary text-white rounded-md text-sm">Save</button>
                  </>
                )}
              </>
            )}
          </div>
          {showLockedEditNotice && (
            <div className="md:col-span-2 fixed inset-0 z-[60] bg-black/35 flex items-center justify-center p-4" onClick={() => setShowLockedEditNotice(false)}>
              <div className="w-full max-w-sm bg-white border border-border rounded-xl shadow-card p-5" onClick={(event) => event.stopPropagation()}>
                <p className="text-sm text-text-primary">This file has been approved and is locked.</p>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => setShowLockedEditNotice(false)} className="h-8 px-3 bg-primary text-white rounded-md text-sm">
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Settings Page

export {
  StatusBadge,
  CategoryTag,
  FileTypeIcon,
  Sidebar,
  TopBar,
  DashboardPage,
  ExpensesPage,
  HomePage,
  SalesPage,
  BankStatementsPage,
  UploadHistoryPage,
  ResolvedDocumentsPage,
  RecentActivitiesPage,
  SupportPage,
  ClientSupportWidget,
  FileViewerModal,
}

