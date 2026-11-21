/**
 * The controls on a ticket's detail: the moves the forge offers the ticket now, and the merge wait a ticket waiting for merge shows. Which
 * move is open is the forge's, served in the ticket's offers; nothing here reads the ticket's status to decide it.
 */
import type { BoardDocument }                                from '../../../@types/board/BoardDocument.ts';
import type { BoardTicketDocument }                          from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardOfferedCommandKind, BoardTicketPriority } from '../../../@types/board/BoardVocabulary.ts';

/** What the panel offers; each is a board command the forge applies or refuses. */
export interface DetailControlsModel {
  /** `ticket-ready` is offered. */
  readonly readies:         boolean;
  /** `ticket-unhold` while it is offered, else `ticket-hold` while that is, `null` when neither is. */
  readonly holdMove:        'hold' | 'unhold' | null;
  /** `ticket-park` is offered. */
  readonly parks:           boolean;
  /** `ticket-network` is offered. */
  readonly setsNetwork:     boolean;
  /** The domains stored now, which the network control starts from. */
  readonly network:         readonly string[];
  /** The priorities `ticket-priority` may move the ticket to, highest first, never the one it runs at; empty while it is not offered. */
  readonly priorityChoices: readonly BoardTicketPriority[];
  /** `ticket-deliver-by-hand` is offered, for work User landed outside the Overseer. */
  readonly deliversByHand:  boolean;
  /** Written only while the ticket waits for merge: `merge-accept` and `merge-update`. */
  readonly mergeWait?:      MergeWaitModel;
}

/** Git's prediction of the waiting ticket's merge into its target's current tip, and which of its moves the forge offers. */
export interface MergeWaitModel {
  readonly target:          string;
  readonly predictionText:  string;
  readonly conflictedFiles: readonly string[];
  /** `merge-accept` is offered: only for a clean prediction with merge approval on. */
  readonly accepts:         boolean;
  /** `merge-update` is offered: refused while a job works on the ticket. */
  readonly updates:         boolean;
}

function offers(ticket: BoardTicketDocument, kind: BoardOfferedCommandKind): boolean {
  return ticket.offers.kinds.includes(kind);
}

function mergeWaitOf(mergeQueue: BoardDocument['mergeQueue'], ticket: BoardTicketDocument): Pick<DetailControlsModel, 'mergeWait'> {
  for (const facts of mergeQueue.targets) {
    const entry = facts.waitingForMerge.find((candidate) => candidate.ticketId === ticket.id);
    if (entry === undefined) continue;
    let predictionText = `git could not predict the merge into ${facts.target}`;
    if (entry.againstTarget === 'clean') predictionText = `merges cleanly into ${facts.target}`;
    else if (entry.againstTarget === 'conflicting') predictionText = `conflicts with ${facts.target}`;
    return {
      mergeWait: {
        target:          facts.target,
        predictionText,
        conflictedFiles: entry.conflictedFiles ?? [],
        accepts:         offers(ticket, 'merge-accept'),
        updates:         offers(ticket, 'merge-update'),
      },
    };
  }
  return {};
}

function holdMoveOf(ticket: BoardTicketDocument): DetailControlsModel['holdMove'] {
  if (offers(ticket, 'ticket-unhold')) return 'unhold';
  return offers(ticket, 'ticket-hold') ? 'hold' : null;
}

function controlsOf(ticket: BoardTicketDocument, mergeQueue: BoardDocument['mergeQueue']): DetailControlsModel {
  const priorityChoices = offers(ticket, 'ticket-priority')
    ? ticket.offers.priorityChoices.filter((priority) => priority !== ticket.facts.resolvedPriority)
    : [];
  return {
    readies:        offers(ticket, 'ticket-ready'),
    holdMove:       holdMoveOf(ticket),
    parks:          offers(ticket, 'ticket-park'),
    setsNetwork:    offers(ticket, 'ticket-network'),
    network:        ticket.network,
    priorityChoices,
    deliversByHand: offers(ticket, 'ticket-deliver-by-hand'),
    ...mergeWaitOf(mergeQueue, ticket),
  };
}

function offersAnyTicketControl(controls: DetailControlsModel): boolean {
  return controls.readies || controls.holdMove !== null || controls.parks || controls.setsNetwork || controls.priorityChoices.length > 0;
}

/** The domains a viewer typed, split at commas and white space. */
function networkDomainsOf(typedText: string): string[] {
  return typedText.split(/[\s,]+/).filter((domain) => domain !== '');
}

export const DetailControlsModelUtil = Object.freeze({ controlsOf, offersAnyTicketControl, networkDomainsOf });
