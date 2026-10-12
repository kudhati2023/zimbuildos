// Demo cadastre: three developments with mapped stands. Safe to re-run (existing rows are left alone).
// Usage: DATABASE_URL=postgres://... npm run seed   (run `npm run migrate` first)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env');
  process.loadEnvFile(envPath);
} catch (e) {
  try { process.loadEnvFile(); } catch (e2) {}
}

import pg from 'pg';
import { analysePolygon } from '../src/gisService.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const isPilot = process.argv.includes('--pilot') || process.env.ZHMS_PILOT_SEED === 'true';

const allDevelopments = [
  { id: 'dev-hre-budiriro', name: 'Budiriro Phase 2 Youth Scheme', code: 'HRE-BUD-02', province: 'Harare Metropolitan', target: 500, center: [-17.8925, 30.9325], zoom: 17 },
  { id: 'dev-midlands-3500', name: 'Midlands 3500 Smart Housing Scheme', code: 'MID-GWU-3500', province: 'Midlands (Gweru)', target: 3500, center: [-19.458, 29.815], zoom: 16 },
  { id: 'dev-matnorth-700', name: 'Matabeleland North 700 Lupane Cadastre', code: 'MAT-LUP-700', province: 'Matabeleland North', target: 700, center: [-18.9315, 27.807], zoom: 16 },
  { id: 'dev-mashwest-kadoma', name: 'Kadoma Enterprise Youth & Housing Scheme', code: 'MSW-KAD-1200', province: 'Mashonaland West', target: 1200, center: [-18.3333, 29.9167], zoom: 16 },
  { id: 'dev-hre-highlands', name: 'Highlands Densified Starter Units', code: 'HRE-HIG-450', province: 'Harare Metropolitan', target: 450, center: [-17.7950, 31.0950], zoom: 17 },
  { id: 'dev-hre-pomona', name: 'Pomona Eco-Estate & MSME Park', code: 'HRE-POM-800', province: 'Harare Metropolitan', target: 800, center: [-17.7350, 31.0750], zoom: 16 },
  { id: 'dev-byo-cowdray', name: 'Cowdray Park High-Density Youth Extension', code: 'BYO-CP-2500', province: 'Bulawayo Metropolitan', target: 2500, center: [-20.0833, 28.5333], zoom: 16 },
];

const box = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, n], [e, n], [e, s], [w, s], [w, n]]] });
const C = 'CERTIFIED';
const P = 'PENDING';

const demoStands = [
  { dev: 'dev-hre-budiriro', no: 'BUD2-401', price: 1200, quota: 'YOUTH', geom: box(30.9318, -17.8924, 30.9322, -17.8920), svc: [C, C, C], sg: 'SG/HRE/2026/0401' },
  { dev: 'dev-hre-budiriro', no: 'BUD2-402', price: 1400, quota: 'YOUTH', geom: box(30.9324, -17.8924, 30.9328, -17.8920), svc: [C, C, 'IN_PROGRESS'], sg: 'SG/HRE/2026/0402' },
  { dev: 'dev-hre-budiriro', no: 'BUD2-403', price: 1300, quota: 'YOUTH', geom: box(30.9330, -17.8924, 30.9334, -17.8920), svc: [C, C, C], sg: 'SG/HRE/2026/0403' },
  { dev: 'dev-hre-budiriro', no: 'BUD2-404', price: 1600, quota: 'GENERAL', zoning: 'HIGH_RISE_FLAT', geom: box(30.9318, -17.8930, 30.9322, -17.8926), svc: [C, P, P], sg: 'SG/HRE/2026/0404' },
  { dev: 'dev-hre-budiriro', no: 'BUD2-405', price: 1250, quota: 'YOUTH', geom: box(30.9324, -17.8930, 30.9332, -17.8926), svc: [C, C, P], sg: 'SG/HRE/2026/0405' },
  { dev: 'dev-hre-budiriro', no: 'BUD2-406', price: 0, constraint: 'WETLAND', zoning: 'MSME_WORKSPACE', geom: box(30.9315, -17.8936, 30.9335, -17.8932), svc: [P, P, P] },
  { dev: 'dev-midlands-3500', no: 'MID-3500-001', price: 2200, quota: 'GENERAL', zoning: 'HIGH_RISE_FLAT', geom: box(29.8140, -19.4590, 29.8160, -19.4570), svc: [C, C, C], sg: 'SG/GWR/2026/3001' },
  { dev: 'dev-matnorth-700', no: 'MAT-700-001', price: 1500, quota: 'YOUTH', geom: box(27.8060, -18.9320, 27.8080, -18.9310), svc: [C, P, P], sg: 'SG/LUP/2026/0701' },
];

