/**
 * Registers Inter and Newsreader with the FontFace API, from the woff2 files beside this module. They are imported from TypeScript, not
 * named by a stylesheet `url()`, because a bundler inlines a small file a stylesheet names as a `data:` address, which a content security
 * policy without `font-src data:` blocks; an imported file is emitted as a file of its own, served from the page's own origin.
 */
/// <reference path="./FontFileImports.d.ts" />
import interLatinExtendedFontFile      from './inter/inter-latin-ext-wght-normal.woff2';
import interLatinFontFile              from './inter/inter-latin-wght-normal.woff2';
import newsreaderLatinExtendedFontFile from './newsreader/newsreader-latin-ext-opsz-normal.woff2';
import newsreaderLatinFontFile         from './newsreader/newsreader-latin-opsz-normal.woff2';

const LATIN_UNICODE_RANGE = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, '
  + 'U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXTENDED_UNICODE_RANGE = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, '
  + 'U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

/** The weight range each variable font covers. */
const INTER_WEIGHT_RANGE = '100 900';
const NEWSREADER_WEIGHT_RANGE = '200 800';

interface DesignSystemFontFile {
  readonly family:       'Inter' | 'Newsreader';
  readonly address:      string;
  readonly weightRange:  string;
  readonly unicodeRange: string;
}

const DESIGN_SYSTEM_FONT_FILES: readonly DesignSystemFontFile[] = Object.freeze([
  {
    family: 'Inter', address: interLatinExtendedFontFile, weightRange: INTER_WEIGHT_RANGE, unicodeRange: LATIN_EXTENDED_UNICODE_RANGE
  },
  {
    family: 'Inter', address: interLatinFontFile, weightRange: INTER_WEIGHT_RANGE, unicodeRange: LATIN_UNICODE_RANGE
  },
  {
    family: 'Newsreader', address: newsreaderLatinExtendedFontFile, weightRange: NEWSREADER_WEIGHT_RANGE, unicodeRange: LATIN_EXTENDED_UNICODE_RANGE
  },
  {
    family: 'Newsreader', address: newsreaderLatinFontFile, weightRange: NEWSREADER_WEIGHT_RANGE, unicodeRange: LATIN_UNICODE_RANGE
  },
]);

/** The part of a `FontFaceSet`, such as `document.fonts`, that the loader uses. */
export interface FontFaceRegistry {
  add(fontFace: FontFace): unknown;
}

export type FontFaceFactory = (family: string, source: string, descriptors: FontFaceDescriptors) => FontFace;

function browserFontFaceOf(family: string, source: string, descriptors: FontFaceDescriptors): FontFace {
  return new FontFace(family, source, descriptors);
}

/**
 * Adds each font file to the set once, as `@font-face` rules would: the browser fetches a file only when text in its family and unicode
 * range is drawn, and shows the fallback font until then. Call it once, before the first render.
 */
export function loadDesignSystemFonts(fontFaceSet: FontFaceRegistry = document.fonts, createFontFace: FontFaceFactory = browserFontFaceOf): void {
  for (const fontFile of DESIGN_SYSTEM_FONT_FILES) {
    fontFaceSet.add(createFontFace(fontFile.family, `url("${fontFile.address}") format("woff2")`, {
      style:        'normal',
      weight:       fontFile.weightRange,
      unicodeRange: fontFile.unicodeRange,
      display:      'swap',
    }));
  }
}
