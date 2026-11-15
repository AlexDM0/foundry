/**
 * The callout. What matters: the title line holds the dot, the forge's name and the word, then the sentence and the mono line; the mono
 * line and the actions are absent when not given; it is a section named by its title and word; warn and error are the package's banner
 * in its warn and error tones, handed the body as its text and the actions as its action, and neutral is the package's dashed card
 * holding the body, then the actions; each tone's word has a rule.
 */
import { describe, expect, test } from 'bun:test';
import { Banner }                 from 'design-system/Banner';
import { Button }                 from 'design-system/Button';
import { Card }                   from 'design-system/Card';
import { StateDot }               from 'design-system/StateDot';

import { GaiaStylesheet }            from '../testing/GaiaStylesheet.ts';
import { PackageButtons }            from '../testing/PackageButtons.ts';
import { ReactElementTree }          from '../testing/ReactElementTree.ts';
import { Callout, type CalloutTone } from './Callout.tsx';
import { ConditionDot }              from './ConditionDot.tsx';

function calloutOf(tone: CalloutTone) {
  return ReactElementTree.unfolded(
    <Callout
      tone={tone}
      dot={<ConditionDot condition="held" />}
      title="Example Mobile App"
      word="Launches held"
      sentence="The install version changed. Nothing launches until this forge is updated."
      machineLine="2 agents keep running through the update"
      actions={<Button label="Update forge" emphasis="primary" compact />}
    />,
  );
}

describe('the callout', () => {
  test('the title line, the sentence, the mono line and the actions come in that order', () => {
    const unfolded = calloutOf('neutral');
    const callout = ReactElementTree.onlyWithClass(unfolded, 'gaia-callout');
    expect([callout.tag, callout.props['aria-label']]).toEqual(['section', 'Example Mobile App: Launches held']);
    const title = ReactElementTree.onlyWithClass(unfolded, 'gaia-callout-title');
    expect(ReactElementTree.hostElementsIn([title]).map((element) => (element.tag === StateDot.name ? element.tag : element.props['className'])))
      .toEqual(['gaia-callout-title', 'StateDot', 'gaia-callout-name', 'gaia-callout-word']);
    expect(ReactElementTree.textOf(unfolded)).toBe(
      'Example Mobile AppLaunches heldThe install version changed. Nothing launches until this forge is updated.2 agents keep running through the update',
    );
    const parts = ReactElementTree.hostElementsIn(unfolded, (element) => ReactElementTree.hasClass(element, 'gaia-callout-body') || PackageButtons.isButton(element));
    expect(parts.map((part) => part.tag)).toEqual(['span', 'Button']);
    expect(PackageButtons.buttonsIn(unfolded).map(PackageButtons.labelOf)).toEqual(['Update forge']);
  });

  test('warn and error are the package\'s banner in that tone, its text the body and its action the actions', () => {
    for (const tone of ['warn', 'error'] as const) {
      const banner = ReactElementTree.onlyOfComponent(calloutOf(tone), Banner);
      expect(banner.props['tone']).toBe(tone);
      const body = ReactElementTree.onlyWithClass(ReactElementTree.unfoldedProp(banner, 'text'), 'gaia-callout-body');
      expect([body.props['data-tone'], ReactElementTree.textOf([body])]).toEqual([
        tone, 'Example Mobile AppLaunches heldThe install version changed. Nothing launches until this forge is updated.2 agents keep running through the update',
      ]);
      expect(PackageButtons.buttonsIn(ReactElementTree.unfoldedProp(banner, 'action')).map(PackageButtons.labelOf)).toEqual(['Update forge']);
    }
  });

  test('neutral is the package\'s dashed card, with no banner', () => {
    const unfolded = calloutOf('neutral');
    expect(ReactElementTree.onlyOfComponent(unfolded, Card).props['dashed']).toBe(true);
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withComponent(Banner))).toEqual([]);
  });

  test('the mono line and the actions are absent when not given', () => {
    const unfolded = ReactElementTree.unfolded(
      <Callout tone="neutral" dot={<ConditionDot condition="live" />} title="Research Wiki" word="Counts only" sentence="This forge is older than the monitor contract." />,
    );
    const optionalParts = ['gaia-callout-machine-line', 'gaia-callout-actions'];
    expect(ReactElementTree.hostElementsIn(unfolded, (element) => optionalParts.some((className) => ReactElementTree.hasClass(element, className)))).toEqual([]);
  });

  test('each tone\'s word has a rule of its own', () => {
    const stylesheetText = GaiaStylesheet.text();
    for (const tone of ['warn', 'error', 'neutral']) expect(GaiaStylesheet.stylesVariant(stylesheetText, 'gaia-callout-body', 'data-tone', tone)).toBe(true);
  });
});
