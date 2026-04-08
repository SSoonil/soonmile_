export const TRIP_PIN_COLOR_GROUP_DEFAULT = '#FF8B24'
const TRIP_PIN_COLOR_SOLO_DEFAULT = '#1E7FCD'
const TRIP_PIN_COLOR_FALLBACK = TRIP_PIN_COLOR_GROUP_DEFAULT

export function getDefaultTripPinColor(tripType) {
  return String(tripType ?? '').trim().toUpperCase() === 'SOLO' ? TRIP_PIN_COLOR_SOLO_DEFAULT : TRIP_PIN_COLOR_GROUP_DEFAULT
}

export function normalizeTripPinColor(value, fallbackColor = TRIP_PIN_COLOR_FALLBACK) {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (/^#[0-9A-F]{6}$/.test(normalized)) {
    return normalized
  }

  const normalizedFallback = String(fallbackColor ?? '').trim().toUpperCase()
  if (/^#[0-9A-F]{6}$/.test(normalizedFallback)) {
    return normalizedFallback
  }

  return TRIP_PIN_COLOR_FALLBACK
}
