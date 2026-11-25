-- API keys. Only the SHA-256 of a key is stored: the key itself is shown once, when it is made.
-- scopes are permissions its owner held when it was made; at each request they are intersected
-- with what the owner holds then. Revoking a key deletes its row.
create table roux_api_key (
    id           uuid         primary key,
    identity_id  uuid         not null references roux_identity (id) on delete cascade,
    name         varchar(255) not null,
    scopes       text[]       not null,
    key_hash     varchar(64)  not null unique,
    created_at   timestamptz  not null,
    expires_at   timestamptz  not null,
    last_used_at timestamptz
);
create index roux_api_key_identity_idx on roux_api_key (identity_id, name);
