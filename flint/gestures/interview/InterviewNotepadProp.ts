/**
 * The notepad of Interview (`06-more-animations.md`): the shared notepad of Research, the lines Flint writes in it, and the tick above it. The
 * written lines and the tick fade out at the end of the loop while the notepad stays; a written line grows from its left end on the screen.
 */
import { propDefinition }    from '../../props/PropDefinition.ts';
import { notepadShapesOf }   from '../../props/shapes/NotepadShape.ts';
import { VerdictShapeUtil }  from '../../props/shapes/VerdictShapeUtil.ts';
import { NOTEPAD_SHAPE }     from '../../props/shapes/constants/NotepadShape.ts';
import { INTERVIEW_NOTEPAD } from './constants/InterviewValues.ts';

export interface InterviewNotepadState {
  readonly shown:          number;
  /** A written length per line, in units. */
  readonly writtenLengths: readonly number[];
  readonly linesOpacity:   number;
  readonly tickOpacity:    number;
}

export const INTERVIEW_NOTEPAD_PROP = propDefinition({
  name:   'interviewNotepad',
  hidden: Object.freeze<InterviewNotepadState>({
    shown: 0, writtenLengths: Object.freeze(NOTEPAD_SHAPE.LINE_Y_UNITS.map(() => 0)), linesOpacity: 1, tickOpacity: 0,
  }),
  layer:    'behind-body',
  shapesOf: (state: InterviewNotepadState, context) => ({
    opacity: state.shown,
    shapes:  [
      ...notepadShapesOf({ writtenLengths: state.writtenLengths, facing: context.facing, linesOpacity: state.linesOpacity }),
      VerdictShapeUtil.tickOf({
        key: 'tick', startX: INTERVIEW_NOTEPAD.TICK_START_X_UNITS, startY: INTERVIEW_NOTEPAD.TICK_START_Y_UNITS, opacity: state.tickOpacity,
      }),
    ],
  }),
});
