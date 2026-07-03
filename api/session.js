import { getSession, ssoConfig } from './_lib/auth.js';
import { emailEnabled, kvEnabled, accountsEnabled } from './_lib/account.js';

export default async function handler(req, res) {
  const sso = ssoConfig();
  const session = await getSession(req);
  res.status(200).json({
    authenticated: Boolean(session),
    email: session?.email || null,
    sso: Boolean(sso),
    domain: sso ? sso.domain : (process.env.ALLOWED_EMAIL_DOMAIN || 'moonexpertise.fr'),
    resetEnabled: emailEnabled() && kvEnabled(),
    accountsEnabled: accountsEnabled(),
  });
}
