/**
 * Forge never knows who calls it: no shipped source or doc of the program names a client, neither Gaia (by its name or its own word
 * `fleet`) nor agent-dashboard and its retired `?embedded=dashboard`, so a client is spoken of as a monitor or a host only. Specs and
 * testing folders may name a client to plant a case or to hold that a retired value is refused. The packages forge declares hold the
 * same through their own `PackageIsolation.spec.ts`. The scan first proves it read the program, and each form is planted.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout } from './testing/ImportGraph.ts';
import { repositoryFilePaths }          from './testing/RepositorySources.ts';

interface ShippedFile {
  readonly path: string;
  readonly text: string;
}

const PROGRAM_ROOT = repositoryRootOfThisCheckout();
const TEXT_EXTENSIONS = ['.ts', '.tsx', '.js', '.md', '.json', '.css', '.html', '.svg', '.sh', '.ps1', '.toml', '.yml'];
const SPEC_SUFFIXES = ['.spec.ts', '.spec.tsx', '.dom.tsx', '.dom.ts'];
const TESTING_FOLDER = 'testing';
const CLIENT_NAMES = /\bgaia\b|\bfleet\b|agent-dashboard|embedded=dashboard/gi;
/** Comfortably under today's count, so a scan that read the wrong folder fails rather than passing on nothing. */
const SMALLEST_SHIPPED_FILE_COUNT = 700;

function isShipped(path: string): boolean {
  return TEXT_EXTENSIONS.some((extension) => path.endsWith(extension)) && !SPEC_SUFFIXES.some((suffix) => path.endsWith(suffix))
    && !path.split('/').includes(TESTING_FOLDER);
}

function clientNameSentencesOf(files: readonly ShippedFile[]): string[] {
  return files.flatMap((file) => file.text.split('\n').flatMap((line, lineIndex) => [...line.matchAll(CLIENT_NAMES)]
    .map((match) => `${file.path}:${lineIndex + 1} names the client "${match[0]}"`)));
}

const SHIPPED_FILES: readonly ShippedFile[] = repositoryFilePaths(PROGRAM_ROOT).filter(isShipped)
  .map((path) => ({ path, text: readFileSync(join(PROGRAM_ROOT, path), 'utf8') }));

describe('forge\'s shipped sources and docs name no client', () => {
  test('the scan reads the program\'s sources, its docs and its manifest, and no spec', () => {
    const scannedPaths = SHIPPED_FILES.map(({ path }) => path);
    expect(scannedPaths.length).toBeGreaterThan(SMALLEST_SHIPPED_FILE_COUNT);
    expect(scannedPaths).toEqual(expect.arrayContaining(['package.json', 'README.md', 'docs/reference/overseer-api.md']));
    expect(scannedPaths.filter((path) => !isShipped(path))).toEqual([]);
    expect(['src/ClientNames.spec.ts', 'cli/Planted.dom.tsx', 'src/testing/ImportGraph.ts'].filter(isShipped)).toEqual([]);
  });

  test('every planted form is caught, and forge\'s own dashboard is no client', () => {
    expect(clientNameSentencesOf([
      { path: 'docs/Planted.md', text: 'A program such as Gaia shows it.\nThe fleet reads it.' },
      { path: 'src/Planted.ts', text: 'export const HOST = \'gaia\';' },
      { path: 'docs/Planted.md', text: 'agent-dashboard frames it with `?embedded=dashboard`.' },
      { path: 'cli/Planted.ts', text: 'output(`  dashboard:   ${htmlFilePath}`); // a Gantt dashboard' },
    ])).toEqual([
      'docs/Planted.md:1 names the client "Gaia"',
      'docs/Planted.md:2 names the client "fleet"',
      'src/Planted.ts:1 names the client "gaia"',
      'docs/Planted.md:1 names the client "agent-dashboard"',
      'docs/Planted.md:1 names the client "embedded=dashboard"',
    ]);
  });

  test('no shipped file names a client', () => {
    expect(clientNameSentencesOf(SHIPPED_FILES)).toEqual([]);
  });
});
