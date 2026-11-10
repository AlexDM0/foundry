/**
 * The pictures a message is about to carry, as data: which files the served limits admit before any upload, how each upload stands, and
 * the words the composer shows for them. The limits are the Overseer's facts; a refusal the Overseer gives an upload is shown verbatim.
 */
import type { PictureLimitsDocument } from '../../@types/ConversationDocuments.ts';

/** `uploading` until the Overseer stored it; a refusal before upload or from the Overseer keeps the picture out of the message. */
export type PictureUploadState =
  | 'uploading'
  | { readonly pictureId: string }
  | { readonly refusal: string };

export interface PendingPicture {
  readonly key:              string;
  readonly name:             string;
  readonly bytes:            number;
  readonly mediaType:        string;
  /** `null` while the file is read; a `data:` address, since the page allows no `blob:` picture. */
  readonly thumbnailDataUrl: string | null;
  readonly upload:           PictureUploadState;
}

/** A file as the limits read it. */
export interface PictureFileFacts {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

export type AdmissionVerdict = { readonly admitted: true } | { readonly admitted: false; readonly refusal: string };

/** What a picture sent with a message names: its stored id and the file's name. */
export interface SentPictureReference {
  readonly pictureId: string;
  readonly name:      string;
}

const BYTES_PER_KILOBYTE = 1024;

const BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE;

const MEGABYTE_FRACTION_DIGITS = 1;

/** How much of a picture's id is shown where no record names the picture. */
const UNNAMED_PICTURE_ID_LENGTH = 12;

/** Where the Overseer serves a stored picture. */
const PICTURES_ROUTE = '/api/pictures';

/** The name a media type goes by where it is not its subtype in capitals. */
const MEDIA_TYPE_NAMES: Readonly<Record<string, string>> = {
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
};

function mediaTypeNameOf(mediaType: string): string {
  if (Object.hasOwn(MEDIA_TYPE_NAMES, mediaType)) return MEDIA_TYPE_NAMES[mediaType] ?? mediaType;
  return (mediaType.split('/')[1] ?? mediaType).toUpperCase();
}

/** "PNG, JPEG, WebP or GIF". */
function acceptWordingOf(limits: PictureLimitsDocument): string {
  const names = limits.mediaTypes.map(mediaTypeNameOf);
  const last = names.at(-1);
  if (last === undefined) return '';
  return names.length === 1 ? last : `${names.slice(0, -1).join(', ')} or ${last}`;
}

/** "812 bytes", "412 KB", "4.8 MB". */
function sizeWordingOf(bytes: number): string {
  if (bytes < BYTES_PER_KILOBYTE) return `${bytes} bytes`;
  if (bytes < BYTES_PER_MEGABYTE) return `${Math.round(bytes / BYTES_PER_KILOBYTE)} KB`;
  return `${(bytes / BYTES_PER_MEGABYTE).toFixed(MEGABYTE_FRACTION_DIGITS)} MB`;
}

function isRefused(picture: PendingPicture): boolean {
  return typeof picture.upload === 'object' && 'refusal' in picture.upload;
}

/** The pictures the message carries: every one not refused, uploaded or still uploading. */
function carriedOf(pending: readonly PendingPicture[]): PendingPicture[] {
  return pending.filter((picture) => !isRefused(picture));
}

/**
 * Each file's verdict against the limits, in order: a type the Overseer does not take, a file over the size bound, and a file past the
 * per-message bound, counting the pictures the message already carries and the files admitted before it.
 */
function admissionsOf(files: readonly PictureFileFacts[], pending: readonly PendingPicture[], limits: PictureLimitsDocument): AdmissionVerdict[] {
  let carriedCount = carriedOf(pending).length;
  return files.map((file): AdmissionVerdict => {
    if (!limits.mediaTypes.includes(file.type)) return { admitted: false, refusal: `${file.name} is no ${acceptWordingOf(limits)} picture.` };
    if (file.size > limits.sizeLimitBytes) {
      return { admitted: false, refusal: `${file.name} is ${sizeWordingOf(file.size)}, and a picture is at most ${sizeWordingOf(limits.sizeLimitBytes)}.` };
    }
    if (carriedCount >= limits.perMessage) return { admitted: false, refusal: `One message carries at most ${limits.perMessage} pictures.` };
    carriedCount += 1;
    return { admitted: true };
  });
}

/** "1 of 4": the pictures the message carries against the bound. */
function countWordingOf(pending: readonly PendingPicture[], limits: PictureLimitsDocument): string {
  return `${carriedOf(pending).length} of ${limits.perMessage}`;
}

/** The words after Attach pictures: how to add one while none is there, the count once one is. */
function attachHintOf(pending: readonly PendingPicture[], limits: PictureLimitsDocument): string {
  return pending.length === 0
    ? `or paste and drop them · ${acceptWordingOf(limits)}`
    : `${acceptWordingOf(limits)} · ${countWordingOf(pending, limits)}`;
}

/** The pictures a send names: the uploaded ones, in the order they were added. */
function sentPicturesOf(pending: readonly PendingPicture[]): SentPictureReference[] {
  return pending.flatMap((picture) => (
    typeof picture.upload === 'object' && 'pictureId' in picture.upload ? [{ pictureId: picture.upload.pictureId, name: picture.name }] : []
  ));
}

/** A message sends with text or an uploaded picture, and never while a picture is still uploading. */
function sendableOf(text: string, pending: readonly PendingPicture[]): boolean {
  if (pending.some((picture) => picture.upload === 'uploading')) return false;
  return text.trim() !== '' || sentPicturesOf(pending).length > 0;
}

function pictureRouteOf(pictureId: string): string {
  return `${PICTURES_ROUTE}/${encodeURIComponent(pictureId)}`;
}

/** A sent picture's name; its id's start where no record of the job names it. */
function pictureNameOf(picture: { readonly pictureId: string; readonly name: string | null }): string {
  return picture.name ?? picture.pictureId.slice(0, UNNAMED_PICTURE_ID_LENGTH);
}

export const PictureAttachmentsModelUtil = Object.freeze({
  pictureRouteOf,
  pictureNameOf,
  acceptWordingOf,
  sizeWordingOf,
  admissionsOf,
  countWordingOf,
  attachHintOf,
  sentPicturesOf,
  sendableOf
});
