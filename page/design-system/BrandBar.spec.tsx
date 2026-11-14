/**
 * The brand bar. What matters: the mark and the wordmark are one link to Attention, named "Gaia, Attention" (SCREENS "The shell"), the
 * mark hidden; a running fleet's pill is the package's orange badge with a pulsing dot, a dormant one the neutral badge with a ring; the
 * sentence follows the pill; before Gaia knows the fleet there is neither; and the theme button is at the far end only when the bar is given
 * one, as B1's bar is not.
 */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree }           from '../testing/ReactElementTree.ts';
import { BrandBar, type BrandStatus } from './BrandBar.tsx';

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
    const pill = ReactElementTree.onlyWithClass(unfolded, 'design-system-state-badge');
    expect([pill.props['data-state-tone'], pill.props['data-pulsing'], ReactElementTree.textOf([pill])]).toEqual(['accent', '', '4 forges running']);
    expect(ReactElementTree.textOf([ReactElementTree.onlyWithClass(unfolded, 'gaia-brand-bar-sentence')])).toBe('1 holds its launches · 1 dormant');
  });

  test('a dormant fleet shows the neutral pill with a ring and no pulse', () => {
    const unfolded = ReactElementTree.unfolded(<BrandBar status={{ fleet: 'dormant', pillText: 'No forge running', sentence: '2 dormant' }} themeButton={null} />);
    const pill = ReactElementTree.onlyWithClass(unfolded, 'design-system-state-badge');
    expect([pill.props['data-state-tone'], pill.props['data-dot-shape'], pill.props['data-pulsing']]).toEqual(['neutral', 'ring', undefined]);
  });

  test('before Gaia knows the fleet the bar shows no pill and no sentence', () => {
    const unfolded = ReactElementTree.unfolded(<BrandBar status={null} themeButton={null} />);
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('design-system-state-badge'))).toEqual([]);
    expect(ReactElementTree.textOf([ReactElementTree.onlyWithClass(unfolded, 'gaia-brand-bar-sentence')])).toBe('');
  });

  test('the theme button ends the bar only when it is given one', () => {
    const withButton = ReactElementTree.unfolded(<BrandBar status={RUNNING} themeButton={{ choice: 'auto', onCycle: () => undefined }} />);
    const bar = ReactElementTree.onlyWithClass(withButton, 'gaia-brand-bar');
    const lastChild = bar.children.at(-1);
    expect(typeof lastChild === 'object' ? lastChild.props['aria-label'] : null).toBe('Theme: auto. Switch to light');
    const withoutButton = ReactElementTree.unfolded(<BrandBar status={RUNNING} themeButton={null} />);
    expect(ReactElementTree.hostElementsIn(withoutButton, ReactElementTree.withClass('design-system-icon-button'))).toEqual([]);
  });
});
