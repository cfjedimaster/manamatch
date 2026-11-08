const CLASS_COLORS = {
  Warrior: '#C69B6D',
  Paladin: '#F48CBA',
  Hunter: '#AAD372',
  Rogue: '#FFF468',
  Priest: '#FFFFFF',
  'Death Knight': '#C41E3A',
  Shaman: '#0070DD',
  Mage: '#3FC7EB',
  Warlock: '#8788EE',
  Monk: '#00FF98',
  Druid: '#FF7C0A',
  'Demon Hunter': '#A330C9',
  Evoker: '#33937F',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const knownCharacterNames = new Map();

function toSlug(nameOrSlug) {
  return String(nameOrSlug || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getDisplayName(slug, explicitName = null) {
  if (explicitName) {
    knownCharacterNames.set(slug, explicitName);
    return explicitName;
  }
  if (knownCharacterNames.has(slug)) {
    return knownCharacterNames.get(slug);
  }
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function applyClassTheme(character) {
  const root = document.documentElement;
  const classColor = CLASS_COLORS[character?.class] || '#f59e0b';
  root.style.setProperty('--class-color', classColor);

  const faction = String(character?.faction || '').toLowerCase();
  if (faction.includes('horde')) {
    root.style.setProperty('--faction-color', '#ef4444');
  } else if (faction.includes('alliance')) {
    root.style.setProperty('--faction-color', '#3b82f6');
  } else {
    root.style.setProperty('--faction-color', '#f59e0b');
  }
}

function updateNavAuth(authenticated) {
  const loginBtn = document.getElementById('nav-login-btn');
  const charsBtn = document.getElementById('nav-chars-btn');
  const logoutBtn = document.getElementById('nav-logout-btn');

  if (authenticated) {
    loginBtn.hidden = true;
    charsBtn.hidden = false;
    logoutBtn.hidden = false;
  } else {
    loginBtn.hidden = false;
    charsBtn.hidden = true;
    logoutBtn.hidden = true;
  }
}

async function initHomeView() {
  document.getElementById('home-view').hidden = false;
  document.getElementById('profile-view').hidden = true;
  document.title = 'ManaMatch — Find Your Soulbound in Azeroth';

  const urlParams = new URLSearchParams(window.location.search);
  const authError = urlParams.get('auth_error');
  const authErrBanner = document.getElementById('auth-error-banner');
  if (authError) {
    authErrBanner.textContent = `Battle.net Login Error: ${authError}`;
    authErrBanner.hidden = false;
  } else {
    authErrBanner.hidden = true;
  }

  const loggedOutCta = document.getElementById('logged-out-cta');
  const pickerSection = document.getElementById('character-picker-section');
  const charsLoading = document.getElementById('characters-loading');
  const charsError = document.getElementById('characters-error');
  const charsGrid = document.getElementById('characters-grid');

  charsLoading.hidden = false;
  charsError.hidden = true;
  charsGrid.innerHTML = '';

  try {
    const res = await fetch('/api/characters');
    const data = await res.json();

    charsLoading.hidden = true;
    updateNavAuth(Boolean(data.authenticated));

    if (!data.authenticated) {
      loggedOutCta.hidden = false;
      pickerSection.hidden = true;
      return;
    }

    loggedOutCta.hidden = true;
    pickerSection.hidden = false;

    if (data.error) {
      charsError.textContent = data.error;
      charsError.hidden = false;
    }

    const chars = data.characters || [];
    if (chars.length === 0) {
      charsGrid.innerHTML = `
        <div class="char-card" style="grid-column: 1 / -1;">
          <p style="margin:0; color:var(--text-muted);">
            No <strong>World of Warcraft: Forever</strong> characters were returned for this Battle.net account.
            (Note: Forever characters must reach Level 10 and log out at least once to appear in the Battle.net API.)
          </p>
        </div>
      `;
      return;
    }

    charsGrid.innerHTML = chars
      .map((c) => {
        if (c.slug && c.name) {
          knownCharacterNames.set(c.slug, c.name);
        }
        const classColor = CLASS_COLORS[c.class] || '#f8f5fc';
        const details = [c.gender, c.race, c.class, c.faction]
          .filter(Boolean)
          .join(' · ');

        return `
          <div class="char-card">
            <div>
              <div class="char-card-top">
                <h3 class="char-card-name" style="color:${escapeHtml(classColor)}">
                  ${escapeHtml(c.name)}
                </h3>
                ${
                  c.level != null
                    ? `<span class="char-card-lvl">Lv ${escapeHtml(c.level)}</span>`
                    : ''
                }
              </div>
              <div class="char-card-meta">${escapeHtml(details || 'Hero of Azeroth')}</div>
            </div>
            <div class="char-card-actions">
              <a href="/${encodeURIComponent(c.slug)}" class="btn btn-primary btn-sm" data-nav-slug="${escapeHtml(c.slug)}" data-nav-name="${escapeHtml(c.name)}">
                ${c.hasProfile ? '💘 View Dating Profile' : '✨ Create Dating Profile'}
              </a>
              ${
                c.hasProfile
                  ? `<a href="/${encodeURIComponent(c.slug)}?refresh=1" class="btn btn-outline btn-sm" data-nav-slug="${escapeHtml(c.slug)}" data-nav-name="${escapeHtml(c.name)}" data-nav-refresh="1" title="Re-fetch character stats and update profile">
                      🔄 Update
                    </a>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');

    charsGrid.querySelectorAll('a[data-nav-slug]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const slug = link.dataset.navSlug;
        const name = link.dataset.navName;
        const refresh = link.dataset.navRefresh === '1';
        navigateToProfile(slug, refresh, name);
      });
    });
  } catch (err) {
    charsLoading.hidden = true;
    charsError.textContent =
      err.message || 'Could not check Battle.net login status.';
    charsError.hidden = false;
  }
}

function renderPhotosGrid(slug, photoPrompts = [], forceRefresh = false) {
  const grid = document.getElementById('photos-grid');

  const slots = [0, 1, 2, 3].map((idx) => {
    const promptObj = photoPrompts[idx] || {};
    return {
      index: idx,
      id: promptObj.id || '',
      label: promptObj.label || `Photo #${idx + 1}`,
    };
  });

  grid.innerHTML = slots
    .map(
      (slot) => `
      <div class="photo-card" id="photo-card-${slot.index}">
        <div class="photo-frame" id="photo-frame-${slot.index}">
          <div class="photo-loader" id="photo-loader-${slot.index}">
            <div class="spinner spinner-sm"></div>
            <span>Developing "${escapeHtml(slot.label)}"...</span>
          </div>
          <img
            id="photo-img-${slot.index}"
            class="photo-img"
            alt="${escapeHtml(slot.label)}"
            hidden
          />
        </div>
        <div class="photo-caption-bar">
          <span class="photo-label">${escapeHtml(slot.label)}</span>
          <span class="photo-number">Photo ${slot.index + 1} of 4</span>
        </div>
      </div>
    `
    )
    .join('');

  // Load each photo independently so the page stays responsive
  slots.forEach((slot) => {
    loadSinglePhoto(slug, slot.index, slot.label, slot.id, forceRefresh);
  });
}

function loadSinglePhoto(slug, index, label, typeId = '', forceRefresh = false) {
  const loaderEl = document.getElementById(`photo-loader-${index}`);
  const imgEl = document.getElementById(`photo-img-${index}`);
  if (!loaderEl || !imgEl) return;

  loaderEl.hidden = false;
  imgEl.hidden = true;
  loaderEl.innerHTML = `
    <div class="spinner spinner-sm"></div>
    <span>Developing "${escapeHtml(label)}"...</span>
  `;

  const params = new URLSearchParams({ t: String(Date.now()) });
  if (typeId) params.set('type', typeId);
  if (forceRefresh) params.set('refresh', '1');
  const photoUrl = `/api/profile/${encodeURIComponent(slug)}/photo/${index}?${params.toString()}`;

  imgEl.onload = () => {
    loaderEl.hidden = true;
    imgEl.hidden = false;
  };

  imgEl.onerror = () => {
    loaderEl.innerHTML = `
      <span>⚠️ Photo generation timed out or failed.</span>
      <button type="button" class="btn btn-outline btn-sm" id="retry-photo-${index}">
        Retry Photo
      </button>
    `;
    const retryBtn = document.getElementById(`retry-photo-${index}`);
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        loadSinglePhoto(slug, index, label, typeId, true);
      });
    }
  };

  imgEl.onclick = () => {
    openLightbox(imgEl.src, label);
  };

  imgEl.src = photoUrl;
}

