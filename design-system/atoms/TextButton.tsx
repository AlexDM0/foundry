/** A button drawn as text in the link colour: a link with an `href`, otherwise a button calling `onPress`. */
export interface TextButtonProps {
  readonly label:    string;
  /** A link in the button's look; without it the text button is a button calling `onPress`. */
  readonly href?:    string;
  readonly onPress?: () => void;
}

export function TextButton({ label, href, onPress }: TextButtonProps) {
  if (href !== undefined) return <a className="design-system-link-button" href={href}>{label}</a>;
  return <button type="button" className="design-system-link-button" onClick={onPress}>{label}</button>;
}
