/**
 * `ticket group` puts an existing ticket into a group, so a ticket already in flight can join the group its dependents' fix tickets are filed
 * in and land on its branch: it gains the `group` line and one `ticket-grouped` log line, while the refusals of a filing's group, an already
 * grouped or a settled ticket and an incomplete usage leave the ticket file and the log as they were.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join }                      from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
}                                             from 'bun:test';
import { PRODUCT_NAMES }                          from '../../src/shared/constants/ProductNames.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../src/testing/ToolGuard.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { runCommandLineWithHephaestusMoves }      from '../testing/HephaestusTicketMoves.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';
import { fileReadyTicket }                        from '../testing/ReadyTicketFiling.ts';
import { storedLogEntriesOf }                     from '../testing/StoredLogEntries.ts';

const FROZEN_NOW = new Date('2026-11-18T09:15:00Z');
const GROUP = 'checkout-redesign';

let repositoryDirectory = '';

async function runWithExitCode(commandLineArguments: readonly string[], expectedExitCode: number): Promise<ReturnType<typeof createCapturedCommandContext>> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const exitCode = await runCommandLineWithHephaestusMoves(commandLineArguments, context);
  expect(exitCode, `\`${PRODUCT_NAMES.PROGRAM} ${commandLineArguments.join(' ')}\`: ${context.errorText()}`).toBe(expectedExitCode);
  return context;
}

async function run(commandLineArguments: readonly string[]): Promise<ReturnType<typeof createCapturedCommandContext>> {
  return await runWithExitCode(commandLineArguments, 0);
}

function storedTicketText(identifier: string): string {
  const ticketRecordsFolder = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'tickets');
  const fileName = readdirSync(ticketRecordsFolder).find((name) => name.startsWith(`${identifier}-`));
  if (fileName === undefined) throw new Error(`no ticket file for #${identifier}`);
  return readFileSync(join(ticketRecordsFolder, fileName), 'utf8');
}

/** The ticket file and the log stay as they were: the refusal wrote nothing. */
async function expectRefusedWritingNothing(commandLineArguments: readonly string[], ticketId: string, wording: string): Promise<void> {
  const ticketBefore = storedTicketText(ticketId);
  const logBefore    = storedLogEntriesOf(repositoryDirectory);
  const refusal = await runWithExitCode(commandLineArguments, 1);
  expect(refusal.errorText()).toContain(wording);
  expect(storedTicketText(ticketId)).toBe(ticketBefore);
  expect(storedLogEntriesOf(repositoryDirectory)).toEqual(logBefore);
}

const recordedGit = useRecordedGit();

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('ticket-group', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('putting a ticket into a group', () => {
  test('a committed ticket gains the group line and one ticket-grouped log line, and updated is not stamped', async () => {
    await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Example cart']);
    const updatedLine = /\nupdated: .*\n/u.exec(storedTicketText('001'))?.[0];

    expect((await run(['ticket', 'group', '1', GROUP])).outputText()).toContain(`Ticket #001 in group ${GROUP}`);

    expect(storedTicketText('001')).toContain(`\ngroup: "${GROUP}"\n`);
    expect(/\nupdated: .*\n/u.exec(storedTicketText('001'))?.[0]).toBe(updatedLine);
    expect(storedLogEntriesOf(repositoryDirectory).at(-1)?.text).toBe(`Ticket #001 in group ${GROUP}`);
  });

  test('E26: a started ticket joins a group too, so a crossing ticket in flight can join its fix tickets\' group', async () => {
    await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Example cart']);
    await run(['ticket', 'status', '1', 'in-progress']);

    const output = (await run(['ticket', 'group', '1', GROUP, '--json'])).outputText();

    expect(JSON.parse(output)).toMatchObject({ id: '001', status: 'in-progress', group: GROUP });
    expect(storedTicketText('001')).toContain(`\ngroup: "${GROUP}"\n`);
  });

  test('a ticket already in a group is refused at exit 1, writing nothing', async () => {
    await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Example cart', '--group', 'example-shop']);

    await expectRefusedWritingNothing(['ticket', 'group', '1', GROUP], '001',
      'Ticket #001 is already in group example-shop, and a ticket stays in the group it is in. Nothing was written.');
  });

  test('a delivered or abandoned ticket is refused at exit 1, writing nothing', async () => {
    await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Example cart']);
    await run(['ticket', 'abandon', '1', '--reason', 'Example Agency dropped it']);

    await expectRefusedWritingNothing(['ticket', 'group', '1', GROUP], '001', 'Ticket #001 is abandoned, and it was not put into a group');
  });

  test('a name a filing\'s group refuses is refused the same way, writing nothing', async () => {
    await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Example checkout']);

    await expectRefusedWritingNothing(['ticket', 'group', '1', 'Example_Shop'], '001', '"Example_Shop" is not a usable group name');
  });

  test.each([
    ['no name', ['ticket', 'group', '1']],
    ['no ticket', ['ticket', 'group']],
  ])('ticket group with %s is refused by its usage at exit 1', async (_case, commandLineArguments) => {
    await run(['ticket', 'add', '--type', 'ticket', 'Example cart']);
    const refusal = await runWithExitCode(commandLineArguments, 1);
    expect(refusal.errorText()).toContain(`${PRODUCT_NAMES.PROGRAM} ticket group needs a ticket id and a group name.`);
    expect(refusal.errorText()).toContain('group <id> <name> [--at <when>] [--json]');
  });
});
