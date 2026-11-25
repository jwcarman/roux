-- Email addresses as credentials, and the one live sign-in link and code per address.
create table roux_email_credential (
    id      uuid         primary key,
    address varchar(320) not null unique
);

-- token_hash is the SHA-256 of the link's token; code_hash is an HMAC of the typed
-- code keyed with the server's secret. Neither value is stored. One row per
-- credential: a new request replaces it. code_attempts counts wrong codes.
create table roux_email_link_token (
    credential_id uuid                     primary key references roux_email_credential (id) on delete cascade,
    token_hash    varchar(64)              not null unique,
    code_hash     varchar(64)              not null,
    code_attempts integer                  not null,
    created_at    timestamp with time zone not null,
    expires_at    timestamp with time zone not null
);
