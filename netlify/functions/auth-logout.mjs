export default async (req, context) => {
  const reqUrl = new URL(req.url);
  context.cookies.delete({ name: 'bnet_access_token', path: '/' });
  return Response.redirect(`${reqUrl.origin}/`, 302);
};

export const config = {
  path: '/api/auth/logout',
};
