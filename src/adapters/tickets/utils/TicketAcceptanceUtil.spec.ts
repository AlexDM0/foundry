/**
 * The release trusts this reading to tell a review that accounted for every Acceptance item from one that skipped one, so what matters:
 * only `A<n>.` at the start of a line is an item, its continuation lines belong to it, a `Waived:` item counts as accounted for, only the
 * latest `## Review` counts, a `does not hold` line is a gap even beside a `holds` one, a gap outranks a waiver, a heading inside a code
 * fence is not a section, and no body, however malformed, throws. A page quotes the sections and the item text, so those are pinned too:
 * an item's text joins its continuation lines, a section is every `##` heading in order with its source lines, and a CRLF body splits the
 * same as an LF one.
 */
import { describe, expect, test } from 'bun:test';

import { TicketAcceptanceUtil } from './TicketAcceptanceUtil.ts';

const { acceptanceItemsOf, latestReviewLinesOf, acceptanceVerdictOf } = TicketAcceptanceUtil;
const { sectionsOf } = TicketAcceptanceUtil;

const ACCEPTANCE = [
  '## Acceptance',
  '',
  'A1. The export names Alex Example',
  '    on every page.',
  'A2. The header says Example Agency.',
  'A3. The footer carries the page count.',
  '',
].join('\n');

function bodyWith(...sections: string[]): string {
  return ['# 7 — Example export', '', '## Report', '', 'Reported by Alex Example.', '', ...sections].join('\n');
}

describe('acceptanceItemsOf', () => {
  test('reads each item at the start of a line, with continuation lines, in written order', () => {
    expect(acceptanceItemsOf(bodyWith(ACCEPTANCE))).toEqual([
      { label: 'A1', text: 'The export names Alex Example on every page.', waivedReason: null },
      { label: 'A2', text: 'The header says Example Agency.', waivedReason: null },
      { label: 'A3', text: 'The footer carries the page count.', waivedReason: null },
    ]);
  });

  test('a Waived: item carries its reason, continuation lines joined', () => {
    const body = bodyWith('## Acceptance', '', 'A1. Holds.', 'A2. Waived: the export moved', '    to Example Agency.', '');
    expect(acceptanceItemsOf(body)).toEqual([
      { label: 'A1', text: 'Holds.', waivedReason: null },
      { label: 'A2', text: 'Waived: the export moved to Example Agency.', waivedReason: 'the export moved to Example Agency.' },
    ]);
  });

  test('an indented, mid-sentence or lettered line is no item, and an item numbered twice counts once', () => {
    const body = bodyWith('## Acceptance', '', '  A1. Indented.', 'See A2. in passing.', 'B1. Another letter.', 'A4. First.', 'A04. Again.', '');
    expect(acceptanceItemsOf(body)).toEqual([{ label: 'A4', text: 'First.', waivedReason: null }]);
  });

  test('items outside the Acceptance section, or under a fenced heading, are not read', () => {
    const body = bodyWith('## Wanted', '', 'A1. Not an acceptance item.', '', '```', '## Acceptance', 'A2. Fenced.', '```', '');
    expect(acceptanceItemsOf(body)).toEqual([]);
  });

  test('a deeper heading stays inside the section', () => {
    expect(acceptanceItemsOf(bodyWith('## Acceptance', '### Checks', 'A1. Holds.', '')).map(({ label }) => label)).toEqual(['A1']);
  });

  test('a CRLF body reads the same items and text as its LF form, and an item with no text has empty text', () => {
    expect(acceptanceItemsOf(bodyWith(ACCEPTANCE).replaceAll('\n', '\r\n'))).toEqual(acceptanceItemsOf(bodyWith(ACCEPTANCE)));
    expect(acceptanceItemsOf('## Acceptance\nA1.\n')).toEqual([{ label: 'A1', text: '', waivedReason: null }]);
  });
});

