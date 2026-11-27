/**
 * What a ticket is set to run with, outside its moves: its priority, which gives or takes its row, its agent pair, its network, the entity
 * it is built in, and its hold.
 */
import type { AgentChoice, EntityAssignment, TicketChanged } from './@types/BoardChanges.ts';
import type {
  AgentPair,
  Ticket,
  TicketPriority,
  TicketSize
} from './@types/Ticket.ts';
import type { BoardRecords }                                               from './BoardRecords.ts';
import { BoardRefusal }                                                    from './BoardRefusal.ts';
import { INTERRUPTED_HOLD_PREFIX }                                         from './constants/DecisionAndIncidentVocabulary.ts';
import { SETTLED_TICKET_STATUSES, TICKET_STATUSES_NO_AGENT_HAS_PICKED_UP } from './constants/Statuses.ts';
import { NetworkDomainUtil }                                               from './utils/NetworkDomainUtil.ts';
import { TicketChartUtil }                                                 from './utils/TicketChartUtil.ts';
import { TicketDefaultsUtil }                                              from './utils/TicketDefaultsUtil.ts';
import { type HoldAction, TicketSettingRuleUtil }                          from './utils/TicketSettingRuleUtil.ts';

export class TicketSettings {
  constructor(private readonly records: BoardRecords) {}

  /**
   * Lowering to low is refused unless the ticket is draft, ready for review or committed, and keeps its row, since priority only orders the
   * queue; raising a low ticket that has no row gives it a row at once, seeded from its stamps when it is no longer committed, the way a
   * clearing would, so an abandoned ticket does not come back as a committed bar.
   */
  setTicketPriority(ticketId: string, priority: TicketPriority, at: string): TicketChanged {
    const ticket          = this.records.requireTicket(ticketId);
    const { frontmatter } = ticket;
    const { status }      = frontmatter;
    const currentPriority = TicketDefaultsUtil.ticketPriorityOf(frontmatter);
    const refusal         = TicketSettingRuleUtil.priorityRefusalOf(frontmatter, priority);
    if (refusal !== null) throw new BoardRefusal(refusal);

    frontmatter.priority = priority;
    const linkedTask     = this.records.linkedTaskRecordOf(ticket);
    // A draft, or a ticket abandoned before it was ever started, has no row at any priority.
    const raisingFilesARow = priority !== 'low' && linkedTask === undefined && !TicketChartUtil.ticketStaysOffTheChart(frontmatter);
    if (raisingFilesARow && status === 'committed') this.records.ensureTaskForTicket(ticket, at);
    else if (raisingFilesARow) this.records.seedTaskFromTicket(ticket);
    this.records.markChanged(ticket);
    return { logged: [this.records.logger.log({ kind: 'ticket-priority-changed', ticketId, fields: { from: currentPriority, to: priority } }, at)], ticket };
  }

  /** Allowed in every status, since a settled ticket's size still feeds the statistics. */
  setTicketSize(ticketId: string, size: TicketSize, at: string): TicketChanged {
    const ticket          = this.records.requireTicket(ticketId);
    const { frontmatter } = ticket;
    const currentSize     = frontmatter.size;
    if (currentSize === size) throw new BoardRefusal({
      reason: 'size-unchanged', ticketId, status: frontmatter.status, size
    });

    frontmatter.size = size;
    this.records.markChanged(ticket);
    const fields = currentSize === undefined ? { to: size } : { from: currentSize, to: size };
    return { logged: [this.records.logger.log({ kind: 'ticket-size-changed', ticketId, fields }, at)], ticket };
  }

  /** Judged on the resolved pair, so naming the default a ticket already runs on is refused as no change. */
  setTicketAgents(ticketId: string, agents: AgentChoice, at: string): TicketChanged {
    const ticket          = this.records.requireTicket(ticketId);
    const { frontmatter } = ticket;
    const { status }      = frontmatter;
    if (SETTLED_TICKET_STATUSES.includes(status)) throw new BoardRefusal({ reason: 'agents-of-a-settled-ticket', ticketId, status });
    const currentAgents: AgentPair   = { model: TicketDefaultsUtil.agentModelOf(frontmatter), effort: TicketDefaultsUtil.agentEffortOf(frontmatter) };
    const requestedAgents: AgentPair = { model: agents.model ?? currentAgents.model, effort: agents.effort ?? currentAgents.effort };
    if (currentAgents.model === requestedAgents.model && currentAgents.effort === requestedAgents.effort) {
      throw new BoardRefusal({
        reason: 'agents-unchanged',
        ticketId,
        status,
        agents: currentAgents,
      });
    }

    if (agents.model !== undefined) frontmatter.model = agents.model;
    if (agents.effort !== undefined) frontmatter.effort = agents.effort;
    this.records.markChanged(ticket);
    return { logged: [this.records.logger.log({ kind: 'ticket-agents-changed', ticketId, fields: { from: currentAgents, to: requestedAgents } }, at)], ticket };
  }

