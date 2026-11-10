/**
 * The board's pictures, one owner-only folder `<data>/pictures/` of files named `<sha256>.<extension>`: a picture is known by the hash of its
 * bytes and its type by its first bytes, never by a name or a header. A picture no log record or live job names is swept at the Overseer's
 * start, a set difference that reads no clock.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { join } from 'node:path';

import type { AgentPicture }                                      from '../../lib/agent-launch/AgentAdapter.ts';
import { removeHeldFile, writeOwnerOnlyFileAtomically }           from '../../lib/atomic-file/AtomicFile.ts';
import type { OwnerOnlyFiles }                                    from '../../lib/owner-only-files/OwnerOnlyFiles.ts';
import type { Job, PictureReference }                             from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                                         from '../../lib/tracker-model/@types/LogRecord.ts';
import { PICTURE_ID_PATTERN }                                     from '../../lib/tracker-model/constants/PictureIdPattern.ts';
import { ACCEPTED_PICTURE_MEDIA_TYPES, PICTURE_SIZE_LIMIT_BYTES } from '../../shared/constants/OverseerLimits.ts';
import { PICTURE_SIGNATURES }                                     from './constants/PictureSignatures.ts';

export type PictureStoring =
  | { verdict: 'stored'; pictureId: string; bytes: number; mediaType: string }
  | { verdict: 'too-large'; bytes: number }
  | { verdict: 'type-unsupported' };

export interface StoredPicture {
  mediaType: string;
  bytes:     Uint8Array;
}

const PICTURES_FOLDER_NAME = 'pictures';

const SIGNATURES = PICTURE_SIGNATURES.filter((signature) => ACCEPTED_PICTURE_MEDIA_TYPES.includes(signature.mediaType));

function picturesFolderOf(trackerDirectory: string): string {
  return join(trackerDirectory, PICTURES_FOLDER_NAME);
}

function signatureOf(bytes: Uint8Array): (typeof SIGNATURES)[number] | null {
  return SIGNATURES.find((signature) => bytes.length >= signature.firstBytes.length
    && signature.firstBytes.every((expected, index) => expected === null || bytes[index] === expected)) ?? null;
}

function pictureIdOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The same bytes twice are one file: a picture already stored is not written again. */
function storePicture(ownerOnlyFiles: OwnerOnlyFiles, trackerDirectory: string, bytes: Uint8Array): PictureStoring {
  if (bytes.length > PICTURE_SIZE_LIMIT_BYTES) return { verdict: 'too-large', bytes: bytes.length };
  const signature = signatureOf(bytes);
  if (signature === null) return { verdict: 'type-unsupported' };
  const pictureId = pictureIdOf(bytes);
  const folder = picturesFolderOf(trackerDirectory);
  const filePath = join(folder, `${pictureId}.${signature.extension}`);
  if (!existsSync(filePath)) {
    ownerOnlyFiles.restrictFolder(folder);
    writeOwnerOnlyFileAtomically(filePath, bytes);
    ownerOnlyFiles.restrictFile(filePath);
  }
  return {
    verdict: 'stored', pictureId, bytes: bytes.length, mediaType: signature.mediaType
  };
}

/** `null` for an id that is no sha256 or names no stored picture. */
function storedPictureOf(trackerDirectory: string, pictureId: string): StoredPicture | null {
  if (!PICTURE_ID_PATTERN.test(pictureId)) return null;
  for (const signature of SIGNATURES) {
    try {
      return { mediaType: signature.mediaType, bytes: readFileSync(join(picturesFolderOf(trackerDirectory), `${pictureId}.${signature.extension}`)) };
    } catch {
      // Not stored with this type's extension.
    }
  }
  return null;
}

function pictureIsStored(trackerDirectory: string, pictureId: string): boolean {
  return PICTURE_ID_PATTERN.test(pictureId)
    && SIGNATURES.some((signature) => existsSync(join(picturesFolderOf(trackerDirectory), `${pictureId}.${signature.extension}`)));
}

/** What a session is sent for the pictures: a picture no longer stored is left out, so the text still reaches the session. */
function attachmentsOf(trackerDirectory: string, pictures: readonly PictureReference[]): AgentPicture[] {
  return pictures.flatMap(({ pictureId }) => {
    const stored = storedPictureOf(trackerDirectory, pictureId);
    return stored === null ? [] : [{ mediaType: stored.mediaType, base64Data: Buffer.from(stored.bytes).toString('base64') }];
  });
}

/** Every picture a log record or a live job's intake names. */
function referencedPictureIdsOf(logRecords: readonly LogRecord[], jobs: readonly Readonly<Job>[]): Set<string> {
  const pictureLists = logRecords.flatMap((record) => {
    if (record.kind === 'job-launched') return [record.fields.intakePictures ?? []];
    if (record.kind === 'job-messaged' || record.kind === 'job-reopened') return [record.fields.pictures ?? []];
    return [];
  });
  pictureLists.push(...jobs.map((job) => job.intake?.pictures ?? []));
  return new Set(pictureLists.flat().map((picture) => picture.pictureId));
}

/** Removes every stored picture whose id is not referenced, and answers the removed ids. */
function sweepUnreferenced(trackerDirectory: string, referencedPictureIds: ReadonlySet<string>): string[] {
  const folder = picturesFolderOf(trackerDirectory);
  if (!existsSync(folder)) return [];
  const removed: string[] = [];
  for (const fileName of readdirSync(folder)) {
    const pictureId = fileName.split('.')[0] ?? '';
    if (referencedPictureIds.has(pictureId)) continue;
    removeHeldFile(join(folder, fileName));
    removed.push(pictureId);
  }
  return removed;
}

/** `clear --all`: the whole folder goes with the tickets. */
function removeAllPictures(trackerDirectory: string): void {
  rmSync(picturesFolderOf(trackerDirectory), { recursive: true, force: true });
}

export const PictureStore = Object.freeze({
  picturesFolderOf,
  storePicture,
  storedPictureOf,
  pictureIsStored,
  attachmentsOf,
  referencedPictureIdsOf,
  sweepUnreferenced,
  removeAllPictures,
});
