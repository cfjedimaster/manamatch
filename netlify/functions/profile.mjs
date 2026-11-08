import { Type } from '@google/genai';
import { getStore } from '@netlify/blobs';
import {
  createGeminiClient,
  isCacheEnabled,
  pickRandomPhotoArchetypes,
} from './_lib/gemini.mjs';
import {
  buildCharacterParagraph,
  getForeverCharacter,
  toSlug,
} from './_lib/wow-forever.mjs';

export default async (req, context) => {
  try {
    const rawSlug = context.params?.slug;
    if (!rawSlug) {
      return Response.json(
        { error: 'Character slug is required.' },
        { status: 400 }
      );
    }

    const slug = toSlug(rawSlug);
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('refresh') === '1';
    const useCache = isCacheEnabled() && !forceRefresh;

    const profileStore = getStore('profiles');

    if (useCache) {
      try {
        const cachedProfile = await profileStore.get(slug, { type: 'json' });
        if (cachedProfile) {
          return Response.json(
            { ...cachedProfile, cached: true },
            {
              status: 200,
              headers: { 'X-Cache': 'HIT' },
            }
          );
        }
      } catch (blobReadErr) {
        console.warn('Blobs read warning:', blobReadErr.message);
      }
    } else {
      // Clear cached photos when refreshing or when cache is disabled
      try {
        const imageStore = getStore('profile-images');
        await Promise.allSettled([
          imageStore.delete(`${slug}/0`),
          imageStore.delete(`${slug}/1`),
          imageStore.delete(`${slug}/2`),
          imageStore.delete(`${slug}/3`),
        ]);
      } catch (blobDelErr) {
        console.warn('Blobs photo delete warning:', blobDelErr.message);
      }
    }

    // 1. Fetch WoW Forever character data from Battle.net
    const wowData = await getForeverCharacter(slug);

    // 2. Build the descriptive text paragraph from the JSON result
    const characterParagraph = buildCharacterParagraph(wowData);

    // 3. Pick 4 random dating photo archetypes out of the 8 available
    const selectedArchetypes = pickRandomPhotoArchetypes(4);
    const photoInstructionsList = selectedArchetypes
      .map(
        (arch, idx) =>
          `   - Photo ${idx + 1} ("${arch.label}"): ${arch.instruction}`
      )
      .join('\n');

    // 4. Call Google Gemini to create the tongue-in-cheek dating profile
    const ai = createGeminiClient();

    const prompt = `You are a witty, tongue-in-cheek dating profile copywriter for "ManaMatch", Azeroth's premier dating site for World of Warcraft characters.

Below is a factual paragraph describing a real World of Warcraft: Forever character, generated from their Armory data:

"""
${characterParagraph}
"""

Using this character's race, class, specialization, gender, professions, equipment, mounts, pets, reputations, and quest history, write a hilarious, tongue-in-cheek dating profile for them as if they are looking for love (or a reliable dungeon/raid partner) on a modern dating app.

Requirements:
1. "tagline": A short, punchy, funny dating-app headline/tagline (1 sentence, under 120 characters).
2. "bio": A 2 to 3 paragraph first-person dating profile bio ("I..."). Make specific jokes and references to their actual race, class, spec, trained professions (or lack thereof), gear, mounts/pets, and faction. Keep it clever, charming, and unmistakably formatted like a dating profile.
3. "likes": An array of 5 to 6 funny, specific things this character likes (combining dating tropes with their specific WoW traits).
4. "dislikes": An array of 5 to 6 funny, specific things this character dislikes or considers dealbreakers.
5. "photoPrompts": An array of exactly 4 objects ({ "label": string, "scenePrompt": string }) describing 4 cute, wholesome, non-sexual dating app photos of this character that we will pass to an image generator along with their character portrait, following these 4 randomly chosen dating-app tropes tailored to this character:
${photoInstructionsList}
   Keep all photo prompts strictly SFW, cute, charming, and never sexual.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tagline: {
              type: Type.STRING,
              description: 'Short, witty dating profile tagline.',
            },
            bio: {
              type: Type.STRING,
              description:
                '2-3 paragraph first-person tongue-in-cheek dating bio.',
            },
            likes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '5-6 funny character-specific likes.',
            },
            dislikes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '5-6 funny character-specific dislikes.',
            },
            photoPrompts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: {
                    type: Type.STRING,
                    description: 'Short caption or label for the photo.',
                  },
                  scenePrompt: {
                    type: Type.STRING,
                    description:
                      'Detailed scene and pose prompt for the image generator.',
                  },
                },
                required: ['label', 'scenePrompt'],
              },
            },
          },
          required: ['tagline', 'bio', 'likes', 'dislikes', 'photoPrompts'],
        },
      },
    });

    const generated = JSON.parse(response.text);

    const finalPhotoPrompts = selectedArchetypes.map((arch, idx) => {
      const genItem = generated.photoPrompts?.[idx];
      return {
        id: arch.id,
        label: genItem?.label || arch.label,
        scenePrompt: genItem?.scenePrompt || arch.instruction,
      };
    });

    const profileRecord = {
      slug,
      generatedAt: new Date().toISOString(),
      character: wowData.character,
      characterParagraph,
      profile: {
        tagline: generated.tagline,
        bio: generated.bio,
        likes: generated.likes || [],
        dislikes: generated.dislikes || [],
        photoPrompts: finalPhotoPrompts,
      },
    };

    try {
      await profileStore.setJSON(slug, profileRecord);
    } catch (blobWriteErr) {
      console.warn('Blobs write warning:', blobWriteErr.message);
    }

    return Response.json(
      { ...profileRecord, cached: false },
      {
        status: 200,
        headers: { 'X-Cache': 'MISS' },
      }
    );
  } catch (err) {
    console.error('Error in /api/profile/:slug:', err);
    const status = err.statusCode || 500;
    return Response.json(
      {
        error: err.message || 'Failed to generate or load dating profile.',
      },
      { status }
    );
  }
};

export const config = {
  path: '/api/profile/:slug',
};
