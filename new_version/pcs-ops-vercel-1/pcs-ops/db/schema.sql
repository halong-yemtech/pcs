-- PCS operations system: Postgres schema. Idempotent: safe to run on every deploy.

-- Every app record lives in one JSON document table, keyed by (collection, id).
-- rev is a global, ever-increasing change counter that clients poll for live updates.
create sequence if not exists doc_rev;

create table if not exists docs (
  collection  text        not null,
  id          text        not null,
  data        jsonb       not null default '{}'::jsonb,
  rev         bigint      not null default nextval('doc_rev'),
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text,
  primary key (collection, id)
);
create index if not exists docs_rev_idx  on docs (rev);
create index if not exists docs_live_idx on docs (collection) where not deleted;

-- Append-only audit trail of every write.
create table if not exists doc_history (
  hid         bigserial   primary key,
  collection  text        not null,
  id          text        not null,
  op          text        not null,          -- set | update | delete
  data        jsonb,
  at          timestamptz not null default now(),
  by          text
);
create index if not exists doc_history_doc_idx on doc_history (collection, id, at desc);

-- Uploaded files (GA / manufacturing drawings, IOMs, signed dockets, receipts).
create table if not exists assets (
  id             text        primary key,
  storage        text        not null,       -- vercel-blob | database
  key            text,                       -- blob pathname
  url            text,                       -- blob URL (never sent to browsers)
  content_type   text        not null,
  size_bytes     bigint      not null,
  original_name  text,
  data           bytea,                      -- only when storage = database
  sha256         text,
  uploaded_by    text,
  created_at     timestamptz not null default now()
);

-- Everyone who has signed in (for names on records), plus optional role overrides.
-- role null = use the env rules (ADMIN_EMAILS, ALLOWED_EMAIL_DOMAINS + DEFAULT_ROLE).
create table if not exists app_users (
  email       text        primary key,
  name        text,
  role        text        check (role in ('viewer','editor','admin','blocked')),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz
);

-- One Xero organisation connection. Tokens are AES-256-GCM encrypted.
create table if not exists xero_connection (
  id              text        primary key default 'default',
  tenant_id       text,
  tenant_name     text,
  connection_id   text,
  tenants         jsonb,                     -- all orgs the user authorised, for switching
  access_token    text,
  refresh_token   text,
  expires_at      timestamptz,
  scopes          text,
  connected_by    text,
  connected_at    timestamptz,
  updated_at      timestamptz not null default now()
);

create table if not exists xero_log (
  id      bigserial   primary key,
  at      timestamptz not null default now(),
  action  text        not null,
  ref     text,
  ok      boolean     not null,
  detail  jsonb
);
create index if not exists xero_log_at_idx on xero_log (at desc);

-- Recursive JSON merge used by document "update": nested objects merge, everything else replaces.
create or replace function jsonb_deep_merge(a jsonb, b jsonb) returns jsonb
language plpgsql immutable as $$
declare k text; v jsonb; r jsonb;
begin
  if a is null or jsonb_typeof(a) <> 'object' or b is null or jsonb_typeof(b) <> 'object' then
    return b;
  end if;
  r := a;
  for k, v in select * from jsonb_each(b) loop
    if r ? k and jsonb_typeof(r -> k) = 'object' and jsonb_typeof(v) = 'object' then
      r := jsonb_set(r, array[k], jsonb_deep_merge(r -> k, v));
    else
      r := r || jsonb_build_object(k, v);
    end if;
  end loop;
  return r;
end $$;

-- Weekly off-site backups: one row per run, and which files have already been copied off-site.
create table if not exists backups (
  id          bigserial   primary key,
  at          timestamptz not null default now(),
  trigger     text        not null,              -- weekly | manual
  ok          boolean     not null,
  targets     text,                              -- s3, onedrive, email
  location    text,
  documents   integer,
  files_new   integer,
  bytes       bigint,
  error       text,
  by          text
);
create table if not exists backup_files (
  asset_id    text        not null,
  target      text        not null,
  at          timestamptz not null default now(),
  primary key (asset_id, target)
);
