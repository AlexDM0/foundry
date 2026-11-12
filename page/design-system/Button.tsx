/**
 * Gaia's one button, 28 px high: plain, or primary (ink on the page ground, at most one per group). It is a link when it navigates and is
 * enabled; an icon-only button keeps its label as its accessible name and its tooltip. A variant is a `data-*` attribute, never a class.
 */
export type ButtonEmphasis = 'primary' | 'plain';

/** The "Open in new tab" arrow is one of Gaia's three drawn shapes; dismiss is the multiplication sign, a character. */
export type ButtonIcon = 'open-in-new-tab' | 'dismiss';

export interface ButtonProps {
  readonly label:     string;
  readonly emphasis?: ButtonEmphasis;
  readonly onPress?:  () => void;
  /** A route or an address: the button is then a link, unless it is disabled. */
  readonly href?:     string;
  readonly disabled?: boolean;
  readonly icon?:     ButtonIcon;
  /** Shows only the icon; the label stays the accessible name and the tooltip. */
  readonly iconOnly?: boolean;
}

function ButtonIconShape({ icon }: { readonly icon: ButtonIcon }) {
  if (icon === 'dismiss') return <span className="gaia-button-icon" aria-hidden="true">×</span>;
  return (
    <svg className="gaia-button-icon" aria-hidden="true" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 2.5H2.5v8h8V8" />
      <path d="M7.5 2h3.5v3.5" />
      <path d="M11 2 6 7" />
    </svg>
  );
}

export function Button({
  label, emphasis = 'plain', onPress, href, disabled = false, icon, iconOnly = false
}: ButtonProps) {
  const showsOnlyTheIcon = iconOnly && icon !== undefined;
  const sharedAttributes = {
    'data-emphasis':  emphasis,
    'data-icon-only': showsOnlyTheIcon ? '' : undefined,
    'aria-label':     showsOnlyTheIcon ? label : undefined,
    'title':          showsOnlyTheIcon ? label : undefined,
  };
  const content = (
    <>
      {icon === undefined ? null : <ButtonIconShape icon={icon} />}
      {showsOnlyTheIcon ? null : label}
    </>
  );
  if (href !== undefined && !disabled) return <a className="gaia-button" href={href} {...sharedAttributes}>{content}</a>;
  return <button type="button" className="gaia-button" disabled={disabled} onClick={onPress} {...sharedAttributes}>{content}</button>;
}
