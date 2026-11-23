/**
 * StatOme PWA — Local-First Engine (0.01s startup + Background Neon Sync)
 * Full Feature Edition:
 * 1. Detailed 6-criteria ratings (/5) & 3-tab Book Modal (Fiche & Saga, Évaluation, Notes & Sessions)
 * 2. Default Live Video Barcode Scanner (Html5Qrcode + BarcodeDetector) with instant metadata enrichment
 * 3. Full Statistics Suite (4 sub-tabs, Semainier/Mensuel/Annuel calendars, 10 Plotly charts with zero title/legend overlap)
 */

const CACHE_KEY = "statome_data_cache_v3";
const TIMER_KEY = "statome_timer_local_v3";
const AUTH_TOKEN_KEY = "statome_auth_token_v1";
const AUTH_USER_KEY = "statome_auth_user_v1";

const STATUS_COLORS = {
  "En cours": "#38BDF8",
  "Bibliothèque": "#818CF8",
  "Wishlist": "#F472B6",
  "À acheter": "#FB923C",
  "Terminé": "#34D399",
  "DNF": "#EF4444"
};

const FRENCH_MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

const FANTASY_SUBGENRES = [
  "High / Epic Fantasy",
  "Dark Fantasy",
  "Grimdark",
  "Romantasy / Romantic Fantasy",
  "Cozy Fantasy / Tranche de vie",
  "Flintlock Fantasy / Militaire",
  "Progression Fantasy / LitRPG",
  "Urban Fantasy",
  "Fantasy Historique",
  "Uchronie / Histoire Alternative",
  "Contes & Réécritures (Retellings)",
  "Fantasy de Mœurs (Fantasy of Manners)",
  "Sword & Sorcery",
  "Science Fantasy",
  "Fantasy Mythologique",
  "Réalisme Magique",
  "Fantasy Humoristique",
  "Steampunk",
  "New Weird",
  "Weird West / Fantasy Western",
  "Romance Paranormale",
  "Young Adult Fantasy",
  "Exploration & Aventure",
  "Dystopie / Post-Apocalyptique",
  "Fantasy Classique",
  "Autre"
];

let html5QrScanner = null;

let state = {
  books: [],
  sessions: [],
  notes: [],
  activeTab: "reading",
  selectedBookId: null,
  // Library state
  libFilter: "Tous",
  libSearch: "",
  libAdvOpen: false,
  libSubgenre: "Tous",
  libSpecialView: "all",
  // Add Book state (Camera by default!)
  addMode: "camera", // "camera" | "search"
  cameraActive: false,
  lastScannedCode: "",
  addDraft: {
    isbn: "",
    title: "",
    author: "",
    author_country: "France",
    series_name: "",
    series_volume: "",
    publisher: "",
    publication_year: new Date().getFullYear(),
    page_count: 320,
    chapter_count: "",
    price: "",
    format: "Broché",
    genres: "Fantasy",
    tags: "",
    fantasy_subgenres: [],
    popularity_score: "",
    cover_url: "",
    status: "Bibliothèque",
    pal_month_name: "Aucun",
    pal_year_val: String(new Date().getFullYear())
  },
  searchResults: [],
  // Stats state
  statsScope: "read", // "read" | "pal_month" | "pal_year" | "biblio" | "wishlist"
  statsTimeFilter: "all", // "all" | "month" | "year"
  statsSubTab: "calendar", // "calendar" | "rhythm" | "catalog" | "ratings"
  calMode: "week", // "week" | "month" | "year"
  weekOffset: 0,
  monthOffset: 0,
  yearOffset: 0,
  // Modal subtab
  bookModalTab: "info", // "info" | "eval" | "notes"
  // Timer
  timer: {
    bookId: null,
    isRunning: false,
    startTimeMs: null,
    accumulatedSec: 0,
    isFocused: true
  }
};

// ==========================================
// CACHE & SYNC ENGINE
// ==========================================
function loadLocalCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.books = parsed.books || [];
      state.sessions = parsed.sessions || [];
      state.notes = parsed.notes || [];
    }
    const rawTimer = localStorage.getItem(TIMER_KEY);
    if (rawTimer) {
      const t = JSON.parse(rawTimer);
      state.timer = {
        bookId: t.bookId || null,
        isRunning: Boolean(t.isRunning),
        startTimeMs: t.startTimeMs ? Number(t.startTimeMs) : null,
        accumulatedSec: Number(t.accumulatedSec || 0),
        isFocused: t.isFocused !== false
      };
    }
  } catch (e) {
    console.warn("Cache load warning:", e);
  }
}

function saveLocalCache() {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        books: state.books,
        sessions: state.sessions,
        notes: state.notes,
        updatedAt: Date.now()
      })
    );
  } catch (e) {}
}

function saveLocalTimer() {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(state.timer));
  } catch (e) {}
}

function setSyncStatus(syncing, text) {
  const dot = document.getElementById("sync-dot");
  const label = document.getElementById("sync-text");
  if (!dot || !label) return;
  if (syncing) {
    dot.classList.add("syncing");
    label.textContent = text || "Sync...";
  } else {
    dot.classList.remove("syncing");
    label.textContent = text || "Synchronisé";
  }
}

function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function getAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function apiCall(action, payload = null) {
  const isGet = !payload && (action === "bootstrap" || action === "auth_status");
  const url = `/api?action=${action}`;
  const token = getAuthToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, {
    method: isGet ? "GET" : "POST",
    headers,
    body: isGet ? undefined : JSON.stringify({ action, ...payload })
  });
  const data = await resp.json();
  if (resp.status === 401 || data.auth_required) {
    const err = new Error(data.error || "Authentification requise");
    err.authRequired = true;
    throw err;
  }
  if (!data.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}

window.syncFromServer = async function (manual = false) {
  if (!getAuthToken()) {
    await window.checkAuthAndBoot();
    return;
  }
  setSyncStatus(true, "Sync Neon...");
  try {
    const data = await apiCall("bootstrap");
    state.books = data.books || [];
    state.sessions = data.sessions || [];
    state.notes = data.notes || [];
    if (data.user) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
    }

    if (!state.timer.isRunning && state.timer.accumulatedSec <= 0 && data.active_timer) {
      const st = data.active_timer;
      state.timer = {
        bookId: st.book_id,
        isRunning: Boolean(st.is_running),
        startTimeMs: st.start_time ? st.start_time * 1000 : null,
        accumulatedSec: Number(st.accumulated_seconds || 0),
        isFocused: st.is_focused !== false
      };
      saveLocalTimer();
    }

    saveLocalCache();
    setSyncStatus(false, "Synchronisé");
    showAppShell(true);
    renderCurrentTab();
  } catch (err) {
    if (err.authRequired) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(CACHE_KEY);
      await window.checkAuthAndBoot();
      return;
    }
    setSyncStatus(false, "Hors-Ligne");
    if (manual) alert("Impossible de joindre Neon : " + err.message);
  }
};

function computeSpeeds(bookId = null) {
  const focusAll = state.sessions.filter((s) => s.is_focused !== false);
  const chillAll = state.sessions.filter((s) => s.is_focused === false);

  const calc = (arr) => {
    const mins = arr.reduce((acc, s) => acc + Number(s.duration_minutes || 0), 0);
    const pages = arr.reduce((acc, s) => acc + Number(s.pages_read || 0), 0);
    return mins > 0 && pages > 0 ? (pages / mins) * 60 : 0;
  };

  const globalFocusSpeed = calc(focusAll);
  const globalChillSpeed = calc(chillAll);

  let bookFocusSpeed = 0;
  if (bookId) {
    bookFocusSpeed = calc(focusAll.filter((s) => Number(s.book_id) === Number(bookId)));
  }

  return {
    refFocusSpeed: bookFocusSpeed > 0 ? bookFocusSpeed : (globalFocusSpeed > 0 ? globalFocusSpeed : 45),
    globalFocusSpeed,
    globalChillSpeed,
    focusCount: focusAll.length,
    chillCount: chillAll.length
  };
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMonthYearFrench(yyyyMm) {
  if (!yyyyMm || !yyyyMm.includes("-")) return yyyyMm || "";
  const [y, m] = yyyyMm.split("-");
  const mIdx = parseInt(m, 10) - 1;
  return mIdx >= 0 && mIdx < 12 ? `${FRENCH_MONTHS[mIdx]} ${y}` : yyyyMm;
}

window.switchTab = async function (tab) {
  if (state.activeTab === "add" && tab !== "add" && state.cameraActive) {
    await window.stopBarcodeCamera();
  }
  state.activeTab = tab;
  ["reading", "library", "add", "stats"].forEach((t) => {
    const el = document.getElementById(`view-${t}`);
    if (el) el.style.display = t === tab ? "block" : "none";
  });
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  renderCurrentTab();
};

function renderCurrentTab() {
  if (state.activeTab === "reading") renderReadingView();
  else if (state.activeTab === "library") renderLibraryView();
  else if (state.activeTab === "add") renderAddView();
  else if (state.activeTab === "stats") renderStatsView();
}

// ==========================================
// 1. VUE LECTURE (MODE ZEN + FOCUS/DÉTENTE)
// ==========================================
function getTimerSeconds() {
  let sec = Number(state.timer.accumulatedSec || 0);
  if (state.timer.isRunning && state.timer.startTimeMs) {
    sec += Math.max(0, (Date.now() - state.timer.startTimeMs) / 1000);
  }
  return Math.floor(sec);
}

function formatHMS(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function renderReadingView() {
  const el = document.getElementById("view-reading");
  const currentBooks = state.books.filter((b) => b.status === "En cours");

  if (currentBooks.length === 0) {
    el.innerHTML = `
      <div class="card" style="text-align:center; padding:32px 18px;">
        <div style="font-size:2.8rem;">📖</div>
        <h3 style="margin:10px 0 6px;">Aucune lecture en cours</h3>
        <p style="color:var(--muted); font-size:0.9rem; margin-bottom:18px;">
          Choisissez un livre dans votre bibliothèque pour démarrer une session.
        </p>
        <button class="btn btn-primary" onclick="window.switchTab('library')">📚 Ouvrir ma bibliothèque</button>
      </div>
    `;
    return;
  }

  if (!state.selectedBookId || !currentBooks.some((b) => b.id === Number(state.selectedBookId))) {
    state.selectedBookId = state.timer.bookId && currentBooks.some((b) => b.id === Number(state.timer.bookId))
      ? Number(state.timer.bookId)
      : currentBooks[0].id;
  }

  const book = currentBooks.find((b) => b.id === Number(state.selectedBookId)) || currentBooks[0];
  const curP = Number(book.current_page || 0);
  const totP = Math.max(Number(book.page_count || 1), 1);
  const pct = Math.min(100, Math.round((curP / totP) * 1000) / 10);
  const pagesLeft = Math.max(0, totP - curP);

  const { refFocusSpeed } = computeSpeeds(book.id);
  const hoursLeft = refFocusSpeed > 0 ? pagesLeft / refFocusSpeed : 0;
  const hInt = Math.floor(hoursLeft);
  const mInt = Math.round((hoursLeft - hInt) * 60);
  const estStr = hInt > 0 ? `~${hInt}h ${String(mInt).padStart(2, "0")}min` : `~${mInt} min`;

  const selectorHtml = currentBooks.length > 1
    ? `<select style="margin-bottom:12px;" onchange="window.selectActiveBook(this.value)">
        ${currentBooks.map((b) => `<option value="${b.id}" ${b.id === book.id ? "selected" : ""}>📖 ${escapeHtml(b.title)} — ${escapeHtml(b.author)}</option>`).join("")}
       </select>`
    : "";

  const coverHtml = book.cover_url
    ? `<img class="book-cover" src="${escapeHtml(book.cover_url)}" alt="Couverture" />`
    : `<div class="book-cover">📖</div>`;

  const seriesHtml = book.series_name
    ? `<div class="book-series">${escapeHtml(book.series_name)}${book.series_volume ? ` • Tome ${book.series_volume}` : ""}</div>`
    : "";

  const isFoc = state.timer.isFocused !== false;
  const curSec = getTimerSeconds();
  const isRunning = state.timer.isRunning;
  const timerColor = isRunning ? "#34D399" : (curSec > 0 ? "#F59E0B" : "#F8FAFC");
  const statusText = isRunning
    ? (isFoc ? "🟢 En direct • 🎯 Mode Focus" : "🟢 En direct • 🛋️ Mode Détente")
    : (curSec > 0 ? "🟡 En pause — Prêt à reprendre ou enregistrer" : "⚪ Prêt à démarrer");

  const validationHtml = (!isRunning && curSec > 0)
    ? `
      <div class="card" style="border-color: var(--primary);">
        <div style="font-weight:700; font-size:0.98rem; margin-bottom:6px;">📝 Enregistrer votre session</div>
        <div style="font-size:0.83rem; color:var(--muted); margin-bottom:10px;">
          Durée : <b style="color:var(--text);">${formatHMS(curSec)}</b> (${Math.max(0.1, Math.round((curSec / 60) * 10) / 10)} min) •
          Mode : <b>${isFoc ? "🎯 Focus" : "🛋️ Détente"}</b> • Départ : <b>p. ${curP}</b>
        </div>
        <label>Nouvelle page atteinte :</label>
        <input type="number" id="val-new-page" min="${curP}" max="${totP}" value="${Math.min(totP, curP + Math.max(1, Math.round((curSec / 3600) * refFocusSpeed)))}" />
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px;">
          <button class="btn btn-success" onclick="window.confirmTimerSession(${book.id}, ${curP})">✅ Enregistrer</button>
          <button class="btn btn-danger" onclick="window.resetTimer()">🗑️ Effacer (00:00)</button>
        </div>
      </div>
    `
    : "";

  const bookSessions = state.sessions.filter((s) => Number(s.book_id) === book.id);
  const bookNotes = state.notes.filter((n) => Number(n.book_id) === book.id);

  el.innerHTML = `
    ${selectorHtml}
    <div class="card">
      <div class="book-hero">
        ${coverHtml}
        <div class="book-meta">
          <div class="book-title">${escapeHtml(book.title)}</div>
          <div class="book-author">${escapeHtml(book.author)}</div>
          ${seriesHtml}
          <div class="progress-row">
            <span><b>${curP}</b> / ${totP} p.</span>
            <span style="color:var(--primary-light); font-weight:700;">${pct}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="time-est">⏳ ${pagesLeft} p. restantes (${estStr} à ${Math.round(refFocusSpeed)} p/h 🎯)</div>
        </div>
      </div>
    </div>

    <div class="mode-toggle">
      <button class="mode-btn ${isFoc ? "active-focus" : ""}" onclick="window.setTimerMode(true)">
        🎯 Lecture Focus
      </button>
      <button class="mode-btn ${!isFoc ? "active-chill" : ""}" onclick="window.setTimerMode(false)">
        🛋️ Lecture Détente
      </button>
    </div>
    <div class="mode-hint">
      ${isFoc
        ? "🎯 Lecture concentrée : compte dans votre vitesse de référence (pages/h)"
        : "🛋️ Transports, TV, interruptions : compte vos pages sans fausser votre vitesse Focus"}
    </div>

    <div class="card timer-card">
      <div class="timer-digits" id="live-timer-digits" style="color:${timerColor}">${formatHMS(curSec)}</div>
      <div class="timer-status">${statusText}</div>
      <div class="timer-controls">
        ${!isRunning
          ? `<button class="btn btn-primary" onclick="window.startTimer(${book.id})">▶️ ${curSec > 0 ? "Reprendre" : "Démarrer"}</button>`
          : `<button class="btn btn-warning" onclick="window.pauseTimer(${book.id})">⏸️ Pause</button>`
        }
        <button class="btn" onclick="window.stopTimer(${book.id})" ${(!isRunning && curSec <= 0) ? "disabled" : ""}>⏹️ Terminer</button>
      </div>
    </div>

    ${validationHtml}

    <div class="zen-actions">
      <button class="zen-btn" onclick="window.openQuickNoteModal(${book.id})">
        <span class="icon">✍️</span>
        <span>Note</span>
      </button>
      <button class="zen-btn" onclick="window.openManualSessionModal(${book.id})">
        <span class="icon">➕</span>
        <span>Manuel</span>
      </button>
      <button class="zen-btn" onclick="window.openFinishBookModal(${book.id})">
        <span class="icon">🏁</span>
        <span>Terminé</span>
      </button>
      <button class="zen-btn" onclick="window.openBookDetailModal(${book.id}, 'info')">
        <span class="icon">⚙️</span>
        <span>Fiche (${bookSessions.length + bookNotes.length})</span>
      </button>
    </div>
  `;
}

window.selectActiveBook = function (id) {
  state.selectedBookId = Number(id);
  renderReadingView();
};

window.setTimerMode = function (isFocused) {
  state.timer.isFocused = Boolean(isFocused);
  saveLocalTimer();
  renderReadingView();
  if (state.timer.isRunning || state.timer.accumulatedSec > 0) {
    apiCall("save_timer", {
      book_id: state.timer.bookId || state.selectedBookId,
      is_running: state.timer.isRunning,
      start_time: state.timer.startTimeMs ? state.timer.startTimeMs / 1000 : null,
      accumulated_seconds: state.timer.accumulatedSec,
      is_focused: state.timer.isFocused
    }).catch(() => {});
  }
};

window.startTimer = function (bookId) {
  state.timer.bookId = Number(bookId);
  state.timer.isRunning = true;
  state.timer.startTimeMs = Date.now();
  saveLocalTimer();
  renderReadingView();
  apiCall("save_timer", {
    book_id: bookId,
    is_running: true,
    start_time: state.timer.startTimeMs / 1000,
    accumulated_seconds: state.timer.accumulatedSec,
    is_focused: state.timer.isFocused
  }).catch(() => {});
};

window.pauseTimer = function (bookId) {
  if (state.timer.isRunning && state.timer.startTimeMs) {
    const elapsed = Math.max(1, (Date.now() - state.timer.startTimeMs) / 1000);
    state.timer.accumulatedSec = Number(state.timer.accumulatedSec || 0) + elapsed;
  }
  state.timer.isRunning = false;
  state.timer.startTimeMs = null;
  saveLocalTimer();
  renderReadingView();
  apiCall("save_timer", {
    book_id: bookId,
    is_running: false,
    start_time: null,
    accumulated_seconds: state.timer.accumulatedSec,
    is_focused: state.timer.isFocused
  }).catch(() => {});
};

window.stopTimer = function (bookId) {
  window.pauseTimer(bookId);
};

window.resetTimer = function () {
  state.timer = {
    bookId: null,
    isRunning: false,
    startTimeMs: null,
    accumulatedSec: 0,
    isFocused: state.timer.isFocused
  };
  saveLocalTimer();
  renderReadingView();
  apiCall("clear_timer", {}).catch(() => {});
};

window.confirmTimerSession = async function (bookId, startPage) {
  const input = document.getElementById("val-new-page");
  const endPage = Number(input ? input.value : startPage);
  const totalSec = getTimerSeconds();
  const durationMin = Math.max(0.5, Math.round((totalSec / 60) * 100) / 100);
  const isFocused = state.timer.isFocused !== false;

  const book = state.books.find((b) => b.id === Number(bookId));
  if (book && endPage > book.current_page) {
    book.current_page = endPage;
  }
  const pagesRead = Math.max(0, endPage - startPage);
  state.sessions.unshift({
    id: Date.now(),
    book_id: bookId,
    book_title: book ? book.title : "",
    book_cover: book ? book.cover_url : "",
    start_time: new Date().toISOString(),
    duration_minutes: Math.round(durationMin * 10) / 10,
    start_page: startPage,
    end_page: endPage,
    pages_read: pagesRead,
    pages_per_hour: Math.round((pagesRead / durationMin) * 600) / 10,
    is_focused: isFocused
  });

  state.timer = { bookId: null, isRunning: false, startTimeMs: null, accumulatedSec: 0, isFocused };
  saveLocalTimer();
  saveLocalCache();
  renderReadingView();

  try {
    setSyncStatus(true, "Enregistrement...");
    await apiCall("add_session", {
      book_id: bookId,
      start_page: startPage,
      end_page: endPage,
      duration_minutes: durationMin,
      is_focused: isFocused
    });
    await window.syncFromServer();
  } catch (err) {
    setSyncStatus(false, "Erreur sync");
    alert("Erreur lors de la sauvegarde : " + err.message);
  }
};

setInterval(() => {
  if (state.timer.isRunning && state.activeTab === "reading") {
    const el = document.getElementById("live-timer-digits");
    if (el) el.textContent = formatHMS(getTimerSeconds());
  }
}, 1000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.activeTab === "reading") {
    const el = document.getElementById("live-timer-digits");
    if (el) el.textContent = formatHMS(getTimerSeconds());
  }
});

