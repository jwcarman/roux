-- Passkeys. A person's passkeys belong to a WebAuthn "user", which exists only to give
-- the authenticator an opaque handle: 64 random bytes, never derived from the identity
-- or the address. Each passkey is also a credential of the identity (a row in
-- roux_credential_identity, keyed by credential_uuid), like an email address is.
create table roux_passkey_user (
    user_handle  bytea        primary key,
    identity_id  uuid         not null unique references roux_identity (id) on delete cascade,
    name         varchar(320) not null,   -- shown in the browser's picker
    display_name varchar(320)
);

-- credential is the library's whole record (public key, flags, sign count, transports...);
-- webauthn_id is the authenticator's credential id, indexed to find a passkey at sign-in.
create table roux_passkey_credential (
    credential_uuid uuid         primary key,
    webauthn_id     bytea        not null unique,
    user_handle     bytea        not null references roux_passkey_user (user_handle) on delete cascade,
    credential      jsonb        not null,
    label           varchar(64)  not null,
    created_at      timestamptz  not null,
    last_used_at    timestamptz
);
create index roux_passkey_credential_user_idx on roux_passkey_credential (user_handle);

-- A ceremony in progress: the challenge and what goes with it, behind a short-lived
-- cookie whose hash is the key. Single use: finishing deletes the row. Expired rows are
-- cleared as new ones are made.
create table roux_passkey_ceremony (
    token_hash  varchar(64)  primary key,
    kind        varchar(20)  not null,   -- 'sign-in' or 'register'
    identity_id uuid,                    -- who is registering, for 'register'
    session     jsonb        not null,
    expires_at  timestamptz  not null
);
create index roux_passkey_ceremony_expires_idx on roux_passkey_ceremony (expires_at);
