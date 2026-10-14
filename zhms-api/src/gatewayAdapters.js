import { signWebhook } from './signature.js';

/**
 * Standard Payment Gateway Adapters for Zimbabwean Providers:
 * - EcoCash (Econet Wireless OpenAPI)
 * - OneMoney (NetOne)
 * - Innbucks (Simbisa Brands / Bank)
 * - Stanbic / CABS / CBZ Bank Transfer Confirmations
 *
 * Each adapter normalises provider-specific webhook/callback payloads
 * into the canonical ZHMS webhook format:
 * {
 *   reference: string,      // Provider unique transaction ID
 *   accountRef: string,     // Buyer's ZHMS account reference (e.g. ZB-1A2B3C4D)
 *   amount: string,         // e.g. "150.00"
 *   currency: "USD" | "ZWG",
 *   status: "SUCCESS" | "FAILED",
 *   paidAt: string,         // ISO-8601 timestamp
 *   payerPhone: string      // e.g. "+263772123456"
 * }
 */

export class PaymentGatewayAdapter {
  /**
   * Normalises Econet EcoCash Webhook / USSD Push Callback
   * Typical payload:
   * {
   *   "ecocashReference": "EC-20261012-9981",
   *   "clientCorrelator": "ZB-BUD2-401",
   *   "amount": 150.00,
   *   "currency": "USD",
   *   "transactionStatus": "Completed",
   *   "dateTime": "2026-10-12T12:00:00Z",
   *   "sourceMsisdn": "263774128901"
   * }
   */
  static normaliseEcoCash(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid EcoCash payload');
    const isSuccess = ['COMPLETED', 'SUCCESS', 'PAID'].includes(String(payload.transactionStatus || payload.status).toUpperCase());
    const phone = payload.sourceMsisdn || payload.payerPhone || payload.msisdn || '';
    const formattedPhone = phone.startsWith('+') ? phone : (phone ? `+${phone}` : null);

    return {
      reference: String(payload.ecocashReference || payload.reference || payload.txnId || '').trim(),
      accountRef: String(payload.clientCorrelator || payload.accountRef || payload.accountNumber || '').trim().toUpperCase(),
      amount: Number(payload.amount || 0).toFixed(2),
      currency: String(payload.currency || 'USD').toUpperCase() === 'ZWG' ? 'ZWG' : 'USD',
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      paidAt: payload.dateTime || payload.paidAt || new Date().toISOString(),
      payerPhone: formattedPhone
    };
  }

  /**
   * Normalises NetOne OneMoney Webhook
   * Typical payload:
   * {
   *   "reference": "OM-9823101",
   *   "subscriber": "263712345678",
   *   "amount": "250.00",
   *   "currency": "USD",
   *   "merchant_reference": "ZB-KAD-104",
   *   "status_code": "00"
   * }
   */
  static normaliseOneMoney(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid OneMoney payload');
    const isSuccess = payload.status_code === '00' || String(payload.status).toUpperCase() === 'SUCCESS';
    const phone = payload.subscriber || payload.payerPhone || '';
    const formattedPhone = phone.startsWith('+') ? phone : (phone ? `+${phone}` : null);

    return {
      reference: String(payload.reference || payload.txn_id || '').trim(),
      accountRef: String(payload.merchant_reference || payload.accountRef || '').trim().toUpperCase(),
      amount: Number(payload.amount || 0).toFixed(2),
      currency: String(payload.currency || 'USD').toUpperCase() === 'ZWG' ? 'ZWG' : 'USD',
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      paidAt: payload.timestamp || payload.paidAt || new Date().toISOString(),
      payerPhone: formattedPhone
    };
  }

  /**
   * Normalises Innbucks Payment Notification
   * Typical payload:
   * {
   *   "innbucks_token": "IB-771920",
   *   "order_id": "ZB-HIG-202",
   *   "amount_paid": 50.00,
   *   "currency_code": "USD",
   *   "state": "SETTLED",
   *   "customer_cell": "+263773000111",
   *   "settled_at": "2026-10-12T11:45:00Z"
   * }
   */
  static normaliseInnbucks(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid Innbucks payload');
    const isSuccess = ['SETTLED', 'SUCCESS', 'PAID'].includes(String(payload.state || payload.status).toUpperCase());

    return {
      reference: String(payload.innbucks_token || payload.reference || '').trim(),
      accountRef: String(payload.order_id || payload.accountRef || '').trim().toUpperCase(),
      amount: Number(payload.amount_paid || payload.amount || 0).toFixed(2),
      currency: String(payload.currency_code || payload.currency || 'USD').toUpperCase() === 'ZWG' ? 'ZWG' : 'USD',
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      paidAt: payload.settled_at || payload.paidAt || new Date().toISOString(),
      payerPhone: payload.customer_cell || null
    };
  }

  /**
   * Signs and formats an inbound notification as a valid ZHMS HTTP request structure
   * for passing directly into services.inbox.receiveWebhook() or HTTP endpoints.
   */
  static createSignedWebhookRequest(canonicalPayload, channel, secret, timestamp = Math.floor(Date.now() / 1000)) {
    const rawBody = Buffer.from(JSON.stringify(canonicalPayload));
    const signature = signWebhook(timestamp, rawBody, secret);

    return {
      headers: {
        'content-type': 'application/json',
        'x-zhms-timestamp': String(timestamp),
        'x-zhms-signature': signature
      },
      rawBody,
      body: canonicalPayload
    };
  }
}
