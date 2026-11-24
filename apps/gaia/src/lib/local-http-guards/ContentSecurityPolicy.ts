/**
 * The content security policies a loopback server serves. The page's: every resource from its own origin, no plugin, no base or form target,
 * never framed by another page, and no frame from anywhere but its own origin, so its frames are the sandboxed `srcdoc` frame of an agent's
 * HTML and the diagram frame. The diagram frame's own: a sandbox with scripts and no origin of its own, its script from its server, the
 * inline styles a drawn diagram carries, images only as data, and nothing else.
 */
const CONTENT_SECURITY_POLICY_HEADER = 'content-security-policy';

export function pageContentSecurityPolicyFor(): string {
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
    'frame-src \'self\'',
  ].join('; ');
}

export function diagramFrameContentSecurityPolicyFor(): string {
  return [
    'default-src \'none\'',
    'script-src \'self\'',
    'style-src \'self\' \'unsafe-inline\'',
    'img-src data:',
    'sandbox allow-scripts',
  ].join('; ');
}

/** The answer with the policy, unless it already carries one of its own, such as a sandbox for a served file. */
export function withContentSecurityPolicy(response: Response, policy: string): Response {
  if (!response.headers.has(CONTENT_SECURITY_POLICY_HEADER)) response.headers.set(CONTENT_SECURITY_POLICY_HEADER, policy);
  return response;
}
