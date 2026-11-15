/**
 * Fills the app bundle's templates (`resources/app-bundle/`): each `{{NAME}}` takes its value, escaped for the file it lands in, XML for
 * the Info.plist and a single-quoted word for the launch script. A placeholder with no value leaves the template unfilled, never half filled.
 */

export interface BundleValues {
  readonly repositoryPath:       string;
  readonly bunProgram:           string;
  readonly gaiaVersion:          string;
  readonly installVersion:       number;
  readonly minimumSystemVersion: string;
}

export type FilledTemplate =
  | { readonly verdict: 'filled'; readonly text: string }
  | { readonly verdict: 'unfilled'; readonly placeholders: readonly string[] };

const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;

function filledTemplateOf(templateText: string, valueByPlaceholder: Readonly<Record<string, string>>): FilledTemplate {
  const unfilled = [...templateText.matchAll(PLACEHOLDER)]
    .map((match) => match[1] ?? '')
    .filter((placeholder) => !Object.hasOwn(valueByPlaceholder, placeholder));
  if (unfilled.length > 0) return { verdict: 'unfilled', placeholders: [...new Set(unfilled)] };
  return { verdict: 'filled', text: templateText.replace(PLACEHOLDER, (_whole, placeholder: string) => valueByPlaceholder[placeholder] ?? '') };
}

function xmlEscapedOf(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\'', '&apos;');
}

/** One shell word that the shell reads back verbatim: single quotes hold everything but a single quote, which closes, escapes and reopens. */
function shellWordOf(text: string): string {
  return `'${text.replaceAll('\'', '\'\\\'\'')}'`;
}

function infoPlistOf(templateText: string, values: BundleValues): FilledTemplate {
  return filledTemplateOf(templateText, {
    GAIA_VERSION:           xmlEscapedOf(values.gaiaVersion),
    INSTALL_VERSION:        String(values.installVersion),
    MINIMUM_SYSTEM_VERSION: xmlEscapedOf(values.minimumSystemVersion),
  });
}

function launchScriptOf(templateText: string, values: BundleValues): FilledTemplate {
  return filledTemplateOf(templateText, {
    REPOSITORY_PATH: shellWordOf(values.repositoryPath),
    BUN_PROGRAM:     shellWordOf(values.bunProgram),
  });
}

export const BundleTemplateUtil = {
  filledTemplateOf,
  xmlEscapedOf,
  shellWordOf,
  infoPlistOf,
  launchScriptOf,
} as const;
