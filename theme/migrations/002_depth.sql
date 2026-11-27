-- How the cards sit on the page: "flat" or "raised". Null has not been chosen yet, and
-- the application's default stands for it.
alter table roux_theme add column depth varchar(16);
