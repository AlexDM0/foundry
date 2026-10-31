import type { Opener } from './Opener.ts';

const MACOS_OPENER: Opener = Object.freeze({ argv: ['open'], detach: true });

const OTHER_OPENER: Opener = Object.freeze({ argv: ['xdg-open'], detach: true });

const MACOS_PLATFORM = 'darwin';

export function openerFor(platform: string): Opener {
  return platform === MACOS_PLATFORM ? MACOS_OPENER : OTHER_OPENER;
}
