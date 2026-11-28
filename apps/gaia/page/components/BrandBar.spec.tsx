/**
 * The brand bar: the mark and the wordmark are one link named "Gaia, Attention"; the fleet's pill is the orange pulsing badge while a forge runs
 * and the neutral ringed one when dormant, followed by its sentence, and neither shows before Gaia knows the fleet; the theme button, only when
 * given, names the current and next choice and hands the next on; Gaia's update button, only when given, stands before it with its note.
 */
import { describe, expect, test }               from 'bun:test';
import { Button, StateBadge, ThemeCycleButton } from '../lib/design-system/DesignSystemInterface.ts';

import { ReactElementTree }                              from '../testing/ReactElementTree.ts';
import { BrandBar, type BrandStatus, themeButtonNameOf } from './BrandBar.tsx';

const RUNNING: BrandStatus = { fleet: 'running', pillText: '4 forges running', sentence: '1 holds its launches · 1 dormant' };

describe('the brand bar', () => {
  test('the mark and the wordmark are one link to Attention, named Gaia, Attention', () => {
    const unfolded = ReactElementTree.unfolded(<BrandBar status={RUNNING} themeButton={null} />);
    const home = ReactElementTree.onlyWithClass(unfolded, 'gaia-brand-bar-home');
    expect([home.tag, home.props['href'], home.props['aria-label'], ReactElementTree.textOf([home])]).toEqual(['a', '#attention', 'Gaia, Attention', 'gaia']);
    expect(ReactElementTree.onlyWithTag([home], 'svg').props['aria-hidden']).toBe('true');
  });

  test('a running fleet shows the orange pill with a pulsing dot, then its sentence', () => {
    const unfolded = ReactElementTree.unfolded(<BrandBar status={RUNNING} themeButton={null} />);
    const pill = ReactElementTree.onlyOfComponent(unfolded, StateBadge);
    expect([pill.props['tone'], pill.props['pulsing'], pill.props['label']]).toEqual(['accent', true, '4 forges running']);
    const sentence = ReactElementTree.onlyWithClass(unfolded, 'gaia-brand-bar-sentence');
    expect(ReactElementTree.textOf([sentence])).toBe('1 holds its launches · 1 dormant');
    const parts = ReactElementTree.hostElementsIn(unfolded, (element) => element === pill || element === sentence);
    expect(parts).toEqual([pill, sentence]);
  });

  test('a dormant fleet shows the neutral pill with a ring and no pulse', () => {
    const unfolded = ReactElementTree.unfolded(<BrandBar status={{ fleet: 'dormant', pillText: 'No forge running', sentence: '2 dormant' }} themeButton={null} />);
    const pill = ReactElementTree.onlyOfComponent(unfolded, StateBadge);
    expect([pill.props['tone'], pill.props['dotShape'], pill.props['pulsing'], pill.props['label']]).toEqual(['neutral', 'ring', undefined, 'No forge running']);
  });

  test('before Gaia knows the fleet the bar shows no pill and no sentence', () => {
    const unfolded = ReactElementTree.unfolded(<BrandBar status={null} themeButton={null} />);
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withComponent(StateBadge))).toEqual([]);
    expect(ReactElementTree.textOf([ReactElementTree.onlyWithClass(unfolded, 'gaia-brand-bar-sentence')])).toBe('');
  });

  test('the theme button ends the bar only when it is given one', () => {
    const withButton = ReactElementTree.unfolded(<BrandBar status={RUNNING} themeButton={{ choice: 'auto', onCycle: () => undefined }} />);
    const bar = ReactElementTree.onlyWithClass(withButton, 'gaia-brand-bar');
    const lastChild = bar.children.at(-1);
    expect(typeof lastChild === 'object' ? [lastChild.tag, lastChild.props['accessibleName']] : null).toEqual(['ThemeCycleButton', 'Theme: auto. Switch to light']);
    const withoutButton = ReactElementTree.unfolded(<BrandBar status={RUNNING} themeButton={null} />);
    expect(ReactElementTree.hostElementsIn(withoutButton, ReactElementTree.withComponent(ThemeCycleButton))).toEqual([]);
  });

  test('the theme button\'s name says the current choice and the next, and the next choice it hands on reaches the bar\'s handler', () => {
    expect((['auto', 'light', 'dark'] as const).map(themeButtonNameOf)).toEqual([
      'Theme: auto. Switch to light',
      'Theme: light. Switch to dark',
      'Theme: dark. Switch to auto',
    ]);
    const cycled: string[] = [];
    const unfolded = ReactElementTree.unfolded(<BrandBar status={null} themeButton={{ choice: 'dark', onCycle: (next) => cycled.push(next) }} />);
    const button = ReactElementTree.onlyOfComponent(unfolded, ThemeCycleButton);
    expect([button.props['choice'], button.props['accessibleName']]).toEqual(['dark', 'Theme: dark. Switch to auto']);
    ReactElementTree.dispatch(button, 'onCycle', 'auto');
    expect(cycled).toEqual(['auto']);
  });

  test('Gaia\'s update button and its note stand before the theme button, and a press reaches the bar\'s handler', () => {
    let presses = 0;
    const updateButton = {
      label:    'Update Gaia',
      emphasis: 'primary',
      disabled: false,
      onPress:  () => {
        presses += 1;
      },
      note: '3 new commits on main'
    } as const;
    const unfolded = ReactElementTree.unfolded(<BrandBar status={RUNNING} themeButton={{ choice: 'auto', onCycle: () => undefined }} updateButton={updateButton} />);
    const button = ReactElementTree.onlyOfComponent(unfolded, Button);
    expect([button.props['label'], button.props['emphasis'], button.props['disabled']]).toEqual(['Update Gaia', 'primary', false]);
    const note = ReactElementTree.onlyWithClass(unfolded, 'gaia-brand-bar-update-note');
    expect(ReactElementTree.textOf([note])).toBe('3 new commits on main');
    const theme = ReactElementTree.onlyOfComponent(unfolded, ThemeCycleButton);
    expect(ReactElementTree.hostElementsIn(unfolded, (element) => element === note || element === button || element === theme)).toEqual([note, button, theme]);
    ReactElementTree.dispatch(button, 'onPress');
    expect(presses).toBe(1);
  });

  test('without an update button the bar draws no button and no note', () => {
    const unfolded = ReactElementTree.unfolded(<BrandBar status={RUNNING} themeButton={null} />);
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withComponent(Button))).toEqual([]);
    expect(ReactElementTree.hostElementsIn(unfolded, (element) => element.props['className'] === 'gaia-brand-bar-update-note')).toEqual([]);
  });
});
