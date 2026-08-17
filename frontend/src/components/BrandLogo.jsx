/**
 * BrandLogo — the Social Hub mark.
 *
 * A modern "network hub" glyph: a bright core (the hub) connected to a ring of
 * community nodes by soft spokes, wrapped in a slow orbit. It reads as people
 * gathering around a central space — connection, community, and presence.
 * Pure SVG + CSS animation, no external assets.
 *
 * Props:
 *  - size: pixel size of the square logo box (default 52)
 *  - className: extra classes (e.g. "brand-mark", "mini-logo")
 *  - animated: set false for a static variant (default true)
 */
export default function BrandLogo({ size = 52, className = '', animated = true }) {
  const uid = animated ? 'anim' : 'static'
  return (
    <div
      className={`brand-logo ${animated ? 'brand-logo-animated' : ''} ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
      role="img"
      aria-label="Social Hub logo"
    >
      {animated && <span className="brand-logo-glow" aria-hidden="true" />}
      {animated && <span className="brand-logo-shimmer" aria-hidden="true" />}
      <svg
        className="brand-logo-svg"
        viewBox="0 0 64 64"
        width={size * 0.66}
        height={size * 0.66}
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`ring-${uid}`} x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#67e8f9" />
            <stop offset="0.5" stopColor="#818cf8" />
            <stop offset="1" stopColor="#c084fc" />
          </linearGradient>
          <radialGradient id={`core-${uid}`} cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.45" stopColor="#c7d2fe" />
            <stop offset="1" stopColor="#6366f1" />
          </radialGradient>
          <linearGradient id={`node-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a5f3fc" />
            <stop offset="1" stopColor="#818cf8" />
          </linearGradient>
        </defs>

        {/* Orbit ring */}
        <circle
          className="logo-orbit-ring"
          cx="32"
          cy="32"
          r="17.5"
          stroke={`url(#ring-${uid})`}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="6 7"
          opacity="0.85"
        />

        {/* Spokes connecting the hub to each node */}
        <g className="logo-spokes" stroke={`url(#ring-${uid})`} strokeWidth="2.2" strokeLinecap="round" opacity="0.55">
          <line x1="32" y1="32" x2="32" y2="14.5" />
          <line x1="32" y1="32" x2="47.2" y2="40.8" />
          <line x1="32" y1="32" x2="16.8" y2="40.8" />
        </g>

        {/* Community nodes */}
        <circle className="logo-node logo-node-1" cx="32" cy="14.5" r="4.6" fill={`url(#node-${uid})`} stroke="#0b1230" strokeWidth="1.6" />
        <circle className="logo-node logo-node-2" cx="47.2" cy="40.8" r="4.6" fill={`url(#node-${uid})`} stroke="#0b1230" strokeWidth="1.6" />
        <circle className="logo-node logo-node-3" cx="16.8" cy="40.8" r="4.6" fill={`url(#node-${uid})`} stroke="#0b1230" strokeWidth="1.6" />

        {/* Central hub core */}
        <circle className="logo-core-halo" cx="32" cy="32" r="11.5" fill={`url(#core-${uid})`} opacity="0.28" />
        <circle className="logo-core" cx="32" cy="32" r="8.4" fill={`url(#core-${uid})`} stroke="rgba(255,255,255,0.65)" strokeWidth="1.4" />
        {/* Core highlight */}
        <circle cx="29.4" cy="29.2" r="2.6" fill="rgba(255,255,255,0.85)" />
      </svg>
      {animated && (
        <span className="brand-logo-orbit" aria-hidden="true">
          <span className="brand-logo-satellite" style={{ width: size * 0.12, height: size * 0.12 }} />
        </span>
      )}
    </div>
  )
}
