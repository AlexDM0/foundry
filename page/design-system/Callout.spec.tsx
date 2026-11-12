/**
 * The callout. What matters: the title line holds the dot, the forge's name and the micro-caps word, then the sentence and the mono line;
 * the mono line and the actions are absent when not given; it is named by its title and word; each tone has a rule of its own.
 */
import { describe, expect, test } from 'bun:test';

import { GaiaStylesheet }            from '../testing/GaiaStylesheet.ts';
import { ReactElementTree }          from '../testing/ReactElementTree.ts';
import { Button }                    from './Button.tsx';
import { Callout, type CalloutTone } from './Callout.tsx';
import { ConditionDot }              from './ConditionDot.tsx';

const EVERY_TONE: Readonly<Record<CalloutTone, true>> = { warn: true, error: true, neutral: true };

describe('the callout', () => {
  test('the title line, the sentence, the mono line and the actions come in that order', () => {
    const unfolded = ReactElementTree.unfolded(
      <Callout
        tone="warn"
        dot={<ConditionDot condition="held" />}
        title="Example Mobile App"
        word="Launches held"
        sentence="The install version changed. Nothing launches until this forge is updated."
        machineLine="2 agents keep running through the update"
        actions={<Button label="Update forge" emphasis="primary" />}
      />,
    );
    const callout = ReactElementTree.onlyWithClass(unfolded, 'gaia-callout');
    expect([callout.tag, callout.props['data-tone'], callout.props['aria-label']]).toEqual(['section', 'warn', 'Example Mobile App: Launches held']);
    const title = ReactElementTree.onlyWithClass(unfolded, 'gaia-callout-title');
    expect(ReactElementTree.hostElementsIn([title]).map((element) => element.props['className']))
      .toEqual(['gaia-callout-title', 'gaia-condition-dot', 'gaia-callout-name', 'gaia-callout-word']);
    expect(ReactElementTree.textOf(unfolded)).toBe(
      'Example Mobile AppLaunches heldThe install version changed. Nothing launches until this forge is updated.2 agents keep running through the updateUpdate forge',
    );
  });

  test('the mono line and the actions are absent when not given', () => {
    const unfolded = ReactElementTree.unfolded(
      <Callout tone="neutral" dot={<ConditionDot condition="live" />} title="Research Wiki" word="Counts only" sentence="This forge is older than the monitor contract." />,
    );
    const optionalParts = ['gaia-callout-machine-line', 'gaia-callout-actions'];
    expect(ReactElementTree.hostElementsIn(unfolded, (element) => optionalParts.some((className) => ReactElementTree.hasClass(element, className)))).toEqual([]);
  });

  test('each tone has a rule of its own', () => {
    const stylesheetText = GaiaStylesheet.text();
    for (const tone of Object.keys(EVERY_TONE)) expect(GaiaStylesheet.stylesVariant(stylesheetText, 'gaia-callout', 'data-tone', tone)).toBe(true);
  });
});
