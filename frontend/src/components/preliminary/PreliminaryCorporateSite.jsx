import { useEffect, useMemo, useRef, useState } from 'react'
import { PRELIMINARY_SEO_KEYWORDS_CONTENT } from './preliminarySeoKeywords'
import KiaminaLogo from '../common/KiaminaLogo'
import DotLottiePreloader from '../common/DotLottiePreloader'
import { ClientSupportWidgetExperience } from '../client/support/ClientSupportExperience'
import { apiFetch } from '../../utils/apiClient'
import { registerNewsletterSubscriberLead } from '../../utils/supportCenter'
import {
  ChevronDown,
  Rows3,
  ArrowRight,
  ArrowUp,
  X,
  ShieldCheck,
  Globe2,
  CloudCog,
  FileBarChart2,
  CalendarDays,
  Clock3,
  UserCircle2,
  ArrowLeft,
  MapPin,
  Mail,
  Phone,
  Building2,
  Search,
  TrendingUp,
  Users,
  Award,
  Target,
  Lightbulb,
  CheckCircle2,
  BarChart3,
  PieChart,
  Wallet,
  Calculator,
  FileText,
  CreditCard,
  Landmark,
  Scale,
  Filter,
  SortAsc,
  AlertTriangle,
} from 'lucide-react'

const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'services', label: 'Services' },
  { id: 'insights', label: 'Insights' },
  { id: 'careers', label: 'Careers' },
  { id: 'contact', label: 'Contact' },
]

const REGION_ITEMS = [
  { id: 'nigeria', label: 'Nigeria', flag: '/img/flag-nigeria.svg' },
  { id: 'canada', label: 'Canada', flag: '/img/flag-canada.svg' },
  { id: 'united-states', label: 'United States', flag: '/img/flag-united-states.svg' },
  { id: 'united-kingdom', label: 'United Kingdom', flag: '/img/flag-united-kingdom.svg' },
  { id: 'australia', label: 'Australia', flag: '/img/flag-australia.svg' },
]

const REGION_ID_SET = new Set(REGION_ITEMS.map((item) => item.id))

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const SERVICE_PILLARS = [
  'Bookkeeping',
  'Financial Reporting',
  'Management Reporting',
  'CFO Consulting',
  'Financial Modeling',
  'Payroll Processing',
  'Accounts Payable & Receivable Management',
  'Tax Compliance',
]

