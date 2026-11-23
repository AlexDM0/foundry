/**
 * The embers. What matters: ember n starts 1050 × n ms after the rise starts and rises on a 4200 ms cycle along its formulas
 * (side +1 for embers 0 and 2, -1 for 1 and 3); its opacity fades in until p is 0.15, then is 1 - p, times the fade; and fading embers
 * lose their opacity at the waking rate of 7 per second.
 */
import { describe, expect, test } from 'bun:test';

import { emberFadeAt, embersOf } from './Embers.ts';

describe('the rise', () => {
  test('four embers, each showing only from its own start', () => {
    expect(embersOf(1000, 1, 1000).map((ember) => ember.opacity)).toEqual([0, 0, 0, 0]);
    expect(embersOf(1000, 1, 1000 + 1051).map((ember) => ember.opacity > 0)).toEqual([true, true, false, false]);
    expect(embersOf(1000, 1, 1000 + 3151).map((ember) => ember.opacity > 0)).toEqual([true, true, true, true]);
  });

  test('an ember follows its formulas on its own side', () => {
    const [first, second] = embersOf(0, 1, 2100);
    expect(first?.x).toBeCloseTo(4 + 7, 9);
    expect(first?.y).toBeCloseTo(-44 - 15, 9);
    expect(first?.turnDegrees).toBeCloseTo(45 + 60, 9);
    expect(first?.opacity).toBeCloseTo(0.5, 9);
    expect(second?.x).toBeCloseTo(-(4 + 2) - (7 * Math.sin(Math.PI / 4)), 9);
    expect(second?.turnDegrees).toBeCloseTo(45 - 30, 9);
    expect(second?.opacity).toBeCloseTo(0.75, 9);
  });

  test('an ember fades in over the first 15% of its cycle', () => {
    expect(embersOf(0, 1, 315)[0]?.opacity).toBeCloseTo(0.5, 9);
  });

  test('the rise repeats each 4200 ms', () => {
    expect(embersOf(0, 1, 3500 + 4200)).toEqual(embersOf(0, 1, 3500));
  });

  test('the fade multiplies the opacity', () => {
    expect(embersOf(0, 0.5, 2100)[0]?.opacity).toBeCloseTo(0.25, 9);
  });
});

describe('the fade', () => {
  test('fading embers lose their opacity at the waking rate', () => {
    const fading = { risingSinceMilliseconds: 0, fadingSinceMilliseconds: 5000 };
    expect(emberFadeAt(fading, 5000)).toBe(1);
    expect(emberFadeAt(fading, 5100)).toBeCloseTo(Math.exp(-0.7), 9);
  });
});