describe('sectionsOf', () => {
  test('gives every `##` section in written order with its source lines, blank lines around them dropped and lines inside kept', () => {
    const body = bodyWith('## Wanted', '', 'The export names **Alex Example**.', '', '- on every page', '', '## Brief', 'Work belongs in: `src/example/Export.ts`.', '');
    expect(sectionsOf(body)).toEqual([
      { heading: 'Report',  markdown: 'Reported by Alex Example.' },
      { heading: 'Wanted',  markdown: 'The export names **Alex Example**.\n\n- on every page' },
      { heading: 'Brief',   markdown: 'Work belongs in: `src/example/Export.ts`.' },
    ]);
  });

  test('a heading inside a code fence is a line of the section around it, and a deeper heading stays inside its section', () => {
    const body = bodyWith('## Brief', '```', '## Acceptance', 'A1. Fenced.', '```', '### Checks', 'Example.', '');
    expect(sectionsOf(body).map(({ heading }) => heading)).toEqual(['Report', 'Brief']);
    expect(sectionsOf(body)[1]?.markdown).toBe('```\n## Acceptance\nA1. Fenced.\n```\n### Checks\nExample.');
  });

  test('a `#` title ends the section before it and starts none, and lines before the first heading belong to no section', () => {
    expect(sectionsOf('Preamble.\n## Report\nExample.\n# 8 — Example title\nUnder the title.\n')).toEqual([
      { heading: 'Report', markdown: 'Example.' },
    ]);
  });

  test('a repeated heading is kept each time, an empty section has empty markdown, and trailing heading spaces are dropped', () => {
    expect(sectionsOf('## Review 1  \nA1 holds\n## Review 2\n\n')).toEqual([
      { heading: 'Review 1', markdown: 'A1 holds' },
      { heading: 'Review 2', markdown: '' },
    ]);
  });

  test('a CRLF body splits the same as its LF form, with no carriage return left in a heading or a line', () => {
    const body = bodyWith(ACCEPTANCE, '## Brief', 'Example.', '');
    expect(sectionsOf(body.replaceAll('\n', '\r\n'))).toEqual(sectionsOf(body));
  });

  test('a body with no `##` heading has no section', () => {
    expect(sectionsOf('')).toEqual([]);
    expect(sectionsOf('Just text.\n### Deeper\n')).toEqual([]);
  });
});

describe('latestReviewLinesOf', () => {
  test('reads only the last Review, bullets and dashes dropped', () => {
    const body = bodyWith(ACCEPTANCE, '## Review', 'A1 does not hold — missing', '', '## Review', '- A1 holds — Export.spec.ts › names the author', 'A2 waived: moved', '');
    expect(latestReviewLinesOf(body)).toEqual([
      { label: 'A1', verdict: 'holds', text: 'Export.spec.ts › names the author' },
      { label: 'A2', verdict: 'waived', text: 'moved' },
    ]);
  });
});

