/**
 * Test-only: the browser around the shell, stood in for. The fragment and the stored theme choice are the spec's; nothing else answers or
 * keeps anything, and a board drawn here never reads its first. The page clock reads the moment the fixtures were drawn at and prints
 * clock times in UTC, the fixtures' own zone.
 */
import type { BoardServices }         from '../board/@types/BoardServices.ts';
import { BOARD_TAB_VIEWS }            from '../board/shell/BoardTabViews.tsx';
import type { ShellSurroundings }     from '../shell/GaiaApp.tsx';
import type { PageClock }             from '../shell/PageClock.ts';
import type { CrashLogResult }        from '../views/forge/CrashLogRequest.ts';
import type { ForgeViewSurroundings } from '../views/forge/ForgeView.tsx';
import { FLEET_FIXTURES_READ_AT }     from './fixtures/fleet-five-forges.ts';

/** A spec that drives no crash log reads none: every log stays unread. */
function noCrashLog(): Promise<CrashLogResult> {
  return Promise.resolve({ verdict: 'not-read', status: null });
}

/** The board's services of a forge Gaia's relay never answers: nothing reads, streams or sends, so a board drawn here waits for its first. */
export function silentBoardServicesOf(trackerId: string): BoardServices {
  const closed = { close: () => undefined };
  return {
    trackerId,
    commandClient:       { send: () => Promise.resolve({ verdict: 'unreachable' }) },
    pictureUploadClient: { upload: () => Promise.resolve({ verdict: 'unreachable' }) },
    readBoard:           () => new Promise(() => undefined),
    openEventStream:     () => closed,
    followTranscript:    () => closed,
    followProfileLog:    () => () => undefined,
    storage:             () => ({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined }),
    now:                 () => new Date(FLEET_FIXTURES_READ_AT),
    questionNotifier:    {
      allowance:         () => 'default',
      askAllowance:      () => Promise.resolve('default'),
      notify:            () => undefined,
      setDocumentTitle:  () => undefined,
      baseDocumentTitle: 'Gaia',
    },
    goTo: () => undefined,
  };
}

export function fixedPageClockAt(stamp: string): PageClock {
  const reading = Date.parse(stamp);
  return {
    now: () => reading, subscribe: () => () => undefined, holdSecondTicks: () => () => undefined, timeZone: 'UTC'
  };
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
    forgeView:       forgeViewSurroundingsAt(),
  };
}

/** What a view's forge in place is handed when the spec drives no board: no crash log is read, and nothing is written or followed. */
export function forgeViewSurroundingsAt(): ForgeViewSurroundings {
  return {
    requestCrashLog: noCrashLog,
    boardServicesOf: silentBoardServicesOf,
    boardTabViews:   BOARD_TAB_VIEWS,
    openInNewTab:    () => undefined,
  };
}
