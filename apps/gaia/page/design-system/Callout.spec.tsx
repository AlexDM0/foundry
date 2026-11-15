/**
 * The callout. What matters: the title line holds the dot, the forge's name and the word, then the sentence and the mono line; the mono
 * line and the actions are absent when not given; it is a section named by its title and word; warn and error are the package's banner
 * in its warn and error tones, with the actions at its end, and neutral is the package's dashed card; each tone's word has a rule.
 */
import { describe, expect, test } from 'bun:test';
import { Button }                 from 'design-system/Button';

import { GaiaStylesheet }            from '../testing/GaiaStylesheet.ts';
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
    const unfolded = calloutOf('warn');
    const callout = ReactElementTree.onlyWithClass(unfolded, 'gaia-callout');
    expect([callout.tag, callout.props['aria-label']]).toEqual(['section', 'Example Mobile App: Launches held']);
    const title = ReactElementTree.onlyWithClass(unfolded, 'gaia-callout-title');
    expect(ReactElementTree.hostElementsIn([title]).map((element) => element.props['className']))
      .toEqual(['gaia-callout-title', 'design-system-state-dot', 'gaia-callout-name', 'gaia-callout-word']);
    expect(ReactElementTree.textOf(unfolded)).toBe(
      'Example Mobile AppLaunches heldThe install version changed. Nothing launches until this forge is updated.2 agents keep running through the updateUpdate forge',
    );
  });

  test('warn and error are the package\'s banner in that tone, the actions at its end', () => {
    for (const tone of ['warn', 'error'] as const) {
      const unfolded = calloutOf(tone);
      expect(ReactElementTree.onlyWithClass(unfolded, 'design-system-banner').props['data-tone']).toBe(tone);
      expect(ReactElementTree.textOf([ReactElementTree.onlyWithClass(unfolded, 'design-system-banner-action')])).toBe('Update forge');
      expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-callout-body').props['data-tone']).toBe(tone);
    }
  });

  test('neutral is the package\'s dashed card, with no banner', () => {
    const unfolded = calloutOf('neutral');
    expect(ReactElementTree.onlyWithClass(unfolded, 'design-system-card').props['data-dashed']).toBe('');
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('design-system-banner'))).toEqual([]);
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
