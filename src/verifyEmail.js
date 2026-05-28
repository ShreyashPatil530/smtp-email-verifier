'use strict';

const validator = require('validator');

const { resolveMx: defaultResolveMx } = require('./dnsLookup');
const { verifyMailbox: defaultVerifyMailbox } = require('./smtpChecker');
const { getDidYouMean } = require('./typoDetector');
const { isDisposable } = require('./disposableDomains');
const { buildResponse, extractDomain, SUBRESULTS } = require('./utils');

const DEFAULT_FROM_EMAIL = 'verify@example.com';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Providers that block address harvesting at the gateway. Any SMTP "accept"
 * from these domains should be downgraded to `unknown` rather than reported
 * as a confirmed `valid` mailbox.
 */
const PROVIDERS_WITHOUT_SMTP_VERIFICATION = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.co.in',
  'icloud.com',
  'me.com',
  'mac.com',
]);

/**
 * Lightweight regex used in addition to validator.isEmail() to catch a few
 * obvious problems quickly (empty local part, trailing dot, consecutive dots).
 */
const SYNTAX_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isSyntacticallyValid(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (!trimmed) return false;
  if (trimmed.length > 254) return false;
  if (trimmed.includes('..')) return false;
  if ((trimmed.match(/@/g) || []).length !== 1) return false;
  if (!SYNTAX_REGEX.test(trimmed)) return false;
  return validator.isEmail(trimmed);
}

/**
 * Verify an email address. Performs (in order): syntax validation, typo
 * detection, disposable-domain check, DNS MX lookup, and SMTP RCPT TO
 * verification against the highest-priority MX server.
 *
 * The dependencies (DNS resolver, SMTP checker) are injectable so the
 * function can be unit-tested without real network access.
 *
 * @param {string} email
 * @param {Object} [options]
 * @param {string} [options.fromEmail]   Identity used in HELO / MAIL FROM.
 * @param {number} [options.timeout]     Per-SMTP-step timeout in ms.
 * @param {Function} [options.resolveMx] Override DNS resolver (testing).
 * @param {Function} [options.verifyMailbox] Override SMTP checker (testing).
 * @returns {Promise<Object>}
 */
async function verifyEmail(email, options = {}) {
  const startedAt = Date.now();
  const fromEmail = options.fromEmail || DEFAULT_FROM_EMAIL;
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS;
  const resolveMx = options.resolveMx || defaultResolveMx;
  const verifyMailbox = options.verifyMailbox || defaultVerifyMailbox;

  // 1. Handle null / undefined / non-string input up-front.
  if (email === null || email === undefined) {
    return buildResponse({
      email,
      result: 'invalid',
      subresult: SUBRESULTS.EMPTY_INPUT,
      error: 'Email is required',
      startedAt,
    });
  }
  if (typeof email !== 'string') {
    return buildResponse({
      email: String(email),
      result: 'invalid',
      subresult: SUBRESULTS.INVALID_INPUT_TYPE,
      error: 'Email must be a string',
      startedAt,
    });
  }

  const normalized = email.trim();
  if (!normalized) {
    return buildResponse({
      email,
      result: 'invalid',
      subresult: SUBRESULTS.EMPTY_INPUT,
      error: 'Email is empty',
      startedAt,
    });
  }

  // 2. Syntax validation.
  if (!isSyntacticallyValid(normalized)) {
    // Even if the syntax is broken, try to suggest a fix if the user is
    // close to a popular domain (e.g. "user@gmial.cm").
    const didyoumean = getDidYouMean(normalized);
    return buildResponse({
      email: normalized,
      result: 'invalid',
      subresult: SUBRESULTS.INVALID_SYNTAX,
      domain: extractDomain(normalized),
      error: 'Invalid email syntax',
      didyoumean,
      startedAt,
    });
  }

  const domain = extractDomain(normalized);

  // 3. Typo detection on the domain. We report a typo as invalid because the
  //    address as-typed almost certainly will not deliver.
  const didyoumean = getDidYouMean(normalized);
  if (didyoumean) {
    return buildResponse({
      email: normalized,
      result: 'invalid',
      subresult: SUBRESULTS.TYPO_DETECTED,
      domain,
      error: null,
      didyoumean,
      startedAt,
    });
  }

  // 4. Disposable-domain check (bonus).
  if (isDisposable(domain)) {
    return buildResponse({
      email: normalized,
      result: 'invalid',
      subresult: SUBRESULTS.DISPOSABLE,
      domain,
      error: 'Disposable email provider',
      startedAt,
    });
  }

  // 5. DNS MX lookup.
  const mxResult = await resolveMx(domain);
  if (!mxResult.ok) {
    const isNoData = mxResult.code === 'ENODATA' || mxResult.code === 'ENOTFOUND';
    return buildResponse({
      email: normalized,
      result: 'invalid',
      subresult: isNoData ? SUBRESULTS.NO_MX_RECORDS : SUBRESULTS.DNS_ERROR,
      domain,
      mxRecords: [],
      error: mxResult.error,
      startedAt,
    });
  }

  // 6. SMTP mailbox verification against the preferred MX.
  const smtp = await verifyMailbox({
    email: normalized,
    host: mxResult.records[0],
    fromEmail,
    timeout,
  });

  // Providers that don't expose mailbox existence at the SMTP gateway:
  // an "accepted" RCPT TO doesn't actually prove the mailbox exists.
  const providerHidesMailbox = PROVIDERS_WITHOUT_SMTP_VERIFICATION.has(domain);

  let result;
  let subresult;
  let error = null;

  switch (smtp.status) {
    case 'accepted':
      if (providerHidesMailbox) {
        result = 'unknown';
        subresult = SUBRESULTS.SMTP_BLOCKED;
      } else {
        result = 'valid';
        subresult = SUBRESULTS.MAILBOX_EXISTS;
      }
      break;
    case 'rejected':
      result = 'invalid';
      subresult = SUBRESULTS.MAILBOX_NOT_FOUND;
      error = smtp.message || null;
      break;
    case 'temp':
      result = 'unknown';
      subresult = SUBRESULTS.SMTP_TEMP_FAILURE;
      error = smtp.message || smtp.error || null;
      break;
    case 'timeout':
      result = 'unknown';
      subresult = SUBRESULTS.SMTP_TIMEOUT;
      error = smtp.error || 'SMTP timeout';
      break;
    case 'refused':
      result = 'unknown';
      subresult = SUBRESULTS.SMTP_CONNECTION_REFUSED;
      error = smtp.error || 'Connection refused';
      break;
    default:
      result = 'unknown';
      subresult = SUBRESULTS.SMTP_BLOCKED;
      error = smtp.error || 'SMTP verification failed';
  }

  return buildResponse({
    email: normalized,
    result,
    subresult,
    domain,
    mxRecords: mxResult.records,
    error,
    startedAt,
  });
}

module.exports = {
  verifyEmail,
  isSyntacticallyValid,
  PROVIDERS_WITHOUT_SMTP_VERIFICATION,
};
