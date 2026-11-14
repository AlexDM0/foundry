/**
 * The 64 px bar over every view: the view's title, its one mono status line, the view's own buttons, and at the far end the theme switch,
 * which a forge in place leaves out. The mono line keeps to one line: what does not fit ends in an ellipsis, with the whole line as its
 * tooltip.
 */
import { SegmentedControl } from 'design-system/SegmentedControl';
import type { ReactNode }   from 'react';


import { ConditionDot, type DotCondition } from '../design-system/ConditionDot.tsx';
import type { ThemeChoice }                from './ThemeBootstrap.ts';

export interface TopBarStatus {
  /** The dot that leads the line, or `null` for a line without one. */
  readonly condition: DotCondition | null;
  /** The word of the condition beside its dot, in the UI face, so the dot is never the only sign. */
  readonly word?:     string;
  readonly text:      string;
}

export interface TopBarProps {
  readonly title:            string;
  readonly status:           TopBarStatus | null;
  /** The view's own buttons, placed before the theme switch. */
  readonly actions:          ReactNode;
  /** A forge shown in place leaves the switch out, so its bar has room for the forge's own line and buttons. */
  readonly showsThemeSwitch: boolean;
  readonly themeChoice:      ThemeChoice;
  readonly onThemeChoice:    (choice: ThemeChoice) => void;
}

const THEME_LABEL_ID = 'gaia-top-bar-theme-label';

const THEME_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

export function TopBar({
  title, status, actions, showsThemeSwitch, themeChoice, onThemeChoice
}: TopBarProps) {
  return (
    <header className="gaia-top-bar">
      <h1 className="gaia-top-bar-title">{title}</h1>
      {status === null ? null : (
        <span className="gaia-top-bar-status">
          {status.condition === null ? null : <ConditionDot condition={status.condition} />}
          {status.word === undefined ? null : <span className="gaia-top-bar-status-word">{status.word}</span>}
          <span className="gaia-top-bar-status-text" title={status.text}>{status.text}</span>
        </span>
      )}
      <span className="gaia-top-bar-actions">{actions}</span>
      {showsThemeSwitch ? (
        <span className="gaia-top-bar-theme">
          <span className="gaia-visually-hidden" id={THEME_LABEL_ID}>Theme</span>
          <SegmentedControl<ThemeChoice> labelledBy={THEME_LABEL_ID} options={THEME_OPTIONS} selected={themeChoice} onSelect={onThemeChoice} size="standard" />
        </span>
      ) : null}
    </header>
  );
}
