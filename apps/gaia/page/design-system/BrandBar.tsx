/**
 * The 52 px bar across Gaia's window (COMPONENT_LIBRARY 3.4): the mark and the wordmark as a link to Attention, a divider, the fleet's
 * status pill and its sentence, and at the far end the theme button, which a forge in place leaves out (SCREENS D2). The pill is orange with
 * a pulsing dot while a forge runs, and neutral with a dormant ring while none does; before Gaia knows the fleet, the bar shows neither.
 * The theme button's name says the current choice and the next, as "Theme: auto. Switch to light".
 */
import { StateBadge }       from 'design-system/StateBadge';
import type { ThemeChoice } from 'design-system-contributions/ThemeChoice';
import { ThemeCycleButton } from 'design-system-contributions/ThemeCycleButton';
import { ThemeCycleUtil }   from 'design-system-contributions/ThemeCycleUtil';

import { GaiaMark } from './GaiaMark.tsx';

const HOME_HREF = '#attention';

const WORDMARK = 'gaia';

const HOME_NAME = 'Gaia, Attention';

export interface BrandStatus {
  readonly fleet:    'running' | 'dormant';
  /** The pill's words, such as "4 forges running". */
  readonly pillText: string;
  /** The line after the pill, such as "1 holds its launches · 1 dormant". */
  readonly sentence: string;
}

/** The theme button's choice and what a press does with the next one. */
export interface BrandBarThemeButton {
  readonly choice:  ThemeChoice;
  readonly onCycle: (next: ThemeChoice) => void;
}

export interface BrandBarProps {
  /** `null` before Gaia knows the fleet. */
  readonly status:      BrandStatus | null;
  /** `null` where the bar leaves the theme button out. */
  readonly themeButton: BrandBarThemeButton | null;
}

export function themeButtonNameOf(choice: ThemeChoice): string {
  return `Theme: ${choice}. Switch to ${ThemeCycleUtil.nextChoiceOf(choice)}`;
}

function StatusPill({ status }: { readonly status: BrandStatus }) {
  if (status.fleet === 'running') return <StateBadge tone="accent" label={status.pillText} pulsing />;
  return <StateBadge tone="neutral" label={status.pillText} dotShape="ring" />;
}

export function BrandBar({ status, themeButton }: BrandBarProps) {
  return (
    <header className="gaia-brand-bar">
      <a className="gaia-brand-bar-home" href={HOME_HREF} aria-label={HOME_NAME}>
        <GaiaMark />
        <span className="gaia-brand-bar-wordmark">{WORDMARK}</span>
      </a>
      <span className="gaia-brand-bar-divider" aria-hidden="true" />
      {status === null ? null : <StatusPill status={status} />}
      <span className="gaia-brand-bar-sentence">{status?.sentence}</span>
      {themeButton === null ? null : <ThemeCycleButton {...themeButton} accessibleName={themeButtonNameOf(themeButton.choice)} />}
    </header>
  );
}
