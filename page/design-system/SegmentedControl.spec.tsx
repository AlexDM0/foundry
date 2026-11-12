/**
 * The segmented control. What matters: the group is named; exactly the selected segment is pressed; a click hands that segment's value
 * on; a count follows its label; disabled turns every segment off; a trailing control sits on the same ground after the segments.
 */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { SegmentedControl } from './SegmentedControl.tsx';

type Theme = 'auto' | 'light' | 'dark';

const THEME_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

describe('the segmented control', () => {
  test('the group is named and only the selected segment is pressed', () => {
    const unfolded = ReactElementTree.unfolded(<SegmentedControl<Theme> label="Theme" options={THEME_OPTIONS} selected="dark" onSelect={() => undefined} />);
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-segmented').props['aria-label']).toBe('Theme');
    const segments = ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-segment'));
    expect(segments.map((segment) => [ReactElementTree.textOf([segment]), segment.props['aria-pressed']])).toEqual([['Auto', false], ['Light', false], ['Dark', true]]);
  });

  test('a click hands that segment\'s value on', () => {
    const chosen: Theme[] = [];
    const unfolded = ReactElementTree.unfolded(<SegmentedControl<Theme> label="Theme" options={THEME_OPTIONS} selected="dark" onSelect={(value) => chosen.push(value)} />);
    const [, light] = ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-segment'));
    if (light === undefined) throw new Error('The light segment is missing.');
    ReactElementTree.dispatch(light, 'onClick');
    expect(chosen).toEqual(['light']);
  });

  test('a count follows its label, and disabled turns every segment off', () => {
    const unfolded = ReactElementTree.unfolded(
      <SegmentedControl
        label="Role"
        options={[{ value: 'all', label: 'All', count: 10 }, { value: 'builders', label: 'Builders', count: 7 }]}
        selected="all"
        onSelect={() => undefined}
        disabled
      />,
    );
    const segments = ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-segment'));
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-segment-count')).map((count) => ReactElementTree.textOf([count]))).toEqual(['10', '7']);
    expect(segments.map((segment) => segment.props['disabled'])).toEqual([true, true]);
  });

  test('a trailing control follows the segments on the same ground, and a choice it holds presses no segment', () => {
    const unfolded = ReactElementTree.unfolded(
      <SegmentedControl
        label="Forge"
        options={[{ value: 'all', label: 'All forges' }, { value: 'example-storefront-7c41', label: 'Example Storefront' }]}
        selected="design-system-91c2"
        onSelect={() => undefined}
        trailing={<button type="button">2 more</button>}
      />,
    );
    const group = ReactElementTree.onlyWithClass(unfolded, 'gaia-segmented');
    expect(group.children.map((child) => (typeof child === 'string' ? child : ReactElementTree.textOf([child])))).toEqual(['All forges', 'Example Storefront', '2 more']);
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-segment')).map((segment) => segment.props['aria-pressed'])).toEqual([false, false]);
  });
});
