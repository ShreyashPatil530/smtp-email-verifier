# Email Verification Module

A production-ready Node.js module that verifies email addresses through:

1. **Syntax validation** (regex + [`validator`](https://www.npmjs.com/package/validator))
2. **DNS MX lookup** (`dns.resolveMx`)
3. **SMTP mailbox verification** (`HELO` → `MAIL FROM` → `RCPT TO`)
4. **"Did you mean?" typo detection** (Levenshtein distance against popular domains)
5. **Disposable-domain detection** (bonus)
6. **Parallel verification + CLI** (bonus)

Each call returns a single, predictable JSON object describing the result.

---

## Installation

```bash
git clone <your-repo-url> email-verifier
cd email-verifier
npm install
```

Requires Node.js ≥ 14.

---

## Quick Start

### Library

```js
const { verifyEmail, getDidYouMean } = require('./');

(async () => {
  const result = await verifyEmail('test@gmail.com');
  console.log(result);
})();
```

### CLI

```bash
node index.js user@example.com another@example.org
```

Multiple addresses are verified **in parallel** and the results are printed as JSON.

---

## Response Format

```jsonc
{
  "email": "user@example.com",
  "result": "valid",          // "valid" | "unknown" | "invalid"
  "resultcode": 1,            // 1 | 3 | 6
  "subresult": "mailbox_exists",
  "domain": "example.com",
  "mxRecords": ["mx1.example.com"],
  "executiontime": 2,         // seconds
  "error": null,
  "timestamp": "2026-05-28T10:30:00.000Z",
  "didyoumean": null          // only present when a typo is suspected
}
```

### Result codes

| Result    | ResultCode | Meaning                                |
| --------- | ---------- | -------------------------------------- |
| `valid`   | 1          | Mailbox confirmed by SMTP server.      |
| `unknown` | 3          | Provider blocked verification, or a timeout / temporary failure occurred. |
| `invalid` | 6          | Bad syntax, typo, no MX, disposable, or `550` from the SMTP server. |

### Subresults

| Subresult                  | When                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `mailbox_exists`           | `RCPT TO` accepted with `250` on a verifiable provider.       |
| `mailbox_not_found`        | `RCPT TO` rejected with `550`/`551`/`553`/`554`.              |
| `invalid_syntax`           | Failed regex / `validator.isEmail()`.                         |
| `no_mx_records`            | Domain has no MX records.                                     |
| `dns_error`                | DNS lookup failed for another reason.                         |
| `smtp_timeout`             | SMTP server did not respond in time.                          |
| `smtp_connection_refused`  | TCP connection refused.                                       |
| `smtp_temp_failure`        | `4xx` response (try again later).                             |
| `smtp_blocked`             | Provider hides mailbox existence (e.g. Gmail, Outlook).       |
| `typo_detected`            | Domain looks like a typo — see `didyoumean`.                  |
| `disposable_email`         | Domain is on the disposable-providers list.                   |
| `empty_input`              | `null` / `undefined` / `""`.                                  |
| `invalid_input_type`       | Input was not a string.                                       |

---

## Usage Examples

### Valid email (real SMTP allowed)

```js
await verifyEmail('postmaster@cloudflare.com');
// → { result: 'valid', resultcode: 1, subresult: 'mailbox_exists', ... }
```

### Gmail / Outlook (provider blocks RCPT verification)

```js
await verifyEmail('test@gmail.com');
// → { result: 'unknown', resultcode: 3, subresult: 'smtp_blocked', ... }
```

### Typo

```js
await verifyEmail('user@gmial.com');
// → {
//     result: 'invalid',
//     subresult: 'typo_detected',
//     didyoumean: 'user@gmail.com',
//     ...
//   }
```

### Bad syntax

```js
await verifyEmail('abcgmail.com');
// → { result: 'invalid', subresult: 'invalid_syntax', ... }
```

### Standalone helpers

```js
const { getDidYouMean } = require('./');
getDidYouMean('hello@outlok.com'); // → 'hello@outlook.com'
```

### Custom options

```js
await verifyEmail('user@example.com', {
  fromEmail: 'verify@yourdomain.com', // identity used in HELO / MAIL FROM
  timeout: 5000,                      // per-SMTP-step idle timeout (ms)
});
```

---

## Project Structure

```
email-verifier/
├── src/
│   ├── verifyEmail.js         // Top-level pipeline (syntax → typo → DNS → SMTP)
│   ├── smtpChecker.js         // Raw SMTP conversation (HELO / MAIL FROM / RCPT TO)
│   ├── typoDetector.js        // "Did you mean?" + Levenshtein distance
│   ├── dnsLookup.js           // dns.resolveMx wrapper
│   ├── disposableDomains.js   // Bonus: disposable-provider list
│   └── utils.js               // Result-code constants + response builder
├── tests/
│   ├── verifyEmail.test.js    // End-to-end pipeline tests (network mocked)
│   ├── typoDetector.test.js   // Typo + Levenshtein tests
│   └── smtp.test.js           // Real SMTP conversation against a fake server
├── index.js                   // Library + CLI entry point
├── package.json
└── README.md
```

---

## Running Tests

```bash
npm test
```

`npm test` runs Jest with coverage. Tests cover:

- **Syntax**: valid formats, missing `@`, multiple `@`, double dots, missing parts, oversized inputs.
- **SMTP**: `250`, `550`, `450`, timeout, refused, multi-line replies — exercised against an in-process fake SMTP server.
- **Typos**: `gmial → gmail`, `yahooo → yahoo`, `hotmial → hotmail`, `outlok → outlook`, plus a Levenshtein unit test.
- **Edge cases**: `null`, `undefined`, empty string, non-string input, very long emails, `@@` symbols.

---

## Why does Gmail / Outlook return `unknown`?

To deter spammers harvesting valid addresses, large providers accept any
`RCPT TO` at the gateway and only check the mailbox later. There is no way
to tell from outside the network whether the mailbox actually exists, so
this module honestly reports `unknown` instead of guessing `valid`. This
behaviour matches every reputable third-party verifier.

---

## Bonus Features Implemented

- ✅ Disposable-email detection (`src/disposableDomains.js`)
- ✅ Parallel verification (CLI accepts many addresses)
- ✅ Provider-aware downgrade (Gmail/Outlook → `unknown`)
- ✅ Injectable DNS + SMTP for clean unit testing

---

## License

MIT
