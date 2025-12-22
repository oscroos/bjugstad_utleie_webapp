-- Replace the customer_id values with the two companies where the user should be a non-admin (selskapsbruker).
WITH target_user AS (
    SELECT id
    FROM users
    WHERE REPLACE(phone, ' ', '') = '+4745938863'
),
new_accesses AS (
    SELECT tu.id AS user_id, c.customer_id
    FROM target_user tu
    CROSS JOIN (VALUES
        (2),
        (3)
    ) AS c(customer_id)
),
updated_user AS (
    UPDATE users u
    SET role = 'customer',
        accepted_terms = FALSE
    FROM target_user tu
    WHERE u.id = tu.id
    RETURNING u.id
)
INSERT INTO user_customer_accesses (user_id, customer_id, role)
SELECT na.user_id, na.customer_id, 'user'
FROM new_accesses na
ON CONFLICT (user_id, customer_id) DO UPDATE
SET role = EXCLUDED.role;
