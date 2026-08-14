import { ShieldCheck } from 'lucide-react'

/**
 * Animated brand logo — a shield core with an orbiting satellite dot,
 * pulsing glow and a shimmering gradient sweep.
 * size: pixel size of the square logo box.
 */
export default function AnimatedLogo({ size = 52, iconSize = 26, className = '' }) {
  return (
    <div
      className={`animated-logo ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.31 }}
      role="img"
      aria-label="Cyber Portal logo"
    >
      <span className="logo-glow" />
      <span className="logo-shimmer" />
      <span className="logo-orbit">
        <span className="logo-satellite" style={{ width: size * 0.14, height: size * 0.14 }} />
      </span>
      <ShieldCheck size={iconSize} className="logo-icon" />
    </div>
  )
}
