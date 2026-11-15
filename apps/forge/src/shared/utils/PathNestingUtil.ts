/**
 * Path questions answered under a path module and a case rule the caller passes, never the host's own, so a spec on one OS decides for
 * another. A wire path is a path as the board stores it, read by one rule on every host.
 */
import { type posix, win32 } from 'node:path';

export interface PathStyle {
  readonly pathModule: typeof posix;
  readonly foldsCase:  boolean;
}

const HOME_PREFIXES = ['~/', '~\\'] as const;
const PARENT_SEGMENT = '..';
const WIRE_SEPARATOR = '/';
const WINDOWS_SEPARATOR = '\\';
const EITHER_SEPARATOR = /[\\/]/;
const WINDOWS_DRIVE_PREFIX = /^[a-z]:/i;

function comparableOf(style: PathStyle, path: string): string {
  return style.foldsCase ? path.toLowerCase() : path;
}

function namesMatch(style: PathStyle, first: string, second: string): boolean {
  return comparableOf(style, first) === comparableOf(style, second);
}

/** The segments of a path, split on every separator the path module reads. */
function segmentsOf(style: PathStyle, path: string): string[] {
  return path.split(style.pathModule.sep === WINDOWS_SEPARATOR ? EITHER_SEPARATOR : WIRE_SEPARATOR);
}

/** True when `path` is `folder` or lies under it; both absolute. */
function isInside(style: PathStyle, path: string, folder: string): boolean {
  const { pathModule } = style;
  const relative = pathModule.relative(comparableOf(style, folder), comparableOf(style, path));
  if (relative === '') return true;
  return !pathModule.isAbsolute(relative) && segmentsOf(style, relative)[0] !== PARENT_SEGMENT;
}

function nestsWith(style: PathStyle, first: string, second: string): boolean {
  return isInside(style, first, second) || isInside(style, second, first);
}

/** A stored folder is home-relative or absolute on some host: `/`, `~/`, `~\`, a drive or a share. */
function wirePathIsWellFormed(wirePath: string): boolean {
  return HOME_PREFIXES.some((prefix) => wirePath.startsWith(prefix)) || win32.isAbsolute(wirePath);
}

function absolutePathOfWirePath(style: PathStyle, wirePath: string, homeDirectory: string): string {
  const prefix = HOME_PREFIXES.find((candidate) => wirePath.startsWith(candidate));
  return prefix === undefined ? wirePath : style.pathModule.join(homeDirectory, wirePath.slice(prefix.length));
}

/** A stored relative path stays under its root on every host: `/`-separated, no backslash, no root or drive, no `..` segment. */
function relativeWirePathStaysInside(wirePath: string): boolean {
  if (wirePath.includes(WINDOWS_SEPARATOR) || win32.isAbsolute(wirePath) || WINDOWS_DRIVE_PREFIX.test(wirePath)) return false;
  return !wirePath.split(WIRE_SEPARATOR).includes(PARENT_SEGMENT);
}

export const PathNestingUtil = Object.freeze({
  namesMatch,
  segmentsOf,
  isInside,
  nestsWith,
  wirePathIsWellFormed,
  absolutePathOfWirePath,
  relativeWirePathStaysInside,
});
