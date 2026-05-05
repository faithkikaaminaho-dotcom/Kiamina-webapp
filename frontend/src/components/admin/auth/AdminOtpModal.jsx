import { useRef, useState } from 'react'
import DotLottiePreloader from '../../common/DotLottiePreloader'

function maskEmailAddress(email) {
  const normalizedEmail = email?.trim() || ''
  const atIndex = normalizedEmail.indexOf('@')
  if (atIndex <= 1) return normalizedEmail || 'your registered email'
  const localPart = normalizedEmail.slice(0, atIndex)
  const domainPart = normalizedEmail.slice(atIndex)
  return `${localPart[0]}${'*'.repeat(Math.max(4, localPart.length - 1))}${domainPart}`
}

function AdminOtpModal({ challenge, onVerifyOtp, onResendOtp, onCancelOtp }) {
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [otpError, setOtpError] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const inputRefs = useRef([])

  const otpCode = otpDigits.join('')
  const deliveryStatusMessage = challenge?.deliveryError
    ? 'Email delivery could not be confirmed. Please resend the code if it does not arrive.'
    : ''

  const handleOtpChange = (index, rawValue) => {
    const numericValue = rawValue.replace(/\D/g, '')
    if (!numericValue) {
      const nextDigits = [...otpDigits]
      nextDigits[index] = ''
      setOtpDigits(nextDigits)
      return
    }

    const nextDigits = [...otpDigits]
    numericValue.slice(0, 6 - index).split('').forEach((digit, offset) => {
      nextDigits[index + offset] = digit
    })
    setOtpDigits(nextDigits)
    setOtpError('')

    const nextFocusIndex = Math.min(index + numericValue.length, 5)
    inputRefs.current[nextFocusIndex]?.focus()
    inputRefs.current[nextFocusIndex]?.select()

    if (nextDigits.join('').length === 6) {
      void verifyCode(nextDigits.join(''))
    }
  }

  const handleOtpKeyDown = (index, event) => {
    if (event.key !== 'Backspace') return
    if (otpDigits[index]) {
      const nextDigits = [...otpDigits]
      nextDigits[index] = ''
      setOtpDigits(nextDigits)
      return
    }
    if (index > 0) {
      const nextDigits = [...otpDigits]
      nextDigits[index - 1] = ''
      setOtpDigits(nextDigits)
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (event) => {
    event.preventDefault()
    const pastedDigits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pastedDigits) return

    const nextDigits = ['', '', '', '', '', '']
    pastedDigits.split('').forEach((digit, index) => {
      nextDigits[index] = digit
    })
    setOtpDigits(nextDigits)
    setOtpError('')

    if (pastedDigits.length === 6) {
      void verifyCode(pastedDigits)
    } else {
      inputRefs.current[pastedDigits.length]?.focus()
    }
  }

  const verifyCode = async (overrideCode = '') => {
    const code = overrideCode || otpCode
    if (code.length !== 6 || isVerifying) return

    setIsVerifying(true)
    setOtpError('')
    const result = await onVerifyOtp(code)
    if (!result?.ok) {
      setOtpError(result?.message || 'Incorrect verification code.')
    }
    setIsVerifying(false)
  }

  const resendCode = async () => {
    if (isResending) return
    setIsResending(true)
    setOtpError('')
    const result = await onResendOtp()
    if (!result?.ok) {
      setOtpError(result?.message || 'Unable to resend OTP right now.')
      setIsResending(false)
      return
    }
    setOtpDigits(['', '', '', '', '', ''])
    inputRefs.current[0]?.focus()
    setIsResending(false)
  }

  return (
    <div className="fixed inset-0 z-[230] bg-black/35 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-border-light rounded-xl shadow-card p-6">
        <h3 className="text-xl font-semibold text-text-primary">Admin Verification</h3>
        <p className="text-sm text-text-secondary mt-2">Enter the 6-digit verification code sent to your email.</p>
        <p className="text-xs text-text-muted mt-1">{maskEmailAddress(challenge?.email)}</p>
        {deliveryStatusMessage ? <p className="mt-3 text-xs font-medium text-amber-600">{deliveryStatusMessage}</p> : null}

        <div className="mt-6" onPaste={handleOtpPaste}>
          <div className="grid grid-cols-6 gap-2">
            {otpDigits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => { inputRefs.current[index] = element }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(event) => handleOtpChange(index, event.target.value)}
                onKeyDown={(event) => handleOtpKeyDown(index, event)}
                className={`h-12 text-center text-lg font-semibold border rounded-md focus:outline-none focus:border-primary ${otpError ? 'border-error' : 'border-border'}`}
              />
            ))}
          </div>
          {otpError && <p className="text-xs text-error mt-2">{otpError}</p>}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onCancelOtp}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void resendCode()}
              disabled={isResending}
              className="text-sm text-primary hover:text-primary-light disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isResending ? 'Resending...' : 'Resend Code'}
            </button>
            <button
              type="button"
              onClick={() => void verifyCode()}
              disabled={otpCode.length !== 6 || isVerifying}
              className="h-10 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {isVerifying && <DotLottiePreloader size={18} />}
              {isVerifying ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminOtpModal
