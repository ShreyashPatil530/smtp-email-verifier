<div align="center">

# 📧 SMTP Email Verifier

### A production-ready Node.js module for verifying email addresses

*Syntax checks · DNS MX lookup · SMTP mailbox probing · Typo correction · 41 unit tests*

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A514-43853d?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Jest](https://img.shields.io/badge/tested%20with-Jest-c21325?style=flat-square&logo=jest&logoColor=white)](https://jestjs.io)
[![Coverage](https://img.shields.io/badge/coverage-88%25-brightgreen?style=flat-square)](#-running-tests)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](#-license)
[![Author](https://img.shields.io/badge/author-Shreyash%20Patil-purple?style=flat-square)](https://github.com/ShreyashPatil530)

</div>

---

## 📚 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#%EF%B8%8F-architecture)
- [Verification Pipeline](#-verification-pipeline)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Response Format](#-response-format)
- [Usage Examples](#-usage-examples)
- [Project Structure](#-project-structure)
- [Running Tests](#-running-tests)
- [Why Gmail/Outlook return `unknown`](#-why-gmail--outlook-return-unknown)
- [Bonus Features](#-bonus-features)
- [Tech Stack](#%EF%B8%8F-tech-stack)
- [Author](#-author)
- [License](#-license)

---

## 🔍 Overview

**SMTP Email Verifier** is a zero-config Node.js library and CLI that tells you whether an email address is real — without sending an email. It combines five independent signals (syntax, typo distance, disposable-provider list, DNS MX records, SMTP `RCPT TO`) into a single, predictable JSON verdict.

The module is designed for production: every external call is **mockable for tests**, every response has the **same shape**, and providers that block address harvesting (Gmail, Outlook, Yahoo) are honestly reported as `unknown` instead of being guessed at.

---

## ✨ Features

| | Feature | Description |
| -- | ------- | ----------- |
| ✅ | **Syntax Validation** | Regex + [`validator.isEmail()`](https://www.npmjs.com/package/validator) |
| ✅ | **DNS MX Lookup** | Native `dns.resolveMx`, results sorted by priority |
| ✅ | **SMTP Verification** | Real `HELO` → `MAIL FROM` → `RCPT TO` → `QUIT` conversation on port 25 |
| ✅ | **Typo Detection** | Levenshtein distance ≤ 2 against a curated popular-domain list |
| ✅ | **Did You Mean?** | Suggests `user@gmail.com` for `user@gmial.com` |
| ✅ | **Disposable Detection** | Blocks `mailinator.com`, `tempmail.com`, `yopmail.com`, etc. |
| ✅ | **Provider Awareness** | Downgrades Gmail/Outlook `250 OK` to `unknown` (they don't expose mailbox existence) |
| ✅ | **Parallel CLI** | Verify many addresses concurrently from the terminal |
| ✅ | **Injectable Deps** | DNS + SMTP can be swapped — clean unit tests, no network needed |
| ✅ | **41 Jest Tests** | ~88% statement coverage, including a fake SMTP server |

---

## 🏗️ Architecture

The module is built as a **layered pipeline**. Each layer is a small, focused file that does one thing and exposes a pure async function. The top-level `verifyEmail()` orchestrates them and short-circuits as soon as any layer produces a verdict.

```
┌─────────────────────────────────────────────────────────────────────┐
│                       index.js  (CLI + library)                     │
│                              │                                      │
│                              ▼                                      │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │                  src/verifyEmail.js                          │  │
│   │           (orchestrator — runs the 5 stages in order)        │  │
│   └──────────────────────────────────────────────────────────────┘  │
│           │            │              │              │              │
│           ▼            ▼              ▼              ▼              │
│   ┌────────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────┐    │
│   │ Syntax     │ │ Typo     │ │ Disposable   │ │ DNS MX       │    │
│   │ validator  │ │ Detector │ │ Domain List  │ │ Lookup       │    │
│   │            │ │          │ │              │ │              │    │
│   │ regex +    │ │ Leven-   │ │ Set<string>  │ │ dns.promises │    │
│   │ validator  │ │ shtein   │ │              │ │ .resolveMx() │    │
│   └────────────┘ └──────────┘ └──────────────┘ └──────────────┘    │
│                                                       │             │
│                                                       ▼             │
│                                            ┌─────────────────────┐  │
│                                            │ src/smtpChecker.js  │  │
│                                            │ Raw TCP socket on   │  │
│                                            │ port 25 — speaks    │  │
│                                            │ SMTP state machine  │  │
│                                            └─────────────────────┘  │
│                                                       │             │
│                                                       ▼             │
│                                            ┌─────────────────────┐  │
│                                            │   src/utils.js      │  │
│                                            │   buildResponse()   │  │
│                                            │ (uniform shape)     │  │
│                                            └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Module responsibilities

| Module | Job | Why it's a separate file |
| ------ | --- | ------------------------ |
| [`src/verifyEmail.js`](src/verifyEmail.js) | Orchestrates the pipeline, short-circuits early, normalises the verdict | The only public entry point — everything below is a pure utility |
| [`src/dnsLookup.js`](src/dnsLookup.js) | Wraps `dns.promises.resolveMx`, sorts by priority, normalises errors | Lets tests swap in a fake resolver |
| [`src/smtpChecker.js`](src/smtpChecker.js) | A miniature SMTP client implemented over a raw `net.Socket` | The protocol is stateful — isolating it keeps the logic testable |
| [`src/typoDetector.js`](src/typoDetector.js) | Levenshtein distance + a curated popular-domain list + known-typo table | Pure function — fully unit-tested without any I/O |
| [`src/disposableDomains.js`](src/disposableDomains.js) | `Set` of throwaway providers + `isDisposable(domain)` | Trivially extensible; easy to swap for a maintained list |
| [`src/utils.js`](src/utils.js) | Result-code constants and the `buildResponse()` factory | Guarantees every response has identical shape |

### Design principles

1. **Single-shape responses** — every code path goes through `buildResponse()`, so callers never have to branch on which fields exist.
2. **Injectable I/O** — DNS and SMTP are passed in as options, defaulting to the real implementations. Tests inject deterministic doubles.
3. **Honest unknowns** — when a provider blocks RCPT verification or a network glitch happens, the module says `unknown` (resultcode `3`) instead of guessing `valid`.
4. **Fail-fast** — syntax → typo → disposable → DNS → SMTP. Each stage that produces a verdict skips the expensive ones below it. A typo never costs you a TCP connection.

---

## 🔄 Verification Pipeline

The exact decision tree that runs inside [`verifyEmail()`](src/verifyEmail.js):

```
                    ┌─────────────────────┐
                    │  verifyEmail(email) │
                    └──────────┬──────────┘
                               │
                               ▼
                  ╔═══════════════════════════╗
                  ║ 1. Input sanity           ║
                  ║    null / undefined / ""  ║──► invalid · empty_input
                  ║    non-string             ║──► invalid · invalid_input_type
                  ╚═════════════╤═════════════╝
                                ▼
                  ╔═══════════════════════════╗
                  ║ 2. Syntax check           ║
                  ║    regex + validator      ║──► invalid · invalid_syntax
                  ║    + length / dots / @@   ║   (still tries didyoumean)
                  ╚═════════════╤═════════════╝
                                ▼
                  ╔═══════════════════════════╗
                  ║ 3. Typo detection         ║
                  ║    Levenshtein ≤ 2 vs     ║──► invalid · typo_detected
                  ║    popular-domain list    ║      + didyoumean: "..."
                  ╚═════════════╤═════════════╝
                                ▼
                  ╔═══════════════════════════╗
                  ║ 4. Disposable check       ║
                  ║    mailinator.com, etc.   ║──► invalid · disposable_email
                  ╚═════════════╤═════════════╝
                                ▼
                  ╔═══════════════════════════╗
                  ║ 5. DNS MX lookup          ║
                  ║    no MX records          ║──► invalid · no_mx_records
                  ║    other DNS failure      ║──► invalid · dns_error
                  ╚═════════════╤═════════════╝
                                ▼
                  ╔═══════════════════════════╗
                  ║ 6. SMTP probe             ║
                  ║    250 (verifiable host)  ║──► valid · mailbox_exists
                  ║    250 (Gmail/Outlook)    ║──► unknown · smtp_blocked
                  ║    550/551/553/554        ║──► invalid · mailbox_not_found
                  ║    421/450/451/452        ║──► unknown · smtp_temp_failure
                  ║    timeout                ║──► unknown · smtp_timeout
                  ║    ECONNREFUSED           ║──► unknown · smtp_connection_refused
                  ╚═══════════════════════════╝
```

### SMTP conversation in detail

Inside step 6, [`smtpChecker.js`](src/smtpChecker.js) opens a raw TCP connection to the highest-priority MX server and walks through a four-step SMTP conversation:

```
  Client                                  Mail Server (port 25)
  ──────                                  ─────────────────────
                          ◄──  220 mx.example.com ESMTP ready
  HELO sender.com         ──►
                          ◄──  250 Hello
  MAIL FROM:<verify@…>    ──►
                          ◄──  250 OK
  RCPT TO:<target@…>      ──►  ← this is the answer we came for
                          ◄──  250 OK            → accepted
                          ◄──  550 No such user  → rejected
                          ◄──  450 Try again     → temp
  QUIT                    ──►
                          ◄──  221 Bye
```

The state machine handles **multi-line SMTP replies** (e.g. `250-foo\r\n250 bar\r\n`) correctly — only the line whose 4th character is a space counts as the final reply.

---

## 📦 Installation

```bash
git clone https://github.com/ShreyashPatil530/smtp-email-verifier.git
cd smtp-email-verifier
npm install
```

**Requirements:** Node.js ≥ 14

---

## 🚀 Quick Start

### As a library

```js
const { verifyEmail, getDidYouMean } = require('./');

(async () => {
  const result = await verifyEmail('user@example.com');
  console.log(result);
})();
```

### As a CLI

```bash
node index.js user@example.com another@example.org
```

> Multiple addresses are verified **in parallel** and printed as a JSON array.

---

## 📤 Response Format

Every call returns this exact shape:

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
  "didyoumean": null          // present only when a typo is detected
}
```

### 🎯 Result codes

| Result      | Code | Meaning                                                       |
| ----------- | :--: | ------------------------------------------------------------- |
| 🟢 `valid`   | `1`  | Mailbox confirmed by the SMTP server                           |
| 🟡 `unknown` | `3`  | Provider blocked verification, or timeout / temporary failure  |
| 🔴 `invalid` | `6`  | Bad syntax, typo, no MX, disposable, or `550` mailbox missing  |

### 🏷️ Subresults

| Subresult                  | When                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `mailbox_exists`           | `RCPT TO` accepted (`250`) on a verifiable provider           |
| `mailbox_not_found`        | `RCPT TO` rejected (`550`/`551`/`553`/`554`)                  |
| `invalid_syntax`           | Failed regex or `validator.isEmail()`                          |
| `no_mx_records`            | Domain has no MX records                                       |
| `dns_error`                | DNS lookup failed for another reason                           |
| `smtp_timeout`             | SMTP server did not respond in time                            |
| `smtp_connection_refused`  | TCP connection refused                                         |
| `smtp_temp_failure`        | `4xx` response — try again later                               |
| `smtp_blocked`             | Provider hides mailbox existence (Gmail, Outlook, …)           |
| `typo_detected`            | Domain looks like a typo — see `didyoumean`                    |
| `disposable_email`         | Domain is on the disposable-provider list                      |
| `empty_input`              | `null`, `undefined`, or `""`                                   |
| `invalid_input_type`       | Input was not a string                                         |

---

## 💡 Usage Examples

### ✅ Valid email (verifiable provider)

```js
await verifyEmail('postmaster@cloudflare.com');
// → { result: 'valid', resultcode: 1, subresult: 'mailbox_exists', ... }
```

### 🟡 Gmail / Outlook (gateway blocks verification)

```js
await verifyEmail('test@gmail.com');
// → { result: 'unknown', resultcode: 3, subresult: 'smtp_blocked', ... }
```

### 🔴 Typo

```js
await verifyEmail('user@gmial.com');
// {
//   "result": "invalid",
//   "resultcode": 6,
//   "subresult": "typo_detected",
//   "didyoumean": "user@gmail.com"
// }
```

### 🔴 Bad syntax

```js
await verifyEmail('abcgmail.com');
// → { result: 'invalid', subresult: 'invalid_syntax', ... }
```

### 🛠️ Standalone helpers

```js
const { getDidYouMean, suggestDomain } = require('./');

getDidYouMean('hello@outlok.com'); // → 'hello@outlook.com'
suggestDomain('hotmial.com');      // → 'hotmail.com'
```

### ⚙️ Custom options

```js
await verifyEmail('user@example.com', {
  fromEmail: 'verify@yourdomain.com', // identity used in HELO / MAIL FROM
  timeout: 5000,                      // per-SMTP-step idle timeout in ms
});
```

---

## 📁 Project Structure

```
smtp-email-verifier/
│
├── 📂 src/
│   ├── 📄 verifyEmail.js          # Orchestrator: syntax → typo → DNS → SMTP
│   ├── 📄 smtpChecker.js          # Raw SMTP state machine on port 25
│   ├── 📄 typoDetector.js         # Levenshtein + getDidYouMean()
│   ├── 📄 dnsLookup.js            # dns.promises.resolveMx wrapper
│   ├── 📄 disposableDomains.js    # Throwaway-provider blocklist
│   └── 📄 utils.js                # Result codes + buildResponse()
│
├── 📂 tests/
│   ├── 🧪 verifyEmail.test.js     # Pipeline tests with injected fakes
│   ├── 🧪 typoDetector.test.js    # Typo + Levenshtein unit tests
│   └── 🧪 smtp.test.js            # Real SMTP vs in-process fake server
│
├── 📜 index.js                    # Library + CLI entry point
├── 📜 package.json
├── 📜 .gitignore
└── 📖 README.md
```

---

## 🧪 Running Tests

```bash
npm test
```

`npm test` runs Jest with coverage reporting.

### Coverage snapshot

```
Test Suites: 3 passed, 3 total
Tests:       41 passed, 41 total

----------------------|---------|----------|---------|---------|
File                  | % Stmts | % Branch | % Funcs | % Lines |
----------------------|---------|----------|---------|---------|
All files             |   88.01 |    68.71 |   83.33 |   90.77 |
 disposableDomains.js |   80.00 |    75.00 |  100.00 |  100.00 |
 smtpChecker.js       |   87.01 |    49.05 |  100.00 |   92.18 |
 typoDetector.js      |   96.15 |    93.33 |  100.00 |  100.00 |
 utils.js             |  100.00 |    88.88 |  100.00 |  100.00 |
 verifyEmail.js       |   93.75 |    80.64 |  100.00 |   95.94 |
----------------------|---------|----------|---------|---------|
```

### What's covered

- 🧪 **Syntax** — valid formats, missing `@`, multiple `@`, double dots, missing parts, oversized inputs (> 254 chars).
- 🧪 **SMTP** — `250`, `550`, `450`, timeout, refused, multi-line replies — all exercised against an **in-process fake SMTP server** spun up by the tests.
- 🧪 **Typos** — `gmial → gmail`, `yahooo → yahoo`, `hotmial → hotmail`, `outlok → outlook`, plus a dedicated Levenshtein unit test.
- 🧪 **Edge cases** — `null`, `undefined`, empty string, non-string input, very long emails, `@@` symbols, disposable domains.

---

## 🤔 Why Gmail / Outlook return `unknown`

Large providers (Gmail, Outlook, Yahoo, iCloud) accept **any** `RCPT TO` at the SMTP gateway to prevent spammers from harvesting valid addresses. The real mailbox check happens later, inside the provider's network, and there is **no way to see that result from outside**.

This module is honest about that fact: when the domain is one of these providers, even a `250 OK` is reported as `unknown` + `smtp_blocked` instead of being guessed as `valid`. Every reputable third-party email verifier behaves the same way.

Providers currently treated as RCPT-blocked:

```
gmail.com · googlemail.com · outlook.com · hotmail.com · live.com
msn.com · yahoo.com · yahoo.co.uk · yahoo.co.in · icloud.com · me.com · mac.com
```

---

## 🎁 Bonus Features

Implemented beyond the assignment requirements:

- ✅ **Disposable-email detection** — [`src/disposableDomains.js`](src/disposableDomains.js)
- ✅ **Parallel verification** — CLI verifies many addresses concurrently via `Promise.all`
- ✅ **Provider-aware downgrade** — Gmail/Outlook `250` → `unknown` instead of false `valid`
- ✅ **Injectable DNS + SMTP** — clean unit tests, no real network required
- ✅ **Multi-line SMTP reply parsing** — handles `250-foo\r\n250 bar\r\n`
- ✅ **In-process fake SMTP server** in tests — exercises the real socket code

---

## 🛠️ Tech Stack

<div align="center">

| Layer | Technology |
| ----- | ---------- |
| Runtime | ![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white) |
| Language | ![JavaScript](https://img.shields.io/badge/JavaScript_ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black) |
| Validation | ![Validator](https://img.shields.io/badge/validator.js-2C8EBB?style=for-the-badge) |
| Networking | ![DNS](https://img.shields.io/badge/Node_DNS-43853d?style=for-the-badge&logo=node.js&logoColor=white) ![SMTP](https://img.shields.io/badge/SMTP_port_25-FF6F00?style=for-the-badge) |
| Testing | ![Jest](https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white) |

</div>

---

## 👤 Author

<div align="center">

### **Shreyash Patil**

[![GitHub](https://img.shields.io/badge/GitHub-ShreyashPatil530-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ShreyashPatil530)

</div>

---

## 📄 License

Released under the [MIT License](https://opensource.org/licenses/MIT) — free to use, modify and distribute.

<div align="center">

⭐ **If this project helped you, please consider giving it a star on GitHub!** ⭐

</div>