function renderProfileData(data, forceRefreshPhotos = false) {
  const c = data.character || {};
  const p = data.profile || {};

  applyClassTheme(c);

  document.title = `${c.name || data.slug} — ManaMatch Dating Profile`;

  // Avatar
  const avatarImg = document.getElementById('prof-avatar');
  const avatarFallback = document.getElementById('prof-avatar-fallback');
  const avatarUrl =
    c.img?.avatar || c.img?.inset || c.img?.main || c.img?.['main-raw'];

  if (avatarUrl) {
    avatarImg.src = avatarUrl;
    avatarImg.hidden = false;
    avatarFallback.hidden = true;
  } else {
    avatarImg.hidden = true;
    avatarFallback.hidden = false;
  }

  document.getElementById('prof-level-badge').textContent = c.level ?? '??';
  document.getElementById('prof-faction-pill').textContent =
    c.faction || 'Azeroth';
  document.getElementById('prof-race-pill').textContent =
    [c.gender, c.race].filter(Boolean).join(' ') || 'Unknown Race';
  document.getElementById('prof-class-pill').textContent =
    [c.activeSpec, c.class].filter(Boolean).join(' ') || 'Adventurer';

  const guildPill = document.getElementById('prof-guild-pill');
  if (c.guild) {
    guildPill.textContent = `<${c.guild}>`;
    guildPill.hidden = false;
  } else {
    guildPill.hidden = true;
  }

  const titleEl = document.getElementById('prof-title');
  if (c.activeTitle) {
    titleEl.textContent = c.activeTitle;
    titleEl.hidden = false;
  } else {
    titleEl.hidden = true;
  }

  if (c.name && data.slug) {
    knownCharacterNames.set(data.slug, c.name);
  }
  document.getElementById('prof-name').textContent = c.name || getDisplayName(data.slug);
  document.getElementById('prof-tagline').textContent = `"${p.tagline || 'Looking for my Soulbound partner in Azeroth.'}"`;

  const cacheBadge = document.getElementById('prof-cache-badge');
  cacheBadge.textContent = data.cached
    ? '💘 Saved Profile'
    : '✨ Freshly Updated';

  document.getElementById('prof-slug-code').textContent = `/${data.slug}`;

  // Bio paragraphs
  const bioContainer = document.getElementById('prof-bio');
  const paragraphs = String(p.bio || '')
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean);
  bioContainer.innerHTML = paragraphs
    .map((para) => `<p>${escapeHtml(para)}</p>`)
    .join('');

  // Likes & Dislikes
  const likesEl = document.getElementById('prof-likes');
  likesEl.innerHTML = (p.likes || [])
    .map((item) => `<li><span>💚</span><span>${escapeHtml(item)}</span></li>`)
    .join('');

  const dislikesEl = document.getElementById('prof-dislikes');
  dislikesEl.innerHTML = (p.dislikes || [])
    .map((item) => `<li><span>🚩</span><span>${escapeHtml(item)}</span></li>`)
    .join('');

  // Source Paragraph
  document.getElementById('prof-source-paragraph').textContent =
    data.characterParagraph || '';

  // Render 4 Dating App Photos
  renderPhotosGrid(data.slug, p.photoPrompts || [], forceRefreshPhotos);
}

