import { useState } from 'react'
import { Lock, Mail, ArrowLeft, KeyRound } from 'lucide-react'
import AdminOtpModal from './AdminOtpModal'
import KiaminaLogo from '../../common/KiaminaLogo'
import DotLottiePreloader from '../../common/DotLottiePreloader'

function AdminLoginPortal({
  onLogin,
  otpChallenge,
  onVerifyOtp,
  onResendOtp,
  onCancelOtp,
  onStartOwnerSetup,
  onSwitchToClientLogin,
}) {
  const [formState, setFormState] = useState({
    email: '',
    password: '',
    ownerPrivateKey: '',
    remember: true,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submitLogin = async (event) => {
    event.preventDefault()
    setLoginError('')
    setIsSubmitting(true)
    const result = await onLogin(formState)
    if (!result?.ok) {
      setLoginError(result?.message || 'Admin authentication failed.')
    }
    setIsSubmitting(false)
  }

  return (
    <div
      className="min-h-screen bg-[#F4F6FB] flex items-center justify-center px-4 py-10"
      style={{ fontFamily: "'Helvetica Now', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}
    >
      <div className="w-full max-w-md bg-white border border-border-light rounded-xl shadow-card p-8">
        <div className="flex items-center justify-center mb-6">
          <KiaminaLogo className="h-32 w-auto" />
        </div>

        <h1 className="text-2xl font-semibold text-text-primary text-center">Admin Portal</h1>
        <p className="text-sm text-text-secondary text-center mt-2 mb-7">Authorized personnel only.</p>

        <form className="space-y-4" onSubmit={submitLogin}>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Work Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="email"
                value={formState.email}
                onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="admin@company.com"
                className="w-full h-11 pl-9 pr-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={formState.password}
                onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
                className="w-full h-11 pl-9 pr-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Owner Private Key</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="password"
                value={formState.ownerPrivateKey}
                onChange={(event) => setFormState((prev) => ({ ...prev, ownerPrivateKey: event.target.value }))}
                placeholder="Required for Owner accounts"
                className="w-full h-11 pl-9 pr-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <p className="text-xs text-text-muted mt-1">Owner accounts require this private key after password.</p>
          </div>

          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(event) => setShowPassword(event.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              Show password
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={formState.remember}
                onChange={(event) => setFormState((prev) => ({ ...prev, remember: event.target.checked }))}
                className="w-4 h-4 accent-primary"
              />
              Keep me signed in
            </label>
          </div>

          {loginError && (
            <div className="rounded-md border border-error/25 bg-error-bg px-3 py-2">
              <p className="text-xs text-error">{loginError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {isSubmitting && <DotLottiePreloader size={18} />}
            {isSubmitting ? 'Processing...' : 'Sign In to Admin Portal'}
          </button>
        </form>

        <div className="mt-5 rounded-lg border border-border-light bg-[#FAFBFF] px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">First-Time Owner Setup</p>
          <p className="mt-2 text-sm text-text-secondary">
            Creating the primary owner admin account for the first time? Start owner setup here, then return to this portal for future sign-ins.
          </p>
          <button
            type="button"
            onClick={onStartOwnerSetup}
            className="mt-3 h-10 w-full rounded-md border border-primary text-primary text-sm font-semibold hover:bg-primary-tint transition-colors"
          >
            Start Owner Setup
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-border-light">
          <button
            type="button"
            onClick={onSwitchToClientLogin}
            className="text-sm text-text-secondary hover:text-text-primary inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Client Login
          </button>
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

export default AdminLoginPortal
