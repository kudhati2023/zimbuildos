import { badRequest, notFound } from './errors.js';
import { audit } from './db.js';
import { toCents, centsToNumeric, numericToCents, percentOf } from './money.js';

const LIVE = ['RESERVED', 'AWAITING_SIGNATURE', 'ACTIVE', 'PAID_IN_FULL', 'COMPLETED'];
const ZONING = ['SINGLE_RESIDENTIAL', 'HIGH_RISE_FLAT', 'COMMERCIAL', 'MSME_WORKSPACE'];
const CONSTRAINTS = ['WETLAND', 'POWER_WAYLEAVE', 'ROAD_SERVITUDE', 'FLOOD_ZONE'];
const QUOTAS = ['GENERAL', 'YOUTH', 'WOMEN', 'DISABILITY', 'VETERAN', 'PUBLIC_SERVANT'];
// Generous bounding box around Zimbabwe: catches swapped lat/lng and projected (metre) coordinates.
const BBOX = { minLng: 25, maxLng: 34, minLat: -23, maxLat: -15 };
const MAX_IMPORT = 5000;

/** Map colour state used by the desktop map, derived from the cadastre status. */
export function mapStatus(dbStatus, landConstraint) {
  if (landConstraint || dbStatus === 'WITHDRAWN') return 'blocked';
  if (dbStatus === 'DISPUTED') return 'disputed';
  if (dbStatus === 'RESERVED') return 'pending_deposit';
  if (dbStatus === 'ALLOCATED') return 'allocated';
  return 'available';
}

/** Validates a GeoJSON Polygon in WGS84 and returns { centroid, areaSqm, dimensions } or an error string. */
export function analysePolygon(geometry) {
  if (!geometry || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates) || !Array.isArray(geometry.coordinates[0])) {
    return { error: 'geometry must be a GeoJSON Polygon' };
  }
  const ring = geometry.coordinates[0];
  if (ring.length < 4) return { error: 'polygon ring needs at least 4 positions' };
  for (const p of ring) {
    if (!Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(Number.isFinite)) return { error: 'positions must be [longitude, latitude] numbers' };
    const [lng, lat] = p;
    if (lng < BBOX.minLng || lng > BBOX.maxLng || lat < BBOX.minLat || lat > BBOX.maxLat) {
      return { error: `position [${lng}, ${lat}] is outside Zimbabwe — coordinates must be WGS84 [longitude, latitude]` };
    }
  }
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (first[0] !== last[0] || first[1] !== last[1]) return { error: 'polygon ring is not closed (first and last positions differ)' };

  const pts = ring.slice(0, -1);
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const lng0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  // Local equirectangular projection — accurate to well under 1% at stand scale.
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_540;
  const xy = pts.map(([lng, lat]) => [(lng - lng0) * kx, (lat - lat0) * ky]);
  let twice = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    twice += x1 * y2 - x2 * y1;
  }
  const areaSqm = Math.abs(twice) / 2;
  if (areaSqm < 20) return { error: `polygon area ${areaSqm.toFixed(1)} m² is implausibly small` };
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return {
    centroid: { lat: Math.round(lat0 * 1e6) / 1e6, lng: Math.round(lng0 * 1e6) / 1e6 },
    areaSqm: Math.round(areaSqm * 100) / 100,
    dimensions: `${Math.round(w * 10) / 10}m × ${Math.round(h * 10) / 10}m`,
  };
}

export class GisService {
  constructor(db) {
    this.db = db;
  }

  async listDevelopments() {
    const { rows } = await this.db.query(
      `SELECT d.*, count(s.parcel_id)::int AS stands_recorded
         FROM developments d LEFT JOIN la_spatial_unit s ON s.development_id = d.development_id
        GROUP BY d.development_id ORDER BY d.name`);
    return rows.map((d) => ({
      id: d.development_id,
      name: d.name,
      code: d.code,
      province: d.province,
      target_units: d.target_units,
      stands_recorded: d.stands_recorded,
      center: [Number(d.center_lat), Number(d.center_lng)],
      zoom: d.default_zoom,
    }));
  }

