import { badRequest, notFound, conflict, forbidden } from './errors.js';
import { audit } from './db.js';
import { validateNationalId, ageOn } from './nationalId.js';
import { enqueueMessage } from './messaging.js';

// Self-declared by the applicant; WOMEN / DISABILITY / VETERAN / PUBLIC_SERVANT status is verified by the
// Land Officer at review. YOUTH is checked automatically against date of birth.
export const QUOTA_CATEGORIES = ['GENERAL', 'YOUTH', 'WOMEN', 'DISABILITY', 'VETERAN', 'PUBLIC_SERVANT'];
const REGISTRATION_CHANNELS = ['WEB', 'MOBILE', 'STAFF'];
const MESSAGE_CHANNELS = ['WHATSAPP', 'SMS'];

export class ApplicationService {
  constructor(db, config) {
    this.db = db;
    this.config = config;
  }

  /**
   * `staff` is true when a staff member registers someone in person: the party is then not linked to the
   * staff member's own sign-in. Self-service applicants may only apply as themselves (see step 3).
   */
  async submitApplication(actorSub, data, { staff = false } = {}) {
    return this.db.tx(async (client) => {
      // 1. Validate National ID
      const validId = validateNationalId(data.nationalId, { checksum: this.config.nationalIdChecksum });
      if (!validId.valid) {
        throw badRequest('INVALID_NATIONAL_ID', `National ID is invalid: ${validId.reason}`);
      }

      // 2. Load business rules (age eligibility)
      const { rows: cfgRows } = await client.query('SELECT key, value FROM app_config');
      const cfg = Object.fromEntries(cfgRows.map(r => [r.key, r.value]));
      const minAge = Number(cfg.min_age || 18);
      const maxAge = Number(cfg.max_age || 50);

      const applicantAge = ageOn(data.dateOfBirth);
      if (Number.isNaN(applicantAge) || applicantAge < minAge || applicantAge > maxAge) {
        throw badRequest('INELIGIBLE_AGE', `Applicant must be between ${minAge} and ${maxAge} years old (current: ${applicantAge})`);
      }

      const quotaCategory = data.quotaCategory ?? 'GENERAL';
      if (!QUOTA_CATEGORIES.includes(quotaCategory)) {
        throw badRequest('INVALID_QUOTA_CATEGORY', `quotaCategory must be one of ${QUOTA_CATEGORIES.join(', ')}`);
      }
      const youthMaxAge = Number(cfg.youth_max_age ?? 35);
      if (quotaCategory === 'YOUTH' && applicantAge > youthMaxAge) {
        throw badRequest('INELIGIBLE_FOR_YOUTH_QUOTA', `The youth quota is for applicants aged ${youthMaxAge} or younger (current: ${applicantAge})`);
      }
      const registrationChannel = data.registrationChannel ?? 'WEB';
      if (!REGISTRATION_CHANNELS.includes(registrationChannel)) {
        throw badRequest('INVALID_REGISTRATION_CHANNEL', `registrationChannel must be one of ${REGISTRATION_CHANNELS.join(', ')}`);
      }
      const preferredChannel = data.preferredChannel ?? 'WHATSAPP';
      if (!MESSAGE_CHANNELS.includes(preferredChannel)) {
        throw badRequest('INVALID_PREFERRED_CHANNEL', `preferredChannel must be one of ${MESSAGE_CHANNELS.join(', ')}`);
      }

      // 3. Upsert or locate party record
      let subjectId;
      const partyRes = await client.query(
        'SELECT subject_id, user_sub FROM la_party WHERE national_id = $1',
        [validId.id]
      );

      if (partyRes.rows.length > 0) {
        subjectId = partyRes.rows[0].subject_id;
        // A national ID is not a secret, so knowing one must never attach that person's record (and their
        // stands, balances and documents) to the caller's sign-in. Existing records are linked only by staff
        // after an in-person identity check; self-service callers may only continue their own record.
        if (!staff && partyRes.rows[0].user_sub !== actorSub) {
          throw conflict('IDENTITY_VERIFICATION_REQUIRED',
            'A record with this national ID already exists. Please visit a ZimBuild office with your ID to link it to your account.');
        }
      } else {
        const insertPartyRes = await client.query(
          `INSERT INTO la_party (user_sub, national_id, first_name, last_name, date_of_birth, phone_number, email, physical_address, preferred_channel)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING subject_id`,
          [staff ? null : actorSub, validId.id, data.firstName, data.lastName, data.dateOfBirth, data.phoneNumber, data.email || null, data.physicalAddress, preferredChannel]
        );
        subjectId = insertPartyRes.rows[0].subject_id;
      }

      // 4. Ensure no active allocation already held by applicant (1 person = 1 live stand)
      const existingAlloc = await client.query(
        `SELECT allocation_id FROM allocations 
         WHERE subject_id = $1 AND status IN ('RESERVED','AWAITING_SIGNATURE','ACTIVE','PAID_IN_FULL')`,
        [subjectId]
      );
      if (existingAlloc.rows.length > 0) {
        throw conflict('APPLICANT_ALREADY_HOLDS_STAND', 'Applicant already holds an active stand allocation');
      }

      // 5. Insert new application with initial status PENDING_LAND_OFFICER
      const appRes = await client.query(
        `INSERT INTO applications (subject_id, status, round, preferred_scheme, notes, first_submitted_at, last_submitted_at,
                                   quota_category, registration_channel)
         VALUES ($1, 'PENDING_LAND_OFFICER', 1, $2, $3, now(), now(), $4, $5)
         RETURNING *`,
        [subjectId, data.preferredScheme || null, data.notes || null, quotaCategory, registrationChannel]
      );
      const app = appRes.rows[0];

      await enqueueMessage(client, {
        subjectId,
        template: 'APPLICATION_RECEIVED',
        dedupeKey: `application:${app.application_id}`,
        params: { name: data.firstName, category: quotaCategory.replace('_', ' ').toLowerCase() },
      });

      // 6. Record audit & event
      await client.query(
        `INSERT INTO application_events (application_id, event_type, actor, detail)
         VALUES ($1, 'SUBMITTED', $2, $3)`,
        [app.application_id, actorSub || 'anonymous', JSON.stringify({ preferredScheme: data.preferredScheme })]
      );
      await audit(client, actorSub || 'anonymous', 'APPLICATION_SUBMITTED', 'applications', app.application_id, { subjectId });

      return app;
    });
  }

