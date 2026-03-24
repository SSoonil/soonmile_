# Soonmile Backend MSA Boundary (v1)

## 현재 상태
- 단일 Spring Boot 앱 안에서 도메인을 분리한 **MSA-ready 구조**로 리팩터링 완료
- 컨트롤러/서비스 경계를 아래처럼 분리

## 도메인 경계
- `Group Service`  
  위치: `com.soonmile.backend.group`  
  책임: 그룹 생성, 초대 생성/수락, 멤버 조회

- `Trip Service`  
  위치: `com.soonmile.backend.trip`  
  책임: 여행 생성, 사진 업로드, 핀/동선 조회, 미분류 조회/수동 배정, 핀 제목/캡션 수정

- `AI Service`  
  위치: `com.soonmile.backend.ai`  
  책임: AI 작업 생성, 상태 조회, 결과 생성/조회  
  의존: `TripService` 읽기 컨텍스트 (`getAiContext`)

## API 레이어
- `GroupController`: `/api/v1/groups`, `/api/v1/invites`, `/api/v1/groups/{groupId}/members`
- `TripController`: `/api/v1/groups/{groupId}/trips`, `/api/v1/trips/**`
- `AiController`: `/api/v1/trips/{tripId}/ai-jobs`, `/api/v1/ai-jobs/**`

## 분리 시 권장 순서
1. `group`를 독립 서비스로 분리 (DB: groups, invites, members)
2. `trip`를 독립 서비스로 분리 (DB: trips, photos, pins)
3. `ai`를 독립 서비스로 분리 (DB: ai_jobs, ai_results)
4. API Gateway 도입 후 라우팅 분기
5. 동기 호출은 REST, 비동기는 이벤트(Outbox + Queue)로 전환

## 다음 기술 단계
- 도메인별 DB 스키마 분리
- 서비스 간 인증(JWT + service-to-service auth)
- 분산 트레이싱(OpenTelemetry)
- 공통 에러 스키마/계약 테스트 도입
