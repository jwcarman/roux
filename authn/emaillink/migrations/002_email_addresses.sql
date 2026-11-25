-- Adding or changing an address: a signed-in person asks for an address and confirms a link
-- or code sent to it, and only then does it become theirs.
alter table roux_email_credential add column created_at timestamptz not null default now();

-- One pending request per identity (a new one replaces the old). replaces_credential_id names
-- the address a change replaces, checked again at confirmation, so it needs no foreign key.
-- The token is stored as a SHA-256 hash and the code as an HMAC, never the values.
create table roux_email_address_request (
    id                     uuid                     primary key,
    identity_id            uuid                     not null unique references roux_identity (id) on delete cascade,
    address                varchar(320)             not null,
    replaces_credential_id uuid,
    token_hash             varchar(64)              not null unique,
    code_hash              varchar(64)              not null,
    code_attempts          integer                  not null,
    created_at             timestamp with time zone not null,
    expires_at             timestamp with time zone not null
);
create index roux_email_address_request_address_idx on roux_email_address_request (address);
