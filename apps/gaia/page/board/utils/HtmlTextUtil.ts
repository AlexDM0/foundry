/**
 * The words a reader sees in rendered markdown, read as plain text for the search and for an epic card's summary line: every tag and
 * its attributes dropped, then the escaped characters read back. The result is text, never markup: React escapes it like any value.
 */
import { SearchMatchUtil } from './SearchMatchUtil.ts';

const MARKUP_TAG_PATTERN          = /<[^>]*>/g;
const CHARACTER_REFERENCE_PATTERN = /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi;
const FIRST_PARAGRAPH_PATTERN     = /<p>([\s\S]*?)<\/p>/;
const NAMED_CHARACTERS: Readonly<Record<string, string>> = {
  amp:  '&',
  lt:   '<',
  gt:   '>',
  quot: '"',
  apos: '\'',
  nbsp: ' ',
};
const HEXADECIMAL_RADIX       = 16;
const DECIMAL_RADIX           = 10;
const LAST_UNICODE_CODE_POINT = 0x10ffff;
const REPLACEMENT_CHARACTER   = '\ufffd';

/** A browser reads a reference to no character as the replacement character, never as an error. */
function characterForCodePoint(codePoint: number): string {
  if (Number.isNaN(codePoint) || codePoint === 0 || codePoint > LAST_UNICODE_CODE_POINT) return REPLACEMENT_CHARACTER;
  return String.fromCodePoint(codePoint);
}

function characterOfReference(reference: string, name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName.startsWith('#x')) return characterForCodePoint(Number.parseInt(lowerName.slice(2), HEXADECIMAL_RADIX));
  if (lowerName.startsWith('#')) return characterForCodePoint(Number.parseInt(lowerName.slice(1), DECIMAL_RADIX));
  return Object.hasOwn(NAMED_CHARACTERS, lowerName) ? NAMED_CHARACTERS[lowerName] ?? reference : reference;
}

function plainTextOf(html: string): string {
  return SearchMatchUtil.collapsedWhiteSpaceOf(html.replace(MARKUP_TAG_PATTERN, ' ').replace(CHARACTER_REFERENCE_PATTERN, characterOfReference));
}

/** The first paragraph's words, an epic card's summary; '' when the markup opens no paragraph. */
function firstParagraphTextOf(html: string): string {
  const paragraph = FIRST_PARAGRAPH_PATTERN.exec(html)?.[1];
  return paragraph === undefined ? '' : plainTextOf(paragraph);
}

export const HtmlTextUtil = Object.freeze({ plainTextOf, firstParagraphTextOf });
