ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(20);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS status VARCHAR(20);

UPDATE users
SET role = 'USER'
WHERE role IS NULL
   OR BTRIM(role) = '';

UPDATE users
SET status = 'ACTIVE'
WHERE status IS NULL
   OR BTRIM(status) = '';

ALTER TABLE users
    ALTER COLUMN role SET DEFAULT 'USER';

ALTER TABLE users
    ALTER COLUMN status SET DEFAULT 'ACTIVE';

ALTER TABLE users
    ALTER COLUMN role SET NOT NULL;

ALTER TABLE users
    ALTER COLUMN status SET NOT NULL;

UPDATE users
SET role = 'ADMIN'
WHERE LOWER(email) = 'admin@soonmile.com';
