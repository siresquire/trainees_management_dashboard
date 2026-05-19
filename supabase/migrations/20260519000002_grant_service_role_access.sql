-- Grant table-level permissions to service_role.
-- The authenticated/anon grants are in 20260519000001.
-- service_role is used by the service client (bypasses RLS) and needs
-- table-level SELECT/INSERT/UPDATE/DELETE to run direct queries.

grant select, insert, update, delete
  on all tables in schema public
  to service_role;

grant usage, select
  on all sequences in schema public
  to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;
