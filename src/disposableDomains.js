'use strict';

/**
 * A short list of well-known disposable / throwaway email providers. Used by
 * the verifier as a bonus heuristic — if the domain is on this list the
 * address is marked invalid with subresult `disposable_email`.
 *
 * This is intentionally not exhaustive; in production you would load a
 * maintained list (e.g. github.com/disposable-email-domains) instead.
 */
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'yopmail.com',
  'fakeinbox.com',
  'getnada.com',
  'trashmail.com',
  'maildrop.cc',
  'sharklasers.com',
  'discard.email',
  'dispostable.com',
  'mintemail.com',
]);

function isDisposable(domain) {
  if (!domain || typeof domain !== 'string') return false;
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

module.exports = { DISPOSABLE_DOMAINS, isDisposable };
