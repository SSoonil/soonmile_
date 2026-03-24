import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { createPortal } from 'react-dom'

const KAKAO_MAP_API_KEY = import.meta.env.VITE_KAKAO_MAP_API_KEY
const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL ?? '').trim()
const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim()
const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const ADMIN_ACCOUNT = {
  email: 'admin@soonmile.com',
  password: 'admin1234',
  name: 'Soonmile Admin',
}
const ADMIN_SESSION_KEY = 'soonmile-admin-session'
const USER_SESSION_KEY = 'soonmile-user-session'
const USER_GROUP_STORAGE_PREFIX = 'soonmile-user-default-group-id'
const DEFAULT_CONSENT_TYPE = 'LOCATION_PHOTO_PROCESSING'
const DEFAULT_CONSENT_VERSION = 'v1.0'
const PHOTO_UPLOAD_MAX_BATCH_BYTES = 8 * 1024 * 1024
const PHOTO_UPLOAD_MAX_BATCH_COUNT = 5
const TRIP_PIN_COLOR_GROUP_DEFAULT = '#FF8B24'
const TRIP_PIN_COLOR_SOLO_DEFAULT = '#1E7FCD'
const TRIP_PIN_COLOR_FALLBACK = TRIP_PIN_COLOR_GROUP_DEFAULT

const ROUTES = {
  home: {
    key: 'home',
    label: '메인',
    title: '추억 정리의 시작점',
    description: '협찬 배너와 내 여행 요약을 먼저 보는 Soonmile 메인 페이지입니다.',
  },
  map: {
    key: 'map',
    label: '지도',
    title: '카카오맵 기반 핀 뷰',
    description: '여행 핀 군집과 동선을 확인하고 미분류 보정을 시작할 수 있습니다.',
  },
  trips: {
    key: 'trips',
    label: '내 여행들',
    title: '내 여행 전체 보기',
    description: '여행 목록과 팀 활동 로그를 함께 확인하는 통합 페이지입니다.',
  },
  places: {
    key: 'places',
    label: '추천 장소',
    title: '추천 장소 & 제휴 스팟',
    description: '협찬/광고 및 사용자 반응이 좋은 여행 장소를 지역별로 확인합니다.',
  },
  'place-view': {
    key: 'place-view',
    label: '추천 장소 상세',
    title: '추천 장소 상세 보기',
    description: '선택한 추천 장소의 상세 정보와 키워드를 확인할 수 있습니다.',
  },
  'trip-create': {
    key: 'trip-create',
    label: '내 여행 추가',
    title: '새 여행 만들기',
    description: '여행 정보를 입력하고 Soonmile 여행 리스트에 바로 추가하세요.',
  },
  'trip-view': {
    key: 'trip-view',
    label: '내 여행 보기',
    title: '여행 상세 보기',
    description: '선택한 여행의 기본 정보, 핀 위치, 사진 묶음을 한 페이지에서 확인합니다.',
  },
  'trip-detail': {
    key: 'trip-detail',
    label: '내 여행 상세',
    title: '여행 상세 보기',
    description: '선택한 여행의 기본 정보, 핀 위치, 사진 묶음을 한 페이지에서 확인합니다.',
  },
  'trip-edit': {
    key: 'trip-edit',
    label: '내 여행 수정',
    title: '여행 정보 수정',
    description: '기존 여행의 일정, 커버, 메모를 수정해 기록을 최신 상태로 유지하세요.',
  },
  login: {
    key: 'login',
    label: '로그인',
    title: '계정에 다시 연결하기',
    description: '저장된 여행 기록과 팀 프로젝트를 이어서 확인할 수 있습니다.',
  },
  'admin-login': {
    key: 'admin-login',
    label: '관리자 로그인',
    title: '백오피스 관리자 로그인',
    description: '운영자 계정으로 로그인해 여행/사용자/콘텐츠를 관리하세요.',
  },
  'admin-dashboard': {
    key: 'admin-dashboard',
    label: '백오피스',
    title: '백오피스 대시보드',
    description: '관리자 전용 화면입니다. 권한 체크를 통과한 계정만 접근할 수 있습니다.',
  },
  'admin-trips': {
    key: 'admin-trips',
    label: '여행 목록 관리',
    title: '백오피스 · 여행 목록 관리',
    description: '등록된 여행의 상태와 메타 정보를 검토하고 운영 관점에서 관리합니다.',
  },
  'admin-users': {
    key: 'admin-users',
    label: '사용자 목록 관리',
    title: '백오피스 · 사용자 목록 관리',
    description: '사용자 권한/상태를 조정하고 계정 운영 정책을 적용합니다.',
  },
  'admin-places': {
    key: 'admin-places',
    label: '추천장소 관리',
    title: '백오피스 · 추천장소 관리',
    description: '추천 장소의 노출 여부와 소개 콘텐츠를 관리합니다.',
  },
}

const NAV_ITEMS = [ROUTES.home, ROUTES.map, ROUTES.trips, ROUTES.places]
const AUTH_NAV_ITEMS = [ROUTES.login]
const ADMIN_MENU_ITEMS = [ROUTES['admin-dashboard'], ROUTES['admin-trips'], ROUTES['admin-users'], ROUTES['admin-places']]
const ADMIN_ROUTE_KEYS = new Set(['admin-dashboard', 'admin-trips', 'admin-users', 'admin-places'])
const USER_PROTECTED_ROUTE_KEYS = new Set(['map', 'trips', 'trip-create', 'trip-view', 'trip-detail', 'trip-edit'])

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

