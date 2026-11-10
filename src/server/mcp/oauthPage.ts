/**
 * Headers of the OAuth consent HTML page. `Referrer-Policy` must be `same-origin`, not `no-referrer`: browsers send
 * `Origin: null` on a form POST from a no-referrer document, and the consent POST requires the CRM's own Origin.
 * `same-origin` still sends no referrer to ChatGPT on the cross-origin redirect back.
 */
export const oauthPageHeaders={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'} as const;
