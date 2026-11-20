/**
 * Files a ticket the way one meant to be built is filed: `ticket add`, the sections `ticket ready` asks for appended to the filed body with
 * `ticket edit --append` when it lacks them, then `ticket ready`, so a spec of a later move starts from a `pending` ticket with its row rather
 * than a draft. No file is edited by hand.
 */
const ACCEPTANCE_SECTION    = '\n## Acceptance\n\nA1. The example holds.\n';
const BRIEF_SECTION         = '\n## Brief\n\nBuild the example as Alex Example asked.\n';
const NUMBERED_ITEM_PATTERN = /^A\d+\./m;
const BRIEF_HEADING_PATTERN = /^## Brief[ \t]*$/m;
const FILED_TICKET_PATTERN  = /Ticket #(\d+) filed|"id": "(\d+)"/;

/** `ticket add` arguments giving a ticket the numbered Acceptance and the Brief `ticket ready` asks for, for a setup listing its commands. */
export const READY_TICKET_BODY_ARGUMENTS = ['--body', `${ACCEPTANCE_SECTION}${BRIEF_SECTION}`.trimStart()] as const;

/** The id of the ticket a `ticket add` output names, in human output and `--json` alike. */
export function filedTicketIdOf(addOutput: string): string {
  const filedTicket = FILED_TICKET_PATTERN.exec(addOutput);
  const ticketId    = filedTicket?.[1] ?? filedTicket?.[2];
  if (ticketId === undefined) throw new Error(`No filed ticket is named in the ticket add output: ${addOutput}`);
  return ticketId;
}

/** The numbered Acceptance and the Brief a body lacks, in that order; empty when it holds both. */
function sectionsMissingForReadinessOf(body: string): string {
  return [
    ...(NUMBERED_ITEM_PATTERN.test(body) ? [] : [ACCEPTANCE_SECTION]),
    ...(BRIEF_HEADING_PATTERN.test(body) ? [] : [BRIEF_SECTION]),
  ].join('');
}

/** Runs `ticket add` and `ticket ready` through the spec's own Overseer, which fails the spec on a non-zero exit; resolves to the filing's result. */
export async function fileReadyTicketThrough<Result>(
  runCommand: (commandLineArguments: readonly string[]) => Promise<Result>,
  outputOf: (result: Result) => string,
  addArguments: readonly string[],
): Promise<Result> {
  const filing   = await runCommand(addArguments);
  const ticketId = filedTicketIdOf(outputOf(filing));
  const { body } = JSON.parse(outputOf(await runCommand(['ticket', 'show', ticketId, '--json']))) as { body: string };
  const missingSections = sectionsMissingForReadinessOf(body);
  if (missingSections !== '') await runCommand(['ticket', 'edit', ticketId, '--append', '--body', missingSections]);
  await runCommand(['ticket', 'ready', ticketId]);
  return filing;
}

/** `fileReadyTicketThrough` for an Overseer resolving to the captured command context. */
export async function fileReadyTicket<Context extends { outputText: () => string }>(
  runCommand: (commandLineArguments: readonly string[]) => Promise<Context>,
  addArguments: readonly string[],
): Promise<Context> {
  return await fileReadyTicketThrough(runCommand, (context) => context.outputText(), addArguments);
}