// ==========================================
// 2. VUE BIBLIOTHÈQUE
// ==========================================
function renderLibraryView() {
  const el = document.getElementById("view-library");
  const curMonth = new Date().toISOString().slice(0, 7);
  const pills = ["Tous", "En cours", "À lire", "PAL du mois", "Terminé", "Wishlist", "À acheter", "DNF"];

  let filtered = state.books.filter((b) => {
    if (state.libFilter === "En cours") return b.status === "En cours";
    if (state.libFilter === "À lire") return b.status === "Bibliothèque";
    if (state.libFilter === "PAL du mois") return b.pal_month === curMonth;
    if (state.libFilter === "Terminé") return b.status === "Terminé";
    if (state.libFilter === "Wishlist") return b.status === "Wishlist";
    if (state.libFilter === "À acheter") return b.status === "À acheter";
    if (state.libFilter === "DNF") return b.status === "DNF";
    return true;
  });

  if (state.libSubgenre && state.libSubgenre !== "Tous") {
    const target = state.libSubgenre.toLowerCase();
    filtered = filtered.filter((b) =>
      (b.fantasy_subgenres || []).some((s) => s.toLowerCase() === target)
    );
  }

  if (state.libSearch.trim()) {
    const q = state.libSearch.toLowerCase().trim();
    filtered = filtered.filter(
      (b) =>
        (b.title || "").toLowerCase().includes(q) ||
        (b.author || "").toLowerCase().includes(q) ||
        (b.series_name || "").toLowerCase().includes(q) ||
        (b.fantasy_subgenre || "").toLowerCase().includes(q) ||
        (b.genres || []).some((g) => g.toLowerCase().includes(q)) ||
        (b.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }

  const cardsHtml = filtered
    .map((b) => {
      const col = STATUS_COLORS[b.status] || "#64748B";
      const curP = Number(b.current_page || 0);
      const totP = Math.max(Number(b.page_count || 1), 1);
      const pct = Math.min(100, Math.round((curP / totP) * 100));
      const cover = b.cover_url
        ? `<img src="${escapeHtml(b.cover_url)}" style="width:64px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
        : `<div style="width:64px;height:96px;background:#334155;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">📖</div>`;
      const rating = b.rating_global ? `<span style="color:#FBBF24;font-size:0.78rem;font-weight:700;">⭐ ${Number(b.rating_global).toFixed(2).replace(/\.?0+$/, "")}/5</span>` : "";
      const series = b.series_name
        ? `<div style="font-size:0.75rem;color:var(--primary-light);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(b.series_name)}${b.series_volume ? ` • T.${b.series_volume}` : ""}</div>`
        : "";
      const subgLine = (b.fantasy_subgenres && b.fantasy_subgenres.length > 0)
        ? `<div style="font-size:0.71rem;color:#E879F9;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">✨ ${escapeHtml(b.fantasy_subgenres.join(" • "))}</div>`
        : "";
      const footer = b.status === "En cours"
        ? `<div class="progress-track" style="height:5px;margin-top:7px;"><div class="progress-fill" style="width:${pct}%"></div></div>
           <div style="font-size:0.72rem;color:var(--muted);margin-top:3px;">${curP} / ${totP} p. (${pct}%)</div>`
        : `<div style="font-size:0.72rem;color:var(--muted);margin-top:4px;">${totP} p.${b.pal_month ? ` • 🎯 PAL ${formatMonthYearFrench(b.pal_month)}` : ""}</div>`;

      return `
        <div class="lib-card" onclick="window.openBookDetailModal(${b.id}, 'info')">
          ${cover}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
              <span class="status-badge" style="background:${col}22;color:${col};border:1px solid ${col}55;">${escapeHtml(b.status)}</span>
              ${rating}
            </div>
            <div style="font-weight:700;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(b.title)}</div>
            <div style="font-size:0.8rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(b.author)}</div>
            ${series}
            ${subgLine}
            ${footer}
          </div>
        </div>
      `;
    })
    .join("");

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <input type="search" placeholder="🔍 Titre, auteur, saga, sous-genre..." value="${escapeHtml(state.libSearch)}" oninput="window.setLibSearch(this.value)" />
      <button class="btn" style="padding:10px 12px;flex-shrink:0;" onclick="window.toggleLibAdv()">⚙️ Filtres</button>
    </div>
    ${state.libAdvOpen ? `
      <div class="card" style="padding:12px;margin-bottom:10px;">
        <label style="margin-top:0;">✨ Filtrer par Sous-genre Fantasy</label>
        <select onchange="window.setLibSubgenre(this.value)">
          <option value="Tous" ${state.libSubgenre === "Tous" ? "selected" : ""}>Tous les sous-genres</option>
          ${FANTASY_SUBGENRES.map((s) => `<option value="${escapeHtml(s)}" ${state.libSubgenre === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
        </select>
      </div>
    ` : ""}
    <div class="pills-row">
      ${pills
        .map(
          (p) =>
            `<button class="pill ${state.libFilter === p ? "active" : ""}" onclick="window.setLibFilter('${p}')">${p}</button>`
        )
        .join("")}
    </div>
    <div style="font-size:0.78rem;color:var(--muted);margin-bottom:10px;"><b>${filtered.length}</b> livre(s)</div>
    <div class="lib-grid">
      ${cardsHtml || `<div style="text-align:center;color:var(--muted);padding:30px;">Aucun livre ne correspond à vos filtres.</div>`}
    </div>
  `;
}

window.setLibFilter = function (f) {
  state.libFilter = f;
  renderLibraryView();
};

window.setLibSearch = function (q) {
  state.libSearch = q;
  renderLibraryView();
};

window.toggleLibAdv = function () {
  state.libAdvOpen = !state.libAdvOpen;
  renderLibraryView();
};

window.setLibSubgenre = function (s) {
  state.libSubgenre = s;
  renderLibraryView();
};

// ==========================================
// 3. VUE AJOUTER UN LIVRE (SCAN CODE-BARRES VIDÉO PAR DÉFAUT !)
// ==========================================
function renderAddView() {
  const el = document.getElementById("view-add");
  const d = state.addDraft;
  const isCam = state.addMode === "camera";
  const curY = new Date().getFullYear();
  const years = ["Aucune"];
  for (let y = curY - 1; y <= curY + 5; y++) years.push(String(y));

  const resultsHtml = state.searchResults
    .map(
      (r, idx) => `
      <div class="lib-card" onclick="window.applyEnrichedBook(${idx})">
        ${r.cover_url ? `<img src="${escapeHtml(r.cover_url)}" style="width:48px;height:72px;object-fit:cover;border-radius:6px;" />` : `<div style="width:48px;height:72px;background:#334155;border-radius:6px;display:flex;align-items:center;justify-content:center;">📖</div>`}
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:0.9rem;">${escapeHtml(r.title)}</div>
          <div style="font-size:0.78rem;color:var(--muted);">${escapeHtml(r.author)} • ${r.page_count} p.</div>
        </div>
        <span style="color:var(--primary-light);font-weight:700;font-size:0.8rem;">Choisir</span>
      </div>
    `
    )
    .join("");

  el.innerHTML = `
    <div class="mode-toggle" style="margin-bottom:12px;">
      <button class="mode-btn ${isCam ? "active-focus" : ""}" onclick="window.setAddMode('camera')">
        📷 Scanner le code-barres (Vidéo)
      </button>
      <button class="mode-btn ${!isCam ? "active-focus" : ""}" onclick="window.setAddMode('search')">
        🔍 Recherche ISBN / Titre
      </button>
    </div>

    ${isCam ? `
      <div class="card" style="text-align:center;">
        ${!state.cameraActive ? `
          <button class="btn btn-primary" style="width:100%;padding:14px;font-size:1rem;" onclick="window.startBarcodeCamera()">
            📸 Allumer la caméra pour scanner
          </button>
          <div style="font-size:0.82rem;color:var(--muted);margin-top:8px;">
            Pointez la caméra vers le code-barres ISBN au dos du livre : la fiche se remplit toute seule !
          </div>
        ` : `
          <button class="btn btn-danger" style="width:100%;margin-bottom:8px;" onclick="window.stopBarcodeCamera()">
            🛑 Éteindre la caméra
          </button>
          <div style="font-size:0.8rem;color:var(--primary-light);margin-bottom:6px;">
            📹 Visée en direct : placez le code-barres du livre face à l'objectif...
          </div>
        `}
        <div id="barcode-scanner-box" style="display:${state.cameraActive ? "block" : "none"};"></div>
        ${state.lastScannedCode ? `
          <div style="margin-top:10px;padding:8px 12px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);border-radius:8px;font-size:0.84rem;color:#6ee7b7;">
            ✅ Dernier ISBN scanné : <b>${escapeHtml(state.lastScannedCode)}</b> — <i>${escapeHtml(d.title)}</i>
          </div>
        ` : ""}
      </div>
    ` : `
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px;">🔍 Rechercher par ISBN ou Titre + Auteur</div>
        <div style="display:flex;gap:8px;">
          <input type="search" id="ext-search-q" placeholder="Ex: 9782080470973 ou Sanderson..." onkeydown="if(event.key==='Enter')window.runExternalSearch()" />
          <button class="btn btn-primary" onclick="window.runExternalSearch()">Chercher</button>
        </div>
        ${resultsHtml ? `<div style="display:grid;gap:8px;margin-top:12px;">${resultsHtml}</div>` : ""}
      </div>
    `}

    <div class="card">
      <div style="display:flex;gap:14px;align-items:center;margin-bottom:10px;">
        ${d.cover_url
          ? `<img src="${escapeHtml(d.cover_url)}" style="width:66px;height:98px;object-fit:cover;border-radius:8px;box-shadow:0 4px 10px rgba(0,0,0,0.4);" />`
          : `<div style="width:66px;height:98px;background:#334155;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">📝</div>`
        }
        <div>
          <div style="font-weight:800;font-size:1.05rem;">📝 Fiche complète du livre</div>
          <div style="font-size:0.8rem;color:var(--muted);">Vérifiez ou ajustez les informations avant d'enregistrer.</div>
        </div>
      </div>

      <div class="grid-2">
        <div>
          <label>Titre du livre *</label>
          <input id="add-title" value="${escapeHtml(d.title)}" oninput="window.syncAddDraft()" placeholder="Titre de l'ouvrage" />
        </div>
        <div>
          <label>Auteur *</label>
          <input id="add-author" value="${escapeHtml(d.author)}" oninput="window.syncAddDraft()" placeholder="Nom de l'auteur" />
        </div>
      </div>

      <div class="grid-2">
        <div>
          <label>Série / Saga</label>
          <input id="add-series" value="${escapeHtml(d.series_name)}" oninput="window.syncAddDraft()" placeholder="Nom de la saga" />
        </div>
        <div>
          <label>Numéro de tome</label>
          <input type="number" step="0.5" id="add-vol" value="${escapeHtml(d.series_volume)}" oninput="window.syncAddDraft()" placeholder="Ex: 1" />
        </div>
      </div>

      <div class="grid-3">
        <div>
          <label>Nombre de pages *</label>
          <input type="number" id="add-pages" value="${escapeHtml(d.page_count)}" oninput="window.syncAddDraft()" />
        </div>
        <div>
          <label>Chapitres</label>
          <input type="number" id="add-chaps" value="${escapeHtml(d.chapter_count)}" oninput="window.syncAddDraft()" placeholder="0" />
        </div>
        <div>
          <label>Prix (€)</label>
          <input type="number" step="0.1" id="add-price" value="${escapeHtml(d.price)}" oninput="window.syncAddDraft()" placeholder="Ex: 22.90" />
        </div>
      </div>

      <div class="grid-3">
        <div>
          <label>Format</label>
          <select id="add-format" onchange="window.syncAddDraft()">
            ${["Broché", "Poche", "Relié", "Numérique", "Audio"].map((f) => `<option value="${f}" ${d.format === f ? "selected" : ""}>${f}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Éditeur</label>
          <input id="add-publisher" value="${escapeHtml(d.publisher)}" oninput="window.syncAddDraft()" />
        </div>
        <div>
          <label>Pays de l'auteur</label>
          <input id="add-country" value="${escapeHtml(d.author_country)}" oninput="window.syncAddDraft()" />
        </div>
      </div>

      <div class="grid-3">
        <div>
          <label>ISBN-13</label>
          <input id="add-isbn" value="${escapeHtml(d.isbn)}" oninput="window.syncAddDraft()" />
        </div>
        <div>
          <label>Année</label>
          <input type="number" id="add-year" value="${escapeHtml(d.publication_year)}" oninput="window.syncAddDraft()" />
        </div>
        <div>
          <label>Note communauté (/5)</label>
          <input type="number" step="0.05" id="add-pop" value="${escapeHtml(d.popularity_score)}" oninput="window.syncAddDraft()" placeholder="Ex: 4.15" />
        </div>
      </div>

      <div class="grid-2">
        <div>
          <label>Genres (séparés par virgules)</label>
          <input id="add-genres" value="${escapeHtml(d.genres)}" oninput="window.syncAddDraft()" />
        </div>
        <div>
          <label>Tags & Tropes (séparés par virgules)</label>
          <input id="add-tags" value="${escapeHtml(d.tags)}" oninput="window.syncAddDraft()" placeholder="Ex: Magie, Dragons, Slow Burn" />
        </div>
      </div>

      <label>✨ Sous-genres (Fantasy & Imaginaire — cliquez pour sélectionner)</label>
      <div class="chips-wrap">
        ${FANTASY_SUBGENRES.map((sg) => {
          const sel = (d.fantasy_subgenres || []).includes(sg);
          return `<span class="chip-check ${sel ? "selected" : ""}" onclick="window.toggleDraftSubgenre('${escapeHtml(sg)}')">${escapeHtml(sg)}</span>`;
        }).join("")}
      </div>

      <label>URL Couverture (HD)</label>
      <input id="add-cover" value="${escapeHtml(d.cover_url)}" oninput="window.syncAddDraft()" placeholder="https://..." />

      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-weight:700;font-size:0.88rem;color:var(--primary-light);">
        🎯 Classification initiale & PAL
      </div>
      <div class="grid-3">
        <div>
          <label>Statut initial</label>
          <select id="add-status" onchange="window.syncAddDraft()">
            ${["Bibliothèque", "En cours", "Wishlist", "À acheter", "Terminé", "DNF"].map((s) => `<option value="${s}" ${d.status === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Mois de la PAL</label>
          <select id="add-pal-m" onchange="window.syncAddDraft()">
            ${["Aucun", ...FRENCH_MONTHS].map((m) => `<option value="${m}" ${d.pal_month_name === m ? "selected" : ""}>${m}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Année de la PAL</label>
          <select id="add-pal-y" onchange="window.syncAddDraft()">
            ${years.map((y) => `<option value="${y}" ${String(d.pal_year_val) === y ? "selected" : ""}>${y}</option>`).join("")}
          </select>
        </div>
      </div>

      <button class="btn btn-primary" style="width:100%;margin-top:16px;padding:14px;" onclick="window.submitNewBook()">
        💾 Enregistrer dans ma bibliothèque
      </button>
    </div>
  `;
}

window.setAddMode = async function (mode) {
  if (state.cameraActive && mode !== "camera") {
    await window.stopBarcodeCamera();
  }
  state.addMode = mode;
  renderAddView();
};

window.syncAddDraft = function () {
  const g = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : "";
  };
  state.addDraft.title = g("add-title");
  state.addDraft.author = g("add-author");
  state.addDraft.series_name = g("add-series");
  state.addDraft.series_volume = g("add-vol");
  state.addDraft.page_count = g("add-pages");
  state.addDraft.chapter_count = g("add-chaps");
  state.addDraft.price = g("add-price");
  state.addDraft.format = g("add-format");
  state.addDraft.publisher = g("add-publisher");
  state.addDraft.author_country = g("add-country");
  state.addDraft.isbn = g("add-isbn");
  state.addDraft.publication_year = g("add-year");
  state.addDraft.popularity_score = g("add-pop");
  state.addDraft.genres = g("add-genres");
  state.addDraft.tags = g("add-tags");
  state.addDraft.cover_url = g("add-cover");
  state.addDraft.status = g("add-status");
  state.addDraft.pal_month_name = g("add-pal-m");
  state.addDraft.pal_year_val = g("add-pal-y");
};

window.toggleDraftSubgenre = function (sg) {
  window.syncAddDraft();
  const arr = state.addDraft.fantasy_subgenres || [];
  const idx = arr.indexOf(sg);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(sg);
  state.addDraft.fantasy_subgenres = arr;
  renderAddView();
};

let isProcessingScan = false;

function populateDraftFromMeta(meta) {
  if (!meta) return;
  state.addDraft = {
    ...state.addDraft,
    isbn: meta.isbn || state.addDraft.isbn || "",
    title: meta.title || "",
    author: meta.author || "",
    author_country: meta.author_country || "France",
    series_name: meta.series_name || "",
    series_volume: meta.series_volume !== null && meta.series_volume !== undefined ? meta.series_volume : "",
    publisher: meta.publisher || "",
    publication_year: meta.publication_year || new Date().getFullYear(),
    page_count: meta.page_count || 320,
    price: meta.price !== null && meta.price !== undefined ? meta.price : "",
    format: meta.format || "Broché",
    genres: Array.isArray(meta.genres) ? meta.genres.join(", ") : (meta.genres || "Fantasy"),
    tags: Array.isArray(meta.tags) ? meta.tags.join(", ") : (meta.tags || ""),
    fantasy_subgenres: Array.isArray(meta.fantasy_subgenres) ? meta.fantasy_subgenres : [],
    popularity_score: meta.popularity_score !== null && meta.popularity_score !== undefined ? meta.popularity_score : "",
    cover_url: meta.cover_url || ""
  };
}

function forceSyncDraftToDom() {
  const d = state.addDraft;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val !== null && val !== undefined ? val : "";
  };
  setVal("add-title", d.title);
  setVal("add-author", d.author);
  setVal("add-series", d.series_name);
  setVal("add-vol", d.series_volume);
  setVal("add-pages", d.page_count);
  setVal("add-chaps", d.chapter_count);
  setVal("add-price", d.price);
  setVal("add-format", d.format);
  setVal("add-publisher", d.publisher);
  setVal("add-country", d.author_country);
  setVal("add-isbn", d.isbn);
  setVal("add-year", d.publication_year);
  setVal("add-pop", d.popularity_score);
  setVal("add-genres", d.genres);
  setVal("add-tags", d.tags);
  setVal("add-cover", d.cover_url);
}

window.handleDetectedIsbn = async function (clean) {
  if (isProcessingScan) return;
  isProcessingScan = true;
  if (navigator.vibrate) navigator.vibrate(100);
  state.lastScannedCode = clean;
  state.addDraft.isbn = clean;
  state.addDraft.title = "⏳ Récupération des infos (BnF / Goodreads)...";
  await window.stopBarcodeCamera();
  renderAddView();
  setSyncStatus(true, `ISBN ${clean}...`);
  try {
    const data = await apiCall("enrich_book", { q: clean });
    if (data && data.best) {
      populateDraftFromMeta(data.best);
      state.addDraft.isbn = clean;
    }
    setSyncStatus(false, "Synchronisé");
    renderAddView();
    forceSyncDraftToDom();
  } catch (e) {
    setSyncStatus(false, "Erreur");
    alert("Erreur lors de la récupération de l'ISBN " + clean + " : " + e.message);
  } finally {
    isProcessingScan = false;
  }
};

window.startBarcodeCamera = async function () {
  isProcessingScan = false;
  state.cameraActive = true;
  renderAddView();
  try {
    if (typeof Html5Qrcode === "undefined") {
      alert("Le module caméra est en cours de chargement, réessayez dans une seconde.");
      state.cameraActive = false;
      renderAddView();
      return;
    }
    html5QrScanner = new Html5Qrcode("barcode-scanner-box");
    await html5QrScanner.start(
      { facingMode: "environment" },
      {
        fps: 15,
        qrbox: { width: 270, height: 130 },
        aspectRatio: 1.5
      },
      async (decodedText) => {
        if (isProcessingScan) return;
        const clean = String(decodedText || "").replace(/[^0-9Xx]/g, "").toUpperCase();
        const isValidIsbn =
          (clean.length === 13 && (clean.startsWith("978") || clean.startsWith("979"))) ||
          clean.length === 10;
        if (isValidIsbn) {
          await window.handleDetectedIsbn(clean);
        }
      },
      () => {}
    );
  } catch (err) {
    state.cameraActive = false;
    renderAddView();
    alert("Impossible d'accéder à la caméra : vérifiez que vous avez autorisé l'accès caméra dans Safari/Chrome.");
  }
};

window.stopBarcodeCamera = async function () {
  state.cameraActive = false;
  if (html5QrScanner) {
    try {
      await html5QrScanner.stop();
      await html5QrScanner.clear();
    } catch (e) {}
    html5QrScanner = null;
  }
  if (state.activeTab === "add") renderAddView();
};

window.runExternalSearch = async function () {
  const qEl = document.getElementById("ext-search-q");
  const q = qEl ? qEl.value.trim() : "";
  if (!q) return;
  setSyncStatus(true, "Recherche...");
  try {
    const data = await apiCall("enrich_book", { q });
    state.searchResults = data.results || [];
    if (data.best) populateDraftFromMeta(data.best);
    setSyncStatus(false, "Synchronisé");
    renderAddView();
    forceSyncDraftToDom();
  } catch (e) {
    setSyncStatus(false, "Erreur");
  }
};

window.applyEnrichedBook = function (idx) {
  const r = state.searchResults[idx];
  if (!r) return;
  populateDraftFromMeta(r);
  renderAddView();
};

window.submitNewBook = async function () {
  window.syncAddDraft();
  const d = state.addDraft;
  if (!d.title.trim()) return alert("Le titre du livre est obligatoire.");

  let pal_year = d.pal_year_val && d.pal_year_val !== "Aucune" ? Number(d.pal_year_val) : null;
  let pal_month = null;
  if (d.pal_month_name && d.pal_month_name !== "Aucun") {
    const mIdx = FRENCH_MONTHS.indexOf(d.pal_month_name);
    if (mIdx >= 0) {
      const y = pal_year || new Date().getFullYear();
      pal_year = y;
      pal_month = `${y}-${String(mIdx + 1).padStart(2, "0")}`;
    }
  }

  const payload = {
    isbn: d.isbn.trim() || null,
    title: d.title.trim(),
    author: d.author.trim() || "Auteur inconnu",
    author_country: d.author_country.trim() || "France",
    series_name: d.series_name.trim() || null,
    series_volume: d.series_volume !== "" && Number(d.series_volume) > 0 ? Number(d.series_volume) : null,
    publisher: d.publisher.trim() || null,
    publication_year: d.publication_year ? Number(d.publication_year) : null,
    page_count: Math.max(1, Number(d.page_count || 300)),
    chapter_count: d.chapter_count && Number(d.chapter_count) > 0 ? Number(d.chapter_count) : null,
    price: d.price !== "" && Number(d.price) > 0 ? Number(d.price) : null,
    format: d.format || "Broché",
    genres: d.genres.split(",").map((s) => s.trim()).filter(Boolean),
    tags: d.tags.split(",").map((s) => s.trim()).filter(Boolean),
    fantasy_subgenres: d.fantasy_subgenres || [],
    popularity_score: d.popularity_score !== "" && Number(d.popularity_score) > 0 ? Number(d.popularity_score) : null,
    cover_url: d.cover_url.trim() || null,
    status: d.status || "Bibliothèque",
    pal_month,
    pal_year
  };

  setSyncStatus(true, "Ajout...");
  try {
    await apiCall("add_book", payload);
    state.searchResults = [];
    state.lastScannedCode = "";
    state.addDraft.title = "";
    state.addDraft.isbn = "";
    state.addDraft.cover_url = "";
    await window.syncFromServer();
    window.switchTab(payload.status === "En cours" ? "reading" : "library");
  } catch (e) {
    alert("Erreur : " + e.message);
  }
};

// ==========================================
// 4. VUE STATISTIQUES FULL DÉTAILS (4 SOUS-ONGLETS + 10 PLOTS PLOTLY SANS CHEVAUCHEMENT)
// ==========================================
function getFilteredBooksForStats() {
  const now = new Date();
  const curMonth = now.toISOString().slice(0, 7);
  const curYear = now.getFullYear();

  if (state.statsScope === "read") {
    const readBooks = state.books.filter((b) => b.status === "Terminé");
    if (state.statsTimeFilter === "month") {
      return readBooks.filter((b) => String(b.finished_at || "").startsWith(curMonth));
    }
    if (state.statsTimeFilter === "year") {
      return readBooks.filter((b) => String(b.finished_at || "").startsWith(String(curYear)));
    }
    return readBooks;
  }
  if (state.statsScope === "pal_month") {
    return state.books.filter((b) => b.pal_month === curMonth);
  }
  if (state.statsScope === "pal_year") {
    return state.books.filter((b) => Number(b.pal_year) === curYear || String(b.pal_month || "").startsWith(String(curYear)));
  }
  if (state.statsScope === "biblio") {
    return state.books.filter((b) => b.status === "Bibliothèque");
  }
  if (state.statsScope === "wishlist") {
    return state.books.filter((b) => b.status === "Wishlist" || b.status === "À acheter");
  }
  return state.books;
}

function renderStatsView() {
  const el = document.getElementById("view-stats");
  const now = new Date();
  const curMonthCode = now.toISOString().slice(0, 7);
  const curMonthFr = formatMonthYearFrench(curMonthCode);
  const curYear = now.getFullYear();

  const filteredBooks = getFilteredBooksForStats();

  el.innerHTML = `
    <div class="card" style="padding:12px;">
      <div class="grid-2">
        <div>
          <label style="margin-top:0;">🎯 Périmètre d'analyse</label>
          <select onchange="window.setStatsScope(this.value)">
            <option value="read" ${state.statsScope === "read" ? "selected" : ""}>📖 Livres lus (Historique)</option>
            <option value="pal_month" ${state.statsScope === "pal_month" ? "selected" : ""}>🎯 Ma PAL du mois (${curMonthFr})</option>
            <option value="pal_year" ${state.statsScope === "pal_year" ? "selected" : ""}>📅 Ma PAL de l'année (${curYear})</option>
            <option value="biblio" ${state.statsScope === "biblio" ? "selected" : ""}>📚 Ma Bibliothèque (Non lus)</option>
            <option value="wishlist" ${state.statsScope === "wishlist" ? "selected" : ""}>🛒 Wishlist / À acheter</option>
          </select>
        </div>
        <div>
          <label style="margin-top:0;">📅 Période</label>
          ${state.statsScope === "read" ? `
            <select onchange="window.setStatsTimeFilter(this.value)">
              <option value="all" ${state.statsTimeFilter === "all" ? "selected" : ""}>Tout l'historique</option>
              <option value="month" ${state.statsTimeFilter === "month" ? "selected" : ""}>Mois en cours (${curMonthFr})</option>
              <option value="year" ${state.statsTimeFilter === "year" ? "selected" : ""}>Année en cours (${curYear})</option>
            </select>
          ` : `<div style="padding:10px 4px;font-size:0.83rem;color:var(--muted);"><b>${filteredBooks.length}</b> livre(s) dans ce périmètre</div>`}
        </div>
      </div>
    </div>

    <div class="pills-row" style="margin-bottom:8px;">
      <button class="pill ${state.statsSubTab === "calendar" ? "active" : ""}" onclick="window.setStatsSubTab('calendar')">🗓️ Calendrier</button>
      <button class="pill ${state.statsSubTab === "rhythm" ? "active" : ""}" onclick="window.setStatsSubTab('rhythm')">⚡ Rythme & PAL</button>
      <button class="pill ${state.statsSubTab === "catalog" ? "active" : ""}" onclick="window.setStatsSubTab('catalog')">📚 Catalogue & Genres</button>
      <button class="pill ${state.statsSubTab === "ratings" ? "active" : ""}" onclick="window.setStatsSubTab('ratings')">⭐ Notes & Radar</button>
    </div>

    <div id="stats-subview-container"></div>
  `;

  if (state.statsSubTab === "calendar") renderStatsCalendarTab();
  else if (state.statsSubTab === "rhythm") renderStatsRhythmTab();
  else if (state.statsSubTab === "catalog") renderStatsCatalogTab(filteredBooks);
  else if (state.statsSubTab === "ratings") renderStatsRatingsTab(filteredBooks);
}

window.setStatsScope = function (s) {
  state.statsScope = s;
  renderStatsView();
};

window.setStatsTimeFilter = function (tf) {
  state.statsTimeFilter = tf;
  renderStatsView();
};

window.setStatsSubTab = function (st) {
  state.statsSubTab = st;
  renderStatsView();
};

// ------------------------------------------
// 4.1 SOUS-ONGLET CALENDRIER (SEMAINIER / MENSUEL / ANNUEL)
// ------------------------------------------
function toDateKey(dtInput) {
  const d = new Date(dtInput);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function renderStatsCalendarTab() {
  const box = document.getElementById("stats-subview-container");
  const mode = state.calMode;

  let bodyHtml = "";
  const todayKey = toDateKey(new Date());

  if (mode === "week") {
    const ref = new Date();
    ref.setDate(ref.getDate() + state.weekOffset * 7);
    const dayOfWeek = (ref.getDay() + 6) % 7; // 0 = Monday
    const monday = new Date(ref);
    monday.setDate(ref.getDate() - dayOfWeek);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const dayNames = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];
    let totPages = 0;
    let totMin = 0;
    const colsHtml = [];

    for (let i = 0; i < 7; i++) {
      const curD = new Date(monday);
      curD.setDate(monday.getDate() + i);
      const dKey = toDateKey(curD);
      const dStr = `${String(curD.getDate()).padStart(2, "0")}/${String(curD.getMonth() + 1).padStart(2, "0")}`;
      const daySessions = state.sessions.filter((s) => toDateKey(s.start_time) === dKey);
      const dPages = daySessions.reduce((a, s) => a + Number(s.pages_read || 0), 0);
      const dMin = daySessions.reduce((a, s) => a + Number(s.duration_minutes || 0), 0);
      totPages += dPages;
      totMin += dMin;

      const booksMap = {};
      daySessions.forEach((s) => {
        if (!booksMap[s.book_id]) {
          booksMap[s.book_id] = { title: s.book_title, cover: s.book_cover, pages: 0 };
        }
        booksMap[s.book_id].pages += Number(s.pages_read || 0);
      });
      const booksList = Object.values(booksMap);
      const isToday = dKey === todayKey;
      const isActive = dMin > 0 || dPages > 0;
      const borderCol = isToday ? "#6366F1" : (isActive ? "#38BDF8" : "#334155");
      const bgCol = isActive ? "rgba(30,41,59,0.9)" : "rgba(15,23,42,0.4)";

      const coversHtml = booksList.length > 0
        ? booksList.map((b) => b.cover
            ? `<img src="${escapeHtml(b.cover)}" title="${escapeHtml(b.title)} (+${b.pages}p)" style="width:42px;height:62px;object-fit:cover;border-radius:4px;margin:2px auto;display:block;box-shadow:0 2px 5px rgba(0,0,0,0.5);" />`
            : `<div style="font-size:0.68rem;background:#334155;padding:2px 4px;border-radius:4px;margin:2px 0;">📖 ${escapeHtml((b.title || "").slice(0, 8))}</div>`
          ).join("")
        : `<div style="color:#475569;font-size:0.75rem;">—</div>`;

      colsHtml.push(`
        <div style="background:${bgCol};border:1.5px solid ${borderCol};border-radius:10px;padding:8px 5px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;min-height:175px;">
          <div>
            <div style="font-weight:700;font-size:0.84rem;">${dayNames[i]} ${isToday ? '<span style="background:#6366F1;color:white;padding:1px 4px;border-radius:5px;font-size:0.62rem;">Auj.</span>' : ""}</div>
            <div style="font-size:0.74rem;color:var(--muted);margin-bottom:5px;">${dStr}</div>
            <div style="min-height:66px;display:flex;flex-direction:column;justify-content:center;align-items:center;">${coversHtml}</div>
          </div>
          <div style="margin-top:5px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.08);">
            <div style="font-weight:700;font-size:0.82rem;color:${isActive ? "#34D399" : "#64748B"};">${isActive ? `+${dPages} p.` : "0 p."}</div>
            <div style="font-size:0.72rem;color:var(--muted);">${isActive ? `${Math.round(dMin)} min` : "—"}</div>
          </div>
        </div>
      `);
    }

    bodyHtml = `
      <div class="grid-3" style="margin-bottom:10px;">
        <button class="btn" onclick="window.shiftCalOffset('week', -1)">◀️ Sem. préc.</button>
        <button class="btn" onclick="window.shiftCalOffset('week', 0)">Cette semaine</button>
        <button class="btn" onclick="window.shiftCalOffset('week', 1)">Sem. suiv. ▶️</button>
      </div>
      <div style="text-align:center;color:var(--primary-light);font-weight:700;margin-bottom:3px;">
        Semaine du ${monday.toLocaleDateString("fr-FR")} au ${sunday.toLocaleDateString("fr-FR")}
      </div>
      <div style="text-align:center;font-size:0.83rem;color:var(--muted);margin-bottom:12px;">
        Total semaine : <b style="color:#34D399;">+${totPages} pages</b> • <b style="color:#38BDF8;">${Math.round(totMin)} min</b>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7, minmax(88px, 1fr));gap:7px;overflow-x:auto;padding-bottom:8px;">
        ${colsHtml.join("")}
      </div>
    `;
  } else if (mode === "month") {
    const now = new Date();
    const totalM = now.getFullYear() * 12 + now.getMonth() + state.monthOffset;
    const tYear = Math.floor(totalM / 12);
    const tMonth = ((totalM % 12) + 12) % 12; // 0..11
    const numDays = new Date(tYear, tMonth + 1, 0).getDate();
    const firstWeekday = (new Date(tYear, tMonth, 1).getDay() + 6) % 7; // 0=Mon

    let totPages = 0;
    let totMin = 0;
    let activeDays = 0;
    const distinctBooks = new Set();
    const cells = [];

    for (let i = 0; i < firstWeekday; i++) {
      cells.push(`<div style="background:rgba(15,23,42,0.2);border:1px dashed rgba(51,65,85,0.3);border-radius:8px;min-height:76px;"></div>`);
    }

    for (let d = 1; d <= numDays; d++) {
      const dKey = `${tYear}-${String(tMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const daySessions = state.sessions.filter((s) => toDateKey(s.start_time) === dKey);
      const dPages = daySessions.reduce((a, s) => a + Number(s.pages_read || 0), 0);
      const dMin = daySessions.reduce((a, s) => a + Number(s.duration_minutes || 0), 0);
      const isActive = dPages > 0 || dMin > 0;
      if (isActive) activeDays++;
      totPages += dPages;
      totMin += dMin;

      const coversMap = {};
      daySessions.forEach((s) => {
        distinctBooks.add(s.book_id);
        if (s.book_cover) coversMap[s.book_id] = s.book_cover;
      });
      const coversHtml = Object.values(coversMap)
        .slice(0, 2)
        .map((c) => `<img src="${escapeHtml(c)}" style="width:24px;height:35px;object-fit:cover;border-radius:3px;margin:1px;" />`)
        .join("");

      const isToday = dKey === todayKey;
      const borderCol = isToday ? "#6366F1" : (isActive ? "#38BDF8" : "rgba(51,65,85,0.5)");
      const bgCol = isActive ? "rgba(30,41,59,0.95)" : "rgba(15,23,42,0.4)";

      cells.push(`
        <div style="background:${bgCol};border:1px solid ${borderCol};border-radius:8px;padding:4px;min-height:76px;display:flex;flex-direction:column;justify-content:space-between;text-align:center;">
          <div style="font-weight:700;font-size:0.76rem;text-align:left;">${d}${isToday ? ' <span style="color:#6366F1;">●</span>' : ""}</div>
          <div style="display:flex;justify-content:center;align-items:center;min-height:35px;">${coversHtml}</div>
          <div style="font-size:0.64rem;font-weight:700;color:#34D399;">${isActive ? `+${dPages}p` : ""}</div>
        </div>
      `);
    }

    bodyHtml = `
      <div class="grid-3" style="margin-bottom:10px;">
        <button class="btn" onclick="window.shiftCalOffset('month', -1)">◀️ Mois préc.</button>
        <button class="btn" onclick="window.shiftCalOffset('month', 0)">Mois en cours</button>
        <button class="btn" onclick="window.shiftCalOffset('month', 1)">Mois suiv. ▶️</button>
      </div>
      <div style="text-align:center;color:var(--primary-light);font-weight:700;font-size:1.05rem;margin-bottom:3px;">
        ${FRENCH_MONTHS[tMonth]} ${tYear}
      </div>
      <div style="text-align:center;font-size:0.82rem;color:var(--muted);margin-bottom:12px;">
        <b style="color:#34D399;">+${totPages} pages</b> • <b style="color:#38BDF8;">${Math.round(totMin)} min</b> •
        <b>${activeDays}/${numDays} j. actifs</b> • <b style="color:#A78BFA;">${distinctBooks.size} livre(s)</b>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center;font-weight:700;font-size:0.78rem;color:var(--primary-light);margin-bottom:5px;">
        <div>Lun</div><div>Mar</div><div>Mer</div><div>Jeu</div><div>Ven</div><div>Sam</div><div>Dim</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">
        ${cells.join("")}
      </div>
    `;
  } else {
    const tYear = new Date().getFullYear() + state.yearOffset;
    let yearPages = 0;
    let yearMin = 0;
    const yearDays = new Set();
    const yearBooks = new Set();
    const monthCards = [];

    for (let m = 0; m < 12; m++) {
      const prefix = `${tYear}-${String(m + 1).padStart(2, "0")}`;
      const mSessions = state.sessions.filter((s) => toDateKey(s.start_time).startsWith(prefix));
      const mPages = mSessions.reduce((a, s) => a + Number(s.pages_read || 0), 0);
      const mMin = mSessions.reduce((a, s) => a + Number(s.duration_minutes || 0), 0);
      yearPages += mPages;
      yearMin += mMin;

      const mDays = new Set();
      const coversMap = {};
      mSessions.forEach((s) => {
        const dk = toDateKey(s.start_time);
        mDays.add(dk);
        yearDays.add(dk);
        yearBooks.add(s.book_id);
        if (s.book_cover) coversMap[s.book_id] = s.book_cover;
      });

      const isActive = mPages > 0 || mMin > 0;
      const coversHtml = Object.values(coversMap)
        .slice(0, 4)
        .map((c) => `<img src="${escapeHtml(c)}" style="width:30px;height:44px;object-fit:cover;border-radius:4px;margin-right:4px;" />`)
        .join("");

      monthCards.push(`
        <div style="background:${isActive ? "rgba(30,41,59,0.9)" : "rgba(15,23,42,0.4)"};border:1.5px solid ${isActive ? "#38BDF8" : "#334155"};border-radius:10px;padding:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-weight:700;font-size:0.92rem;">${FRENCH_MONTHS[m]}</span>
            <span style="font-size:0.73rem;color:var(--muted);">${mDays.size} j. actifs</span>
          </div>
          <div style="display:flex;align-items:center;min-height:46px;">
            ${coversHtml || `<span style="font-size:0.75rem;color:#475569;">Aucune lecture</span>`}
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.08);font-size:0.78rem;">
            <b style="color:${isActive ? "#34D399" : "#64748B"};">+${mPages} p.</b>
            <span style="color:var(--muted);">${isActive ? `${Math.round(mMin)} min` : "—"}</span>
          </div>
        </div>
      `);
    }

    bodyHtml = `
      <div class="grid-3" style="margin-bottom:10px;">
        <button class="btn" onclick="window.shiftCalOffset('year', -1)">◀️ ${tYear - 1}</button>
        <button class="btn" onclick="window.shiftCalOffset('year', 0)">Année actuelle</button>
        <button class="btn" onclick="window.shiftCalOffset('year', 1)">${tYear + 1} ▶️</button>
      </div>
      <div style="text-align:center;color:var(--primary-light);font-weight:700;font-size:1.1rem;margin-bottom:3px;">
        Bilan Annuel ${tYear}
      </div>
      <div style="text-align:center;font-size:0.82rem;color:var(--muted);margin-bottom:12px;">
        <b style="color:#34D399;">+${yearPages} pages</b> • <b style="color:#38BDF8;">${Math.round(yearMin)} min</b> •
        <b>${yearDays.size} jours de lecture</b> • <b style="color:#A78BFA;">${yearBooks.size} livre(s)</b>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
        ${monthCards.join("")}
      </div>
    `;
  }

  box.innerHTML = `
    <div class="card">
      <div class="grid-3" style="margin-bottom:12px;">
        <button class="btn ${mode === "week" ? "btn-primary" : ""}" onclick="window.setCalMode('week')">📅 Semainier</button>
        <button class="btn ${mode === "month" ? "btn-primary" : ""}" onclick="window.setCalMode('month')">🗓️ Mensuel</button>
        <button class="btn ${mode === "year" ? "btn-primary" : ""}" onclick="window.setCalMode('year')">📊 Annuel</button>
      </div>
      ${bodyHtml}
    </div>
  `;
}

window.setCalMode = function (m) {
  state.calMode = m;
  renderStatsCalendarTab();
};

window.shiftCalOffset = function (type, delta) {
  if (type === "week") state.weekOffset = delta === 0 ? 0 : state.weekOffset + delta;
  if (type === "month") state.monthOffset = delta === 0 ? 0 : state.monthOffset + delta;
  if (type === "year") state.yearOffset = delta === 0 ? 0 : state.yearOffset + delta;
  renderStatsCalendarTab();
};

// ------------------------------------------
// 4.2 SOUS-ONGLET RYTHME & PAL (FOCUS vs DÉTENTE + PLOTS + PROJECTION PAL)
// ------------------------------------------
function getBasePlotlyLayout(extra = {}) {
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: "#F8FAFC", family: "-apple-system, BlinkMacSystemFont, sans-serif", size: 11 },
    margin: { l: 42, r: 22, t: 16, b: 64 },
    xaxis: { gridcolor: "#334155", zerolinecolor: "#334155", automargin: true },
    yaxis: { gridcolor: "#334155", zerolinecolor: "#334155", automargin: true },
    legend: {
      orientation: "h",
      yanchor: "top",
      y: -0.22,
      xanchor: "center",
      x: 0.5,
      font: { size: 11 }
    },
    ...extra
  };
}

function renderStatsRhythmTab() {
  const box = document.getElementById("stats-subview-container");
  const { globalFocusSpeed, globalChillSpeed, focusCount, chillCount, refFocusSpeed } = computeSpeeds();

  const now = Date.now();
  const s7 = state.sessions.filter((s) => now - new Date(s.start_time).getTime() <= 7 * 86400 * 1000);
  const s30 = state.sessions.filter((s) => now - new Date(s.start_time).getTime() <= 30 * 86400 * 1000);

  const wPages = s7.reduce((a, s) => a + Number(s.pages_read || 0), 0);
  const wMin = s7.reduce((a, s) => a + Number(s.duration_minutes || 0), 0);
  const mPages = s30.reduce((a, s) => a + Number(s.pages_read || 0), 0);
  const mMin = s30.reduce((a, s) => a + Number(s.duration_minutes || 0), 0);

  const curDate = new Date();
  const curMonthCode = curDate.toISOString().slice(0, 7);
  const curMonthFr = formatMonthYearFrench(curMonthCode);
  const palBooks = state.books.filter((b) => b.pal_month === curMonthCode && b.status !== "Terminé");
  const pagesRemainingPal = palBooks.reduce((a, b) => a + Math.max(0, Number(b.page_count || 0) - Number(b.current_page || 0)), 0);
  const hoursNeeded = refFocusSpeed > 0 ? pagesRemainingPal / refFocusSpeed : 0;
  const lastDayOfMonth = new Date(curDate.getFullYear(), curDate.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, lastDayOfMonth - curDate.getDate());
  const dailyPagesNeeded = pagesRemainingPal / daysLeft;

  box.innerHTML = `
    <div class="kpi-grid kpi-grid-4">
      <div class="kpi-card" style="border-color:rgba(99,102,241,0.5);">
        <div class="kpi-label">🎯 Vitesse Focus</div>
        <div class="kpi-value" style="color:#818CF8;">${globalFocusSpeed > 0 ? globalFocusSpeed.toFixed(1) + " p/h" : "—"}</div>
        <div class="kpi-sub">${focusCount} session(s) focus</div>
      </div>
      <div class="kpi-card" style="border-color:rgba(245,158,11,0.5);">
        <div class="kpi-label">🛋️ Vitesse Détente</div>
        <div class="kpi-value" style="color:#F59E0B;">${globalChillSpeed > 0 ? globalChillSpeed.toFixed(1) + " p/h" : "—"}</div>
        <div class="kpi-sub">${chillCount} session(s) détente</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">📄 Pages lues (7j)</div>
        <div class="kpi-value" style="color:#34D399;">${wPages} p.</div>
        <div class="kpi-sub">${(wMin / 60).toFixed(1)} h cette semaine</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">⏱️ Temps lu (30j)</div>
        <div class="kpi-value" style="color:#38BDF8;">${(mMin / 60).toFixed(1)} h</div>
        <div class="kpi-sub">${mPages} pages (30j)</div>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Activité Journalière (Pages & Minutes)</div>
      <div class="chart-sub">14 derniers jours actifs — Survolez ou touchez une barre pour voir les livres lus</div>
      <div id="plot-daily-activity" class="chart-box"></div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Comparatif Semaine (Lun-Ven) vs Week-end (Sam-Dim)</div>
      <div class="chart-sub">Durée moyenne (min) et Vitesse moyenne (p/h) par séance</div>
      <div id="plot-weekday-weekend" class="chart-box"></div>
    </div>

    <div class="card" style="border-color:#6366F1;">
      <div style="font-size:1.05rem;font-weight:700;color:#818CF8;">
        🎯 Projection de fin de PAL (${curMonthFr}) : ${palBooks.length} livre(s) restant(s)
      </div>
      ${palBooks.length > 0 ? `
        <div style="margin-top:8px;font-size:0.9rem;line-height:1.6;">
          📄 <b>${pagesRemainingPal} pages</b> à lire pour terminer votre sélection mensuelle.<br/>
          ⏱️ Temps estimé nécessaire : <b style="color:#38BDF8;">~${hoursNeeded.toFixed(1)} heures</b> (sur base de votre vitesse Focus de ${refFocusSpeed.toFixed(1)} p/h).<br/>
          📅 Objectif quotidien restant : <b style="color:#34D399;">${dailyPagesNeeded.toFixed(1)} pages / jour</b> pendant les ${daysLeft} jours restants ce mois-ci.
        </div>
      ` : `<div style="margin-top:6px;font-size:0.86rem;color:var(--muted);">Aucun livre non terminé dans la PAL de ce mois.</div>`}
    </div>
  `;

  if (typeof Plotly === "undefined") {
    setTimeout(renderStatsRhythmTab, 250);
    return;
  }

  // Plot 1: Daily Reading Activity
  const byDate = {};
  state.sessions.forEach((s) => {
    const dk = toDateKey(s.start_time);
    if (!dk) return;
    if (!byDate[dk]) byDate[dk] = { pages: 0, min: 0, books: new Set() };
    byDate[dk].pages += Number(s.pages_read || 0);
    byDate[dk].min += Number(s.duration_minutes || 0);
    if (s.book_title) byDate[dk].books.add(s.book_title);
  });
  const sortedDates = Object.keys(byDate).sort().slice(-14);
  const xLabels = sortedDates.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`);
  const yPages = sortedDates.map((d) => byDate[d].pages);
  const yMin = sortedDates.map((d) => Math.round(byDate[d].min * 10) / 10);
  const hoverBooks = sortedDates.map((d) => Array.from(byDate[d].books).map((b) => `<br>• ${b}`).join(""));

  Plotly.newPlot(
    "plot-daily-activity",
    [
      {
        x: xLabels,
        y: yPages,
        name: "Pages lues",
        type: "bar",
        marker: { color: "#6366F1" },
        customdata: hoverBooks,
        hovertemplate: "<b>%{x}</b><br>Pages : <b>%{y} p.</b><br><b>Livres :</b>%{customdata}<extra></extra>"
      },
      {
        x: xLabels,
        y: yMin,
        name: "Minutes lues",
        type: "scatter",
        mode: "lines+markers",
        yaxis: "y2",
        marker: { size: 7, color: "#38BDF8" },
        line: { width: 3, color: "#38BDF8" },
        hovertemplate: "<b>%{x}</b><br>Temps : <b>%{y} min</b><extra></extra>"
      }
    ],
    getBasePlotlyLayout({
      yaxis: { title: "Pages", gridcolor: "#334155" },
      yaxis2: { title: "Min", overlaying: "y", side: "right", showgrid: false },
      margin: { l: 42, r: 42, t: 16, b: 68 }
    }),
    { displayModeBar: false, responsive: true }
  );

  // Plot 2: Weekday vs Weekend
  const wkSessions = state.sessions.filter((s) => !s.is_weekend);
  const weSessions = state.sessions.filter((s) => s.is_weekend);
  const avg = (arr, field) => (arr.length > 0 ? Math.round((arr.reduce((a, s) => a + Number(s[field] || 0), 0) / arr.length) * 10) / 10 : 0);

  const cats = ["Semaine (Lun-Ven)", "Week-end (Sam-Dim)"];
  const durMeans = [avg(wkSessions, "duration_minutes"), avg(weSessions, "duration_minutes")];
  const spdMeans = [avg(wkSessions, "pages_per_hour"), avg(weSessions, "pages_per_hour")];

  Plotly.newPlot(
    "plot-weekday-weekend",
    [
      {
        x: cats,
        y: durMeans,
        name: "Durée moy. (min)",
        type: "bar",
        marker: { color: "#818CF8" },
        text: durMeans.map((v) => `${v} min`),
        textposition: "auto"
      },
      {
        x: cats,
        y: spdMeans,
        name: "Vitesse moy. (p/h)",
        type: "bar",
        marker: { color: "#34D399" },
        text: spdMeans.map((v) => `${v} p/h`),
        textposition: "auto"
      }
    ],
    getBasePlotlyLayout({ barmode: "group" }),
    { displayModeBar: false, responsive: true }
  );
}

// ------------------------------------------
// 4.3 SOUS-ONGLET CATALOGUE & GENRES (6 PLOTS PLOTLY)
// ------------------------------------------
function renderStatsCatalogTab(books) {
  const box = document.getElementById("stats-subview-container");
  const prices = books.map((b) => Number(b.price || 0)).filter((p) => p > 0);
  const totalVal = prices.reduce((a, b) => a + b, 0);
  const avgPrice = prices.length > 0 ? totalVal / prices.length : 0;
  const totalPages = books.reduce((a, b) => a + Number(b.page_count || 0), 0);

  box.innerHTML = `
    <div class="kpi-grid kpi-grid-3">
      <div class="kpi-card">
        <div class="kpi-label">💶 Valeur financière</div>
        <div class="kpi-value" style="color:#34D399;">${totalVal.toFixed(2)} €</div>
        <div class="kpi-sub">${prices.length} livre(s) avec prix</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">🏷️ Prix moyen</div>
        <div class="kpi-value" style="color:#38BDF8;">${avgPrice.toFixed(2)} €</div>
        <div class="kpi-sub">par ouvrage</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">📄 Pagination totale</div>
        <div class="kpi-value" style="color:#818CF8;">${totalPages.toLocaleString("fr-FR")} p.</div>
        <div class="kpi-sub">${books.length} livre(s) dans le périmètre</div>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Top 10 des Genres</div>
      <div class="chart-sub">Survolez une barre pour voir les ouvrages associés</div>
      <div id="plot-genres" class="chart-box"></div>
    </div>

    <div class="chart-card">
      <div class="chart-title">✨ Répartition des Sous-genres de Fantasy</div>
      <div class="chart-sub">Sous-genres de l'Imaginaire représentés dans ce périmètre</div>
      <div id="plot-subgenres" class="chart-box"></div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Top 15 des Tags & Tropes</div>
      <div class="chart-sub">Treemap proportionnelle aux occurrences dans vos livres</div>
      <div id="plot-tags" class="chart-box"></div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Nationalité des Auteurs</div>
      <div class="chart-sub">Répartition géographique des auteurs</div>
      <div id="plot-countries" class="chart-box"></div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Répartition par Format d'Édition</div>
      <div class="chart-sub">Broché, Poche, Relié, Numérique, Audio</div>
      <div id="plot-formats" class="chart-box"></div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Morphologie des Livres (Pagination)</div>
      <div class="chart-sub">Distribution par tranche de nombre de pages</div>
      <div id="plot-book-sizes" class="chart-box"></div>
    </div>
  `;

  if (typeof Plotly === "undefined") {
    setTimeout(() => renderStatsCatalogTab(books), 250);
    return;
  }

  const buildPreview = (titles) => {
    const sample = titles.slice(0, 4).map((t) => `<br>• ${t}`).join("");
    return titles.length > 4 ? `${sample}<br><i>... et ${titles.length - 4} autre(s)</i>` : sample;
  };

  // 1. Genres
  const genreMap = {};
  books.forEach((b) => {
    (b.genres || []).forEach((g) => {
      const k = g.trim();
      if (!k) return;
      if (!genreMap[k]) genreMap[k] = [];
      if (!genreMap[k].includes(b.title)) genreMap[k].push(b.title);
    });
  });
  const sortedGenres = Object.entries(genreMap).sort((a, b) => a[1].length - b[1].length).slice(-10);
  Plotly.newPlot(
    "plot-genres",
    [
      {
        type: "bar",
        orientation: "h",
        y: sortedGenres.map((x) => x[0]),
        x: sortedGenres.map((x) => x[1].length),
        text: sortedGenres.map((x) => x[1].length),
        textposition: "auto",
        customdata: sortedGenres.map((x) => buildPreview(x[1])),
        marker: { color: "#6366F1" },
        hovertemplate: "<b>%{y}</b> : %{x} livre(s)<br>%{customdata}<extra></extra>"
      }
    ],
    getBasePlotlyLayout({ showlegend: false, margin: { l: 110, r: 20, t: 12, b: 36 } }),
    { displayModeBar: false, responsive: true }
  );

  // 2. Fantasy Subgenres
  const subgMap = {};
  books.forEach((b) => {
    (b.fantasy_subgenres || []).forEach((s) => {
      const k = s.trim();
      if (!k || k === "Aucun") return;
      if (!subgMap[k]) subgMap[k] = [];
      if (!subgMap[k].includes(b.title)) subgMap[k].push(b.title);
    });
  });
  const sortedSubg = Object.entries(subgMap).sort((a, b) => a[1].length - b[1].length);
  Plotly.newPlot(
    "plot-subgenres",
    [
      {
        type: "bar",
        orientation: "h",
        y: sortedSubg.length ? sortedSubg.map((x) => x[0]) : ["Aucun sous-genre"],
        x: sortedSubg.length ? sortedSubg.map((x) => x[1].length) : [0],
        text: sortedSubg.map((x) => x[1].length),
        textposition: "auto",
        customdata: sortedSubg.map((x) => buildPreview(x[1])),
        marker: { color: "#D946EF" },
        hovertemplate: "<b>%{y}</b> : %{x} livre(s)<br>%{customdata}<extra></extra>"
      }
    ],
    getBasePlotlyLayout({ showlegend: false, margin: { l: 130, r: 20, t: 12, b: 36 } }),
    { displayModeBar: false, responsive: true }
  );

  // 3. Tags Treemap
  const tagMap = {};
  books.forEach((b) => {
    (b.tags || []).forEach((t) => {
      const k = t.trim();
      if (!k) return;
      if (!tagMap[k]) tagMap[k] = [];
      if (!tagMap[k].includes(b.title)) tagMap[k].push(b.title);
    });
  });
  const sortedTags = Object.entries(tagMap).sort((a, b) => b[1].length - a[1].length).slice(0, 15);
  if (sortedTags.length > 0) {
    Plotly.newPlot(
      "plot-tags",
      [
        {
          type: "treemap",
          labels: sortedTags.map((x) => x[0]),
          parents: sortedTags.map(() => ""),
          values: sortedTags.map((x) => x[1].length),
          customdata: sortedTags.map((x) => buildPreview(x[1])),
          textinfo: "label+value",
          hovertemplate: "<b>%{label}</b> : %{value} livre(s)<br>%{customdata}<extra></extra>"
        }
      ],
      getBasePlotlyLayout({ margin: { l: 10, r: 10, t: 10, b: 10 } }),
      { displayModeBar: false, responsive: true }
    );
  } else {
    document.getElementById("plot-tags").innerHTML = `<div style="text-align:center;color:var(--muted);padding:40px;">Aucun tag/trope renseigné sur ce périmètre.</div>`;
  }

  // 4. Author Countries Donut
  const countryMap = {};
  books.forEach((b) => {
    const c = b.author_country || "Inconnu";
    if (!countryMap[c]) countryMap[c] = [];
    countryMap[c].push(`${b.title} (${b.author})`);
  });
  const sortedCountries = Object.entries(countryMap).sort((a, b) => b[1].length - a[1].length);
  Plotly.newPlot(
    "plot-countries",
    [
      {
        type: "pie",
        hole: 0.45,
        labels: sortedCountries.map((x) => x[0]),
        values: sortedCountries.map((x) => x[1].length),
        customdata: sortedCountries.map((x) => buildPreview(x[1])),
        textinfo: "percent",
        hovertemplate: "<b>%{label}</b> : %{value} livre(s) (%{percent})<br>%{customdata}<extra></extra>"
      }
    ],
    getBasePlotlyLayout({
      margin: { l: 20, r: 20, t: 15, b: 75 },
      legend: { orientation: "h", yanchor: "top", y: -0.15, xanchor: "center", x: 0.5 }
    }),
    { displayModeBar: false, responsive: true }
  );

  // 5. Formats Pie
  const fmtMap = {};
  books.forEach((b) => {
    const f = b.format || "Broché";
    if (!fmtMap[f]) fmtMap[f] = [];
    fmtMap[f].push(b.title);
  });
  const sortedFmts = Object.entries(fmtMap).sort((a, b) => b[1].length - a[1].length);
  Plotly.newPlot(
    "plot-formats",
    [
      {
        type: "pie",
        hole: 0.35,
        labels: sortedFmts.map((x) => x[0]),
        values: sortedFmts.map((x) => x[1].length),
        customdata: sortedFmts.map((x) => buildPreview(x[1])),
        textinfo: "percent",
        hovertemplate: "<b>%{label}</b> : %{value} livre(s) (%{percent})<br>%{customdata}<extra></extra>"
      }
    ],
    getBasePlotlyLayout({
      margin: { l: 20, r: 20, t: 15, b: 75 },
      legend: { orientation: "h", yanchor: "top", y: -0.15, xanchor: "center", x: 0.5 }
    }),
    { displayModeBar: false, responsive: true }
  );

  // 6. Book Sizes
  const sizeCats = ["< 300 p.", "300 - 500 p.", "500 - 800 p.", "> 800 p."];
  const sizeMap = { "< 300 p.": [], "300 - 500 p.": [], "500 - 800 p.": [], "> 800 p.": [] };
  books.forEach((b) => {
    const p = Number(b.page_count || 0);
    const label = `${b.title} (${p} p.)`;
    if (p < 300) sizeMap["< 300 p."].push(label);
    else if (p <= 500) sizeMap["300 - 500 p."].push(label);
    else if (p <= 800) sizeMap["500 - 800 p."].push(label);
    else sizeMap["> 800 p."].push(label);
  });

  Plotly.newPlot(
    "plot-book-sizes",
    [
      {
        type: "bar",
        x: sizeCats,
        y: sizeCats.map((c) => sizeMap[c].length),
        text: sizeCats.map((c) => sizeMap[c].length),
        textposition: "auto",
        marker: { color: ["#38BDF8", "#818CF8", "#A855F7", "#EC4899"] },
        customdata: sizeCats.map((c) => buildPreview(sizeMap[c])),
        hovertemplate: "<b>%{x}</b> : %{y} livre(s)<br>%{customdata}<extra></extra>"
      }
    ],
    getBasePlotlyLayout({ showlegend: false, margin: { l: 38, r: 20, t: 15, b: 40 } }),
    { displayModeBar: false, responsive: true }
  );
}

// ------------------------------------------
// 4.4 SOUS-ONGLET NOTES & RADAR (RADAR 5 CRITÈRES + CORRÉLATION)
// ------------------------------------------
function renderStatsRatingsTab(books) {
  const box = document.getElementById("stats-subview-container");
  const rated = books.filter((b) => b.rating_global !== null && b.rating_global !== undefined && Number(b.rating_global) > 0);
  const avgGlobal = rated.length > 0 ? rated.reduce((a, b) => a + Number(b.rating_global), 0) / rated.length : 0;
  const favs = rated.filter((b) => Number(b.rating_global) >= 4.5);

  box.innerHTML = `
    <div class="kpi-grid kpi-grid-3">
      <div class="kpi-card">
        <div class="kpi-label">⭐ Note moyenne</div>
        <div class="kpi-value" style="color:#FBBF24;">${rated.length > 0 ? avgGlobal.toFixed(2) + " / 5" : "—"}</div>
        <div class="kpi-sub">sur ${rated.length} livre(s) noté(s)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">💛 Coups de cœur</div>
        <div class="kpi-value" style="color:#F472B6;">${favs.length}</div>
        <div class="kpi-sub">note ≥ 4.5 / 5</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">📊 Taux d'évaluation</div>
        <div class="kpi-value" style="color:#38BDF8;">${books.length > 0 ? Math.round((rated.length / books.length) * 100) : 0}%</div>
        <div class="kpi-sub">du périmètre sélectionné</div>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Profil d'Évaluation (Moyenne des 5 Sous-Critères)</div>
      <div class="chart-sub">Rythme • Personnages • Worldbuilding • Plume • Intrigue (/5)</div>
      <div id="plot-radar" class="chart-box"></div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Note Communauté vs Votre Note Personnelle</div>
      <div class="chart-sub">Comparaison avec la ligne d'accord parfait (y = x)</div>
      <div id="plot-correlation" class="chart-box"></div>
    </div>
  `;

  if (typeof Plotly === "undefined") {
    setTimeout(() => renderStatsRatingsTab(books), 250);
    return;
  }

  if (rated.length === 0) {
    document.getElementById("plot-radar").innerHTML = `<div style="text-align:center;color:var(--muted);padding:40px;">Aucun livre évalué dans ce périmètre.</div>`;
    document.getElementById("plot-correlation").innerHTML = `<div style="text-align:center;color:var(--muted);padding:40px;">Aucun livre évalué dans ce périmètre.</div>`;
    return;
  }

  const meanCrit = (field) => {
    const vals = rated.map((b) => b[field]).filter((v) => v !== null && v !== undefined && Number(v) > 0);
    return vals.length > 0 ? Math.round((vals.reduce((a, b) => a + Number(b), 0) / vals.length) * 100) / 100 : 0;
  };

  const rVals = [
    meanCrit("rating_pacing"),
    meanCrit("rating_chars"),
    meanCrit("rating_world"),
    meanCrit("rating_writing"),
    meanCrit("rating_plot")
  ];
  rVals.push(rVals[0]);
  const rCats = ["Rythme", "Personnages", "Worldbuilding", "Plume", "Intrigue", "Rythme"];

  Plotly.newPlot(
    "plot-radar",
    [
      {
        type: "scatterpolar",
        r: rVals,
        theta: rCats,
        fill: "toself",
        fillcolor: "rgba(99, 102, 241, 0.3)",
        line: { color: "#818CF8", width: 2 },
        hovertemplate: "<b>%{theta}</b> : %{r:.2f} / 5<extra></extra>"
      }
    ],
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      font: { color: "#F8FAFC", size: 11 },
      polar: {
        bgcolor: "rgba(0,0,0,0)",
        radialaxis: { visible: true, range: [0, 5], gridcolor: "#334155", linecolor: "#334155" },
        angularaxis: { gridcolor: "#334155" }
      },
      margin: { l: 45, r: 45, t: 25, b: 25 },
      showlegend: false
    },
    { displayModeBar: false, responsive: true }
  );

  const bothRated = rated.filter((b) => b.popularity_score !== null && b.popularity_score !== undefined && Number(b.popularity_score) > 0);
  if (bothRated.length > 0) {
    Plotly.newPlot(
      "plot-correlation",
      [
        {
          type: "scatter",
          mode: "markers",
          name: "Livres notés",
          x: bothRated.map((b) => b.popularity_score),
          y: bothRated.map((b) => b.rating_global),
          text: bothRated.map((b) => `${b.title} (${b.author})`),
          marker: { size: 10, color: "#38BDF8" },
          hovertemplate: "<b>%{text}</b><br>Communauté : %{x}/5<br>Votre note : %{y}/5<extra></extra>"
        },
        {
          type: "scatter",
          mode: "lines",
          name: "Accord parfait (y=x)",
          x: [2, 5],
          y: [2, 5],
          line: { color: "#64748B", dash: "dash" }
        }
      ],
      getBasePlotlyLayout({
        xaxis: { title: "Note Communauté (/5)", range: [2.2, 5.1], gridcolor: "#334155" },
        yaxis: { title: "Votre Note (/5)", range: [1.0, 5.2], gridcolor: "#334155" },
        margin: { l: 48, r: 20, t: 15, b: 70 }
      }),
      { displayModeBar: false, responsive: true }
    );
  } else {
    document.getElementById("plot-correlation").innerHTML = `<div style="text-align:center;color:var(--muted);padding:40px;">Ajoutez une note communauté sur vos livres notés pour voir la corrélation.</div>`;
  }
}

// ==========================================
// 5. MODALES (NOTATION MULTI-CRITÈRES + FICHE 3 ONGLETS)
// ==========================================
function openModal(html) {
  const dlg = document.getElementById("app-modal");
  document.getElementById("modal-content").innerHTML = html;
  if (!dlg.open) dlg.showModal();
}

window.closeModal = function () {
  const dlg = document.getElementById("app-modal");
  if (dlg && dlg.open) dlg.close();
};

function renderRatingSlidersHtml(book, prefix) {
  const criteria = [
    { key: "rating_global", label: "🌟 Note Globale (/5)", desc: "0.0 = Non noté" },
    { key: "rating_pacing", label: "⚡ Rythme (/5)", desc: "" },
    { key: "rating_chars", label: "👥 Personnages (/5)", desc: "" },
    { key: "rating_world", label: "🌍 Worldbuilding / Univers (/5)", desc: "" },
    { key: "rating_writing", label: "🪶 Plume / Style (/5)", desc: "" },
    { key: "rating_plot", label: "🧩 Intrigue (/5)", desc: "" }
  ];

  return criteria
    .map((c) => {
      const val = Number(book[c.key] || 0);
      return `
        <div class="rating-slider-row">
          <div class="rating-slider-header">
            <span>${c.label}</span>
            <span class="rating-val-badge" id="${prefix}-val-${c.key}">${val > 0 ? val.toFixed(2) + " / 5" : "0.0 (Non noté)"}</span>
          </div>
          <input type="range" min="0" max="5" step="0.25" id="${prefix}-${c.key}" value="${val}"
            oninput="document.getElementById('${prefix}-val-${c.key}').textContent = Number(this.value) > 0 ? Number(this.value).toFixed(2) + ' / 5' : '0.0 (Non noté)'" />
        </div>
      `;
    })
    .join("");
}

function readRatingSliders(prefix) {
  const getVal = (k) => {
    const el = document.getElementById(`${prefix}-${k}`);
    if (!el) return null;
    const v = Number(el.value);
    return v > 0 ? v : null;
  };
  const g = getVal("rating_global");
  if (!g) {
    return {
      rating_global: null,
      rating_pacing: null,
      rating_chars: null,
      rating_world: null,
      rating_writing: null,
      rating_plot: null
    };
  }
  return {
    rating_global: g,
    rating_pacing: getVal("rating_pacing"),
    rating_chars: getVal("rating_chars"),
    rating_world: getVal("rating_world"),
    rating_writing: getVal("rating_writing"),
    rating_plot: getVal("rating_plot")
  };
}

window.openFinishBookModal = function (bookId) {
  const book = state.books.find((b) => b.id === Number(bookId));
  if (!book) return;
  const todayIso = new Date().toISOString().slice(0, 10);

  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h3 style="margin:0;">🌟 Clôture de « ${escapeHtml(book.title)} »</h3>
      <button class="btn" style="padding:4px 10px;" onclick="window.closeModal()">✕</button>
    </div>
    <div style="font-size:0.8rem;color:var(--muted);margin-bottom:10px;">
      💡 Laissez la Note Globale à 0.0 pour clôturer sans attribuer de note.
    </div>

    <label>Date de fin de lecture</label>
    <input type="date" id="fin-date" value="${book.finished_at || todayIso}" style="margin-bottom:10px;" />

    ${renderRatingSlidersHtml(book, "fin")}

    <label>Votre avis & critique finale</label>
    <textarea id="fin-review" rows="3" placeholder="Ce que vous avez pensé de cette œuvre...">${escapeHtml(book.final_review || "")}</textarea>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
      <button class="btn btn-success" onclick="window.confirmFinishBook(${book.id}, ${book.page_count})">✅ Clôturer la lecture</button>
      <button class="btn" onclick="window.closeModal()">Annuler</button>
    </div>
  `);
};

window.confirmFinishBook = async function (bookId, pageCount) {
  const finished_at = document.getElementById("fin-date").value || new Date().toISOString().slice(0, 10);
  const final_review = document.getElementById("fin-review").value.trim() || null;
  const ratings = readRatingSliders("fin");
  window.closeModal();
  await apiCall("update_book", {
    book_id: bookId,
    data: {
      status: "Terminé",
      current_page: pageCount,
      finished_at,
      final_review,
      ...ratings
    }
  });
  await window.syncFromServer();
};

window.openQuickNoteModal = function (bookId) {
  const book = state.books.find((b) => b.id === Number(bookId));
  if (!book) return;
  openModal(`
    <h3 style="margin-top:0;">✍️ Note / Citation</h3>
    <div style="font-size:0.83rem;color:var(--muted);margin-bottom:10px;">${escapeHtml(book.title)}</div>
    <div class="grid-3">
      <div>
        <label>Type</label>
        <select id="m-note-type">
          <option>Citation</option>
          <option>Commentaire</option>
          <option>Théorie</option>
          <option>Personnage</option>
        </select>
      </div>
      <div>
        <label>Page</label>
        <input type="number" id="m-note-page" value="${book.current_page || 0}" />
      </div>
      <div>
        <label>Chapitre</label>
        <input type="number" id="m-note-chap" value="0" />
      </div>
    </div>
    <label>Contenu *</label>
    <textarea id="m-note-content" rows="4" placeholder="Votre citation ou réflexion..."></textarea>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
      <button class="btn btn-primary" onclick="window.saveQuickNote(${book.id})">💾 Enregistrer</button>
      <button class="btn" onclick="window.closeModal()">Fermer</button>
    </div>
  `);
};

window.saveQuickNote = async function (bookId) {
  const content = document.getElementById("m-note-content").value.trim();
  if (!content) return alert("Le contenu est vide.");
  const note_type = document.getElementById("m-note-type").value;
  const page_number = Number(document.getElementById("m-note-page").value || 0);
  const chapter_number = Number(document.getElementById("m-note-chap").value || 0);
  window.closeModal();
  await apiCall("add_note", {
    book_id: bookId,
    note_type,
    page_number: page_number > 0 ? page_number : null,
    chapter_number: chapter_number > 0 ? chapter_number : null,
    content
  });
  await window.syncFromServer();
};

window.openManualSessionModal = function (bookId) {
  const book = state.books.find((b) => b.id === Number(bookId));
  if (!book) return;
  const curP = Number(book.current_page || 0);
  openModal(`
    <h3 style="margin-top:0;">➕ Session manuelle</h3>
    <label>Mode de lecture</label>
    <select id="m-sess-mode">
      <option value="focus">🎯 Lecture Focus (Concentrée)</option>
      <option value="chill">🛋️ Lecture Détente (Transports, TV, interruptions)</option>
    </select>
    <div class="grid-2">
      <div>
        <label>Page départ</label>
        <input type="number" id="m-sess-start" value="${curP}" />
      </div>
      <div>
        <label>Page fin</label>
        <input type="number" id="m-sess-end" value="${Math.min(book.page_count, curP + 25)}" />
      </div>
    </div>
    <label>Durée (minutes)</label>
    <input type="number" id="m-sess-dur" value="30" />
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
      <button class="btn btn-primary" onclick="window.saveManualSession(${book.id})">💾 Ajouter</button>
      <button class="btn" onclick="window.closeModal()">Annuler</button>
    </div>
  `);
};

window.saveManualSession = async function (bookId) {
  const is_focused = document.getElementById("m-sess-mode").value === "focus";
  const start_page = Number(document.getElementById("m-sess-start").value || 0);
  const end_page = Number(document.getElementById("m-sess-end").value || start_page);
  const duration_minutes = Number(document.getElementById("m-sess-dur").value || 30);
  window.closeModal();
  await apiCall("add_session", { book_id: bookId, start_page, end_page, duration_minutes, is_focused });
  await window.syncFromServer();
};

// ------------------------------------------
// FICHE LIVRE COMPLÈTE (3 SOUS-ONGLETS : FICHE & SAGA | ÉVALUATION /5 | NOTES & SESSIONS)
// ------------------------------------------
window.openBookDetailModal = function (bookId, subTab = "info") {
  const book = state.books.find((b) => b.id === Number(bookId));
  if (!book) return;
  state.bookModalTab = subTab;

  const bookNotes = state.notes.filter((n) => Number(n.book_id) === book.id);
  const bookSessions = state.sessions.filter((s) => Number(s.book_id) === book.id);
  const statuses = ["En cours", "Bibliothèque", "Wishlist", "À acheter", "Terminé", "DNF"];
  const formats = ["Broché", "Poche", "Relié", "Numérique", "Audio"];

  let tabBody = "";

  if (subTab === "info") {
    const sagaBooks = book.series_name
      ? state.books
          .filter((b) => (b.series_name || "").toLowerCase().trim() === book.series_name.toLowerCase().trim())
          .sort((a, b) => Number(a.series_volume || 0) - Number(b.series_volume || 0))
      : [];

    tabBody = `
      <div class="grid-2">
        <div>
          <label>Titre</label>
          <input id="m-ed-title" value="${escapeHtml(book.title)}" />
        </div>
        <div>
          <label>Auteur</label>
          <input id="m-ed-author" value="${escapeHtml(book.author)}" />
        </div>
      </div>

      <div class="grid-2">
        <div>
          <label>Saga / Série</label>
          <input id="m-ed-series" value="${escapeHtml(book.series_name || "")}" />
        </div>
        <div>
          <label>Tome</label>
          <input type="number" step="0.5" id="m-ed-vol" value="${book.series_volume ?? ""}" />
        </div>
      </div>

      <div class="grid-3">
        <div>
          <label>Statut</label>
          <select id="m-ed-status">
            ${statuses.map((s) => `<option value="${s}" ${book.status === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Page actuelle</label>
          <input type="number" id="m-ed-page" value="${book.current_page || 0}" max="${book.page_count}" />
        </div>
        <div>
          <label>Pages totales</label>
          <input type="number" id="m-ed-totpages" value="${book.page_count || 1}" />
        </div>
      </div>

      <div class="grid-3">
        <div>
          <label>Format</label>
          <select id="m-ed-format">
            ${formats.map((f) => `<option value="${f}" ${book.format === f ? "selected" : ""}>${f}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Prix (€)</label>
          <input type="number" step="0.1" id="m-ed-price" value="${book.price ?? ""}" />
        </div>
        <div>
          <label>Mois PAL</label>
          <input type="month" id="m-ed-pal" value="${escapeHtml(book.pal_month || "")}" />
        </div>
      </div>

      <div class="grid-2">
        <div>
          <label>Pays de l'auteur</label>
          <input id="m-ed-country" value="${escapeHtml(book.author_country || "France")}" />
        </div>
        <div>
          <label>Note communauté (/5)</label>
          <input type="number" step="0.05" id="m-ed-pop" value="${book.popularity_score ?? ""}" />
        </div>
      </div>

      <div class="grid-2">
        <div>
          <label>Genres (virgules)</label>
          <input id="m-ed-genres" value="${escapeHtml((book.genres || []).join(", "))}" />
        </div>
        <div>
          <label>Tags & Tropes (virgules)</label>
          <input id="m-ed-tags" value="${escapeHtml((book.tags || []).join(", "))}" />
        </div>
      </div>

      <label>✨ Sous-genres Fantasy (séparés par virgules)</label>
      <input id="m-ed-subg" value="${escapeHtml((book.fantasy_subgenres || []).join(", "))}" placeholder="Ex: Romantasy, Cozy Fantasy, Grimdark" />

      <label>URL Couverture</label>
      <input id="m-ed-cover" value="${escapeHtml(book.cover_url || "")}" />

      ${sagaBooks.length > 0 ? `
        <div style="margin-top:12px;padding:10px;background:rgba(15,23,42,0.6);border-radius:10px;border:1px solid var(--border);">
          <div style="font-weight:700;font-size:0.82rem;color:var(--primary-light);margin-bottom:6px;">
            📚 Saga « ${escapeHtml(book.series_name)} » dans votre collection (${sagaBooks.length})
          </div>
          ${sagaBooks.map((sb) => `<div style="font-size:0.78rem;padding:2px 0;">• Tome ${sb.series_volume || "?"} : <b>${escapeHtml(sb.title)}</b> (${sb.status})</div>`).join("")}
        </div>
      ` : ""}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
        <button class="btn btn-primary" onclick="window.saveBookEdits(${book.id})">💾 Enregistrer la fiche</button>
        <button class="btn btn-danger" onclick="window.removeBook(${book.id})">🗑️ Supprimer le livre</button>
      </div>
    `;
  } else if (subTab === "eval") {
    tabBody = `
      <div style="font-size:0.8rem;color:var(--muted);margin-bottom:10px;">
        Ajustez vos notes détaillées par pas de 0.25 (mettez la Note Globale à 0.0 pour « Non noté »).
      </div>
      ${renderRatingSlidersHtml(book, "ed")}
      <label>Votre critique / avis final</label>
      <textarea id="ed-final-review" rows="4" placeholder="Votre critique complète...">${escapeHtml(book.final_review || "")}</textarea>
      <button class="btn btn-primary" style="width:100%;margin-top:14px;" onclick="window.saveBookRatings(${book.id})">
        💾 Enregistrer l'évaluation détaillée
      </button>
    `;
  } else {
    tabBody = `
      <div style="font-weight:700;font-size:0.88rem;margin-bottom:6px;">➕ Ajouter une note ou citation</div>
      <div class="grid-2">
        <select id="md-note-type">
          <option>Citation</option>
          <option>Commentaire</option>
          <option>Théorie</option>
          <option>Personnage</option>
        </select>
        <input type="number" id="md-note-page" value="${book.current_page || 0}" placeholder="Page" />
      </div>
      <textarea id="md-note-content" rows="2" style="margin-top:8px;" placeholder="Votre citation ou réflexion..."></textarea>
      <button class="btn btn-primary" style="width:100%;margin-top:8px;padding:9px;" onclick="window.addNoteFromDetail(${book.id})">
        Enregistrer la note
      </button>

      <div style="margin-top:14px;font-weight:700;font-size:0.86rem;">📜 Notes & Citations (${bookNotes.length})</div>
      ${bookNotes.length > 0
        ? bookNotes.map((n) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.82rem;">
              <div style="flex:1;">
                <b style="color:var(--primary-light);">${escapeHtml(n.note_type)}</b> ${n.page_number ? `(p. ${n.page_number})` : ""}<br/>
                <span>${escapeHtml(n.content)}</span>
              </div>
              <button class="btn btn-danger" style="padding:4px 8px;font-size:0.75rem;" onclick="window.deleteNoteFromDetail(${n.id}, ${book.id})">🗑️</button>
            </div>
          `).join("")
        : `<div style="font-size:0.8rem;color:var(--muted);padding:6px 0;">Aucune note enregistrée.</div>`
      }

      <div style="margin-top:14px;font-weight:700;font-size:0.86rem;">⏱️ Historique des sessions (${bookSessions.length})</div>
      ${bookSessions.length > 0
        ? bookSessions.map((s) => {
            const dStr = s.start_time ? new Date(s.start_time).toLocaleDateString("fr-FR") : "";
            const mTag = s.is_focused !== false ? "🎯 Focus" : "🛋️ Détente";
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:0.8rem;">
                <div>
                  <b>${dStr}</b> (${mTag}) : +${s.pages_read} p. (p.${s.start_page}→${s.end_page}) • ${s.duration_minutes} min • ⚡ ${s.pages_per_hour} p/h
                </div>
                <button class="btn btn-danger" style="padding:4px 8px;font-size:0.75rem;" onclick="window.deleteSessionFromDetail(${s.id}, ${book.id})">✕</button>
              </div>
            `;
          }).join("")
        : `<div style="font-size:0.8rem;color:var(--muted);padding:6px 0;">Aucune session enregistrée.</div>`
      }
    `;
  }

  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;">
      <div>
        <h3 style="margin:0;">${escapeHtml(book.title)}</h3>
        <div style="font-size:0.83rem;color:var(--muted);">${escapeHtml(book.author)}</div>
      </div>
      <button class="btn" style="padding:4px 10px;" onclick="window.closeModal()">✕</button>
    </div>

    <div class="pills-row" style="margin:10px 0 8px;">
      <button class="pill ${subTab === "info" ? "active" : ""}" onclick="window.openBookDetailModal(${book.id}, 'info')">📋 Fiche & Saga</button>
      <button class="pill ${subTab === "eval" ? "active" : ""}" onclick="window.openBookDetailModal(${book.id}, 'eval')">⭐ Évaluation (/5)</button>
      <button class="pill ${subTab === "notes" ? "active" : ""}" onclick="window.openBookDetailModal(${book.id}, 'notes')">📜 Notes & Sessions (${bookNotes.length + bookSessions.length})</button>
    </div>

    ${tabBody}
  `);
};

window.saveBookEdits = async function (bookId) {
  const g = (id) => document.getElementById(id).value;
  const pal_month = g("m-ed-pal") || null;
  const pal_year = pal_month ? Number(pal_month.slice(0, 4)) : null;

  const data = {
    title: g("m-ed-title").trim(),
    author: g("m-ed-author").trim(),
    series_name: g("m-ed-series").trim() || null,
    series_volume: g("m-ed-vol") !== "" ? Number(g("m-ed-vol")) : null,
    status: g("m-ed-status"),
    current_page: Number(g("m-ed-page") || 0),
    page_count: Math.max(1, Number(g("m-ed-totpages") || 1)),
    format: g("m-ed-format"),
    price: g("m-ed-price") !== "" ? Number(g("m-ed-price")) : null,
    pal_month,
    pal_year,
    author_country: g("m-ed-country").trim() || "France",
    popularity_score: g("m-ed-pop") !== "" ? Number(g("m-ed-pop")) : null,
    genres: g("m-ed-genres").split(",").map((s) => s.trim()).filter(Boolean),
    tags: g("m-ed-tags").split(",").map((s) => s.trim()).filter(Boolean),
    fantasy_subgenre: g("m-ed-subg").split(",").map((s) => s.trim()).filter(Boolean),
    cover_url: g("m-ed-cover").trim() || null
  };

  window.closeModal();
  await apiCall("update_book", { book_id: bookId, data });
  await window.syncFromServer();
};

window.saveBookRatings = async function (bookId) {
  const ratings = readRatingSliders("ed");
  const final_review = document.getElementById("ed-final-review").value.trim() || null;
  window.closeModal();
  await apiCall("update_book", {
    book_id: bookId,
    data: {
      ...ratings,
      final_review
    }
  });
  await window.syncFromServer();
};

window.addNoteFromDetail = async function (bookId) {
  const content = document.getElementById("md-note-content").value.trim();
  if (!content) return;
  const note_type = document.getElementById("md-note-type").value;
  const page_number = Number(document.getElementById("md-note-page").value || 0);
  await apiCall("add_note", {
    book_id: bookId,
    note_type,
    page_number: page_number > 0 ? page_number : null,
    content
  });
  await window.syncFromServer();
  window.openBookDetailModal(bookId, "notes");
};

window.deleteNoteFromDetail = async function (noteId, bookId) {
  await apiCall("delete_note", { note_id: noteId });
  await window.syncFromServer();
  window.openBookDetailModal(bookId, "notes");
};

window.deleteSessionFromDetail = async function (sessionId, bookId) {
  await apiCall("delete_session", { session_id: sessionId });
  await window.syncFromServer();
  window.openBookDetailModal(bookId, "notes");
};

window.removeBook = async function (bookId) {
  if (!confirm("Supprimer définitivement ce livre et toutes ses sessions/notes ?")) return;
  window.closeModal();
  await apiCall("delete_book", { book_id: bookId });
  await window.syncFromServer();
};

// ==========================================
// 6. AUTHENTIFICATION & ESPACES UTILISATEURS ISOLÉS
// ==========================================
function showAppShell(authenticated) {
  const authEl = document.getElementById("view-auth");
  const viewsEl = document.getElementById("app-views");
  const navEl = document.getElementById("bottom-nav");
  const accBtn = document.getElementById("account-btn");
  if (authEl) authEl.style.display = authenticated ? "none" : "block";
  if (viewsEl) viewsEl.style.display = authenticated ? "block" : "none";
  if (navEl) navEl.style.display = authenticated ? "grid" : "none";
  if (accBtn) accBtn.style.display = authenticated ? "inline-flex" : "none";
}

let authScreenMode = "login"; // "login" | "register"
let lastAuthStatus = { needs_setup: false, beta_open: true, max_users: 10, user_count: 1, spots_left: 9, allow_signups: true };

function renderAuthView(statusObj = null) {
  if (statusObj) lastAuthStatus = statusObj;
  const st = lastAuthStatus;
  showAppShell(false);
  setSyncStatus(false, "Verrouillé");
  const el = document.getElementById("view-auth");
  if (!el) return;

  if (st.needs_setup) {
    el.innerHTML = `
      <div class="card" style="max-width:440px;margin:24px auto;padding:24px;">
        <div style="text-align:center;margin-bottom:16px;">
          <div style="font-size:2.6rem;">🔐</div>
          <h2 style="margin:8px 0 4px;">Configuration Propriétaire</h2>
          <div style="font-size:0.83rem;color:var(--muted);">
            Créez votre compte personnel pour rattacher votre bibliothèque actuelle.
          </div>
        </div>
        <label>Votre prénom</label>
        <input id="auth-name" value="Morgane" placeholder="Morgane" />
        <label>Votre email *</label>
        <input type="email" id="auth-email" placeholder="votre@email.com" />
        <label>Choisissez un mot de passe *</label>
        <input type="password" id="auth-pass" placeholder="••••••••" onkeydown="if(event.key==='Enter')window.submitOwnerSetup()" />
        <button class="btn btn-primary" style="width:100%;margin-top:18px;padding:14px;" onclick="window.submitOwnerSetup()">
          🔒 Créer mon compte Propriétaire
        </button>
      </div>
    `;
    return;
  }

  const canSignup = Boolean(st.allow_signups);
  const spotsLeft = Number(st.spots_left ?? 9);
  const maxUsers = Number(st.max_users ?? 10);
  const userCount = Number(st.user_count ?? 1);

  if (!canSignup && authScreenMode === "register") {
    authScreenMode = "login";
  }

  el.innerHTML = `
    <div class="card" style="max-width:440px;margin:24px auto;padding:22px;">
      <div style="text-align:center;margin-bottom:14px;">
        <div style="font-size:2.5rem;">📖</div>
        <h2 style="margin:6px 0 4px;">StatOme <span style="font-size:0.8rem;color:var(--primary-light);font-weight:600;">by TomeFab</span></h2>
        ${canSignup ? `
          <div style="font-size:0.78rem;color:#34D399;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.35);padding:5px 10px;border-radius:8px;margin-top:6px;">
            ✨ Bêta Privée ouverte sur invitation (${spotsLeft} place(s) disponible(s) sur ${maxUsers})
          </div>
        ` : `
          <div style="font-size:0.78rem;color:#F59E0B;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);padding:5px 10px;border-radius:8px;margin-top:6px;">
            🔒 Bêta Privée complète ou fermée (${userCount}/${maxUsers} places utilisées)
          </div>
        `}
      </div>

      ${canSignup ? `
        <div class="mode-toggle" style="margin-bottom:14px;">
          <button class="mode-btn ${authScreenMode === "login" ? "active-focus" : ""}" onclick="window.setAuthScreenMode('login')">
            🔓 Connexion
          </button>
          <button class="mode-btn ${authScreenMode === "register" ? "active-focus" : ""}" onclick="window.setAuthScreenMode('register')">
            ✨ Rejoindre la Bêta
          </button>
        </div>
      ` : ""}

      ${authScreenMode === "login" ? `
        <label>Email</label>
        <input type="email" id="login-email" placeholder="votre@email.com" />
        <label>Mot de passe</label>
        <input type="password" id="login-pass" placeholder="••••••••" onkeydown="if(event.key==='Enter')window.submitLogin()" />
        <button class="btn btn-primary" style="width:100%;margin-top:18px;padding:14px;" onclick="window.submitLogin()">
          🔓 Se connecter (Session permanente 1 an)
        </button>
      ` : `
        <label>Code d'invitation Bêta *</label>
        <input id="reg-code" placeholder="Code remis par Morgane" style="border-color:var(--primary-light);font-weight:700;" />
        <label>Votre prénom *</label>
        <input id="reg-name" placeholder="Ex: Camille" />
        <label>Votre email *</label>
        <input type="email" id="reg-email" placeholder="votre@email.com" />
        <label>Choisissez un mot de passe *</label>
        <input type="password" id="reg-pass" placeholder="4 caractères minimum" onkeydown="if(event.key==='Enter')window.submitBetaRegister()" />
        <button class="btn btn-success" style="width:100%;margin-top:18px;padding:14px;" onclick="window.submitBetaRegister()">
          ✨ Créer mon espace Bêta-Testeur
        </button>
      `}
    </div>
  `;
}

window.setAuthScreenMode = function (m) {
  authScreenMode = m;
  renderAuthView();
};

window.submitOwnerSetup = async function () {
  const display_name = document.getElementById("auth-name").value.trim() || "Morgane";
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-pass").value;
  if (!email || password.length < 4) {
    return alert("Veuillez renseigner votre email et un mot de passe d'au moins 4 caractères.");
  }
  setSyncStatus(true, "Création...");
  try {
    const res = await apiCall("auth_setup", { display_name, email, password });
    localStorage.setItem(AUTH_TOKEN_KEY, res.token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
    showAppShell(true);
    await window.syncFromServer();
  } catch (e) {
    setSyncStatus(false, "Erreur");
    alert(e.message);
  }
};

window.submitLogin = async function () {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-pass").value;
  if (!email || !password) return alert("Veuillez saisir votre email et votre mot de passe.");
  setSyncStatus(true, "Connexion...");
  try {
    const res = await apiCall("auth_login", { email, password });
    localStorage.setItem(AUTH_TOKEN_KEY, res.token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
    showAppShell(true);
    await window.syncFromServer();
  } catch (e) {
    setSyncStatus(false, "Verrouillé");
    alert(e.message);
  }
};

window.submitBetaRegister = async function () {
  const invite_code = document.getElementById("reg-code").value.trim();
  const display_name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-pass").value;
  if (!invite_code) return alert("Le code d'invitation Bêta est requis.");
  if (!email || password.length < 4) return alert("Veuillez saisir un email valide et un mot de passe (4 caractères min).");
  setSyncStatus(true, "Inscription...");
  try {
    const res = await apiCall("auth_register", { invite_code, display_name, email, password });
    localStorage.setItem(AUTH_TOKEN_KEY, res.token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
    state.books = [];
    state.sessions = [];
    state.notes = [];
    saveLocalCache();
    showAppShell(true);
    await window.syncFromServer();
  } catch (e) {
    setSyncStatus(false, "Verrouillé");
    alert(e.message);
  }
};

window.exportLibraryCsv = function () {
  if (!state.books.length) return alert("Votre bibliothèque est vide.");
  const cols = ["title", "author", "series_name", "series_volume", "status", "page_count", "current_page", "rating_global", "format", "price", "publisher", "publication_year", "isbn", "started_at", "finished_at"];
  const csvRows = [cols.join(";")];
  for (const b of state.books) {
    const row = cols.map((k) => `"${String(b[k] ?? "").replace(/"/g, '""')}"`);
    csvRows.push(row.join(";"));
  }
  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `statome_bibliotheque_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

window.openAccountModal = async function () {
  const u = getAuthUser() || { name: "Lecteur", email: "", admin: false };
  const isAdmin = Boolean(u.admin) || Number(u.uid) === 1;

  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h3 style="margin:0;">👤 Mon Compte StatOme</h3>
      <button class="btn" style="padding:4px 10px;" onclick="window.closeModal()">✕</button>
    </div>
    <div class="card" style="margin-top:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:700;font-size:1.02rem;">${escapeHtml(u.name || "Utilisateur")}</div>
          <div style="font-size:0.82rem;color:var(--muted);">${escapeHtml(u.email || "")}</div>
        </div>
        <span class="status-badge" style="background:rgba(99,102,241,0.2);color:#818CF8;border:1px solid #6366F1;">
          ${isAdmin ? "👑 Propriétaire" : "✨ Bêta-Testeur"}
        </span>
      </div>
      <div style="margin-top:10px;font-size:0.78rem;color:#34D399;">
        🛡️ Bibliothèque personnelle isolée (${state.books.length} livres • ${state.sessions.length} sessions)
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
        <button class="btn" style="font-size:0.8rem;padding:9px;" onclick="window.exportLibraryCsv()">📥 Exporter CSV</button>
        <button class="btn btn-danger" style="font-size:0.8rem;padding:9px;" onclick="window.logoutUser()">🚪 Déconnexion</button>
      </div>
      ${!isAdmin ? `
        <button class="btn btn-danger" style="width:100%;margin-top:8px;font-size:0.76rem;padding:8px;" onclick="window.deleteMyBetaAccount()">
          🗑️ Supprimer définitivement mon compte et mes données
        </button>
      ` : ""}
    </div>
    ${isAdmin ? `<div id="admin-beta-box"><div style="text-align:center;color:var(--muted);font-size:0.82rem;padding:12px;">Chargement du panneau Bêta...</div></div>` : ""}
  `);

  if (isAdmin) {
    try {
      const adm = await apiCall("admin_get_dashboard");
      const s = adm.settings || { beta_open: true, invite_code: "TOMEFAB", max_users: 10 };
      const users = adm.users || [];
      const box = document.getElementById("admin-beta-box");
      if (!box) return;

      const usersHtml = users
        .map((usr) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.8rem;">
            <div style="min-width:0;flex:1;">
              <div><b>${escapeHtml(usr.display_name)}</b> ${usr.is_admin ? '<span style="color:#818CF8;">(Vous)</span>' : ""}</div>
              <div style="color:var(--muted);font-size:0.74rem;">${escapeHtml(usr.email)} • ${usr.books_count} livres • ${usr.sessions_count} sessions</div>
            </div>
            <div style="display:flex;gap:5px;margin-left:8px;">
              <button class="btn" style="padding:4px 8px;font-size:0.72rem;" onclick="window.adminResetUserPass(${usr.id}, '${escapeHtml(usr.display_name)}')" title="Réinitialiser son mot de passe">🔑 MDP</button>
              ${!usr.is_admin ? `<button class="btn btn-danger" style="padding:4px 8px;font-size:0.72rem;" onclick="window.adminDeleteUser(${usr.id}, '${escapeHtml(usr.display_name)}')" title="Supprimer ce testeur">🗑️</button>` : ""}
            </div>
          </div>
        `)
        .join("");

      box.innerHTML = `
        <div class="card" style="border-color:#6366F1;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:800;font-size:0.95rem;color:var(--primary-light);">🛠️ Gestion Bêta-Testeurs</span>
            <span style="font-weight:700;font-size:0.82rem;color:#34D399;">${users.length} / ${s.max_users} places</span>
          </div>

          <div class="grid-3">
            <div>
              <label>Inscriptions Bêta</label>
              <select id="adm-beta-open">
                <option value="true" ${s.beta_open ? "selected" : ""}>🟢 Ouvertes</option>
                <option value="false" ${!s.beta_open ? "selected" : ""}>🔴 Fermées</option>
              </select>
            </div>
            <div>
              <label>Code d'invitation</label>
              <input id="adm-invite-code" value="${escapeHtml(s.invite_code)}" />
            </div>
            <div>
              <label>Max utilisateurs</label>
              <input type="number" id="adm-max-users" value="${s.max_users}" min="1" max="500" />
            </div>
          </div>

          <button class="btn btn-primary" style="width:100%;margin-top:10px;padding:9px;font-size:0.84rem;" onclick="window.saveAdminBetaSettings()">
            💾 Enregistrer les réglages Bêta
          </button>

          <div style="margin-top:14px;font-weight:700;font-size:0.83rem;margin-bottom:4px;">
            👥 Comptes inscrits (${users.length}/${s.max_users})
          </div>
          ${usersHtml}
        </div>
      `;
    } catch (e) {
      const box = document.getElementById("admin-beta-box");
      if (box) box.innerHTML = `<div style="color:var(--danger);font-size:0.8rem;">Erreur chargement admin: ${escapeHtml(e.message)}</div>`;
    }
  }
};

window.saveAdminBetaSettings = async function () {
  const beta_open = document.getElementById("adm-beta-open").value === "true";
  const invite_code = document.getElementById("adm-invite-code").value.trim() || "TOMEFAB";
  const max_users = Number(document.getElementById("adm-max-users").value || 10);
  await apiCall("admin_update_settings", { beta_open, invite_code, max_users });
  alert("Réglages Bêta mis à jour !");
  window.openAccountModal();
};

window.adminResetUserPass = async function (targetId, name) {
  const newPass = prompt(`Saisissez un nouveau mot de passe temporaire pour ${name} (4 caractères min) :`);
  if (!newPass || newPass.trim().length < 4) return;
  await apiCall("admin_reset_password", { target_user_id: targetId, new_password: newPass.trim() });
  alert(`Mot de passe de ${name} réinitialisé avec succès !`);
};

window.adminDeleteUser = async function (targetId, name) {
  if (!confirm(`Supprimer le compte bêta-testeur de ${name} et libérer sa place ?`)) return;
  await apiCall("admin_delete_user", { target_user_id: targetId });
  window.openAccountModal();
};

window.deleteMyBetaAccount = async function () {
  if (!confirm("Voulez-vous vraiment supprimer définitivement votre compte Bêta et toutes vos données ?")) return;
  await apiCall("delete_my_account", {});
  await window.logoutUser();
};

window.logoutUser = async function () {
  window.closeModal();
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(CACHE_KEY);
  state.books = [];
  state.sessions = [];
  state.notes = [];
  await window.checkAuthAndBoot();
};

window.checkAuthAndBoot = async function () {
  const token = getAuthToken();
  if (token) {
    loadLocalCache();
    showAppShell(true);
    renderCurrentTab();
    window.syncFromServer(false);
    return;
  }
  state.books = [];
  state.sessions = [];
  state.notes = [];
  showAppShell(false);
  try {
    const status = await apiCall("auth_status");
    renderAuthView(status);
  } catch {
    renderAuthView();
  }
};

// Boot PWA
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
window.checkAuthAndBoot();
