/**
 * The Airlock of a target on the board (design section 6.2): which queued tickets are its candidates, the claim that launches the one
 * merge job holding it, and the `merge-started` and `merge-landed` records. Git stays outside: tips and predictions arrive as values.
 */
import type { JobChanged, Logged }     from './@types/BoardChanges.ts';
import type { Decision }               from './@types/Decision.ts';
import type { Job, LandingKind }       from './@types/Job.ts';
import type { Ticket, TicketPriority } from './@types/Ticket.ts';
import type { BoardRecords }           from './BoardRecords.ts';
import { BoardRefusal }                from './BoardRefusal.ts';
import type { Jobs }                   from './Jobs.ts';
import type { MergeQueueMarks }        from './MergeQueueMarks.ts';
import { ReleaseBundleUtil }           from './utils/ReleaseBundleUtil.ts';
import { TicketDefaultsUtil }          from './utils/TicketDefaultsUtil.ts';

/** What a ticket's merge target is read from: its group, and whether it releases that group onto the main line. */
export interface MergeTargetTicket {
  group?:         string;
  releasesGroup?: boolean;
}

/** Maps a ticket to its target, so the tracker model needs no branch names. */
export type MergeTargetOf = (ticket: Readonly<MergeTargetTicket>) => string;

/** The tree of a ticket's branch HEAD as git reads it, `null` when it cannot be read; the tracker model reads no git. */
export type BranchTreeOf = (ticketId: string) => string | null;

export interface TicketAwaitingGreen {
  ticketId: string;
  queued:   boolean;
}

/** A group refresh: main's tip merged into a checkout of the group's tip, landed on the group's branch. */
export interface RefreshSlotClaim {
  group:     string;
  target:    string;
  targetTip: string;
  mainTip:   string;
}

/** An Apply's constitution commit: a commit of `CONSTITUTION.md` on the main line's tip, landed on the main line with no gate. */
export interface ConstitutionCommitSlotClaim {
  setupId:   string;
  target:    string;
  targetTip: string;
}

export interface MergeCandidate {
  ticketId:  string;
  priority:  TicketPriority;
  /**
   * Its readiness to land: the log position of the ticket's last `merge-queued` record. With merge approval on, a candidate's is the
   * position of User's last accept (`merge-acceptance-set`, `accepted`), so the press order sets the train.
   */
  readiness: number;
}

export interface AirlockClaim {
  ticketId:               string;
  target:                 string;
  targetTip:              string;
  branchTip:              string;
  predictedConflictFiles: readonly string[];
}

export interface MergeLanding {
  target: string;
  commit: string;
  kind:   LandingKind;
}

/** The decisions naming a queued ticket that keep it out of its slot until User answers. */
const SLOT_HOLDING_DECISION_KINDS: readonly Decision['kind'][] = ['waiver', 'landing-refused'];

const SLOT_HOLDING_JOB_KINDS: readonly Job['kind'][] = ['merge', 'refresh', 'constitution-commit'];

export const MERGE_PRIORITY_RANK: Readonly<Record<TicketPriority, number>> = { high: 0, normal: 1, low: 2 };

export class AirlockClaims {
  constructor(private readonly records: BoardRecords, private readonly jobRules: Jobs, private readonly mergeQueueMarks: MergeQueueMarks) {}

  /** The live merge, refresh or constitution commit job holding the target's slot, if any. */
  slotHolderOf(target: string): Readonly<Job> | undefined {
    return this.jobRules.jobs().find((job) => SLOT_HOLDING_JOB_KINDS.includes(job.kind) && job.target === target);
  }

  /**
   * A queued ticket is a candidate only while its green is current: the Overseer gated its branch HEAD's tree green under the current
   * pipeline. A group's release ticket is a candidate only once the rest of its bundle integrated, and carries the bundle's highest priority.
   * With merge approval on, only a ticket User accepted is a candidate.
   */
  mergeCandidatesOf(target: string, targetOf: MergeTargetOf, branchTreeOf: BranchTreeOf): MergeCandidate[] {
    if (!this.mergeApprovalIsOn()) return this.queuedGreenTicketsOf(target, targetOf, branchTreeOf, this.queuedPositionByTicketId());
    return this.queuedGreenTicketsOf(target, targetOf, branchTreeOf, this.acceptPositionByTicketId())
      .filter((candidate) => this.mergeQueueMarks.ticketIsMergeAccepted(candidate.ticketId));
  }

