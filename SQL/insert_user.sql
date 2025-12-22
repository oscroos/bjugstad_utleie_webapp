INSERT INTO users (
        id,
        phone,
        name,
        email,
        email_verified,
        address_street,
        address_postal_code,
        address_region,
        accepted_terms,
        accepted_terms_at,
        accepted_terms_version,
        created_at,
        updated_at,
        role
    )
VALUES (
        'cmic0pmax0000ume0vhr3dwol',
        '+4745938863',
        'John Doe',
        NULL,
        NULL,
        'Norway Street 1',
        '1234',
        'Oslo',
        FALSE,
        NULL,
        NULL,
        NOW(),
        NOW(),
        'super_admin'
    );