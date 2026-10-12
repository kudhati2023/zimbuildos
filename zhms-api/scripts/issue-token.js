// Signs a short-lived access token for testing / break-glass use with the server's own JWT_SECRET.
// Production users get tokens from the identity provider; every token issued here is logged (without the token).
import jwt from 'jsonwebtoken';
import { ROLES } from '../src/auth.js';

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  console.error('JWT_SECRET (32+ characters) must be set - there is deliberately no fallback secret.');
  process.exit(1);
}
const [sub, rolesArg, ttl = '8h'] = process.argv.slice(2);
if (!sub || !rolesArg) {
  console.error('Usage: npm run issue-token -- <sub> <ROLE[,ROLE...]> [ttl, default 8h]');
  process.exit(1);
}
const roles = rolesArg.split(',').map((r) => r.trim()).filter(Boolean);
const unknown = roles.filter((r) => !Object.values(ROLES).includes(r));
if (unknown.length) {
  console.error(`Unknown role(s): ${unknown.join(', ')}. Valid: ${Object.values(ROLES).join(', ')}`);
  process.exit(1);
}

const token = jwt.sign({ sub, roles }, secret, {
  issuer: process.env.JWT_ISSUER || 'zimbuild',
  audience: process.env.JWT_AUDIENCE || 'zhms',
  expiresIn: ttl,
});

console.error(JSON.stringify({ type: 'security', event: 'MANUAL_TOKEN_ISSUED', sub, roles, ttl, at: new Date().toISOString() }));
console.log(token);
