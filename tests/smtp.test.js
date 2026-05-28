'use strict';

const net = require('net');
const { verifyMailbox } = require('../src/smtpChecker');

/**
 * Spin up a tiny in-process TCP server that mimics an SMTP server with a
 * scripted RCPT TO response. This lets us exercise the real SMTP state
 * machine in smtpChecker.js without going to a real mail server.
 *
 * @param {Object} script
 * @param {string} [script.rcptResponse='250 OK\r\n']  What to send after RCPT TO.
 * @param {boolean} [script.silentRcpt=false]          If true, never reply to RCPT TO.
 * @param {boolean} [script.noBanner=false]            If true, never send the 220 banner.
 * @returns {Promise<{port:number, close:()=>Promise<void>}>}
 */
function startFakeSmtp(script = {}) {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      if (!script.noBanner) {
        socket.write('220 fake.smtp ESMTP ready\r\n');
      }
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let idx;
        while ((idx = buffer.indexOf('\r\n')) !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const upper = line.toUpperCase();
          if (upper.startsWith('HELO') || upper.startsWith('EHLO')) {
            socket.write('250 Hello\r\n');
          } else if (upper.startsWith('MAIL FROM')) {
            socket.write('250 OK\r\n');
          } else if (upper.startsWith('RCPT TO')) {
            if (script.silentRcpt) continue; // simulate hang
            socket.write(script.rcptResponse || '250 OK\r\n');
          } else if (upper.startsWith('QUIT')) {
            socket.write('221 Bye\r\n');
            socket.end();
          }
        }
      });
      socket.on('error', () => { /* swallow */ });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

describe('verifyMailbox — SMTP conversation', () => {
  let fake;
  afterEach(async () => {
    if (fake) {
      await fake.close();
      fake = null;
    }
  });

  test('250 → accepted', async () => {
    fake = await startFakeSmtp({ rcptResponse: '250 OK\r\n' });
    const result = await verifyMailbox({
      email: 'user@example.com',
      host: '127.0.0.1',
      port: fake.port,
      fromEmail: 'verify@example.com',
      timeout: 3000,
    });
    expect(result.status).toBe('accepted');
    expect(result.code).toBe(250);
  });

  test('550 → rejected', async () => {
    fake = await startFakeSmtp({ rcptResponse: '550 No such user\r\n' });
    const result = await verifyMailbox({
      email: 'ghost@example.com',
      host: '127.0.0.1',
      port: fake.port,
      fromEmail: 'verify@example.com',
      timeout: 3000,
    });
    expect(result.status).toBe('rejected');
    expect(result.code).toBe(550);
  });

  test('450 → temp', async () => {
    fake = await startFakeSmtp({ rcptResponse: '450 Try later\r\n' });
    const result = await verifyMailbox({
      email: 'user@example.com',
      host: '127.0.0.1',
      port: fake.port,
      fromEmail: 'verify@example.com',
      timeout: 3000,
    });
    expect(result.status).toBe('temp');
    expect(result.code).toBe(450);
  });

  test('silent RCPT response → timeout', async () => {
    fake = await startFakeSmtp({ silentRcpt: true });
    const result = await verifyMailbox({
      email: 'user@example.com',
      host: '127.0.0.1',
      port: fake.port,
      fromEmail: 'verify@example.com',
      timeout: 500,
    });
    expect(result.status).toBe('timeout');
  });

  test('connection refused → refused', async () => {
    // Use a port that is essentially guaranteed to be closed.
    const result = await verifyMailbox({
      email: 'user@example.com',
      host: '127.0.0.1',
      port: 1, // privileged port unlikely to accept from a normal process
      fromEmail: 'verify@example.com',
      timeout: 2000,
    });
    // On Windows / locked-down hosts this can surface as `refused` or `error`
    // depending on whether the OS sends RST or simply times out.
    expect(['refused', 'error', 'timeout']).toContain(result.status);
  });

  test('handles multi-line SMTP replies (e.g. 250-foo / 250 bar)', async () => {
    fake = await startFakeSmtp({ rcptResponse: '250-Hello\r\n250 OK\r\n' });
    const result = await verifyMailbox({
      email: 'user@example.com',
      host: '127.0.0.1',
      port: fake.port,
      fromEmail: 'verify@example.com',
      timeout: 3000,
    });
    expect(result.status).toBe('accepted');
    expect(result.code).toBe(250);
  });
});