  /** With merge approval on: the tickets that would be candidates but wait for User's accept. Empty with merge approval off. */
  ticketsWaitingForMergeOf(target: string, targetOf: MergeTargetOf, branchTreeOf: BranchTreeOf): MergeCandidate[] {
    if (!this.mergeApprovalIsOn()) return [];
    return this.queuedGreenTicketsOf(target, targetOf, branchTreeOf, this.queuedPositionByTicketId())
      .filter((candidate) => !this.mergeQueueMarks.ticketIsMergeAccepted(candidate.ticketId));
  }

  private queuedGreenTicketsOf(
    target: string, targetOf: MergeTargetOf, branchTreeOf: BranchTreeOf, readinessByTicketId: ReadonlyMap<string, number>
  ): MergeCandidate[] {
    return this.queuedOrAwaitingTicketsOf(target, targetOf)
      .filter((ticket) => this.records.linkedTaskRecordOf(ticket)?.mergeQueued === true)
      .filter(({ frontmatter }) => this.ownGreenIsCurrent(frontmatter.id, branchTreeOf))
      .filter((ticket) => this.releaseBundleIsIntegrated(ticket, targetOf))
      .map((ticket) => ({
        ticketId:  ticket.frontmatter.id,
        priority:  this.mergePriorityOf(ticket),
        readiness: readinessByTicketId.get(ticket.frontmatter.id) ?? -1,
      }));
  }

  private mergeApprovalIsOn(): boolean {
    return this.records.pipeline?.approvals?.merge === true;
  }

  private queuedPositionByTicketId(): Map<string, number> {
    const positionByTicketId = new Map<string, number>();
    [...this.records.storedLogRecords, ...this.records.loggedRecords].forEach((record, position) => {
      if (record.kind === 'merge-queued') positionByTicketId.set(record.ticketId, position);
    });
    return positionByTicketId;
  }

  /** User's newest accept of each ticket; a ticket with none waits for its accept and is no candidate. */
  private acceptPositionByTicketId(): Map<string, number> {
    const positionByTicketId = new Map<string, number>();
    [...this.records.storedLogRecords, ...this.records.loggedRecords].forEach((record, position) => {
      if (record.kind === 'merge-acceptance-set' && record.fields.state === 'accepted') positionByTicketId.set(record.ticketId, position);
    });
    return positionByTicketId;
  }

  /**
   * The tickets that wait for the Overseer outside the Airlock: a queued one whose green is stale, since its tree or the pipeline changed,
   * and, with no review phase, one in review and not queued, which only a current green queues.
   */
  ticketsAwaitingGreenOf(target: string, targetOf: MergeTargetOf, branchTreeOf: BranchTreeOf): TicketAwaitingGreen[] {
    const reviewIsSet = this.records.pipeline?.review !== undefined;
    const incidents   = this.records.progress.incidents ?? [];
    const decisions   = this.records.progress.decisions ?? [];
    return this.queuedOrAwaitingTicketsOf(target, targetOf)
      .filter(({ frontmatter }) => !incidents.some((incident) => incident.ticketIds.includes(frontmatter.id)))
      .filter(({ frontmatter }) => !decisions.some((decision) => decision.ticketIds.includes(frontmatter.id)))
      .map((ticket) => ({ ticketId: ticket.frontmatter.id, queued: this.records.linkedTaskRecordOf(ticket)?.mergeQueued === true }))
      .filter(({ ticketId, queued }) => (queued ? !this.ownGreenIsCurrent(ticketId, branchTreeOf) : !reviewIsSet));
  }

  /** The ticket's green is current on its branch tree in the phase it was taken in. */
  private ownGreenIsCurrent(ticketId: string, branchTreeOf: BranchTreeOf): boolean {
    return this.mergeQueueMarks.greenIsCurrent(ticketId, branchTreeOf(ticketId), this.mergeQueueMarks.greenPhaseOf(ticketId));
  }

