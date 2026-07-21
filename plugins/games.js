// Per-chat game state. Fine for a single bot instance; resets on restart.
const pending = new Map(); // jid -> { type, ...gameData, expiresAt }
const tttGames = new Map(); // jid -> { board, players: [x, o], turn }

const JOKES = [
  "I told my computer I needed a break, and it said no problem — it froze immediately.",
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "I would tell you a UDP joke, but you might not get it.",
  "There are 10 types of people: those who understand binary, and those who don't.",
  "Why did the developer go broke? Because they used up all their cache.",
  "A SQL query walks into a bar, walks up to two tables and asks: 'Can I join you?'",
  "I changed my password to 'incorrect' so whenever I forget it, it tells me.",
  "Why do Java developers wear glasses? Because they don't C#.",
  "How many programmers does it take to change a light bulb? None — that's a hardware problem.",
  "My code doesn't work, I have no idea why. My code works, I have no idea why."
];

const QUOTES = [
  "The way to get started is to quit talking and begin doing. — Walt Disney",
  "Success is not final, failure is not fatal: it is the courage to continue that counts. — Winston Churchill",
  "Your time is limited, so don't waste it living someone else's life. — Steve Jobs",
  "The only way to do great work is to love what you do. — Steve Jobs",
  "It always seems impossible until it's done. — Nelson Mandela",
  "Do what you can, with what you have, where you are. — Theodore Roosevelt",
  "Believe you can and you're halfway there. — Theodore Roosevelt"
];

const EIGHTBALL = [
  "It is certain.", "Without a doubt.", "Yes, definitely.", "You may rely on it.",
  "As I see it, yes.", "Most likely.", "Ask again later.", "Cannot predict now.",
  "Don't count on it.", "My reply is no.", "Very doubtful."
];

const NUM_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

const TRIVIA = [
  { q: 'What planet is known as the Red Planet?', a: 'mars' },
  { q: 'What is the capital of Japan?', a: 'tokyo' },
  { q: 'How many continents are there on Earth?', a: '7' },
  { q: 'What is the largest ocean on Earth?', a: 'pacific' },
  { q: 'What gas do plants absorb from the atmosphere?', a: 'carbon dioxide' },
  { q: 'Who wrote "Romeo and Juliet"?', a: 'shakespeare' }
];

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function renderBoard(board) {
  const cell = (i) => (board[i] === null ? NUM_EMOJI[i] : board[i] === 'X' ? '❌' : '⭕');
  return [0, 3, 6].map((r) => [0, 1, 2].map((c) => cell(r + c)).join('')).join('\n');
}

function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every((c) => c !== null)) return 'draw';
  return null;
}

