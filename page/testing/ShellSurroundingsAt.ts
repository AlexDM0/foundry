/**
 * Test-only: the browser around the shell, stood in for. The fragment and the stored theme choice are the spec's; nothing else answers or
 * keeps anything, and the page clock reads the moment the fixtures were drawn at and prints clock times in UTC, the fixtures' own zone.
 */
import type { ShellSurroundings } from '../shell/GaiaApp.tsx';
import type { PageClock }         from '../shell/PageClock.ts';
import { FLEET_FIXTURES_READ_AT } from './fixtures/fleet-five-forges.ts';

export function fixedPageClockAt(stamp: string): PageClock {
  const reading = Date.parse(stamp);
  return { now: () => reading, subscribe: () => () => undefined, timeZone: 'UTC' };
}

export function shellSurroundingsAt(fragment: string, storedThemeChoice: string | null = null): ShellSurroundings {
  return {
    hash:  { currentFragment: () => fragment, followFragment: () => () => undefined, goTo: () => undefined },
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
  };
}
