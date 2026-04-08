import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import './styles/interactive-cards.css'
import { createPortal } from 'react-dom'
import SponsoredBadge from './components/SponsoredBadge'
import {
  ADMIN_MENU_ITEMS,
  ADMIN_ROUTE_KEYS,
  AUTH_NAV_ITEMS,
  NAV_ITEMS,
  ROUTES,
  USER_PROTECTED_ROUTE_KEYS,
} from './routes/config'
import {
  getInviteCodeFromHash,
  getPlaceIdFromHash,
  getRouteFromHash,
  getTripShareTokenFromHash,
  getTripIdFromHash,
  setPlaceViewHash,
  setRouteHash,
  setTripDetailHash,
  toRouteHref,
} from './routes/hash'
import {
  TRIP_PIN_COLOR_GROUP_DEFAULT,
  getDefaultTripPinColor,
  normalizeTripPinColor,
} from './utils/tripPinColor'

const KAKAO_MAP_API_KEY = import.meta.env.VITE_KAKAO_MAP_API_KEY
const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL ?? '').trim()
const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim()
const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const USER_SESSION_KEY = 'soonmile-user-session'
const USER_GROUP_STORAGE_PREFIX = 'soonmile-user-default-group-id'
const DEFAULT_CONSENT_TYPE = 'LOCATION_PHOTO_PROCESSING'
const DEFAULT_CONSENT_VERSION = 'v1.0'
const PHOTO_UPLOAD_MAX_BATCH_BYTES = 8 * 1024 * 1024
const PHOTO_UPLOAD_MAX_BATCH_COUNT = 5

const SPONSOR_BANNERS = [
  {
    title: '제주 오션뷰 리조트',
    subtitle: 'Soonmile 제휴 숙소',
    image:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80',
  },
  {
    title: '도쿄 시티 워킹 투어',
    subtitle: '현지 가이드 협찬 코스',
    image:
      'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1600&q=80',
  },
  {
    title: '부산 야경 크루즈',
    subtitle: '스페셜 프로모션 배너',
    image:
      'https://images.unsplash.com/photo-1480796927426-f609979314bd?auto=format&fit=crop&w=1600&q=80',
  },
]

const PLACE_DETAIL_CONTENT = {}

const ADMIN_ROLE_OPTIONS = ['ADMIN', 'MANAGER', 'USER']
const ADMIN_STATUS_OPTIONS = ['ACTIVE', 'PENDING', 'SUSPENDED']

const AUTH_HIGHLIGHTS = [
  '여행별 핀 자동 분류와 이동 동선 타임라인',
  '팀원 초대 기반 공동 앨범/메모 협업',
  '스폰서 제휴 장소 추천과 할인 큐레이션',
]

function getPhotosForPin(trip, pin) {
  const toPinPhotoItem = (photo, index) => {
    if (typeof photo === 'string') {
      return {
        id: `${pin.id}-photo-${index + 1}`,
        url: photo,
        similarityKey: '',
      }
    }

    if (photo && typeof photo === 'object') {
      return {
        id: photo.id ?? `${pin.id}-photo-${index + 1}`,
        url: photo.url ?? photo.preview ?? '',
        similarityKey: typeof photo.similarityKey === 'string' ? photo.similarityKey : '',
      }
    }

    return {
      id: `${pin.id}-photo-${index + 1}`,
      url: '',
      similarityKey: '',
    }
  }

  if (Array.isArray(pin.photos) && pin.photos.length > 0) {
    return pin.photos.map(toPinPhotoItem).filter((photo) => photo.url.length > 0)
  }

  return []
}

function groupSimilarPinPhotos(pinPhotos) {
  const grouped = new Map()

  pinPhotos.forEach((photo) => {
    const rawKey = typeof photo.similarityKey === 'string' ? photo.similarityKey.trim() : ''
    const key = rawKey.length > 0 ? `group:${rawKey}` : `single:${photo.id}`
    if (!grouped.has(key)) {
      grouped.set(key, { photos: [], isGrouped: rawKey.length > 0 })
    }
    grouped.get(key).photos.push(photo)
  })

  const similarGroups = []
  const singlePhotos = []

  grouped.forEach((entry, key) => {
    const photos = Array.isArray(entry?.photos) ? entry.photos : []
    if (entry?.isGrouped && photos.length >= 2) {
      const aiTitle = photos.find((photo) => typeof photo.aiTitle === 'string' && photo.aiTitle.trim().length > 0)?.aiTitle
      similarGroups.push({ key, photos, aiTitle: aiTitle?.trim() ?? '' })
      return
    }
    photos.forEach((photo) => {
      singlePhotos.push(photo)
    })
  })

  return { similarGroups, singlePhotos }
}

function getSimilarGroupSubtitle(pinTitle, group, index) {
  if (typeof group.aiTitle === 'string' && group.aiTitle.length > 0) {
    return group.aiTitle
  }

  const fallbackTitles = [
    `${pinTitle} 도착 직후 분위기 모음`,
    `${pinTitle} 앵글 비교 컷`,
    `${pinTitle} 베스트 후보 사진`,
    `${pinTitle} 비슷한 장면 연속 촬영`,
  ]

  return fallbackTitles[index % fallbackTitles.length]
}

function buildApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (!API_BASE_URL) {
    return normalizedPath
  }
  return `${API_BASE_URL.replace(/\/$/, '')}${normalizedPath}`
}

function resolveMediaUrl(url) {
  const normalized = String(url ?? '').trim()
  if (!normalized) {
    return ''
  }
  if (normalized.startsWith('data:') || /^https?:\/\//i.test(normalized)) {
    return normalized
  }
  return buildApiUrl(normalized.startsWith('/') ? normalized : `/${normalized}`)
}

let googleIdentityScriptPromise = null
const GOOGLE_IDENTITY_SCRIPT_TIMEOUT_MS = 10000

function createGoogleIdentityScriptElement() {
  const script = document.createElement('script')
  script.src = GOOGLE_IDENTITY_SCRIPT_URL
  script.async = true
  script.defer = true
  script.setAttribute('data-soonmile-loaded', 'false')
  document.head.appendChild(script)
  return script
}

function waitForGoogleIdentityScript(script) {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve()
      return
    }

    const loadedAttr = script.getAttribute('data-soonmile-loaded')
    const likelyLoaded = loadedAttr === 'true' || script.readyState === 'complete'
    if (likelyLoaded) {
      reject(new Error('Google SDK를 불러왔지만 로그인 객체를 초기화하지 못했습니다. 브라우저 설정과 도메인을 확인해주세요.'))
      return
    }

    let done = false
    const cleanup = () => {
      script.removeEventListener('load', handleLoad)
      script.removeEventListener('error', handleError)
      window.clearTimeout(timeoutId)
    }
    const finishResolve = () => {
      if (done) {
        return
      }
      done = true
      cleanup()
      resolve()
    }
    const finishReject = (error) => {
      if (done) {
        return
      }
      done = true
      cleanup()
      reject(error)
    }
    const handleLoad = () => {
      script.setAttribute('data-soonmile-loaded', 'true')
      if (!window.google?.accounts?.id) {
        finishReject(new Error('Google SDK는 로드되었지만 로그인 객체를 찾지 못했습니다. 도메인/브라우저 설정을 확인해주세요.'))
        return
      }
      finishResolve()
    }
    const handleError = () => {
      finishReject(new Error('Google SDK 로드에 실패했습니다. 네트워크 또는 브라우저 차단 설정을 확인해주세요.'))
    }
    const timeoutId = window.setTimeout(() => {
      finishReject(new Error('Google SDK 초기화가 지연되고 있습니다. 잠시 후 다시 시도해주세요.'))
    }, GOOGLE_IDENTITY_SCRIPT_TIMEOUT_MS)

    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
  })
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve()
  }
  if (googleIdentityScriptPromise) {
    return googleIdentityScriptPromise
  }

  googleIdentityScriptPromise = (async () => {
    let script = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`)
    if (script && script.getAttribute('data-soonmile-loaded') === 'true' && !window.google?.accounts?.id) {
      // Retry with a fresh tag when stale loaded state exists without Google global.
      script.remove()
      script = null
    }
    if (!script) {
      script = createGoogleIdentityScriptElement()
    }
    await waitForGoogleIdentityScript(script)
  })().catch((error) => {
    googleIdentityScriptPromise = null
    throw error
  })

  return googleIdentityScriptPromise
}

async function parseApiErrorMessage(response) {
  try {
    const data = await response.json()
    if (typeof data?.message === 'string' && data.message.trim().length > 0) {
      return data.message
    }
  } catch {
    return `요청에 실패했습니다. (${response.status})`
  }
  return `요청에 실패했습니다. (${response.status})`
}

class ApiRequestError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = Number(status) || 0
  }
}

function isAuthStatus(status) {
  return status === 401 || status === 403
}

function isAuthFailureError(error) {
  return error instanceof ApiRequestError && isAuthStatus(error.status)
}

function isRecoverableBootstrapError(error) {
  if (error instanceof ApiRequestError) {
    return error.status >= 500
  }
  return true
}

async function requestJson(path, options = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const primaryUrl = buildApiUrl(normalizedPath)

  const parseJsonResponse = async (response) => {
    if (!response.ok) {
      throw new ApiRequestError(await parseApiErrorMessage(response), response.status)
    }
    if (response.status === 204) {
      return null
    }
    return response.json()
  }

  try {
    const response = await fetch(primaryUrl, options)
    return await parseJsonResponse(response)
  } catch (error) {
    const shouldRetryWithProxy =
      API_BASE_URL.length > 0 &&
      normalizedPath.startsWith('/api/') &&
      !(error instanceof ApiRequestError)

    if (!shouldRetryWithProxy) {
      throw error
    }

    const fallbackResponse = await fetch(normalizedPath, options)
    return await parseJsonResponse(fallbackResponse)
  }
}

function normalizeUserSession(rawSession) {
  if (!rawSession || typeof rawSession !== 'object') {
    return null
  }

  const accessToken = String(rawSession.accessToken ?? '').trim()
  const refreshToken = String(rawSession.refreshToken ?? '').trim()
  const accessTokenExpiresAt = String(rawSession.accessTokenExpiresAt ?? '').trim()
  const refreshTokenExpiresAt = String(rawSession.refreshTokenExpiresAt ?? '').trim()
  const user = rawSession.user

  if (!accessToken || !refreshToken || !accessTokenExpiresAt || !refreshTokenExpiresAt) {
    return null
  }
  if (!user || typeof user.email !== 'string') {
    return null
  }

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    user,
  }
}

function toTimeMillis(value) {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isNaN(parsed) ? 0 : parsed
}

function toIsoDate(value) {
  const trimmed = String(value ?? '').trim()
  if (trimmed.length === 0) {
    return ''
  }
  return trimmed.replaceAll('.', '-')
}

function buildDateRangeLabel(startDate, endDate) {
  const start = toIsoDate(startDate)
  const end = toIsoDate(endDate)
  if (!start || !end) {
    return ''
  }
  return `${start.replaceAll('-', '.')} - ${end.replaceAll('-', '.')}`
}

function normalizeHeaderValue(value) {
  return String(value ?? '').trim()
}

function buildAuthHeaders(session) {
  const accessToken = normalizeHeaderValue(session?.accessToken)
  if (!accessToken) {
    return {}
  }
  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

function buildGroupStorageKey(email) {
  return `${USER_GROUP_STORAGE_PREFIX}:${String(email ?? '').trim().toLowerCase()}`
}

function getStoredGroupId(email) {
  const key = buildGroupStorageKey(email)
  return String(window.localStorage.getItem(key) ?? '').trim()
}

function setStoredGroupId(email, groupId) {
  const key = buildGroupStorageKey(email)
  const normalizedGroupId = String(groupId ?? '').trim()
  if (normalizedGroupId.length === 0) {
    window.localStorage.removeItem(key)
    return
  }
  window.localStorage.setItem(key, normalizedGroupId)
}

function buildInviteHashUrl(inviteCode) {
  const normalizedInviteCode = String(inviteCode ?? '').trim()
  if (normalizedInviteCode.length === 0) {
    return ''
  }
  return `${window.location.origin}${window.location.pathname}#invite/${encodeURIComponent(normalizedInviteCode)}`
}

function buildTripShareHashUrl(shareToken) {
  const normalizedShareToken = String(shareToken ?? '').trim()
  if (normalizedShareToken.length === 0) {
    return ''
  }
  return `${window.location.origin}${window.location.pathname}#trip-share/${encodeURIComponent(normalizedShareToken)}`
}

function resolveTripShareUrl(shareToken, fallbackUrl) {
  const hashUrl = buildTripShareHashUrl(shareToken)
  if (hashUrl.length > 0) {
    return hashUrl
  }
  return String(fallbackUrl ?? '').trim()
}

function parseContentDispositionFilename(contentDisposition) {
  const normalized = String(contentDisposition ?? '').trim()
  if (!normalized) {
    return ''
  }

  const filenameStarMatch = normalized.match(/filename\*=UTF-8''([^;]+)/i)
  if (filenameStarMatch?.[1]) {
    try {
      return decodeURIComponent(filenameStarMatch[1])
    } catch {
      return filenameStarMatch[1]
    }
  }

  const filenameMatch = normalized.match(/filename="?([^";]+)"?/i)
  if (filenameMatch?.[1]) {
    return filenameMatch[1]
  }

  return ''
}

function normalizeNumberValue(value, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return parsed
}

function normalizeCoordinateValue(value) {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const normalized = String(value).trim()
  if (normalized.length === 0) {
    return null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function pickRandomItems(items, limit) {
  const source = Array.isArray(items) ? [...items] : []
  for (let index = source.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[source[index], source[randomIndex]] = [source[randomIndex], source[index]]
  }
  return source.slice(0, Math.max(0, limit))
}

function parseDateRange(dateRange) {
  const [startRaw = '', endRaw = ''] = String(dateRange ?? '').split('-').map((item) => item.trim())

  const normalize = (value) => {
    if (!value) {
      return ''
    }
    return value.replaceAll('.', '-')
  }

  return {
    startDate: normalize(startRaw),
    endDate: normalize(endRaw),
  }
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? '').trim())
}

function normalizeAdminRole(value) {
  const normalized = String(value ?? '').trim().toUpperCase()
  return ADMIN_ROLE_OPTIONS.includes(normalized) ? normalized : 'USER'
}

function normalizeAdminStatus(value) {
  const normalized = String(value ?? '').trim().toUpperCase()
  return ADMIN_STATUS_OPTIONS.includes(normalized) ? normalized : 'ACTIVE'
}

function normalizeAdminJoinedAt(value) {
  const raw = String(value ?? '').trim()
  if (raw.length === 0) {
    return new Date().toISOString().slice(0, 10)
  }

  const parsed = Date.parse(raw)
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10)
  }

  const dateOnly = raw.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return dateOnly
  }

  return new Date().toISOString().slice(0, 10)
}

function normalizeAdminUser(user, index = 0) {
  if (!user || typeof user !== 'object') {
    return null
  }

  const rawId = String(user.userId ?? user.id ?? '').trim()
  const email = String(user.email ?? '').trim().toLowerCase()
  if (!isValidEmail(email)) {
    return null
  }

  const fallbackName = email.includes('@') ? email.split('@')[0] : `사용자 ${index + 1}`
  return {
    id: rawId || `admin-user-${index + 1}`,
    name: String(user.name ?? '').trim() || fallbackName,
    email,
    role: normalizeAdminRole(user.role),
    status: normalizeAdminStatus(user.status),
    joinedAt: normalizeAdminJoinedAt(user.joinedAt ?? user.createdAt ?? user.created_at),
  }
}

function normalizeAdminUsers(users, fallbackUsers = []) {
  const normalizeList = (items) => {
    const source = Array.isArray(items) ? items : []
    const seenEmails = new Set()

    return source
      .map((user, index) => normalizeAdminUser(user, index))
      .filter((user) => {
        if (!user) {
          return false
        }
        if (seenEmails.has(user.email)) {
          return false
        }
        seenEmails.add(user.email)
        return true
      })
  }

  const primary = normalizeList(users)
  if (primary.length > 0) {
    return primary
  }

  return normalizeList(fallbackUsers)
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim())
}

function buildInvitePerson(email) {
  const normalizedEmail = String(email ?? '').trim().toLowerCase()
  const nickname = normalizedEmail.includes('@') ? normalizedEmail.split('@')[0] : normalizedEmail
  return {
    id: `invite-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: nickname || '새 멤버',
    email: normalizedEmail,
  }
}

function splitFilesIntoUploadBatches(files, maxBatchBytes = PHOTO_UPLOAD_MAX_BATCH_BYTES, maxBatchCount = PHOTO_UPLOAD_MAX_BATCH_COUNT) {
  const validFiles = Array.isArray(files) ? files.filter((item) => item instanceof File) : []
  if (validFiles.length === 0) {
    return []
  }

  const batches = []
  let currentBatch = []
  let currentBytes = 0

  validFiles.forEach((file) => {
    const fileSize = Number(file.size) || 0
    const exceedsCount = currentBatch.length >= maxBatchCount
    const exceedsBytes = currentBatch.length > 0 && currentBytes + fileSize > maxBatchBytes

    if (exceedsCount || exceedsBytes) {
      batches.push(currentBatch)
      currentBatch = []
      currentBytes = 0
    }

    currentBatch.push(file)
    currentBytes += fileSize
  })

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}

function buildPhotoPreviewByIdFromPins(pins) {
  const previewById = {}
  if (!Array.isArray(pins)) {
    return previewById
  }

  pins.forEach((pin) => {
    const photos = Array.isArray(pin?.photos) ? pin.photos : []
    photos.forEach((photo) => {
      const photoId = String(photo?.id ?? '').trim()
      const url = String(photo?.url ?? '').trim()
      if (photoId.length > 0 && url.length > 0) {
        previewById[photoId] = url
      }
    })
  })

  return previewById
}

function buildUploadedPreviewByFileMap(photoFiles, photoPreviews) {
  const uploadedFiles = Array.isArray(photoFiles) ? photoFiles.filter((item) => item instanceof File) : []
  const uploadedPreviews = Array.isArray(photoPreviews) ? photoPreviews : []
  const previewByFile = new Map()

  uploadedFiles.forEach((file, index) => {
    const preview = String(uploadedPreviews[index] ?? '').trim()
    if (preview.length > 0) {
      previewByFile.set(file, preview)
    }
  })

  return previewByFile
}

function normalizeInvitedPeople(invitedPeople) {
  if (!Array.isArray(invitedPeople)) {
    return []
  }

  const seenEmails = new Set()

  return invitedPeople
    .map((person, index) => {
      if (typeof person === 'string') {
        const normalizedEmail = person.trim().toLowerCase()
        return {
          id: `invite-${index + 1}-${normalizedEmail}`,
          name: normalizedEmail.split('@')[0] ?? '멤버',
          email: normalizedEmail,
        }
      }

      if (person && typeof person === 'object') {
        const normalizedEmail = String(person.email ?? '').trim().toLowerCase()
        return {
          id: person.id ?? `invite-${index + 1}-${normalizedEmail}`,
          name: String(person.name ?? '').trim() || (normalizedEmail.split('@')[0] ?? '멤버'),
          email: normalizedEmail,
        }
      }

      return null
    })
    .filter((person) => {
      if (!person || !isValidEmail(person.email)) {
        return false
      }

      if (seenEmails.has(person.email)) {
        return false
      }

      seenEmails.add(person.email)
      return true
    })
}

function normalizeTripMembers(members) {
  if (!Array.isArray(members)) {
    return []
  }

  const seenEmails = new Set()

  return members
    .map((member, index) => {
      const normalizedEmail = String(member?.email ?? '').trim().toLowerCase()
      if (!isValidEmail(normalizedEmail)) {
        return null
      }

      const fallbackName = normalizedEmail.split('@')[0] || '멤버'
      return {
        id: String(member?.userId ?? member?.id ?? `member-${index + 1}`).trim() || `member-${index + 1}`,
        name: String(member?.name ?? member?.displayName ?? '').trim() || fallbackName,
        email: normalizedEmail,
        role: String(member?.role ?? '').trim(),
        joinedAt: String(member?.joinedAt ?? '').trim(),
      }
    })
    .filter((member) => {
      if (!member) {
        return false
      }
      if (seenEmails.has(member.email)) {
        return false
      }
      seenEmails.add(member.email)
      return true
    })
}

function normalizeGroupInvites(invites) {
  if (!Array.isArray(invites)) {
    return []
  }

  const seenInviteIds = new Set()

  return invites
    .map((invite, index) => {
      const email = String(invite?.invitedEmail ?? invite?.email ?? '').trim().toLowerCase()
      if (!isValidEmail(email)) {
        return null
      }

      const inviteId = String(invite?.inviteId ?? invite?.id ?? `group-invite-${index + 1}-${email}`).trim()
      if (inviteId.length === 0) {
        return null
      }

      return {
        id: inviteId,
        inviteCode: String(invite?.inviteCode ?? '').trim(),
        name: String(invite?.invitedName ?? invite?.name ?? '').trim() || (email.split('@')[0] ?? '멤버'),
        email,
        inviteUrl: String(invite?.inviteUrl ?? '').trim(),
        shareUrl:
          String(invite?.inviteCode ?? '').trim().length > 0
            ? buildInviteHashUrl(String(invite?.inviteCode ?? '').trim())
            : String(invite?.inviteUrl ?? '').trim(),
        status: String(invite?.status ?? '').trim().toUpperCase() || 'PENDING',
        expiresAt: String(invite?.expiresAt ?? '').trim(),
        acceptedAt: String(invite?.acceptedAt ?? '').trim(),
      }
    })
    .filter((invite) => {
      if (!invite) {
        return false
      }
      if (seenInviteIds.has(invite.id)) {
        return false
      }
      seenInviteIds.add(invite.id)
      return true
    })
}

function resolveMyGroupRole(groupMembers, currentUserEmail, fallbackRole = 'MEMBER') {
  const normalizedMembers = normalizeTripMembers(groupMembers)
  const normalizedEmail = String(currentUserEmail ?? '').trim().toLowerCase()
  const myMember = normalizedMembers.find((member) => member.email === normalizedEmail)
  const memberRole = String(myMember?.role ?? '').trim().toUpperCase()
  if (memberRole === 'OWNER' || memberRole === 'MEMBER') {
    return memberRole
  }
  const fallback = String(fallbackRole ?? '').trim().toUpperCase()
  return fallback === 'OWNER' ? 'OWNER' : 'MEMBER'
}

function buildGroupParticipation(groupMembers, groupInvites, currentUserEmail, fallbackRole = 'MEMBER', fallbackMemberCount = 1) {
  const normalizedMembers = normalizeTripMembers(groupMembers)
  const normalizedGroupInvites = normalizeGroupInvites(groupInvites)
  const invitedPeople = normalizeInvitedPeople(
    normalizedGroupInvites.map((invite) => ({
      id: invite.id,
      name: invite.name,
      email: invite.email,
    })),
  )
  const participation = buildTripParticipationFromMembers(
    normalizedMembers,
    currentUserEmail,
    invitedPeople,
    fallbackMemberCount,
    normalizedMembers,
  )

  return {
    ...participation,
    groupInvites: normalizedGroupInvites,
    myGroupRole: resolveMyGroupRole(normalizedMembers, currentUserEmail, fallbackRole),
  }
}

function resolveTripParticipation({ memberCount, invitedPeople }) {
  const normalizedInvites = normalizeInvitedPeople(invitedPeople)
  const parsedMemberCount = Number(memberCount)
  const fallbackMemberCount = Number.isFinite(parsedMemberCount) ? Math.max(1, Math.floor(parsedMemberCount)) : 1
  const members = Math.max(fallbackMemberCount, normalizedInvites.length + 1)

  return {
    invitedPeople: normalizedInvites,
    members,
    type: members > 1 ? 'GROUP' : 'SOLO',
  }
}

function buildTripParticipationFromMembers(
  tripMembers,
  currentUserEmail,
  fallbackInvites = [],
  fallbackMemberCount = 1,
  fallbackParticipants = [],
) {
  const normalizedMembers = normalizeTripMembers(tripMembers)
  const normalizedFallbackParticipants = normalizeTripMembers(fallbackParticipants)
  const normalizedCurrentUserEmail = String(currentUserEmail ?? '').trim().toLowerCase()
  const invitedPeopleFromMembers = normalizeInvitedPeople(
    normalizedMembers
      .filter((member) => member.email !== normalizedCurrentUserEmail)
      .map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
      })),
  )
  const effectiveInvites = invitedPeopleFromMembers.length > 0 ? invitedPeopleFromMembers : normalizeInvitedPeople(fallbackInvites)
  const effectiveParticipants = normalizedMembers.length > 0 ? normalizedMembers : normalizedFallbackParticipants
  const normalizedFallbackCount = Number.isFinite(Number(fallbackMemberCount))
    ? Math.max(1, Math.floor(Number(fallbackMemberCount)))
    : 1
  const memberCountFromMembers = Math.max(
    normalizedFallbackCount,
    effectiveParticipants.length > 0 ? effectiveParticipants.length : 0,
    effectiveInvites.length + 1,
  )
  const resolvedParticipation = resolveTripParticipation({
    memberCount: memberCountFromMembers,
    invitedPeople: effectiveInvites,
  })

  return {
    ...resolvedParticipation,
    participants: effectiveParticipants,
  }
}

function buildLocalTripParticipants(invitedPeople, currentUser) {
  const normalizedInvites = normalizeInvitedPeople(invitedPeople)
  const currentUserEmail = String(currentUser?.email ?? '').trim().toLowerCase()
  const currentUserName = String(currentUser?.name ?? '').trim()
  const source = []

  if (isValidEmail(currentUserEmail)) {
    source.push({
      userId: `self-${currentUserEmail}`,
      name: currentUserName || '나',
      email: currentUserEmail,
      role: 'OWNER',
    })
  }

  normalizedInvites.forEach((person) => {
    source.push({
      userId: person.id,
      name: person.name,
      email: person.email,
      role: 'MEMBER',
    })
  })

  return normalizeTripMembers(source)
}

function normalizeRecommendedPlaces(places) {
  if (!Array.isArray(places)) {
    return []
  }

  return places
    .map((place, index) => {
      const id = String(place.id ?? `place-${index + 1}`)
      const details = PLACE_DETAIL_CONTENT[id] ?? {}
      const name = String(place.name ?? '').trim()
      const description = String(place.description ?? '').trim()
      const image = resolveMediaUrl(String(place.image ?? '').trim())
      const keywords = Array.isArray(place.keywords)
        ? place.keywords.map((keyword) => String(keyword).trim()).filter((keyword) => keyword.length > 0)
        : []
      const highlightsSource = Array.isArray(place.highlights)
        ? place.highlights
        : Array.isArray(details.highlights)
          ? details.highlights
          : keywords
      const highlights = highlightsSource.map((item) => String(item).trim()).filter((item) => item.length > 0)
      const galleryRaw = [
        ...(Array.isArray(place.gallery) ? place.gallery : []),
        ...(Array.isArray(details.gallery) ? details.gallery : []),
      ]
      const gallery = Array.from(
        new Set(galleryRaw.map((item) => resolveMediaUrl(String(item).trim())).filter((item) => item.length > 0 && item !== image)),
      )
      const latitude = normalizeCoordinateValue(place.latitude)
      const longitude = normalizeCoordinateValue(place.longitude)

      return {
        ...place,
        id,
        name,
        region: String(place.region ?? '').trim() || '기타',
        description,
        detailDescription: String(place.detailDescription ?? details.detailDescription ?? description).trim(),
        keywords,
        highlights,
        bestTime: String(place.bestTime ?? details.bestTime ?? '').trim(),
        image,
        gallery,
        latitude,
        longitude,
        isVisible: place.isVisible !== false,
        isSponsored: place.isSponsored === true,
      }
    })
    .filter((place) => place.name.length > 0)
}

function getInitialSelectedPlaceImage(place) {
  const primaryImage = String(place?.image ?? '').trim()
  if (primaryImage.length > 0) {
    return primaryImage
  }

  if (Array.isArray(place?.gallery)) {
    const firstGalleryImage = place.gallery.map((item) => String(item ?? '').trim()).find((item) => item.length > 0)
    if (firstGalleryImage) {
      return firstGalleryImage
    }
  }

  return ''
}

function normalizeReviewRating(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 5
  }
  return Math.min(5, Math.max(1, Math.round(parsed)))
}

function normalizePlaceReviewList(reviews, placeId) {
  if (!Array.isArray(reviews)) {
    return []
  }

  return reviews
    .map((review, index) => {
      if (!review || typeof review !== 'object') {
        return null
      }

      const comment = String(review.comment ?? '').trim()
      if (comment.length === 0) {
        return null
      }

      return {
        id: String(review.reviewId ?? review.id ?? `${placeId}-review-${index + 1}`),
        author: String(review.author ?? '익명 사용자').trim() || '익명 사용자',
        rating: normalizeReviewRating(review.rating),
        comment,
        createdAt: String(review.createdAt ?? new Date().toISOString()),
      }
    })
    .filter((review) => review !== null)
}

function getPlaceAverageRating(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return 0
  }

  const sum = reviews.reduce((acc, review) => acc + normalizeReviewRating(review.rating), 0)
  return Number((sum / reviews.length).toFixed(1))
}

function ensureUsersFromInvites(existingUsers, invitedPeople) {
  const baseUsers = normalizeAdminUsers(existingUsers, [])
  const normalizedInvites = normalizeInvitedPeople(invitedPeople)
  const existingEmails = new Set(baseUsers.map((user) => String(user.email ?? '').trim().toLowerCase()))

  normalizedInvites.forEach((person) => {
    if (existingEmails.has(person.email)) {
      return
    }

    baseUsers.push({
      id: `admin-user-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: person.name,
      email: person.email,
      role: normalizeAdminRole('USER'),
      status: normalizeAdminStatus('ACTIVE'),
      joinedAt: new Date().toISOString().slice(0, 10),
    })
    existingEmails.add(person.email)
  })

  return baseUsers
}

function buildTripPhotoItems(trip) {
  const fromPins = Array.isArray(trip.pins)
    ? trip.pins.flatMap((pin) => getPhotosForPin(trip, pin).map((photo) => photo.url))
    : []
  const fromPreviews = Array.isArray(trip.photoPreviews) ? trip.photoPreviews.filter((item) => typeof item === 'string' && item.length > 0) : []
  const mergedPhotos = [...fromPins, ...fromPreviews]
  const uniquePhotos = Array.from(new Set(mergedPhotos)).filter((item) => item.length > 0)

  if (uniquePhotos.length > 0) {
    return uniquePhotos.slice(0, 24).map((preview, index) => ({
      id: `saved-${index + 1}`,
      name: `사진 ${index + 1}`,
      preview,
    }))
  }

  if (typeof trip.cover === 'string' && trip.cover.length > 0) {
    return [
      {
        id: 'cover-photo',
        name: '커버 이미지',
        preview: trip.cover,
      },
    ]
  }

  return []
}

