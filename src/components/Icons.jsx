/** Minimal inline icon set (stroke = currentColor). */
const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export const IconGrid = (p) => (
  <svg viewBox="0 0 24 24" {...S} {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </svg>
)

export const IconMap = (p) => (
  <svg viewBox="0 0 24 24" {...S} {...p}>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
)

export const IconBars = (p) => (
  <svg viewBox="0 0 24 24" {...S} {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
)

export const IconThermo = (p) => (
  <svg viewBox="0 0 24 24" {...S} {...p}>
    <path d="M10 13.5V5a2.5 2.5 0 0 1 5 0v8.5a4.5 4.5 0 1 1-5 0Z" />
    <circle cx="12.5" cy="17.5" r="1.6" fill="currentColor" stroke="none" />
  </svg>
)

export const IconSliders = (p) => (
  <svg viewBox="0 0 24 24" {...S} {...p}>
    <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
    <circle cx="16" cy="8" r="2.2" />
    <circle cx="10" cy="16" r="2.2" />
  </svg>
)

export const IconGov = (p) => (
  <svg viewBox="0 0 24 24" {...S} {...p}>
    <path d="M3 21h18M5 21V10m14 11V10M9 21v-7m6 7v-7M2.5 10 12 3l9.5 7" />
  </svg>
)

export const IconDoc = (p) => (
  <svg viewBox="0 0 24 24" {...S} {...p}>
    <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8l-5-5Z" />
    <path d="M14 3v5h5M9 12.5h6M9 16h6" />
  </svg>
)

export const IconSun = (p) => (
  <svg viewBox="0 0 24 24" {...S} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" />
  </svg>
)

export const IconMoon = (p) => (
  <svg viewBox="0 0 24 24" {...S} {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </svg>
)

export const IconFlame = (p) => (
  <svg viewBox="0 0 24 24" {...S} {...p}>
    <path d="M12 21c4 0 6.5-2.6 6.5-6.2 0-4.4-4.2-6-4.9-10.3-2.6 1.6-3.9 4-3.4 6.9-1-.4-2-1.4-2.4-2.8C6.2 10.2 5.5 12 5.5 14.8 5.5 18.4 8 21 12 21Z" />
  </svg>
)
