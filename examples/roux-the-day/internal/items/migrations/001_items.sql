-- The team's items: something planned for a day (all day, or at a time of day in the team's
-- zone), assigned to one or more people. Any member may add or change one; only its author or
-- an owner may delete it (items.delete.any).
create table item (
    id          uuid        primary key default gen_random_uuid(),
    title       text        not null check (char_length(title) between 1 and 120),
    notes       text        not null default '' check (char_length(notes) <= 2000),
    day         date        not null,
    at_time     time,       -- null: all day. A wall-clock time in the team's zone, never converted.
    done        boolean     not null default false,
    version     bigint      not null default 0,
    created_at  timestamptz not null,
    created_by  uuid        not null references roux_identity (id),
    modified_at timestamptz not null,
    modified_by uuid        not null references roux_identity (id)
);

create table item_assignee (
    item_id uuid not null references item (id) on delete cascade,
    user_id uuid not null references roux_user (id) on delete cascade,
    primary key (item_id, user_id)
);

create index item_assignee_user on item_assignee (user_id);
create index item_day on item (day);

-- The items list reads this. Assignees are by name (then id), so the first is the one the list
-- sorts by. It names its columns, and shows names only: never an email address.
create view item_list as
select i.id,
       i.title,
       i.notes,
       i.day,
       i.at_time,
       i.done,
       i.version,
       i.created_by,
       coalesce(a.ids, '{}')   as assignee_ids,
       coalesce(a.names, '{}') as assignee_names,
       a.names[1]              as first_assignee_name
  from item i
  left join lateral (
        select array_agg(u.id order by lower(u.display_name), u.id)           as ids,
               array_agg(u.display_name order by lower(u.display_name), u.id) as names
          from item_assignee ia
          join roux_user u on u.id = ia.user_id
         where ia.item_id = i.id) a on true;
