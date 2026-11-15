/** What a behaviour gives the target pose over the motion's base pose: its own pose part, and what only a behaviour decides. */
import type {
  BodyPositionEasing,
  OcclusionPose,
  PagePose,
  PosePart
} from '../SpritePose.ts';

export interface BehaviourPart {
  readonly part:           PosePart | null;
  /** The component drawn in front of Flint, while it comes around its corner. */
  readonly occlusion:      OcclusionPose | null;
  readonly positionEasing: BodyPositionEasing;
  /** A blink also waits for no gesture, no emote and no sleep. */
  readonly blinkIsAllowed: boolean;
  /** Shapes at a place on the page; absent gives none, and the last ones given fade out. */
  readonly page?:          PagePose;
}

export const PLAIN_BEHAVIOUR_PART: BehaviourPart = Object.freeze({
  part: null, occlusion: null, positionEasing: 'exact', blinkIsAllowed: true,
});
