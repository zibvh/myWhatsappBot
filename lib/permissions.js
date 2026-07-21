const config = require('../config');

/** Strips WhatsApp JID suffixes down to just the digits, for number comparisons. */
function jidToNumber(jid = '') {
  return jid.split('@')[0].split(':')[0].replace(/\D/g, '');
}

function isOwner(senderJid) {
  if (!config.OWNER_NUMBER) return false;
  return jidToNumber(senderJid) === config.OWNER_NUMBER;
}

/** Looks up whether `jid` is an admin/superadmin in the given group metadata. */
function isGroupAdmin(groupMetadata, jid) {
  const participant = groupMetadata?.participants?.find((p) => p.id === jid);
  return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}

function isBotGroupAdmin(groupMetadata, botJid) {
  return isGroupAdmin(groupMetadata, botJid);
}

module.exports = { jidToNumber, isOwner, isGroupAdmin, isBotGroupAdmin };
