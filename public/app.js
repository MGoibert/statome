/**
 * StatOme PWA — Local-First Engine (0.01s startup + Background Neon Sync)
 */

const CACHE_KEY = "statome_data_cache_v2";
const TIMER_KEY = "statome_timer_local_v2";

const STATUS_COLORS = {
  "En cours": "#38BDF8",
  "Bibliothèque": "#818CF8",
  "Wishlist": "#F472B6",
  "À acheter": "#FB923C",
  "Terminé": "#34D399",
  "DNF": "#EF4444"
};

let state = {
  books: [],
  sessions: [],
  notes: [],
  activeTab: "reading",
  selectedBookId: null,
  libFilter: "Tous",
  libSearch: "",
  searchResults: [],
  timer: {
    bookId: null,
    isRunning: false,
    startTimeMs: null,
    accumulatedSec: 0,
    isFocused: true
  }
};

// 1. Load Local Cache Immediately (0ms cold start)
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

async function apiCall(action, payload = null) {
  const isGet = !payload && action === "bootstrap";
  const url = isGet ? `/api?action=${action}` : `/api?action=${action}`;
  const resp = await fetch(url, {
    method: isGet ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: isGet ? undefined : JSON.stringify({ action, ...payload })
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}

window.syncFromServer = async function (manual = false) {
  setSyncStatus(true, "Sync Neon...");
  try {
    const data = await apiCall("bootstrap");
    state.books = data.books || [];
    state.sessions = data.sessions || [];
    state.notes = data.notes || [];

    // Reconcile timer only if local timer is idle and server has an active timer
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
    renderCurrentTab();
  } catch (err) {
    setSyncStatus(false, "Mode Hors-Ligne");
    if (manual) alert("Impossible de joindre Neon : " + err.message);
  }
};

// Calculate Focus & Chill Speeds (pages/hour)
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

// Navigation
window.switchTab = function (tab) {
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

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

// ==========================================
// 1. VUE LECTURE (MODE ZEN)
// ==========================================
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
      <button class="zen-btn" onclick="window.openBookDetailModal(${book.id})">
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

  // Optimistic local update (0ms)
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

// Live 1-second ticker + instant wake-up update on phone sleep/wake
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
// 2. VUE BIBLIOTHÈQUE ÉPURÉE
// ==========================================
function renderLibraryView() {
  const el = document.getElementById("view-library");
  const curMonth = new Date().toISOString().slice(0, 7);
  const pills = ["Tous", "En cours", "À lire", "PAL du mois", "Terminé", "Wishlist", "À acheter"];

  let filtered = state.books.filter((b) => {
    if (state.libFilter === "En cours") return b.status === "En cours";
    if (state.libFilter === "À lire") return b.status === "Bibliothèque";
    if (state.libFilter === "PAL du mois") return b.pal_month === curMonth;
    if (state.libFilter === "Terminé") return b.status === "Terminé";
    if (state.libFilter === "Wishlist") return b.status === "Wishlist";
    if (state.libFilter === "À acheter") return b.status === "À acheter";
    return true;
  });

  if (state.libSearch.trim()) {
    const q = state.libSearch.toLowerCase().trim();
    filtered = filtered.filter(
      (b) =>
        (b.title || "").toLowerCase().includes(q) ||
        (b.author || "").toLowerCase().includes(q) ||
        (b.series_name || "").toLowerCase().includes(q)
    );
  }

  const cardsHtml = filtered
    .map((b) => {
      const col = STATUS_COLORS[b.status] || "#64748B";
      const curP = Number(b.current_page || 0);
      const totP = Math.max(Number(b.page_count || 1), 1);
      const pct = Math.min(100, Math.round((curP / totP) * 100));
      const cover = b.cover_url
        ? `<img src="${escapeHtml(b.cover_url)}" style="width:62px;height:94px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
        : `<div style="width:62px;height:94px;background:#334155;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">📖</div>`;
      const rating = b.rating_global ? `<span style="color:#FBBF24;font-size:0.78rem;font-weight:700;">⭐ ${b.rating_global}/5</span>` : "";
      const series = b.series_name
        ? `<div style="font-size:0.75rem;color:var(--primary-light);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(b.series_name)}${b.series_volume ? ` • T.${b.series_volume}` : ""}</div>`
        : "";
      const footer = b.status === "En cours"
        ? `<div class="progress-track" style="height:5px;margin-top:8px;"><div class="progress-fill" style="width:${pct}%"></div></div>
           <div style="font-size:0.72rem;color:var(--muted);margin-top:3px;">${curP} / ${totP} p. (${pct}%)</div>`
        : `<div style="font-size:0.73rem;color:var(--muted);margin-top:5px;">${totP} pages${b.pal_month ? ` • 🎯 PAL ${b.pal_month}` : ""}</div>`;

      return `
        <div class="lib-card" onclick="window.openBookDetailModal(${b.id})">
          ${cover}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span class="status-badge" style="background:${col}22;color:${col};border:1px solid ${col}55;">${escapeHtml(b.status)}</span>
              ${rating}
            </div>
            <div style="font-weight:700;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(b.title)}</div>
            <div style="font-size:0.8rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(b.author)}</div>
            ${series}
            ${footer}
          </div>
        </div>
      `;
    })
    .join("");

  el.innerHTML = `
    <input type="search" placeholder="🔍 Rechercher un titre, auteur, saga..." value="${escapeHtml(state.libSearch)}" oninput="window.setLibSearch(this.value)" style="margin-bottom:10px;" />
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
      ${cardsHtml || `<div style="text-align:center;color:var(--muted);padding:30px;">Aucun livre dans cette catégorie.</div>`}
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

// ==========================================
// 3. VUE AJOUTER UN LIVRE
// ==========================================
function renderAddView() {
  const el = document.getElementById("view-add");
  const resultsHtml = state.searchResults
    .map(
      (r, idx) => `
      <div class="lib-card" onclick="window.prefillAddBook(${idx})">
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
    <div class="card">
      <div style="font-weight:700;margin-bottom:8px;">🔍 Recherche rapide (Titre, Auteur ou ISBN)</div>
      <div style="display:flex;gap:8px;">
        <input type="search" id="ext-search-q" placeholder="Ex: Brandon Sanderson, 978..." onkeydown="if(event.key==='Enter')window.runExternalSearch()" />
        <button class="btn btn-primary" onclick="window.runExternalSearch()">Chercher</button>
      </div>
      ${resultsHtml ? `<div style="display:grid;gap:8px;margin-top:12px;">${resultsHtml}</div>` : ""}
    </div>

    <div class="card">
      <div style="font-weight:700;margin-bottom:8px;">➕ Fiche du nouveau livre</div>
      <label>Titre *</label>
      <input id="add-title" placeholder="Titre de l'ouvrage" />
      <label>Auteur *</label>
      <input id="add-author" placeholder="Nom de l'auteur" />
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;">
        <div>
          <label>Saga / Série</label>
          <input id="add-series" placeholder="Optionnel" />
        </div>
        <div>
          <label>Tome</label>
          <input type="number" step="0.5" id="add-vol" placeholder="1" />
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label>Nombre de pages *</label>
          <input type="number" id="add-pages" value="350" />
        </div>
        <div>
          <label>Statut initial</label>
          <select id="add-status">
            <option value="Bibliothèque">📚 À lire (Biblio)</option>
            <option value="En cours">📖 En cours</option>
            <option value="Wishlist">🌟 Wishlist</option>
            <option value="À acheter">🛒 À acheter</option>
            <option value="Terminé">✅ Terminé</option>
          </select>
        </div>
      </div>
      <label>URL Couverture</label>
      <input id="add-cover" placeholder="https://..." />
      <button class="btn btn-primary" style="width:100%;margin-top:14px;" onclick="window.submitNewBook()">💾 Ajouter à ma bibliothèque</button>
    </div>
  `;
}

window.runExternalSearch = async function () {
  const q = document.getElementById("ext-search-q").value.trim();
  if (!q) return;
  setSyncStatus(true, "Recherche...");
  try {
    const data = await apiCall("search_external", { q });
    state.searchResults = data.results || [];
    setSyncStatus(false, "Synchronisé");
    renderAddView();
  } catch (e) {
    setSyncStatus(false, "Erreur");
  }
};

window.prefillAddBook = function (idx) {
  const r = state.searchResults[idx];
  if (!r) return;
  document.getElementById("add-title").value = r.title || "";
  document.getElementById("add-author").value = r.author || "";
  document.getElementById("add-pages").value = r.page_count || 300;
  document.getElementById("add-cover").value = r.cover_url || "";
};

window.submitNewBook = async function () {
  const title = document.getElementById("add-title").value.trim();
  const author = document.getElementById("add-author").value.trim() || "Auteur inconnu";
  if (!title) return alert("Le titre est requis.");
  const payload = {
    title,
    author,
    series_name: document.getElementById("add-series").value.trim() || null,
    series_volume: document.getElementById("add-vol").value ? Number(document.getElementById("add-vol").value) : null,
    page_count: Number(document.getElementById("add-pages").value || 300),
    status: document.getElementById("add-status").value,
    cover_url: document.getElementById("add-cover").value.trim() || null
  };
  setSyncStatus(true, "Ajout...");
  try {
    await apiCall("add_book", payload);
    state.searchResults = [];
    await window.syncFromServer();
    window.switchTab(payload.status === "En cours" ? "reading" : "library");
  } catch (e) {
    alert("Erreur : " + e.message);
  }
};

// ==========================================
// 4. VUE STATISTIQUES (FOCUS vs DÉTENTE)
// ==========================================
function renderStatsView() {
  const el = document.getElementById("view-stats");
  const { globalFocusSpeed, globalChillSpeed, focusCount, chillCount, refFocusSpeed } = computeSpeeds();
  const finishedBooks = state.books.filter((b) => b.status === "Terminé");
  const curYear = String(new Date().getFullYear());
  const finishedThisYear = finishedBooks.filter((b) => String(b.finished_at || "").startsWith(curYear));

  const now = Date.now();
  const last30d = state.sessions.filter((s) => now - new Date(s.start_time).getTime() <= 30 * 86400 * 1000);
  const pages30d = last30d.reduce((a, s) => a + Number(s.pages_read || 0), 0);
  const min30d = last30d.reduce((a, s) => a + Number(s.duration_minutes || 0), 0);

  const curMonth = new Date().toISOString().slice(0, 7);
  const palBooks = state.books.filter((b) => b.pal_month === curMonth && b.status !== "Terminé");
  const palPagesLeft = palBooks.reduce((a, b) => a + Math.max(0, Number(b.page_count || 0) - Number(b.current_page || 0)), 0);
  const palHoursLeft = refFocusSpeed > 0 ? (palPagesLeft / refFocusSpeed).toFixed(1) : "0";

  const recentSessionsHtml = state.sessions
    .slice(0, 10)
    .map((s) => {
      const badge = s.is_focused !== false
        ? `<span style="color:#818CF8;font-weight:700;">🎯 Focus</span>`
        : `<span style="color:#F59E0B;font-weight:700;">🛋️ Détente</span>`;
      const dStr = s.start_time ? new Date(s.start_time).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "";
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.83rem;">
          <div style="min-width:0;flex:1;">
            <div><b>${escapeHtml(s.book_title)}</b> • <span style="color:var(--muted);">${dStr}</span></div>
            <div style="color:var(--muted);font-size:0.77rem;">${badge} • +${s.pages_read} p. en ${s.duration_minutes} min</div>
          </div>
          <div style="font-weight:700;color:var(--accent);margin-left:8px;">${s.pages_per_hour} p/h</div>
        </div>
      `;
    })
    .join("");

  el.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card" style="border-color: rgba(99, 102, 241, 0.45);">
        <div class="kpi-label">🎯 Vitesse Focus</div>
        <div class="kpi-value" style="color:#818CF8;">${globalFocusSpeed > 0 ? Math.round(globalFocusSpeed) + " p/h" : "—"}</div>
        <div class="kpi-sub">${focusCount} session(s) concentrée(s)</div>
      </div>
      <div class="kpi-card" style="border-color: rgba(245, 158, 11, 0.45);">
        <div class="kpi-label">🛋️ Vitesse Détente</div>
        <div class="kpi-value" style="color:#F59E0B;">${globalChillSpeed > 0 ? Math.round(globalChillSpeed) + " p/h" : "—"}</div>
        <div class="kpi-sub">${chillCount} session(s) multi-tâche</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">📚 Terminés (${curYear})</div>
        <div class="kpi-value" style="color:#34D399;">${finishedThisYear.length}</div>
        <div class="kpi-sub">${finishedBooks.length} livres lus au total</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">⚡ Rythme (30 jours)</div>
        <div class="kpi-value" style="color:#38BDF8;">${pages30d} p.</div>
        <div class="kpi-sub">${(min30d / 60).toFixed(1)} h de lecture</div>
      </div>
    </div>

    <div class="card">
      <div style="font-weight:700;color:var(--primary-light);margin-bottom:6px;">🎯 Objectif PAL du mois (${curMonth})</div>
      ${palBooks.length > 0
        ? `<div style="font-size:0.88rem;line-height:1.5;">
             Il vous reste <b>${palBooks.length} livre(s)</b> (${palPagesLeft} pages) dans votre PAL du mois.<br/>
             ⏱️ Temps estimé à votre vitesse Focus (${Math.round(refFocusSpeed)} p/h) : <b style="color:var(--accent);">~${palHoursLeft} heures</b>.
           </div>`
        : `<div style="font-size:0.85rem;color:var(--muted);">Aucun livre non terminé dans la PAL de ce mois.</div>`
      }
    </div>

    <div class="card">
      <div style="font-weight:700;margin-bottom:8px;">🕒 Dernières sessions (🎯 Focus vs 🛋️ Détente)</div>
      ${recentSessionsHtml || `<div style="color:var(--muted);font-size:0.85rem;">Aucune session enregistrée.</div>`}
    </div>
  `;
}

// ==========================================
// 5. MODALES (NOTE, SESSION MANUELLE, CLÔTURE, FICHE LIVRE)
// ==========================================
function openModal(html) {
  const dlg = document.getElementById("app-modal");
  document.getElementById("modal-content").innerHTML = html;
  dlg.showModal();
}

window.closeModal = function () {
  const dlg = document.getElementById("app-modal");
  if (dlg && dlg.open) dlg.close();
};

window.openQuickNoteModal = function (bookId) {
  const book = state.books.find((b) => b.id === Number(bookId));
  if (!book) return;
  openModal(`
    <h3 style="margin-top:0;">✍️ Note / Citation</h3>
    <div style="font-size:0.83rem;color:var(--muted);margin-bottom:10px;">${escapeHtml(book.title)}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
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
  window.closeModal();
  await apiCall("add_note", { book_id: bookId, note_type, page_number, content });
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
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
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

window.openFinishBookModal = function (bookId) {
  const book = state.books.find((b) => b.id === Number(bookId));
  if (!book) return;
  openModal(`
    <h3 style="margin-top:0;">🏁 Terminer « ${escapeHtml(book.title)} »</h3>
    <label>Note Globale (/5 — laisser vide si non noté)</label>
    <input type="number" step="0.25" min="0" max="5" id="m-fin-rating" value="${book.rating_global || ""}" placeholder="Ex: 4.5" />
    <label>Votre avis</label>
    <textarea id="m-fin-review" rows="3" placeholder="Critique ou ressenti final...">${escapeHtml(book.final_review || "")}</textarea>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
      <button class="btn btn-success" onclick="window.confirmFinishBook(${book.id}, ${book.page_count})">🎉 Valider</button>
      <button class="btn" onclick="window.closeModal()">Annuler</button>
    </div>
  `);
};

window.confirmFinishBook = async function (bookId, pageCount) {
  const rVal = document.getElementById("m-fin-rating").value;
  const review = document.getElementById("m-fin-review").value.trim();
  window.closeModal();
  await apiCall("update_book", {
    book_id: bookId,
    data: {
      status: "Terminé",
      current_page: pageCount,
      finished_at: new Date().toISOString().slice(0, 10),
      rating_global: rVal ? Number(rVal) : null,
      final_review: review || null
    }
  });
  await window.syncFromServer();
};

window.openBookDetailModal = function (bookId) {
  const book = state.books.find((b) => b.id === Number(bookId));
  if (!book) return;
  const bookNotes = state.notes.filter((n) => Number(n.book_id) === book.id);
  const statuses = ["En cours", "Bibliothèque", "Wishlist", "À acheter", "Terminé", "DNF"];

  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:start;">
      <h3 style="margin:0;">${escapeHtml(book.title)}</h3>
      <button class="btn" style="padding:4px 10px;" onclick="window.closeModal()">✕</button>
    </div>
    <div style="font-size:0.85rem;color:var(--muted);margin-bottom:10px;">${escapeHtml(book.author)}</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div>
        <label>Statut</label>
        <select id="m-ed-status">
          ${statuses.map((s) => `<option value="${s}" ${book.status === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
      <div>
        <label>Page actuelle / ${book.page_count}</label>
        <input type="number" id="m-ed-page" value="${book.current_page || 0}" max="${book.page_count}" />
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div>
        <label>Mois PAL (YYYY-MM)</label>
        <input type="month" id="m-ed-pal" value="${escapeHtml(book.pal_month || "")}" />
      </div>
      <div>
        <label>Note Globale (/5)</label>
        <input type="number" step="0.25" min="0" max="5" id="m-ed-rating" value="${book.rating_global ?? ""}" />
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
      <button class="btn btn-primary" onclick="window.saveBookEdits(${book.id})">💾 Enregistrer</button>
      <button class="btn btn-danger" onclick="window.removeBook(${book.id})">🗑️ Supprimer</button>
    </div>

    ${bookNotes.length > 0 ? `
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:10px;">
        <div style="font-weight:700;font-size:0.85rem;margin-bottom:6px;">📜 Notes & Citations (${bookNotes.length})</div>
        ${bookNotes.map((n) => `<div style="font-size:0.8rem;padding:6px 0;border-bottom:1px solid var(--border);"><b>${escapeHtml(n.note_type)}</b> ${n.page_number ? `(p.${n.page_number})` : ""} : ${escapeHtml(n.content)}</div>`).join("")}
      </div>
    ` : ""}
  `);
};

window.saveBookEdits = async function (bookId) {
  const status = document.getElementById("m-ed-status").value;
  const current_page = Number(document.getElementById("m-ed-page").value || 0);
  const pal_month = document.getElementById("m-ed-pal").value || null;
  const rVal = document.getElementById("m-ed-rating").value;
  window.closeModal();
  await apiCall("update_book", {
    book_id: bookId,
    data: {
      status,
      current_page,
      pal_month,
      rating_global: rVal !== "" ? Number(rVal) : null
    }
  });
  await window.syncFromServer();
};

window.removeBook = async function (bookId) {
  if (!confirm("Supprimer définitivement ce livre ?")) return;
  window.closeModal();
  await apiCall("delete_book", { book_id: bookId });
  await window.syncFromServer();
};

// Boot PWA
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
loadLocalCache();
renderCurrentTab();
window.syncFromServer(false);
