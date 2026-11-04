/**
 * The per-request Content-Security-Policy that proxy.ts sends. Pure so it can
 * be unit-tested; proxy.ts supplies the nonce and the path.
 *
 * Origins: Firebase Auth (identitytoolkit/securetoken on googleapis, the
 * auth helper iframe on the auth domain, gapi for the popup), Firestore,
 * Firebase Storage uploads (googleapis) and download URLs (media/img), and
 * Google account photos.
 */

/**
 * Where the connector sign-in may post its Allow form and be sent on to.
 * Mirrors CLAUDE_CALLBACKS and LOCAL_HOSTS in lib/mcp/oauth-core.ts — keep
 * them in sync. Chrome checks form-action against the redirect that follows
 * a native (pre-hydration) form POST, so the callback origins have to be
 * listed on the authorize page.
 */
const OAUTH_FORM_ACTIONS = [
  "https://claude.ai",
  "https://claude.com",
  "http://localhost:*",
  "http://127.0.0.1:*",
];

export function buildCsp(nonce: string, pathname: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const frameSrc = authDomain ? `https://${authDomain}` : "https://*.firebaseapp.com";
  const formAction =
    pathname === "/oauth/authorize" ? `'self' ${OAUTH_FORM_ACTIONS.join(" ")}` : "'self'";
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://apis.google.com${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https://*.googleusercontent.com https://firebasestorage.googleapis.com;
    media-src 'self' blob: https://firebasestorage.googleapis.com;
    font-src 'self';
    connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com;
    frame-src ${frameSrc} https://accounts.google.com;
    frame-ancestors 'none';
    form-action ${formAction};
    base-uri 'self';
    object-src 'none';
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}
