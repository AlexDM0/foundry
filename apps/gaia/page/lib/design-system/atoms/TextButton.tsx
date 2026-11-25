/** A button drawn as text in the link colour: a link with an `href`, otherwise a button calling `onPress`; `underlined` underlines it. */
export interface TextButtonProps {
  readonly label:       string;
  /** A link in the button's look; without it the text button is a button calling `onPress`. */
  readonly href?:       string;
  readonly onPress?:    () => void;
  /** Underlined as a link in running text is, such as a row's Edit beside a file name. */
  readonly underlined?: boolean;
}

export function TextButton({
  label, href, onPress, underlined = false
}: TextButtonProps) {
  const underlinedAttribute = underlined ? '' : undefined;
  if (href !== undefined) return <a className="design-system-link-button" href={href} data-underlined={underlinedAttribute}>{label}</a>;
  return <button type="button" className="design-system-link-button" data-underlined={underlinedAttribute} onClick={onPress}>{label}</button>;
}
