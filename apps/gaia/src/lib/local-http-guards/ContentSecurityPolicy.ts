/**
 * The content security policies a loopback server serves. The page's takes everything from its own origin and is never framed, so its only frames
 * are an agent's sandboxed `srcdoc` HTML and the diagram frame; the frame's own is a sandbox with scripts and no origin, loading its script, inline
 * styles and data images alone.
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
