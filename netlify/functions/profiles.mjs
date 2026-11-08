import { getStore } from '@netlify/blobs';

function formatFallbackName(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default async () => {
  try {
    const store = getStore('profiles');
    const { blobs } = await store.list();

    const entries = await Promise.all(
      (blobs || []).map(async (b) => {
        try {
          const record = await store.get(b.key, { type: 'json' });
          const c = record?.character || {};
          const p = record?.profile || {};
          const slug = record?.slug || b.key;
          const name = c.name || formatFallbackName(slug);

          return {
            slug,
            name,
            level: c.level ?? null,
            race: c.race ?? null,
            class: c.class ?? null,
            activeSpec: c.activeSpec ?? null,
            gender: c.gender ?? null,
            faction: c.faction ?? null,
            guild: c.guild ?? null,
            avatar:
              c.img?.avatar ||
              c.img?.inset ||
              c.img?.main ||
              c.img?.['main-raw'] ||
              null,
            tagline: p.tagline ?? null,
            generatedAt: record?.generatedAt ?? null,
          };
        } catch {
          return {
            slug: b.key,
            name: formatFallbackName(b.key),
            level: null,
            race: null,
            class: null,
            activeSpec: null,
            gender: null,
            faction: null,
            guild: null,
            avatar: null,
            tagline: null,
            generatedAt: null,
          };
        }
      })
    );

    entries.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, undefined, {
        sensitivity: 'base',
      });
      if (cmp !== 0) return cmp;
      return a.slug.localeCompare(b.slug);
    });

    return Response.json({ profiles: entries });
  } catch (err) {
    console.error('Error in /api/profiles:', err);
    return Response.json(
      { error: err.message || 'Failed to list profiles.', profiles: [] },
      { status: 500 }
    );
  }
};

export const config = {
  path: '/api/profiles',
};
