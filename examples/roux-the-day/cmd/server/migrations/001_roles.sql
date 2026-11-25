-- This application's own roles and what each grants. OWNER is the kit's: it holds every
-- permission (each module's migration grants it its own). USER is anyone invited: it
-- may see the team (users.read) and nothing else yet. A new permission is a constant in
-- the module that checks it and a migration of its own here (a migration that has run
-- is never edited).
insert into roux_role (id, name) values (gen_random_uuid(), 'USER') on conflict (name) do nothing;
insert into roux_role_permission (role_id, permission)
select r.id, 'users.read' from roux_role r where r.name = 'USER'
on conflict do nothing;
