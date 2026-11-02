import { type Autostart, type AutostartPrimitives } from './Autostart.ts';
import { darwinAutostartOver }                      from './DarwinAutostart.ts';
import { linuxAutostartOver }                       from './LinuxAutostart.ts';
import { windowsAutostartOver }                     from './WindowsAutostart.ts';

/** Null on a platform with no adapter: no item is guessed there, since nothing would ever read it. */
export function autostartFor(platform: NodeJS.Platform, primitives: AutostartPrimitives): Autostart | null {
  if (platform === 'darwin') return darwinAutostartOver(primitives);
  if (platform === 'linux') return linuxAutostartOver(primitives);
  if (platform === 'win32') return windowsAutostartOver(primitives);
  return null;
}
