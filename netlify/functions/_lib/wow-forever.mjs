import { getEnvValue } from './gemini.mjs';

let cached = { token: null, expires: 0 };

function getCredentials() {
  const clientId = getEnvValue('CLIENT_ID');
  const clientSecret = getEnvValue('CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing required CLIENT_ID and/or CLIENT_SECRET environment variables.'
    );
  }
  return { clientId, clientSecret };
}

export async function getClientToken() {
  if (cached.token && Date.now() < cached.expires - 60_000) {
    return cached.token;
  }

  const { clientId, clientSecret } = getCredentials();
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  cached = {
    token: data.access_token,
    expires: Date.now() + data.expires_in * 1000,
  };
  return cached.token;
}

// Accepts "Leronda Jenkins" or "leronda-jenkins" -> "leronda-jenkins"
export function toSlug(nameOrSlug) {
  const cleaned = String(nameOrSlug || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!cleaned) {
    throw new Error(`Invalid character name or slug: "${nameOrSlug}"`);
  }
  return cleaned;
}

// Remove Blizzard's _links noise to keep the output clean
export function stripLinks(value) {
  if (Array.isArray(value)) return value.map(stripLinks);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => k !== '_links')
        .map(([k, v]) => [k, stripLinks(v)])
    );
  }
  return value;
}

const ENDPOINTS = {
  profile: '',
  appearance: '/appearance',
  media: '/character-media',
  equipment: '/equipment',
  specializations: '/specializations',
  mounts: '/collections/mounts',
  pets: '/collections/pets',
  toys: '/collections/toys',
  heirlooms: '/collections/heirlooms',
  transmogs: '/collections/transmogs',
  professions: '/professions',
  reputations: '/reputations',
  titles: '/titles',
  quests: '/quests',
  completedQuests: '/quests/completed',
};

export const REGION = 'us';
export const NAMESPACE = `profile-forever-${REGION}`;
export const LOCALE = 'en_US';
export const API_BASE = `https://${REGION}.api.blizzard.com`;