async function initProfileView(rawSlug, forceRefresh = false, explicitName = null) {
  const slug = toSlug(rawSlug);
  const displayName = getDisplayName(slug, explicitName);
  document.getElementById('home-view').hidden = true;
  document.getElementById('profile-view').hidden = false;

  const loadingEl = document.getElementById('profile-loading');
  const errorEl = document.getElementById('profile-error');
  const contentEl = document.getElementById('profile-content');

  loadingEl.hidden = false;
  errorEl.hidden = true;
  contentEl.hidden = true;

  const loadingTitleEl = document.getElementById('profile-loading-title');
  loadingTitleEl.textContent = forceRefresh
    ? `Updating ${displayName}'s Dating Profile...`
    : `Summoning ${displayName}'s Dating Profile...`;

  // Also check auth state quietly so header buttons and character names are accurate
  fetch('/api/characters')
    .then((r) => r.json())
    .then((d) => {
      updateNavAuth(Boolean(d.authenticated));
      const match = (d.characters || []).find((ch) => ch.slug === slug);
      if (match?.name) {
        knownCharacterNames.set(slug, match.name);
        if (!loadingEl.hidden) {
          loadingTitleEl.textContent = forceRefresh
            ? `Updating ${match.name}'s Dating Profile...`
            : `Summoning ${match.name}'s Dating Profile...`;
        }
      }
    })
    .catch(() => {});

  try {
    const query = forceRefresh ? '?refresh=1' : '';
    const res = await fetch(`/api/profile/${encodeURIComponent(slug)}${query}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }

    // Clean ?refresh=1 from URL bar if present
    if (window.location.search.includes('refresh=1')) {
      window.history.replaceState({}, '', `/${encodeURIComponent(slug)}`);
    }

    loadingEl.hidden = true;
    errorEl.hidden = true;
    contentEl.hidden = false;

    renderProfileData(data, forceRefresh);
  } catch (err) {
    loadingEl.hidden = true;
    contentEl.hidden = true;
    errorEl.hidden = false;
    document.getElementById('profile-error-msg').textContent =
      err.message || 'Could not load or generate this character profile.';
  }
}

function navigateToProfile(slugOrName, forceRefresh = false, explicitName = null) {
  const slug = toSlug(slugOrName);
  if (!slug) return;
  const targetUrl = `/${encodeURIComponent(slug)}${forceRefresh ? '?refresh=1' : ''}`;
  window.history.pushState({}, '', targetUrl);
  initProfileView(slug, forceRefresh, explicitName);
}

function openLightbox(src, caption) {
  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');
  img.src = src;
  cap.textContent = caption || '';
  modal.hidden = false;
}

function closeLightbox() {
  document.getElementById('lightbox-modal').hidden = true;
}

function handleRoute() {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams(window.location.search);
  const forceRefresh = params.get('refresh') === '1';

  if (!path || path === 'index.html') {
    initHomeView();
  } else {
    initProfileView(decodeURIComponent(path), forceRefresh);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Brand link & My Characters nav button
  document.getElementById('brand-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.history.pushState({}, '', '/');
    initHomeView();
  });

  document.getElementById('nav-chars-btn').addEventListener('click', (e) => {
    e.preventDefault();
    window.history.pushState({}, '', '/');
    initHomeView();
  });

  // Profile toolbar actions
  document.getElementById('copy-link-btn').addEventListener('click', async () => {
    const btn = document.getElementById('copy-link-btn');
    try {
      await navigator.clipboard.writeText(window.location.href);
      const orig = btn.textContent;
      btn.textContent = '✅ Link Copied!';
      setTimeout(() => {
        btn.textContent = orig;
      }, 2000);
    } catch {
      prompt('Copy this profile link:', window.location.href);
    }
  });

  document.getElementById('regenerate-btn').addEventListener('click', () => {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (path) {
      initProfileView(decodeURIComponent(path), true);
    }
  });

  document.getElementById('profile-retry-btn').addEventListener('click', () => {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (path) {
      initProfileView(decodeURIComponent(path), false);
    }
  });

  // Lightbox listeners
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-backdrop').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  window.addEventListener('popstate', handleRoute);

  handleRoute();
});
