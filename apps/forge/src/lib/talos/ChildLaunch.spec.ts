/**
 * Reading a launch: a well-formed agent and line read as themselves with extra keys dropped; each refusal is named, and a child folder that
 * could leave the board (absolute, or through `..`) is refused as outside it, since Talos writes the child's record and log there. A line
 * runs with no reply, recognition or quit act and alone carries a time bound.
 */
import { describe, expect, test } from 'bun:test';

import { type ChildLaunch, childIdOf, childLaunchOf } from './ChildLaunch.ts';

const BOARD_FOLDER = '/example/board/.forge';

const CLOSING_LINE = { allOf: [{ test: 'equals', path: 'kind', value: 'finished' }], anyOf: [], noneOf: [] } as const;

const AGENT_LAUNCH: ChildLaunch = {
  childFolder:          'jobs/J1',
  instance:             1,
  kind:                 'agent',
  label:                'J1 build',
  argv:                 ['example-agent', '--example-flag'],
  environment:          { PATH: '/usr/bin' },
  environmentFromTalos: { EXAMPLE_KEY: 'EXAMPLE_KEY' },
  workingDirectory:     '/example/worktree',
  verbatimArguments:    false,
  standingReplies:      [{ whenAllEqual: { kind: 'permission-asked' }, whenNoneEqual: {}, replyTemplate: '{"kind":"permission-granted"}' }],
  closingLine:          CLOSING_LINE,
  endingPatterns:       [{
    name: 'network-outage', closingLineMatches: CLOSING_LINE, countedLineMatches: null, minimumCountedLines: 0
  }],
  quitAtTurnEnd:                  { act: 'write-line', line: '{"kind":"stop-asked"}' },
  treeStopAtEndGraceMilliseconds: 2000,
  timeBoundMilliseconds:          null,
};

const LINE_LAUNCH: ChildLaunch = {
  ...AGENT_LAUNCH,
  childFolder:                    'jobs/J1/gate-1',
  kind:                           'line',
  label:                          'J1 gate 1',
  environmentFromTalos:           {},
  standingReplies:                [],
  closingLine:                    null,
  endingPatterns:                 [],
  quitAtTurnEnd:                  null,
  treeStopAtEndGraceMilliseconds: null,
  timeBoundMilliseconds:          900_000,
};

describe('a well-formed launch', () => {
  test.each([['an agent', AGENT_LAUNCH], ['a line', LINE_LAUNCH]])('%s reads as itself, extra keys dropped', (_title, launch) => {
    expect(childLaunchOf({ ...launch, later: true }, BOARD_FOLDER)).toEqual({ verdict: 'read', launch });
  });

  test('an agent that closes its input at its turn end reads', () => {
    const launch = { ...AGENT_LAUNCH, quitAtTurnEnd: { act: 'close-input' } } as const;
    expect(childLaunchOf(launch, BOARD_FOLDER)).toEqual({ verdict: 'read', launch });
  });

  test.each([['a first segment', '..hidden/J1'], ['a later segment', 'jobs/..hidden']])('%s that only starts with .. reads', (_title, childFolder) => {
    const launch = { ...LINE_LAUNCH, childFolder };
    expect(childLaunchOf(launch, BOARD_FOLDER)).toEqual({ verdict: 'read', launch });
  });

  test('a child folder deep under the board reads', () => {
    const launch = { ...LINE_LAUNCH, childFolder: 'merge-gates/0123456789abcdef/part-1/gate-1' };
    expect(childLaunchOf(launch, BOARD_FOLDER)).toEqual({ verdict: 'read', launch });
  });
});

test('a child id is the child folder and the instance', () => {
  expect(childIdOf('jobs/J1', 2)).toBe('jobs/J1#2');
});

describe('a child folder outside the board', () => {
  test.each([
    ['an absolute folder', '/etc'],
    ['a drive path', 'C:/Windows'],
    ['a leading ..', '../outside'],
    ['an inner ..', 'jobs/../../outside'],
    ['a trailing ..', 'jobs/..'],
  ])('%s is refused folder-outside-board', (_title, childFolder) => {
    expect(childLaunchOf({ ...LINE_LAUNCH, childFolder }, BOARD_FOLDER)).toMatchObject({ verdict: 'refused', reason: 'folder-outside-board' });
  });
});

