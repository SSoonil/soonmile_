CREATE TABLE IF NOT EXISTS trip_members (
    id UUID PRIMARY KEY,
    trip_id UUID NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_trip_members_trip_user UNIQUE (trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_members_trip_id ON trip_members (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_user_id ON trip_members (user_id);
