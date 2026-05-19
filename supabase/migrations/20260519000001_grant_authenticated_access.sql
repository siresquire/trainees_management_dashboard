-- Grant table-level permissions to authenticated and anon roles.
-- RLS policies (already in place) control row-level access;
-- these grants just allow the roles to attempt queries at all.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

grant select
  on all tables in schema public
  to anon;

grant usage, select
  on all sequences in schema public
  to authenticated, anon;

grant execute
  on all routines in schema public
  to authenticated, anon;

-- Apply the same defaults so future tables/functions are covered automatically
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant select on tables to anon;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, anon;

alter default privileges in schema public
  grant execute on routines to authenticated, anon;
