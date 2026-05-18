-- Short display code shown to trainees on the login page (e.g. "GHACC62")
alter table cohorts add column code_name text;

-- Extend access_requests with extra fields and a role column
alter table access_requests
  add column institution    text,
  add column town           text,
  add column region         text,
  add column phone          text,
  add column requested_role text not null default 'quiz_creator';
