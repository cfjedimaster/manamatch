import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

// Set to true (or set ENABLE_CACHE=true in .env) when ready to enable Netlify Blobs caching
export const ENABLE_BLOB_CACHE = false;

export function isCacheEnabled() {
  const envVal = getEnvValue('ENABLE_CACHE');
  if (envVal !== undefined) {
    return envVal === 'true' || envVal === '1';
  }
  return ENABLE_BLOB_CACHE;
}

export const DATING_PHOTO_ARCHETYPES = [
  {
    id: 'tavern-date',
    label: 'Tavern First Date',
    instruction:
      'A cute, warm smile or playful wink over a glowing mana drink at a cozy, candlelit Azeroth tavern or café table.',
  },
  {
    id: 'golden-hour',
    label: 'Golden Hour Adventure',
    instruction:
      'A candid, happy golden-hour outdoor portrait in a scenic Azeroth zone that fits their race and faction, looking back at the camera with a genuine laugh.',
  },
  {
    id: 'dungeon-flex',
    label: 'Gym / Dungeon Flex',
    instruction:
      'A lighthearted, cute flexed-muscle or proud heroic victory pose showing off their class flair with a big cheerful grin.',
  },
  {
    id: 'hobby-pet',
    label: 'Weekend Hobby & Pet Candid',
    instruction:
      'A wholesome candid shot of them practicing their profession or hanging out with one of their favorite mounts or battle pets, smiling warmly.',
  },
  {
    id: 'mirror-selfie',
    label: 'Transmog Mirror Selfie',
    instruction:
      'A classic dating-app mirror selfie in an ornate Azeroth barbershop or inn mirror, holding up a glowing magical crystal/hearthstone like a camera to show off their outfit with a cute smirk or peace sign.',
  },
  {
    id: 'holding-fish',
    label: 'The Prized Fish Catch',
    instruction:
      'The classic dating-app "holding a fish" photo: standing proudly on a sunny wooden dock in Azeroth holding up a freshly caught, slightly goofy fantasy fish with a beaming, proud smile.',
  },
  {
    id: 'fancy-gala',
    label: 'Dressed Up for a Guild Wedding',
    instruction:
      'Looking sharp and festive at an upscale Dalaran gala or Darkmoon Faire banquet with string lights in the background, raising a fancy goblet with a charming smile.',
  },
  {
    id: 'campfire-cozy',
    label: 'Cozy Campfire Night In',
    instruction:
      'Relaxed by a crackling Azeroth campsite fire at dusk with a warm mug of spiced cider and an ancient tome/scroll, giving the camera a soft, welcoming smile.',
  },
];

export function pickRandomPhotoArchetypes(count = 4) {
  const pool = [...DATING_PHOTO_ARCHETYPES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function getEnvValue(name) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const regex = new RegExp(`^${name}=(.*)$`, 'm');
      const match = envContent.match(regex);
      if (match && match[1] !== undefined) {
        const val = match[1].trim().replace(/^['"]|['"]$/g, '');
        if (val) return val;
      }
    }
  } catch {
    // Ignore in production if .env is not present on disk
  }

  return (
    (typeof Netlify !== 'undefined' && Netlify?.env?.get?.(name)) ||
    process.env[name]
  );
}

export function getGeminiApiKey() {
  const key = getEnvValue('GEMINI_API_KEY');
  if (!key) {
    throw new Error('Missing required GEMINI_API_KEY environment variable.');
  }
  return key;
}

export function createGeminiClient() {
  const apiKey = getGeminiApiKey();
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      baseUrl: 'https://generativelanguage.googleapis.com',
    },
  });
}
