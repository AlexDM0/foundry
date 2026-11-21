/**
 * The pictures a message is about to carry. What matters: each refusal before upload (a type Hephaestus does not take, a file over the
 * size bound, a file past the per-message bound) comes from the served limits and counts the pictures already carried, never a refused
 * one; the accepted types and the sizes read as User reads them, at each unit's edge; a message sends with text or an uploaded picture and
 * never while an upload runs; a send names only the uploaded pictures; and a sent picture's address is Gaia's relay's.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardPictureLimitsDocument }                  from '../../../@types/board/BoardFactDocuments.ts';
import { PictureAttachmentsModelUtil, type PendingPicture } from './PictureAttachmentsModel.ts';

const LIMITS: BoardPictureLimitsDocument = { perMessage: 2, sizeLimitBytes: 5_242_880, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] };

function pending(key: string, upload: PendingPicture['upload']): PendingPicture {
  return {
    key, name: `${key}.png`, bytes: 1000, mediaType: 'image/png', thumbnailDataUrl: null, upload
  };
}

function file(name: string, type: string, size = 1000) {
  return { name, type, size };
}

describe('PictureAttachmentsModelUtil.admissionsOf', () => {
  test('refuses a type Hephaestus does not take and a file over the size bound, each in its own words', () => {
    expect(PictureAttachmentsModelUtil.admissionsOf([file('notes.pdf', 'application/pdf'), file('huge.png', 'image/png', 6_000_000)], [], LIMITS)).toEqual([
      { admitted: false, refusal: 'notes.pdf is no PNG, JPEG, WebP or GIF picture.' },
      { admitted: false, refusal: 'huge.png is 5.7 MB, and a picture is at most 5.0 MB.' },
    ]);
  });

  test('the per-message bound counts the pictures already carried and the files admitted before, never a refused picture', () => {
    const carried = [pending('a', { pictureId: 'a' }), pending('b', { refusal: 'Too large.' })];
    expect(PictureAttachmentsModelUtil.admissionsOf([file('one.png', 'image/png'), file('two.png', 'image/png')], carried, LIMITS)).toEqual([
      { admitted: true },
      { admitted: false, refusal: 'One message carries at most 2 pictures.' },
    ]);
  });
});

describe('the wording', () => {
  test('names the accepted types as User reads them', () => {
    expect(PictureAttachmentsModelUtil.acceptWordingOf(LIMITS)).toBe('PNG, JPEG, WebP or GIF');
    expect(PictureAttachmentsModelUtil.acceptWordingOf({ ...LIMITS, mediaTypes: ['image/png'] })).toBe('PNG');
  });

  test('words a size in bytes, kilobytes or megabytes at each unit\'s edge', () => {
    expect([1023, 1024, 421_888, 1_048_575, 1_048_576, 5_000_000].map(PictureAttachmentsModelUtil.sizeWordingOf))
      .toEqual(['1023 bytes', '1 KB', '412 KB', '1024 KB', '1.0 MB', '4.8 MB']);
  });

  test('says how to add a picture while none is there, and the count against the bound once one is', () => {
    expect(PictureAttachmentsModelUtil.attachHintOf([], LIMITS)).toBe('or paste and drop them · PNG, JPEG, WebP or GIF');
    expect(PictureAttachmentsModelUtil.attachHintOf([pending('a', 'uploading'), pending('b', { refusal: 'No.' })], LIMITS)).toBe('PNG, JPEG, WebP or GIF · 1 of 2');
  });

  test('a sent picture loads through Gaia\'s relay of its forge and shows its id\'s start where no record names it', () => {
    expect(PictureAttachmentsModelUtil.pictureAddressOf('example tracker', 'ab12')).toBe('/api/v1/forges/example%20tracker/pictures/ab12');
    expect(PictureAttachmentsModelUtil.pictureNameOf({ pictureId: 'c'.repeat(64), name: null })).toBe('c'.repeat(12));
    expect(PictureAttachmentsModelUtil.pictureNameOf({ pictureId: 'c'.repeat(64), name: 'sketch.png' })).toBe('sketch.png');
  });
});

describe('PictureAttachmentsModelUtil.sendableOf and sentPicturesOf', () => {
  test('sends with text or an uploaded picture, and never while an upload runs', () => {
    expect(PictureAttachmentsModelUtil.sendableOf('  ', [])).toBe(false);
    expect(PictureAttachmentsModelUtil.sendableOf('Hello', [])).toBe(true);
    expect(PictureAttachmentsModelUtil.sendableOf('', [pending('a', { pictureId: 'a1' })])).toBe(true);
    expect(PictureAttachmentsModelUtil.sendableOf('', [pending('a', { refusal: 'No.' })])).toBe(false);
    expect(PictureAttachmentsModelUtil.sendableOf('Hello', [pending('a', 'uploading')])).toBe(false);
  });

  test('a send names only the uploaded pictures, in the order they were added', () => {
    expect(PictureAttachmentsModelUtil.sentPicturesOf([pending('a', { pictureId: 'a1' }), pending('b', { refusal: 'No.' }), pending('c', { pictureId: 'c1' })]))
      .toEqual([{ pictureId: 'a1', name: 'a.png' }, { pictureId: 'c1', name: 'c.png' }]);
  });
});
