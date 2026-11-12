/**
 * The meter. What matters: it is absent, not empty, when its whole is unknown; it fills the share of its whole and never past it; it is
 * full from the whole on, which turns it to the warn tone; it is an image named by its label; each tone has a rule of its own.
 */
import { describe, expect, test } from 'bun:test';

import { GaiaStylesheet }        from '../testing/GaiaStylesheet.ts';
import { ReactElementTree }      from '../testing/ReactElementTree.ts';
import { Meter, type MeterTone } from './Meter.tsx';

const EVERY_STYLED_TONE: Readonly<Record<Exclude<MeterTone, 'neutral'>, true>> = {
  builder:  true,
  reviewer: true,
  paused:   true,
  landed:   true,
};

function fillWidthOf(used: number, whole: number): unknown {
  const fill = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<Meter label="Calls" used={used} whole={whole} />), 'gaia-meter-fill');
  return (fill.props['style'] as { readonly width?: string } | undefined)?.width;
}

describe('the meter', () => {
  test('it is absent when its whole is unknown', () => {
    expect(ReactElementTree.unfolded(<Meter label="Calls 58" used={58} whole={null} />)).toEqual([]);
  });

  test('it is an image named by its label that fills the share of its whole', () => {
    const meter = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<Meter label="58 of 120 calls" used={58} whole={120} />), 'gaia-meter');
    expect([meter.props['role'], meter.props['aria-label'], meter.props['data-full']]).toEqual(['img', '58 of 120 calls', undefined]);
    expect(fillWidthOf(30, 120)).toBe('25%');
  });

  test('it is full at its whole and past it, and the fill never passes 100%', () => {
    const atTheWhole = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<Meter label="10 of 10 agents" used={10} whole={10} />), 'gaia-meter');
    expect(atTheWhole.props['data-full']).toBe('');
    expect([fillWidthOf(10, 10), fillWidthOf(14, 10), fillWidthOf(0, 0)]).toEqual(['100%', '100%', '100%']);
    expect(GaiaStylesheet.text()).toContain('.gaia-meter[data-full] .gaia-meter-fill');
  });

  test('the tone and the thickness are data attributes, and each tone and the thick meter have a rule', () => {
    const meter = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<Meter label="Agents" used={1} whole={4} tone="builder" thickness="thick" />), 'gaia-meter');
    expect([meter.props['data-tone'], meter.props['data-thickness']]).toEqual(['builder', 'thick']);
    const stylesheetText = GaiaStylesheet.text();
    expect(GaiaStylesheet.stylesVariant(stylesheetText, 'gaia-meter', 'data-thickness', 'thick')).toBe(true);
    for (const tone of Object.keys(EVERY_STYLED_TONE)) expect(GaiaStylesheet.stylesVariant(stylesheetText, 'gaia-meter', 'data-tone', tone)).toBe(true);
  });
});
