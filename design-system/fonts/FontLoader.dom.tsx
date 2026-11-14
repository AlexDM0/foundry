/**
 * The font loader, over a fake FontFace set and a factory that records each face, as happy-dom has no FontFace API. What matters: Inter
 * and Newsreader are each registered once per unicode range, latin and latin-ext, with the weight range of their variable axis and display
 * swap, as the `@font-face` rules they replace; each source names one of the four woff2 files beside the loader, in the woff2 format; and a
 * second set gets the same faces, so a host and Storybook each register their own.
 */
import { describe, expect, test } from 'bun:test';

import { loadDesignSystemFonts, type FontFaceFactory } from './FontLoader.ts';

interface RecordedFontFace {
  readonly family:      string;
  readonly source:      string;
  readonly descriptors: FontFaceDescriptors;
}

const LATIN_RANGE_START = 'U+0000-00FF';
const LATIN_EXTENDED_RANGE_START = 'U+0100-02BA';
const WOFF2_SOURCE = /^url\("([^"]+\.woff2)"\) format\("woff2"\)$/;

// The fake set hands back what the factory recorded, so the cast only renames the record the factory made.
const recordingFontFaceFactory: FontFaceFactory = (family, source, descriptors) => ({ family, source, descriptors }) as unknown as FontFace;

function fontFacesRegisteredInAFakeSet(): readonly RecordedFontFace[] {
  const registered: RecordedFontFace[] = [];
  loadDesignSystemFonts({ add: (fontFace) => registered.push(fontFace as unknown as RecordedFontFace) }, recordingFontFaceFactory);
  return registered;
}

function fontFileOf(fontFace: RecordedFontFace): string {
  return WOFF2_SOURCE.exec(fontFace.source)?.[1]?.split('/').pop() ?? `no woff2 source in ${fontFace.source}`;
}

describe('loadDesignSystemFonts', () => {
  test('it registers Inter over weights 100 to 900 and Newsreader over 200 to 800, each for the latin and the latin-ext range', () => {
    const summaries = fontFacesRegisteredInAFakeSet().map((fontFace) => ({
      family:     fontFace.family,
      weight:     fontFace.descriptors.weight,
      rangeStart: fontFace.descriptors.unicodeRange?.split(',')[0],
    }));
    expect(summaries).toEqual([
      { family: 'Inter', weight: '100 900', rangeStart: LATIN_EXTENDED_RANGE_START },
      { family: 'Inter', weight: '100 900', rangeStart: LATIN_RANGE_START },
      { family: 'Newsreader', weight: '200 800', rangeStart: LATIN_EXTENDED_RANGE_START },
      { family: 'Newsreader', weight: '200 800', rangeStart: LATIN_RANGE_START },
    ]);
  });

  test('every face is normal style and swaps in once loaded, so text shows in the fallback font until then', () => {
    for (const fontFace of fontFacesRegisteredInAFakeSet()) {
      expect(fontFace.descriptors.style).toBe('normal');
      expect(fontFace.descriptors.display).toBe('swap');
    }
  });

  test('each face reads its own woff2 file beside the loader, in the woff2 format', () => {
    expect(fontFacesRegisteredInAFakeSet().map(fontFileOf)).toEqual([
      'inter-latin-ext-wght-normal.woff2',
      'inter-latin-wght-normal.woff2',
      'newsreader-latin-ext-opsz-normal.woff2',
      'newsreader-latin-opsz-normal.woff2',
    ]);
  });

  test('a second set gets the same faces again', () => {
    expect(fontFacesRegisteredInAFakeSet()).toEqual(fontFacesRegisteredInAFakeSet());
  });
});
