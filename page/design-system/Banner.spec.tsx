/** The banner. What matters: it is a status by default and an alert when asked, in the error tone, with its action at the end when given. */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { Banner }           from './Banner.tsx';
import { Button }           from './Button.tsx';

describe('the banner', () => {
  test('it is a status in the error tone, with no action unless given', () => {
    const unfolded = ReactElementTree.unfolded(<Banner text="Gaia's server could not be reached. Trying again." />);
    const banner = ReactElementTree.onlyWithClass(unfolded, 'gaia-banner');
    expect([banner.props['role'], banner.props['data-tone']]).toEqual(['status', 'error']);
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-banner-action'))).toEqual([]);
  });

  test('it is an alert when asked, and its action comes after its text', () => {
    const unfolded = ReactElementTree.unfolded(<Banner role="alert" text="Overseer unreachable: Invoice Service." action={<Button label="Look again" />} />);
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-banner').props['role']).toBe('alert');
    expect(ReactElementTree.textOf(unfolded)).toBe('Overseer unreachable: Invoice Service.Look again');
  });
});
