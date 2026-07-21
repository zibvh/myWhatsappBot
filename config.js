require('dotenv').config();

module.exports = {
  // Command prefix, e.g. "." means commands look like ".sticker"
  PREFIX: process.env.PREFIX || '.',

  // Your own WhatsApp number (digits only, with country code, no + or spaces)
  // e.g. 15551234567 — used for owner-only commands.
  OWNER_NUMBER: (process.env.OWNER_NUMBER || '').replace(/\D/g, ''),

  // Number the bot itself will log in as when pairing (digits only, country code, no +).
  // Only needed the first time you run generate-session.js.
  BOT_NUMBER: (process.env.BOT_NUMBER || '').replace(/\D/g, ''),

  // Base64 string produced by `npm run pair`. When set, the bot restores its
  // login from this instead of needing a fresh QR/pairing code every boot.
  SESSION_ID: process.env.SESSION_ID || '',

  // 'public'  = anyone can use the bot
  // 'private' = only the owner can use the bot
  MODE: process.env.MODE === 'private' ? 'private' : 'public',

  // Port for the tiny HTTP server Render (or any host) uses for health checks.
  PORT: parseInt(process.env.PORT || '3000', 10),

  // How many warnings before .warn auto-kicks someone from a group.
  MAX_WARNINGS: parseInt(process.env.MAX_WARNINGS || '3', 10),

  BOT_NAME: process.env.BOT_NAME || 'MyBot'
};
