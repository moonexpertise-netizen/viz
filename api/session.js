import { isAuthenticated, ssoConfig } from './_lib/auth.js';
import { emailEnabled, kvEnabled } from './_lib/account.js';

export default function handler(req, res) {
  const sso = ssoConfig();
  res.status(200).json({
    authenticated: isAuthenticated(req),
    sso: Boolean(sso),
    domain: sso ? sso.domain : (process.env.ALLOWED_EMAIL_DOMAIN || 'moonexpertise.fr'),
    resetEnabled: emailEnabled() && kvEnabled(),
  });
}
