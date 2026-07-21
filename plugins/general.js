const config = require('../config');

module.exports = {
  commands: [
    {
      name: 'menu',
      aliases: ['help', 'commands'],
      description: 'Show all available commands',
      category: 'general',
      execute: async (ctx) => {
        const byCategory = {};
        for (const cmd of ctx.allCommands) {
          const cat = cmd.category || 'general';
          byCategory[cat] = byCategory[cat] || [];
          byCategory[cat].push(cmd.name);
        }

        let text = `*${config.BOT_NAME}*\nPrefix: ${config.PREFIX}\n`;
        for (const [category, names] of Object.entries(byCategory)) {
          text += `\n*${category.toUpperCase()}*\n`;
          text += names.map((n) => `• ${config.PREFIX}${n}`).join('\n') + '\n';
        }
        await ctx.reply(text);
      }
    },
    {
      name: 'ping',
      description: 'Check if the bot is alive and see response time',
      category: 'general',
      execute: async (ctx) => {
        const start = Date.now();
        await ctx.reply('Pinging...');
        const ms = Date.now() - start;
        await ctx.reply(`Pong! ${ms}ms`);
      }
    },
    {
      name: 'owner',
      description: 'Get the bot owner contact',
      category: 'general',
      execute: async (ctx) => {
        if (!config.OWNER_NUMBER) {
          return ctx.reply('No owner number configured.');
        }
        await ctx.sock.sendMessage(ctx.jid, {
          contacts: {
            displayName: 'Owner',
            contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Owner\nTEL;type=CELL;waid=${config.OWNER_NUMBER}:+${config.OWNER_NUMBER}\nEND:VCARD` }]
          }
        });
      }
    }
  ]
};
