import { TicketJsonUtil }               from '../../src/adapters/utils/TicketJsonUtil.ts';
import type { Ticket, TicketStatus }    from '../../src/domain/tracker-model/@types/Ticket.ts';
import { TicketDefaultsUtil }           from '../../src/domain/tracker-model/utils/TicketDefaultsUtil.ts';
import { TicketIdUtil }                 from '../../src/domain/tracker-model/utils/TicketIdUtil.ts';
import type { TicketListing }           from '../../src/services/tracker/@types/BoardRecords.ts';
import { OperationRefusal }             from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                from '../../src/shared/constants/ProductNames.ts';
import { TIMESTAMP_SLICES }             from '../../src/shared/constants/TimestampSlices.ts';
import { boardReadsOf }                 from '../BoardStoreOf.ts';
import type { CommandContext }          from '../CommandContext.ts';
import type { ArgumentParser }          from '../arguments/ArgumentParser.ts';
import { OutputUtil }                   from '../utils/OutputUtil.ts';
import type { TicketSubcommandHandler } from './@types/TicketSubcommandHandler.ts';
import { listAllTickets }               from './TicketList.ts';
import { TICKET_USAGE }                 from './constants/TicketUsage.ts';
import { TicketLookupUtil }             from './utils/TicketLookupUtil.ts';

const SHOW_OPTION_NAMES = ['json'];

/** `ticket show` changes nothing, so it reads the tickets as they are, with no lock and no Board; found by frontmatter `id`, never by storage. */
function requireTicketToShow(listing: TicketListing, reference: string): Ticket {
  const identifier = TicketIdUtil.parseTicketReference(reference);
  const ticket     = identifier === null ? undefined : listing.tickets.find((candidate) => candidate.frontmatter.id === identifier);
  return ticket ?? TicketLookupUtil.refuseAMissingTicket(reference, listing.unreadable);
}

function stampText(stamp: string): string {
  return stamp.slice(0, TIMESTAMP_SLICES.DATE_AND_CLOCK_LENGTH_CHARACTERS).replace('T', ' ');
}

function summaryOf(ticket: Ticket, statusById: ReadonlyMap<string, TicketStatus>): string {
  const { frontmatter } = ticket;
  const dependencies    = (frontmatter.dependsOn ?? []).map((identifier) => `#${identifier} (${statusById.get(identifier) ?? 'missing'})`);
  return [
    `Ticket #${frontmatter.id}: ${frontmatter.title}`,
    `  status:   ${frontmatter.status}`,
    `  priority: ${TicketDefaultsUtil.ticketPriorityOf(frontmatter)}`,
    ...(frontmatter.model === undefined ? [] : [`  model:    ${frontmatter.model}`]),
    ...(frontmatter.effort === undefined ? [] : [`  effort:   ${frontmatter.effort}`]),
    ...(frontmatter.hold === undefined ? [] : [`  held:     ${frontmatter.hold === '' ? 'yes' : frontmatter.hold}`]),
    `  type:     ${frontmatter.type}`,
    `  group:    ${frontmatter.group ?? '-'}`,
    ...(frontmatter.epics === undefined ? [] : [`  epics:    ${frontmatter.epics.join(', ')}`]),
    `  task:     ${frontmatter.task === null ? '-' : `#${frontmatter.task}`}`,
    `  waits on: ${dependencies.length === 0 ? '-' : dependencies.join(', ')}`,
    `  filed:    ${stampText(frontmatter.filed)}`,
    `  updated:  ${stampText(frontmatter.updated)}`,
    `  branch:   ${frontmatter.branch ?? '-'}`,
    `  commit:   ${frontmatter.commit ?? '-'}`,
    `  reason:   ${frontmatter.reason ?? '-'}`,
  ].join('\n');
}

async function showOneTicket(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  commandArguments.rejectUnknownOptions(SHOW_OPTION_NAMES, TICKET_USAGE);
  commandArguments.rejectExtraPositionals(2, TICKET_USAGE);

  const reference = commandArguments.positionals()[1];
  if (reference === undefined) {
    throw new OperationRefusal('refused', `${PRODUCT_NAMES.PROGRAM} ticket show needs a ticket id.\n  Usage: ${TICKET_USAGE}`);
  }

  const listing    = boardReadsOf(context).listTickets();
  const ticket     = requireTicketToShow(listing, reference);
  const statusById = new Map(listing.tickets.map((candidate) => [candidate.frontmatter.id, candidate.frontmatter.status]));
  OutputUtil.printEntity(commandArguments, context, TicketJsonUtil.ticketAsJson(ticket), `${summaryOf(ticket, statusById)}\n\n${ticket.body}`);
}

export const TICKET_READING_SUBCOMMANDS: Readonly<Record<string, TicketSubcommandHandler>> = { list: listAllTickets, show: showOneTicket };
