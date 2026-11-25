-- Every member may read and write items; only an owner may delete one they did not write.
insert into roux_role_permission (role_id, permission)
select r.id, p.permission
  from roux_role r
 cross join (values ('items.read'), ('items.write')) as p(permission)
 where r.name in ('USER', 'OWNER')
on conflict do nothing;

insert into roux_role_permission (role_id, permission)
select r.id, 'items.delete.any' from roux_role r where r.name = 'OWNER'
on conflict do nothing;
