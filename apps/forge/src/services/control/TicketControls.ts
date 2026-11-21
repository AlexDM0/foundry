/** The ticket kinds of the control contract, each applied to the Board a `writeTracker` hold carries. */
import { readFileSync }         from 'node:fs';
import { TicketAcceptanceUtil } from '../../adapters/tickets/utils/TicketAcceptanceUtil.ts';

import { BoardRefusal }                       from '../../lib/tracker-model/BoardRefusal.ts';
import { TICKET_STATUSES_USER_READIES }       from '../../lib/tracker-model/constants/Statuses.ts';
import { EntityOwnershipUtil }                from '../../lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { NetworkDomainUtil }                  from '../../lib/tracker-model/utils/NetworkDomainUtil.ts';
import type { ControlCommandOf as CommandOf } from '../../shared/@types/ControlCommand.ts';
import type { ControlContext }                from '../../shared/@types/ControlContext.ts';
import { filledTemplateOf }                   from '../../shared/FilledTemplate.ts';
import { OperationRefusal }                   from '../../shared/OperationRefusal.ts';
import { resourceFilePathOf }                 from '../../shared/ResourceFilePath.ts';
import type { BoardTransaction }              from '../tracker/BoardTransaction.ts';
import { ticketIdOfReference }                from './ControlTicketLookup.ts';

const TICKET_BODY_TEMPLATE_PATH = ['templates', 'TicketBody.md'];

function bodyForNewTicket(bodyText: string | null, ticketId: string, title: string): string {
  if (bodyText !== null && bodyText.trim() !== '') return bodyText;
  return filledTemplateOf(readFileSync(resourceFilePathOf(...TICKET_BODY_TEMPLATE_PATH), 'utf8'), { id: ticketId, title });
}

/** The finders' first group, which a worker's finding joins; `undefined` for any other filing or a finder in no group. */
function finderGroupOf(command: CommandOf<'ticket-add'>, change: BoardTransaction): string | undefined {
  const finderTicketIds = command.admission?.finderTicketIds ?? [];
  return finderTicketIds.map((ticketId) => change.board.ticketByReference(ticketId)?.frontmatter.group).find((group) => group !== undefined);
}

/**
 * The refusals `setTicketNetwork` gives a new ticket, judged before it is filed: the Board keeps no undo, so a relayed filing refused after
 * it would still store the ticket while its reply says refused.
 */
function refuseANetworkTheFilingCannotSet(ticketId: string, domains: readonly string[]): void {
  const requestedDomains = NetworkDomainUtil.normalisedDomainListOf(domains);
  const nonPublicDomains = requestedDomains.filter((domain) => !NetworkDomainUtil.domainIsPublic(domain));
  if (nonPublicDomains.length > 0) throw new BoardRefusal({ reason: 'network-domain-not-public', ticketId, domains: nonPublicDomains });
  if (requestedDomains.length === 0) throw new BoardRefusal({ reason: 'network-unchanged', ticketId, domains: [] });
}

/**
 * On a forge with entities a worker's finding belongs to the entity that owns the paths its Brief names (E83, E53): their single owner, else
 * the finder job's entity. Paths of several owners are then judged as work outside that entity (E85).
 */
function findingEntityOf(command: CommandOf<'ticket-add'>, change: BoardTransaction, body: string): string | undefined {
  const entities = change.board.pipeline()?.entities;
  if (entities === undefined || command.admission === undefined) return undefined;
  const owners = [...new Set(TicketAcceptanceUtil.workFilesOf(body).map((workFile) => EntityOwnershipUtil.ownerOf(entities, workFile)))];
  const [singleOwner] = owners;
  if (owners.length === 1 && singleOwner !== undefined) return singleOwner;
  return change.board.jobById(command.admission.filedByJob)?.entity;
}

/**
 * A worker's finding waits for its finders (`dependsOn`) in their group, and is submitted at once: so it builds only after the finders
 * land, against their code. It is filed for the entity that owns its work, and its Brief's work outside that entity (E85), or a submit that
 * would leave it without one, is refused before it is filed.
 */
