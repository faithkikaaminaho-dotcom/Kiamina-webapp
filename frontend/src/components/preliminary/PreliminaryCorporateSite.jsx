import { useEffect, useMemo, useRef, useState } from 'react'
import { PRELIMINARY_SEO_KEYWORDS_CONTENT } from './preliminarySeoKeywords'
import KiaminaLogo from '../common/KiaminaLogo'
import DotLottiePreloader from '../common/DotLottiePreloader'
import { ClientSupportWidgetExperience } from '../client/support/ClientSupportExperience'
import { apiFetch } from '../../utils/apiClient'
import { registerNewsletterSubscriberLead } from '../../utils/supportCenter'
import {
  ArrowUp,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileText,
  Globe2,
  Hammer,
  Landmark,
  Laptop,
  LineChart,
  Mail,
  MapPin,
  Phone,
  Rocket,
  Rows3,
  Search,
  ShieldCheck,
  Users,
  Wallet,
  X,
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
  { id: 'ireland', label: 'Ireland', flag: '/img/flag-ireland.svg' },
]

const REGION_ID_SET = new Set(REGION_ITEMS.map((item) => item.id))
const REGION_ID_BY_COUNTRY_CODE = {
  AU: 'australia',
  CA: 'canada',
  GB: 'united-kingdom',
  IE: 'ireland',
  NG: 'nigeria',
  UK: 'united-kingdom',
  US: 'united-states',
}
const REGION_ID_BY_COUNTRY_NAME = {
  australia: 'australia',
  canada: 'canada',
  ireland: 'ireland',
  nigeria: 'nigeria',
  'united kingdom': 'united-kingdom',
  'united states': 'united-states',
  'united states of america': 'united-states',
}
const REGION_ID_BY_TIME_ZONE = {
  'Africa/Lagos': 'nigeria',
  'Australia/Adelaide': 'australia',
  'Australia/Brisbane': 'australia',
  'Australia/Broken_Hill': 'australia',
  'Australia/Darwin': 'australia',
  'Australia/Eucla': 'australia',
  'Australia/Hobart': 'australia',
  'Australia/Lindeman': 'australia',
  'Australia/Lord_Howe': 'australia',
  'Australia/Melbourne': 'australia',
  'Australia/Perth': 'australia',
  'Australia/Sydney': 'australia',
  'Europe/Dublin': 'ireland',
  'Europe/London': 'united-kingdom',
}
const CANADA_TIME_ZONES = new Set([
  'America/Atikokan',
  'America/Blanc-Sablon',
  'America/Cambridge_Bay',
  'America/Creston',
  'America/Dawson',
  'America/Dawson_Creek',
  'America/Edmonton',
  'America/Fort_Nelson',
  'America/Glace_Bay',
  'America/Goose_Bay',
  'America/Halifax',
  'America/Inuvik',
  'America/Iqaluit',
  'America/Moncton',
  'America/Rankin_Inlet',
  'America/Regina',
  'America/Resolute',
  'America/St_Johns',
  'America/Swift_Current',
  'America/Toronto',
  'America/Vancouver',
  'America/Whitehorse',
  'America/Winnipeg',
  'America/Yellowknife',
])
const UNITED_STATES_TIME_ZONES = new Set([
  'America/Adak',
  'America/Anchorage',
  'America/Boise',
  'America/Chicago',
  'America/Denver',
  'America/Detroit',
  'America/Indiana/Indianapolis',
  'America/Indiana/Knox',
  'America/Indiana/Marengo',
  'America/Indiana/Petersburg',
  'America/Indiana/Tell_City',
  'America/Indiana/Vevay',
  'America/Indiana/Vincennes',
  'America/Indiana/Winamac',
  'America/Juneau',
  'America/Kentucky/Louisville',
  'America/Kentucky/Monticello',
  'America/Los_Angeles',
  'America/Menominee',
  'America/Metlakatla',
  'America/New_York',
  'America/Nome',
  'America/North_Dakota/Beulah',
  'America/North_Dakota/Center',
  'America/North_Dakota/New_Salem',
  'America/Phoenix',
  'America/Sitka',
  'America/Yakutat',
  'Pacific/Honolulu',
])
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WEBSITE_ASSET_BASE = '/img/kiamina-website'
const CALENDAR_BOOKING_URL = 'https://calendar.app.google/Ph7DtaeNiKSBq7B69'
const CONTACT_CONSULTATION_CALENDAR_ID = 'contact-consultation-calendar'
const WEBSITE_ANALYTICS_SESSION_STORAGE_KEY = 'kiaminaWebsiteAnalyticsSessionId'
const REGION_DETECTION_TIMEOUT_MS = 2200

const SERVICES = [
  {
    title: 'Bookkeeping',
    slug: 'bookkeeping',
    problem: 'Disorganized records create blind spots, slow reporting, and increase compliance risk.',
    outcome: 'Structured, audit-ready records that create control and confidence.',
    fit: 'Growing businesses and nonprofits that need a reliable financial foundation.',
    intro: 'Structured bookkeeping is the operating layer behind reliable reporting, clean compliance, and better decision-making.',
    bullets: [
      'Monthly bookkeeping workflows with disciplined close processes',
      'Chart of accounts aligned with reporting needs',
      'Transaction classification and reconciliation',
    ],
    Icon: BookOpen,
  },
  {
    title: 'Payroll Processing',
    slug: 'payroll-processing',
    problem: 'Manual or poorly managed payroll creates compliance risks, errors, and employee dissatisfaction.',
    outcome: 'Accurate, timely, and compliant payroll that builds trust and meets statutory requirements.',
    fit: 'Businesses and nonprofits with employees requiring structured payroll management.',
    intro: 'Payroll processing ensures employees are paid accurately while maintaining compliance and proper documentation.',
    bullets: [
      'End-to-end payroll processing and payslip generation',
      'PAYE, pension, and statutory deductions',
      'Compliance with Nigerian payroll regulations',
    ],
    Icon: Wallet,
  },
  {
    title: 'Financial Reporting',
    slug: 'financial-reporting',
    problem: 'Delayed or unclear reporting makes timely decision-making difficult.',
    outcome: 'Decision-ready reports that show performance clearly.',
    fit: 'Executives who need visibility without chasing numbers.',
    intro: 'Financial reporting should clarify performance, risk, and priorities.',
    bullets: ['Monthly financial statements', 'Management-ready reporting', 'Structured reporting support'],
    Icon: FileText,
  },
  {
    title: 'Management Reporting',
    slug: 'management-reporting',
    problem: 'Data exists, but not in a form leaders can act on quickly.',
    outcome: 'Clear insight into trends and performance drivers.',
    fit: 'CEOs, founders, and decision-makers.',
    intro: 'Management reporting translates financial data into actionable insight.',
    bullets: ['Performance reporting', 'Trend and variance analysis', 'Executive-ready formats'],
    Icon: BarChart3,
  },
  {
    title: 'Accounts Receivable & Payable',
    slug: 'receivables-payables',
    problem: 'Weak payables and receivables control disrupts liquidity.',
    outcome: 'Improved cash flow and financial discipline.',
    fit: 'Businesses handling recurring transactions.',
    intro: 'Cash discipline depends on structured receivables and payables management.',
    bullets: ['Receivables tracking', 'Payables scheduling', 'Cash cycle management'],
    Icon: Briefcase,
  },
  {
    title: 'CFO Consulting',
    slug: 'cfo-consulting',
    problem: 'Growing organizations need strategic finance support without full-time CFO cost.',
    outcome: 'Executive-level financial insight for better decisions.',
    fit: 'Growth-stage businesses and nonprofits.',
    intro: 'CFO consulting provides leadership-level financial guidance.',
    bullets: ['Strategic financial oversight', 'Decision support', 'Financial structure advisory'],
    Icon: Users,
  },
  {
    title: 'Financial Modelling',
    slug: 'financial-modelling',
    problem: 'Lack of structured projections limits planning and investment decisions.',
    outcome: 'Clear financial projections for growth and planning.',
    fit: 'Businesses and nonprofits planning expansion or funding.',
    intro: 'Financial modelling supports planning, forecasting, and investment decisions.',
    bullets: ['Forecasting and projections', 'Scenario analysis', 'Investment modelling'],
    Icon: LineChart,
  },
  {
    title: 'Tax Compliance',
    slug: 'tax-compliance',
    problem: 'Regulatory complexity creates exposure and penalties.',
    outcome: 'Structured compliance and reduced risk.',
    fit: 'Organizations operating under regulatory requirements.',
    intro: 'Tax compliance should be controlled and predictable.',
    bullets: ['Tax filings and reporting', 'Regulatory compliance', 'Risk reduction'],
    Icon: ShieldCheck,
  },
]

const INDUSTRIES = [
  {
    title: 'Oil & Gas',
    body: 'Support for complex cost structures, regulatory requirements, and reporting needs across capital-intensive operations.',
    Icon: Building2,
  },
  {
    title: 'Real Estate',
    body: 'Financial visibility for project-based operations, asset performance, and cash flow planning.',
    Icon: Building2,
  },
  {
    title: 'ICT',
    body: 'Scalable finance support for fast-moving technology businesses that need clear reporting and operational structure.',
    Icon: Laptop,
  },
  {
    title: 'Construction',
    body: 'Control across contracts, project costs, and financial reporting requirements for execution-heavy businesses.',
    Icon: Hammer,
  },
  {
    title: 'Nonprofits',
    body: 'Transparent reporting, fund accountability, and structured compliance support for mission-driven organizations.',
    Icon: Landmark,
  },
  {
    title: 'Other Service Organizations',
    body: 'Financial systems and reporting clarity for service-led businesses seeking stronger control and profitability insight.',
    Icon: Briefcase,
  },
]

