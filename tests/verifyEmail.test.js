'use strict';

const { verifyEmail } = require('../src/verifyEmail');

/**
 * The unit tests inject fake DNS and SMTP implementations so we exercise the
 * verifier's logic without touching the network. Real-network behaviour is
 * left to manual / integration testing.
 */

// A passing MX lookup that returns a single fake exchanger.
const fakeMx = async (domain) => ({
  ok: true,
  records: [`mx1.${domain}`],
  error: null,
  code: null,
});

const failingMx = async () => ({
  ok: false,
  records: [],
  error: 'No MX records found',
  code: 'ENODATA',
});

// SMTP doubles — one per status we care about.
const smtpAccept = async () => ({ code: 250, message: '250 OK', status: 'accepted', error: null });
const smtpReject = async () => ({ code: 550, message: '550 No such user', status: 'rejected', error: null });
const smtpTemp = async () => ({ code: 450, message: '450 Try again', status: 'temp', error: null });
const smtpTimeout = async () => ({ code: null, message: '', status: 'timeout', error: 'SMTP socket timed out' });
const smtpRefused = async () => ({ code: null, message: '', status: 'refused', error: 'ECONNREFUSED' });

describe('verifyEmail — input handling', () => {
  test('rejects null with empty_input', async () => {
    const res = await verifyEmail(null);
    expect(res.result).toBe('invalid');
    expect(res.resultcode).toBe(6);
    expect(res.subresult).toBe('empty_input');
  });

  test('rejects undefined with empty_input', async () => {
    const res = await verifyEmail(undefined);
    expect(res.result).toBe('invalid');
    expect(res.subresult).toBe('empty_input');
  });

  test('rejects empty string', async () => {
    const res = await verifyEmail('');
    expect(res.result).toBe('invalid');
    expect(res.subresult).toBe('empty_input');
  });

  test('rejects non-string input', async () => {
    const res = await verifyEmail(12345);
    expect(res.result).toBe('invalid');
    expect(res.subresult).toBe('invalid_input_type');
  });
});

describe('verifyEmail — syntax validation', () => {
  test('rejects missing @ symbol', async () => {
    const res = await verifyEmail('abcgmail.com');
    expect(res.result).toBe('invalid');
    expect(res.subresult).toBe('invalid_syntax');
  });

  test('rejects multiple @ symbols', async () => {
    const res = await verifyEmail('user@@gmail.com');
    expect(res.result).toBe('invalid');
    expect(res.subresult).toBe('invalid_syntax');
  });

  test('rejects double dots in local part', async () => {
    const res = await verifyEmail('test..123@gmail.com');
    expect(res.result).toBe('invalid');
    expect(res.subresult).toBe('invalid_syntax');
  });

  test('rejects missing local part', async () => {
    const res = await verifyEmail('@gmail.com');
    expect(res.result).toBe('invalid');
    expect(res.subresult).toBe('invalid_syntax');
  });

  test('rejects missing domain', async () => {
    const res = await verifyEmail('test@');
    expect(res.result).toBe('invalid');
    expect(res.subresult).toBe('invalid_syntax');
  });

  test('rejects whitespace inside the address', async () => {
    const res = await verifyEmail('te st@gmail.com');
    expect(res.result).toBe('invalid');
    expect(res.subresult).toBe('invalid_syntax');
  });

  test('accepts a syntactically valid address (uses fakes for network)', async () => {
    const res = await verifyEmail('user@example.com', {
      resolveMx: fakeMx,
      verifyMailbox: smtpAccept,
    });
    expect(res.result).toBe('valid');
    expect(res.subresult).toBe('mailbox_exists');
    expect(res.domain).toBe('example.com');
    expect(res.mxRecords).toEqual(['mx1.example.com']);
  });

  test('rejects extremely long emails (> 254 chars)', async () => {
    const longLocal = 'a'.repeat(260);
    const res = await verifyEmail(`${longLocal}@gmail.com`);
    expect(res.result).toBe('invalid');
    expect(res.subresult).toBe('invalid_syntax');
  });
});

