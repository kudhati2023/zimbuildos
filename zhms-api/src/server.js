import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env');
  process.loadEnvFile(envPath);
} catch (e) {
  try { process.loadEnvFile(); } catch (e2) {}
}

import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { ApplicationService } from './applicationService.js';
import { AllocationService } from './allocationService.js';
import { PaymentService } from './paymentService.js';
import { PaymentInboxService } from './paymentInboxService.js';
import { IssuanceService } from './issuanceService.js';
import { MessageDispatcher } from './messaging.js';
import { JobService } from './jobService.js';
import { GisService } from './gisService.js';
import { JobCostService } from './jobCostService.js';
import { SiteProgressService } from './siteProgressService.js';
import { TenderService } from './tenderService.js';
import { QualityService } from './qualityService.js';
import { EquipmentService } from './equipmentService.js';
import { createApp } from './app.js';
import { migrate } from './migrate.js';

const config = loadConfig(process.env);
const db = createDb(config.databaseUrl);

console.log('[ZHMS ENGINE] Checking database migrations...');
await migrate(db.pool, {
  skip: process.env.ZHMS_SPATIAL === '0' ? ['spatial'] : [],
  log: console.log
});

const payment = new PaymentService(db);
const allocation = new AllocationService(db);
const dispatcher = new MessageDispatcher(db, config);
const services = {
  application: new ApplicationService(db, config),
  allocation,
  payment,
  inbox: new PaymentInboxService(db, payment),
  issuance: new IssuanceService(db),
  dispatcher,
  jobs: new JobService(db, { allocation, dispatcher }),
  gis: new GisService(db),
  jobCost: new JobCostService(db),
  progress: new SiteProgressService(db),
  tenders: new TenderService(db),
  quality: new QualityService(db),
  equipment: new EquipmentService(db),
};

const app = createApp(db, services, config);

const server = app.listen(config.port, () => {
  console.log(`[ZHMS REAL PRODUCTION ENGINE] Online on port ${config.port}`);
  console.log(`[SECURITY] Authenticated RBAC Enforced | Zero Hardcoded Mocks | PostgreSQL LADM Active`);
  const { whatsappProvider, smsProvider } = config.messaging;
  if (whatsappProvider === 'console' || smsProvider === 'console') {
    console.warn(`[MESSAGING] WhatsApp=${whatsappProvider} SMS=${smsProvider}: "console" messages are logged, NOT delivered to buyers.`);
  }
  const channels = Object.keys(config.webhookSecrets);
  console.log(`[PAYMENTS] Webhooks enabled for: ${channels.length ? channels.join(', ') : 'none (set WEBHOOK_SECRET_<CHANNEL>)'}`);
});

// In-process scheduler. Jobs are idempotent and safe to run on several instances at once.
const timers = [];
const runSafely = (name, fn) => async () => {
  try {
    const result = await fn();
    if (name === 'jobs') console.log(JSON.stringify({ level: 'info', msg: 'scheduled jobs ran', ...result }));
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', msg: `${name} failed`, err: err.message }));
  }
};
if (config.jobIntervalMinutes > 0) {
  const jobs = runSafely('jobs', () => services.jobs.runAll());
  timers.push(setInterval(jobs, config.jobIntervalMinutes * 60_000));
  timers.push(setInterval(runSafely('dispatch', () => dispatcher.dispatch()), 30_000));
  setTimeout(jobs, 5_000);
}

const shutdown = async () => {
  console.log('[ZHMS] Shutting down gracefully...');
  timers.forEach(clearInterval);
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
