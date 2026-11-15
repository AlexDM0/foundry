// P21: a stream-json user line whose content holds a base64 PNG block before a text block: whether the session takes
// it, and what the model answers about the picture's colour.
import { deflateSync } from 'node:zlib';

import { resultCountOf, startSession, summaryOf } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { scratchFolder } from './support/scratch.js';

const PICTURE_SIDE_PIXELS = 64;
const PICTURE_COLOUR = { name: 'green', red: 0, green: 200, blue: 0 };
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RGB_COLOUR_TYPE = 2;
const BIT_DEPTH = 8;

function pngChunkOf(chunkType, data) {
  const typeAndData = Buffer.concat([Buffer.from(chunkType, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(Bun.hash.crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}

function solidPngOf({ red, green, blue }, side) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header.set([BIT_DEPTH, RGB_COLOUR_TYPE, 0, 0, 0], 8);
  const row = [0, ...Array.from({ length: side }, () => [red, green, blue]).flat()];
  const pixels = Buffer.from(Array.from({ length: side }, () => row).flat());
  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE),
    pngChunkOf('IHDR', header),
    pngChunkOf('IDAT', deflateSync(pixels)),
    pngChunkOf('IEND', Buffer.alloc(0)),
  ]);
}

await probe({
  unknown: 'claude-p21-stream-json-image-input',
  needsClaudeProgram: true,
  observe: async () => {
    const picture = solidPngOf(PICTURE_COLOUR, PICTURE_SIDE_PIXELS);
    const session = startSession({ cwd: scratchFolder(), extraArguments: ['--permission-mode', 'auto'] });
    session.writeLine(JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: picture.toString('base64') } },
          { type: 'text', text: 'What colour is this image? Reply with one lower-case colour word only. If you see no image, reply NO-IMAGE.' },
        ],
      },
    }));
    await session.waitUntil((lines) => resultCountOf(lines) > 0);
    session.closeInput();
    const ending = await session.finish();
    return { pictureColourSent: PICTURE_COLOUR.name, pictureBytes: picture.length, ...ending, ...summaryOf(session.lines) };
  },
});
