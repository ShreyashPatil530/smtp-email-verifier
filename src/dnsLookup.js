'use strict';

const dns = require('dns').promises;

/**
 * Resolve MX records for a domain and return them sorted by priority
 * (lowest priority value first — that is the preferred mail exchanger).
 *
 * @param {string} domain
 * @returns {Promise<{ok: boolean, records: string[], error: string|null, code: string|null}>}
 */
async function resolveMx(domain) {
  if (!domain || typeof domain !== 'string') {
    return {
      ok: false,
      records: [],
      error: 'Domain must be a non-empty string',
      code: 'EBADDOMAIN',
    };
  }

  try {
    const records = await dns.resolveMx(domain);

    if (!Array.isArray(records) || records.length === 0) {
      return {
        ok: false,
        records: [],
        error: 'No MX records found',
        code: 'ENODATA',
      };
    }

    const sorted = [...records]
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange);

    return { ok: true, records: sorted, error: null, code: null };
  } catch (err) {
    return {
      ok: false,
      records: [],
      error: err.message || 'DNS lookup failed',
      code: err.code || 'EDNS',
    };
  }
}

module.exports = { resolveMx };
