/**
 * The page's board command body read into Gaia's model. What matters: a valid body of each kind becomes its model command, every typed draft
 * edit included; an agent's program is followed on the machine or pinned to a path, and a tool names its path or `null`; a key the kind does
 * not name never reaches the model; a missing key, a key of the wrong type, a value outside its union, an agent's program of neither form
 * and a malformed draft edit are refused as a malformed body and named; a kind Gaia does not send, a by-hand kind among them, is refused as
 * unknown; a body at another version or no JSON object is malformed. A ticket document's save, an edited proposal and a comment's quote may
 * carry a whole document, up to its own bound, while every other kind keeps to the smaller one; a comment's anchor is read key by key, a
 * diagram node's included.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardCommandDocument }                                                      from '../../../page/@types/board/BoardCommandDocument.ts';
import { BOARD_COMMAND_BODY_BOUND_BYTES }                                                 from '../../shared/constants/Limits.ts';
import { PAGE_CONTRACT_VERSIONS }                                                         from '../../shared/constants/PageContractVersions.ts';
import { BoardCommandIngestion }                                                          from './BoardCommandIngestion.ts';
import { EXAMPLE_BOARD_COMMAND_DOCUMENTS, EXAMPLE_COMMENT_ANCHOR, exampleBoardCommandOf } from './testing/ExampleBoardCommandDocuments.ts';

const INGESTION = new BoardCommandIngestion();

function readingOf(body: unknown) {
  return INGESTION.commandOf(JSON.stringify(body));
}

describe('commandOf, on a valid body', () => {
  test.each(Object.values(EXAMPLE_BOARD_COMMAND_DOCUMENTS))('reads $kind into its model command', (document) => {
    expect(readingOf(document)).toEqual({ verdict: 'readable', command: exampleBoardCommandOf(document) });
  });

  test('reads each form of a resume\'s target', () => {
    const resume = EXAMPLE_BOARD_COMMAND_DOCUMENTS['interrupted-work-resume'];
    expect(readingOf({ ...resume, target: 'all' })).toEqual({ verdict: 'readable', command: { kind: 'interrupted-work-resume', target: 'all' } });
    expect(readingOf({ ...resume, target: { jobId: 'J1' } })).toEqual({ verdict: 'readable', command: { kind: 'interrupted-work-resume', target: { jobId: 'J1' } } });
  });

  test('reads the Assistant\'s switch, on and off', () => {
    const switchOn = EXAMPLE_BOARD_COMMAND_DOCUMENTS['pipeline-assistant-set'];
    expect(readingOf(switchOn)).toEqual({ verdict: 'readable', command: { kind: 'pipeline-assistant-set', on: true } });
    expect(readingOf({ ...switchOn, on: false })).toEqual({ verdict: 'readable', command: { kind: 'pipeline-assistant-set', on: false } });
  });

  test('reads an agent followed on the machine or pinned to a path, and a setup started with its agent', () => {
    const pinnedAgent = { vendor: 'example-agent', program: { pinned: '/Users/example/.local/bin/example-agent' } };
    const setupAgent = EXAMPLE_BOARD_COMMAND_DOCUMENTS['pipeline-setup-agent'];
    expect(readingOf({ ...setupAgent, agent: pinnedAgent })).toEqual({ verdict: 'readable', command: { kind: 'pipeline-setup-agent', setupId: 'S2', agent: pinnedAgent } });
    const setupStart = EXAMPLE_BOARD_COMMAND_DOCUMENTS['pipeline-setup-start'];
    expect(readingOf({ ...setupStart, agent: pinnedAgent })).toEqual({
      verdict: 'readable',
      command: {
        kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, agent: pinnedAgent
      }
    });
  });

  test('reads a tool list as found tools and names alone, and no list as following the pipeline\'s programs', () => {
    const toolsSet = EXAMPLE_BOARD_COMMAND_DOCUMENTS['pipeline-tools-set'];
    const tools = [{ name: 'bun', path: '/Users/example/.bun/bin/bun' }, { name: 'gh', path: null }];
    expect(readingOf({ ...toolsSet, tools })).toEqual({ verdict: 'readable', command: { kind: 'pipeline-tools-set', tools } });
    expect(readingOf({ ...toolsSet, tools: null })).toEqual({ verdict: 'readable', command: { kind: 'pipeline-tools-set', tools: null } });
  });

  test('passes over a key the kind does not name, at the top and inside a draft edit', () => {
    const hold = EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-hold'];
    expect(readingOf({ ...hold, exampleExtraKey: true })).toEqual({ verdict: 'readable', command: exampleBoardCommandOf(hold) });
    const edit = EXAMPLE_BOARD_COMMAND_DOCUMENTS['pipeline-draft-edit'];
    const editsWithExtraKeys = edit.edits.map((draftEdit) => ({ ...draftEdit, exampleExtraKey: 1 }));
    expect(readingOf({ ...edit, edits: editsWithExtraKeys })).toEqual({ verdict: 'readable', command: exampleBoardCommandOf(edit) });
  });
});

describe('commandOf, on a body it refuses', () => {
  test('names a missing key', () => {
    const { reason: _reason, ...holdWithoutReason } = EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-hold'];
    expect(readingOf(holdWithoutReason)).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['reason'] });
  });

  test('names a key of the wrong type and a value outside its union', () => {
    expect(readingOf({ ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['concurrency-set'], limit: '3' })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['limit'] });
    expect(readingOf({ ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['job-stop'], mode: 'fresh' })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['mode'] });
  });

  test('names an Assistant switch that says neither on nor off', () => {
    expect(readingOf({ ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['pipeline-assistant-set'], on: 'on' })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['on'] });
  });

  test('names a draft edit no typed edit fits, and an entity role a forge-level role', () => {
    const edit = EXAMPLE_BOARD_COMMAND_DOCUMENTS['pipeline-draft-edit'];
    const gateWithoutItsRun = { target: 'gate', name: 'unit', value: { name: 'unit' } };
    expect(readingOf({ ...edit, edits: [gateWithoutItsRun] })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['edits[0]'] });
    const forgeLevelRoleInEntity = { target: 'within-entity', entityKey: 'web', edit: { target: 'role', role: 'assistant', value: null } };
    expect(readingOf({ ...edit, edits: [forgeLevelRoleInEntity] })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['edits[0]'] });
  });

  test('names an agent\'s program that is neither followed on the machine nor pinned, and a setup start or a tool missing its null', () => {
    const agentSet = EXAMPLE_BOARD_COMMAND_DOCUMENTS['pipeline-agent-set'];
    const followingTheForge = { ...agentSet, agent: { vendor: 'example-agent', program: { follows: 'forge' } } };
    expect(readingOf(followingTheForge)).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['agent.program'] });
    const { agent: _agent, ...setupStartWithoutAgent } = EXAMPLE_BOARD_COMMAND_DOCUMENTS['pipeline-setup-start'];
    expect(readingOf(setupStartWithoutAgent)).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['agent'] });
    const toolWithoutPath = { ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['pipeline-tools-set'], tools: [{ name: 'gh' }] };
    expect(readingOf(toolWithoutPath)).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['tools[0].path'] });
  });

  test('names a resume target that is neither all, a job nor a ticket', () => {
    const resume = EXAMPLE_BOARD_COMMAND_DOCUMENTS['interrupted-work-resume'];
    expect(readingOf({ ...resume, target: 'network-outage' })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['target'] });
    expect(readingOf({ ...resume, target: { jobId: 7 } })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['target'] });
  });

  test('refuses a kind Gaia does not send, a by-hand kind among them, and a body naming no kind', () => {
    const version = { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand };
    expect(readingOf({ ...version, kind: 'ticket-unready', ticketId: '001' })).toEqual({ verdict: 'refused', refusal: 'unknown-kind', kind: 'ticket-unready' });
    expect(readingOf({ ...version, kind: 'job-stop-all', mode: 'stop' })).toEqual({ verdict: 'refused', refusal: 'unknown-kind', kind: 'job-stop-all' });
    expect(readingOf(version)).toEqual({ verdict: 'refused', refusal: 'unknown-kind', kind: null });
  });

  test('refuses a body at another version, or with none, as malformed', () => {
    const hold = EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-hold'];
    const newerVersion = PAGE_CONTRACT_VERSIONS.gaiaBoardCommand + 1;
    expect(readingOf({ ...hold, boardCommandVersion: newerVersion })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['boardCommandVersion'] });
    const { boardCommandVersion: _version, ...holdWithoutVersion } = hold;
    expect(readingOf(holdWithoutVersion)).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['boardCommandVersion'] });
  });

  test('refuses text that is no JSON object as malformed', () => {
    expect(INGESTION.commandOf('not json')).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: [] });
    expect(INGESTION.commandOf('[]')).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: [] });
  });
});

describe('commandOf, on a ticket document\'s commands', () => {
  test('reads a comment with no anchor, a save with no base version and an apply of the agent\'s own lines', () => {
    const comment = { ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-document-comment'], anchor: null };
    expect(readingOf(comment)).toEqual({ verdict: 'readable', command: exampleBoardCommandOf(comment) });
    const firstSave = { ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-document-save'], baseVersion: null };
    expect(readingOf(firstSave)).toEqual({ verdict: 'readable', command: exampleBoardCommandOf(firstSave) });
    const apply = { ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-document-proposal-apply'], replacementLines: null };
    expect(readingOf(apply)).toEqual({ verdict: 'readable', command: exampleBoardCommandOf(apply) });
  });

  test('reads an anchor with no columns, quote or diagram', () => {
    const anchor = {
      ...EXAMPLE_COMMENT_ANCHOR, view: 'code' as const, columns: null, quote: null, diagram: null
    };
    const comment = { ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-document-comment'], anchor };
    expect(readingOf(comment)).toEqual({ verdict: 'readable', command: exampleBoardCommandOf(comment) });
  });

  test('names each key of an anchor that holds another type, a diagram node\'s included', () => {
    const anchor = {
      ...EXAMPLE_COMMENT_ANCHOR,
      view:    'split',
      lines:   { from: 20 },
      diagram: { ...EXAMPLE_COMMENT_ANCHOR.diagram, nodeId: 7 },
    };
    const invalidKeys = ['anchor.view', 'anchor.lines.to', 'anchor.diagram.nodeId'];
    expect(readingOf({ ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-document-comment'], anchor })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys });
  });

  test('names a document, a mode, a version and replacement lines outside their shapes', () => {
    const examples = EXAMPLE_BOARD_COMMAND_DOCUMENTS;
    expect(readingOf({ ...examples['ticket-document-turn-stop'], document: 'brief' })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['document'] });
    expect(readingOf({ ...examples['ticket-document-mode-set'], mode: 'auto' })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['mode'] });
    expect(readingOf({ ...examples['ticket-document-approve'], version: -1 })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['version'] });
    const apply = { ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-document-proposal-apply'], replacementLines: ['one line'] };
    expect(readingOf(apply)).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['replacementLines[0]'] });
  });

  test('reads a save, an edited proposal and a comment quoting a long selection larger than every other command may be', () => {
    const documentOverTheCommandBound = 'x'.repeat(BOARD_COMMAND_BODY_BOUND_BYTES);
    const save = { ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-document-save'], markdown: documentOverTheCommandBound };
    const apply = { ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-document-proposal-apply'], replacementLines: [[documentOverTheCommandBound], []] };
    const comment = { ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-document-comment'], anchor: { ...EXAMPLE_COMMENT_ANCHOR, quote: documentOverTheCommandBound } };
    const commands: readonly BoardCommandDocument[] = [save, apply, comment];
    for (const command of commands) expect(readingOf(command)).toEqual({ verdict: 'readable', command: exampleBoardCommandOf(command) });
  });

  test('refuses another kind of that size as too large', () => {
    const message = { ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['job-message'], text: 'x'.repeat(BOARD_COMMAND_BODY_BOUND_BYTES) };
    expect(readingOf(message)).toEqual({ verdict: 'refused', refusal: 'too-large' });
  });
});

describe('commandOf, on an agent step\'s documents', () => {
  test('names a reading rule outside its union', () => {
    const edit = EXAMPLE_BOARD_COMMAND_DOCUMENTS['pipeline-draft-edit'];
    const reviewerEdit = {
      target: 'role',
      role:   'reviewer',
      value:  {
        model: null, effort: null, instructions: null, documents: { plan: 'sometimes' }
      }
    };
    expect(readingOf({ ...edit, edits: [reviewerEdit] })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['edits[0]'] });
  });
});