const RECOMMENDED_PLACES = [
  {
    id: 'place-1',
    name: '제주 협재 해변',
    region: '제주',
    description: '노을 촬영 핫스팟 · 오후 6시 추천',
    isSponsored: true,
    keywords: ['바다', '노을', '감성'],
    image:
      'https://images.unsplash.com/photo-1505765050516-f72dcac9c60d?auto=format&fit=crop&w=1000&q=80',
  },
  {
    id: 'place-2',
    name: '서울 북촌 한옥마을',
    region: '서울',
    description: '골목 스냅 포인트 다수',
    keywords: ['도심', '전통', '골목'],
    image:
      'https://images.unsplash.com/photo-1538485399081-7c897f4d9f72?auto=format&fit=crop&w=1000&q=80',
  },
  {
    id: 'place-3',
    name: '부산 흰여울 문화마을',
    region: '부산',
    description: '바다 절벽길과 감성 카페 거리',
    isSponsored: true,
    keywords: ['바다', '감성', '카페'],
    image:
      'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1000&q=80',
  },
  {
    id: 'place-4',
    name: '강릉 안목해변',
    region: '강릉',
    description: '커피거리 + 해변 산책 루트',
    keywords: ['휴식', '해변', '커피'],
    image:
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1000&q=80',
  },
  {
    id: 'place-5',
    name: '전주 한옥마을',
    region: '전주',
    description: '야간 조명과 한복 스냅 포인트',
    keywords: ['야경', '전통', '스냅'],
    image:
      'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1000&q=80',
  },
]

const PLACE_DETAIL_CONTENT = {
  'place-1': {
    detailDescription:
      '협재 해변은 에메랄드빛 바다와 낮은 수심 덕분에 스냅 촬영과 산책 모두 만족도가 높은 제주 대표 해변입니다. 해 질 무렵에는 바다와 하늘 색이 동시에 바뀌는 장면을 담기 좋아요.',
    highlights: ['노을 스냅 포인트', '해변 산책 동선', '근처 감성 카페'],
    bestTime: '오후 5:30 - 7:00',
    gallery: [
      'https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1000&q=80',
    ],
  },
  'place-2': {
    detailDescription:
      '북촌 한옥마을은 전통 한옥 지붕 라인과 좁은 골목의 깊이감이 매력적인 스냅 명소입니다. 오전 시간대가 한적해 인물 촬영 동선 잡기가 쉽습니다.',
    highlights: ['한옥 골목 뷰', '전통 소품샵', '도보 이동 동선'],
    bestTime: '오전 9:00 - 11:00',
    gallery: [
      'https://images.unsplash.com/photo-1528164344705-47542687000d?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1000&q=80',
    ],
  },
  'place-3': {
    detailDescription:
      '흰여울 문화마을은 바다를 따라 이어지는 절벽길과 컬러풀한 골목 벽면이 특징입니다. 오후 시간에는 역광을 활용한 실루엣 컷이 잘 나옵니다.',
    highlights: ['절벽길 파노라마', '감성 벽화 구간', '근처 전망 카페'],
    bestTime: '오후 4:30 - 6:30',
    gallery: [
      'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1512100356356-de1b84283e18?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1000&q=80',
    ],
  },
  'place-4': {
    detailDescription:
      '안목해변은 해변 산책로와 카페 거리가 바로 연결되어 있어서 이동 동선이 편합니다. 커피거리 구간은 야간 조명까지 더해져 분위기 컷이 잘 나와요.',
    highlights: ['커피거리', '해변 산책로', '야간 감성 조명'],
    bestTime: '오후 3:00 - 7:30',
    gallery: [
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=1000&q=80',
    ],
  },
  'place-5': {
    detailDescription:
      '전주 한옥마을은 전통 건축과 먹거리 동선이 함께 있어 여행 기록을 풍성하게 만들기 좋습니다. 야간 조명이 켜진 뒤에는 분위기 있는 한복 스냅이 가능합니다.',
    highlights: ['한복 스냅 구간', '전통 디저트 골목', '야간 조명 포인트'],
    bestTime: '오후 5:00 - 8:30',
    gallery: [
      'https://images.unsplash.com/photo-1495195134817-aeb325a55b65?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1516685018646-549198525c1b?auto=format&fit=crop&w=1000&q=80',
    ],
  },
}

const PLACE_REVIEWS_SEED = {
  'place-1': [
    { author: '민서', rating: 5, comment: '노을 시간대가 정말 예쁘고 사진 색감이 잘 나왔어요.', createdAt: '2026-03-14T11:20:00Z' },
    { author: '지훈', rating: 4, comment: '바람이 조금 셌지만 해변 동선이 좋아서 촬영하기 편했습니다.', createdAt: '2026-03-12T08:05:00Z' },
  ],
  'place-2': [
    { author: '하연', rating: 5, comment: '오전 일찍 가면 사람 적어서 골목 스냅 찍기 좋아요.', createdAt: '2026-03-11T03:14:00Z' },
  ],
  'place-3': [
    { author: '성민', rating: 4, comment: '전망 포인트가 여러 개라 다양한 컷을 얻을 수 있었습니다.', createdAt: '2026-03-09T12:45:00Z' },
  ],
}

const ADMIN_USERS_SEED = [
  {
    id: 'admin-user-1',
    name: 'Soonmile Admin',
    email: ADMIN_ACCOUNT.email,
    role: 'ADMIN',
    status: 'ACTIVE',
    joinedAt: '2025-01-02',
  },
  {
    id: 'admin-user-2',
    name: '홍길동',
    email: 'hong@soonmile.com',
    role: 'USER',
    status: 'ACTIVE',
    joinedAt: '2025-10-14',
  },
  {
    id: 'admin-user-3',
    name: '이여행',
    email: 'travel.lee@soonmile.com',
    role: 'USER',
    status: 'ACTIVE',
    joinedAt: '2025-11-01',
  },
  {
    id: 'admin-user-4',
    name: '운영파트너',
    email: 'partner@soonmile.com',
    role: 'MANAGER',
    status: 'ACTIVE',
    joinedAt: '2025-09-20',
  },
]

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

function getRouteFromHash() {
  const raw = window.location.hash.replace('#', '').trim()
  if (raw.startsWith('trip-detail/')) {
    return 'trip-detail'
  }
  if (raw && ROUTES[raw]) {
    return raw
  }
  return 'home'
}

