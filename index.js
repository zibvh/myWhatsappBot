const path = require('path');
const fs = require('fs');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');
const baileys = require('@whiskeysockets/baileys');
const makeWASocket = baileys.default;
const { useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = baileys;

const config = require('./config');
const { loadPlugins } = require('./lib/loadPlugins');
const { unpackSessionFolder } = require('./lib/sessionBundle');
const { isOwner, isGroupAdmin, isBotGroupAdmin } = require('./lib/permissions');
const { startKeepAliveServer } = require('./lib/keepAlive');

const SESSION_FOLDER = path.join(__dirname, 'session');
const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });

let status = 'starting';

// If a SESSION_ID was provided and we don't already have a session on disk
// (e.g. a fresh Render deploy), restore it before connecting.
function restoreSessionIfNeeded() {
  const hasLocalSession = fs.existsSync(path.join(SESSION_FOLDER, 'creds.json'));
  if (!hasLocalSession && config.SESSION_ID) {
    console.log('[session] Restoring session from SESSION_ID...');
    unpackSessionFolder(config.SESSION_ID, SESSION_FOLDER);
  }
}

function getMessageText(message) {
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  );
}

// Disappearing ("ephemeral") messages wrap the real content one level deep.
// This only unwraps that — it does NOT touch view-once media.
function unwrapEphemeral(message) {
  return message?.ephemeralMessage?.message || message;
}

function getQuoted(message) {
  const ctxInfo =
    message?.extendedTextMessage?.contextInfo ||
    message?.imageMessage?.contextInfo ||
    message?.videoMessage?.contextInfo;
  const quotedMessage = ctxInfo?.quotedMessage;
  if (!quotedMessage) return null;
  return {
    message: quotedMessage,
    participant: ctxInfo.participant,
    stanzaId: ctxInfo.stanzaId
  };
}

// Finds the group participant entry matching the bot's own jid, tolerating
// the @lid / @s.whatsapp.net formatting differences Baileys sometimes uses.
function findBotParticipantJid(botJid, groupMetadata) {
  if (!groupMetadata || !botJid) return botJid;
  const botNumber = botJid.split(':')[0].split('@')[0];
  const match = groupMetadata.participants?.find((p) => p.id.split(':')[0].split('@')[0] === botNumber);
  return match?.id || botJid;
}

async function handleMessage(sock, msg, { commandMap, allCommands, pluginModules }) {
  if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

  const message = unwrapEphemeral(msg.message);
  const jid = msg.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  const sender = isGroup ? (msg.key.participant || jid) : jid;
  const text = getMessageText(message).trim();
  const botJid = sock.user?.id;

  let groupMetadata = null;
  if (isGroup) {
    groupMetadata = await sock.groupMetadata(jid).catch(() => null);
  }

  const reply = (content) => {
    const payload = typeof content === 'string' ? { text: content } : content;
    return sock.sendMessage(jid, payload, { quoted: msg });
  };

  const ctx = {
    sock,
    msg,
    message,
    jid,
    sender,
    isGroup,
    groupMetadata,
    text,
    quoted: getQuoted(message),
    reply,
    isOwner: isOwner(sender),
    isSenderAdmin: isGroup ? isGroupAdmin(groupMetadata, sender) : false,
    isBotAdmin: isGroup ? isBotGroupAdmin(groupMetadata, findBotParticipantJid(botJid, groupMetadata)) : false,
    config
  };

  // Passive listeners (antilink, word triggers, etc.) run on every message.
  for (const plugin of pluginModules) {
    if (typeof plugin.onMessage === 'function') {
      await plugin.onMessage(ctx).catch((err) => console.error('[plugin] onMessage error:', err));
    }
  }

  if (!text.startsWith(config.PREFIX)) return;
  const withoutPrefix = text.slice(config.PREFIX.length).trim();
  if (!withoutPrefix) return;
  const [cmdName, ...args] = withoutPrefix.split(/\s+/);
  const command = commandMap.get(cmdName.toLowerCase());
  if (!command) return;

  if (config.MODE === 'private' && !ctx.isOwner) {
    return reply('This bot is in private mode right now.');
  }
  if (command.ownerOnly && !ctx.isOwner) {
    return reply('That command is owner-only.');
  }
  if (command.groupOnly && !isGroup) {
    return reply('That command only works in groups.');
  }
  if (command.adminOnly && isGroup && !ctx.isSenderAdmin && !ctx.isOwner) {
    return reply('That command is for group admins only.');
  }

  ctx.args = args;
  ctx.text = args.join(' ');
  ctx.command = command.name;
  ctx.allCommands = allCommands;

  try {
    await command.execute(ctx);
  } catch (err) {
    console.error(`[command:${command.name}] error:`, err);
    reply(`Something went wrong running .${command.name}.`).catch(() => {});
  }
}

async function connectToWhatsApp(plugins) {
  restoreSessionIfNeeded();
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: !config.SESSION_ID // only relevant for local first-run without a saved session
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !config.SESSION_ID) {
      console.log('[auth] Scan this QR code with WhatsApp > Linked Devices:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      status = 'disconnected';
      const statusCode = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : undefined;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log(`[connection] closed (code ${statusCode}). ${loggedOut ? 'Logged out — run npm run pair again.' : 'Reconnecting...'}`);
      if (!loggedOut) {
        setTimeout(() => connectToWhatsApp(plugins), 3000);
      }
    } else if (connection === 'open') {
      status = 'connected';
      console.log(`[connection] Connected as ${sock.user?.id}`);
    }
  });

  sock.ev.on('group-participants.update', async (event) => {
    try {
      const groupMetadata = await sock.groupMetadata(event.id).catch(() => null);
      if (!groupMetadata) return;
      for (const plugin of plugins.pluginModules) {
        if (typeof plugin.onGroupParticipantsUpdate === 'function') {
          await plugin
            .onGroupParticipantsUpdate({ sock, event, groupMetadata, config })
            .catch((err) => console.error('[plugin] onGroupParticipantsUpdate error:', err));
        }
      }
    } catch (err) {
      console.error('[group-participants.update] error:', err);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      try {
        await handleMessage(sock, msg, plugins);
      } catch (err) {
        console.error('[handleMessage] error:', err);
      }
    }
  });

  return sock;
}

async function main() {
  const plugins = loadPlugins();
  startKeepAliveServer(() => status);
  await connectToWhatsApp(plugins);
}

main().catch((err) => {
  console.error('Fatal error on startup:', err);
  process.exit(1);
});