  /** In review on the target, with no hold, no job and no decision that keeps it out of its slot. */
  private queuedOrAwaitingTicketsOf(target: string, targetOf: MergeTargetOf): Ticket[] {
    const decisions = this.records.progress.decisions ?? [];
    return this.records.ticketRecords
      .filter(({ frontmatter }) => frontmatter.status === 'in-review' && frontmatter.hold === undefined && targetOf(frontmatter) === target)
      .filter(({ frontmatter }) => !decisions.some((decision) => SLOT_HOLDING_DECISION_KINDS.includes(decision.kind) && decision.ticketIds.includes(frontmatter.id)))
      .filter(({ frontmatter }) => !this.jobRules.jobs().some((job) => job.ticketIds.includes(frontmatter.id)));
  }

  /** The group's open release ticket and every ticket of the group it reaches through `dependsOn`; empty without a release ticket. */
  releaseBundleOf(group: string): Ticket[] {
    const groupTickets = this.records.ticketRecords.filter((ticket) => ticket.frontmatter.group === group).map((ticket) => ({
      id:            ticket.frontmatter.id,
      status:        ticket.frontmatter.status,
      dependsOn:     ticket.frontmatter.dependsOn ?? [],
      releasesGroup: ticket.frontmatter.releasesGroup === true,
      ticket,
    }));
    const releaseTicket = ReleaseBundleUtil.releaseTicketOf(groupTickets);
    return releaseTicket === undefined ? [] : ReleaseBundleUtil.bundleOf(groupTickets, releaseTicket).map((member) => member.ticket);
  }

  /** So a refresh and a release never merge main into the group's work at the same time. */
  releaseIsQueuedOrSlotted(group: string): string | null {
    const releaseTicket = this.releaseBundleOf(group).find((ticket) => ticket.frontmatter.releasesGroup === true);
    if (releaseTicket === undefined) return null;
    const queued  = this.records.linkedTaskRecordOf(releaseTicket)?.mergeQueued === true;
    const slotted = this.jobRules.jobs().some((job) => job.kind === 'merge' && job.ticketIds.includes(releaseTicket.frontmatter.id));
    return queued || slotted ? releaseTicket.frontmatter.id : null;
  }

  /** Refused while the group's slot is held, so there are never two refreshes, and once its release ticket is queued or slotted. */
  claimRefreshSlot(claim: RefreshSlotClaim, at: string): JobChanged {
    this.refuseWhileTheSlotIsHeld(claim.target);
    const releaseTicketId = this.releaseIsQueuedOrSlotted(claim.group);
    if (releaseTicketId !== null) throw new BoardRefusal({ reason: 'refresh-beside-a-queued-release', group: claim.group, releaseTicketId });
    const attempts = [...this.records.storedLogRecords, ...this.records.loggedRecords]
      .filter((record) => record.kind === 'job-launched' && record.fields.kind === 'refresh' && record.fields.target === claim.target).length;
    const launched = this.jobRules.launchJob({
      kind: 'refresh', role: null, ticketIds: [], parentJobId: null, attempt: attempts + 1, target: claim.target,
    }, at);
    return this.holdSlot(launched, { ...claim, branchTip: claim.mainTip, predictedConflictFiles: [] }, at);
  }

  /**
   * Refused while the target's slot is held. The job holds the slot from its first phase, `committing`, and its slot's branch tip is the
   * target tip it commits on; it logs no `merge-started`, since it merges nothing.
   */
  claimConstitutionCommitSlot(claim: ConstitutionCommitSlotClaim, at: string): JobChanged {
    this.refuseWhileTheSlotIsHeld(claim.target);
    const attempts = [...this.records.storedLogRecords, ...this.records.loggedRecords]
      .filter((record) => record.kind === 'job-launched' && record.fields.kind === 'constitution-commit').length;
    const launched = this.jobRules.launchJob({
      kind: 'constitution-commit', role: null, ticketIds: [], parentJobId: null, attempt: attempts + 1, target: claim.target,
    }, at);
    this.jobRules.moveJob(launched.job.id, 'merging', at);
    const job = this.jobRules.setJobSlot(launched.job.id, {
      target: claim.target, targetTip: claim.targetTip, branchTip: claim.targetTip, phase: 'committing'
    });
    return { job, logged: launched.logged };
  }

