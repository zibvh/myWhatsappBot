const store = require('../lib/store');
const config = require('../config');

const LINK_REGEX = /(https?:\/\/|www\.|chat\.whatsapp\.com\/)\S+/i;

function getTargetJid(ctx) {
  if (ctx.quoted?.participant) return ctx.quoted.participant;
  const mentioned = ctx.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (mentioned?.length) return mentioned[0];
  return null;
}

function numberFromJid(jid = '') {
  return jid.split('@')[0].split(':')[0];
}

async function requireBotAdmin(ctx) {
  if (!ctx.isBotAdmin) {
    await ctx.reply('I need to be a group admin to do that.');
    return false;
  }
  return true;
}

module.exports = {
  commands: [
    {
      name: 'kick',
      description: 'Remove a member (reply to their message, or @mention them)',
      category: 'admin',
      groupOnly: true,
      adminOnly: true,
      execute: async (ctx) => {
        const target = getTargetJid(ctx);
        if (!target) return ctx.reply('Reply to the person\'s message, or @mention them, with .kick');
        if (!(await requireBotAdmin(ctx))) return;
        await ctx.sock.groupParticipantsUpdate(ctx.jid, [target], 'remove');
        await ctx.reply(`Removed @${numberFromJid(target)}`);
      }
    },
    {
      name: 'promote',
      description: 'Make a member a group admin',
      category: 'admin',
      groupOnly: true,
      adminOnly: true,
      execute: async (ctx) => {
        const target = getTargetJid(ctx);
        if (!target) return ctx.reply('Reply to the person\'s message, or @mention them, with .promote');
        if (!(await requireBotAdmin(ctx))) return;
        await ctx.sock.groupParticipantsUpdate(ctx.jid, [target], 'promote');
        await ctx.reply(`Promoted @${numberFromJid(target)}`);
      }
    },
    {
      name: 'demote',
      description: 'Remove a member\'s admin status',
      category: 'admin',
      groupOnly: true,
      adminOnly: true,
      execute: async (ctx) => {
        const target = getTargetJid(ctx);
        if (!target) return ctx.reply('Reply to the person\'s message, or @mention them, with .demote');
        if (!(await requireBotAdmin(ctx))) return;
        await ctx.sock.groupParticipantsUpdate(ctx.jid, [target], 'demote');
        await ctx.reply(`Demoted @${numberFromJid(target)}`);
      }
    },
    {
      name: 'tagall',
      description: 'Mention every member of the group',
      category: 'admin',
      groupOnly: true,
      adminOnly: true,
      execute: async (ctx) => {
        const participants = ctx.groupMetadata?.participants || [];
        const mentions = participants.map((p) => p.id);
        const list = participants.map((p) => `@${numberFromJid(p.id)}`).join(' ');
        const text = ctx.text ? `${ctx.text}\n\n${list}` : list;
        await ctx.sock.sendMessage(ctx.jid, { text, mentions });
      }
    },
    {
      name: 'hidetag',
      description: 'Send a message that pings everyone without listing @mentions',
      category: 'admin',
      groupOnly: true,
      adminOnly: true,
      execute: async (ctx) => {
        const participants = ctx.groupMetadata?.participants || [];
        const mentions = participants.map((p) => p.id);
        await ctx.sock.sendMessage(ctx.jid, { text: ctx.text || '\u200b', mentions });
      }
    },
    {
      name: 'groupinfo',
      description: 'Show info about this group',
      category: 'admin',
      groupOnly: true,
      execute: async (ctx) => {
        const g = ctx.groupMetadata;
        const admins = g.participants.filter((p) => p.admin).length;
        await ctx.reply(
          `*${g.subject}*\n${g.desc ? g.desc + '\n' : ''}\nMembers: ${g.participants.length}\nAdmins: ${admins}\nID: ${g.id}`
        );
      }
    },
    {
      name: 'mute',
      description: 'Only admins can send messages',
      category: 'admin',
      groupOnly: true,
      adminOnly: true,
      execute: async (ctx) => {
        if (!(await requireBotAdmin(ctx))) return;
        await ctx.sock.groupSettingUpdate(ctx.jid, 'announcement');
        await ctx.reply('Group muted — only admins can send messages.');
      }
    },
    {
      name: 'unmute',
      description: 'Everyone can send messages again',
      category: 'admin',
      groupOnly: true,
      adminOnly: true,
      execute: async (ctx) => {
        if (!(await requireBotAdmin(ctx))) return;
        await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement');
        await ctx.reply('Group unmuted — everyone can send messages.');
      }
    },
    {
      name: 'warn',
      description: 'Warn a member (auto-kicks after the warning limit)',
      category: 'admin',
      groupOnly: true,
      adminOnly: true,
      execute: async (ctx) => {
        const target = getTargetJid(ctx);
        if (!target) return ctx.reply('Reply to the person\'s message, or @mention them, with .warn [reason]');

        const key = `warnings:${ctx.jid}:${target}`;
        const count = store.get(key, 0) + 1;
        store.set(key, count);

        if (count >= config.MAX_WARNINGS) {
          if (ctx.isBotAdmin) {
            await ctx.sock.groupParticipantsUpdate(ctx.jid, [target], 'remove');
            store.set(key, 0);
            return ctx.reply(`@${numberFromJid(target)} reached ${config.MAX_WARNINGS} warnings and was removed.`);
          }
          return ctx.reply(`@${numberFromJid(target)} reached ${config.MAX_WARNINGS} warnings, but I'm not an admin so I can't remove them.`);
        }
        await ctx.sock.sendMessage(ctx.jid, {
          text: `@${numberFromJid(target)} warned (${count}/${config.MAX_WARNINGS})${ctx.text ? `: ${ctx.text}` : ''}`,
          mentions: [target]
        });
      }
    },
    {
      name: 'warnings',
      description: 'Check a member\'s warning count',
      category: 'admin',
      groupOnly: true,
      execute: async (ctx) => {
        const target = getTargetJid(ctx) || ctx.sender;
        const count = store.get(`warnings:${ctx.jid}:${target}`, 0);
        await ctx.reply(`@${numberFromJid(target)} has ${count}/${config.MAX_WARNINGS} warnings.`);
      }
    },
    {
      name: 'resetwarn',
      description: 'Reset a member\'s warnings to zero',
      category: 'admin',
      groupOnly: true,
      adminOnly: true,
      execute: async (ctx) => {
        const target = getTargetJid(ctx);
        if (!target) return ctx.reply('Reply to the person\'s message, or @mention them, with .resetwarn');
        store.set(`warnings:${ctx.jid}:${target}`, 0);
        await ctx.reply(`Reset warnings for @${numberFromJid(target)}`);
      }
    },
    {
      name: 'antilink',
      description: 'Delete messages containing links (.antilink on/off)',
      category: 'admin',
      groupOnly: true,
      adminOnly: true,
      execute: async (ctx) => {
        const arg = (ctx.args[0] || '').toLowerCase();
        if (!['on', 'off'].includes(arg)) return ctx.reply('Usage: .antilink on | .antilink off');
        store.set(`antilink:${ctx.jid}`, arg === 'on');
        await ctx.reply(`Antilink turned ${arg}.`);
      }
    },
    {
      name: 'welcome',
      description: 'Toggle welcome/goodbye messages (.welcome on/off)',
      category: 'admin',
      groupOnly: true,
      adminOnly: true,
      execute: async (ctx) => {
        const arg = (ctx.args[0] || '').toLowerCase();
        if (!['on', 'off'].includes(arg)) return ctx.reply('Usage: .welcome on | .welcome off');
        store.set(`welcome:${ctx.jid}`, arg === 'on');
        await ctx.reply(`Welcome/goodbye messages turned ${arg}.`);
      }
    }
  ],

  // Runs on every group message — enforces antilink when enabled.
  onMessage: async (ctx) => {
    if (!ctx.isGroup) return;
    if (!store.get(`antilink:${ctx.jid}`, false)) return;
    if (ctx.isSenderAdmin || ctx.isOwner) return;
    if (!LINK_REGEX.test(ctx.text)) return;
    if (!ctx.isBotAdmin) return;

    await ctx.sock.sendMessage(ctx.jid, { delete: ctx.msg.key });
    await ctx.sock.sendMessage(ctx.jid, {
      text: `@${numberFromJid(ctx.sender)} links aren't allowed here.`,
      mentions: [ctx.sender]
    });
  },

  // Runs when someone joins/leaves — sends welcome/goodbye if enabled for that group.
  onGroupParticipantsUpdate: async ({ sock, event, groupMetadata }) => {
    if (!store.get(`welcome:${event.id}`, false)) return;
    const names = event.participants.map((jid) => `@${numberFromJid(jid)}`).join(', ');
    const text =
      event.action === 'add'
        ? `Welcome ${names} to ${groupMetadata.subject}!`
        : event.action === 'remove'
        ? `Goodbye ${names}.`
        : null;
    if (!text) return;
    await sock.sendMessage(event.id, { text, mentions: event.participants });
  }
};
