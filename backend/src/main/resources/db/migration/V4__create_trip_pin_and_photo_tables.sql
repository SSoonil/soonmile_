CREATE TABLE IF NOT EXISTS trip_pins (
    id UUID PRIMARY KEY,
    trip_id UUID NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    title VARCHAR(200) NOT NULL,
    caption TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trip_pins_trip_id ON trip_pins (trip_id);

CREATE TABLE IF NOT EXISTS trip_photos (
    id UUID PRIMARY KEY,
    trip_id UUID NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
    pin_id UUID REFERENCES trip_pins (id) ON DELETE SET NULL,
    file_name VARCHAR(260),
    file_path TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    taken_at TIMESTAMPTZ,
    uploaded_by VARCHAR(120) NOT NULL,
    unresolved BOOLEAN NOT NULL DEFAULT FALSE,
    unresolved_reason VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trip_photos_trip_id ON trip_photos (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_photos_pin_id ON trip_photos (pin_id);