describe('verifyEmail — SMTP response handling', () => {
  test('SMTP 250 on a normal domain → valid', async () => {
    const res = await verifyEmail('user@example.com', {
      resolveMx: fakeMx,
      verifyMailbox: smtpAccept,
    });
    expect(res.result).toBe('valid');
    expect(res.resultcode).toBe(1);
    expect(res.subresult).toBe('mailbox_exists');
  });

  test('SMTP 550 → invalid (mailbox not found)', async () => {
    const res = await verifyEmail('ghost@example.com', {
      resolveMx: fakeMx,
      verifyMailbox: smtpReject,
    });
    expect(res.result).toBe('invalid');
    expect(res.resultcode).toBe(6);
    expect(res.subresult).toBe('mailbox_not_found');
  });

  test('SMTP 450 → unknown (temporary failure)', async () => {
    const res = await verifyEmail('user@example.com', {
      resolveMx: fakeMx,
      verifyMailbox: smtpTemp,
    });
    expect(res.result).toBe('unknown');
    expect(res.resultcode).toBe(3);
    expect(res.subresult).toBe('smtp_temp_failure');
  });

  test('SMTP timeout → unknown', async () => {
    const res = await verifyEmail('user@example.com', {
      resolveMx: fakeMx,
      verifyMailbox: smtpTimeout,
    });
    expect(res.result).toBe('unknown');
    expect(res.subresult).toBe('smtp_timeout');
  });

  test('SMTP connection refused → unknown', async () => {
    const res = await verifyEmail('user@example.com', {
      resolveMx: fakeMx,
      verifyMailbox: smtpRefused,
    });
    expect(res.result).toBe('unknown');
    expect(res.subresult).toBe('smtp_connection_refused');
  });

  test('Gmail-style accept is downgraded to unknown', async () => {
    const res = await verifyEmail('test@gmail.com', {
      resolveMx: fakeMx,
      verifyMailbox: smtpAccept,
    });
    expect(res.result).toBe('unknown');
    expect(res.subresult).toBe('smtp_blocked');
  });
});

describe('verifyEmail — DNS handling', () => {
  test('no MX records → invalid', async () => {
    const res = await verifyEmail('user@nodomain.test', {
      resolveMx: failingMx,
      verifyMailbox: smtpAccept,
    });
    expect(res.result).toBe('invalid');
    expect(res.subresult).toBe('no_mx_records');
  });
});

describe('verifyEmail — typo and disposable detection', () => {
  test('gmial.com gets flagged with a "did you mean" suggestion', async () => {
    const res = await verifyEmail('user@gmial.com', {
      resolveMx: fakeMx,
      verifyMailbox: smtpAccept,
    });
    expect(res.result).toBe('invalid');
    expect(res.subresult).toBe('typo_detected');
    expect(res.didyoumean).toBe('user@gmail.com');
  });

  test('disposable domain → invalid', async () => {
    const res = await verifyEmail('foo@mailinator.com', {
      resolveMx: fakeMx,
      verifyMailbox: smtpAccept,
    });
    expect(res.result).toBe('invalid');
    expect(res.subresult).toBe('disposable_email');
  });
});

describe('verifyEmail — response shape', () => {
  test('response contains all documented fields', async () => {
    const res = await verifyEmail('user@example.com', {
      resolveMx: fakeMx,
      verifyMailbox: smtpAccept,
    });
    expect(res).toEqual(expect.objectContaining({
      email: 'user@example.com',
      result: 'valid',
      resultcode: 1,
      subresult: 'mailbox_exists',
      domain: 'example.com',
      mxRecords: ['mx1.example.com'],
      error: null,
    }));
    expect(typeof res.executiontime).toBe('number');
    expect(typeof res.timestamp).toBe('string');
    // Timestamp should be a valid ISO-8601 string.
    expect(() => new Date(res.timestamp).toISOString()).not.toThrow();
  });
});
