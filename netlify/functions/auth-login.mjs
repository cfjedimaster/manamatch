import crypto from 'node:crypto';
import { getEnvValue } from './_lib/gemini.mjs';

export default async (req, context) => {
  const clientId = getEnvValue('CLIENT_ID');

  if (!clientId) {
    return Response.json(
      { error: 'Missing CLIENT_ID environment variable.' },
      { status: 500 }
    );
  }

  const reqUrl = new URL(req.url);
  const redirectUri =
    getEnvValue('BNET_REDIRECT_URI') ||
    `${reqUrl.origin}/api/auth/callback`;

  const state = crypto.randomUUID();

  context.cookies.set({
    name: 'bnet_oauth_state',
    value: state,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 600,
  });

  const authUrl = new URL('https://oauth.battle.net/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'wow.profile');
  authUrl.searchParams.set('state', state);

  return Response.redirect(authUrl.toString(), 302);
};

export const config = {
  path: '/api/auth/login',
};
