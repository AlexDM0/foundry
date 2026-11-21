/**
 * Test-only: the shared parts of the Versions boards on one sheet, as the artboard U4 draws them in its sections 3 and 6: the
 * versions pair at each verdict, the verdicts' marks and words, the condition words with their dots, and a callout's versions line. A
 * browser opens it at one column of U4's width, in either theme, for the by-eye pass against U4's render.
 */
import { renderToStaticMarkup } from 'react-dom/server';

import { ConditionDot }                                  from '../components/ConditionDot.tsx';
import { VersionsVerdictLabel }                          from '../components/VersionsVerdictMark.tsx';
import { VersionsPair }                                  from '../shared/VersionsPair.tsx';
import { VersionsLine }                                  from '../shared/VersionsText.tsx';
import { ForgeTextUtil, type ShownCondition }            from '../shared/utils/ForgeTextUtil.ts';
import { ForgeVersionsTextUtil, type ForgeWithVersions } from '../shared/utils/ForgeVersionsTextUtil.ts';
import { documentAround, type ScreenTheme }              from './ArtboardScreens.tsx';
import { FLEET_VERSIONS, FLEET_VERSIONS_READINGS }       from './fixtures/fleet-versions.ts';

/** One theme's column of U4, which draws light and dark side by side at 1440 px. */
export const VERSIONS_PARTS_SHEET_WIDTH_PIXELS = 720;

export const VERSIONS_PARTS_SHEET_HEIGHT_PIXELS = 1000;

const SHEET_STYLE = {
  display:       'flex',
  flexDirection: 'column',
  gap:           26,
  boxSizing:     'border-box',
  width:         VERSIONS_PARTS_SHEET_WIDTH_PIXELS,
  minHeight:     VERSIONS_PARTS_SHEET_HEIGHT_PIXELS,
  padding:       '28px 28px 36px',
  background:    'var(--bg)',
  color:         'var(--ink)',
  font:          'var(--fs-body)/var(--line-height-body) var(--font-ui)',
} as const;

const SECTION_STYLE = { display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' } as const;

const LABEL_STYLE = {
  fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-micro)', lineHeight: 'var(--line-height-micro)', color: 'var(--ink-4)'
} as const;

const ROW_STYLE = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-8) 22px'
} as const;

const READINGS = FLEET_VERSIONS_READINGS;

/** U4's pairs in its order, each under its sheet label. */
const PAIRS: readonly (readonly [label: string, forge: (typeof READINGS)[keyof typeof READINGS]])[] = [
  ['older · the A4 disclosure under Example Billing and the U3 notice', READINGS.exampleBilling],
  ['older · Example Docs states no version', READINGS.exampleDocs],
  ['newer · Analytics Sandbox', READINGS.analyticsSandbox],
  ['ahead · Example Storefront, works; full use needs a newer Gaia', READINGS.exampleStorefront],
  ['current · Research Wiki, no disclosure in A4: its subline says “forge 3.1”', READINGS.researchWiki],
];

const CONDITION_WORDS: readonly ShownCondition[] = ['live', 'unreadable', 'outdated'];

function withVersions(forge: (typeof READINGS)[keyof typeof READINGS]): ForgeWithVersions {
  if (forge.versions === null) throw new Error(`The fixture reads ${forge.project} without its versions.`);
  return { project: forge.project, versions: forge.versions };
}

function SheetLabel({ text }: { readonly text: string }) {
  return <div style={LABEL_STYLE}>{text}</div>;
}

function VersionsPartsSheet() {
  const gaiaVersions = FLEET_VERSIONS.gaia.versions;
  const olderCallout = ForgeVersionsTextUtil.calloutTextOf(withVersions(READINGS.exampleBilling), gaiaVersions);
  return (
    <div style={SHEET_STYLE}>
      <section style={SECTION_STYLE}>
        {PAIRS.map(([label, forge]) => (
          <div key={forge.trackerId} style={SECTION_STYLE}>
            <SheetLabel text={label} />
            <VersionsPair pair={ForgeVersionsTextUtil.pairTextOf(withVersions(forge), gaiaVersions)} />
          </div>
        ))}
      </section>
      <section style={SECTION_STYLE}>
        <SheetLabel text="verdicts, in the versions pair" />
        <div style={ROW_STYLE}>
          {(['current', 'ahead', 'newer', 'older'] as const).map((verdict) => (
            <VersionsVerdictLabel key={verdict} verdict={verdict} word={ForgeVersionsTextUtil.verdictWordOf(verdict)} />
          ))}
        </div>
        <SheetLabel text="condition words (rail, A4, B1)" />
        <div style={ROW_STYLE}>
          {CONDITION_WORDS.map((condition) => (
            <span key={condition} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-8)' }}>
              <ConditionDot condition={ForgeTextUtil.dotConditionOf(condition)} />
              {ForgeTextUtil.conditionWordInSentenceCaseOf(condition)}
            </span>
          ))}
        </div>
        <SheetLabel text="versions line, in a callout" />
        {olderCallout === null ? null : <VersionsLine text={olderCallout.versionsLine} />}
      </section>
    </div>
  );
}

export function versionsPartsDocumentOf(theme: ScreenTheme): string {
  return documentAround(`U4 Versions parts, ${theme}`, theme, renderToStaticMarkup(<VersionsPartsSheet />));
}