const INDUSTRIES = [
  { name: 'Oil & Gas', image: 'https://images.unsplash.com/photo-1513828583688-c52646db42da?w=600', fallback: '/img/industry-oil-gas.svg' },
  { name: 'Technology', image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600', fallback: '/img/industry-technology.svg' },
  { name: 'Healthcare', image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600', fallback: '/img/industry-healthcare.svg' },
  { name: 'Maritime', image: 'https://images.unsplash.com/photo-1494412651409-8963ce7935a7?w=600', fallback: '/img/industry-maritime.svg' },
  { name: 'Real Estate', image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=600', fallback: '/img/industry-real-estate.svg' },
  { name: 'Professional Services', image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600', fallback: '/img/industry-professional-services.svg' },
  { name: 'Nonprofits', image: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=600', fallback: '/img/industry-nonprofits.svg' },
  { name: 'Education', image: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=600', fallback: '/img/industry-education.svg' },
  { name: 'Ecommerce', image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600', fallback: '/img/industry-ecommerce.svg' },
  { name: 'Digital Media', image: 'https://images.unsplash.com/photo-1492725764893-90b379c2b6e7?w=600', fallback: '/img/industry-digital-media.svg' },
  { name: 'Entertainment', image: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=600', fallback: '/img/industry-entertainment.svg' },
]

const SOFTWARE_EXPERTISE = [
  { name: 'QuickBooks', logo: 'https://cdn.simpleicons.org/quickbooks/2CA01C', fallback: '/img/logo-quickbooks.svg' },
  { name: 'Sage', logo: 'https://cdn.simpleicons.org/sage/00D639', fallback: '/img/logo-sage.svg' },
  { name: 'Xero', logo: 'https://cdn.simpleicons.org/xero/13B5EA', fallback: '/img/logo-xero.svg' },
  { name: 'Zoho Books', logo: 'https://cdn.simpleicons.org/zoho/EA4335', fallback: '/img/logo-zoho-books.svg' },
  { name: 'Wave', logo: 'https://cdn.simpleicons.org/waves/0055FF', fallback: '/img/logo-wave.svg' },
  { name: 'Microsoft Dynamics', logo: 'https://cdn.simpleicons.org/microsoftdynamics365/0B53CE', fallback: '/img/logo-microsoft-dynamics.svg' },
  { name: 'NetSuite', logo: 'https://cdn.simpleicons.org/oracle/F80000', fallback: '/img/logo-netsuite.svg' },
  { name: 'Dext', logo: 'https://cdn.simpleicons.org/diaspora/6B4CFF', fallback: '/img/logo-dext.svg' },
]

const HERO_BACKGROUNDS = {
  home: 'https://unsplash.com/photos/Q80LYxv_Tbs/download?force=true&w=2200',
  about: 'https://unsplash.com/photos/VpcgTEKerEQ/download?force=true&w=2200',
  services: 'https://unsplash.com/photos/ftCWdZOFZqo/download?force=true&w=2200',
  insights: 'https://unsplash.com/photos/HG9M8M29Ig4/download?force=true&w=2200',
  careers: 'https://unsplash.com/photos/vzfgh3RAPzM/download?force=true&w=2200',
  contact: 'https://unsplash.com/photos/n95VMLxqM2I/download?force=true&w=2200',
}

const SERVICES = [
  {
    name: 'Bookkeeping',
    icon: FileText,
    image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800',
    summary: 'Policy-aligned transaction management that keeps your ledger accurate and month-end close predictable.',
    deliverables: [
      'Daily transaction posting and coding',
      'Bank and control account reconciliations',
      'Ledger hygiene and chart-of-accounts governance',
    ],
    outcomes: [
      'Reliable records for reporting and audits',
      'Lower reconciliation backlog',
      'Stronger finance team accountability',
    ],
  },
  {
    name: 'Financial Reporting',
    icon: BarChart3,
    image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800',
    summary: 'Executive and statutory reports prepared with audit-ready support and clear compliance posture.',
    deliverables: [
      'Monthly and annual financial statements',
      'Disclosure and notes preparation support',
      'Variance and performance commentary',
    ],
    outcomes: [
      'Higher board and investor confidence',
      'IFRS / GAAP / US GAAP alignment',
      'Improved regulatory readiness',
    ],
  },
  {
    name: 'Management Reporting',
    icon: PieChart,
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800',
    summary: 'Decision-grade management packs with KPI tracking, trend visibility, and leadership-focused narrative.',
    deliverables: [
      'Management dashboard design',
      'Departmental performance scorecards',
      'Monthly executive reporting packs',
    ],
    outcomes: [
      'Faster decision cycles',
      'Better performance governance',
      'Clear ownership across teams',
    ],
  },
  {
    name: 'CFO Consulting',
    icon: Wallet,
    image: 'https://images.unsplash.com/photo-1553484771-371a605b060b?w=800',
    summary: 'Senior finance guidance for founders and leadership teams needing structured strategic financial control.',
    deliverables: [
      'Finance operating model advisory',
      'Policy and internal control architecture',
      'Board and leadership finance advisory',
    ],
    outcomes: [
      'Stronger governance maturity',
      'Structured scalability for growth',
      'Reduced strategic finance risk',
    ],
  },
  {
    name: 'Financial Modeling',
    icon: Calculator,
    image: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800',
    summary: 'Scenario-based financial models for funding, pricing, budgeting, and expansion decisions.',
    deliverables: [
      'Three-statement integrated models',
      'Sensitivity and scenario analysis',
      'Investment and growth option modeling',
    ],
    outcomes: [
      'Clear view of risk and return',
      'Investor-ready planning outputs',
      'More disciplined capital allocation',
    ],
  },
  {
    name: 'Payroll Processing',
    icon: CreditCard,
    image: 'https://images.unsplash.com/photo-1554224154-22dec7ec8818?w=800',
    summary: 'Accurate payroll execution with statutory deductions and remittance control.',
    deliverables: [
      'Payroll cycle processing and checks',
      'Statutory deduction and remittance schedules',
      'Payroll journals and reconciliation outputs',
    ],
    outcomes: [
      'Reduced payroll errors',
      'Improved employee trust',
      'Consistent compliance posture',
    ],
  },
  {
    name: 'Accounts Payable & Receivable Management',
    icon: Landmark,
    image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800',
    summary: 'Working-capital discipline through structured payables and receivables operations.',
    deliverables: [
      'Payables workflow and payment governance',
      'Receivables aging and follow-up cadence',
      'Cash conversion monitoring dashboards',
    ],
    outcomes: [
      'Improved liquidity stability',
      'Lower overdue exposure',
      'Predictable cash planning',
    ],
  },
  {
    name: 'Tax Compliance',
    icon: Scale,
    image: 'https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=800',
    summary: 'End-to-end tax compliance execution to reduce penalties and improve regulatory confidence.',
    deliverables: [
      'Tax calendar ownership and filing support',
      'Tax computation and documentation',
      'Regulatory query and audit response support',
    ],
    outcomes: [
      'Lower non-compliance risk',
      'Fewer penalties and disruptions',
      'Stronger compliance governance',
    ],
  },
]

const INSIGHTS = [
  {
    slug: 'payroll-made-simple-for-smes-and-nonprofits',
    title: 'Payroll Made Simple: A Step-by-Step Guide for SMEs and Nonprofits',
    excerpt: 'A practical control model for payroll governance: role segregation, payroll cut-off discipline, statutory checks, and post-run review.',
    body: [
      'Most payroll errors come from weak process ownership, not weak software. The fastest path to payroll stability is to establish role ownership across HR, finance, and approvals.',
      'High-performing SMEs use a recurring payroll calendar with locked cut-off dates, a pre-run validation checklist, and post-run variance analysis. This ensures compliance and protects employee trust.',
      'For nonprofits, payroll governance must also map to grant rules and restricted-fund requirements. Combining payroll controls with fund accountability avoids reporting misstatements.',
    ],
    author: 'Kiamina Advisory Team',
    category: 'Payroll Governance',
    readTime: '7 min read',
    publishedAt: '2026-03-02T09:00:00+01:00',
    cover: 'https://unsplash.com/photos/HG9M8M29Ig4/download?force=true&w=1200',
  },
  {
    slug: 'five-costly-accounting-mistakes-smes-make',
    title: '5 Costly Accounting Mistakes SMEs Make',
    excerpt: 'Common breakdowns include weak reconciliations, delayed reporting cycles, poor evidence trails, and fragmented accounting systems.',
    body: [
      'SMEs often under-invest in chart-of-accounts structure, which creates reporting noise and weak monthly close quality.',
      'Delayed reconciliations and incomplete support schedules raise audit risk and distort management decisions. Regular close discipline is non-negotiable.',
      'Teams that combine policy documentation, system controls, and KPI-based management reporting build faster investor and lender confidence.',
    ],
    author: 'Kiamina Accounting Services',
    category: 'SME Accounting Controls',
    readTime: '6 min read',
    publishedAt: '2026-03-02T11:30:00+01:00',
    cover: 'https://unsplash.com/photos/glRqyWJgUeY/download?force=true&w=1200',
  },
  {
    slug: 'critical-fund-reporting-mistakes-nonprofits-must-avoid',
    title: '5 Critical Fund Reporting Mistakes Nonprofits Must Avoid',
    excerpt: 'Restricted-fund tracking gaps, weak donor-condition mapping, and poor documentation can materially damage trust and compliance posture.',
    body: [
      'Nonprofits lose reporting credibility when restricted and unrestricted funds are not strictly segmented in their chart and reporting packs.',
      'Donor-condition mapping must be documented at intake and tracked through disbursement. Missing this step increases compliance risk and weakens board oversight.',
      'A monthly fund reconciliation and grant utilization report provides transparency for trustees, donors, and regulators.',
    ],
    author: 'Kiamina Nonprofit Advisory Desk',
    category: 'Nonprofit Reporting',
    readTime: '8 min read',
    publishedAt: '2026-03-02T14:15:00+01:00',
    cover: 'https://unsplash.com/photos/L85a1k-XqH8/download?force=true&w=1200',
  },
]

const TRUST_INDICATORS = [
  {
    id: 'cloud',
    title: 'Cloud-Enabled Systems',
    detail: 'Real-time collaboration, audit trails, and secure access controls.',
    metric: '24/7',
    metricLabel: 'Operational visibility',
    Icon: CloudCog,
  },
  {
    id: 'standards',
    title: 'IFRS / GAAP Alignment',
    detail: 'Reporting frameworks structured for compliance-grade decision support.',
    metric: '3',
    metricLabel: 'Major standards covered',
    Icon: FileBarChart2,
  },
  {
    id: 'cross-border',
    title: 'Cross-Border Compliance Expertise',
    detail: 'Consistent advisory delivery across 5 strategic regions.',
    metric: '5',
    metricLabel: 'Global operating regions',
    Icon: Globe2,
  },
  {
    id: 'controls',
    title: 'Structured Financial Controls',
    detail: 'Policy-backed workflows designed to reduce risk and improve accuracy.',
    metric: '99%',
    metricLabel: 'Reporting discipline target',
    Icon: ShieldCheck,
  },
]

const REVEAL_HIDDEN_CLASS = 'opacity-0 translate-y-5'
const REVEAL_VISIBLE_CLASS = 'opacity-100 translate-y-0'

function Reveal({ children, className = '', delayMs = 0 }) {
  const elementRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const node = elementRef.current
    if (!node) return undefined

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.16 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={elementRef}
      className={`transition-all duration-700 ease-out ${isVisible ? REVEAL_VISIBLE_CLASS : REVEAL_HIDDEN_CLASS} ${className}`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  )
}

function SectionShell({ children, tint = false }) {
  return (
    <section className={`py-20 ${tint ? 'bg-[#eef3ff]' : 'bg-white'}`}>
      <div className="mx-auto w-[min(1160px,92vw)]">
        {children}
      </div>
    </section>
  )
}

function SurfaceCard({ children, className = '' }) {
  return (
    <article className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_26px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_34px_rgba(15,23,42,0.09)] ${className}`}>
      {children}
    </article>
  )
}

function PreliminaryPageLoadingShell() {
  return (
    <section className="bg-white">
      <div className="mx-auto w-[min(1160px,92vw)] py-12 sm:py-16">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_16px_32px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="flex items-center justify-center">
            <DotLottiePreloader
              size={72}
              label="Loading page..."
              labelClassName="text-base font-semibold text-[#153585]"
            />
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4 animate-pulse">
            {Array.from({ length: 8 }).map((_, index) => (
              <article key={`preliminary-skeleton-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="h-28 w-full rounded-xl bg-slate-200" />
                <div className="mt-4 h-4 w-24 rounded bg-slate-200" />
                <div className="mt-3 h-6 w-3/4 rounded bg-slate-200" />
                <div className="mt-2 h-4 w-5/6 rounded bg-slate-200" />
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function BrandImage({ src, alt, className = '', fallbackSrc = '' }) {
  const [hasError, setHasError] = useState(false)
  const [didFallback, setDidFallback] = useState(false)
  const [activeSrc, setActiveSrc] = useState(src)

  useEffect(() => {
    setHasError(false)
    setDidFallback(false)
    setActiveSrc(src)
  }, [src])

  if (hasError) {
    return (
      <div className={`grid place-items-center rounded-xl border border-dashed border-[#153585]/35 bg-[linear-gradient(140deg,#e8efff,#f5f8ff)] text-center text-sm font-semibold text-[#153585] ${className}`}>
        Image Placeholder
      </div>
    )
  }

  return (
    <img
      src={activeSrc}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (fallbackSrc && !didFallback) {
          setDidFallback(true)
          setActiveSrc(fallbackSrc)
          return
        }
        setHasError(true)
      }}
      className={`rounded-xl object-cover ${className}`}
    />
  )
}

function CountUpMetric({ value = '', className = '' }) {
  const metricText = String(value || '').trim()
  const parsedMetric = useMemo(() => {
    const match = metricText.match(/^(\d+)(.*)$/)
    if (!match) return null
    return {
      target: Number(match[1]),
      suffix: match[2] || '',
    }
  }, [metricText])

  const [displayNumber, setDisplayNumber] = useState(0)
  const [hasStarted, setHasStarted] = useState(false)
  const metricRef = useRef(null)

  useEffect(() => {
    setDisplayNumber(0)
    setHasStarted(false)
  }, [metricText])

  useEffect(() => {
    if (!parsedMetric) return undefined
    const node = metricRef.current
    if (!node) return undefined

    if (!('IntersectionObserver' in window)) {
      setHasStarted(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setHasStarted(true)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.35 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [parsedMetric])

  useEffect(() => {
    if (!parsedMetric || !hasStarted) return undefined
    let rafId = 0
    const durationMs = 1200
    const startAt = performance.now()

    const tick = (now) => {
      const progress = Math.min((now - startAt) / durationMs, 1)
      const currentValue = Math.round(parsedMetric.target * progress)
      setDisplayNumber(currentValue)
      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick)
      }
    }

    rafId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(rafId)
  }, [hasStarted, parsedMetric])

  if (!parsedMetric) {
    return <span className={className}>{metricText}</span>
  }

  return (
    <span ref={metricRef} className={className}>
      {displayNumber}
      {parsedMetric.suffix}
    </span>
  )
}

function HeroPanel({ pageKey, scrollY = 0, children }) {
  const heroImage = HERO_BACKGROUNDS[pageKey] || HERO_BACKGROUNDS.home
  const parallaxOffset = Math.max(-90, Math.min(90, Math.round(scrollY * -0.08)))
  return (
    <section
      className="relative overflow-hidden bg-cover bg-center py-20 lg:py-24"
      style={{
        backgroundImage: `linear-gradient(125deg, rgba(8, 28, 79, 0.78), rgba(21, 53, 133, 0.62)), url('${heroImage}')`,
        backgroundPosition: `center ${parallaxOffset}px`,
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_45%)]" />
      <div className="relative z-10 mx-auto w-[min(1160px,92vw)]">
        {children}
      </div>
    </section>
  )
}

const inferRegionFromClientSignals = () => {
  if (typeof window === 'undefined') return 'nigeria'

  const timeZone = String(Intl.DateTimeFormat().resolvedOptions().timeZone || '').toLowerCase()
  if (timeZone.includes('lagos')) return 'nigeria'
  if (timeZone.includes('toronto') || timeZone.includes('vancouver') || timeZone.includes('canada')) return 'canada'
  if (timeZone.includes('new_york') || timeZone.includes('chicago') || timeZone.includes('los_angeles') || timeZone.includes('denver')) return 'united-states'
  if (timeZone.includes('london')) return 'united-kingdom'
  if (timeZone.includes('sydney') || timeZone.includes('melbourne') || timeZone.includes('brisbane') || timeZone.includes('australia')) return 'australia'

  const locale = String(navigator.language || '').toLowerCase()
  if (locale.endsWith('-ng')) return 'nigeria'
  if (locale.endsWith('-ca')) return 'canada'
  if (locale.endsWith('-us')) return 'united-states'
  if (locale.endsWith('-gb') || locale.endsWith('-uk')) return 'united-kingdom'
  if (locale.endsWith('-au')) return 'australia'
  return 'nigeria'
}

const toInsightBodyParagraphs = (value = '') => (
  String(value || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
)

const toInsightCategoryLabel = (value = '') => (
  String(value || '')
    .trim()
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ')
)

const normalizeInsightArticle = (source = {}, index = 0) => {
  const rawTitle = String(source.title || '').trim()
  if (!rawTitle) return null

  const body = Array.isArray(source.body)
    ? source.body.map((item) => String(item || '').trim()).filter(Boolean)
    : toInsightBodyParagraphs(source.content)
  const fallbackParagraph = String(source.summary || source.excerpt || '').trim()
  const normalizedBody = body.length > 0
    ? body
    : [fallbackParagraph || 'Insight content will be published shortly.']
  const summary = String(source.excerpt || source.summary || normalizedBody[0] || '').trim()
  const readTimeMinutes = Number(source.readTimeMinutes)
  const readTime = Number.isFinite(readTimeMinutes) && readTimeMinutes > 0
    ? `${Math.round(readTimeMinutes)} min read`
    : String(source.readTime || '').trim() || '6 min read'
  const category = toInsightCategoryLabel(source.category) || 'Financial Strategy'
  const slugSource = String(source.slug || source.articleId || rawTitle || `insight-${index + 1}`).trim()
  const slug = slugSource.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  return {
    slug: slug || `insight-${index + 1}`,
    title: rawTitle,
    excerpt: summary,
    body: normalizedBody,
    author: String(source.author || source.createdByUid || 'Kiamina Advisory Team').trim(),
    category,
    readTime,
    publishedAt: source.publishedAt || source.updatedAt || source.createdAt || new Date().toISOString(),
    cover: String(source.cover || source.coverImageUrl || source.image || '').trim()
      || 'https://unsplash.com/photos/HG9M8M29Ig4/download?force=true&w=1200',
  }
}

const generateWebsiteAnalyticsSessionId = () => (
  `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
)

const CONTACT_INITIAL_STATE = {
  name: '',
  email: '',
  country: '',
  service: '',
  message: '',
}

const CONTACT_MAP_EMBED_SRC = 'https://www.google.com/maps?q=10+Akpunonu+Street,+Port+Harcourt,+Rivers+State,+Nigeria,+500102&output=embed'
const CALENDAR_BOOKING_URL = 'https://calendar.app.google/VwUuE8XD1MHBRwy87'
const INSIGHTS_PER_PAGE_OPTIONS = [10, 20, 50, 100]
const WEBSITE_ANALYTICS_SESSION_STORAGE_KEY = 'kiaminaWebsiteAnalyticsSessionId'

const ABOUT_PROCESS_STEPS = [
  {
    id: 'discovery',
    step: '01',
    title: 'Discovery & Assessment',
    detail: 'We assess accounting quality, control gaps, and compliance exposure across reporting and tax operations.',
    Icon: Search,
  },
  {
    id: 'setup',
    step: '02',
    title: 'System Setup or Cleanup',
    detail: 'We design and implement clean structures, policy controls, and close-cycle discipline for reliable books.',
    Icon: FileBarChart2,
  },
  {
    id: 'support',
    step: '03',
    title: 'Ongoing Accounting, Tax & Advisory Support',
    detail: 'We run continuous execution with executive reporting cadence and proactive strategic finance guidance.',
    Icon: TrendingUp,
  },
]

const ABOUT_TRACK_RECORD = [
  { metric: '200+', label: 'Organizations Served', Icon: Building2 },
  { metric: '5', label: 'Global Regions', Icon: Globe2 },
  { metric: '15+', label: 'Years Combined Experience', Icon: Clock3 },
  { metric: '99%', label: 'Client Retention Rate', Icon: Award },
]

function PreliminaryCorporateSite({
  activePage = 'home',
  onNavigatePage,
  onGetStarted,
  onLogin,
  onOpenAdminPortal,
  onOpenOwnerSetup,
  isAuthenticated = false,
  onOpenDashboard,
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [regionsOpen, setRegionsOpen] = useState(false)
  const [selectedRegionId, setSelectedRegionId] = useState('nigeria')
  const [isRegionResolved, setIsRegionResolved] = useState(false)
  const [isHeaderCompact, setIsHeaderCompact] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [contactForm, setContactForm] = useState(CONTACT_INITIAL_STATE)
  const [contactErrors, setContactErrors] = useState({})
  const [contactSubmitted, setContactSubmitted] = useState(false)
  const [insightArticles, setInsightArticles] = useState(INSIGHTS)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [activeInsightSlug, setActiveInsightSlug] = useState('')
  const [insightSearch, setInsightSearch] = useState('')
  const [insightCategory, setInsightCategory] = useState('All Categories')
  const [insightSort, setInsightSort] = useState('newest')
  const [insightPage, setInsightPage] = useState(1)
  const [insightsPerPage, setInsightsPerPage] = useState(10)
  const [isPreliminaryPageLoading, setIsPreliminaryPageLoading] = useState(true)
  const [newsletterLeadForm, setNewsletterLeadForm] = useState({
    fullName: '',
    email: '',
    serviceFocus: 'Business Insights & Financial Strategy',
  })
  const [newsletterErrors, setNewsletterErrors] = useState({})
  const [newsletterSubmitted, setNewsletterSubmitted] = useState(false)

  const regionsRef = useRef(null)
  const analyticsSessionIdRef = useRef('')
  const pageLoadingFrameRef = useRef(0)

  useEffect(() => {
    setMobileOpen(false)
    setRegionsOpen(false)
  }, [activePage])

  useEffect(() => {
    if (activePage !== 'insights') {
      setActiveInsightSlug('')
    }
  }, [activePage])

  useEffect(() => {
    const handleScroll = () => {
      setIsHeaderCompact(window.scrollY > 16)
      setScrollY(window.scrollY || 0)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!regionsRef.current) return
      if (!regionsRef.current.contains(event.target)) {
        setRegionsOpen(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const ensureMeta = (name) => {
      const selector = `meta[name="${name}"]`
      let element = document.querySelector(selector)
      if (!element) {
        element = document.createElement('meta')
        element.setAttribute('name', name)
        document.head.appendChild(element)
      }
      return element
    }

    ensureMeta('keywords').setAttribute('content', PRELIMINARY_SEO_KEYWORDS_CONTENT)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedSessionId = String(window.sessionStorage.getItem(WEBSITE_ANALYTICS_SESSION_STORAGE_KEY) || '').trim()
    const nextSessionId = storedSessionId || generateWebsiteAnalyticsSessionId()
    if (!storedSessionId) {
      window.sessionStorage.setItem(WEBSITE_ANALYTICS_SESSION_STORAGE_KEY, nextSessionId)
    }
    analyticsSessionIdRef.current = nextSessionId
  }, [])

  useEffect(() => {
    let isCancelled = false

    const applyRegion = (regionId) => {
      if (isCancelled) return
      const normalizedRegionId = REGION_ID_SET.has(regionId) ? regionId : 'nigeria'
      const matchedRegion = REGION_ITEMS.find((item) => item.id === normalizedRegionId) || REGION_ITEMS[0]
      setSelectedRegionId(matchedRegion.id)
      setContactForm((prev) => (
        prev.country
          ? prev
          : { ...prev, country: matchedRegion.label }
      ))
      setIsRegionResolved(true)
    }

    // Avoid direct browser-side geolocation calls that are frequently blocked by
    // third-party CORS and rate limits in local development.
    applyRegion(inferRegionFromClientSignals())
    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    const loadInsightsFromBackend = async () => {
      setInsightsLoading(true)
      try {
        const response = await apiFetch('/notifications/insights/articles?status=published&visibility=public&limit=100')
        if (!response.ok) return
        const payload = await response.json().catch(() => [])
        const sourceItems = Array.isArray(payload)
          ? payload
          : (Array.isArray(payload?.items) ? payload.items : [])
        const normalizedItems = sourceItems
          .map((item, index) => normalizeInsightArticle(item, index))
          .filter(Boolean)
        if (!isCancelled && normalizedItems.length > 0) {
          setInsightArticles(normalizedItems)
        }
      } catch {
        // Keep fallback in-memory insights when API is unavailable.
      } finally {
        if (!isCancelled) setInsightsLoading(false)
      }
    }

    void loadInsightsFromBackend()
    return () => {
      isCancelled = true
    }
  }, [])

  const resolvedPage = useMemo(
    () => (NAV_ITEMS.some((item) => item.id === activePage) ? activePage : 'home'),
    [activePage],
  )
  const selectedRegion = useMemo(
    () => REGION_ITEMS.find((item) => item.id === selectedRegionId) || REGION_ITEMS[0],
    [selectedRegionId],
  )
  const insightCategories = useMemo(() => {
    const dynamicCategories = [
      ...new Set(
        insightArticles
          .map((item) => String(item.category || '').trim())
          .filter(Boolean),
      ),
    ]
    return ['All Categories', ...dynamicCategories]
  }, [insightArticles])
  useEffect(() => {
    if (insightCategory === 'All Categories') return
    if (!insightCategories.includes(insightCategory)) {
      setInsightCategory('All Categories')
    }
  }, [insightCategory, insightCategories])
  const activeInsight = useMemo(
    () => insightArticles.find((item) => item.slug === activeInsightSlug) || null,
    [activeInsightSlug, insightArticles],
  )
  const filteredInsights = useMemo(() => {
    let result = [...insightArticles]

    if (insightSearch.trim()) {
      const searchLower = insightSearch.toLowerCase()
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(searchLower) ||
          item.excerpt.toLowerCase().includes(searchLower) ||
          item.category.toLowerCase().includes(searchLower) ||
          item.body.some((paragraph) => paragraph.toLowerCase().includes(searchLower)),
      )
    }

    if (insightCategory && insightCategory !== 'All Categories') {
      result = result.filter((item) => item.category === insightCategory)
    }

    result.sort((a, b) => {
      const dateA = new Date(a.publishedAt)
      const dateB = new Date(b.publishedAt)
      return insightSort === 'newest' ? dateB - dateA : dateA - dateB
    })

    return result
  }, [insightArticles, insightSearch, insightCategory, insightSort])
  const totalInsightPages = useMemo(
    () => Math.max(1, Math.ceil(filteredInsights.length / insightsPerPage)),
    [filteredInsights.length, insightsPerPage],
  )
  const paginatedInsights = useMemo(() => {
    const startIndex = (insightPage - 1) * insightsPerPage
    return filteredInsights.slice(startIndex, startIndex + insightsPerPage)
  }, [filteredInsights, insightPage, insightsPerPage])
  useEffect(() => {
    setInsightPage(1)
  }, [insightSearch, insightCategory, insightSort, insightsPerPage])
  useEffect(() => {
    if (insightPage > totalInsightPages) {
      setInsightPage(totalInsightPages)
    }
  }, [insightPage, totalInsightPages])

  const ensureAnalyticsSessionId = () => {
    if (analyticsSessionIdRef.current) return analyticsSessionIdRef.current
    if (typeof window === 'undefined') return ''
    const storedSessionId = String(window.sessionStorage.getItem(WEBSITE_ANALYTICS_SESSION_STORAGE_KEY) || '').trim()
    const nextSessionId = storedSessionId || generateWebsiteAnalyticsSessionId()
    if (!storedSessionId) {
      window.sessionStorage.setItem(WEBSITE_ANALYTICS_SESSION_STORAGE_KEY, nextSessionId)
    }
    analyticsSessionIdRef.current = nextSessionId
    return nextSessionId
  }

  const trackWebsiteEvent = ({
    eventType = '',
    page = resolvedPage,
    targetType = '',
    targetId = '',
    targetLabel = '',
    metadata = {},
  } = {}) => {
    if (!eventType) return
    const sessionId = ensureAnalyticsSessionId()
    if (!sessionId) return
    const payload = {
      sessionId,
      eventType,
      page,
      targetType,
      targetId,
      targetLabel,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    }
    void apiFetch('/notifications/insights/analytics/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  }

  useEffect(() => {
    trackWebsiteEvent({
      eventType: 'page_view',
      page: resolvedPage,
      targetType: 'page',
      targetId: resolvedPage,
      targetLabel: resolvedPage,
    })
  }, [resolvedPage])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const sessionId = ensureAnalyticsSessionId()
    if (!sessionId) return
    const visitMarkerKey = `kiaminaWebsiteVisitTracked:${sessionId}`
    const alreadyTracked = window.sessionStorage.getItem(visitMarkerKey)
    if (alreadyTracked) return
    window.sessionStorage.setItem(visitMarkerKey, '1')
    trackWebsiteEvent({
      eventType: 'site_visit',
      page: resolvedPage,
      targetType: 'session',
      targetId: sessionId,
      targetLabel: 'Website Visit',
      metadata: {
        referrer: String(document.referrer || '').slice(0, 300),
      },
    })
  }, [])

  useEffect(() => {
    setIsPreliminaryPageLoading(true)
    if (typeof window === 'undefined') {
      setIsPreliminaryPageLoading(false)
      return
    }

    if (pageLoadingFrameRef.current) {
      window.cancelAnimationFrame(pageLoadingFrameRef.current)
    }

    pageLoadingFrameRef.current = window.requestAnimationFrame(() => {
      pageLoadingFrameRef.current = 0
      setIsPreliminaryPageLoading(false)
    })
  }, [resolvedPage])

  useEffect(() => () => {
    if (typeof window !== 'undefined' && pageLoadingFrameRef.current) {
      window.cancelAnimationFrame(pageLoadingFrameRef.current)
    }
  }, [])

  const handleNavigate = (nextPage) => {
    const normalizedNextPage = NAV_ITEMS.some((item) => item.id === nextPage) ? nextPage : 'home'
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    if (normalizedNextPage === resolvedPage) {
      return
    }

    setIsPreliminaryPageLoading(true)
    trackWebsiteEvent({
      eventType: 'nav_click',
      page: resolvedPage,
      targetType: 'navigation',
      targetId: normalizedNextPage,
      targetLabel: `Navigate to ${normalizedNextPage}`,
    })
    if (typeof onNavigatePage === 'function') {
      onNavigatePage(normalizedNextPage)
    }
  }

  const clearContactError = (fieldName) => {
    setContactErrors((prev) => {
      if (!prev[fieldName]) return prev
      const next = { ...prev }
      delete next[fieldName]
      return next
    })
  }

  const validateContactForm = (source = contactForm) => {
    const errors = {}
    if (String(source.name || '').trim().length < 2) {
      errors.name = 'Please enter your full name.'
    }
    if (!EMAIL_REGEX.test(String(source.email || '').trim())) {
      errors.email = 'Enter a valid email address.'
    }
    if (!String(source.country || '').trim()) {
      errors.country = 'Please select your country.'
    }
    if (String(source.service || '').trim().length < 3) {
      errors.service = 'Tell us the service you need.'
    }
    if (String(source.message || '').trim().length < 20) {
      errors.message = 'Message should be at least 20 characters.'
    }
    return errors
  }

  const submitContact = (event) => {
    event.preventDefault()
    const nextErrors = validateContactForm(contactForm)
    setContactErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setContactSubmitted(false)
      return
    }
    setContactSubmitted(true)
    trackWebsiteEvent({
      eventType: 'contact_submit',
      page: 'contact',
      targetType: 'form',
      targetId: 'contact-form',
      targetLabel: 'Contact Form Submission',
      metadata: {
        country: contactForm.country,
        service: contactForm.service,
      },
    })
    setContactForm({
      ...CONTACT_INITIAL_STATE,
      country: selectedRegion.label,
    })
  }
  const openInsightArticle = (slug) => {
    const selectedInsight = filteredInsights.find((item) => item.slug === slug)
    trackWebsiteEvent({
      eventType: 'article_open',
      page: 'insights',
      targetType: 'article',
      targetId: slug,
      targetLabel: selectedInsight?.title || slug,
      metadata: {
        category: selectedInsight?.category || '',
      },
    })
    setActiveInsightSlug(slug)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeInsightArticle = () => {
    setActiveInsightSlug('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const clearNewsletterError = (fieldName) => {
    setNewsletterErrors((prev) => {
      if (!prev[fieldName]) return prev
      const next = { ...prev }
      delete next[fieldName]
      return next
    })
  }

  const validateNewsletterForm = (source = newsletterLeadForm) => {
    const errors = {}
    if (String(source.fullName || '').trim().length < 2) {
      errors.fullName = 'Please enter your full name.'
    }
    if (!EMAIL_REGEX.test(String(source.email || '').trim())) {
      errors.email = 'Enter a valid email address.'
    }
    if (!String(source.serviceFocus || '').trim()) {
      errors.serviceFocus = 'Please choose one update topic.'
    }
    return errors
  }

  const submitNewsletterLead = async (event) => {
    event.preventDefault()
    const nextErrors = validateNewsletterForm(newsletterLeadForm)
    setNewsletterErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setNewsletterSubmitted(false)
      return
    }
    const registration = await registerNewsletterSubscriberLead({
      contactEmail: newsletterLeadForm.email,
      fullName: newsletterLeadForm.fullName,
      serviceFocus: newsletterLeadForm.serviceFocus,
      capturePage: resolvedPage,
      capturePath: window.location.pathname,
    })
    if (!registration.ok) {
      setNewsletterSubmitted(false)
      setNewsletterErrors({ email: registration.message || 'Unable to subscribe right now.' })
      return
    }
    setNewsletterSubmitted(true)
    trackWebsiteEvent({
      eventType: 'newsletter_subscribe',
      page: resolvedPage,
      targetType: 'form',
      targetId: 'newsletter-form',
      targetLabel: 'Newsletter Subscription',
      metadata: {
        serviceFocus: newsletterLeadForm.serviceFocus,
      },
    })
    setNewsletterLeadForm({
      fullName: '',
      email: '',
      serviceFocus: 'Business Insights & Financial Strategy',
    })
  }

  const handleEngageService = ({
    eventType = 'cta_click',
    sourcePage = resolvedPage,
    targetType = 'cta',
    sourceId = '',
    sourceLabel = 'Get Started',
  } = {}) => {
    trackWebsiteEvent({
      eventType,
      page: sourcePage,
      targetType,
      targetId: sourceId || 'get-started',
      targetLabel: sourceLabel,
    })
    if (typeof onGetStarted === 'function') {
      onGetStarted()
      return
    }
    handleNavigate('contact')
  }

  const primaryButtonClass = 'inline-flex items-center justify-center rounded-full bg-[#153585] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(21,53,133,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1f4aa8] hover:shadow-[0_18px_36px_rgba(21,53,133,0.3)]'
  const secondaryButtonClass = 'inline-flex items-center justify-center rounded-full border border-[#153585]/25 bg-white px-6 py-3 text-sm font-semibold text-[#153585] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#153585]/45 hover:shadow-[0_10px_18px_rgba(21,53,133,0.12)]'
  const formatPublishedDate = (value) => {
    if (!value) return ''
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ''
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(parsed)
  }

  const renderNewsletterSection = () => (
    <section className="border-t border-slate-200 bg-[linear-gradient(165deg,#f4f8ff,#ffffff)] py-16 md:py-20">
      <div className="mx-auto w-[min(980px,92vw)]">
        <Reveal className="rounded-[28px] border border-[#153585]/15 bg-white p-8 text-center shadow-[0_18px_32px_rgba(15,23,42,0.08)] md:p-12">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">Newsletter & Lead Capture</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#111827] md:text-4xl">Subscribe for Executive Finance Insights</h2>
          <p className="mx-auto mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            Get updates on accounting, compliance, tax, and advisory topics. Tell us the service area you want to hear about.
          </p>
          <form onSubmit={submitNewsletterLead} className="mx-auto mt-8 grid max-w-3xl gap-4 rounded-2xl border border-[#153585]/15 bg-[#f7f9ff] p-4 text-left md:grid-cols-3 md:p-6">
            <label className="text-sm font-semibold text-slate-700">
              Full Name
              <input
                value={newsletterLeadForm.fullName}
                onChange={(event) => {
                  setNewsletterSubmitted(false)
                  clearNewsletterError('fullName')
                  setNewsletterLeadForm((prev) => ({ ...prev, fullName: event.target.value }))
                }}
                className={`mt-1.5 w-full rounded-xl border px-4 py-2.5 outline-none transition focus:ring-2 ${
                  newsletterErrors.fullName
                    ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                    : 'border-slate-300 focus:border-[#153585]/50 focus:ring-[#153585]/20'
                }`}
                required
                aria-invalid={Boolean(newsletterErrors.fullName)}
              />
              {newsletterErrors.fullName && <p className="mt-1 text-xs font-medium text-red-600">{newsletterErrors.fullName}</p>}
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Email
              <input
                type="email"
                value={newsletterLeadForm.email}
                onChange={(event) => {
                  setNewsletterSubmitted(false)
                  clearNewsletterError('email')
                  setNewsletterLeadForm((prev) => ({ ...prev, email: event.target.value }))
                }}
                className={`mt-1.5 w-full rounded-xl border px-4 py-2.5 outline-none transition focus:ring-2 ${
                  newsletterErrors.email
                    ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                    : 'border-slate-300 focus:border-[#153585]/50 focus:ring-[#153585]/20'
                }`}
                required
                aria-invalid={Boolean(newsletterErrors.email)}
              />
              {newsletterErrors.email && <p className="mt-1 text-xs font-medium text-red-600">{newsletterErrors.email}</p>}
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Topics You'd Like to Receive
              <select
                value={newsletterLeadForm.serviceFocus}
                onChange={(event) => {
                  setNewsletterSubmitted(false)
                  clearNewsletterError('serviceFocus')
                  setNewsletterLeadForm((prev) => ({ ...prev, serviceFocus: event.target.value }))
                }}
                className={`mt-1.5 w-full rounded-xl border bg-white px-4 py-2.5 outline-none transition focus:ring-2 ${
                  newsletterErrors.serviceFocus
                    ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                    : 'border-slate-300 focus:border-[#153585]/50 focus:ring-[#153585]/20'
                }`}
                aria-invalid={Boolean(newsletterErrors.serviceFocus)}
              >
                <option value="Business Insights & Financial Strategy">Business Insights & Financial Strategy</option>
                <option value="Tax Updates & Compliance Alerts">Tax Updates & Compliance Alerts</option>
                <option value="Accounting & Reporting Best Practices">Accounting & Reporting Best Practices</option>
                <option value="Payroll & Workforce Compliance">Payroll & Workforce Compliance</option>
                <option value="CFO Advisory & Growth Planning">CFO Advisory & Growth Planning</option>
              </select>
              {newsletterErrors.serviceFocus && <p className="mt-1 text-xs font-medium text-red-600">{newsletterErrors.serviceFocus}</p>}
            </label>
            <div className="md:col-span-3">
              <button type="submit" className={`${primaryButtonClass} w-full md:w-auto`}>Subscribe</button>
              {newsletterSubmitted && (
                <p className="mt-3 text-xs font-semibold text-green-700">Subscription received. Our advisory team will keep you updated.</p>
              )}
            </div>
          </form>
        </Reveal>
      </div>
    </section>
  )

  const renderHomePage = () => (
    <>
      <HeroPanel pageKey="home" scrollY={scrollY}>
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.95fr]">
          <Reveal className="space-y-6 text-center lg:text-left">
            <span className="mx-auto inline-flex rounded-full border border-white/35 bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white lg:mx-0">Trusted Global Accounting Advisory Partner</span>
            <h1 className="text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Financial Reporting, Financial Advisory, & Tax Compliance Services in Port Harcourt, Nigeria

            </h1>
            <p className="mx-auto max-w-3xl text-lg text-blue-50 lg:mx-0">
              Serving Businesses and Not-for-Profit Organizations Across Nigeria, Canada, United States, United Kingdom, and Australia.
            </p>
            <p className="mx-auto max-w-3xl text-blue-100/95 lg:mx-0">
              Kiamina Accounting Services delivers structured accounting, bookkeeping, tax compliance, payroll, and financial advisory support using cloud-enabled systems with IFRS, GAAP, and US GAAP alignment for cross-border operations.
            </p>
            <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
              <button
                type="button"
                onClick={() => handleEngageService({
                  sourcePage: 'home',
                  sourceId: 'hero-get-started',
                  sourceLabel: 'Hero Get Started',
                })}
                className={primaryButtonClass}
              >
                Get Started
              </button>
              <a
                href={CALENDAR_BOOKING_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackWebsiteEvent({
                  eventType: 'cta_click',
                  page: 'home',
                  targetType: 'cta',
                  targetId: 'hero-schedule-call',
                  targetLabel: 'Hero Schedule a Call',
                })}
                className="inline-flex items-center justify-center rounded-full border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/20"
              >
                Schedule a Call
              </a>
            </div>
          </Reveal>
          <Reveal delayMs={120}>
            <SurfaceCard className="border-white/20 bg-white/95 backdrop-blur">
              <BrandImage
                src="https://unsplash.com/photos/Q80LYxv_Tbs/download?force=true&w=1200"
                fallbackSrc="/img/hero-boardroom.svg"
                alt="Executive accounting advisory illustration"
                className="mb-4 h-44 w-full"
              />
              <h2 className="text-xl font-semibold text-[#111827]">Strategic Positioning</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li>Compliance-driven and audit-ready operating model</li>
                <li>Technology-enabled accounting control environment</li>
                <li>Investor-ready reporting standards and cadence</li>
                <li>Cross-border capable advisory delivery</li>
              </ul>
            </SurfaceCard>
          </Reveal>
        </div>
      </HeroPanel>

      <SectionShell>
        <Reveal className="mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">Business Risk</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#111827]">Where Financial Weakness Creates Strategic Exposure</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          {[
            { icon: FileText, text: 'Poor bookkeeping', desc: 'Inaccurate records lead to poor decisions' },
            { icon: ShieldCheck, text: 'Weak internal controls', desc: 'Increased fraud and error risk' },
            { icon: Clock3, text: 'Delayed reporting', desc: 'Missed insights and opportunities' },
            { icon: Scale, text: 'Tax non-compliance', desc: 'Penalties and legal issues' },
            { icon: AlertTriangle, text: 'Regulatory penalties', desc: 'Fines and sanctions' },
            { icon: Building2, text: 'Reputational damage', desc: 'Loss of stakeholder trust' },
            { icon: Wallet, text: 'Cash flow instability', desc: 'Operational disruptions' },
          ].map((item, idx) => (
            <Reveal key={item.text} delayMs={idx * 40}>
              <article className="h-full rounded-2xl border border-red-200 bg-white p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_32px_rgba(220,38,38,0.15)] group">
                <div className="mb-3 inline-flex rounded-full bg-red-100 p-2 text-red-600 group-hover:bg-red-600 group-hover:text-white transition-colors">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-[#111827]">{item.text}</h3>
                <p className="mt-1 text-xs text-slate-500">{item.desc}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </SectionShell>

      <SectionShell tint>
        <Reveal className="mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">Strategic Solution Positioning</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#111827]">Built for Compliance, Structured for Scale</h2>
        </Reveal>
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-stretch">
          <Reveal className="h-full">
            <SurfaceCard className="h-full overflow-hidden p-0">
              <BrandImage
                src="https://images.unsplash.com/photo-1573497491765-dccce02b29df?w=1400"
                fallbackSrc="/img/hero-home-bg.svg"
                alt="Strategic advisory leadership team"
                className="h-full min-h-[320px] w-full rounded-none"
              />
            </SurfaceCard>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: CheckCircle2, text: 'Compliance-driven', desc: 'Always audit-ready' },
              { icon: Award, text: 'Audit-ready', desc: 'Stress-free reviews' },
              { icon: TrendingUp, text: 'Investor-ready', desc: 'Growth positioning' },
              { icon: FileBarChart2, text: 'Structured', desc: 'Process excellence' },
              { icon: CloudCog, text: 'Technology-enabled', desc: 'Cloud-first approach' },
              { icon: Globe2, text: 'Cross-border', desc: 'Global expertise' },
            ].map((item, idx) => (
              <Reveal key={item.text} delayMs={idx * 40}>
                <article className="rounded-2xl border border-[#153585]/15 bg-white p-5 text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_32px_rgba(21,53,133,0.15)] group">
                  <div className="mb-3 inline-flex rounded-full bg-[#153585]/10 p-3 text-[#153585] group-hover:bg-[#153585] group-hover:text-white transition-colors">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-semibold text-[#111827]">{item.text}</h3>
                  <p className="mt-1 text-xs text-slate-500">{item.desc}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </SectionShell>

      <SectionShell>
        <Reveal className="mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">Service Pillars</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#111827]">Enterprise Accounting Capabilities</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: FileText, text: 'Bookkeeping', desc: 'Daily transaction management' },
            { icon: BarChart3, text: 'Financial Reporting', desc: 'Statutory & management reports' },
            { icon: PieChart, text: 'Management Reporting', desc: 'KPI dashboards & analysis' },
            { icon: Wallet, text: 'CFO Consulting', desc: 'Strategic finance leadership' },
            { icon: Calculator, text: 'Financial Modeling', desc: 'Scenario & sensitivity analysis' },
            { icon: CreditCard, text: 'Payroll Processing', desc: 'Accurate & compliant payroll' },
            { icon: Landmark, text: 'AP/AR Management', desc: 'Working capital optimization' },
            { icon: Scale, text: 'Tax Compliance', desc: 'Tax planning & filing' },
          ].map((item, idx) => (
            <Reveal key={item.text} delayMs={idx * 40}>
              <article className="h-full rounded-2xl border border-slate-200 bg-white p-5 text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_32px_rgba(15,23,42,0.08)] group">
                <div className="mb-3 inline-flex rounded-full bg-[#153585]/10 p-3 text-[#153585] group-hover:bg-[#153585] group-hover:text-white transition-colors">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="text-base font-semibold text-[#111827]">{item.text}</h3>
                <p className="mt-1 text-xs text-slate-500">{item.desc}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </SectionShell>

      <SectionShell tint>
        <Reveal className="mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">Industries Served</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#111827]">Coverage Across Regulated Sectors</h2>
        </Reveal>
        <Reveal>
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#f3f6ff] p-4 sm:p-6">
            <div className="flex w-max gap-5 motion-safe:[animation:preliminaryIndustryCarousel_42s_linear_infinite] hover:[animation-play-state:paused]">
              {[...INDUSTRIES, ...INDUSTRIES].map((industry, index) => (
                <article
                  key={`industry-carousel-${industry.name}-${index}`}
                  className="w-[280px] flex-shrink-0 overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] sm:w-[330px]"
                >
                  <BrandImage
                    src={industry.image}
                    fallbackSrc={industry.fallback}
                    alt={`${industry.name} industry illustration`}
                    className="h-44 w-full rounded-none object-cover"
                  />
                  <div className="p-5">
                    <span className="inline-flex rounded-full bg-[#e6ebfb] px-4 py-1 text-xs font-semibold uppercase tracking-wide text-[#153585]">Industry</span>
                    <h3 className="mt-4 text-2xl font-semibold leading-tight text-[#031247]">
                      {industry.name}
                    </h3>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </Reveal>
      </SectionShell>

      <SectionShell>
        <Reveal className="mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">Software Expertise</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#111827]">Cloud Platforms We Operate</h2>
        </Reveal>
        <Reveal>
          <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-[#f3f3f5] px-4 py-8 sm:px-8">
            <div className="flex w-max items-center gap-10 motion-safe:[animation:preliminarySoftwareCarousel_30s_linear_infinite] hover:[animation-play-state:paused]">
              {[...SOFTWARE_EXPERTISE, ...SOFTWARE_EXPERTISE].map((software, index) => (
                <div
                  key={`software-logo-${software.name}-${index}`}
                  className="flex min-w-[170px] flex-shrink-0 items-center justify-center sm:min-w-[210px]"
                >
                  <BrandImage
                    src={software.logo}
                    fallbackSrc={software.fallback}
                    alt={`${software.name} logo`}
                    className="h-14 w-auto max-w-[170px] rounded-none object-contain sm:h-16 sm:max-w-[210px]"
                  />
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </SectionShell>

      <SectionShell tint>
        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <Reveal className="rounded-2xl border border-[#153585]/20 bg-[#153585] p-8 text-left text-blue-50 shadow-[0_18px_38px_rgba(21,53,133,0.28)]">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-100">Trust Indicators</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Executive Confidence, Compliance Discipline</h2>
            <p className="mt-4 text-blue-100/90">
              Kiamina Accounting Services is positioned as a strategic, compliance-driven, globally credible advisory practice built with Big 4-style delivery rigor.
            </p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {TRUST_INDICATORS.map((indicator, index) => (
              <Reveal key={indicator.id} delayMs={(index % 2) * 70}>
                <SurfaceCard className="h-full border-[#153585]/15 bg-white">
                  <div className="mb-4 inline-flex rounded-full bg-[#153585]/10 p-3 text-[#153585]">
                    <indicator.Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-[#111827]">{indicator.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{indicator.detail}</p>
                  <div className="mt-4 border-t border-slate-200 pt-3">
                    <CountUpMetric value={indicator.metric} className="text-xl font-semibold text-[#153585]" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{indicator.metricLabel}</p>
                  </div>
                </SurfaceCard>
              </Reveal>
            ))}
          </div>
        </div>
      </SectionShell>
    </>
  )

  const renderAboutPage = () => (
    <>
      <HeroPanel pageKey="about" scrollY={scrollY}>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Reveal className="space-y-5 text-center lg:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-100">About</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Financial Clarity, Regulatory Confidence, Strategic Control</h1>
          </Reveal>
          <Reveal delayMs={120}>
            <SurfaceCard className="p-4">
              <BrandImage
                src="https://unsplash.com/photos/VpcgTEKerEQ/download?force=true&w=1200"
                fallbackSrc="/img/about-framework.svg"
                alt="Accounting governance framework illustration"
                className="h-48 w-full"
              />
            </SurfaceCard>
          </Reveal>
        </div>
      </HeroPanel>

      <SectionShell>
        <div className="grid gap-4 md:grid-cols-2">
          <Reveal>
            <SurfaceCard>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-[#153585]/10 p-2">
                  <Building2 className="h-5 w-5 text-[#153585]" />
                </div>
                <h2 className="text-2xl font-semibold text-[#111827]">Firm Overview</h2>
              </div>
              <p className="mt-3 text-slate-600">
                Kiamina Accounting Services is a compliance-centered finance advisory firm that helps organizations establish reliable accounting systems, enforce tax discipline, and improve executive reporting control.
              </p>
            </SurfaceCard>
          </Reveal>
          <Reveal>
            <SurfaceCard>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-[#153585]/10 p-2">
                  <Target className="h-5 w-5 text-[#153585]" />
                </div>
                <h2 className="text-2xl font-semibold text-[#111827]">Mission</h2>
              </div>
              <p className="mt-3 text-slate-600">Empower organizations with accurate systems, compliant tax structures, and strategic financial insight.</p>
              <div className="mt-6 flex items-center gap-3">
                <div className="rounded-full bg-[#153585]/10 p-2">
                  <Lightbulb className="h-5 w-5 text-[#153585]" />
                </div>
                <h2 className="text-2xl font-semibold text-[#111827]">Vision</h2>
              </div>
              <p className="mt-3 text-slate-600">Redefine accounting as a strategic growth engine worldwide.</p>
            </SurfaceCard>
          </Reveal>
        </div>
      </SectionShell>

      <SectionShell>
        <Reveal className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">Why Choose Us</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#111827]">Our Distinctive Strengths</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            { icon: ShieldCheck, title: 'Regulatory Excellence', desc: 'Deep expertise in IFRS, GAAP, US GAAP, and local tax regulations across multiple jurisdictions' },
            { icon: Users, title: 'Dedicated Teams', desc: 'Seasoned accountants and analysts assigned to understand your business intimately' },
            { icon: TrendingUp, title: 'Scalable Processes', desc: 'Documented methodologies that grow with your organization' },
            { icon: CloudCog, title: 'Cloud-First Approach', desc: 'Real-time visibility, automated workflows, and secure access from anywhere' },
            { icon: CheckCircle2, title: 'Audit-Ready Always', desc: 'Well-maintained records that make audits stress-free experiences' },
            { icon: Award, title: 'Industry Recognition', desc: 'Awards and recognition from professional accounting bodies across regions' },
          ].map((item, index) => (
            <Reveal key={item.title} delayMs={index * 50}>
              <SurfaceCard className="h-full">
                <div className="mb-4 inline-flex rounded-full bg-[#153585]/10 p-3 text-[#153585]">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-[#111827]">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.desc}</p>
              </SurfaceCard>
            </Reveal>
          ))}
        </div>
      </SectionShell>

      <SectionShell tint>
        <Reveal className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">Core Values</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#111827]">How We Operate</h2>
        </Reveal>
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              { value: 'Accuracy', icon: Target },
              { value: 'Integrity', icon: ShieldCheck },
              { value: 'Compliance', icon: FileBarChart2 },
              { value: 'Partnership', icon: Users },
              { value: 'Continuous Improvement', icon: TrendingUp },
            ].map((item) => (
              <Reveal key={item.value}>
                <article className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
                  <div className="mb-3 inline-flex rounded-full bg-[#153585]/10 p-2 text-[#153585]">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-[#111827]">{item.value}</h3>
                </article>
              </Reveal>
            ))}
          </div>
          <Reveal delayMs={120}>
            <SurfaceCard className="h-full overflow-hidden p-0">
              <BrandImage
                src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=900"
                fallbackSrc="/img/about-framework.svg"
                alt="Professional advisory teamwork"
                className="h-full min-h-[280px] w-full rounded-none"
              />
            </SurfaceCard>
          </Reveal>
        </div>
      </SectionShell>

      <SectionShell>
        <Reveal className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">Structured 3-Step Process</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#111827]">Delivery Framework</h2>
        </Reveal>
        <div className="relative grid gap-5 lg:grid-cols-3">
          <div className="pointer-events-none absolute left-[16.7%] right-[16.7%] top-16 hidden h-px bg-gradient-to-r from-[#153585]/10 via-[#153585]/45 to-[#153585]/10 lg:block" />
          {ABOUT_PROCESS_STEPS.map((item, index) => (
            <Reveal key={item.id} delayMs={index * 70}>
              <SurfaceCard className="relative h-full border-[#153585]/20 bg-[linear-gradient(180deg,#ffffff,#f5f8ff)]">
                <div className="mb-5 flex items-center justify-between">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#153585] text-sm font-bold text-white">
                    {item.step}
                  </span>
                  <span className="inline-flex rounded-full bg-[#153585]/10 p-2 text-[#153585]">
                    <item.Icon className="h-5 w-5" />
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-[#111827]">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{item.detail}</p>
              </SurfaceCard>
            </Reveal>
          ))}
        </div>
      </SectionShell>

      <SectionShell tint>
        <Reveal className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">Note from the Director</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#111827]">A Message from Our Founder</h2>
        </Reveal>
        <Reveal>
          <SurfaceCard className="overflow-hidden border-[#153585]/25 bg-[linear-gradient(135deg,#0f234e,#153585_60%,#1f4aa8)] p-0 text-white">
            <div className="grid gap-0 lg:grid-cols-[0.34fr_0.66fr]">
              <div className="relative h-80 lg:h-full">
                <BrandImage
                  src="https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=1200"
                  fallbackSrc="/img/contact-office.svg"
                  alt="Founder portrait"
                  className="h-full w-full rounded-none"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#081c4f] via-[#081c4fcc] to-transparent px-5 pb-5 pt-12">
                  <p className="text-sm font-semibold text-white">Kenneth Okwudili</p>
                  <p className="text-xs text-blue-100">Founder & Managing Partner</p>
                </div>
              </div>
              <div className="p-7 lg:p-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-100">
                  Founder Perspective
                </div>
                <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur">
                  <p className="text-lg leading-relaxed text-blue-50">
                    "At Kiamina Accounting Services, we believe financial clarity is the foundation of every successful organization. Our conviction is simple: businesses and nonprofits deserve more than compliance; they deserve a strategic partner that turns numbers into decisive action."
                  </p>
                </div>
                <div className="mt-5 space-y-4 text-sm leading-7 text-blue-100">
                  <p>
                    Our team combines Big 4-style rigor with deep operating knowledge of local and cross-border regulatory environments.
                  </p>
                  <p>
                    Whether you are preparing investor-ready reporting, strengthening nonprofit fund controls, or scaling finance operations internationally, our mandate is to elevate your financial position with discipline and consistency.
                  </p>
                </div>
                <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1">Founder-led Advisory</span>
                  <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1">200+ Organizations Served</span>
                  <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1">5 Global Regions</span>
                </div>
              </div>
            </div>
          </SurfaceCard>
        </Reveal>
      </SectionShell>

      <SectionShell tint>
        <Reveal className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">Our Track Record</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#111827]">Impact by the Numbers</h2>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ABOUT_TRACK_RECORD.map((stat, index) => (
            <Reveal key={stat.label} delayMs={index * 50}>
              <SurfaceCard className="text-center">
                <div className="mb-3 inline-flex rounded-full bg-[#153585]/10 p-2 text-[#153585]">
                  <stat.Icon className="h-5 w-5" />
                </div>
                <CountUpMetric value={stat.metric} className="text-3xl font-bold text-[#153585]" />
                <p className="mt-1 text-sm text-slate-600">{stat.label}</p>
              </SurfaceCard>
            </Reveal>
          ))}
        </div>
      </SectionShell>

      {renderNewsletterSection()}
    </>
  )

  const renderServicesPage = () => (
    <>
      <HeroPanel pageKey="services" scrollY={scrollY}>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Reveal className="space-y-4 text-center lg:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-100">Services</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Consulting-Grade Accounting Service Lines</h1>
            <p className="mx-auto mt-4 max-w-3xl text-blue-100/90 lg:mx-0">
              Every service is designed with executive summary clarity, concrete deliverables, and measurable strategic outcomes.
            </p>
          </Reveal>
          <Reveal delayMs={120}>
            <SurfaceCard className="p-4">
              <BrandImage
                src="https://unsplash.com/photos/ftCWdZOFZqo/download?force=true&w=1200"
                fallbackSrc="/img/services-grid.svg"
                alt="Service architecture illustration"
                className="h-48 w-full"
              />
            </SurfaceCard>
          </Reveal>
        </div>
      </HeroPanel>
      <SectionShell>
        <div className="grid gap-8">
          {SERVICES.map((service, idx) => (
            <Reveal key={service.name}>
              <article className={`rounded-2xl border transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_30px_rgba(15,23,42,0.08)] ${idx % 2 === 0 ? 'bg-white border-slate-200' : 'bg-gradient-to-r from-[#153585] to-[#1a4299] border-transparent text-white'}`}>
                <div className={`grid gap-6 ${idx % 2 === 0 ? 'md:grid-cols-[1.45fr_0.85fr]' : 'md:grid-cols-[0.85fr_1.45fr]'}`}>
                  {idx % 2 === 0 ? (
                    <>
                      <div className="p-6 pb-0 md:pb-6">
                        <div className="rounded-full bg-[#153585]/10 p-4 text-[#153585] mb-4 w-fit">
                          <service.icon className="h-10 w-10" />
                        </div>
                        <h2 className="text-2xl font-semibold text-[#111827]">{service.name}</h2>
                        <p className="mt-3 text-slate-600">{service.summary}</p>
                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                          <section className="rounded-xl bg-[#f3f6ff] p-4">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#153585]">Key Deliverables</h3>
                            <ul className="mt-3 space-y-2 text-sm text-slate-600">
                              {service.deliverables.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                          </section>
                          <section className="rounded-xl bg-[#f8fafc] p-4">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#153585]">Strategic Outcomes</h3>
                            <ul className="mt-3 space-y-2 text-sm text-slate-600">
                              {service.outcomes.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                          </section>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleEngageService({
                            eventType: 'service_click',
                            sourcePage: 'services',
                            targetType: 'service',
                            sourceId: service.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                            sourceLabel: service.name,
                          })}
                          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#153585] transition-colors hover:text-[#1f4aa8]"
                        >
                          Engage Service <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="relative h-64 md:h-auto">
                        <BrandImage
                          src={service.image}
                          alt={`${service.name} illustration`}
                          className="absolute inset-0 h-full w-full object-cover rounded-b-2xl md:rounded-2xl md:rounded-l-none"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="relative h-64 md:h-auto order-2 md:order-1">
                        <BrandImage
                          src={service.image}
                          alt={`${service.name} illustration`}
                          className="absolute inset-0 h-full w-full object-cover rounded-b-2xl md:rounded-2xl md:rounded-r-none"
                        />
                      </div>
                      <div className="p-6 pb-0 md:pb-6 order-1 md:order-2">
                        <div className="rounded-full bg-white/20 p-4 text-white mb-4 w-fit">
                          <service.icon className="h-10 w-10" />
                        </div>
                        <h2 className="text-2xl font-semibold text-white">{service.name}</h2>
                        <p className="mt-3 text-blue-100">{service.summary}</p>
                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                          <section className="rounded-xl bg-white/10 p-4">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-200">Key Deliverables</h3>
                            <ul className="mt-3 space-y-2 text-sm text-blue-50">
                              {service.deliverables.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                          </section>
                          <section className="rounded-xl bg-white/5 p-4">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-200">Strategic Outcomes</h3>
                            <ul className="mt-3 space-y-2 text-sm text-blue-50">
                              {service.outcomes.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                          </section>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleEngageService({
                            eventType: 'service_click',
                            sourcePage: 'services',
                            targetType: 'service',
                            sourceId: service.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                            sourceLabel: service.name,
                          })}
                          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white transition-colors hover:text-blue-200"
                        >
                          Engage Service <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </SectionShell>
    </>
  )

  const renderInsightsPage = () => (
    <>
      <HeroPanel pageKey="insights" scrollY={scrollY}>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Reveal className="space-y-4 text-center lg:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-100">Insights</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">
              {activeInsight ? activeInsight.title : 'Thought Leadership for Executive Teams'}
            </h1>
            {activeInsight && (
              <div className="flex flex-wrap items-center gap-4 text-sm text-blue-100">
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" /> {formatPublishedDate(activeInsight.publishedAt)}</span>
                <span className="inline-flex items-center gap-1"><Clock3 className="h-4 w-4" /> {activeInsight.readTime}</span>
                <span className="inline-flex items-center gap-1"><UserCircle2 className="h-4 w-4" /> {activeInsight.author}</span>
              </div>
            )}
          </Reveal>
          <Reveal delayMs={120}>
            <SurfaceCard className="p-4">
              <BrandImage
                src={activeInsight?.cover || 'https://unsplash.com/photos/HG9M8M29Ig4/download?force=true&w=1200'}
                fallbackSrc="/img/insights-analysis-1.svg"
                alt="Financial analytics insights illustration"
                className="h-48 w-full"
              />
            </SurfaceCard>
          </Reveal>
        </div>
      </HeroPanel>
      <SectionShell>
        {activeInsight ? (
          <div className="grid gap-6 lg:grid-cols-[0.75fr_0.25fr]">
            <Reveal>
              <SurfaceCard className="space-y-6">
                <button
                  type="button"
                  onClick={closeInsightArticle}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Articles
                </button>
                <p className="inline-flex rounded-full bg-[#153585]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#153585]">
                  {activeInsight.category}
                </p>
                <h2 className="text-3xl font-semibold text-[#111827]">{activeInsight.title}</h2>
                <div className="space-y-4 text-base leading-8 text-slate-700">
                  {activeInsight.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </SurfaceCard>
            </Reveal>
            <Reveal delayMs={90}>
              <SurfaceCard className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#153585]">Article Details</p>
                <p className="text-sm text-slate-600"><span className="font-semibold text-slate-800">Posted:</span> {formatPublishedDate(activeInsight.publishedAt)}</p>
                <p className="text-sm text-slate-600"><span className="font-semibold text-slate-800">Author:</span> {activeInsight.author}</p>
                <p className="text-sm text-slate-600"><span className="font-semibold text-slate-800">Read time:</span> {activeInsight.readTime}</p>
              </SurfaceCard>
            </Reveal>
          </div>
        ) : (
          <>
            <Reveal className="mb-6">
              <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search articles by title, content, or category..."
                    value={insightSearch}
                    onChange={(e) => setInsightSearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#153585]/50 focus:ring-2 focus:ring-[#153585]/20"
                  />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      value={insightCategory}
                      onChange={(e) => setInsightCategory(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-8 text-sm outline-none transition focus:border-[#153585]/50 focus:ring-2 focus:ring-[#153585]/20"
                    >
                      {insightCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="relative">
                    <SortAsc className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      value={insightSort}
                      onChange={(e) => setInsightSort(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-8 text-sm outline-none transition focus:border-[#153585]/50 focus:ring-2 focus:ring-[#153585]/20"
                    >
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                    </select>
                  </div>
                </div>
              </div>
            </Reveal>
            {filteredInsights.length === 0 ? (
              <Reveal>
                <SurfaceCard className="py-12 text-center">
                  <Search className="mx-auto h-12 w-12 text-slate-300" />
                  <h3 className="mt-4 text-lg font-semibold text-[#111827]">
                    {insightsLoading ? 'Loading insights...' : 'No articles found'}
                  </h3>
                  <p className="mt-2 text-slate-600">
                    {insightsLoading
                      ? 'Fetching latest thought leadership updates.'
                      : 'Try adjusting your search or filter criteria.'}
                  </p>
                </SurfaceCard>
              </Reveal>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm text-slate-600">
                    Showing {(insightPage - 1) * insightsPerPage + 1}-{Math.min(insightPage * insightsPerPage, filteredInsights.length)} of {filteredInsights.length} articles
                  </p>
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                    Articles per page
                    <select
                      value={insightsPerPage}
                      onChange={(event) => setInsightsPerPage(Number(event.target.value))}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#153585]/50 focus:ring-2 focus:ring-[#153585]/20"
                    >
                      {INSIGHTS_PER_PAGE_OPTIONS.map((option) => (
                        <option key={`insights-page-size-${option}`} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  {paginatedInsights.map((item, index) => (
                    <Reveal key={item.slug} delayMs={(index % 3) * 60}>
                      <article className="h-full rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_32px_rgba(15,23,42,0.09)]">
                        <BrandImage
                          src={item.cover}
                          fallbackSrc={`/img/insights-analysis-${(index % 3) + 1}.svg`}
                          alt={`${item.title} illustration`}
                          className="mb-4 h-40 w-full"
                        />
                        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {formatPublishedDate(item.publishedAt)}</span>
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {item.readTime}</span>
                        </div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#153585]">{item.category}</p>
                        <h2 className="mt-3 text-xl font-semibold text-[#111827]">{item.title}</h2>
                        <p className="mt-3 text-sm text-slate-600">{item.excerpt}</p>
                        <button
                          type="button"
                          onClick={() => openInsightArticle(item.slug)}
                          className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-[#153585] transition-colors hover:text-[#1f4aa8]"
                        >
                          Read Full Article <ArrowRight className="h-4 w-4" />
                        </button>
                      </article>
                    </Reveal>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-sm font-medium text-slate-700">
                    Page {insightPage} of {totalInsightPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInsightPage((prev) => Math.max(1, prev - 1))}
                      disabled={insightPage <= 1}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-100"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => setInsightPage((prev) => Math.min(totalInsightPages, prev + 1))}
                      disabled={insightPage >= totalInsightPages}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-100"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </SectionShell>
    </>
  )

  const renderCareersPage = () => (
    <>
      <HeroPanel pageKey="careers" scrollY={scrollY}>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Reveal className="space-y-5 text-center lg:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-100">Careers</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Build a Career with High Professional Standards</h1>
            <p className="mx-auto max-w-3xl text-blue-100/90 lg:mx-0">
              Join a team where accounting discipline, compliance rigor, and strategic thinking define everyday delivery.
            </p>
            <a href="mailto:recruitment@kiaminaaccounting.com" className="inline-flex items-center justify-center rounded-full border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/20">
              Send Application
            </a>
          </Reveal>
          <Reveal delayMs={120}>
            <SurfaceCard className="p-4">
              <BrandImage
                src="https://unsplash.com/photos/vzfgh3RAPzM/download?force=true&w=1200"
                fallbackSrc="/img/careers-team.svg"
                alt="Professional team collaboration illustration"
                className="h-48 w-full"
              />
            </SurfaceCard>
          </Reveal>
        </div>
      </HeroPanel>
      <SectionShell>
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <Reveal>
            <SurfaceCard className="h-full overflow-hidden p-0">
              <BrandImage
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1400"
                fallbackSrc="/img/careers-team.svg"
                alt="Career collaboration environment"
                className="h-full min-h-[340px] w-full rounded-none"
              />
            </SurfaceCard>
          </Reveal>
          <Reveal delayMs={80}>
            <SurfaceCard className="h-full">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">Why Join Kiamina</p>
              <h2 className="mt-3 text-3xl font-semibold text-[#111827]">Build Deep Advisory Capability</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                We provide an environment for accountants and finance professionals to work on real compliance and advisory challenges across multiple regions and industries.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <p className="rounded-xl border border-[#153585]/15 bg-[#f6f8ff] px-3 py-2 text-sm font-semibold text-[#153585]">Cross-Border Exposure</p>
                <p className="rounded-xl border border-[#153585]/15 bg-[#f6f8ff] px-3 py-2 text-sm font-semibold text-[#153585]">Mentored Growth Path</p>
                <p className="rounded-xl border border-[#153585]/15 bg-[#f6f8ff] px-3 py-2 text-sm font-semibold text-[#153585]">Structured Delivery Culture</p>
                <p className="rounded-xl border border-[#153585]/15 bg-[#f6f8ff] px-3 py-2 text-sm font-semibold text-[#153585]">Impact-Focused Work</p>
              </div>
            </SurfaceCard>
          </Reveal>
        </div>
      </SectionShell>

      <SectionShell tint>
        <Reveal className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">What We Value</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#111827]">Culture Anchors</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            { title: 'Accuracy', icon: Target },
            { title: 'Integrity', icon: ShieldCheck },
            { title: 'Compliance', icon: FileBarChart2 },
            { title: 'Partnership', icon: Users },
            { title: 'Continuous Improvement', icon: TrendingUp },
          ].map((item, index) => (
            <Reveal key={item.title} delayMs={index * 45}>
              <SurfaceCard className="h-full text-center">
                <div className="mb-3 inline-flex rounded-full bg-[#153585]/10 p-2 text-[#153585]">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-[#111827]">{item.title}</h3>
              </SurfaceCard>
            </Reveal>
          ))}
        </div>
      </SectionShell>

      <SectionShell>
        <div className="grid gap-4 md:grid-cols-2">
          <Reveal>
            <SurfaceCard className="h-full">
              <h2 className="text-2xl font-semibold text-[#111827]">Hiring Criteria</h2>
              <ul className="mt-4 space-y-2 text-slate-600">
                <li>Technical competence in accounting and reporting</li>
                <li>Strong ethics and professional judgment</li>
                <li>Attention to detail and documentation quality</li>
                <li>Willingness to learn and adapt quickly</li>
              </ul>
            </SurfaceCard>
          </Reveal>
          <Reveal delayMs={70}>
            <SurfaceCard className="h-full border-[#153585]/20 bg-[linear-gradient(170deg,#f5f8ff,#ffffff)]">
              <h2 className="text-2xl font-semibold text-[#111827]">Apply</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Send your CV and a short note describing your experience and service area interests.
              </p>
              <a
                href="mailto:recruitment@kiaminaaccounting.com"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#153585] px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1f4aa8]"
              >
                recruitment@kiaminaaccounting.com <ArrowRight className="h-4 w-4" />
              </a>
            </SurfaceCard>
          </Reveal>
        </div>
      </SectionShell>
    </>
  )

  const renderContactPage = () => (
    <>
      <HeroPanel pageKey="contact" scrollY={scrollY}>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Reveal className="space-y-4 text-center lg:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-100">Contact</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Connect with Kiamina Advisory Team</h1>
          </Reveal>
          <Reveal delayMs={120}>
            <SurfaceCard className="p-4">
              <BrandImage
                src="https://unsplash.com/photos/n95VMLxqM2I/download?force=true&w=1200"
                fallbackSrc="/img/contact-office.svg"
                alt="Corporate office contact illustration"
                className="h-48 w-full"
              />
            </SurfaceCard>
          </Reveal>
        </div>
      </HeroPanel>
      <SectionShell>
        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <Reveal>
            <SurfaceCard>
              <h2 className="text-2xl font-semibold text-[#111827]">Contact Form</h2>
              <form onSubmit={submitContact} className="mt-5 grid gap-4">
                <label className="text-sm font-semibold text-slate-700">
                  Name
                  <input
                    className={`mt-1.5 w-full rounded-xl border px-4 py-2.5 outline-none transition focus:ring-2 ${
                      contactErrors.name
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                        : 'border-slate-300 focus:border-[#153585]/50 focus:ring-[#153585]/20'
                    }`}
                    value={contactForm.name}
                    onChange={(event) => {
                      setContactSubmitted(false)
                      clearContactError('name')
                      setContactForm((prev) => ({ ...prev, name: event.target.value }))
                    }}
                    required
                    aria-invalid={Boolean(contactErrors.name)}
                  />
                  {contactErrors.name && <p className="mt-1 text-xs font-medium text-red-600">{contactErrors.name}</p>}
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Email
                  <input
                    type="email"
                    className={`mt-1.5 w-full rounded-xl border px-4 py-2.5 outline-none transition focus:ring-2 ${
                      contactErrors.email
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                        : 'border-slate-300 focus:border-[#153585]/50 focus:ring-[#153585]/20'
                    }`}
                    value={contactForm.email}
                    onChange={(event) => {
                      setContactSubmitted(false)
                      clearContactError('email')
                      setContactForm((prev) => ({ ...prev, email: event.target.value }))
                    }}
                    required
                    aria-invalid={Boolean(contactErrors.email)}
                  />
                  {contactErrors.email && <p className="mt-1 text-xs font-medium text-red-600">{contactErrors.email}</p>}
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Country
                  <select
                    className={`mt-1.5 w-full rounded-xl border bg-white px-4 py-2.5 outline-none transition focus:ring-2 ${
                      contactErrors.country
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                        : 'border-slate-300 focus:border-[#153585]/50 focus:ring-[#153585]/20'
                    }`}
                    value={contactForm.country}
                    onChange={(event) => {
                      setContactSubmitted(false)
                      clearContactError('country')
                      setContactForm((prev) => ({ ...prev, country: event.target.value }))
                    }}
                    required
                    aria-invalid={Boolean(contactErrors.country)}
                  >
                    <option value="">Select country</option>
                    {REGION_ITEMS.map((region) => (
                      <option key={`contact-country-${region.id}`} value={region.label}>
                        {region.label}
                      </option>
                    ))}
                  </select>
                  {contactErrors.country && <p className="mt-1 text-xs font-medium text-red-600">{contactErrors.country}</p>}
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Service Needed
                  <input
                    className={`mt-1.5 w-full rounded-xl border px-4 py-2.5 outline-none transition focus:ring-2 ${
                      contactErrors.service
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                        : 'border-slate-300 focus:border-[#153585]/50 focus:ring-[#153585]/20'
                    }`}
                    value={contactForm.service}
                    onChange={(event) => {
                      setContactSubmitted(false)
                      clearContactError('service')
                      setContactForm((prev) => ({ ...prev, service: event.target.value }))
                    }}
                    required
                    aria-invalid={Boolean(contactErrors.service)}
                  />
                  {contactErrors.service && <p className="mt-1 text-xs font-medium text-red-600">{contactErrors.service}</p>}
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Message
                  <textarea
                    className={`mt-1.5 min-h-[140px] w-full rounded-xl border px-4 py-2.5 outline-none transition focus:ring-2 ${
                      contactErrors.message
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                        : 'border-slate-300 focus:border-[#153585]/50 focus:ring-[#153585]/20'
                    }`}
                    value={contactForm.message}
                    onChange={(event) => {
                      setContactSubmitted(false)
                      clearContactError('message')
                      setContactForm((prev) => ({ ...prev, message: event.target.value }))
                    }}
                    required
                    aria-invalid={Boolean(contactErrors.message)}
                  />
                  {contactErrors.message && <p className="mt-1 text-xs font-medium text-red-600">{contactErrors.message}</p>}
                </label>
                <button type="submit" className={primaryButtonClass}>Submit Request</button>
                {contactSubmitted && (
                  <p className="text-sm font-semibold text-green-700">
                    Thank you. We have received your request and our team will reach out.
                  </p>
                )}
              </form>
            </SurfaceCard>
          </Reveal>
          <Reveal>
            <div className="space-y-5">
              <SurfaceCard className="space-y-5 overflow-hidden bg-[linear-gradient(180deg,#ffffff,#f4f8ff)]">
                <h2 className="text-2xl font-semibold text-[#111827]">Nigerian Head Office</h2>
                <div id="nigeria" className="flex items-start gap-2 text-sm text-slate-600">
                  <MapPin className="mt-0.5 h-4 w-4 text-[#153585]" />
                  <p><span className="font-semibold text-slate-800">Address:</span> 10 Akpunonu Street, Port Harcourt, Rivers State, Nigeria, 500102</p>
                </div>
                <div className="flex items-start gap-2 text-sm text-slate-600">
                  <Phone className="mt-0.5 h-4 w-4 text-[#153585]" />
                  <p><span className="font-semibold text-slate-800">Phone:</span> +234 906 496 2073</p>
                </div>
                <div className="flex items-start gap-2 text-sm text-slate-600">
                  <Mail className="mt-0.5 h-4 w-4 text-[#153585]" />
                  <p><span className="font-semibold text-slate-800">Email:</span> info@kiaminaaccounting.com</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleEngageService({
                    sourcePage: 'contact',
                    sourceId: 'book-consultation',
                    sourceLabel: 'Book Consultation',
                  })}
                  className={secondaryButtonClass}
                >
                  Book Consultation
                </button>
                <a
                  href={CALENDAR_BOOKING_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => trackWebsiteEvent({
                    eventType: 'cta_click',
                    page: 'contact',
                    targetType: 'cta',
                    targetId: 'contact-schedule-call',
                    targetLabel: 'Contact Schedule a Call',
                  })}
                  className={secondaryButtonClass}
                >
                  Schedule a Call
                </a>
                <div className="overflow-hidden rounded-2xl border border-[#153585]/20 shadow-[0_10px_24px_rgba(21,53,133,0.12)]">
                  <iframe
                    src={CONTACT_MAP_EMBED_SRC}
                    title="Kiamina Accounting Services office map"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="h-64 w-full"
                  />
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#153585]">
                  <a className="rounded-full border border-[#153585]/25 px-3 py-1.5 hover:bg-[#153585]/5" href="https://www.google.com/maps/search/?api=1&query=10+Akpunonu+Street,+Port+Harcourt,+Rivers+State,+Nigeria,+500102" target="_blank" rel="noreferrer">Open Full Map</a>
                  <a className="rounded-full border border-[#153585]/25 px-3 py-1.5 hover:bg-[#153585]/5" href="https://www.linkedin.com" target="_blank" rel="noreferrer">LinkedIn</a>
                  <a className="rounded-full border border-[#153585]/25 px-3 py-1.5 hover:bg-[#153585]/5" href="https://x.com" target="_blank" rel="noreferrer">X</a>
                  <a className="rounded-full border border-[#153585]/25 px-3 py-1.5 hover:bg-[#153585]/5" href="https://www.instagram.com" target="_blank" rel="noreferrer">Instagram</a>
                  <a className="rounded-full border border-[#153585]/25 px-3 py-1.5 hover:bg-[#153585]/5" href="https://www.facebook.com" target="_blank" rel="noreferrer">Facebook</a>
                </div>
              </SurfaceCard>

              <SurfaceCard className="border-[#0f234e]/20 bg-[linear-gradient(140deg,#0d2153,#153585_60%,#1f4aa8)] text-white shadow-[0_20px_36px_rgba(8,28,79,0.35)]">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-200">Direct Support Channels</p>
                <p className="mt-2 text-sm text-blue-50">Reach our advisory desk directly for onboarding, service scoping, or urgent compliance support.</p>
                <div className="mt-4 grid gap-3">
                  <a
                    href="tel:+2349064962073"
                    className="inline-flex items-center justify-between rounded-xl border border-white/35 bg-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/25"
                  >
                    <span className="inline-flex items-center gap-2"><Phone className="h-4 w-4" /> Call Advisory Desk</span>
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    href={CALENDAR_BOOKING_URL}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackWebsiteEvent({
                      eventType: 'cta_click',
                      page: 'contact',
                      targetType: 'cta',
                      targetId: 'direct-support-schedule-call',
                      targetLabel: 'Direct Support Schedule a Call',
                    })}
                    className="inline-flex items-center justify-between rounded-xl border border-white/35 bg-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/25"
                  >
                    <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Schedule a Call</span>
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    href="mailto:info@kiaminaaccounting.com?subject=Service%20Engagement%20Request"
                    className="inline-flex items-center justify-between rounded-xl border border-white/35 bg-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/25"
                  >
                    <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4" /> Send Engagement Email</span>
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
                <p className="mt-4 text-xs font-medium text-blue-100">Typical response time for inbound inquiries: within 1 business day.</p>
              </SurfaceCard>
            </div>
          </Reveal>
        </div>
      </SectionShell>
      <SectionShell>
        <Reveal className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">Response Framework</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#111827]">What Happens After You Contact Us</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          <Reveal>
            <SurfaceCard className="h-full">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#153585]">01</p>
              <h3 className="mt-3 text-lg font-semibold text-[#111827]">Initial Advisory Triage</h3>
              <p className="mt-3 text-sm text-slate-600">Your request is reviewed and routed to the relevant accounting or tax specialist.</p>
            </SurfaceCard>
          </Reveal>
          <Reveal delayMs={60}>
            <SurfaceCard className="h-full">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#153585]">02</p>
              <h3 className="mt-3 text-lg font-semibold text-[#111827]">Service Scoping Call</h3>
              <p className="mt-3 text-sm text-slate-600">A structured discovery call confirms timelines, deliverables, and compliance priorities.</p>
            </SurfaceCard>
          </Reveal>
          <Reveal delayMs={120}>
            <SurfaceCard className="h-full">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#153585]">03</p>
              <h3 className="mt-3 text-lg font-semibold text-[#111827]">Engagement Launch</h3>
              <p className="mt-3 text-sm text-slate-600">We initiate onboarding and begin service delivery with clear reporting cadence and ownership.</p>
            </SurfaceCard>
          </Reveal>
        </div>
      </SectionShell>
      <SectionShell tint>
        <Reveal className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#153585]">Regional Coverage</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#111827]">Client Presence Across Strategic Markets</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {REGION_ITEMS.map((item, index) => (
            <Reveal key={item.id} delayMs={(index % 5) * 40}>
              <article id={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_32px_rgba(15,23,42,0.09)]">
                <BrandImage
                  src={item.flag}
                  alt={`${item.label} flag`}
                  className="mx-auto mb-3 h-14 w-20 border border-slate-200"
                />
                <h3 className="text-sm font-semibold text-[#111827]">{item.label}</h3>
              </article>
            </Reveal>
          ))}
        </div>
      </SectionShell>

      {renderNewsletterSection()}
    </>
  )

  const pageRenderer = {
    home: renderHomePage,
    about: renderAboutPage,
    services: renderServicesPage,
    insights: renderInsightsPage,
    careers: renderCareersPage,
    contact: renderContactPage,
  }

  const renderPage = pageRenderer[resolvedPage] || renderHomePage

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <style>{`
        @keyframes preliminaryIndustryCarousel {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes preliminarySoftwareCarousel {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur transition-colors duration-200 ${
          isHeaderCompact
            ? 'border-slate-200/60 bg-white/80 shadow-[0_8px_20px_rgba(15,23,42,0.08)]'
            : 'border-slate-200/80 bg-white/95'
        }`}
      >
        <div className={`mx-auto flex w-[min(1160px,92vw)] items-center justify-between gap-3 transition-all duration-200 ${isHeaderCompact ? 'py-3' : 'py-5'}`}>
          <button type="button" onClick={() => handleNavigate('home')} className="inline-flex items-center gap-3 text-left">
            <KiaminaLogo className="h-10 w-auto" />
            <span className="text-sm font-bold text-[#111827]">Kiamina Accounting Services</span>
          </button>

          <nav className="hidden xl:block">
            <ul className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      resolvedPage === item.id
                        ? 'bg-[#153585]/10 text-[#153585]'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-[#153585]'
                    }`}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
              <li ref={regionsRef} className="relative ml-1">
                <button
                  type="button"
                  onClick={() => setRegionsOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-[#153585]"
                >
                  <BrandImage src={selectedRegion.flag} alt={`${selectedRegion.label} flag`} className="h-4 w-6 rounded-sm border border-slate-200" />
                  <span>{isRegionResolved ? selectedRegion.label : 'Detecting region...'}</span>
                  <ChevronDown className="h-4 w-4" />
                </button>
                {regionsOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    {REGION_ITEMS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedRegionId(item.id)
                          setContactForm((prev) => ({ ...prev, country: item.label }))
                          trackWebsiteEvent({
                            eventType: 'region_select',
                            page: resolvedPage,
                            targetType: 'region',
                            targetId: item.id,
                            targetLabel: item.label,
                          })
                          setRegionsOpen(false)
                          handleNavigate('contact')
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          selectedRegion.id === item.id
                            ? 'bg-[#153585]/10 text-[#153585]'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-[#153585]'
                        }`}
                      >
                        <BrandImage src={item.flag} alt={`${item.label} flag`} className="h-4 w-6 rounded-sm border border-slate-200" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            </ul>
          </nav>

          <div className="hidden items-center gap-2 xl:flex">
            {isAuthenticated ? (
              <button type="button" onClick={onOpenDashboard} className={primaryButtonClass}>Dashboard</button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleEngageService({
                    sourcePage: resolvedPage,
                    sourceId: 'header-get-started',
                    sourceLabel: 'Header Get Started',
                  })}
                  className={primaryButtonClass}
                >
                  Get Started
                </button>
                <button type="button" onClick={onLogin} className={secondaryButtonClass}>Login</button>
                <button type="button" onClick={onOpenOwnerSetup} className={secondaryButtonClass}>Owner Setup</button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex rounded-2xl border border-slate-200/90 bg-white/95 p-2.5 text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.08)] backdrop-blur xl:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" strokeWidth={2.1} /> : <Rows3 className="h-5 w-5" strokeWidth={2.1} />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-slate-200 bg-white xl:hidden">
            <div className="mx-auto grid w-[min(1160px,92vw)] gap-1 py-3">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`rounded-lg px-3 py-2 text-left text-sm font-semibold ${
                    resolvedPage === item.id ? 'bg-[#153585]/10 text-[#153585]' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <div className="mt-2 grid gap-2">
                {isAuthenticated ? (
                  <button type="button" onClick={onOpenDashboard} className={primaryButtonClass}>Dashboard</button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleEngageService({
                        sourcePage: resolvedPage,
                        sourceId: 'mobile-get-started',
                        sourceLabel: 'Mobile Get Started',
                      })}
                      className={primaryButtonClass}
                    >
                      Get Started
                    </button>
                    <button type="button" onClick={onLogin} className={secondaryButtonClass}>Login</button>
                    <button type="button" onClick={onOpenOwnerSetup} className={secondaryButtonClass}>Owner Setup</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main>
        {isPreliminaryPageLoading ? <PreliminaryPageLoadingShell /> : renderPage()}
      </main>

      {scrollY > 320 && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-5 left-5 z-50 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#153585]/25 bg-white text-[#153585] shadow-[0_12px_24px_rgba(15,23,42,0.16)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#153585] hover:text-white"
          aria-label="Back to top"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}

      <ClientSupportWidgetExperience clientName="Website Visitor" businessName="Website Inquiry" />

      <footer className="border-t border-slate-200 bg-[#0f234e] text-blue-100">
        <div className="mx-auto grid w-[min(1160px,92vw)] gap-8 py-12 md:grid-cols-2 xl:grid-cols-5">
          <section className="space-y-4">
            <div className="inline-flex items-center gap-2">
              <KiaminaLogo className="h-10 w-auto" />
              <span className="text-sm font-bold text-white">Kiamina Accounting Services</span>
            </div>
            <p className="text-sm leading-7 text-blue-100/90">
              Strategic accounting, bookkeeping, payroll, and tax compliance advisory serving organizations across Nigeria, Canada, United States, United Kingdom, and Australia.
            </p>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full border border-white/30 px-3 py-1">Compliance-Driven</span>
              <span className="rounded-full border border-white/30 px-3 py-1">Audit-Ready</span>
              <span className="rounded-full border border-white/30 px-3 py-1">Cross-Border</span>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-200">Services</h3>
            <ul className="mt-4 space-y-2 text-sm">
              {SERVICE_PILLARS.slice(0, 6).map((item) => (
                <li key={item} className="text-blue-100/90">{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-200">Quick Links</h3>
            <div className="mt-4 grid gap-2 text-sm">
              <button type="button" onClick={() => handleNavigate('home')} className="text-left text-blue-100/90 transition-colors hover:text-white">Home</button>
              <button type="button" onClick={() => handleNavigate('about')} className="text-left text-blue-100/90 transition-colors hover:text-white">About</button>
              <button type="button" onClick={() => handleNavigate('services')} className="text-left text-blue-100/90 transition-colors hover:text-white">Services</button>
              <button type="button" onClick={() => handleNavigate('insights')} className="text-left text-blue-100/90 transition-colors hover:text-white">Insights</button>
              <button type="button" onClick={() => handleNavigate('careers')} className="text-left text-blue-100/90 transition-colors hover:text-white">Careers</button>
              <button type="button" onClick={() => handleNavigate('contact')} className="text-left text-blue-100/90 transition-colors hover:text-white">Contact</button>
              <button type="button" onClick={handleEngageService} className="text-left text-blue-100/90 transition-colors hover:text-white">Get Started</button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-200">Global Regions</h3>
            <ul className="mt-4 space-y-2 text-sm">
              {REGION_ITEMS.map((item) => (
                <li key={`footer-region-${item.id}`} className="flex items-center gap-2 text-blue-100/90">
                  <BrandImage src={item.flag} alt={`${item.label} flag`} className="h-4 w-6 rounded-sm border border-white/20" />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-200">Contact</h3>
            <p className="flex items-start gap-2 text-sm text-blue-100/90">
              <Building2 className="mt-0.5 h-4 w-4" />
              10 Akpunonu Street, Port Harcourt, Rivers State, Nigeria, 500102
            </p>
            <p className="flex items-center gap-2 text-sm text-blue-100/90">
              <Phone className="h-4 w-4" />
              +234 906 496 2073
            </p>
            <p className="flex items-center gap-2 text-sm text-blue-100/90">
              <Mail className="h-4 w-4" />
              info@kiaminaaccounting.com
            </p>
            <p className="flex items-center gap-2 text-sm text-blue-100/90">
              <Clock3 className="h-4 w-4" />
              Mon - Fri, 8:00 AM - 6:00 PM (WAT)
            </p>
          </section>
        </div>
        <div className="border-t border-white/20">
          <div className="mx-auto flex w-[min(1160px,92vw)] flex-wrap items-center justify-between gap-3 py-5 text-xs text-blue-100/80">
            <p>&copy; {new Date().getFullYear()} Kiamina Accounting Services. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => handleNavigate('about')} className="transition-colors hover:text-white">About</button>
              <button type="button" onClick={() => handleNavigate('services')} className="transition-colors hover:text-white">Services</button>
              <button type="button" onClick={() => handleNavigate('insights')} className="transition-colors hover:text-white">Insights</button>
              <button type="button" onClick={() => handleNavigate('contact')} className="transition-colors hover:text-white">Contact</button>
              <button type="button" onClick={onOpenOwnerSetup} className="rounded-full border border-white/20 px-3 py-1.5 font-semibold text-blue-100 hover:bg-white/10">
                Owner Setup
              </button>
              <button type="button" onClick={onOpenAdminPortal} className="rounded-full border border-white/30 px-3 py-1.5 font-semibold text-blue-50 hover:bg-white/10">
                Admin Portal
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default PreliminaryCorporateSite