  async createDevelopment(body, actor) {
    const b = body ?? {};
    for (const k of ['id', 'name', 'code', 'province']) {
      if (typeof b[k] !== 'string' || !b[k].trim()) throw badRequest('INVALID_DEVELOPMENT', `${k} is required`);
    }
    return this.db.tx(async (client) => {
      const { rows: [d] } = await client.query(
        `INSERT INTO developments (development_id, name, code, province, target_units, center_lat, center_lng, default_zoom)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [b.id.trim(), b.name.trim(), b.code.trim(), b.province.trim(), b.targetUnits, b.center?.[0], b.center?.[1], b.zoom ?? 16]);
      await audit(client, actor, 'DEVELOPMENT_CREATED', 'developments', d.development_id, { name: d.name });
      return d;
    });
  }

  /**
   * Stands of one development as a GeoJSON FeatureCollection for the web map.
   * Personal data (holder name / national ID) is included only when `includeHolders` (staff callers).
   */
  async standsFeatureCollection(developmentId, { includeHolders = false } = {}) {
    const { rows: [dev] } = await this.db.query('SELECT development_id FROM developments WHERE development_id = $1', [developmentId]);
    if (!dev) throw notFound('Development');
    const { rows: [cfg] } = await this.db.query(`SELECT value::numeric AS pct FROM app_config WHERE key = 'deposit_percent'`);
    const { rows } = await this.db.query(
      `SELECT s.*, a.allocation_id, a.status AS allocation_status, a.reserved_at::date::text AS allocated_on,
              a.deposit_required_usd, b.balance_usd AS allocation_balance_usd,
              p.first_name, p.last_name, p.national_id
         FROM la_spatial_unit s
         LEFT JOIN allocations a ON a.parcel_id = s.parcel_id AND a.status = ANY($2::text[])
         LEFT JOIN allocation_balances b ON b.allocation_id = a.allocation_id
         LEFT JOIN la_party p ON p.subject_id = a.subject_id
        WHERE s.development_id = $1
        ORDER BY s.stand_number`, [developmentId, LIVE]);

    const features = rows.map((s) => {
      const priceCents = numericToCents(s.price_usd);
      const fullyServiced = [s.water_status, s.sewer_status, s.roads_status].every((v) => v === 'CERTIFIED');
      const properties = {
        id: s.parcel_id,
        parcel_id: s.parcel_id,
        stand_number: s.stand_number,
        development_id: s.development_id,
        scheme_name: s.scheme_name,
        area_sqm: Number(s.area_sqm),
        price_usd: priceCents / 100,
        required_deposit_usd: s.deposit_required_usd ? Number(s.deposit_required_usd) : percentOf(priceCents, Number(cfg.pct)) / 100,
        balance_usd: s.allocation_balance_usd !== null ? Number(s.allocation_balance_usd) : priceCents / 100,
        status: mapStatus(s.status, s.land_constraint),
        cadastre_status: s.status,
        land_constraint: s.land_constraint,
        zoning_type: s.zoning_type,
        quota_category: s.quota_category,
        servicing: { water: s.water_status, sewer: s.sewer_status, roads: s.roads_status },
        fully_serviced: fullyServiced,
        servicing_certificate_ref: s.servicing_certificate_ref,
        surveyor_general_ref: s.surveyor_general_ref,
        dimensions: s.dimensions,
        center_point: s.center_lat !== null ? [Number(s.center_lat), Number(s.center_lng)] : null,
        allocation_id: s.allocation_id,
        allocation_status: s.allocation_status,
        allocated_on: s.allocated_on,
        title_deed_issued: s.allocation_status === 'COMPLETED',
        holder_name: includeHolders && s.first_name ? `${s.first_name} ${s.last_name}` : null,
        holder_national_id: includeHolders ? s.national_id : null,
      };
      return { type: 'Feature', id: s.parcel_id, geometry: s.boundary_geojson, properties };
    });
    return { type: 'FeatureCollection', features };
  }

  /**
   * Imports surveyed stand boundaries (GeoJSON FeatureCollection, WGS84). All-or-nothing: if any
   * feature is invalid nothing is written and every problem is reported with its feature index.
   */
  async importStands(developmentId, collection, actor) {
    if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      throw badRequest('INVALID_GEOJSON', 'Body must be a GeoJSON FeatureCollection');
    }
    if (collection.features.length === 0 || collection.features.length > MAX_IMPORT) {
      throw badRequest('INVALID_GEOJSON', `A FeatureCollection must contain 1-${MAX_IMPORT} features`);
    }

    return this.db.tx(async (client) => {
      const { rows: [dev] } = await client.query('SELECT * FROM developments WHERE development_id = $1', [developmentId]);
      if (!dev) throw notFound('Development');

      const problems = [];
      const seen = new Set();
      const rows = collection.features.map((f, i) => {
        const p = f?.properties ?? {};
        const errs = [];
        const shape = analysePolygon(f?.geometry);
        if (shape.error) errs.push(shape.error);
        const standNumber = typeof p.stand_number === 'string' ? p.stand_number.trim() : '';
        if (!standNumber) errs.push('properties.stand_number is required');
        else if (seen.has(standNumber)) errs.push(`stand_number ${standNumber} appears twice in this file`);
        seen.add(standNumber);
        const zoning = p.zoning_type ?? 'SINGLE_RESIDENTIAL';
        if (!ZONING.includes(zoning)) errs.push(`zoning_type must be one of ${ZONING.join(', ')}`);
        const constraint = p.land_constraint ?? null;
        if (constraint !== null && !CONSTRAINTS.includes(constraint)) errs.push(`land_constraint must be one of ${CONSTRAINTS.join(', ')}`);
        const quota = p.quota_category ?? 'GENERAL';
        if (!QUOTAS.includes(quota)) errs.push(`quota_category must be one of ${QUOTAS.join(', ')}`);
        let priceCents = 0;
        if (!constraint) {
          try { priceCents = toCents(p.price_usd); } catch { errs.push('price_usd must be a positive amount for buildable stands'); }
        }
        if (errs.length) problems.push({ feature: i, stand_number: standNumber || null, errors: errs });
        return { standNumber, shape, zoning, constraint, quota, priceCents, p, geometry: f?.geometry };
      });

      if (!problems.length) {
        const { rows: existing } = await client.query(
          'SELECT stand_number FROM la_spatial_unit WHERE stand_number = ANY($1::text[])', [rows.map((r) => r.standNumber)]);
        for (const e of existing) {
          const i = rows.findIndex((r) => r.standNumber === e.stand_number);
          problems.push({ feature: i, stand_number: e.stand_number, errors: ['a stand with this number already exists'] });
        }
      }
      if (problems.length) throw badRequest('GEOJSON_REJECTED', `${problems.length} feature(s) failed validation; nothing was imported`, problems);

      if (rows.length > 0) {
        const standNumbers = [];
        const schemeNames = [];
        const siteLocations = [];
        const areaSqms = [];
        const pricesUsd = [];
        const surveyorGeneralRefs = [];
        const statuses = [];
        const quotaCategories = [];
        const developmentIds = [];
        const zoningTypes = [];
        const landConstraints = [];
        const boundaryGeojsons = [];
        const centerLats = [];
        const centerLngs = [];
        const dimensionsList = [];

        for (const r of rows) {
          standNumbers.push(r.standNumber);
          schemeNames.push(dev.name);
          siteLocations.push(typeof r.p.site_location === 'string' ? r.p.site_location : dev.province);
          areaSqms.push(Number.isFinite(Number(r.p.area_sqm)) && Number(r.p.area_sqm) > 0 ? Number(r.p.area_sqm) : r.shape.areaSqm);
          pricesUsd.push(centsToNumeric(r.priceCents));
          surveyorGeneralRefs.push(r.p.surveyor_general_ref ?? null);
          statuses.push(r.constraint ? 'WITHDRAWN' : 'AVAILABLE');
          quotaCategories.push(r.quota);
          developmentIds.push(developmentId);
          zoningTypes.push(r.zoning);
          landConstraints.push(r.constraint);
          boundaryGeojsons.push(JSON.stringify(r.geometry));
          centerLats.push(r.shape.centroid.lat);
          centerLngs.push(r.shape.centroid.lng);
          dimensionsList.push(r.shape.dimensions);
        }

        await client.query(
          `INSERT INTO la_spatial_unit (stand_number, scheme_name, site_location, area_sqm, price_usd, surveyor_general_ref,
                                        status, quota_category, development_id, zoning_type, land_constraint,
                                        boundary_geojson, center_lat, center_lng, dimensions)
           SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::text[],
                                $7::text[], $8::text[], $9::text[], $10::text[], $11::text[],
                                $12::jsonb[], $13::numeric[], $14::numeric[], $15::text[])`,
          [standNumbers, schemeNames, siteLocations, areaSqms, pricesUsd, surveyorGeneralRefs,
           statuses, quotaCategories, developmentIds, zoningTypes, landConstraints,
           boundaryGeojsons, centerLats, centerLngs, dimensionsList]
        );
      }
      await audit(client, actor, 'STANDS_IMPORTED', 'developments', developmentId, {
        count: rows.length, standNumbers: rows.map((r) => r.standNumber),
      });
      return { importedCount: rows.length };
    });
  }

  /** ZNHSP densification: share of buildable land zoned for high-rise flats (target ≥ 40%). */
  async zoningSummary() {
    const { rows } = await this.db.query(
      `SELECT d.development_id, d.name,
              coalesce(sum(s.area_sqm) FILTER (WHERE s.land_constraint IS NULL), 0)::float AS buildable_sqm,
              coalesce(sum(s.area_sqm) FILTER (WHERE s.land_constraint IS NULL AND s.zoning_type = 'HIGH_RISE_FLAT'), 0)::float AS high_rise_sqm,
              coalesce(sum(s.area_sqm) FILTER (WHERE s.land_constraint IS NOT NULL), 0)::float AS protected_sqm,
              count(s.parcel_id)::int AS stands
         FROM developments d LEFT JOIN la_spatial_unit s ON s.development_id = d.development_id
        GROUP BY d.development_id ORDER BY d.name`);
    return rows.map((r) => {
      const share = r.buildable_sqm ? Math.round((1000 * r.high_rise_sqm) / r.buildable_sqm) / 10 : 0;
      return { ...r, high_rise_share_percent: share, meets_40_percent_target: share >= 40 };
    });
  }

  /** One-page statutory and financial position for management, straight from the ledger. */
  async statutorySummary() {
    const q = async (sql, params) => (await this.db.query(sql, params)).rows;
    const [stands] = await q(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'AVAILABLE')::int AS available,
              count(*) FILTER (WHERE status = 'RESERVED')::int AS reserved,
              count(*) FILTER (WHERE status = 'ALLOCATED')::int AS allocated,
              count(*) FILTER (WHERE land_constraint IS NOT NULL)::int AS protected_land,
              count(*) FILTER (WHERE water_status = 'CERTIFIED' AND sewer_status = 'CERTIFIED' AND roads_status = 'CERTIFIED')::int AS fully_serviced
         FROM la_spatial_unit`);
    const applications = await q(`SELECT status, quota_category, count(*)::int AS n FROM applications GROUP BY 1, 2 ORDER BY 1, 2`);
    const [money] = await q(
      `SELECT (SELECT coalesce(sum(amount_usd), 0) FROM payments)::text AS collected_usd,
              (SELECT coalesce(sum(b.balance_usd), 0) FROM allocation_balances b JOIN allocations a USING (allocation_id)
                WHERE a.status IN ('RESERVED','AWAITING_SIGNATURE','ACTIVE'))::text AS outstanding_principal_usd,
              (SELECT coalesce(sum(principal_usd + interest_usd - paid_usd), 0) FROM plan_installments WHERE status = 'OVERDUE')::text AS overdue_usd,
              (SELECT count(*) FROM plan_installments WHERE status = 'OVERDUE')::int AS overdue_instalments,
              (SELECT count(*) FROM payment_inbox WHERE status = 'PENDING_REVIEW')::int AS payments_awaiting_review`);
    const [docs] = await q(
      `SELECT count(*) FILTER (WHERE doc_type = 'AGREEMENT_OF_SALE')::int AS agreements,
              count(*) FILTER (WHERE doc_type = 'DEED')::int AS deeds FROM issued_documents`);
    const [messages] = await q(
      `SELECT count(*) FILTER (WHERE status = 'QUEUED')::int AS queued,
              count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
              count(*) FILTER (WHERE status = 'SENT')::int AS sent FROM outbound_messages`);
    return { stands, applications, finance: money, documents: docs, messages, zoning: await this.zoningSummary() };
  }
}
