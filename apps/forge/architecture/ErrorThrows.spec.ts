/**
 * No shipping code throws `new Error(` with a sentence: a refusal is an `OperationRefusal` with a wordless detail, and a lib throw becomes a
 * verdict, a refusing port or a refusal. Today's throws are an exact allowlist, shrunk as each one moves. The scan proves it saw the program,
 * the allowlist is exact both ways, and each form is planted. Comments, specs and testing folders are not scanned.
 */
import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout }                                          from '../src/testing/ImportGraph.ts';
import { memoisedPerSource, repositoryTypeScriptSources, type RepositorySource } from '../src/testing/RepositorySources.ts';

interface ThrowReport {
  /** `<path>: throw new Error(<the thrown text's first line>`, one per scanned throw the allowlist does not hold. */
  readonly violations:       readonly string[];
  readonly unusedAllowances: readonly string[];
}

/** The argument may start on the next line, so the captured start is the first line of text after the parenthesis. */
const ERROR_THROW_PATTERN = /\bthrow\s+new\s+Error\s*\(\s*([^\n]*)/g;

/** `<path>: throw new Error(<the thrown text's first line>`, sorted by path. */
const ALLOWED_THROWS: readonly string[] = [
  // Its string-answering path rules feed `AgentAdapter.planOf`, which takes no verdict yet: that is a change of the agent port.
  'src/lib/claude-code/AgentHostFactsFor.ts: throw new Error(`no Claude Code host facts exist for the platform ${platform}`);',
  // Reached only on a platform with no host facts or by a planted adapter; it goes with the agent port's planning verdict.
  'src/lib/claude-code/ClaudeCodeAdapter.ts: throw new Error(\'a confined session was asked for on a host where no Claude Code sandbox setting applies\');',
  // Talos's main thread orders its own calls, so each marks a programming error; the thread answers the throw as a failed call.
  'src/lib/talos/SynchronousCallsThread.ts: throw new Error(\'the synchronous-calls thread answers no process call before its start\');',
  'src/lib/talos/SynchronousCallsThread.ts: throw new Error(\'the synchronous-calls thread answers no endpoint call before its start\');',
  'src/lib/talos/SynchronousCallsThread.ts: throw new Error(`no event log is open at ${eventLogPath}`);',
  'src/lib/talos/SynchronousCallsThread.ts: throw new Error(`the event log at ${request.eventLogPath} is already open`);',
  'src/lib/talos/SynchronousCallsThread.ts: throw new Error(`the event log at ${request.eventLogPath} appends sequence ${nextSequence} next, not ${request.entry.sequence}`);',
  'src/lib/talos/SynchronousCallsThread.ts: throw new Error(`the event-log entry of sequence ${request.entry.sequence} carries no stamp`);',
  'src/lib/tracker-model/BoardRecords.ts: throw new Error(`The board holds no ticket #${ticketId}.`);',
  // `groupsBy` opens a group only with a member, so an empty builder group is a programming error.
  'src/lib/tracker-model/ReviewStatistics.ts: throw new Error(\'A builder group is never empty.\');',
  'src/lib/tracker-model/TicketDocuments.ts: throw new Error(`The documents record of #${loadedRecord.record.ticketId} names no text for ${contentHash}.`);',
  'src/lib/tracker-model/TicketMoves.ts: throw new Error(`Ticket #${unreleasable.frontmatter.id} is ${unreleasable.frontmatter.status}; '
    + 'a caller refuses such a release before asking for it.`);',
  'src/lib/tracker-model/TicketStageRows.ts: throw new Error(`Ticket #${ticketId} cannot move from the stage ${currentStageName} to ${stage.name}.`);',
  'src/lib/tracker-model/TicketStageRows.ts: throw new Error(`Ticket #${ticketId} returned to a package once; a second return opens the decision second-return.`);',
  'src/lib/tracker-model/utils/PipelineDraftEditUtil.ts: throw new Error(`${field} is not a draft field.`);',
  'src/lib/tracker-model/utils/PipelineDraftEditUtil.ts: throw new Error(`${field} is not a field of an entity.`);',
];

function isScannedShippingCode(path: string): boolean {
  return !path.startsWith('architecture/') && !/\.spec\.tsx?$/.test(path) && !path.includes('/testing/') && !path.startsWith('testing/');
}

function isCommentLine(line: string): boolean {
  return ['//', '/*', '*'].some((marker) => line.startsWith(marker));
}

function lineAround(text: string, index: number): string {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const lineEnd = text.indexOf('\n', index);
  return text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();
}

const throwKeysOfSource = memoisedPerSource((source): readonly string[] => [...source.text.matchAll(ERROR_THROW_PATTERN)]
  .filter((match) => !isCommentLine(lineAround(source.text, match.index)))
  .map((match) => `${source.path}: throw new Error(${(match[1] ?? '').trim()}`));

function throwReportOf(sources: readonly RepositorySource[], allowedThrows: readonly string[]): ThrowReport {
  const found = sources.filter((source) => isScannedShippingCode(source.path)).flatMap(throwKeysOfSource);
  return {
    violations:       found.filter((key, index) => !allowedThrows.includes(key) || found.indexOf(key) !== index),
    unusedAllowances: allowedThrows.filter((key) => !found.includes(key)),
  };
}

const SOURCES = repositoryTypeScriptSources(repositoryRootOfThisCheckout());

function violationsOfPlanted(path: string, plantedText: string): readonly string[] {
  return throwReportOf([{ path, text: `${plantedText}\n` }], []).violations;
}

describe('the scan saw the program', () => {
  test('it reads the shipping code of cli/ and src/, and finds the allowlisted throws of src/lib/', () => {
    const scannedPaths = SOURCES.map((source) => source.path).filter(isScannedShippingCode);
    expect(scannedPaths.length).toBeGreaterThan(300);
    expect(scannedPaths).toEqual(expect.arrayContaining(['cli/Main.ts', 'src/services/hephaestus/DrivePass.ts', 'src/shared/OperationRefusal.ts', 'talos.ts']));
    expect(ALLOWED_THROWS.length).toBeGreaterThan(0);
    expect(ALLOWED_THROWS.every((key) => key.startsWith('src/lib/'))).toBe(true);
  });

  test('every throw in shipping code is allowlisted, and every allowlist entry is found', () => {
    expect(throwReportOf(SOURCES, ALLOWED_THROWS)).toEqual({ violations: [], unusedAllowances: [] });
  });

  test('the allowlist is sorted by path', () => {
    const allowedPaths = ALLOWED_THROWS.map((key) => key.slice(0, key.indexOf(':')));
    expect(allowedPaths).toEqual([...allowedPaths].sort());
  });
});

describe('the allowlist is exact both ways', () => {
  const allowedEntry = 'src/services/hephaestus/Planted.ts: throw new Error(\'A planted sentence.\');';

  test('removing an entry leaves its throw a violation', () => {
    const removedEntry = ALLOWED_THROWS[0] ?? '';
    expect(throwReportOf(SOURCES, ALLOWED_THROWS.slice(1))).toEqual({ violations: [removedEntry], unusedAllowances: [] });
  });

  test('an entry nothing uses is named', () => {
    expect(throwReportOf(SOURCES, [...ALLOWED_THROWS, allowedEntry])).toEqual({ violations: [], unusedAllowances: [allowedEntry] });
  });

  test('a second copy of an allowed throw in its own file is a violation', () => {
    const doubledSite = { path: 'src/services/hephaestus/Planted.ts', text: 'throw new Error(\'A planted sentence.\');\nthrow new Error(\'A planted sentence.\');\n' };
    expect(throwReportOf([doubledSite], [allowedEntry])).toEqual({ violations: [allowedEntry], unusedAllowances: [] });
  });
});

describe('the test names each form, planted in memory', () => {
  const plantedPath = 'src/services/hephaestus/Planted.ts';

  test.each([
    ['a sentence on one line', 'if (job === undefined) throw new Error(\'No job holds the slot.\');', 'throw new Error(\'No job holds the slot.\');'],
    ['a template literal', 'throw new Error(`Job ${job.id} holds no slot.`);', 'throw new Error(`Job ${job.id} holds no slot.`);'],
    ['a call over several lines', 'throw new Error(\n  `Job ${job.id} holds no slot.`,\n);', 'throw new Error(`Job ${job.id} holds no slot.`,'],
    ['a message in a variable', 'throw new Error(message);', 'throw new Error(message);'],
    ['spaces around the call', 'throw  new  Error ( message );', 'throw new Error(message );'],
  ])('%s', (_formName, plantedText, expectedStart) => {
    expect(violationsOfPlanted(plantedPath, plantedText)).toEqual([`${plantedPath}: ${expectedStart}`]);
  });

  test('a root entry file and a file of cli/ are scanned', () => {
    expect(violationsOfPlanted('talos.ts', 'throw new Error(message);')).toEqual(['talos.ts: throw new Error(message);']);
    expect(violationsOfPlanted('cli/Planted.ts', 'throw new Error(message);')).toEqual(['cli/Planted.ts: throw new Error(message);']);
  });

  test('a comment, a spec, a testing folder and an architecture test are not scanned', () => {
    const plantedLine = 'throw new Error(\'A planted sentence.\');';
    expect(violationsOfPlanted(plantedPath, `// ${plantedLine}`)).toEqual([]);
    expect(violationsOfPlanted(plantedPath, ` * ${plantedLine}`)).toEqual([]);
    expect(violationsOfPlanted('src/services/hephaestus/Planted.spec.ts', plantedLine)).toEqual([]);
    expect(violationsOfPlanted('src/services/hephaestus/testing/Planted.ts', plantedLine)).toEqual([]);
    expect(violationsOfPlanted('src/testing/Planted.ts', plantedLine)).toEqual([]);
    expect(violationsOfPlanted('architecture/Planted.ts', plantedLine)).toEqual([]);
  });

  test('a typed throw and a name that only resembles the call pass', () => {
    expect(violationsOfPlanted(plantedPath, 'throw new OperationRefusal(\'refused\', { kind: \'no-slot\' });')).toEqual([]);
    expect(violationsOfPlanted(plantedPath, 'throw new TypeError(\'not a slot\');')).toEqual([]);
    expect(violationsOfPlanted(plantedPath, 'const error = new Error(message);')).toEqual([]);
  });
});