function getTripIdFromHash() {
  const raw = window.location.hash.replace('#', '').trim()
  if (!raw.startsWith('trip-detail/')) {
    return null
  }
  const tripId = decodeURIComponent(raw.slice('trip-detail/'.length)).trim()
  return tripId.length > 0 ? tripId : null
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

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve()
  }
  if (googleIdentityScriptPromise) {
    return googleIdentityScriptPromise
  }

  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`)
    if (existingScript) {
      if (window.google?.accounts?.id) {
        resolve()
        return
      }
      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Google SDK 로드에 실패했습니다.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = GOOGLE_IDENTITY_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Google SDK 로드에 실패했습니다.'))
    document.head.appendChild(script)
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

function normalizeNumberValue(value, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return parsed
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

function getDefaultTripPinColor(tripType) {
  return String(tripType ?? '').trim().toUpperCase() === 'SOLO' ? TRIP_PIN_COLOR_SOLO_DEFAULT : TRIP_PIN_COLOR_GROUP_DEFAULT
}

function normalizeTripPinColor(value, fallbackColor = TRIP_PIN_COLOR_FALLBACK) {
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
        name: String(member?.name ?? '').trim() || fallbackName,
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
  const memberCountFromMembers = effectiveParticipants.length > 0 ? effectiveParticipants.length : fallbackMemberCount
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
      const image = String(place.image ?? '').trim()
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
        new Set(galleryRaw.map((item) => String(item).trim()).filter((item) => item.length > 0 && item !== image)),
      )

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
        isVisible: place.isVisible !== false,
        isSponsored: place.isSponsored === true,
      }
    })
    .filter((place) => place.name.length > 0)
}

function SponsoredBadge() {
  return (
    <span className="sponsor-badge" aria-label="제휴 장소">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 18h18l-1.2 3H4.2L3 18zm2.2-11.1 4.6 3.5 2.2-6.4 2.2 6.4 4.6-3.5-1.8 9.1H7l-1.8-9.1z" />
      </svg>
      <span>제휴</span>
    </span>
  )
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
        id: String(review.id ?? `${placeId}-review-${index + 1}`),
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
  return new Promise((resolve, reject) => {
    if (!appKey) {
      reject(new Error('VITE_KAKAO_MAP_API_KEY 값이 없습니다.'))
      return
    }

    if (window.kakao?.maps) {
      window.kakao.maps.load(() => resolve(window.kakao))
      return
    }

    const existingScript = document.getElementById('kakao-map-sdk')
    if (existingScript) {
      existingScript.addEventListener(
        'load',
        () => window.kakao.maps.load(() => resolve(window.kakao)),
        { once: true },
      )
      existingScript.addEventListener('error', () => reject(new Error('카카오맵 SDK 로드 실패')), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.id = 'kakao-map-sdk'
    script.async = true
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=services`
    script.onload = () => window.kakao.maps.load(() => resolve(window.kakao))
    script.onerror = () => reject(new Error('카카오맵 SDK 로드 실패'))
    document.head.append(script)
  })
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
              <article
                key={trip.id}
                className="trip-card is-clickable"
                role="button"
                tabIndex={0}
                onClick={() => onOpenTripView?.(trip.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpenTripView?.(trip.id)
                  }
                }}
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
              </article>
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
        setMapReady(true)
      } catch (error) {
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
    () => visibleTripIds.length > 0 && visibleTripIds.every((tripId) => selectedTripIds.includes(tripId)),
    [visibleTripIds, selectedTripIds],
  )

  const pinsForMap = useMemo(() => {
    const targetTrips = filteredTrips.filter((trip) => selectedTripIds.includes(trip.id))

    return getAllPinsFromTrips(targetTrips)
  }, [filteredTrips, selectedTripIds])

  useEffect(() => {
    setSelectedTripIds((prev) => {
      const validIds = prev.filter((id) => trips.some((trip) => trip.id === id))
      const next = validIds.length === 0 ? trips.map((trip) => trip.id) : validIds
      return next
    })
  }, [trips])

  const toggleTrip = (tripId, checked) => {
    setSelectedTripIds((prev) => {
      if (checked) {
        if (prev.includes(tripId)) {
          return prev
        }
        return [...prev, tripId]
      }
      return prev.filter((id) => id !== tripId)
    })
  }

  const toggleAllVisible = (checked) => {
    setSelectedTripIds((prev) => {
      const next = new Set(prev)
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

        setMapReady(true)
      } catch (error) {
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

        <div className="map-wrap trip-map-wrap">
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
            const isChecked = selectedTripIds.includes(trip.id)
            return (
              <article
                key={trip.id}
                className={`trip-list-row is-clickable ${isChecked ? 'is-selected' : ''}`}
                onClick={() => onOpenTripView(trip.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpenTripView(trip.id)
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`${trip.name} 상세 보기`}
              >
                <label className="trip-list-row-check" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(event) => toggleTrip(trip.id, event.target.checked)}
                  />
                </label>
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
      onDeleteTrip={onDeleteTrip}
    />
  )
}

function TripViewPage({ trip, currentUser, onBackToTrips, onOpenEditTrip, onAddTripInvite, onDeleteTrip }) {
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
  const [deleteError, setDeleteError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [pinRegionLabelById, setPinRegionLabelById] = useState({})

  const pinsForMap = useMemo(() => (trip ? getAllPinsFromTrips([trip]) : []), [trip])
  const invitedPeople = useMemo(() => normalizeInvitedPeople(trip?.invitedPeople), [trip])
  const tripParticipants = useMemo(() => {
    const participantsFromTrip = normalizeTripMembers(trip?.participants)
    if (participantsFromTrip.length > 0) {
      return participantsFromTrip
    }
    return buildLocalTripParticipants(invitedPeople, currentUser)
  }, [currentUser, invitedPeople, trip?.participants])
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
    setDeleteError('')
    setIsDeleting(false)
    setPinRegionLabelById({})
  }, [trip?.id])

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

        setMapReady(true)
      } catch (error) {
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

    try {
      const result = await onAddTripInvite(trip.id, normalizedEmail)
      const invitedEmail = String(result?.member?.email ?? normalizedEmail).trim() || normalizedEmail
      setInviteEmail('')
      setInviteError('')
      if (result?.alreadyMember) {
        setInviteNotice(`${invitedEmail} 은(는) 이미 그룹에 참여 중입니다.`)
      } else {
        setInviteNotice(`${invitedEmail} 을(를) 여행에 추가했습니다.`)
      }
    } catch (requestError) {
      setInviteNotice('')
      setInviteError(requestError instanceof Error ? requestError.message : '초대 전송에 실패했습니다.')
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
      window.location.hash = '#trips'
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '여행 삭제에 실패했습니다.')
    } finally {
      setIsDeleting(false)
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
              <button type="button" className="trip-action-btn ghost" onClick={() => onOpenEditTrip(trip.id)}>
                수정하기
              </button>
              <button type="button" className="trip-action-btn danger" onClick={handleDeleteTrip} disabled={isDeleting}>
                {isDeleting ? '삭제 중...' : '여행 삭제'}
              </button>
            </div>
          </div>
          {deleteError && <p className="trip-invite-error">{deleteError}</p>}

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
              <h4>참여자 목록</h4>
              <span>현재 참여 인원 {trip.members}명</span>
            </div>
            <form className="trip-invite-form" onSubmit={handleAddTripInvite}>
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="추가할 사람 이메일"
              />
              <button type="submit" className="trip-action-btn ghost">
                사람 추가
              </button>
            </form>
            {inviteError && <p className="trip-invite-error">{inviteError}</p>}
            {inviteNotice && <p className="trip-invite-notice">{inviteNotice}</p>}
            {tripParticipants.length > 0 ? (
              <ul className="trip-invite-list">
                {tripParticipants.map((person) => (
                  <li key={person.id}>
                    <strong>
                      {person.name}
                      <small className="trip-participant-role">
                        {String(person.role ?? '').toUpperCase() === 'OWNER' ? '여행장' : '참여자'}
                      </small>
                    </strong>
                    <span>{person.email}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="trip-invite-empty">아직 참여자가 없습니다. 이메일을 입력해서 멤버를 추가해보세요.</p>
            )}
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
    const fallbackCover =
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80'
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
        cover: resolvedCover || nextPhotoPreviews[0] || trip.cover || fallbackCover,
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
      summary.set(place.id, {
        count: reviews.length,
        average: getPlaceAverageRating(reviews),
      })
    })
    return summary
  }, [placeReviews, visiblePlaces])

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

        <div className="place-list">
          {filteredPlaces.map((place) => (
            <article
              key={place.id}
              className="place-row is-clickable"
              role="button"
              tabIndex={0}
              aria-label={`${place.name} 상세 보기`}
              onClick={() => onOpenPlaceView(place.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpenPlaceView(place.id)
                }
              }}
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
            </article>
          ))}
        </div>

        {filteredPlaces.length === 0 && <p className="empty-state">검색 결과가 없습니다. 다른 키워드로 시도해보세요.</p>}
      </article>
    </section>
  )
}

