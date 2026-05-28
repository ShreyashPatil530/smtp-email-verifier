'use strict';

/**
 * CLI / library entry point for the email verifier.
 *
 *   $ node index.js user@example.com [more@addresses ...]
 *
 * Programmatic use:
 *   const { verifyEmail, getDidYouMean } = require('./');
 *   const result = await verifyEmail('test@gmail.com');
 */

const { verifyEmail } = require('./src/verifyEmail');
const { getDidYouMean, suggestDomain } = require('./src/typoDetector');
const { resolveMx } = require('./src/dnsLookup');
const { verifyMailbox } = require('./src/smtpChecker');

module.exports = {
  verifyEmail,
  getDidYouMean,
  suggestDomain,
  resolveMx,
  verifyMailbox,
};

// Run as CLI only when invoked directly (not when required as a module).
if (require.main === module) {
  const args = process.argv.slice(2).filter(Boolean);
  if (args.length === 0) {
    console.log('Usage: node index.js <email> [<email> ...]');
    process.exit(1);
  }

  (async () => {
    // Verify all supplied addresses in parallel (bonus feature).
    const results = await Promise.all(args.map((e) => verifyEmail(e)));
    console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  })().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(2);
  });
}
