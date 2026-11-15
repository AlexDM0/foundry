/**
 * What the epics habitat cues between two payloads (`09-bridge-wiring.md`, "New habitats", `epics`): a ticket the previous payload had
 * gets a key in its `epics`. A new ticket filed into an epic is the tickets habitat's to answer.
 */
import type { SpriteCue } from 'flint/SpriteHabitat';
import { EPICS_CUES }     from './EpicsSpriteHabitat.ts';

/** The fields of a page ticket the habitat reads; the Epics view's tickets satisfy it unchanged. */
export interface CuedEpicTicket {
  readonly id:     string;
  readonly epics?: readonly string[];
}

function cuesBetween(previous: readonly CuedEpicTicket[], next: readonly CuedEpicTicket[]): readonly SpriteCue[] {
  const previousEpicsById = new Map(previous.map((ticket) => [ticket.id, ticket.epics ?? []]));
  const joinedAnEpic = next.some((ticket) => {
    const previousEpics = previousEpicsById.get(ticket.id);
    return previousEpics !== undefined && (ticket.epics ?? []).some((epicKey) => !previousEpics.includes(epicKey));
  });
  return joinedAnEpic ? [EPICS_CUES.TICKET_JOINED_AN_EPIC] : [];
}

export const EpicsSpriteModel = Object.freeze({ cuesBetween });
