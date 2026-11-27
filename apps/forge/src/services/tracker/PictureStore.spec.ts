/**
 * The board's picture store: the first bytes decide a picture's type, never its name; a picture over the size limit (bounding the base64 a session
 * is sent, as the vendor measures that) is refused before any write; the same bytes are one owner-only file named by their sha256; and the sweep, in
 * Hephaestus's start hold, removes every picture no log record or live job names, leaving one it cannot remove for the next sweep.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join }                               from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { FileReplace }                                           from '../../lib/atomic-file/FileReplace.ts';
import type { OwnerOnlyFiles }                                        from '../../lib/owner-only-files/OwnerOnlyFiles.ts';
import type { Job }                                                   from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                                             from '../../lib/tracker-model/@types/LogRecord.ts';
import { PICTURE_ENCODED_SIZE_LIMIT_BYTES, PICTURE_SIZE_LIMIT_BYTES } from '../../shared/constants/HephaestusLimits.ts';
import { createScratchDirectory, removeScratchDirectory }             from '../../testing/ScratchWorkspace.ts';
import { PictureStore }                                               from './PictureStore.ts';

const PNG_BYTES  = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF_BYTES  = new TextEncoder().encode('GIF89a-example');
const WEBP_BYTES = Uint8Array.from([...new TextEncoder().encode('RIFF'), 0x24, 0x00, 0x00, 0x00, ...new TextEncoder().encode('WEBPVP8 ')]);
const EXAMPLE_STAMP = '2026-11-10T09:30:00+01:00';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function scratchTrackerDirectory(): string {
  const directory = createScratchDirectory('picture-store');
  scratchDirectories.push(directory);
  return directory;
}

function recordingOwnerOnlyFiles(): OwnerOnlyFiles & { restricted: string[] } {
  const restricted: string[] = [];
  return {
    restricted,
    restrictFolder: (folder) => restricted.push(`folder ${folder}`),
    restrictFile:   (path) => restricted.push(`file ${path}`),
    isOwnerOnly:    () => true,
  };
}

function storedIdOf(trackerDirectory: string, bytes: Uint8Array): string {
  const storing = PictureStore.storePicture(recordingOwnerOnlyFiles(), trackerDirectory, bytes);
  if (storing.verdict !== 'stored') throw new Error(`not stored: ${storing.verdict}`);
  return storing.pictureId;
}

describe('storing a picture', () => {
  test('the first bytes decide the type of each accepted picture, with the extension of that type', () => {
    const trackerDirectory = scratchTrackerDirectory();
    const mediaTypes = [PNG_BYTES, JPEG_BYTES, GIF_BYTES, WEBP_BYTES].map((bytes) => PictureStore.storePicture(recordingOwnerOnlyFiles(), trackerDirectory, bytes));
    expect(mediaTypes.map((storing) => (storing.verdict === 'stored' ? storing.mediaType : storing.verdict))).toEqual(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
    expect(readdirSync(PictureStore.picturesFolderOf(trackerDirectory)).map((fileName) => fileName.split('.')[1]).sort()).toEqual(['gif', 'jpg', 'png', 'webp']);
  });

  test('is known by the sha256 of its bytes, which a PNG keeps whatever it was named', () => {
    const trackerDirectory = scratchTrackerDirectory();
    const storing = PictureStore.storePicture(recordingOwnerOnlyFiles(), trackerDirectory, PNG_BYTES);
    expect(storing).toEqual({
      verdict: 'stored', pictureId: new Bun.CryptoHasher('sha256').update(PNG_BYTES).digest('hex'), bytes: PNG_BYTES.length, mediaType: 'image/png'
    });
  });

  test('refuses bytes of no accepted type, and writes nothing', () => {
    const trackerDirectory = scratchTrackerDirectory();
    expect(PictureStore.storePicture(recordingOwnerOnlyFiles(), trackerDirectory, new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')))
      .toEqual({ verdict: 'type-unsupported' });
    expect(existsSync(PictureStore.picturesFolderOf(trackerDirectory))).toBe(false);
  });

  test('refuses a picture over the size limit before it reads its type, and writes nothing', () => {
    const trackerDirectory = scratchTrackerDirectory();
    const tooLarge = new Uint8Array(PICTURE_SIZE_LIMIT_BYTES + 1);
    tooLarge.set(PNG_BYTES);
    expect(PictureStore.storePicture(recordingOwnerOnlyFiles(), trackerDirectory, tooLarge)).toEqual({ verdict: 'too-large', bytes: PICTURE_SIZE_LIMIT_BYTES + 1 });
    expect(existsSync(PictureStore.picturesFolderOf(trackerDirectory))).toBe(false);
  });

  test('bounds the base64 data a session is sent, not the bytes: a picture under the vendor limit whose base64 is over it is refused', () => {
    const trackerDirectory = scratchTrackerDirectory();
    const underTheLimitAsBytes = new Uint8Array(4_000_000);
    underTheLimitAsBytes.set(PNG_BYTES);
    expect(PictureStore.storePicture(recordingOwnerOnlyFiles(), trackerDirectory, underTheLimitAsBytes)).toEqual({ verdict: 'too-large', bytes: 4_000_000 });
    const largestStored = new Uint8Array(PICTURE_SIZE_LIMIT_BYTES);
    largestStored.set(PNG_BYTES);
    const storing = PictureStore.storePicture(recordingOwnerOnlyFiles(), trackerDirectory, largestStored);
    if (storing.verdict !== 'stored') throw new Error(`expected the largest picture stored, got ${storing.verdict}`);
    const [attachment] = PictureStore.attachmentsOf(trackerDirectory, [{ pictureId: storing.pictureId, name: 'largest.png' }]);
    expect(attachment?.base64Data.length).toBe(PICTURE_ENCODED_SIZE_LIMIT_BYTES);
  });

  test('stores the same bytes twice as one file, making the folder and the file owner-only once', () => {
    const trackerDirectory = scratchTrackerDirectory();
    const ownerOnlyFiles = recordingOwnerOnlyFiles();
    PictureStore.storePicture(ownerOnlyFiles, trackerDirectory, PNG_BYTES);
    PictureStore.storePicture(ownerOnlyFiles, trackerDirectory, PNG_BYTES);
    const folder = PictureStore.picturesFolderOf(trackerDirectory);
    const fileNames = readdirSync(folder);
    expect(fileNames).toHaveLength(1);
    expect(ownerOnlyFiles.restricted).toEqual([`folder ${folder}`, `file ${join(folder, fileNames[0] ?? '')}`]);
  });
});

describe('reading a stored picture', () => {
  test('answers its bytes and type, and its attachment for a session in base64', () => {
    const trackerDirectory = scratchTrackerDirectory();
    const pictureId = storedIdOf(trackerDirectory, JPEG_BYTES);
    expect(PictureStore.storedPictureOf(trackerDirectory, pictureId)).toEqual({ mediaType: 'image/jpeg', bytes: Buffer.from(JPEG_BYTES) });
    expect(PictureStore.pictureIsStored(trackerDirectory, pictureId)).toBe(true);
    expect(PictureStore.attachmentsOf(trackerDirectory, [{ pictureId, name: 'mockup.jpg' }]))
      .toEqual([{ mediaType: 'image/jpeg', base64Data: Buffer.from(JPEG_BYTES).toString('base64') }]);
  });

  test('answers null for an id no picture has and for text that is no sha256, and leaves such a picture out of the attachments', () => {
    const trackerDirectory = scratchTrackerDirectory();
    storedIdOf(trackerDirectory, PNG_BYTES);
    for (const pictureId of ['b'.repeat(64), '../progress.json', 'A'.repeat(64)]) {
      expect(PictureStore.storedPictureOf(trackerDirectory, pictureId)).toBeNull();
      expect(PictureStore.pictureIsStored(trackerDirectory, pictureId)).toBe(false);
    }
    expect(PictureStore.attachmentsOf(trackerDirectory, [{ pictureId: 'b'.repeat(64), name: 'gone.png' }])).toEqual([]);
  });
});

describe('the sweep', () => {
  test('keeps every picture a launch, a message, a reopening or a live job\'s intake names, and removes the rest', () => {
    const trackerDirectory = scratchTrackerDirectory();
    const pictures = [PNG_BYTES, JPEG_BYTES, GIF_BYTES, WEBP_BYTES, Uint8Array.from([...PNG_BYTES, 0x01])];
    const [launchedId = '', messagedId = '', reopenedId = '', liveId = '', unreferencedId = ''] = pictures.map((bytes) => storedIdOf(trackerDirectory, bytes));
    const pictureOf = (pictureId: string) => [{ pictureId, name: 'example.png' }];
    const records: LogRecord[] = [
      {
        at:     EXAMPLE_STAMP,
        kind:   'job-launched',
        jobId:  'J1',
        fields: {
          kind: 'product-owner', role: 'product-owner', ticketIds: [], attempt: 1, target: null, parentJobId: null, intakeText: '', intakePictures: pictureOf(launchedId)
        },
      },
      {
        at: EXAMPLE_STAMP, kind: 'job-messaged', jobId: 'J1', fields: { text: 'More.', pictures: pictureOf(messagedId) }
      },
      {
        at:     EXAMPLE_STAMP,
        kind:   'job-reopened',
        jobId:  'J1',
        fields: {
          childInstance: 2, text: 'Again.', offeredTicketIds: [], pictures: pictureOf(reopenedId)
        }
      },
    ];
    const liveJob = { id: 'J2', intake: { text: '', pictures: pictureOf(liveId) } } as unknown as Job;
    const referenced = PictureStore.referencedPictureIdsOf(records, [liveJob]);
    expect(PictureStore.sweepUnreferenced(trackerDirectory, referenced)).toEqual([unreferencedId]);
    expect([launchedId, messagedId, reopenedId, liveId, unreferencedId].map((pictureId) => PictureStore.pictureIsStored(trackerDirectory, pictureId)))
      .toEqual([true, true, true, true, false]);
  });

  test('leaves a folder in the pictures folder in place, and still removes the unreferenced pictures', () => {
    const trackerDirectory = scratchTrackerDirectory();
    const unreferencedId   = storedIdOf(trackerDirectory, PNG_BYTES);
    const folderPath       = join(PictureStore.picturesFolderOf(trackerDirectory), 'example-folder');
    mkdirSync(folderPath);

    expect(PictureStore.sweepUnreferenced(trackerDirectory, new Set())).toEqual([unreferencedId]);
    expect(existsSync(folderPath)).toBe(true);
  });

  test('leaves a picture whose removal fails for the next sweep, and removes the others', () => {
    const trackerDirectory = scratchTrackerDirectory();
    const [heldId = '', freeId = ''] = [PNG_BYTES, JPEG_BYTES].map((bytes) => storedIdOf(trackerDirectory, bytes));
    const holdingFileReplace = {
      removeHeldFile: (path: string) => (path.includes(heldId)
        ? { verdict: 'held', failure: Object.assign(new Error('held'), { code: 'EBUSY' }) }
        : { verdict: 'moved' }),
    } as unknown as FileReplace;

    expect(PictureStore.sweepUnreferenced(trackerDirectory, new Set(), holdingFileReplace)).toEqual([freeId]);
  });

  test('of a board that never stored a picture removes nothing, and clear --all removes the whole folder', () => {
    const trackerDirectory = scratchTrackerDirectory();
    expect(PictureStore.sweepUnreferenced(trackerDirectory, new Set())).toEqual([]);
    storedIdOf(trackerDirectory, PNG_BYTES);
    PictureStore.removeAllPictures(trackerDirectory);
    expect(existsSync(PictureStore.picturesFolderOf(trackerDirectory))).toBe(false);
  });
});