  /**
   * Re-derives the queue inside the hold: refused while the slot is held, for a ticket no longer queued, and `higher-priority-queued` when
   * a candidate of a strictly higher rank waits, since the prediction ran outside the lock. With merge approval on, User's press order
   * alone sets the train, so no priority refuses a claim. Launches the merge job, holding the slot.
   */
  claimAirlock(claim: AirlockClaim, targetOf: MergeTargetOf, branchTreeOf: BranchTreeOf, at: string): JobChanged {
    this.refuseWhileTheSlotIsHeld(claim.target);
    const candidates = this.mergeCandidatesOf(claim.target, targetOf, branchTreeOf);
    const claimed    = candidates.find((candidate) => candidate.ticketId === claim.ticketId);
    if (claimed === undefined) throw new BoardRefusal({ reason: 'merge-candidate-not-queued', ticketId: claim.ticketId, target: claim.target });
    const higher = this.mergeApprovalIsOn() ? [] : candidates.filter((candidate) => MERGE_PRIORITY_RANK[candidate.priority] < MERGE_PRIORITY_RANK[claimed.priority]);
    if (higher.length > 0) throw new BoardRefusal({ reason: 'higher-priority-queued', ticketId: claim.ticketId, queuedTicketIds: higher.map((candidate) => candidate.ticketId) });

    const launched = this.jobRules.launchJob({
      kind: 'merge', role: null, ticketIds: [claim.ticketId], parentJobId: null, attempt: this.mergeAttemptsOf(claim.ticketId) + 1, target: claim.target,
    }, at);
    return this.holdSlot(launched, claim, at);
  }

  private refuseWhileTheSlotIsHeld(target: string): void {
    const holder = this.slotHolderOf(target);
    if (holder !== undefined) throw new BoardRefusal({ reason: 'airlock-held', target, jobId: holder.id });
  }

  private holdSlot(launched: JobChanged, claim: Omit<AirlockClaim, 'ticketId'>, at: string): JobChanged {
    this.jobRules.moveJob(launched.job.id, 'merging', at);
    const job = this.jobRules.setJobSlot(launched.job.id, {
      target: claim.target, targetTip: claim.targetTip, branchTip: claim.branchTip, phase: 'merge-in'
    });
    const started = this.records.logger.log({
      kind:   'merge-started',
      jobId:  job.id,
      fields: {
        target: claim.target, targetTip: claim.targetTip, branchTip: claim.branchTip, predictedConflictFiles: [...claim.predictedConflictFiles]
      },
    }, at);
    return { job, logged: [...launched.logged, started] };
  }

  recordMergeLanded(jobId: string, landing: MergeLanding, at: string): Logged {
    return { logged: [this.records.logger.log({ kind: 'merge-landed', jobId, fields: { target: landing.target, commit: landing.commit, kind: landing.kind } }, at)] };
  }

  /** Every tip the Overseer landed on the target, from the stored log and this hold's records. */
  recordedLandingsOn(target: string): string[] {
    return [...this.records.storedLogRecords, ...this.records.loggedRecords]
      .flatMap((record) => (record.kind === 'merge-landed' && record.fields.target === target ? [record.fields.commit] : []));
  }

  /** A release waits for the rest of its bundle, and for a refresh holding its group's slot, so the two never merge main at once. */
  private releaseBundleIsIntegrated(ticket: Readonly<Ticket>, targetOf: MergeTargetOf): boolean {
    const { group, releasesGroup } = ticket.frontmatter;
    if (group === undefined || releasesGroup !== true) return true;
    if (this.slotHolderOf(targetOf({ group }))?.kind === 'refresh') return false;
    return this.releaseBundleOf(group)
      .filter((member) => member !== ticket)
      .every((member) => member.frontmatter.status === 'reviewed' || member.frontmatter.status === 'delivered');
  }

  private mergePriorityOf(ticket: Readonly<Ticket>): TicketPriority {
    const { group, releasesGroup } = ticket.frontmatter;
    const members = group === undefined || releasesGroup !== true ? [ticket] : this.releaseBundleOf(group);
    return members.map((member) => TicketDefaultsUtil.ticketPriorityOf(member.frontmatter))
      .reduce((highest, priority) => (MERGE_PRIORITY_RANK[priority] < MERGE_PRIORITY_RANK[highest] ? priority : highest), TicketDefaultsUtil.ticketPriorityOf(ticket.frontmatter));
  }

  private mergeAttemptsOf(ticketId: string): number {
    return [...this.records.storedLogRecords, ...this.records.loggedRecords]
      .filter((record) => record.kind === 'job-launched' && record.fields.kind === 'merge' && record.fields.ticketIds.includes(ticketId)).length;
  }
}
