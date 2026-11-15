/**
 * A theme button: the 30px icon button with the glyph of the current choice, which a press moves on to the next, auto to light to dark and
 * round. The glyph is a circle, its right half filled for auto, open for light and filled for dark. Its name, which the host words, says
 * the current choice and the next.
 */
import { IconButton } from 'design-system/IconButton';

import type { ThemeChoice } from '../@types/ThemeChoice.ts';
import { ThemeCycleUtil }   from '../utils/ThemeCycleUtil.ts';

export interface ThemeCycleButtonProps {
  readonly choice:         ThemeChoice;
  readonly accessibleName: string;
  readonly onCycle:        (next: ThemeChoice) => void;
}

function ThemeGlyph({ choice }: { readonly choice: ThemeChoice }) {
  return (
    <svg className="design-system-theme-cycle-glyph" data-choice={choice} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      {choice === 'auto' ? <path className="design-system-theme-cycle-glyph-half" d="M8 2.5 A5.5 5.5 0 0 1 8 13.5 Z" /> : null}
    </svg>
  );
}

export function ThemeCycleButton({ choice, accessibleName, onCycle }: ThemeCycleButtonProps) {
  const cycle = () => onCycle(ThemeCycleUtil.nextChoiceOf(choice));
  return <IconButton drawing={<ThemeGlyph choice={choice} />} accessibleName={accessibleName} title={accessibleName} onPress={cycle} />;
}
