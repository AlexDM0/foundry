/**
 * The top bar. What matters: the view's title is the page's one heading; the status line shows only when the view gives one, led by its
 * dot when it has one and by the condition's word when it names one, so the dot is never the only sign; the view's buttons come before
 * the theme switch; and the switch shows the choice and hands a new one on.
 */
import { describe, expect, test } from 'bun:test';

import { Button }           from '../design-system/Button.tsx';
import { ReactElementTree } from '../testing/ReactElementTree.ts';
import type { ThemeChoice } from './ThemeBootstrap.ts';
import { TopBar }           from './TopBar.tsx';

const tree = ReactElementTree;

describe('the top bar', () => {
  test('the title is the one heading, and a bar without a status line shows none', () => {
    const unfolded = tree.unfolded(<TopBar title="Attention" status={null} actions={null} themeChoice="dark" onThemeChoice={() => undefined} />);
    expect(tree.textOf([tree.onlyWithTag(unfolded, 'h1')])).toBe('Attention');
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-top-bar-status'))).toEqual([]);
  });

  test('the status line is led by its dot', () => {
    const unfolded = tree.unfolded(
      <TopBar title="Attention" status={{ condition: 'live', text: '4 forges running' }} actions={null} themeChoice="dark" onThemeChoice={() => undefined} />,
    );
    const status = tree.onlyWithClass(unfolded, 'gaia-top-bar-status');
    expect(tree.textOf([status])).toBe('4 forges running');
    expect(tree.onlyWithClass([status], 'gaia-condition-dot').props['data-condition']).toBe('live');
  });

  test('a condition\'s word stands between the dot and the mono line, in its own face', () => {
    const unfolded = tree.unfolded(
      <TopBar
        title="Example Storefront"
        status={{ condition: 'live', word: 'Live', text: '4 / 5 agents' }}
        actions={null}
        themeChoice="dark"
        onThemeChoice={() => undefined}
      />,
    );
    const status = tree.onlyWithClass(unfolded, 'gaia-top-bar-status');
    expect(tree.textOf([status])).toBe('Live4 / 5 agents');
    expect(tree.textOf([tree.onlyWithClass([status], 'gaia-top-bar-status-word')])).toBe('Live');
  });

  test('the view\'s buttons come before the theme switch', () => {
    const unfolded = tree.unfolded(
      <TopBar title="Forges" status={null} actions={<Button label="Look again" />} themeChoice="auto" onThemeChoice={() => undefined} />,
    );
    const buttons = tree.hostElementsIn(unfolded, tree.withTag('button'));
    expect(buttons.map((button) => tree.textOf([button]))).toEqual(['Look again', 'Auto', 'Light', 'Dark']);
  });

  test('the theme switch is the group named Theme, shows the choice and hands a new one on', () => {
    const chosen: ThemeChoice[] = [];
    const unfolded = tree.unfolded(<TopBar title="Attention" status={null} actions={null} themeChoice="dark" onThemeChoice={(choice) => chosen.push(choice)} />);
    expect(tree.onlyWithClass(unfolded, 'gaia-segmented').props['aria-label']).toBe('Theme');
    const segments = tree.hostElementsIn(unfolded, tree.withClass('gaia-segment'));
    expect(segments.map((segment) => [tree.textOf([segment]), segment.props['aria-pressed']])).toEqual([['Auto', false], ['Light', false], ['Dark', true]]);
    const [auto] = segments;
    if (auto === undefined) throw new Error('The Auto segment is missing.');
    tree.dispatch(auto, 'onClick');
    expect(chosen).toEqual(['auto']);
  });
});