function loadKakaoMapSdk(appKey) {
  const normalizedAppKey = String(appKey ?? '').trim()
  if (!normalizedAppKey || normalizedAppKey.startsWith('your_')) {
    return Promise.reject(new Error('VITE_KAKAO_MAP_API_KEY 값이 없습니다.'))
  }

  const resolveKakaoWhenReady = () =>
    new Promise((resolve, reject) => {
      if (!window.kakao?.maps?.load) {
        reject(new Error('카카오맵 SDK 초기화에 실패했습니다. 앱키와 도메인 등록을 확인해주세요.'))
        return
      }
      window.kakao.maps.load(() => {
        if (!window.kakao?.maps) {
          reject(new Error('카카오맵 SDK 초기화에 실패했습니다. 앱키와 도메인 등록을 확인해주세요.'))
          return
        }
        resolve(window.kakao)
      })
    })

  if (window.kakao?.maps?.load) {
    return resolveKakaoWhenReady()
  }

  if (window.__soonmileKakaoSdkPromise && window.__soonmileKakaoSdkKey === normalizedAppKey) {
    return window.__soonmileKakaoSdkPromise
  }

  window.__soonmileKakaoSdkKey = normalizedAppKey
  window.__soonmileKakaoSdkPromise = new Promise((resolve, reject) => {
    let script = document.getElementById('kakao-map-sdk')

    const finalizeWithKakao = () => {
      resolveKakaoWhenReady().then(resolve).catch(reject)
    }

    if (script) {
      const mountedAppKey = String(script.getAttribute('data-appkey') ?? '').trim()
      if (mountedAppKey && mountedAppKey !== normalizedAppKey) {
        script.remove()
        script = null
      }
    }

    if (!script) {
      script = document.createElement('script')
      script.id = 'kakao-map-sdk'
      script.async = true
      script.defer = true
      script.setAttribute('data-appkey', normalizedAppKey)
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${normalizedAppKey}&autoload=false&libraries=services`
      document.head.append(script)
    }

    const handleLoad = () => finalizeWithKakao()
    const handleError = () => reject(new Error('카카오맵 SDK 로드 실패. 네트워크/차단 설정 또는 도메인 등록을 확인해주세요.'))

    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
  }).catch((error) => {
    window.__soonmileKakaoSdkPromise = null
    throw error
  })

  return window.__soonmileKakaoSdkPromise
}

function buildMarkerImage(kakao, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34"><path d="M13 0C5.82 0 0 5.82 0 13c0 8.63 9.77 19.82 12.16 22.43.46.5 1.23.5 1.69 0C16.23 32.82 26 21.63 26 13 26 5.82 20.18 0 13 0z" fill="${color}"/><circle cx="13" cy="13" r="5" fill="white"/></svg>`
  const src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
  return new kakao.maps.MarkerImage(src, new kakao.maps.Size(26, 34), {
    offset: new kakao.maps.Point(13, 34),
  })
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildMapInfoWindowContent(pin) {
  const pinId = escapeHtml(pin.id ?? '')
  const tripId = escapeHtml(pin.tripId ?? '')
  const title = escapeHtml(pin.title ?? '핀')
  const tripName = escapeHtml(pin.tripName ?? '내 여행')
  const imageUrl = escapeHtml(pin.representativePhotoUrl ?? '')
  const tripTypeLabel = pin.tripType === 'GROUP' ? '그룹여행' : pin.tripType === 'SOLO' ? '혼자여행' : '여행'
  const markerColor = normalizeTripPinColor(pin.tripPinColor, getDefaultTripPinColor(pin.tripType))
  const photoCount = Number.isFinite(pin.photoCount) ? Math.max(0, pin.photoCount) : 0
  const metaLabel = escapeHtml(`${tripTypeLabel} · 사진 ${photoCount}장`)

  const imageBlock =
    imageUrl.length > 0
      ? `<button type="button" class="map-info-preview-btn" data-pin-id="${pinId}" data-trip-id="${tripId}" style="display:block;width:100%;padding:0;border:0;background:transparent;cursor:pointer;"><img src="${imageUrl}" alt="${title}" style="width:100%;height:112px;object-fit:cover;display:block;border-radius:8px;" /></button>`
      : `<div style="width:100%;height:112px;border-radius:8px;background:linear-gradient(145deg,#ecf4fb,#dcebf8);display:grid;place-items:center;color:#2f5573;font-size:12px;font-weight:700;">대표 이미지 없음</div>`

  return `
    <div style="width:220px;padding:8px;display:grid;gap:8px;">
      ${imageBlock}
      <div style="display:grid;gap:2px;line-height:1.35;">
        <strong style="font-size:14px;color:#0f3656;">${title}</strong>
        <span style="font-size:12px;color:#2f5573;">${tripName}</span>
        <span style="font-size:11px;color:#4e708a;">${metaLabel}</span>
        <span style="font-size:11px;color:#4e708a;display:inline-flex;align-items:center;gap:6px;">
          <i style="width:9px;height:9px;border-radius:50%;background:${markerColor};border:1px solid rgba(0,0,0,0.18);display:inline-block;"></i>
          핀 색상
        </span>
      </div>
    </div>
  `
}

function getAllPinsFromTrips(trips) {
  return trips.flatMap((trip) =>
    trip.pins.map((pin) => {
      const pinPhotos = getPhotosForPin(trip, pin)
      const representativePhotoUrl = pinPhotos[0]?.url ?? trip.cover ?? ''
      const tripPinColor = normalizeTripPinColor(trip.pinColor, getDefaultTripPinColor(trip.type))
      return {
        ...pin,
        tripId: trip.id,
        tripName: trip.name,
        tripType: trip.type,
        tripPinColor,
        representativePhotoUrl,
        photoCount: pinPhotos.length,
      }
    }),
  )
}

function HomeView({ trips, loading, loadError, onOpenTripView }) {
  const [activeSlide, setActiveSlide] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SPONSOR_BANNERS.length)
    }, 3500)

    return () => window.clearInterval(timer)
  }, [])

  const goPrev = () => {
    setActiveSlide((prev) => (prev - 1 + SPONSOR_BANNERS.length) % SPONSOR_BANNERS.length)
  }

  const goNext = () => {
    setActiveSlide((prev) => (prev + 1) % SPONSOR_BANNERS.length)
  }

  return (
    <section className="home-main appear">
      <article className="surface-panel sponsor-panel">
        <div className="section-header">
          <div>
            <p className="label">Sponsored Places</p>
            <h2>장소 협찬 / 광고 배너</h2>
          </div>
        </div>
        <div className="slider-frame">
          <img
            src={SPONSOR_BANNERS[activeSlide].image}
            alt={SPONSOR_BANNERS[activeSlide].title}
            className="slider-image"
          />
          <div className="slider-overlay">
            <p>{SPONSOR_BANNERS[activeSlide].subtitle}</p>
            <strong>{SPONSOR_BANNERS[activeSlide].title}</strong>
          </div>
          <div className="slider-controls">
            <button type="button" onClick={goPrev} aria-label="이전 배너">
              이전
            </button>
            <button type="button" onClick={goNext} aria-label="다음 배너">
              다음
            </button>
          </div>
        </div>
        <div className="slider-dots">
          {SPONSOR_BANNERS.map((banner, index) => (
            <button
              key={banner.title}
              type="button"
              className={index === activeSlide ? 'is-active' : ''}
              onClick={() => setActiveSlide(index)}
              aria-label={`${index + 1}번 배너`}
            />
          ))}
        </div>
      </article>

      <article className="surface-panel trips-panel">
        <div className="section-header">
          <div>
            <p className="label">My Trips</p>
            <h2>내 여행들</h2>
          </div>
        </div>

        {loading ? (
          <p className="empty-state">서버에서 내 여행을 불러오는 중...</p>
        ) : loadError ? (
          <p className="auth-notice error">{loadError}</p>
        ) : trips.length > 0 ? (
          <div className="trip-grid">
            {trips.slice(0, 5).map((trip) => (
              <button
                key={trip.id}
                type="button"
                className="trip-card is-clickable"
                onClick={() => onOpenTripView?.(trip.id)}
                aria-label={`${trip.name} 상세 보기`}
              >
                <img src={trip.cover} alt={trip.name} />
                <div className="trip-body">
                  <strong>{trip.name}</strong>
                  <p>{trip.dateRange || '일정 미입력'}</p>
                  <span>
                    {trip.members}명 참여 · 사진 {trip.photos}장
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-state">아직 서버에 저장된 여행이 없습니다. 내 여행 추가로 첫 여행을 만들어보세요.</p>
        )}
      </article>
    </section>
  )
}

function MapView({ trips, loading, loadError }) {
  const mapRef = useRef(null)
  const mapObjRef = useRef(null)
  const markerRef = useRef([])
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')

  const pins = useMemo(() => getAllPinsFromTrips(Array.isArray(trips) ? trips : []), [trips])

  useEffect(() => {
    let isActive = true

    const initMap = async () => {
      try {
        if (!isActive) {
          return
        }
        setMapError('')
        const kakao = await loadKakaoMapSdk(KAKAO_MAP_API_KEY)
        if (!isActive || !mapRef.current) {
          return
        }

        const map = new kakao.maps.Map(mapRef.current, {
          center: new kakao.maps.LatLng(36.35, 127.9),
          level: 12,
        })
        mapObjRef.current = map

        const bounds = new kakao.maps.LatLngBounds()
        const markerImageByColor = new Map()

        pins.forEach((pin) => {
          const markerColor = normalizeTripPinColor(pin.tripPinColor, getDefaultTripPinColor(pin.tripType))
          if (!markerImageByColor.has(markerColor)) {
            markerImageByColor.set(markerColor, buildMarkerImage(kakao, markerColor))
          }
          const position = new kakao.maps.LatLng(pin.lat, pin.lng)
          const marker = new kakao.maps.Marker({
            position,
            map,
            image: markerImageByColor.get(markerColor),
          })

          const infoWindow = new kakao.maps.InfoWindow({
            content: buildMapInfoWindowContent(pin),
            removable: true,
          })

          kakao.maps.event.addListener(marker, 'click', () => infoWindow.open(map, marker))
          markerRef.current.push(marker)
          bounds.extend(position)
        })

        map.setBounds(bounds)
        setMapError('')
        setMapReady(true)
      } catch (error) {
        setMapReady(false)
        setMapError(error instanceof Error ? error.message : '지도를 불러오지 못했습니다.')
      }
    }

    initMap()
    return () => {
      isActive = false
      markerRef.current.forEach((marker) => marker.setMap(null))
      markerRef.current = []
    }
  }, [pins])

  return (
    <section className="single-grid appear">
      <article className="surface-panel map-panel">
        <div className="section-header">
          <div>
            <p className="label">Live Map Preview</p>
            <h2>카카오맵 기반 여행 핀 뷰</h2>
          </div>
          <div className="map-legend">
            <span>
              <i className="dot custom" /> 여행별 핀 색상
            </span>
          </div>
        </div>

        <div className="map-wrap">
          <div ref={mapRef} className="kakao-map" />
          {!mapReady && !mapError && <div className="map-overlay">지도를 불러오는 중...</div>}
          {mapError && <div className="map-overlay map-error">{mapError}</div>}
        </div>
        {loading && <p className="empty-state">서버에서 여행 데이터를 동기화하는 중...</p>}
        {loadError && <p className="auth-notice error">{loadError}</p>}
      </article>
    </section>
  )
}

function TripsView({ trips, loading, loadError, onOpenCreateTrip, onOpenTripView }) {
  const mapRef = useRef(null)
  const mapObjRef = useRef(null)
  const markerRef = useRef([])
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')

  const [tripTypeFilter, setTripTypeFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('LATEST')
  const [selectedTripIds, setSelectedTripIds] = useState(() => trips.map((trip) => trip.id))
  const validTripIds = useMemo(() => new Set(trips.map((trip) => trip.id)), [trips])
  const effectiveSelectedTripIds = useMemo(() => {
    const validSelections = selectedTripIds.filter((id) => validTripIds.has(id))
    return validSelections.length > 0 ? validSelections : trips.map((trip) => trip.id)
  }, [selectedTripIds, trips, validTripIds])

  const filteredTrips = useMemo(() => {
    const filtered =
      tripTypeFilter === 'ALL'
        ? [...trips]
        : trips.filter((trip) => trip.type === tripTypeFilter)

    filtered.sort((a, b) => {
      if (sortBy === 'OLDEST') {
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      }
      if (sortBy === 'PHOTOS') {
        return b.photos - a.photos
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })

    return filtered
  }, [trips, tripTypeFilter, sortBy])

  const visibleTripIds = useMemo(() => filteredTrips.map((trip) => trip.id), [filteredTrips])

  const allVisibleSelected = useMemo(
    () => visibleTripIds.length > 0 && visibleTripIds.every((tripId) => effectiveSelectedTripIds.includes(tripId)),
    [visibleTripIds, effectiveSelectedTripIds],
  )

  const pinsForMap = useMemo(() => {
    const targetTrips = filteredTrips.filter((trip) => effectiveSelectedTripIds.includes(trip.id))

    return getAllPinsFromTrips(targetTrips)
  }, [filteredTrips, effectiveSelectedTripIds])

  const toggleTrip = (tripId, checked) => {
    setSelectedTripIds((prev) => {
      const validPrev = prev.filter((id) => validTripIds.has(id))
      if (checked) {
        if (validPrev.includes(tripId)) {
          return validPrev
        }
        return [...validPrev, tripId]
      }
      return validPrev.filter((id) => id !== tripId)
    })
  }

  const toggleAllVisible = (checked) => {
    setSelectedTripIds((prev) => {
      const next = new Set(prev.filter((id) => validTripIds.has(id)))
      if (checked) {
        visibleTripIds.forEach((tripId) => next.add(tripId))
      } else {
        visibleTripIds.forEach((tripId) => next.delete(tripId))
      }
      return Array.from(next)
    })
  }

  useEffect(() => {
    let isActive = true

    const initOrUpdateMap = async () => {
      try {
        if (!isActive) {
          return
        }
        setMapError('')
        const kakao = await loadKakaoMapSdk(KAKAO_MAP_API_KEY)
        if (!isActive || !mapRef.current) {
          return
        }

        if (!mapObjRef.current) {
          mapObjRef.current = new kakao.maps.Map(mapRef.current, {
            center: new kakao.maps.LatLng(36.2, 127.8),
            level: 12,
          })
        }

        const map = mapObjRef.current
        markerRef.current.forEach((marker) => marker.setMap(null))
        markerRef.current = []

        const bounds = new kakao.maps.LatLngBounds()
        const markerImageByColor = new Map()

        pinsForMap.forEach((pin) => {
          const markerColor = normalizeTripPinColor(pin.tripPinColor, getDefaultTripPinColor(pin.tripType))
          if (!markerImageByColor.has(markerColor)) {
            markerImageByColor.set(markerColor, buildMarkerImage(kakao, markerColor))
          }
          const position = new kakao.maps.LatLng(pin.lat, pin.lng)
          const marker = new kakao.maps.Marker({
            position,
            map,
            image: markerImageByColor.get(markerColor),
          })

          const infoWindow = new kakao.maps.InfoWindow({
            content: buildMapInfoWindowContent(pin),
            removable: true,
          })

          kakao.maps.event.addListener(marker, 'click', () => infoWindow.open(map, marker))
          markerRef.current.push(marker)
          bounds.extend(position)
        })

        if (pinsForMap.length > 0) {
          map.setBounds(bounds)
        } else {
          map.setCenter(new kakao.maps.LatLng(36.2, 127.8))
          map.setLevel(12)
        }

        setMapError('')
        setMapReady(true)
      } catch (error) {
        setMapReady(false)
        setMapError(error instanceof Error ? error.message : '지도를 불러오지 못했습니다.')
      }
    }

    initOrUpdateMap()

    return () => {
      isActive = false
    }
  }, [pinsForMap])

  return (
    <section className="single-grid appear">
      <article className="surface-panel map-panel">
        <div className="section-header">
          <div>
            <p className="label">Trips Map</p>
            <h2>내 여행 핀 전체 보기</h2>
          </div>
          <div className="map-legend">
            <span>
              <i className="dot custom" /> 여행별 핀 색상
            </span>
          </div>
        </div>

        <div className="map-wrap">
          <div ref={mapRef} className="kakao-map" />
          {!mapReady && !mapError && <div className="map-overlay">지도를 불러오는 중...</div>}
          {mapError && <div className="map-overlay map-error">{mapError}</div>}
        </div>
      </article>

      <article className="surface-panel info-panel">
        <div className="trip-toolbar">
          <label>
            여행 유형
            <select value={tripTypeFilter} onChange={(event) => setTripTypeFilter(event.target.value)}>
              <option value="ALL">전체</option>
              <option value="GROUP">그룹여행</option>
              <option value="SOLO">혼자여행</option>
            </select>
          </label>
          <label>
            정렬
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="LATEST">최신순</option>
              <option value="OLDEST">오래된순</option>
              <option value="PHOTOS">사진 많은순</option>
            </select>
          </label>
          <button type="button" className="trip-action-btn" onClick={onOpenCreateTrip}>
            + 내 여행 추가
          </button>
        </div>
        {loading && <p className="empty-state">서버에서 여행 목록을 불러오는 중...</p>}
        {loadError && <p className="auth-notice error">{loadError}</p>}

        <div className="trip-list">
          <div className="trip-list-head">
            <label className="trip-list-head-check">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) => toggleAllVisible(event.target.checked)}
              />
              <span>전체선택</span>
            </label>
            <span>여행 정보</span>
            <span>유형 / 통계</span>
          </div>

          {filteredTrips.map((trip) => {
                    const isChecked = effectiveSelectedTripIds.includes(trip.id)
            return (
              <article key={trip.id} className={`trip-list-row ${isChecked ? 'is-selected' : ''}`}>
                <label className="trip-list-row-check" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(event) => toggleTrip(trip.id, event.target.checked)}
                  />
                </label>
                <button
                  type="button"
                  className="trip-list-row-content is-clickable"
                  onClick={() => onOpenTripView(trip.id)}
                  aria-label={`${trip.name} 상세 보기`}
                >
                  <img src={trip.cover} alt={trip.name} />
                  <div className="trip-list-row-main">
                    <strong>{trip.name}</strong>
                    <p>{trip.dateRange}</p>
                    <span>
                      {trip.members}명 참여 · 사진 {trip.photos}장 · 핀 {trip.pins.length}개
                    </span>
                  </div>
                  <div className="trip-list-row-side">
                    <b className={`trip-type-badge ${trip.type === 'GROUP' ? 'group' : 'solo'}`}>
                      {trip.type === 'GROUP' ? '그룹여행' : '혼자여행'}
                    </b>
                    <span className="trip-list-color-chip">
                      <i
                        className="trip-list-color-dot"
                        style={{ backgroundColor: normalizeTripPinColor(trip.pinColor, getDefaultTripPinColor(trip.type)) }}
                      />
                      핀 색상
                    </span>
                  </div>
                </button>
              </article>
            )
          })}
        </div>

        {filteredTrips.length === 0 && (
          <p className="empty-state">조건에 맞는 여행이 없습니다. 필터를 변경해보세요.</p>
        )}

        {pinsForMap.length === 0 && <p className="empty-state">선택된 여행이 없어 지도에 핀이 표시되지 않습니다.</p>}
      </article>
    </section>
  )
}

function TripDetailPage({
  tripId,
  trip,
  loading,
  loadError,
  currentUser,
  onBackToTrips,
  onOpenEditTrip,
  onAddTripInvite,
  onUpdateGroupMemberRole,
  onRemoveGroupMember,
  onRevokeGroupInvite,
  onDownloadTripPhotoZip,
  onCreateTripShare,
  onListTripShares,
  onRevokeTripShare,
  onDeleteTrip,
}) {
  if (!tripId) {
    return (
      <section className="single-grid appear">
        <article className="surface-panel info-panel trip-create">
          <h3>여행 주소가 올바르지 않습니다.</h3>
          <p className="trip-create-caption">내 여행 목록에서 다시 선택해주세요.</p>
          <a href="#trips" className="trip-action-btn ghost trip-nav-link">
            내 여행 목록으로
          </a>
        </article>
      </section>
    )
  }

  if (loading) {
    return (
      <section className="single-grid appear">
        <article className="surface-panel info-panel trip-create">
          <h3>여행 정보를 불러오는 중입니다.</h3>
          <p className="trip-create-caption">잠시만 기다려주세요.</p>
        </article>
      </section>
    )
  }

  if (loadError) {
    return (
      <section className="single-grid appear">
        <article className="surface-panel info-panel trip-create">
          <h3>여행 정보를 불러오지 못했습니다.</h3>
          <p className="trip-create-caption">{loadError}</p>
          <a href="#trips" className="trip-action-btn ghost trip-nav-link">
            내 여행 목록으로
          </a>
        </article>
      </section>
    )
  }

  if (!trip) {
    return (
      <section className="single-grid appear">
        <article className="surface-panel info-panel trip-create">
          <h3>해당 여행을 찾을 수 없습니다.</h3>
          <p className="trip-create-caption">권한이 없거나 삭제된 여행일 수 있습니다.</p>
          <a href="#trips" className="trip-action-btn ghost trip-nav-link">
            내 여행 목록으로
          </a>
        </article>
      </section>
    )
  }

  return (
    <TripViewPage
      trip={trip}
      currentUser={currentUser}
      onBackToTrips={onBackToTrips}
      onOpenEditTrip={onOpenEditTrip}
      onAddTripInvite={onAddTripInvite}
      onUpdateGroupMemberRole={onUpdateGroupMemberRole}
      onRemoveGroupMember={onRemoveGroupMember}
      onRevokeGroupInvite={onRevokeGroupInvite}
      onDownloadTripPhotoZip={onDownloadTripPhotoZip}
      onCreateTripShare={onCreateTripShare}
      onListTripShares={onListTripShares}
      onRevokeTripShare={onRevokeTripShare}
      onDeleteTrip={onDeleteTrip}
    />
  )
}

function TripViewPage({
  trip,
  currentUser,
  onBackToTrips,
  onOpenEditTrip,
  onAddTripInvite,
  onUpdateGroupMemberRole,
  onRemoveGroupMember,
  onRevokeGroupInvite,
  onDownloadTripPhotoZip,
  onCreateTripShare,
  onListTripShares,
  onRevokeTripShare,
  onDeleteTrip,
}) {
  const mapRef = useRef(null)
  const mapObjRef = useRef(null)
  const markerRef = useRef([])
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [expandedPinId, setExpandedPinId] = useState(null)
  const [galleryModal, setGalleryModal] = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [inviteNotice, setInviteNotice] = useState('')
  const [memberActionError, setMemberActionError] = useState('')
  const [memberActionNotice, setMemberActionNotice] = useState('')
  const [pendingGroupActionKey, setPendingGroupActionKey] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [shareNotice, setShareNotice] = useState('')
  const [shareError, setShareError] = useState('')
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false)
  const [tripShares, setTripShares] = useState([])
  const [tripSharesLoading, setTripSharesLoading] = useState(false)
  const [pendingShareActionId, setPendingShareActionId] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [pinRegionLabelById, setPinRegionLabelById] = useState({})
  const [isDownloadingZip, setIsDownloadingZip] = useState(false)
  const [downloadZipError, setDownloadZipError] = useState('')
  const [downloadZipNotice, setDownloadZipNotice] = useState('')

  const pinsForMap = useMemo(() => (trip ? getAllPinsFromTrips([trip]) : []), [trip])
  const invitedPeople = useMemo(() => normalizeInvitedPeople(trip?.invitedPeople), [trip])
  const groupInvites = useMemo(() => normalizeGroupInvites(trip?.groupInvites), [trip?.groupInvites])
  const tripParticipants = useMemo(() => {
    const participantsFromTrip = normalizeTripMembers(trip?.participants)
    if (participantsFromTrip.length > 0) {
      return participantsFromTrip
    }
    return buildLocalTripParticipants(invitedPeople, currentUser)
  }, [currentUser, invitedPeople, trip?.participants])
  const currentUserEmail = String(currentUser?.email ?? '').trim().toLowerCase()
  const canManageGroup = String(trip?.myGroupRole ?? '').trim().toUpperCase() === 'OWNER'
  const unresolvedTripPhotos = useMemo(() => {
    const previews = Array.isArray(trip?.photoPreviews) ? trip.photoPreviews : []
    return previews
      .map((preview, index) => {
        const normalizedUrl = String(preview ?? '').trim()
        if (normalizedUrl.length === 0) {
          return null
        }
        return {
          id: `unresolved-${index + 1}`,
          url: normalizedUrl,
          pinTitle: '',
          label: `핀 없는 사진 ${index + 1}`,
        }
      })
      .filter((photo) => photo !== null)
  }, [trip?.photoPreviews])
  const tripGalleryPhotos = useMemo(() => {
    const photosFromPins = Array.isArray(trip?.pins)
      ? trip.pins.flatMap((pin) =>
          getPhotosForPin(trip, pin).map((photo, index) => ({
            id: `${pin.id}-${photo.id}`,
            url: photo.url,
            pinTitle: pin.title,
            label: `${pin.title} 사진 ${index + 1}`,
          })),
        )
      : []

    const deduped = []
    const seenUrls = new Set()
    ;[...photosFromPins, ...unresolvedTripPhotos].forEach((photo) => {
      const normalizedUrl = String(photo.url ?? '').trim()
      if (normalizedUrl.length === 0 || seenUrls.has(normalizedUrl)) {
        return
      }
      seenUrls.add(normalizedUrl)
      deduped.push(photo)
    })

    if (deduped.length > 0) {
      return deduped
    }

    const fallbackItems = buildTripPhotoItems(trip ?? {})
      .map((item, index) => ({
        id: String(item.id ?? `trip-photo-${index + 1}`),
        url: String(item.preview ?? ''),
        pinTitle: '',
        label: `여행 사진 ${index + 1}`,
      }))
      .filter((item) => item.url.length > 0)

    if (fallbackItems.length > 0) {
      return fallbackItems
    }

    const coverUrl = String(trip?.cover ?? '').trim()
    if (coverUrl.length > 0) {
      return [
        {
          id: 'trip-cover',
          url: coverUrl,
          pinTitle: '',
          label: '커버 이미지',
        },
      ]
    }

    return []
  }, [trip, unresolvedTripPhotos])

  useEffect(() => {
    setExpandedPinId(null)
    setGalleryModal(null)
    setInviteEmail('')
    setInviteError('')
    setInviteNotice('')
    setMemberActionError('')
    setMemberActionNotice('')
    setPendingGroupActionKey('')
    setDeleteError('')
    setShareNotice('')
    setShareError('')
    setIsCreatingShareLink(false)
    setTripShares([])
    setTripSharesLoading(false)
    setPendingShareActionId('')
    setIsDeleting(false)
    setPinRegionLabelById({})
    setIsDownloadingZip(false)
    setDownloadZipError('')
    setDownloadZipNotice('')
  }, [trip?.id])

  useEffect(() => {
    if (!trip?.id || typeof onListTripShares !== 'function') {
      return
    }
    let isActive = true
    setTripSharesLoading(true)
    onListTripShares(trip.id)
      .then((items) => {
        if (!isActive) {
          return
        }
        setTripShares(Array.isArray(items) ? items : [])
      })
      .catch(() => {
        if (isActive) {
          setTripShares([])
        }
      })
      .finally(() => {
        if (isActive) {
          setTripSharesLoading(false)
        }
      })
    return () => {
      isActive = false
    }
  }, [trip?.id, onListTripShares])

  useEffect(() => {
    let isActive = true

    const resolvePinRegions = async () => {
      const tripPins = Array.isArray(trip?.pins) ? trip.pins : []
      if (tripPins.length === 0) {
        setPinRegionLabelById({})
        return
      }

      try {
        const kakao = await loadKakaoMapSdk(KAKAO_MAP_API_KEY)
        if (!isActive) {
          return
        }

        if (!kakao?.maps?.services?.Geocoder || !kakao?.maps?.services?.Status) {
          setPinRegionLabelById({})
          return
        }

        const geocoder = new kakao.maps.services.Geocoder()
        const regionEntries = await Promise.all(
          tripPins.map(
            (pin) =>
              new Promise((resolve) => {
                geocoder.coord2RegionCode(pin.lng, pin.lat, (result, status) => {
                  if (status !== kakao.maps.services.Status.OK || !Array.isArray(result) || result.length === 0) {
                    resolve([pin.id, ''])
                    return
                  }
                  const legalRegion = result.find((item) => item.region_type === 'B') ?? result[0]
                  const city = String(legalRegion?.region_1depth_name ?? '').trim()
                  const dong = String(legalRegion?.region_3depth_name ?? '').trim() || String(legalRegion?.region_2depth_name ?? '').trim()
                  resolve([pin.id, [city, dong].filter(Boolean).join(' ')])
                })
              }),
          ),
        )

        if (!isActive) {
          return
        }

        const nextLabels = {}
        regionEntries.forEach(([pinId, label]) => {
          if (typeof pinId === 'string' && typeof label === 'string' && label.length > 0) {
            nextLabels[pinId] = label
          }
        })
        setPinRegionLabelById(nextLabels)
      } catch {
        if (isActive) {
          setPinRegionLabelById({})
        }
      }
    }

    resolvePinRegions()

    return () => {
      isActive = false
    }
  }, [trip?.id, trip?.pins])

  useEffect(() => {
    if (!galleryModal) {
      return
    }

    const handleGalleryKeyDown = (event) => {
      if (event.key === 'Escape') {
        setGalleryModal(null)
        return
      }
      if (event.key === 'ArrowRight') {
        setGalleryModal((prev) => {
          if (!prev || !Array.isArray(prev.photos) || prev.photos.length === 0) {
            return prev
          }
          return { ...prev, activeIndex: (prev.activeIndex + 1) % prev.photos.length }
        })
        return
      }
      if (event.key === 'ArrowLeft') {
        setGalleryModal((prev) => {
          if (!prev || !Array.isArray(prev.photos) || prev.photos.length === 0) {
            return prev
          }
          return { ...prev, activeIndex: (prev.activeIndex - 1 + prev.photos.length) % prev.photos.length }
        })
      }
    }

    window.addEventListener('keydown', handleGalleryKeyDown)
    return () => window.removeEventListener('keydown', handleGalleryKeyDown)
  }, [galleryModal])

  const openPhotoGallery = (title, photos, initialIndex = 0, subtitle = '') => {
    const normalizedPhotos = (Array.isArray(photos) ? photos : [])
      .map((photo, index) => ({
        id: String(photo?.id ?? `gallery-photo-${index + 1}`),
        url: String(photo?.url ?? '').trim(),
        pinTitle: String(photo?.pinTitle ?? '').trim(),
        label: String(photo?.label ?? '').trim(),
      }))
      .filter((photo) => photo.url.length > 0)

    if (normalizedPhotos.length === 0) {
      return
    }

    const boundedIndex = Math.min(Math.max(Number(initialIndex) || 0, 0), normalizedPhotos.length - 1)
    setGalleryModal({
      title: String(title ?? '').trim() || '사진 보기',
      subtitle: String(subtitle ?? '').trim(),
      photos: normalizedPhotos,
      activeIndex: boundedIndex,
    })
  }

  useEffect(() => {
    const handleMapInfoPreviewClick = (event) => {
      const target = event.target instanceof Element ? event.target.closest('.map-info-preview-btn') : null
      if (!target) {
        return
      }

      event.preventDefault()
      const pinId = String(target.getAttribute('data-pin-id') ?? '').trim()
      if (pinId.length === 0 || !trip || !Array.isArray(trip.pins)) {
        return
      }

      const targetPin = trip.pins.find((pin) => String(pin.id ?? '').trim() === pinId)
      if (!targetPin) {
        return
      }

      const pinPhotos = getPhotosForPin(trip, targetPin)
      if (pinPhotos.length === 0) {
        return
      }

      const previewUrl = String(target.querySelector('img')?.getAttribute('src') ?? '').trim()
      const startIndex = previewUrl.length > 0 ? Math.max(0, pinPhotos.findIndex((photo) => photo.url === previewUrl)) : 0
      openPhotoGallery(targetPin.title, pinPhotos, startIndex, pinRegionLabelById[pinId] ?? '')
    }

    document.addEventListener('click', handleMapInfoPreviewClick)
    return () => document.removeEventListener('click', handleMapInfoPreviewClick)
  }, [trip, pinRegionLabelById])

  const moveGallery = (delta) => {
    setGalleryModal((prev) => {
      if (!prev || !Array.isArray(prev.photos) || prev.photos.length === 0) {
        return prev
      }
      return { ...prev, activeIndex: (prev.activeIndex + delta + prev.photos.length) % prev.photos.length }
    })
  }

  const selectGalleryIndex = (nextIndex) => {
    setGalleryModal((prev) => {
      if (!prev || !Array.isArray(prev.photos) || prev.photos.length === 0) {
        return prev
      }
      const boundedIndex = Math.min(Math.max(Number(nextIndex) || 0, 0), prev.photos.length - 1)
      return { ...prev, activeIndex: boundedIndex }
    })
  }

  useEffect(() => {
    let isActive = true

    const initOrUpdateMap = async () => {
      try {
        if (!isActive) {
          return
        }
        setMapError('')
        const kakao = await loadKakaoMapSdk(KAKAO_MAP_API_KEY)
        if (!isActive || !mapRef.current) {
          return
        }

        if (!mapObjRef.current) {
          mapObjRef.current = new kakao.maps.Map(mapRef.current, {
            center: new kakao.maps.LatLng(36.2, 127.8),
            level: 12,
          })
        }

        const map = mapObjRef.current
        markerRef.current.forEach((marker) => marker.setMap(null))
        markerRef.current = []

        const bounds = new kakao.maps.LatLngBounds()
        const markerImageByColor = new Map()

        pinsForMap.forEach((pin) => {
          const markerColor = normalizeTripPinColor(pin.tripPinColor, getDefaultTripPinColor(pin.tripType))
          if (!markerImageByColor.has(markerColor)) {
            markerImageByColor.set(markerColor, buildMarkerImage(kakao, markerColor))
          }
          const position = new kakao.maps.LatLng(pin.lat, pin.lng)
          const marker = new kakao.maps.Marker({
            position,
            map,
            image: markerImageByColor.get(markerColor),
          })

          const infoWindow = new kakao.maps.InfoWindow({
            content: buildMapInfoWindowContent(pin),
            removable: true,
          })

          kakao.maps.event.addListener(marker, 'click', () => infoWindow.open(map, marker))
          markerRef.current.push(marker)
          bounds.extend(position)
        })

        if (pinsForMap.length > 0) {
          map.setBounds(bounds)
        } else {
          map.setCenter(new kakao.maps.LatLng(36.2, 127.8))
          map.setLevel(12)
        }

        setMapError('')
        setMapReady(true)
      } catch (error) {
        setMapReady(false)
        setMapError(error instanceof Error ? error.message : '지도를 불러오지 못했습니다.')
      }
    }

    initOrUpdateMap()

    return () => {
      isActive = false
    }
  }, [pinsForMap])

  const handleAddTripInvite = async (event) => {
    event.preventDefault()

    if (!trip || typeof onAddTripInvite !== 'function') {
      return
    }

    const normalizedEmail = inviteEmail.trim().toLowerCase()
    if (!isValidEmail(normalizedEmail)) {
      setInviteError('추가할 사람의 이메일을 정확히 입력해주세요.')
      setInviteNotice('')
      return
    }

    if (tripParticipants.some((person) => person.email === normalizedEmail)) {
      setInviteError('이미 이 여행에 추가된 이메일입니다.')
      setInviteNotice('')
      return
    }

    if (groupInvites.some((invite) => invite.email === normalizedEmail && invite.status === 'PENDING')) {
      setInviteError('이미 초대 링크를 보낸 이메일입니다.')
      setInviteNotice('')
      return
    }

    try {
      const result = await onAddTripInvite(trip.id, normalizedEmail)
      const invitedEmail = String(result?.member?.email ?? normalizedEmail).trim() || normalizedEmail
      setInviteEmail('')
      setInviteError('')
      if (result?.alreadyMember) {
        setInviteNotice(`${invitedEmail} 은(는) 이미 그룹에 참여 중입니다.`)
      } else {
        setInviteNotice(`${invitedEmail} 에게 그룹 초대 링크를 보냈습니다.`)
      }
    } catch (requestError) {
      setInviteNotice('')
      setInviteError(requestError instanceof Error ? requestError.message : '초대 전송에 실패했습니다.')
    }
  }

  const handleMemberRoleChange = async (memberUserId, nextRole) => {
    if (!trip?.groupId || typeof onUpdateGroupMemberRole !== 'function') {
      return
    }

    setMemberActionError('')
    setMemberActionNotice('')
    setPendingGroupActionKey(`role:${memberUserId}`)
    try {
      await onUpdateGroupMemberRole(trip.groupId, memberUserId, nextRole)
      setMemberActionNotice('그룹 권한을 업데이트했습니다.')
    } catch (error) {
      setMemberActionError(error instanceof Error ? error.message : '그룹 권한 변경에 실패했습니다.')
    } finally {
      setPendingGroupActionKey('')
    }
  }

  const handleRemoveMember = async (member) => {
    if (!trip?.groupId || typeof onRemoveGroupMember !== 'function') {
      return
    }
    if (!window.confirm(`${member.name} 님을 그룹에서 제외할까요?`)) {
      return
    }

    setMemberActionError('')
    setMemberActionNotice('')
    setPendingGroupActionKey(`remove:${member.id}`)
    try {
      await onRemoveGroupMember(trip.groupId, member.id)
      setMemberActionNotice('그룹 멤버를 제외했습니다.')
    } catch (error) {
      setMemberActionError(error instanceof Error ? error.message : '그룹 멤버 제거에 실패했습니다.')
    } finally {
      setPendingGroupActionKey('')
    }
  }

  const handleRevokeInvite = async (invite) => {
    if (!trip?.groupId || typeof onRevokeGroupInvite !== 'function') {
      return
    }
    if (!window.confirm(`${invite.email} 초대를 취소할까요?`)) {
      return
    }

    setMemberActionError('')
    setMemberActionNotice('')
    setPendingGroupActionKey(`invite:${invite.id}`)
    try {
      await onRevokeGroupInvite(trip.groupId, invite.id)
      setMemberActionNotice('대기 중인 그룹 초대를 취소했습니다.')
    } catch (error) {
      setMemberActionError(error instanceof Error ? error.message : '그룹 초대 취소에 실패했습니다.')
    } finally {
      setPendingGroupActionKey('')
    }
  }

  const handleDeleteTrip = async () => {
    if (!trip?.id || typeof onDeleteTrip !== 'function') {
      return
    }

    if (!window.confirm(`${trip.name} 여행을 삭제할까요?`)) {
      return
    }

    setDeleteError('')
    setIsDeleting(true)

    try {
      await onDeleteTrip(trip.id)
          setRouteHash('trips')
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '여행 삭제에 실패했습니다.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCreateShareLink = async () => {
    if (!trip?.id || typeof onCreateTripShare !== 'function') {
      return
    }
    setShareNotice('')
    setShareError('')
    setIsCreatingShareLink(true)
    try {
      const result = await onCreateTripShare(trip.id)
      const shareUrl = String(result?.shareUrl ?? '').trim()
      if (shareUrl.length === 0) {
        throw new Error('공유 링크 생성 응답이 올바르지 않습니다.')
      }
      await window.navigator.clipboard?.writeText(shareUrl)
      setTripShares((prev) => [result, ...prev])
      setShareNotice('공유 링크를 생성하고 클립보드에 복사했습니다.')
    } catch (error) {
      setShareError(error instanceof Error ? error.message : '공유 링크 생성에 실패했습니다.')
    } finally {
      setIsCreatingShareLink(false)
    }
  }

  const handleRevokeShareLink = async (shareId) => {
    if (!trip?.id || typeof onRevokeTripShare !== 'function') {
      return
    }
    if (!window.confirm('이 공유 링크를 만료(철회) 처리할까요?')) {
      return
    }
    setPendingShareActionId(String(shareId ?? '').trim())
    setShareError('')
    try {
      await onRevokeTripShare(trip.id, shareId)
      setTripShares((prev) =>
        prev.map((item) =>
          String(item?.shareId ?? '').trim() === String(shareId ?? '').trim()
            ? { ...item, revoked: true, status: 'REVOKED' }
            : item,
        ),
      )
      setShareNotice('공유 링크를 철회했습니다.')
    } catch (error) {
      setShareError(error instanceof Error ? error.message : '공유 링크 철회에 실패했습니다.')
    } finally {
      setPendingShareActionId('')
    }
  }

  const handleDownloadPhotoZip = async () => {
    if (!trip?.id || typeof onDownloadTripPhotoZip !== 'function') {
      return
    }
    setDownloadZipError('')
    setDownloadZipNotice('')
    setIsDownloadingZip(true)

    try {
      await onDownloadTripPhotoZip(trip)

      setDownloadZipNotice('사진 ZIP 파일 다운로드가 시작되었습니다.')
    } catch (error) {
      setDownloadZipError(error instanceof Error ? error.message : '사진 ZIP 다운로드에 실패했습니다.')
    } finally {
      setIsDownloadingZip(false)
    }
  }

  const galleryPhotos = Array.isArray(galleryModal?.photos) ? galleryModal.photos : []
  const galleryActiveIndex =
    galleryPhotos.length > 0
      ? Math.min(Math.max(Number(galleryModal?.activeIndex) || 0, 0), galleryPhotos.length - 1)
      : 0
  const galleryActivePhoto = galleryPhotos[galleryActiveIndex] ?? null
  if (!trip) {
    return (
      <section className="single-grid appear">
        <article className="surface-panel info-panel trip-create">
          <h3>볼 여행을 찾지 못했습니다.</h3>
          <p className="trip-create-caption">목록에서 여행을 선택해 상세 페이지를 열어주세요.</p>
          <a href="#trips" className="trip-action-btn ghost trip-nav-link">
            내 여행 목록으로
          </a>
        </article>
      </section>
    )
  }

  return (
    <section className="single-grid appear">
      <article className="surface-panel map-panel">
        <div className="section-header">
          <div>
            <p className="label">Trip View</p>
            <h2>{trip.name} 핀 보기</h2>
          </div>
          <div className="map-legend">
            <span>
              <i className="dot custom" /> 여행별 핀 색상
            </span>
          </div>
        </div>

        <div className="map-wrap trip-map-wrap">
          <div ref={mapRef} className="kakao-map" />
          {!mapReady && !mapError && <div className="map-overlay">지도를 불러오는 중...</div>}
          {mapError && <div className="map-overlay map-error">{mapError}</div>}
        </div>
      </article>

      <article className="surface-panel info-panel">
        <div className="trip-detail">
          <div className="trip-detail-top">
            <button type="button" className="trip-action-btn ghost" onClick={onBackToTrips}>
              목록으로
            </button>
            <div className="trip-detail-actions">
              <button type="button" className="trip-action-btn ghost" onClick={handleDownloadPhotoZip} disabled={isDownloadingZip}>
                {isDownloadingZip ? 'ZIP 다운로드 중...' : '사진 ZIP 다운로드'}
              </button>
              <button type="button" className="trip-action-btn ghost" onClick={() => onOpenEditTrip(trip.id)}>
                수정하기
              </button>
              <button type="button" className="trip-action-btn ghost" onClick={handleCreateShareLink} disabled={isCreatingShareLink}>
                {isCreatingShareLink ? '링크 생성 중...' : '공유 링크 생성'}
              </button>
              <button type="button" className="trip-action-btn danger" onClick={handleDeleteTrip} disabled={isDeleting}>
                {isDeleting ? '삭제 중...' : '여행 삭제'}
              </button>
            </div>
          </div>
          {deleteError && <p className="trip-invite-error">{deleteError}</p>}
          {shareError && <p className="trip-invite-error">{shareError}</p>}
          {shareNotice && <p className="trip-invite-notice">{shareNotice}</p>}
          {downloadZipError && <p className="trip-invite-error">{downloadZipError}</p>}
          {downloadZipNotice && <p className="trip-invite-notice">{downloadZipNotice}</p>}

          <section className="trip-share-manage-panel">
            <div className="trip-invite-head">
              <h4>공유 링크 관리</h4>
              <span>총 {tripShares.length}건</span>
            </div>
            {tripSharesLoading ? (
              <p className="trip-invite-empty">공유 링크를 불러오는 중...</p>
            ) : tripShares.length === 0 ? (
              <p className="trip-invite-empty">생성된 공유 링크가 없습니다.</p>
            ) : (
              <ul className="group-invite-list">
                {tripShares.map((share) => {
                  const shareId = String(share?.shareId ?? '').trim()
                  const status = String(share?.status ?? '').trim().toUpperCase() || 'ACTIVE'
                  const shareUrl = resolveTripShareUrl(share?.shareToken, share?.shareUrl)
                  return (
                    <li key={shareId || shareUrl}>
                      <div className="group-member-summary">
                        <strong>{status === 'ACTIVE' ? '사용 가능' : status === 'EXPIRED' ? '만료됨' : '철회됨'}</strong>
                        <span>{shareUrl}</span>
                        <small>
                          생성 {share?.createdAt ? new Date(share.createdAt).toLocaleString('ko-KR') : '미정'} · 만료 {share?.expiresAt ? new Date(share.expiresAt).toLocaleString('ko-KR') : '미정'}
                        </small>
                      </div>
                      <div className="group-member-actions">
                        <button
                          type="button"
                          className="trip-action-btn ghost compact"
                          onClick={async () => {
                            await window.navigator.clipboard?.writeText(shareUrl)
                            setShareNotice('공유 링크를 클립보드에 복사했습니다.')
                          }}
                        >
                          복사
                        </button>
                        {status === 'ACTIVE' && (
                          <button
                            type="button"
                            className="trip-action-btn danger compact"
                            onClick={() => handleRevokeShareLink(shareId)}
                            disabled={pendingShareActionId === shareId}
                          >
                            {pendingShareActionId === shareId ? '처리 중...' : '철회'}
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <article className="trip-detail-card">
            <button
              type="button"
              className="trip-cover-preview-btn"
              onClick={() => {
                const coverUrl = String(trip.cover ?? '').trim()
                const startIndex = tripGalleryPhotos.findIndex((photo) => photo.url === coverUrl)
                openPhotoGallery(`${trip.name} 전체 사진`, tripGalleryPhotos, startIndex >= 0 ? startIndex : 0, '커버 이미지')
              }}
              aria-label={`${trip.name} 전체 사진 보기`}
            >
              <img src={trip.cover} alt={trip.name} />
            </button>
            <div className="trip-detail-main">
              <h3>{trip.name}</h3>
              <p>{trip.dateRange}</p>
              <div className="trip-detail-stats">
                <span>{trip.type === 'GROUP' ? '그룹여행' : '혼자여행'}</span>
                <span>참여 {trip.members}명</span>
                <span>사진 {trip.photos}장</span>
                <span>핀 {trip.pins.length}개</span>
                <span className="trip-pin-color-stat">
                  핀 색상
                  <i
                    className="trip-pin-color-dot"
                    style={{ backgroundColor: normalizeTripPinColor(trip.pinColor, getDefaultTripPinColor(trip.type)) }}
                  />
                </span>
              </div>
              <small>{trip.notes?.length > 0 ? trip.notes : '여행 메모가 아직 없습니다. 여행 수정에서 메모를 추가해보세요.'}</small>
            </div>
          </article>

          <div className="trip-invite-panel">
            <div className="trip-invite-head">
              <h4>그룹 멤버 관리</h4>
              <span>
                현재 그룹 인원 {trip.members}명 · 내 권한 {canManageGroup ? 'OWNER' : 'MEMBER'}
              </span>
            </div>
            {canManageGroup ? (
              <form className="trip-invite-form" onSubmit={handleAddTripInvite}>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="초대할 사람 이메일"
                />
                <button type="submit" className="trip-action-btn ghost">
                  초대 보내기
                </button>
              </form>
            ) : (
              <p className="trip-invite-empty">그룹 OWNER만 초대 링크 발송과 권한 변경을 할 수 있습니다.</p>
            )}
            {inviteError && <p className="trip-invite-error">{inviteError}</p>}
            {inviteNotice && <p className="trip-invite-notice">{inviteNotice}</p>}
            {memberActionError && <p className="trip-invite-error">{memberActionError}</p>}
            {memberActionNotice && <p className="trip-invite-notice">{memberActionNotice}</p>}
            {tripParticipants.length > 0 ? (
              <ul className="trip-invite-list">
                {tripParticipants.map((person) => (
                  <li key={person.id}>
                    <div className="group-member-summary">
                      <strong>
                        {person.name}
                        <small className="trip-participant-role">
                          {String(person.role ?? '').toUpperCase() === 'OWNER' ? 'OWNER' : 'MEMBER'}
                        </small>
                      </strong>
                      <span>{person.email}</span>
                    </div>
                    {canManageGroup && person.email !== currentUserEmail ? (
                      <div className="group-member-actions">
                        <select
                          value={String(person.role ?? '').toUpperCase() === 'OWNER' ? 'OWNER' : 'MEMBER'}
                          onChange={(event) => handleMemberRoleChange(person.id, event.target.value)}
                          disabled={pendingGroupActionKey.length > 0}
                        >
                          <option value="OWNER">OWNER</option>
                          <option value="MEMBER">MEMBER</option>
                        </select>
                        <button
                          type="button"
                          className="trip-action-btn danger compact"
                          onClick={() => handleRemoveMember(person)}
                          disabled={pendingGroupActionKey.length > 0}
                        >
                          제외
                        </button>
                      </div>
                    ) : (
                      <div className="group-member-actions readonly">
                        <small>{person.email === currentUserEmail ? '현재 로그인 계정' : '권한 변경 불가'}</small>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="trip-invite-empty">아직 그룹 멤버가 없습니다.</p>
            )}

            <div className="group-pending-invites">
              <div className="trip-invite-head compact">
                <h4>대기 중인 초대</h4>
                <span>{groupInvites.filter((invite) => invite.status === 'PENDING').length}건</span>
              </div>
              {groupInvites.filter((invite) => invite.status === 'PENDING').length > 0 ? (
                <ul className="trip-invite-list group-invite-list">
                  {groupInvites
                    .filter((invite) => invite.status === 'PENDING')
                    .map((invite) => (
                      <li key={invite.id}>
                        <div className="group-member-summary">
                          <strong>{invite.name}</strong>
                          <span>{invite.email}</span>
                          <small>
                            만료: {invite.expiresAt ? new Date(invite.expiresAt).toLocaleString() : '미정'}
                          </small>
                          {invite.shareUrl && (
                            <a href={invite.shareUrl} className="group-invite-link">
                              초대 링크 열기
                            </a>
                          )}
                        </div>
                        {canManageGroup && (
                          <div className="group-member-actions">
                            <button
                              type="button"
                              className="trip-action-btn danger compact"
                              onClick={() => handleRevokeInvite(invite)}
                              disabled={pendingGroupActionKey.length > 0}
                            >
                              초대 취소
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="trip-invite-empty">현재 대기 중인 그룹 초대가 없습니다.</p>
              )}
            </div>
          </div>

          <div className="trip-pin-list">
            <h4>여행 핀 목록</h4>
            {trip.pins.length > 0 ? (
              <ul>
                {trip.pins.map((pin) => {
                  const pinPhotos = getPhotosForPin(trip, pin)
                  const { similarGroups, singlePhotos } = groupSimilarPinPhotos(pinPhotos)
                  const pinPhotoIndexById = new Map(pinPhotos.map((photo, index) => [photo.id, index]))
                  return (
                    <li key={pin.id} className={`pin-accordion-item ${expandedPinId === pin.id ? 'is-open' : ''}`}>
                      <button
                        type="button"
                        className="pin-accordion-trigger"
                        onClick={() => setExpandedPinId((prev) => (prev === pin.id ? null : pin.id))}
                        aria-expanded={expandedPinId === pin.id}
                      >
                        <div className="pin-accordion-main">
                          <strong>{pin.title}</strong>
                          <span>
                            {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                          </span>
                          {pinRegionLabelById[pin.id] && <span>{pinRegionLabelById[pin.id]}</span>}
                        </div>
                        <b className="pin-accordion-label">{expandedPinId === pin.id ? '접기' : '사진 보기'}</b>
                      </button>

                      {expandedPinId === pin.id && (
                        <div className="pin-accordion-content">
                          {pinPhotos.length > 0 ? (
                            <div className="pin-photo-grid">
                              {singlePhotos.map((photo, index) => (
                                <button
                                  key={`${pin.id}-single-${index + 1}`}
                                  type="button"
                                  className="pin-photo-btn"
                                  onClick={() => {
                                    const startIndex = pinPhotoIndexById.get(photo.id) ?? 0
                                    openPhotoGallery(pin.title, pinPhotos, startIndex, pinRegionLabelById[pin.id] ?? '')
                                  }}
                                  aria-label={`${pin.title} 사진 ${index + 1} 크게 보기`}
                                >
                                  <img src={photo.url} alt={`${pin.title} 사진 ${index + 1}`} />
                                </button>
                              ))}

                              {similarGroups.map((group, groupIndex) => (
                                <button
                                  key={`${pin.id}-group-${group.key}`}
                                  type="button"
                                  className="similar-photo-cluster"
                                  onClick={() => {
                                    const firstPhotoId = group.photos[0]?.id
                                    const startIndex = pinPhotoIndexById.get(firstPhotoId) ?? 0
                                    openPhotoGallery(pin.title, pinPhotos, startIndex, `${groupIndex + 1}번 비슷한 사진 묶음`)
                                  }}
                                >
                                  <div className="similar-photo-cover">
                                    <img src={group.photos[0].url} alt={`${pin.title} 유사사진 대표`} />
                                    <b className="similar-photo-count">비슷한 사진 {group.photos.length}장</b>
                                  </div>
                                  <span className="similar-photo-subtitle">{getSimilarGroupSubtitle(pin.title, group, groupIndex)}</span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="pin-photo-empty">이 핀에 연결된 사진이 아직 없습니다.</p>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="empty-state">아직 등록된 핀이 없습니다. 추후 핀 추가 기능과 연결됩니다.</p>
            )}
          </div>

          <div className="trip-pin-list">
            <h4>핀 없는 사진</h4>
            {unresolvedTripPhotos.length > 0 ? (
              <div className="pin-photo-grid">
                {unresolvedTripPhotos.map((photo, index) => (
                  <button
                    key={`unresolved-photo-${photo.id}`}
                    type="button"
                    className="pin-photo-btn"
                    onClick={() => openPhotoGallery('핀 없는 사진', unresolvedTripPhotos, index, '미분류')}
                    aria-label={`핀 없는 사진 ${index + 1} 크게 보기`}
                  >
                    <img src={photo.url} alt={`핀 없는 사진 ${index + 1}`} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="pin-photo-empty">핀과 연결되지 않은 사진이 없습니다.</p>
            )}
          </div>
        </div>
      </article>

      {galleryModal &&
        galleryActivePhoto &&
        createPortal(
          <div className="similar-modal-backdrop" onClick={() => setGalleryModal(null)} role="presentation">
            <div
              className="similar-modal photo-gallery-modal"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="similar-modal-head">
                <div>
                  <p>{galleryModal.subtitle || galleryActivePhoto.pinTitle || galleryModal.title}</p>
                  <h4>{galleryModal.title}</h4>
                </div>
                <button type="button" onClick={() => setGalleryModal(null)}>
                  닫기
                </button>
              </div>

              <div className="photo-gallery-main">
                <button
                  type="button"
                  className="photo-gallery-nav prev"
                  onClick={() => moveGallery(-1)}
                  aria-label="이전 사진"
                >
                  이전
                </button>
                <img src={galleryActivePhoto.url} alt={galleryActivePhoto.label || `${galleryModal.title} 사진`} />
                <button
                  type="button"
                  className="photo-gallery-nav next"
                  onClick={() => moveGallery(1)}
                  aria-label="다음 사진"
                >
                  다음
                </button>
              </div>

              <p className="photo-gallery-meta">
                {galleryActiveIndex + 1} / {galleryPhotos.length}
                {galleryActivePhoto.pinTitle ? ` · ${galleryActivePhoto.pinTitle}` : ''}
              </p>

              <div className="photo-gallery-thumbnails">
                {galleryPhotos.map((photo, index) => (
                  <button
                    key={`gallery-thumb-${photo.id}-${index + 1}`}
                    type="button"
                    className={`photo-gallery-thumb ${index === galleryActiveIndex ? 'is-active' : ''}`}
                    onClick={() => selectGalleryIndex(index)}
                    aria-label={`${index + 1}번 사진으로 이동`}
                  >
                    <img src={photo.url} alt={`${galleryModal.title} 썸네일 ${index + 1}`} />
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  )
}

function TripCreateView({ onCreateTrip }) {
  const [createError, setCreateError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadedPhotos, setUploadedPhotos] = useState([])
  const [coverMode, setCoverMode] = useState('UPLOAD')
  const [selectedCoverPhotoId, setSelectedCoverPhotoId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitedPeople, setInvitedPeople] = useState([])
  const [inviteError, setInviteError] = useState('')
  const photoInputRef = useRef(null)
  const [tripForm, setTripForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    type: 'GROUP',
    members: 2,
    pinColor: TRIP_PIN_COLOR_GROUP_DEFAULT,
    cover: '',
    notes: '',
  })

  const updateTripForm = (key, value) => {
    setTripForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'type' && value === 'SOLO' ? { members: 1 } : {}),
    }))
  }

  useEffect(() => {
    if (coverMode !== 'UPLOAD') {
      return
    }

    if (uploadedPhotos.length === 0) {
      setSelectedCoverPhotoId('')
      return
    }

    const stillExists = uploadedPhotos.some((photo) => photo.id === selectedCoverPhotoId)
    if (!stillExists) {
      setSelectedCoverPhotoId(uploadedPhotos[0].id)
    }
  }, [coverMode, selectedCoverPhotoId, uploadedPhotos])

  const openPhotoPicker = () => {
    photoInputRef.current?.click()
  }

  const handlePhotoSelect = async (event) => {
    const selectedFiles = Array.from(event.target.files ?? [])
    if (selectedFiles.length === 0) {
      return
    }

    const imageFiles = selectedFiles.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      setCreateError('이미지 파일만 업로드할 수 있습니다.')
      event.target.value = ''
      return
    }

    const readAsDataUrl = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(new Error('이미지를 읽는 중 오류가 발생했습니다.'))
        reader.readAsDataURL(file)
      })

    try {
      const photoItems = await Promise.all(
        imageFiles.map(async (file) => ({
          id: `${file.name}-${file.lastModified}-${Math.random()}`,
          name: file.name,
          file,
          preview: await readAsDataUrl(file),
        })),
      )

      setUploadedPhotos((prev) => [...prev, ...photoItems])
      if (coverMode === 'UPLOAD' && !selectedCoverPhotoId && photoItems[0]) {
        setSelectedCoverPhotoId(photoItems[0].id)
      }
      setCreateError('')
    } catch {
      setCreateError('선택한 사진을 불러오지 못했습니다. 다시 시도해주세요.')
    } finally {
      event.target.value = ''
    }
  }

  const removePhoto = (photoId) => {
    setUploadedPhotos((prev) => prev.filter((photo) => photo.id !== photoId))
  }

  const handleAddInvitePerson = () => {
    const normalizedEmail = inviteEmail.trim().toLowerCase()

    if (!isValidEmail(normalizedEmail)) {
      setInviteError('초대할 사람의 이메일 형식을 확인해주세요.')
      return
    }

    if (invitedPeople.some((person) => person.email === normalizedEmail)) {
      setInviteError('이미 초대 목록에 있는 이메일입니다.')
      return
    }

    setInvitedPeople((prev) => [...prev, buildInvitePerson(normalizedEmail)])
    setInviteEmail('')
    setInviteError('')
    setCreateError('')
  }

  const removeInvitePerson = (inviteId) => {
    setInvitedPeople((prev) => prev.filter((person) => person.id !== inviteId))
  }

  const handleCreateTrip = async (event) => {
    event.preventDefault()

    if (!tripForm.name.trim()) {
      setCreateError('여행 이름을 입력해주세요.')
      return
    }

    if (!tripForm.startDate || !tripForm.endDate) {
      setCreateError('여행 시작일과 종료일을 입력해주세요.')
      return
    }

    if (tripForm.endDate < tripForm.startDate) {
      setCreateError('종료일은 시작일 이후여야 합니다.')
      return
    }

    if (Number(tripForm.members) < 1) {
      setCreateError('참여 인원은 1명 이상이어야 합니다.')
      return
    }

    let resolvedCover = ''
    if (coverMode === 'URL') {
      const urlValue = tripForm.cover.trim()
      if (!urlValue) {
        setCreateError('커버 이미지 URL을 입력해주세요.')
        return
      }

      try {
        new URL(urlValue)
      } catch {
        setCreateError('올바른 URL 형식으로 커버 이미지를 입력해주세요.')
        return
      }
      resolvedCover = urlValue
    } else {
      const coverPhoto = uploadedPhotos.find((photo) => photo.id === selectedCoverPhotoId)
      if (!coverPhoto) {
        setCreateError('업로드한 사진 중 커버로 사용할 1장을 선택해주세요.')
        return
      }
      resolvedCover = coverPhoto.preview
    }

    const nextId = `trip-${Date.now()}`
    const dateRange = `${tripForm.startDate.replaceAll('-', '.')} - ${tripForm.endDate.replaceAll('-', '.')}`
    const normalizedInvites = normalizeInvitedPeople(invitedPeople)
    const resolvedMembers = Math.max(Number(tripForm.members), normalizedInvites.length + 1)
    const resolvedType = normalizedInvites.length > 0 ? 'GROUP' : tripForm.type
    const resolvedPinColor = normalizeTripPinColor(tripForm.pinColor, getDefaultTripPinColor(resolvedType))

    try {
      setIsSubmitting(true)
      setCreateError('')
      await onCreateTrip({
        id: nextId,
        name: tripForm.name.trim(),
        dateRange,
        members: resolvedMembers,
        photos: uploadedPhotos.length,
        type: resolvedType,
        pinColor: resolvedPinColor,
        updatedAt: new Date().toISOString(),
        cover: resolvedCover,
        notes: tripForm.notes.trim(),
        photoPreviews: uploadedPhotos.map((photo) => photo.preview),
        photoFiles: uploadedPhotos.map((photo) => photo.file).filter((file) => file instanceof File),
        uploadedPhotoPreviews: uploadedPhotos
          .filter((photo) => photo.file instanceof File)
          .map((photo) => photo.preview),
        invitedPeople: normalizedInvites,
        pins: [],
      })
    } catch (requestError) {
      setCreateError(requestError instanceof Error ? requestError.message : '여행 생성에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="single-grid appear">
      <article className="surface-panel info-panel trip-create">
        <div className="trip-detail-top">
          <a href="#trips" className="trip-action-btn ghost trip-nav-link">
            목록으로
          </a>
        </div>

        <h3>내 여행 추가</h3>
        <p className="trip-create-caption">새 여행을 등록하면 내 여행들 페이지에서 바로 상세 화면으로 연결됩니다.</p>

        <form className="trip-create-form" onSubmit={handleCreateTrip}>
          <label>
            여행 이름
            <input
              type="text"
              value={tripForm.name}
              onChange={(event) => updateTripForm('name', event.target.value)}
              placeholder="예: 오사카 벚꽃 여행"
              required
            />
          </label>
          <div className="trip-create-row">
            <label>
              시작일
              <input
                type="date"
                value={tripForm.startDate}
                onChange={(event) => updateTripForm('startDate', event.target.value)}
                required
              />
            </label>
            <label>
              종료일
              <input
                type="date"
                value={tripForm.endDate}
                onChange={(event) => updateTripForm('endDate', event.target.value)}
                required
              />
            </label>
          </div>
          <div className="trip-create-row">
            <label>
              여행 유형
              <select value={tripForm.type} onChange={(event) => updateTripForm('type', event.target.value)}>
                <option value="GROUP">그룹여행</option>
                <option value="SOLO">혼자여행</option>
              </select>
            </label>
            <label>
              참여 인원
              <input
                type="number"
                min={1}
                value={tripForm.members}
                onChange={(event) => updateTripForm('members', event.target.value)}
                required
              />
            </label>
          </div>
          <label>
            지도 핀 색상
            <input
              type="color"
              value={normalizeTripPinColor(tripForm.pinColor, getDefaultTripPinColor(tripForm.type))}
              onChange={(event) => updateTripForm('pinColor', event.target.value)}
            />
          </label>

          <div className="trip-invite-editor">
            <p>함께할 사람 추가</p>
            <div className="trip-invite-input-row">
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleAddInvitePerson()
                  }
                }}
                placeholder="초대할 이메일을 입력하세요"
              />
              <button type="button" className="trip-photo-add-btn" onClick={handleAddInvitePerson}>
                사람 추가
              </button>
            </div>
            {inviteError && <small className="trip-invite-error">{inviteError}</small>}
            {invitedPeople.length > 0 ? (
              <div className="trip-invite-chip-list">
                {invitedPeople.map((person) => (
                  <span key={person.id} className="trip-invite-chip">
                    <b>{person.name}</b>
                    <small>{person.email}</small>
                    <button type="button" onClick={() => removeInvitePerson(person.id)} aria-label={`${person.email} 제거`}>
                      제거
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <small className="trip-invite-empty">아직 추가된 사람이 없습니다. 여행 생성 후 상세 보기에서도 계속 추가할 수 있어요.</small>
            )}
          </div>

          <div className="trip-cover-selector">
            <p>커버 이미지 선택 (1장)</p>
            <div className="trip-cover-options">
              <label className={`trip-cover-option ${coverMode === 'UPLOAD' ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="trip-cover-mode"
                  value="UPLOAD"
                  checked={coverMode === 'UPLOAD'}
                  onChange={() => setCoverMode('UPLOAD')}
                />
                <span>업로드한 사진에서 선택</span>
              </label>
              <label className={`trip-cover-option ${coverMode === 'URL' ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="trip-cover-mode"
                  value="URL"
                  checked={coverMode === 'URL'}
                  onChange={() => setCoverMode('URL')}
                />
                <span>이미지 URL 사용</span>
              </label>
            </div>
          </div>
          <label>
            커버 이미지 URL
            <input
              type="url"
              value={tripForm.cover}
              onChange={(event) => updateTripForm('cover', event.target.value)}
              placeholder="https://..."
              disabled={coverMode !== 'URL'}
            />
          </label>

          <div className="trip-photo-upload">
            <p>여행 사진</p>
            <div className="trip-photo-toolbar">
              <button type="button" className="trip-photo-add-btn" onClick={openPhotoPicker}>
                + 사진 추가
              </button>
              <span>{uploadedPhotos.length}장 선택됨</span>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="trip-photo-input"
              onChange={handlePhotoSelect}
            />

            {uploadedPhotos.length > 0 && (
              <div className="trip-photo-grid">
                {uploadedPhotos.map((photo) => (
                  <article
                    key={photo.id}
                    className={`trip-photo-card ${selectedCoverPhotoId === photo.id ? 'is-cover' : ''}`}
                  >
                    <img src={photo.preview} alt={photo.name} />
                    <div className="trip-photo-card-foot">
                      <small>{photo.name}</small>
                      <div className="trip-photo-card-actions">
                        <button
                          type="button"
                          className={`trip-photo-cover-btn ${selectedCoverPhotoId === photo.id ? 'is-active' : ''}`}
                          onClick={() => {
                            setCoverMode('UPLOAD')
                            setSelectedCoverPhotoId(photo.id)
                          }}
                        >
                          {selectedCoverPhotoId === photo.id ? '커버 선택됨' : '커버로 선택'}
                        </button>
                        <button type="button" onClick={() => removePhoto(photo.id)}>
                          제거
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <label>
            여행 메모
            <textarea
              value={tripForm.notes}
              onChange={(event) => updateTripForm('notes', event.target.value)}
              placeholder="이번 여행에서 기록하고 싶은 목표나 체크리스트를 적어보세요."
              rows={4}
            />
          </label>
          <button type="submit" className="trip-action-btn submit" disabled={isSubmitting}>
            {isSubmitting ? '생성 중...' : '여행 추가하기'}
          </button>
        </form>

        {createError && <p className="auth-notice error">{createError}</p>}
      </article>
    </section>
  )
}

function TripEditView({ trip, onUpdateTrip }) {
  const [error, setError] = useState('')
  const [editablePhotos, setEditablePhotos] = useState([])
  const [photosDirty, setPhotosDirty] = useState(false)
  const [coverMode, setCoverMode] = useState('UPLOAD')
  const [selectedCoverPhotoId, setSelectedCoverPhotoId] = useState('')
  const [photoModal, setPhotoModal] = useState(null)
  const photoInputRef = useRef(null)
  const [tripForm, setTripForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    type: 'GROUP',
    members: 1,
    pinColor: TRIP_PIN_COLOR_GROUP_DEFAULT,
    cover: '',
    notes: '',
  })

  useEffect(() => {
    if (!trip) {
      return
    }

    const { startDate, endDate } = parseDateRange(trip.dateRange)
    const initialPhotos = buildTripPhotoItems(trip)
    const matchedCoverPhoto = initialPhotos.find((photo) => photo.preview === trip.cover)

    setTripForm({
      name: trip.name ?? '',
      startDate,
      endDate,
      type: trip.type ?? 'GROUP',
      members: trip.members ?? 1,
      pinColor: normalizeTripPinColor(trip.pinColor, getDefaultTripPinColor(trip.type)),
      cover: trip.cover ?? '',
      notes: trip.notes ?? '',
    })
    setEditablePhotos(initialPhotos)
    if (matchedCoverPhoto) {
      setCoverMode('UPLOAD')
      setSelectedCoverPhotoId(matchedCoverPhoto.id)
    } else if (typeof trip.cover === 'string' && trip.cover.length > 0) {
      setCoverMode('URL')
      setSelectedCoverPhotoId('')
    } else {
      setCoverMode('UPLOAD')
      setSelectedCoverPhotoId(initialPhotos[0]?.id ?? '')
    }
    setPhotosDirty(false)
    setPhotoModal(null)
  }, [trip])

  useEffect(() => {
    if (coverMode !== 'UPLOAD') {
      return
    }

    if (editablePhotos.length === 0) {
      setSelectedCoverPhotoId('')
      return
    }

    const stillExists = editablePhotos.some((photo) => photo.id === selectedCoverPhotoId)
    if (!stillExists) {
      setSelectedCoverPhotoId(editablePhotos[0].id)
    }
  }, [coverMode, editablePhotos, selectedCoverPhotoId])

  useEffect(() => {
    if (!photoModal) {
      return
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setPhotoModal(null)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [photoModal])

  const updateTripForm = (key, value) => {
    setTripForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'type' && value === 'SOLO' ? { members: 1 } : {}),
    }))
  }

  const openPhotoPicker = () => {
    photoInputRef.current?.click()
  }

  const handlePhotoSelect = async (event) => {
    const selectedFiles = Array.from(event.target.files ?? [])
    if (selectedFiles.length === 0) {
      return
    }

    const imageFiles = selectedFiles.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      setError('이미지 파일만 추가할 수 있습니다.')
      event.target.value = ''
      return
    }

    const readAsDataUrl = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(new Error('이미지를 읽는 중 오류가 발생했습니다.'))
        reader.readAsDataURL(file)
      })

    try {
      const newPhotos = await Promise.all(
        imageFiles.map(async (file, index) => ({
          id: `edit-upload-${Date.now()}-${index + 1}`,
          name: file.name,
          file,
          preview: await readAsDataUrl(file),
        })),
      )

      setEditablePhotos((prev) => [...prev, ...newPhotos])
      if (coverMode === 'UPLOAD' && !selectedCoverPhotoId && newPhotos[0]) {
        setSelectedCoverPhotoId(newPhotos[0].id)
      }
      setPhotosDirty(true)
      setError('')
    } catch {
      setError('선택한 사진을 불러오지 못했습니다. 다시 시도해주세요.')
    } finally {
      event.target.value = ''
    }
  }

  const removeEditablePhoto = (photoId) => {
    setEditablePhotos((prev) => prev.filter((photo) => photo.id !== photoId))
    setPhotosDirty(true)

    setPhotoModal((prev) => {
      if (!prev) {
        return prev
      }
      if (prev.id === photoId) {
        return null
      }
      return prev
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!trip) {
      setError('수정할 여행을 찾을 수 없습니다.')
      return
    }

    if (!tripForm.name.trim()) {
      setError('여행 이름을 입력해주세요.')
      return
    }

    if (!tripForm.startDate || !tripForm.endDate) {
      setError('시작일과 종료일을 입력해주세요.')
      return
    }

    if (tripForm.endDate < tripForm.startDate) {
      setError('종료일은 시작일 이후여야 합니다.')
      return
    }

    if (Number(tripForm.members) < 1) {
      setError('참여 인원은 1명 이상이어야 합니다.')
      return
    }

    let resolvedCover = ''
    if (coverMode === 'URL') {
      const urlValue = tripForm.cover.trim()
      if (!urlValue) {
        setError('커버 이미지 URL을 입력해주세요.')
        return
      }

      try {
        new URL(urlValue)
      } catch {
        setError('올바른 URL 형식으로 커버 이미지를 입력해주세요.')
        return
      }
      resolvedCover = urlValue
    } else {
      const coverPhoto = editablePhotos.find((photo) => photo.id === selectedCoverPhotoId)
      if (!coverPhoto) {
        setError('업로드한 사진 중 커버로 사용할 1장을 선택해주세요.')
        return
      }
      resolvedCover = coverPhoto.preview
    }

    const dateRange = `${tripForm.startDate.replaceAll('-', '.')} - ${tripForm.endDate.replaceAll('-', '.')}`
    const nextPhotoPreviews = editablePhotos.map((photo) => photo.preview)
    const hadActualPhotoPreviews = Array.isArray(trip.photoPreviews) && trip.photoPreviews.length > 0

    let nextPhotoCount = trip.photos
    if (hadActualPhotoPreviews || photosDirty || trip.photos === 0) {
      nextPhotoCount = nextPhotoPreviews.length
    }

    try {
      await onUpdateTrip({
        ...trip,
        name: tripForm.name.trim(),
        dateRange,
        members: Number(tripForm.members),
        type: tripForm.type,
        pinColor: normalizeTripPinColor(tripForm.pinColor, getDefaultTripPinColor(tripForm.type)),
        cover: resolvedCover || nextPhotoPreviews[0] || trip.cover || '',
        notes: tripForm.notes.trim(),
        photos: nextPhotoCount,
        photoPreviews: nextPhotoPreviews,
        photoFiles: editablePhotos.map((photo) => photo.file).filter((file) => file instanceof File),
        uploadedPhotoPreviews: editablePhotos
          .filter((photo) => photo.file instanceof File)
          .map((photo) => photo.preview),
        updatedAt: new Date().toISOString(),
      })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '여행 수정에 실패했습니다.')
    }
  }

  if (!trip) {
    return (
      <section className="single-grid appear">
        <article className="surface-panel info-panel trip-create">
          <h3>수정할 여행을 찾지 못했습니다.</h3>
          <p className="trip-create-caption">목록으로 돌아가서 수정할 여행을 다시 선택해주세요.</p>
          <a href="#trips" className="trip-action-btn ghost trip-nav-link">
            내 여행 목록으로
          </a>
        </article>
      </section>
    )
  }

  return (
    <section className="single-grid appear">
      <article className="surface-panel info-panel trip-create">
        <div className="trip-detail-top">
          <a href="#trips" className="trip-action-btn ghost trip-nav-link">
            목록으로
          </a>
        </div>

        <h3>내 여행 수정</h3>
        <p className="trip-create-caption">여행 정보를 수정하면 내 여행 상세 화면에 즉시 반영됩니다.</p>

        <form className="trip-create-form" onSubmit={handleSubmit}>
          <label>
            여행 이름
            <input
              type="text"
              value={tripForm.name}
              onChange={(event) => updateTripForm('name', event.target.value)}
              placeholder="여행 이름"
              required
            />
          </label>
          <div className="trip-create-row">
            <label>
              시작일
              <input
                type="date"
                value={tripForm.startDate}
                onChange={(event) => updateTripForm('startDate', event.target.value)}
                required
              />
            </label>
            <label>
              종료일
              <input
                type="date"
                value={tripForm.endDate}
                onChange={(event) => updateTripForm('endDate', event.target.value)}
                required
              />
            </label>
          </div>
          <div className="trip-create-row">
            <label>
              여행 유형
              <select value={tripForm.type} onChange={(event) => updateTripForm('type', event.target.value)}>
                <option value="GROUP">그룹여행</option>
                <option value="SOLO">혼자여행</option>
              </select>
            </label>
            <label>
              참여 인원
              <input
                type="number"
                min={1}
                value={tripForm.members}
                onChange={(event) => updateTripForm('members', event.target.value)}
                required
              />
            </label>
          </div>
          <label>
            지도 핀 색상
            <input
              type="color"
              value={normalizeTripPinColor(tripForm.pinColor, getDefaultTripPinColor(tripForm.type))}
              onChange={(event) => updateTripForm('pinColor', event.target.value)}
            />
          </label>
          <div className="trip-cover-selector">
            <p>커버 이미지 선택 (1장)</p>
            <div className="trip-cover-options">
              <label className={`trip-cover-option ${coverMode === 'UPLOAD' ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="trip-edit-cover-mode"
                  value="UPLOAD"
                  checked={coverMode === 'UPLOAD'}
                  onChange={() => setCoverMode('UPLOAD')}
                />
                <span>업로드한 사진에서 선택</span>
              </label>
              <label className={`trip-cover-option ${coverMode === 'URL' ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="trip-edit-cover-mode"
                  value="URL"
                  checked={coverMode === 'URL'}
                  onChange={() => setCoverMode('URL')}
                />
                <span>이미지 URL 사용</span>
              </label>
            </div>
          </div>
          <label>
            커버 이미지 URL
            <input
              type="url"
              value={tripForm.cover}
              onChange={(event) => updateTripForm('cover', event.target.value)}
              placeholder="https://..."
              disabled={coverMode !== 'URL'}
            />
          </label>
          <label>
            여행 메모
            <textarea
              value={tripForm.notes}
              onChange={(event) => updateTripForm('notes', event.target.value)}
              placeholder="여행 메모를 입력하세요."
              rows={4}
            />
          </label>

          <div className="trip-photo-upload">
            <p>등록된 사진</p>
            <div className="trip-photo-toolbar">
              <button type="button" className="trip-photo-add-btn" onClick={openPhotoPicker}>
                + 사진 추가
              </button>
              <span className="trip-edit-photo-summary">{editablePhotos.length}장 확인됨 · 클릭 확대 / 제거 가능</span>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="trip-photo-input"
              onChange={handlePhotoSelect}
            />

            {editablePhotos.length > 0 ? (
              <div className="trip-photo-grid">
                {editablePhotos.map((photo) => (
                  <article
                    key={photo.id}
                    className={`trip-photo-card ${coverMode === 'UPLOAD' && selectedCoverPhotoId === photo.id ? 'is-cover' : ''}`}
                  >
                    <button type="button" className="trip-photo-preview-btn" onClick={() => setPhotoModal(photo)}>
                      <img src={photo.preview} alt={photo.name} />
                    </button>
                    <div className="trip-photo-card-foot">
                      <small>{photo.name}</small>
                      <div className="trip-photo-card-actions">
                        <button
                          type="button"
                          className={`trip-photo-cover-btn ${
                            coverMode === 'UPLOAD' && selectedCoverPhotoId === photo.id ? 'is-active' : ''
                          }`}
                          onClick={() => {
                            setCoverMode('UPLOAD')
                            setSelectedCoverPhotoId(photo.id)
                          }}
                        >
                          {coverMode === 'UPLOAD' && selectedCoverPhotoId === photo.id ? '커버 선택됨' : '커버로 선택'}
                        </button>
                        <button type="button" onClick={() => removeEditablePhoto(photo.id)}>
                          제거
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="pin-photo-empty">등록된 사진이 없습니다. 커버 URL을 사용하거나 새 여행에서 사진을 추가해주세요.</p>
            )}
          </div>

          <button type="submit" className="trip-action-btn submit">
            수정 저장하기
          </button>
        </form>

        {error && <p className="auth-notice error">{error}</p>}
      </article>

      {photoModal && (
        <div className="similar-modal-backdrop" onClick={() => setPhotoModal(null)} role="presentation">
          <div className="similar-modal edit-photo-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="similar-modal-head">
              <div>
                <p>등록된 사진 미리보기</p>
                <h4>{photoModal.name}</h4>
              </div>
              <button type="button" onClick={() => setPhotoModal(null)}>
                닫기
              </button>
            </div>
            <div className="edit-photo-modal-body">
              <img src={photoModal.preview} alt={photoModal.name} />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function PlacesView({ places, placeReviews, onOpenPlaceView }) {
  const [region, setRegion] = useState('전체')
  const [keyword, setKeyword] = useState('')

  const visiblePlaces = useMemo(
    () => normalizeRecommendedPlaces(places).filter((place) => place.isVisible !== false),
    [places],
  )

  const regions = useMemo(() => ['전체', ...new Set(visiblePlaces.map((place) => place.region))], [visiblePlaces])

  const filteredPlaces = useMemo(() => {
    const lowered = keyword.trim().toLowerCase()

    return visiblePlaces.filter((place) => {
      const regionMatched = region === '전체' || place.region === region
      const keywordMatched =
        lowered.length === 0 ||
        place.name.toLowerCase().includes(lowered) ||
        place.description.toLowerCase().includes(lowered) ||
        place.keywords.some((item) => item.toLowerCase().includes(lowered))

      return regionMatched && keywordMatched
    })
  }, [region, keyword, visiblePlaces])

  const placeReviewSummary = useMemo(() => {
    const summary = new Map()
    visiblePlaces.forEach((place) => {
      const reviews = normalizePlaceReviewList(placeReviews?.[place.id], place.id)
      const serverCount = Number(place?.reviewCount)
      const serverAverage = Number(place?.averageRating)
      const fallbackCount = reviews.length
      const fallbackAverage = getPlaceAverageRating(reviews)
      const count = Number.isFinite(serverCount) ? Math.max(0, Math.floor(serverCount)) : fallbackCount
      const average = Number.isFinite(serverAverage) ? Math.max(0, Math.min(5, serverAverage)) : fallbackAverage
      summary.set(place.id, {
        count,
        average,
      })
    })
    return summary
  }, [placeReviews, visiblePlaces])

  const sponsoredShowcasePlaces = useMemo(() => {
    const sponsored = filteredPlaces.filter((place) => place.isSponsored === true)
    return pickRandomItems(sponsored, 5)
  }, [filteredPlaces])

  return (
    <section className="single-grid appear">
      <article className="surface-panel info-panel">
        <div className="place-toolbar">
          <label>
            지역
            <select value={region} onChange={(event) => setRegion(event.target.value)}>
              {regions.map((regionItem) => (
                <option key={regionItem} value={regionItem}>
                  {regionItem}
                </option>
              ))}
            </select>
          </label>
          <label>
            키워드 검색
            <input
              type="text"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="예: 바다, 야경, 카페"
            />
          </label>
        </div>

        {sponsoredShowcasePlaces.length > 0 && (
          <section className="sponsored-showcase">
            <div className="sponsored-showcase-head">
              <h4>지금 뜨는 제휴 장소</h4>
              <small>검색 결과 중 랜덤 5곳</small>
            </div>
            <div className="sponsored-showcase-list">
              {sponsoredShowcasePlaces.map((place) => (
                <button
                  key={`sponsored-${place.id}`}
                  type="button"
                  className="sponsored-showcase-item"
                  aria-label={`${place.name} 상세 보기`}
                  onClick={() => onOpenPlaceView(place.id)}
                >
                  <img src={place.image} alt={place.name} />
                  <div className="sponsored-showcase-main">
                    <SponsoredBadge />
                    <strong>{place.name}</strong>
                    <span>{place.region}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="place-list">
          {filteredPlaces.map((place) => (
            <button
              key={place.id}
              type="button"
              className="place-row is-clickable"
              aria-label={`${place.name} 상세 보기`}
              onClick={() => onOpenPlaceView(place.id)}
            >
              <img src={place.image} alt={place.name} />
              <div className="place-row-main">
                <div className="place-title-row">
                  <strong>{place.name}</strong>
                  {place.isSponsored && <SponsoredBadge />}
                </div>
                <p>{place.description}</p>
                <span>{place.region}</span>
                <div className="keyword-chips">
                  {place.keywords.map((item) => (
                    <small key={`${place.id}-${item}`}>#{item}</small>
                  ))}
                </div>
              </div>
              <aside className="place-row-side">
                <small className="place-row-rating-label">평점</small>
                <strong className="place-row-rating-score">
                  {(placeReviewSummary.get(place.id)?.count ?? 0) > 0
                    ? (placeReviewSummary.get(place.id)?.average ?? 0).toFixed(1)
                    : '-'}
                </strong>
                <span className="place-row-rating-count">
                  {(placeReviewSummary.get(place.id)?.count ?? 0) > 0
                    ? `후기 ${placeReviewSummary.get(place.id)?.count ?? 0}개`
                    : '후기 없음'}
                </span>
              </aside>
            </button>
          ))}
        </div>

        {filteredPlaces.length === 0 && <p className="empty-state">검색 결과가 없습니다. 다른 키워드로 시도해보세요.</p>}
      </article>
    </section>
  )
}

function PlaceViewPage({ place, reviews, onAddReview, onReportReview, onBackToPlaces }) {
  const [selectedImage, setSelectedImage] = useState(() => getInitialSelectedPlaceImage(place))
  const [reviewForm, setReviewForm] = useState({
    author: '',
    rating: 5,
    comment: '',
  })
  const [reviewError, setReviewError] = useState('')
  const [mapError, setMapError] = useState('')
  const [resolvedCoordinates, setResolvedCoordinates] = useState(null)
  const mapRef = useRef(null)

  const galleryImages = useMemo(() => {
    if (!place) {
      return []
    }

    const raw = [place.image, ...(Array.isArray(place.gallery) ? place.gallery : [])]
    return Array.from(new Set(raw.map((item) => String(item).trim()).filter((item) => item.length > 0)))
  }, [place])

  const normalizedReviews = useMemo(
    () => normalizePlaceReviewList(reviews, place?.id ?? 'place-review'),
    [place?.id, reviews],
  )
  const averageRating = useMemo(() => getPlaceAverageRating(normalizedReviews), [normalizedReviews])
  const hasCoordinates =
    Number.isFinite(resolvedCoordinates?.latitude) &&
    Number.isFinite(resolvedCoordinates?.longitude) &&
    Math.abs(resolvedCoordinates.latitude) <= 90 &&
    Math.abs(resolvedCoordinates.longitude) <= 180

  const renderStars = (rating, prefix) =>
    Array.from({ length: 5 }, (_, index) => (
      <span key={`${prefix}-star-${index + 1}`} className={`place-star ${index < Math.round(rating) ? 'is-filled' : ''}`}>
        ★
      </span>
    ))

  const handleSubmitReview = async (event) => {
    event.preventDefault()
    if (!place || typeof onAddReview !== 'function') {
      return
    }

    const comment = reviewForm.comment.trim()
    if (comment.length < 3) {
      setReviewError('후기는 3자 이상 입력해주세요.')
      return
    }

    try {
      await onAddReview(place.id, {
        author: reviewForm.author.trim() || '익명 사용자',
        rating: normalizeReviewRating(reviewForm.rating),
        comment,
        createdAt: new Date().toISOString(),
      })

      setReviewForm((prev) => ({
        ...prev,
        rating: 5,
        comment: '',
      }))
      setReviewError('')
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : '후기 저장에 실패했습니다.')
    }
  }

  const handleReportReview = async (review) => {
    if (!place || typeof onReportReview !== 'function') {
      return
    }
    const reason = window.prompt('신고 사유를 입력해주세요.')
    const normalizedReason = String(reason ?? '').trim()
    if (normalizedReason.length < 3) {
      return
    }
    try {
      await onReportReview(place.id, review.id, normalizedReason)
      window.alert('후기 신고가 접수되었습니다.')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '후기 신고에 실패했습니다.')
    }
  }

  useEffect(() => {
    let isActive = true

    const resolveCoordinatesFromAddress = async () => {
      if (!place) {
        setResolvedCoordinates(null)
        return
      }

      const storedLatitude = normalizeCoordinateValue(place.latitude)
      const storedLongitude = normalizeCoordinateValue(place.longitude)
      if (
        Number.isFinite(storedLatitude) &&
        Number.isFinite(storedLongitude) &&
        Math.abs(storedLatitude) <= 90 &&
        Math.abs(storedLongitude) <= 180
      ) {
        setResolvedCoordinates({
          latitude: storedLatitude,
          longitude: storedLongitude,
          source: 'stored',
        })
        return
      }

      setResolvedCoordinates(null)

      try {
        const kakao = await loadKakaoMapSdk(KAKAO_MAP_API_KEY)
        if (!isActive) {
          return
        }
        if (!kakao?.maps?.services?.Geocoder || !kakao?.maps?.services?.Status) {
          return
        }

        const geocoder = new kakao.maps.services.Geocoder()
        const addressCandidates = []
        const description = String(place.description ?? '')
        const addressMatch = description.match(/주소:\s*([^·\n]+)/)
        if (addressMatch?.[1]) {
          addressCandidates.push(addressMatch[1].trim())
        }
        addressCandidates.push(`${String(place.region ?? '').trim()} ${String(place.name ?? '').trim()}`.trim())

        for (const query of addressCandidates.filter((item, index, arr) => item.length > 0 && arr.indexOf(item) === index)) {
          const result = await new Promise((resolve) => {
            geocoder.addressSearch(query, (items, status) => {
              if (status !== kakao.maps.services.Status.OK || !Array.isArray(items) || items.length === 0) {
                resolve(null)
                return
              }
              const firstItem = items[0]
              const latitude = Number(firstItem?.y)
              const longitude = Number(firstItem?.x)
              if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                resolve(null)
                return
              }
              resolve({ latitude, longitude })
            })
          })

          if (result && isActive) {
            setResolvedCoordinates({
              ...result,
              source: 'geocoded',
            })
            return
          }
        }
      } catch {
        // Ignore geocoding fallback errors. UI will show unavailable map state.
      }
    }

    resolveCoordinatesFromAddress()

    return () => {
      isActive = false
    }
  }, [place?.id, place?.latitude, place?.longitude, place?.description, place?.region, place?.name])

  useEffect(() => {
    let isActive = true
    let marker = null

    const renderPlaceMap = async () => {
      if (!place || !hasCoordinates || !mapRef.current) {
        setMapError('')
        return
      }

      try {
        const kakao = await loadKakaoMapSdk(KAKAO_MAP_API_KEY)
        if (!isActive || !mapRef.current) {
          return
        }

        const center = new kakao.maps.LatLng(resolvedCoordinates.latitude, resolvedCoordinates.longitude)
        const map = new kakao.maps.Map(mapRef.current, {
          center,
          level: 3,
        })
        marker = new kakao.maps.Marker({
          position: center,
        })
        marker.setMap(map)
        setMapError('')
      } catch (error) {
        if (isActive) {
          setMapError(error instanceof Error ? error.message : '장소 지도를 불러오지 못했습니다.')
        }
      }
    }

    renderPlaceMap()

    return () => {
      isActive = false
      if (marker) {
        marker.setMap(null)
      }
    }
  }, [place?.id, resolvedCoordinates?.latitude, resolvedCoordinates?.longitude, hasCoordinates])

  if (!place) {
    return (
      <section className="single-grid appear">
        <article className="surface-panel info-panel trip-create">
          <h3>추천 장소를 찾지 못했습니다.</h3>
          <p className="trip-create-caption">추천 장소 목록에서 다시 선택해주세요.</p>
          <a href="#places" className="trip-action-btn ghost trip-nav-link">
            추천 장소 목록으로
          </a>
        </article>
      </section>
    )
  }

  return (
    <section className="single-grid appear">
      <article className="surface-panel info-panel">
        <div className="trip-detail-top">
          <button type="button" className="trip-action-btn ghost" onClick={onBackToPlaces}>
            목록으로
          </button>
        </div>

        <article className="place-detail-card">
          <img src={selectedImage || place.image} alt={place.name} />
          <div className="place-detail-main">
            <p className="label">Recommended Place</p>
            <h3>{place.name}</h3>
            <p>{place.detailDescription || place.description}</p>
            <span className="place-detail-region">{place.region}</span>
            {place.bestTime && <small className="place-best-time">추천 시간: {place.bestTime}</small>}
            <div className="place-rating-summary">
              <div className="place-rating-stars">{renderStars(averageRating, 'summary')}</div>
              <strong>{averageRating.toFixed(1)}</strong>
              <span>후기 {normalizedReviews.length}개</span>
            </div>
            <div className="keyword-chips">
              {place.keywords.map((item) => (
                <small key={`${place.id}-detail-${item}`}>#{item}</small>
              ))}
            </div>
            {place.highlights.length > 0 && (
              <ul className="place-highlight-list">
                {place.highlights.map((item) => (
                  <li key={`${place.id}-highlight-${item}`}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </article>

        <section className="place-map-panel">
          <h4>카카오맵 위치</h4>
          {hasCoordinates ? (
            <>
              <div ref={mapRef} className="kakao-map place-detail-map" />
              <div className="place-map-meta">
                <span>
                  위도 {resolvedCoordinates.latitude.toFixed(6)} / 경도 {resolvedCoordinates.longitude.toFixed(6)}
                  {resolvedCoordinates.source === 'geocoded' ? ' (주소 기반 추정)' : ''}
                </span>
                <a
                  href={`https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${resolvedCoordinates.latitude},${resolvedCoordinates.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  카카오맵에서 크게 보기
                </a>
              </div>
            </>
          ) : (
            <p className="trip-create-caption">좌표 정보가 없어 지도를 표시할 수 없습니다.</p>
          )}
          {mapError && <p className="auth-notice error">{mapError}</p>}
        </section>

        <section className="place-gallery-panel">
          <h4>추가 이미지</h4>
          <div className="place-gallery-strip">
            {galleryImages.map((imageUrl, index) => (
              <button
                key={`${place.id}-gallery-${index + 1}`}
                type="button"
                className={`place-gallery-thumb ${imageUrl === selectedImage ? 'is-active' : ''}`}
                onClick={() => setSelectedImage(imageUrl)}
              >
                <img src={imageUrl} alt={`${place.name} 추가 이미지 ${index + 1}`} />
              </button>
            ))}
          </div>
        </section>

        <section className="place-review-panel">
          <div className="place-review-head">
            <h4>사용자 후기</h4>
            <span>총 {normalizedReviews.length}개</span>
          </div>
          <form className="place-review-form" onSubmit={handleSubmitReview}>
            <div className="place-review-form-row">
              <input
                type="text"
                value={reviewForm.author}
                onChange={(event) => setReviewForm((prev) => ({ ...prev, author: event.target.value }))}
                placeholder="닉네임 (선택)"
              />
              <select
                value={reviewForm.rating}
                onChange={(event) => setReviewForm((prev) => ({ ...prev, rating: Number(event.target.value) }))}
              >
                <option value={5}>5점</option>
                <option value={4}>4점</option>
                <option value={3}>3점</option>
                <option value={2}>2점</option>
                <option value={1}>1점</option>
              </select>
            </div>
            <textarea
              value={reviewForm.comment}
              onChange={(event) => setReviewForm((prev) => ({ ...prev, comment: event.target.value }))}
              placeholder="이 장소에 대한 후기를 남겨주세요."
              rows={3}
            />
            <button type="submit" className="trip-action-btn submit">
              후기 등록
            </button>
            {reviewError && <p className="trip-invite-error">{reviewError}</p>}
          </form>

          <div className="place-review-list">
            {normalizedReviews.length > 0 ? (
              normalizedReviews.map((review) => (
                <article key={review.id} className="place-review-item">
                  <div className="place-review-item-head">
                    <strong>{review.author}</strong>
                    <div className="place-review-rating">{renderStars(review.rating, review.id)}</div>
                    <small>{new Date(review.createdAt).toLocaleDateString('ko-KR')}</small>
                  </div>
                  <p>{review.comment}</p>
                  <button type="button" className="trip-action-btn ghost compact" onClick={() => handleReportReview(review)}>
                    신고
                  </button>
                </article>
              ))
            ) : (
              <p className="trip-create-caption">아직 등록된 후기가 없습니다. 첫 후기를 남겨보세요.</p>
            )}
          </div>
        </section>
      </article>
    </section>
  )
}

function InviteAcceptView({ inviteCode, invitePreview, loading, loadError, currentUser, onAcceptInvite }) {
  const [submitError, setSubmitError] = useState('')
  const [submitNotice, setSubmitNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setSubmitError('')
    setSubmitNotice('')
    setIsSubmitting(false)
  }, [inviteCode])

  const handleAccept = async () => {
    if (!inviteCode || typeof onAcceptInvite !== 'function') {
      return
    }

    setSubmitError('')
    setSubmitNotice('')
    setIsSubmitting(true)
    try {
      const result = await onAcceptInvite(inviteCode)
      const groupId = String(result?.groupId ?? '').trim()
      setSubmitNotice(groupId.length > 0 ? '그룹 초대를 수락했습니다. 내 여행 목록으로 이동합니다.' : '그룹 초대를 수락했습니다.')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '그룹 초대 수락에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!inviteCode) {
    return (
      <section className="single-grid appear">
        <article className="surface-panel info-panel trip-create">
          <h3>초대 코드가 올바르지 않습니다.</h3>
          <p className="trip-create-caption">전달받은 링크를 다시 확인해주세요.</p>
        </article>
      </section>
    )
  }

  return (
    <section className="single-grid appear">
      <article className="surface-panel info-panel trip-create">
        <h3>그룹 초대 수락</h3>
        <p className="trip-create-caption">공유 여행 그룹에 참여하려면 초대 내용을 확인한 뒤 수락하세요.</p>

        {loading ? (
          <p className="trip-create-caption">초대 정보를 불러오는 중입니다.</p>
        ) : loadError ? (
          <p className="trip-invite-error">{loadError}</p>
        ) : invitePreview ? (
          <div className="trip-invite-panel">
            <div className="trip-invite-head">
              <h4>{invitePreview.groupName || 'Soonmile 그룹'}</h4>
              <span>{invitePreview.status === 'ACCEPTED' ? '수락 완료' : invitePreview.status === 'EXPIRED' ? '만료됨' : '수락 대기중'}</span>
            </div>
            <div className="group-invite-preview-grid">
              <div>
                <strong>초대 대상</strong>
                <span>{invitePreview.invitedEmail}</span>
              </div>
              <div>
                <strong>만료 시각</strong>
                <span>{invitePreview.expiresAt ? new Date(invitePreview.expiresAt).toLocaleString() : '미정'}</span>
              </div>
            </div>

            {!currentUser ? (
              <p className="trip-invite-empty">초대를 수락하려면 먼저 로그인해주세요. 로그인 후 다시 이 화면에서 수락할 수 있습니다.</p>
            ) : invitePreview.status === 'ACCEPTED' ? (
              <p className="trip-invite-notice">이미 수락된 초대입니다. 내 여행 목록에서 그룹 여행을 확인해보세요.</p>
            ) : invitePreview.status === 'EXPIRED' ? (
              <p className="trip-invite-error">만료된 초대입니다. 그룹 OWNER에게 새 초대를 요청해주세요.</p>
            ) : (
              <>
                <p className="trip-invite-empty">현재 로그인 계정: {currentUser.email}</p>
                <button type="button" className="trip-action-btn submit" onClick={handleAccept} disabled={isSubmitting}>
                  {isSubmitting ? '수락 중...' : '초대 수락하기'}
                </button>
              </>
            )}

            {submitError && <p className="trip-invite-error">{submitError}</p>}
            {submitNotice && <p className="trip-invite-notice">{submitNotice}</p>}
          </div>
        ) : (
          <p className="trip-create-caption">초대 정보를 찾지 못했습니다.</p>
        )}
      </article>
    </section>
  )
}

function TripShareView({ shareToken, tripPreview, loading, loadError }) {
  const mapRef = useRef(null)
  const mapObjRef = useRef(null)
  const markerRef = useRef([])
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')

  const sharePins = useMemo(
    () => (Array.isArray(tripPreview?.pins) ? tripPreview.pins : []).filter((pin) => Number.isFinite(Number(pin?.lat)) && Number.isFinite(Number(pin?.lng))),
    [tripPreview],
  )
  const representativePhotoUrl = useMemo(() => resolveMediaUrl(String(tripPreview?.representativePhotoUrl ?? '').trim()), [tripPreview])

  useEffect(() => {
    if (!tripPreview || loading) {
      setMapReady(false)
      setMapError('')
      return
    }

    if (sharePins.length === 0) {
      setMapReady(false)
      setMapError('표시할 핀이 없습니다.')
      return
    }

    let isActive = true

    const initMap = async () => {
      try {
        const kakao = await loadKakaoMapSdk(KAKAO_MAP_API_KEY)
        if (!isActive || !mapRef.current) {
          return
        }

        const firstPin = sharePins[0]
        const center = new kakao.maps.LatLng(Number(firstPin.lat), Number(firstPin.lng))
        const map = mapObjRef.current
          ?? new kakao.maps.Map(mapRef.current, {
            center,
            level: 8,
          })

        mapObjRef.current = map
        markerRef.current.forEach((marker) => marker.setMap(null))

        const bounds = new kakao.maps.LatLngBounds()
        markerRef.current = sharePins.map((pin) => {
          const position = new kakao.maps.LatLng(Number(pin.lat), Number(pin.lng))
          bounds.extend(position)
          const marker = new kakao.maps.Marker({
            position,
            image: buildMarkerImage(kakao, normalizeTripPinColor(tripPreview?.pinColor, TRIP_PIN_COLOR_GROUP_DEFAULT)),
            title: String(pin?.title ?? '').trim() || '핀',
          })
          marker.setMap(map)
          return marker
        })

        if (sharePins.length === 1) {
          map.setCenter(bounds.getCenter())
          map.setLevel(5)
        } else {
          map.setBounds(bounds)
        }

        setMapError('')
        setMapReady(true)
      } catch (error) {
        if (!isActive) {
          return
        }
        setMapReady(false)
        setMapError(error instanceof Error ? error.message : '공유 지도 정보를 불러오지 못했습니다.')
      }
    }

    initMap()

    return () => {
      isActive = false
    }
  }, [loading, sharePins, tripPreview])

  if (!shareToken) {
    return (
      <section className="single-grid appear">
        <article className="surface-panel info-panel trip-create">
          <h3>공유 링크가 올바르지 않습니다.</h3>
          <p className="trip-create-caption">전달받은 공유 링크를 다시 확인해주세요.</p>
        </article>
      </section>
    )
  }

  return (
    <section className="single-grid appear">
      <article className="surface-panel info-panel">
        <h3>공유 여행 보기</h3>
        {loading ? (
          <p className="trip-create-caption">공유 여행 정보를 불러오는 중입니다.</p>
        ) : loadError ? (
          <p className="trip-invite-error">{loadError}</p>
        ) : tripPreview ? (
          <div className="trip-detail">
            <div className="trip-detail-card">
              {representativePhotoUrl ? (
                <img src={representativePhotoUrl} alt={`${tripPreview.name} 대표 사진`} />
              ) : (
                <div className="trip-detail-main">
                  <p className="trip-create-caption">대표 사진이 없습니다.</p>
                </div>
              )}
              <div className="trip-detail-main">
                <h4>{tripPreview.name}</h4>
                <p className="trip-create-caption">{buildDateRangeLabel(tripPreview.startDate, tripPreview.endDate) || '일정 정보 없음'}</p>
                <div className="trip-detail-stats">
                  <span>핀 {sharePins.length}개</span>
                  <span>경로 {Array.isArray(tripPreview.route) ? tripPreview.route.length : 0}개</span>
                  <span>미분류 사진 {Number(tripPreview.unresolvedPhotoCount) || 0}장</span>
                  <span>업데이트 {tripPreview.updatedAt ? new Date(tripPreview.updatedAt).toLocaleString('ko-KR') : '미정'}</span>
                </div>
              </div>
            </div>

        <div className="map-wrap trip-map-wrap">
              <div ref={mapRef} className="kakao-map" aria-label="공유 여행 핀 지도" />
              {!mapReady && mapError && <div className="map-overlay map-error">{mapError}</div>}
              {!mapReady && !mapError && <div className="map-overlay">지도를 준비하는 중...</div>}
            </div>

            {sharePins.length > 0 ? (
              <ul className="trip-share-pin-list">
                {sharePins.slice(0, 20).map((pin) => (
                  <li key={pin.pinId}>
                    <strong>{String(pin.title ?? '').trim() || '핀'}</strong>
                    <span>
                      사진 {Number(pin.photoCount) || 0}장 · {Number(pin.lat).toFixed(4)}, {Number(pin.lng).toFixed(4)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="trip-create-caption">공유된 핀이 없습니다.</p>
            )}
          </div>
        ) : (
          <p className="trip-create-caption">공유 여행 정보를 찾지 못했습니다.</p>
        )}
      </article>
    </section>
  )
}

function AuthSidePanel({ heading, description }) {
  return (
    <aside className="surface-panel auth-aside">
      <p className="label">Account Access</p>
      <h2>{heading}</h2>
      <p>{description}</p>

      <ul className="auth-highlight-list">
        {AUTH_HIGHLIGHTS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </aside>
  )
}

function LoginView({ onGoogleLogin, onLogout, currentUser }) {
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [googleSubmitting, setGoogleSubmitting] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  const onGoogleLoginRef = useRef(onGoogleLogin)

  useEffect(() => {
    onGoogleLoginRef.current = onGoogleLogin
  }, [onGoogleLogin])

  useEffect(() => {
    let disposed = false

    const initializeGoogleLogin = async () => {
      if (!GOOGLE_CLIENT_ID) {
        return
      }

      try {
        setGoogleReady(false)
        await loadGoogleIdentityScript()
        if (disposed) {
          return
        }
        if (!window.google?.accounts?.id) {
          throw new Error('Google 로그인 객체를 찾지 못했습니다. 도메인 설정을 확인해주세요.')
        }

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            const idToken = String(response?.credential ?? '').trim()
            if (!idToken) {
              setError('Google 로그인 토큰을 받지 못했습니다. 다시 시도해주세요.')
              return
            }
            if (typeof onGoogleLoginRef.current !== 'function') {
              setError('Google 로그인 처리 함수를 찾을 수 없습니다.')
              return
            }

            try {
              setNotice('')
              setError('')
              setGoogleSubmitting(true)
              const session = await onGoogleLoginRef.current({ idToken })
              setNotice(`${session.user.name}님, Google 로그인되었습니다.`)
              setRouteHash('home')
            } catch (requestError) {
              setError(requestError instanceof Error ? requestError.message : 'Google 로그인에 실패했습니다.')
            } finally {
              setGoogleSubmitting(false)
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        })

        setGoogleReady(true)
      } catch (requestError) {
        if (disposed) {
          return
        }
        setGoogleReady(false)
        setError(requestError instanceof Error ? requestError.message : 'Google 로그인 SDK를 초기화하지 못했습니다.')
      }
    }

    initializeGoogleLogin()

    return () => {
      disposed = true
    }
  }, [])

  const handleGoogleLogin = () => {
    setError('')
    setNotice('')

    if (!GOOGLE_CLIENT_ID) {
      setError('Google 로그인을 사용하려면 VITE_GOOGLE_CLIENT_ID 설정이 필요합니다.')
      return
    }
    if (!googleReady || !window.google?.accounts?.id) {
      setError('Google 로그인 초기화 중입니다. 잠시 후 다시 시도해주세요.')
      loadGoogleIdentityScript()
        .then(() => {
          if (window.google?.accounts?.id) {
            setGoogleReady(true)
          }
        })
        .catch((requestError) => {
          setGoogleReady(false)
          setError(requestError instanceof Error ? requestError.message : 'Google 로그인 SDK를 초기화하지 못했습니다.')
        })
      return
    }

    window.google.accounts.id.prompt((notification) => {
      if (typeof notification?.isNotDisplayed === 'function' && notification.isNotDisplayed()) {
        const reason = typeof notification.getNotDisplayedReason === 'function' ? notification.getNotDisplayedReason() : 'unknown'
        setError(`Google 로그인 창을 열 수 없습니다. (${reason})`)
      }
    })
  }

  return (
    <section className="single-grid appear">
      <article className="surface-panel auth-form-panel auth-form-panel-compact">
        <h2>로그인</h2>

        {currentUser && (
          <div className="trip-detail">
            <p className="auth-notice success">{currentUser.name}님이 로그인 중입니다.</p>
            <button type="button" className="trip-action-btn ghost" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        )}

        <div className="auth-social-stack">
          <button type="button" className="google-auth-btn" onClick={handleGoogleLogin} disabled={googleSubmitting}>
            <span className="google-mark">G</span>
            <span>{googleSubmitting ? '소셜 로그인 중...' : 'Google로 로그인'}</span>
          </button>

          <button type="button" className="naver-auth-btn" disabled aria-disabled="true">
            <span className="naver-mark">N</span>
            <span>네이버 로그인 (준비중)</span>
          </button>
        </div>

        {error && <p className="auth-notice error">{error}</p>}
        {notice && <p className="auth-notice success">{notice}</p>}
      </article>
    </section>
  )
}

function AdminLoginView({ isUserAuthenticated, isAdminAuthenticated, adminSession, onLogout }) {
  return (
    <section className="auth-layout appear">
      <AuthSidePanel
        heading="백오피스 접근 권한 확인"
        description="관리자 계정으로 로그인한 사용자만 백오피스 메뉴에 접근할 수 있습니다."
      />

      <article className="surface-panel auth-form-panel">
        <h2>관리자 로그인</h2>
        <p className="auth-form-description">운영자 계정 인증 후 백오피스 대시보드에 접근할 수 있습니다.</p>

        {isAdminAuthenticated ? (
          <div className="trip-detail">
            <p className="auth-notice success">{adminSession?.email} 계정으로 로그인되어 있습니다.</p>
            <a href="#admin-dashboard" className="trip-action-btn trip-nav-link">
              백오피스로 이동
            </a>
            <button type="button" className="trip-action-btn ghost" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        ) : isUserAuthenticated ? (
          <div className="trip-detail">
            <p className="auth-notice error">현재 계정에는 관리자 권한이 없습니다.</p>
            <button type="button" className="trip-action-btn ghost" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        ) : (
          <div className="trip-detail">
            <p className="auth-notice">먼저 일반 로그인 후 관리자 권한이 있는 계정으로 다시 시도해주세요.</p>
            <a href="#login" className="trip-action-btn trip-nav-link">
              로그인 페이지로 이동
            </a>
          </div>
        )}
      </article>
    </section>
  )
}

function AdminAccessDeniedView() {
  return (
    <section className="single-grid appear">
      <article className="surface-panel info-panel trip-create">
        <h3>접근 권한이 없습니다.</h3>
        <p className="trip-create-caption">관리자 권한이 확인되지 않아 백오피스 접근이 차단되었습니다.</p>
        <a href="#admin-login" className="trip-action-btn trip-nav-link">
          관리자 로그인으로 이동
        </a>
      </article>
    </section>
  )
}

function AdminShell({ activeRoute, adminSession, onAdminLogout, children }) {
  return (
    <section className="admin-layout appear">
      <aside className="surface-panel admin-sidebar">
        <div className="admin-sidebar-head">
          <p className="label">Backoffice</p>
          <h3>{adminSession?.name ?? '관리자'}</h3>
          <small>{adminSession?.email}</small>
        </div>
        <nav className="admin-menu">
          {ADMIN_MENU_ITEMS.map((item) => (
                <a key={item.key} href={toRouteHref(item.key)} className={`admin-menu-link ${activeRoute === item.key ? 'is-active' : ''}`}>
              {item.label}
            </a>
          ))}
        </nav>
        <button type="button" className="trip-action-btn ghost" onClick={onAdminLogout}>
          로그아웃
        </button>
      </aside>
      <article className="surface-panel info-panel admin-main">{children}</article>
    </section>
  )
}

function AdminDashboardView({ adminSession, onAdminLogout, activeRoute, trips, adminUsers, places }) {
  const normalizedPlaces = useMemo(() => normalizeRecommendedPlaces(places), [places])
  const metrics = useMemo(() => {
    const totalTrips = trips.length
    const activeTrips = trips.filter((trip) => (trip.adminStatus ?? 'ACTIVE') !== 'ARCHIVED').length
    const pendingReviewTrips = trips.filter((trip) => (trip.adminStatus ?? 'ACTIVE') === 'REVIEW').length
    const totalUsers = adminUsers.length
    const suspendedUsers = adminUsers.filter((user) => user.status === 'SUSPENDED').length
    const visiblePlaces = normalizedPlaces.filter((place) => place.isVisible !== false).length
    const totalPhotos = trips.reduce((sum, trip) => sum + (Number(trip.photos) || 0), 0)
    return [
      { label: '전체 여행', value: `${totalTrips}개` },
      { label: '운영중 여행', value: `${activeTrips}개` },
      { label: '리뷰 대기 여행', value: `${pendingReviewTrips}개` },
      { label: '전체 사용자', value: `${totalUsers}명` },
      { label: '정지 사용자', value: `${suspendedUsers}명` },
      { label: '노출 추천장소', value: `${visiblePlaces}개` },
      { label: '누적 사진 수', value: `${totalPhotos.toLocaleString()}장` },
    ]
  }, [adminUsers, normalizedPlaces, trips])

  const recentTrips = useMemo(
    () =>
      [...trips]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
    [trips],
  )

  return (
    <AdminShell activeRoute={activeRoute} adminSession={adminSession} onAdminLogout={onAdminLogout}>
      <div className="admin-page-head">
        <p className="label">Admin Dashboard</p>
        <h2>운영 현황 요약</h2>
      </div>
      <div className="admin-metric-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className="admin-metric-card">
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>
      <div className="admin-block">
        <h3>최근 수정된 여행</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>여행명</th>
                <th>유형</th>
                <th>사진</th>
                <th>수정일</th>
              </tr>
            </thead>
            <tbody>
              {recentTrips.map((trip) => (
                <tr key={trip.id}>
                  <td>{trip.name}</td>
                  <td>{trip.type === 'GROUP' ? '그룹여행' : '혼자여행'}</td>
                  <td>{trip.photos}장</td>
                  <td>{new Date(trip.updatedAt).toLocaleDateString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  )
}

function AdminTripsManagementView({ activeRoute, adminSession, onAdminLogout, trips, onUpdateTripAdminStatus, onDeleteTrip }) {
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const filteredTrips = useMemo(() => {
    const lowered = keyword.trim().toLowerCase()
    return trips.filter((trip) => {
      const currentStatus = trip.adminStatus ?? 'ACTIVE'
      const keywordMatched =
        lowered.length === 0 ||
        trip.name.toLowerCase().includes(lowered) ||
        trip.dateRange.toLowerCase().includes(lowered)
      const typeMatched = typeFilter === 'ALL' || trip.type === typeFilter
      const statusMatched = statusFilter === 'ALL' || currentStatus === statusFilter
      return keywordMatched && typeMatched && statusMatched
    })
  }, [keyword, statusFilter, trips, typeFilter])

  return (
    <AdminShell activeRoute={activeRoute} adminSession={adminSession} onAdminLogout={onAdminLogout}>
      <div className="admin-page-head">
        <p className="label">Trips Management</p>
        <h2>여행 목록 관리</h2>
      </div>
      <div className="admin-toolbar">
        <input
          type="text"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="여행명/기간 검색"
        />
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="ALL">모든 유형</option>
          <option value="GROUP">그룹여행</option>
          <option value="SOLO">혼자여행</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="ALL">모든 상태</option>
          <option value="ACTIVE">운영중</option>
          <option value="REVIEW">검토중</option>
          <option value="HIDDEN">숨김</option>
          <option value="ARCHIVED">보관</option>
        </select>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>여행</th>
              <th>유형</th>
              <th>참여/사진</th>
              <th>상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrips.map((trip) => (
              <tr key={trip.id}>
                <td>
                  <div className="admin-trip-cell">
                    <img src={trip.cover} alt={trip.name} />
                    <div>
                      <strong>{trip.name}</strong>
                      <small>{trip.dateRange}</small>
                    </div>
                  </div>
                </td>
                <td>{trip.type === 'GROUP' ? '그룹여행' : '혼자여행'}</td>
                <td>
                  {trip.members}명 / {trip.photos}장
                </td>
                <td>
                  <select
                    value={trip.adminStatus ?? 'ACTIVE'}
                    onChange={(event) => onUpdateTripAdminStatus(trip.id, event.target.value)}
                  >
                    <option value="ACTIVE">운영중</option>
                    <option value="REVIEW">검토중</option>
                    <option value="HIDDEN">숨김</option>
                    <option value="ARCHIVED">보관</option>
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    className="admin-danger-btn"
                    onClick={() => {
                      if (window.confirm(`${trip.name} 여행을 삭제할까요?`)) {
                        onDeleteTrip(trip.id)
                      }
                    }}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  )
}

function AdminUsersManagementView({
  activeRoute,
  adminSession,
  onAdminLogout,
  adminUsers,
  onUpdateUserRole,
  onUpdateUserStatus,
  isLoading,
  loadError,
}) {
  const [keyword, setKeyword] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const filteredUsers = useMemo(() => {
    const lowered = keyword.trim().toLowerCase()
    return adminUsers.filter((user) => {
      const keywordMatched =
        lowered.length === 0 ||
        user.name.toLowerCase().includes(lowered) ||
        user.email.toLowerCase().includes(lowered)
      const roleMatched = roleFilter === 'ALL' || user.role === roleFilter
      const statusMatched = statusFilter === 'ALL' || user.status === statusFilter
      return keywordMatched && roleMatched && statusMatched
    })
  }, [adminUsers, keyword, roleFilter, statusFilter])

  return (
    <AdminShell activeRoute={activeRoute} adminSession={adminSession} onAdminLogout={onAdminLogout}>
      <div className="admin-page-head">
        <p className="label">Users Management</p>
        <h2>사용자 목록 관리</h2>
      </div>
      <div className="admin-toolbar">
        <input
          type="text"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="이름/이메일 검색"
        />
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <option value="ALL">모든 권한</option>
          {ADMIN_ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="ALL">모든 상태</option>
          {ADMIN_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      {isLoading && <p>사용자 목록을 불러오는 중입니다...</p>}
      {loadError && <p>사용자 목록 로딩 오류: {loadError}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>가입일</th>
              <th>권한</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.joinedAt}</td>
                <td>
                  <select value={user.role} onChange={(event) => onUpdateUserRole(user.id, event.target.value)}>
                    {ADMIN_ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={user.status} onChange={(event) => onUpdateUserStatus(user.id, event.target.value)}>
                    {ADMIN_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  )
}

function AdminPlacesManagementView({
  activeRoute,
  adminSession,
  onAdminLogout,
  places,
  onCreatePlace,
  onUploadPlaceImage,
  onTogglePlaceVisibility,
  onTogglePlaceSponsored,
  onDeletePlace,
  isLoading,
  loadError,
}) {
  const [newPlace, setNewPlace] = useState({
    name: '',
    region: '',
    description: '',
    keywords: '',
    image: '',
    latitude: '',
    longitude: '',
    isSponsored: false,
  })
  const [error, setError] = useState('')
  const [kakaoSearchKeyword, setKakaoSearchKeyword] = useState('')
  const [kakaoSearchResults, setKakaoSearchResults] = useState([])
  const [kakaoSearchError, setKakaoSearchError] = useState('')
  const [kakaoSearching, setKakaoSearching] = useState(false)
  const [selectedKakaoPlaceId, setSelectedKakaoPlaceId] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
  const [imageUploadError, setImageUploadError] = useState('')

  const buildKakaoPlaceholderImage = (placeName, regionName) => {
    const title = escapeHtml(placeName || '추천 장소')
    const subtitle = escapeHtml(regionName || '카카오맵')
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
        <defs>
          <linearGradient id="soonmileKakaoBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fff1cc" />
            <stop offset="100%" stop-color="#ffe08a" />
          </linearGradient>
        </defs>
        <rect width="640" height="360" fill="url(#soonmileKakaoBg)" />
        <circle cx="82" cy="92" r="38" fill="#ffcc00" opacity="0.72" />
        <circle cx="560" cy="272" r="46" fill="#ffd94e" opacity="0.6" />
        <rect x="44" y="222" width="552" height="94" rx="18" fill="rgba(0,0,0,0.18)" />
        <text x="70" y="258" fill="#2f2300" font-size="28" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-weight="700">${title}</text>
        <text x="70" y="292" fill="#4f3f0a" font-size="18" font-family="Pretendard, Apple SD Gothic Neo, sans-serif">${subtitle} · Kakao Map</text>
      </svg>
    `.trim()
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
  }

  const extractRegionFromAddress = (address) => {
    const tokens = String(address ?? '')
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0)
    if (tokens.length === 0) {
      return ''
    }

    const primaryToken = tokens[0]
    return primaryToken
      .replace('특별자치시', '')
      .replace('특별자치도', '')
      .replace('특별시', '')
      .replace('광역시', '')
      .replace('자치시', '')
      .replace('도', '')
      .trim()
  }

  const buildKeywordsFromCategory = (categoryName, regionName) => {
    const categoryTokens = String(categoryName ?? '')
      .split('>')
      .flatMap((item) => item.split('/'))
      .flatMap((item) => item.split(','))
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
      .slice(0, 4)
    const merged = Array.from(new Set([regionName, ...categoryTokens].filter((item) => String(item ?? '').trim().length > 0)))
    return merged.slice(0, 6).join(', ')
  }

  const handleSearchKakaoPlaces = async (event) => {
    event.preventDefault()
    const keyword = kakaoSearchKeyword.trim()
    if (!keyword) {
      setKakaoSearchError('카카오맵 검색어를 입력해주세요.')
      setKakaoSearchResults([])
      return
    }

    setKakaoSearching(true)
    setKakaoSearchError('')

    try {
      const kakao = await loadKakaoMapSdk(KAKAO_MAP_API_KEY)
      if (!kakao?.maps?.services?.Places || !kakao?.maps?.services?.Status) {
        throw new Error('카카오맵 장소 검색 서비스를 초기화하지 못했습니다.')
      }

      const placesService = new kakao.maps.services.Places()
      const result = await new Promise((resolve, reject) => {
        placesService.keywordSearch(
          keyword,
          (items, status) => {
            if (status === kakao.maps.services.Status.OK) {
              resolve(Array.isArray(items) ? items : [])
              return
            }
            if (status === kakao.maps.services.Status.ZERO_RESULT) {
              resolve([])
              return
            }
            reject(new Error('카카오맵 장소 검색 중 오류가 발생했습니다.'))
          },
          {
            size: 10,
          },
        )
      })

      const normalizedResults = result
        .map((item, index) => {
          const name = String(item.place_name ?? '').trim()
          const roadAddress = String(item.road_address_name ?? '').trim()
          const address = String(item.address_name ?? '').trim()
          return {
            id: String(item.id ?? `${item.x ?? 'x'}-${item.y ?? 'y'}-${index + 1}`),
            name,
            roadAddress,
            address,
            category: String(item.category_name ?? '').trim(),
            phone: String(item.phone ?? '').trim(),
            placeUrl: String(item.place_url ?? '').trim(),
            latitude: Number(item.y),
            longitude: Number(item.x),
          }
        })
        .filter((item) => item.name.length > 0)

      setKakaoSearchResults(normalizedResults)
      setSelectedKakaoPlaceId('')
      if (normalizedResults.length === 0) {
        setKakaoSearchError('검색 결과가 없습니다. 다른 검색어로 시도해주세요.')
      }
    } catch (searchError) {
      setKakaoSearchResults([])
      setSelectedKakaoPlaceId('')
      setKakaoSearchError(searchError instanceof Error ? searchError.message : '카카오맵 검색에 실패했습니다.')
    } finally {
      setKakaoSearching(false)
    }
  }

  const handleSelectKakaoPlace = (place) => {
    const region = extractRegionFromAddress(place.roadAddress || place.address) || '기타'
    const address = place.roadAddress || place.address
    const keywords = buildKeywordsFromCategory(place.category, region)
    const descriptionParts = ['카카오맵 검색 결과']
    if (address.length > 0) {
      descriptionParts.push(`주소: ${address}`)
    }
    if (place.phone.length > 0) {
      descriptionParts.push(`전화: ${place.phone}`)
    }

    const placeholderImage = buildKakaoPlaceholderImage(place.name, region)
    setSelectedKakaoPlaceId(place.id)
    setNewPlace((prev) => {
      const previousImage = String(prev.image ?? '').trim()
      const shouldReplaceImage = previousImage.length === 0 || previousImage.startsWith('data:image/svg+xml')
      return {
        ...prev,
        name: place.name,
        region,
        description: descriptionParts.join(' · '),
        keywords,
        image: shouldReplaceImage ? placeholderImage : previousImage,
        latitude: Number.isFinite(place.latitude) ? String(place.latitude) : '',
        longitude: Number.isFinite(place.longitude) ? String(place.longitude) : '',
      }
    })
    setError('')
  }

  const handleUploadPlaceImage = async (event) => {
    const selectedFile = event.target.files?.[0]
    event.target.value = ''
    if (!selectedFile) {
      return
    }
    if (typeof onUploadPlaceImage !== 'function') {
      setImageUploadError('이미지 업로드 기능을 사용할 수 없습니다.')
      return
    }

    setImageUploading(true)
    setImageUploadError('')
    try {
      const uploadedImageUrl = await onUploadPlaceImage(selectedFile)
      if (!uploadedImageUrl) {
        throw new Error('이미지 업로드 응답이 올바르지 않습니다.')
      }
      setNewPlace((prev) => ({
        ...prev,
        image: uploadedImageUrl,
      }))
      setError('')
    } catch (uploadError) {
      setImageUploadError(uploadError instanceof Error ? uploadError.message : '이미지 업로드에 실패했습니다.')
    } finally {
      setImageUploading(false)
    }
  }

  const handleCreatePlace = async (event) => {
    event.preventDefault()

    if (!newPlace.name.trim()) {
      setError('장소 이름을 입력해주세요.')
      return
    }

    const imageValue = newPlace.image.trim()
    if (!imageValue) {
      setError('대표 이미지를 입력하거나 업로드해주세요.')
      return
    }

    if (!imageValue.startsWith('/uploads/') && !imageValue.startsWith('data:image/')) {
      try {
        new URL(imageValue)
      } catch {
        setError('올바른 URL 형식의 이미지를 입력해주세요.')
        return
      }
    }

    const latitudeRaw = newPlace.latitude.trim()
    const longitudeRaw = newPlace.longitude.trim()
    if ((latitudeRaw.length > 0 && longitudeRaw.length === 0) || (latitudeRaw.length === 0 && longitudeRaw.length > 0)) {
      setError('좌표를 저장하려면 위도/경도를 모두 입력해주세요.')
      return
    }

    let latitude = null
    let longitude = null
    if (latitudeRaw.length > 0 && longitudeRaw.length > 0) {
      latitude = Number(latitudeRaw)
      longitude = Number(longitudeRaw)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setError('좌표는 숫자 형식으로 입력해주세요.')
        return
      }
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        setError('좌표 범위를 확인해주세요. (위도 -90~90, 경도 -180~180)')
        return
      }
    }

    try {
      await onCreatePlace({
        name: newPlace.name.trim(),
        region: newPlace.region.trim() || '기타',
        description: newPlace.description.trim() || '설명이 아직 등록되지 않았습니다.',
        keywords: newPlace.keywords
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
        image: imageValue,
        latitude,
        longitude,
        isVisible: true,
        isSponsored: newPlace.isSponsored === true,
      })

      setNewPlace({
        name: '',
        region: '',
        description: '',
        keywords: '',
        image: '',
        latitude: '',
        longitude: '',
        isSponsored: false,
      })
      setError('')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '추천장소 생성에 실패했습니다.')
    }
  }

  const normalizedPlaces = useMemo(() => normalizeRecommendedPlaces(places), [places])

  return (
    <AdminShell activeRoute={activeRoute} adminSession={adminSession} onAdminLogout={onAdminLogout}>
      <div className="admin-page-head">
        <p className="label">Places Management</p>
        <h2>추천장소 관리</h2>
      </div>

      <form className="admin-kakao-search-form" onSubmit={handleSearchKakaoPlaces}>
        <input
          type="text"
          value={kakaoSearchKeyword}
          onChange={(event) => setKakaoSearchKeyword(event.target.value)}
          placeholder="카카오맵에서 장소 검색 (예: 성수 카페)"
        />
        <button type="submit" className="trip-action-btn ghost" disabled={kakaoSearching}>
          {kakaoSearching ? '검색 중...' : '카카오맵 검색'}
        </button>
      </form>
      {kakaoSearchError && <p className="auth-notice error">{kakaoSearchError}</p>}
      {kakaoSearchResults.length > 0 && (
        <ul className="admin-kakao-search-results">
          {kakaoSearchResults.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                className={`admin-kakao-search-item ${selectedKakaoPlaceId === place.id ? 'is-active' : ''}`}
                onClick={() => handleSelectKakaoPlace(place)}
              >
                <strong>{place.name}</strong>
                <span>{place.roadAddress || place.address || '주소 정보 없음'}</span>
                {(place.category || place.phone) && <small>{[place.category, place.phone].filter(Boolean).join(' · ')}</small>}
              </button>
              {place.placeUrl && (
                <a href={place.placeUrl} target="_blank" rel="noreferrer" className="admin-kakao-search-link">
                  카카오맵에서 보기
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      <form className="admin-place-form" onSubmit={handleCreatePlace}>
        <input
          type="text"
          value={newPlace.name}
          onChange={(event) => setNewPlace((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="장소 이름"
        />
        <input
          type="text"
          value={newPlace.region}
          onChange={(event) => setNewPlace((prev) => ({ ...prev, region: event.target.value }))}
          placeholder="지역"
        />
        <input
          type="text"
          value={newPlace.keywords}
          onChange={(event) => setNewPlace((prev) => ({ ...prev, keywords: event.target.value }))}
          placeholder="키워드 (쉼표로 구분)"
        />
        <input
          type="url"
          value={newPlace.image}
          onChange={(event) => setNewPlace((prev) => ({ ...prev, image: event.target.value }))}
          placeholder="대표 이미지 URL"
        />
        <input
          type="number"
          step="any"
          value={newPlace.latitude}
          onChange={(event) => setNewPlace((prev) => ({ ...prev, latitude: event.target.value }))}
          placeholder="위도 (예: 37.5665)"
        />
        <input
          type="number"
          step="any"
          value={newPlace.longitude}
          onChange={(event) => setNewPlace((prev) => ({ ...prev, longitude: event.target.value }))}
          placeholder="경도 (예: 126.9780)"
        />
        <label className="admin-place-upload-field">
          <span>{imageUploading ? '이미지 업로드 중...' : '이미지 파일 업로드'}</span>
          <input type="file" accept="image/*" onChange={handleUploadPlaceImage} disabled={imageUploading} />
        </label>
        <label className="admin-place-sponsor-toggle">
          <input
            type="checkbox"
            checked={newPlace.isSponsored}
            onChange={(event) => setNewPlace((prev) => ({ ...prev, isSponsored: event.target.checked }))}
          />
          <span>제휴 장소로 등록</span>
        </label>
        {newPlace.image.trim() && (
          <div className="admin-place-upload-preview">
            <img src={newPlace.image} alt="업로드 미리보기" />
          </div>
        )}
        <textarea
          value={newPlace.description}
          onChange={(event) => setNewPlace((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="장소 설명"
          rows={2}
        />
        <button type="submit" className="trip-action-btn">
          장소 추가
        </button>
      </form>
      {imageUploadError && <p className="auth-notice error">{imageUploadError}</p>}
      {error && <p className="auth-notice error">{error}</p>}
      {isLoading && <p>추천장소 목록을 불러오는 중입니다...</p>}
      {loadError && <p>추천장소 로딩 오류: {loadError}</p>}

      <div className="admin-place-list">
        {normalizedPlaces.map((place) => (
          <article key={place.id} className="admin-place-card">
            <img src={place.image} alt={place.name} />
            <div className="admin-place-main">
              <div className="place-title-row">
                <strong>{place.name}</strong>
                {place.isSponsored && <SponsoredBadge />}
              </div>
              <p>{place.description}</p>
              <span>{place.region}</span>
              <div className="keyword-chips">
                {place.keywords.map((keyword) => (
                  <small key={`${place.id}-${keyword}`}>#{keyword}</small>
                ))}
              </div>
              <div className="admin-place-actions">
                <button type="button" className="trip-action-btn ghost" onClick={() => onTogglePlaceVisibility(place.id)}>
                  {place.isVisible ? '노출 중지' : '다시 노출'}
                </button>
                <button type="button" className="trip-action-btn ghost" onClick={() => onTogglePlaceSponsored(place.id)}>
                  {place.isSponsored ? '제휴 해제' : '제휴 설정'}
                </button>
                <button
                  type="button"
                  className="admin-danger-btn"
                  onClick={() => {
                    if (window.confirm(`${place.name} 장소를 삭제할까요?`)) {
                      onDeletePlace(place.id)
                    }
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </AdminShell>
  )
}

function AdminPlaceReviewsManagementView({
  activeRoute,
  adminSession,
  onAdminLogout,
  reviews,
  onToggleReviewHidden,
  isLoading,
  loadError,
}) {
  return (
    <AdminShell activeRoute={activeRoute} adminSession={adminSession} onAdminLogout={onAdminLogout}>
      <div className="admin-page-head">
        <h2>리뷰 신고/모더레이션</h2>
        <p>신고 수를 기준으로 부적절한 후기를 숨기거나 다시 공개할 수 있습니다.</p>
      </div>
      {isLoading && <p>리뷰 모더레이션 목록을 불러오는 중입니다...</p>}
      {loadError && <p>리뷰 모더레이션 로딩 오류: {loadError}</p>}

      <div className="admin-place-list">
        {reviews.map((review) => (
          <article key={review.reviewId} className="admin-place-card">
            <div className="admin-place-main">
              <div className="place-title-row">
                <strong>{review.placeName}</strong>
                <small>{review.isHidden ? '숨김' : '노출 중'}</small>
              </div>
              <p>
                <strong>{review.author}</strong> · {review.rating}점
              </p>
              <p>{review.comment}</p>
              <span>신고 {Number(review.pendingReportCount) || 0}건</span>
              {review.hiddenReason && <small>숨김 사유: {review.hiddenReason}</small>}
              <div className="admin-place-actions">
                <button
                  type="button"
                  className="trip-action-btn ghost"
                  onClick={() => onToggleReviewHidden(review.reviewId, review.isHidden !== true)}
                >
                  {review.isHidden ? '다시 공개' : '숨김 처리'}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {reviews.length === 0 && !isLoading && !loadError && <p className="empty-state">모더레이션 대상 리뷰가 없습니다.</p>}
    </AdminShell>
  )
}

function App() {
  const [activeRoute, setActiveRoute] = useState(getRouteFromHash())
  const [trips, setTrips] = useState([])
  const [tripsLoading, setTripsLoading] = useState(false)
  const [tripsLoadError, setTripsLoadError] = useState('')
  const [recommendedPlaces, setRecommendedPlaces] = useState([])
  const [placesLoading, setPlacesLoading] = useState(false)
  const [placesLoadError, setPlacesLoadError] = useState('')
  const [placeReviews, setPlaceReviews] = useState({})
  const [adminUsers, setAdminUsers] = useState([])
  const [adminUsersLoading, setAdminUsersLoading] = useState(false)
  const [adminUsersLoadError, setAdminUsersLoadError] = useState('')
  const [viewingTripId, setViewingTripId] = useState(getTripIdFromHash())
  const [viewingInviteCode, setViewingInviteCode] = useState(getInviteCodeFromHash())
  const [viewingTripShareToken, setViewingTripShareToken] = useState(getTripShareTokenFromHash())
  const [viewingPlaceId, setViewingPlaceId] = useState(getPlaceIdFromHash())
  const [editingTripId, setEditingTripId] = useState(null)
  const [invitePreview, setInvitePreview] = useState(null)
  const [invitePreviewLoading, setInvitePreviewLoading] = useState(false)
  const [invitePreviewError, setInvitePreviewError] = useState('')
  const [tripSharePreview, setTripSharePreview] = useState(null)
  const [tripSharePreviewLoading, setTripSharePreviewLoading] = useState(false)
  const [tripSharePreviewError, setTripSharePreviewError] = useState('')
  const [notifications, setNotifications] = useState([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationsLoadError, setNotificationsLoadError] = useState('')
  const [notificationsFilter, setNotificationsFilter] = useState('ALL')
  const [notificationsHasNext, setNotificationsHasNext] = useState(false)
  const [notificationsPage, setNotificationsPage] = useState(0)
  const [notificationsUnreadCount, setNotificationsUnreadCount] = useState(0)
  const [isNotificationPopoverOpen, setIsNotificationPopoverOpen] = useState(false)
  const [moderationReviews, setModerationReviews] = useState([])
  const [moderationReviewsLoading, setModerationReviewsLoading] = useState(false)
  const [moderationReviewsError, setModerationReviewsError] = useState('')
  const notificationPopoverRef = useRef(null)
  const refreshSessionPromiseRef = useRef(null)
  const [userSession, setUserSession] = useState(() => {
    try {
      const raw = window.localStorage.getItem(USER_SESSION_KEY)
      if (!raw) {
        return null
      }
      return normalizeUserSession(JSON.parse(raw))
    } catch {
      return null
    }
  })
  const [authBootstrapStatus, setAuthBootstrapStatus] = useState(() =>
    normalizeUserSession(userSession) ? 'pending' : 'ready',
  )
  const [authBootstrapRetryNonce, setAuthBootstrapRetryNonce] = useState(0)

  useEffect(() => {
    const handleHashChange = () => {
      const nextRoute = getRouteFromHash()
      setActiveRoute(nextRoute)
      setViewingTripId(getTripIdFromHash())
      setViewingInviteCode(getInviteCodeFromHash())
      setViewingTripShareToken(getTripShareTokenFromHash())
      setViewingPlaceId(getPlaceIdFromHash())
    }
    window.addEventListener('hashchange', handleHashChange)

    if (!window.location.hash) {
      setRouteHash('home')
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  useEffect(() => {
    if (userSession) {
      window.localStorage.setItem(USER_SESSION_KEY, JSON.stringify(userSession))
      return
    }
    window.localStorage.removeItem(USER_SESSION_KEY)
  }, [userSession])

  useEffect(() => {
    let isActive = true
    let retryTimerId = null

    const finishBootstrap = () => {
      if (!isActive) {
        return
      }
      setAuthBootstrapStatus('ready')
    }

    const clearSessionAndFinish = () => {
      if (!isActive) {
        return
      }
      setUserSession(null)
      setAuthBootstrapStatus('ready')
    }

    const scheduleBootstrapRetry = () => {
      if (!isActive) {
        return
      }
      setAuthBootstrapStatus('pending')
      retryTimerId = window.setTimeout(() => {
        if (!isActive) {
          return
        }
        setAuthBootstrapRetryNonce((prev) => prev + 1)
      }, 3_000)
    }

    const verifyOrRefreshSession = async () => {
      const currentSession = normalizeUserSession(userSession)
      if (!currentSession) {
        clearSessionAndFinish()
        return
      }

      setAuthBootstrapStatus('pending')

      try {
        const now = Date.now()
        const accessExpiresAt = toTimeMillis(currentSession.accessTokenExpiresAt)
        const refreshExpiresAt = toTimeMillis(currentSession.refreshTokenExpiresAt)

        if (!refreshExpiresAt || refreshExpiresAt <= now) {
          clearSessionAndFinish()
          return
        }

        if (!accessExpiresAt || accessExpiresAt <= now) {
          try {
            const refreshedSession = await handleRefreshSession(currentSession.refreshToken)
            if (!isActive) {
              return
            }
            if (!refreshedSession) {
              clearSessionAndFinish()
              return
            }
            finishBootstrap()
            return
          } catch (refreshError) {
            if (!isActive) {
              return
            }
            if (isAuthFailureError(refreshError)) {
              clearSessionAndFinish()
              return
            }
            if (isRecoverableBootstrapError(refreshError)) {
              scheduleBootstrapRetry()
              return
            }
            clearSessionAndFinish()
            return
          }
        }

        try {
          const meResponse = await requestJson('/api/v1/auth/me', {
            headers: {
              Authorization: `Bearer ${currentSession.accessToken}`,
            },
          })
          if (!isActive) {
            return
          }
          const nextUser = meResponse?.user
          if (nextUser && typeof nextUser.email === 'string') {
            const nextRole = String(nextUser.role ?? '').trim().toUpperCase()
            const currentRole = String(currentSession.user?.role ?? '').trim().toUpperCase()
            const nextName = String(nextUser.name ?? '').trim()
            const currentName = String(currentSession.user?.name ?? '').trim()
            if (nextRole !== currentRole || (nextName.length > 0 && nextName !== currentName)) {
              setUserSession({
                ...currentSession,
                user: {
                  ...currentSession.user,
                  ...nextUser,
                },
              })
            }
          }
          finishBootstrap()
        } catch (meError) {
          if (!isActive) {
            return
          }
          if (isAuthFailureError(meError)) {
            try {
              const refreshedSession = await handleRefreshSession(currentSession.refreshToken)
              if (!isActive) {
                return
              }
              if (!refreshedSession) {
                clearSessionAndFinish()
                return
              }
              finishBootstrap()
              return
            } catch (refreshError) {
              if (!isActive) {
                return
              }
              if (isAuthFailureError(refreshError)) {
                clearSessionAndFinish()
                return
              }
              if (isRecoverableBootstrapError(refreshError)) {
                scheduleBootstrapRetry()
                return
              }
              clearSessionAndFinish()
              return
            }
          }

          if (isRecoverableBootstrapError(meError)) {
            scheduleBootstrapRetry()
            return
          }

          clearSessionAndFinish()
        }
      } catch {
        clearSessionAndFinish()
      }
    }

    verifyOrRefreshSession()
    return () => {
      isActive = false
      if (retryTimerId) {
        window.clearTimeout(retryTimerId)
      }
    }
    // Session validation deliberately keys off the full stored session shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSession, authBootstrapRetryNonce])

  useEffect(() => {
    if (authBootstrapStatus !== 'ready') {
      return undefined
    }

    const currentSession = normalizeUserSession(userSession)
    if (!currentSession) {
      return undefined
    }

    const now = Date.now()
    const accessExpiresAt = toTimeMillis(currentSession.accessTokenExpiresAt)
    if (!accessExpiresAt) {
      return undefined
    }

    const refreshDelay = Math.max(1_000, accessExpiresAt - now - 60_000)
    const timerId = window.setTimeout(async () => {
      try {
        await handleRefreshSession(currentSession.refreshToken)
      } catch (refreshError) {
        if (isAuthFailureError(refreshError)) {
          setUserSession(null)
          setAuthBootstrapStatus('ready')
          return
        }

        if (isRecoverableBootstrapError(refreshError)) {
          setAuthBootstrapStatus('pending')
          setAuthBootstrapRetryNonce((prev) => prev + 1)
          return
        }

        setUserSession(null)
        setAuthBootstrapStatus('ready')
      }
    }, refreshDelay)

    return () => {
      window.clearTimeout(timerId)
    }
    // Refresh timer intentionally tracks token timestamps only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authBootstrapStatus, userSession?.accessTokenExpiresAt, userSession?.refreshToken])

  useEffect(() => {
    const allInvites = trips.flatMap((trip) => trip.invitedPeople ?? [])
    setAdminUsers((prev) => {
      const next = ensureUsersFromInvites(prev, allInvites)
      if (next.length === prev.length) {
        return prev
      }
      return next
    })
  }, [trips])

  useEffect(() => {
    const normalizedPlaces = normalizeRecommendedPlaces(recommendedPlaces)
    setPlaceReviews((prev) => {
      const next = {}
      normalizedPlaces.forEach((place) => {
        next[place.id] = Array.isArray(prev[place.id]) ? prev[place.id] : []
      })
      return next
    })
  }, [recommendedPlaces])

  useEffect(() => {
    if (activeRoute !== 'place-view' || !viewingPlaceId) {
      return
    }
    let isActive = true
    fetchPlaceReviews(viewingPlaceId)
      .then((reviews) => {
        if (!isActive) {
          return
        }
        setPlaceReviews((prev) => ({
          ...prev,
          [viewingPlaceId]: Array.isArray(reviews) ? reviews : [],
        }))
      })
      .catch(() => {
        // Keep existing cached reviews on detail fetch failure.
      })
    return () => {
      isActive = false
    }
  }, [activeRoute, viewingPlaceId])

  const current = ROUTES[activeRoute] ?? ROUTES.home
  const normalizedSession = useMemo(() => normalizeUserSession(userSession), [userSession])
  const isAuthBootstrapReady = authBootstrapStatus === 'ready'
  const isUserAuthenticated = !!normalizedSession
  const isAdminAuthenticated = String(normalizedSession?.user?.role ?? '')
    .trim()
    .toUpperCase() === 'ADMIN'
  const adminSession = useMemo(
    () =>
      isAdminAuthenticated
        ? {
            name: String(normalizedSession?.user?.name ?? '').trim() || '관리자',
            email: String(normalizedSession?.user?.email ?? '').trim(),
          }
        : null,
    [isAdminAuthenticated, normalizedSession],
  )
  const isBackofficeRoute = ADMIN_ROUTE_KEYS.has(activeRoute)
  const shouldHoldProtectedRouteRender =
    !isAuthBootstrapReady && (USER_PROTECTED_ROUTE_KEYS.has(activeRoute) || isBackofficeRoute)

  useEffect(() => {
    if (!isAuthBootstrapReady) {
      return
    }
    if (!USER_PROTECTED_ROUTE_KEYS.has(activeRoute)) {
      return
    }
    if (!isUserAuthenticated) {
      setRouteHash('login')
    }
  }, [activeRoute, isAuthBootstrapReady, isUserAuthenticated])

  useEffect(() => {
    if (activeRoute !== 'trip-view') {
      return
    }
    if (viewingTripId) {
      setTripDetailHash(viewingTripId)
      return
    }
    setRouteHash('trips')
  }, [activeRoute, viewingTripId])

  useEffect(() => {
    if (activeRoute !== 'place-view') {
      return
    }
    if (!viewingPlaceId) {
      setRouteHash('places')
    }
  }, [activeRoute, viewingPlaceId])

  useEffect(() => {
    if (!isNotificationPopoverOpen) {
      return
    }

    const handleOutsidePointer = (event) => {
      const popoverRoot = notificationPopoverRef.current
      if (!popoverRoot || popoverRoot.contains(event.target)) {
        return
      }
      setIsNotificationPopoverOpen(false)
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsNotificationPopoverOpen(false)
      }
    }

    window.addEventListener('mousedown', handleOutsidePointer)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handleOutsidePointer)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isNotificationPopoverOpen])

  useEffect(() => {
    if (!isUserAuthenticated) {
      setIsNotificationPopoverOpen(false)
    }
  }, [isUserAuthenticated])

  const openTripViewPage = (tripId) => {
    setViewingTripId(tripId)
    setTripDetailHash(tripId)
  }
  const backToTripsPage = () => {
    setRouteHash('trips')
  }
  const openTripCreatePage = () => {
    setRouteHash('trip-create')
  }
  const openPlaceViewPage = (placeId) => {
    setPlaceViewHash(placeId)
  }
  const backToPlacesPage = () => {
    setRouteHash('places')
  }
  const openTripEditPage = (tripId) => {
    setEditingTripId(tripId)
    setRouteHash('trip-edit')
  }
  const createDefaultGroup = async (session) => {
    const groupName = `${String(session?.user?.name ?? 'Soonmile 사용자').trim() || 'Soonmile 사용자'} 기본 그룹`
    const response = await requestJson('/api/v1/groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(session),
      },
      body: JSON.stringify({
        name: groupName,
        description: 'Soonmile 앱 기본 그룹',
        consent: {
          type: DEFAULT_CONSENT_TYPE,
          agreedVersion: DEFAULT_CONSENT_VERSION,
        },
      }),
    })

    const groupId = String(response?.groupId ?? '').trim()
    if (!groupId) {
      throw new Error('그룹 생성 응답이 올바르지 않습니다.')
    }

    setStoredGroupId(session.user.email, groupId)
    return groupId
  }

  const fetchGroupMembers = async (groupId, session) => {
    const response = await requestJson(`/api/v1/groups/${groupId}/members`, {
      headers: buildAuthHeaders(session),
    })
    return normalizeTripMembers(Array.isArray(response?.items) ? response.items : [])
  }

  const fetchGroupInvites = async (groupId, session) => {
    const response = await requestJson(`/api/v1/groups/${groupId}/invites`, {
      headers: buildAuthHeaders(session),
    })
    return normalizeGroupInvites(Array.isArray(response?.items) ? response.items : [])
  }

  const fetchInvitePreview = async (inviteCode) => {
    const response = await requestJson(`/api/v1/invites/${encodeURIComponent(String(inviteCode ?? '').trim())}`)
    return response && typeof response === 'object' ? response : null
  }

  const fetchTripSharePreview = async (shareToken) => {
    const response = await requestJson(`/api/v1/trip-shares/${encodeURIComponent(String(shareToken ?? '').trim())}`)
    return response && typeof response === 'object' ? response : null
  }

  const fetchPlaceReviews = async (placeId) => {
    const response = await requestJson(`/api/v1/places/${encodeURIComponent(String(placeId ?? '').trim())}/reviews`)
    return normalizePlaceReviewList(Array.isArray(response?.items) ? response.items : [], placeId)
  }

  const reportPlaceReview = async (placeId, reviewId, reason, session) => {
    return requestJson(`/api/v1/places/${encodeURIComponent(String(placeId ?? '').trim())}/reviews/${encodeURIComponent(String(reviewId ?? '').trim())}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? buildAuthHeaders(session) : {}),
      },
      body: JSON.stringify({
        reporterName: session?.user?.name ?? '',
        reason: String(reason ?? '').trim(),
      }),
    })
  }

  const createPlaceReview = async (placeId, review, session) => {
    const response = await requestJson(`/api/v1/places/${encodeURIComponent(String(placeId ?? '').trim())}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? buildAuthHeaders(session) : {}),
      },
      body: JSON.stringify({
        author: String(review?.author ?? '').trim(),
        rating: normalizeReviewRating(review?.rating),
        comment: String(review?.comment ?? '').trim(),
      }),
    })
    return normalizePlaceReviewList([response], placeId)[0] ?? null
  }

  const fetchNotificationsFromServer = async (session, options = {}) => {
    const params = new URLSearchParams()
    const page = Number.isFinite(Number(options?.page)) ? Math.max(0, Number(options.page)) : 0
    const size = Number.isFinite(Number(options?.size)) ? Math.max(1, Number(options.size)) : 20
    const sort = String(options?.sort ?? 'desc').trim().toLowerCase() === 'asc' ? 'asc' : 'desc'
    const type = String(options?.type ?? '').trim()
    const isRead = options?.isRead
    params.set('page', String(page))
    params.set('size', String(size))
    params.set('sort', sort)
    if (type.length > 0) {
      params.set('type', type)
    }
    if (typeof isRead === 'boolean') {
      params.set('isRead', String(isRead))
    }

    const response = await requestJson(`/api/v1/notifications?${params.toString()}`, {
      headers: buildAuthHeaders(session),
    })
    return {
      items: Array.isArray(response?.items) ? response.items : [],
      page: Number(response?.page) || 0,
      size: Number(response?.size) || size,
      totalCount: Number(response?.totalCount) || 0,
      hasNext: response?.hasNext === true,
      unreadCount: Number(response?.unreadCount) || 0,
    }
  }

  const markNotificationAsRead = async (notificationId, session) => {
    return requestJson(`/api/v1/notifications/${encodeURIComponent(String(notificationId ?? '').trim())}/read`, {
      method: 'PATCH',
      headers: buildAuthHeaders(session),
    })
  }

  const markAllNotificationsAsRead = async (session) => {
    return requestJson('/api/v1/notifications/read-all', {
      method: 'POST',
      headers: buildAuthHeaders(session),
    })
  }

  const fetchTripShares = async (tripId, session) => {
    const response = await requestJson(`/api/v1/trips/${encodeURIComponent(String(tripId ?? '').trim())}/shares`, {
      headers: buildAuthHeaders(session),
    })
    return Array.isArray(response?.items) ? response.items : []
  }

  const revokeTripShareLink = async (tripId, shareId, session) => {
    return requestJson(`/api/v1/trips/${encodeURIComponent(String(tripId ?? '').trim())}/shares/${encodeURIComponent(String(shareId ?? '').trim())}`, {
      method: 'DELETE',
      headers: buildAuthHeaders(session),
    })
  }

  const fetchModerationReviews = async (session) => {
    const response = await requestJson('/api/v1/admin/places/reviews', {
      headers: buildAuthHeaders(session),
    })
    return Array.isArray(response?.items) ? response.items : []
  }

  const updateModerationReviewHidden = async (reviewId, isHidden, reason, session) => {
    return requestJson(`/api/v1/admin/places/reviews/${encodeURIComponent(String(reviewId ?? '').trim())}/hidden`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(session),
      },
      body: JSON.stringify({
        isHidden: isHidden === true,
        reason: String(reason ?? '').trim(),
      }),
    })
  }

  const createGroupInvite = async (groupId, invitedEmail, session) => {
    return requestJson(`/api/v1/groups/${groupId}/invites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(session),
      },
      body: JSON.stringify({
        invitedEmail,
        expiresInHours: 72,
      }),
    })
  }

  const createTripShareLink = async (tripId, session) => {
    const response = await requestJson(`/api/v1/trips/${encodeURIComponent(String(tripId ?? '').trim())}/shares`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(session),
      },
      body: JSON.stringify({
        expiresInHours: 168,
      }),
    })
    const shareToken = String(response?.shareToken ?? '').trim()
    const shareUrl = String(response?.shareUrl ?? '').trim()
    return {
      ...response,
      shareToken,
      shareUrl: resolveTripShareUrl(shareToken, shareUrl),
    }
  }

  const applyGroupStateToTrips = (groupId, groupMembers, groupInvites) => {
    const normalizedGroupId = String(groupId ?? '').trim()
    if (!normalizedGroupId) {
      return
    }

    setTrips((prev) =>
      prev.map((trip) => {
        if (String(trip.groupId ?? '').trim() !== normalizedGroupId) {
          return trip
        }
        const participation = buildGroupParticipation(
          groupMembers,
          groupInvites,
          normalizeUserSession(userSession)?.user?.email,
          trip.myGroupRole,
          trip.members,
        )
        return {
          ...trip,
          participants: participation.participants,
          invitedPeople: participation.invitedPeople,
          groupInvites: participation.groupInvites,
          members: participation.members,
          type: participation.type,
          myGroupRole: participation.myGroupRole,
          updatedAt: new Date().toISOString(),
        }
      }),
    )
  }

  const fetchTripPinsWithPhotos = async (tripId, session, options = {}) => {
    const fallbackPhotoUrls = Array.isArray(options?.fallbackPhotoUrls)
      ? options.fallbackPhotoUrls.filter((item) => typeof item === 'string' && item.length > 0)
      : []
    const photoPreviewByPhotoId = options?.photoPreviewByPhotoId && typeof options.photoPreviewByPhotoId === 'object'
      ? options.photoPreviewByPhotoId
      : {}

    const pinsResponse = await requestJson(`/api/v1/trips/${tripId}/pins?includeRoute=true`, {
      headers: buildAuthHeaders(session),
    })
    const pins = Array.isArray(pinsResponse?.pins) ? pinsResponse.pins : []

    return Promise.all(
      pins.map(async (pin, pinIndex) => {
        const pinId = String(pin?.pinId ?? '').trim()
        let photoItems = []

        if (pinId) {
          try {
            const pinPhotosResponse = await requestJson(`/api/v1/trips/${tripId}/pins/${pinId}/photos`, {
              headers: buildAuthHeaders(session),
            })
            const rawItems = Array.isArray(pinPhotosResponse?.items) ? pinPhotosResponse.items : []
            photoItems = rawItems
              .map((item, photoIndex) => {
                const photoId = String(item?.photoId ?? `${pinId}-photo-${photoIndex + 1}`)
                const thumbnailUrl = String(item?.thumbnailUrl ?? '').trim()
                const previewById = String(photoPreviewByPhotoId[photoId] ?? '').trim()
                const resolvedThumbnailUrl = resolveMediaUrl(thumbnailUrl)
                const shouldUseFallback = resolvedThumbnailUrl.length === 0 || resolvedThumbnailUrl.includes('cdn.soonmile.app')
                const fallbackUrl =
                  fallbackPhotoUrls.length > 0 ? fallbackPhotoUrls[(pinIndex + photoIndex) % fallbackPhotoUrls.length] : ''
                const url = shouldUseFallback ? previewById || fallbackUrl : resolvedThumbnailUrl

                return {
                  id: photoId,
                  url,
                  similarityKey: typeof item?.similarityKey === 'string' ? item.similarityKey : '',
                }
              })
              .filter((item) => item.url.length > 0)
          } catch {
            photoItems = []
          }
        }

        return {
          id: pinId || `pin-${pinIndex + 1}`,
          title: String(pin?.title ?? '').trim() || `핀 ${pinIndex + 1}`,
          lat: normalizeNumberValue(pin?.lat, 37.5665),
          lng: normalizeNumberValue(pin?.lng, 126.978),
          caption: String(pin?.caption ?? '').trim(),
          photos: photoItems,
        }
      }),
    )
  }

  const fetchTripUnresolvedPhotos = async (tripId, session, options = {}) => {
    const fallbackPhotoUrls = Array.isArray(options?.fallbackPhotoUrls)
      ? options.fallbackPhotoUrls.filter((item) => typeof item === 'string' && item.length > 0)
      : []
    const photoPreviewByPhotoId = options?.photoPreviewByPhotoId && typeof options.photoPreviewByPhotoId === 'object'
      ? options.photoPreviewByPhotoId
      : {}

    const unresolvedResponse = await requestJson(`/api/v1/trips/${tripId}/photos/unresolved`, {
      headers: buildAuthHeaders(session),
    })
    const unresolvedItems = Array.isArray(unresolvedResponse?.items) ? unresolvedResponse.items : []

    return unresolvedItems
      .map((item, index) => {
        const photoId = String(item?.photoId ?? `unresolved-${index + 1}`).trim()
        const thumbnailUrl = String(item?.thumbnailUrl ?? '').trim()
        const previewById = String(photoPreviewByPhotoId[photoId] ?? '').trim()
        const resolvedThumbnailUrl = resolveMediaUrl(thumbnailUrl)
        const shouldUseFallback = resolvedThumbnailUrl.length === 0 || resolvedThumbnailUrl.includes('cdn.soonmile.app')
        const fallbackUrl = fallbackPhotoUrls.length > 0 ? fallbackPhotoUrls[index % fallbackPhotoUrls.length] : ''
        const url = shouldUseFallback ? previewById || fallbackUrl : resolvedThumbnailUrl

        return {
          id: photoId,
          url,
          similarityKey: '',
        }
      })
      .filter((item) => item.url.length > 0)
  }

  const loadTripsFromServer = async (sessionCandidate) => {
    const session = normalizeUserSession(sessionCandidate)
    if (!session) {
      setTrips([])
      setTripsLoading(false)
      setTripsLoadError('')
      return
    }

    setTripsLoading(true)
    setTripsLoadError('')

    try {
      const listResponse = await requestJson('/api/v1/trips', {
        headers: buildAuthHeaders(session),
      })
      const summaries = Array.isArray(listResponse?.items) ? listResponse.items : []

      const mappedTrips = await Promise.all(
        summaries.map(async (summary, index) => {
          const tripId = String(summary?.tripId ?? '').trim()
          if (!tripId) {
            return null
          }

          const groupId = String(summary?.groupId ?? '').trim()
          const name = String(summary?.name ?? '').trim() || `여행 ${index + 1}`
          const startDateIso = toIsoDate(summary?.startDate)
          const endDateIso = toIsoDate(summary?.endDate)
          const summaryMemberCount = Math.max(1, Number(summary?.memberCount) || 1)
          const updatedAt =
            String(summary?.updatedAt ?? '').trim() ||
            String(summary?.createdAt ?? '').trim() ||
            new Date().toISOString()
          let groupMembers = []
          try {
            groupMembers = await fetchGroupMembers(groupId, session)
          } catch {
            groupMembers = []
          }
          const myGroupRole = resolveMyGroupRole(groupMembers, session?.user?.email, summary?.myRole)
          let groupInvites = []
          if (myGroupRole === 'OWNER') {
            try {
              groupInvites = await fetchGroupInvites(groupId, session)
            } catch {
              groupInvites = []
            }
          }
          const participation = buildGroupParticipation(
            groupMembers,
            groupInvites,
            session?.user?.email,
            myGroupRole,
            summaryMemberCount,
          )
          const members = participation.members
          const tripType = participation.type
          const pinColor = normalizeTripPinColor(summary?.pinColor, getDefaultTripPinColor(tripType))

          let mappedPins = []
          try {
            mappedPins = await fetchTripPinsWithPhotos(tripId, session)
          } catch {
            mappedPins = []
          }
          let unresolvedPhotos = []
          try {
            unresolvedPhotos = await fetchTripUnresolvedPhotos(tripId, session)
          } catch {
            unresolvedPhotos = []
          }

          const pinPhotoCount = mappedPins.reduce((count, pin) => count + (Array.isArray(pin.photos) ? pin.photos.length : 0), 0)
          const unresolvedPhotoUrls = unresolvedPhotos.map((photo) => photo.url).filter((url) => typeof url === 'string' && url.length > 0)
          const photoCount = pinPhotoCount + unresolvedPhotoUrls.length
          const representativeCover =
            mappedPins.find((pin) => Array.isArray(pin.photos) && pin.photos.length > 0)?.photos?.[0]?.url || unresolvedPhotoUrls[0] || ''

          return {
            id: tripId,
            groupId,
            name,
            dateRange: buildDateRangeLabel(startDateIso, endDateIso),
            members,
            photos: photoCount,
            type: tripType,
            pinColor,
            updatedAt,
            cover: representativeCover || '',
            notes: '',
            photoPreviews: unresolvedPhotoUrls,
            invitedPeople: participation.invitedPeople,
            participants: participation.participants,
            groupInvites: participation.groupInvites,
            myGroupRole: participation.myGroupRole,
            pins: mappedPins,
            adminStatus: 'ACTIVE',
          }
        }),
      )

      const normalizedTrips = mappedTrips.filter((trip) => trip !== null)
      setTrips(normalizedTrips)
      if (viewingTripId && !normalizedTrips.some((trip) => trip.id === viewingTripId)) {
        setViewingTripId(null)
      }
      if (editingTripId && !normalizedTrips.some((trip) => trip.id === editingTripId)) {
        setEditingTripId(null)
      }
    } catch (loadError) {
      setTrips([])
      setTripsLoadError(loadError instanceof Error ? loadError.message : '서버에서 여행 목록을 불러오지 못했습니다.')
    } finally {
      setTripsLoading(false)
    }
  }

  const loadAdminUsersFromServer = async (sessionCandidate) => {
    const session = normalizeUserSession(sessionCandidate)
    if (!session) {
      setAdminUsers([])
      setAdminUsersLoading(false)
      setAdminUsersLoadError('')
      return
    }

    setAdminUsersLoading(true)
    setAdminUsersLoadError('')

    try {
      const response = await requestJson('/api/v1/admin/users', {
        headers: buildAuthHeaders(session),
      })
      const users = Array.isArray(response?.items) ? response.items : []
      setAdminUsers(normalizeAdminUsers(users))
    } catch (loadError) {
      setAdminUsers([])
      setAdminUsersLoadError(loadError instanceof Error ? loadError.message : '서버에서 사용자 목록을 불러오지 못했습니다.')
    } finally {
      setAdminUsersLoading(false)
    }
  }

  const loadRecommendedPlacesFromServer = async (sessionCandidate, preferAdminList = false) => {
    const session = normalizeUserSession(sessionCandidate)
    const shouldUseAdminEndpoint = preferAdminList && !!session
    const endpoint = shouldUseAdminEndpoint ? '/api/v1/admin/places' : '/api/v1/places'

    setPlacesLoading(true)
    setPlacesLoadError('')

    try {
      const response = await requestJson(endpoint, {
        headers: shouldUseAdminEndpoint ? buildAuthHeaders(session) : {},
      })
      const places = Array.isArray(response?.items) ? response.items : []
      const normalized = normalizeRecommendedPlaces(places)
      setRecommendedPlaces(normalized)
    } catch (loadError) {
      if (shouldUseAdminEndpoint) {
        try {
          const fallbackResponse = await requestJson('/api/v1/places')
          const fallbackPlaces = Array.isArray(fallbackResponse?.items) ? fallbackResponse.items : []
          const fallbackNormalized = normalizeRecommendedPlaces(fallbackPlaces)
          setRecommendedPlaces(fallbackNormalized)
          setPlacesLoadError('')
          return
        } catch {
          // Fall through to common error handling.
        }
      }
      setRecommendedPlaces([])
      setPlacesLoadError(loadError instanceof Error ? loadError.message : '서버에서 추천장소 목록을 불러오지 못했습니다.')
    } finally {
      setPlacesLoading(false)
    }
  }

  useEffect(() => {
    loadRecommendedPlacesFromServer(normalizedSession, isAdminAuthenticated && isAuthBootstrapReady)
  }, [normalizedSession, isAdminAuthenticated, isAuthBootstrapReady])

  useEffect(() => {
    if (!isAuthBootstrapReady) {
      return
    }
    if (!isAdminAuthenticated) {
      setAdminUsers([])
      setAdminUsersLoading(false)
      setAdminUsersLoadError('')
      setModerationReviews([])
      setModerationReviewsLoading(false)
      setModerationReviewsError('')
      return
    }
    loadAdminUsersFromServer(normalizedSession)
  }, [normalizedSession, isAdminAuthenticated, isAuthBootstrapReady])

  useEffect(() => {
    if (!isAuthBootstrapReady) {
      return
    }
    if (!isAdminAuthenticated) {
      return
    }
    if (activeRoute !== 'admin-place-reviews') {
      return
    }
    let isActive = true
    setModerationReviewsLoading(true)
    setModerationReviewsError('')
    fetchModerationReviews(normalizedSession)
      .then((items) => {
        if (!isActive) {
          return
        }
        setModerationReviews(Array.isArray(items) ? items : [])
      })
      .catch((error) => {
        if (!isActive) {
          return
        }
        setModerationReviews([])
        setModerationReviewsError(error instanceof Error ? error.message : '리뷰 모더레이션 목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (isActive) {
          setModerationReviewsLoading(false)
        }
      })
    return () => {
      isActive = false
    }
  }, [activeRoute, isAdminAuthenticated, isAuthBootstrapReady, normalizedSession])

  useEffect(() => {
    if (!isAuthBootstrapReady) {
      return
    }
    const session = normalizeUserSession(userSession)
    if (!session) {
      setTrips([])
      setTripsLoading(false)
      setTripsLoadError('')
      return
    }

    loadTripsFromServer(session)
    // Trips are intentionally reloaded only when auth identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authBootstrapStatus, userSession?.accessToken, userSession?.user?.email])

  useEffect(() => {
    if (activeRoute !== 'invite') {
      setInvitePreview(null)
      setInvitePreviewLoading(false)
      setInvitePreviewError('')
      return
    }

    if (!viewingInviteCode) {
      setInvitePreview(null)
      setInvitePreviewLoading(false)
      setInvitePreviewError('초대 코드가 올바르지 않습니다.')
      return
    }

    let isActive = true
    setInvitePreviewLoading(true)
    setInvitePreviewError('')

    fetchInvitePreview(viewingInviteCode)
      .then((preview) => {
        if (!isActive) {
          return
        }
        setInvitePreview(preview)
      })
      .catch((error) => {
        if (!isActive) {
          return
        }
        setInvitePreview(null)
        setInvitePreviewError(error instanceof Error ? error.message : '초대 정보를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (isActive) {
          setInvitePreviewLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [activeRoute, viewingInviteCode])

  useEffect(() => {
    if (activeRoute !== 'trip-share') {
      setTripSharePreview(null)
      setTripSharePreviewLoading(false)
      setTripSharePreviewError('')
      return
    }

    if (!viewingTripShareToken) {
      setTripSharePreview(null)
      setTripSharePreviewLoading(false)
      setTripSharePreviewError('공유 토큰이 올바르지 않습니다.')
      return
    }

    let isActive = true
    setTripSharePreviewLoading(true)
    setTripSharePreviewError('')

    fetchTripSharePreview(viewingTripShareToken)
      .then((preview) => {
        if (!isActive) {
          return
        }
        setTripSharePreview(preview)
      })
      .catch((error) => {
        if (!isActive) {
          return
        }
        setTripSharePreview(null)
        setTripSharePreviewError(error instanceof Error ? error.message : '공유 여행 정보를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (isActive) {
          setTripSharePreviewLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [activeRoute, viewingTripShareToken])

  useEffect(() => {
    if (!isAuthBootstrapReady) {
      return
    }
    if (!normalizedSession) {
      setNotifications([])
      setNotificationsLoading(false)
      setNotificationsLoadError('')
      setNotificationsHasNext(false)
      setNotificationsPage(0)
      setNotificationsUnreadCount(0)
      return
    }

    const query = {
      type: notificationsFilter === 'PLACE_REVIEW_CREATED' || notificationsFilter === 'PLACE_REVIEW_REPORTED' || notificationsFilter === 'TRIP_SHARE_CREATED'
        ? notificationsFilter
        : '',
      isRead: notificationsFilter === 'UNREAD' ? false : undefined,
      page: 0,
      size: 20,
      sort: 'desc',
    }

    let isActive = true
    setNotificationsLoading(true)
    setNotificationsLoadError('')
    fetchNotificationsFromServer(normalizedSession, query)
      .then((result) => {
        if (!isActive) {
          return
        }
        setNotifications(result.items)
        setNotificationsHasNext(result.hasNext)
        setNotificationsPage(result.page)
        setNotificationsUnreadCount(result.unreadCount)
      })
      .catch((error) => {
        if (!isActive) {
          return
        }
        setNotifications([])
        setNotificationsHasNext(false)
        setNotificationsPage(0)
        setNotificationsUnreadCount(0)
        setNotificationsLoadError(error instanceof Error ? error.message : '알림을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (isActive) {
          setNotificationsLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [normalizedSession, notificationsFilter, trips.length, recommendedPlaces.length, isAuthBootstrapReady])

  useEffect(() => {
    if (!isAuthBootstrapReady) {
      return
    }
    if (!normalizedSession) {
      return
    }
    const controller = new AbortController()
    let isActive = true

    const connectStream = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/v1/notifications/stream'), {
          method: 'GET',
          headers: buildAuthHeaders(normalizedSession),
          signal: controller.signal,
        })
        if (!response.ok || !response.body) {
          return
        }
        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''

        while (isActive) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }
          buffer += decoder.decode(value, { stream: true })
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop() ?? ''
          blocks.forEach((block) => {
            const dataLine = block
              .split('\n')
              .map((line) => line.trim())
              .find((line) => line.startsWith('data:'))
            if (!dataLine) {
              return
            }
            const payloadRaw = dataLine.slice('data:'.length).trim()
            if (!payloadRaw || payloadRaw === 'ok') {
              return
            }
            try {
              const payload = JSON.parse(payloadRaw)
              if (!payload || typeof payload !== 'object') {
                return
              }
              const notificationId = String(payload.notificationId ?? '').trim()
              if (!notificationId) {
                return
              }
              setNotifications((prev) => {
                if (prev.some((item) => String(item?.notificationId ?? '').trim() === notificationId)) {
                  return prev
                }
                return [payload, ...prev]
              })
              setNotificationsUnreadCount((prev) => prev + (payload.isRead ? 0 : 1))
            } catch {
              // Ignore malformed SSE payload chunk.
            }
          })
        }
      } catch {
        // Realtime stream fallback: keep pull-based notifications only.
      }
    }

    connectStream()
    return () => {
      isActive = false
      controller.abort()
    }
  }, [normalizedSession, isAuthBootstrapReady])

  const handleCreateTrip = async (createdTrip) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
    }

    const normalizedInvites = normalizeInvitedPeople(createdTrip.invitedPeople)
    const { startDate, endDate } = parseDateRange(createdTrip.dateRange)
    const startDateIso = toIsoDate(startDate)
    const endDateIso = toIsoDate(endDate)
    const fallbackPhotoUrls = Array.isArray(createdTrip.photoPreviews)
      ? createdTrip.photoPreviews.filter((item) => typeof item === 'string' && item.length > 0)
      : []
    const uploadedPhotoPreviews = Array.isArray(createdTrip.uploadedPhotoPreviews)
      ? createdTrip.uploadedPhotoPreviews.filter((item) => typeof item === 'string')
      : []
    const uploadedFiles = Array.isArray(createdTrip.photoFiles) ? createdTrip.photoFiles.filter((item) => item instanceof File) : []
    const uploadedPreviewByFile = buildUploadedPreviewByFileMap(uploadedFiles, uploadedPhotoPreviews)
    const photoPreviewByPhotoId = {}

    const storedGroupId = getStoredGroupId(session.user.email)
    let targetGroupId = storedGroupId || (await createDefaultGroup(session))

    let createTripResponse
    try {
      createTripResponse = await requestJson(`/api/v1/groups/${targetGroupId}/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(session),
        },
        body: JSON.stringify({
          name: createdTrip.name,
          startDate: startDateIso || null,
          endDate: endDateIso || null,
          pinColor: normalizeTripPinColor(createdTrip.pinColor, getDefaultTripPinColor(createdTrip.type)),
        }),
      })
    } catch (requestError) {
      if (!storedGroupId) {
        throw requestError
      }
      setStoredGroupId(session.user.email, '')
      targetGroupId = await createDefaultGroup(session)
      createTripResponse = await requestJson(`/api/v1/groups/${targetGroupId}/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(session),
        },
        body: JSON.stringify({
          name: createdTrip.name,
          startDate: startDateIso || null,
          endDate: endDateIso || null,
          pinColor: normalizeTripPinColor(createdTrip.pinColor, getDefaultTripPinColor(createdTrip.type)),
        }),
      })
    }

    const createdTripId = String(createTripResponse?.tripId ?? '').trim()
    if (!createdTripId) {
      throw new Error('여행 생성 응답이 올바르지 않습니다.')
    }
    const createdPinColor = normalizeTripPinColor(
      createTripResponse?.pinColor,
      normalizeTripPinColor(createdTrip.pinColor, getDefaultTripPinColor(createdTrip.type)),
    )

    if (uploadedFiles.length > 0) {
      const uploadBatches = splitFilesIntoUploadBatches(uploadedFiles)
      for (const batch of uploadBatches) {
        const formData = new FormData()
        batch.forEach((file) => {
          formData.append('files', file, file.name)
        })
        try {
          const uploadResponse = await requestJson(`/api/v1/trips/${createdTripId}/photos`, {
            method: 'POST',
            headers: {
              ...buildAuthHeaders(session),
            },
            body: formData,
          })
          const uploadedPhotoIds = Array.isArray(uploadResponse?.photoIds) ? uploadResponse.photoIds : []
          uploadedPhotoIds.forEach((photoId, index) => {
            const file = batch[index]
            const preview = uploadedPreviewByFile.get(file) ?? ''
            const normalizedPhotoId = String(photoId ?? '').trim()
            if (normalizedPhotoId.length > 0 && preview.length > 0) {
              photoPreviewByPhotoId[normalizedPhotoId] = preview
            }
          })
        } catch (uploadError) {
          const detail = uploadError instanceof Error ? uploadError.message : '네트워크 오류'
          throw new Error(`사진 업로드에 실패했습니다. 파일 수를 줄여 다시 시도해주세요. (${detail})`)
        }
      }
    }

    if (normalizedInvites.length > 0) {
      await Promise.allSettled(normalizedInvites.map((person) => createGroupInvite(targetGroupId, person.email, session)))
    }

    let groupMembers = []
    try {
      groupMembers = await fetchGroupMembers(targetGroupId, session)
    } catch {
      groupMembers = buildLocalTripParticipants([], session?.user)
    }
    let groupInvites = []
    try {
      groupInvites = await fetchGroupInvites(targetGroupId, session)
    } catch {
      groupInvites = normalizedInvites
    }

    let participation = buildGroupParticipation(
      groupMembers,
      groupInvites,
      session?.user?.email,
      'OWNER',
      Math.max(Number(createdTrip.members) || 1, normalizedInvites.length + 1),
    )
    try {
      groupMembers = await fetchGroupMembers(targetGroupId, session)
      groupInvites = await fetchGroupInvites(targetGroupId, session)
      participation = buildGroupParticipation(
        groupMembers,
        groupInvites,
        session?.user?.email,
        'OWNER',
        participation.members,
      )
    } catch {
      // Ignore sync failure and keep local group participation fallback.
    }

    const mappedPins = await fetchTripPinsWithPhotos(createdTripId, session, {
      fallbackPhotoUrls,
      photoPreviewByPhotoId,
    })
    const unresolvedPhotos = await fetchTripUnresolvedPhotos(createdTripId, session, {
      fallbackPhotoUrls,
      photoPreviewByPhotoId,
    })
    const unresolvedPhotoUrls = unresolvedPhotos.map((photo) => photo.url).filter((url) => typeof url === 'string' && url.length > 0)
    const mappedPhotoCount = mappedPins.reduce((count, pin) => count + (Array.isArray(pin.photos) ? pin.photos.length : 0), 0) + unresolvedPhotoUrls.length
    const representativeCover =
      mappedPins.find((pin) => Array.isArray(pin.photos) && pin.photos.length > 0)?.photos?.[0]?.url || unresolvedPhotoUrls[0] || ''
    const normalizedTrip = {
      ...createdTrip,
      id: createdTripId,
      groupId: targetGroupId,
      dateRange: buildDateRangeLabel(startDateIso, endDateIso) || createdTrip.dateRange,
      invitedPeople: participation.invitedPeople,
      participants: participation.participants,
      members: participation.members,
      photos: Math.max(mappedPhotoCount, uploadedFiles.length, Number(createdTrip.photos) || 0),
      cover: representativeCover || createdTrip.cover,
      type: participation.type,
      pinColor: createdPinColor,
      photoPreviews: unresolvedPhotoUrls,
      pins: mappedPins,
      groupInvites: participation.groupInvites,
      myGroupRole: participation.myGroupRole,
      adminStatus: createdTrip.adminStatus ?? 'ACTIVE',
      updatedAt: new Date().toISOString(),
    }

    setTrips((prev) => [normalizedTrip, ...prev])
    setAdminUsers((prev) => ensureUsersFromInvites(prev, participation.invitedPeople))
    setViewingTripId(normalizedTrip.id)
      setTripDetailHash(normalizedTrip.id)
  }
  const handleUpdateTrip = async (updatedTrip) => {
    const normalizedInvites = normalizeInvitedPeople(updatedTrip.invitedPeople)
    const normalizedExistingGroupInvites = normalizeGroupInvites(updatedTrip.groupInvites)
    const uploadedPhotoPreviews = Array.isArray(updatedTrip.uploadedPhotoPreviews)
      ? updatedTrip.uploadedPhotoPreviews.filter((item) => typeof item === 'string')
      : []
    const uploadedFiles = Array.isArray(updatedTrip.photoFiles) ? updatedTrip.photoFiles.filter((item) => item instanceof File) : []
    const uploadedPreviewByFile = buildUploadedPreviewByFileMap(uploadedFiles, uploadedPhotoPreviews)
    const session = normalizeUserSession(userSession)
    const fallbackParticipants = normalizeTripMembers(updatedTrip.participants)
    const localParticipants = fallbackParticipants.length > 0 ? fallbackParticipants : buildLocalTripParticipants(normalizedInvites, session?.user)
    const localParticipation = {
      ...buildGroupParticipation(
        localParticipants,
        normalizedExistingGroupInvites.length > 0 ? normalizedExistingGroupInvites : normalizedInvites,
        session?.user?.email,
        updatedTrip.myGroupRole,
        updatedTrip.members,
      ),
      participants: localParticipants.length > 0 ? localParticipants : [],
    }
    const normalizedTrip = {
      ...updatedTrip,
      invitedPeople: localParticipation.invitedPeople,
      participants: localParticipation.participants,
      members: localParticipation.members,
      type: localParticipation.type,
      adminStatus: updatedTrip.adminStatus ?? 'ACTIVE',
    }

    const nextTrip = { ...normalizedTrip }
    const isServerTripId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(nextTrip.id ?? ''))
    const { startDate, endDate } = parseDateRange(nextTrip.dateRange)
    const startDateIso = toIsoDate(startDate)
    const endDateIso = toIsoDate(endDate)
    const photoPreviewByPhotoId = buildPhotoPreviewByIdFromPins(nextTrip.pins)

    if (isServerTripId) {
      if (!session) {
        throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
      }

      const updateResponse = await requestJson(`/api/v1/trips/${nextTrip.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(session),
        },
        body: JSON.stringify({
          name: nextTrip.name,
          startDate: startDateIso || null,
          endDate: endDateIso || null,
          pinColor: normalizeTripPinColor(nextTrip.pinColor, getDefaultTripPinColor(nextTrip.type)),
        }),
      })

      const updatedName = String(updateResponse?.name ?? '').trim()
      const updatedStartDate = toIsoDate(updateResponse?.startDate)
      const updatedEndDate = toIsoDate(updateResponse?.endDate)
      const updatedPinColor = normalizeTripPinColor(updateResponse?.pinColor, nextTrip.pinColor)
      if (updatedName.length > 0) {
        nextTrip.name = updatedName
      }
      if (updatedStartDate || updatedEndDate) {
        nextTrip.dateRange = buildDateRangeLabel(updatedStartDate, updatedEndDate) || nextTrip.dateRange
      }
      nextTrip.pinColor = updatedPinColor
    }

    if (uploadedFiles.length > 0 && isServerTripId) {
      const uploadBatches = splitFilesIntoUploadBatches(uploadedFiles)
      for (const batch of uploadBatches) {
        const formData = new FormData()
        batch.forEach((file) => {
          formData.append('files', file, file.name)
        })
        try {
          const uploadResponse = await requestJson(`/api/v1/trips/${nextTrip.id}/photos`, {
            method: 'POST',
            headers: {
              ...buildAuthHeaders(session),
            },
            body: formData,
          })
          const uploadedPhotoIds = Array.isArray(uploadResponse?.photoIds) ? uploadResponse.photoIds : []
          uploadedPhotoIds.forEach((photoId, index) => {
            const file = batch[index]
            const preview = uploadedPreviewByFile.get(file) ?? ''
            const normalizedPhotoId = String(photoId ?? '').trim()
            if (normalizedPhotoId.length > 0 && preview.length > 0) {
              photoPreviewByPhotoId[normalizedPhotoId] = preview
            }
          })
        } catch (uploadError) {
          const detail = uploadError instanceof Error ? uploadError.message : '네트워크 오류'
          throw new Error(`수정한 사진 업로드에 실패했습니다. 파일 수를 줄여 다시 시도해주세요. (${detail})`)
        }
      }

      const fallbackPhotoUrls = Array.isArray(nextTrip.photoPreviews)
        ? nextTrip.photoPreviews.filter((item) => typeof item === 'string' && item.length > 0)
        : []
      const mappedPins = await fetchTripPinsWithPhotos(nextTrip.id, session, {
        fallbackPhotoUrls,
        photoPreviewByPhotoId,
      })
      const unresolvedPhotos = await fetchTripUnresolvedPhotos(nextTrip.id, session, {
        fallbackPhotoUrls,
        photoPreviewByPhotoId,
      })
      const unresolvedPhotoUrls = unresolvedPhotos.map((photo) => photo.url).filter((url) => typeof url === 'string' && url.length > 0)
      const mappedPhotoCount = mappedPins.reduce((count, pin) => count + (Array.isArray(pin.photos) ? pin.photos.length : 0), 0) + unresolvedPhotoUrls.length
      nextTrip.pins = mappedPins
      nextTrip.photoPreviews = unresolvedPhotoUrls
      nextTrip.photos = Math.max(mappedPhotoCount, Number(nextTrip.photos) || 0)
      const representativeCover =
        mappedPins.find((pin) => Array.isArray(pin.photos) && pin.photos.length > 0)?.photos?.[0]?.url || unresolvedPhotoUrls[0] || ''
      if (representativeCover && (!nextTrip.cover || nextTrip.cover.startsWith('data:image/'))) {
        nextTrip.cover = representativeCover
      }
    }

    if (isServerTripId && session) {
      try {
        const groupMembers = await fetchGroupMembers(nextTrip.groupId, session)
        const groupInvites = nextTrip.myGroupRole === 'OWNER' ? await fetchGroupInvites(nextTrip.groupId, session) : []
        const participation = buildGroupParticipation(
          groupMembers,
          groupInvites,
          session?.user?.email,
          nextTrip.myGroupRole,
          nextTrip.members,
        )
        nextTrip.invitedPeople = participation.invitedPeople
        nextTrip.members = participation.members
        nextTrip.type = participation.type
        nextTrip.participants = participation.participants
        nextTrip.groupInvites = participation.groupInvites
        nextTrip.myGroupRole = participation.myGroupRole
      } catch {
        // Ignore member sync failure and keep local participation fallback.
      }
    }

    setTrips((prev) => prev.map((trip) => (trip.id === nextTrip.id ? nextTrip : trip)))
    setAdminUsers((prev) => ensureUsersFromInvites(prev, nextTrip.invitedPeople))
    setViewingTripId(nextTrip.id)
    setEditingTripId(null)
      setTripDetailHash(nextTrip.id)
  }
  const handleAddTripInvite = async (tripId, inviteEmail) => {
    const normalizedEmail = String(inviteEmail ?? '').trim().toLowerCase()
    if (!isValidEmail(normalizedEmail)) {
      throw new Error('이메일 형식을 확인해주세요.')
    }

    const targetTrip = trips.find((trip) => trip.id === tripId)
    if (!targetTrip) {
      throw new Error('여행 정보를 찾지 못했습니다.')
    }

    const existingInvites = normalizeInvitedPeople(targetTrip.invitedPeople)
    const existingGroupInvites = normalizeGroupInvites(targetTrip.groupInvites)
    const existingParticipants = normalizeTripMembers(targetTrip.participants)
    const existingEmails = new Set([
      ...existingInvites.map((person) => person.email),
      ...existingGroupInvites.filter((invite) => invite.status === 'PENDING').map((invite) => invite.email),
      ...existingParticipants.map((person) => person.email),
    ])
    if (existingEmails.has(normalizedEmail)) {
      throw new Error('이미 초대된 이메일입니다.')
    }

    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
    }

    let invitedPerson = buildInvitePerson(normalizedEmail)
    let syncedGroupInvites = existingGroupInvites
    let syncedMembers = existingParticipants
    let alreadyMember = false
    const isServerTripId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(tripId ?? ''))
    if (isServerTripId) {
      const response = await createGroupInvite(targetTrip.groupId, normalizedEmail, session)
      const inviteId = String(response?.inviteId ?? '').trim()
      const inviteCode = String(response?.inviteCode ?? '').trim()
      invitedPerson = {
        id: inviteId || invitedPerson.id,
        name: invitedPerson.name,
        email: normalizedEmail,
      }

      try {
        syncedMembers = await fetchGroupMembers(targetTrip.groupId, session)
      } catch {
        syncedMembers = existingParticipants
      }

      try {
        syncedGroupInvites = await fetchGroupInvites(targetTrip.groupId, session)
      } catch {
        syncedGroupInvites = normalizeGroupInvites([
          ...existingGroupInvites,
          {
            inviteId: inviteId || invitedPerson.id,
            inviteCode,
            invitedEmail: normalizedEmail,
            invitedName: invitedPerson.name,
            inviteUrl: String(response?.inviteUrl ?? '').trim(),
            expiresAt: String(response?.expiresAt ?? '').trim(),
            status: 'PENDING',
          },
        ])
      }
    }

    const participation = buildGroupParticipation(
      syncedMembers,
      syncedGroupInvites,
      session?.user?.email,
      targetTrip.myGroupRole,
      targetTrip.members,
    )

    setTrips((prev) =>
      prev.map((trip) => {
        if (trip.groupId !== targetTrip.groupId) {
          return trip
        }

        return {
          ...trip,
          invitedPeople: participation.invitedPeople,
          members: participation.members,
          type: participation.type,
          participants: participation.participants,
          groupInvites: participation.groupInvites,
          myGroupRole: participation.myGroupRole,
          updatedAt: new Date().toISOString(),
        }
      }),
    )
    setAdminUsers((prev) => ensureUsersFromInvites(prev, participation.invitedPeople.length > 0 ? participation.invitedPeople : [invitedPerson]))
    return { alreadyMember, member: invitedPerson }
  }
  const handleUpdateGroupMemberRole = async (groupId, memberUserId, role) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
    }

    await requestJson(`/api/v1/groups/${groupId}/members/${encodeURIComponent(String(memberUserId ?? '').trim())}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(session),
      },
      body: JSON.stringify({
        role,
      }),
    })

    const groupMembers = await fetchGroupMembers(groupId, session)
    const groupInvites = await fetchGroupInvites(groupId, session)
    applyGroupStateToTrips(groupId, groupMembers, groupInvites)
  }

  const handleRemoveGroupMember = async (groupId, memberUserId) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
    }

    await requestJson(`/api/v1/groups/${groupId}/members/${encodeURIComponent(String(memberUserId ?? '').trim())}`, {
      method: 'DELETE',
      headers: buildAuthHeaders(session),
    })

    const groupMembers = await fetchGroupMembers(groupId, session)
    const groupInvites = await fetchGroupInvites(groupId, session)
    applyGroupStateToTrips(groupId, groupMembers, groupInvites)
  }

  const handleRevokeGroupInvite = async (groupId, inviteId) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
    }

    await requestJson(`/api/v1/groups/${groupId}/invites/${encodeURIComponent(String(inviteId ?? '').trim())}`, {
      method: 'DELETE',
      headers: buildAuthHeaders(session),
    })

    const groupMembers = await fetchGroupMembers(groupId, session)
    const groupInvites = await fetchGroupInvites(groupId, session)
    applyGroupStateToTrips(groupId, groupMembers, groupInvites)
  }

  const handleAcceptGroupInvite = async (inviteCode) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('초대를 수락하려면 먼저 로그인해주세요.')
    }

    const response = await requestJson(`/api/v1/invites/${encodeURIComponent(String(inviteCode ?? '').trim())}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(session),
      },
      body: JSON.stringify({
        consent: {
          type: DEFAULT_CONSENT_TYPE,
          agreedVersion: DEFAULT_CONSENT_VERSION,
        },
      }),
    })

    const acceptedGroupId = String(response?.groupId ?? '').trim()
    if (acceptedGroupId) {
      setStoredGroupId(session.user.email, acceptedGroupId)
    }
    await loadTripsFromServer(session)
    setInvitePreview((prev) =>
      prev
        ? {
            ...prev,
            status: 'ACCEPTED',
          }
        : prev,
    )
      setRouteHash('trips')
    return response
  }
  const handleDeleteMyTrip = async (tripId) => {
    const normalizedTripId = String(tripId ?? '').trim()
    if (!normalizedTripId) {
      throw new Error('삭제할 여행 정보를 찾지 못했습니다.')
    }

    const isServerTripId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedTripId)
    if (isServerTripId) {
      const session = normalizeUserSession(userSession)
      if (!session) {
        throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
      }

      await requestJson(`/api/v1/trips/${normalizedTripId}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(session),
      })
    }

    setTrips((prev) => prev.filter((trip) => trip.id !== normalizedTripId))
    if (viewingTripId === normalizedTripId) {
      setViewingTripId(null)
    }
    if (editingTripId === normalizedTripId) {
      setEditingTripId(null)
    }
  }
  const handleUpdateTripAdminStatus = (tripId, status) => {
    setTrips((prev) =>
      prev.map((trip) =>
        trip.id === tripId
          ? {
              ...trip,
              adminStatus: status,
              updatedAt: new Date().toISOString(),
            }
          : trip,
      ),
    )
  }
  const handleDeleteTrip = (tripId) => {
    setTrips((prev) => prev.filter((trip) => trip.id !== tripId))
    if (viewingTripId === tripId) {
      setViewingTripId(null)
    }
    if (editingTripId === tripId) {
      setEditingTripId(null)
    }
  }
  const handleUpdateUserRole = async (userId, role) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('관리자 작업을 수행하려면 다시 로그인해주세요.')
    }
    const normalizedUserId = String(userId ?? '').trim()
    const normalizedRole = normalizeAdminRole(role)
    const previousRole = adminUsers.find((user) => user.id === normalizedUserId)?.role ?? 'USER'

    setAdminUsers((prev) =>
      prev.map((user) => (user.id === normalizedUserId ? { ...user, role: normalizedRole } : user)),
    )

    if (!isUuidLike(normalizedUserId)) {
      return
    }

    try {
      const response = await requestJson(`/api/v1/admin/users/${encodeURIComponent(normalizedUserId)}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(session),
        },
        body: JSON.stringify({
          role: normalizedRole,
        }),
      })
      const updatedUser = normalizeAdminUser(response, 0)
      if (updatedUser) {
        setAdminUsers((prev) => prev.map((user) => (user.id === normalizedUserId ? updatedUser : user)))
      }
    } catch (updateError) {
      setAdminUsers((prev) =>
        prev.map((user) => (user.id === normalizedUserId ? { ...user, role: previousRole } : user)),
      )
      const detail = updateError instanceof Error ? updateError.message : '권한 업데이트 중 오류가 발생했습니다.'
      window.alert(detail)
    }
  }
  const handleUpdateUserStatus = async (userId, status) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('관리자 작업을 수행하려면 다시 로그인해주세요.')
    }
    const normalizedUserId = String(userId ?? '').trim()
    const normalizedStatus = normalizeAdminStatus(status)
    const previousStatus = adminUsers.find((user) => user.id === normalizedUserId)?.status ?? 'ACTIVE'

    setAdminUsers((prev) =>
      prev.map((user) => (user.id === normalizedUserId ? { ...user, status: normalizedStatus } : user)),
    )

    if (!isUuidLike(normalizedUserId)) {
      return
    }

    try {
      const response = await requestJson(`/api/v1/admin/users/${encodeURIComponent(normalizedUserId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(session),
        },
        body: JSON.stringify({
          status: normalizedStatus,
        }),
      })
      const updatedUser = normalizeAdminUser(response, 0)
      if (updatedUser) {
        setAdminUsers((prev) => prev.map((user) => (user.id === normalizedUserId ? updatedUser : user)))
      }
    } catch (updateError) {
      setAdminUsers((prev) =>
        prev.map((user) => (user.id === normalizedUserId ? { ...user, status: previousStatus } : user)),
      )
      const detail = updateError instanceof Error ? updateError.message : '상태 업데이트 중 오류가 발생했습니다.'
      window.alert(detail)
    }
  }
  const handleCreatePlace = async (nextPlace) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('관리자 작업을 수행하려면 다시 로그인해주세요.')
    }
    const normalizedPlace = normalizeRecommendedPlaces([nextPlace])[0]
    if (!normalizedPlace) {
      throw new Error('추천장소 입력값이 올바르지 않습니다.')
    }

    const created = await requestJson('/api/v1/admin/places', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(session),
      },
      body: JSON.stringify({
        name: normalizedPlace.name,
        region: normalizedPlace.region,
        description: normalizedPlace.description,
        keywords: normalizedPlace.keywords,
        image: normalizedPlace.image,
        latitude: Number.isFinite(normalizedPlace.latitude) ? normalizedPlace.latitude : null,
        longitude: Number.isFinite(normalizedPlace.longitude) ? normalizedPlace.longitude : null,
        isVisible: normalizedPlace.isVisible !== false,
        isSponsored: normalizedPlace.isSponsored === true,
      }),
    })

    const createdPlace = normalizeRecommendedPlaces([created])[0]
    if (!createdPlace) {
      throw new Error('추천장소 생성 응답이 올바르지 않습니다.')
    }

    setRecommendedPlaces((prev) => [createdPlace, ...prev.filter((place) => place.id !== createdPlace.id)])
    setPlaceReviews((prev) => ({
      ...prev,
      [createdPlace.id]: Array.isArray(prev[createdPlace.id]) ? prev[createdPlace.id] : [],
    }))
    setPlacesLoadError('')
  }
  const handleUploadPlaceImage = async (file) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('관리자 작업을 수행하려면 다시 로그인해주세요.')
    }
    if (!(file instanceof File) || file.size <= 0) {
      throw new Error('업로드할 이미지 파일을 선택해주세요.')
    }

    const formData = new FormData()
    formData.append('image', file, file.name)

    const response = await requestJson('/api/v1/admin/places/images', {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(session),
      },
      body: formData,
    })

    const uploadedUrl = resolveMediaUrl(String(response?.url ?? '').trim())
    if (!uploadedUrl) {
      throw new Error('이미지 업로드 응답이 올바르지 않습니다.')
    }
    return uploadedUrl
  }
  const handleTogglePlaceVisibility = async (placeId) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('관리자 작업을 수행하려면 다시 로그인해주세요.')
    }
    const normalizedPlaceId = String(placeId ?? '').trim()
    const currentPlace = recommendedPlaces.find((place) => place.id === normalizedPlaceId)
    if (!currentPlace) {
      return
    }

    const previousVisibility = currentPlace.isVisible !== false
    const nextVisibility = !previousVisibility
    setRecommendedPlaces((prev) =>
      prev.map((place) =>
        place.id === normalizedPlaceId
          ? {
              ...place,
              isVisible: nextVisibility,
            }
          : place,
      ),
    )

    try {
      const updated = await requestJson(`/api/v1/admin/places/${encodeURIComponent(normalizedPlaceId)}/visibility`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(session),
        },
        body: JSON.stringify({
          isVisible: nextVisibility,
        }),
      })
      const normalizedUpdated = normalizeRecommendedPlaces([updated])[0]
      if (normalizedUpdated) {
        setRecommendedPlaces((prev) =>
          prev.map((place) => (place.id === normalizedPlaceId ? normalizedUpdated : place)),
        )
      }
    } catch (updateError) {
      setRecommendedPlaces((prev) =>
        prev.map((place) =>
          place.id === normalizedPlaceId
            ? {
                ...place,
                isVisible: previousVisibility,
              }
            : place,
        ),
      )
      const detail = updateError instanceof Error ? updateError.message : '추천장소 노출 상태 변경에 실패했습니다.'
      window.alert(detail)
    }
  }
  const handleTogglePlaceSponsored = async (placeId) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('관리자 작업을 수행하려면 다시 로그인해주세요.')
    }
    const normalizedPlaceId = String(placeId ?? '').trim()
    const currentPlace = recommendedPlaces.find((place) => place.id === normalizedPlaceId)
    if (!currentPlace) {
      return
    }

    const previousSponsored = currentPlace.isSponsored === true
    const nextSponsored = !previousSponsored
    setRecommendedPlaces((prev) =>
      prev.map((place) =>
        place.id === normalizedPlaceId
          ? {
              ...place,
              isSponsored: nextSponsored,
            }
          : place,
      ),
    )

    try {
      const updated = await requestJson(`/api/v1/admin/places/${encodeURIComponent(normalizedPlaceId)}/sponsored`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(session),
        },
        body: JSON.stringify({
          isSponsored: nextSponsored,
        }),
      })
      const normalizedUpdated = normalizeRecommendedPlaces([updated])[0]
      if (normalizedUpdated) {
        setRecommendedPlaces((prev) =>
          prev.map((place) => (place.id === normalizedPlaceId ? normalizedUpdated : place)),
        )
      }
    } catch (updateError) {
      setRecommendedPlaces((prev) =>
        prev.map((place) =>
          place.id === normalizedPlaceId
            ? {
                ...place,
                isSponsored: previousSponsored,
              }
            : place,
        ),
      )
      const detail = updateError instanceof Error ? updateError.message : '제휴 상태 변경에 실패했습니다.'
      window.alert(detail)
    }
  }
  const handleDeletePlace = async (placeId) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('관리자 작업을 수행하려면 다시 로그인해주세요.')
    }
    const normalizedPlaceId = String(placeId ?? '').trim()
    if (!normalizedPlaceId) {
      return
    }

    try {
      await requestJson(`/api/v1/admin/places/${encodeURIComponent(normalizedPlaceId)}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(session),
      })
    } catch (deleteError) {
      const detail = deleteError instanceof Error ? deleteError.message : '추천장소 삭제에 실패했습니다.'
      window.alert(detail)
      return
    }

    setRecommendedPlaces((prev) => prev.filter((place) => place.id !== normalizedPlaceId))
    setPlaceReviews((prev) => {
      if (!(normalizedPlaceId in prev)) {
        return prev
      }
      const next = { ...prev }
      delete next[normalizedPlaceId]
      return next
    })
    if (viewingPlaceId === normalizedPlaceId) {
      setViewingPlaceId(null)
      if (activeRoute === 'place-view') {
      setRouteHash('places')
      }
    }
    setPlacesLoadError('')
  }

  const handleToggleModerationReviewHidden = async (reviewId, nextHidden) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('관리자 작업을 수행하려면 다시 로그인해주세요.')
    }
    const reason = nextHidden
      ? window.prompt('숨김 사유를 입력해주세요.')
      : '관리자에 의해 복구되었습니다.'
    const normalizedReason = String(reason ?? '').trim()
    if (nextHidden && normalizedReason.length < 3) {
      throw new Error('숨김 사유는 3자 이상 입력해주세요.')
    }

    const updated = await updateModerationReviewHidden(reviewId, nextHidden, normalizedReason, session)
    setModerationReviews((prev) =>
      prev.map((item) =>
        String(item?.reviewId ?? '') === String(updated?.reviewId ?? '')
          ? { ...item, ...updated }
          : item,
      ),
    )
  }

  const handleCreateTripShare = async (tripId) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
    }
    const response = await createTripShareLink(tripId, session)
    const shareToken = String(response?.shareToken ?? '').trim()
    const shareUrl = resolveTripShareUrl(shareToken, response?.shareUrl)
    return {
      ...response,
      shareToken,
      shareUrl,
    }
  }

  const handleDownloadTripPhotoZip = async (trip) => {
    const normalizedTripId = String(trip?.id ?? '').trim()
    if (!normalizedTripId) {
      throw new Error('다운로드할 여행 정보를 찾지 못했습니다.')
    }

    let session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
    }

    const downloadPath = `/api/v1/trips/${normalizedTripId}/photos/download.zip`
    const fetchArchive = async (currentSession) => {
      const response = await fetch(buildApiUrl(downloadPath), {
        headers: buildAuthHeaders(currentSession),
      })

      if (!response.ok) {
        throw new ApiRequestError(await parseApiErrorMessage(response), response.status)
      }

      return response
    }

    let response
    try {
      response = await fetchArchive(session)
    } catch (error) {
      if (!isAuthFailureError(error)) {
        throw error
      }

      const refreshedSession = await handleRefreshSession(session.refreshToken)
      if (!refreshedSession) {
        throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
      }
      session = refreshedSession
      response = await fetchArchive(session)
    }

    const blob = await response.blob()
    const parsedFilename = parseContentDispositionFilename(response.headers.get('Content-Disposition'))
    const fallbackTripName = String(trip?.name ?? '').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'trip'
    const filename = parsedFilename || `${fallbackTripName}_photos.zip`

    const downloadUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => {
      window.URL.revokeObjectURL(downloadUrl)
    }, 1000)
  }

  const handleListTripShares = async (tripId) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
    }
    return fetchTripShares(tripId, session)
  }

  const handleRevokeTripShare = async (tripId, shareId) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
    }
    await revokeTripShareLink(tripId, shareId, session)
  }

  const handleMarkNotificationRead = async (notificationId) => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      return
    }
    try {
      await markNotificationAsRead(notificationId, session)
      setNotifications((prev) =>
        prev.map((item) =>
          String(item?.notificationId ?? '') === String(notificationId ?? '')
            ? {
                ...item,
                isRead: true,
              }
            : item,
        ),
      )
      setNotificationsUnreadCount((prev) => Math.max(0, prev - 1))
    } catch {
      // Ignore mark-as-read UX failure and keep current list.
    }
  }

  const handleMarkAllNotificationsRead = async () => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      return
    }
    try {
      await markAllNotificationsAsRead(session)
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })))
      setNotificationsUnreadCount(0)
    } catch {
      // Ignore mark-all UX failure and keep current list.
    }
  }

  const handleLoadMoreNotifications = async () => {
    const session = normalizeUserSession(userSession)
    if (!session || !notificationsHasNext || notificationsLoading) {
      return
    }
    setNotificationsLoading(true)
    try {
      const result = await fetchNotificationsFromServer(session, {
        type: notificationsFilter === 'PLACE_REVIEW_CREATED' || notificationsFilter === 'PLACE_REVIEW_REPORTED' || notificationsFilter === 'TRIP_SHARE_CREATED'
          ? notificationsFilter
          : '',
        isRead: notificationsFilter === 'UNREAD' ? false : undefined,
        page: notificationsPage + 1,
        size: 20,
        sort: 'desc',
      })
      setNotifications((prev) => {
        const seen = new Set(prev.map((item) => String(item?.notificationId ?? '').trim()))
        const incoming = result.items.filter((item) => !seen.has(String(item?.notificationId ?? '').trim()))
        return [...prev, ...incoming]
      })
      setNotificationsHasNext(result.hasNext)
      setNotificationsPage(result.page)
      setNotificationsUnreadCount(result.unreadCount)
    } catch (error) {
      setNotificationsLoadError(error instanceof Error ? error.message : '알림 추가 조회에 실패했습니다.')
    } finally {
      setNotificationsLoading(false)
    }
  }
  const handleAddPlaceReview = async (placeId, review) => {
    const normalizedPlaceId = String(placeId ?? '').trim()
    if (!normalizedPlaceId) {
      throw new Error('추천 장소 정보를 찾지 못했습니다.')
    }

    const normalizedReview = normalizePlaceReviewList([
      {
        ...review,
      },
    ], normalizedPlaceId)[0]

    if (!normalizedReview) {
      throw new Error('후기 입력값이 올바르지 않습니다.')
    }

    const createdReview = await createPlaceReview(normalizedPlaceId, normalizedReview, normalizeUserSession(userSession))
    if (!createdReview) {
      throw new Error('후기 저장 응답이 올바르지 않습니다.')
    }

    setPlaceReviews((prev) => ({
      ...prev,
      [normalizedPlaceId]: [createdReview, ...normalizePlaceReviewList(prev[normalizedPlaceId], normalizedPlaceId)],
    }))
  }

  const handleReportPlaceReview = async (placeId, reviewId, reason) => {
    const normalizedPlaceId = String(placeId ?? '').trim()
    const normalizedReviewId = String(reviewId ?? '').trim()
    const normalizedReason = String(reason ?? '').trim()
    if (!normalizedPlaceId || !normalizedReviewId || normalizedReason.length < 3) {
      throw new Error('신고 정보가 올바르지 않습니다.')
    }
    const session = normalizeUserSession(userSession)
    await reportPlaceReview(normalizedPlaceId, normalizedReviewId, normalizedReason, session)
  }
  const storeUserSession = (sessionResponse) => {
    const normalizedSession = normalizeUserSession(sessionResponse)
    if (!normalizedSession) {
      throw new Error('인증 세션 형식이 올바르지 않습니다.')
    }
    setUserSession(normalizedSession)
    return normalizedSession
  }
  const handleGoogleLogin = async ({ idToken }) => {
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        idToken,
      }),
    }

    try {
      const response = await requestJson('/api/v1/auth/social/google', requestOptions)
      return storeUserSession(response)
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.status !== 404) {
        throw error
      }
    }

    const legacyResponse = await requestJson('/api/v1/auth/google', requestOptions)
    return storeUserSession(legacyResponse)
  }
  const handleRefreshSession = async (refreshToken) => {
    const normalizedRefreshToken = String(refreshToken ?? '').trim()
    if (!normalizedRefreshToken) {
      throw new Error('Refresh token is required.')
    }

    const inFlightRequest = refreshSessionPromiseRef.current
    if (inFlightRequest?.refreshToken === normalizedRefreshToken) {
      return inFlightRequest.promise
    }

    const refreshPromise = requestJson('/api/v1/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken: normalizedRefreshToken,
      }),
    })
      .then((response) => storeUserSession(response))
      .finally(() => {
        if (refreshSessionPromiseRef.current?.promise === refreshPromise) {
          refreshSessionPromiseRef.current = null
        }
      })

    refreshSessionPromiseRef.current = {
      refreshToken: normalizedRefreshToken,
      promise: refreshPromise,
    }

    return refreshPromise
  }
  const handleLogout = async () => {
    const token = normalizeUserSession(userSession)?.accessToken
    setIsNotificationPopoverOpen(false)
    if (token) {
      try {
        await requestJson('/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      } catch {
        // Logout UX should be resilient even if server session is already gone.
      }
    }
    setUserSession(null)
  }
  const handleBackofficeLogout = async () => {
    await handleLogout()
    if (ADMIN_ROUTE_KEYS.has(activeRoute)) {
      setRouteHash('admin-login')
    }
  }
  const editingTrip = useMemo(() => trips.find((trip) => trip.id === editingTripId) ?? null, [trips, editingTripId])
  const viewingTrip = useMemo(() => trips.find((trip) => trip.id === viewingTripId) ?? null, [trips, viewingTripId])
  const unreadNotificationCount = useMemo(
    () => Math.max(0, Number(notificationsUnreadCount) || 0),
    [notificationsUnreadCount],
  )
  const viewingPlace = useMemo(
    () => normalizeRecommendedPlaces(recommendedPlaces).find((place) => place.id === viewingPlaceId && place.isVisible !== false) ?? null,
    [recommendedPlaces, viewingPlaceId],
  )

  return (
    <>
      <header className="brand-fixed">
        <a href="#home" className="brand-link">
          <span className="brand-dot" />
          <span className="brand-text">soonmile</span>
        </a>
      </header>

      {!isBackofficeRoute && (
        <div className="top-nav-wrap">
          <nav className="top-nav" aria-label="메인 네비게이션">
            {NAV_ITEMS.map((item) => (
              <a key={item.key} href={toRouteHref(item.key)} className={`nav-item ${item.key === activeRoute ? 'is-active' : ''}`}>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      )}

      {!isBackofficeRoute && (
        <div className="auth-nav-wrap">
          <nav className="auth-nav" aria-label="계정 네비게이션">
            {isUserAuthenticated ? (
              <div className="auth-session" ref={notificationPopoverRef}>
                <span>{normalizedSession.user.name}님</span>
                <button
                  type="button"
                  className={`notification-chip notification-chip-btn ${isNotificationPopoverOpen ? 'is-active' : ''}`}
                  aria-haspopup="dialog"
                  aria-expanded={isNotificationPopoverOpen}
                  aria-controls="notification-popover-panel"
                  onClick={() => setIsNotificationPopoverOpen((prev) => !prev)}
                >
                  알림 {unreadNotificationCount}개
                </button>
                <button type="button" className="auth-logout-btn" onClick={handleLogout}>
                  로그아웃
                </button>
                <div
                  id="notification-popover-panel"
                  role="dialog"
                  aria-label="최근 알림"
                  className={`notification-popover ${isNotificationPopoverOpen ? 'is-open' : ''}`}
                >
                  <div className="notification-popover-head">
                    <strong>최근 알림</strong>
                    <button type="button" className="trip-action-btn ghost compact" onClick={handleMarkAllNotificationsRead}>
                      모두 읽음
                    </button>
                  </div>
                  <div className="notification-filter-row">
                    {[
                      ['ALL', '전체'],
                      ['UNREAD', '읽지 않음'],
                      ['PLACE_REVIEW_CREATED', '리뷰 등록'],
                      ['PLACE_REVIEW_REPORTED', '리뷰 신고'],
                      ['TRIP_SHARE_CREATED', '공유 링크'],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={`trip-action-btn ghost compact ${notificationsFilter === key ? 'is-active-filter' : ''}`}
                        onClick={() => setNotificationsFilter(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {notificationsLoading ? (
                    <p className="trip-create-caption">알림을 불러오는 중...</p>
                  ) : notificationsLoadError ? (
                    <p className="trip-invite-error">{notificationsLoadError}</p>
                  ) : notifications.length === 0 ? (
                    <p className="trip-create-caption">새 알림이 없습니다.</p>
                  ) : (
                    <ul className="notification-list">
                      {notifications.map((item) => {
                        const notificationId = String(item?.notificationId ?? '').trim()
                        return (
                          <li key={notificationId || `${item?.title}-${item?.createdAt}`} className={item?.isRead ? 'is-read' : ''}>
                            <button type="button" onClick={() => handleMarkNotificationRead(notificationId)}>
                              <strong>{String(item?.title ?? '').trim() || '알림'}</strong>
                              <span>{String(item?.message ?? '').trim()}</span>
                              <small>{item?.createdAt ? new Date(item.createdAt).toLocaleString('ko-KR') : ''}</small>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {notificationsHasNext && !notificationsLoading && (
                    <button type="button" className="trip-action-btn ghost compact" onClick={handleLoadMoreNotifications}>
                      알림 더보기
                    </button>
                  )}
                </div>
              </div>
            ) : (
              AUTH_NAV_ITEMS.map((item) => (
                <a key={item.key} href={toRouteHref(item.key)} className={`auth-link ${item.key === activeRoute ? 'is-active' : ''}`}>
                  {item.label}
                </a>
              ))
            )}
          </nav>
        </div>
      )}

      <main className={`page-shell ${isBackofficeRoute ? 'is-admin' : ''}`}>
        {activeRoute !== 'login' && !['home', 'map', 'trips', 'places'].includes(activeRoute) && (
          <section className="page-head">
            <p className="label">{current.label}</p>
            <h1>{current.title}</h1>
            <p>{current.description}</p>
          </section>
        )}

        {shouldHoldProtectedRouteRender && (
          <section className="content-card empty-state" aria-live="polite">
            로그인 상태를 확인하는 중입니다. 잠시만 기다려주세요.
          </section>
        )}

        {!shouldHoldProtectedRouteRender && activeRoute === 'home' && <HomeView trips={trips} loading={tripsLoading} loadError={tripsLoadError} onOpenTripView={openTripViewPage} />}
        {!shouldHoldProtectedRouteRender && activeRoute === 'map' && <MapView trips={trips} loading={tripsLoading} loadError={tripsLoadError} />}
        {!shouldHoldProtectedRouteRender && activeRoute === 'trips' && (
          <TripsView
            trips={trips}
            loading={tripsLoading}
            loadError={tripsLoadError}
            onOpenCreateTrip={openTripCreatePage}
            onOpenTripView={openTripViewPage}
          />
        )}
        {!shouldHoldProtectedRouteRender && activeRoute === 'trip-create' && <TripCreateView onCreateTrip={handleCreateTrip} />}
        {!shouldHoldProtectedRouteRender && activeRoute === 'trip-detail' && (
          <TripDetailPage
            tripId={viewingTripId}
            trip={viewingTrip}
            loading={tripsLoading}
            loadError={tripsLoadError}
            currentUser={isUserAuthenticated ? normalizedSession.user : null}
            onBackToTrips={backToTripsPage}
            onOpenEditTrip={openTripEditPage}
            onAddTripInvite={handleAddTripInvite}
            onUpdateGroupMemberRole={handleUpdateGroupMemberRole}
            onRemoveGroupMember={handleRemoveGroupMember}
            onRevokeGroupInvite={handleRevokeGroupInvite}
            onDownloadTripPhotoZip={handleDownloadTripPhotoZip}
            onCreateTripShare={handleCreateTripShare}
            onListTripShares={handleListTripShares}
            onRevokeTripShare={handleRevokeTripShare}
            onDeleteTrip={handleDeleteMyTrip}
          />
        )}
        {!shouldHoldProtectedRouteRender && activeRoute === 'trip-edit' && <TripEditView trip={editingTrip} onUpdateTrip={handleUpdateTrip} />}
        {activeRoute === 'invite' && (
          <InviteAcceptView
            inviteCode={viewingInviteCode}
            invitePreview={invitePreview}
            loading={invitePreviewLoading}
            loadError={invitePreviewError}
            currentUser={isUserAuthenticated ? normalizedSession.user : null}
            onAcceptInvite={handleAcceptGroupInvite}
          />
        )}
        {activeRoute === 'trip-share' && (
          <TripShareView
            shareToken={viewingTripShareToken}
            tripPreview={tripSharePreview}
            loading={tripSharePreviewLoading}
            loadError={tripSharePreviewError}
          />
        )}
        {activeRoute === 'places' && (
          <PlacesView places={recommendedPlaces} placeReviews={placeReviews} onOpenPlaceView={openPlaceViewPage} />
        )}
        {activeRoute === 'place-view' && (
          <PlaceViewPage
            key={viewingPlace?.id ?? 'place-view'}
            place={viewingPlace}
            reviews={placeReviews[viewingPlace?.id] ?? []}
            onAddReview={handleAddPlaceReview}
            onReportReview={handleReportPlaceReview}
            onBackToPlaces={backToPlacesPage}
          />
        )}
        {activeRoute === 'login' && (
          <LoginView
            onGoogleLogin={handleGoogleLogin}
            onLogout={handleLogout}
            currentUser={isUserAuthenticated ? normalizedSession.user : null}
          />
        )}
        {activeRoute === 'admin-login' && (
          <AdminLoginView
            isUserAuthenticated={isUserAuthenticated}
            isAdminAuthenticated={isAdminAuthenticated}
            adminSession={adminSession}
            onLogout={handleLogout}
          />
        )}
        {!shouldHoldProtectedRouteRender && activeRoute === 'admin-dashboard' &&
          (isAdminAuthenticated ? (
            <AdminDashboardView
              activeRoute={activeRoute}
              adminSession={adminSession}
              onAdminLogout={handleBackofficeLogout}
              trips={trips}
              adminUsers={adminUsers}
              places={recommendedPlaces}
            />
          ) : (
            <AdminAccessDeniedView />
          ))}
        {!shouldHoldProtectedRouteRender && activeRoute === 'admin-trips' &&
          (isAdminAuthenticated ? (
            <AdminTripsManagementView
              activeRoute={activeRoute}
              adminSession={adminSession}
              onAdminLogout={handleBackofficeLogout}
              trips={trips}
              onUpdateTripAdminStatus={handleUpdateTripAdminStatus}
              onDeleteTrip={handleDeleteTrip}
            />
          ) : (
            <AdminAccessDeniedView />
          ))}
        {!shouldHoldProtectedRouteRender && activeRoute === 'admin-users' &&
          (isAdminAuthenticated ? (
            <AdminUsersManagementView
              activeRoute={activeRoute}
              adminSession={adminSession}
              onAdminLogout={handleBackofficeLogout}
              adminUsers={adminUsers}
              onUpdateUserRole={handleUpdateUserRole}
              onUpdateUserStatus={handleUpdateUserStatus}
              isLoading={adminUsersLoading}
              loadError={adminUsersLoadError}
            />
          ) : (
            <AdminAccessDeniedView />
          ))}
        {!shouldHoldProtectedRouteRender && activeRoute === 'admin-places' &&
          (isAdminAuthenticated ? (
            <AdminPlacesManagementView
              activeRoute={activeRoute}
              adminSession={adminSession}
              onAdminLogout={handleBackofficeLogout}
              places={recommendedPlaces}
              onCreatePlace={handleCreatePlace}
              onUploadPlaceImage={handleUploadPlaceImage}
              onTogglePlaceVisibility={handleTogglePlaceVisibility}
              onTogglePlaceSponsored={handleTogglePlaceSponsored}
              onDeletePlace={handleDeletePlace}
              isLoading={placesLoading}
              loadError={placesLoadError}
            />
          ) : (
            <AdminAccessDeniedView />
          ))}
        {!shouldHoldProtectedRouteRender && activeRoute === 'admin-place-reviews' &&
          (isAdminAuthenticated ? (
            <AdminPlaceReviewsManagementView
              activeRoute={activeRoute}
              adminSession={adminSession}
              onAdminLogout={handleBackofficeLogout}
              reviews={moderationReviews}
              onToggleReviewHidden={handleToggleModerationReviewHidden}
              isLoading={moderationReviewsLoading}
              loadError={moderationReviewsError}
            />
          ) : (
            <AdminAccessDeniedView />
          ))}
      </main>
    </>
  )
}

export default App

