CREATE TABLE IF NOT EXISTS admin_voucher_pool (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_code text        NOT NULL UNIQUE,
  level        text        NOT NULL CHECK (level IN ('practitioner', 'associate')),
  is_used      boolean     NOT NULL DEFAULT false,
  trainee_id   uuid        REFERENCES trainees(id),
  issued_by    uuid        REFERENCES profiles(id),
  issued_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_voucher_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_vouchers" ON admin_voucher_pool
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

GRANT ALL ON admin_voucher_pool TO authenticated;
GRANT ALL ON admin_voucher_pool TO service_role;
