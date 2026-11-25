-- The owner's theme: one row, put here by this migration. A part that is null has not
-- been chosen yet, and the application's defaults stand for it.
create table roux_theme (
    id            uuid        primary key,
    version       bigint      not null,
    app_name      varchar(60),
    palette       varchar(16),
    brand_color   varchar(7),
    shape         varchar(16),
    heading_font  varchar(16),
    body_font     varchar(16),
    created_date  timestamptz,
    modified_date timestamptz,
    created_by    varchar(64),
    modified_by   varchar(64)
);
insert into roux_theme (id, version) values ('00000000-0000-0000-0000-000000000001', 0);

insert into roux_role_permission (role_id, permission)
select r.id, 'theme.manage' from roux_role r where r.name = 'OWNER'
on conflict do nothing;
