/**
 * The content security policy of a page that a loopback server serves: every resource from its own origin, no plugin, no base or form
 * target, never framed by another page, and frames only from the sources its caller names.
 */
export interface PageContentSecurityPolicyOptions {
  /** The sources the page may frame; none gives `'none'`. */
  readonly frameSources: readonly string[];
}

/** Any port of 127.0.0.1 over plain HTTP: the servers of the same machine, and only by that address. */
export const LOOPBACK_ANY_PORT_FRAME_SOURCE = 'http://127.0.0.1:*';

const CONTENT_SECURITY_POLICY_HEADER = 'content-security-policy';

const NO_SOURCE = '\'none\'';

export function pageContentSecurityPolicyFor(options: PageContentSecurityPolicyOptions): string {
  const frameSources = options.frameSources.length === 0 ? NO_SOURCE : options.frameSources.join(' ');
  return [
    'default-src \'self\'',
    'script-src \'self\'',
    'style-src \'self\'',
    'connect-src \'self\'',
    'font-src \'self\'',
    'img-src \'self\' data:',
    'object-src \'none\'',
    'base-uri \'none\'',
    'form-action \'none\'',
    'frame-ancestors \'none\'',
    `frame-src ${frameSources}`,
  ].join('; ');
}

/** The answer with the policy, unless it already carries one of its own, such as a sandbox for a served file. */
export function withContentSecurityPolicy(response: Response, policy: string): Response {
  if (!response.headers.has(CONTENT_SECURITY_POLICY_HEADER)) response.headers.set(CONTENT_SECURITY_POLICY_HEADER, policy);
  return response;
}