const DIFFERENTIATORS = [
  {
    title: 'Strategic, not clerical',
    body: 'Financial reporting built to inform growth decisions, not simply record transactions.',
    Icon: Search,
  },
  {
    title: 'Multi-country capability',
    body: 'Remote service delivery across Nigeria, Canada, United States, United Kingdom, Australia, and Ireland with consistent standards and professional execution.',
    Icon: Globe2,
  },
  {
    title: 'Precision by design',
    body: 'Structured workflows, reporting discipline, and reliable financial controls.',
    Icon: ShieldCheck,
  },
  {
    title: 'Sector-aware delivery',
    body: 'Financial systems shaped around the realities of complex industries and operating models.',
    Icon: Briefcase,
  },
]

const PROCESS_STEPS = [
  {
    title: 'Book Consultation',
    body: 'Choose a convenient time using the calendar below to schedule your consultation.',
    Icon: CalendarDays,
  },
  {
    title: 'Financial Assessment',
    body: 'Review your current reporting, systems, gaps, and priorities.',
    Icon: Search,
  },
  {
    title: 'Strategy & Execution',
    body: 'Implement the right financial processes, controls, and reporting structure.',
    Icon: Rocket,
  },
  {
    title: 'Ongoing Reporting & Advisory',
    body: 'Maintain visibility through continuous reporting and strategic support.',
    Icon: LineChart,
  },
]

const TESTIMONIALS = [
  {
    text: 'Kiamina Accounting Services has been consistently professional, reliable, and detail-oriented. Their clear communication and timely support significantly improved how we manage our finances and maintain compliance.',
    company: 'Mozisha International Limited',
    country: 'Nigeria',
    tag: 'Nigeria',
    logo: `${WEBSITE_ASSET_BASE}/logos/mozisha.png`,
  },
  {
    text: 'Kiamina delivered accurate and timely financial reports for our UK Companies House and HMRC filings, ensuring full compliance with micro-entities requirements. Their professionalism and precision stood out.',
    company: 'FUTEC Engineering Limited',
    country: 'United Kingdom',
    tag: 'UK',
    logo: `${WEBSITE_ASSET_BASE}/logos/futec.png`,
  },
]

const INSIGHTS = [
  {
    slug: 'costly-accounting-mistakes-nigerian-smes',
    title: '5 Costly Accounting Mistakes Nigerian SMEs Make',
    category: 'SME Accounting',
    readTime: '6 min read',
    summary: 'Avoidable accounting errors can weaken cash flow, distort reporting, create compliance risk, and limit growth. This resource outlines five common mistakes and how SMEs can fix them.',
    sections: [
      {
        heading: 'Introduction',
        body: 'Many SMEs in Nigeria struggle not because of poor products or services, but because of common accounting errors. Neglecting accounting can create serious cash flow problems, penalties, and missed opportunities for growth and investment.',
      },
      {
        heading: 'Mistake 1: Mixing Personal and Business Finances',
        body: 'Always maintain a separate business bank account. Mixing personal and business transactions leads to disorganized records, distorted profit calculations, and unnecessary difficulty during tax reporting.',
      },
      {
        heading: 'Mistake 2: Not Keeping Proper Financial Records',
        body: 'Accurate records are the foundation of reliable reporting and informed decision-making.',
        bullets: [
          'Maintain receipts, invoices, and bank statements in an organized manner.',
          'Use digital bookkeeping tools to improve consistency and save time.',
          'Ensure transactions are properly categorized and documented.',
        ],
      },
      {
        heading: 'Mistake 3: Ignoring Tax Compliance',
        body: 'Tax compliance is non-negotiable. Missed obligations can result in penalties, disruption, and avoidable legal exposure.',
        bullets: [
          'File and pay all applicable taxes on time, including PAYE, VAT, withholding tax, and company or personal income tax where relevant.',
          'Stay current with changes in tax law and reporting requirements.',
          'Seek professional guidance where complexity exists.',
        ],
      },
      {
        heading: 'Mistake 4: Failing to Reconcile Accounts',
        body: 'Regular bank reconciliation ensures that transactions are properly captured and records align with bank activity. Missing reconciliations can hide fraud, accounting errors, or cash shortages.',
      },
      {
        heading: 'Mistake 5: Neglecting Management Reporting',
        body: 'Monthly management reports help track revenue, expenses, profitability, and performance trends. Without them, decision-making becomes reactive and imprecise.',
      },
    ],
    cta: 'Do not let accounting mistakes hold your business back. Kiamina Accounting Services helps SMEs stay compliant, organized, and profitable.',
  },
  {
    slug: 'fund-reporting-mistakes-nonprofits',
    title: '5 Critical Fund Reporting Mistakes Nonprofits Must Avoid',
    category: 'Nonprofit Finance',
    readTime: '6 min read',
    summary: 'Maintain transparency and donor trust by avoiding common fund reporting errors. This guide outlines five critical mistakes and how nonprofits can correct them.',
    sections: [
      {
        heading: 'Introduction',
        body: 'Nonprofits rely on diverse funding streams including grants, donations, membership fees, and government allocations. Accurate fund reporting is essential for transparency, compliance, and donor trust.',
      },
      {
        heading: 'Mistake 1: Failing to Separate Funds by Purpose',
        body: 'Each fund or grant should have its own reporting structure. Mixing funds makes accurate reporting difficult and risks misuse.',
        bullets: ['Use fund codes to track each funding source and purpose.'],
      },
      {
        heading: 'Mistake 2: Not Tracking Restricted vs. Unrestricted Funds',
        body: 'Restricted funds must only be used for designated purposes, while unrestricted funds support general operations. Misuse can lead to donor and legal issues.',
      },
      {
        heading: 'Mistake 3: Late or Inaccurate Grant Reporting',
        body: 'Grants often require periodic reporting. Delays or inaccuracies can affect future funding.',
        bullets: ['Maintain a reporting calendar.', 'Document all expenditures clearly.'],
      },
      {
        heading: 'Mistake 4: Ignoring Internal Controls',
        body: 'Weak approval processes increase risk of error and fraud.',
        bullets: ['Implement dual approvals.', 'Maintain supporting documentation.', 'Reconcile accounts monthly.'],
      },
      {
        heading: 'Mistake 5: Not Reconciling Accounts Regularly',
        body: 'Regular reconciliation ensures accuracy of fund balances and prevents hidden discrepancies.',
      },
    ],
    cta: 'Proper fund reporting protects your nonprofit and builds donor confidence. Kiamina Accounting Services helps nonprofits stay compliant, organized, and transparent.',
  },
  {
    slug: 'payroll-guide-nigeria',
    title: 'Payroll Made Simple: A Step-by-Step Guide for Nigerian SMEs and Nonprofits',
    category: 'Payroll & Compliance',
    readTime: '8 min read',
    summary: 'A practical step-by-step guide to setting up and managing compliant payroll in Nigeria, covering employee records, deductions, statutory obligations, and common payroll mistakes.',
    sections: [
      {
        heading: 'Introduction',
        body: 'Payroll is a critical function for any Nigerian SME or nonprofit. Accurate and timely payroll processing supports employee satisfaction, legal compliance, and financial stability.',
      },
      {
        heading: 'Step 1: Set Up Employee Records',
        body: 'Comprehensive employee records are the foundation of accurate payroll. Maintain full employee details including salary, bank information, pension details, tax identification, address, attendance, and leave records.',
      },
      {
        heading: 'Step 2: Calculate Gross Pay',
        body: 'Gross pay includes basic salary, allowances, and overtime pay where applicable. Each element should be consistently documented and calculated according to employment terms and labour rules.',
      },
      {
        heading: 'Step 3: Deduct Employee Contributions and Taxes',
        body: 'Apply payroll deductions accurately, including PAYE tax, pension contributions, and any other lawful deductions relevant to the employee.',
        bullets: ['Use current tax tables and statutory rules.', 'Remit all deductions on time to avoid penalties.'],
      },
      {
        heading: 'Step 4: Generate Pay Slips',
        body: 'Each payslip should clearly show gross pay, deductions, net pay, pay period, and employer details. Payroll records should be retained accurately for statutory and operational purposes.',
      },
      {
        heading: 'Common Payroll Mistakes Organisations Make',
        bullets: ['Misclassifying employees', 'Incorrect tax calculations', 'Late remittances', 'Poor record-keeping', 'Ignoring changes in legislation'],
      },
    ],
    cta: 'Kiamina Accounting Services offers payroll management and consultation support to help SMEs and nonprofits streamline payroll, ensure compliance, and save time.',
  },
]

