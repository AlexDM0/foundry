/**
 * In a Bun workspace the program's `bin` is linked into the root `node_modules/.bin`, so inside any `bun run` script, turbo tasks and gates
 * included, `forge` names this checkout's source, which nobody runs here. No package script of the workspace root, of the program or of a
 * workspace package it depends on, and no TypeScript source of the program, starts `forge` by name. Each form is planted and watched failing.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { RepositorySource }                                                            from '../src/testing/RepositorySources.ts';
import { declaredWorkspacePackagesOf, repositoryTypeScriptSources, workspaceRootOfProgram } from '../src/testing/RepositorySources.ts';

const PROGRAM_ROOT = join(import.meta.dir, '..');
const THIS_SPEC    = 'architecture/ForgeRunsByName.spec.ts';

/** `forge` as a command word: at the start of a script or after `&&`, `||`, `;`, `|`, `(` or `$(`. */
const SCRIPT_COMMAND_RUNS_FORGE = /(?:^|&&|\|\||[;|(])\s*forge(?:\s|$)/;
/** `forge` as the first element of an argument list, the shape every spawn in the program takes. */
const SOURCE_ARGUMENT_LIST_RUNS_FORGE = /\[\s*['"`]forge['"`]\s*[,\]]/;

function scriptsRunningForgeIn(manifestPath: string, manifestText: string): string[] {
  const scripts = (JSON.parse(manifestText) as { scripts?: Record<string, string> }).scripts ?? {};
  return Object.entries(scripts)
    .filter(([, command]) => SCRIPT_COMMAND_RUNS_FORGE.test(command))
    .map(([scriptName, command]) => `${manifestPath} script ${scriptName}: ${command}`);
}

function sourcesRunningForge(sources: readonly RepositorySource[]): string[] {
  return sources
    .filter((source) => source.path !== THIS_SPEC)
    .flatMap((source) => source.text.split('\n')
      .filter((line) => SOURCE_ARGUMENT_LIST_RUNS_FORGE.test(line))
      .map((line) => `${source.path}: ${line.trim()}`));
}

function workspaceManifestPaths(): string[] {
  const workspacePackageManifests = declaredWorkspacePackagesOf(PROGRAM_ROOT).map((workspacePackage) => join(workspacePackage.folder, 'package.json'));
  return [join(workspaceRootOfProgram(PROGRAM_ROOT), 'package.json'), join(PROGRAM_ROOT, 'package.json'), ...workspacePackageManifests];
}

describe('no script or source starts forge by name', () => {
  test('the workspace root, the program and the workspace packages it depends on run no forge in a package script', () => {
    const manifestPaths = workspaceManifestPaths();
    expect(manifestPaths.length).toBeGreaterThan(2);
    expect(manifestPaths.flatMap((manifestPath) => scriptsRunningForgeIn(manifestPath, readFileSync(manifestPath, 'utf8')))).toEqual([]);
  });

  test('no TypeScript source of the program starts forge by name', () => {
    const sources = repositoryTypeScriptSources(PROGRAM_ROOT);
    expect(sources.length).toBeGreaterThan(0);
    expect(sourcesRunningForge(sources)).toEqual([]);
  });

  test.each([
    ['at the start', 'forge status --json'],
    ['after &&', 'bun install && forge init'],
    ['after a semicolon', 'cd apps/forge; forge'],
    ['inside $( )', 'echo $(forge version)'],
  ])('a planted script running forge %s is named', (_formName, command) => {
    expect(scriptsRunningForgeIn('package.json', JSON.stringify({ scripts: { example: command } }))).toEqual([`package.json script example: ${command}`]);
  });

  test.each([
    ['bun run forge:check', 'a script named after forge'],
    ['bun apps/forge/agent-progress.ts version', 'the entry script by its path'],
    ['turbo run check --filter=forge', 'a turbo filter naming the package'],
  ])('%s, %s, is not a run of forge by name', (command) => {
    expect(scriptsRunningForgeIn('package.json', JSON.stringify({ scripts: { example: command } }))).toEqual([]);
  });

  test.each([
    ['Bun.spawnSync([\'forge\', \'start\', \'--json\']);'],
    ['Bun.spawn(["forge"]);'],
    ['const argv = [`forge`, ...words];'],
  ])('a planted argument list starting with forge is named: %s', (line) => {
    expect(sourcesRunningForge([{ path: 'cli/Example.ts', text: line }])).toEqual([`cli/Example.ts: ${line}`]);
  });
});
