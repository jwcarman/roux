-- Identities and their sessions. A credential (an email address, later a passkey
-- or a linked account) belongs to one identity; the credential tables live with
-- the sign-in method that owns them.
create table roux_identity (
    id         uuid                     primary key,
    status     varchar(20)              not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null
);

create table roux_credential_identity (
    credential_id uuid primary key,
    identity_id   uuid not null references roux_identity (id) on delete cascade
);
create index roux_credential_identity_identity_idx on roux_credential_identity (identity_id);

-- One row per browser session. token_hash is the SHA-256 of the session cookie's
-- value: the cookie itself is never stored, and the row's id (which the account
-- endpoints show to the person) is not the cookie, so listing sessions never
-- reveals anything that could be used as one.
create table roux_session (
    id             uuid                     primary key,
    identity_id    uuid                     not null references roux_identity (id) on delete cascade,
    credential_id  uuid                     not null,
    sign_in_method varchar(30)              not null,
    signed_in_at   timestamp with time zone not null,
    last_seen_at   timestamp with time zone not null,
    user_agent     varchar(512),
    ended_at       timestamp with time zone,
    token_hash     varchar(64)              not null unique
);
create index roux_session_identity_idx  on roux_session (identity_id);
create index roux_session_last_seen_idx on roux_session (last_seen_at);
create index roux_session_ended_idx     on roux_session (ended_at);
