-- Restore John Doe (cmic0pmax0000ume0vhr3dwol / +4745938863) to a global super admin.
-- Cleans up the temporary selskapsbruker/selskapsadmin accesses used for the kunde profile.
BEGIN;

UPDATE users
SET role = 'super_admin',
    updated_at = NOW()
WHERE id = 'cmic0pmax0000ume0vhr3dwol';

DELETE FROM user_customer_accesses
WHERE user_id = 'cmic0pmax0000ume0vhr3dwol'
  AND customer_id IN (2228, 1075);

COMMIT;
