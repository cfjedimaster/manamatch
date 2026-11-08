import { getEnvValue } from './_lib/gemini.mjs';

export default async (req, context) => {
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get('code');
  const state = reqUrl.searchParams.get('state');
  const error = reqUrl.searchParams.get('error');

  if (error) {
    return Response.redirect(
      `${reqUrl.origin}/?auth_error=${encodeURIComponent(error)}`,
      302
    );
  }

  const savedState = context.cookies.get('bnet_oauth_state');
  context.cookies.delete({ name: 'bnet_oauth_state', path: '/' });

  if (!code || !state || (savedState && savedState !== state)) {
    return Response.redirect(
      `${reqUrl.origin}/?auth_error=${encodeURIComponent('Invalid OAuth state or missing authorization code.')}`,
      302
    );
  }

  const clientId = getEnvValue('CLIENT_ID');
  const clientSecret = getEnvValue('CLIENT_SECRET');

  const redirectUri =
    getEnvValue('BNET_REDIRECT_URI') ||
    `${reqUrl.origin}/api/auth/callback`;

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    console.error('Battle.net token exchange failed:', tokenRes.status, errText);
    return Response.redirect(
      `${reqUrl.origin}/?auth_error=${encodeURIComponent('Failed to exchange Battle.net authorization code.')}`,
      302
    );
  }

  const tokenData = await tokenRes.json();

  context.cookies.set({
    name: 'bnet_access_token',
    value: tokenData.access_token,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: tokenData.expires_in ? Math.min(tokenData.expires_in, 86400) : 3600,
  });

  return Response.redirect(`${reqUrl.origin}/`, 302);
};

export const config = {
  path: '/api/auth/callback',
};
