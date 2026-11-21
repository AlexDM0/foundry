/**
 * The part of a Bun workspace's `bun.lock` that one workspace member runs on: its own entry, and the entry of every package it reaches
 * through its dependencies, the workspace packages among them, so a dependency another member adds leaves it unchanged.
 */
import { JsonRecordUtil } from '../../lib/json-record/JsonRecordUtil.ts';

export interface LockfileDependencyGraph {
  /** The workspace folders reached, relative to the workspace root, the member's own first. */
  readonly workspaceFolders: readonly string[];
  /** Each reached entry by its lockfile key, a workspace's under `workspace:<folder>`. */
  readonly entries:          Readonly<Record<string, unknown>>;
}

const DEPENDENCY_KINDS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const;
const WORKSPACE_RESOLUTION_MARKER = '@workspace:';
const WORKSPACE_ENTRY_KEY_PREFIX = 'workspace:';
const PACKAGE_DETAILS_POSITION = 2;

interface PendingDependencies {
  readonly dependencyNames: readonly string[];
  /** The lockfile key whose nested entries are looked up first, as Node looks in a package's own `node_modules` first. */
  readonly scopeKey:        string | undefined;
}

function dependencyNamesOf(details: unknown): string[] {
  const detailsRecord = JsonRecordUtil.recordOf(details);
  if (detailsRecord === undefined) return [];
  return DEPENDENCY_KINDS.flatMap((dependencyKind) => Object.keys(JsonRecordUtil.recordOf(detailsRecord[dependencyKind]) ?? {}));
}

/** A package entry is `[resolution, registry, details, integrity]`; a workspace package resolves as `<name>@workspace:<folder>`. */
function workspaceFolderOf(packageEntry: unknown): string | undefined {
  if (!Array.isArray(packageEntry)) return undefined;
  const resolution: unknown = packageEntry[0];
  if (typeof resolution !== 'string') return undefined;
  const markerIndex = resolution.indexOf(WORKSPACE_RESOLUTION_MARKER);
  return markerIndex < 0 ? undefined : resolution.slice(markerIndex + WORKSPACE_RESOLUTION_MARKER.length);
}

function parsedLockfileOf(lockfileText: string): Record<string, unknown> | undefined {
  try {
    return JsonRecordUtil.recordOf(Bun.JSONC.parse(lockfileText));
  } catch {
    return undefined;
  }
}

/** The graph of `memberFolder` (relative to the workspace root, `''` for the root itself); empty when the lockfile cannot be read. */
export function lockfileDependencyGraphOf(lockfileText: string, memberFolder: string): LockfileDependencyGraph {
  const lockfile   = parsedLockfileOf(lockfileText);
  const workspaces = JsonRecordUtil.recordOf(lockfile?.['workspaces']) ?? {};
  const packages   = JsonRecordUtil.recordOf(lockfile?.['packages']) ?? {};
  const workspaceFolders: string[] = [];
  const entries: Record<string, unknown> = {};
  const scopeKeyOfPackageKey = new Map<string, string | undefined>();
  const pending: PendingDependencies[] = [];

  const visitWorkspace = (folder: string): void => {
    const entryKey = `${WORKSPACE_ENTRY_KEY_PREFIX}${folder}`;
    if (Object.hasOwn(entries, entryKey) || !Object.hasOwn(workspaces, folder)) return;
    const workspaceEntry = workspaces[folder];
    entries[entryKey] = workspaceEntry;
    workspaceFolders.push(folder);
    const workspaceName = JsonRecordUtil.recordOf(workspaceEntry)?.['name'];
    pending.push({ dependencyNames: dependencyNamesOf(workspaceEntry), scopeKey: typeof workspaceName === 'string' ? workspaceName : undefined });
  };

  const resolvedKeyOf = (dependencyName: string, scopeKey: string | undefined): string | undefined => {
    for (let scope = scopeKey; scope !== undefined; scope = scopeKeyOfPackageKey.get(scope)) {
      const nestedKey = `${scope}/${dependencyName}`;
      if (Object.hasOwn(packages, nestedKey)) {
        if (!scopeKeyOfPackageKey.has(nestedKey)) scopeKeyOfPackageKey.set(nestedKey, scope);
        return nestedKey;
      }
    }
    return Object.hasOwn(packages, dependencyName) ? dependencyName : undefined;
  };

  visitWorkspace(memberFolder);
  for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
    for (const dependencyName of next.dependencyNames) {
      const packageKey = resolvedKeyOf(dependencyName, next.scopeKey);
      if (packageKey === undefined || Object.hasOwn(entries, packageKey)) continue;
      const packageEntry = packages[packageKey];
      entries[packageKey] = packageEntry;
      const workspaceFolder = workspaceFolderOf(packageEntry);
      if (workspaceFolder !== undefined) visitWorkspace(workspaceFolder);
      else if (Array.isArray(packageEntry)) pending.push({ dependencyNames: dependencyNamesOf(packageEntry[PACKAGE_DETAILS_POSITION]), scopeKey: packageKey });
    }
  }
  return { workspaceFolders, entries };
}
