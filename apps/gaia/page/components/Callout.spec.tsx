/**
 * The callout. What matters: the title line holds the dot, the forge's name and the word, then the sentence and the mono line; the mono
 * line and the actions are absent when not given; it is a section named by its title and word; it is the package's callout, warn tinted,
 * error, and neutral dashed, holding the body and handed the actions as its own; each tone's word has a rule.
 */
import { describe, expect, test }                      from 'bun:test';
import { Button, Callout as PackageCallout, StateDot } from '../lib/design-system/DesignSystemInterface.ts';

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
  test('the title line, the sentence and the mono line come in that order as the callout\'s body, the actions handed as its actions', () => {
    const unfolded = calloutOf('neutral');
    const callout = ReactElementTree.onlyWithClass(unfolded, 'gaia-callout');
    expect([callout.tag, callout.props['aria-label']]).toEqual(['section', 'Example Mobile App: Launches held']);
    const title = ReactElementTree.onlyWithClass(unfolded, 'gaia-callout-title');
    expect(ReactElementTree.hostElementsIn([title]).map((element) => (element.tag === StateDot.name ? element.tag : element.props['className'])))
      .toEqual(['gaia-callout-title', 'StateDot', 'gaia-callout-name', 'gaia-callout-word']);
    expect(ReactElementTree.textOf(unfolded)).toBe(
      'Example Mobile AppLaunches heldThe install version changed. Nothing launches until this forge is updated.2 agents keep running through the update',
    );
    const packageCallout = ReactElementTree.onlyOfComponent(unfolded, PackageCallout);
    expect(ReactElementTree.hostElementsIn(ReactElementTree.unfoldedProp(packageCallout, 'children')).map((element) => element.props['className'])[0]).toBe('gaia-callout-body');
    expect(PackageButtons.buttonsIn(ReactElementTree.unfoldedProp(packageCallout, 'actions')).map(PackageButtons.labelOf)).toEqual(['Update forge']);
  });

  test('each tone is the package\'s callout, warn tinted and neutral dashed, holding the body and handed the actions', () => {
    const expectedLooks = { warn: ['warn', true, undefined], error: ['error', undefined, undefined], neutral: ['neutral', undefined, true] } as const;
    for (const [tone, look] of Object.entries(expectedLooks)) {
      const callout = ReactElementTree.onlyOfComponent(calloutOf(tone as CalloutTone), PackageCallout);
      expect([callout.props['tone'], callout.props['tinted'], callout.props['dashed']]).toEqual([...look]);
      const body = ReactElementTree.onlyWithClass(ReactElementTree.unfoldedProp(callout, 'children'), 'gaia-callout-body');
      expect([body.props['data-tone'], ReactElementTree.textOf([body])]).toEqual([
        tone, 'Example Mobile AppLaunches heldThe install version changed. Nothing launches until this forge is updated.2 agents keep running through the update',
      ]);
      expect(PackageButtons.buttonsIn(ReactElementTree.unfoldedProp(callout, 'actions')).map(PackageButtons.labelOf)).toEqual(['Update forge']);
    }
  });

  test('the mono line and the actions are absent when not given', () => {
    const unfolded = ReactElementTree.unfolded(
      <Callout tone="neutral" dot={<ConditionDot condition="live" />} title="Research Wiki" word="Counts only" sentence="This forge is older than the monitor contract." />,
    );
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-callout-machine-line'))).toEqual([]);
    expect(ReactElementTree.onlyOfComponent(unfolded, PackageCallout).props['actions']).toBeUndefined();
  });

  test('each tone\'s word has a rule of its own', () => {
    const stylesheetText = GaiaStylesheet.text();
    for (const tone of ['warn', 'error', 'neutral']) expect(GaiaStylesheet.stylesVariant(stylesheetText, 'gaia-callout-body', 'data-tone', tone)).toBe(true);
  });
});
