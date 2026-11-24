/**
 * The agent tools' model. What matters: each row says where forge found the tool or that the machine lacks it, and what runs it; the kept
 * list names each approved tool at its found path, git always, a missing tool never, and each added name without a path for forge to find;
 * nothing is sent while the list is as served; the list keeps a draft edit while a setup designs, else the stored pipeline's tools; and an
 * added tool forge did not find is named from its refusal, so User can choose its program and the list names it at that path.
 */
import { describe, expect, test } from 'bun:test';

import { EXAMPLE_AGENT_TOOLS } from '../../../testing/AgentFixture.ts';
import { ToolListModel }       from './ToolListModel.ts';

const VERSION = { boardCommandVersion: 1 } as const;

describe('the rows', () => {
  test('say where each tool was found or that the machine lacks it, and what runs it', () => {
    expect(ToolListModel.rowsOf(EXAMPLE_AGENT_TOOLS)).toEqual([
      {
        name: 'git', foundAt: '/usr/bin/git', isMissing: false, usedBy: 'every job', isLocked: true
      },
      {
        name: 'bun', foundAt: '/Users/example/.bun/bin/bun', isMissing: false, usedBy: 'gate typecheck, gate lint, prepare step install', isLocked: false
      },
      {
        name: 'gh', foundAt: '/opt/homebrew/bin/gh', isMissing: false, usedBy: 'gate release', isLocked: false
      },
      {
        name: 'docker', foundAt: 'not on this machine', isMissing: true, usedBy: 'gate integration', isLocked: false
      },
    ]);
    expect(ToolListModel.summaryOf(EXAMPLE_AGENT_TOOLS)).toBe('4 tools · 1 missing');
    expect(ToolListModel.approvedNamesTextOf(EXAMPLE_AGENT_TOOLS)).toBe('git · bun · gh');
  });

  test('name an entity\'s gate with its entity', () => {
    const tool = {
      name: 'bun', path: '/example/bun', approved: true, usedBy: [{ kind: 'gate', name: 'unit', entity: 'web' }]
    } as const;
    expect(ToolListModel.rowsOf([tool])[0]?.usedBy).toBe('gate unit of web');
  });
});

describe('the kept list', () => {
  test('sends nothing while it is the list as served', () => {
    expect(ToolListModel.keepCommandOf({ kind: 'pipeline' }, EXAMPLE_AGENT_TOOLS, ToolListModel.editOf(EXAMPLE_AGENT_TOOLS))).toBeNull();
  });

  test('names each approved tool at its path, git always, no missing tool, and each added name for forge to find', () => {
    const unticked = ToolListModel.withApproval(ToolListModel.editOf(EXAMPLE_AGENT_TOOLS), 'gh', false);
    const withDocker = ToolListModel.withApproval(unticked, 'docker', true);
    const added = ToolListModel.withAdded(ToolListModel.withAdded(withDocker, EXAMPLE_AGENT_TOOLS, ' pnpm '), EXAMPLE_AGENT_TOOLS, 'bun');
    expect(added.addedTools).toEqual([{ name: 'pnpm', path: null }]);
    expect(ToolListModel.keepCommandOf({ kind: 'pipeline' }, EXAMPLE_AGENT_TOOLS, added)).toEqual({
      ...VERSION,
      kind:  'pipeline-tools-set',
      tools: [{ name: 'git', path: '/usr/bin/git' }, { name: 'bun', path: '/Users/example/.bun/bin/bun' }, { name: 'pnpm', path: null }],
    });
  });

  test('is a draft edit at the draft\'s revision while a setup designs the pipeline', () => {
    const edit = ToolListModel.withAdded(ToolListModel.editOf(EXAMPLE_AGENT_TOOLS), EXAMPLE_AGENT_TOOLS, 'pnpm');
    expect(ToolListModel.keepCommandOf({ kind: 'draft', setupId: 'S1', draftRevision: 3 }, EXAMPLE_AGENT_TOOLS, edit)).toMatchObject({
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 3, isACopy: false, edits: [{ target: 'tools' }]
    });
  });
});

describe('an added tool forge did not find', () => {
  const pnpmAdded = ToolListModel.withAdded(ToolListModel.editOf(EXAMPLE_AGENT_TOOLS), EXAMPLE_AGENT_TOOLS, 'pnpm');
  const pnpmNotFound = { code: 'tool-not-found', fields: { name: 'pnpm', searchedFolders: ['/usr/bin'] } } as const;

  test('is named from forge\'s tool-not-found refusal, and only while it is one of the added tools', () => {
    expect(ToolListModel.unfoundAddedToolOf(pnpmAdded, pnpmNotFound)).toBe('pnpm');
    expect(ToolListModel.unfoundAddedToolOf(pnpmAdded, { code: 'tool-not-found', fields: { name: 'bun' } })).toBeNull();
    expect(ToolListModel.unfoundAddedToolOf(pnpmAdded, { code: 'pipeline-draft-invalid', fields: { name: 'pnpm' } })).toBeNull();
    expect(ToolListModel.unfoundAddedToolOf(pnpmAdded, null)).toBeNull();
  });

  test('is kept at the program User chose, which the list then names as its path', () => {
    const chosen = ToolListModel.withChosenPath(pnpmAdded, 'pnpm', '/Users/example/tools/pnpm');
    expect(ToolListModel.keepCommandOf({ kind: 'pipeline' }, EXAMPLE_AGENT_TOOLS, chosen)).toMatchObject({
      kind:  'pipeline-tools-set',
      tools: [
        { name: 'git', path: '/usr/bin/git' },
        { name: 'bun', path: '/Users/example/.bun/bin/bun' },
        { name: 'gh', path: '/opt/homebrew/bin/gh' },
        { name: 'pnpm', path: '/Users/example/tools/pnpm' },
      ],
    });
  });
});
