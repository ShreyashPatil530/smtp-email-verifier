'use strict';

/**
 * Shared constants and helpers used across the verifier modules.
 */

const RESULT_CODES = Object.freeze({
  valid: 1,
  unknown: 3,
  invalid: 6,
});

const SUBRESULTS = Object.freeze({
  MAILBOX_EXISTS: 'mailbox_exists',
  MAILBOX_NOT_FOUND: 'mailbox_not_found',
  INVALID_SYNTAX: 'invalid_syntax',
  NO_MX_RECORDS: 'no_mx_records',
  DNS_ERROR: 'dns_error',
  SMTP_TIMEOUT: 'smtp_timeout',
  SMTP_CONNECTION_REFUSED: 'smtp_connection_refused',
  SMTP_TEMP_FAILURE: 'smtp_temp_failure',
  SMTP_BLOCKED: 'smtp_blocked',
  TYPO_DETECTED: 'typo_detected',
  CATCH_ALL: 'catch_all',
  DISPOSABLE: 'disposable_email',
  EMPTY_INPUT: 'empty_input',
  INVALID_INPUT_TYPE: 'invalid_input_type',
});

/**
 * Build a uniform response object so callers always see the same shape.
 *
 * @param {Object} params
 * @returns {Object}
 */
function buildResponse({
  email = null,
  result,
  subresult,
  domain = null,
  mxRecords = [],
  executiontime = 0,
  error = null,
  didyoumean = null,
  startedAt,
}) {
  const response = {
    email,
    result,
    resultcode: RESULT_CODES[result],
    subresult,
    domain,
    mxRecords,
    executiontime,
    error,
    timestamp: new Date().toISOString(),
  };

  if (didyoumean) {
    response.didyoumean = didyoumean;
  }

  if (startedAt && !executiontime) {
    response.executiontime = Math.round((Date.now() - startedAt) / 1000);
  }

  return response;
}

/**
 * Extract the domain portion of an email address. Returns null when the input
 * is not a string or does not contain an @.
 *
 * @param {string} email
 * @returns {string|null}
 */
function extractDomain(email) {
  if (typeof email !== 'string') return null;
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1 || atIndex === email.length - 1) return null;
  return email.slice(atIndex + 1).trim().toLowerCase();
}

module.exports = {
  RESULT_CODES,
  SUBRESULTS,
  buildResponse,
  extractDomain,
};
