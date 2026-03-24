ALTER TABLE auth_identities
    ADD COLUMN IF NOT EXISTS provider_email VARCHAR(320);

ALTER TABLE auth_identities
    ADD COLUMN IF NOT EXISTS provider_display_name VARCHAR(120);

ALTER TABLE auth_identities
    ADD COLUMN IF NOT EXISTS provider_profile_json TEXT;