  async reviewApplication(applicationId, reviewerRole, reviewerSub, decision, reason = null) {
    if (!['LAND_OFFICER', 'FINANCE_MANAGER', 'CEO'].includes(reviewerRole)) {
      throw forbidden('INVALID_REVIEWER_ROLE', 'Only Land Officer, Finance Manager, and CEO can review applications');
    }
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw badRequest('INVALID_DECISION', 'Decision must be APPROVED or REJECTED');
    }
    if (decision === 'REJECTED' && (!reason || reason.trim().length < 10)) {
      throw badRequest('REASON_REQUIRED', 'Rejection requires an explicit reason of at least 10 characters');
    }

    return this.db.tx(async (client) => {
      // Lock application row
      const { rows } = await client.query(
        'SELECT * FROM applications WHERE application_id = $1 FOR UPDATE',
        [applicationId]
      );
      if (rows.length === 0) throw notFound('Application');
      const app = rows[0];

      // Verify state matches role
      const expectedStatus = {
        LAND_OFFICER: 'PENDING_LAND_OFFICER',
        FINANCE_MANAGER: 'PENDING_FINANCE',
        CEO: 'PENDING_CEO'
      }[reviewerRole];

      if (app.status !== expectedStatus) {
        throw conflict('INVALID_APPLICATION_STAGE', `Application is currently in status ${app.status}, not awaiting ${reviewerRole}`);
      }

      // Record approval or rejection
      await client.query(
        `INSERT INTO application_approvals (application_id, round, role, decision, decided_by, reason, decided_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [applicationId, app.round, reviewerRole, decision, reviewerSub, reason]
      );

      let nextStatus;
      if (decision === 'REJECTED') {
        // Return to applicant for correction and resubmission
        nextStatus = 'RETURNED';
      } else {
        // Step to next reviewer or final APPROVED
        if (reviewerRole === 'LAND_OFFICER') nextStatus = 'PENDING_FINANCE';
        else if (reviewerRole === 'FINANCE_MANAGER') nextStatus = 'PENDING_CEO';
        else if (reviewerRole === 'CEO') nextStatus = 'APPROVED';
      }

      const updated = await client.query(
        `UPDATE applications 
         SET status = $1, updated_at = now() 
         WHERE application_id = $2 
         RETURNING *`,
        [nextStatus, applicationId]
      );

      await client.query(
        `INSERT INTO application_events (application_id, event_type, actor, detail)
         VALUES ($1, $2, $3, $4)`,
        [applicationId, `${reviewerRole}_${decision}`, reviewerSub, JSON.stringify({ round: app.round, reason })]
      );

      await audit(client, reviewerSub, `APPLICATION_${decision}`, 'applications', applicationId, { role: reviewerRole, nextStatus });

      return updated.rows[0];
    });
  }

  async resubmitApplication(applicationId, actorSub, data = {}, { staff = false } = {}) {
    return this.db.tx(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM applications WHERE application_id = $1 FOR UPDATE',
        [applicationId]
      );
      if (rows.length === 0) throw notFound('Application');
      const app = rows[0];

      if (app.status !== 'RETURNED') {
        throw conflict('NOT_RETURNED', 'Only returned/rejected applications can be resubmitted');
      }

      // Only the applicant themselves, or staff acting for a staff-registered (unlinked) applicant, may resubmit.
      const partyRes = await client.query('SELECT user_sub FROM la_party WHERE subject_id = $1', [app.subject_id]);
      const owner = partyRes.rows[0]?.user_sub ?? null;
      if (owner ? owner !== actorSub : !staff) {
        throw forbidden('NOT_APPLICATION_OWNER', 'You cannot resubmit another applicant\'s application');
      }

      const newRound = app.round + 1;
      // Per confirmed design: Restart approval chain at Land Officer
      const updated = await client.query(
        `UPDATE applications
         SET status = 'PENDING_LAND_OFFICER',
             round = $1,
             preferred_scheme = COALESCE($2, preferred_scheme),
             notes = COALESCE($3, notes),
             last_submitted_at = now(),
             updated_at = now()
         WHERE application_id = $4
         RETURNING *`,
        [newRound, data.preferredScheme || null, data.notes || null, applicationId]
      );

      await client.query(
        `INSERT INTO application_events (application_id, event_type, actor, detail)
         VALUES ($1, 'RESUBMITTED', $2, $3)`,
        [applicationId, actorSub, JSON.stringify({ newRound })]
      );

      await audit(client, actorSub, 'APPLICATION_RESUBMITTED', 'applications', applicationId, { newRound });

      return updated.rows[0];
    });
  }
}
