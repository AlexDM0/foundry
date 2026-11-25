/**
 * Which attendants are with Flint, as plain data the mind keeps: each member by its attendant and index, and when it joined. `attend`
 * sets the count of one attendant; a member keeps its place and its entrance while the count changes around it.
 */
import type { DrawnExtent }         from '../SpriteGeometry.ts';
import type { AttendantName }       from './AttendantCatalog.ts';
import { ATTENDANT_CATALOG }        from './AttendantCatalog.ts';
import type { AttendantMemberPose } from './AttendantDefinition.ts';

export interface AttendantPresence {
  readonly name:                 AttendantName;
  readonly index:                number;
  readonly joinedAtMilliseconds: number;
}

export type AttendantRoster = readonly AttendantPresence[];

/** One member as the pose carries it: which attendant, which member, and where. */
export interface AttendantMember extends AttendantMemberPose {
  readonly name:  AttendantName;
  readonly index: number;
}

export const EMPTY_ATTENDANT_ROSTER: AttendantRoster = Object.freeze([]);

/** The roster with this attendant at this count, held between 0 and its maximum; members that stay keep the moment they joined. */
export function rosterAttended(roster: AttendantRoster, name: AttendantName, count: number, elapsedMilliseconds: number): AttendantRoster {
  const definition = ATTENDANT_CATALOG.find((candidate) => candidate.name === name);
  const heldCount = Math.max(0, Math.min(definition?.maximumCount ?? 0, Math.floor(count)));
  const others = roster.filter((presence) => presence.name !== name);
  const staying = roster.filter((presence) => presence.name === name && presence.index < heldCount);
  const joining = Array.from({ length: heldCount }, (_unused, index) => index)
    .filter((index) => !staying.some((presence) => presence.index === index))
    .map((index) => ({ name, index, joinedAtMilliseconds: elapsedMilliseconds }));
  return [...others, ...staying, ...joining];
}

/** Every member of the roster, placed at this time. */
export function attendantMembersAt(roster: AttendantRoster, elapsedMilliseconds: number, reducedMotion: boolean): readonly AttendantMember[] {
  return roster.flatMap((presence) => {
    const definition = ATTENDANT_CATALOG.find((candidate) => candidate.name === presence.name);
    if (definition === undefined) return [];
    const pose = definition.memberPoseOf({
      index: presence.index, ageMilliseconds: elapsedMilliseconds - presence.joinedAtMilliseconds, elapsedMilliseconds, reducedMotion,
    });
    return [{ ...pose, name: presence.name, index: presence.index }];
  });
}

/** All that an attendant draws at its most members, with Flint's body. */
export function attendantExtentOf(name: AttendantName): DrawnExtent | null {
  return ATTENDANT_CATALOG.find((definition) => definition.name === name)?.extent ?? null;
}
