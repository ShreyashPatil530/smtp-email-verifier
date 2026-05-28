'use strict';

const { extractDomain } = require('./utils');

/**
 * Curated list of popular email domains. The typo detector measures the
 * Levenshtein edit distance between the user-supplied domain and each entry
 * here, and suggests the closest match when the distance is small.
 */
const POPULAR_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.co.in',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'outlook.in',
  'live.com',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'mail.com',
  'gmx.com',
  'fastmail.com',
];

/**
 * Hard-coded suggestions for typos that are common but far enough away
 * (edit distance > 2) that the distance heuristic alone wouldn't catch them.
 */
const KNOWN_TYPOS = Object.freeze({
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahoo.cm': 'yahoo.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmali.com': 'hotmail.com',
  'hotnail.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'iclod.com': 'icloud.com',
  'icoud.com': 'icloud.com',
});

/**
 * Compute the Levenshtein edit distance between two strings using the classic
 * dynamic-programming algorithm. Returns the minimum number of single-character
 * insertions, deletions or substitutions required to transform `a` into `b`.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  // Single row of the DP matrix — we only need the previous row at any point.
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      prev[j] = Math.min(
        prev[j] + 1,       // deletion
        prev[j - 1] + 1,   // insertion
        diag + cost,       // substitution
      );
      diag = temp;
    }
  }
  return prev[b.length];
}

/**
 * Find the closest popular domain to `domain`. Returns null when nothing is
 * within the threshold or when the input is already a known popular domain.
 *
 * @param {string} domain
 * @param {number} [threshold=2]
 * @returns {string|null}
 */
function suggestDomain(domain, threshold = 2) {
  if (!domain || typeof domain !== 'string') return null;
  const target = domain.toLowerCase();

  if (KNOWN_TYPOS[target]) return KNOWN_TYPOS[target];
  if (POPULAR_DOMAINS.includes(target)) return null;

  let best = null;
  let bestDist = Infinity;
  for (const candidate of POPULAR_DOMAINS) {
    const dist = levenshtein(target, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
      if (dist === 0) break;
    }
  }

  if (best && bestDist > 0 && bestDist <= threshold) return best;
  return null;
}

/**
 * Suggest a corrected email when the domain looks like a typo of a popular one.
 * Returns null when no suggestion applies.
 *
 * @param {string} email
 * @returns {string|null}
 */
function getDidYouMean(email) {
  const domain = extractDomain(email);
  if (!domain) return null;

  const suggestedDomain = suggestDomain(domain);
  if (!suggestedDomain) return null;

  const localPart = email.slice(0, email.lastIndexOf('@'));
  return `${localPart}@${suggestedDomain}`;
}

module.exports = {
  getDidYouMean,
  suggestDomain,
  levenshtein,
  POPULAR_DOMAINS,
  KNOWN_TYPOS,
};
