-- Switch John Doe (cmic0pmax0000ume0vhr3dwol / +4745938863) to a kundebruker.
-- Ensures selskapsbruker access for customer 2228 and selskapsadmin access for customer 1075.
BEGIN;

UPDATE users
SET role = 'customer',
    updated_at = NOW()
WHERE id = 'cmic0pmax0000ume0vhr3dwol';

DELETE FROM user_customer_accesses
WHERE user_id = 'cmic0pmax0000ume0vhr3dwol'
  AND customer_id NOT IN (2228, 1075);

INSERT INTO user_customer_accesses (user_id, customer_id, role)
VALUES 
    ('cmic0pmax0000ume0vhr3dwol', 2228, 'user'),
    ('cmic0pmax0000ume0vhr3dwol', 1075, 'admin')
ON CONFLICT (user_id, customer_id)
DO UPDATE
SET role = EXCLUDED.role;

COMMIT;
