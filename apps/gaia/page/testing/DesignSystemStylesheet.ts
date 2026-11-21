/**
 * Test-only: the design-system library's stylesheet and fonts for a page a browser opens from a file, where no bundler runs. The entry
 * stylesheet, as the page links it, comes with its imports inlined; the fonts come as the `@font-face` rules the font loader stands in
 * for, each file inlined as a `data:` address, since a file page may not load a font from another file.
 */
import { readFileSync } from 'node:fs';

import { type FontFaceFactory, loadDesignSystemFonts } from '../lib/design-system/DesignSystemInterface.ts';

import { PackageStylesheet } from './PackageStylesheet.ts';

/** The library's entry stylesheet as `page/index.html` links it. */
const ENTRY_STYLESHEET_PAGE_PATHS = ['lib/design-system/styles/design-system.css'];

const FONT_FILE_SOURCE = /^url\("([^"]+)"\) format\("woff2"\)$/;

interface RecordedFontFace {
  readonly family:      string;
  readonly source:      string;
  readonly descriptors: FontFaceDescriptors;
}

// The fake set hands back what the factory recorded, so the cast only renames the record the factory made.
const recordingFontFaceFactory: FontFaceFactory = (family, source, descriptors) => ({ family, source, descriptors }) as unknown as FontFace;

function fontFaceRuleOf(fontFace: RecordedFontFace): string {
  // Under Bun an imported font file is its path on disk.
  const fontFilePath = FONT_FILE_SOURCE.exec(fontFace.source)?.[1] ?? '';
  const fontFileAddress = `data:font/woff2;base64,${readFileSync(fontFilePath).toString('base64')}`;
  return [
    '@font-face {',
    `  font-family: "${fontFace.family}";`,
    `  src: url("${fontFileAddress}") format("woff2");`,
    `  font-style: ${fontFace.descriptors.style ?? 'normal'};`,
    `  font-weight: ${fontFace.descriptors.weight ?? 'normal'};`,
    `  font-display: ${fontFace.descriptors.display ?? 'auto'};`,
    `  unicode-range: ${fontFace.descriptors.unicodeRange ?? 'U+0-10FFFF'};`,
    '}',
  ].join('\n');
}

let fontFaceRulesText: string | null = null;

export const DesignSystemStylesheet = {
  /** The entry stylesheets as a bundler links them: every imported stylesheet in place of its import, in order. */
  text(): string {
    return ENTRY_STYLESHEET_PAGE_PATHS.map((entryPagePath) => PackageStylesheet.inlinedText(entryPagePath)).join('\n');
  },

  /** A rule per face the font loader registers, read once and kept, since the files are large and the same for every screen. */
  fontFaceRules(): string {
    if (fontFaceRulesText === null) {
      const registered: RecordedFontFace[] = [];
      loadDesignSystemFonts({ add: (fontFace) => registered.push(fontFace as unknown as RecordedFontFace) }, recordingFontFaceFactory);
      fontFaceRulesText = registered.map(fontFaceRuleOf).join('\n');
    }
    return fontFaceRulesText;
  },
} as const;
