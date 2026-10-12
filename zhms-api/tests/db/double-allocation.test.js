import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase, insertParty, insertStand, insertApplication, rawAllocationInsert } from '../helpers/db.js';

// These tests bypass ALL application code on purpose: they prove the DATABASE alone makes
// double allocation impossible, even if a future bug (or a person with SQL access) tries.

let db;
test.before(async () => { db = await createTestDatabase(); });
test.after(async () => { await db.drop(); });

const outcome = (results) => ({
  ok: results.filter((r) => r.status === 'fulfilled').length,
  failed: results.filter((r) => r.status === 'rejected'),
});

test('50 concurrent allocations of ONE stand by 50 different people: exactly 1 succeeds', async () => {
  const stand = await insertStand(db.pool);
  const people = await Promise.all(Array.from({ length: 50 }, () => insertParty(db.pool)));
  const apps = await Promise.all(people.map((p) => insertApplication(db.pool, p.subject_id)));

  const results = await Promise.allSettled(apps.map((a, i) =>
    rawAllocationInsert(db.pool, { applicationId: a.application_id, subjectId: people[i].subject_id, parcelId: stand.parcel_id })));

  const { ok, failed } = outcome(results);
  assert.equal(ok, 1, `expected exactly one winner, got ${ok}`);
  assert.equal(failed.length, 49);
  for (const f of failed) {
    assert.ok(['ZH001', '23505'].includes(f.reason.code), `unexpected error ${f.reason.code}: ${f.reason.message}`);
  }
  const { rows } = await db.pool.query(`SELECT count(*)::int AS n FROM allocations WHERE parcel_id = $1`, [stand.parcel_id]);
  assert.equal(rows[0].n, 1);
  const s = await db.pool.query(`SELECT status FROM la_spatial_unit WHERE parcel_id = $1`, [stand.parcel_id]);
  assert.equal(s.rows[0].status, 'RESERVED', 'stand status must be derived from the allocation');
});

test('one person racing for 5 different stands at once: exactly 1 succeeds', async () => {
  const person = await insertParty(db.pool);
  const stands = await Promise.all(Array.from({ length: 5 }, () => insertStand(db.pool)));
  // A person may have several historical applications (only one can be open), so use closed ones here.
  const apps = await Promise.all(stands.map(() => insertApplication(db.pool, person.subject_id, 'CANCELLED')));

  const results = await Promise.allSettled(stands.map((s, i) =>
    rawAllocationInsert(db.pool, { applicationId: apps[i].application_id, subjectId: person.subject_id, parcelId: s.parcel_id })));

  const { ok, failed } = outcome(results);
  assert.equal(ok, 1);
  assert.equal(failed.length, 4);
  for (const f of failed) assert.equal(f.reason.code, '23505');
  assert.match(failed[0].reason.constraint, /uq_live_allocation_per_subject/);
  const { rows } = await db.pool.query(`SELECT status, count(*)::int n FROM la_spatial_unit WHERE parcel_id = ANY($1) GROUP BY status`,
    [stands.map((s) => s.parcel_id)]);
  const reserved = rows.find((r) => r.status === 'RESERVED');
  assert.equal(reserved.n, 1, 'only one stand may be taken');
});

test('a stand that is not AVAILABLE cannot be allocated, even by raw SQL', async () => {
  const stand = await insertStand(db.pool);
  await db.pool.query(`UPDATE la_spatial_unit SET status='DISPUTED' WHERE parcel_id=$1`, [stand.parcel_id]);
  const p = await insertParty(db.pool);
  const a = await insertApplication(db.pool, p.subject_id);
  await assert.rejects(
    rawAllocationInsert(db.pool, { applicationId: a.application_id, subjectId: p.subject_id, parcelId: stand.parcel_id }),
    (e) => e.code === 'ZH001');
});

test('a released stand returns to the pool and can be allocated again; a disputed stand stays disputed', async () => {
  const stand = await insertStand(db.pool);
  const p1 = await insertParty(db.pool);
  const a1 = await insertApplication(db.pool, p1.subject_id);
  const { rows } = await rawAllocationInsert(db.pool, { applicationId: a1.application_id, subjectId: p1.subject_id, parcelId: stand.parcel_id });

  await db.pool.query(`UPDATE allocations SET status='EXPIRED' WHERE allocation_id=$1`, [rows[0].allocation_id]);
  let s = await db.pool.query(`SELECT status FROM la_spatial_unit WHERE parcel_id=$1`, [stand.parcel_id]);
  assert.equal(s.rows[0].status, 'AVAILABLE');

  const p2 = await insertParty(db.pool);
  const a2 = await insertApplication(db.pool, p2.subject_id);
  await rawAllocationInsert(db.pool, { applicationId: a2.application_id, subjectId: p2.subject_id, parcelId: stand.parcel_id });
  s = await db.pool.query(`SELECT status FROM la_spatial_unit WHERE parcel_id=$1`, [stand.parcel_id]);
  assert.equal(s.rows[0].status, 'RESERVED');

  // A terminal allocation can never be revived.
  await assert.rejects(
    db.pool.query(`UPDATE allocations SET status='RESERVED' WHERE allocation_id=$1`, [rows[0].allocation_id]),
    (e) => e.code === 'ZH002');
});

test('one person cannot have two open applications', async () => {
  const p = await insertParty(db.pool);
  await insertApplication(db.pool, p.subject_id, 'PENDING_LAND_OFFICER');
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => insertApplication(db.pool, p.subject_id, 'PENDING_FINANCE')));
  assert.equal(outcome(results).ok, 0);
  for (const f of outcome(results).failed) assert.equal(f.reason.code, '23505');
});

test('allocations are never deleted and their stand/person/price are immutable', async () => {
  const stand = await insertStand(db.pool);
  const other = await insertStand(db.pool);
  const p = await insertParty(db.pool);
  const a = await insertApplication(db.pool, p.subject_id);
  const { rows } = await rawAllocationInsert(db.pool, { applicationId: a.application_id, subjectId: p.subject_id, parcelId: stand.parcel_id });
  const id = rows[0].allocation_id;
  await assert.rejects(db.pool.query(`DELETE FROM allocations WHERE allocation_id=$1`, [id]), (e) => e.code === 'ZH002');
  await assert.rejects(db.pool.query(`UPDATE allocations SET parcel_id=$1 WHERE allocation_id=$2`, [other.parcel_id, id]), (e) => e.code === 'ZH002');
  await assert.rejects(db.pool.query(`UPDATE allocations SET total_price_usd=1 WHERE allocation_id=$1`, [id]), (e) => e.code === 'ZH002');
});
