// ============================================
// Google OAuth Configuration
// You need to replace this with your own Google Client ID
// Get it from: https://console.cloud.google.com/apis/credentials
// ============================================
const GOOGLE_CLIENT_ID = '64733114747-ra62220io018kmui4u3sofo4vu8r16oh.apps.googleusercontent.com';

// Supabase Configuration
const SUPABASE_URL = 'https://urnbbsbnfrffqmoyvivw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVybmJic2JuZnJmZnFtb3l2aXZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODI0NTYsImV4cCI6MjA5NDE1ODQ1Nn0.srfinvvX2ILO9_sVwP2TjZQucQYQ1tLJPZyGbOc2y4g';

let links = [];
let currentSearchQuery = '';
let currentUser = null;
let isLoading = false;

const RESULTS_PAGE_SIZE = 10;
const MAX_RESULTS = 100;
let visibleLimit = RESULTS_PAGE_SIZE;

// Helper function to make Supabase requests
async function supabaseRequest(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...options.headers
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    throw new Error(`Database error: ${response.status}`);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return { success: true };
  }

  try {
    return await response.json();
  } catch (e) {
    return { success: true };
  }
}

// Load links from database
async function loadLinks() {
  showLoading(true);

  try {
    const data = await supabaseRequest('links?order=timestamp.desc');

    if (data && Array.isArray(data)) {
      links = data;
      saveLinksToLocalBackup();
    } else {
      throw new Error('Invalid response format');
    }
  } catch (error) {
    console.error('Failed to load from database:', error);
    loadLocalBackup();
  }

  showLoading(false);
  displayLinks();
}

// Save a single link to database
async function insertLink(link) {
  try {
    await supabaseRequest('links', {
      method: 'POST',
      body: JSON.stringify(link)
    });
    return true;
  } catch (error) {
    console.error('Failed to insert link:', error);
    return false;
  }
}