function addTicket(command: CommandOf<'ticket-add'>, change: BoardTransaction) {
  const finderTicketIds = command.admission?.finderTicketIds ?? [];
  const group           = command.group ?? finderGroupOf(command, change);
  const ticket = change.records.newTicket({
    title:   command.title,
    type:    command.type,
    ...(command.priority === undefined ? {} : { priority: command.priority }),
    ...(group === undefined ? {} : { group }),
    bodyFor: (ticketId) => bodyForNewTicket(command.bodyText, ticketId, command.title),
    at:      change.at,
  });
  const dependsOn = [...new Set([...command.dependsOn, ...finderTicketIds])];
  if (dependsOn.length > 0) ticket.frontmatter.dependsOn = dependsOn;
  if (command.epics.length > 0) ticket.frontmatter.epics = [...command.epics];
  if (command.introducedBy !== null) ticket.frontmatter.introducedBy = command.introducedBy;
  if (command.foundInReview !== null) ticket.frontmatter.foundInReview = command.foundInReview;
  if (command.size !== undefined) ticket.frontmatter.size = command.size;
  if (command.model !== undefined) ticket.frontmatter.model = command.model;
  if (command.effort !== undefined) ticket.frontmatter.effort = command.effort;
  if (command.admission !== undefined) ticket.frontmatter.filedByJob = command.admission.filedByJob;
  if (command.network.length > 0) refuseANetworkTheFilingCannotSet(ticket.frontmatter.id, command.network);
  if (command.entity !== undefined) {
    change.board.refuseAnUnknownEntity(ticket.frontmatter.id, command.entity);
    ticket.frontmatter.entity = command.entity;
  }
  const findingEntity = finderTicketIds.length === 0 ? undefined : findingEntityOf(command, change, ticket.body);
  if (findingEntity !== undefined) ticket.frontmatter.entity = findingEntity;
  if (finderTicketIds.length > 0 && ticket.frontmatter.status === 'draft') {
    change.board.refuseWorkOutsideTheEntity([ticket], TicketAcceptanceUtil.readinessGapsOf, TicketAcceptanceUtil.workFilesOf);
    change.board.refuseASubmitWithoutAnEntity([ticket], TicketAcceptanceUtil.readinessGapsOf);
  }
  const filing     = change.board.fileTicket(ticket, change.at);
  const networkSet = command.network.length === 0 ? [] : change.board.setTicketNetwork(ticket.frontmatter.id, command.network, change.at).logged;
  const submitted  = finderTicketIds.length === 0 || ticket.frontmatter.status !== 'draft'
    ? []
    : change.board.submitDraftTickets([ticket.frontmatter.id], TicketAcceptanceUtil.readinessGapsOf, change.at, TicketAcceptanceUtil.workFilesOf).logged;
  return { ...filing, logged: [...filing.logged, ...networkSet, ...submitted] };
}

/** Only User readies, a draft or a ticket in `ready-for-review`: no role the Bouncer admits relays `ticket ready`. */
function readyTickets(command: CommandOf<'ticket-ready'>, change: BoardTransaction) {
  const ticketIds = command.ticketReferences.map((reference) => ticketIdOfReference(change, reference));
  return change.board.readyDraftTickets(ticketIds, TicketAcceptanceUtil.readinessGapsOf, change.at, TICKET_STATUSES_USER_READIES, TicketAcceptanceUtil.workFilesOf);
}

/** A stamped `jobId` is the product owner's job, which only the role policy writes; without one the command is User's own. */
function setEntity(command: CommandOf<'ticket-entity'>, change: BoardTransaction) {
  return change.board.setTicketEntity(ticketIdOfReference(change, command.ticketReference), {
    entity: command.entity,
    reason: command.reason,
    by:     command.jobId === undefined ? 'user' : 'product-owner',
  }, change.at);
}

function editTicket(command: CommandOf<'ticket-edit'>, change: BoardTransaction) {
  return change.board.editTicket(ticketIdOfReference(change, command.ticketReference), {
    ...(command.title === undefined ? {} : { title: command.title }),
    ...(command.bodyText === null ? {} : { body: { text: command.bodyText, appends: command.appendsBody } }),
    writtenBy: 'command',
  }, change.at);
}

function setDependencies(command: CommandOf<'ticket-depends'>, change: BoardTransaction) {
  const ticketId = ticketIdOfReference(change, command.ticketReference);
  if (command.edit === 'add') return change.board.addTicketDependencies(ticketId, command.ticketIds, change.at);
  if (command.edit === 'remove') return change.board.removeTicketDependencies(ticketId, command.ticketIds, change.at);
  return change.board.setTicketDependencies(ticketId, command.ticketIds, change.at);
}

