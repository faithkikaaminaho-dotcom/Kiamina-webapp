import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Crown, Loader2, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import {
  ADMIN_LEVELS,
  ADMIN_PERMISSION_DEFINITIONS,
  getAdminLevelLabel,
  isAdminInvitePending,
  normalizeAdminLevel,
  sanitizeAdminPermissions,
} from '../adminIdentity'
import AdminOtpModal from './AdminOtpModal'
import KiaminaLogo from '../../common/KiaminaLogo'
import DotLottiePreloader from '../../common/DotLottiePreloader'
import { verifyIdentityWithDojah } from '../../../utils/dojahIdentity'

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
const getAdminGovIdTypeOptions = (country = 'Nigeria') => (
  country === 'Nigeria'
    ? ADMIN_GOV_ID_TYPES_NIGERIA
    : [ADMIN_GOV_ID_TYPE_INTERNATIONAL]
)
const formatPhoneNumber = (countryCode = '+234', number = '') => {
  const normalizedCode = String(countryCode || '').trim() || '+234'
  const normalizedNumber = String(number || '').trim()
  if (!normalizedNumber) return ''
  return `${normalizedCode} ${normalizedNumber}`.trim()
}

const OWNER_SETUP_STEPS = [
  'Create the primary owner identity',
  'Secure the workspace with a private key',
  'Verify the email OTP and enter the admin workspace',
]

const INVITED_ADMIN_SETUP_STEPS = [
  'Confirm invite details and role assignment',
  'Complete profile and verification requirements',
  'Verify the email OTP to activate admin access',
]