// Update a link in database (for votes)
async function updateLink(linkId, updates) {
  try {
    await supabaseRequest(`links?id=eq.${linkId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    return true;
  } catch (error) {
    console.error('Failed to update link:', error);
    return false;
  }
}

// Local backup functions
function saveLinksToLocalBackup() {
  localStorage.setItem('link_manager_backup', JSON.stringify(links));
}

function loadLocalBackup() {
  const backup = localStorage.getItem('link_manager_backup');
  if (backup) {
    links = JSON.parse(backup);
    showAlert('Using local backup - database offline', 'info');
  } else {
    links = [];
    saveLinksToLocalBackup();
  }
}

// Update database status display
function showLoading(show) {
  isLoading = show;
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.disabled = show;
  }
}

function getVoteScore(link) {
  return (link.upvotes?.length || 0) - (link.downvotes?.length || 0);
}

function getUserVote(link) {
  if (!currentUser) return null;
  const userEmail = currentUser.email;
  if (link.upvotes?.includes(userEmail)) return 'up';
  if (link.downvotes?.includes(userEmail)) return 'down';
  return null;
}

async function upvoteLink(linkId) {
  if (!currentUser) {
    showAlert('Please sign in to vote', 'error');
    return false;
  }

  const link = links.find(l => l.id === linkId);
  if (!link) return false;

  if (!link.upvotes) link.upvotes = [];
  if (!link.downvotes) link.downvotes = [];

  const userEmail = currentUser.email;
  const alreadyUpvoted = link.upvotes.includes(userEmail);
  const alreadyDownvoted = link.downvotes.includes(userEmail);

  if (alreadyUpvoted) {
    link.upvotes = link.upvotes.filter(email => email !== userEmail);
    showAlert('Removed your upvote', 'success');
  } else {
    if (alreadyDownvoted) {
      link.downvotes = link.downvotes.filter(email => email !== userEmail);
    }
    link.upvotes.push(userEmail);
    showAlert('✓ Upvoted!', 'success');
  }

  const updateSuccess = await updateLink(linkId, {
    upvotes: link.upvotes,
    downvotes: link.downvotes
  });

  if (!updateSuccess) {
    showAlert('Failed to save vote to cloud', 'error');
  }

  saveLinksToLocalBackup();
  displayLinks();
  return true;
}

async function downvoteLink(linkId) {
  if (!currentUser) {
    showAlert('Please sign in to vote', 'error');
    return false;
  }

  const link = links.find(l => l.id === linkId);
  if (!link) return false;

  if (!link.upvotes) link.upvotes = [];
  if (!link.downvotes) link.downvotes = [];

  const userEmail = currentUser.email;
  const alreadyDownvoted = link.downvotes.includes(userEmail);
  const alreadyUpvoted = link.upvotes.includes(userEmail);

  if (alreadyDownvoted) {
    link.downvotes = link.downvotes.filter(email => email !== userEmail);
    showAlert('Removed your downvote', 'success');
  } else {
    if (alreadyUpvoted) {
      link.upvotes = link.upvotes.filter(email => email !== userEmail);
    }
    link.downvotes.push(userEmail);
    showAlert('▼ Downvoted!', 'success');
  }

  const updateSuccess = await updateLink(linkId, {
    upvotes: link.upvotes,
    downvotes: link.downvotes
  });

  if (!updateSuccess) {
    showAlert('Failed to save vote to cloud', 'error');
  }

  saveLinksToLocalBackup();
  displayLinks();
  return true;
}

async function addLink(title, url, keywordsText) {
  if (!currentUser) {
    showAlert('Please sign in to submit links', 'error');
    return false;
  }

  if (!title || !title.trim()) {
    showAlert('Please enter a title', 'error');
    return false;
  }

  if (!url || !url.trim()) {
    showAlert('Please enter a URL', 'error');
    return false;
  }

  if (!keywordsText || !keywordsText.trim()) {
    showAlert('Please enter at least one keyword', 'error');
    return false;
  }

  let cleanUrl = url.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }

  const keywords = keywordsText
    .split(/[ ,]+/)
    .filter(kw => kw.trim().length > 0)
    .map(kw => kw.toLowerCase().trim());

  if (keywords.length === 0) {
    showAlert('Please enter at least one valid keyword', 'error');
    return false;
  }

  const newLink = {
    id: Date.now().toString(),
    title: title.trim(),
    url: cleanUrl,
    keywords: keywords,
    timestamp: Date.now(),
    upvotes: [],
    downvotes: [],
    submitterName: currentUser.name,
    submitterEmail: currentUser.email
  };

  const insertSuccess = await insertLink(newLink);

  if (!insertSuccess) {
    showAlert('Failed to save to cloud', 'error');
    return false;
  }

  links.unshift(newLink);

  document.getElementById('linkTitle').value = '';
  document.getElementById('linkUrl').value = '';
  document.getElementById('linkKeywords').value = '';

  showAlert('✓ Link added successfully!', 'success');
  saveLinksToLocalBackup();
  displayLinks();

  return true;
}

// ---- relevance-based search ----

function getSearchTerms(query) {
  if (!query || !query.trim()) return [];
  return query.toLowerCase().trim().split(/[ ,]+/).filter(t => t.length > 0);
}

function scoreLink(link, terms) {
  const title = (link.title || '').toLowerCase();
  const keywords = (link.keywords || []).map(k => k.toLowerCase());
  const titleWords = title.split(/\s+/).filter(w => w.length > 0);
  const fullQuery = terms.join(' ');

  let score = 0;
  let matchedTerms = 0;

  terms.forEach(term => {
    let termMatched = false;
    const termRegex = new RegExp('(?:^|[^a-z0-9])' + escapeRegex(term) + '(?:$|[^a-z0-9])', 'i');

    // Title scoring
    if (title === term) {
      score += 100;
      termMatched = true;
    } else if (title.startsWith(term + ' ')) {
      score += 80;
      termMatched = true;
    } else if (termRegex.test(title)) {
      score += 60;
      termMatched = true;
    } else if (title.includes(term)) {
      score += 35;
      termMatched = true;
    }

    // Title word prefix match (e.g. "reac" matches "react")
    if (titleWords.some(word => word.startsWith(term) && word !== term)) {
      score += 25;
      termMatched = true;
    }

    // Keyword scoring
    if (keywords.some(k => k === term)) {
      score += 50;
      termMatched = true;
    } else if (keywords.some(k => k.startsWith(term))) {
      score += 30;
      termMatched = true;
    } else if (keywords.some(k => k.includes(term))) {
      score += 15;
      termMatched = true;
    }

    if (termMatched) matchedTerms += 1;
  });

  // Bonus for matching all terms
  if (terms.length > 0 && matchedTerms === terms.length) {
    score += 40;
  }

  // Bonus for matching more unique terms
  score += matchedTerms * 15;

  // Partial phrase match: query as a substring of the title
  if (fullQuery && title.includes(fullQuery)) {
    score += 45;
  }

  // Slight popularity boost as a tie-breaker
  score += (link.upvotes?.length || 0) * 1.5;
  score -= (link.downvotes?.length || 0) * 0.5;

  return score;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchLinks(query) {
  const terms = getSearchTerms(query);
  if (terms.length === 0) {
    return [...links];
  }

  const scored = links.map(link => ({
    link,
    score: scoreLink(link, terms)
  }));

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.link);
}

function displayLinks() {
  const filteredLinks = searchLinks(currentSearchQuery);

  // When searching, preserve relevance order from searchLinks.
  // Otherwise, sort by vote score then recency.
  let sortedLinks;
  if (currentSearchQuery && currentSearchQuery.trim()) {
    sortedLinks = filteredLinks;
  } else {
    sortedLinks = [...filteredLinks].sort((a, b) => {
      const scoreDiff = getVoteScore(b) - getVoteScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return b.timestamp - a.timestamp;
    });
  }

  const linksListDiv = document.getElementById('linksList');
  const resultCountSpan = document.getElementById('resultCount');
  const loadMoreContainer = document.getElementById('loadMoreContainer');

  if (!linksListDiv) return;

  if (loadMoreContainer) loadMoreContainer.innerHTML = '';

  if (sortedLinks.length === 0) {
    linksListDiv.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-title">No links found</p>
        <p>Be the first to submit a link!</p>
      </div>
    `;
    if (resultCountSpan) resultCountSpan.textContent = '0 results';
    return;
  }

  if (resultCountSpan) {
    resultCountSpan.textContent = `${sortedLinks.length} result${sortedLinks.length !== 1 ? 's' : ''}`;
  }

  const pageLinks = sortedLinks.slice(0, visibleLimit);

  const upIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`;
  const downIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

  linksListDiv.innerHTML = pageLinks.map(link => {
    const score = getVoteScore(link);
    const userVote = getUserVote(link);
    const upvoteCount = link.upvotes?.length || 0;
    const downvoteCount = link.downvotes?.length || 0;

    return `
      <div class="link-item">
        <div class="link-title">
          <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.title)}</a>
        </div>
        <div class="link-url">
          <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.url.substring(0, 70))}${link.url.length > 70 ? '...' : ''}</a>
        </div>
        <div class="keywords">
          ${link.keywords.map(kw => `<span class="keyword-tag">${escapeHtml(kw)}</span>`).join('')}
        </div>
        <div class="link-meta">Added ${new Date(link.timestamp).toLocaleString()} by ${escapeHtml(link.submitterName || 'Anonymous')}</div>
        <div class="vote-section">
          <div class="vote-buttons">
            <button class="vote-btn upvote ${userVote === 'up' ? 'active' : ''}" data-action="upvote" data-id="${link.id}" aria-label="Upvote">
              ${upIcon} ${upvoteCount}
            </button>
            <span class="vote-score">${score > 0 ? '+' + score : score}</span>
            <button class="vote-btn downvote ${userVote === 'down' ? 'active' : ''}" data-action="downvote" data-id="${link.id}" aria-label="Downvote">
              ${downIcon} ${downvoteCount}
            </button>
          </div>
          ${userVote ? `<div class="vote-status">You ${userVote === 'up' ? 'upvoted' : 'downvoted'} this</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (loadMoreContainer) {
    if (sortedLinks.length > visibleLimit && visibleLimit < MAX_RESULTS) {
      loadMoreContainer.innerHTML = `
        <button id="loadMoreBtn" class="btn btn-secondary">Show more</button>
      `;
      const loadMoreBtn = document.getElementById('loadMoreBtn');
      if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
          visibleLimit = Math.min(visibleLimit + RESULTS_PAGE_SIZE, MAX_RESULTS);
          displayLinks();
        });
      }
    } else if (visibleLimit >= sortedLinks.length || visibleLimit >= MAX_RESULTS) {
      loadMoreContainer.innerHTML = `
        <p class="all-done">That's everything</p>
      `;
    }
  }
}

function showAlert(message, type) {
  const alertDiv = document.getElementById('alert');
  if (alertDiv) {
    alertDiv.textContent = message;
    alertDiv.className = `alert ${type}`;
    setTimeout(() => {
      alertDiv.className = 'alert';
    }, 3000);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Google Sign-In Handlers
function handleGoogleSignIn(response) {
  if (response.credential) {
    const payload = parseJwt(response.credential);
    if (payload) {
      currentUser = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture
      };

      localStorage.setItem('google_user', JSON.stringify(currentUser));

      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appContent').classList.add('visible');
      updateUserInfoDisplay();
      loadLinks();
    }
  }
}

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('JWT parse error:', error);
    return null;
  }
}

function loginAsGuest() {
  const errorEl = document.getElementById('guestPasswordError');
  const inputEl = document.getElementById('guestPasswordInput');
  const entered = inputEl ? inputEl.value : '';

  if (errorEl) errorEl.textContent = '';

  fetch('nexus-config.json')
    .then(r => {
      if (!r.ok) throw new Error('Could not load config');
      return r.json();
    })
    .then(cfg => {
      const required = cfg.guestPassword || '';
      if (required && entered !== required) {
        if (errorEl) errorEl.textContent = 'Incorrect guest password.';
        return;
      }

      const guestId = 'guest_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      currentUser = {
        id: guestId,
        email: `${guestId}@nexus.local`,
        name: 'Guest',
        picture: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23dadce0%22/%3E%3Ccircle cx=%2250%22 cy=%2240%22 r=%2220%22 fill=%22%235f6368%22/%3E%3Cellipse cx=%2250%22 cy=%2288%22 rx=%2235%22 ry=%2225%22 fill=%22%235f6368%22/%3E%3C/svg%3E'
      };

      localStorage.setItem('google_user', JSON.stringify(currentUser));

      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appContent').classList.add('visible');
      updateUserInfoDisplay();
      loadLinks();
    })
    .catch(err => {
      console.error('Guest password check failed:', err);
      if (errorEl) errorEl.textContent = 'Unable to verify password. Please try again.';
    });
}

function updateUserInfoDisplay() {
  const accountDiv = document.getElementById('headerAccount');
  if (!accountDiv) return;

  if (currentUser) {
    accountDiv.innerHTML = `
      <div class="user-info">
        <img src="${currentUser.picture}" class="user-avatar" alt="Avatar">
        <span class="user-name">${escapeHtml(currentUser.name)}</span>
        <button id="signOutBtn" class="sign-out-btn">Sign Out</button>
      </div>
    `;

    document.getElementById('signOutBtn').addEventListener('click', signOut);
  } else {
    accountDiv.innerHTML = `<a href="login.html?redirect=${encodeURIComponent(getCurrentPage())}" class="sign-in-btn">Sign In</a>`;
  }
}

function getCurrentPage() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

function redirectToLogin() {
  const currentUrl = window.location.pathname.split('/').pop() + window.location.search;
  window.location.href = 'login.html?redirect=' + encodeURIComponent(currentUrl);
}

function signOut() {
  currentUser = null;
  localStorage.removeItem('google_user');

  if (window.google && window.google.accounts) {
    google.accounts.id.disableAutoSelect();
  }

  redirectToLogin();
}

function initializeGoogleSignIn() {
  if (!window.google) {
    setTimeout(initializeGoogleSignIn, 100);
    return;
  }

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleSignIn,
    auto_select: false,
    cancel_on_tap_outside: false
  });

  google.accounts.id.renderButton(
    document.getElementById('googleSignInBtn'),
    { theme: 'outline', size: 'large', text: 'signin_with' }
  );
}

function checkExistingLogin() {
  const savedUser = localStorage.getItem('google_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContent').classList.add('visible');
    updateUserInfoDisplay();

    const urlParams = new URLSearchParams(window.location.search);
    const prefillQuery = urlParams.get('q');
    if (prefillQuery) {
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = prefillQuery;
      currentSearchQuery = prefillQuery;
    }

    loadLinks();
  } else {
    redirectToLogin();
  }
}

function setupEventListeners() {
  function updateSearchQuery(query) {
    visibleLimit = RESULTS_PAGE_SIZE;
    const url = new URL(window.location.href);
    if (query && query.trim()) {
      url.searchParams.set('q', query.trim());
    } else {
      url.searchParams.delete('q');
    }
    window.location.href = url.toString();
  }

  const guestLoginBtn = document.getElementById('guestLoginBtn');
  if (guestLoginBtn) {
    guestLoginBtn.addEventListener('click', loginAsGuest);
  }

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      addLink(
        document.getElementById('linkTitle').value,
        document.getElementById('linkUrl').value,
        document.getElementById('linkKeywords').value
      );
    });
  }

  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      updateSearchQuery(document.getElementById('searchInput').value);
    });
  }

  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      document.getElementById('searchInput').value = '';
      updateSearchQuery('');
    });
  }

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        updateSearchQuery(e.target.value);
      }
    });
  }

  const linksList = document.getElementById('linksList');
  if (linksList) {
    linksList.addEventListener('click', (e) => {
      const upvoteBtn = e.target.closest('[data-action="upvote"]');
      const downvoteBtn = e.target.closest('[data-action="downvote"]');

      if (upvoteBtn) upvoteLink(upvoteBtn.getAttribute('data-id'));
      else if (downvoteBtn) downvoteLink(downvoteBtn.getAttribute('data-id'));
    });
  }
}

function init() {
  setupEventListeners();
  checkExistingLogin();
  initializeGoogleSignIn();
}

init();

// ---- load Nexus logo + font from nexus-config.json ----
(function() {
  const CONFIG_URL = 'nexus-config.json?v=' + Date.now();

  fetch(CONFIG_URL)
    .then(r => {
      if (!r.ok) throw new Error('Could not load ' + CONFIG_URL);
      return r.json();
    })
    .then(cfg => {
      if (cfg.font) {
        if (cfg.font.url) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = cfg.font.url;
          document.head.appendChild(link);
        }
        if (cfg.font.family) {
          document.documentElement.style.setProperty('--app-font', cfg.font.family);
        }
      }

      if (cfg.logo && cfg.logo.image) {
        const logoContainer = document.getElementById('headerLogo');
        const loginLogo = document.getElementById('loginLogo');
        if (logoContainer) {
          logoContainer.innerHTML = '';
          const img = document.createElement('img');
          img.src = cfg.logo.image;
          img.alt = cfg.logo.alt || 'Nexus';
          img.style.maxHeight = '32px';
          logoContainer.appendChild(img);
        }
        if (loginLogo) {
          loginLogo.src = cfg.logo.image;
          loginLogo.alt = cfg.logo.alt || 'Nexus';
          loginLogo.style.display = '';
        }
      }
    })
    .catch(err => {
      console.warn('Nexus config not applied:', err.message);
    });
})();
