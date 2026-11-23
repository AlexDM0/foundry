/** The notepad of Research: the paper, its binding of dots, and the three lines Flint writes. */
import { propDefinition }  from '../../props/PropDefinition.ts';
import { notepadShapesOf } from '../../props/shapes/NotepadShape.ts';
import { NOTEPAD_SHAPE }   from '../../props/shapes/constants/NotepadShape.ts';

export interface NotepadState {
  readonly shown:          number;
  /** A written length per line, in units. */
  readonly writtenLengths: readonly number[];
}

export const NOTEPAD_PROP = propDefinition({
  name:     'notepad',
  hidden:   Object.freeze<NotepadState>({ shown: 0, writtenLengths: Object.freeze(NOTEPAD_SHAPE.LINE_Y_UNITS.map(() => 0)) }),
  layer:    'behind-body',
  shapesOf: (state: NotepadState, context) => ({
    opacity: state.shown,
    shapes:  notepadShapesOf({ writtenLengths: state.writtenLengths, facing: context.facing }),
  }),
});