function PlaceViewPage({ place, reviews, onAddReview, onBackToPlaces }) {
  const [selectedImage, setSelectedImage] = useState('')
  const [reviewForm, setReviewForm] = useState({
    author: '',
    rating: 5,
    comment: '',
  })
  const [reviewError, setReviewError] = useState('')

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

  useEffect(() => {
    setSelectedImage(galleryImages[0] ?? '')
    setReviewForm({
      author: '',
      rating: 5,
      comment: '',
    })
    setReviewError('')
  }, [place?.id, galleryImages])

  const renderStars = (rating, prefix) =>
    Array.from({ length: 5 }, (_, index) => (
      <span key={`${prefix}-star-${index + 1}`} className={`place-star ${index < Math.round(rating) ? 'is-filled' : ''}`}>
        ★
      </span>
    ))

  const handleSubmitReview = (event) => {
    event.preventDefault()
    if (!place || typeof onAddReview !== 'function') {
      return
    }

    const comment = reviewForm.comment.trim()
    if (comment.length < 3) {
      setReviewError('후기는 3자 이상 입력해주세요.')
      return
    }

    onAddReview(place.id, {
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
  }

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
        await loadGoogleIdentityScript()
        if (disposed || !window.google?.accounts?.id) {
          return
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
              window.location.hash = '#home'
            } catch (requestError) {
              setError(requestError instanceof Error ? requestError.message : 'Google 로그인에 실패했습니다.')
            } finally {
              setGoogleSubmitting(false)
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
        })

        setGoogleReady(true)
      } catch (requestError) {
        if (disposed) {
          return
        }
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

function AdminLoginView({ isAdminAuthenticated, adminSession, onAdminLogin, onAdminLogout }) {
  const [email, setEmail] = useState(ADMIN_ACCOUNT.email)
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    const result = onAdminLogin(email, password)
    if (result.ok) {
      setError('')
      setNotice('관리자 로그인에 성공했습니다. 백오피스로 이동합니다.')
      return
    }

    setNotice('')
    setError(result.message)
  }

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
            <button type="button" className="trip-action-btn ghost" onClick={onAdminLogout}>
              관리자 로그아웃
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              관리자 이메일
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@soonmile.com"
                required
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="관리자 비밀번호"
                required
              />
            </label>
            <button type="submit" className="auth-submit">
              관리자 로그인
            </button>
          </form>
        )}

        {!isAdminAuthenticated && (
          <p className="auth-footnote">
            데모 계정: <strong>{ADMIN_ACCOUNT.email}</strong> / <strong>{ADMIN_ACCOUNT.password}</strong>
          </p>
        )}
        {error && <p className="auth-notice error">{error}</p>}
        {notice && <p className="auth-notice success">{notice}</p>}
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
            <a key={item.key} href={`#${item.key}`} className={`admin-menu-link ${activeRoute === item.key ? 'is-active' : ''}`}>
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
  onTogglePlaceVisibility,
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
  })
  const [error, setError] = useState('')

  const handleCreatePlace = async (event) => {
    event.preventDefault()

    if (!newPlace.name.trim()) {
      setError('장소 이름을 입력해주세요.')
      return
    }

    if (!newPlace.image.trim()) {
      setError('대표 이미지 URL을 입력해주세요.')
      return
    }

    try {
      new URL(newPlace.image.trim())
    } catch {
      setError('올바른 URL 형식의 이미지를 입력해주세요.')
      return
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
        image: newPlace.image.trim(),
        isVisible: true,
        isSponsored: false,
      })

      setNewPlace({
        name: '',
        region: '',
        description: '',
        keywords: '',
        image: '',
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
      {error && <p className="auth-notice error">{error}</p>}
      {isLoading && <p>추천장소 목록을 불러오는 중입니다...</p>}
      {loadError && <p>추천장소 로딩 오류: {loadError}</p>}

      <div className="admin-place-list">
        {normalizedPlaces.map((place) => (
          <article key={place.id} className="admin-place-card">
            <img src={place.image} alt={place.name} />
            <div className="admin-place-main">
              <strong>{place.name}</strong>
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

function App() {
  const [activeRoute, setActiveRoute] = useState(getRouteFromHash())
  const [trips, setTrips] = useState([])
  const [tripsLoading, setTripsLoading] = useState(false)
  const [tripsLoadError, setTripsLoadError] = useState('')
  const [recommendedPlaces, setRecommendedPlaces] = useState(() => normalizeRecommendedPlaces(RECOMMENDED_PLACES))
  const [placesLoading, setPlacesLoading] = useState(false)
  const [placesLoadError, setPlacesLoadError] = useState('')
  const [placeReviews, setPlaceReviews] = useState(() => {
    const seededReviews = {}
    normalizeRecommendedPlaces(RECOMMENDED_PLACES).forEach((place) => {
      seededReviews[place.id] = normalizePlaceReviewList(PLACE_REVIEWS_SEED[place.id], place.id)
    })
    return seededReviews
  })
  const [adminUsers, setAdminUsers] = useState(() => normalizeAdminUsers(ADMIN_USERS_SEED, ADMIN_USERS_SEED))
  const [adminUsersLoading, setAdminUsersLoading] = useState(false)
  const [adminUsersLoadError, setAdminUsersLoadError] = useState('')
  const [viewingTripId, setViewingTripId] = useState(getTripIdFromHash())
  const [viewingPlaceId, setViewingPlaceId] = useState(null)
  const [editingTripId, setEditingTripId] = useState(null)
  const [adminSession, setAdminSession] = useState(() => {
    try {
      const raw = window.localStorage.getItem(ADMIN_SESSION_KEY)
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw)
      if (parsed && parsed.role === 'ADMIN' && typeof parsed.email === 'string') {
        return parsed
      }
    } catch {
      return null
    }

    return null
  })
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

  useEffect(() => {
    const handleHashChange = () => {
      const nextRoute = getRouteFromHash()
      setActiveRoute(nextRoute)
      setViewingTripId(getTripIdFromHash())
    }
    window.addEventListener('hashchange', handleHashChange)

    if (!window.location.hash) {
      window.location.hash = '#home'
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  useEffect(() => {
    if (adminSession) {
      window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(adminSession))
      return
    }
    window.localStorage.removeItem(ADMIN_SESSION_KEY)
  }, [adminSession])

  useEffect(() => {
    if (userSession) {
      window.localStorage.setItem(USER_SESSION_KEY, JSON.stringify(userSession))
      return
    }
    window.localStorage.removeItem(USER_SESSION_KEY)
  }, [userSession])

  useEffect(() => {
    const verifyOrRefreshSession = async () => {
      const currentSession = normalizeUserSession(userSession)
      if (!currentSession) {
        setUserSession(null)
        return
      }

      try {
        const now = Date.now()
        const accessExpiresAt = toTimeMillis(currentSession.accessTokenExpiresAt)
        const refreshExpiresAt = toTimeMillis(currentSession.refreshTokenExpiresAt)

        if (!refreshExpiresAt || refreshExpiresAt <= now) {
          setUserSession(null)
          return
        }

        if (!accessExpiresAt || accessExpiresAt <= now) {
          const refreshedSession = await handleRefreshSession(currentSession.refreshToken)
          if (!refreshedSession) {
            setUserSession(null)
            return
          }
          return
        }

        await requestJson('/api/v1/auth/me', {
          headers: {
            Authorization: `Bearer ${currentSession.accessToken}`,
          },
        })
      } catch {
        setUserSession(null)
      }
    }

    verifyOrRefreshSession()
  }, [userSession])

  useEffect(() => {
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
      } catch {
        setUserSession(null)
      }
    }, refreshDelay)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [userSession?.accessTokenExpiresAt, userSession?.refreshToken])

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
      const next = { ...prev }
      let hasChanged = false

      normalizedPlaces.forEach((place) => {
        if (!Array.isArray(next[place.id])) {
          next[place.id] = []
          hasChanged = true
        }
      })

      Object.keys(next).forEach((placeId) => {
        if (!normalizedPlaces.some((place) => place.id === placeId)) {
          delete next[placeId]
          hasChanged = true
        }
      })

      return hasChanged ? next : prev
    })
  }, [recommendedPlaces])

  const current = ROUTES[activeRoute] ?? ROUTES.home
  const isAdminAuthenticated = adminSession?.role === 'ADMIN'
  const isUserAuthenticated = !!normalizeUserSession(userSession)
  const isBackofficeRoute = ADMIN_ROUTE_KEYS.has(activeRoute)

  useEffect(() => {
    if (!USER_PROTECTED_ROUTE_KEYS.has(activeRoute)) {
      return
    }
    if (!isUserAuthenticated) {
      window.location.hash = '#login'
    }
  }, [activeRoute, isUserAuthenticated])

  useEffect(() => {
    if (activeRoute !== 'trip-view') {
      return
    }
    if (viewingTripId) {
      window.location.hash = `#trip-detail/${encodeURIComponent(String(viewingTripId).trim())}`
      return
    }
    window.location.hash = '#trips'
  }, [activeRoute, viewingTripId])

  const openTripViewPage = (tripId) => {
    setViewingTripId(tripId)
    window.location.hash = `#trip-detail/${encodeURIComponent(String(tripId ?? '').trim())}`
  }
  const backToTripsPage = () => {
    window.location.hash = '#trips'
  }
  const openTripCreatePage = () => {
    window.location.hash = '#trip-create'
  }
  const openPlaceViewPage = (placeId) => {
    setViewingPlaceId(placeId)
    window.location.hash = '#place-view'
  }
  const backToPlacesPage = () => {
    window.location.hash = '#places'
  }
  const openTripEditPage = (tripId) => {
    setEditingTripId(tripId)
    window.location.hash = '#trip-edit'
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

  const fetchTripMembers = async (tripId, session) => {
    const membersResponse = await requestJson(`/api/v1/trips/${tripId}/members`, {
      headers: buildAuthHeaders(session),
    })
    const memberItems = Array.isArray(membersResponse?.items) ? membersResponse.items : []
    return normalizeTripMembers(memberItems)
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
      const fallbackCover = 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80'

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
          let tripMembers = []
          try {
            tripMembers = await fetchTripMembers(tripId, session)
          } catch {
            tripMembers = []
          }
          const participation = buildTripParticipationFromMembers(
            tripMembers,
            session?.user?.email,
            [],
            summaryMemberCount,
            buildLocalTripParticipants([], session?.user),
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
            cover: representativeCover || fallbackCover,
            notes: '',
            photoPreviews: unresolvedPhotoUrls,
            invitedPeople: participation.invitedPeople,
            participants: participation.participants,
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

  const loadAdminUsersFromServer = async () => {
    setAdminUsersLoading(true)
    setAdminUsersLoadError('')

    try {
      const response = await requestJson('/api/v1/admin/users')
      const users = Array.isArray(response?.items) ? response.items : []
      setAdminUsers(normalizeAdminUsers(users, ADMIN_USERS_SEED))
    } catch (loadError) {
      setAdminUsers((prev) => normalizeAdminUsers(prev, ADMIN_USERS_SEED))
      setAdminUsersLoadError(loadError instanceof Error ? loadError.message : '서버에서 사용자 목록을 불러오지 못했습니다.')
    } finally {
      setAdminUsersLoading(false)
    }
  }

  const loadRecommendedPlacesFromServer = async () => {
    setPlacesLoading(true)
    setPlacesLoadError('')

    try {
      const response = await requestJson('/api/v1/admin/places')
      const places = Array.isArray(response?.items) ? response.items : []
      const normalized = normalizeRecommendedPlaces(places)
      setRecommendedPlaces(normalized.length > 0 ? normalized : normalizeRecommendedPlaces(RECOMMENDED_PLACES))
    } catch (loadError) {
      setRecommendedPlaces((prev) => (prev.length > 0 ? normalizeRecommendedPlaces(prev) : normalizeRecommendedPlaces(RECOMMENDED_PLACES)))
      setPlacesLoadError(loadError instanceof Error ? loadError.message : '서버에서 추천장소 목록을 불러오지 못했습니다.')
    } finally {
      setPlacesLoading(false)
    }
  }

  useEffect(() => {
    loadRecommendedPlacesFromServer()
  }, [])

  useEffect(() => {
    loadAdminUsersFromServer()
  }, [userSession?.accessToken, userSession?.user?.email, adminSession?.email])

  useEffect(() => {
    const session = normalizeUserSession(userSession)
    if (!session) {
      setTrips([])
      setTripsLoading(false)
      setTripsLoadError('')
      return
    }

    loadTripsFromServer(session)
  }, [userSession?.accessToken, userSession?.user?.email])

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
      await Promise.allSettled(
        normalizedInvites.map((person) =>
          requestJson(`/api/v1/trips/${createdTripId}/members/by-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...buildAuthHeaders(session),
            },
            body: JSON.stringify({
              email: person.email,
            }),
          }),
        ),
      )
    }

    const localParticipants = buildLocalTripParticipants(normalizedInvites, session?.user)
    let participation = {
      ...resolveTripParticipation({
        memberCount: Math.max(Number(createdTrip.members) || 1, normalizedInvites.length + 1),
        invitedPeople: normalizedInvites,
      }),
      participants: localParticipants,
    }
    try {
      const tripMembers = await fetchTripMembers(createdTripId, session)
      participation = buildTripParticipationFromMembers(
        tripMembers,
        session?.user?.email,
        participation.invitedPeople,
        participation.members,
        localParticipants,
      )
    } catch {
      // Ignore member sync failure and keep local participation fallback.
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
      adminStatus: createdTrip.adminStatus ?? 'ACTIVE',
      updatedAt: new Date().toISOString(),
    }

    setTrips((prev) => [normalizedTrip, ...prev])
    setAdminUsers((prev) => ensureUsersFromInvites(prev, participation.invitedPeople))
    setViewingTripId(normalizedTrip.id)
    window.location.hash = `#trip-detail/${encodeURIComponent(String(normalizedTrip.id ?? '').trim())}`
  }
  const handleUpdateTrip = async (updatedTrip) => {
    const normalizedInvites = normalizeInvitedPeople(updatedTrip.invitedPeople)
    const uploadedPhotoPreviews = Array.isArray(updatedTrip.uploadedPhotoPreviews)
      ? updatedTrip.uploadedPhotoPreviews.filter((item) => typeof item === 'string')
      : []
    const uploadedFiles = Array.isArray(updatedTrip.photoFiles) ? updatedTrip.photoFiles.filter((item) => item instanceof File) : []
    const uploadedPreviewByFile = buildUploadedPreviewByFileMap(uploadedFiles, uploadedPhotoPreviews)
    const session = normalizeUserSession(userSession)
    const fallbackParticipants = normalizeTripMembers(updatedTrip.participants)
    const localParticipants = fallbackParticipants.length > 0 ? fallbackParticipants : buildLocalTripParticipants(normalizedInvites, session?.user)
    const localParticipation = {
      ...resolveTripParticipation({
        memberCount: updatedTrip.members,
        invitedPeople: normalizedInvites,
      }),
      participants: localParticipants,
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
        const tripMembers = await fetchTripMembers(nextTrip.id, session)
        const participation = buildTripParticipationFromMembers(
          tripMembers,
          session?.user?.email,
          nextTrip.invitedPeople,
          nextTrip.members,
          nextTrip.participants,
        )
        nextTrip.invitedPeople = participation.invitedPeople
        nextTrip.members = participation.members
        nextTrip.type = participation.type
        nextTrip.participants = participation.participants
      } catch {
        // Ignore member sync failure and keep local participation fallback.
      }
    }

    setTrips((prev) => prev.map((trip) => (trip.id === nextTrip.id ? nextTrip : trip)))
    setAdminUsers((prev) => ensureUsersFromInvites(prev, nextTrip.invitedPeople))
    setViewingTripId(nextTrip.id)
    setEditingTripId(null)
    window.location.hash = `#trip-detail/${encodeURIComponent(String(nextTrip.id ?? '').trim())}`
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
    const existingParticipants = normalizeTripMembers(targetTrip.participants)
    const existingEmails = new Set([
      ...existingInvites.map((person) => person.email),
      ...existingParticipants.map((person) => person.email),
    ])
    if (existingEmails.has(normalizedEmail)) {
      throw new Error('이미 초대된 이메일입니다.')
    }

    const session = normalizeUserSession(userSession)
    let invitedPerson = buildInvitePerson(normalizedEmail)
    let nextMemberCount = null
    let alreadyMember = false
    let syncedParticipation = null
    const isServerTripId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(tripId ?? ''))
    if (isServerTripId) {
      const addMemberResponse = await requestJson(`/api/v1/trips/${tripId}/members/by-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(session),
        },
        body: JSON.stringify({
          email: normalizedEmail,
        }),
      })

      const memberEmail = String(addMemberResponse?.memberEmail ?? normalizedEmail).trim().toLowerCase()
      const memberName = String(addMemberResponse?.memberName ?? invitedPerson.name).trim()
      const memberUserId = String(addMemberResponse?.memberUserId ?? '').trim()
      const parsedMemberCount = Number(addMemberResponse?.memberCount)
      alreadyMember = !!addMemberResponse?.alreadyMember

      invitedPerson = {
        id: memberUserId || invitedPerson.id,
        name: memberName || invitedPerson.name,
        email: memberEmail || normalizedEmail,
      }
      nextMemberCount = Number.isFinite(parsedMemberCount) && parsedMemberCount > 0 ? Math.floor(parsedMemberCount) : null

      try {
        const tripMembers = await fetchTripMembers(tripId, session)
        syncedParticipation = buildTripParticipationFromMembers(
          tripMembers,
          session?.user?.email,
          existingInvites,
          nextMemberCount ?? targetTrip.members,
          existingParticipants.length > 0 ? existingParticipants : buildLocalTripParticipants(existingInvites, session?.user),
        )
      } catch {
        syncedParticipation = null
      }
    }

    setTrips((prev) =>
      prev.map((trip) => {
        if (trip.id !== tripId) {
          return trip
        }

        const previousInvites = normalizeInvitedPeople(trip.invitedPeople)
        const mergedInvites = syncedParticipation?.invitedPeople
          ? syncedParticipation.invitedPeople
          : previousInvites.some((person) => person.email === invitedPerson.email)
            ? previousInvites
            : [...previousInvites, invitedPerson]
        const previousParticipants = normalizeTripMembers(trip.participants)
        const baseParticipants =
          previousParticipants.length > 0 ? previousParticipants : buildLocalTripParticipants(previousInvites, session?.user)
        const mergedParticipants = syncedParticipation?.participants
          ? syncedParticipation.participants
          : normalizeTripMembers([
              ...baseParticipants,
              {
                userId: invitedPerson.id,
                name: invitedPerson.name,
                email: invitedPerson.email,
                role: 'MEMBER',
              },
            ])
        const fallbackMemberCount = Math.max(Number(trip.members) || 1, mergedParticipants.length || mergedInvites.length + 1)
        const nextMembers = syncedParticipation?.members ?? nextMemberCount ?? fallbackMemberCount
        const participation = buildTripParticipationFromMembers(
          [],
          session?.user?.email,
          mergedInvites,
          nextMembers,
          mergedParticipants,
        )

        return {
          ...trip,
          invitedPeople: participation.invitedPeople,
          members: participation.members,
          type: participation.type,
          participants: participation.participants,
          updatedAt: new Date().toISOString(),
        }
      }),
    )
    setAdminUsers((prev) =>
      ensureUsersFromInvites(prev, syncedParticipation?.invitedPeople?.length > 0 ? syncedParticipation.invitedPeople : [invitedPerson]),
    )
    return { alreadyMember, member: invitedPerson }
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
    const normalizedPlace = normalizeRecommendedPlaces([nextPlace])[0]
    if (!normalizedPlace) {
      throw new Error('추천장소 입력값이 올바르지 않습니다.')
    }

    const created = await requestJson('/api/v1/admin/places', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: normalizedPlace.name,
        region: normalizedPlace.region,
        description: normalizedPlace.description,
        keywords: normalizedPlace.keywords,
        image: normalizedPlace.image,
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
  const handleTogglePlaceVisibility = async (placeId) => {
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
  const handleDeletePlace = async (placeId) => {
    const normalizedPlaceId = String(placeId ?? '').trim()
    if (!normalizedPlaceId) {
      return
    }

    try {
      await requestJson(`/api/v1/admin/places/${encodeURIComponent(normalizedPlaceId)}`, {
        method: 'DELETE',
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
        window.location.hash = '#places'
      }
    }
    setPlacesLoadError('')
  }
  const handleAddPlaceReview = (placeId, review) => {
    const normalizedReview = normalizePlaceReviewList(
      [
        {
          ...review,
          id: `${placeId}-review-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        },
      ],
      placeId,
    )[0]

    if (!normalizedReview) {
      return
    }

    setPlaceReviews((prev) => ({
      ...prev,
      [placeId]: [normalizedReview, ...normalizePlaceReviewList(prev[placeId], placeId)],
    }))
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
    const response = await requestJson('/api/v1/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken,
      }),
    })
    return storeUserSession(response)
  }
  const handleLogout = async () => {
    const token = normalizeUserSession(userSession)?.accessToken
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
  const handleAdminLogin = (email, password) => {
    const normalizedEmail = String(email ?? '').trim().toLowerCase()
    const normalizedPassword = String(password ?? '')

    if (normalizedEmail !== ADMIN_ACCOUNT.email || normalizedPassword !== ADMIN_ACCOUNT.password) {
      return {
        ok: false,
        message: '관리자 계정 또는 비밀번호가 일치하지 않습니다.',
      }
    }

    const nextSession = {
      role: 'ADMIN',
      email: ADMIN_ACCOUNT.email,
      name: ADMIN_ACCOUNT.name,
      loggedInAt: new Date().toISOString(),
    }

    setAdminSession(nextSession)
    window.location.hash = '#admin-dashboard'
    return { ok: true }
  }
  const handleAdminLogout = () => {
    setAdminSession(null)
    if (ADMIN_ROUTE_KEYS.has(activeRoute)) {
      window.location.hash = '#admin-login'
    }
  }
  const editingTrip = useMemo(() => trips.find((trip) => trip.id === editingTripId) ?? null, [trips, editingTripId])
  const viewingTrip = useMemo(() => trips.find((trip) => trip.id === viewingTripId) ?? null, [trips, viewingTripId])
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
              <a key={item.key} href={`#${item.key}`} className={`nav-item ${item.key === activeRoute ? 'is-active' : ''}`}>
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
              <div className="auth-session">
                <span>{userSession.user.name}님</span>
                <button type="button" className="auth-logout-btn" onClick={handleLogout}>
                  로그아웃
                </button>
              </div>
            ) : (
              AUTH_NAV_ITEMS.map((item) => (
                <a key={item.key} href={`#${item.key}`} className={`auth-link ${item.key === activeRoute ? 'is-active' : ''}`}>
                  {item.label}
                </a>
              ))
            )}
          </nav>
        </div>
      )}

      <main className={`page-shell ${isBackofficeRoute ? 'is-admin' : ''}`}>
        {activeRoute !== 'login' && (
          <section className="page-head">
            <p className="label">{current.label}</p>
            <h1>{current.title}</h1>
            <p>{current.description}</p>
          </section>
        )}

        {activeRoute === 'home' && <HomeView trips={trips} loading={tripsLoading} loadError={tripsLoadError} onOpenTripView={openTripViewPage} />}
        {activeRoute === 'map' && <MapView trips={trips} loading={tripsLoading} loadError={tripsLoadError} />}
        {activeRoute === 'trips' && (
          <TripsView
            trips={trips}
            loading={tripsLoading}
            loadError={tripsLoadError}
            onOpenCreateTrip={openTripCreatePage}
            onOpenTripView={openTripViewPage}
          />
        )}
        {activeRoute === 'trip-create' && <TripCreateView onCreateTrip={handleCreateTrip} />}
        {activeRoute === 'trip-detail' && (
          <TripDetailPage
            tripId={viewingTripId}
            trip={viewingTrip}
            loading={tripsLoading}
            loadError={tripsLoadError}
            currentUser={isUserAuthenticated ? userSession.user : null}
            onBackToTrips={backToTripsPage}
            onOpenEditTrip={openTripEditPage}
            onAddTripInvite={handleAddTripInvite}
            onDeleteTrip={handleDeleteMyTrip}
          />
        )}
        {activeRoute === 'trip-edit' && <TripEditView trip={editingTrip} onUpdateTrip={handleUpdateTrip} />}
        {activeRoute === 'places' && (
          <PlacesView places={recommendedPlaces} placeReviews={placeReviews} onOpenPlaceView={openPlaceViewPage} />
        )}
        {activeRoute === 'place-view' && (
          <PlaceViewPage
            place={viewingPlace}
            reviews={placeReviews[viewingPlace?.id] ?? []}
            onAddReview={handleAddPlaceReview}
            onBackToPlaces={backToPlacesPage}
          />
        )}
        {activeRoute === 'login' && (
          <LoginView
            onGoogleLogin={handleGoogleLogin}
            onLogout={handleLogout}
            currentUser={isUserAuthenticated ? userSession.user : null}
          />
        )}
        {activeRoute === 'admin-login' && (
          <AdminLoginView
            isAdminAuthenticated={isAdminAuthenticated}
            adminSession={adminSession}
            onAdminLogin={handleAdminLogin}
            onAdminLogout={handleAdminLogout}
          />
        )}
        {activeRoute === 'admin-dashboard' &&
          (isAdminAuthenticated ? (
            <AdminDashboardView
              activeRoute={activeRoute}
              adminSession={adminSession}
              onAdminLogout={handleAdminLogout}
              trips={trips}
              adminUsers={adminUsers}
              places={recommendedPlaces}
            />
          ) : (
            <AdminAccessDeniedView />
          ))}
        {activeRoute === 'admin-trips' &&
          (isAdminAuthenticated ? (
            <AdminTripsManagementView
              activeRoute={activeRoute}
              adminSession={adminSession}
              onAdminLogout={handleAdminLogout}
              trips={trips}
              onUpdateTripAdminStatus={handleUpdateTripAdminStatus}
              onDeleteTrip={handleDeleteTrip}
            />
          ) : (
            <AdminAccessDeniedView />
          ))}
        {activeRoute === 'admin-users' &&
          (isAdminAuthenticated ? (
            <AdminUsersManagementView
              activeRoute={activeRoute}
              adminSession={adminSession}
              onAdminLogout={handleAdminLogout}
              adminUsers={adminUsers}
              onUpdateUserRole={handleUpdateUserRole}
              onUpdateUserStatus={handleUpdateUserStatus}
              isLoading={adminUsersLoading}
              loadError={adminUsersLoadError}
            />
          ) : (
            <AdminAccessDeniedView />
          ))}
        {activeRoute === 'admin-places' &&
          (isAdminAuthenticated ? (
            <AdminPlacesManagementView
              activeRoute={activeRoute}
              adminSession={adminSession}
              onAdminLogout={handleAdminLogout}
              places={recommendedPlaces}
              onCreatePlace={handleCreatePlace}
              onTogglePlaceVisibility={handleTogglePlaceVisibility}
              onDeletePlace={handleDeletePlace}
              isLoading={placesLoading}
              loadError={placesLoadError}
            />
          ) : (
            <AdminAccessDeniedView />
          ))}
      </main>
    </>
  )
}

export default App

