'use strict';

const net = require('net');

/**
 * SMTP response codes that indicate the mailbox is acceptable.
 * 250 = OK, 251 = User not local but forwarded.
 */
const ACCEPT_CODES = new Set([250, 251]);
/** SMTP codes that indicate a hard rejection (mailbox does not exist). */
const REJECT_CODES = new Set([550, 551, 553, 554]);
/** SMTP codes that indicate a temporary issue — treat as "unknown". */
const TEMP_CODES = new Set([421, 450, 451, 452]);

/**
 * Verify a single recipient by talking to the MX server directly. This is a
 * minimal SMTP conversation: HELO → MAIL FROM → RCPT TO → QUIT.
 *
 * Many providers (Gmail, Outlook, Yahoo) accept any RCPT TO at the gateway
 * to deter address harvesting. Callers should treat a 250 from those
 * providers as "unknown" rather than "valid".
 *
 * @param {Object} options
 * @param {string} options.email     Recipient address.
 * @param {string} options.host      MX hostname.
 * @param {string} options.fromEmail HELO/MAIL FROM identity.
 * @param {number} [options.port=25] SMTP port.
 * @param {number} [options.timeout=10000] Per-step idle timeout in ms.
 * @returns {Promise<{code:number|null, message:string, status:'accepted'|'rejected'|'temp'|'timeout'|'refused'|'error', error:string|null}>}
 */
function verifyMailbox({ email, host, fromEmail, port = 25, timeout = 10000 }) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buffer = '';
    let step = 0;
    let settled = false;
    // The last final SMTP reply we observed — what we report to the caller.
    let lastCode = null;
    let lastMessage = '';

    const helo = (fromEmail.split('@')[1] || 'localhost').trim();

    const steps = [
      `HELO ${helo}\r\n`,
      `MAIL FROM:<${fromEmail}>\r\n`,
      `RCPT TO:<${email}>\r\n`,
      'QUIT\r\n',
    ];

    const finish = (status, error = null) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch (_) { /* ignore */ }
      resolve({ code: lastCode, message: lastMessage, status, error });
    };

    socket.setTimeout(timeout);

    socket.on('timeout', () => finish('timeout', 'SMTP socket timed out'));
    socket.on('error', (err) => {
      if (err && err.code === 'ECONNREFUSED') {
        return finish('refused', err.message);
      }
      finish('error', err && err.message ? err.message : 'Socket error');
    });
    socket.on('close', () => {
      if (settled) return;
      // Connection closed without us reaching RCPT TO.
      if (step <= 2) finish('error', 'Connection closed before RCPT TO');
      else finish(lastCode && ACCEPT_CODES.has(lastCode) ? 'accepted' : 'error');
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      // SMTP replies can span multiple lines (e.g. "250-foo\r\n250 bar\r\n").
      // We only care about the final line of each reply, where the 4th
      // character is a space rather than a hyphen.
      let newlineIdx;
      while ((newlineIdx = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 2);
        const code = parseInt(line.slice(0, 3), 10);
        const isFinal = line.charAt(3) !== '-';
        if (!Number.isFinite(code) || !isFinal) continue;

        lastCode = code;
        lastMessage = line;

        // Step 0 = banner. Steps 1..3 are responses to the commands we sent.
        if (step === 0) {
          if (code !== 220) return finish('error', `Unexpected banner: ${line}`);
          socket.write(steps[0]);
          step = 1;
          continue;
        }

        if (step === 1) { // response to HELO
          if (code >= 400) return finish('error', `HELO rejected: ${line}`);
          socket.write(steps[1]);
          step = 2;
          continue;
        }

        if (step === 2) { // response to MAIL FROM
          if (code >= 400) return finish('error', `MAIL FROM rejected: ${line}`);
          socket.write(steps[2]);
          step = 3;
          continue;
        }

        if (step === 3) { // response to RCPT TO — the answer we came for
          let status;
          if (ACCEPT_CODES.has(code)) status = 'accepted';
          else if (REJECT_CODES.has(code)) status = 'rejected';
          else if (TEMP_CODES.has(code)) status = 'temp';
          else status = code >= 500 ? 'rejected' : 'temp';

          // Politely say QUIT, but resolve right away — we have our answer.
          try { socket.write(steps[3]); } catch (_) { /* ignore */ }
          return finish(status);
        }
      }
    });

    try {
      socket.connect(port, host);
    } catch (err) {
      finish('error', err && err.message ? err.message : 'Connect failed');
    }
  });
}

module.exports = {
  verifyMailbox,
  ACCEPT_CODES,
  REJECT_CODES,
  TEMP_CODES,
};
