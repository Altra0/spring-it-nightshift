// Idempotent DDL, run once per process. Mirrors schema.ts so a fresh Neon branch
// or local PGlite works without a migration step.
export const BOOTSTRAP_SQL = `
create table if not exists buildings (
  id text primary key, name text not null, created_at timestamptz not null default now());
create table if not exists locations (
  id text primary key, building_id text not null, name text not null, aliases text not null default '');
create table if not exists facts (
  id text primary key, building_id text not null, text text not null,
  status text not null default 'active', replaced_by text, source text not null,
  created_at timestamptz not null default now());
create table if not exists shifts (
  id text primary key, staff text not null, start timestamptz not null default now(),
  "end" timestamptz, handed_to text);
create table if not exists reports (
  id text primary key, shift_id text not null, raw_text text not null, source text not null,
  created_at timestamptz not null default now());
create table if not exists items (
  id text primary key, shift_id text not null, report_id text, kind text not null default 'report',
  summary text not null, category text not null, location text, urgency text not null,
  manager_decides boolean not null default false, status text not null default 'open',
  assignee text, due_at text, corrected boolean not null default false,
  created_at timestamptz not null default now());
create table if not exists corrections (
  id text primary key, item_id text not null, before jsonb not null, after jsonb not null,
  fact_id text, mubit_accepted boolean, created_at timestamptz not null default now());
create table if not exists activity (
  seq integer primary key generated always as identity, at timestamptz not null default now(),
  shift_id text, type text not null, payload jsonb not null);
`;
