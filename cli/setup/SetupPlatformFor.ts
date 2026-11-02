import { POSIX_SETUP_PLATFORM }   from './PosixSetupPlatform.ts';
import { type SetupPlatform }     from './SetupPlatform.ts';
import { WINDOWS_SETUP_PLATFORM } from './WindowsSetupPlatform.ts';

export function setupPlatformFor(platform: NodeJS.Platform): SetupPlatform {
  return platform === 'win32' ? WINDOWS_SETUP_PLATFORM : POSIX_SETUP_PLATFORM;
}
