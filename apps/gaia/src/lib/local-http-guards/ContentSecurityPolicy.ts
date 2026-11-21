/**
 * The content security policy of a page that a loopback server serves: every resource from its own origin, no plugin, no base or form
 * target, never framed by another page, and no frame from anywhere but its own origin. The page frames no other server: its one frame is
 * the sandboxed `srcdoc` frame of an agent's HTML, which `'self'` keeps loading.
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

/** The answer with the policy, unless it already carries one of its own, such as a sandbox for a served file. */
export function withContentSecurityPolicy(response: Response, policy: string): Response {
  if (!response.headers.has(CONTENT_SECURITY_POLICY_HEADER)) response.headers.set(CONTENT_SECURITY_POLICY_HEADER, policy);
  return response;
}
