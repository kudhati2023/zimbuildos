/**
 * Configuration is read once, validated, and the process refuses to start if anything required
 * is missing or weak. There are deliberately NO fallback secrets or fallback databases.
 */
export function loadConfig(env = process.env) {
  const problems = [];
  const need = (k) => { if (!env[k]) problems.push(`${k} is required`); return env[k]; };

  const databaseUrl = need('DATABASE_URL');
  const jwtSecret = need('JWT_SECRET');
  if (jwtSecret && jwtSecret.length < 32) problems.push('JWT_SECRET must be at least 32 characters');

  const port = Number(env.PORT ?? 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT must be a valid port');

  // Payment gateway webhooks: one HMAC secret per channel. A channel without a secret rejects webhooks.
  const webhookSecrets = {};
  for (const channel of ['ECOCASH', 'BANK_TRANSFER', 'OMARI', 'DEBIT_ORDER']) {
    const secret = env[`WEBHOOK_SECRET_${channel}`];
    if (!secret) continue;
    if (secret.length < 32) problems.push(`WEBHOOK_SECRET_${channel} must be at least 32 characters`);
    webhookSecrets[channel] = secret;
  }

  // Buyer messaging. "console" logs instead of sending, for development and until providers are contracted.
  const whatsappProvider = env.WHATSAPP_PROVIDER ?? 'console';
  const smsProvider = env.SMS_PROVIDER ?? 'console';
  if (!['console', 'cloud'].includes(whatsappProvider)) problems.push('WHATSAPP_PROVIDER must be console or cloud');
  if (!['console', 'http'].includes(smsProvider)) problems.push('SMS_PROVIDER must be console or http');
  if (whatsappProvider === 'cloud') {
    if (!env.WHATSAPP_TOKEN) problems.push('WHATSAPP_TOKEN is required when WHATSAPP_PROVIDER=cloud');
    if (!env.WHATSAPP_PHONE_NUMBER_ID) problems.push('WHATSAPP_PHONE_NUMBER_ID is required when WHATSAPP_PROVIDER=cloud');
  }
  if (smsProvider === 'http' && !env.SMS_HTTP_URL) problems.push('SMS_HTTP_URL is required when SMS_PROVIDER=http');

  const jobIntervalMinutes = Number(env.JOB_INTERVAL_MINUTES ?? 15);
  if (!Number.isInteger(jobIntervalMinutes) || jobIntervalMinutes < 0) problems.push('JOB_INTERVAL_MINUTES must be a whole number (0 disables jobs)');

  // Production hardening (ISO 27001 A.8.31 / A.8.9): no permissive defaults outside development.
  const runtimeEnv = env.NODE_ENV ?? 'production';
  const isProduction = runtimeEnv === 'production';
  const corsOrigins = (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (isProduction && corsOrigins.length === 0) problems.push('CORS_ORIGINS is required in production (no wildcard origin)');
  if (isProduction && corsOrigins.includes('*')) problems.push('CORS_ORIGINS must list explicit origins in production, not *');
  // The EcoCash "push" simulator credits payments without a gateway signature: development only.
  const paymentSimulator = env.ENABLE_PAYMENT_SIMULATOR === 'true';
  if (isProduction && paymentSimulator) problems.push('ENABLE_PAYMENT_SIMULATOR must not be enabled in production');

  if (problems.length) {
    throw new Error(`Invalid configuration:\n - ${problems.join('\n - ')}`);
  }

  return {
    env: runtimeEnv,
    port,
    databaseUrl,
    jwtSecret,
    jwtIssuer: env.JWT_ISSUER ?? 'zimbuild',
    jwtAudience: env.JWT_AUDIENCE ?? 'zhms',
    corsOrigins,
    paymentSimulator,
    // Off until the Registrar-General's check-letter algorithm is confirmed (see nationalId.js).
    nationalIdChecksum: env.ZW_ID_CHECKSUM === 'on',
    requireGeometry: env.ALLOW_STANDS_WITHOUT_GEOMETRY !== 'true',
    trustProxy: env.TRUST_PROXY === 'true',
    webhookSecrets,
    jobIntervalMinutes,
    messaging: {
      whatsappProvider,
      smsProvider,
      maxAttempts: 5,
      // Console delivery prints message bodies (buyer PII) only when explicitly allowed outside production.
      logBodies: !isProduction && env.LOG_MESSAGE_BODIES === 'true',
      whatsapp: {
        token: env.WHATSAPP_TOKEN,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        apiVersion: env.WHATSAPP_API_VERSION ?? 'v21.0',
        language: env.WHATSAPP_TEMPLATE_LANG ?? 'en',
      },
      sms: {
        url: env.SMS_HTTP_URL,
        token: env.SMS_HTTP_TOKEN,
        senderId: env.SMS_SENDER_ID ?? 'ZIMBUILD',
      },
    },
  };
}
