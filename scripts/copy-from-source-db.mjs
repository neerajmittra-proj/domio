#!/usr/bin/env node
/**
 * scripts/copy-from-source-db.mjs
 *
 * One-off: copy data from another Domio database (read-only access) into
 * THIS project's database, re-assigning every owner-linked record to one of
 * your own owner accounts.
 *
 *   • Default run is a DRY RUN — it only reads, and prints what it would do.
 *   • Add --apply to actually write (single transaction: all or nothing).
 *   • Rows whose primary key already exists in your DB are left untouched
 *     (INSERT ... ON CONFLICT DO NOTHING), so it is safe to re-run.
 *   • Nothing is ever updated or deleted in either database, except that
 *     circular foreign keys are filled in with a follow-up UPDATE on rows this
 *     script itself just inserted.
 *
 * Usage (PowerShell, from the repo root):
 *
 *   $env:SOURCE_DATABASE_URL = "postgresql://USER:PASSWORD@HOST/neondb?sslmode=require"
 *   $env:TARGET_OWNER_EMAIL  = "your-domio-login@example.com"
 *   node scripts/copy-from-source-db.mjs            # dry run
 *   node scripts/copy-from-source-db.mjs --apply    # write
 *
 * The target database is read from .env (DATABASE_URL_UNPOOLED, falling back to
 * DATABASE_URL). The source password is only ever read from the environment
 * variable above — do not paste it into this file.
 */

import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const CHUNK = 400;

// Tables that are never copied: migration bookkeeping and short-lived codes.
const EXCLUDE = new Set(['_prisma_migrations', 'TenantOtp', 'UserOtp']);

