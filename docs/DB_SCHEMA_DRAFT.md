# Soonmile DB 스키마 초안 (MVP)

작성일: 2026-03-16  
DB 가정: PostgreSQL 16+, 권장 PostGIS 사용

## 1. 설계 원칙
1. 권한, 동의, AI 결과를 명확히 분리 저장
2. 원본 사진 메타와 AI 추천 결과를 분리해 재실행 가능 구조 유지
3. EXIF 없는 사진 처리 상태를 명시적으로 추적

## 2. Enum 초안

```sql
CREATE TYPE member_role AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE invite_status AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');
CREATE TYPE consent_type AS ENUM ('LOCATION_PHOTO_PROCESSING');
CREATE TYPE consent_action AS ENUM ('AGREE', 'REVOKE');
CREATE TYPE photo_status AS ENUM ('UPLOADED', 'METADATA_PARSED', 'CLUSTERED', 'UNRESOLVED');
CREATE TYPE ai_job_type AS ENUM ('CURATION');
CREATE TYPE ai_job_status AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');
CREATE TYPE review_status AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'REJECTED');
```

## 3. 테이블 초안

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(80) NOT NULL,
    profile_image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role member_role NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (group_id, user_id)
);

CREATE TABLE group_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    invited_email VARCHAR(255),
    invite_code VARCHAR(64) NOT NULL UNIQUE,
    status invite_status NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMPTZ NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    accepted_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ
);

CREATE TABLE consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    consent_type consent_type NOT NULL,
    action consent_action NOT NULL,
    agreed_version VARCHAR(20) NOT NULL,
    acted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address VARCHAR(64),
    user_agent TEXT
);

CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    start_date DATE,
    end_date DATE,
    cover_photo_id UUID,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    thumbnail_key TEXT,
    taken_at TIMESTAMPTZ,
    gps_point GEOGRAPHY(POINT, 4326),
    exif_json JSONB,
    has_exif BOOLEAN NOT NULL DEFAULT false,
    status photo_status NOT NULL DEFAULT 'UPLOADED',
    unresolved_reason VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pin_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    center_point GEOGRAPHY(POINT, 4326) NOT NULL,
    radius_m INTEGER NOT NULL DEFAULT 100,
    representative_taken_at TIMESTAMPTZ,
    title VARCHAR(120),
    caption TEXT,
    created_by_system BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE photo_cluster_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    cluster_id UUID NOT NULL REFERENCES pin_clusters(id) ON DELETE CASCADE,
    assigned_by VARCHAR(20) NOT NULL, -- SYSTEM | AI | USER
    confidence NUMERIC(5,4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (photo_id)
);

CREATE TABLE cluster_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    cluster_id UUID NOT NULL REFERENCES pin_clusters(id) ON DELETE CASCADE,
    sequence_no INTEGER NOT NULL,
    basis VARCHAR(30) NOT NULL DEFAULT 'TIME_ASC',
    UNIQUE (trip_id, sequence_no),
    UNIQUE (trip_id, cluster_id)
);

CREATE TABLE ai_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES users(id),
    job_type ai_job_type NOT NULL DEFAULT 'CURATION',
    status ai_job_status NOT NULL DEFAULT 'QUEUED',
    progress_percent INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_photo_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    group_name VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_photo_group_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ai_group_id UUID NOT NULL REFERENCES ai_photo_groups(id) ON DELETE CASCADE,
    photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    similarity_score NUMERIC(5,4) NOT NULL,
    UNIQUE (ai_group_id, photo_id)
);

CREATE TABLE ai_photo_quality_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
    photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    reason VARCHAR(120) NOT NULL, -- BLUR | DUPLICATE | LOW_LIGHT ...
    score NUMERIC(5,4) NOT NULL,
    review_status review_status NOT NULL DEFAULT 'PENDING_REVIEW',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (job_id, photo_id, reason)
);

CREATE TABLE ai_cluster_contents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
    cluster_id UUID NOT NULL REFERENCES pin_clusters(id) ON DELETE CASCADE,
    suggested_title VARCHAR(120),
    suggested_caption TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (job_id, cluster_id)
);

CREATE TABLE unresolved_photo_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    reason VARCHAR(120) NOT NULL, -- NO_EXIF_AND_LOW_CONFIDENCE ...
    status review_status NOT NULL DEFAULT 'PENDING_REVIEW',
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (photo_id)
);
```

## 4. 인덱스 초안

```sql
CREATE INDEX idx_group_members_group_id ON group_members(group_id);
CREATE INDEX idx_group_members_user_id ON group_members(user_id);
CREATE INDEX idx_trips_group_id ON trips(group_id);
CREATE INDEX idx_photos_trip_id ON photos(trip_id);
CREATE INDEX idx_photos_taken_at ON photos(taken_at);
CREATE INDEX idx_photos_status ON photos(status);
CREATE INDEX idx_photos_gps_point_gist ON photos USING GIST(gps_point);
CREATE INDEX idx_pin_clusters_trip_id ON pin_clusters(trip_id);
CREATE INDEX idx_pin_clusters_center_point_gist ON pin_clusters USING GIST(center_point);
CREATE INDEX idx_cluster_routes_trip_sequence ON cluster_routes(trip_id, sequence_no);
CREATE INDEX idx_ai_jobs_trip_id ON ai_jobs(trip_id);
CREATE INDEX idx_ai_jobs_status ON ai_jobs(status);
CREATE INDEX idx_unresolved_tasks_trip_id_status ON unresolved_photo_tasks(trip_id, status);
```

## 5. 관계 요약
1. `group 1:N trip`
2. `group N:M user` via `group_members`
3. `trip 1:N photo`
4. `trip 1:N pin_cluster`
5. `photo 1:1 photo_cluster_link` (MVP 기준 사진은 하나의 대표 핀에만 속함)
6. `trip 1:N ai_job`
7. `ai_job 1:N ai_photo_groups`, `ai_job 1:N ai_photo_quality_flags`, `ai_job 1:N ai_cluster_contents`

## 6. 정책 반영 포인트
1. 100m 핀 기준은 `pin_clusters.radius_m = 100` 기본값으로 강제
2. EXIF 없는 사진은 `photos.has_exif = false`, 실패 시 `status = UNRESOLVED` + `unresolved_photo_tasks` 생성
3. 동의 이력은 `consents`에 버전 단위 기록
4. 권한은 `group_members.role`로 제어

## 7. 구현 메모
1. 거리 군집화는 PostGIS `ST_DWithin` 사용 권장
2. AI 결과 확정 전까지는 추천 테이블에 저장하고, 사용자 확정 후 운영 필드로 반영
3. 저장소 전략(원본/썸네일/보관주기)은 후속 설계 시 별도 문서화
