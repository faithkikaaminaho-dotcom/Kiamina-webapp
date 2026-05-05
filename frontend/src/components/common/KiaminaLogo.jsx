const KIAMINA_LOGO_SRC = '/img/logo.png'

function KiaminaLogo({ className = 'h-28 w-auto', alt = 'Kiamina Accounting Services logo' }) {
  return (
    <img
      src={KIAMINA_LOGO_SRC}
      alt={alt}
      className={`object-contain ${className}`}
    />
  )
}

export default KiaminaLogo
