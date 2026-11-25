-- A user is an identity with the name the app shows for them. who owns status,
-- sign-in addresses and roles, which are read from their own tables and never copied
-- here; an app's own data about a person belongs on a table of its own that shares
-- this id.
create table roux_user (
    id                 uuid         primary key references roux_identity (id) on delete cascade,
    version            bigint       not null,
    display_name       varchar(80)  not null,
    first_signed_in_at timestamptz,
    created_date       timestamptz,
    modified_date      timestamptz,
    created_by         varchar(64),
    modified_by        varchar(64)
);

-- The users as the app shows them. email is the identity's oldest address; role is
-- the first by name; invited is true until they first sign in (first_signed_in_at is
-- recorded when they do, because sessions are purged and "has a session" cannot tell).
create view roux_user_directory as
select u.id,
       u.version,
       u.display_name,
       (select e.address
          from roux_credential_identity ci
          join roux_email_credential e on e.id = ci.credential_id
         where ci.identity_id = u.id
         order by e.id
         limit 1) as email,
       (select r.name
          from roux_identity_role ir
          join roux_role r on r.id = ir.role_id
         where ir.identity_id = u.id
         order by r.name
         limit 1) as role,
       case when i.status = 'ACTIVE' then 'ACTIVE' else 'DEACTIVATED' end as status,
       i.created_at as joined_at,
       (u.first_signed_in_at is null
        and not exists (select 1 from roux_session s where s.identity_id = u.id)) as invited
  from roux_user u
  join roux_identity i on i.id = u.id;

-- OWNER may do everything with users.
insert into roux_role_permission (role_id, permission)
select r.id, p.permission
  from roux_role r
 cross join (values ('users.read'), ('users.invite'), ('users.manage'), ('users.owners')) as p(permission)
 where r.name = 'OWNER'
on conflict do nothing;
