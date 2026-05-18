create type access_request_status as enum ('pending', 'approved', 'denied');

create table access_requests (
  id           uuid                   primary key default gen_random_uuid(),
  full_name    text                   not null,
  email        text                   not null,
  reason       text,
  status       access_request_status  not null default 'pending',
  created_at   timestamptz            not null default now(),
  reviewed_by  uuid                   references auth.users(id),
  reviewed_at  timestamptz
);

-- Only SA can read / update; public (anon) can insert pending requests
alter table access_requests enable row level security;

create policy "SA can manage access requests"
  on access_requests for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'super_admin'
    )
  );

create policy "Anyone can submit a request"
  on access_requests for insert
  with check (status = 'pending');
