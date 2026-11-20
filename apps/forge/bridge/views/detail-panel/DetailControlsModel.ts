/** The Bridge's own controls on a ticket's detail: which moves its stored status offers, and the merge approval a ticket waiting for merge shows. */
import type { TicketPriority }                         from '../../../src/lib/tracker-model/@types/Ticket.ts';
import { DEFAULT_TICKET_PRIORITY }                     from '../../../src/lib/tracker-model/constants/TicketFields.ts';
import type { DetailBoardState, DetailTicketDocument } from '../../@types/DetailBoardState.ts';

/** The order the Priority… row lists its choices in, the highest first. */
const PRIORITY_CHOICE_ORDER: readonly TicketPriority[] = ['high', 'normal', 'low'];

/** What the panel offers; each is a `ControlCommand` the Overseer applies or refuses. */
export interface DetailControlsModel {
  /** A draft ticket: `ticket-ready`. */
  readonly readies:         boolean;
  /** An open ticket: `ticket-hold` while unheld and not yet started, `ticket-unhold` while held, `null` otherwise. */
  readonly holdMove:        'hold' | 'unhold' | null;
  /** Any open ticket: `ticket-park`. */
  readonly parks:           boolean;
  /** Only while `draft` or `committed`: `ticket-network`. */
  readonly setsNetwork:     boolean;
  /** The domains stored now, which the network control starts from. */
  readonly network:         readonly string[];
  /** Only while `committed`: the priorities `ticket-priority` may move the ticket to, every one but its own; empty otherwise. */
  readonly priorityChoices: readonly TicketPriority[];
  /** Any open ticket past `draft`: `ticket-deliver-by-hand`, for work User landed outside the Overseer. */
  readonly deliversByHand:  boolean;
  /** Written only while the ticket waits for merge (merge approval on): `merge-accept` and `merge-update`. */
  readonly mergeWait?:      MergeWaitModel;
}

/** Git's prediction of the waiting ticket's merge into its target's current tip, and whether Accept may be pressed. */
export interface MergeWaitModel {
  readonly target:          string;
  readonly predictionText:  string;
  readonly conflictedFiles: readonly string[];
  /** Only a clean prediction: the Overseer refuses the accept of any other, and the button never sends one. */
  readonly accepts:         boolean;
}

function mergeWaitOf(mergeQueue: DetailBoardState['mergeQueue'], ticketId: string): Pick<DetailControlsModel, 'mergeWait'> {
  for (const facts of mergeQueue?.targets ?? []) {
    const entry = (facts.waitingForMerge ?? []).find((candidate) => candidate.ticketId === ticketId);
    if (entry === undefined) continue;
    const conflictedFiles = entry.conflictedFiles ?? [];
    let predictionText = `git could not predict the merge into ${facts.target}`;
    if (entry.againstTarget === 'clean') predictionText = `merges cleanly into ${facts.target}`;
    else if (entry.againstTarget === 'conflicting') predictionText = `conflicts with ${facts.target}`;
    return {
      mergeWait: {
        target: facts.target, predictionText, conflictedFiles, accepts: entry.againstTarget === 'clean'
      },
    };
  }
  return {};
}

function controlsOf(ticket: DetailTicketDocument, mergeQueue: DetailBoardState['mergeQueue']): DetailControlsModel {
  const isOpen = ticket.status !== 'delivered' && ticket.status !== 'abandoned';
  const awaitsReady   = ticket.status === 'draft' || ticket.status === 'ready-for-review';
  const notYetStarted = awaitsReady || ticket.status === 'committed';
  let holdMove: DetailControlsModel['holdMove'] = null;
  if (isOpen && ticket.hold !== undefined) holdMove = 'unhold';
  else if (notYetStarted) holdMove = 'hold';
  const currentPriority = ticket.priority ?? DEFAULT_TICKET_PRIORITY;
  return {
    readies:         awaitsReady,
    holdMove,
    parks:           isOpen,
    setsNetwork:     notYetStarted,
    network:         ticket.network ?? [],
    priorityChoices: ticket.status === 'committed' ? PRIORITY_CHOICE_ORDER.filter((priority) => priority !== currentPriority) : [],
    deliversByHand:  isOpen && ticket.status !== 'draft',
    ...mergeWaitOf(mergeQueue, ticket.id),
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
