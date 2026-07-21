const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

function tmpFile(ext) {
  return path.join(os.tmpdir(), `${crypto.randomBytes(8).toString('hex')}.${ext}`);
}

/** Still image (jpeg/png/webp/...) buffer -> static WhatsApp sticker (webp) buffer. */
async function imageToSticker(buffer) {
  return sharp(buffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 80 })
    .toBuffer();
}

/** Video/gif buffer -> animated WhatsApp sticker (webp) buffer, via ffmpeg. Max ~6s. */
async function videoToSticker(buffer) {
  const inPath = tmpFile('mp4');
  const outPath = tmpFile('webp');
  fs.writeFileSync(inPath, buffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inPath)
        .duration(6)
        .outputOptions([
          '-vcodec', 'libwebp',
          '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,fps=12,pad=512:512:-1:-1:color=0x00000000",
          '-loop', '0',
          '-preset', 'default',
          '-an',
          '-vsync', '0',
          '-q:v', '50'
        ])
        .toFormat('webp')
        .on('end', resolve)
        .on('error', reject)
        .save(outPath);
    });
    return fs.readFileSync(outPath);
  } finally {
    fs.existsSync(inPath) && fs.unlinkSync(inPath);
    fs.existsSync(outPath) && fs.unlinkSync(outPath);
  }
}

/** WhatsApp sticker (webp) buffer -> plain png buffer, for the .toimg command. */
async function stickerToImage(buffer) {
  return sharp(buffer).png().toBuffer();
}

module.exports = { imageToSticker, videoToSticker, stickerToImage };
