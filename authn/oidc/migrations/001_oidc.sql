-- A provider account linked to an identity: the credential is (issuer, subject), never an
-- email address. The row's id is also the credential's id in roux_credential_identity, like an
-- email address or a passkey.
create table roux_federated_credential (
    id         uuid          primary key,
    issuer     varchar(512)  not null,
    subject    varchar(255)  not null,
    created_at timestamptz   not null,
    unique (issuer, subject)
);

-- A sign-in (or link) on its way to the provider and back: the state, nonce and PKCE verifier,
-- behind a short-lived cookie whose hash is the key. Single use: the callback deletes the row.
-- identity_id is set when the person asked to link an account while signed in.
create table roux_oidc_flow (
    token_hash  varchar(64)  primary key,
    state_hash  varchar(64)  not null,
    nonce       varchar(64)  not null,
    verifier    varchar(128) not null,
    provider    varchar(64)  not null,
    identity_id uuid,
    started_at  timestamptz  not null,
    expires_at  timestamptz  not null
);
create index roux_oidc_flow_expires_idx on roux_oidc_flow (expires_at);

-- A provider account the person has not yet confirmed: nothing is created or linked until
-- they do. identity_id is set for a link, null for a sign-up. Behind a cookie, single use.
create table roux_oidc_pending (
    token_hash     varchar(64)  primary key,
    provider       varchar(64)  not null,
    issuer         varchar(512) not null,
    subject        varchar(255) not null,
    display_name   varchar(320) not null,
    claims         jsonb        not null,
    verified_email varchar(320),
    identity_id    uuid,
    expires_at     timestamptz  not null
);
create index roux_oidc_pending_expires_idx on roux_oidc_pending (expires_at);