describe('acceptanceVerdictOf', () => {
  test('an Acceptance with no numbered item is unnumbered, as is a body with none at all', () => {
    expect(acceptanceVerdictOf(bodyWith('## Acceptance', '', 'The export works.', ''))).toEqual({ verdict: 'unnumbered' });
    expect(acceptanceVerdictOf('')).toEqual({ verdict: 'unnumbered' });
  });

  test('every item holding is accounted for', () => {
    const body = bodyWith(ACCEPTANCE, '## Review', 'A1 holds — probe', 'A2 holds — probe', 'A3 holds — probe', '');
    expect(acceptanceVerdictOf(body)).toEqual({ verdict: 'accounted-for' });
  });

  test('an item without a line, or with a does-not-hold line beside a holds one, is unaccounted', () => {
    const body = bodyWith(ACCEPTANCE, '## Review', 'A1 holds — probe', 'A2 holds — probe', 'A2 does not hold — the header is blank', '');
    expect(acceptanceVerdictOf(body)).toEqual({ verdict: 'unaccounted', labels: ['A2', 'A3'] });
  });

  test('a ticket with no Review leaves every item unaccounted', () => {
    expect(acceptanceVerdictOf(bodyWith(ACCEPTANCE))).toEqual({ verdict: 'unaccounted', labels: ['A1', 'A2', 'A3'] });
  });

  test('reads the `## Review <round>` sections a review job\'s code writes, the latest round counting', () => {
    const latestRound = ['## Review 2', '- A1 holds — probe', '- A2 holds', '- A3 holds', ''];
    const body = bodyWith(ACCEPTANCE, '## Review 1', 'A1 holds', 'A2 holds', 'A3 holds', '', ...latestRound);
    expect(acceptanceVerdictOf(body)).toEqual({ verdict: 'accounted-for' });
    const shorterLatestRound = bodyWith(ACCEPTANCE, '## Review 1', 'A1 holds', 'A2 holds', 'A3 holds', '', '## Review 2', 'A1 holds', '');
    expect(acceptanceVerdictOf(shorterLatestRound)).toEqual({ verdict: 'unaccounted', labels: ['A2', 'A3'] });
  });

  test('an earlier round holding an item does not account for it in the latest', () => {
    const body = bodyWith(ACCEPTANCE, '## Review', 'A1 holds', 'A2 holds', 'A3 holds', '', '## Review', 'A1 holds', 'A2 holds', '');
    expect(acceptanceVerdictOf(body)).toEqual({ verdict: 'unaccounted', labels: ['A3'] });
  });

  test('a waiver only the Review makes is named with its reason', () => {
    const body = bodyWith(ACCEPTANCE, '## Review', 'A1 holds', 'A2 holds', 'A3 waived — the footer moved to Example Agency', '');
    expect(acceptanceVerdictOf(body)).toEqual({ verdict: 'waived-in-review-only', waivers: [{ label: 'A3', reason: 'the footer moved to Example Agency' }] });
  });

  test('a gap outranks a waiver', () => {
    const body = bodyWith(ACCEPTANCE, '## Review', 'A1 holds', 'A3 waived — moved', '');
    expect(acceptanceVerdictOf(body)).toEqual({ verdict: 'unaccounted', labels: ['A2'] });
  });

  test('an item the Acceptance marks waived is accounted for whatever the Review says', () => {
    const body = bodyWith(
      '## Acceptance', '', 'A1. Holds.', 'A2. Holds.', 'A3. Waived: the footer moved', '',
      '## Review', 'A1 holds', 'A2 holds', 'A3 waived — the footer moved', '',
    );
    expect(acceptanceVerdictOf(body)).toEqual({ verdict: 'accounted-for' });
  });

  test('a malformed body is a verdict, never a throw', () => {
    for (const body of ['## Acceptance', '## Acceptance\nA1.', '```\n## Review\nA1 holds', '\r\n## Acceptance\r\nA1. Holds.\r\n## Review\r\nA1 holds\r\n']) {
      expect(() => acceptanceVerdictOf(body)).not.toThrow();
    }
    expect(acceptanceVerdictOf('## Acceptance\r\nA1. Holds.\r\n## Review\r\nA1 holds\r\n')).toEqual({ verdict: 'accounted-for' });
  });
});

// `ticket ready` refuses on these, so the Acceptance is read exactly as the release reads it and a Brief must hold a non-blank line.
describe('readinessGapsOf', () => {
  const BRIEF = '## Brief\nWork belongs in: `src/example/ExampleCheckout.ts`.\n';

  test('a numbered Acceptance and a Brief with text leave no gap, CRLF lines too', () => {
    expect(TicketAcceptanceUtil.readinessGapsOf(`${ACCEPTANCE}\n${BRIEF}`)).toEqual([]);
    expect(TicketAcceptanceUtil.readinessGapsOf('## Acceptance\r\nA1. Holds.\r\n## Brief\r\nExample.\r\n')).toEqual([]);
  });

  test('an Acceptance with no `A<n>.` item, or none at all, is acceptance-unnumbered', () => {
    for (const acceptance of ['', '## Acceptance\n- The export names Alex Example.\n', '## Acceptance\n1. The export works.\n']) {
      expect(TicketAcceptanceUtil.readinessGapsOf(`${acceptance}${BRIEF}`), acceptance).toEqual(['acceptance-unnumbered']);
    }
  });

  test('no Brief, an empty one, a blank one and one only inside a code fence are brief-missing', () => {
    for (const brief of ['', '## Brief\n', '## Brief\n   \n\t\n## Handoff\nDone.\n', '```\n## Brief\nExample.\n```\n']) {
      expect(TicketAcceptanceUtil.readinessGapsOf(`${ACCEPTANCE}\n${brief}`), brief).toEqual(['brief-missing']);
    }
  });

  test('a body with neither names both gaps, Acceptance first', () => {
    expect(TicketAcceptanceUtil.readinessGapsOf('## Report\nExample.\n')).toEqual(['acceptance-unnumbered', 'brief-missing']);
  });
});