const SOCIAL_LINKS = [
  { name: 'LinkedIn', href: 'https://www.linkedin.com/company/kiamina-accounting-services/' },
  { name: 'Facebook', href: 'https://www.facebook.com/share/1BDKLXtn13/' },
  { name: 'Instagram', href: 'https://www.instagram.com/kiaminaas?igsh=NGZxajlod3ZidTJp' },
  { name: 'TikTok', href: 'https://www.tiktok.com/@kiaminaas?_r=1&_t=ZS-92eYTA4KBgF' },
  { name: 'X', href: 'https://x.com/Kiaminaas?t=7AvK5KaUoEweNxa4173HpA&s=08' },
  { name: 'Pinterest', href: 'http://pinterest.com/kiaminaas/' },
]

function generateWebsiteAnalyticsSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `website-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeDetectedRegionId(regionId = '') {
  const normalizedRegionId = String(regionId || '').trim().toLowerCase()
  return REGION_ID_SET.has(normalizedRegionId) ? normalizedRegionId : ''
}

function resolveRegionIdFromCountryCode(countryCode = '') {
  const normalizedCountryCode = String(countryCode || '').trim().toUpperCase()
  return normalizeDetectedRegionId(REGION_ID_BY_COUNTRY_CODE[normalizedCountryCode])
}

function resolveRegionIdFromCountryName(countryName = '') {
  const normalizedCountryName = String(countryName || '').trim().toLowerCase()
  return normalizeDetectedRegionId(REGION_ID_BY_COUNTRY_NAME[normalizedCountryName])
}

function extractCountryCodeFromLocale(locale = '') {
  const rawLocale = String(locale || '').trim()
  if (!rawLocale) return ''

  try {
    if (typeof Intl !== 'undefined' && typeof Intl.Locale === 'function') {
      return String(new Intl.Locale(rawLocale).region || '').trim().toUpperCase()
    }
  } catch {
    // Fall back to manual parsing for older browsers or unusual locale strings.
  }

  const match = rawLocale.match(/[-_]([a-z]{2})(?:[-_]|$)/i)
  return String(match?.[1] || '').trim().toUpperCase()
}

function inferRegionFromLocaleSignals() {
  if (typeof navigator === 'undefined') return ''
  const locales = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ]

  for (const locale of locales) {
    const regionId = resolveRegionIdFromCountryCode(extractCountryCodeFromLocale(locale))
    if (regionId) return regionId
  }

  return ''
}

function inferRegionFromTimeZone() {
  if (typeof Intl === 'undefined') return ''
  const timeZone = String(Intl.DateTimeFormat().resolvedOptions().timeZone || '').trim()
  if (!timeZone) return ''
  if (REGION_ID_BY_TIME_ZONE[timeZone]) return REGION_ID_BY_TIME_ZONE[timeZone]
  if (CANADA_TIME_ZONES.has(timeZone)) return 'canada'
  if (UNITED_STATES_TIME_ZONES.has(timeZone)) return 'united-states'
  if (timeZone.startsWith('Australia/')) return 'australia'
  return ''
}

function inferRegionFromClientSignals() {
  return inferRegionFromTimeZone() || inferRegionFromLocaleSignals() || 'nigeria'
}

async function detectRegionFromIpAddress({ signal } = {}) {
  if (typeof fetch !== 'function') return ''

  try {
    const response = await fetch('https://ipapi.co/json/', {
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal,
    })
    if (!response.ok) return ''
    const payload = await response.json().catch(() => ({}))
    return (
      resolveRegionIdFromCountryCode(payload?.country_code) ||
      resolveRegionIdFromCountryName(payload?.country_name) ||
      ''
    )
  } catch {
    return ''
  }
}

function getSupportedRegionId(regionId = '') {
  return normalizeDetectedRegionId(regionId) || 'nigeria'
}

function getLocationDetectionLabel({ isResolved = false, regionLabel = '' } = {}) {
  return isResolved ? regionLabel : 'Detecting region...'
}

function getLocationDetectionAriaLabel({ isResolved = false, regionLabel = '' } = {}) {
  return isResolved ? `Detected region: ${regionLabel}` : 'Detecting your region'
}

function getRegionFlagAlt({ isResolved = false, regionLabel = '' } = {}) {
  return isResolved ? `${regionLabel} flag` : 'Detected region flag'
}

function getManualRegionSelectionMetadata(region = {}) {
  return {
    detectionSource: 'manual',
    regionId: region.id || '',
    regionLabel: region.label || '',
  }
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
      <div className={`grid place-items-center rounded-xl border border-dashed border-[#153585]/35 bg-[#f5f8ff] text-center text-sm font-semibold text-[#153585] ${className}`}>
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

function SectionHeading({ eyebrow, title, body = '', invert = false }) {
  return (
    <div className="max-w-3xl">
      <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">
        {eyebrow}
      </div>
      <h2 className={`mt-4 text-3xl font-semibold tracking-tight sm:text-4xl ${invert ? 'text-white' : 'text-slate-950'}`}>
        {title}
      </h2>
      {body ? (
        <p className={`mt-5 text-lg leading-8 ${invert ? 'text-blue-100' : 'text-slate-600'}`}>{body}</p>
      ) : null}
    </div>
  )
}

function IconBadge({ icon: Icon, dark = false }) {
  return (
    <div className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${dark ? 'bg-white/10 text-[#6491DE] ring-1 ring-white/10' : 'border border-[#D9E3F4] bg-[#F1F1F1] text-[#073D7F]'}`}>
      <Icon className="h-5 w-5" />
    </div>
  )
}

function SocialIcon({ name, className = 'h-4 w-4' }) {
  if (name === 'LinkedIn') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M6.94 8.5H3.56V20h3.38V8.5ZM5.25 3A2.03 2.03 0 0 0 3.2 5.03c0 1.12.91 2.03 2.02 2.03h.03a2.03 2.03 0 1 0 0-4.06ZM20.44 12.88c0-3.46-1.85-5.07-4.31-5.07-1.99 0-2.88 1.09-3.38 1.86V8.5H9.38c.04.78 0 11.5 0 11.5h3.37v-6.42c0-.34.03-.68.13-.92.27-.67.89-1.37 1.93-1.37 1.36 0 1.9 1.03 1.9 2.55V20h3.37v-7.12Z" />
      </svg>
    )
  }
  if (name === 'Facebook') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M13.5 21v-7h2.3l.4-2.8h-2.7V9.45c0-.81.22-1.37 1.39-1.37H16.3V5.56c-.24-.03-1.08-.1-2.06-.1-2.04 0-3.44 1.24-3.44 3.52v2.22H8.5V14h2.3v7h2.7Z" />
      </svg>
    )
  }
  if (name === 'Instagram') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2.2A2.8 2.8 0 0 0 4.2 7v10A2.8 2.8 0 0 0 7 19.8h10a2.8 2.8 0 0 0 2.8-2.8V7A2.8 2.8 0 0 0 17 4.2H7Zm5 3.3A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5Zm0 2.2A2.3 2.3 0 1 0 14.3 12 2.3 2.3 0 0 0 12 9.7Zm4.7-3.15a1.05 1.05 0 1 1-1.05 1.05 1.05 1.05 0 0 1 1.05-1.05Z" />
      </svg>
    )
  }
  if (name === 'TikTok') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M14.5 3c.53 1.52 1.46 2.67 2.8 3.46.8.47 1.66.75 2.7.82v2.68a7.7 7.7 0 0 1-2.67-.52 8.03 8.03 0 0 1-1.87-1.04v6.1c0 1.25-.4 2.35-1.18 3.29A5.64 5.64 0 0 1 9.8 20a5.58 5.58 0 0 1-3.54-1.31A5.39 5.39 0 0 1 4 14.33a5.34 5.34 0 0 1 1.82-4.05A5.63 5.63 0 0 1 9.7 8.9v2.66a2.85 2.85 0 0 0-1.92.6 2.67 2.67 0 0 0-.98 2.13c0 .84.29 1.53.88 2.08.58.54 1.28.8 2.1.8.9 0 1.63-.3 2.18-.92.56-.61.84-1.42.84-2.4V3h2.68Z" />
      </svg>
    )
  }
  if (name === 'X') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M18.9 2H22l-6.76 7.73L23.2 22H17l-4.85-5.96L6.94 22H3.82l7.23-8.26L1.4 2h6.35l4.38 5.44L18.9 2Zm-1.08 18.14h1.72L6.82 3.76H4.97l12.85 16.38Z" />
      </svg>
    )
  }
  if (name === 'Pinterest') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M12.04 2C6.6 2 3 5.64 3 10.49c0 3.1 1.74 4.86 2.79 4.86.43 0 .68-1.2.68-1.53 0-.4-1.02-1.26-1.02-2.96 0-3.51 2.67-6 6.45-6 3.13 0 5.45 1.78 5.45 5.05 0 2.44-.98 7.02-4.15 7.02-1.15 0-2.14-.85-2.14-2.02 0-1.75 1.22-3.45 1.22-5.26 0-3.14-4.45-2.57-4.45 1.22 0 .8.1 1.68.46 2.4-.67 2.88-2.05 7.16-2.05 10.08 0 .92.13 1.83.2 2.75.14.15.07.13.28.06 2.05-2.82 1.98-3.37 2.91-7.08.5.95 1.8 1.45 2.82 1.45 4.33 0 6.28-4.21 6.28-8.05C20.5 5.3 16.8 2 12.04 2Z" />
      </svg>
    )
  }
  return null
}

function SocialBadge({ href, name }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={name}
      aria-label={name}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#D9E3F4] bg-white text-[#073D7F] transition hover:-translate-y-0.5 hover:border-[#6491DE] hover:bg-[#F1F1F1] hover:text-[#6491DE]"
    >
      <SocialIcon name={name} />
    </a>
  )
}

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
  const [isPreliminaryPageLoading, setIsPreliminaryPageLoading] = useState(true)
  const [activeInsightSlug, setActiveInsightSlug] = useState(INSIGHTS[0].slug)
  const [newsletterForm, setNewsletterForm] = useState({ fullName: '', email: '' })
  const [newsletterStatus, setNewsletterStatus] = useState('idle')
  const [newsletterMessage, setNewsletterMessage] = useState('')
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    company: '',
    service: '',
    message: '',
  })
  const [contactStatus, setContactStatus] = useState('idle')
  const [contactMessage, setContactMessage] = useState('')

  const regionsRef = useRef(null)
  const analyticsSessionIdRef = useRef('')
  const pageLoadingFrameRef = useRef(0)
  const manualRegionSelectionRef = useRef(false)
  const pendingConsultationScrollRef = useRef(false)

  const resolvedPage = useMemo(
    () => (NAV_ITEMS.some((item) => item.id === activePage) ? activePage : 'home'),
    [activePage],
  )

  const selectedRegion = useMemo(
    () => REGION_ITEMS.find((item) => item.id === selectedRegionId) || REGION_ITEMS[0],
    [selectedRegionId],
  )

  const activeInsight = useMemo(
    () => INSIGHTS.find((item) => item.slug === activeInsightSlug) || INSIGHTS[0],
    [activeInsightSlug],
  )

  useEffect(() => {
    setMobileOpen(false)
    setRegionsOpen(false)
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
    const abortController = typeof AbortController === 'function' ? new AbortController() : null
    const timeoutId = typeof window !== 'undefined' && abortController
      ? window.setTimeout(() => abortController.abort(), REGION_DETECTION_TIMEOUT_MS)
      : 0

    const applyDetectedRegion = (regionId) => {
      if (isCancelled || manualRegionSelectionRef.current) return
      setSelectedRegionId(getSupportedRegionId(regionId))
      setIsRegionResolved(true)
    }

    applyDetectedRegion(inferRegionFromClientSignals())
    setIsRegionResolved(true)

    void detectRegionFromIpAddress({ signal: abortController?.signal })
      .then((regionId) => {
        if (regionId) applyDetectedRegion(regionId)
      })
      .finally(() => {
        if (typeof window !== 'undefined' && timeoutId) {
          window.clearTimeout(timeoutId)
        }
        if (!isCancelled && !manualRegionSelectionRef.current) {
          setIsRegionResolved(true)
        }
      })

    return () => {
      isCancelled = true
      if (typeof window !== 'undefined' && timeoutId) {
        window.clearTimeout(timeoutId)
      }
      if (abortController) {
        abortController.abort()
      }
    }
  }, [])

  useEffect(() => {
    setIsPreliminaryPageLoading(true)
    if (typeof window === 'undefined') {
      setIsPreliminaryPageLoading(false)
      return undefined
    }

    if (pageLoadingFrameRef.current) {
      window.cancelAnimationFrame(pageLoadingFrameRef.current)
    }

    pageLoadingFrameRef.current = window.requestAnimationFrame(() => {
      pageLoadingFrameRef.current = 0
      setIsPreliminaryPageLoading(false)
    })

    return undefined
  }, [resolvedPage])

  useEffect(() => () => {
    if (typeof window !== 'undefined' && pageLoadingFrameRef.current) {
      window.cancelAnimationFrame(pageLoadingFrameRef.current)
    }
  }, [])

  useEffect(() => {
    if (!pendingConsultationScrollRef.current || resolvedPage !== 'contact' || isPreliminaryPageLoading) {
      return undefined
    }
    if (typeof window === 'undefined') return undefined

    const timeoutId = window.setTimeout(() => {
      pendingConsultationScrollRef.current = false
      document
        .getElementById(CONTACT_CONSULTATION_CALENDAR_ID)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)

    return () => window.clearTimeout(timeoutId)
  }, [isPreliminaryPageLoading, resolvedPage])

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
    void apiFetch('/notifications/insights/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        eventType,
        page,
        targetType,
        targetId,
        targetLabel,
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
      }),
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

  const handleBookConsultation = () => {
    pendingConsultationScrollRef.current = true
    setMobileOpen(false)
    trackWebsiteEvent({
      eventType: 'cta_click',
      page: resolvedPage,
      targetType: 'calendar',
      targetId: CONTACT_CONSULTATION_CALENDAR_ID,
      targetLabel: 'Book Consultation',
    })

    if (resolvedPage !== 'contact') {
      handleNavigate('contact')
      return
    }

    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      pendingConsultationScrollRef.current = false
      document
        .getElementById(CONTACT_CONSULTATION_CALENDAR_ID)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const submitNewsletter = async (event) => {
    event.preventDefault()
    const normalizedEmail = String(newsletterForm.email || '').trim()
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setNewsletterStatus('error')
      setNewsletterMessage('Please enter a valid email address.')
      return
    }

    setNewsletterStatus('loading')
    setNewsletterMessage('Connecting your subscription...')
    const registration = await registerNewsletterSubscriberLead({
      contactEmail: normalizedEmail,
      fullName: newsletterForm.fullName,
      serviceFocus: 'Accounting, compliance, payroll, and reporting insights',
      capturePage: resolvedPage,
      capturePath: typeof window !== 'undefined' ? window.location.pathname : '',
    })

    if (!registration.ok) {
      setNewsletterStatus('error')
      setNewsletterMessage(registration.message || 'Unable to subscribe right now.')
      return
    }

    setNewsletterStatus('success')
    setNewsletterMessage('Thank you. You are subscribed for Kiamina insights.')
    setNewsletterForm({ fullName: '', email: '' })
    trackWebsiteEvent({
      eventType: 'newsletter_subscribe',
      page: resolvedPage,
      targetType: 'form',
      targetId: 'newsletter-form',
      targetLabel: 'Newsletter Subscription',
    })
  }

  const submitContact = async (event) => {
    event.preventDefault()
    if (contactStatus === 'loading') return

    const normalizedName = String(contactForm.name || '').trim()
    const normalizedEmail = String(contactForm.email || '').trim()
    const normalizedCompany = String(contactForm.company || '').trim()
    const normalizedService = String(contactForm.service || '').trim()
    const normalizedMessage = String(contactForm.message || '').trim()

    if (normalizedName.length < 2 || !EMAIL_REGEX.test(normalizedEmail) || normalizedMessage.length < 10) {
      setContactStatus('error')
      setContactMessage('Please fill in your name, valid email, and message.')
      return
    }

    setContactStatus('loading')
    setContactMessage('')

    try {
      const response = await apiFetch('/notifications/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        skipAuthRefreshRetry: true,
        body: JSON.stringify({
          name: normalizedName,
          email: normalizedEmail,
          company: normalizedCompany,
          service: normalizedService,
          message: normalizedMessage,
        }),
      })
      const responseBody = await response.json().catch(() => ({}))

      if (!response.ok) {
        setContactStatus('error')
        setContactMessage(responseBody?.message || 'Unable to send your message right now. Please try again shortly.')
        return
      }

      try {
        await apiFetch('/users/public/support-leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          skipAuthRefreshRetry: true,
          body: JSON.stringify({
            fullName: normalizedName,
            email: normalizedEmail,
            companyName: normalizedCompany,
            capturePage: 'contact',
            capturePath: typeof window !== 'undefined' ? window.location.pathname : '',
            source: 'contact-form',
            status: 'new',
            interest: normalizedService,
            notes: normalizedMessage,
          }),
        })
      } catch {
        // Email delivery already succeeded; support lead sync can retry through other lead capture flows.
      }
    } catch {
      setContactStatus('error')
      setContactMessage('Unable to reach the contact service right now. Please try again shortly.')
      return
    }

    setContactStatus('success')
    setContactMessage('Thank you. Your message has been sent and our team will respond shortly.')
    trackWebsiteEvent({
      eventType: 'contact_submit',
      page: 'contact',
      targetType: 'form',
      targetId: 'contact-form',
      targetLabel: 'Contact Form Submission',
      metadata: {
        company: normalizedCompany,
        service: normalizedService,
      },
    })
    setContactForm({ name: '', email: '', company: '', service: '', message: '' })
  }

  const primaryButtonClass = 'inline-flex items-center justify-center rounded-full bg-[#153585] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(21,53,133,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1f4aa8] hover:shadow-[0_18px_36px_rgba(21,53,133,0.3)]'
  const secondaryButtonClass = 'inline-flex items-center justify-center rounded-full border border-[#153585]/25 bg-white px-6 py-3 text-sm font-semibold text-[#153585] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#153585]/45 hover:shadow-[0_10px_18px_rgba(21,53,133,0.12)]'

  const renderHeroSection = ({
    eyebrow,
    title,
    body,
    image,
    children = null,
    large = false,
  }) => (
    <section className={`relative overflow-hidden bg-[#073D7F] text-white ${large ? '' : 'py-24'}`}>
      <div className="absolute inset-0">
        <img
          src={`${WEBSITE_ASSET_BASE}/${image}`}
          alt=""
          className="h-full w-full object-cover opacity-25"
        />
      </div>
      <div className="absolute inset-0 bg-[#073D7F]/20" />
      <div className={`relative mx-auto max-w-7xl px-6 lg:px-8 ${large ? 'grid gap-14 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-28' : ''}`}>
        <div className="max-w-5xl">
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">
            {eyebrow}
          </div>
          <h1 className={`mt-4 font-semibold tracking-tight ${large ? 'max-w-4xl text-4xl leading-tight sm:text-5xl lg:text-6xl' : 'text-4xl sm:text-5xl'}`}>
            {title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-blue-100">{body}</p>
          {children}
        </div>
      </div>
    </section>
  )

  const renderNewsletterSection = () => (
    <section className="border-t border-[#D9E3F4] bg-white">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid gap-8 rounded-[2rem] bg-[#073D7F] px-8 py-10 text-white lg:grid-cols-[1fr_auto] lg:items-center lg:px-10">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">
              Email subscription
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              Stay informed with practical finance, payroll, and compliance insights.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-blue-100">
              Subscribe to receive clear, practical insights on accounting, tax compliance, payroll, and financial strategy.
            </p>
          </div>
          <form onSubmit={submitNewsletter} className="grid gap-3 sm:grid-cols-[1fr_auto] lg:min-w-[420px]">
            <input
              type="text"
              value={newsletterForm.fullName}
              onChange={(event) => setNewsletterForm((prev) => ({ ...prev, fullName: event.target.value }))}
              placeholder="Full name"
              className="rounded-full border border-white/10 bg-white px-5 py-3 text-sm text-slate-900 outline-none"
            />
            <input
              type="email"
              value={newsletterForm.email}
              onChange={(event) => setNewsletterForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="Email address"
              className="rounded-full border border-white/10 bg-white px-5 py-3 text-sm text-slate-900 outline-none"
            />
            <button
              type="submit"
              disabled={newsletterStatus === 'loading'}
              className="rounded-full bg-[#6491DE] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#4F7FD1] disabled:cursor-not-allowed disabled:opacity-70 sm:col-span-2 lg:col-span-1"
            >
              {newsletterStatus === 'loading' ? 'Connecting...' : 'Subscribe'}
            </button>
            {newsletterMessage ? (
              <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm leading-7 text-blue-100 sm:col-span-2">
                {newsletterMessage}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  )

  const renderConsultationSection = () => (
    <section className="bg-[#F1F1F1]">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
        <SectionHeading
          eyebrow="Book a Consultation"
          title="Gain financial clarity. Make better decisions. Scale with confidence."
          body="Schedule a focused consultation to assess your financial structure, reporting gaps, and growth priorities."
        />
        <div className="rounded-[2rem] bg-white p-5 shadow-xl ring-1 ring-[#D9E3F4]">
          <div className="mb-6 rounded-2xl border border-[#D9E3F4] bg-[#F1F1F1] p-5">
            <div className="text-sm font-semibold text-[#073D7F]">
              What happens after booking:
            </div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Review of your current accounting and reporting setup</li>
              <li>Identification of gaps and risks</li>
              <li>Clear recommendation on next steps</li>
            </ul>
          </div>
          <div className="overflow-hidden rounded-[1.5rem] border border-[#D9E3F4] bg-[#F1F1F1]">
            <iframe
              src={CALENDAR_BOOKING_URL}
              title="Book a consultation with Kiamina Accounting Services"
              className="h-[560px] w-full"
            />
          </div>
        </div>
      </div>
    </section>
  )

  const renderHomePage = () => (
    <>
      <section className="relative overflow-hidden bg-[#073D7F] text-white">
        <div className="absolute inset-0">
          <img
            src={`${WEBSITE_ASSET_BASE}/hero.png`}
            alt="Financial professionals"
            className="h-full w-full object-cover opacity-30"
          />
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-14 px-6 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-28">
          <div>
            <div className="mb-6 inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-blue-100">
              Serving businesses and nonprofits across Nigeria, Canada, United States, United Kingdom, Australia, and Ireland
            </div>
            <h1 className="max-w-4xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Financial clarity that strengthens control, improves decisions, and supports scalable growth.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-blue-100">
              CFO-level insight, structured financial systems, and decision-ready reporting for businesses and nonprofits that expect more than routine accounting.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <button type="button" onClick={() => handleNavigate('contact')} className="rounded-full bg-[#6491DE] px-7 py-3.5 text-center text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#4F7FD1]">
                Book a Free Consultation
              </button>
              <button type="button" onClick={() => handleNavigate('services')} className="rounded-full border border-white/20 px-7 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-white/5">
                See How We Can Help
              </button>
            </div>
            <p className="mt-4 text-sm text-blue-100">
              No obligation. We will review your accounting, reporting, payroll, or compliance needs and recommend the right next step.
            </p>
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {[
                'Nigeria-based firm serving clients across six active markets',
                'CFO-level insight without full-time CFO cost',
                'Clear reporting built for executive decisions',
                'Remote delivery with structured financial systems',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-blue-100 shadow-2xl shadow-black/10">
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur">
            <div className="rounded-[1.5rem] bg-white p-6 text-slate-900">
              <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">
                Executive Finance Snapshot
              </div>
              <div className="mt-5 grid gap-4">
                <div className="rounded-2xl bg-[#F1F1F1] p-5">
                  <div className="text-sm text-slate-500">Reporting standard</div>
                  <div className="mt-2 text-2xl font-semibold">Decision-ready monthly reporting</div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[#F1F1F1] p-5">
                    <div className="text-sm text-slate-500">Delivery model</div>
                    <div className="mt-2 text-lg font-semibold">Remote across 6 countries</div>
                  </div>
                  <div className="rounded-2xl bg-[#F1F1F1] p-5">
                    <div className="text-sm text-slate-500">Strategic value</div>
                    <div className="mt-2 text-lg font-semibold">CFO-level guidance</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-[#073D7F] p-5 text-white">
                  <div className="text-sm text-blue-100">Built for</div>
                  <div className="mt-2 text-lg font-semibold">Founders, CEOs, CFOs, and serious growth-stage businesses</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#D9E3F4] bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 md:grid-cols-4 lg:px-8">
          {[
            'Serving clients across 6 active markets',
            'Trusted by businesses and nonprofits',
            'CFO-level insight without full-time CFO cost',
            'Structured reporting, payroll, and compliance support',
          ].map((item) => (
            <div key={item} className="rounded-2xl border border-[#D9E3F4] bg-[#F1F1F1] p-5 text-sm font-semibold leading-6 text-[#073D7F]">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
          <SectionHeading
            eyebrow="Who We Help"
            title="Built for leaders who need financial clarity, not just bookkeeping."
            body="Kiamina supports organizations that need reliable records, stronger compliance, better reporting, and strategic financial visibility."
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                title: 'Growing Businesses',
                body: 'For founders and CEOs who need clean books, better reporting, and stronger financial control.',
              },
              {
                title: 'Nonprofits',
                body: 'For organizations that need fund accountability, transparent reporting, and compliance discipline.',
              },
              {
                title: 'International Operators',
                body: 'For businesses and nonprofits needing remote accounting support across Nigeria, UK, US, Canada, Australia, and Ireland.',
              },
            ].map((item) => (
              <div key={item.title} className="rounded-[1.75rem] border border-[#D9E3F4] bg-[#F1F1F1] p-7">
                <h3 className="text-xl font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-4 text-sm leading-7 text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <SectionHeading
          eyebrow="Services"
          title="Financial operations, reporting, and strategic advisory designed for businesses and nonprofits that need clarity at leadership level."
          body="Each service is structured around an organizational problem, the operating outcome it delivers, and the type of organization it best supports."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {SERVICES.map((service) => (
            <div key={service.title} className="rounded-[1.75rem] border border-[#D9E3F4] bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
              <IconBadge icon={service.Icon} />
              <h3 className="text-xl font-semibold text-slate-950">{service.title}</h3>
              <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600">
                <p><span className="font-semibold text-slate-900">Problem:</span> {service.problem}</p>
                <p><span className="font-semibold text-slate-900">Outcome:</span> {service.outcome}</p>
                <p><span className="font-semibold text-slate-900">Best suited for:</span> {service.fit}</p>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => handleNavigate('services')} className="mt-10 inline-flex rounded-full bg-[#073D7F] px-6 py-3 text-sm font-semibold text-white">
          Explore all services
        </button>
      </section>

      <section className="bg-[#F1F1F1]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <SectionHeading
              eyebrow="Why Kiamina"
              title="A financial growth partner for leaders who need precision, visibility, and strategic finance capability."
              body="Kiamina delivers financial accuracy, reporting clarity, and strategic finance support in one operating model."
            />
            <div className="grid gap-6 sm:grid-cols-2">
              {DIFFERENTIATORS.map((item) => (
                <div key={item.title} className="rounded-[1.75rem] bg-white p-7 shadow-sm ring-1 ring-[#D9E3F4]">
                  <IconBadge icon={item.Icon} />
                  <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <SectionHeading
          eyebrow="Industries Served"
          title="Financial support shaped around operational complexity, regulatory demands, and sector-specific reporting needs."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {INDUSTRIES.map((industry) => (
            <div key={industry.title} className="rounded-[1.75rem] border border-[#D9E3F4] bg-white p-7 transition hover:-translate-y-1 hover:shadow-lg">
              <IconBadge icon={industry.Icon} />
              <div className="text-lg font-semibold text-slate-950">{industry.title}</div>
              <p className="mt-3 text-sm leading-7 text-slate-600">{industry.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#073D7F] text-white">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
          <SectionHeading
            eyebrow="How It Works"
            title="A clean process that reduces friction and builds confidence from the first conversation."
            invert
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {PROCESS_STEPS.map((step, index) => (
              <div key={step.title} className="rounded-[1.75rem] border border-white/10 bg-white/5 p-7">
                <IconBadge icon={step.Icon} dark />
                <div className="text-sm font-semibold text-[#6491DE]">0{index + 1}</div>
                <div className="mt-4 text-xl font-semibold">{step.title}</div>
                <p className="mt-3 text-sm leading-7 text-blue-100">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2">
          {TESTIMONIALS.map((testimonial) => (
            <div key={testimonial.company} className="flex flex-col justify-between rounded-[1.75rem] bg-[#F1F1F1] p-10 ring-1 ring-[#D9E3F4]">
              <p className="text-xl leading-8 text-slate-700">"{testimonial.text}"</p>
              <div className="mt-8 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#D9E3F4] bg-white p-2">
                    <img src={testimonial.logo} alt={testimonial.company} className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{testimonial.company}</div>
                    <div className="text-xs text-slate-500">{testimonial.country}</div>
                  </div>
                </div>
                <span className="rounded-full border border-[#D9E3F4] bg-white px-3 py-1 text-xs text-slate-700">
                  {testimonial.tag}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {renderNewsletterSection()}
      {renderConsultationSection()}
      <div className="fixed bottom-4 left-1/2 z-50 w-[92%] max-w-md -translate-x-1/2 lg:hidden">
        <button
          type="button"
          onClick={() => handleNavigate('contact')}
          className="block w-full rounded-full bg-[#073D7F] px-6 py-4 text-center text-sm font-semibold text-white shadow-xl"
        >
          Book a Free Consultation (Limited Slots Weekly)
        </button>
      </div>
    </>
  )

  const renderAboutPage = () => (
    <>
      {renderHeroSection({
        eyebrow: 'About Kiamina',
        title: 'A Nigeria-based accounting and advisory firm built for business leaders who need more than basic compliance.',
        body: 'Kiamina Accounting Services combines financial accuracy, reporting clarity, and strategic finance support for companies operating across multiple jurisdictions.',
        image: 'about.png',
      })}
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <img
          src={`${WEBSITE_ASSET_BASE}/about.png`}
          alt="About Kiamina Accounting Services"
          className="mb-10 h-[360px] w-full rounded-[2rem] object-cover"
        />
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">Our Mission</div>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              To empower businesses and nonprofits with accurate accounting systems, compliant tax structures, and strategic financial insight that support long term growth, transparency, and accountability.
            </p>
            <div className="mt-10 text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">Our Vision</div>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              To redefine accounting and financial advisory as a strategic growth engine for businesses and mission-driven organizations worldwide.
            </p>
          </div>
          <div className="rounded-[2rem] border border-[#D9E3F4] bg-[#F1F1F1] p-8">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">Core Values</div>
            <ul className="mt-6 space-y-4 text-sm leading-7 text-slate-600">
              {[
                ['Accuracy', 'Precision in financial reporting and data integrity underpins every engagement.'],
                ['Integrity', 'We operate with uncompromising ethical standards and transparent accountability.'],
                ['Compliance', 'Strict adherence to statutory, regulatory, and professional requirements across all jurisdictions.'],
                ['Partnership', 'Long-term client relationships built on trust, alignment, and shared objectives.'],
                ['Continuous Improvement', 'Ongoing refinement of processes, systems, and expertise in response to evolving environments.'],
              ].map(([title, body]) => (
                <li key={title}>
                  <span className="font-semibold text-slate-900">{title}:</span> {body}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section className="bg-[#F1F1F1]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
          <SectionHeading
            eyebrow="Why clients choose Kiamina"
            title="Built for executives who value control, precision, and professional execution."
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {DIFFERENTIATORS.map((item) => (
              <div key={item.title} className="rounded-[1.75rem] bg-white p-7 shadow-sm ring-1 ring-[#D9E3F4]">
                <IconBadge icon={item.Icon} />
                <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )

  const renderServicesPage = () => (
    <>
      {renderHeroSection({
        eyebrow: 'Services',
        title: 'Accounting, reporting, compliance, and strategic finance support designed for serious businesses.',
        body: 'Each capability is designed to improve financial visibility, strengthen control, and support better leadership decisions.',
        image: 'services.png',
      })}
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="grid gap-8">
          {SERVICES.map((service) => (
            <div key={service.slug} className="rounded-[2rem] border border-[#D9E3F4] bg-white p-8 shadow-sm lg:p-10">
              <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
                <div>
                  <IconBadge icon={service.Icon} />
                  <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">
                    {service.title}
                  </div>
                  <p className="mt-4 text-lg leading-8 text-slate-600">{service.intro}</p>
                </div>
                <div>
                  <div className="grid gap-5 md:grid-cols-3">
                    {[
                      ['Problem', service.problem],
                      ['Outcome', service.outcome],
                      ['Best suited for', service.fit],
                    ].map(([label, detail]) => (
                      <div key={label} className="rounded-2xl bg-[#F1F1F1] p-5">
                        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</div>
                        <p className="mt-3 text-sm leading-7 text-slate-700">{detail}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 grid gap-4 md:grid-cols-3">
                    {service.bullets.map((bullet) => (
                      <div key={bullet} className="rounded-2xl border border-[#D9E3F4] p-5 text-sm leading-7 text-slate-600">
                        {bullet}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )

  const renderInsightsPage = () => (
    <>
      {renderHeroSection({
        eyebrow: 'Insights',
        title: 'Financial insight for leaders, operators, and mission-driven organizations.',
        body: 'A curated resource library covering accounting, reporting, payroll, compliance, and financial decision-making for businesses and nonprofits operating in complex environments.',
        image: 'insights.png',
      })}
      <section className="border-b border-[#D9E3F4] bg-white">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <button
              type="button"
              onClick={() => setActiveInsightSlug(INSIGHTS[0].slug)}
              className="group rounded-[2rem] border border-[#D9E3F4] bg-[#073D7F] p-8 text-left text-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#6491DE]">
                Featured Insight
              </div>
              <div className="mt-6 text-sm font-semibold uppercase tracking-[0.22em] text-blue-100">
                {INSIGHTS[0].category}
              </div>
              <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight">{INSIGHTS[0].title}</h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-blue-100">{INSIGHTS[0].summary}</p>
              <div className="mt-6 text-sm text-blue-200">{INSIGHTS[0].readTime}</div>
            </button>
            <div className="grid gap-5">
              {INSIGHTS.slice(1).map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => setActiveInsightSlug(item.slug)}
                  className={`rounded-[1.75rem] border p-6 text-left transition duration-300 hover:-translate-y-1 hover:shadow-lg ${
                    activeInsight.slug === item.slug
                      ? 'border-[#073D7F] bg-[#073D7F] text-white shadow-lg'
                      : 'border-[#D9E3F4] bg-white text-slate-900'
                  }`}
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6491DE]">{item.category}</div>
                  <h3 className="mt-3 text-xl font-semibold leading-tight">{item.title}</h3>
                  <p className={`mt-3 text-sm leading-7 ${activeInsight.slug === item.slug ? 'text-blue-100' : 'text-slate-600'}`}>
                    {item.summary}
                  </p>
                  <div className={`mt-4 text-xs ${activeInsight.slug === item.slug ? 'text-blue-200' : 'text-slate-500'}`}>
                    {item.readTime}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="bg-[#F1F1F1]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.34fr_0.66fr] lg:items-start">
            <aside className="space-y-6 lg:sticky lg:top-28">
              <div className="rounded-[2rem] border border-[#D9E3F4] bg-white p-8 shadow-sm">
                <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">Resource Library</div>
                <div className="mt-6 space-y-4">
                  {INSIGHTS.map((item) => (
                    <button
                      key={item.slug}
                      type="button"
                      onClick={() => setActiveInsightSlug(item.slug)}
                      className={`w-full rounded-[1.25rem] border p-5 text-left transition duration-300 ${
                        activeInsight.slug === item.slug
                          ? 'border-[#073D7F] bg-[#073D7F] text-white shadow-md'
                          : 'border-[#D9E3F4] bg-[#F1F1F1] text-slate-900 hover:bg-white hover:shadow-sm'
                      }`}
                    >
                      <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${activeInsight.slug === item.slug ? 'text-[#6491DE]' : 'text-slate-500'}`}>
                        {item.category}
                      </div>
                      <div className="mt-2 text-base font-semibold leading-7">{item.title}</div>
                      <div className={`mt-2 text-xs ${activeInsight.slug === item.slug ? 'text-blue-200' : 'text-slate-500'}`}>
                        {item.readTime}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-[2rem] border border-[#D9E3F4] bg-white p-8 shadow-sm">
                <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">Why this matters</div>
                <p className="mt-4 text-sm leading-7 text-slate-600">
                  These publications help decision-makers strengthen financial control, reduce compliance risk, and improve reporting quality across businesses and nonprofits.
                </p>
              </div>
            </aside>
            <article className="overflow-hidden rounded-[2.25rem] border border-[#D9E3F4] bg-white shadow-sm">
              <div className="border-b border-[#D9E3F4] bg-[#073D7F] px-8 py-10 text-white lg:px-10 lg:py-12">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#6491DE]">
                    {activeInsight.category}
                  </div>
                  <div className="text-xs text-blue-200">{activeInsight.readTime}</div>
                </div>
                <h2 className="mt-5 max-w-4xl text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                  {activeInsight.title}
                </h2>
                <p className="mt-5 max-w-3xl text-lg leading-8 text-blue-100">{activeInsight.summary}</p>
              </div>
              <div className="grid gap-10 px-8 py-10 lg:grid-cols-[0.24fr_0.76fr] lg:px-10 lg:py-12">
                <div className="space-y-8">
                  {[
                    ['Publication focus', 'Practical guidance for financial operations, compliance discipline, and management decision-making.'],
                    ['Audience', 'Founders, executives, finance leads, administrators, and nonprofit decision-makers.'],
                    ['Use', 'Use this insight to strengthen internal finance processes and reduce operational risk.'],
                  ].map(([label, detail]) => (
                    <div key={label}>
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</div>
                      <div className="mt-3 text-sm leading-7 text-slate-700">{detail}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-10">
                  {activeInsight.sections.map((section, index) => (
                    <section key={section.heading} className="border-b border-slate-100 pb-10 last:border-b-0 last:pb-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6491DE]">Section {index + 1}</div>
                      <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{section.heading}</h3>
                      {section.body ? <p className="mt-4 text-base leading-8 text-slate-600">{section.body}</p> : null}
                      {section.bullets ? (
                        <ul className="mt-5 space-y-4 text-base leading-8 text-slate-600">
                          {section.bullets.map((bullet) => (
                            <li key={bullet} className="flex gap-4">
                              <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6491DE]" />
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </section>
                  ))}
                  <div className="rounded-[1.75rem] bg-[#073D7F] p-8 text-white">
                    <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">Take Action</div>
                    <p className="mt-4 text-base leading-8 text-blue-100">{activeInsight.cta}</p>
                    <button
                      type="button"
                      onClick={() => handleNavigate('contact')}
                      className="mt-6 inline-flex items-center rounded-full bg-[#6491DE] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#4F7FD1]"
                    >
                      Book a Free Consultation
                    </button>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
    </>
  )

  const renderCareersPage = () => (
    <>
      {renderHeroSection({
        eyebrow: 'Career',
        title: 'Build your career with a firm focused on precision, integrity, and growth.',
        body: 'We are building a high-standard accounting and advisory practice designed to support businesses and nonprofits with clarity, compliance, and strategic financial insight.',
        image: 'career.png',
      })}
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <img
          src={`${WEBSITE_ASSET_BASE}/career.png`}
          alt="Career opportunities at Kiamina"
          className="mb-10 h-[320px] w-full rounded-[2rem] object-cover"
        />
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-[#D9E3F4] bg-white p-8 shadow-sm">
            <IconBadge icon={Users} />
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">Why Join Kiamina</div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              A growing environment for professionals who value excellence.
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              At Kiamina Accounting Services, we believe strong careers are built on technical excellence, continuous improvement, and meaningful client impact.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                'Exposure to real client challenges',
                'Professional and ethical work culture',
                'Growth-oriented environment',
                'Opportunities to build specialist expertise',
              ].map((item) => (
                <div key={item} className="rounded-[1.25rem] border border-[#D9E3F4] bg-[#F1F1F1] p-4 text-sm leading-7 text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[2rem] border border-[#D9E3F4] bg-[#F1F1F1] p-8 shadow-sm">
            <IconBadge icon={Briefcase} />
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">Current Openings</div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">No vacancies at the moment.</h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              We do not have any active openings right now. When opportunities become available, they will be published here with full role details and application instructions.
            </p>
            <div className="mt-8 rounded-[1.5rem] border border-dashed border-[#D9E3F4] bg-white p-8">
              <div className="text-lg font-semibold text-slate-950">Please check back later.</div>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                You can also follow Kiamina Accounting Services for future announcements and career updates.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  )

  const renderContactPage = () => (
    <>
      {renderHeroSection({
        eyebrow: 'Contact',
        title: 'Start with a focused consultation built around your reporting, control, and growth priorities.',
        body: 'For founders, CEOs, CFOs, and decision-makers looking for serious accounting and advisory support, the next step is a structured conversation.',
        image: 'contact.png',
      })}
      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div className="space-y-8">
          <div className="rounded-[2rem] border border-[#D9E3F4] bg-white p-8 shadow-sm">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">Contact details</div>
            <div className="mt-6 space-y-5 text-sm leading-7 text-slate-600">
              <p><span className="font-semibold text-slate-900">Email:</span> info@kiaminaaccounting.com</p>
              <p><span className="font-semibold text-slate-900">Phone:</span> +234 906 496 2073</p>
              <p><span className="font-semibold text-slate-900">Head office:</span> 10 Akpunonu Street, Rumuodumaya, Port Harcourt, Rivers, Nigeria, 500102</p>
              <p><span className="font-semibold text-slate-900">Active markets:</span> Nigeria, Canada, United States, United Kingdom, Australia, and Ireland</p>
            </div>
            <div className="mt-8">
              <div className="text-sm font-semibold uppercase tracking-[0.20em] text-[#073D7F]">Follow us</div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {SOCIAL_LINKS.map((social) => <SocialBadge key={social.name} href={social.href} name={social.name} />)}
              </div>
              <div className="mt-2 text-xs text-slate-500">Stay connected for insights and updates</div>
            </div>
          </div>
          <div className="rounded-[2rem] border border-[#D9E3F4] bg-white p-8 shadow-sm">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">Send a message</div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">Tell us what you need help with.</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Complete the form below and our team will respond with the next step for your accounting, reporting, payroll, tax, or advisory needs.
            </p>
            <form onSubmit={submitContact} className="mt-6 space-y-4">
              <input
                type="text"
                value={contactForm.name}
                onChange={(event) => setContactForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Full name"
                className="w-full rounded-xl border border-[#D9E3F4] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#073D7F]"
                required
              />
              <input
                type="email"
                value={contactForm.email}
                onChange={(event) => setContactForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Email address"
                className="w-full rounded-xl border border-[#D9E3F4] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#073D7F]"
                required
              />
              <input
                type="text"
                value={contactForm.company}
                onChange={(event) => setContactForm((prev) => ({ ...prev, company: event.target.value }))}
                placeholder="Company / Organization"
                className="w-full rounded-xl border border-[#D9E3F4] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#073D7F]"
              />
              <select
                value={contactForm.service}
                onChange={(event) => setContactForm((prev) => ({ ...prev, service: event.target.value }))}
                className="w-full rounded-xl border border-[#D9E3F4] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#073D7F]"
              >
                <option value="">Select a service</option>
                {SERVICES.map((service) => (
                  <option key={service.slug} value={service.title}>{service.title}</option>
                ))}
              </select>
              <textarea
                value={contactForm.message}
                onChange={(event) => setContactForm((prev) => ({ ...prev, message: event.target.value }))}
                rows={5}
                placeholder="Tell us about your needs"
                className="w-full rounded-xl border border-[#D9E3F4] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#073D7F]"
                required
              />
              <button
                type="submit"
                disabled={contactStatus === 'loading'}
                className="inline-flex items-center rounded-full bg-[#073D7F] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70"
              >
                {contactStatus === 'loading' ? 'Sending...' : 'Send Message'}
              </button>
              {contactMessage ? (
                <div className={`rounded-xl px-4 py-3 text-sm leading-7 ${contactStatus === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {contactMessage}
                </div>
              ) : null}
            </form>
          </div>
          <div className="rounded-[2rem] border border-[#D9E3F4] bg-[#F1F1F1] p-8 shadow-sm">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">Subscribe for insights</div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
              Receive accounting, compliance, payroll, and reporting insights by email.
            </h2>
            <form onSubmit={submitNewsletter} className="mt-6 space-y-4">
              <input
                type="text"
                value={newsletterForm.fullName}
                onChange={(event) => setNewsletterForm((prev) => ({ ...prev, fullName: event.target.value }))}
                placeholder="Full name"
                className="w-full rounded-xl border border-[#D9E3F4] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#073D7F]"
              />
              <input
                type="email"
                value={newsletterForm.email}
                onChange={(event) => setNewsletterForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Email address"
                className="w-full rounded-xl border border-[#D9E3F4] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#073D7F]"
              />
              <button type="submit" disabled={newsletterStatus === 'loading'} className="inline-flex items-center rounded-full bg-[#073D7F] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70">
                {newsletterStatus === 'loading' ? 'Connecting...' : 'Subscribe'}
              </button>
              {newsletterMessage ? (
                <div className={`rounded-xl px-4 py-3 text-sm leading-7 ${newsletterStatus === 'success' ? 'bg-emerald-50 text-emerald-700' : newsletterStatus === 'error' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                  {newsletterMessage}
                </div>
              ) : null}
            </form>
          </div>
        </div>
        <div id={CONTACT_CONSULTATION_CALENDAR_ID} className="scroll-mt-48 rounded-[2rem] bg-white p-5 shadow-xl ring-1 ring-[#D9E3F4] lg:sticky lg:top-28">
          <div className="mb-6 rounded-2xl border border-[#D9E3F4] bg-[#F1F1F1] p-5">
            <div className="text-sm font-semibold text-[#073D7F]">What happens after booking:</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Review of your current accounting and reporting setup</li>
              <li>Identification of gaps and risks</li>
              <li>Clear recommendation on next steps</li>
            </ul>
          </div>
          <div className="overflow-hidden rounded-[1.5rem] border border-[#D9E3F4] bg-[#F1F1F1]">
            <iframe
              src={CALENDAR_BOOKING_URL}
              title="Book a consultation with Kiamina Accounting Services"
              className="h-[640px] w-full"
            />
          </div>
        </div>
      </section>
    </>
  )

  const renderFooter = () => (
    <footer className="border-t border-[#D9E3F4] bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 lg:grid-cols-[1fr_auto] lg:px-8">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#073D7F]">
            Kiamina Accounting Services
          </div>
          <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">
            Nigeria-based accounting and advisory firm providing structured financial operations, reporting clarity, and strategic support to clients across Nigeria, Canada, United States, United Kingdom, Australia, and Ireland.
          </p>
          <div className="mt-6">
            <div className="text-sm font-semibold uppercase tracking-[0.20em] text-[#073D7F]">Follow us</div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {SOCIAL_LINKS.map((social) => <SocialBadge key={social.name} href={social.href} name={social.name} />)}
            </div>
            <div className="mt-2 text-xs text-slate-500">Stay connected for insights and updates</div>
          </div>
        </div>
        <div className="space-y-3 text-sm text-slate-600">
          <div className="flex items-start gap-3">
            <Mail className="mt-1 h-4 w-4 text-[#6491DE]" />
            <span>info@kiaminaaccounting.com</span>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="mt-1 h-4 w-4 text-[#6491DE]" />
            <span>+234 906 496 2073</span>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="mt-1 h-4 w-4 text-[#6491DE]" />
            <span>10 Akpunonu Street, Rumuodumaya, Port Harcourt, Rivers, Nigeria, 500102</span>
          </div>
          <div className="flex items-start gap-3">
            <Clock3 className="mt-1 h-4 w-4 text-[#6491DE]" />
            <span>Mon - Fri, 8:00 AM - 5:00 PM (WAT)</span>
          </div>
        </div>
      </div>
      <div className="border-t border-[#D9E3F4]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-slate-500 lg:px-8">
          <p>&copy; {new Date().getFullYear()} Kiamina Accounting Services. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => handleNavigate('about')} className="text-[#073D7F] transition hover:text-[#6491DE]">About</button>
            <button type="button" onClick={() => handleNavigate('services')} className="text-[#073D7F] transition hover:text-[#6491DE]">Services</button>
            <button type="button" onClick={() => handleNavigate('insights')} className="text-[#073D7F] transition hover:text-[#6491DE]">Insights</button>
            <button type="button" onClick={() => handleNavigate('contact')} className="text-[#073D7F] transition hover:text-[#6491DE]">Contact</button>
            <button type="button" onClick={onOpenAdminPortal} className="rounded-full border border-[#D9E3F4] px-3 py-1.5 font-semibold text-[#073D7F] hover:bg-[#F1F1F1]">
              Admin Portal
            </button>
          </div>
        </div>
      </div>
    </footer>
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
    <div className="min-h-screen bg-white text-slate-900">
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur transition-colors duration-200 ${
          isHeaderCompact
            ? 'border-slate-200/60 bg-white/80 shadow-[0_8px_20px_rgba(15,23,42,0.08)]'
            : 'border-slate-200/80 bg-white/95'
        }`}
      >
        <div className={`mx-auto flex w-[min(1160px,92vw)] items-center justify-between gap-3 transition-all duration-200 ${isHeaderCompact ? 'py-3' : 'py-5'}`}>
          <button type="button" onClick={() => handleNavigate('home')} className="inline-flex items-center gap-3 text-left">
            <KiaminaLogo className="h-28 w-auto" />
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
                  aria-label={getLocationDetectionAriaLabel({
                    isResolved: isRegionResolved,
                    regionLabel: selectedRegion.label,
                  })}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-[#153585]"
                >
                  <BrandImage
                    src={selectedRegion.flag}
                    alt={getRegionFlagAlt({
                      isResolved: isRegionResolved,
                      regionLabel: selectedRegion.label,
                    })}
                    className="h-4 w-6 rounded-sm border border-slate-200"
                  />
                  <span>
                    {getLocationDetectionLabel({
                      isResolved: isRegionResolved,
                      regionLabel: selectedRegion.label,
                    })}
                  </span>
                  <ChevronDown className="h-4 w-4" />
                </button>
                {regionsOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    {REGION_ITEMS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          manualRegionSelectionRef.current = true
                          setSelectedRegionId(item.id)
                          setIsRegionResolved(true)
                          trackWebsiteEvent({
                            eventType: 'region_select',
                            page: resolvedPage,
                            targetType: 'region',
                            targetId: item.id,
                            targetLabel: item.label,
                            metadata: getManualRegionSelectionMetadata(item),
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
              <>
                <button type="button" onClick={onOpenDashboard} className={primaryButtonClass}>Dashboard</button>
                <button type="button" onClick={handleBookConsultation} className={primaryButtonClass}>Book Consultation</button>
              </>
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
                <button type="button" onClick={handleBookConsultation} className={primaryButtonClass}>Book Consultation</button>
                <button type="button" onClick={onLogin} className={secondaryButtonClass}>Login</button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-2.5 text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.08)] backdrop-blur xl:hidden"
            aria-label="Toggle menu"
          >
            <BrandImage
              src={selectedRegion.flag}
              alt={getRegionFlagAlt({
                isResolved: isRegionResolved,
                regionLabel: selectedRegion.label,
              })}
              className="h-4 w-6 rounded-sm border border-slate-200"
            />
            {mobileOpen ? <X className="h-5 w-5" strokeWidth={2.1} /> : <Rows3 className="h-5 w-5" strokeWidth={2.1} />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-slate-200 bg-white xl:hidden">
            <div className="mx-auto grid w-[min(1160px,92vw)] gap-1 py-3">
              <div className="mb-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-2">
                <button
                  type="button"
                  onClick={() => setRegionsOpen((prev) => !prev)}
                  aria-label={getLocationDetectionAriaLabel({
                    isResolved: isRegionResolved,
                    regionLabel: selectedRegion.label,
                  })}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-white"
                >
                  <span className="inline-flex items-center gap-3">
                    <BrandImage
                      src={selectedRegion.flag}
                      alt={getRegionFlagAlt({
                        isResolved: isRegionResolved,
                        regionLabel: selectedRegion.label,
                      })}
                      className="h-4 w-6 rounded-sm border border-slate-200"
                    />
                    <span>
                      {getLocationDetectionLabel({
                        isResolved: isRegionResolved,
                        regionLabel: selectedRegion.label,
                      })}
                    </span>
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${regionsOpen ? 'rotate-180' : ''}`} />
                </button>
                {regionsOpen && (
                  <div className="mt-2 grid gap-1">
                    {REGION_ITEMS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          manualRegionSelectionRef.current = true
                          setSelectedRegionId(item.id)
                          setIsRegionResolved(true)
                          trackWebsiteEvent({
                            eventType: 'region_select',
                            page: resolvedPage,
                            targetType: 'region',
                            targetId: item.id,
                            targetLabel: item.label,
                            metadata: getManualRegionSelectionMetadata(item),
                          })
                          setRegionsOpen(false)
                          handleNavigate('contact')
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          selectedRegion.id === item.id
                            ? 'bg-[#153585]/10 text-[#153585]'
                            : 'text-slate-600 hover:bg-white hover:text-[#153585]'
                        }`}
                      >
                        <BrandImage src={item.flag} alt={`${item.label} flag`} className="h-4 w-6 rounded-sm border border-slate-200" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
                  <>
                    <button type="button" onClick={onOpenDashboard} className={primaryButtonClass}>Dashboard</button>
                    <button type="button" onClick={handleBookConsultation} className={primaryButtonClass}>Book Consultation</button>
                  </>
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
                    <button type="button" onClick={handleBookConsultation} className={primaryButtonClass}>Book Consultation</button>
                    <button type="button" onClick={onLogin} className={secondaryButtonClass}>Login</button>
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

      <div className="fixed bottom-5 right-5 z-40 hidden flex-col gap-3 lg:flex">
        {SOCIAL_LINKS.map((social) => <SocialBadge key={social.name} href={social.href} name={social.name} />)}
      </div>

      {renderFooter()}
    </div>
  )
}

export default PreliminaryCorporateSite
