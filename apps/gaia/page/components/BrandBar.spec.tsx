/**
 * The brand bar: the home link is one link named "Gaia, Attention"; the fleet's pill is the orange pulsing badge while a forge runs and the
 * neutral ringed one when dormant, then its sentence, neither before Gaia knows the fleet; the update button with its note, the theme
 * button and Gaia's menu with Reboot Gaia show only when given, in that order, and hand their presses on.
 */
import { describe, expect, test } from 'bun:test';
import {
  Menu,
  MenuItem,
  StateBadge,
  StatusButton,
  ThemeCycleButton
} from '../lib/design-system/DesignSystemInterface.ts';

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

  test('Gaia\'s update button and its note stand before the theme button, the menu after it, and a press reaches the bar\'s handler', () => {
    let presses = 0;
    const updateButton = {
      label:          'Update Gaia',
      glyph:          'fetch',
      emphasis:       'primary',
      busy:           false,
      disabled:       false,
      count:          '3',
      accessibleName: 'Update Gaia, 3 new commits on main',
      onPress:        () => {
        presses += 1;
      },
      note:          'Gaia could not reach its origin.',
      noteIsFailure: true,
    } as const;
    const menu = { rebootIsOff: false, rebootTitle: null, onReboot: () => undefined };
    const unfolded = ReactElementTree.unfolded(
      <BrandBar status={RUNNING} themeButton={{ choice: 'auto', onCycle: () => undefined }} updateButton={updateButton} menu={menu} />,
    );
    const button = ReactElementTree.onlyOfComponent(unfolded, StatusButton);
    expect([button.props['label'], button.props['glyph'], button.props['emphasis'], button.props['count'], button.props['accessibleName']])
      .toEqual(['Update Gaia', 'fetch', 'primary', '3', 'Update Gaia, 3 new commits on main']);
    const note = ReactElementTree.onlyWithClass(unfolded, 'gaia-brand-bar-update-note');
    expect([ReactElementTree.textOf([note]), note.props['data-failure']]).toEqual(['Gaia could not reach its origin.', '']);
    const theme = ReactElementTree.onlyOfComponent(unfolded, ThemeCycleButton);
    const gaiaMenu = ReactElementTree.onlyOfComponent(unfolded, Menu);
    expect(ReactElementTree.hostElementsIn(unfolded, (element) => [note, button, theme, gaiaMenu].includes(element))).toEqual([note, button, theme, gaiaMenu]);
    ReactElementTree.dispatch(button, 'onPress');
    expect(presses).toBe(1);
  });

  test('the menu holds Reboot Gaia, off with its reason when Gaia cannot reopen itself, and a choice reaches the bar\'s handler', () => {
    let reboots = 0;
    const unfolded = ReactElementTree.unfolded(<BrandBar status={RUNNING} themeButton={null} menu={{
      rebootIsOff: true,
      rebootTitle: 'An example reason',
      onReboot:    () => {
        reboots += 1;
      },
    }} />);
    const gaiaMenu = ReactElementTree.onlyOfComponent(unfolded, Menu);
    expect([gaiaMenu.props['triggerName'], gaiaMenu.props['align'], gaiaMenu.props['trigger']]).toEqual(['Gaia menu', 'end', 'icon']);
    const reboot = ReactElementTree.onlyOfComponent(unfolded, MenuItem);
    expect([reboot.props['label'], reboot.props['disabled'], reboot.props['title']]).toEqual(['Reboot Gaia', true, 'An example reason']);
    ReactElementTree.dispatch(reboot, 'onChoose');
    expect(reboots).toBe(1);
  });

  test('without an update button or a menu the bar draws neither, and no note', () => {
    const unfolded = ReactElementTree.unfolded(<BrandBar status={RUNNING} themeButton={null} />);
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withComponent(StatusButton))).toEqual([]);
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withComponent(Menu))).toEqual([]);
    expect(ReactElementTree.hostElementsIn(unfolded, (element) => element.props['className'] === 'gaia-brand-bar-update-note')).toEqual([]);
  });
});
