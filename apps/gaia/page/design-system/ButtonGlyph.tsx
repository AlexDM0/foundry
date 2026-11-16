/**
 * A package icon as a button's glyph, hidden since the button's name says what it does: the icon fills its holder, so Gaia holds it in
 * the 13 px the boards draw a glyph at, which the button's 16 px glyph box centres.
 */
import { Icon, type IconName } from 'design-system/Icon';

export function ButtonGlyph({ name }: { readonly name: IconName }) {
  return <span className="gaia-button-glyph"><Icon name={name} label={null} /></span>;
}
