# Soonmile API 명세 (Frontend-Backend 계약, MVP v1)

작성일: 2026-03-16  
Base URL: `/api/v1`  
Auth: `Authorization: Bearer <JWT>` (MVP 가정)  
Content-Type: `application/json` (파일 업로드는 `multipart/form-data`)

## 1. 공통 규칙
1. 시간은 ISO-8601 UTC 문자열 사용
2. UUID 문자열 사용
3. 에러 응답 포맷 고정

```json
{
  "errorCode": "FORBIDDEN",
  "message": "권한이 없습니다.",
  "traceId": "f70f8f64-9f3f-4f45-9ec2-9f88fd31fd5e"
}
```

## 2. 권한 규칙
1. OWNER: 그룹 초대/멤버 권한변경/여행 삭제/핀 캡션 확정 가능
2. MEMBER: 그룹 내 사진 업로드/조회 가능, 삭제/핵심 수정 불가

## 3. 동의 정책 규칙
1. 그룹 생성 시 동의 필요
2. 초대 수락 시 동의 필요
3. 동의 없으면 업로드/AI 요청 차단

## 4. API 목록

### 4.1 그룹 생성
`POST /groups`

Request:
```json
{
  "name": "2026 도쿄 워크숍",
  "description": "팀 여행 사진 정리",
  "consent": {
    "type": "LOCATION_PHOTO_PROCESSING",
    "agreedVersion": "2026-03-16"
  }
}
```

Response `201`:
```json
{
  "groupId": "3e3d22e1-2ab0-4a93-b315-1f592ee35e9e",
  "name": "2026 도쿄 워크숍",
  "myRole": "OWNER"
}
```

### 4.2 그룹 초대 링크 생성
`POST /groups/{groupId}/invites`

Request:
```json
{
  "invitedEmail": "member@example.com",
  "expiresInHours": 72
}
```

Response `201`:
```json
{
  "inviteId": "87d8f234-df22-492b-872b-f56c2810f79f",
  "inviteCode": "Q8NKM3J4R2",
  "inviteUrl": "https://soonmile.app/invite/Q8NKM3J4R2",
  "expiresAt": "2026-03-19T10:00:00Z"
}
```

### 4.3 초대 수락
`POST /invites/{inviteCode}/accept`

Request:
```json
{
  "consent": {
    "type": "LOCATION_PHOTO_PROCESSING",
    "agreedVersion": "2026-03-16"
  }
}
```

Response `200`:
```json
{
  "groupId": "3e3d22e1-2ab0-4a93-b315-1f592ee35e9e",
  "myRole": "MEMBER",
  "joinedAt": "2026-03-16T11:21:30Z"
}
```

### 4.4 그룹 멤버 조회
`GET /groups/{groupId}/members`

Response `200`:
```json
{
  "items": [
    {
      "userId": "7d006fc9-e6ad-42ce-8cd8-0f97e027f340",
      "displayName": "Kim",
      "role": "OWNER"
    },
    {
      "userId": "11d2830f-2f0f-4c9c-bf5a-b18fca562ee7",
      "displayName": "Lee",
      "role": "MEMBER"
    }
  ]
}
```

### 4.5 여행 생성
`POST /groups/{groupId}/trips`

Request:
```json
{
  "name": "도쿄 3박4일",
  "startDate": "2026-03-01",
  "endDate": "2026-03-04"
}
```

Response `201`:
```json
{
  "tripId": "ab6db515-1810-4499-b23b-8ea611f266be",
  "name": "도쿄 3박4일"
}
```

### 4.6 여행 사진 업로드
`POST /trips/{tripId}/photos` (`multipart/form-data`)

Form fields:
1. `files[]`: 이미지 파일 다중

Response `202`:
```json
{
  "acceptedCount": 120,
  "photoIds": [
    "4c1f0ed0-7666-4faf-a30c-1e8f7222666a",
    "4e3fda3f-5ccf-4ec7-ac33-f86b492a4a57"
  ],
  "message": "업로드가 수락되었습니다. 메타데이터 파싱이 진행됩니다."
}
```

### 4.7 여행 핀 목록 조회
`GET /trips/{tripId}/pins`

Query:
1. `includeRoute=true|false` (기본 `true`)

Response `200`:
```json
{
  "clusterRuleMeters": 100,
  "pins": [
    {
      "pinId": "2cc01f2d-3224-4fb6-93ad-05f49ca34363",
      "lat": 35.681236,
      "lng": 139.767125,
      "photoCount": 32,
      "representativeTakenAt": "2026-03-02T01:15:02Z",
      "title": "도쿄역 도착",
      "caption": "비가 조금 왔지만 설렜던 시작"
    }
  ],
  "route": [
    {
      "pinId": "2cc01f2d-3224-4fb6-93ad-05f49ca34363",
      "sequenceNo": 1
    }
  ]
}
```

### 4.8 핀 상세 사진 조회
`GET /trips/{tripId}/pins/{pinId}/photos`

