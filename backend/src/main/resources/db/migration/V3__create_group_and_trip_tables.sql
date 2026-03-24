CREATE TABLE IF NOT EXISTS travel_groups (
    id UUID PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    created_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_travel_groups_created_by_user_id ON travel_groups (created_by_user_id);

CREATE TABLE IF NOT EXISTS group_members (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES travel_groups (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    display_name VARCHAR(120) NOT NULL,
    role VARCHAR(20) NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_group_members_group_user UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members (user_id);

CREATE TABLE IF NOT EXISTS group_invites (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES travel_groups (id) ON DELETE CASCADE,
    invited_email VARCHAR(320) NOT NULL,
    invite_code VARCHAR(40) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_at TIMESTAMPTZ,
    accepted_user_id UUID REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_group_invites_group_id ON group_invites (group_id);

CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES travel_groups (id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    start_date DATE,
    end_date DATE,
    created_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trips_group_id ON trips (group_id);
CREATE INDEX IF NOT EXISTS idx_trips_created_by_user_id ON trips (created_by_user_id);
