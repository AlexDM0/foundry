/**
 * The contract of an attendant: a thing that stays with Flint through each gesture, emote,
 * walk, jump, drag and sleep, until the host takes it away with `attend(name, 0)`. The host gives a count; each member of that count is
 * placed by `memberPoseOf` and drawn by `shapesOf` around its own centre. The easing step shrinks a member that the host took away.
 */
import type { Shape } from '../drawing/Shape.ts';

export interface AttendantMemberInput {
  /** From 0, in the order the host added the members. */
  readonly index:               number;
  /** Since this member joined: its entrance. */
  readonly ageMilliseconds:     number;
  /** The frame source's time, for a motion that all members share. */
  readonly elapsedMilliseconds: number;
  /** No motion and no turn: the member holds still at its place, at its full size. */
  readonly reducedMotion:       boolean;
}

/** Where a member is, relative to the bottom tip of the body, for Flint facing right; the renderer mirrors the x with the facing. */
export interface AttendantMemberPose {
  readonly x:           number;
  readonly y:           number;
  readonly turnDegrees: number;
  readonly scale:       number;
}

export interface AttendantDefinition<Name extends string = string> {
  readonly name:         Name;
  /** The most members the host can give; a higher count is held to it. */
  readonly maximumCount: number;
  memberPoseOf(input: AttendantMemberInput): AttendantMemberPose;
  /** One member around its own centre, unturned and at scale 1; the renderer places, turns and scales it. */
  shapesOf(): readonly Shape[];
}

/** Keeps the literal name of an attendant definition, so the attendant catalog can derive the list of attendant names from it. */
export function attendantDefinition<const Name extends string>(definition: AttendantDefinition<Name>): AttendantDefinition<Name> {
  return Object.freeze(definition);
}
