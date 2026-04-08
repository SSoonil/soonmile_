export const ROUTES = {
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
  invite: {
    key: 'invite',
    label: '그룹 초대',
    title: '그룹 초대 수락',
    description: '로그인한 뒤 그룹 초대를 수락하고 공유 여행에 참여할 수 있습니다.',
  },
  'trip-share': {
    key: 'trip-share',
    label: '여행 공유',
    title: '공유 여행 보기',
    description: '공유 링크로 받은 여행 요약과 핀 정보를 확인할 수 있습니다.',
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
  'admin-place-reviews': {
    key: 'admin-place-reviews',
    label: '리뷰 신고 관리',
    title: '백오피스 · 리뷰 신고 관리',
    description: '추천장소 리뷰 신고 내역을 검토하고 숨김/복구를 처리합니다.',
  },
}

export const NAV_ITEMS = [ROUTES.home, ROUTES.map, ROUTES.trips, ROUTES.places]
export const AUTH_NAV_ITEMS = [ROUTES.login]
export const ADMIN_MENU_ITEMS = [ROUTES['admin-dashboard'], ROUTES['admin-trips'], ROUTES['admin-users'], ROUTES['admin-places'], ROUTES['admin-place-reviews']]
export const ADMIN_ROUTE_KEYS = new Set(['admin-dashboard', 'admin-trips', 'admin-users', 'admin-places', 'admin-place-reviews'])
export const USER_PROTECTED_ROUTE_KEYS = new Set(['map', 'trips', 'trip-create', 'trip-view', 'trip-detail', 'trip-edit'])