Response `200`:
```json
{
  "pinId": "2cc01f2d-3224-4fb6-93ad-05f49ca34363",
  "items": [
    {
      "photoId": "4c1f0ed0-7666-4faf-a30c-1e8f7222666a",
      "thumbnailUrl": "https://cdn.soonmile.app/thumb/....jpg",
      "takenAt": "2026-03-02T01:15:02Z",
      "uploadedBy": "Kim"
    }
  ]
}
```

### 4.9 미분류 사진 조회
`GET /trips/{tripId}/photos/unresolved`

Response `200`:
```json
{
  "items": [
    {
      "photoId": "bed186d6-b201-48d0-bac0-531f78d385ed",
      "thumbnailUrl": "https://cdn.soonmile.app/thumb/...jpg",
      "reason": "NO_EXIF_AND_LOW_CONFIDENCE"
    }
  ]
}
```

### 4.10 미분류 사진 수동 배정
`POST /trips/{tripId}/photos/manual-assignment`

Request:
```json
{
  "photoIds": [
    "bed186d6-b201-48d0-bac0-531f78d385ed"
  ],
  "target": {
    "type": "EXISTING_PIN",
    "pinId": "2cc01f2d-3224-4fb6-93ad-05f49ca34363"
  }
}
```

`target.type = NEW_PIN` 예시:
```json
{
  "photoIds": ["bed186d6-b201-48d0-bac0-531f78d385ed"],
  "target": {
    "type": "NEW_PIN",
    "lat": 35.6895,
    "lng": 139.6917,
    "title": "수동 추가 핀"
  }
}
```

Response `200`:
```json
{
  "assignedCount": 1,
  "unresolvedRemaining": 4
}
```

### 4.11 AI 큐레이션 작업 요청
`POST /trips/{tripId}/ai-jobs`

Request:
```json
{
  "type": "CURATION"
}
```

Response `202`:
```json
{
  "jobId": "e2dfcb72-3cf4-4100-8c88-b2308abf2d5d",
  "status": "QUEUED"
}
```

### 4.12 AI 작업 상태 조회
`GET /ai-jobs/{jobId}`

Response `200`:
```json
{
  "jobId": "e2dfcb72-3cf4-4100-8c88-b2308abf2d5d",
  "status": "RUNNING",
  "progressPercent": 64,
  "startedAt": "2026-03-16T11:30:00Z",
  "finishedAt": null
}
```

### 4.13 AI 결과 조회
`GET /ai-jobs/{jobId}/result`

Response `200`:
```json
{
  "similarPhotoGroups": [
    {
      "groupId": "1de39a83-ebf3-4c6b-bbf9-e89f5b0d70bf",
      "groupName": "도쿄타워 야경",
      "photoIds": [
        "4c1f0ed0-7666-4faf-a30c-1e8f7222666a"
      ]
    }
  ],
  "qualityFlags": [
    {
      "photoId": "11551011-c68c-4648-a1c7-34f9334de729",
      "reason": "BLUR",
      "score": 0.92
    }
  ],
  "pinContents": [
    {
      "pinId": "2cc01f2d-3224-4fb6-93ad-05f49ca34363",
      "suggestedTitle": "도쿄역의 첫 걸음",
      "suggestedCaption": "설렘과 기대가 시작된 순간"
    }
  ],
  "unresolvedPhotos": [
    {
      "photoId": "bed186d6-b201-48d0-bac0-531f78d385ed",
      "reason": "NO_EXIF_AND_LOW_CONFIDENCE"
    }
  ]
}
```

### 4.14 핀 제목/캡션 확정 (OWNER 전용)
`PATCH /trips/{tripId}/pins/{pinId}`

Request:
```json
{
  "title": "도쿄역 도착",
  "caption": "여행의 시작점"
}
```

Response `200`:
```json
{
  "pinId": "2cc01f2d-3224-4fb6-93ad-05f49ca34363",
  "title": "도쿄역 도착",
  "caption": "여행의 시작점"
}
```

## 5. 상태 코드 규약
1. `200` 조회/수정 성공
2. `201` 생성 성공
3. `202` 비동기 작업 수락
4. `400` 유효성 오류
5. `401` 인증 실패
6. `403` 권한 부족
7. `404` 리소스 없음
8. `409` 상태 충돌
9. `422` 도메인 규칙 위반 (예: 동의 미완료)
10. `500` 서버 오류

## 6. 프론트 구현 메모
1. 업로드 후 즉시 `pins`를 다시 조회하지 말고 메타 처리 상태를 폴링한 뒤 조회
2. AI 결과는 `ai-jobs/{jobId}` 상태가 `SUCCEEDED`일 때만 상세 조회
3. `unresolved`가 0이 아닐 경우 완료 배너 대신 보정 CTA를 우선 노출
4. 지도 핀 집계 기준값은 API 응답 `clusterRuleMeters`를 신뢰해 표기
