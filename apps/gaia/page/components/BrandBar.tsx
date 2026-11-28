/**
 * The 52 px bar across Gaia's window (`docs/design/components.md` 3.4): the home link, the fleet's pill and sentence, Gaia's update button
 * with its note, the theme button and Gaia's menu, the last three left out by a forge in place. The pill is orange with a pulsing dot while
 * a forge runs, neutral with a ring while none does, and absent before Gaia knows the fleet.
 */
import {
  Menu,
  MenuItem,
  StateBadge,
  StatusButton,
  type StatusGlyph,
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

/** Gaia's own update button: its words, its glyph, its press, and the note beside it, such as what is under way. */
export interface BrandBarUpdateButton {
  readonly label:          string;
  readonly glyph:          StatusGlyph;
  readonly emphasis:       'quiet' | 'primary';
  readonly busy:           boolean;
  readonly disabled:       boolean;
  /** A short count after the label, such as how many commits an update brings; `null` for none. */
  readonly count:          string | null;
  /** The button's name where the label and the count alone do not say it; `null` to use the label. */
  readonly accessibleName: string | null;
  readonly onPress:        () => void;
  readonly note:           string | null;
  /** A note that says why a step failed carries the failure dot. */
  readonly noteIsFailure:  boolean;
}

/** Gaia's menu, at the far end of the bar: Reboot Gaia, off while Gaia cannot reopen itself or an update is under way. */
export interface BrandBarMenu {
  readonly rebootIsOff: boolean;
  /** Why Reboot Gaia is off, as its tooltip; `null` while it is on or the reason is plain. */
  readonly rebootTitle: string | null;
  readonly onReboot:    () => void;
}

export interface BrandBarProps {
  /** `null` before Gaia knows the fleet. */
  readonly status:        BrandStatus | null;
  /** `null` where the bar leaves the theme button out. */
  readonly themeButton:   BrandBarThemeButton | null;
  /** `null` before Gaia knows its update, and where the bar leaves the theme button out. */
  readonly updateButton?: BrandBarUpdateButton | null;
  /** `null` where the bar leaves the theme button out. */
  readonly menu?:         BrandBarMenu | null;
}

export function themeButtonNameOf(choice: ThemeChoice): string {
  return `Theme: ${choice}. Switch to ${ThemeCycleUtil.nextChoiceOf(choice)}`;
}

function StatusPill({ status }: { readonly status: BrandStatus }) {
  if (status.fleet === 'running') return <StateBadge tone="accent" label={status.pillText} pulsing />;
  return <StateBadge tone="neutral" label={status.pillText} dotShape="ring" />;
}

const MENU_NAME = 'Gaia';

const MENU_TRIGGER_NAME = 'Gaia menu';

function UpdateButton({ updateButton }: { readonly updateButton: BrandBarUpdateButton }) {
  const { note, count, accessibleName } = updateButton;
  return (
    <>
      {note === null ? null : <span className="gaia-brand-bar-update-note" data-failure={updateButton.noteIsFailure ? '' : undefined}>{note}</span>}
      <StatusButton
        label={updateButton.label}
        glyph={updateButton.glyph}
        emphasis={updateButton.emphasis}
        busy={updateButton.busy}
        disabled={updateButton.disabled}
        onPress={updateButton.onPress}
        {...(count === null ? {} : { count })}
        {...(accessibleName === null ? {} : { accessibleName })}
      />
    </>
  );
}

function MenuGlyph() {
  return (
    <svg className="gaia-brand-bar-menu-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 4.5h10M3 8h10M3 11.5h10" />
    </svg>
  );
}

function GaiaMenu({ menu }: { readonly menu: BrandBarMenu }) {
  return (
    <Menu label={MENU_NAME} trigger="icon" align="end" triggerName={MENU_TRIGGER_NAME} triggerContent={<MenuGlyph />}>
      <MenuItem
        label="Reboot Gaia"
        hint="Quit and reopen"
        disabled={menu.rebootIsOff}
        closing="keep-focus"
        onChoose={menu.onReboot}
        {...(menu.rebootTitle === null ? {} : { title: menu.rebootTitle })}
      />
    </Menu>
  );
}

export function BrandBar({
  status, themeButton, updateButton = null, menu = null
}: BrandBarProps) {
  return (
    <header className="gaia-brand-bar">
      <a className="gaia-brand-bar-home" href={HOME_HREF} aria-label={HOME_NAME}>
        <GaiaMark />
        <span className="gaia-brand-bar-wordmark">{WORDMARK}</span>
      </a>
      <span className="gaia-brand-bar-divider" aria-hidden="true" />
      {status === null ? null : <StatusPill status={status} />}
      <span className="gaia-brand-bar-sentence">{status?.sentence}</span>
      {updateButton === null ? null : <UpdateButton updateButton={updateButton} />}
      {themeButton === null ? null : <ThemeCycleButton {...themeButton} accessibleName={themeButtonNameOf(themeButton.choice)} />}
      {menu === null ? null : <GaiaMenu menu={menu} />}
    </header>
  );
}
