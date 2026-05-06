import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Phone,
  Shield,
} from 'lucide-react'
import KiaminaLogo from '../common/KiaminaLogo'

const BRAND_COLOR = '#153585'
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
const CLIENT_PHONE_REGEX = /^\d{10,11}$/
const PASSWORD_REQUIREMENTS = [
  'Minimum 8 characters',
  'At least one uppercase letter',
  'At least one number',
  'At least one special character',
]
const TITLES = {
  login: 'Sign In',
  signup: 'Create Account',
  'forgot-password': 'Forgot Password',
  'reset-password': 'Reset Password',
  'email-verification': 'Email Verification',
}
const DESCRIPTIONS = {
  login: 'Access your client portal securely.',
  signup: 'Register your client account with professional, secure access controls.',
  'forgot-password': 'Request a secure password reset link for your account.',
  'reset-password': 'Create a new password for your client portal.',
  'email-verification': 'Confirm your email address to activate your Kiamina account.',
}
const SIGNUP_POLICY_COPY = {
  legal: {
    title: 'Terms of Service',
    sections: [
      'By creating an account, you agree to use the Kiamina platform only for lawful business and financial activities.',
      'Information on the platform supports accounting operations, but it does not replace tailored legal, tax, or regulatory advice.',
      'Client service obligations, delivery scope, confidentiality, and timelines are governed by the engagement agreed with Kiamina.',
      'If you do not agree with these terms, you should not continue with account registration.',
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      'Kiamina collects the personal and business information needed to onboard clients, deliver services, and maintain secure communication.',
      'Submitted data may be used for account administration, support, compliance, service improvement, and operational reporting.',
      'We do not sell personal information. Data is shared only where necessary for service delivery, lawful obligations, or approved service providers.',
      'You may decline consent and stop registration, or contact Kiamina later about how your information is handled.',
    ],
  },
}

function GoogleBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.26-.96 2.32-2.05 3.04l3.31 2.57c1.93-1.78 3.04-4.4 3.04-7.51 0-.72-.07-1.43-.2-2.1H12z" />
      <path fill="#34A853" d="M12 22c2.75 0 5.07-.9 6.76-2.29l-3.31-2.57c-.92.62-2.09.98-3.45.98-2.66 0-4.9-1.8-5.7-4.21l-3.42 2.64C4.55 19.84 8.01 22 12 22z" />
      <path fill="#4A90E2" d="M6.3 13.91A5.95 5.95 0 0 1 6 12c0-.66.11-1.3.3-1.91L2.88 7.45A9.97 9.97 0 0 0 2 12c0 1.6.38 3.11 1.05 4.45l3.25-2.54z" />
      <path fill="#FBBC05" d="M12 5.88c1.49 0 2.82.51 3.87 1.5l2.9-2.9C17.06 2.88 14.75 2 12 2 8.01 2 4.55 4.16 2.88 7.45l3.42 2.64c.8-2.41 3.04-4.21 5.7-4.21z" />
    </svg>
  )
}

function maskEmail(email) {
  const value = String(email || '').trim()
  const at = value.indexOf('@')
  if (at <= 1) return value || 'your email address'
  return `${value[0]}${'*'.repeat(Math.max(3, at - 1))}${value.slice(at)}`
}

function normalizeSocialPromptProfile(profile = {}) {
  const source = profile && typeof profile === 'object' ? profile : {}
  const fullName = String(source.fullName || source.displayName || '').trim()
  const parts = fullName.split(/\s+/).filter(Boolean)
  const firstName = String(source.firstName || parts[0] || '').trim()
  const lastName = String(source.lastName || (parts.length > 1 ? parts[parts.length - 1] : '')).trim()
  const otherNames = String(source.otherNames || (parts.length > 2 ? parts.slice(1, -1).join(' ') : '')).trim()

  return {
    firstName,
    lastName,
    otherNames,
  }
}

function createEmptySocialPrompt() {
  return {
    open: false,
    provider: '',
    firstName: '',
    lastName: '',
    otherNames: '',
    error: '',
  }
}

function createSocialPromptState({ provider = 'google', profile = {} } = {}) {
  const normalizedProfile = normalizeSocialPromptProfile(profile)
  return {
    open: true,
    provider: String(provider || 'google').trim() || 'google',
    firstName: normalizedProfile.firstName,
    lastName: normalizedProfile.lastName,
    otherNames: normalizedProfile.otherNames,
    error: '',
  }
}

function getPasswordStrength(password) {
  let score = 0
  if (password.length >= 8) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  if (score <= 1) return { label: 'Weak', width: '25%', color: 'bg-red-500' }
  if (score === 2) return { label: 'Fair', width: '50%', color: 'bg-amber-500' }
  if (score === 3) return { label: 'Good', width: '75%', color: 'bg-blue-600' }
  return { label: 'Strong', width: '100%', color: 'bg-emerald-600' }
}

