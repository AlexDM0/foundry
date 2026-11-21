/**
 * Which stored cache folders a gate and install line may write: never one that is, sits in or holds a folder of executables, and never one
 * that is, sits in or holds a folder on Hephaestus's `PATH`, so a branch's scripts cannot replace an executable Hephaestus later starts.
 */
import { existsSync, readdirSync, realpathSync } from 'node:fs';

import type { DataFolders }                from '../../lib/data-folders/DataFolders.ts';
import { PathNestingUtil, type PathStyle } from '../../shared/utils/PathNestingUtil.ts';

export type CacheFolderRefusal = 'executables-folder' | 'search-path-folder';

/** What the host's `DataFolders` says about paths and executables; a spec passes another OS's. */
export type CacheFolderStyle = PathStyle & Pick<DataFolders, 'executableFolderNames' | 'executableFileExtensions'>;

/** A folder the process may see but not walk, such as macOS's `/home` under a sandbox, stays as written. */
function realPathOf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** Symlinks resolved, so `/var` reads as `/private/var`; a path not there yet resolves through its nearest folder. */
function resolvedPathOf(style: CacheFolderStyle, path: string): string {
  if (existsSync(path)) return realPathOf(path);
  const parent = style.pathModule.dirname(path);
  return parent === path ? path : style.pathModule.join(resolvedPathOf(style, parent), style.pathModule.basename(path));
}

function isExecutableFolderName(style: CacheFolderStyle, name: string): boolean {
  return style.executableFolderNames.some((folderName) => PathNestingUtil.namesMatch(style, name, folderName));
}

function isExecutableFileName(style: CacheFolderStyle, name: string): boolean {
  const extension = style.pathModule.extname(name);
  return style.executableFileExtensions.some((executableExtension) => PathNestingUtil.namesMatch(style, extension, executableExtension));
}

function entryNamesOf(folder: string): string[] {
  try {
    return readdirSync(folder);
  } catch {
    return [];
  }
}

function isExecutablesFolder(style: CacheFolderStyle, paths: readonly string[]): boolean {
  if (paths.some((path) => PathNestingUtil.segmentsOf(style, path).some((segment) => isExecutableFolderName(style, segment)))) return true;
  return paths.some((path) => entryNamesOf(path).some((name) => isExecutableFolderName(style, name) || isExecutableFileName(style, name)));
}

function refusalOf(storedPath: string, homeDirectory: string, executableSearchPath: readonly string[], style: CacheFolderStyle): CacheFolderRefusal | null {
  const absolutePath = PathNestingUtil.absolutePathOfWirePath(style, storedPath, homeDirectory);
  // Absolute only on another OS: nothing here to judge, and `writableCachePathsOf` drops it.
  if (!style.pathModule.isAbsolute(absolutePath)) return null;
  const path = resolvedPathOf(style, absolutePath);
  if (isExecutablesFolder(style, [absolutePath, path])) return 'executables-folder';
  const searchFolders = executableSearchPath.filter((folder) => style.pathModule.isAbsolute(folder)).map((folder) => resolvedPathOf(style, folder));
  return searchFolders.some((folder) => PathNestingUtil.nestsWith(style, path, folder)) ? 'search-path-folder' : null;
}

/**
 * The stored paths resolved, those refused now dropped: a folder may have gained executables or joined `PATH` since it was stored, and a
 * folder absolute only on another OS means nothing here.
 */
function writableCachePathsOf(storedPaths: readonly string[], homeDirectory: string, executableSearchPath: readonly string[], style: CacheFolderStyle): string[] {
  return storedPaths
    .filter((storedPath) => PathNestingUtil.wirePathIsWellFormed(storedPath))
    .filter((storedPath) => style.pathModule.isAbsolute(PathNestingUtil.absolutePathOfWirePath(style, storedPath, homeDirectory)))
    .filter((storedPath) => refusalOf(storedPath, homeDirectory, executableSearchPath, style) === null)
    .map((storedPath) => resolvedPathOf(style, PathNestingUtil.absolutePathOfWirePath(style, storedPath, homeDirectory)));
}

export const GateCachePaths = Object.freeze({
  refusalOf,
  writableCachePathsOf,
});
