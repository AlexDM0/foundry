/**
 * The addresses and arguments of a launch: the splash's address and the step it shows, Gaia's page with a window's session code, the
 * browser's arguments for an app window on Gaia's own profile, the dialog's arguments, and which listed window shows the splash.
 */
import { pathToFileURL } from 'node:url';

import type { ForgeCounts } from '../../../adapters/gaia-server/HealthDocument.ts';
import type { ThemeChoice } from '../../../shared/@types/GaiaSettings.ts';
import { PRODUCT_NAMES }    from '../../../shared/constants/ProductNames.ts';
import type { PageTarget }  from '../BrowserWindowWatch.ts';

/** `starting`: the server is starting. `looking`: it answers, and its forges are being looked for. `opening`: Attention opens next. */
export type SplashStep = 'starting' | 'looking' | 'opening';

/** The size of every artboard: Gaia's window opens at it. */
const WINDOW_SIZE = '1440,1016';

/** `osascript` at its place on every Mac, since a Finder launch has a bare `PATH`. */
const DIALOG_PROGRAM = '/usr/bin/osascript';

function addressOfPort(port: number): string {
  return `127.0.0.1:${port}`;
}

/** The splash as the launcher opens it: Gaia's address to show and the theme to paint in, in the query; no step yet. */
function splashAddressOf(splashPagePath: string, port: number, theme: ThemeChoice): string {
  const splashAddress = pathToFileURL(splashPagePath);
  splashAddress.search = new URLSearchParams({ address: addressOfPort(port), theme }).toString();
  return splashAddress.href;
}

/** The splash at a step, in its fragment, so the move is within the page; forge counts that Gaia did not report are left out. */
function splashStepAddressOf(splashAddress: string, step: SplashStep, forgeCounts: ForgeCounts | null): string {
  const fragment = new URLSearchParams({ step });
  if (forgeCounts !== null) {
    fragment.set('answered', String(forgeCounts.forgesAnswered));
    fragment.set('registered', String(forgeCounts.forgesRegistered));
  }
  const stepAddress = new URL(splashAddress);
  stepAddress.hash = fragment.toString();
  return stepAddress.href;
}

/** The page reads the code from the fragment, clears it and spends it for its session (PLAN 8.1). */
function pageAddressOf(port: number, sessionCode: string): string {
  return `http://${addressOfPort(port)}/#session=${sessionCode}`;
}

/** PLAN 9.2: an app window on Gaia's own profile, whose windows the debugging port reports. */
function browserArgumentsOf(startAddress: string, profileFolder: string): readonly string[] {
  return [
    `--app=${startAddress}`,
    `--user-data-dir=${profileFolder}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--window-size=${WINDOW_SIZE}`,
    '--remote-debugging-port=0',
  ];
}

/** The message travels as an argument, never inside the script, so no text of it is read as AppleScript. */
function dialogRunOf(message: string): { readonly program: string; readonly programArguments: readonly string[] } {
  return {
    program:          DIALOG_PROGRAM,
    programArguments: ['-e', 'on run argv', '-e', 'display alert (item 1 of argv) message (item 2 of argv) as critical', '-e', 'end run', PRODUCT_NAMES.applicationName, message],
  };
}

function addressWithoutQueryOrFragment(address: string): string {
  if (!URL.canParse(address)) return address;
  const parsed = new URL(address);
  return `${parsed.origin === 'null' ? parsed.protocol : parsed.origin}${parsed.pathname}`;
}

/**
 * The window that shows the splash: the page target at the splash's file. A profile that lists one window only, as a browser that
 * reports the address otherwise does, shows the splash in that one; more windows and none at the splash is none.
 */
function splashTargetAmong(pageTargets: readonly PageTarget[], splashAddress: string): PageTarget | null {
  const splashFile = addressWithoutQueryOrFragment(splashAddress);
  const atSplash   = pageTargets.find((pageTarget) => addressWithoutQueryOrFragment(pageTarget.url) === splashFile);
  if (atSplash !== undefined) return atSplash;
  const [onlyTarget, ...otherTargets] = pageTargets;
  return onlyTarget !== undefined && otherTargets.length === 0 ? onlyTarget : null;
}

export const LaunchAddressUtil = {
  splashAddressOf,
  splashStepAddressOf,
  pageAddressOf,
  browserArgumentsOf,
  dialogRunOf,
  splashTargetAmong,
} as const;