module.exports = {
  commands: [
    {
      name: 'math',
      description: 'Solve a random math problem for fun',
      category: 'games',
      execute: async (ctx) => {
        const a = rand(1, 50);
        const b = rand(1, 50);
        const op = pick(['+', '-', '*']);
        const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
        pending.set(ctx.jid, { type: 'math', answer, expiresAt: Date.now() + 30000 });
        await ctx.reply(`What's ${a} ${op} ${b}? (30s)`);
      }
    },
    {
      name: 'guess',
      description: 'Guess a number between 1 and 100',
      category: 'games',
      execute: async (ctx) => {
        pending.set(ctx.jid, { type: 'guess', secret: rand(1, 100), tries: 0, expiresAt: Date.now() + 60000 });
        await ctx.reply("I'm thinking of a number between 1 and 100. Guess away! (60s)");
      }
    },
    {
      name: 'trivia',
      description: 'Answer a random trivia question',
      category: 'games',
      execute: async (ctx) => {
        const t = pick(TRIVIA);
        pending.set(ctx.jid, { type: 'trivia', answer: t.a, expiresAt: Date.now() + 30000 });
        await ctx.reply(`Trivia: ${t.q} (30s)`);
      }
    },
    {
      name: 'ttt',
      aliases: ['tictactoe'],
      description: 'Play tic-tac-toe: .ttt @opponent to start, .play <1-9> to move',
      category: 'games',
      groupOnly: true,
      execute: async (ctx) => {
        if (ctx.args[0] === 'end') {
          tttGames.delete(ctx.jid);
          return ctx.reply('Game ended.');
        }
        const mentioned = ctx.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentioned) return ctx.reply('Usage: .ttt @opponent');
        if (tttGames.has(ctx.jid)) return ctx.reply('A game is already in progress here. .ttt end to cancel it.');

        tttGames.set(ctx.jid, {
          board: Array(9).fill(null),
          players: { X: ctx.sender, O: mentioned },
          turn: 'X'
        });
        await ctx.sock.sendMessage(ctx.jid, {
          text: `Tic-Tac-Toe started!\n❌ @${ctx.sender.split('@')[0]} vs ⭕ @${mentioned.split('@')[0]}\n\n${renderBoard(Array(9).fill(null))}\n\n@${ctx.sender.split('@')[0]}'s turn (❌). Use .play <1-9>`,
          mentions: [ctx.sender, mentioned]
        });
      }
    },
    {
      name: 'play',
      description: 'Make a tic-tac-toe move: .play <1-9>',
      category: 'games',
      groupOnly: true,
      execute: async (ctx) => {
        const game = tttGames.get(ctx.jid);
        if (!game) return ctx.reply('No game in progress. Start one with .ttt @opponent');
        const currentPlayerJid = game.players[game.turn];
        if (ctx.sender !== currentPlayerJid) return ctx.reply("It's not your turn.");

        const pos = parseInt(ctx.args[0], 10) - 1;
        if (isNaN(pos) || pos < 0 || pos > 8) return ctx.reply('Pick a cell 1-9.');
        if (game.board[pos] !== null) return ctx.reply('That cell is taken.');

        game.board[pos] = game.turn;
        const winner = checkWinner(game.board);

        if (winner) {
          tttGames.delete(ctx.jid);
          const resultText =
            winner === 'draw' ? "It's a draw!" : `@${game.players[winner].split('@')[0]} (${winner === 'X' ? '❌' : '⭕'}) wins!`;
          return ctx.sock.sendMessage(ctx.jid, {
            text: `${renderBoard(game.board)}\n\n${resultText}`,
            mentions: Object.values(game.players)
          });
        }

        game.turn = game.turn === 'X' ? 'O' : 'X';
        const nextJid = game.players[game.turn];
        await ctx.sock.sendMessage(ctx.jid, {
          text: `${renderBoard(game.board)}\n\n@${nextJid.split('@')[0]}'s turn (${game.turn === 'X' ? '❌' : '⭕'})`,
          mentions: [nextJid]
        });
      }
    },
    {
      name: '8ball',
      description: 'Ask the magic 8-ball a question',
      category: 'games',
      execute: async (ctx) => {
        if (!ctx.text) return ctx.reply('Usage: .8ball <question>');
        await ctx.reply(`🎱 ${pick(EIGHTBALL)}`);
      }
    },
    {
      name: 'dice',
      description: 'Roll a die',
      category: 'games',
      execute: async (ctx) => ctx.reply(`🎲 You rolled a ${rand(1, 6)}`)
    },
    {
      name: 'coinflip',
      aliases: ['flip'],
      description: 'Flip a coin',
      category: 'games',
      execute: async (ctx) => ctx.reply(`🪙 ${pick(['Heads', 'Tails'])}!`)
    },
    {
      name: 'joke',
      description: 'Get a random joke',
      category: 'games',
      execute: async (ctx) => ctx.reply(pick(JOKES))
    },
    {
      name: 'quote',
      description: 'Get a random inspirational quote',
      category: 'games',
      execute: async (ctx) => ctx.reply(pick(QUOTES))
    }
  ],

  // Handles answers to .math / .guess / .trivia
  onMessage: async (ctx) => {
    const game = pending.get(ctx.jid);
    if (!game || !ctx.text) return;
    if (Date.now() > game.expiresAt) {
      pending.delete(ctx.jid);
      return;
    }

    if (game.type === 'math' || game.type === 'trivia') {
      const correct = ctx.text.trim().toLowerCase() === String(game.answer).toLowerCase();
      if (correct) {
        pending.delete(ctx.jid);
        await ctx.reply('Correct! 🎉');
      }
      return;
    }

    if (game.type === 'guess') {
      const num = parseInt(ctx.text.trim(), 10);
      if (isNaN(num)) return;
      game.tries += 1;
      if (num === game.secret) {
        pending.delete(ctx.jid);
        await ctx.reply(`🎉 Correct! It was ${game.secret}. You got it in ${game.tries} tries.`);
      } else if (game.tries >= 10) {
        pending.delete(ctx.jid);
        await ctx.reply(`Out of tries! The number was ${game.secret}.`);
      } else {
        await ctx.reply(num < game.secret ? 'Higher!' : 'Lower!');
      }
    }
  }
};
