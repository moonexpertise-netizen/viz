import { isAuthenticated, ssoConfig } from './_lib/auth.js';

export default function handler(req, res) {
  const sso = ssoConfig();
  res.status(200).json({
    authenticated: isAuthenticated(req),
    sso: Boolean(sso),
    domain: sso ? sso.domain : null,
  });
}