  /**
   * Set only while the ticket is draft or committed, so no agent already at work gains a grant; an empty list clears the line. Every domain
   * must be public, judged after lower-casing, and the line is written only once it names one.
   */
  setTicketNetwork(ticketId: string, domains: readonly string[], at: string): TicketChanged {
    const ticket          = this.records.requireTicket(ticketId);
    const { frontmatter } = ticket;
    const { status }      = frontmatter;
    if (!TicketSettingRuleUtil.networkCanChange(status)) throw new BoardRefusal({ reason: 'network-of-a-ticket-past-committed', ticketId, status });
    const requestedDomains = NetworkDomainUtil.normalisedDomainListOf(domains);
    const nonPublicDomains = requestedDomains.filter((domain) => !NetworkDomainUtil.domainIsPublic(domain));
    if (nonPublicDomains.length > 0) throw new BoardRefusal({ reason: 'network-domain-not-public', ticketId, domains: nonPublicDomains });
    const currentDomains = frontmatter.network ?? [];
    if (requestedDomains.join(',') === currentDomains.join(',')) throw new BoardRefusal({ reason: 'network-unchanged', ticketId, domains: currentDomains });

    if (requestedDomains.length === 0) delete frontmatter.network;
    else frontmatter.network = requestedDomains;
    this.records.markChanged(ticket);
    return { logged: [this.records.logger.log({ kind: 'ticket-network-set', ticketId, fields: { domains: requestedDomains } }, at)], ticket };
  }

  /** A key the pipeline's entities do not name is refused, and so is any key when the pipeline names no entity. */
  refuseAnUnknownEntity(ticketId: string, entity: string): void {
    const entityKeys = Object.keys(this.records.pipeline?.entities ?? {});
    if (!entityKeys.includes(entity)) throw new BoardRefusal({
      reason: 'unknown-entity', ticketId, entity, entityKeys
    });
  }

  /**
   * Set only while no agent has claimed the ticket, as its network is; `updated` is not stamped, and the reason is logged, never stored.
   * Hephaestus acting on User's answer to `work-in-other-entity` moves a started ticket too, so its next build starts afresh there.
   */
  setTicketEntity(ticketId: string, assignment: EntityAssignment, at: string, options: { allowsPastCommitted?: boolean } = {}): TicketChanged {
    const ticket          = this.records.requireTicket(ticketId);
    const { frontmatter } = ticket;
    const { status }      = frontmatter;
    this.refuseAnUnknownEntity(ticketId, assignment.entity);
    if (options.allowsPastCommitted !== true && !TICKET_STATUSES_NO_AGENT_HAS_PICKED_UP.includes(status)) {
      throw new BoardRefusal({ reason: 'entity-of-a-ticket-past-committed', ticketId, status });
    }
    if (frontmatter.entity === assignment.entity) throw new BoardRefusal({ reason: 'entity-unchanged', ticketId, entity: assignment.entity });
    if (assignment.reason.trim() === '') throw new BoardRefusal({ reason: 'entity-without-reason', ticketId });

    frontmatter.entity = assignment.entity;
    this.records.markChanged(ticket);
    const fields = { entity: assignment.entity, reason: assignment.reason, by: assignment.by };
    return { logged: [this.records.logger.log({ kind: 'entity-assigned', ticketId, fields }, at)], ticket };
  }

  /** An empty reason still holds: the hold is the key's presence, not its text. */
  holdTicket(ticketId: string, reason: string, at: string): TicketChanged {
    const ticket = this.records.requireTicket(ticketId);
    refuseAHoldChange(ticket, 'hold');
    ticket.frontmatter.hold = reason;
    this.records.markChanged(ticket);
    return { logged: [this.records.logger.log({ kind: 'ticket-held', ticketId, fields: { reason } }, at)], ticket };
  }

  unholdTicket(ticketId: string, at: string): TicketChanged {
    const ticket = this.records.requireTicket(ticketId);
    refuseAHoldChange(ticket, 'unhold');
    delete ticket.frontmatter.hold;
    this.records.markChanged(ticket);
    return { logged: [this.records.logger.log({ kind: 'ticket-unheld', ticketId, fields: {} }, at)], ticket };
  }

  /**
   * User's resume of a ticket an interruption held: the `interrupted:` hold goes with no `ticket-unheld`, so its failed passes and its
   * builder's returns are kept and no fresh attempt starts. Any other hold, or none, is refused `ticket-not-interrupted`.
   */
  liftInterruptedHold(ticketId: string, at: string): TicketChanged {
    const ticket   = this.records.requireTicket(ticketId);
    const { hold } = ticket.frontmatter;
    if (hold?.startsWith(INTERRUPTED_HOLD_PREFIX) !== true) throw new BoardRefusal({ reason: 'ticket-not-interrupted', ticketId });
    delete ticket.frontmatter.hold;
    this.records.markChanged(ticket);
    return { logged: [this.records.logger.log({ kind: 'ticket-interrupted-hold-lifted', ticketId, fields: { hold } }, at)], ticket };
  }
}

function refuseAHoldChange(ticket: Readonly<Ticket>, action: HoldAction): void {
  const refusal = TicketSettingRuleUtil.holdRefusalOf(ticket.frontmatter, action);
  if (refusal !== null) throw new BoardRefusal(refusal);
}
