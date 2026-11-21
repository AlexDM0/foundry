/**
 * The spacing props turned into inline style. What matters: each side takes its most specific prop (side over axis over all), every
 * value is the spacing token of its step, only the four longhands are set so no shorthand fights a side, and an unset prop sets nothing.
 */
import { describe, expect, test } from 'bun:test';

import { SpacingStyleUtil } from './SpacingStyleUtil.ts';

describe('the spacing style', () => {
  test('a side prop wins over its axis, and an axis over the all-sides prop', () => {
    expect(SpacingStyleUtil.paddingStyleOf({ padding: 'four', paddingHorizontal: 'eight', paddingLeft: 'fourteen' })).toEqual({
      paddingTop:    'var(--space-4)',
      paddingBottom: 'var(--space-4)',
      paddingLeft:   'var(--space-14)',
      paddingRight:  'var(--space-8)',
    });
    expect(SpacingStyleUtil.marginStyleOf({ marginVertical: 'six', marginBottom: 'none' })).toEqual({ marginTop: 'var(--space-6)', marginBottom: 'var(--space-0)' });
  });

  test('an unset prop sets nothing, and the gap is set only when asked', () => {
    expect([SpacingStyleUtil.paddingStyleOf({}), SpacingStyleUtil.marginStyleOf({}), SpacingStyleUtil.gapStyleOf(undefined)]).toEqual([{}, {}, {}]);
    expect(SpacingStyleUtil.gapStyleOf('twentyEight')).toEqual({ gap: 'var(--space-28)' });
  });
});
