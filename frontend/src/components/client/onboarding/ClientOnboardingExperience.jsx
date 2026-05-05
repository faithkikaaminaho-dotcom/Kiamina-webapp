import { useState } from 'react'
import { INDUSTRY_OPTIONS } from '../../../data/client/mockData'
import KiaminaLogo from '../../common/KiaminaLogo'

const TOTAL_ONBOARDING_STEPS = 2
const PHONE_LOCAL_NUMBER_REGEX = /^\d{10,11}$/
const COUNTRY_BASE_CURRENCY_MAP = Object.freeze({
  Nigeria: 'NGN',
  'United States': 'USD',
  'United Kingdom': 'GBP',
  Canada: 'CAD',
  Australia: 'AUD',
})
const BASE_CURRENCY_LABEL_MAP = Object.freeze({
  NGN: 'NGN - Nigerian Naira',
  USD: 'USD - US Dollar',
  GBP: 'GBP - British Pound',
  CAD: 'CAD - Canadian Dollar',
  AUD: 'AUD - Australian Dollar',
})
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
    const value = String(index + 1).padStart(2, '0')
    acc[monthName.toLowerCase()] = value
    acc[monthName.slice(0, 3).toLowerCase()] = value
    return acc
  }, {}),
)
const FINANCIAL_MONTH_OPTIONS = Object.freeze(
  FINANCIAL_MONTH_NAMES.map((monthName, index) => ({
    value: String(index + 1).padStart(2, '0'),
    label: monthName,
  })),
)