function AdminAccountSetup({
  invite,
  ownerBootstrapStatus,
  successState,
  otpChallenge,
  onCreateAccount,
  onVerifyOtp,
  onResendOtp,
  onCancelOtp,
  onContinueToAdmin,
  onReturnToAdminLogin,
}) {
  const inviteEmail = String(invite?.email || '').trim()
  const hasInviteToken = Boolean(String(invite?.token || '').trim())
  const canBootstrapOwner = Boolean(ownerBootstrapStatus?.canBootstrap)
  const isOwnerBootstrapMode = !hasInviteToken && canBootstrapOwner
  const isOwnerBootstrapStatusLoading = !hasInviteToken && (
    Boolean(ownerBootstrapStatus?.loading)
    || !Boolean(ownerBootstrapStatus?.checked)
  )

  const [setupForm, setSetupForm] = useState({
    fullName: '',
    email: inviteEmail,
    roleInCompany: '',
    department: '',
    phoneCountryCode: '+234',
    phoneNumber: '',
    workCountry: 'Nigeria',
    governmentIdType: '',
    governmentIdNumber: '',
    governmentIdFile: '',
    residentialAddress: '',
    ownerPrivateKey: '',
    confirmOwnerPrivateKey: '',
    password: '',
    confirmPassword: '',
  })
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isIdentityVerifying, setIsIdentityVerifying] = useState(false)
  const [identityVerificationState, setIdentityVerificationState] = useState({
    status: '',
    message: '',
  })
  const [idUploadInputKey, setIdUploadInputKey] = useState(0)
  const normalizedWorkCountry = normalizeAdminVerificationCountry(setupForm.workCountry)
  const govIdTypeOptions = getAdminGovIdTypeOptions(normalizedWorkCountry)

  const isInviteValid = hasInviteToken ? isAdminInvitePending(invite) : false
  const inviteAdminLevel = isOwnerBootstrapMode
    ? ADMIN_LEVELS.OWNER
    : normalizeAdminLevel(invite?.adminLevel || ADMIN_LEVELS.AREA_ACCOUNTANT)
  const isOwnerInvite = inviteAdminLevel === ADMIN_LEVELS.OWNER
  const invitePermissions = useMemo(() => {
    if (isOwnerBootstrapMode) return ['Full System Access']
    if (!invite) return []
    if (inviteAdminLevel === ADMIN_LEVELS.OWNER || inviteAdminLevel === ADMIN_LEVELS.SUPER) {
      return ['Full System Access']
    }
    const permissionIds = sanitizeAdminPermissions(invite.adminPermissions)
    return permissionIds
      .map((permissionId) => ADMIN_PERMISSION_DEFINITIONS.find((permission) => permission.id === permissionId)?.label)
      .filter(Boolean)
  }, [invite, inviteAdminLevel, isOwnerBootstrapMode])
  const setupSteps = isOwnerBootstrapMode ? OWNER_SETUP_STEPS : INVITED_ADMIN_SETUP_STEPS
  const brandedShellStyle = { fontFamily: "'Helvetica Now', 'Helvetica Neue', Helvetica, Arial, sans-serif" }

  useEffect(() => {
    if (!inviteEmail) return
    setSetupForm((previous) => ({ ...previous, email: inviteEmail }))
  }, [inviteEmail])

  const resetIdentityVerificationState = () => {
    setIdentityVerificationState({ status: '', message: '' })
  }

  const handleVerifyIdentity = async () => {
    if (isOwnerInvite) {
      setIdentityVerificationState({
        status: 'verified',
        message: 'Owner role does not require ID verification.',
      })
      return
    }
    if (!setupForm.fullName.trim() || !setupForm.governmentIdType || !setupForm.governmentIdNumber.trim()) {
      setErrorMessage('Full name, government ID type, and ID card number are required before verification.')
      return
    }
    if (!setupForm.governmentIdFile) {
      setErrorMessage('Upload government ID before verification.')
      return
    }

    setErrorMessage('')
    setIsIdentityVerifying(true)
    setIdentityVerificationState({ status: 'verifying', message: 'Identifying...' })
    const verifyResult = await verifyIdentityWithDojah({
      fullName: setupForm.fullName,
      idType: setupForm.governmentIdType,
      cardNumber: setupForm.governmentIdNumber,
    })
    if (!verifyResult.ok) {
      setIdentityVerificationState({
        status: 'failed',
        message: 'Verification failed. Please re-upload.',
      })
      setSetupForm((prev) => ({
        ...prev,
        governmentIdFile: '',
      }))
      setIdUploadInputKey((prev) => prev + 1)
      setIsIdentityVerifying(false)
      return
    }
    setIdentityVerificationState({
      status: 'verified',
      message: 'Identity verified successfully.',
    })
    setIsIdentityVerifying(false)
  }

  const submitSetup = async (event) => {
    event.preventDefault()
    if (!hasInviteToken && !isOwnerBootstrapMode) return
    if (isOwnerInvite) {
      if (!setupForm.ownerPrivateKey.trim() || !setupForm.confirmOwnerPrivateKey.trim()) {
        setErrorMessage('Owner private key and confirmation are required.')
        return
      }
      if (setupForm.ownerPrivateKey.trim() !== setupForm.confirmOwnerPrivateKey.trim()) {
        setErrorMessage('Owner private key confirmation does not match.')
        return
      }
    }

    setErrorMessage('')
    setIsSubmitting(true)
    const result = await onCreateAccount({
      inviteToken: hasInviteToken ? invite.token : '',
      bootstrapOwner: isOwnerBootstrapMode,
      fullName: setupForm.fullName,
      email: setupForm.email,
      roleInCompany: setupForm.roleInCompany,
      department: setupForm.department,
      phoneNumber: formatPhoneNumber(setupForm.phoneCountryCode, setupForm.phoneNumber),
      workCountry: normalizedWorkCountry,
      governmentIdType: setupForm.governmentIdType,
      governmentIdNumber: setupForm.governmentIdNumber,
      identityVerificationPassed: true,
      residentialAddress: setupForm.residentialAddress,
      ownerPrivateKey: setupForm.ownerPrivateKey,
      confirmOwnerPrivateKey: setupForm.confirmOwnerPrivateKey,
      password: setupForm.password,
      confirmPassword: setupForm.confirmPassword,
    })
    if (!result?.ok) {
      setErrorMessage(result?.message || 'Unable to create admin account.')
    }
    setIsSubmitting(false)
  }

  if (successState) {
    const successRoleLabel = getAdminLevelLabel(successState.adminLevel || inviteAdminLevel)
    const successTitle = successState.isOwnerBootstrap
      ? 'Owner Account Created'
      : 'Admin Account Created'
    const successMessage = successState.isOwnerBootstrap
      ? 'Your primary owner admin account is ready. Continue to open the admin workspace with full system access.'
      : 'Your admin account is ready. Continue to open the admin workspace.'

    return (
      <div
        className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(21,53,133,0.16),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(21,53,133,0.12),transparent_42%),linear-gradient(180deg,#eef3fb,#f8fbff)] flex items-center justify-center px-4 py-10"
        style={brandedShellStyle}
      >
        <div className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-[#153585]/12 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.16)]">
          <div className="bg-[linear-gradient(135deg,#0f2458,#153585_58%,#2d67d1)] px-8 py-8 text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-50">
              <Sparkles className="h-3.5 w-3.5" />
              Setup Complete
            </div>
            <div className="mt-5 flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/14 text-white">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold">{successTitle}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50">{successMessage}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-8 py-8 lg:grid-cols-[1.15fr,0.85fr]">
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Admin Identity</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Full Name</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{successState.fullName || 'Admin User'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Access Level</p>
                    <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Crown className="h-4 w-4 text-[#153585]" />
                      {successRoleLabel}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:col-span-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Work Email</p>
                    <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 break-all">
                      <Mail className="h-4 w-4 text-[#153585]" />
                      {successState.email || ''}
                    </p>
                  </div>
                  {successState.roleInCompany ? (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Role In Company</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{successState.roleInCompany}</p>
                    </div>
                  ) : null}
                  {successState.department ? (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Department</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{successState.department}</p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-sm font-semibold text-emerald-800">Next sign-ins</p>
                <p className="mt-2 text-sm leading-6 text-emerald-700">
                  Use your work email and password on the admin portal. Owner accounts also require the owner private key during sign-in, so keep it secure and available.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#153585]/10 bg-[linear-gradient(180deg,#f8fbff,#eef4ff)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#153585]">Ready To Continue</p>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">Open the admin workspace</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Your account has been activated and the admin session is already prepared. Continue when you&apos;re ready to land in the admin dashboard.
              </p>
              <button
                type="button"
                onClick={onContinueToAdmin}
                className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#153585] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#2147a3]"
              >
                Continue to Admin
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onReturnToAdminLogin}
                className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Sign Out to Admin Login
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (hasInviteToken && !isInviteValid) {
    return (
      <div
        className="min-h-screen bg-[#F4F6FB] flex items-center justify-center px-4 py-10"
        style={{ fontFamily: "'Helvetica Now', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}
      >
        <div className="w-full max-w-lg bg-white border border-border-light rounded-xl shadow-card p-8">
          <div className="flex items-center justify-center mb-6">
            <KiaminaLogo className="h-32 w-auto" />
          </div>

          <h1 className="text-2xl font-semibold text-text-primary text-center">Admin Account Setup</h1>
          <p className="text-sm text-error text-center mt-3">Invitation link is invalid or has expired.</p>

          <div className="mt-7 flex justify-center">
            <button
              type="button"
              onClick={onReturnToAdminLogin}
              className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background transition-colors inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Admin Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!hasInviteToken && isOwnerBootstrapStatusLoading) {
    return (
      <div
        className="min-h-screen bg-[#F4F6FB] flex items-center justify-center px-4 py-10"
        style={{ fontFamily: "'Helvetica Now', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}
      >
        <div className="w-full max-w-lg bg-white border border-border-light rounded-xl shadow-card p-8">
          <div className="flex items-center justify-center mb-6">
            <KiaminaLogo className="h-32 w-auto" />
          </div>

          <h1 className="text-2xl font-semibold text-text-primary text-center">Admin Account Setup</h1>
          <p className="text-sm text-text-secondary text-center mt-3">Checking owner bootstrap eligibility...</p>

          <div className="mt-7 flex justify-center">
            <button
              type="button"
              onClick={onReturnToAdminLogin}
              className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background transition-colors inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Admin Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!hasInviteToken && !isOwnerBootstrapMode) {
    const ownerBootstrapMessage = String(ownerBootstrapStatus?.message || '').trim()
      || 'Owner setup is no longer available because an admin account already exists. Use /admin/login or a valid invite link.'
    return (
      <div
        className="min-h-screen bg-[#F4F6FB] flex items-center justify-center px-4 py-10"
        style={{ fontFamily: "'Helvetica Now', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}
      >
        <div className="w-full max-w-lg bg-white border border-border-light rounded-xl shadow-card p-8">
          <div className="flex items-center justify-center mb-6">
            <KiaminaLogo className="h-32 w-auto" />
          </div>

          <h1 className="text-2xl font-semibold text-text-primary text-center">Admin Account Setup</h1>
          <p className="text-sm text-error text-center mt-3">{ownerBootstrapMessage}</p>

          <div className="mt-7 flex justify-center">
            <button
              type="button"
              onClick={onReturnToAdminLogin}
              className="h-10 px-4 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background transition-colors inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Admin Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-[#F4F6FB] flex items-center justify-center px-4 py-10"
      style={{ fontFamily: "'Helvetica Now', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}
    >
      <div className="w-full max-w-6xl overflow-hidden rounded-[28px] border border-[#153585]/12 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.16)]">
        <div className="grid lg:grid-cols-[0.95fr,1.35fr]">
          <div className="bg-[linear-gradient(145deg,#0f2458,#153585_58%,#2d67d1)] px-8 py-8 text-white">
            <div className="flex items-center justify-between gap-3">
              <KiaminaLogo className="h-32 w-auto" />
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-50">
                {isOwnerBootstrapMode ? <Crown className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {isOwnerBootstrapMode ? 'Owner Bootstrap' : 'Admin Invite'}
              </div>
            </div>

            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100">Kiamina Admin Access</p>
              <h1 className="mt-3 text-3xl font-semibold leading-tight">
                {isOwnerBootstrapMode
                  ? 'Launch the first owner workspace'
                  : 'Activate your invited admin profile'}
              </h1>
              <p className="mt-4 text-sm leading-6 text-blue-50">
                {isOwnerBootstrapMode
                  ? 'Set up the primary owner account with full system access, secure the workspace with your private key, and enter the admin portal.'
                  : 'Complete your role-based admin profile, verify the required identity details, and activate your access securely.'}
              </p>
            </div>

            <div className="mt-8 rounded-3xl border border-white/15 bg-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100">Assigned Role</p>
              <p className="mt-2 text-lg font-semibold text-white">{getAdminLevelLabel(inviteAdminLevel)}</p>
              <div className="mt-5 space-y-3">
                {setupSteps.map((step, index) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xs font-semibold text-white">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-6 text-blue-50">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-white/15 bg-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100">Granted Permissions</p>
              <div className="mt-4 grid gap-2">
                {invitePermissions.map((label) => (
                  <div key={label} className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-blue-50">
                    <CheckCircle2 className="h-4 w-4 text-white" />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="px-8 py-8">
            <form className="space-y-4" onSubmit={submitSetup}>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Full Name</label>
            <input
              type="text"
              value={setupForm.fullName}
              onChange={(event) => {
                setSetupForm((prev) => ({ ...prev, fullName: event.target.value }))
                resetIdentityVerificationState()
              }}
              className="w-full h-11 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Work Email</label>
            <input
              type="email"
              value={setupForm.email}
              onChange={(event) => setSetupForm((prev) => ({ ...prev, email: event.target.value }))}
              className="w-full h-11 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            />
            <p className="text-xs text-text-muted mt-1">
              {isOwnerBootstrapMode
                ? 'This email will become the primary owner admin login.'
                : 'This must match the invited email address.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Role In Company</label>
              <input
                type="text"
                value={setupForm.roleInCompany}
                onChange={(event) => setSetupForm((prev) => ({ ...prev, roleInCompany: event.target.value }))}
                className="w-full h-11 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Department</label>
              <input
                type="text"
                value={setupForm.department}
                onChange={(event) => setSetupForm((prev) => ({ ...prev, department: event.target.value }))}
                className="w-full h-11 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Phone Number</label>
            <div className="grid grid-cols-[130px_1fr] gap-2">
              <select
                value={setupForm.phoneCountryCode || '+234'}
                onChange={(event) => setSetupForm((prev) => ({ ...prev, phoneCountryCode: event.target.value }))}
                className="h-11 px-2 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              >
                {PHONE_COUNTRY_CODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <input
                type="tel"
                value={setupForm.phoneNumber}
                onChange={(event) => setSetupForm((prev) => ({ ...prev, phoneNumber: event.target.value }))}
                placeholder="Enter phone number"
                className="w-full h-11 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {!isOwnerInvite && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Country</label>
                  <select
                    value={normalizedWorkCountry}
                    onChange={(event) => {
                      setSetupForm((prev) => ({
                        ...prev,
                        workCountry: normalizeAdminVerificationCountry(event.target.value),
                        governmentIdType: '',
                      }))
                      resetIdentityVerificationState()
                    }}
                    className="w-full h-11 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="Nigeria">Nigeria</option>
                    <option value="International">Outside Nigeria</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Government ID Type</label>
                  <select
                    value={setupForm.governmentIdType}
                    onChange={(event) => {
                      setSetupForm((prev) => ({ ...prev, governmentIdType: event.target.value }))
                      resetIdentityVerificationState()
                    }}
                    className="w-full h-11 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">Select ID type</option>
                    {govIdTypeOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Government ID Number</label>
                <input
                  type="text"
                  value={setupForm.governmentIdNumber}
                  onChange={(event) => {
                    setSetupForm((prev) => ({ ...prev, governmentIdNumber: event.target.value }))
                    resetIdentityVerificationState()
                  }}
                  placeholder={normalizedWorkCountry === 'Nigeria' ? 'Enter NIN / Passport / Voter ID number' : 'Enter government-issued ID number'}
                  className="w-full h-11 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                />
                <p className="text-xs text-text-muted mt-1">
                  Nigeria admins can use International Passport, NIN, Voter&apos;s Card, or Driver&apos;s Licence. Outside Nigeria, use your government-issued ID.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Government ID Upload</label>
                <input
                  key={idUploadInputKey}
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    setSetupForm((prev) => ({
                      ...prev,
                      governmentIdFile: file?.name || '',
                    }))
                    resetIdentityVerificationState()
                  }}
                  className="w-full h-11 px-3 border border-border rounded-md text-sm file:mr-3 file:border-0 file:bg-background file:px-2 file:py-1"
                />
                {setupForm.governmentIdFile && (
                  <p className="text-xs text-success mt-1">Uploaded: {setupForm.governmentIdFile}</p>
                )}
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleVerifyIdentity}
                  disabled={isIdentityVerifying}
                  className="h-10 px-4 border border-primary text-primary rounded-md text-sm font-semibold hover:bg-primary-tint transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {isIdentityVerifying && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isIdentityVerifying ? 'Checking...' : 'Optional Identity Check'}
                </button>
                <p className="text-xs text-text-muted mt-2">
                  Verification is optional in the MVP. You can continue without completing this step.
                </p>
                {identityVerificationState.message && (
                  <p className={`text-xs mt-2 ${
                    identityVerificationState.status === 'verified'
                      ? 'text-success'
                      : identityVerificationState.status === 'failed'
                        ? 'text-error'
                        : 'text-text-muted'
                  }`}
                  >
                    {identityVerificationState.message}
                  </p>
                )}
              </div>
            </>
          )}
          {isOwnerInvite && (
            <div className="rounded-md border border-border-light bg-[#FAFBFF] px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Owner Verification</p>
              <p className="text-sm text-text-secondary mt-1">Government ID verification is optional in the MVP.</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Residential Address (Optional)
            </label>
            <input
              type="text"
              value={setupForm.residentialAddress}
              onChange={(event) => setSetupForm((prev) => ({ ...prev, residentialAddress: event.target.value }))}
              placeholder="Enter your full residential address"
              className="w-full h-11 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
            />
          </div>
          {isOwnerInvite && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Owner Private Key</label>
                <input
                  type="password"
                  value={setupForm.ownerPrivateKey}
                  onChange={(event) => setSetupForm((prev) => ({ ...prev, ownerPrivateKey: event.target.value }))}
                  placeholder="Minimum 12 characters"
                  className="w-full h-11 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Confirm Private Key</label>
                <input
                  type="password"
                  value={setupForm.confirmOwnerPrivateKey}
                  onChange={(event) => setSetupForm((prev) => ({ ...prev, confirmOwnerPrivateKey: event.target.value }))}
                  className="w-full h-11 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Password</label>
              <input
                type="password"
                value={setupForm.password}
                onChange={(event) => setSetupForm((prev) => ({ ...prev, password: event.target.value }))}
                className="w-full h-11 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={setupForm.confirmPassword}
                onChange={(event) => setSetupForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                className="w-full h-11 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-md border border-error/25 bg-error-bg px-3 py-2">
              <p className="text-xs text-error">{errorMessage}</p>
            </div>
          )}

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={onReturnToAdminLogin}
                  className="text-sm text-text-secondary hover:text-text-primary inline-flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Return to Admin Login
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isIdentityVerifying}
                  className="h-11 px-5 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {isSubmitting && <DotLottiePreloader size={18} />}
                  {isSubmitting ? 'Processing...' : 'Create Admin Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {otpChallenge && (
        <AdminOtpModal
          key={otpChallenge.requestId}
          challenge={otpChallenge}
          onVerifyOtp={onVerifyOtp}
          onResendOtp={onResendOtp}
          onCancelOtp={onCancelOtp}
        />
      )}
    </div>
  )
}

export default AdminAccountSetup
