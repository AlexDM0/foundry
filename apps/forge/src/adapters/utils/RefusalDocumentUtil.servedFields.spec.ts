/**
 * The served `fields` of each refusal whose detail carries a typed problem: the key and the sentence forge served before the problem was
 * typed, so a client reads the same document. The expected values are those sentences as forge 4.5 served them.
 */
import { describe, expect, test } from 'bun:test';
import type { ForgeJsonValue }    from 'forge-contracts/ForgeRefusalDocument';

import type { OperationRefusalDetail } from '../../shared/OperationRefusal.ts';
import { OperationRefusal }            from '../../shared/OperationRefusal.ts';
import { RefusalDocumentUtil }         from './RefusalDocumentUtil.ts';

const MERGE_TREE_FAILURE = {
  code: 'git-exited', gitArguments: ['merge-tree', 'main', 'ticket-4'], exitCode: 128, gitMessage: 'fatal: bad object'
} as const;

const SERVED_FIELDS_OF_EACH_CHANGED_KIND: readonly (readonly [OperationRefusalDetail, Record<string, ForgeJsonValue>])[] = [
  [
    { kind: 'malformed-hold-journal', journalFilePath: '/example/hold-journal.json', problem: { code: 'files-not-a-list', field: 'files' } },
    { journalFilePath: '/example/hold-journal.json', reason: 'its "files" is not a list' },
  ],
  [
    { kind: 'hold-journal-unremovable', journalFilePath: '/example/hold-journal.json', systemError: 'EBUSY' },
    { journalFilePath: '/example/hold-journal.json', reason: 'EBUSY' },
  ],
  [
    {
      kind:             'install-version-mismatch',
      rootDirectory:    '/example/repository',
      manifestFilePath: '/example/repository/.example/version.json',
      installVersion:   30,
      mismatch:         { reason: 'unreadable', manifestProblem: { code: 'not-json', parserError: 'Unexpected end' } },
    },
    {
      rootDirectory:    '/example/repository',
      manifestFilePath: '/example/repository/.example/version.json',
      installVersion:   30,
      mismatch:         { reason: 'unreadable', manifestProblem: 'it is not valid JSON (Unexpected end)' },
    },
  ],
  [
    {
      kind: 'malformed-ticket-file', filePath: '/example/tickets/004-broken.md', line: 1, problem: { code: 'no-closing-fence' }
    },
    { filePath: '/example/tickets/004-broken.md', line: 1, reason: 'the frontmatter has no closing `---` fence' },
  ],
  [
    { kind: 'malformed-pipeline', filePath: '/example/pipeline.json', problem: { code: 'not-json', parserError: 'Unexpected end' } },
    { filePath: '/example/pipeline.json', reason: 'it is not valid JSON (Unexpected end)' },
  ],
  [
    { kind: 'gate-confinement-unavailable', unavailability: { cause: 'bubblewrap-not-on-search-path' } },
    { reason: 'bwrap (bubblewrap) is not on the search path' },
  ],
  [
    { kind: 'hephaestus-lock-not-created-whole', hephaestusLockFilePath: '/example/hephaestus/lock-1.json', systemError: 'EPERM' },
    { hephaestusLockFilePath: '/example/hephaestus/lock-1.json', reason: 'EPERM' },
  ],
  [
    { kind: 'pipeline-draft-invalid', setupId: 'S2', problem: { code: 'not-a-json-object' } },
    { setupId: 'S2', reason: 'the document is not a JSON object' },
  ],
  [
    { kind: 'pipeline-draft-invalid', setupId: 'S2', problem: null },
    { setupId: 'S2', reason: 'older' },
  ],
  [
    { kind: 'main-constitution-unreadable', problem: { code: 'main-line-unresolved', mainLine: 'main' } },
    { reason: 'the main line main does not resolve to a commit' },
  ],
  [
    { kind: 'tool-refused', name: 'bun', refusal: { cause: 'not-there', path: '/example/bin/bun' } },
    { name: 'bun', reason: '/example/bin/bun is not there' },
  ],
  [
    { kind: 'machine-config-unwritable', filePath: '/example/config.json', problem: { code: 'version-newer', field: 'version', version: 9 } },
    { filePath: '/example/config.json', reason: 'its version 9 is newer than this program reads' },
  ],
  [
    {
      kind: 'merge-accept-prediction-failed', ticketId: '4', target: 'main', problem: MERGE_TREE_FAILURE
    },
    { ticketId: '4', target: 'main', gitReason: 'git merge-tree main ticket-4 exited with 128: fatal: bad object' },
  ],
  [
    {
      kind: 'merge-update-failed', ticketId: '4', target: 'main', problem: { code: 'worktree-head-unreadable', worktree: '/example/worktrees/4' }
    },
    { ticketId: '4', target: 'main', gitReason: '/example/worktrees/4 has no readable HEAD' },
  ],
  [
    {
      kind: 'merge-update-failed', ticketId: '4', target: 'main', problem: { code: 'target-unresolved' }
    },
    { ticketId: '4', target: 'main', gitReason: 'main does not resolve' },
  ],
  [
    {
      kind: 'merge-update-failed', ticketId: '4', target: 'main', problem: { code: 'unknown-commit' }
    },
    { ticketId: '4', target: 'main', gitReason: 'unknown commit' },
  ],
  [
    {
      kind: 'worktree-repair-failed', ticketId: '4', step: 'recreate', problem: { code: 'git-not-started', gitArguments: ['worktree', 'add'] }
    },
    { ticketId: '4', step: 'recreate', gitReason: 'git worktree add could not be started.' },
  ],
  [
    { kind: 'namespace-branch-list-failed', problem: { code: 'git-not-started', gitArguments: ['branch', '--list'] } },
    { reason: 'git branch --list could not be started.' },
  ],
  [
    {
      kind:    'unreadable-tracker',
      reading: {
        verdict: 'unreadable', unreadableFile: 'progress-file', filePath: '/example/progress.json', problem: { code: 'not-utf8-text' }
      }
    },
    {
      reading: {
        verdict: 'unreadable', unreadableFile: 'progress-file', filePath: '/example/progress.json', reason: 'it is not UTF-8 text'
      }
    },
  ],
  [
    { kind: 'board-refusal', boardRefusal: { reason: 'pipeline-setup-unreadable', problem: { code: 'not-json', parserError: 'Unexpected end' } } },
    { problem: 'it is not valid JSON (Unexpected end)' },
  ],
  [
    { kind: 'board-refusal', boardRefusal: { reason: 'gate-profiles-unreadable', problem: { code: 'not-json', parserError: 'Unexpected end' } } },
    { problem: 'it is not valid JSON (Unexpected end)' },
  ],
];

describe('the served fields of a refusal whose detail carries a typed problem', () => {
  for (const [detail, servedFields] of SERVED_FIELDS_OF_EACH_CHANGED_KIND) {
    const code = detail.kind === 'board-refusal' ? detail.boardRefusal.reason : detail.kind;
    test(`${code} serves the keys and the sentences it served before its problem was typed`, () => {
      const document = RefusalDocumentUtil.refusalDocumentOf(new OperationRefusal('refused', detail));
      expect(document.code).toBe(code);
      expect(document.fields).toEqual(servedFields);
      expect(JSON.stringify(document.fields)).toBe(JSON.stringify(servedFields));
    });
  }
});
