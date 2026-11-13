/**
 * Test-only: the browser around the shell, stood in for. The fragment and the stored theme choice are the spec's; nothing else answers or
 * keeps anything, and a frame session asked for fails the spec. The page clock reads the moment the fixtures were drawn at and prints
 * clock times in UTC, the fixtures' own zone.
 */
import type { ShellSurroundings }      from '../shell/GaiaApp.tsx';
import type { PageClock }              from '../shell/PageClock.ts';
import type { ForgeFrameSurroundings } from '../views/forge-frame/ForgeFrameView.tsx';
import { FLEET_FIXTURES_READ_AT }      from './fixtures/fleet-five-forges.ts';

function noFrameSession(): never {
  throw new Error('These surroundings answer no frame session: a spec that opens one hands its own answers.');
}

export function fixedPageClockAt(stamp: string): PageClock {
  const reading = Date.parse(stamp);
  return { now: () => reading, subscribe: () => () => undefined, timeZone: 'UTC' };
}

export function shellSurroundingsAt(fragment: string, storedThemeChoice: string | null = null): ShellSurroundings {
  return {
    hash: {
      currentFragment: () => fragment, followFragment: () => () => undefined, goTo: () => undefined, replaceFragment: () => undefined,
    },
    theme: {
      setRootAttribute:   () => undefined,
      readStoredChoice:   () => storedThemeChoice,
      storeChoice:        () => undefined,
      systemPrefersDark:  () => false,
      followSystemScheme: () => () => undefined,
    },
    setWindowTitle:  () => undefined,
    markMotionReady: () => undefined,
    clock:           fixedPageClockAt(FLEET_FIXTURES_READ_AT),
    forgeFrame:      { requestFrameSession: noFrameSession, embed: { followMessages: () => () => undefined } },
  };
}

/** What a view's forge in place is handed when the spec drives no frame: no session answers, and nothing is written or followed. */
export function forgeFrameSurroundingsAt(leaveFragment = '#attention'): ForgeFrameSurroundings {
  return {
    requestFrameSession: noFrameSession,
    embed:               { followMessages: () => () => undefined },
    replaceFragment:     () => undefined,
    goTo:                () => undefined,
    leaveFragment,
    themeChoice:         'auto',
  };
}
