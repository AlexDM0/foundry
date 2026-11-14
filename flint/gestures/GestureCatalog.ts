/** Every gesture by its name; the mind reaches a gesture only through this catalog. */
import { FASTEN_GESTURE }                      from './FastenGesture.ts';
import type { GestureDefinition, GestureName } from './GestureDefinition.ts';
import { GRAB_GESTURE }                        from './GrabGesture.ts';
import { MAKE_TICKET_GESTURE }                 from './MakeTicketGesture.ts';
import { MERGE_GESTURE }                       from './MergeGesture.ts';
import { POINT_GESTURE }                       from './PointGesture.ts';
import { RESEARCH_GESTURE }                    from './ResearchGesture.ts';
import { REVIEW_GESTURE }                      from './ReviewGesture.ts';
import { TYPE_GESTURE }                        from './TypeGesture.ts';
import { WAVE_GESTURE }                        from './WaveGesture.ts';

export const GESTURE_CATALOG: Readonly<Record<GestureName, GestureDefinition>> = Object.freeze({
  'point':       POINT_GESTURE,
  'type':        TYPE_GESTURE,
  'review':      REVIEW_GESTURE,
  'research':    RESEARCH_GESTURE,
  'make-ticket': MAKE_TICKET_GESTURE,
  'merge':       MERGE_GESTURE,
  'fasten':      FASTEN_GESTURE,
  'grab':        GRAB_GESTURE,
  'wave':        WAVE_GESTURE,
});