async function fetchSection(slug, path, token) {
  const url =
    `${API_BASE}/profile/wow/character/${encodeURIComponent(slug)}${path}` +
    `?namespace=${NAMESPACE}&locale=${LOCALE}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return stripLinks(await res.json());
}

function formatTitle(titleTemplate, charName) {
  if (!titleTemplate) return null;
  if (titleTemplate.includes('{name}')) {
    return titleTemplate.replace('{name}', charName);
  }
  if (titleTemplate.includes('%s')) {
    return titleTemplate.replace('%s', charName);
  }
  return titleTemplate;
}

export async function getForeverCharacter(nameOrSlug) {
  const slug = toSlug(nameOrSlug);
  const token = await getClientToken();

  const keys = Object.keys(ENDPOINTS);
  const settled = await Promise.allSettled(
    keys.map((k) => fetchSection(slug, ENDPOINTS[k], token))
  );

  const data = {};
  const errors = {};
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') data[keys[i]] = r.value;
    else errors[keys[i]] = r.reason.message;
  });

  if (!data.profile) {
    const err = new Error(
      `Character "${nameOrSlug}" could not be found in World of Warcraft: Forever (${errors.profile || '404 Not Found'}). Note: Forever characters must reach level 10 and log out at least once to appear in the Blizzard API.`
    );
    err.statusCode = 404;
    throw err;
  }

  const p = data.profile ?? {};

  const img = Object.fromEntries(
    (data.media?.assets ?? []).map((a) => [a.key, a.value])
  );

  const fullName =
    p.name_search ||
    [p.name, p.surname].filter(Boolean).join(' ') ||
    slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  const rawTitle =
    p.active_title?.display_string ??
    p.active_title?.name ??
    data.titles?.active_title?.display_string ??
    data.titles?.active_title?.name ??
    null;

  return {
    character: {
      img,
      name: fullName,
      firstName: p.name ?? null,
      surname: p.surname ?? null,
      slug,
      region: REGION,
      level: p.level ?? null,
      race: p.race?.name ?? null,
      class: p.character_class?.name ?? null,
      activeSpec: p.active_spec?.name ?? null,
      faction: p.faction?.name ?? null,
      guild: p.guild?.name ?? null,
      gender: p.gender?.name ?? null,
      averageItemLevel: p.average_item_level ?? null,
      equippedItemLevel: p.equipped_item_level ?? null,
      achievementPoints: p.achievement_points ?? null,
      activeTitle: formatTitle(rawTitle, fullName),
      lastLogin: p.last_login_timestamp
        ? new Date(p.last_login_timestamp).toISOString()
        : null,
    },
    profileRaw: p,
    appearance: data.appearance ?? null,
    media: data.media ?? null,
    equipment: data.equipment ?? null,
    specializations: data.specializations ?? null,
    collections: {
      mounts: data.mounts ?? null,
      pets: data.pets ?? null,
      toys: data.toys ?? null,
      heirlooms: data.heirlooms ?? null,
      transmogs: data.transmogs ?? null,
    },
    professions: data.professions ?? null,
    reputations: data.reputations ?? null,
    titles: data.titles ?? null,
    quests: {
      log: data.quests ?? null,
      completed: data.completedQuests ?? null,
    },
    meta: {
      namespace: NAMESPACE,
      fetchedAt: new Date().toISOString(),
      callsMade: keys.length,
      callsFailed: Object.keys(errors).length,
      errors,
    },
  };
}

/**
 * Converts the full Forever character JSON payload into a descriptive text paragraph
 * suitable for passing to Google Gemini to generate a tongue-in-cheek dating profile.
 */
export function buildCharacterParagraph(payload) {
  const c = payload.character || {};
  const sentences = [];

  // 1. Core Identity
  const titleClause = c.activeTitle ? ` (known by the title "${c.activeTitle}")` : '';
  const specClass = [c.activeSpec, c.class].filter(Boolean).join(' ') || 'Adventurer';
  const raceGender = [c.gender, c.race].filter(Boolean).join(' ') || 'Azerothian';
  const factionClause = c.faction ? ` fighting for the ${c.faction}` : '';
  const guildClause = c.guild ? ` and a proud member of the guild <${c.guild}>` : ' (currently an independent freelancer with no guild)';

  sentences.push(
    `${c.name || 'This hero'}${titleClause} is a Level ${c.level ?? '??'} ${raceGender} ${specClass}${factionClause}${guildClause}.`
  );

  // 2. Appearance traits
  const customizations = payload.appearance?.customizations || [];
  if (customizations.length > 0) {
    const traits = customizations
      .map((item) => {
        const opt = item.option?.name;
        const choice = item.choice?.name;
        if (opt && choice) return `${opt.toLowerCase()}: ${choice.toLowerCase()}`;
        return null;
      })
      .filter(Boolean)
      .slice(0, 8);
    if (traits.length > 0) {
      sentences.push(`Their physical appearance features ${traits.join(', ')}.`);
    }
  }

  // 3. Gear & Equipment
  const equipped = payload.equipment?.equipped_items || [];
  if (c.equippedItemLevel || equipped.length > 0) {
    const weapons = equipped
      .filter((i) => ['MAIN_HAND', 'OFF_HAND'].includes(i.slot?.type))
      .map((i) => i.name)
      .filter(Boolean);
    const standoutGear = equipped
      .filter((i) => !['MAIN_HAND', 'OFF_HAND', 'SHIRT', 'TABARD'].includes(i.slot?.type))
      .slice(0, 4)
      .map((i) => i.name)
      .filter(Boolean);

    const weaponText =
      weapons.length > 0 ? `, wielding ${weapons.join(' and ')}` : '';
    const gearText =
      standoutGear.length > 0 ? ` and wearing pieces like ${standoutGear.join(', ')}` : '';
    sentences.push(
      `They boast an equipped item level of ${c.equippedItemLevel ?? c.averageItemLevel ?? 'unknown'}${weaponText}${gearText}.`
    );
  }

  // 4. Professions
  const primaries = payload.professions?.primaries || [];
  const secondaries = payload.professions?.secondaries || [];
  const allProfs = [...primaries, ...secondaries];
  if (allProfs.length > 0) {
    const profDescriptions = allProfs
      .map((p) => {
        const name = p.profession?.name || p.name;
        const tiers = p.tiers || [];
        if (tiers.length > 0) {
          const tierSummary = tiers
            .map((t) => `${t.tier?.name || name} (${t.skill_points ?? 0}/${t.max_skill_points ?? 100})`)
            .join(', ');
          return `${name} [${tierSummary}]`;
        }
        return name;
      })
      .filter(Boolean);
    sentences.push(`In their spare time, their trained professions include ${profDescriptions.join(' and ')}.`);
  } else {
    sentences.push(`They haven't bothered training any crafting or gathering professions yet, preferring pure adventure over manual labor.`);
  }

  // 5. Collections: Mounts, Pets, Toys
  const mounts =
    payload.collections?.mounts?.mounts ||
    (Array.isArray(payload.collections?.mounts) ? payload.collections.mounts : []);
  const pets =
    payload.collections?.pets?.pets ||
    (Array.isArray(payload.collections?.pets) ? payload.collections.pets : []);
  const toys =
    payload.collections?.toys?.toys ||
    (Array.isArray(payload.collections?.toys) ? payload.collections.toys : []);

  const collectionBits = [];
  if (mounts.length > 0) {
    const sampleMounts = mounts
      .filter((m) => m.is_favorite)
      .concat(mounts)
      .slice(0, 3)
      .map((m) => m.mount?.name || m.name)
      .filter(Boolean);
    collectionBits.push(
      `${mounts.length} mounts (including ${[...new Set(sampleMounts)].join(', ')})`
    );
  }
  if (pets.length > 0) {
    const samplePets = pets
      .slice(0, 3)
      .map((p) => p.name || p.species?.name)
      .filter(Boolean);
    collectionBits.push(
      `${pets.length} battle pets (such as ${[...new Set(samplePets)].join(', ')})`
    );
  }
  if (toys.length > 0) {
    collectionBits.push(`${toys.length} toys`);
  }
  if (collectionBits.length > 0) {
    sentences.push(`Their personal collection includes ${collectionBits.join(', ')}.`);
  }

  // 6. Reputations, Achievements & Quests
  const reps = payload.reputations?.reputations || [];
  if (reps.length > 0) {
    const topReps = reps
      .slice(0, 4)
      .map((r) => {
        const fName = r.faction?.name;
        const standing = r.standing?.name || (r.standing?.renown_level != null ? `Renown ${r.standing.renown_level}` : null);
        return fName ? (standing ? `${fName} (${standing})` : fName) : null;
      })
      .filter(Boolean);
    if (topReps.length > 0) {
      sentences.push(`Socially across Azeroth, they hold reputation standings with ${topReps.join(', ')}.`);
    }
  }

  const completedQuests =
    payload.quests?.completed?.quests ||
    (Array.isArray(payload.quests?.completed) ? payload.quests.completed : []);
  const inProgressQuests = payload.quests?.log?.in_progress || [];
  const questClauses = [];
  if (completedQuests.length > 0) {
    questClauses.push(`completed ${completedQuests.length} quests`);
  }
  if (inProgressQuests.length > 0) {
    const sampleQuests = inProgressQuests
      .slice(0, 2)
      .map((q) => q.name)
      .filter(Boolean);
    questClauses.push(
      `${inProgressQuests.length} active quests in their log${sampleQuests.length ? ` (like "${sampleQuests.join('" and "')}")` : ''}`
    );
  }
  if (c.achievementPoints != null) {
    questClauses.push(`earned ${c.achievementPoints} achievement points`);
  }
  if (questClauses.length > 0) {
    sentences.push(`On their journey so far, they have ${questClauses.join(', ')}.`);
  }

  return sentences.join(' ');
}