const pilotExtraStands = [
  // Gweru Midlands 3500
  { dev: 'dev-midlands-3500', no: 'MID-3500-002', price: 1800, quota: 'YOUTH', geom: box(29.8162, -19.4590, 29.8182, -19.4570), svc: [C, C, P], sg: 'SG/GWR/2026/3002' },

  // Lupane Matabeleland North 700
  { dev: 'dev-matnorth-700', no: 'MAT-700-002', price: 1950, quota: 'GENERAL', zoning: 'HIGH_RISE_FLAT', geom: box(27.8085, -18.9320, 27.8105, -18.9310), svc: [C, C, C], sg: 'SG/LUP/2026/0702' },

  // Kadoma Youth Scheme
  { dev: 'dev-mashwest-kadoma', no: 'KAD-101', price: 1100, quota: 'YOUTH', geom: box(29.9150, -18.3340, 29.9170, -18.3325), svc: [C, C, C], sg: 'SG/KAD/2026/0101' },
  { dev: 'dev-mashwest-kadoma', no: 'KAD-102', price: 1350, quota: 'YOUTH', geom: box(29.9172, -18.3340, 29.9192, -18.3325), svc: [C, C, P], sg: 'SG/KAD/2026/0102' },
  { dev: 'dev-mashwest-kadoma', no: 'KAD-103', price: 1750, quota: 'GENERAL', zoning: 'HIGH_RISE_FLAT', geom: box(29.9195, -18.3340, 29.9215, -18.3325), svc: [C, P, P], sg: 'SG/KAD/2026/0103' },

  // Highlands Starter Units (ZNHSP 40% High-Rise Densification)
  { dev: 'dev-hre-highlands', no: 'HIG-201', price: 3500, quota: 'GENERAL', zoning: 'HIGH_RISE_FLAT', geom: box(31.0940, -17.7960, 31.0955, -17.7945), svc: [C, C, C], sg: 'SG/HIG/2026/0201' },
  { dev: 'dev-hre-highlands', no: 'HIG-202', price: 2900, quota: 'YOUTH', zoning: 'HIGH_RISE_FLAT', geom: box(31.0958, -17.7960, 31.0973, -17.7945), svc: [C, C, C], sg: 'SG/HIG/2026/0202' },

  // Pomona Eco-Estate
  { dev: 'dev-hre-pomona', no: 'POM-301', price: 4200, quota: 'GENERAL', geom: box(31.0740, -17.7360, 31.0760, -17.7345), svc: [C, C, C], sg: 'SG/POM/2026/0301' },
  { dev: 'dev-hre-pomona', no: 'POM-302', price: 0, constraint: 'WETLAND', zoning: 'MSME_WORKSPACE', geom: box(31.0762, -17.7360, 31.0782, -17.7345), svc: [P, P, P] },

  // Bulawayo Cowdray Park
  { dev: 'dev-byo-cowdray', no: 'BYO-CP-501', price: 1050, quota: 'YOUTH', geom: box(28.5320, -20.0845, 28.5340, -20.0830), svc: [C, C, C], sg: 'SG/BYO/2026/0501' },
  { dev: 'dev-byo-cowdray', no: 'BYO-CP-502', price: 1200, quota: 'YOUTH', geom: box(28.5342, -20.0845, 28.5362, -20.0830), svc: [C, C, P], sg: 'SG/BYO/2026/0502' },
  { dev: 'dev-byo-cowdray', no: 'BYO-CP-503', price: 1600, quota: 'GENERAL', zoning: 'HIGH_RISE_FLAT', geom: box(28.5365, -20.0845, 28.5385, -20.0830), svc: [C, P, P], sg: 'SG/BYO/2026/0503' },
];

const developments = isPilot ? allDevelopments : allDevelopments.slice(0, 3);
const stands = isPilot ? [...demoStands, ...pilotExtraStands] : demoStands;

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const d of developments) {
    await client.query(
      `INSERT INTO developments (development_id, name, code, province, target_units, center_lat, center_lng, default_zoom)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (development_id) DO NOTHING`,
      [d.id, d.name, d.code, d.province, d.target, d.center[0], d.center[1], d.zoom]);
  }
  let added = 0;
  for (const s of stands) {
    const dev = developments.find((d) => d.id === s.dev);
    const shape = analysePolygon(s.geom);
    if (shape.error) throw new Error(`${s.no}: ${shape.error}`);
    const allCertified = s.svc.every((v) => v === C);
    const r = await client.query(
      `INSERT INTO la_spatial_unit (stand_number, scheme_name, site_location, area_sqm, price_usd, surveyor_general_ref, status,
                                    quota_category, development_id, zoning_type, land_constraint, boundary_geojson,
                                    center_lat, center_lng, dimensions, water_status, sewer_status, roads_status,
                                    servicing_certificate_ref, servicing_certified_by, servicing_certified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (stand_number) DO NOTHING`,
      [s.no, dev.name, dev.province, shape.areaSqm, s.price.toFixed(2), s.sg ?? null, s.constraint ? 'WITHDRAWN' : 'AVAILABLE',
        s.quota ?? 'GENERAL', s.dev, s.zoning ?? 'SINGLE_RESIDENTIAL', s.constraint ?? null, JSON.stringify(s.geom),
        shape.centroid.lat, shape.centroid.lng, shape.dimensions, ...s.svc,
        allCertified ? `CERT/${s.no}` : null, allCertified ? 'seed' : null, allCertified ? new Date() : null]);
    added += r.rowCount;
  }
  await client.query('COMMIT');
  const { rows: [c] } = await client.query('SELECT count(*)::int AS n FROM la_spatial_unit');
  console.log(`Seed complete: ${added} new stand(s); ${c.n} stand(s) in the cadastre.`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Seeding failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
