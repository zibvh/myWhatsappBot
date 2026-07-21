const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ytdlp = require('yt-dlp-exec');
const ffmpegPath = require('ffmpeg-static');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { imageToSticker, videoToSticker, stickerToImage } = require('../lib/stickers');

const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_AUDIO_BYTES = 30 * 1024 * 1024; // 30MB

/** Downloads whichever media (direct or quoted) is attached to this message, as a Buffer. */
async function getAttachedMediaBuffer(ctx) {
  const { sock, msg, message, quoted } = ctx;

  if (quoted) {
    const fakeMsg = {
      key: { remoteJid: ctx.jid, id: quoted.stanzaId, participant: quoted.participant },
      message: quoted.message
    };
    return downloadMediaMessage(fakeMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
  }

  if (message.imageMessage || message.videoMessage || message.stickerMessage) {
    return downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
  }

  return null;
}

function getAttachedType(ctx) {
  const target = ctx.quoted?.message || ctx.message;
  if (target.imageMessage) return 'image';
  if (target.videoMessage) return 'video';
  if (target.stickerMessage) return 'sticker';
  return null;
}

function tmpPathWithPrefix(ext) {
  const prefix = crypto.randomBytes(8).toString('hex');
  return { prefix, full: path.join(os.tmpdir(), `${prefix}.${ext}`) };
}

/** Downloads a URL with yt-dlp and returns { buffer, ext }. Cleans up its temp file either way. */
async function downloadWithYtDlp(url, { audioOnly, maxBytes }) {
  const { prefix } = tmpPathWithPrefix('');
  const outputTemplate = path.join(os.tmpdir(), `${prefix}.%(ext)s`);

  const options = {
    output: outputTemplate,
    noPlaylist: true,
    ffmpegLocation: ffmpegPath,
    maxFilesize: `${Math.round(maxBytes / (1024 * 1024))}M`
  };
  if (audioOnly) {
    options.extractAudio = true;
    options.audioFormat = 'mp3';
  } else {
    options.format = 'mp4/best';
  }

  await ytdlp(url, options);

  const dir = os.tmpdir();
  const match = fs.readdirSync(dir).find((f) => f.startsWith(prefix));
  if (!match) throw new Error('Download produced no file (link may be private, geo-blocked, or unsupported).');

  const fullPath = path.join(dir, match);
  try {
    const buffer = fs.readFileSync(fullPath);
    const ext = match.split('.').pop();
    return { buffer, ext };
  } finally {
    fs.unlinkSync(fullPath);
  }
}

module.exports = {
  commands: [
    {
      name: 'sticker',
      aliases: ['s', 'stiker'],
      description: 'Reply to (or send with) an image/video/gif to make a sticker',
      category: 'media',
      execute: async (ctx) => {
        const type = getAttachedType(ctx);
        if (!type || type === 'sticker') {
          return ctx.reply('Send or reply to an image, video, or gif with .sticker');
        }
        const buffer = await getAttachedMediaBuffer(ctx);
        if (!buffer) return ctx.reply("Couldn't download that media, try again.");

        const webp = type === 'image' ? await imageToSticker(buffer) : await videoToSticker(buffer);
        await ctx.sock.sendMessage(ctx.jid, { sticker: webp }, { quoted: ctx.msg });
      }
    },
    {
      name: 'toimg',
      aliases: ['toimage'],
      description: 'Reply to a sticker to convert it back to an image',
      category: 'media',
      execute: async (ctx) => {
        const type = getAttachedType(ctx);
        if (type !== 'sticker') {
          return ctx.reply('Reply to a sticker with .toimg');
        }
        const buffer = await getAttachedMediaBuffer(ctx);
        if (!buffer) return ctx.reply("Couldn't download that sticker, try again.");

        const png = await stickerToImage(buffer);
        await ctx.sock.sendMessage(ctx.jid, { image: png }, { quoted: ctx.msg });
      }
    },
    {
      name: 'video',
      aliases: ['dl', 'download'],
      description: 'Download a video from a link (.video <url>)',
      category: 'media',
      execute: async (ctx) => {
        const url = ctx.args[0];
        if (!url) return ctx.reply('Usage: .video <link>');
        await ctx.reply('Downloading...');
        try {
          const { buffer } = await downloadWithYtDlp(url, { audioOnly: false, maxBytes: MAX_VIDEO_BYTES });
          if (buffer.length > MAX_VIDEO_BYTES) {
            return ctx.reply("That video is too large to send over WhatsApp (50MB limit).");
          }
          await ctx.sock.sendMessage(ctx.jid, { video: buffer, caption: url }, { quoted: ctx.msg });
        } catch (err) {
          await ctx.reply(`Download failed: ${err.message}`);
        }
      }
    },
    {
      name: 'audio',
      aliases: ['mp3'],
      description: 'Download audio from a link (.audio <url>)',
      category: 'media',
      execute: async (ctx) => {
        const url = ctx.args[0];
        if (!url) return ctx.reply('Usage: .audio <link>');
        await ctx.reply('Downloading...');
        try {
          const { buffer } = await downloadWithYtDlp(url, { audioOnly: true, maxBytes: MAX_AUDIO_BYTES });
          if (buffer.length > MAX_AUDIO_BYTES) {
            return ctx.reply("That audio is too large to send over WhatsApp (30MB limit).");
          }
          await ctx.sock.sendMessage(ctx.jid, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: ctx.msg });
        } catch (err) {
          await ctx.reply(`Download failed: ${err.message}`);
        }
      }
    }
  ]
};
