ALTER TABLE admins ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password';
ALTER TABLE admins ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX idx_admins_google_sub ON admins (google_sub) WHERE google_sub IS NOT NULL;
