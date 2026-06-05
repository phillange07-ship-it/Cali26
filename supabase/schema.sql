create extension if not exists "pgcrypto";

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_code text not null default 'cali26-2026',
  person text not null,
  paid_by text generated always as (person) stored,
  amount numeric(10,2) not null check (amount >= 0),
  subtotal_amount numeric(10,2) not null default 0 check (subtotal_amount >= 0),
  tip_amount numeric(10,2) not null default 0 check (tip_amount >= 0),
  description text not null,
  category text not null default 'Sonstiges',
  date date not null default current_date,
  split_mode text not null default 'equal' check (split_mode in ('equal', 'custom')),
  participant_count integer not null default 1 check (participant_count >= 1),
  participants jsonb not null default '[]'::jsonb,
  notes text,
  receipt_path text,
  receipt_url text,
  created_at timestamptz not null default now()
);

alter table public.expenses
  add column if not exists participants jsonb not null default '[]'::jsonb;

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  trip_code text not null default 'cali26-2026',
  person text not null,
  food_amount numeric(10,2) not null default 0 check (food_amount >= 0),
  tip_amount numeric(10,2) not null default 0 check (tip_amount >= 0),
  total_amount numeric(10,2) not null default 0 check (total_amount >= 0),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.spots (
  id text primary key,
  trip_code text not null default 'cali26-2026',
  name text not null,
  category text not null,
  address text,
  lat double precision not null,
  lng double precision not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.spots
  add column if not exists address text;

create table if not exists public.itinerary_days (
  date date primary key,
  trip_code text not null default 'cali26-2026',
  title text not null,
  summary text not null,
  notes text not null default '',
  plan_items_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.spots enable row level security;
alter table public.itinerary_days enable row level security;

drop policy if exists "anon expenses read" on public.expenses;
create policy "anon expenses read"
on public.expenses
for select
to anon
using (true);

drop policy if exists "anon expenses write" on public.expenses;
create policy "anon expenses write"
on public.expenses
for all
to anon
using (true)
with check (true);

drop policy if exists "anon expense_splits read" on public.expense_splits;
create policy "anon expense_splits read"
on public.expense_splits
for select
to anon
using (true);

drop policy if exists "anon expense_splits write" on public.expense_splits;
create policy "anon expense_splits write"
on public.expense_splits
for all
to anon
using (true)
with check (true);

drop policy if exists "anon spots read" on public.spots;
create policy "anon spots read"
on public.spots
for select
to anon
using (true);

drop policy if exists "anon spots write" on public.spots;
create policy "anon spots write"
on public.spots
for all
to anon
using (true)
with check (true);

drop policy if exists "anon itinerary_days read" on public.itinerary_days;
create policy "anon itinerary_days read"
on public.itinerary_days
for select
to anon
using (true);

drop policy if exists "anon itinerary_days write" on public.itinerary_days;
create policy "anon itinerary_days write"
on public.itinerary_days
for all
to anon
using (true)
with check (true);

insert into public.spots (id, name, category, lat, lng, note)
values
  ('lax', 'Los Angeles Airport LAX', 'travel', 33.9416, -118.4085, 'Ankunft, Rueckflug und Mietwagen-Abholung.'),
  ('san-gabriel-house', 'Gaestehaus San Gabriel', 'stay', 34.0961, -118.1058, 'Unterkunft 05.09.-12.09. · Check-in ab 15:00 · Check-out bis 11:00')
on conflict (id) do nothing;

insert into public.itinerary_days (date, title, summary, notes, plan_items_text)
values
  ('2026-09-05', 'Ankunft in LA', 'BER nach LAX, Mietwagen abholen und nach San Gabriel fahren.', '', ''),
  ('2026-09-06', 'Santa Monica & Venice', 'Erster voller Tag am Wasser, entspannt starten.', '', '')
on conflict (date) do nothing;