describe('a malformed launch', () => {
  test.each<[string, Record<string, unknown>, string]>([
    ['an empty child folder', { childFolder: '' }, 'childFolder'],
    ['an empty segment', { childFolder: 'jobs//J1' }, 'childFolder'],
    ['a trailing separator', { childFolder: 'jobs/J1/' }, 'childFolder'],
    ['a . segment', { childFolder: 'jobs/./J1' }, 'childFolder'],
    ['a backslash', { childFolder: 'jobs\\J1' }, 'childFolder'],
    ['a NUL byte', { childFolder: 'jobs/J\u00001' }, 'childFolder'],
    ['a line feed', { childFolder: 'jobs/J1\n' }, 'childFolder'],
    ['an instance of 0', { instance: 0 }, 'instance'],
    ['a fractional instance', { instance: 1.5 }, 'instance'],
    ['an unknown kind', { kind: 'process' }, 'kind'],
    ['no label', { label: null }, 'label'],
    ['an empty argv', { argv: [] }, 'argv'],
    ['an argv of numbers', { argv: [1] }, 'argv'],
    ['an environment of numbers', { environment: { COUNT: 1 } }, 'environment'],
    ['no environmentFromTalos', { environmentFromTalos: undefined }, 'environmentFromTalos'],
    ['a relative working directory', { workingDirectory: 'worktree' }, 'workingDirectory'],
    ['no verbatimArguments', { verbatimArguments: undefined }, 'verbatimArguments'],
    ['a malformed standing reply', { standingReplies: [{ whenAllEqual: { type: 1 }, whenNoneEqual: {}, replyTemplate: '' }] }, 'standingReplies'],
    ['malformed closing-line conditions', { closingLine: { allOf: [] } }, 'closingLine'],
    ['a malformed ending pattern', { endingPatterns: [{ name: 'Outage' }] }, 'endingPatterns'],
    ['a quit act of two lines', { quitAtTurnEnd: { act: 'write-line', line: 'one\ntwo' } }, 'quitAtTurnEnd'],
    ['an unknown quit act', { quitAtTurnEnd: { act: 'signal' } }, 'quitAtTurnEnd'],
    ['a negative tree-stop grace', { treeStopAtEndGraceMilliseconds: -1 }, 'treeStopAtEndGraceMilliseconds'],
    ['a time bound on an agent', { timeBoundMilliseconds: 1000 }, 'timeBoundMilliseconds'],
  ])('an agent with %s is refused malformed-launch, naming the field', (_title, change, fieldName) => {
    const reading = childLaunchOf({ ...AGENT_LAUNCH, ...change }, BOARD_FOLDER);
    expect(reading).toMatchObject({ verdict: 'refused', reason: 'malformed-launch' });
    expect(reading.verdict === 'refused' ? reading.detail : '').toContain(fieldName);
  });

  test.each<[string, Record<string, unknown>]>([
    ['a time bound of 0', { timeBoundMilliseconds: 0 }],
    ['a fractional time bound', { timeBoundMilliseconds: 1.5 }],
    ['a standing reply', { standingReplies: AGENT_LAUNCH.standingReplies }],
    ['a closing line', { closingLine: CLOSING_LINE }],
    ['an ending pattern', { endingPatterns: AGENT_LAUNCH.endingPatterns }],
    ['a quit act', { quitAtTurnEnd: { act: 'close-input' } }],
  ])('a line with %s is refused malformed-launch', (_title, change) => {
    expect(childLaunchOf({ ...LINE_LAUNCH, ...change }, BOARD_FOLDER)).toMatchObject({ verdict: 'refused', reason: 'malformed-launch' });
  });

  test('a launch that is no object is refused malformed-launch', () => {
    expect(childLaunchOf(['jobs/J1'], BOARD_FOLDER)).toMatchObject({ verdict: 'refused', reason: 'malformed-launch' });
  });
});
