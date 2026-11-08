import { getStore } from '@netlify/blobs';
import {
  DATING_PHOTO_ARCHETYPES,
  createGeminiClient,
  isCacheEnabled,
} from './_lib/gemini.mjs';
import { getForeverCharacter, toSlug } from './_lib/wow-forever.mjs';

function pickSourceImageUrl(imgObj = {}) {
  return (
    imgObj.main ||
    imgObj['main-raw'] ||
    imgObj.inset ||
    imgObj.avatar ||
    imgObj['main-sd-raw'] ||
    imgObj['avatar-sd'] ||
    Object.values(imgObj)[0] ||
    null
  );
}

export default async (req, context) => {
  try {
    const rawSlug = context.params?.slug;
    const index = Number(context.params?.index ?? 0);

    if (!rawSlug || Number.isNaN(index) || index < 0 || index > 3) {
      return Response.json(
        { error: 'Valid slug and photo index (0-3) are required.' },
        { status: 400 }
      );
    }

    const slug = toSlug(rawSlug);
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('refresh') === '1';
    const useCache = isCacheEnabled() && !forceRefresh;

    const imageStore = getStore('profile-images');
    const blobKey = `${slug}/${index}`;

    if (useCache) {
      try {
        const cachedEntry = await imageStore.getWithMetadata(blobKey, {
          type: 'arrayBuffer',
        });
        if (cachedEntry && cachedEntry.data) {
          const contentType =
            cachedEntry.metadata?.mimeType || 'image/png';
          return new Response(cachedEntry.data, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400',
              'X-Cache': 'HIT',
            },
          });
        }
      } catch (blobReadErr) {
        console.warn('Photo blob read warning:', blobReadErr.message);
      }
    }

    // Load character profile from Blobs (or fallback to Battle.net)
    const profileStore = getStore('profiles');
    let savedProfile = null;
    try {
      savedProfile = await profileStore.get(slug, { type: 'json' });
    } catch {
      savedProfile = null;
    }

    let character = savedProfile?.character;
    if (!character) {
      const wowData = await getForeverCharacter(slug);
      character = wowData.character;
    }

    const sourceImageUrl = pickSourceImageUrl(character?.img);
    if (!sourceImageUrl) {
      return Response.json(
        { error: 'No source character media image available from Battle.net.' },
        { status: 404 }
      );
    }

    // Fetch the character image from Blizzard CDN
    const imgRes = await fetch(sourceImageUrl);
    if (!imgRes.ok) {
      throw new Error(
        `Failed to fetch character media image: ${imgRes.status} ${imgRes.statusText}`
      );
    }
    const sourceMimeType =
      imgRes.headers.get('content-type') || 'image/jpeg';
    const imgArrayBuffer = await imgRes.arrayBuffer();
    const base64SourceImage = Buffer.from(imgArrayBuffer).toString('base64');

    const requestedTypeId = url.searchParams.get('type');
    const matchedArchetype =
      DATING_PHOTO_ARCHETYPES.find((a) => a.id === requestedTypeId) ||
      DATING_PHOTO_ARCHETYPES[
        Math.floor(Math.random() * DATING_PHOTO_ARCHETYPES.length)
      ];

    const savedPose = savedProfile?.profile?.photoPrompts?.[index];
    const poseObj = savedPose || {
      label: matchedArchetype.label,
      scenePrompt: matchedArchetype.instruction,
    };

    const charDescription = [
      character?.gender,
      character?.race,
      character?.activeSpec,
      character?.class,
    ]
      .filter(Boolean)
      .join(' ');

    const imagePrompt = `Using the attached World of Warcraft character image of ${character?.name || 'this character'} (${charDescription}) as the exact character reference (keep their race, face, hair, skin tone, and armor/transmog style faithful to the reference image), generate a cute, wholesome, tongue-in-cheek dating app profile photo.

Scene & Pose (${poseObj.label}): ${poseObj.scenePrompt}

Style guidelines:
- Cute, charming, expressive, and friendly (e.g., a warm smile, a playful wink, a cheerful laugh, or a goofy-cute flexed muscle).
- Strictly wholesome and SFW — NOT sexy or suggestive.
- Framed like a great candid dating app portrait in vibrant World of Warcraft stylized 3D art.`;

    const ai = createGeminiClient();
    const genRes = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: sourceMimeType,
                data: base64SourceImage,
              },
            },
            {
              text: imagePrompt,
            },
          ],
        },
      ],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    let generatedBase64 = null;
    let generatedMimeType = 'image/png';

    for (const candidate of genRes.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData?.data) {
          generatedBase64 = part.inlineData.data;
          generatedMimeType = part.inlineData.mimeType || 'image/png';
          break;
        }
      }
      if (generatedBase64) break;
    }

    if (!generatedBase64) {
      throw new Error('Could not generate an image for this photo slot.');
    }

    const outputBuffer = Buffer.from(generatedBase64, 'base64');

    if (isCacheEnabled()) {
      try {
        await imageStore.set(blobKey, outputBuffer, {
          metadata: {
            mimeType: generatedMimeType,
            createdAt: new Date().toISOString(),
          },
        });
      } catch (blobWriteErr) {
        console.warn('Photo blob write warning:', blobWriteErr.message);
      }
    }

    return new Response(outputBuffer, {
      status: 200,
      headers: {
        'Content-Type': generatedMimeType,
        'Cache-Control': isCacheEnabled()
          ? 'public, max-age=86400'
          : 'no-store',
        'X-Cache': 'MISS',
      },
    });
  } catch (err) {
    console.error('Error in /api/profile/:slug/photo/:index:', err);
    return Response.json(
      {
        error: err.message || 'Failed to generate character dating photo.',
      },
      { status: 500 }
    );
  }
};

export const config = {
  path: '/api/profile/:slug/photo/:index',
};
