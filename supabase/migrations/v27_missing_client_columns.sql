-- ════════════════════════════════════════════════════════════════
-- v27_missing_client_columns — עמודות שנוספו ידנית ל-clients לאורך הזמן
-- כל העמודות משתמשות ב-IF NOT EXISTS כדי להיות idempotent
-- ════════════════════════════════════════════════════════════════

-- ── פרטי לקוח ────────────────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_name              TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email                  TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone                  TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS must_reset_password    BOOLEAN NOT NULL DEFAULT FALSE;

-- ── מצב חשבון ────────────────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_blocked             BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS archived_at            TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS deleted_at             TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS deletion_reason        TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_active            TIMESTAMPTZ;

-- ── פורטפוליו והגשה ──────────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portfolio_open         BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portfolio_opened_at    TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS submitted_at           TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS submission_notes       TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS plan                   TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cycle_start_day        INT DEFAULT 1;

-- ── מסמכים נדרשים ────────────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS required_docs          JSONB NOT NULL DEFAULT '[]';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS custom_docs            JSONB NOT NULL DEFAULT '[]';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS doc_notes              JSONB NOT NULL DEFAULT '{}';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS questionnaire_spouses  INT NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS no_payslip_reason_s1   TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS no_payslip_reason_s2   TEXT;

-- ── הגדרות אישיות ────────────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS hidden_cats            TEXT[] NOT NULL DEFAULT '{}';

-- ── סנכרון מקס ───────────────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS max_session_active     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS max_last_sync          TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS max_session_expires_at TIMESTAMPTZ;
