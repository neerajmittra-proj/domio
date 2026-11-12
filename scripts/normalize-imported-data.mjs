#!/usr/bin/env node
/**
 * scripts/normalize-imported-data.mjs
 *
 * Makes imported (flat) data behave exactly like data created inside Domio.
 *
 * Data created in the app has, for every unit:
 *   • a RentableEntity node in a Property → Floor → Room tree, AND
 *   • a mirrored flat SubProperty row, AND
 *   • tenancies linked to the unit.
 * Imported data only has the flat SubProperty rows, so the hierarchy tree,
 * sub-unit nesting, status roll-ups and entity-based tenancy rules had nothing
 * to work with. This script fills the gap, for the chosen owner:
 *
 *   1. Creates the root "Whole Property" node for each property that lacks one.
 *   2. Creates a Floor node per distinct SubProperty.floor and a Room node per
 *      unit (matched on unit number + name, so re-running never duplicates).
 *   3. Links each unit's tenancies to its new node (keeps the SubProperty link
 *      too — the app already handles tenancies that carry both).
 *   4. Re-numbers duplicate / missing display IDs (PF-, PR-, UN-, TN-, TC-)
 *      using your own database's sequences, so the next record you create
 *      does not collide with imported ones.
 *
 *   • Default run is a DRY RUN: everything executes in a transaction that is
 *     rolled back at the end, so the counts are exact but nothing is saved.
 *   • Add --apply to commit.
 *   • Safe to re-run: it only adds what is missing.
 *
 * Usage (PowerShell, from the repo root):
 *
 *   $env:TARGET_OWNER_EMAIL = "your-owner-login@example.com"   # optional; limits it to this owner
 *   node scripts/normalize-imported-data.mjs            # dry run
 *   node scripts/normalize-imported-data.mjs --apply    # write
 *
 * The database comes from .env (DATABASE_URL_UNPOOLED, then DATABASE_URL).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');

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

const URL_ = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const OWNER_EMAIL = (process.env.TARGET_OWNER_EMAIL || '').trim().toLowerCase();
if (!URL_) {
  console.error('\n✖ No DATABASE_URL / DATABASE_URL_UNPOOLED found in .env\n');
  process.exit(1);
}

const sql = postgres(URL_, { max: 1, connect_timeout: 30, idle_timeout: 20, ssl: 'require', onnotice: () => {} });
const cuid = () => 'c' + crypto.randomBytes(12).toString('hex');
class DryRun extends Error {}

const report = {
  roots: 0, floors: 0, rooms: 0, matched: 0, tenanciesLinked: 0, statusSynced: 0,
  renumbered: {}, notes: [],
};

async function nextDisplayId(tx, seq, prefix, pad, table) {
  try {
    let id;
    await tx.savepoint(async (sp) => {
      const r = await sp.unsafe(`select nextval('${seq}') as n`);
      id = `${prefix}-${String(Number(r[0].n)).padStart(pad, '0')}`;
    });
    return id;
  } catch {
    // Sequence missing: fall back to max existing number + 1 for that prefix.
    const r = await tx.unsafe(
      `select coalesce(max(nullif(regexp_replace("displayId", '\\D', '', 'g'), '')::bigint), 0) + 1 as n
         from "${table}" where "displayId" like $1`, [`${prefix}-%`]);
    return `${prefix}-${String(Number(r[0].n)).padStart(pad, '0')}`;
  }
}

async function main() {
  console.log(APPLY ? '\n=== APPLY MODE — changes will be committed ===' : '\n=== DRY RUN — changes are rolled back at the end ===');
  console.log('database:', new URL(URL_).host.replace(/-pooler/, ''));

  try {
    await sql.begin(async (tx) => {
      let ownerFilter = null;
      if (OWNER_EMAIL) {
        const o = await tx`select id, email from "User" where lower(email) = ${OWNER_EMAIL} limit 1`;
        if (!o.length) throw new Error(`No user with email ${OWNER_EMAIL} found in this database.`);
        ownerFilter = o[0].id;
        console.log('owner:   ', o[0].email);
      } else {
        console.log('owner:    (all owners — set TARGET_OWNER_EMAIL to limit)');
      }

      const props = ownerFilter
        ? await tx`select id, name, "displayId", "ownerId" from "Property" where "ownerId" = ${ownerFilter} order by "createdAt"`
        : await tx`select id, name, "displayId", "ownerId" from "Property" order by "createdAt"`;

      for (const prop of props) {
        const units = await tx`
          select * from "SubProperty" where "propertyId" = ${prop.id}
          order by "sortOrder" asc nulls last, "createdAt" asc`;
        if (!units.length) continue;

        const ents = await tx`
          select id, type, name, code, "parentId" from "RentableEntity" where "propertyId" = ${prop.id}`;

        // 1. root node
        let root = ents.find((e) => e.type === 'PROPERTY' && !e.parentId);
        if (!root) {
          const id = cuid();
          const did = await nextDisplayId(tx, 'rentable_entity_seq', 'RE', 4, 'RentableEntity');
          await tx`
            insert into "RentableEntity" (id, "displayId", type, name, code, "rentAmount", status, "propertyId", "ownerId", "createdAt", "updatedAt")
            values (${id}, ${did}, 'PROPERTY'::"RentableEntityType", ${prop.name}, ${prop.displayId || 'PROP'}, 0, 'VACANT'::"SubPropertyStatus", ${prop.id}, ${prop.ownerId}, now(), now())`;
          root = { id, type: 'PROPERTY', name: prop.name, code: prop.displayId || 'PROP', parentId: null };
          ents.push(root);
          report.roots++;
        }

        // 2. floors + rooms
        const floorByName = new Map(
          ents.filter((e) => e.type === 'FLOOR').map((e) => [e.name.trim().toLowerCase(), e]),
        );
        let order = 0;
        for (const u of units) {
          order++;
          const unitCode = String(u.unitNumber ?? '').trim();
          const unitName = String(u.name ?? '').trim();

          // already represented? (same code + name, any non-property node)
          let node = ents.find(
            (e) => e.type !== 'PROPERTY' &&
              String(e.code).trim().toLowerCase() === unitCode.toLowerCase() &&
              String(e.name).trim().toLowerCase() === unitName.toLowerCase(),
          );

          if (node) {
            report.matched++;
          } else {
            // floor grouping
            let parentId = root.id;
            const floorName = String(u.floor ?? '').trim();
            if (floorName && floorName.toLowerCase() !== unitName.toLowerCase()) {
              let fl = floorByName.get(floorName.toLowerCase());
              if (!fl) {
                const fid = cuid();
                const fdid = await nextDisplayId(tx, 'rentable_entity_seq', 'RE', 4, 'RentableEntity');
                await tx`
                  insert into "RentableEntity" (id, "displayId", type, name, code, "rentAmount", status, "parentId", "propertyId", "ownerId", "createdAt", "updatedAt")
                  values (${fid}, ${fdid}, 'FLOOR'::"RentableEntityType", ${floorName}, ${floorName}, 0, 'VACANT'::"SubPropertyStatus", ${root.id}, ${prop.id}, ${prop.ownerId}, now(), now())`;
                fl = { id: fid, type: 'FLOOR', name: floorName, code: floorName, parentId: root.id };
                floorByName.set(floorName.toLowerCase(), fl);
                ents.push(fl);
                report.floors++;
              }
              parentId = fl.id;
            }
            const rid = cuid();
            const rdid = await nextDisplayId(tx, 'rentable_entity_seq', 'RE', 4, 'RentableEntity');
            await tx`
              insert into "RentableEntity" (id, "displayId", type, name, code, "areaSqft", "rentAmount", status, notes, "sortOrder", "parentId", "propertyId", "ownerId", "createdAt", "updatedAt")
              values (${rid}, ${rdid}, 'ROOM'::"RentableEntityType", ${unitName}, ${unitCode || `U${order}`}, ${u.areaSqft}, ${u.rentAmount ?? 0},
                      ${u.status}::"SubPropertyStatus", ${u.notes}, ${u.sortOrder ?? order}, ${parentId}, ${prop.id}, ${prop.ownerId}, now(), now())`;
            node = { id: rid, type: 'ROOM', name: unitName, code: unitCode, parentId };
            ents.push(node);
            report.rooms++;
          }

          // 3. link tenancies (keeps subPropertyId; the app supports both)
          const linked = await tx`
            update "Tenancy" set "rentableEntityId" = ${node.id}
            where "subPropertyId" = ${u.id} and "rentableEntityId" is null`;
          report.tenanciesLinked += linked.count;

          // listed rent of 0 on an occupied unit: use the active lease rent, as
          // a unit created in the app would have (listed rent = rent charged)
          const lease = await tx`
            select "monthlyRent" from "Tenancy"
            where "subPropertyId" = ${u.id} and status = 'ACTIVE'
            order by "startDate" desc limit 1`;
          if (lease.length && lease[0].monthlyRent > 0 && !(Number(u.rentAmount) > 0)) {
            await tx`update "SubProperty" set "rentAmount" = ${lease[0].monthlyRent} where id = ${u.id}`;
            await tx`update "RentableEntity" set "rentAmount" = ${lease[0].monthlyRent} where id = ${node.id} and "rentAmount" = 0`;
            report.rentBackfilled = (report.rentBackfilled || 0) + 1;
          }

          // keep node status in step with the unit it mirrors
          const synced = await tx`
            update "RentableEntity" set status = ${u.status}::"SubPropertyStatus"
            where id = ${node.id} and status <> ${u.status}::"SubPropertyStatus"
              and not exists (select 1 from "RentableEntity" c where c."parentId" = ${node.id})`;
          report.statusSynced += synced.count;
        }
      }

      // 4. display IDs: fix duplicates and gaps, using your own sequences
      const kinds = [
        ['Portfolio', 'portfolio_seq', 'PF', 4],
        ['Property', 'property_seq', 'PR', 4],
        ['SubProperty', 'unit_seq', 'UN', 4],
        ['Tenant', 'tenant_seq', 'TN', 4],
        ['Tenancy', 'tenancy_seq', 'TC', 4],
      ];
      for (const [table, seq, prefix, pad] of kinds) {
        const ownerCond = ownerFilter ? `and "ownerId" = '${ownerFilter.replace(/'/g, "''")}'` : '';
        const dupes = await tx.unsafe(`
          select id from (
            select id, "displayId",
                   row_number() over (partition by "displayId" order by "createdAt", id) as rn
            from "${table}"
          ) t
          where ("displayId" is null or rn > 1)
            and id in (select id from "${table}" where true ${ownerCond})`);
        let n = 0;
        for (const d of dupes) {
          const did = await nextDisplayId(tx, seq, prefix, pad, table);
          await tx.unsafe(`update "${table}" set "displayId" = $1 where id = $2`, [did, d.id]);
          n++;
        }
        if (n) report.renumbered[table] = n;
      }

      console.log('\nRESULT' + (APPLY ? '' : ' (dry run — nothing saved)') + ':');
      console.log(`  property root nodes created : ${report.roots}`);
      console.log(`  floor nodes created         : ${report.floors}`);
      console.log(`  unit (room) nodes created   : ${report.rooms}`);
      console.log(`  units already had a node    : ${report.matched}`);
      console.log(`  tenancies linked to nodes   : ${report.tenanciesLinked}`);
      console.log(`  node statuses synced        : ${report.statusSynced}`);
      console.log(`  unit rents filled from lease : ${report.rentBackfilled || 0}`);
      const rn = Object.entries(report.renumbered);
      console.log(`  display IDs re-numbered     : ${rn.length ? rn.map(([t, c]) => `${t} ${c}`).join(', ') : 'none'}`);

      if (!APPLY) throw new DryRun();
    });
    console.log('\n✔ Committed.\n');
  } catch (e) {
    if (e instanceof DryRun) {
      console.log('\nNothing was written. Re-run with --apply to save.\n');
    } else {
      console.error('\n✖ Failed — nothing was saved:', e.message, '\n');
      process.exitCode = 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main();
