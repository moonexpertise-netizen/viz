import crypto from 'crypto';
import { ssoConfig, setTempCookie } from '../_lib/auth.js';

/**
 * GET /api/auth/login -> redirige vers Microsoft Entra (flux Authorization Code + PKCE).
 */
export default function handler(req, res) {
  const cfg = ssoConfig();
  if (!cfg) {
    res.status(404).json({ error: 'SSO non configuré' });
    return;
  }

  const redirectUri = `https://${req.headers.host}/api/auth/callback`;
  const state = crypto.randomBytes(16).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

  setTempCookie(res, 'mv_oauth_state', state);
  setTempCookie(res, 'mv_oauth_verifier', verifier);

  const url = new URL(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // Restreint la mire de connexion au tenant du cabinet
  url.searchParams.set('domain_hint', cfg.domain);

  res.writeHead(302, { Location: url.toString() });
  res.end();
}
