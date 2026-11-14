/**
 * The 52 px bar across Gaia's window (COMPONENT_LIBRARY 3.4): the mark and the wordmark as a link to Attention, a divider, the fleet's
 * status pill and its sentence, and at the far end the theme button, which a forge in place leaves out (SCREENS D2). The pill is orange with
 * a pulsing dot while a forge runs, and neutral with a dormant ring while none does.
 */
import { StateBadge } from 'design-system/StateBadge';

import { GaiaMark }                                     from './GaiaMark.tsx';
import { ThemeCycleButton, type ThemeCycleButtonProps } from './ThemeCycleButton.tsx';

const HOME_HREF = '#attention';

const WORDMARK = 'gaia';

export interface BrandStatus {
  readonly fleet:    'running' | 'dormant';
  /** The pill's words, such as "4 forges running". */
  readonly pillText: string;
  /** The line after the pill, such as "1 holds its launches · 1 dormant". */
  readonly sentence: string;
}

export interface BrandBarProps {
  readonly status:      BrandStatus;
  /** `null` where the bar leaves the theme button out. */
  readonly themeButton: ThemeCycleButtonProps | null;
}

function StatusPill({ status }: { readonly status: BrandStatus }) {
  if (status.fleet === 'running') return <StateBadge tone="accent" label={status.pillText} pulsing />;
  return <StateBadge tone="neutral" label={status.pillText} dotShape="ring" />;
}

export function BrandBar({ status, themeButton }: BrandBarProps) {
  return (
    <header className="gaia-brand-bar">
      <a className="gaia-brand-bar-home" href={HOME_HREF}>
        <GaiaMark />
        <span className="gaia-brand-bar-wordmark">{WORDMARK}</span>
      </a>
      <span className="gaia-brand-bar-divider" aria-hidden="true" />
      <StatusPill status={status} />
      <span className="gaia-brand-bar-sentence">{status.sentence}</span>
      {themeButton === null ? null : <ThemeCycleButton {...themeButton} />}
    </header>
  );
}
