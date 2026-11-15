/**
 * A line or sentence about versions as the page sets it: its words in the text around it, each version number in mono. The versions line
 * of a callout is one of them, small and muted; a number there stays in ink, and on a line already in its own colour it takes that colour.
 */
import type { VersionsText as VersionsTextParts } from './utils/ForgeVersionsTextUtil.ts';

export interface VersionsTextProps {
  readonly text:       VersionsTextParts;
  /** `inherit` sets a number in the colour of the line around it, as Attention's row of a forge that needs an update does. */
  readonly numberInk?: 'ink' | 'inherit';
}

export function VersionsText({ text, numberInk = 'ink' }: VersionsTextProps) {
  return text.map((part, i) => (part.kind === 'version'
    ? <span key={i} className="gaia-version-number" data-ink={numberInk === 'inherit' ? 'inherit' : undefined}>{part.text}</span>
    : part.text));
}

export function VersionsLine({ text }: { readonly text: VersionsTextParts }) {
  return <span className="gaia-versions-line"><VersionsText text={text} /></span>;
}
