-- The business activity log: what happened to a record, kept as written at the time.
-- anchor_id is the record it happened to; related_ids are other records it concerns, so
-- an event shows in the history of each.
create table roux_activity (
    id          uuid         primary key,
    occurred_at timestamptz  not null,
    actor_id    uuid,
    anchor_id   uuid         not null,
    related_ids uuid[]       not null default '{}',
    type        varchar(100) not null,
    description varchar(500) not null,
    details     jsonb        not null
);
create index ix_roux_activity_anchor  on roux_activity (anchor_id, occurred_at desc, id desc);
create index ix_roux_activity_related on roux_activity using gin (related_ids);
