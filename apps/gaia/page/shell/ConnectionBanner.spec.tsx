/**
 * The connection banner. What matters (SCREENS "The shell"): while Gaia's event stream is lost the banner says so in SCREENS' own words,
 * as an alert in the error tone; a page that cannot read the server's documents says that instead; a window whose session or server is gone
 * says that it must be opened again, naming no command; a live or connecting stream shows none.
 */
import { describe, expect, test } from 'bun:test';
import type { FleetStreamState }  from '../api/FleetStreamClient.ts';
import { Banner }                 from '../lib/design-system/DesignSystemInterface.ts';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { ConnectionBanner } from './ConnectionBanner.tsx';

const tree = ReactElementTree;

function bannerOf(streamState: FleetStreamState) {
  return tree.unfolded(<ConnectionBanner streamState={streamState} />);
}

/** The sentence Gaia hands the package's banner as its text. */
function sentenceOf(streamState: FleetStreamState): unknown {
  return tree.onlyOfComponent(bannerOf(streamState), Banner).props['text'];
}

describe('the connection banner', () => {
  test('a lost stream shows SCREENS\' sentence as an alert in the error tone', () => {
    const banner = tree.onlyOfComponent(bannerOf('lost'), Banner);
    expect([banner.props['role'], banner.props['tone']]).toEqual(['alert', 'error']);
    expect(banner.props['text']).toBe('Gaia\'s server could not be reached. Trying again.');
  });

  test('a page out of date with the server says that it is, and claims no retry', () => {
    const text = sentenceOf('page-out-of-date');
    expect(text).toBe('This page does not match Gaia\'s server, and reloading it did not help.');
    expect(text).not.toContain('Trying again');
  });

  test('a window the server no longer knows says so in Gaia\'s words, claims no retry, and names no command', () => {
    const text = sentenceOf('session-lost');
    expect(text).toBe('Gaia\'s server no longer knows this window, as after it restarted. Close this window and open Gaia again.');
    expect(text).not.toContain('Trying again');
    expect(text).not.toMatch(/`|gaia [a-z-]+ /);
  });

  test('a server that no longer answers says so in Gaia\'s words, that the window\'s session ended with it, claims no retry, and names no command', () => {
    const banner = tree.onlyOfComponent(bannerOf('server-ended'), Banner);
    const { text } = banner.props;
    expect([banner.props['role'], banner.props['tone']]).toEqual(['alert', 'error']);
    expect(text).toBe('Gaia\'s server no longer answers, and this window\'s session ended with it. Close this window and open Gaia again.');
    expect(text).not.toContain('Trying again');
    expect(text).not.toMatch(/`|gaia [a-z-]+ /);
  });

  test('a live or connecting stream shows no banner', () => {
    expect([bannerOf('live'), bannerOf('connecting')]).toEqual([[], []]);
  });
});
