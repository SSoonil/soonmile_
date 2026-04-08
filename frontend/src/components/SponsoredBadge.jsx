import React from 'react'

export default function SponsoredBadge() {
  return (
    <span className="sponsor-badge" aria-label="제휴 장소">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 18h18l-1.2 3H4.2L3 18zm2.2-11.1 4.6 3.5 2.2-6.4 2.2 6.4 4.6-3.5-1.8 9.1H7l-1.8-9.1z" />
      </svg>
      <span>제휴</span>
    </span>
  )
}
