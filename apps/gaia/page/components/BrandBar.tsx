/**
 * The 52 px bar across Gaia's window (`docs/design/components.md` 3.4): the mark and the wordmark linking to Attention, the fleet's status pill
 * and its sentence, and at the far end the theme button, which a forge in place leaves out. The pill is orange with a pulsing dot while a forge
 * runs, neutral with a ring while none does, and absent before Gaia knows the fleet.
 */
import {
  StateBadge,
  type ThemeChoice,
  ThemeCycleButton,
  ThemeCycleUtil
} from '../lib/design-system/DesignSystemInterface.ts';
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
