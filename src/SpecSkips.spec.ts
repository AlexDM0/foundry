/**
 * Every skip goes through `src/testing/ToolGuard.ts`, so the run report names each one and `AGENT_PROGRESS_REQUIRE_EVERY_TOOL=1` fails it:
 * no spec skips, leaves a test unwritten or runs it only under a condition on its own. The root guard has an exact list of callers, each with why
 * root breaks its proof, held both ways. Each form is planted and watched failing; comments are not scanned.
 */
import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout }                       from './testing/ImportGraph.ts';
import { repositoryTypeScriptSources, type RepositorySource } from './testing/RepositorySources.ts';

const TOOL_GUARD = 'src/testing/ToolGuard.ts';

const UNGUARDED_SKIP_PATTERNS: readonly RegExp[] = [
  /\b(?:test|it|describe)\s*\.\s*(?:skip|skipIf|if|todo|todoIf)\b/,
  /\b(?:xtest|xit|xdescribe)\s*\(/,
];

const ROOT_GUARD_CALL = /\btestWhenNotRunningAsRoot\s*\(/;

/** The specs whose proof needs a refused write, which root never gets, each with why. */
const ROOT_GUARDED_SPECS: Readonly<Record<string, string>> = {
  'src/lib/atomic-file/AtomicFile.spec.ts':                'It stages a write that a read-only folder refuses, and keeps the permission bits of a restricted file.',
  'src/lib/atomic-file/FileReplace.contract.spec.ts':      'It renames into a read-only folder to see the Windows retry wait.',
  'cli/adoption/update/UpdateCommand.integration.spec.ts': 'It cuts a refresh short with an unwritable skills folder.',
};

interface SkipReport {
  readonly unguardedSkips:   readonly string[];
  readonly rootGuardedSpecs: readonly string[];
}

function isSpecOrTestHelper(path: string): boolean {
  return /\.spec\.tsx?$/.test(path) || path.startsWith('testing/') || path.includes('/testing/');
}

function codeLinesOf(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => !['//', '/*', '*'].some((marker) => line.startsWith(marker)));
}

function skipReportOf(sources: readonly RepositorySource[]): SkipReport {
  const scanned = sources.filter((source) => isSpecOrTestHelper(source.path) && source.path !== TOOL_GUARD && source.path !== 'src/SpecSkips.spec.ts');
  return {
    unguardedSkips: scanned.flatMap((source) => codeLinesOf(source.text)
      .filter((line) => UNGUARDED_SKIP_PATTERNS.some((pattern) => pattern.test(line)))
      .map((line) => `${source.path}: ${line}`)),
    rootGuardedSpecs: scanned.filter((source) => codeLinesOf(source.text).some((line) => ROOT_GUARD_CALL.test(line))).map((source) => source.path).sort(),
  };
}

const SOURCES = repositoryTypeScriptSources(repositoryRootOfThisCheckout());

describe('the scan saw the specs', () => {
  test('it reads the specs and the guard holds the only skips', () => {
    expect(SOURCES.filter((source) => isSpecOrTestHelper(source.path)).length).toBeGreaterThan(300);
    const guard = SOURCES.find((source) => source.path === TOOL_GUARD);
    expect(codeLinesOf(guard?.text ?? '').filter((line) => UNGUARDED_SKIP_PATTERNS.some((pattern) => pattern.test(line))).length).toBeGreaterThan(0);
  });
});

test('no spec skips except through the guard, and the root guard has exactly its listed callers', () => {
  expect(skipReportOf(SOURCES)).toEqual({ unguardedSkips: [], rootGuardedSpecs: Object.keys(ROOT_GUARDED_SPECS).sort() });
});

describe('each form is planted and named', () => {
  const plantedPath = 'src/lib/example/Planted.spec.ts';

  test.each([
    'test.skip(\'claim\', body);',
    'test.skipIf(RUNNING_AS_ROOT)(\'claim\', body);',
    'test.if(onMac)(\'claim\', body);',
    'it.todo(\'claim\');',
    'describe.skip(\'title\', body);',
    'xtest(\'claim\', body);',
  ])('%s', (plantedLine) => {
    expect(skipReportOf([{ path: plantedPath, text: `${plantedLine}\n` }]).unguardedSkips).toEqual([`${plantedPath}: ${plantedLine}`]);
  });

  test('a comment naming a skip, and a skip in shipping code, are not scanned', () => {
    expect(skipReportOf([{ path: plantedPath, text: '// test.skip(\'claim\', body);\n' }]).unguardedSkips).toEqual([]);
    expect(skipReportOf([{ path: 'src/lib/example/Planted.ts', text: 'test.skip(\'claim\', body);\n' }]).unguardedSkips).toEqual([]);
  });

  test('a fourth root-guarded spec, or a listed one that stops calling the guard, changes the list', () => {
    const withFourth = [...SOURCES, { path: plantedPath, text: 'testWhenNotRunningAsRoot(\'claim\', body);\n' }];
    expect(skipReportOf(withFourth).rootGuardedSpecs).toContain(plantedPath);
    const withoutFirst = SOURCES.filter((source) => source.path !== 'src/lib/atomic-file/AtomicFile.spec.ts');
    expect(skipReportOf(withoutFirst).rootGuardedSpecs).not.toContain('src/lib/atomic-file/AtomicFile.spec.ts');
  });
});
