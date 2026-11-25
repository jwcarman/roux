-- Roles, and the permissions each grants. A person's permissions are the union of
-- their roles'. Roles are named, never referred to by id, so a migration can add one
-- or grant it a permission without knowing anything about the database it runs on.
create table roux_role (
    id   uuid         primary key,
    name varchar(100) not null unique
);

create table roux_role_permission (
    role_id    uuid         not null references roux_role (id) on delete cascade,
    permission varchar(255) not null,
    primary key (role_id, permission)
);

create table roux_identity_role (
    identity_id uuid not null references roux_identity (id) on delete cascade,
    role_id     uuid not null references roux_role (id)     on delete cascade,
    primary key (identity_id, role_id)
);
create index roux_identity_role_role_idx on roux_identity_role (role_id);

-- OWNER holds every permission there is: roux makes the first holder at startup, and
-- only owners may manage people, so the last active one cannot be removed. Its
-- identity permissions are who-admin's; each module grants OWNER its own in its migration.
insert into roux_role (id, name) values (gen_random_uuid(), 'OWNER') on conflict (name) do nothing;
insert into roux_role_permission (role_id, permission)
select r.id, p.permission
  from roux_role r
 cross join (values ('who.identities.read'), ('who.identities.manage')) as p(permission)
 where r.name = 'OWNER'
on conflict do nothing;
