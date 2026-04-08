import { ROUTES } from './config'

export function getRouteFromHash() {
  const raw = window.location.hash.replace('#', '').trim()
  if (raw.startsWith('trip-detail/')) {
    return 'trip-detail'
  }
  if (raw.startsWith('place-view/')) {
    return 'place-view'
  }
  if (raw.startsWith('invite/')) {
    return 'invite'
  }
  if (raw.startsWith('trip-share/')) {
    return 'trip-share'
  }
  if (raw && ROUTES[raw]) {
    return raw
  }
  return 'home'
}

export function getTripIdFromHash() {
  const raw = window.location.hash.replace('#', '').trim()
  if (!raw.startsWith('trip-detail/')) {
    return null
  }
  const tripId = decodeURIComponent(raw.slice('trip-detail/'.length)).trim()
  return tripId.length > 0 ? tripId : null
}

export function getPlaceIdFromHash() {
  const raw = window.location.hash.replace('#', '').trim()
  if (!raw.startsWith('place-view/')) {
    return null
  }
  const placeId = decodeURIComponent(raw.slice('place-view/'.length)).trim()
  return placeId.length > 0 ? placeId : null
}

export function getInviteCodeFromHash() {
  const raw = window.location.hash.replace('#', '').trim()
  if (!raw.startsWith('invite/')) {
    return null
  }
  const inviteCode = decodeURIComponent(raw.slice('invite/'.length)).trim()
  return inviteCode.length > 0 ? inviteCode : null
}

export function getTripShareTokenFromHash() {
  const raw = window.location.hash.replace('#', '').trim()
  if (!raw.startsWith('trip-share/')) {
    return null
  }
  const token = decodeURIComponent(raw.slice('trip-share/'.length)).trim()
  return token.length > 0 ? token : null
}

export function setRouteHash(routeKey) {
  window.location.hash = `#${String(routeKey ?? '').trim()}`
}

export function toRouteHref(routeKey) {
  return `#${String(routeKey ?? '').trim()}`
}

export function setTripDetailHash(tripId) {
  window.location.hash = `#trip-detail/${encodeURIComponent(String(tripId ?? '').trim())}`
}

export function setPlaceViewHash(placeId) {
  window.location.hash = `#place-view/${encodeURIComponent(String(placeId ?? '').trim())}`
}

export function setInviteHash(inviteCode) {
  window.location.hash = `#invite/${encodeURIComponent(String(inviteCode ?? '').trim())}`
}

export function setTripShareHash(shareToken) {
  window.location.hash = `#trip-share/${encodeURIComponent(String(shareToken ?? '').trim())}`
}
