ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS pin_color VARCHAR(7);

UPDATE trips
SET pin_color = NULL
WHERE pin_color IS NOT NULL
  AND pin_color !~ '^#[0-9A-Fa-f]{6}$';

DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_trips_pin_color_hex'
    ) THEN
        ALTER TABLE trips
            ADD CONSTRAINT ck_trips_pin_color_hex
                CHECK (pin_color IS NULL OR pin_color ~ '^#[0-9A-Fa-f]{6}$');
    END IF;
END
$$;