const sanitizeLettersOnly = (value = '') => (
  String(value || '')
    .replace(/[^A-Za-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trimStart()
)

const sanitizePhoneDigits = (value = '') => String(value || '').replace(/\D/g, '').slice(0, 11)

const sanitizeAlphaNumeric = (value = '') => String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()

const toTitleCaseValue = (value = '') => (
  String(value || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
)

const resolveFinancialBoundaryMonth = (value = '') => {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const canonicalMatch = raw.match(/^(\d{2})-(?:\d{2}|LAST)$/i)
  if (canonicalMatch) {
    const month = Number(canonicalMatch[1])
    if (month >= 1 && month <= 12) return String(month).padStart(2, '0')
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const month = Number(isoMatch[2])
    if (month >= 1 && month <= 12) return String(month).padStart(2, '0')
  }

  const numericMonth = Number(raw)
  if (Number.isFinite(numericMonth) && numericMonth >= 1 && numericMonth <= 12) {
    return String(numericMonth).padStart(2, '0')
  }

  const byName = FINANCIAL_MONTH_LOOKUP[raw.toLowerCase()]
  if (byName) return byName

  return ''
}

const normalizeFinancialBoundaryDate = (value = '', boundary = 'start') => {
  const monthToken = resolveFinancialBoundaryMonth(value)
  if (!monthToken) return ''
  return boundary === 'end' ? `${monthToken}-LAST` : `${monthToken}-01`
}

const getFinancialBoundaryMonth = (value = '') => resolveFinancialBoundaryMonth(value)

const buildFullName = (payload = {}) => (
  [
    String(payload.firstName || '').trim(),
    String(payload.otherNames || '').trim(),
    String(payload.lastName || '').trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
)

const formatBusinessTypeLabel = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'business') return 'Business'
  if (normalized === 'non-profit' || normalized === 'non profit' || normalized === 'nonprofit') return 'Non-Profit'
  if (normalized === 'individual') return 'Individual'
  return String(value || '').trim()
}

function OnboardingExperience({
  currentStep,
  setCurrentStep,
  data,
  setData,
  onSkip,
  onComplete,
  showToast,
  teamAffiliation = null,
}) {
  const [errors, setErrors] = useState({})

  const resolvedCurrentStep = Math.min(TOTAL_ONBOARDING_STEPS, Math.max(1, Number(currentStep) || 1))
  const safeData = data && typeof data === 'object' ? data : {}
  const isAffiliatedTeamMember = Boolean(teamAffiliation?.isTeamMember)
  const workspaceDetails = {
    businessType: String(safeData.businessType || teamAffiliation?.businessType || '').trim(),
    businessName: String(safeData.businessName || teamAffiliation?.companyName || '').trim(),
    country: String(safeData.country || teamAffiliation?.country || '').trim(),
    currency: String(safeData.currency || teamAffiliation?.currency || 'NGN').trim() || 'NGN',
    address1: String(safeData.address1 || safeData.address || '').trim(),
    address2: String(safeData.address2 || '').trim(),
    city: String(safeData.city || '').trim(),
    postalCode: String(safeData.postalCode || '').trim(),
    addressCountry: String(safeData.addressCountry || safeData.country || teamAffiliation?.country || '').trim(),
    industry: String(safeData.industry || teamAffiliation?.industry || '').trim(),
    industryOther: String(safeData.industryOther || teamAffiliation?.industryOther || '').trim(),
    cacNumber: String(safeData.cacNumber || teamAffiliation?.cacNumber || '').trim(),
    tin: String(safeData.tin || teamAffiliation?.tin || '').trim(),
    reportingCycle: String(safeData.reportingCycle || teamAffiliation?.reportingCycle || '').trim(),
    startMonth: String(safeData.startMonth || teamAffiliation?.startMonth || '').trim(),
  }
  const businessTypeLabel = formatBusinessTypeLabel(workspaceDetails.businessType)
  const isBusinessEntity = businessTypeLabel === 'Business' || businessTypeLabel === 'Non-Profit'
  const isNigeriaRegistration = (workspaceDetails.country || '').trim().toLowerCase() === 'nigeria'
  const registrationNumberLabel = isNigeriaRegistration || !workspaceDetails.country ? 'CAC Registration Number' : 'Business Registration Number'
  const registrationPlaceholder = isNigeriaRegistration || !workspaceDetails.country ? 'e.g., BN123456, RC123456, or IT123456' : 'e.g., BR123456'
  const stepTitle = [
    'Confirm your profile',
    isAffiliatedTeamMember ? 'Review your team workspace' : 'Set up your business workspace',
  ][resolvedCurrentStep - 1]
  const resolvedCurrencyCode = String(
    workspaceDetails.currency
    || COUNTRY_BASE_CURRENCY_MAP[String(workspaceDetails.country || '').trim()]
    || 'NGN',
  ).trim().toUpperCase() || 'NGN'
  const resolvedCurrency = BASE_CURRENCY_LABEL_MAP[resolvedCurrencyCode] || `${resolvedCurrencyCode} - Base currency`

  const updateField = (field, value) => {
    const normalizedValue = (() => {
      if (field === 'firstName' || field === 'lastName' || field === 'otherNames') {
        return toTitleCaseValue(sanitizeLettersOnly(value))
      }
      if (field === 'phone') return sanitizePhoneDigits(value)
      if (field === 'email') return String(value || '').trim().toLowerCase()
      if (field === 'cacNumber') return sanitizeAlphaNumeric(value)
      if (field === 'startMonth') return normalizeFinancialBoundaryDate(value, 'start')
      if (field === 'reportingCycle') return normalizeFinancialBoundaryDate(value, 'end')
      return value
    })()

    setData((previousData) => {
      const previous = previousData && typeof previousData === 'object' ? previousData : {}
      const next = { ...previous, [field]: normalizedValue }
      if (field === 'businessType' && normalizedValue === 'Individual') {
        next.cacNumber = ''
        next.businessReg = ''
      }
      if (field === 'country') {
        next.currency = COUNTRY_BASE_CURRENCY_MAP[String(normalizedValue || '').trim()] || previous.currency || 'NGN'
        if (!String(next.addressCountry || '').trim()) {
          next.addressCountry = normalizedValue
        }
      }
      next.primaryContact = buildFullName(next)
      next.email = String(next.email || previous.email || '').trim().toLowerCase()
      return next
    })

    setErrors((previous) => ({ ...previous, [field]: '' }))
  }

  const scrollToFirstInvalid = (errorMap) => {
    const firstInvalid = Object.keys(errorMap)[0]
    if (!firstInvalid) return
    setTimeout(() => {
      const element = document.getElementById(`onboarding-${firstInvalid}`)
      if (!element) return
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (typeof element.focus === 'function') element.focus()
    }, 0)
  }

  const validateStep = () => {
    const nextErrors = {}
    if (resolvedCurrentStep === 1) {
      if (!String(safeData.firstName || '').trim()) nextErrors.firstName = 'First name is required.'
      if (!String(safeData.lastName || '').trim()) nextErrors.lastName = 'Last name is required.'
      if (!String(safeData.email || '').trim()) nextErrors.email = 'Email address is required.'
      const phoneDigits = sanitizePhoneDigits(safeData.phone)
      if (!phoneDigits) {
        nextErrors.phone = 'Phone number is required.'
      } else if (!PHONE_LOCAL_NUMBER_REGEX.test(phoneDigits)) {
        nextErrors.phone = 'Phone number must be 10 or 11 digits.'
      }
      if (!String(safeData.roleInCompany || '').trim()) nextErrors.roleInCompany = 'Role in company is required.'
      if (!String(safeData.language || '').trim()) nextErrors.language = 'Preferred language is required.'
    }
    if (resolvedCurrentStep === 2) {
      if (isAffiliatedTeamMember) {
        return nextErrors
      }
      if (!String(workspaceDetails.businessType || '').trim()) nextErrors.businessType = 'Business type is required.'
      if (!String(workspaceDetails.businessName || '').trim()) nextErrors.businessName = 'Legal business name is required.'
      if (!String(workspaceDetails.country || '').trim()) nextErrors.country = 'Country is required.'
      if (!String(workspaceDetails.address1 || '').trim()) nextErrors.address1 = 'Address line 1 is required.'
      if (!String(workspaceDetails.city || '').trim()) nextErrors.city = 'City is required.'
      if (!String(workspaceDetails.addressCountry || '').trim()) nextErrors.addressCountry = 'Address country is required.'
      if (!String(workspaceDetails.industry || '').trim()) nextErrors.industry = 'Industry is required.'
      if (workspaceDetails.industry === 'Others' && !String(workspaceDetails.industryOther || '').trim()) {
        nextErrors.industryOther = 'Please specify your industry.'
      }
      if (isBusinessEntity) {
        const normalizedRegistration = sanitizeAlphaNumeric(workspaceDetails.cacNumber)
        if (!normalizedRegistration) {
          nextErrors.cacNumber = 'Registration number is required.'
        } else if (!/^(RC|BN|IT|LP|LLP)/.test(normalizedRegistration)) {
          nextErrors.cacNumber = 'Registration number must start with RC, BN, IT, LP, or LLP.'
        }
      }
      if (!String(workspaceDetails.startMonth || '').trim()) nextErrors.startMonth = 'Financial year start is required.'
      if (!String(workspaceDetails.reportingCycle || '').trim()) nextErrors.reportingCycle = 'Financial year end is required.'
    }
    return nextErrors
  }

  const handleNext = () => {
    const nextErrors = validateStep()
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      showToast('error', 'Please complete all required onboarding fields.')
      scrollToFirstInvalid(nextErrors)
      return
    }
    setErrors({})
    setCurrentStep(Math.min(TOTAL_ONBOARDING_STEPS, resolvedCurrentStep + 1))
  }

  const handleFinish = () => {
    const nextErrors = validateStep()
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      showToast('error', 'Please complete all required onboarding fields.')
      scrollToFirstInvalid(nextErrors)
      return
    }
    const finalWorkspaceData = resolvedCurrentStep === 2 && isAffiliatedTeamMember
      ? {
          ...safeData,
          ...workspaceDetails,
        }
      : safeData
    onComplete({
      ...finalWorkspaceData,
      currency: resolvedCurrencyCode,
      addressCountry: finalWorkspaceData.addressCountry || finalWorkspaceData.country || '',
      primaryContact: buildFullName(finalWorkspaceData),
    })
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8" style={{ fontFamily: "'Helvetica Now', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      <div className="max-w-4xl mx-auto bg-white border border-border-light rounded-xl shadow-card p-8">
        <div className="flex items-center justify-center mb-6">
          <KiaminaLogo className="h-32 w-auto" />
        </div>

        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs font-medium text-text-muted uppercase tracking-wide">Step {resolvedCurrentStep} of {TOTAL_ONBOARDING_STEPS}</div>
            <h1 className="text-2xl font-semibold text-text-primary mt-1">{stepTitle}</h1>
            <p className="text-sm text-text-secondary mt-2">
              {resolvedCurrentStep === 1
                ? 'Confirm the profile details that will be used across your client workspace.'
                : (
                    isAffiliatedTeamMember
                      ? 'Your account is joining an existing workspace. Review the company details inherited from the workspace owner before finishing setup.'
                      : 'Set the business and accounting basics Kiamina needs to prepare your workspace correctly.'
                  )}
            </p>
          </div>
          <button type="button" onClick={onSkip} className="h-9 px-4 border border-border rounded-md text-sm font-medium text-text-secondary hover:bg-background transition-colors">
            Skip for now
          </button>
        </div>

        <div className="w-full h-2 bg-border-light rounded-full mb-8">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(resolvedCurrentStep / TOTAL_ONBOARDING_STEPS) * 100}%` }}></div>
        </div>

        {resolvedCurrentStep === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">First Name</label>
              <input
                id="onboarding-firstName"
                type="text"
                value={safeData.firstName || ''}
                onChange={(event) => updateField('firstName', event.target.value)}
                className={`w-full h-10 px-3 border rounded-md text-sm ${errors.firstName ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
              />
              {errors.firstName && <p className="text-xs text-error mt-1">{errors.firstName}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Last Name</label>
              <input
                id="onboarding-lastName"
                type="text"
                value={safeData.lastName || ''}
                onChange={(event) => updateField('lastName', event.target.value)}
                className={`w-full h-10 px-3 border rounded-md text-sm ${errors.lastName ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
              />
              {errors.lastName && <p className="text-xs text-error mt-1">{errors.lastName}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Other Name</label>
              <input
                id="onboarding-otherNames"
                type="text"
                value={safeData.otherNames || ''}
                onChange={(event) => updateField('otherNames', event.target.value)}
                className={`w-full h-10 px-3 border rounded-md text-sm ${errors.otherNames ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
              />
              {errors.otherNames && <p className="text-xs text-error mt-1">{errors.otherNames}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Work Email</label>
              <input
                id="onboarding-email"
                type="email"
                value={safeData.email || ''}
                readOnly
                className={`w-full h-10 px-3 border rounded-md text-sm bg-background/60 text-text-secondary ${errors.email ? 'border-error' : 'border-border'} focus:outline-none`}
              />
              {errors.email ? (
                <p className="text-xs text-error mt-1">{errors.email}</p>
              ) : (
                <p className="text-xs text-text-muted mt-1">This matches the email you signed up with.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Phone Number</label>
              <input
                id="onboarding-phone"
                type="text"
                inputMode="numeric"
                value={safeData.phone || ''}
                onChange={(event) => updateField('phone', event.target.value)}
                className={`w-full h-10 px-3 border rounded-md text-sm ${errors.phone ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
              />
              {errors.phone ? (
                <p className="text-xs text-error mt-1">{errors.phone}</p>
              ) : (
                <p className="text-xs text-text-muted mt-1">This number will be used for two-step verification.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Role in Company</label>
              <input
                id="onboarding-roleInCompany"
                type="text"
                value={safeData.roleInCompany || ''}
                onChange={(event) => updateField('roleInCompany', event.target.value)}
                className={`w-full h-10 px-3 border rounded-md text-sm ${errors.roleInCompany ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
              />
              {errors.roleInCompany && <p className="text-xs text-error mt-1">{errors.roleInCompany}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-text-primary mb-1.5">Preferred Language</label>
              <select
                id="onboarding-language"
                value={safeData.language || 'English'}
                onChange={(event) => updateField('language', event.target.value)}
                className={`w-full h-10 px-3 border rounded-md text-sm ${errors.language ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
              >
                <option value="English">English</option>
                <option value="French">French</option>
              </select>
              {errors.language && <p className="text-xs text-error mt-1">{errors.language}</p>}
            </div>
          </div>
        )}

        {resolvedCurrentStep === 2 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isAffiliatedTeamMember ? (
              <>
                <div className="md:col-span-2 rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
                  <p className="text-sm font-semibold text-text-primary">Team workspace affiliation</p>
                  <p className="text-sm text-text-secondary mt-1">
                    This account will join {teamAffiliation?.companyName || 'your team workspace'}
                    {teamAffiliation?.ownerName ? `, managed by ${teamAffiliation.ownerName}` : ''}.
                  </p>
                </div>

                <div className="rounded-md border border-border-light bg-background/50 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Business Type</p>
                  <p className="text-sm font-medium text-text-primary mt-1">{businessTypeLabel || '--'}</p>
                  {errors.businessType && <p className="text-xs text-error mt-1">{errors.businessType}</p>}
                </div>

                <div className="rounded-md border border-border-light bg-background/50 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Legal Business Name</p>
                  <p className="text-sm font-medium text-text-primary mt-1">{workspaceDetails.businessName || '--'}</p>
                  {errors.businessName && <p className="text-xs text-error mt-1">{errors.businessName}</p>}
                </div>

                <div className="rounded-md border border-border-light bg-background/50 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Country of Registration / Primary Operation</p>
                  <p className="text-sm font-medium text-text-primary mt-1">{workspaceDetails.country || '--'}</p>
                  {errors.country && <p className="text-xs text-error mt-1">{errors.country}</p>}
                </div>

                <div className="md:col-span-2 rounded-md border border-border-light bg-background/50 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Registered Address</p>
                  <p className="text-sm font-medium text-text-primary mt-1">
                    {[workspaceDetails.address1, workspaceDetails.address2, workspaceDetails.city, workspaceDetails.postalCode, workspaceDetails.addressCountry]
                      .filter(Boolean)
                      .join(', ') || '--'}
                  </p>
                </div>

                <div className="rounded-md border border-border-light bg-background/50 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Industry</p>
                  <p className="text-sm font-medium text-text-primary mt-1">
                    {workspaceDetails.industry === 'Others' && workspaceDetails.industryOther
                      ? workspaceDetails.industryOther
                      : (workspaceDetails.industry || '--')}
                  </p>
                  {errors.industry && <p className="text-xs text-error mt-1">{errors.industry}</p>}
                  {errors.industryOther && <p className="text-xs text-error mt-1">{errors.industryOther}</p>}
                </div>

                {isBusinessEntity && (
                  <div className="md:col-span-2 rounded-md border border-border-light bg-background/50 px-3 py-2.5">
                    <p className="text-xs uppercase tracking-wide text-text-muted">{registrationNumberLabel}</p>
                    <p className="text-sm font-medium text-text-primary mt-1">{workspaceDetails.cacNumber || '--'}</p>
                    {errors.cacNumber && <p className="text-xs text-error mt-1">{errors.cacNumber}</p>}
                  </div>
                )}

                <div className="rounded-md border border-border-light bg-background/50 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Financial Year Start</p>
                  <p className="text-sm font-medium text-text-primary mt-1">
                    {getFinancialBoundaryMonth(workspaceDetails.startMonth)
                      ? FINANCIAL_MONTH_OPTIONS.find((option) => option.value === getFinancialBoundaryMonth(workspaceDetails.startMonth))?.label || '--'
                      : '--'}
                  </p>
                  {errors.startMonth && <p className="text-xs text-error mt-1">{errors.startMonth}</p>}
                </div>

                <div className="rounded-md border border-border-light bg-background/50 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Financial Year End</p>
                  <p className="text-sm font-medium text-text-primary mt-1">
                    {getFinancialBoundaryMonth(workspaceDetails.reportingCycle)
                      ? FINANCIAL_MONTH_OPTIONS.find((option) => option.value === getFinancialBoundaryMonth(workspaceDetails.reportingCycle))?.label || '--'
                      : '--'}
                  </p>
                  {errors.reportingCycle && <p className="text-xs text-error mt-1">{errors.reportingCycle}</p>}
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Business Type</label>
                  <select
                    id="onboarding-businessType"
                    value={safeData.businessType || ''}
                    onChange={(event) => updateField('businessType', event.target.value)}
                    className={`w-full h-10 px-3 border rounded-md text-sm ${errors.businessType ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
                  >
                    <option value="">Select business type</option>
                    <option value="Business">Business</option>
                    <option value="Non-Profit">Non-Profit</option>
                    <option value="Individual">Individual</option>
                  </select>
                  {errors.businessType && <p className="text-xs text-error mt-1">{errors.businessType}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Legal Business Name</label>
                  <input
                    id="onboarding-businessName"
                    type="text"
                    value={safeData.businessName || ''}
                    onChange={(event) => updateField('businessName', event.target.value)}
                    className={`w-full h-10 px-3 border rounded-md text-sm ${errors.businessName ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
                  />
                  {errors.businessName && <p className="text-xs text-error mt-1">{errors.businessName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Country of Registration / Primary Operation</label>
                  <select
                    id="onboarding-country"
                    value={safeData.country || ''}
                    onChange={(event) => updateField('country', event.target.value)}
                    className={`w-full h-10 px-3 border rounded-md text-sm ${errors.country ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
                  >
                    <option value="">Select country</option>
                    <option value="Nigeria">Nigeria</option>
                    <option value="United States">United States</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="Canada">Canada</option>
                    <option value="Australia">Australia</option>
                  </select>
                  {errors.country && <p className="text-xs text-error mt-1">{errors.country}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Industry</label>
                  <select
                    id="onboarding-industry"
                    value={safeData.industry || ''}
                    onChange={(event) => updateField('industry', event.target.value)}
                    className={`w-full h-10 px-3 border rounded-md text-sm ${errors.industry ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
                  >
                    <option value="">Select industry</option>
                    {INDUSTRY_OPTIONS.map((industry) => <option key={industry} value={industry}>{industry}</option>)}
                  </select>
                  {errors.industry && <p className="text-xs text-error mt-1">{errors.industry}</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Address Line 1</label>
                  <input
                    id="onboarding-address1"
                    type="text"
                    value={safeData.address1 || ''}
                    onChange={(event) => updateField('address1', event.target.value)}
                    placeholder="Street address"
                    className={`w-full h-10 px-3 border rounded-md text-sm ${errors.address1 ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
                  />
                  {errors.address1 && <p className="text-xs text-error mt-1">{errors.address1}</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Address Line 2</label>
                  <input
                    id="onboarding-address2"
                    type="text"
                    value={safeData.address2 || ''}
                    onChange={(event) => updateField('address2', event.target.value)}
                    placeholder="Suite, floor, or landmark"
                    className={`w-full h-10 px-3 border rounded-md text-sm ${errors.address2 ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
                  />
                  {errors.address2 && <p className="text-xs text-error mt-1">{errors.address2}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">City</label>
                  <input
                    id="onboarding-city"
                    type="text"
                    value={safeData.city || ''}
                    onChange={(event) => updateField('city', event.target.value)}
                    className={`w-full h-10 px-3 border rounded-md text-sm ${errors.city ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
                  />
                  {errors.city && <p className="text-xs text-error mt-1">{errors.city}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Postal Code</label>
                  <input
                    id="onboarding-postalCode"
                    type="text"
                    value={safeData.postalCode || ''}
                    onChange={(event) => updateField('postalCode', event.target.value)}
                    className={`w-full h-10 px-3 border rounded-md text-sm ${errors.postalCode ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
                  />
                  {errors.postalCode && <p className="text-xs text-error mt-1">{errors.postalCode}</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Address Country</label>
                  <select
                    id="onboarding-addressCountry"
                    value={safeData.addressCountry || safeData.country || ''}
                    onChange={(event) => updateField('addressCountry', event.target.value)}
                    className={`w-full h-10 px-3 border rounded-md text-sm ${errors.addressCountry ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
                  >
                    <option value="">Select country</option>
                    <option value="Nigeria">Nigeria</option>
                    <option value="United States">United States</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="Canada">Canada</option>
                    <option value="Australia">Australia</option>
                  </select>
                  {errors.addressCountry && <p className="text-xs text-error mt-1">{errors.addressCountry}</p>}
                </div>

                {safeData.industry === 'Others' && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Specify Industry</label>
                    <input
                      id="onboarding-industryOther"
                      type="text"
                      value={safeData.industryOther || ''}
                      onChange={(event) => updateField('industryOther', event.target.value)}
                      className={`w-full h-10 px-3 border rounded-md text-sm ${errors.industryOther ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
                    />
                    {errors.industryOther && <p className="text-xs text-error mt-1">{errors.industryOther}</p>}
                  </div>
                )}

                {isBusinessEntity && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-text-primary mb-1.5">{registrationNumberLabel}</label>
                    <input
                      id="onboarding-cacNumber"
                      type="text"
                      value={safeData.cacNumber || ''}
                      onChange={(event) => updateField('cacNumber', event.target.value)}
                      placeholder={registrationPlaceholder}
                      className={`w-full h-10 px-3 border rounded-md text-sm ${errors.cacNumber ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
                    />
                    {errors.cacNumber && <p className="text-xs text-error mt-1">{errors.cacNumber}</p>}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Financial Year Start</label>
                  <select
                    id="onboarding-startMonth"
                    value={getFinancialBoundaryMonth(safeData.startMonth)}
                    onChange={(event) => updateField('startMonth', event.target.value)}
                    className={`w-full h-10 px-3 border rounded-md text-sm ${errors.startMonth ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
                  >
                    <option value="">Select month</option>
                    {FINANCIAL_MONTH_OPTIONS.map((option) => (
                      <option key={`start-${option.value}`} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {errors.startMonth && <p className="text-xs text-error mt-1">{errors.startMonth}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Financial Year End</label>
                  <select
                    id="onboarding-reportingCycle"
                    value={getFinancialBoundaryMonth(safeData.reportingCycle)}
                    onChange={(event) => updateField('reportingCycle', event.target.value)}
                    className={`w-full h-10 px-3 border rounded-md text-sm ${errors.reportingCycle ? 'border-error' : 'border-border'} focus:outline-none focus:border-primary`}
                  >
                    <option value="">Select month</option>
                    {FINANCIAL_MONTH_OPTIONS.map((option) => (
                      <option key={`end-${option.value}`} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {errors.reportingCycle && <p className="text-xs text-error mt-1">{errors.reportingCycle}</p>}
                </div>
              </>
            )}

            <div className="md:col-span-2 rounded-md border border-border-light bg-background/50 px-3 py-2.5">
              <p className="text-xs uppercase tracking-wide text-text-muted">Base Currency</p>
              <p className="text-sm font-medium text-text-primary mt-1">{resolvedCurrency}</p>
              <p className="text-xs text-text-secondary mt-1">
                {isAffiliatedTeamMember
                  ? 'This currency is inherited from the workspace you are joining.'
                  : 'Currency is set automatically from the selected country.'}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border-light">
          <button type="button" onClick={() => setCurrentStep(Math.max(1, resolvedCurrentStep - 1))} disabled={resolvedCurrentStep === 1} className="h-9 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            Back
          </button>
          {resolvedCurrentStep < TOTAL_ONBOARDING_STEPS ? (
            <button type="button" onClick={handleNext} className="h-9 px-5 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors">
              Next
            </button>
          ) : (
            <button type="button" onClick={handleFinish} className="h-9 px-5 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors">
              Finish Setup
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default OnboardingExperience
