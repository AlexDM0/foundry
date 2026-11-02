import { win32 } from 'node:path';

import type { Opener } from './Opener.ts';

const MACOS_OPENER: Opener = Object.freeze({ argv: ['open'], detach: true });

const OTHER_OPENER: Opener = Object.freeze({ argv: ['xdg-open'], detach: true });

const MACOS_PLATFORM = 'darwin';
const WINDOWS_PLATFORM = 'win32';

/** Hands the URL to the protocol handler as one argument, so no shell parses an `&` in it. */
const WINDOWS_PROTOCOL_HANDLER_ARGUMENT = 'url.dll,FileProtocolHandler';
const WINDOWS_PROTOCOL_HANDLER_PROGRAM = 'rundll32.exe';

/** `systemFolder` is read only on Windows, where the program sits there by absolute path and is never searched for. */
export function openerFor(platform: string, systemFolder: () => string): Opener {
  if (platform === MACOS_PLATFORM) return MACOS_OPENER;
  if (platform === WINDOWS_PLATFORM) {
    return Object.freeze({
      argv:   [win32.join(systemFolder(), WINDOWS_PROTOCOL_HANDLER_PROGRAM), WINDOWS_PROTOCOL_HANDLER_ARGUMENT],
      detach: true,
    });
  }
  return OTHER_OPENER;
}
