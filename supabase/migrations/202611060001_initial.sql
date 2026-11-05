-- Initial schema for a NEW FindBack project. Never resets existing data.
begin;

create table public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'reviewer'))
);
alter table public.admin_roles enable row level security;
create policy own_role on public.admin_roles for select to authenticated using (user_id = auth.uid());

create function public.is_findback_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_roles where user_id = auth.uid() and role in ('admin','reviewer'));
$$;
revoke all on function public.is_findback_staff() from public;
grant execute on function public.is_findback_staff() to authenticated;

create table public.missing_reports (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  reporter_id uuid not null references auth.users(id),
  full_name text, cnic_pak_id text, approximate_age integer,
  gender text, height text, hair text, eye_color text, clothing text,
  distinguishing_marks text, last_seen_location text, last_seen_date date,
  additional_details text, image_url text, relationship text,
  reporter_phone text, reporter_email text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
create table public.found_reports (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  reporter_id uuid not null references auth.users(id),
  full_name text, cnic_pak_id text, approximate_age integer,
  gender text, height text, hair text, eye_color text, clothing text,
  distinguishing_marks text, found_location text, found_date date, found_time time,
  current_situation text, additional_details text, image_url text,
  reporter_name text, reporter_phone text, reporter_email text, reporter_type text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
alter table public.missing_reports enable row level security;
alter table public.found_reports enable row level security;
create policy missing_insert on public.missing_reports for insert to authenticated with check (reporter_id = auth.uid() and status = 'open');
create policy found_insert on public.found_reports for insert to authenticated with check (reporter_id = auth.uid() and status = 'open');
create policy missing_select on public.missing_reports for select to authenticated using (reporter_id = auth.uid() or public.is_findback_staff());
create policy found_select on public.found_reports for select to authenticated using (reporter_id = auth.uid() or public.is_findback_staff());
create index missing_owner on public.missing_reports(reporter_id);
create index found_owner on public.found_reports(reporter_id);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  missing_report_id uuid not null references public.missing_reports(id),
  found_report_id uuid not null references public.found_reports(id),
  face_score double precision, attribute_score double precision, combined_score double precision,
  match_status text not null default 'potential', review_notes text,
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  identity_verification_method text, identity_verified_by uuid references auth.users(id), identity_verified_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(missing_report_id, found_report_id)
);
alter table public.matches enable row level security;
create policy matches_staff_read on public.matches for select to authenticated using (public.is_findback_staff());

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id),
  match_id uuid references public.matches(id),
  notification_type text not null, case_type text not null default 'demo',
  title text not null, message text not null, is_read boolean not null default false,
  read_at timestamptz, created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
-- Notification access is mediated by authenticated backend endpoints.
create index notifications_recipient on public.notifications(recipient_id, created_at desc);

create table public.recovery_cases (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches(id),
  case_type text not null, case_status text not null default 'pending_coordination',
  assigned_staff_id uuid references auth.users(id), coordination_notes text, resolution_notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.recovery_case_events (
  id uuid primary key default gen_random_uuid(),
  recovery_case_id uuid not null references public.recovery_cases(id),
  performed_by uuid references auth.users(id), previous_status text, new_status text not null,
  notes text, created_at timestamptz not null default now()
);
alter table public.recovery_cases enable row level security;
alter table public.recovery_case_events enable row level security;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('missing-person-images','missing-person-images',false,5242880,array['image/jpeg','image/png']),
  ('found-person-images','found-person-images',false,5242880,array['image/jpeg','image/png']);
create policy report_photo_upload on storage.objects for insert to authenticated
  with check (bucket_id in ('missing-person-images','found-person-images') and (storage.foldername(name))[1] = auth.uid()::text);
create policy report_photo_read on storage.objects for select to authenticated
  using (bucket_id in ('missing-person-images','found-person-images') and ((storage.foldername(name))[1] = auth.uid()::text or public.is_findback_staff()));
create policy report_photo_cleanup on storage.objects for delete to authenticated
  using (bucket_id in ('missing-person-images','found-person-images') and (storage.foldername(name))[1] = auth.uid()::text);

-- Staff roles must be assigned by a trusted project administrator, not by sign-up metadata.
commit;
