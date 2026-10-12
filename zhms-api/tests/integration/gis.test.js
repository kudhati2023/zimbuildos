// GIS cadastre over HTTP: developments, GeoJSON import validation, protected land, map privacy,
// densification report and the statutory summary. Also runs the real seed script against the test DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { createTestDatabase, insertParty, insertApplication } from '../helpers/db.js';
import { createDb } from '../../src/db.js';
import { AllocationService } from '../../src/allocationService.js';
import { GisService, analysePolygon } from '../../src/gisService.js';
import { createApp } from '../../src/app.js';

const config = {
  jwtSecret: 'test_super_secret_jwt_key_at_least_32_chars_long_2026',
  jwtIssuer: 'zimbuild', jwtAudience: 'zhms', corsOrigins: [], nationalIdChecksum: false, webhookSecrets: {},
};
const token = (sub, roles = []) => jwt.sign({ sub, roles }, config.jwtSecret, { issuer: 'zimbuild', audience: 'zhms', expiresIn: '1h' });
const officer = token('officer_1', ['LAND_OFFICER']);
const ceo = token('ceo_1', ['CEO']);
const applicant = token('usr_x');

let testDb; let db; let server; let base; let services;

async function api(method, path, { body, auth } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth && { Authorization: `Bearer ${auth}` }), 'X-Idempotency-Key': `k-${Math.random()}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
const box = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, n], [e, n], [e, s], [w, s], [w, n]]] });
const feature = (props, geometry = box(30.9318, -17.8924, 30.9322, -17.8920)) => ({ type: 'Feature', geometry, properties: props });

test.before(async () => {
  testDb = await createTestDatabase();
  db = createDb(testDb.url, { max: 5 });
  services = { allocation: new AllocationService(db), gis: new GisService(db) };
  server = createApp(db, services, config).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
  await testDb.drop();
});

test('polygon analysis: area, centroid and the errors surveyors actually make', () => {
  const ok = analysePolygon(box(30.9318, -17.8924, 30.9322, -17.8920));
  assert.ok(ok.areaSqm > 1800 && ok.areaSqm < 1950, `got ${ok.areaSqm}`); // ~42.4 m × 44.2 m
  assert.deepEqual(ok.centroid, { lat: -17.8922, lng: 30.932 });
  assert.match(analysePolygon(box(-17.8924, 30.9318, -17.8920, 30.9322)).error, /outside Zimbabwe/, 'swapped lat/lng');
  assert.match(analysePolygon(box(290000, 8020000, 290050, 8020060)).error, /outside Zimbabwe/, 'UTM metres instead of degrees');
  const open = { type: 'Polygon', coordinates: [[[30.93, -17.89], [30.931, -17.89], [30.931, -17.891], [30.93, -17.891]]] };
  assert.match(analysePolygon(open).error, /not closed/);
  assert.match(analysePolygon({ type: 'Point', coordinates: [30.9, -17.8] }).error, /Polygon/);
});

test('developments: staff create them, everyone can list them', async () => {
  const body = { id: 'dev-test-01', name: 'Test Scheme', code: 'TST-01', province: 'Harare Metropolitan', targetUnits: 50, center: [-17.8922, 30.932] };
  assert.equal((await api('POST', '/api/v1/gis/developments', { auth: applicant, body })).status, 403);
  assert.equal((await api('POST', '/api/v1/gis/developments', { auth: officer, body })).status, 201);
  const list = await api('GET', '/api/v1/gis/developments');
  assert.deepEqual(list.body.developments.map((d) => d.id), ['dev-test-01']);
  assert.deepEqual(list.body.developments[0].center, [-17.8922, 30.932]);
});

test('GeoJSON import is all-or-nothing and reports every bad feature', async () => {
  const bad = {
    type: 'FeatureCollection',
    features: [
      feature({ stand_number: 'T-1', price_usd: '1200' }),
      feature({ stand_number: 'T-2', price_usd: '1200' }, box(-17.8924, 30.9318, -17.8920, 30.9322)),
      feature({ stand_number: 'T-1', price_usd: '1200' }),
      feature({ stand_number: 'T-3', zoning_type: 'SKYSCRAPER' }),
    ],
  };
  const r = await api('POST', '/api/v1/gis/developments/dev-test-01/stands/import', { auth: officer, body: bad });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'GEOJSON_REJECTED');
  assert.deepEqual(r.body.details.map((p) => p.feature), [1, 2, 3]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM la_spatial_unit')).rows[0].n, 0, 'nothing written');
});

test('valid import: buildable stands become AVAILABLE, wetland becomes protected and unbookable', async () => {
  const good = {
    type: 'FeatureCollection',
    features: [
      feature({ stand_number: 'T-1', price_usd: '1200', quota_category: 'YOUTH' }),
      feature({ stand_number: 'T-2', price_usd: '1600', zoning_type: 'HIGH_RISE_FLAT' }, box(30.9324, -17.8924, 30.9332, -17.8920)),
      feature({ stand_number: 'T-W', land_constraint: 'WETLAND' }, box(30.9315, -17.8936, 30.9335, -17.8932)),
    ],
  };
  assert.equal((await api('POST', '/api/v1/gis/developments/dev-test-01/stands/import', { auth: ceo, body: good })).status, 403);
  const r = await api('POST', '/api/v1/gis/developments/dev-test-01/stands/import', { auth: officer, body: good });
  assert.equal(r.status, 201);
  assert.equal(r.body.importedCount, 3);

  const again = await api('POST', '/api/v1/gis/developments/dev-test-01/stands/import', { auth: officer, body: { type: 'FeatureCollection', features: [good.features[0]] } });
  assert.equal(again.status, 400, 'existing stand numbers are reported, not overwritten');

  const { rows: [w] } = await db.query(`SELECT * FROM la_spatial_unit WHERE stand_number = 'T-W'`);
  assert.equal(w.status, 'WITHDRAWN');
  assert.equal(w.price_usd, '0.00');
  await assert.rejects(db.query(`UPDATE la_spatial_unit SET status = 'AVAILABLE' WHERE stand_number = 'T-W'`), 'protected land cannot be made available');

  const party = await insertParty(db.pool);
  const app = await insertApplication(db.pool, party.subject_id, 'APPROVED');
  await assert.rejects(
    services.allocation.reserveStand({ applicationId: app.application_id, parcelId: w.parcel_id, idempotencyKey: 'wet-1', reservedBy: 'officer_1' }),
    (e) => e.code === 'STAND_NOT_AVAILABLE');

  const { rows: [t2] } = await db.query(`SELECT parcel_id FROM la_spatial_unit WHERE stand_number = 'T-2'`);
  await services.allocation.reserveStand({ applicationId: app.application_id, parcelId: t2.parcel_id, idempotencyKey: 'ok-1', reservedBy: 'officer_1' });
});

test('map FeatureCollection: colours from the cadastre, holder names only for staff', async () => {
  const anon = await api('GET', '/api/v1/gis/developments/dev-test-01/stands');
  assert.equal(anon.body.type, 'FeatureCollection');
  const by = Object.fromEntries(anon.body.features.map((f) => [f.properties.stand_number, f.properties]));
  assert.equal(by['T-1'].status, 'available');
  assert.equal(by['T-2'].status, 'pending_deposit');
  assert.equal(by['T-W'].status, 'blocked');
  assert.equal(by['T-W'].land_constraint, 'WETLAND');
  assert.equal(by['T-2'].holder_name, null);
  assert.equal(by['T-2'].required_deposit_usd, 800);
  assert.equal(anon.body.features[0].geometry.type, 'Polygon');

  const staff = await api('GET', '/api/v1/gis/developments/dev-test-01/stands', { auth: officer });
  const t2 = staff.body.features.find((f) => f.properties.stand_number === 'T-2').properties;
  assert.match(t2.holder_name, /^Test Person/);
  const fake = await api('GET', '/api/v1/gis/developments/dev-test-01/stands', { auth: 'not-a-token' });
  assert.equal(fake.body.features.find((f) => f.properties.stand_number === 'T-2').properties.holder_name, null);

  assert.equal((await api('GET', '/api/v1/gis/developments/nope/stands')).status, 404);
});

test('densification report measures high-rise share of buildable land; summary is staff-only', async () => {
  const z = await api('GET', '/api/v1/gis/zoning-summary');
  const d = z.body.developments.find((x) => x.development_id === 'dev-test-01');
  assert.ok(d.high_rise_share_percent > 60, `T-2 is ~2x T-1, got ${d.high_rise_share_percent}`);
  assert.equal(d.meets_40_percent_target, true);
  assert.ok(d.protected_sqm > 0);

  assert.equal((await api('GET', '/api/v1/reports/statutory-summary', { auth: applicant })).status, 403);
  const s = await api('GET', '/api/v1/reports/statutory-summary', { auth: ceo });
  assert.equal(s.status, 200);
  assert.equal(s.body.stands.total, 3);
  assert.equal(s.body.stands.protected_land, 1);
  assert.equal(s.body.stands.reserved, 1);
});

test('seed script loads the demo cadastre and is safe to re-run', () => {
  const run = () => spawnSync(process.execPath, ['scripts/seed.js'], { env: { ...process.env, DATABASE_URL: testDb.url }, encoding: 'utf8' });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /8 new stand/);
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /0 new stand/);
});