function setEpics(command: CommandOf<'ticket-epic'>, change: BoardTransaction) {
  const ticketId = ticketIdOfReference(change, command.ticketReference);
  if (command.edit === 'add') return change.board.addTicketEpics(ticketId, command.epicKeys, change.at);
  if (command.edit === 'remove') return change.board.removeTicketEpics(ticketId, command.epicKeys, change.at);
  return change.board.setTicketEpics(ticketId, command.epicKeys, change.at);
}

function abandonTicket(command: CommandOf<'ticket-abandon'>, change: BoardTransaction) {
  return change.board.moveTicket(ticketIdOfReference(change, command.ticketReference), 'abandoned', {
    checksLegality: true,
    ...(command.branch === undefined ? {} : { branch: command.branch }),
    ...(command.commit === undefined ? {} : { commit: command.commit }),
    ...(command.reason === undefined ? {} : { reason: command.reason }),
    ...(command.tokens === undefined ? {} : { tokens: command.tokens }),
  }, change.at);
}

/**
 * A ticket User finished and landed outside Hephaestus, recorded delivered in the hold, merging, landing and spawning nothing. A live
 * Hephaestus the context names and a live job of the ticket refuse it, both judged inside the hold, so a Hephaestus starting meanwhile reads the
 * ticket delivered or not at all, and on a live board only Hephaestus's own hold records it.
 */
function deliverTicketByHand(command: CommandOf<'ticket-deliver-by-hand'>, change: BoardTransaction, context: ControlContext) {
  const liveHephaestus = context.liveHephaestusOf(change.workspace.trackerDirectory);
  if (liveHephaestus !== null) {
    throw new OperationRefusal('refused', { kind: 'hephaestus-owns-the-lifecycle', url: liveHephaestus.url, batonFilePath: liveHephaestus.batonFilePath });
  }
  const ticketId = ticketIdOfReference(change, command.ticketReference);
  const liveJob  = change.board.liveJobOfTicket(ticketId);
  if (liveJob !== undefined) throw new OperationRefusal('refused', {
    kind: 'ticket-has-live-job', ticketId, jobId: liveJob.id, state: liveJob.state
  });
  return change.board.moveTicket(ticketId, 'delivered', {
    checksLegality: false,
    byHand:         true,
    ...(command.branch === undefined ? {} : { branch: command.branch }),
    ...(command.commit === undefined ? {} : { commit: command.commit }),
  }, change.at);
}

export const TICKET_CONTROLS = {
  'ticket-add':      addTicket,
  'ticket-edit':     editTicket,
  'ticket-depends':  setDependencies,
  'ticket-priority': (command: CommandOf<'ticket-priority'>, change: BoardTransaction) => change.board.setTicketPriority(
    ticketIdOfReference(change, command.ticketReference),
    command.priority,
    change.at,
  ),
  'ticket-epic':    setEpics,
  'ticket-abandon': abandonTicket,
  'ticket-ready':   readyTickets,
  'ticket-submit':  (command: CommandOf<'ticket-submit'>, change: BoardTransaction) => change.board.submitDraftTickets(
    command.ticketReferences.map((reference) => ticketIdOfReference(change, reference)),
    TicketAcceptanceUtil.readinessGapsOf,
    change.at,
    TicketAcceptanceUtil.workFilesOf,
  ),
  'ticket-network': (command: CommandOf<'ticket-network'>, change: BoardTransaction) => change.board.setTicketNetwork(
    ticketIdOfReference(change, command.ticketReference),
    command.domains,
    change.at,
  ),
  'ticket-entity': setEntity,
  'ticket-group':  (command: CommandOf<'ticket-group'>, change: BoardTransaction) => change.board.setTicketGroup(
    ticketIdOfReference(change, command.ticketReference),
    command.group,
    change.at,
  ),
  'ticket-hold': (command: CommandOf<'ticket-hold'>, change: BoardTransaction) => change.board.holdTicket(
    ticketIdOfReference(change, command.ticketReference),
    command.reason,
    change.at,
  ),
  'ticket-unhold': (command: CommandOf<'ticket-unhold'>, change: BoardTransaction) => change.board.unholdTicket(
    ticketIdOfReference(change, command.ticketReference),
    change.at,
  ),
  'ticket-deliver-by-hand': deliverTicketByHand,
} as const;
