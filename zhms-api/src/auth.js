import jwt from 'jsonwebtoken';
import { unauthorized, forbidden } from './errors.js';
import { securityEvent } from './securityLog.js';

export const ROLES = Object.freeze({
  APPLICANT: 'APPLICANT',
  LAND_OFFICER: 'LAND_OFFICER',
  FINANCE_MANAGER: 'FINANCE_MANAGER',
  FINANCE_CLERK: 'FINANCE_CLERK',
  CEO: 'CEO',
  AUDITOR: 'AUDITOR',
  ENGINEER: 'ENGINEER',   // civil engineering unit: certifies stand servicing
  ADMIN: 'ADMIN',
  // Construction operations
  PROJECT_MANAGER: 'PROJECT_MANAGER',       // projects, budgets, milestones, tenders and awards
  QUANTITY_SURVEYOR: 'QUANTITY_SURVEYOR',   // cost ledger, bid evaluation, claim certification
  SITE_SUPERVISOR: 'SITE_SUPERVISOR',       // daily site reports, resource usage, NCR corrective action
  QA_INSPECTOR: 'QA_INSPECTOR',             // quality inspections and NCR verification
  PLANT_MANAGER: 'PLANT_MANAGER',           // equipment register and maintenance
  SUBCONTRACTOR: 'SUBCONTRACTOR',           // external firm: own bids and claims only
});
export const STAFF_ROLES = [ROLES.LAND_OFFICER, ROLES.FINANCE_MANAGER, ROLES.FINANCE_CLERK, ROLES.CEO, ROLES.AUDITOR, ROLES.ENGINEER, ROLES.ADMIN];
/** May read construction projects. Kept apart from STAFF_ROLES so site staff never see buyers' personal or payment data. */
export const CONSTRUCTION_READ_ROLES = [ROLES.PROJECT_MANAGER, ROLES.QUANTITY_SURVEYOR, ROLES.SITE_SUPERVISOR, ROLES.QA_INSPECTOR,
  ROLES.PLANT_MANAGER, ROLES.ENGINEER, ROLES.CEO, ROLES.FINANCE_MANAGER, ROLES.AUDITOR];

export function verifyToken(token, config) {
  const payload = jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],           // never accept "none" or an attacker-chosen algorithm
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    clockTolerance: 5,
  });
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('token has no subject');
  const roles = Array.isArray(payload.roles) ? payload.roles.filter((r) => Object.values(ROLES).includes(r)) : [];
  return { sub: payload.sub, roles };
}

export const authenticate = (config) => (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    securityEvent('AUTH_MISSING_TOKEN', { req });
    return next(unauthorized());
  }
  try {
    req.user = verifyToken(token, config);
    return next();
  } catch (err) {
    // The reason (expired / bad signature / wrong audience) helps detect token forgery; the token itself is never logged.
    securityEvent('AUTH_INVALID_TOKEN', { req, reason: err?.name ?? 'Error' });
    return next(unauthorized('Invalid or expired token'));
  }
};

/** Strict: a role grants only its own endpoints. ADMIN does NOT implicitly hold other roles. */
export const requireRole = (...allowed) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.roles.some((r) => allowed.includes(r))) return next();
  securityEvent('AUTHZ_ROLE_DENIED', { req, required: allowed, held: req.user.roles });
  return next(forbidden('FORBIDDEN_ROLE', `Requires one of: ${allowed.join(', ')}`));
};

export const hasRole = (user, ...roles) => user.roles.some((r) => roles.includes(r));
export const isStaff = (user) => user.roles.some((r) => STAFF_ROLES.includes(r));
