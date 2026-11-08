import { getStore } from '@netlify/blobs';
import { API_BASE, LOCALE, NAMESPACE, toSlug } from './_lib/wow-forever.mjs';

export default async (req, context) => {
  const token = context.cookies.get('bnet_access_token');
  if (!token) {
    return Response.json({ authenticated: false, characters: [] });
  }

  try {
    const url = `${API_BASE}/profile/user/wow?namespace=${NAMESPACE}&locale=${LOCALE}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 || res.status === 403) {
      context.cookies.delete({ name: 'bnet_access_token', path: '/' });
      return Response.json({ authenticated: false, characters: [] });
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('Error fetching Forever user profile:', res.status, errBody);
      return Response.json(
        {
          authenticated: true,
          characters: [],
          error: `Blizzard API returned ${res.status} ${res.statusText} for namespace ${NAMESPACE}.`,
        },
        { status: 200 }
      );
    }

    const data = await res.json();
    const rawChars = [];

    if (Array.isArray(data.wow_accounts)) {
      for (const acct of data.wow_accounts) {
        if (Array.isArray(acct.characters)) {
          rawChars.push(...acct.characters);
        }
      }
    } else if (Array.isArray(data.characters)) {
      rawChars.push(...data.characters);
    }

    let existingSlugs = new Set();
    try {
      const store = getStore('profiles');
      const { blobs } = await store.list();
      existingSlugs = new Set((blobs || []).map((b) => b.key));
    } catch (blobErr) {
      console.warn('Could not list Netlify Blobs in /api/characters:', blobErr.message);
    }

    const characters = rawChars
      .map((c) => {
        const fullName =
          c.name_search ||
          [c.name, c.surname].filter(Boolean).join(' ') ||
          c.name ||
          'Unknown Hero';
        let slug = '';
        try {
          slug = toSlug(fullName);
        } catch {
          return null;
        }
        return {
          id: c.id ?? slug,
          name: fullName,
          slug,
          level: c.level ?? null,
          race: c.playable_race?.name ?? c.race?.name ?? null,
          class: c.playable_class?.name ?? c.character_class?.name ?? null,
          gender: c.gender?.name ?? null,
          faction: c.faction?.name ?? null,
          realm: c.realm?.name ?? null,
          hasProfile: existingSlugs.has(slug),
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.level ?? 0) - (a.level ?? 0));

    return Response.json({
      authenticated: true,
      characters,
    });
  } catch (err) {
    console.error('Unexpected error in /api/characters:', err);
    return Response.json(
      {
        authenticated: true,
        characters: [],
        error: err.message || 'Failed to fetch WoW Forever characters.',
      },
      { status: 500 }
    );
  }
};

export const config = {
  path: '/api/characters',
};
