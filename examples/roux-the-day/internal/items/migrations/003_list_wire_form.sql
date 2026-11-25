-- The list's row reads each column in the form it answers: the day as 2026-11-24 and the time as
-- 10:30 (null all day). day and at_time stay as they are, for the filters and the sorts.
create or replace view item_list as
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
       a.names[1]              as first_assignee_name,
       to_char(i.day, 'YYYY-MM-DD')   as day_text,
       to_char(i.at_time, 'HH24:MI')  as at_text
  from item i
  left join lateral (
        select array_agg(u.id order by lower(u.display_name), u.id)           as ids,
               array_agg(u.display_name order by lower(u.display_name), u.id) as names
          from item_assignee ia
          join roux_user u on u.id = ia.user_id
         where ia.item_id = i.id) a on true;
