-- Commands run with an Idempotency-Key: the key, and what the command answered, so a repeat of the
-- same key (a double click, a retry after a dropped response) answers the first result again.
create table command_log (
    key        uuid        primary key,
    name       text        not null,
    caller     uuid        not null,
    result     jsonb,
    created_at timestamptz not null default now()
);