// ── config ────────────────────────────────────────────────────────────────────
function loadDotEnv() {
  const p = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadDotEnv();

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const OWNER_EMAIL = (process.env.TARGET_OWNER_EMAIL || '').trim().toLowerCase();

function die(msg) {
  console.error('\n✖ ' + msg + '\n');
  process.exit(1);
}
if (!SOURCE_URL) die('Set SOURCE_DATABASE_URL (the read-only connection string you were given).');
if (!TARGET_URL) die('No DATABASE_URL / DATABASE_URL_UNPOOLED found in .env for your own database.');
if (!OWNER_EMAIL) die('Set TARGET_OWNER_EMAIL to the email of YOUR owner account in your own Domio.');

const hostOf = (u) => new URL(u).host.replace(/-pooler/, '');
if (hostOf(SOURCE_URL) === hostOf(TARGET_URL)) {
  die('Source and target point at the same database. Refusing to continue.');
}

const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';
const opts = { max: 1, connect_timeout: 30, idle_timeout: 20, onnotice: () => {} };
const src = postgres(SOURCE_URL, { ...opts, ssl: 'require' });
const dst = postgres(TARGET_URL, { ...opts, ssl: 'require' });

// ── schema introspection ──────────────────────────────────────────────────────
async function tables(sql) {
  const rows = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'`;
  return rows.map((r) => r.table_name);
}
async function columns(sql, table) {
  const rows = await sql`
    select column_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = ${table}
    order by ordinal_position`;
  return rows.map((r) => ({
    name: r.column_name,
    notNull: r.is_nullable === 'NO',
    hasDefault: r.column_default !== null,
  }));
}
async function foreignKeys(sql) {
  // single-column foreign keys: table.col -> ref
  return sql`
    select (select relname from pg_class where oid = c.conrelid)  as tbl,
           (select relname from pg_class where oid = c.confrelid) as ref,
           a.attname as col,
           a.attnotnull as notnull
    from pg_constraint c
    join lateral unnest(c.conkey) k(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and array_length(c.conkey, 1) = 1`;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(APPLY ? '\n=== APPLY MODE — data will be written ===' : '\n=== DRY RUN — nothing will be written ===');
  console.log('source:', hostOf(SOURCE_URL));
  console.log('target:', hostOf(TARGET_URL));

  // Target owner
  const owner = await dst`select id, email, role from ${dst('User')} where lower(email) = ${OWNER_EMAIL} limit 1`;
  if (!owner.length) die(`No user with email ${OWNER_EMAIL} exists in your own database.`);
  const OWNER_ID = owner[0].id;
  console.log(`owner:  ${owner[0].email} (role ${owner[0].role}) — all owner-linked records will be assigned to this account`);

  const [srcTables, dstTables] = await Promise.all([tables(src), tables(dst)]);
  const common = srcTables.filter((t) => dstTables.includes(t) && !EXCLUDE.has(t));
  const onlySrc = srcTables.filter((t) => !dstTables.includes(t) && !EXCLUDE.has(t));
  if (onlySrc.length) console.log('tables only in source (skipped):', onlySrc.join(', '));

  // column maps
  const cols = {};
  for (const t of common) {
    const [sc, dc] = await Promise.all([columns(src, t), columns(dst, t)]);
    const srcNames = new Set(sc.map((c) => c.name));
    const shared = dc.filter((c) => srcNames.has(c.name)).map((c) => c.name);
    const missingRequired = dc.filter((c) => c.notNull && !c.hasDefault && !srcNames.has(c.name)).map((c) => c.name);
    const droppedCols = sc.filter((c) => !dc.some((d) => d.name === c.name)).map((c) => c.name);
    cols[t] = { shared, missingRequired, droppedCols, hasId: shared.includes('id') };
    if (missingRequired.length) console.log(`  ! ${t}: target requires column(s) the source lacks: ${missingRequired.join(', ')} — inserts will fail`);
    if (droppedCols.length) console.log(`  · ${t}: source-only column(s) ignored: ${droppedCols.join(', ')}`);
  }

  // foreign keys → ownership remap + insertion order
  const fks = (await foreignKeys(dst)).filter((f) => common.includes(f.tbl) && common.includes(f.ref));
  const userRefCols = {}; // table -> Set(col): other FKs to User (actorId, createdById…)
  const ownerCols = {}; // table -> Set(col)  (FK to User whose name contains "owner")
  for (const f of fks) {
    if (f.ref === 'User' && /owner/i.test(f.col)) (ownerCols[f.tbl] ??= new Set()).add(f.col);
    else if (f.ref === 'User') (userRefCols[f.tbl] ??= new Set()).add(f.col);
  }
  console.log('\nowner-linked columns that will be re-assigned to you:');
  for (const [t, s] of Object.entries(ownerCols)) console.log(`  ${t}: ${[...s].join(', ')}`);

  // order tables (parents first); break cycles by deferring nullable FK columns
  const deferred = {}; // table -> Set(col) filled in after all inserts
  const edges = fks.map((f) => ({ ...f }));
  for (const e of edges) {
    if (e.tbl === e.ref) {
      if (!e.notnull) (deferred[e.tbl] ??= new Set()).add(e.col);
      e.dropped = true;
    }
  }
  const remaining = new Set(common);
  const order = [];
  while (remaining.size) {
    const ready = [...remaining].filter((t) =>
      edges.every((e) => e.dropped || e.tbl !== t || !remaining.has(e.ref)));
    if (ready.length) {
      for (const t of ready) { order.push(t); remaining.delete(t); }
      continue;
    }
    // cycle: defer one nullable edge between remaining tables
    const brk = edges.find((e) => !e.dropped && remaining.has(e.tbl) && remaining.has(e.ref) && !e.notnull);
    if (!brk) { console.log('  ! unbreakable FK cycle among:', [...remaining].join(', ')); order.push(...remaining); break; }
    (deferred[brk.tbl] ??= new Set()).add(brk.col);
    brk.dropped = true;
  }
  console.log('\ninsert order:', order.join(' → '));

  // ── copy ────────────────────────────────────────────────────────────────────
  const report = [];
  const run = async (tx) => {
    for (const t of order) {
      const c = cols[t];
      if (!c.hasId) { report.push({ t, note: 'no "id" column — skipped' }); continue; }
      let rows;
      try {
        rows = (await src.unsafe(`select to_jsonb(x) as j from ${q(t)} x`)).map((r) => r.j);
      } catch (e) {
        report.push({ t, note: `cannot read source (${e.code || e.message})` });
        continue;
      }
      if (!rows.length) { report.push({ t, source: 0, inserted: 0 }); continue; }

      const existing = new Set(
        (await tx.unsafe(`select id from ${q(t)}`)).map((r) => r.id),
      );
      const fresh = rows.filter((r) => !existing.has(r.id));
      const ownerSet = ownerCols[t] ?? new Set();
      const defSet = deferred[t] ?? new Set();
      const refSet = userRefCols[t] ?? new Set();
      const userIds = new Set((await tx.unsafe(`select id from "User"`)).map((r) => r.id));
      let remapped = 0;
      const prepared = fresh.map((r) => {
        const o = { ...r };
        for (const k of ownerSet) if (o[k] !== undefined && o[k] !== null) o[k] = OWNER_ID;
        // creator/actor references to a user that was not copied → attribute to you
        for (const k of refSet) if (o[k] !== undefined && o[k] !== null && !userIds.has(o[k])) { o[k] = OWNER_ID; remapped++; }
        return o;
      });
      // User rows must not collide with / replace your own account
      let toInsert = t === 'User' ? prepared.filter((r) => String(r.email).toLowerCase() !== OWNER_EMAIL) : prepared;

      let inserted = 0;
      const skipped = [];
      const colList = c.shared.map(q).join(', ');
      const insertSql = `insert into ${q(t)} (${colList})
        select ${colList} from jsonb_populate_recordset(null::${q(t)}, $1::text::jsonb)
        on conflict do nothing`;

      if (APPLY) {
        for (let i = 0; i < toInsert.length; i += CHUNK) {
          const batch = toInsert.slice(i, i + CHUNK).map((r) => {
            const o = { ...r };
            for (const k of defSet) o[k] = null;
            return o;
          });
          try {
            await tx.savepoint(async (sp) => {
              const res = await sp.unsafe(insertSql, [JSON.stringify(batch)]);
              inserted += res.count;
            });
          } catch {
            // one bad row (missing parent, bad enum value…) — retry row by row
            for (const r of batch) {
              try {
                await tx.savepoint(async (sp) => {
                  const res = await sp.unsafe(insertSql, [JSON.stringify([r])]);
                  inserted += res.count;
                });
              } catch (e) {
                skipped.push(`${r.id}: ${e.message.split('\n')[0]}`);
              }
            }
          }
        }
        // fill deferred (cyclic / self-referencing) FKs
        for (const col of defSet) {
          const upd = toInsert.filter((r) => r[col] !== null && r[col] !== undefined);
          for (let i = 0; i < upd.length; i += CHUNK) {
            const batch = upd.slice(i, i + CHUNK).map((r) => ({ id: r.id, [col]: r[col] }));
            try {
              await tx.savepoint(async (sp) => {
                await sp.unsafe(
                  `update ${q(t)} t set ${q(col)} = s.${q(col)}
                   from jsonb_populate_recordset(null::${q(t)}, $1::text::jsonb) s where t.id = s.id`,
                  [JSON.stringify(batch)]);
              });
            } catch (e) {
              skipped.push(`link ${col}: ${e.message.split('\n')[0]}`);
            }
          }
        }
      } else {
        inserted = toInsert.length;
      }
      if (remapped) console.log(`  · ${t}: ${remapped} created-by/actor reference(s) to uncopied users re-assigned to you`);
      report.push({ t, source: rows.length, already: rows.length - fresh.length, inserted, skipped });
    }
  };

  if (APPLY) await dst.begin(run); else await run(dst);

  // ── report ──────────────────────────────────────────────────────────────────
  console.log(`\n${APPLY ? 'RESULT' : 'WOULD COPY'}:`);
  for (const r of report) {
    if (r.note) { console.log(`  ${r.t.padEnd(24)} ${r.note}`); continue; }
    console.log(`  ${r.t.padEnd(24)} source ${String(r.source).padStart(5)}   already present ${String(r.already ?? 0).padStart(5)}   ${APPLY ? 'inserted' : 'to insert'} ${String(r.inserted).padStart(5)}${r.skipped?.length ? `   SKIPPED ${r.skipped.length}` : ''}`);
    for (const s of (r.skipped ?? []).slice(0, 5)) console.log('      - ' + s);
  }
  if (!APPLY) console.log('\nNothing was written. Re-run with --apply to copy.');
  await Promise.all([src.end({ timeout: 5 }), dst.end({ timeout: 5 })]);
}

main().catch(async (e) => {
  console.error('\n✖ Failed:', e.message);
  try { await Promise.all([src.end({ timeout: 2 }), dst.end({ timeout: 2 })]); } catch {}
  process.exit(1);
});
