/** How a figure looks: a value that waits on User or stands at a limit takes the package's accent tone, every other value none. */
import type { PageHeadFigure, StateTone } from '../../lib/design-system/DesignSystemInterface.ts';

import type { PageFigure } from '../@types/ViewParts.ts';

const ATTENTION_TONE: StateTone = 'accent';

/** The tone of a figure, as a props fragment: empty for a value that needs no look. */
function toneOf(attention: boolean | undefined): { readonly tone?: StateTone } {
  return attention === true ? { tone: ATTENTION_TONE } : {};
}

function pageHeadFiguresOf(figures: readonly PageFigure[]): PageHeadFigure[] {
  return figures.map((figure) => ({ value: figure.value, label: figure.label, ...toneOf(figure.attention) }));
}

export const FigureLookUtil = { toneOf, pageHeadFiguresOf } as const;