function Notice({ type = 'error', message = '' }) {
  if (!message) return null
  const classes = type === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : type === 'info'
      ? 'border-[#cddbf7] bg-[#f3f7ff] text-[#21407e]'
      : 'border-red-200 bg-red-50 text-red-700'
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${classes}`}>
      {type === 'success' ? <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
      <span>{message}</span>
    </div>
  )
}

function PolicyModal({ type = 'legal', onAgree, onDecline }) {
  const copy = SIGNUP_POLICY_COPY[type] || SIGNUP_POLICY_COPY.legal

  return (
    <div className="fixed inset-0 z-[228] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_30px_80px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#153585]">Account agreement</div>
            <h3 className="mt-3 text-2xl font-semibold text-slate-900">{copy.title}</h3>
          </div>
          <button type="button" onClick={onDecline} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            Close
          </button>
        </div>
        <div className="mt-6 space-y-4 text-sm leading-7 text-slate-600">
          {copy.sections.map((section) => (
            <p key={section}>{section}</p>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onDecline} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            No
          </button>
          <button type="button" onClick={onAgree} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: BRAND_COLOR }}>
            Agree
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, icon: Icon, error = '', required = false, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-800">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </span>
      <div className={`flex h-12 items-center gap-3 rounded-xl bg-white px-4 ${error ? 'border border-red-300' : 'border border-slate-200 focus-within:border-[#153585]'}`}>
        {Icon ? <Icon className={`h-4 w-4 flex-shrink-0 ${error ? 'text-red-500' : 'text-slate-400'}`} /> : null}
        {children}
      </div>
      {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
    </label>
  )
}

function OtpModal({ challenge, onVerifyOtp, onResendOtp, onCancelOtp }) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const refs = useRef([])
  const code = digits.join('')
  const deliveryStatusMessage = challenge?.deliveryError
    ? 'We could not confirm delivery of the verification code. Please request a new code if it does not arrive.'
    : ''

  const verify = async (override = '') => {
    const nextCode = override || code
    if (nextCode.length !== 6 || isVerifying) return
    setIsVerifying(true)
    setError('')
    const result = await onVerifyOtp(nextCode)
    if (!result?.ok) setError(result?.message || 'Incorrect verification code.')
    setIsVerifying(false)
  }

  const resend = async () => {
    if (isResending) return
    setIsResending(true)
    setError('')
    const result = await onResendOtp()
    if (!result?.ok) setError(result?.message || 'Unable to resend OTP right now.')
    else setDigits(['', '', '', '', '', ''])
    setIsResending(false)
  }

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_30px_80px_rgba(15,23,42,0.24)]">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#153585]"><Shield className="h-5 w-5" /></div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Verify Your Identity</h3>
            <p className="text-sm text-slate-500">We sent a six-digit code to {maskEmail(challenge.email)}.</p>
          </div>
        </div>
        {deliveryStatusMessage ? <p className="mt-4 text-xs font-medium text-amber-600">{deliveryStatusMessage}</p> : null}
        <div className="mt-6 grid grid-cols-6 gap-2">
          {digits.map((digit, index) => (
            <input
              key={`otp-${index}`}
              ref={(element) => { refs.current[index] = element }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(event) => {
                const onlyDigits = event.target.value.replace(/\D/g, '')
                const next = [...digits]
                if (!onlyDigits) next[index] = ''
                else onlyDigits.slice(0, 6 - index).split('').forEach((value, offset) => { next[index + offset] = value })
                setDigits(next)
                setError('')
                if (next.join('').length === 6) void verify(next.join(''))
                else refs.current[Math.min(index + onlyDigits.length, 5)]?.focus()
              }}
              className={`h-12 rounded-xl border text-center text-lg font-semibold outline-none ${error ? 'border-red-300' : 'border-slate-200 focus:border-[#153585]'}`}
            />
          ))}
        </div>
        {error ? <p className="mt-3 text-xs font-medium text-red-600">{error}</p> : null}
        <div className="mt-7 flex items-center justify-between">
          <button type="button" onClick={resend} disabled={isResending} className="inline-flex items-center gap-2 text-sm font-semibold text-[#153585] disabled:opacity-60">{isResending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Resend code</button>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onCancelOtp} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" onClick={() => void verify()} disabled={code.length !== 6 || isVerifying} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: BRAND_COLOR }}>{isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{isVerifying ? 'Processing...' : 'Verify'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AuthExperience({
  mode,
  setMode,
  onLogin,
  onSignup,
  onSocialLogin,
  pendingSocialPrompt,
  onCancelSocialNamePrompt,
  onRequestPasswordReset,
  onResolvePasswordResetCode,
  onUpdatePassword,
  onResendVerificationEmail,
  onVerifyEmailAddress,
  verificationEmail,
  passwordResetEmail,
  setPasswordResetEmail,
  otpChallenge,
  onVerifyOtp,
  onResendOtp,
  onCancelOtp,
  signupPrefill = null,
  signupContextNotice = '',
}) {
  const [loginForm, setLoginForm] = useState({ email: '', password: '', remember: false })
  const [signupForm, setSignupForm] = useState({
    firstName: '',
    lastName: '',
    otherNames: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    agree: false,
  })
  const [forgotEmail, setForgotEmail] = useState(passwordResetEmail || '')
  const [resetForm, setResetForm] = useState({ password: '', confirmPassword: '' })
  const [resolvedResetEmail, setResolvedResetEmail] = useState(passwordResetEmail || '')
  const [loginError, setLoginError] = useState('')
  const [signupError, setSignupError] = useState('')
  const [loginFieldErrors, setLoginFieldErrors] = useState({ email: '', password: '' })
  const [signupFieldErrors, setSignupFieldErrors] = useState({
    firstName: '',
    lastName: '',
    otherNames: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    agree: '',
  })
  const [forgotFeedback, setForgotFeedback] = useState(null)
  const [resetFeedback, setResetFeedback] = useState(null)
  const [verificationFeedback, setVerificationFeedback] = useState(null)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showSignupPassword, setShowSignupPassword] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [isLoginLoading, setIsLoginLoading] = useState(false)
  const [isSignupLoading, setIsSignupLoading] = useState(false)
  const [isForgotLoading, setIsForgotLoading] = useState(false)
  const [isResolvingResetCode, setIsResolvingResetCode] = useState(false)
  const [isResetLoading, setIsResetLoading] = useState(false)
  const [isVerificationResendLoading, setIsVerificationResendLoading] = useState(false)
  const [isVerificationApplying, setIsVerificationApplying] = useState(false)
  const [socialLoading, setSocialLoading] = useState('')
  const [socialPrompt, setSocialPrompt] = useState(() => createEmptySocialPrompt())
  const [activePolicyModal, setActivePolicyModal] = useState('')
  const actionCode = typeof window !== 'undefined' ? String(new URLSearchParams(window.location.search || '').get('oobCode') || '').trim() : ''
  const processedResetCodeRef = useRef('')
  const processedVerificationCodeRef = useRef('')
  const signupInviteEmail = String(signupPrefill?.email || '').trim().toLowerCase()
  const isInviteSignup = mode === 'signup' && Boolean(signupPrefill?.lockEmail && signupInviteEmail)
  const verificationTargetEmail = String(verificationEmail || signupForm.email || loginForm.email || '').trim().toLowerCase()
  const strength = getPasswordStrength(resetForm.password)

  useEffect(() => {
    if (!passwordResetEmail) return
    setForgotEmail(passwordResetEmail)
    setResolvedResetEmail(passwordResetEmail)
  }, [passwordResetEmail])

  useEffect(() => {
    if (mode !== 'reset-password') { processedResetCodeRef.current = ''; return }
    if (!actionCode) { setResetFeedback({ type: 'error', message: 'Reset link is invalid or expired.' }); return }
    if (processedResetCodeRef.current === actionCode) return
    processedResetCodeRef.current = actionCode
    let disposed = false
    const resolve = async () => {
      setIsResolvingResetCode(true)
      const result = await onResolvePasswordResetCode(actionCode)
      if (disposed) return
      if (!result?.ok) setResetFeedback({ type: 'error', message: result?.message || 'Reset link is invalid or expired.' })
      else {
        const email = String(result.email || '').trim().toLowerCase()
        setResolvedResetEmail(email)
        setPasswordResetEmail(email)
        setResetFeedback(null)
      }
      setIsResolvingResetCode(false)
    }
    void resolve()
    return () => { disposed = true }
  }, [actionCode, mode, onResolvePasswordResetCode, setPasswordResetEmail])

  useEffect(() => {
    if (mode !== 'email-verification') { processedVerificationCodeRef.current = ''; return }
    if (!actionCode) {
      setVerificationFeedback((previous) => previous || { type: 'info', message: 'A verification link has been sent to your email. Please verify your email address to activate your account.' })
      return
    }
    if (processedVerificationCodeRef.current === actionCode) return
    processedVerificationCodeRef.current = actionCode
    let disposed = false
    const apply = async () => {
      setIsVerificationApplying(true)
      const result = await onVerifyEmailAddress(actionCode)
      if (disposed) return
      setVerificationFeedback({ type: result?.ok ? 'success' : 'error', message: result?.message || (result?.ok ? 'Email verified successfully.' : 'Verification link expired. Please request a new one.') })
      setIsVerificationApplying(false)
    }
    void apply()
    return () => { disposed = true }
  }, [actionCode, mode, onVerifyEmailAddress])

  useEffect(() => {
    if (!['login', 'signup'].includes(mode) || socialPrompt.open) return
    if (!pendingSocialPrompt || typeof pendingSocialPrompt !== 'object') return
    setSocialPrompt(createSocialPromptState({
      provider: pendingSocialPrompt.provider,
      profile: pendingSocialPrompt.profile,
    }))
  }, [mode, pendingSocialPrompt, socialPrompt.open])

  useEffect(() => {
    if (mode !== 'signup' || !signupInviteEmail) return
    setSignupForm((previous) => {
      if (String(previous.email || '').trim().toLowerCase() === signupInviteEmail) return previous
      return {
        ...previous,
        email: signupInviteEmail,
      }
    })
    setSignupFieldErrors((previous) => (
      previous.email ? { ...previous, email: '' } : previous
    ))
    setSignupError('')
  }, [mode, signupInviteEmail])

  const navigate = (nextMode) => {
    setLoginError('')
    setSignupError('')
    setLoginFieldErrors({ email: '', password: '' })
    setSignupFieldErrors({
      firstName: '',
      lastName: '',
      otherNames: '',
      email: '',
      phoneNumber: '',
      password: '',
      confirmPassword: '',
      agree: '',
    })
    setForgotFeedback(null)
    setResetFeedback(null)
    setVerificationFeedback(null)
    setActivePolicyModal('')
    setMode(nextMode)
  }

  const handleOpenPolicyModal = (type) => {
    setSignupError('')
    setSignupFieldErrors((previous) => ({ ...previous, agree: '' }))
    setActivePolicyModal(type === 'privacy' ? 'privacy' : 'legal')
  }

  const handleAgreeToPolicy = () => {
    setSignupError('')
    setSignupFieldErrors((previous) => ({ ...previous, agree: '' }))
    setSignupForm((previous) => ({ ...previous, agree: true }))
    setActivePolicyModal('')
  }

  const handleDeclinePolicy = () => {
    setSignupForm((previous) => ({ ...previous, agree: false }))
    setActivePolicyModal('')
  }

  const socialBlock = (mode === 'login' || (mode === 'signup' && !isInviteSignup)) ? (
    <>
      <button type="button" onClick={() => void (async () => {
        setSocialLoading('google')
        const result = await onSocialLogin('google')
        if (result?.requiresProfileCompletion || result?.requiresFullName) {
          setSocialPrompt(createSocialPromptState({
            provider: result?.provider || 'google',
            profile: result?.profile,
          }))
        }
        else if (!result?.ok) (mode === 'signup' ? setSignupError(result?.message || 'Authentication failed. Please try again.') : setLoginError(result?.message || 'Authentication failed. Please try again.'))
        setSocialLoading('')
      })()} disabled={Boolean(socialLoading)} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:opacity-60">
        {socialLoading === 'google' ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleBrandIcon />}
        {socialLoading === 'google' ? 'Processing...' : 'Continue with Google'}
      </button>
      <div className="flex items-center gap-3"><div className="h-px flex-1 bg-slate-200" /><span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">or continue with email</span><div className="h-px flex-1 bg-slate-200" /></div>
    </>
  ) : null

  const footer = (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-slate-200 pt-5 text-sm">
      <a href="/" className="inline-flex items-center gap-2 font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" />Back to Home</a>
      {mode !== 'signup' ? <button type="button" onClick={() => navigate('signup')} className="font-semibold text-[#153585]">Create Account</button> : null}
      {mode !== 'login' ? <button type="button" onClick={() => navigate('login')} className="font-semibold text-[#153585]">Login</button> : null}
      {mode !== 'forgot-password' ? <button type="button" onClick={() => navigate('forgot-password')} className="font-semibold text-[#153585]">Forgot Password</button> : null}
    </div>
  )

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef3fb] px-4 py-10" style={{ fontFamily: "'Helvetica Now', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(21,53,133,0.16),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(21,53,133,0.12),transparent_42%)]" aria-hidden="true" />
      <div className={`relative w-full rounded-[32px] border border-slate-200 bg-white/95 shadow-[0_32px_90px_rgba(15,23,42,0.18)] ${mode === 'signup' ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="border-b border-slate-200 px-8 pb-6 pt-8">
          <div className="flex items-center justify-center"><KiaminaLogo className="h-32 w-auto" /></div>
          <div className="mt-6 flex items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#153585]"><Shield className="h-5 w-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Kiamina Client Portal</p><h1 className="mt-1 text-2xl font-semibold text-slate-900">{TITLES[mode]}</h1><p className="mt-2 text-sm text-slate-500">{DESCRIPTIONS[mode]}</p></div>
          </div>
        </div>
        <div className="space-y-6 px-8 py-8">
          {mode === 'login' ? (
            <>
              {socialBlock}
              <Notice message={loginError} />
              <form className="space-y-4" onSubmit={async (event) => {
                event.preventDefault()
                const email = String(loginForm.email || '').trim().toLowerCase()
                const nextErrors = { email: '', password: '' }
                if (!email) nextErrors.email = 'Email address is required.'
                else if (!EMAIL_REGEX.test(email)) nextErrors.email = 'Please enter a valid email address.'
                if (!loginForm.password) nextErrors.password = 'Password is required.'
                setLoginFieldErrors(nextErrors)
                if (nextErrors.email || nextErrors.password) {
                  setLoginError('')
                  return
                }
                setLoginError('')
                setIsLoginLoading(true)
                const result = await onLogin({ email, password: loginForm.password, remember: loginForm.remember })
                if (!result?.ok) setLoginError(result?.message || 'Incorrect email or password')
                setIsLoginLoading(false)
              }}>
                <Field label="Email Address" icon={Mail} error={loginFieldErrors.email} required><input value={loginForm.email} onChange={(e) => { setLoginError(''); setLoginFieldErrors((previous) => ({ ...previous, email: '' })); setLoginForm((p) => ({ ...p, email: e.target.value })) }} placeholder="name@company.com" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /></Field>
                <Field label="Password" icon={Lock} error={loginFieldErrors.password} required><input type={showLoginPassword ? 'text' : 'password'} value={loginForm.password} onChange={(e) => { setLoginError(''); setLoginFieldErrors((previous) => ({ ...previous, password: '' })); setLoginForm((p) => ({ ...p, password: e.target.value })) }} placeholder="Enter your password" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /><button type="button" onClick={() => setShowLoginPassword((p) => !p)} className="text-slate-400">{showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></Field>
                <div className="flex items-center justify-between gap-4"><label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={loginForm.remember} onChange={(e) => setLoginForm((p) => ({ ...p, remember: e.target.checked }))} className="h-4 w-4 accent-[#153585]" />Remember Me</label><button type="button" onClick={() => navigate('forgot-password')} className="text-sm font-semibold text-[#153585]">Forgot Password</button></div>
                <button type="submit" disabled={isLoginLoading} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: BRAND_COLOR }}>{isLoginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{isLoginLoading ? 'Signing In...' : 'Sign In'}</button>
              </form>
              {footer}
            </>
          ) : null}
          {mode === 'signup' ? (
            <>
              {socialBlock}
              <Notice type="info" message={signupContextNotice} />
              <Notice message={signupError} />
              <form className="space-y-6" onSubmit={async (event) => {
                event.preventDefault()
                const email = String(signupForm.email || '').trim().toLowerCase()
                const normalizedPhoneNumber = String(signupForm.phoneNumber || '').replace(/\D/g, '').slice(0, 11)
                const nextErrors = {
                  firstName: '',
                  lastName: '',
                  otherNames: '',
                  email: '',
                  phoneNumber: '',
                  password: '',
                  confirmPassword: '',
                  agree: '',
                }
                if (!signupForm.firstName.trim()) nextErrors.firstName = 'First name is required.'
                if (!signupForm.lastName.trim()) nextErrors.lastName = 'Last name is required.'
                if (!email) nextErrors.email = 'Work email is required.'
                else if (!EMAIL_REGEX.test(email)) nextErrors.email = 'Please enter a valid email address.'
                if (!normalizedPhoneNumber) nextErrors.phoneNumber = 'Phone number is required.'
                else if (!CLIENT_PHONE_REGEX.test(normalizedPhoneNumber)) nextErrors.phoneNumber = 'Phone number must be 10 or 11 digits.'
                if (!signupForm.password) nextErrors.password = 'Create password is required.'
                else if (!PASSWORD_REGEX.test(signupForm.password)) nextErrors.password = 'Password does not meet security requirements.'
                if (!signupForm.confirmPassword) nextErrors.confirmPassword = 'Please confirm your password.'
                else if (signupForm.password !== signupForm.confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.'
                if (!signupForm.agree) nextErrors.agree = 'You must agree to the Terms of Service and Privacy Policy.'
                setSignupFieldErrors(nextErrors)
                if (Object.values(nextErrors).some(Boolean)) {
                  setSignupError('')
                  return
                }
                setSignupError('')
                setIsSignupLoading(true)
                const result = await onSignup({
                  ...signupForm,
                  email,
                  phoneNumber: normalizedPhoneNumber,
                  teamInviteToken: String(signupPrefill?.inviteToken || '').trim(),
                  teamInviteCompanyId: String(signupPrefill?.companyId || '').trim(),
                })
                if (!result?.ok) {
                  const message = String(result?.message || 'Unable to create account.').trim()
                  const normalizedMessage = message.toLowerCase()
                  if (normalizedMessage.includes('email') && normalizedMessage.includes('already')) {
                    setSignupFieldErrors((previous) => ({ ...previous, email: message }))
                    setSignupError('')
                  } else if (normalizedMessage.includes('phone')) {
                    setSignupFieldErrors((previous) => ({ ...previous, phoneNumber: message }))
                    setSignupError('')
                  } else {
                    setSignupError(message)
                  }
                }
                setIsSignupLoading(false)
              }}>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="First Name" icon={Shield} error={signupFieldErrors.firstName} required><input value={signupForm.firstName} onChange={(e) => { setSignupError(''); setSignupFieldErrors((previous) => ({ ...previous, firstName: '' })); setSignupForm((p) => ({ ...p, firstName: e.target.value })) }} placeholder="Enter your first name" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /></Field>
                  <Field label="Last Name" icon={Shield} error={signupFieldErrors.lastName} required><input value={signupForm.lastName} onChange={(e) => { setSignupError(''); setSignupFieldErrors((previous) => ({ ...previous, lastName: '' })); setSignupForm((p) => ({ ...p, lastName: e.target.value })) }} placeholder="Enter your last name" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /></Field>
                  <div className="md:col-span-2"><Field label="Other Name" icon={Shield} error={signupFieldErrors.otherNames}><input value={signupForm.otherNames} onChange={(e) => { setSignupError(''); setSignupFieldErrors((previous) => ({ ...previous, otherNames: '' })); setSignupForm((p) => ({ ...p, otherNames: e.target.value })) }} placeholder="Enter other name" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /></Field></div>
                  <Field label="Work Email" icon={Mail} error={signupFieldErrors.email} required><input value={signupForm.email} readOnly={isInviteSignup} onChange={(e) => { if (isInviteSignup) return; setSignupError(''); setSignupFieldErrors((previous) => ({ ...previous, email: '' })); setSignupForm((p) => ({ ...p, email: e.target.value })) }} placeholder="name@company.com" className={`h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400 ${isInviteSignup ? 'cursor-not-allowed text-slate-500' : ''}`} /></Field>
                  <Field label="Phone Number" icon={Phone} error={signupFieldErrors.phoneNumber} required><input type="text" inputMode="numeric" value={signupForm.phoneNumber} onChange={(e) => { setSignupError(''); setSignupFieldErrors((previous) => ({ ...previous, phoneNumber: '' })); setSignupForm((p) => ({ ...p, phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 11) })) }} placeholder="08012345678" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /></Field>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Field label="Create Password" icon={Lock} error={signupFieldErrors.password} required><input type={showSignupPassword ? 'text' : 'password'} value={signupForm.password} onChange={(e) => { setSignupError(''); setSignupFieldErrors((previous) => ({ ...previous, password: '' })); setSignupForm((p) => ({ ...p, password: e.target.value })) }} placeholder="Create a secure password" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /><button type="button" onClick={() => setShowSignupPassword((p) => !p)} className="text-slate-400">{showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></Field>
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Password Requirements</p>
                      <ul className="mt-3 space-y-2 text-sm text-slate-600">{PASSWORD_REQUIREMENTS.map((item) => {
                        const active = (item === 'Minimum 8 characters' && signupForm.password.length >= 8) || (item === 'At least one uppercase letter' && /[A-Z]/.test(signupForm.password)) || (item === 'At least one number' && /\d/.test(signupForm.password)) || (item === 'At least one special character' && /[^A-Za-z0-9]/.test(signupForm.password))
                        return <li key={item} className={`flex items-center gap-2 ${active ? 'text-emerald-700' : ''}`}><span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} />{item}</li>
                      })}</ul>
                    </div>
                  </div>
                  <Field label="Confirm Password" icon={Lock} error={signupFieldErrors.confirmPassword} required><input type={showSignupPassword ? 'text' : 'password'} value={signupForm.confirmPassword} onChange={(e) => { setSignupError(''); setSignupFieldErrors((previous) => ({ ...previous, confirmPassword: '' })); setSignupForm((p) => ({ ...p, confirmPassword: e.target.value })) }} placeholder="Confirm your password" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /></Field>
                </div>
                <div className="space-y-2">
                  <label className={`inline-flex items-start gap-3 rounded-2xl border bg-slate-50 px-4 py-4 text-sm text-slate-600 ${signupFieldErrors.agree ? 'border-red-300' : 'border-slate-200'}`}>
                    <input
                      type="checkbox"
                      checked={signupForm.agree}
                      onChange={(event) => {
                        if (event.target.checked) {
                          handleOpenPolicyModal('legal')
                          return
                        }
                        setSignupError('')
                        setSignupFieldErrors((previous) => ({ ...previous, agree: '' }))
                        setSignupForm((previous) => ({ ...previous, agree: false }))
                      }}
                      className="mt-0.5 h-4 w-4 accent-[#153585]"
                    />
                    <span>
                      I agree to the{' '}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          handleOpenPolicyModal('legal')
                        }}
                        className="font-semibold text-[#153585] underline underline-offset-2"
                      >
                        Terms of Service
                      </button>{' '}
                      and{' '}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          handleOpenPolicyModal('privacy')
                        }}
                        className="font-semibold text-[#153585] underline underline-offset-2"
                      >
                        Privacy Policy
                      </button>{' '}
                      <span className="text-red-500">*</span>
                    </span>
                  </label>
                  {signupFieldErrors.agree ? <p className="text-xs font-medium text-red-600">{signupFieldErrors.agree}</p> : null}
                </div>
                <button type="submit" disabled={isSignupLoading} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: BRAND_COLOR }}>{isSignupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{isSignupLoading ? 'Creating Account...' : 'Create Account'}</button>
              </form>
              {footer}
            </>
          ) : null}
          {mode === 'forgot-password' ? (
            <>
              <Notice type="info" message="If an account exists for this email, a password reset link will be sent securely." />
              <Notice type={forgotFeedback?.type} message={forgotFeedback?.message} />
              <form className="space-y-4" onSubmit={async (event) => {
                event.preventDefault()
                const email = String(forgotEmail || '').trim().toLowerCase()
                if (!EMAIL_REGEX.test(email)) return setForgotFeedback({ type: 'error', message: 'Please enter a valid email address.' })
                setIsForgotLoading(true)
                const result = await onRequestPasswordReset(email)
                setForgotFeedback({ type: result?.ok ? 'success' : 'error', message: result?.message || 'Unable to process your request.' })
                setIsForgotLoading(false)
              }}>
                <Field label="Email Address" icon={Mail}><input value={forgotEmail} onChange={(e) => { setForgotFeedback(null); setForgotEmail(e.target.value) }} placeholder="name@company.com" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /></Field>
                <button type="submit" disabled={isForgotLoading} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: BRAND_COLOR }}>{isForgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{isForgotLoading ? 'Sending Reset Link...' : 'Send Reset Link'}</button>
              </form>
              {footer}
            </>
          ) : null}
          {mode === 'reset-password' ? (
            <>
              {isResolvingResetCode ? <Notice type="info" message="Validating your secure reset link..." /> : null}
              <Notice type={resetFeedback?.type} message={resetFeedback?.message} />
              <form className="space-y-4" onSubmit={async (event) => {
                event.preventDefault()
                if (!actionCode) return setResetFeedback({ type: 'error', message: 'Reset link is invalid or expired.' })
                if (!PASSWORD_REGEX.test(resetForm.password)) return setResetFeedback({ type: 'error', message: 'Password does not meet security requirements.' })
                if (resetForm.password !== resetForm.confirmPassword) return setResetFeedback({ type: 'error', message: 'Passwords do not match.' })
                setIsResetLoading(true)
                const result = await onUpdatePassword({ oobCode: actionCode, password: resetForm.password, confirmPassword: resetForm.confirmPassword })
                setResetFeedback({ type: result?.ok ? 'success' : 'error', message: result?.message || (result?.ok ? 'Your password has been updated successfully. You can now sign in.' : 'Reset link is invalid or expired.') })
                if (result?.ok) setResetForm({ password: '', confirmPassword: '' })
                setIsResetLoading(false)
              }}>
                <Field label="Email Address" icon={Mail}><input value={resolvedResetEmail || passwordResetEmail || ''} readOnly className="h-full w-full bg-transparent text-sm outline-none" /></Field>
                <Field label="New Password" icon={Lock}><input type={showResetPassword ? 'text' : 'password'} value={resetForm.password} onChange={(e) => setResetForm((p) => ({ ...p, password: e.target.value }))} placeholder="Enter your new password" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /><button type="button" onClick={() => setShowResetPassword((p) => !p)} className="text-slate-400">{showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></Field>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"><span>Password Strength</span><span className="tracking-normal text-slate-600">{strength.label}</span></div>
                  <div className="mt-3 h-2 rounded-full bg-slate-200"><div className={`${strength.color} h-full rounded-full`} style={{ width: strength.width }} /></div>
                  <ul className="mt-4 space-y-2 text-sm text-slate-600">{PASSWORD_REQUIREMENTS.map((item) => <li key={item} className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${((item === 'Minimum 8 characters' && resetForm.password.length >= 8) || (item === 'At least one uppercase letter' && /[A-Z]/.test(resetForm.password)) || (item === 'At least one number' && /\d/.test(resetForm.password)) || (item === 'At least one special character' && /[^A-Za-z0-9]/.test(resetForm.password))) ? 'bg-emerald-500' : 'bg-slate-300'}`} />{item}</li>)}</ul>
                </div>
                <Field label="Confirm New Password" icon={Lock}><input type={showResetPassword ? 'text' : 'password'} value={resetForm.confirmPassword} onChange={(e) => setResetForm((p) => ({ ...p, confirmPassword: e.target.value }))} placeholder="Confirm your new password" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /></Field>
                <button type="submit" disabled={isResetLoading || isResolvingResetCode} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: BRAND_COLOR }}>{isResetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{isResetLoading ? 'Resetting Password...' : 'Reset Password'}</button>
              </form>
              {footer}
            </>
          ) : null}
          {mode === 'email-verification' ? (
            <>
              {isVerificationApplying ? <Notice type="info" message="Verifying your email address..." /> : null}
              <Notice type={verificationFeedback?.type || 'info'} message={verificationFeedback?.message || 'A verification link has been sent to your email. Please verify your email address to activate your account.'} />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Verification Destination</p>
                <div className="mt-3 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#153585]"><Mail className="h-4 w-4" /></div><div><p className="text-sm font-semibold text-slate-900">{maskEmail(verificationTargetEmail)}</p><p className="text-xs text-slate-500">Use the link sent to this inbox to complete activation.</p></div></div>
              </div>
              {verificationFeedback?.type === 'success' ? (
                <button type="button" onClick={() => navigate('login')} className="inline-flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: BRAND_COLOR }}>Return to Login</button>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={async () => {
                    if (!EMAIL_REGEX.test(verificationTargetEmail)) return setVerificationFeedback({ type: 'error', message: 'Please enter a valid email address.' })
                    setIsVerificationResendLoading(true)
                    const result = await onResendVerificationEmail(verificationTargetEmail)
                    setVerificationFeedback({ type: result?.ok ? 'info' : 'error', message: result?.message || 'Unable to send verification email right now.' })
                    setIsVerificationResendLoading(false)
                  }} disabled={isVerificationResendLoading || isVerificationApplying} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:opacity-60">{isVerificationResendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Resend Verification Email</button>
                  <button type="button" onClick={() => navigate('login')} className="inline-flex h-12 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: BRAND_COLOR }}>Return to Login</button>
                </div>
              )}
              {footer}
            </>
          ) : null}
        </div>
      </div>
      {socialPrompt.open ? (
        <div className="fixed inset-0 z-[225] flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_30px_80px_rgba(15,23,42,0.24)]">
            <h3 className="text-lg font-semibold text-slate-900">Confirm Your Google Profile</h3>
            <p className="mt-2 text-sm text-slate-500">Review the name from Google before continuing.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="First Name" icon={Shield} error={socialPrompt.error && !socialPrompt.firstName ? socialPrompt.error : ''}>
                <input value={socialPrompt.firstName} onChange={(e) => setSocialPrompt((p) => ({ ...p, firstName: e.target.value, error: '' }))} placeholder="First name" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
              </Field>
              <Field label="Last Name" icon={Shield} error={socialPrompt.error && !socialPrompt.lastName ? socialPrompt.error : ''}>
                <input value={socialPrompt.lastName} onChange={(e) => setSocialPrompt((p) => ({ ...p, lastName: e.target.value, error: '' }))} placeholder="Last name" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Other Name" icon={Shield}>
                  <input value={socialPrompt.otherNames} onChange={(e) => setSocialPrompt((p) => ({ ...p, otherNames: e.target.value, error: '' }))} placeholder="Other name" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
                </Field>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setSocialPrompt(createEmptySocialPrompt()); onCancelSocialNamePrompt?.() }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={async () => {
                const firstName = String(socialPrompt.firstName || '').trim()
                const lastName = String(socialPrompt.lastName || '').trim()
                const otherNames = String(socialPrompt.otherNames || '').trim()
                if (!firstName || !lastName) return setSocialPrompt((p) => ({ ...p, error: 'First and last name are required.' }))
                setSocialLoading(socialPrompt.provider || 'google')
                const result = await onSocialLogin(socialPrompt.provider, { firstName, lastName, otherNames })
                setSocialLoading('')
                if (!result?.ok) return setSocialPrompt((p) => ({ ...p, error: result?.message || 'Authentication failed. Please try again.' }))
                setSocialPrompt(createEmptySocialPrompt())
              }} disabled={Boolean(socialLoading)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: BRAND_COLOR }}>{socialLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Continue</button>
            </div>
          </div>
        </div>
      ) : null}
      {activePolicyModal ? <PolicyModal type={activePolicyModal} onAgree={handleAgreeToPolicy} onDecline={handleDeclinePolicy} /> : null}
      {otpChallenge ? <OtpModal key={otpChallenge.requestId} challenge={otpChallenge} onVerifyOtp={onVerifyOtp} onResendOtp={onResendOtp} onCancelOtp={onCancelOtp} /> : null}
    </div>
  )
}

export default AuthExperience
