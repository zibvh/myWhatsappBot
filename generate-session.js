/**
 * Run this ONCE on your own computer (not on Render):
 *
 *   npm run pair
 *
 * It logs the bot into WhatsApp using a pairing code (no QR needed), then
 * prints a SESSION_ID string. Paste that into Render's environment
 * variables and the deployed bot will start already logged in.
 */
const path = require('path');
const readline = require('readline/promises');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, Browsers, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('./config');
const { packSessionFolder } = require('./lib/sessionBundle');

const SESSION_FOLDER = path.join(__dirname, 'session');

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

// requestPairingCode sends a raw frame over sock.ws immediately - it does NOT
// wait for the handshake. So we must wait for the actual underlying WebSocket
// to report itself open before calling it. If it never opens (or opens then
// immediately closes), that's a strong sign the network is blocking the
// connection to WhatsApp's servers rather than a code bug.
function waitForWsOpen(sock) {
  return new Promise((resolve, reject) => {
    if (sock.ws.isOpen) return resolve();

    const cleanup = () => {
      sock.ws.off('open', onOpen);
      sock.ws.off('close', onClose);
      sock.ws.off('error', onError);
      clearTimeout(timer);
    };
    const onOpen = () => { cleanup(); resolve(); };
    const onClose = (code, reason) => {
      cleanup();
      reject(new Error(`WebSocket closed before it opened (code ${code}${reason ? ', ' + reason : ''}). This usually means your network/ISP/firewall is blocking WhatsApp's connection - try a VPN or a different network (e.g. mobile data).`));
    };
    const onError = (err) => { cleanup(); reject(err); };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out after 15s waiting for the WebSocket to open. This usually means your network/ISP/firewall is blocking WhatsApp's connection - try a VPN or a different network (e.g. mobile data)."));
    }, 15000);

    sock.ws.on('open', onOpen);
    sock.ws.on('close', onClose);
    sock.ws.on('error', onError);
  });
}

// Runs one connection attempt. Resolves once fully logged in (connection
// 'open'). If WhatsApp closes the socket with "restart required" - which is
// the NORMAL thing that happens right after you enter the pairing code on
// your phone - it transparently reconnects with the now-updated saved creds
// to finish the login, instead of the process just dying.
function connectAndPair(number, version, { isRetry = false, useQr = false } = {}) {
  return new Promise((resolve, reject) => {
    (async () => {
      const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);
      const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: false
      });

      sock.ev.on('creds.update', saveCreds);

      // Register this BEFORE requesting the pairing code, so we catch every
      // close/open event instead of missing ones that happen while we're
      // still awaiting something else.
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (useQr && qr) {
          console.log('\nScan this QR code with WhatsApp > Linked Devices > Link a Device:\n');
          qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
          // give creds.update a moment to flush the final key files to disk
          await new Promise((r) => setTimeout(r, 1500));
          const sessionId = packSessionFolder(SESSION_FOLDER);
          console.log('\n Logged in! Copy everything between the lines below into a\n   SESSION_ID environment variable on Render:\n');
          console.log('-----BEGIN SESSION_ID-----');
          console.log(sessionId);
          console.log('-----END SESSION_ID-----\n');
          resolve();
        } else if (connection === 'close') {
          const statusCode = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : undefined;
          const message = lastDisconnect?.error?.message || 'unknown reason';
          console.log(`[connection] closed (code ${statusCode}): ${message}`);

          if (statusCode === DisconnectReason.restartRequired) {
            console.log('[connection] Restart required (this is normal right after entering the pairing code/QR) - reconnecting to finish login...');
            try {
              await connectAndPair(number, version, { isRetry: true, useQr });
              resolve();
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`Connection closed unexpectedly (code ${statusCode}): ${message}`));
          }
        }
      });

      if (!useQr && !isRetry && !sock.authState.creds.registered) {
        try {
          await waitForWsOpen(sock);
          const code = await sock.requestPairingCode(number);
          console.log('\nYour pairing code:  ' + code);
          console.log('On your phone: WhatsApp > Linked Devices > Link a Device > Link with phone number instead, then enter this code.');
          console.log('(Leave this running - it will finish automatically once you enter the code.)\n');
        } catch (err) {
          reject(err);
        }
      }
    })().catch(reject);
  });
}

async function main() {
  let number = config.BOT_NUMBER;
  let useQr = false;

  const method = (await ask('Pair using [1] phone number code or [2] QR code (recommended - press Enter for QR): ')).trim();
  useQr = method !== '1';

  if (!useQr && !number) {
    number = (await ask('Enter the WhatsApp number for the BOT, with country code, digits only (e.g. 15551234567): ')).replace(/\D/g, '');
    if (!number) {
      console.error('No phone number given, exiting.');
      process.exit(1);
    }
  }

  // Pin the socket to whatever protocol version WhatsApp currently expects.
  // Without this, an outdated bundled version gets the connection closed
  // by WhatsApp's servers immediately (the "428 Connection Closed" error).
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Using WA v${version.join('.')}${isLatest ? ' (latest)' : ' (not latest, but fetched fresh)'}`);

  await connectAndPair(number, version, { useQr });
  process.exit(0);
}

main().catch((err) => {
  console.error('Pairing failed:', err);
  process.exit(1);
});
