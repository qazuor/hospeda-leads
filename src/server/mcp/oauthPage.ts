/**
 * Headers of the OAuth consent HTML page.
 *
 * - `Referrer-Policy` must be `same-origin`, not `no-referrer`: browsers send `Origin: null` on a form POST from a
 *   no-referrer document, and the consent POST requires the CRM's own Origin. `same-origin` still sends no referrer
 *   to the client on the cross-origin redirect back.
 * - `form-action` must list the origins of the configured redirect URIs: browsers enforce it on the redirect that
 *   follows a form submission, so `'self'` alone silently blocks the 303 back to the client.
 */
export function oauthPageHeaders({redirects}:{readonly redirects:readonly string[]}){
 const targets=[...new Set(redirects.map(r=>new URL(r).origin))].join(' ');
 return {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':`default-src 'none'; form-action 'self'${targets?' '+targets:''}; frame-ancestors 'none'; base-uri 'none'`,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'} as const;
}
