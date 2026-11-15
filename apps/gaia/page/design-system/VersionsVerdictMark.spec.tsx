/**
 * The verdict's mark and label. What matters: a forge Gaia cannot talk to draws the package's dashed dot, faded for newer and orange for
 * older, which waits on User; current is Gaia's own check and ahead its own half-filled dot, never orange; the mark is hidden, since the
 * label's word beside it carries the meaning, and the label's colour follows the verdict through a rule of its own.
 */
import { describe, expect, test } from 'bun:test';
import { StateDot }               from 'design-system/StateDot';

import { GaiaStylesheet }                                                from '../testing/GaiaStylesheet.ts';
import { ReactElementTree }                                              from '../testing/ReactElementTree.ts';
import { type MarkedVerdict, VersionsVerdictLabel, VersionsVerdictMark } from './VersionsVerdictMark.tsx';

const EVERY_VERDICT: readonly MarkedVerdict[] = ['current', 'ahead', 'newer', 'older'];

function markOf(verdict: MarkedVerdict) {
  return ReactElementTree.unfolded(<VersionsVerdictMark verdict={verdict} />);
}

describe('the verdict mark', () => {
  test('draws a newer forge as the package\'s faded dashed dot and an older one as its orange dashed dot', () => {
    const dots = (['newer', 'older'] as const).map((verdict) => ReactElementTree.onlyOfComponent(markOf(verdict), StateDot));
    expect(dots.map((dot) => [dot.props['tone'], dot.props['shape']])).toEqual([['muted', 'dashed-ring'], ['accent', 'dashed-ring']]);
  });

  test('draws current as Gaia\'s own check and ahead as its own half-filled dot, no package dot in either', () => {
    expect(ReactElementTree.hostElementsIn(markOf('current'), ReactElementTree.withClass('gaia-versions-check'))).toHaveLength(1);
    expect(ReactElementTree.hostElementsIn(markOf('ahead'), ReactElementTree.withClass('gaia-versions-half-dot'))).toHaveLength(1);
    expect([...markOf('current'), ...markOf('ahead')].some((node) => typeof node !== 'string'
      && ReactElementTree.hostElementsIn([node], ReactElementTree.withComponent(StateDot)).length > 0)).toBe(false);
  });

  test('is hidden from the accessibility tree in every verdict', () => {
    for (const verdict of EVERY_VERDICT) expect(ReactElementTree.onlyWithClass(markOf(verdict), 'gaia-versions-verdict-mark').props['aria-hidden']).toBe('true');
  });
});

describe('the verdict label', () => {
  test('sets the mark before the word, and names its verdict for a rule of its own in gaia.css', () => {
    const stylesheetText = GaiaStylesheet.text();
    for (const verdict of EVERY_VERDICT) {
      const nodes = ReactElementTree.unfolded(<VersionsVerdictLabel verdict={verdict} word="Older than this Gaia" />);
      const label = ReactElementTree.onlyWithClass(nodes, 'gaia-versions-verdict');
      expect([label.props['data-verdict'], ReactElementTree.textOf(nodes)]).toEqual([verdict, 'Older than this Gaia']);
      expect(GaiaStylesheet.stylesVariant(stylesheetText, 'gaia-versions-verdict', 'data-verdict', verdict)).toBe(true);
    }
  });
});
