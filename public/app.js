/**
 * StaTome PWA — Local-First Engine (0.01s startup + Background Neon Sync)
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

const GENRE_TAXONOMY = {
  "Fantasy": [
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
    "Fantasy Classique"
  ],
  "Science-Fiction": [
    "Space Opera",
    "Dystopie / Post-Apocalyptique",
    "Cyberpunk / Solarpunk",
    "Hard SF",
    "Anticipation / Near-Future",
    "Uchronie / Voyage temporel",
    "Planet Opera",
    "First Contact / Aliens",
    "Science Fantasy",
    "SF Humoristique"
  ],
  "Thriller / Polar": [
    "Thriller Psychologique",
    "Polar / Enquête policière",
    "Cosy Mystery",
    "Roman Noir / Hardboiled",
    "Thriller Historique",
    "Espionnage / Géopolitique",
    "Thriller Scientifique / Médical",
    "True Crime"
  ],
  "Romance": [
    "Romance Contemporaine",
    "Rom-Com / Feel-Good",
    "Dark Romance",
    "New Adult / Campus",
    "Romance Historique",
    "Romantasy / Romantic Fantasy",
    "Romance Paranormale",
    "Slow Burn / Found Family"
  ],
  "Littérature & Contemporain": [
    "Roman Contemporain",
    "Classique",
    "Feel-Good / Tranche de vie",
    "Saga Familiale",
    "Drame / Émotion",
    "Littérature Étrangère",
    "Récit initiatique",
    "Poésie / Théâtre",
    "Nouvelles"
  ],
  "Historique": [
    "Roman Historique",
    "Biographie Historique",
    "Antiquité / Moyen Âge",
    "XVIIe - XIXe siècle",
    "XXe siècle / Guerres mondiales",
    "Saga Historique",
    "Fantasy Historique"
  ],
  "Horreur & Fantastique": [
    "Horreur / Épouvante",
    "Gothique",
    "Fantastique",
    "Paranormal / Occulte",
    "Folk Horror",
    "Cosmic Horror / Lovecraftien",
    "Survival / Thriller Horrifique"
  ],
  "Manga, BD & Graphique": [
    "Manga (Shōnen)",
    "Manga (Seinen)",
    "Manga (Shōjo / Josei)",
    "Bande Dessinée Franco-Belge",
    "Roman Graphique",
    "Webtoon",
    "Comics"
  ],
  "Non-Fiction & Essais": [
    "Histoire & Civilisations",
    "Développement Personnel",
    "Sciences & Nature",
    "Philosophie & Psychologie",
    "Société & Politique",
    "Biographie / Mémoires",
    "Art, Culture & Pop-Culture",
    "Économie & Business"
  ]
};

const MAIN_GENRES = Object.keys(GENRE_TAXONOMY);
const ALL_SUBGENRES = Array.from(new Set(Object.values(GENRE_TAXONOMY).flat()));
const FANTASY_SUBGENRES = ALL_SUBGENRES;

function getSubgenresForGenres(genresInput, currentSubgenres = []) {
  const rawList = Array.isArray(genresInput)
    ? genresInput
    : String(genresInput || "").split(",").map((s) => s.trim()).filter(Boolean);
  const pool = new Set();
  for (const g of rawList) {
    const gLow = g.toLowerCase();
    for (const [mainG, subs] of Object.entries(GENRE_TAXONOMY)) {
      if (mainG.toLowerCase().includes(gLow) || gLow.includes(mainG.toLowerCase().split(" ")[0])) {
        subs.forEach((s) => pool.add(s));
      }
    }
  }
  if (pool.size === 0) {
    GENRE_TAXONOMY["Fantasy"].forEach((s) => pool.add(s));
    GENRE_TAXONOMY["Littérature & Contemporain"].forEach((s) => pool.add(s));
    GENRE_TAXONOMY["Thriller / Polar"].forEach((s) => pool.add(s));
    GENRE_TAXONOMY["Romance"].forEach((s) => pool.add(s));
    GENRE_TAXONOMY["Science-Fiction"].forEach((s) => pool.add(s));
  }
  (currentSubgenres || []).forEach((s) => {
    if (s) pool.add(s);
  });
  return Array.from(pool);
}

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
  cameraZoom: 1,
  cameraTorch: false,
  cameraHasTorch: false,
  rearCameras: [],
  rearCameraIdx: 0,
  cameraError: null, // { title, hint, tech }
  cameraSlowHint: false,
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
    audio_duration_hours: "",
    audio_duration_mins: "",
    genres: "Fantasy",
    tags: "",
    fantasy_subgenres: [],
    popularity_score: "",
    cover_url: "",
    status: "Bibliothèque",
    pal_month_name: "Aucun",
    pal_year_val: String(new Date().getFullYear())
  },
  quickFormatChoice: null,
  extSearchQuery: "",
  autocompleteResults: [],
  valInputMode: "default", // "default" | "pct"
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
  // Goals
  goals: {
    annual_books: 24,
    daily_minutes: 30
  },
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
function createDefaultGoalsConfig(annualBooks = 24, dailyMinutes = 30) {
  return {
    streak_mode: "daily", // "daily" | "weekly"
    weekly_days_target: 4,
    items: [
      { id: "g_year_books", enabled: true, pinned: true, metric: "books", period: "year", target: Number(annualBooks || 24), label: "Livres cette année" },
      { id: "g_daily_min", enabled: true, pinned: true, metric: "minutes", period: "day", target: Number(dailyMinutes || 30), label: "Lecture quotidienne" },
      { id: "g_year_pages", enabled: false, pinned: false, metric: "pages", period: "year", target: 10000, label: "Pages cette année" },
      { id: "g_week_hours", enabled: false, pinned: false, metric: "hours", period: "week", target: 4, label: "Heures cette semaine" }
    ],
    challenges: [
      { id: "ch_countries", enabled: true, type: "countries", target: 5, label: "🌍 Tour du monde (pays d'auteurs)" },
      { id: "ch_genres", enabled: true, type: "genres", target: 4, label: "🎨 Explorateur (genres différents)" },
      { id: "ch_subgenres", enabled: false, type: "subgenres", target: 6, label: "✨ Curieux (sous-genres)" },
      { id: "ch_pal", enabled: false, type: "pal_finished", target: 12, label: "📚 Défi PAL (livres PAL terminés)" }
    ]
  };
}

function normalizeGoalsConfig(rawGoals) {
  const annual = Number((rawGoals && rawGoals.annual_books) || 24);
  const daily = Number((rawGoals && rawGoals.daily_minutes) || 30);
  const base = createDefaultGoalsConfig(annual, daily);
  const cfg = rawGoals && rawGoals.config && typeof rawGoals.config === "object" ? rawGoals.config : null;
  if (!cfg) return base;
  return {
    streak_mode: cfg.streak_mode === "weekly" ? "weekly" : "daily",
    weekly_days_target: Math.max(1, Math.min(7, Number(cfg.weekly_days_target || 4))),
    items: Array.isArray(cfg.items) && cfg.items.length > 0 ? cfg.items : base.items,
    challenges: Array.isArray(cfg.challenges) && cfg.challenges.length > 0 ? cfg.challenges : base.challenges
  };
}

function loadLocalCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.books = parsed.books || [];
      state.sessions = parsed.sessions || [];
      state.notes = parsed.notes || [];
      if (parsed.goals) {
        state.goals = {
          annual_books: Number(parsed.goals.annual_books || 24),
          daily_minutes: Number(parsed.goals.daily_minutes || 30),
          config: normalizeGoalsConfig(parsed.goals)
        };
      }
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
        goals: state.goals,
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
    if (data.goals) {
      state.goals = {
        annual_books: Number(data.goals.annual_books || 24),
        daily_minutes: Number(data.goals.daily_minutes || 30),
        config: normalizeGoalsConfig(data.goals)
      };
    }
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
  const audioBookIds = new Set(
    state.books.filter((b) => b.format === "Audio").map((b) => Number(b.id))
  );
  const visualSessions = state.sessions.filter((s) => !audioBookIds.has(Number(s.book_id)));
  const focusAll = visualSessions.filter((s) => s.is_focused !== false);
  const chillAll = visualSessions.filter((s) => s.is_focused === false);

  const calc = (arr) => {
    const mins = arr.reduce((acc, s) => acc + Number(s.duration_minutes || 0), 0);
    const pages = arr.reduce((acc, s) => acc + Number(s.pages_read || 0), 0);
    return mins > 0 && pages > 0 ? (pages / mins) * 60 : 0;
  };

  const globalFocusSpeed = calc(focusAll);
  const globalChillSpeed = calc(chillAll);

  let bookFocusSpeed = 0;
  if (bookId && !audioBookIds.has(Number(bookId))) {
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

function formatAudioHM(totalMinutes) {
  const m = Math.max(0, Math.round(Number(totalMinutes || 0)));
  if (m <= 0) return "0 min";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h <= 0) return `${rem} min`;
  return `${h}h ${String(rem).padStart(2, "0")}`;
}

function formatHoursMinutes(hours) {
  if (!hours || hours <= 0) return "~0 min";
  const hInt = Math.floor(hours);
  const mInt = Math.round((hours - hInt) * 60);
  if (mInt === 60) return `~${hInt + 1}h 00`;
  return hInt > 0 ? `~${hInt}h ${String(mInt).padStart(2, "0")}` : `~${Math.max(1, mInt)} min`;
}

function localDateKey(dInput) {
  const d = dInput instanceof Date ? dInput : new Date(dInput);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getGoalsConfig() {
  if (!state.goals || !state.goals.config) {
    state.goals = {
      annual_books: Number((state.goals && state.goals.annual_books) || 24),
      daily_minutes: Number((state.goals && state.goals.daily_minutes) || 30),
      config: createDefaultGoalsConfig(
        Number((state.goals && state.goals.annual_books) || 24),
        Number((state.goals && state.goals.daily_minutes) || 30)
      )
    };
  }
  return state.goals.config;
}

function getMondayOfDate(d) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (copy.getDay() + 6) % 7; // 0 = Lundi
  copy.setDate(copy.getDate() - day);
  return copy;
}

function computeReadingStreakAndGoals() {
  const cfg = getGoalsConfig();
  const activeDaySet = new Set();
  const today = new Date();
  const todayKey = localDateKey(today);
  const currentYear = today.getFullYear();

  for (const s of state.sessions) {
    const mins = Number(s.duration_minutes || 0);
    const pages = Number(s.pages_read || 0);
    if (mins <= 0 && pages <= 0) continue;
    const dk = localDateKey(s.start_time);
    if (dk) activeDaySet.add(dk);
  }

  const readToday = activeDaySet.has(todayKey);

  // 1. Streak Quotidien (jours consécutifs)
  let currentStreak = 0;
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!readToday) cursor.setDate(cursor.getDate() - 1);
  while (activeDaySet.has(localDateKey(cursor))) {
    currentStreak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  let bestStreak = currentStreak;
  const sortedDays = Array.from(activeDaySet).sort();
  let run = 0;
  let prevDate = null;
  for (const dk of sortedDays) {
    const [y, m, day] = dk.split("-").map(Number);
    const curDate = new Date(y, m - 1, day);
    if (prevDate) {
      const diffDays = Math.round((curDate - prevDate) / 86400000);
      run = diffDays === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    if (run > bestStreak) bestStreak = run;
    prevDate = curDate;
  }

  // 2. Streak Hebdomadaire bienveillant (semaines consécutives avec >= N jours lus)
  const weekCounts = {};
  for (const dk of activeDaySet) {
    const [y, m, day] = dk.split("-").map(Number);
    const mon = getMondayOfDate(new Date(y, m - 1, day));
    const wkKey = localDateKey(mon);
    weekCounts[wkKey] = (weekCounts[wkKey] || 0) + 1;
  }
  const thisMon = getMondayOfDate(today);
  const thisWeekKey = localDateKey(thisMon);
  const thisWeekDays = weekCounts[thisWeekKey] || 0;
  const weeklyTarget = Math.max(1, Math.min(7, Number(cfg.weekly_days_target || 4)));

  let weeklyStreak = 0;
  const wCursor = new Date(thisMon.getTime());
  if (thisWeekDays >= weeklyTarget) {
    weeklyStreak = 1;
  }
  wCursor.setDate(wCursor.getDate() - 7);
  while ((weekCounts[localDateKey(wCursor)] || 0) >= weeklyTarget) {
    weeklyStreak++;
    wCursor.setDate(wCursor.getDate() - 7);
  }

  let bestWeeklyStreak = weeklyStreak;
  const sortedWeeks = Object.keys(weekCounts).sort();
  let wRun = 0;
  let prevMon = null;
  for (const wk of sortedWeeks) {
    if ((weekCounts[wk] || 0) < weeklyTarget) {
      wRun = 0;
      prevMon = null;
      continue;
    }
    const [y, m, day] = wk.split("-").map(Number);
    const monDt = new Date(y, m - 1, day);
    if (prevMon && Math.round((monDt - prevMon) / 86400000) === 7) {
      wRun++;
    } else {
      wRun = 1;
    }
    if (wRun > bestWeeklyStreak) bestWeeklyStreak = wRun;
    prevMon = monDt;
  }

  return {
    streakMode: cfg.streak_mode || "daily",
    currentStreak,
    bestStreak,
    readToday,
    weeklyTarget,
    thisWeekDays,
    weeklyStreak,
    bestWeeklyStreak,
    currentYear,
    config: cfg
  };
}

function evaluateGoalItem(item) {
  const today = new Date();
  const todayKey = localDateKey(today);
  const curYear = today.getFullYear();
  const curMonthPrefix = todayKey.slice(0, 7);
  const thisMon = getMondayOfDate(today);
  const thisSun = new Date(thisMon.getFullYear(), thisMon.getMonth(), thisMon.getDate() + 6, 23, 59, 59);

  const inPeriod = (dateStrOrIso) => {
    if (!dateStrOrIso) return false;
    const dk = localDateKey(dateStrOrIso);
    if (!dk) return false;
    if (item.period === "day") return dk === todayKey;
    if (item.period === "month") return dk.startsWith(curMonthPrefix);
    if (item.period === "year") return dk.startsWith(String(curYear));
    if (item.period === "week") {
      const [y, m, d] = dk.split("-").map(Number);
      const dt = new Date(y, m - 1, d, 12, 0, 0);
      return dt >= thisMon && dt <= thisSun;
    }
    return false;
  };

  let current = 0;
  if (item.metric === "books") {
    current = state.books.filter((b) => b.status === "Terminé" && inPeriod(b.finished_at)).length;
  } else {
    for (const s of state.sessions) {
      if (!inPeriod(s.start_time)) continue;
      if (item.metric === "pages") current += Number(s.pages_read || 0);
      if (item.metric === "minutes") current += Number(s.duration_minutes || 0);
      if (item.metric === "hours") current += Number(s.duration_minutes || 0) / 60;
    }
  }

  const target = Math.max(1, Number(item.target || 1));
  const displayCur = item.metric === "hours" ? Math.round(current * 10) / 10 : Math.round(current);
  const pct = Math.min(100, Math.round((current / target) * 100));

  const unitLabelMap = { books: "livres", pages: "p.", minutes: "min", hours: "h" };
  const periodLabelMap = { day: "aujourd'hui", week: "cette sem.", month: "ce mois", year: String(curYear) };
  const unit = unitLabelMap[item.metric] || "";
  const periodLbl = periodLabelMap[item.period] || "";

  // Pace Tracker (avance / retard) sur semaine, mois et année
  let paceText = "";
  let paceColor = "var(--muted)";
  if (current >= target) {
    paceText = "🏆 Objectif atteint !";
    paceColor = "#34D399";
  } else if (item.period !== "day") {
    let dayIndex = 1;
    let totalDays = 1;
    if (item.period === "week") {
      dayIndex = ((today.getDay() + 6) % 7) + 1;
      totalDays = 7;
    } else if (item.period === "month") {
      dayIndex = today.getDate();
      totalDays = new Date(curYear, today.getMonth() + 1, 0).getDate();
    } else if (item.period === "year") {
      const startY = new Date(curYear, 0, 1);
      dayIndex = Math.floor((today - startY) / 86400000) + 1;
      totalDays = (curYear % 4 === 0 && (curYear % 100 !== 0 || curYear % 400 === 0)) ? 366 : 365;
    }
    const expected = (target * dayIndex) / totalDays;
    const delta = current - expected;
    const daysLeft = Math.max(1, totalDays - dayIndex + 1);
    const neededPerDay = (target - current) / daysLeft;

    const fmtDelta = item.metric === "hours" ? Math.abs(delta).toFixed(1) : Math.round(Math.abs(delta));
    if (delta >= Math.max(0.5, target * 0.03)) {
      paceText = `🟢 En avance (+${fmtDelta} ${unit})`;
      paceColor = "#34D399";
    } else if (delta <= -Math.max(0.5, target * 0.04)) {
      const needFmt = item.metric === "books"
        ? `${(neededPerDay * 30).toFixed(1)}/mois`
        : `${item.metric === "hours" ? (neededPerDay * 60).toFixed(0) + " min/j" : Math.ceil(neededPerDay) + " " + unit + "/j"}`;
      paceText = `🟡 Retard (-${fmtDelta} ${unit}) • ${needFmt}`;
      paceColor = "#FBBF24";
    } else {
      paceText = "🔵 Dans le rythme";
      paceColor = "#38BDF8";
    }
  }

  return {
    current: displayCur,
    target,
    pct,
    unit,
    periodLbl,
    paceText,
    paceColor
  };
}

function evaluateChallenge(ch) {
  const curYear = String(new Date().getFullYear());
  const yearBooks = state.books.filter((b) => {
    if (b.status === "Terminé" && b.finished_at && String(b.finished_at).startsWith(curYear)) return true;
    return false;
  });

  let current = 0;
  let details = [];
  if (ch.type === "countries") {
    const set = new Set(yearBooks.map((b) => (b.author_country || "").trim()).filter(Boolean));
    current = set.size;
    details = Array.from(set).slice(0, 5);
  } else if (ch.type === "genres") {
    const set = new Set();
    yearBooks.forEach((b) => (b.genres || []).forEach((g) => { if (g.trim()) set.add(g.trim()); }));
    current = set.size;
    details = Array.from(set).slice(0, 5);
  } else if (ch.type === "subgenres") {
    const set = new Set();
    yearBooks.forEach((b) => (b.fantasy_subgenres || []).forEach((s) => { if (s.trim()) set.add(s.trim()); }));
    current = set.size;
    details = Array.from(set).slice(0, 5);
  } else if (ch.type === "pal_finished") {
    current = yearBooks.filter((b) => Boolean(b.pal_month)).length;
  }

  const target = Math.max(1, Number(ch.target || 1));
  const pct = Math.min(100, Math.round((current / target) * 100));
  return { current, target, pct, details };
}

function computeCostPerHour(books, sessions) {
  const minsByBook = {};
  for (const s of sessions) {
    const bid = Number(s.book_id);
    minsByBook[bid] = (minsByBook[bid] || 0) + Number(s.duration_minutes || 0);
  }

  let totalCost = 0;
  let totalHours = 0;
  let trackedCount = 0;
  let bestDeal = null;

  for (const b of books) {
    const price = Number(b.price || 0);
    const mins = minsByBook[Number(b.id)] || 0;
    if (price > 0 && mins >= 5) {
      const hrs = mins / 60;
      const cph = price / hrs;
      totalCost += price;
      totalHours += hrs;
      trackedCount++;
      if (!bestDeal || cph < bestDeal.costPerHour) {
        bestDeal = { title: b.title, costPerHour: cph, hours: hrs, price };
      }
    }
  }

  return {
    avgCostPerHour: totalHours > 0 ? totalCost / totalHours : null,
    totalHours,
    trackedCount,
    bestDeal
  };
}

function renderStreakGoalsBannerHtml(expanded = false) {
  const sg = computeReadingStreakAndGoals();
  const cfg = sg.config;
  const enabledItems = (cfg.items || []).filter((it) => it.enabled);
  const shownItems = expanded
    ? enabledItems
    : (enabledItems.filter((it) => it.pinned).length > 0 ? enabledItems.filter((it) => it.pinned).slice(0, 2) : enabledItems.slice(0, 2));

  const isWeekly = sg.streakMode === "weekly";
  const streakTitle = isWeekly
    ? `🌿 ${sg.weeklyStreak} sem.`
    : `🔥 ${sg.currentStreak} j.`;
  const streakColor = (isWeekly ? sg.weeklyStreak : sg.currentStreak) > 0 ? (isWeekly ? "#34D399" : "#F59E0B") : "var(--muted)";
  const streakSub = isWeekly
    ? `Record : <b>${sg.bestWeeklyStreak} sem.</b> • Cette sem. : <b style="color:${sg.thisWeekDays >= sg.weeklyTarget ? "#34D399" : "#FBBF24"};">${sg.thisWeekDays}/${sg.weeklyTarget} j.</b>`
    : `Record : <b>${sg.bestStreak} j.</b> • ${sg.readToday ? '<span style="color:#34D399;">✅ Lu aujourd\'hui</span>' : '<span style="color:#FBBF24;">⏳ À lire aujourd\'hui</span>'}`;

  const goalsGridHtml = shownItems.length > 0
    ? `<div class="${shownItems.length === 1 ? "" : "grid-2"}" style="gap:10px;">
        ${shownItems.map((it) => {
          const ev = evaluateGoalItem(it);
          const barCol = ev.pct >= 100 ? "#10B981" : (it.metric === "books" ? "#8B5CF6" : (it.metric === "pages" ? "#38BDF8" : "var(--primary)"));
          return `
            <div style="background:rgba(15,23,42,0.45);padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
              <div style="display:flex;justify-content:space-between;font-size:0.73rem;color:var(--muted);margin-bottom:3px;gap:4px;">
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(it.label || `${ev.unit} (${ev.periodLbl})`)}</span>
                <span style="flex-shrink:0;"><b style="color:${ev.pct >= 100 ? "#34D399" : "var(--text)"};">${ev.current}</b> / ${ev.target} ${ev.unit}</span>
              </div>
              <div class="progress-track" style="height:5px;"><div class="progress-fill" style="width:${ev.pct}%;background:${barCol};"></div></div>
              ${ev.paceText ? `<div style="font-size:0.68rem;color:${ev.paceColor};margin-top:4px;font-weight:600;">${ev.paceText}</div>` : ""}
            </div>
          `;
        }).join("")}
      </div>`
    : `<div style="font-size:0.78rem;color:var(--muted);">Aucun objectif actif. Cliquez sur « 🎯 Objectifs & Défis » pour personnaliser.</div>`;

  let challengesHtml = "";
  if (expanded) {
    const activeCh = (cfg.challenges || []).filter((c) => c.enabled);
    if (activeCh.length > 0) {
      challengesHtml = `
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);">
          <div style="font-size:0.78rem;font-weight:700;color:var(--primary-light);margin-bottom:8px;">🏆 Défis thématiques ${sg.currentYear}</div>
          <div class="grid-2" style="gap:8px;">
            ${activeCh.map((ch) => {
              const ev = evaluateChallenge(ch);
              return `
                <div style="background:rgba(15,23,42,0.5);padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
                  <div style="display:flex;justify-content:space-between;font-size:0.73rem;margin-bottom:3px;">
                    <span>${escapeHtml(ch.label)}</span>
                    <b style="color:${ev.pct >= 100 ? "#34D399" : "var(--text)"};">${ev.current}/${ev.target}</b>
                  </div>
                  <div class="progress-track" style="height:4px;"><div class="progress-fill" style="width:${ev.pct}%;background:${ev.pct >= 100 ? "#10B981" : "#E879F9"};"></div></div>
                  ${ev.details.length > 0 ? `<div style="font-size:0.66rem;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(ev.details.join(" • "))}</div>` : ""}
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }
  }

  return `
    <div class="card" style="padding:12px 14px;margin-bottom:12px;border-color:rgba(99,102,241,0.35);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:1.1rem;font-weight:800;color:${streakColor};">${streakTitle}</span>
          <span style="font-size:0.74rem;color:var(--muted);">${streakSub}</span>
        </div>
        <button class="btn" style="padding:4px 9px;font-size:0.74rem;flex-shrink:0;" onclick="window.openGoalsModal('goals')">🎯 Objectifs & Défis</button>
      </div>
      ${goalsGridHtml}
      ${challengesHtml}
    </div>
  `;
}

let goalsModalTab = "goals";

window.openGoalsModal = function (tab = "goals") {
  goalsModalTab = tab;
  const cfg = getGoalsConfig();
  const isWeekly = cfg.streak_mode === "weekly";

  const metricOpts = [
    ["books", "📚 Livres"],
    ["pages", "📄 Pages"],
    ["minutes", "⏱️ Minutes"],
    ["hours", "⌛ Heures"]
  ];
  const periodOpts = [
    ["day", "Par jour"],
    ["week", "Par semaine"],
    ["month", "Par mois"],
    ["year", "Par an"]
  ];

  const goalsTabHtml = `
    <div style="background:rgba(15,23,42,0.55);padding:10px 12px;border-radius:10px;border:1px solid var(--border);margin-bottom:12px;">
      <div style="font-weight:700;font-size:0.84rem;margin-bottom:6px;">🔥 Mode de Série (Streak)</div>
      <div class="mode-toggle" style="margin-bottom:6px;">
        <button class="mode-btn ${!isWeekly ? "active-focus" : ""}" onclick="window.setGoalsStreakMode('daily')">🔥 Quotidien (chaque jour)</button>
        <button class="mode-btn ${isWeekly ? "active-focus" : ""}" onclick="window.setGoalsStreakMode('weekly')">🌿 Hebdo bienveillant</button>
      </div>
      ${isWeekly ? `
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:0.8rem;color:var(--muted);">
          <span>Jours lus par semaine pour valider la série :</span>
          <input type="number" id="goal-weekly-days" min="1" max="7" value="${cfg.weekly_days_target || 4}" style="width:64px;padding:5px 8px;" onchange="window.updateWeeklyDaysTarget(this.value)" />
        </div>
      ` : `<div style="font-size:0.75rem;color:var(--muted);">Compte vos jours consécutifs de lecture (tolère jusqu'à minuit avant de casser la série).</div>`}
    </div>

    <div style="font-weight:700;font-size:0.85rem;margin-bottom:6px;">🎯 Vos objectifs personnalisés <span style="font-weight:400;color:var(--muted);font-size:0.75rem;">(📌 = affiché sur l'écran Lecture)</span></div>
    <div style="display:grid;gap:8px;margin-bottom:12px;">
      ${cfg.items.map((it, idx) => {
        const ev = evaluateGoalItem(it);
        return `
          <div style="background:rgba(30,41,59,0.65);padding:9px 10px;border-radius:9px;border:1px solid ${it.enabled ? "rgba(99,102,241,0.45)" : "var(--border)"};">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
              <label style="display:flex;align-items:center;gap:6px;margin:0;cursor:pointer;color:var(--text);font-size:0.83rem;">
                <input type="checkbox" ${it.enabled ? "checked" : ""} onchange="window.toggleGoalItem(${idx}, 'enabled', this.checked)" />
                <b>${escapeHtml(it.label)}</b>
              </label>
              <div style="display:flex;align-items:center;gap:5px;">
                <button class="btn ${it.pinned ? "btn-primary" : ""}" style="padding:3px 7px;font-size:0.72rem;" title="Épingler sur l'écran Lecture" onclick="window.toggleGoalItem(${idx}, 'pinned', ${!it.pinned})">📌</button>
                ${cfg.items.length > 1 ? `<button class="btn btn-danger" style="padding:3px 7px;font-size:0.72rem;" onclick="window.deleteGoalItem(${idx})">🗑️</button>` : ""}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:7px;">
              <input type="number" min="1" max="100000" value="${it.target}" style="width:90px;padding:5px 8px;font-size:0.82rem;" onchange="window.updateGoalItemTarget(${idx}, this.value)" />
              <span style="font-size:0.78rem;color:var(--muted);">${ev.unit} (${ev.periodLbl}) • Actuel : <b style="color:var(--text);">${ev.current}</b></span>
            </div>
            ${ev.paceText ? `<div style="font-size:0.72rem;color:${ev.paceColor};margin-top:4px;">${ev.paceText}</div>` : ""}
          </div>
        `;
      }).join("")}
    </div>

    <div style="background:rgba(15,23,42,0.55);padding:10px 12px;border-radius:10px;border:1px dashed var(--primary-light);">
      <div style="font-weight:700;font-size:0.82rem;color:var(--primary-light);margin-bottom:6px;">➕ Créer un nouvel objectif</div>
      <div class="grid-3" style="gap:6px;">
        <select id="new-goal-metric" style="padding:6px;font-size:0.8rem;">
          ${metricOpts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
        </select>
        <select id="new-goal-period" style="padding:6px;font-size:0.8rem;">
          ${periodOpts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
        </select>
        <input type="number" id="new-goal-target" min="1" value="150" placeholder="Cible" style="padding:6px;font-size:0.8rem;" />
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px;padding:8px;font-size:0.82rem;" onclick="window.addCustomGoalItem()">
        ➕ Ajouter cet objectif
      </button>
    </div>
  `;

  const challengesTabHtml = `
    <div style="font-size:0.8rem;color:var(--muted);margin-bottom:10px;">
      Activez les défis thématiques qui vous inspirent : ils se mettent à jour automatiquement selon vos lectures terminées de l'année !
    </div>
    <div style="display:grid;gap:8px;">
      ${(cfg.challenges || []).map((ch, idx) => {
        const ev = evaluateChallenge(ch);
        return `
          <div style="background:rgba(30,41,59,0.65);padding:10px;border-radius:9px;border:1px solid ${ch.enabled ? "rgba(232,121,249,0.45)" : "var(--border)"};">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
              <label style="display:flex;align-items:center;gap:6px;margin:0;cursor:pointer;color:var(--text);font-size:0.83rem;">
                <input type="checkbox" ${ch.enabled ? "checked" : ""} onchange="window.toggleChallengeItem(${idx}, this.checked)" />
                <b>${escapeHtml(ch.label)}</b>
              </label>
              <span style="font-size:0.78rem;font-weight:700;color:${ev.pct >= 100 ? "#34D399" : "#E879F9"};">${ev.current} / ${ev.target}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:7px;">
              <span style="font-size:0.76rem;color:var(--muted);">Objectif :</span>
              <input type="number" min="1" max="200" value="${ch.target}" style="width:76px;padding:5px 8px;font-size:0.82rem;" onchange="window.updateChallengeTarget(${idx}, this.value)" />
            </div>
            <div class="progress-track" style="height:5px;margin-top:7px;"><div class="progress-fill" style="width:${ev.pct}%;background:${ev.pct >= 100 ? "#10B981" : "#E879F9"};"></div></div>
            ${ev.details.length > 0 ? `<div style="font-size:0.7rem;color:var(--muted);margin-top:4px;">Déjà validé : ${escapeHtml(ev.details.join(" • "))}</div>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;

  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h3 style="margin:0;">🎯 Objectifs & Défis</h3>
      <button class="btn" style="padding:4px 10px;" onclick="window.closeModal()">✕</button>
    </div>
    <div class="mode-toggle" style="margin:10px 0 12px;">
      <button class="mode-btn ${goalsModalTab === "goals" ? "active-focus" : ""}" onclick="window.openGoalsModal('goals')">🎯 Objectifs & Streak</button>
      <button class="mode-btn ${goalsModalTab === "challenges" ? "active-focus" : ""}" onclick="window.openGoalsModal('challenges')">🏆 Défis (${(cfg.challenges || []).filter((c) => c.enabled).length})</button>
    </div>
    ${goalsModalTab === "goals" ? goalsTabHtml : challengesTabHtml}
    <button class="btn btn-success" style="width:100%;margin-top:14px;padding:12px;" onclick="window.saveGoalsConfigToServer(true)">
      💾 Enregistrer & Fermer
    </button>
  `);
};

window.setGoalsStreakMode = function (mode) {
  const cfg = getGoalsConfig();
  cfg.streak_mode = mode === "weekly" ? "weekly" : "daily";
  window.saveGoalsConfigToServer(false);
  window.openGoalsModal("goals");
};

window.updateWeeklyDaysTarget = function (val) {
  const cfg = getGoalsConfig();
  cfg.weekly_days_target = Math.max(1, Math.min(7, Number(val || 4)));
  window.saveGoalsConfigToServer(false);
};

window.toggleGoalItem = function (idx, field, val) {
  const cfg = getGoalsConfig();
  if (cfg.items[idx]) cfg.items[idx][field] = Boolean(val);
  window.saveGoalsConfigToServer(false);
  window.openGoalsModal("goals");
};

window.updateGoalItemTarget = function (idx, val) {
  const cfg = getGoalsConfig();
  if (cfg.items[idx]) cfg.items[idx].target = Math.max(1, Number(val || 1));
  window.saveGoalsConfigToServer(false);
};

window.deleteGoalItem = function (idx) {
  const cfg = getGoalsConfig();
  cfg.items.splice(idx, 1);
  window.saveGoalsConfigToServer(false);
  window.openGoalsModal("goals");
};

window.addCustomGoalItem = function () {
  const cfg = getGoalsConfig();
  const metric = document.getElementById("new-goal-metric").value;
  const period = document.getElementById("new-goal-period").value;
  const target = Math.max(1, Number(document.getElementById("new-goal-target").value || 10));
  const mNames = { books: "Livres", pages: "Pages", minutes: "Minutes", hours: "Heures" };
  const pNames = { day: "par jour", week: "par semaine", month: "par mois", year: "cette année" };
  cfg.items.push({
    id: `g_custom_${Date.now()}`,
    enabled: true,
    pinned: cfg.items.filter((x) => x.pinned).length < 2,
    metric,
    period,
    target,
    label: `${mNames[metric] || metric} ${pNames[period] || ""}`.trim()
  });
  window.saveGoalsConfigToServer(false);
  window.openGoalsModal("goals");
};

window.toggleChallengeItem = function (idx, checked) {
  const cfg = getGoalsConfig();
  if (cfg.challenges[idx]) cfg.challenges[idx].enabled = Boolean(checked);
  window.saveGoalsConfigToServer(false);
  window.openGoalsModal("challenges");
};

window.updateChallengeTarget = function (idx, val) {
  const cfg = getGoalsConfig();
  if (cfg.challenges[idx]) cfg.challenges[idx].target = Math.max(1, Number(val || 1));
  window.saveGoalsConfigToServer(false);
};

window.saveGoalsConfigToServer = async function (closeAfter = false) {
  const cfg = getGoalsConfig();
  const yearBooksItem = cfg.items.find((x) => x.metric === "books" && x.period === "year");
  const dailyMinItem = cfg.items.find((x) => x.metric === "minutes" && x.period === "day");
  state.goals.annual_books = yearBooksItem ? Number(yearBooksItem.target) : 24;
  state.goals.daily_minutes = dailyMinItem ? Number(dailyMinItem.target) : 30;
  state.goals.config = cfg;
  saveLocalCache();
  if (closeAfter) window.closeModal();
  renderCurrentTab();
  try {
    await apiCall("save_goals", {
      annual_books: state.goals.annual_books,
      daily_minutes: state.goals.daily_minutes,
      config: cfg
    });
  } catch (e) {
    console.warn("save_goals warning:", e);
  }
};

window.openTargetDateModal = function (bookId) {
  const book = state.books.find((b) => b.id === Number(bookId));
  if (!book) return;
  const curVal = book.target_finish_date || "";
  const minDate = localDateKey(new Date());
  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h3 style="margin:0;">🎯 Date cible de fin</h3>
      <button class="btn" style="padding:4px 10px;" onclick="window.closeModal()">✕</button>
    </div>
    <div style="font-size:0.82rem;color:var(--muted);margin:8px 0 12px;">
      Idéal pour un club de lecture ou une lecture commune : StaTome calcule automatiquement combien de pages lire par jour pour finir <b>${escapeHtml(book.title)}</b> à temps !
    </div>
    <label>Date souhaitée pour terminer ce livre</label>
    <input type="date" id="book-target-date-input" min="${minDate}" value="${escapeHtml(curVal)}" />
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;">
      <button class="btn btn-primary" onclick="window.saveBookTargetDate(${book.id}, false)">💾 Enregistrer</button>
      <button class="btn btn-danger" onclick="window.saveBookTargetDate(${book.id}, true)">🗑️ Effacer</button>
    </div>
  `);
};

window.saveBookTargetDate = async function (bookId, clearDate = false) {
  const val = clearDate ? "" : (document.getElementById("book-target-date-input").value || "");
  const book = state.books.find((b) => b.id === Number(bookId));
  if (book) book.target_finish_date = val;
  saveLocalCache();
  window.closeModal();
  renderCurrentTab();
  try {
    await apiCall("update_book", { book_id: bookId, data: { target_finish_date: val || null } });
  } catch (e) {
    alert("Erreur lors de la sauvegarde : " + e.message);
  }
};

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
      ${renderStreakGoalsBannerHtml()}
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
  const isAudio = book.format === "Audio";
  const isEbook = book.format === "Numérique";
  const audioTotal = Number(book.audio_duration_minutes || 0);
  const audioCur = Number(book.audio_current_minutes || 0);
  const useAudioTracking = isAudio && audioTotal > 0;

  const pct = useAudioTracking
    ? Math.min(100, Math.round((audioCur / audioTotal) * 1000) / 10)
    : Math.min(100, Math.round((curP / totP) * 1000) / 10);
  const pagesLeft = Math.max(0, totP - curP);
  const audioMinsLeft = Math.max(0, audioTotal - audioCur);

  const { refFocusSpeed, globalChillSpeed } = computeSpeeds(book.id);
  const hoursLeftFocus = refFocusSpeed > 0 ? pagesLeft / refFocusSpeed : 0;
  const estFocusStr = formatHoursMinutes(hoursLeftFocus);
  const chillEstPart = globalChillSpeed > 0
    ? ` • 🛋️ <b>${formatHoursMinutes(pagesLeft / globalChillSpeed)}</b> (${Math.round(globalChillSpeed)} p/h)`
    : "";

  let targetDateHtml = `
    <div style="margin-top:7px;">
      <button class="btn" style="padding:4px 9px;font-size:0.73rem;color:var(--primary-light);border-style:dashed;" onclick="window.openTargetDateModal(${book.id})">
        🎯 Fixer une date cible (club de lecture / défi)
      </button>
    </div>
  `;
  const hasRemaining = useAudioTracking ? audioMinsLeft > 0 : pagesLeft > 0;
  if (book.target_finish_date && hasRemaining) {
    const todayMid = new Date();
    todayMid.setHours(0, 0, 0, 0);
    const [ty, tm, td] = book.target_finish_date.split("-").map(Number);
    const targetDt = new Date(ty, tm - 1, td);
    const daysLeft = Math.max(1, Math.ceil((targetDt - todayMid) / 86400000) + 1);
    const dateFr = `${td} ${FRENCH_MONTHS[tm - 1].slice(0, 4)}.`;
    const isOverdue = targetDt < todayMid;
    const paceStr = useAudioTracking
      ? `<b>${Math.ceil(audioMinsLeft / daysLeft)} min/jour</b> d'écoute`
      : `<b>${Math.ceil(pagesLeft / daysLeft)} p./jour</b> (~${Math.max(1, Math.round((Math.ceil(pagesLeft / daysLeft) / refFocusSpeed) * 60))} min/j)`;
    targetDateHtml = `
      <div onclick="window.openTargetDateModal(${book.id})" style="cursor:pointer;margin-top:8px;padding:6px 9px;border-radius:8px;background:${isOverdue ? "rgba(239,68,68,0.14)" : "rgba(99,102,241,0.14)"};border:1px solid ${isOverdue ? "rgba(239,68,68,0.4)" : "rgba(99,102,241,0.38)"};font-size:0.75rem;color:${isOverdue ? "#fca5a5" : "#c7d2fe"};display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <span>${isOverdue ? "⚠️ Date cible dépassée" : `🎯 Finir avant le <b>${dateFr}</b> (${daysLeft} j.) : ${paceStr}`}</span>
        <span>✏️</span>
      </div>
    `;
  }

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

  // Rappel discret des notes/personnages des tomes précédents (uniquement si tome > 1 et notes existantes)
  let prevSagaNotesHtml = "";
  if (book.series_name && Number(book.series_volume || 0) > 1) {
    const prevBookIds = new Set(
      state.books
        .filter(
          (b) =>
            b.series_name &&
            b.series_name.toLowerCase() === book.series_name.toLowerCase() &&
            Number(b.series_volume || 0) > 0 &&
            Number(b.series_volume) < Number(book.series_volume)
        )
        .map((b) => b.id)
    );
    const prevNotesCount = state.notes.filter((n) => prevBookIds.has(Number(n.book_id))).length;
    if (prevNotesCount > 0) {
      prevSagaNotesHtml = `
        <div style="margin-top:6px;">
          <button class="btn" style="padding:4px 9px;font-size:0.73rem;color:#E879F9;border-color:rgba(232,121,249,0.4);" onclick="window.openSagaNotesModal('${escapeHtml(book.series_name).replace(/'/g, "\\'")}', ${Number(book.series_volume)})">
            🧠 Relire mes notes des tomes précédents (${prevNotesCount})
          </button>
        </div>
      `;
    }
  }

  const isFoc = state.timer.isFocused !== false;
  const curSec = getTimerSeconds();
  const isRunning = state.timer.isRunning;
  const timerColor = isRunning ? "#34D399" : (curSec > 0 ? "#F59E0B" : "#F8FAFC");
  const statusText = isRunning
    ? (isFoc ? "🟢 En direct • 🎯 Mode Focus" : "🟢 En direct • 🛋️ Mode Détente")
    : (curSec > 0 ? "🟡 En pause — Prêt à reprendre ou enregistrer" : "⚪ Prêt à démarrer");

  let validationHtml = "";
  if (!isRunning && curSec > 0) {
    const showPctToggle = useAudioTracking || isEbook || isAudio;
    const isPctMode = showPctToggle && state.valInputMode === "pct";
    const sugAudioMin = useAudioTracking ? Math.min(audioTotal, Math.round(audioCur + curSec / 60)) : 0;
    const sugPage = Math.min(totP, curP + Math.max(1, Math.round((curSec / 3600) * refFocusSpeed)));
    const sugPct = useAudioTracking
      ? Math.min(100, Math.round((sugAudioMin / audioTotal) * 100))
      : Math.min(100, Math.round((sugPage / totP) * 100));

    let inputBlockHtml = "";
    if (isPctMode) {
      const previewTxt = useAudioTracking
        ? `= ${formatAudioHM(Math.round((sugPct / 100) * audioTotal))} / ${formatAudioHM(audioTotal)}`
        : `= p. ${Math.round((sugPct / 100) * totP)} / ${totP}`;
      inputBlockHtml = `
        <label>Progression atteinte (%) :</label>
        <div style="display:flex;align-items:center;gap:10px;">
          <input type="number" id="val-new-pct" min="0" max="100" value="${sugPct}" oninput="window.updateValPctPreview(${book.id})" style="max-width:120px;" />
          <span id="val-pct-preview" style="font-size:0.84rem;color:var(--primary-light);font-weight:700;">${previewTxt}</span>
        </div>
      `;
    } else if (useAudioTracking) {
      inputBlockHtml = `
        <label>Position atteinte dans le livre audio :</label>
        <div class="grid-2">
          <div>
            <label style="font-size:0.74rem;">Heures</label>
            <input type="number" id="val-audio-h" min="0" value="${Math.floor(sugAudioMin / 60)}" />
          </div>
          <div>
            <label style="font-size:0.74rem;">Minutes</label>
            <input type="number" id="val-audio-m" min="0" max="59" value="${sugAudioMin % 60}" />
          </div>
        </div>
      `;
    } else {
      inputBlockHtml = `
        <label>Nouvelle page atteinte :</label>
        <input type="number" id="val-new-page" min="${curP}" max="${totP}" value="${sugPage}" />
      `;
    }

    const startBadge = useAudioTracking
      ? `Départ : <b>${formatAudioHM(audioCur)}</b>`
      : `Départ : <b>p. ${curP}</b>`;

    validationHtml = `
      <div class="card" style="border-color: var(--primary);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
          <div style="font-weight:700; font-size:0.98rem;">📝 Enregistrer votre session</div>
          ${showPctToggle ? `
            <div style="display:flex;gap:4px;">
              <button class="pill ${!isPctMode ? "active" : ""}" style="padding:3px 9px;font-size:0.74rem;" onclick="window.setValInputMode('default')">${useAudioTracking ? "🎧 h / min" : "📖 Pages"}</button>
              <button class="pill ${isPctMode ? "active" : ""}" style="padding:3px 9px;font-size:0.74rem;" onclick="window.setValInputMode('pct')">📊 %</button>
            </div>
          ` : ""}
        </div>
        <div style="font-size:0.83rem; color:var(--muted); margin-bottom:10px;">
          Durée : <b style="color:var(--text);">${formatHMS(curSec)}</b> (${Math.max(0.1, Math.round((curSec / 60) * 10) / 10)} min) •
          ${isAudio ? "<b>🎧 Audio</b>" : `Mode : <b>${isFoc ? "🎯 Focus" : "🛋️ Détente"}</b>`} • ${startBadge}
        </div>
        ${inputBlockHtml}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px;">
          <button class="btn btn-success" onclick="window.confirmTimerSession(${book.id}, ${curP})">✅ Enregistrer</button>
          <button class="btn btn-danger" onclick="window.resetTimer()">🗑️ Effacer (00:00)</button>
        </div>
      </div>
    `;
  }

  const bookSessions = state.sessions.filter((s) => Number(s.book_id) === book.id);
  const bookNotes = state.notes.filter((n) => Number(n.book_id) === book.id);

  const progressRowLeft = useAudioTracking
    ? `<span>🎧 <b>${formatAudioHM(audioCur)}</b> / ${formatAudioHM(audioTotal)}</span>`
    : `<span>${isEbook ? "📱 " : (isAudio ? "🎧 " : "")}<b>${curP}</b> / ${totP} p.</span>`;

  const timeEstHtml = useAudioTracking
    ? `⏳ <b>${formatAudioHM(audioMinsLeft)}</b> d'écoute restantes`
    : (isAudio
      ? `🎧 Livre audio • Ajoutez la durée totale dans <b>⚙️ Fiche</b> pour le suivi en heures`
      : `⏳ <b>${pagesLeft} p.</b> restantes • 🎯 <b>${estFocusStr}</b> (${Math.round(refFocusSpeed)} p/h)${chillEstPart}`);

  el.innerHTML = `
    ${renderStreakGoalsBannerHtml()}
    ${selectorHtml}
    <div class="card">
      <div class="book-hero">
        ${coverHtml}
        <div class="book-meta">
          <div class="book-title">${escapeHtml(book.title)}</div>
          <div class="book-author">${escapeHtml(book.author)}</div>
          ${seriesHtml}
          <div class="progress-row">
            ${progressRowLeft}
            <span style="color:var(--primary-light); font-weight:700;">${pct}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="time-est">
            ${timeEstHtml}
          </div>
          ${targetDateHtml}
          ${prevSagaNotesHtml}
        </div>
      </div>
    </div>

    ${!isAudio ? `
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
    ` : `
      <div class="mode-hint" style="margin-bottom:10px;">
        🎧 Écoute audio : votre temps compte dans vos objectifs et votre calendrier sans fausser votre vitesse de lecture (pages/h).
      </div>
    `}

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

window.setValInputMode = function (mode) {
  state.valInputMode = mode === "pct" ? "pct" : "default";
  renderReadingView();
};

window.updateValPctPreview = function (bookId) {
  const book = state.books.find((b) => b.id === Number(bookId));
  const inp = document.getElementById("val-new-pct");
  const prev = document.getElementById("val-pct-preview");
  if (!book || !inp || !prev) return;
  const pct = Math.max(0, Math.min(100, Number(inp.value || 0)));
  const audioTotal = Number(book.audio_duration_minutes || 0);
  if (book.format === "Audio" && audioTotal > 0) {
    prev.textContent = `= ${formatAudioHM(Math.round((pct / 100) * audioTotal))} / ${formatAudioHM(audioTotal)}`;
  } else {
    const totP = Math.max(1, Number(book.page_count || 1));
    prev.textContent = `= p. ${Math.round((pct / 100) * totP)} / ${totP}`;
  }
};

window.confirmTimerSession = async function (bookId, startPage) {
  const book = state.books.find((b) => b.id === Number(bookId));
  const totP = Math.max(1, Number((book && book.page_count) || 1));
  const audioTotal = Number((book && book.audio_duration_minutes) || 0);
  const useAudioTracking = Boolean(book && book.format === "Audio" && audioTotal > 0);

  let endPage = startPage;
  let audioEndMinutes = null;

  const pctInput = document.getElementById("val-new-pct");
  const audioHInput = document.getElementById("val-audio-h");
  const audioMInput = document.getElementById("val-audio-m");
  const pageInput = document.getElementById("val-new-page");

  if (pctInput) {
    const pctVal = Math.max(0, Math.min(100, Number(pctInput.value || 0)));
    if (useAudioTracking) {
      audioEndMinutes = Math.min(audioTotal, Math.round((pctVal / 100) * audioTotal));
      endPage = Math.min(totP, Math.max(startPage, Math.round((pctVal / 100) * totP)));
    } else {
      endPage = Math.min(totP, Math.max(startPage, Math.round((pctVal / 100) * totP)));
    }
  } else if (useAudioTracking && audioHInput && audioMInput) {
    const h = Math.max(0, Number(audioHInput.value || 0));
    const m = Math.max(0, Number(audioMInput.value || 0));
    audioEndMinutes = Math.min(audioTotal, Math.round(h * 60 + m));
    endPage = Math.min(totP, Math.max(startPage, Math.round((audioEndMinutes / audioTotal) * totP)));
  } else {
    endPage = Number(pageInput ? pageInput.value : startPage);
  }

  const totalSec = getTimerSeconds();
  const durationMin = Math.max(0.5, Math.round((totalSec / 60) * 100) / 100);
  const isFocused = book && book.format === "Audio" ? false : (state.timer.isFocused !== false);

  if (book) {
    if (endPage > book.current_page) book.current_page = endPage;
    if (audioEndMinutes !== null && audioEndMinutes > Number(book.audio_current_minutes || 0)) {
      book.audio_current_minutes = audioEndMinutes;
    }
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

  state.timer = { bookId: null, isRunning: false, startTimeMs: null, accumulatedSec: 0, isFocused: state.timer.isFocused };
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
      is_focused: isFocused,
      audio_end_minutes: audioEndMinutes
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
function renderSagasResultsHtml(resultsEl) {
  const q = state.libSearch.toLowerCase().trim();
  const subTarget = state.libSubgenre && state.libSubgenre !== "Tous" ? state.libSubgenre.toLowerCase() : "";

  const sagaMap = {};
  for (const b of state.books) {
    const sName = (b.series_name || "").trim();
    if (!sName) continue;
    const key = sName.toLowerCase();
    if (!sagaMap[key]) sagaMap[key] = { name: sName, books: [] };
    sagaMap[key].books.push(b);
  }

  let sagas = Object.values(sagaMap).map((sg) => {
    sg.books.sort((a, b) => Number(a.series_volume || 999) - Number(b.series_volume || 999));
    const finished = sg.books.filter((b) => b.status === "Terminé").length;
    const inProgress = sg.books.some((b) => b.status === "En cours");
    const rated = sg.books.map((b) => Number(b.rating_global || 0)).filter((r) => r > 0);
    const avgRating = rated.length > 0 ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
    const author = sg.books[0] ? sg.books[0].author : "";
    const bookIds = new Set(sg.books.map((b) => b.id));
    const notesCount = state.notes.filter((n) => bookIds.has(Number(n.book_id))).length;

    // Détection simple de trous de numérotation (ex: T.1 et T.3 possédés -> T.2 manquant)
    const intVols = sg.books
      .map((b) => Number(b.series_volume || 0))
      .filter((v) => Number.isInteger(v) && v >= 1 && v <= 50);
    const maxVol = intVols.length > 0 ? Math.max(...intVols) : 0;
    const volSet = new Set(intVols);
    const missingVols = [];
    for (let v = 1; v < maxVol; v++) {
      if (!volSet.has(v)) missingVols.push(v);
    }

    return { ...sg, finished, total: sg.books.length, inProgress, avgRating, author, notesCount, missingVols };
  });

  if (subTarget) {
    sagas = sagas.filter((sg) =>
      sg.books.some((b) => (b.fantasy_subgenres || []).some((s) => s.toLowerCase() === subTarget))
    );
  }
  if (q) {
    sagas = sagas.filter(
      (sg) =>
        sg.name.toLowerCase().includes(q) ||
        sg.author.toLowerCase().includes(q) ||
        sg.books.some((b) => (b.title || "").toLowerCase().includes(q))
    );
  }

  sagas.sort((a, b) => {
    if (a.inProgress !== b.inProgress) return a.inProgress ? -1 : 1;
    const aDone = a.finished === a.total ? 1 : 0;
    const bDone = b.finished === b.total ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return b.total - a.total;
  });

  const statusEmoji = {
    "Terminé": "✅",
    "En cours": "📖",
    "Bibliothèque": "📚",
    "Wishlist": "💫",
    "À acheter": "🛒",
    "DNF": "❌"
  };

  const html = sagas
    .map((sg) => {
      const pct = Math.round((sg.finished / Math.max(1, sg.total)) * 100);
      const cover = sg.books.find((b) => b.cover_url)?.cover_url || "";
      const safeName = escapeHtml(sg.name).replace(/'/g, "\\'");
      return `
        <div class="card" style="padding:12px;margin-bottom:10px;border-color:${sg.inProgress ? "rgba(99,102,241,0.5)" : "var(--border)"};">
          <div style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;" onclick="window.openSagaDetailModal('${safeName}')">
            ${cover
              ? `<img src="${escapeHtml(cover)}" style="width:46px;height:68px;object-fit:cover;border-radius:6px;flex-shrink:0;" />`
              : `<div style="width:46px;height:68px;background:#334155;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">🐉</div>`
            }
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                <div style="font-weight:800;font-size:0.96rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(sg.name)}</div>
                ${sg.avgRating ? `<span style="color:#FBBF24;font-size:0.78rem;font-weight:700;flex-shrink:0;">⭐ ${sg.avgRating.toFixed(2).replace(/\.?0+$/, "")}</span>` : ""}
              </div>
              <div style="font-size:0.78rem;color:var(--muted);margin-bottom:5px;display:flex;justify-content:space-between;gap:6px;">
                <span>${escapeHtml(sg.author)} • <b>${sg.finished}/${sg.total}</b> lu(s)</span>
                <span style="color:var(--primary-light);font-weight:600;flex-shrink:0;">Toute la saga ▸</span>
              </div>
              <div class="progress-track" style="height:5px;"><div class="progress-fill" style="width:${pct}%;background:${pct === 100 ? "#10B981" : "var(--primary)"};"></div></div>
              ${sg.missingVols.length > 0 ? `<div style="font-size:0.71rem;color:#FBBF24;margin-top:4px;">⚠️ Tome(s) manquant(s) : ${sg.missingVols.map((v) => "T." + v).join(", ")}</div>` : ""}
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:9px;align-items:center;">
            ${sg.books.map((b) => {
              const col = STATUS_COLORS[b.status] || "#64748B";
              const volLbl = b.series_volume ? `T.${b.series_volume}` : b.title.slice(0, 12);
              return `<button class="btn" style="padding:3px 8px;font-size:0.73rem;border-color:${col}66;background:${col}18;color:var(--text);" onclick="window.openBookDetailModal(${b.id}, 'info')">${statusEmoji[b.status] || "📖"} ${escapeHtml(volLbl)}</button>`;
            }).join("")}
            ${sg.notesCount > 0 ? `<button class="btn" style="padding:3px 8px;font-size:0.73rem;color:#E879F9;border-color:rgba(232,121,249,0.4);margin-left:auto;" onclick="window.openSagaNotesModal('${safeName}', 9999)">🧠 Notes (${sg.notesCount})</button>` : ""}
          </div>
        </div>
      `;
    })
    .join("");

  resultsEl.innerHTML = `
    <div style="font-size:0.78rem;color:var(--muted);margin-bottom:10px;"><b>${sagas.length}</b> saga(s) suivie(s)</div>
    ${html || `<div style="text-align:center;color:var(--muted);padding:30px;">Aucune saga trouvée. Renseignez le champ « Série / Saga » sur vos livres !</div>`}
  `;
}

let currentSagaExternalVolumes = [];
let currentSagaModalName = "";

function renderSagaDetailTimeline(seriesName, externalVolumes = [], loadingExternal = false) {
  const target = String(seriesName || "").toLowerCase();
  const ownedBooks = state.books
    .filter((b) => b.series_name && b.series_name.toLowerCase() === target)
    .sort((a, b) => Number(a.series_volume || 999) - Number(b.series_volume || 999));

  const author = ownedBooks[0] ? ownedBooks[0].author : "";
  const baseGenres = (ownedBooks[0] && ownedBooks[0].genres) || [];
  const baseSubg = (ownedBooks[0] && ownedBooks[0].fantasy_subgenres) || [];

  // Fusionne mes tomes + les tomes parus détectés en ligne
  const rows = [];
  const ownedVols = new Set();
  const ownedTitles = new Set();

  for (const b of ownedBooks) {
    if (b.series_volume) ownedVols.add(String(Number(b.series_volume)));
    ownedTitles.add((b.title || "").toLowerCase().trim());
    rows.push({ kind: "owned", vol: Number(b.series_volume || 999), book: b });
  }

  currentSagaExternalVolumes = [];
  for (const ev of externalVolumes || []) {
    const vKey = ev.series_volume ? String(Number(ev.series_volume)) : "";
    const tKey = (ev.title || "").toLowerCase().trim();
    if ((vKey && ownedVols.has(vKey)) || (tKey && ownedTitles.has(tKey))) continue;
    const extIdx = currentSagaExternalVolumes.length;
    currentSagaExternalVolumes.push({
      ...ev,
      series_name: seriesName,
      author: ev.author || author,
      genres: baseGenres,
      fantasy_subgenres: baseSubg
    });
    rows.push({ kind: "missing", vol: Number(ev.series_volume || 999), ext: ev, extIdx });
  }

  rows.sort((a, b) => a.vol - b.vol);

  const cardsHtml = rows
    .map((r) => {
      if (r.kind === "owned") {
        const b = r.book;
        const col = STATUS_COLORS[b.status] || "#64748B";
        return `
          <div onclick="window.openBookDetailModal(${b.id}, 'info')" style="cursor:pointer;display:flex;gap:10px;align-items:center;background:rgba(30,41,59,0.75);padding:9px 10px;border-radius:10px;border:1px solid ${col}55;">
            ${b.cover_url
              ? `<img src="${escapeHtml(b.cover_url)}" style="width:42px;height:62px;object-fit:cover;border-radius:5px;flex-shrink:0;" />`
              : `<div style="width:42px;height:62px;background:#334155;border-radius:5px;display:flex;align-items:center;justify-content:center;">📖</div>`
            }
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:2px;">
                <span style="font-size:0.73rem;font-weight:700;color:var(--primary-light);">${b.series_volume ? `Tome ${b.series_volume}` : "Hors-série"}</span>
                <span class="status-badge" style="background:${col}22;color:${col};border:1px solid ${col}55;">${escapeHtml(b.status)}</span>
              </div>
              <div style="font-weight:700;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(b.title)}</div>
              <div style="font-size:0.74rem;color:var(--muted);margin-top:2px;">
                ${b.page_count} p.${b.rating_global ? ` • ⭐ ${Number(b.rating_global).toFixed(2).replace(/\.?0+$/, "")}/5` : ""}
              </div>
            </div>
          </div>
        `;
      } else {
        const ev = r.ext;
        return `
          <div style="display:flex;gap:10px;align-items:center;background:rgba(15,23,42,0.5);padding:9px 10px;border-radius:10px;border:1px dashed rgba(148,163,184,0.45);">
            ${ev.cover_url
              ? `<img src="${escapeHtml(ev.cover_url)}" style="width:42px;height:62px;object-fit:cover;border-radius:5px;flex-shrink:0;opacity:0.85;" />`
              : `<div style="width:42px;height:62px;background:#1e293b;border-radius:5px;display:flex;align-items:center;justify-content:center;opacity:0.7;">📘</div>`
            }
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:2px;">
                <span style="font-size:0.73rem;font-weight:700;color:#94A3B8;">Tome ${ev.series_volume}</span>
                <span class="status-badge" style="background:rgba(148,163,184,0.16);color:#CBD5E1;border:1px solid rgba(148,163,184,0.35);">🆕 Pas dans ma liste</span>
              </div>
              <div style="font-weight:700;font-size:0.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#E2E8F0;">${escapeHtml(ev.title)}</div>
              <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;">
                ${ev.page_count ? `${ev.page_count} p.` : ""}${ev.popularity_score ? `${ev.page_count ? " • " : ""}⭐ ${ev.popularity_score}/5` : ""}${ev.publication_year ? ` • ${ev.publication_year}` : ""}
              </div>
              <div style="display:flex;gap:6px;margin-top:6px;">
                <button class="btn" style="padding:3px 8px;font-size:0.72rem;color:#E879F9;border-color:rgba(232,121,249,0.4);" onclick="window.quickAddSagaVolume(${r.extIdx}, 'Wishlist')">💫 + Wishlist</button>
                <button class="btn" style="padding:3px 8px;font-size:0.72rem;color:#38BDF8;border-color:rgba(56,189,248,0.4);" onclick="window.quickAddSagaVolume(${r.extIdx}, 'À acheter')">🛒 + À acheter</button>
              </div>
            </div>
          </div>
        `;
      }
    })
    .join("");

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <div>
        <h3 style="margin:0;">🐉 ${escapeHtml(seriesName)}</h3>
        <div style="font-size:0.78rem;color:var(--muted);">${escapeHtml(author)} • ${ownedBooks.length} dans ma biblio${externalVolumes.length > 0 ? ` • ${rows.length} tome(s) au total` : ""}</div>
      </div>
      <button class="btn" style="padding:4px 10px;" onclick="window.closeModal()">✕</button>
    </div>
    ${loadingExternal ? `<div style="font-size:0.76rem;color:var(--primary-light);margin-bottom:8px;">⏳ Recherche des autres tomes parus (BnF / Goodreads)...</div>` : ""}
    <div style="display:grid;gap:8px;margin-top:8px;">
      ${cardsHtml}
    </div>
  `;
}

window.openSagaDetailModal = async function (seriesName) {
  currentSagaModalName = seriesName;
  const target = String(seriesName || "").toLowerCase();
  const firstBook = state.books.find((b) => b.series_name && b.series_name.toLowerCase() === target);
  const author = firstBook ? firstBook.author : "";

  openModal(renderSagaDetailTimeline(seriesName, [], true));

  try {
    const res = await apiCall("saga_volumes", { series_name: seriesName, author });
    if (currentSagaModalName === seriesName) {
      const box = document.getElementById("modal-content");
      if (box) box.innerHTML = renderSagaDetailTimeline(seriesName, (res && res.volumes) || [], false);
    }
  } catch {
    if (currentSagaModalName === seriesName) {
      const box = document.getElementById("modal-content");
      if (box) box.innerHTML = renderSagaDetailTimeline(seriesName, [], false);
    }
  }
};

window.quickAddSagaVolume = async function (extIdx, targetStatus = "Wishlist") {
  const ev = currentSagaExternalVolumes[extIdx];
  if (!ev) return;
  setSyncStatus(true, "Ajout...");
  try {
    await apiCall("add_book", {
      isbn: ev.isbn || null,
      title: ev.title,
      author: ev.author || "Auteur inconnu",
      series_name: ev.series_name,
      series_volume: ev.series_volume || null,
      publication_year: ev.publication_year || null,
      page_count: ev.page_count || 320,
      popularity_score: ev.popularity_score || null,
      cover_url: ev.cover_url || null,
      genres: ev.genres || [],
      fantasy_subgenres: ev.fantasy_subgenres || [],
      status: targetStatus
    });
    await window.syncFromServer();
    await window.openSagaDetailModal(ev.series_name);
  } catch (e) {
    setSyncStatus(false, "Erreur");
    alert("Erreur lors de l'ajout : " + e.message);
  }
};

window.openSagaNotesModal = function (seriesName, maxVolume = 9999) {
  const target = String(seriesName || "").toLowerCase();
  const sagaBooks = state.books
    .filter(
      (b) =>
        b.series_name &&
        b.series_name.toLowerCase() === target &&
        (maxVolume >= 9999 || (Number(b.series_volume || 0) > 0 && Number(b.series_volume) < maxVolume))
    )
    .sort((a, b) => Number(a.series_volume || 0) - Number(b.series_volume || 0));

  const sections = sagaBooks
    .map((b) => {
      const bNotes = state.notes.filter((n) => Number(n.book_id) === b.id);
      if (bNotes.length === 0) return "";
      return `
        <div style="margin-bottom:12px;">
          <div style="font-weight:700;font-size:0.84rem;color:var(--primary-light);margin-bottom:4px;">
            📖 ${b.series_volume ? `Tome ${b.series_volume} — ` : ""}${escapeHtml(b.title)}
          </div>
          ${bNotes.map((n) => `
            <div style="background:rgba(15,23,42,0.6);padding:7px 9px;border-radius:8px;border:1px solid var(--border);margin-bottom:5px;font-size:0.8rem;">
              <b style="color:#E879F9;">${escapeHtml(n.note_type)}</b> ${n.page_number ? `<span style="color:var(--muted);">(p. ${n.page_number})</span>` : ""}<br/>
              <span>${escapeHtml(n.content)}</span>
            </div>
          `).join("")}
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h3 style="margin:0;">🧠 Notes — ${escapeHtml(seriesName)}</h3>
      <button class="btn" style="padding:4px 10px;" onclick="window.closeModal()">✕</button>
    </div>
    ${sections || `<div style="color:var(--muted);font-size:0.84rem;">Aucune note enregistrée sur les tomes précédents.</div>`}
  `);
};

let palPickerState = { duration: "all", genre: "all", sagaOnly: false, highRated: false, picks: [] };

function runPalPickerDraw() {
  const { refFocusSpeed } = computeSpeeds();
  const speed = refFocusSpeed > 0 ? refFocusSpeed : 45;
  const startedSagas = new Set(
    state.books
      .filter((b) => b.series_name && (b.status === "Terminé" || b.status === "En cours"))
      .map((b) => b.series_name.toLowerCase())
  );

  let pool = state.books.filter((b) => b.status === "Bibliothèque");
  if (palPickerState.duration !== "all") {
    pool = pool.filter((b) => {
      const hrs = Number(b.page_count || 300) / speed;
      if (palPickerState.duration === "short") return hrs < 5;
      if (palPickerState.duration === "medium") return hrs >= 5 && hrs <= 10;
      if (palPickerState.duration === "long") return hrs > 10;
      return true;
    });
  }
  if (palPickerState.genre !== "all") {
    pool = pool.filter((b) => (b.genres || []).some((g) => g.toLowerCase() === palPickerState.genre.toLowerCase()));
  }
  if (palPickerState.sagaOnly) {
    pool = pool.filter((b) => b.series_name && startedSagas.has(b.series_name.toLowerCase()));
  }
  if (palPickerState.highRated) {
    pool = pool.filter((b) => Number(b.popularity_score || 0) >= 4.0);
  }

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  palPickerState.picks = shuffled.slice(0, 3);
  return { totalMatches: pool.length, speed, startedSagas };
}

window.openPalPickerModal = function (redraw = true) {
  const { totalMatches, speed, startedSagas } = redraw ? runPalPickerDraw() : runPalPickerDraw();
  const palGenres = Array.from(
    new Set(
      state.books
        .filter((b) => b.status === "Bibliothèque")
        .flatMap((b) => b.genres || [])
        .filter(Boolean)
    )
  ).sort();

  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h3 style="margin:0;">🎲 Piocheur de PAL</h3>
      <button class="btn" style="padding:4px 10px;" onclick="window.closeModal()">✕</button>
    </div>
    <div style="font-size:0.8rem;color:var(--muted);margin:6px 0 10px;">
      Choisissez votre humeur : StaTome pioche 3 candidats dans votre bibliothèque « À lire ».
    </div>

    <div class="grid-2" style="gap:8px;margin-bottom:8px;">
      <div>
        <label style="margin-top:0;">⏱️ Durée estimée</label>
        <select onchange="window.updatePalPickerFilter('duration', this.value)">
          <option value="all" ${palPickerState.duration === "all" ? "selected" : ""}>Peu importe</option>
          <option value="short" ${palPickerState.duration === "short" ? "selected" : ""}>⚡ Court (&lt; 5h)</option>
          <option value="medium" ${palPickerState.duration === "medium" ? "selected" : ""}>📖 Moyen (5–10h)</option>
          <option value="long" ${palPickerState.duration === "long" ? "selected" : ""}>🧱 Pavé (&gt; 10h)</option>
        </select>
      </div>
      <div>
        <label style="margin-top:0;">📚 Genre</label>
        <select onchange="window.updatePalPickerFilter('genre', this.value)">
          <option value="all" ${palPickerState.genre === "all" ? "selected" : ""}>Tous les genres</option>
          ${palGenres.map((g) => `<option value="${escapeHtml(g)}" ${palPickerState.genre === g ? "selected" : ""}>${escapeHtml(g)}</option>`).join("")}
        </select>
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;font-size:0.8rem;">
      <label style="display:flex;align-items:center;gap:5px;margin:0;cursor:pointer;color:var(--text);">
        <input type="checkbox" ${palPickerState.sagaOnly ? "checked" : ""} onchange="window.updatePalPickerFilter('sagaOnly', this.checked)" />
        🐉 Suite de saga commencée
      </label>
      <label style="display:flex;align-items:center;gap:5px;margin:0;cursor:pointer;color:var(--text);">
        <input type="checkbox" ${palPickerState.highRated ? "checked" : ""} onchange="window.updatePalPickerFilter('highRated', this.checked)" />
        ⭐ Pépite (≥ 4.0/5)
      </label>
    </div>

    <div style="font-size:0.76rem;color:var(--muted);margin-bottom:8px;">
      <b>${totalMatches}</b> livre(s) éligible(s) dans votre PAL :
    </div>

    <div style="display:grid;gap:8px;margin-bottom:12px;">
      ${palPickerState.picks.length > 0
        ? palPickerState.picks.map((b) => {
            const est = formatHoursMinutes(Number(b.page_count || 300) / speed);
            const isSagaCont = b.series_name && startedSagas.has(b.series_name.toLowerCase());
            return `
              <div style="display:flex;gap:10px;align-items:center;background:rgba(15,23,42,0.65);padding:9px;border-radius:10px;border:1px solid var(--border);">
                ${b.cover_url
                  ? `<img src="${escapeHtml(b.cover_url)}" style="width:44px;height:66px;object-fit:cover;border-radius:6px;flex-shrink:0;" />`
                  : `<div style="width:44px;height:66px;background:#334155;border-radius:6px;display:flex;align-items:center;justify-content:center;">📖</div>`
                }
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:700;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(b.title)}</div>
                  <div style="font-size:0.76rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(b.author)}</div>
                  <div style="font-size:0.72rem;color:#38BDF8;margin-top:3px;">
                    ⏳ ${est} (${b.page_count} p.)${b.popularity_score ? ` • ⭐ ${b.popularity_score}` : ""}${isSagaCont ? " • 🐉 Suite" : ""}
                  </div>
                </div>
                <button class="btn btn-success" style="padding:6px 10px;font-size:0.76rem;flex-shrink:0;" onclick="window.startPickedBook(${b.id})">▶️ Lire</button>
              </div>
            `;
          }).join("")
        : `<div style="text-align:center;color:var(--muted);padding:18px;font-size:0.83rem;">Aucun livre « À lire » ne correspond à ces critères. Essayez d'élargir un filtre !</div>`
      }
    </div>

    <button class="btn btn-primary" style="width:100%;padding:11px;" onclick="window.openPalPickerModal(true)">
      🔀 Repiocher 3 autres livres
    </button>
  `);
};

window.updatePalPickerFilter = function (key, val) {
  palPickerState[key] = val;
  window.openPalPickerModal(true);
};

window.startPickedBook = async function (bookId) {
  const book = state.books.find((b) => b.id === Number(bookId));
  if (!book) return;
  book.status = "En cours";
  if (!book.started_at) book.started_at = localDateKey(new Date());
  state.selectedBookId = book.id;
  saveLocalCache();
  window.closeModal();
  window.switchTab("reading");
  try {
    await apiCall("update_book", { book_id: book.id, data: { status: "En cours", started_at: book.started_at } });
  } catch (e) {
    console.warn("startPickedBook sync warning:", e);
  }
};

function renderLibraryResultsOnly() {
  const resultsEl = document.getElementById("lib-results-box");
  if (!resultsEl) return;
  if (state.libFilter === "🐉 Mes Sagas") {
    renderSagasResultsHtml(resultsEl);
    return;
  }
  const curMonth = new Date().toISOString().slice(0, 7);

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

  resultsEl.innerHTML = `
    <div style="font-size:0.78rem;color:var(--muted);margin-bottom:10px;"><b>${filtered.length}</b> livre(s)</div>
    <div class="lib-grid">
      ${cardsHtml || `<div style="text-align:center;color:var(--muted);padding:30px;">Aucun livre ne correspond à vos filtres.</div>`}
    </div>
  `;
}

function renderLibraryView() {
  const el = document.getElementById("view-library");
  const pills = ["Tous", "En cours", "À lire", "PAL du mois", "🐉 Mes Sagas", "Terminé", "Wishlist", "À acheter", "DNF"];

  // Monte le squelette de recherche une seule fois pour ne JAMAIS détruire l'<input> ni fermer le clavier mobile !
  if (!document.getElementById("lib-search-input")) {
    el.innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:10px;">
        <input type="search" id="lib-search-input" placeholder="🔍 Titre, auteur, saga, sous-genre..." value="${escapeHtml(state.libSearch)}" oninput="window.setLibSearch(this.value)" />
        <button class="btn" style="padding:10px 11px;flex-shrink:0;" title="Piocheur de PAL" onclick="window.openPalPickerModal(true)">🎲</button>
        <button class="btn" style="padding:10px 11px;flex-shrink:0;" onclick="window.toggleLibAdv()">⚙️</button>
      </div>
      <div id="lib-adv-box"></div>
      <div id="lib-pills-box" class="pills-row"></div>
      <div id="lib-results-box"></div>
    `;
  } else {
    const searchInput = document.getElementById("lib-search-input");
    if (searchInput && document.activeElement !== searchInput && searchInput.value !== state.libSearch) {
      searchInput.value = state.libSearch;
    }
  }

  const advEl = document.getElementById("lib-adv-box");
  if (advEl) {
    advEl.innerHTML = state.libAdvOpen ? `
      <div class="card" style="padding:12px;margin-bottom:10px;">
        <label style="margin-top:0;">✨ Filtrer par Sous-genre</label>
        <select onchange="window.setLibSubgenre(this.value)">
          <option value="Tous" ${state.libSubgenre === "Tous" ? "selected" : ""}>Tous les sous-genres</option>
          ${ALL_SUBGENRES.map((s) => `<option value="${escapeHtml(s)}" ${state.libSubgenre === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
        </select>
      </div>
    ` : "";
  }

  const pillsEl = document.getElementById("lib-pills-box");
  if (pillsEl) {
    pillsEl.innerHTML = pills
      .map(
        (p) =>
          `<button class="pill ${state.libFilter === p ? "active" : ""}" onclick="window.setLibFilter('${p}')">${p}</button>`
      )
      .join("");
  }

  renderLibraryResultsOnly();
}

window.setLibFilter = function (f) {
  state.libFilter = f;
  renderLibraryView();
};

window.setLibSearch = function (q) {
  state.libSearch = q;
  renderLibraryResultsOnly();
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
        <div class="scanner-viewport" style="display:${state.cameraActive ? "block" : "none"};">
          <video id="live-barcode-video" autoplay muted playsinline webkit-playsinline></video>
          <div id="barcode-scanner-box"></div>
          ${state.cameraActive ? `
            <div class="scanner-overlay" aria-hidden="true">
              <div class="scanner-reticle">
                <div class="scanner-laser"></div>
              </div>
            </div>
          ` : ""}
        </div>
        ${state.cameraActive ? `
          <div id="scanner-live-status" style="font-size:0.74rem;color:#34D399;margin-top:6px;">
            ⏳ Initialisation du flux vidéo...
          </div>
          <div style="display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px;margin-top:8px;">
            <span style="font-size:0.76rem;color:var(--muted);">🔍 Zoom :</span>
            ${[1, 1.5, 2].map((z) => `
              <button class="btn cam-zoom-btn ${state.cameraZoom === z ? "btn-primary" : ""}" data-zoom="${z}" style="padding:4px 10px;font-size:0.78rem;" onclick="window.setCameraZoom(${z})">${z}x</button>
            `).join("")}
            <button id="cam-lens-btn" class="btn" style="display:${state.rearCameras.length > 1 ? "inline-flex" : "none"};padding:4px 10px;font-size:0.78rem;" onclick="window.cycleRearCamera()">
              🔄 Objectif (${state.rearCameraIdx + 1}/${Math.max(1, state.rearCameras.length)})
            </button>
            <button id="cam-torch-btn" class="btn ${state.cameraTorch ? "btn-warning" : ""}" style="display:${state.cameraHasTorch ? "inline-flex" : "none"};padding:4px 10px;font-size:0.78rem;" onclick="window.toggleCameraTorch()">
              🔦 Flash
            </button>
          </div>
        ` : ""}
        <div id="scanner-slow-hint" style="display:${state.cameraActive && state.cameraSlowHint ? "block" : "none"};margin-top:8px;padding:8px 10px;background:rgba(245,158,11,0.14);border:1px solid rgba(245,158,11,0.35);border-radius:8px;font-size:0.8rem;color:#fde68a;text-align:left;">
          💡 <b>Astuce :</b> passez en zoom <b>2x</b> en tenant le livre à 20 cm (pour une mise au point nette), ou utilisez le bouton <b>Photo</b> ci-dessous.
        </div>
        <div style="margin-top:10px;">
          <input type="file" id="barcode-photo-input" accept="image/*" capture="environment" style="display:none;" onchange="window.handleBarcodePhoto(event)" />
          <button class="btn" style="width:100%;padding:10px;font-size:0.85rem;border:1px dashed var(--primary-light);color:var(--primary-light);" onclick="document.getElementById('barcode-photo-input').click()">
            📷 Ou prendre une photo nette du code-barres
          </button>
        </div>
        ${state.cameraError ? `
          <div style="margin-top:10px;padding:10px 12px;background:rgba(239,68,68,0.14);border:1px solid rgba(239,68,68,0.4);border-radius:10px;font-size:0.83rem;color:#fecaca;text-align:left;">
            <div style="font-weight:700;margin-bottom:4px;">⚠️ ${escapeHtml(state.cameraError.title)}</div>
            <div style="color:#fee2e2;line-height:1.4;">${escapeHtml(state.cameraError.hint)}</div>
            ${state.cameraError.tech ? `<div style="margin-top:6px;font-size:0.72rem;color:#fca5a5;opacity:0.85;">Détail technique : ${escapeHtml(state.cameraError.tech)}</div>` : ""}
            <button class="btn" style="margin-top:8px;padding:6px 10px;font-size:0.78rem;" onclick="window.setAddMode('search')">
              🔍 Passer à la recherche manuelle
            </button>
          </div>
        ` : ""}
        ${state.lastScannedCode ? `
          <div style="margin-top:10px;padding:8px 12px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);border-radius:8px;font-size:0.84rem;color:#6ee7b7;">
            ✅ Dernier ISBN scanné : <b>${escapeHtml(state.lastScannedCode)}</b> — <i>${escapeHtml(d.title)}</i>
          </div>
        ` : ""}
      </div>
    ` : `
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px;">🔍 Recherche rapide ou Lien (Kindle, Audible, Kobo, Fnac)</div>
        <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
          ${[
            { fmt: "Broché", label: "📖 Papier" },
            { fmt: "Numérique", label: "📱 Liseuse" },
            { fmt: "Audio", label: "🎧 Audio" }
          ].map((opt) => {
            const isSel = (opt.fmt === "Broché" && ["Broché", "Poche", "Relié"].includes(d.format)) || d.format === opt.fmt;
            return `<button type="button" class="pill quick-fmt-pill ${isSel ? "active" : ""}" data-fmt="${opt.fmt}" style="padding:5px 11px;font-size:0.78rem;" onclick="window.setQuickAddFormat('${opt.fmt}')">${opt.label}</button>`;
          }).join("")}
        </div>
        <div style="display:flex;gap:8px;">
          <input type="search" id="ext-search-q" value="${escapeHtml(state.extSearchQuery || "")}" placeholder="Titre, auteur, ISBN ou collez un lien..." oninput="window.onExtSearchInput(this.value)" onpaste="window.onExtSearchPaste(event)" onkeydown="if(event.key==='Enter')window.runExternalSearch()" />
          <button class="btn btn-primary" onclick="window.runExternalSearch()">Chercher</button>
        </div>
        <div id="ext-autocomplete-box" style="margin-top:8px;"></div>
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
          <select id="add-format" onchange="window.onAddFormatChange()">
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

      <div id="add-audio-dur-row" style="display:${d.format === "Audio" ? "block" : "none"};margin-top:8px;padding:10px;border-radius:10px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.35);">
        <div style="font-size:0.8rem;font-weight:700;color:var(--primary-light);margin-bottom:6px;">🎧 Durée totale du livre audio (optionnel)</div>
        <div class="grid-2">
          <div>
            <label style="font-size:0.74rem;">Heures</label>
            <input type="number" min="0" id="add-audio-h" value="${escapeHtml(d.audio_duration_hours)}" oninput="window.syncAddDraft()" placeholder="Ex: 14" />
          </div>
          <div>
            <label style="font-size:0.74rem;">Minutes</label>
            <input type="number" min="0" max="59" id="add-audio-m" value="${escapeHtml(d.audio_duration_mins)}" oninput="window.syncAddDraft()" placeholder="Ex: 30" />
          </div>
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

      <label>📚 Genres principaux (cliquez pour ajouter/retirer ou éditez ci-dessous)</label>
      <div class="chips-wrap" style="margin-bottom:8px;">
        ${MAIN_GENRES.map((mg) => {
          const currentList = String(d.genres || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
          const sel = currentList.includes(mg.toLowerCase());
          return `<span class="chip-check ${sel ? "selected" : ""}" onclick="window.toggleDraftMainGenre('${escapeHtml(mg)}')">${escapeHtml(mg)}</span>`;
        }).join("")}
      </div>

      <div class="grid-2">
        <div>
          <label>Genres (séparés par virgules)</label>
          <input id="add-genres" value="${escapeHtml(d.genres)}" oninput="window.syncAddDraft()" />
        </div>
        <div>
          <label>Tags & Tropes (séparés par virgules)</label>
          <input id="add-tags" value="${escapeHtml(d.tags)}" oninput="window.syncAddDraft()" placeholder="Ex: Enquête, Magie, Slow Burn" />
        </div>
      </div>

      <label>✨ Sous-genres (adaptés aux genres choisis — cliquez pour sélectionner)</label>
      <div class="chips-wrap">
        ${getSubgenresForGenres(d.genres, d.fantasy_subgenres).map((sg) => {
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
  state.addDraft.audio_duration_hours = g("add-audio-h");
  state.addDraft.audio_duration_mins = g("add-audio-m");
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

window.toggleDraftMainGenre = function (mg) {
  window.syncAddDraft();
  const list = String(state.addDraft.genres || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const idx = list.findIndex((x) => x.toLowerCase() === mg.toLowerCase());
  if (idx >= 0) list.splice(idx, 1);
  else list.push(mg);
  state.addDraft.genres = list.join(", ");
  renderAddView();
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
  const resolvedFormat = meta.detected_format || state.quickFormatChoice || meta.format || state.addDraft.format || "Broché";
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
    format: resolvedFormat,
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
    state.cameraError = {
      title: `Impossible de récupérer les infos de l'ISBN ${clean}`,
      hint: "Vérifiez votre connexion internet ou utilisez l'onglet « Recherche ISBN / Titre ».",
      tech: e && e.message ? e.message : ""
    };
    renderAddView();
  } finally {
    isProcessingScan = false;
  }
};

let cameraSlowTimer = null;
let zbarLiveInterval = null;
let activeMediaStream = null;
let cachedZbarScanner = null;
let cachedNativeDetector = null;
let liveHwZoomActive = false;

async function getConfiguredZbarScanner() {
  if (cachedZbarScanner) return cachedZbarScanner;
  if (typeof zbarWasm === "undefined" || !zbarWasm.ZBarScanner) return null;
  try {
    const sc = await zbarWasm.ZBarScanner.create();
    const ST = zbarWasm.ZBarSymbolType;
    const CT = zbarWasm.ZBarConfigType;
    sc.setConfig(ST.ZBAR_NONE, CT.ZBAR_CFG_ENABLE, 0);
    sc.setConfig(ST.ZBAR_EAN13, CT.ZBAR_CFG_ENABLE, 1);
    sc.setConfig(ST.ZBAR_ISBN13, CT.ZBAR_CFG_ENABLE, 1);
    sc.setConfig(ST.ZBAR_ISBN10, CT.ZBAR_CFG_ENABLE, 1);
    sc.setConfig(ST.ZBAR_EAN8, CT.ZBAR_CFG_ENABLE, 1);
    sc.setConfig(ST.ZBAR_UPCA, CT.ZBAR_CFG_ENABLE, 1);
    sc.setConfig(ST.ZBAR_UPCE, CT.ZBAR_CFG_ENABLE, 1);
    sc.setConfig(ST.ZBAR_NONE, CT.ZBAR_CFG_X_DENSITY, 2);
    sc.setConfig(ST.ZBAR_NONE, CT.ZBAR_CFG_Y_DENSITY, 2);
    if (CT.ZBAR_CFG_TEST_INVERTED !== undefined) {
      sc.setConfig(ST.ZBAR_NONE, CT.ZBAR_CFG_TEST_INVERTED, 1);
    }
    sc.enableCache(false);
    cachedZbarScanner = sc;
    return sc;
  } catch (e) {
    console.warn("ZBar init error:", e);
    return null;
  }
}

function getNativeBarcodeDetector() {
  if (cachedNativeDetector) return cachedNativeDetector;
  try {
    if (typeof window.BarcodeDetector !== "undefined") {
      cachedNativeDetector = new window.BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e"]
      });
      return cachedNativeDetector;
    }
  } catch {}
  return null;
}

function extractValidIsbn(raw) {
  const digits = String(raw || "").replace(/[^0-9Xx]/g, "").toUpperCase();
  if (digits.length === 13 && (digits.startsWith("978") || digits.startsWith("979"))) return digits;
  if (digits.length === 10) return digits;
  const m13 = digits.match(/(97[89]\d{10})/);
  if (m13) return m13[1];
  return null;
}

function rgbaToGrayBuffer(rgba, stretchContrast = false) {
  const len = rgba.length >> 2;
  const gray = new Uint8Array(len);
  let minL = 255;
  let maxL = 0;
  for (let i = 0, p = 0; i < len; i++, p += 4) {
    const l = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
    gray[i] = l;
    if (stretchContrast) {
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
    }
  }
  if (stretchContrast && maxL - minL > 20) {
    const low = minL + ((maxL - minL) * 0.08);
    const high = maxL - ((maxL - minL) * 0.08);
    const span = Math.max(1, high - low);
    for (let i = 0; i < len; i++) {
      const v = ((gray[i] - low) * 255) / span;
      gray[i] = v <= 0 ? 0 : v >= 255 ? 255 : v | 0;
    }
  }
  return gray;
}

async function decodeCanvasForIsbn(canvas, zbarScanner, nativeDetector) {
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return { isbn: null, raw: "" };
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  let lastRaw = "";

  if (zbarScanner && typeof zbarWasm !== "undefined") {
    // 1. Luminance brute
    const gray1 = rgbaToGrayBuffer(imgData.data, false);
    const syms1 = await zbarWasm.scanGrayBuffer(gray1.buffer, w, h, zbarScanner).catch(() => []);
    for (const s of syms1 || []) {
      const val = s.decode();
      if (val) lastRaw = val;
      const isbn = extractValidIsbn(val);
      if (isbn) return { isbn, raw: val };
    }
    // 2. Luminance à contraste normalisé (très efficace sur couvertures brillantes / faible lumière)
    const gray2 = rgbaToGrayBuffer(imgData.data, true);
    const syms2 = await zbarWasm.scanGrayBuffer(gray2.buffer, w, h, zbarScanner).catch(() => []);
    for (const s of syms2 || []) {
      const val = s.decode();
      if (val) lastRaw = val;
      const isbn = extractValidIsbn(val);
      if (isbn) return { isbn, raw: val };
    }
  }

  if (nativeDetector) {
    const hits = await nativeDetector.detect(canvas).catch(() => []);
    for (const hit of hits || []) {
      if (hit && hit.rawValue) {
        lastRaw = hit.rawValue;
        const isbn = extractValidIsbn(hit.rawValue);
        if (isbn) return { isbn, raw: hit.rawValue };
      }
    }
  }

  return { isbn: null, raw: lastRaw };
}

window.setCameraZoom = async function (z) {
  state.cameraZoom = Number(z) || 1;
  document.querySelectorAll(".cam-zoom-btn").forEach((btn) => {
    const bz = Number(btn.getAttribute("data-zoom"));
    btn.classList.toggle("btn-primary", bz === state.cameraZoom);
  });
  const video = document.getElementById("live-barcode-video");
  if (!video) return;
  liveHwZoomActive = false;
  try {
    const track = activeMediaStream && activeMediaStream.getVideoTracks && activeMediaStream.getVideoTracks()[0];
    if (track && track.getCapabilities) {
      const caps = track.getCapabilities();
      if (caps && caps.zoom) {
        const targetZoom = Math.min(caps.zoom.max || state.cameraZoom, Math.max(caps.zoom.min || 1, state.cameraZoom));
        await track.applyConstraints({ advanced: [{ zoom: targetZoom }] });
        liveHwZoomActive = true;
      }
    }
  } catch {}
  video.style.transition = "transform 0.2s ease";
  video.style.transformOrigin = "center center";
  video.style.transform = liveHwZoomActive ? "scale(1)" : `scale(${state.cameraZoom})`;
};

window.toggleCameraTorch = async function () {
  const track = activeMediaStream && activeMediaStream.getVideoTracks && activeMediaStream.getVideoTracks()[0];
  if (!track) return;
  const next = !state.cameraTorch;
  try {
    await track.applyConstraints({ advanced: [{ torch: next }] });
    state.cameraTorch = next;
    const btn = document.getElementById("cam-torch-btn");
    if (btn) btn.classList.toggle("btn-warning", next);
  } catch {}
};

window.cycleRearCamera = async function () {
  if (!state.rearCameras || state.rearCameras.length < 2) return;
  state.rearCameraIdx = (state.rearCameraIdx + 1) % state.rearCameras.length;
  const targetDev = state.rearCameras[state.rearCameraIdx];
  await openCameraStreamWithDevice(targetDev ? targetDev.deviceId : null);
  const btn = document.getElementById("cam-lens-btn");
  if (btn) btn.textContent = `🔄 Objectif (${state.rearCameraIdx + 1}/${state.rearCameras.length})`;
};

function stopActiveMediaStreamOnly() {
  if (activeMediaStream) {
    try {
      activeMediaStream.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
    } catch {}
    activeMediaStream = null;
  }
}

async function openCameraStreamWithDevice(explicitDeviceId = null) {
  stopActiveMediaStreamOnly();
  state.cameraTorch = false;
  state.cameraHasTorch = false;
  liveHwZoomActive = false;

  const attempts = [];
  if (explicitDeviceId) {
    attempts.push({
      audio: false,
      video: { deviceId: { exact: explicitDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    attempts.push({
      audio: false,
      video: { deviceId: { exact: explicitDeviceId } }
    });
  } else {
    attempts.push({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    attempts.push({
      audio: false,
      video: { facingMode: "environment" }
    });
    attempts.push({ audio: false, video: true });
  }

  let lastErr = null;
  for (const c of attempts) {
    try {
      activeMediaStream = await navigator.mediaDevices.getUserMedia(c);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!activeMediaStream) throw lastErr || new Error("Impossible d'ouvrir le flux vidéo");

  const video = document.getElementById("live-barcode-video");
  if (!video) throw new Error("Élément vidéo introuvable");
  video.srcObject = activeMediaStream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  await video.play();

  const track = activeMediaStream.getVideoTracks()[0];
  if (track) {
    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps && Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      }
      state.cameraHasTorch = Boolean(caps && caps.torch);
      const torchBtn = document.getElementById("cam-torch-btn");
      if (torchBtn) torchBtn.style.display = state.cameraHasTorch ? "inline-flex" : "none";
    } catch {}

    // Liste les objectifs arrière pour permettre le changement d'objectif en 1 clic si nécessaire
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vids = devices.filter((d) => d.kind === "videoinput");
      const rears = vids.filter((d) => !/\b(front|user|selfie|facetime|avant)\b/i.test(d.label || ""));
      state.rearCameras = rears.length > 0 ? rears : vids;
      const curSettings = track.getSettings ? track.getSettings() : {};
      if (curSettings.deviceId) {
        const idx = state.rearCameras.findIndex((d) => d.deviceId === curSettings.deviceId);
        if (idx >= 0) state.rearCameraIdx = idx;
      }
      const lensBtn = document.getElementById("cam-lens-btn");
      if (lensBtn) {
        lensBtn.style.display = state.rearCameras.length > 1 ? "inline-flex" : "none";
        lensBtn.textContent = `🔄 Objectif (${state.rearCameraIdx + 1}/${state.rearCameras.length})`;
      }
    } catch {}
  }

  if (state.cameraZoom !== 1) {
    await window.setCameraZoom(state.cameraZoom);
  }
}

function formatCameraError(err) {
  const ua = navigator.userAgent || "";
  const isInApp = /FBAN|FBAV|Instagram|WhatsApp|Snapchat|Line|MicroMessenger|TikTok/i.test(ua);
  const name = (err && err.name) || "";
  const msg = (err && err.message) || String(err || "");

  if (isInApp) {
    return {
      title: "Navigateur intégré détecté (WhatsApp / Instagram...)",
      hint: "Les navigateurs intégrés aux messageries bloquent souvent l'appareil photo. Ouvrez ce lien directement dans Safari (iPhone) ou Chrome (Android).",
      tech: name || msg
    };
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return {
      title: "Connexion non sécurisée",
      hint: "L'accès à la caméra nécessite une adresse en HTTPS.",
      tech: name || msg
    };
  }
  if (/NotAllowedError|PermissionDenied/i.test(name + " " + msg)) {
    return {
      title: "Accès à la caméra refusé",
      hint: "Autorisez la caméra dans les réglages de Safari / Chrome (icône cadenas ou « Aa » dans la barre d'adresse), puis réessayez.",
      tech: name || msg
    };
  }
  if (/NotFoundError|DevicesNotFound/i.test(name + " " + msg)) {
    return {
      title: "Aucune caméra détectée",
      hint: "Votre appareil ne semble pas exposer de caméra compatible au navigateur.",
      tech: name || msg
    };
  }
  if (/NotReadableError|TrackStartError|AbortError/i.test(name + " " + msg)) {
    return {
      title: "Caméra déjà utilisée",
      hint: "Une autre application utilise peut-être déjà la caméra. Fermez-la et réessayez.",
      tech: name || msg
    };
  }
  return {
    title: "Impossible de démarrer la caméra",
    hint: "Essayez de recharger la page, d'ouvrir l'app dans Safari/Chrome, ou utilisez la recherche par titre.",
    tech: name ? `${name}: ${msg}` : msg
  };
}

window.startBarcodeCamera = async function () {
  isProcessingScan = false;
  state.cameraActive = true;
  state.cameraZoom = 1;
  state.cameraTorch = false;
  state.cameraError = null;
  state.cameraSlowHint = false;
  if (cameraSlowTimer) clearTimeout(cameraSlowTimer);
  if (zbarLiveInterval) clearInterval(zbarLiveInterval);
  renderAddView();

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("getUserMedia non supporté par ce navigateur");
    }

    const [zbarScanner, nativeDetector] = await Promise.all([
      getConfiguredZbarScanner(),
      Promise.resolve(getNativeBarcodeDetector())
    ]);

    await openCameraStreamWithDevice(null);

    const cropCanvas = document.createElement("canvas");
    const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });
    const fullCanvas = document.createElement("canvas");
    const fullCtx = fullCanvas.getContext("2d", { willReadFrequently: true });

    let frameBusy = false;
    let frameCount = 0;

    zbarLiveInterval = setInterval(async () => {
      if (!state.cameraActive || isProcessingScan || frameBusy) return;
      const video = document.getElementById("live-barcode-video");
      if (!video || !video.videoWidth || !video.videoHeight || video.readyState < 2) return;

      frameBusy = true;
      frameCount++;
      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;

        const statusEl = document.getElementById("scanner-live-status");
        if (statusEl && frameCount % 4 === 1) {
          const engineLbl = zbarScanner ? "ZBar C++" : (nativeDetector ? "Natif" : "ZXing");
          statusEl.textContent = `🟢 Analyse active (${vw}×${vh} • ${engineLbl})`;
        }

        // Passe 1 : Recadrage central en résolution 1:1 native du capteur (zéro perte de netteté sur les barres fines)
        const zoomDiv = (!liveHwZoomActive && state.cameraZoom > 1) ? state.cameraZoom : 1;
        const cw = Math.max(160, Math.round((vw * 0.80) / zoomDiv));
        const ch = Math.max(100, Math.round((vh * 0.48) / zoomDiv));
        const sx = Math.round((vw - cw) / 2);
        const sy = Math.round((vh - ch) / 2);
        cropCanvas.width = cw;
        cropCanvas.height = ch;
        cropCtx.drawImage(video, sx, sy, cw, ch, 0, 0, cw, ch);

        const res1 = await decodeCanvasForIsbn(cropCanvas, zbarScanner, nativeDetector);
        if (res1.isbn) {
          await window.handleDetectedIsbn(res1.isbn);
          return;
        }

        // Passe 2 : Image complète redimensionnée proprement à 960 px (si le code-barres est décentré)
        const scale = Math.min(1, 960 / Math.max(vw, vh));
        const fw = Math.max(240, Math.round(vw * scale));
        const fh = Math.max(180, Math.round(vh * scale));
        fullCanvas.width = fw;
        fullCanvas.height = fh;
        fullCtx.drawImage(video, 0, 0, vw, vh, 0, 0, fw, fh);

        const res2 = await decodeCanvasForIsbn(fullCanvas, zbarScanner, nativeDetector);
        if (res2.isbn) {
          await window.handleDetectedIsbn(res2.isbn);
          return;
        }
      } catch {} finally {
        frameBusy = false;
      }
    }, 140);

    cameraSlowTimer = setTimeout(() => {
      if (state.cameraActive && !isProcessingScan) {
        state.cameraSlowHint = true;
        const hintEl = document.getElementById("scanner-slow-hint");
        if (hintEl) hintEl.style.display = "block";
      }
    }, 7000);
  } catch (err) {
    stopActiveMediaStreamOnly();
    state.cameraActive = false;
    state.cameraSlowHint = false;
    if (cameraSlowTimer) clearTimeout(cameraSlowTimer);
    if (zbarLiveInterval) clearInterval(zbarLiveInterval);
    state.cameraError = formatCameraError(err);
    renderAddView();
  }
};

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function buildPhotoCandidateCanvases(img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const specs = [
    { crop: 1.0, maxDim: 1600, rot: 0 },
    { crop: 0.68, maxDim: 1400, rot: 0 },
    { crop: 0.45, maxDim: 1100, rot: 0 },
    { crop: 1.0, maxDim: 1400, rot: 90 },
    { crop: 0.68, maxDim: 1200, rot: 90 },
    { crop: 1.0, maxDim: 960, rot: 0 }
  ];
  const canvases = [];
  for (const sp of specs) {
    const sw = Math.round(iw * sp.crop);
    const sh = Math.round(ih * sp.crop);
    const sx = Math.round((iw - sw) / 2);
    const sy = Math.round((ih - sh) / 2);
    const scale = Math.min(1, sp.maxDim / Math.max(sw, sh));
    const dw = Math.max(120, Math.round(sw * scale));
    const dh = Math.max(120, Math.round(sh * scale));

    const c = document.createElement("canvas");
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (sp.rot === 90) {
      c.width = dh;
      c.height = dw;
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
    } else {
      c.width = dw;
      c.height = dh;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    }
    canvases.push(c);
  }
  return canvases;
}

function canvasToFile(canvas, name = "crop.jpg") {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(null);
      resolve(new File([blob], name, { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  });
}

window.handleBarcodePhoto = async function (event) {
  const file = event && event.target && event.target.files && event.target.files[0];
  if (!file) return;
  state.cameraError = null;
  if (state.cameraActive) {
    await window.stopBarcodeCamera();
  }
  setSyncStatus(true, "Lecture photo...");
  try {
    const [img, zbarScanner, nativeDetector] = await Promise.all([
      loadImageElement(file),
      getConfiguredZbarScanner(),
      Promise.resolve(getNativeBarcodeDetector())
    ]);
    const candidates = buildPhotoCandidateCanvases(img);
    let foundIsbn = null;
    let lastRawCode = "";

    for (const c of candidates) {
      const res = await decodeCanvasForIsbn(c, zbarScanner, nativeDetector);
      if (res.raw) lastRawCode = res.raw;
      if (res.isbn) {
        foundIsbn = res.isbn;
        break;
      }
    }

    if (!foundIsbn && typeof Html5Qrcode !== "undefined") {
      const fileScanner = new Html5Qrcode("barcode-scanner-box");
      for (let i = 0; i < Math.min(3, candidates.length); i++) {
        const subFile = await canvasToFile(candidates[i], `scan_${i}.jpg`);
        if (!subFile) continue;
        try {
          const decodedText = await fileScanner.scanFile(subFile, false);
          if (decodedText) {
            lastRawCode = decodedText;
            const clean = extractValidIsbn(decodedText);
            if (clean) {
              foundIsbn = clean;
              break;
            }
          }
        } catch {}
      }
      try { await fileScanner.clear(); } catch {}
    }

    if (foundIsbn) {
      await window.handleDetectedIsbn(foundIsbn);
    } else if (lastRawCode) {
      setSyncStatus(false, "Prêt");
      state.cameraError = {
        title: "Code détecté mais ce n'est pas un ISBN de livre",
        hint: `Code lu : ${lastRawCode}. Photographiez bien le code-barres commençant par 978 ou 979.`,
        tech: ""
      };
      renderAddView();
    } else {
      throw new Error("Aucun code ISBN-13 lisible trouvé sur la photo.");
    }
  } catch (err) {
    setSyncStatus(false, "Prêt");
    state.cameraError = {
      title: "Code-barres non détecté sur la photo",
      hint: "Prenez la photo à environ 15–20 cm pour qu'elle soit bien nette et sans reflet sur les barres, ou utilisez la recherche par titre.",
      tech: (err && err.message) || String(err || "")
    };
    renderAddView();
  } finally {
    if (event && event.target) event.target.value = "";
  }
};

window.stopBarcodeCamera = async function () {
  state.cameraActive = false;
  state.cameraTorch = false;
  state.cameraSlowHint = false;
  if (cameraSlowTimer) {
    clearTimeout(cameraSlowTimer);
    cameraSlowTimer = null;
  }
  if (zbarLiveInterval) {
    clearInterval(zbarLiveInterval);
    zbarLiveInterval = null;
  }
  stopActiveMediaStreamOnly();
  const video = document.getElementById("live-barcode-video");
  if (video) {
    try { video.srcObject = null; } catch {}
  }
  if (html5QrScanner) {
    try {
      await html5QrScanner.stop();
      await html5QrScanner.clear();
    } catch (e) {}
    html5QrScanner = null;
  }
  if (state.activeTab === "add") renderAddView();
};

let extAutocompleteTimer = null;
let extAutocompleteSeq = 0;

window.setQuickAddFormat = function (fmt) {
  state.quickFormatChoice = fmt;
  state.addDraft.format = fmt;
  const sel = document.getElementById("add-format");
  if (sel) sel.value = fmt;
  const audioRow = document.getElementById("add-audio-dur-row");
  if (audioRow) audioRow.style.display = fmt === "Audio" ? "block" : "none";
  document.querySelectorAll(".quick-fmt-pill").forEach((btn) => {
    const bFmt = btn.getAttribute("data-fmt");
    btn.classList.toggle("active", bFmt === fmt);
  });
};

window.onAddFormatChange = function () {
  window.syncAddDraft();
  const fmt = state.addDraft.format;
  state.quickFormatChoice = ["Numérique", "Audio"].includes(fmt) ? fmt : null;
  const audioRow = document.getElementById("add-audio-dur-row");
  if (audioRow) audioRow.style.display = fmt === "Audio" ? "block" : "none";
  document.querySelectorAll(".quick-fmt-pill").forEach((btn) => {
    const bFmt = btn.getAttribute("data-fmt");
    const isSel = (bFmt === "Broché" && ["Broché", "Poche", "Relié"].includes(fmt)) || bFmt === fmt;
    btn.classList.toggle("active", isSel);
  });
};

function renderAutocompleteBox() {
  const box = document.getElementById("ext-autocomplete-box");
  if (!box) return;
  const items = state.autocompleteResults || [];
  if (items.length === 0) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `
    <div style="display:grid;gap:6px;padding-top:4px;">
      ${items.map((r, idx) => `
        <div onclick="window.pickAutocompleteSuggestion(${idx})" style="cursor:pointer;display:flex;gap:10px;align-items:center;padding:7px 9px;border-radius:10px;background:rgba(15,23,42,0.72);border:1px solid var(--border);">
          ${r.cover_url
            ? `<img src="${escapeHtml(r.cover_url)}" style="width:36px;height:54px;object-fit:cover;border-radius:5px;flex-shrink:0;" />`
            : `<div style="width:36px;height:54px;background:#334155;border-radius:5px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">📖</div>`
          }
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:0.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.title)}</div>
            <div style="font-size:0.75rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${escapeHtml(r.author || "Auteur inconnu")}${r.series_name ? ` • ${escapeHtml(r.series_name)}${r.series_volume ? ` #${r.series_volume}` : ""}` : ""}${r.popularity_score ? ` • ⭐ ${r.popularity_score}` : ""}
            </div>
          </div>
          <span style="color:var(--primary-light);font-weight:700;font-size:0.76rem;flex-shrink:0;">Choisir</span>
        </div>
      `).join("")}
    </div>
  `;
}

function looksFrenchText(text = "") {
  const s = String(text || "");
  if (/[éèêëàâäîïôöùûüçœæ]/i.test(s)) return true;
  if (/\b(?:le|la|les|des|du|un|une|tome|livre|l'|d'|aux|dans|pour|sur|avec|sans|roman|édition|français)\b/i.test(s)) {
    return true;
  }
  return false;
}

async function fetchAppleBooksFrClient(q) {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=fr&media=ebook&limit=10`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const json = await resp.json();
    const items = (json && json.results) || [];
    return items
      .map((it, idx) => {
        const rawTitle = String(it.trackName || "").trim();
        if (!rawTitle) return null;
        if (/^(?:résumé|resume|fiche de lecture|analyse complète|summary of|study guide)\b/i.test(rawTitle)) return null;
        const cleanedRaw = rawTitle
          .replace(/\s*\((?:Enhanced Edition|Édition enrichie|Edition enrichie|French Edition|Édition française)\)\s*/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        let author = String(it.artistName || "").trim();
        if (author.includes(" & ") && Array.isArray(it.artistIds) && it.artistIds.length > 1) {
          author = author.split(" & ")[0].trim();
        }
        const rawArt = String(it.artworkUrl100 || "");
        const cover = rawArt ? rawArt.replace(/100x100bb/i, "400x400bb") : "";
        const rating = Number(it.averageUserRating || 0) > 0 ? Math.round(Number(it.averageUserRating) * 100) / 100 : null;
        const ratingCnt = Number(it.userRatingCount || 0);
        const descSample = String(it.description || "").slice(0, 260);
        const isFrTitle = looksFrenchText(cleanedRaw);
        const isFrEdition = isFrTitle || looksFrenchText(descSample);
        const score =
          (isFrEdition ? 6 : 0) +
          (isFrTitle ? 2 : 0) +
          (ratingCnt > 0 ? Math.min(8, Math.log10(ratingCnt + 1) * 2.5) : 0) +
          (rating ? 2 : 0) +
          (cover ? 1 : 0) +
          Math.max(0, (10 - idx) * 0.45);
        return {
          title: cleanedRaw,
          author,
          cover_url: cover,
          isbn: "",
          popularity_score: rating,
          page_count: null,
          series_name: "",
          series_volume: null,
          is_fr: isFrEdition,
          _score: score
        };
      })
      .filter(Boolean)
      .sort((a, b) => b._score - a._score);
  } catch {
    return [];
  }
}

window.onExtSearchInput = function (val) {
  state.extSearchQuery = val;
  const q = String(val || "").trim();
  if (extAutocompleteTimer) clearTimeout(extAutocompleteTimer);
  const looksLikeUrl = /^https?:\/\//i.test(q) || /\b(?:amazon|audible|kobo|fnac|goodreads)\.[a-z]{2,}\//i.test(q);
  const looksLikeIsbn = /^\d[\d\s-]{8,16}[\dXx]$/.test(q);
  if (q.length < 3 || looksLikeUrl || looksLikeIsbn) {
    state.autocompleteResults = [];
    renderAutocompleteBox();
    return;
  }
  const seq = ++extAutocompleteSeq;
  extAutocompleteTimer = setTimeout(async () => {
    try {
      const appleItems = await fetchAppleBooksFrClient(q);
      if (seq !== extAutocompleteSeq) return;
      const appleFr = appleItems.filter((x) => x.is_fr);

      let serverItems = [];
      // Optimisation scalabilité : on n'appelle le Worker (Goodreads) qu'en renfort si Apple Books FR renvoie < 3 résultats
      if (appleFr.length < 3) {
        const apiRes = await apiCall("quick_autocomplete", { q }).catch(() => ({ suggestions: [] }));
        if (seq !== extAutocompleteSeq) return;
        serverItems = (apiRes && apiRes.suggestions) || [];
      }

      const merged = [];
      const seen = new Set();
      const normKey = (it) =>
        `${String(it.title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").slice(0, 28)}|${String(it.author || "").toLowerCase().split(/\s+/).pop() || ""}`;
      const pushUnique = (item) => {
        const k = normKey(item);
        if (seen.has(k)) return;
        seen.add(k);
        merged.push(item);
      };
      // 1. Éditions françaises populaires (Apple Books FR en direct du navigateur)
      for (const a of appleFr) pushUnique(a);
      // 2. Renfort serveur (Goodreads FR puis international) uniquement si besoin
      for (const s of serverItems.filter((x) => x.is_fr || looksFrenchText(x.title))) pushUnique(s);
      for (const s of serverItems) pushUnique(s);
      for (const a of appleItems) pushUnique(a);

      state.autocompleteResults = merged.slice(0, 6);
      renderAutocompleteBox();
    } catch {}
  }, 300);
};

window.onExtSearchPaste = function (event) {
  const pasted = (event.clipboardData || window.clipboardData)?.getData("text") || "";
  if (/^https?:\/\//i.test(pasted.trim()) || /\b(?:amazon|audible|kobo|fnac|goodreads)\.[a-z]{2,}\//i.test(pasted)) {
    setTimeout(() => window.runExternalSearch(), 60);
  }
};

window.pickAutocompleteSuggestion = async function (idx) {
  const item = (state.autocompleteResults || [])[idx];
  if (!item) return;
  state.autocompleteResults = [];
  renderAutocompleteBox();
  populateDraftFromMeta(item);
  renderAddView();
  forceSyncDraftToDom();
  const fullQ = `${item.title} ${item.author || ""}`.trim();
  const enrichQ = item.isbn ? item.isbn : fullQ;
  state.extSearchQuery = fullQ;
  setSyncStatus(true, "Enrichissement...");
  try {
    const data = await apiCall("enrich_book", { q: enrichQ });
    if (data && data.best) {
      populateDraftFromMeta(data.best);
      if (!state.addDraft.cover_url && item.cover_url) state.addDraft.cover_url = item.cover_url;
    }
    setSyncStatus(false, "Synchronisé");
    renderAddView();
    forceSyncDraftToDom();
  } catch {
    setSyncStatus(false, "Synchronisé");
  }
};

window.runExternalSearch = async function () {
  const qEl = document.getElementById("ext-search-q");
  const q = qEl ? qEl.value.trim() : "";
  if (!q) return;
  state.extSearchQuery = q;
  state.autocompleteResults = [];
  renderAutocompleteBox();
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

  const audioH = Math.max(0, Number(d.audio_duration_hours || 0));
  const audioM = Math.max(0, Number(d.audio_duration_mins || 0));
  const audioTotalMin = (d.format === "Audio" && (audioH > 0 || audioM > 0)) ? Math.round(audioH * 60 + audioM) : null;

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
    audio_duration_minutes: audioTotalMin,
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
    state.autocompleteResults = [];
    state.extSearchQuery = "";
    state.quickFormatChoice = null;
    state.lastScannedCode = "";
    state.addDraft.title = "";
    state.addDraft.isbn = "";
    state.addDraft.cover_url = "";
    state.addDraft.audio_duration_hours = "";
    state.addDraft.audio_duration_mins = "";
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
    ${renderStreakGoalsBannerHtml(true)}
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
  const cph = computeCostPerHour(books, state.sessions);

  box.innerHTML = `
    <div class="kpi-grid kpi-grid-4">
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
      <div class="kpi-card" style="border-color:rgba(245,158,11,0.45);">
        <div class="kpi-label">🎬 Coût / heure de plaisir</div>
        <div class="kpi-value" style="color:#FBBF24;">${cph.avgCostPerHour !== null ? cph.avgCostPerHour.toFixed(2) + " €/h" : "—"}</div>
        <div class="kpi-sub">${cph.bestDeal ? `Record : ${escapeHtml(cph.bestDeal.title.slice(0, 18))} (${cph.bestDeal.costPerHour.toFixed(2)} €/h)` : "Prix + sessions requis"}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">📄 Pagination totale</div>
        <div class="kpi-value" style="color:#818CF8;">${totalPages.toLocaleString("fr-FR")} p.</div>
        <div class="kpi-sub">${books.length} livre(s) dans le périmètre</div>
      </div>
    </div>
    ${cph.avgCostPerHour !== null ? `
      <div class="card" style="padding:10px 14px;margin-bottom:12px;border-color:rgba(245,158,11,0.35);font-size:0.81rem;color:var(--muted);">
        💡 Sur <b>${cph.trackedCount}</b> livre(s) chiffré(s) et chronométré(s) (<b>${cph.totalHours.toFixed(1)} h</b> lues), vos lectures vous reviennent à
        <b style="color:#FBBF24;">${cph.avgCostPerHour.toFixed(2)} € / heure</b>
        ${cph.avgCostPerHour < 6 ? `— soit <b style="color:#34D399;">${(6 / Math.max(0.1, cph.avgCostPerHour)).toFixed(1)}× moins cher</b> qu'une place de cinéma (~6 €/h) !` : "."}
      </div>
    ` : ""}

    <div class="chart-card">
      <div class="chart-title">Top 10 des Genres</div>
      <div class="chart-sub">Survolez une barre pour voir les ouvrages associés</div>
      <div id="plot-genres" class="chart-box"></div>
    </div>

    <div class="chart-card">
      <div class="chart-title">✨ Répartition des Sous-genres</div>
      <div class="chart-sub">Sous-genres représentés dans ce périmètre</div>
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

window.openManualSessionModal = function (bookId, inputMode = "default") {
  const book = state.books.find((b) => b.id === Number(bookId));
  if (!book) return;
  const curP = Number(book.current_page || 0);
  const totP = Math.max(1, Number(book.page_count || 1));
  const isAudio = book.format === "Audio";
  const isEbook = book.format === "Numérique";
  const audioTotal = Number(book.audio_duration_minutes || 0);
  const audioCur = Number(book.audio_current_minutes || 0);
  const useAudioTracking = isAudio && audioTotal > 0;
  const showPctToggle = useAudioTracking || isEbook || isAudio;
  const isPctMode = showPctToggle && inputMode === "pct";

  let inputsHtml = "";
  if (isPctMode) {
    const startPct = useAudioTracking
      ? Math.round((audioCur / audioTotal) * 100)
      : Math.round((curP / totP) * 100);
    const endPct = Math.min(100, startPct + 10);
    inputsHtml = `
      <div class="grid-2">
        <div>
          <label>Départ (%)</label>
          <input type="number" id="m-sess-start-pct" min="0" max="100" value="${startPct}" />
        </div>
        <div>
          <label>Fin (%)</label>
          <input type="number" id="m-sess-end-pct" min="0" max="100" value="${endPct}" />
        </div>
      </div>
    `;
  } else if (useAudioTracking) {
    const sugEnd = Math.min(audioTotal, audioCur + 30);
    inputsHtml = `
      <div class="grid-2">
        <div>
          <label>Position fin (Heures)</label>
          <input type="number" id="m-sess-audio-h" min="0" value="${Math.floor(sugEnd / 60)}" />
        </div>
        <div>
          <label>Position fin (Minutes)</label>
          <input type="number" id="m-sess-audio-m" min="0" max="59" value="${sugEnd % 60}" />
        </div>
      </div>
      <div style="font-size:0.76rem;color:var(--muted);margin-top:4px;">Position actuelle : ${formatAudioHM(audioCur)} / ${formatAudioHM(audioTotal)}</div>
    `;
  } else {
    inputsHtml = `
      <div class="grid-2">
        <div>
          <label>Page départ</label>
          <input type="number" id="m-sess-start" value="${curP}" />
        </div>
        <div>
          <label>Page fin</label>
          <input type="number" id="m-sess-end" value="${Math.min(totP, curP + 25)}" />
        </div>
      </div>
    `;
  }

  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
      <h3 style="margin:0;">➕ Session manuelle</h3>
      ${showPctToggle ? `
        <div style="display:flex;gap:4px;">
          <button class="pill ${!isPctMode ? "active" : ""}" style="padding:3px 9px;font-size:0.74rem;" onclick="window.openManualSessionModal(${book.id}, 'default')">${useAudioTracking ? "🎧 h / min" : "📖 Pages"}</button>
          <button class="pill ${isPctMode ? "active" : ""}" style="padding:3px 9px;font-size:0.74rem;" onclick="window.openManualSessionModal(${book.id}, 'pct')">📊 %</button>
        </div>
      ` : ""}
    </div>
    ${!isAudio ? `
      <label>Mode de lecture</label>
      <select id="m-sess-mode">
        <option value="focus">🎯 Lecture Focus (Concentrée)</option>
        <option value="chill">🛋️ Lecture Détente (Transports, TV, interruptions)</option>
      </select>
    ` : `<div style="font-size:0.78rem;color:var(--muted);margin-bottom:8px;">🎧 Session audio (exclue de la vitesse Focus pages/h).</div>`}
    ${inputsHtml}
    <label>Durée réelle de la session (minutes)</label>
    <input type="number" id="m-sess-dur" value="30" />
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
      <button class="btn btn-primary" onclick="window.saveManualSession(${book.id}, '${isPctMode ? "pct" : "default"}')">💾 Ajouter</button>
      <button class="btn" onclick="window.closeModal()">Annuler</button>
    </div>
  `);
};

window.saveManualSession = async function (bookId, inputMode = "default") {
  const book = state.books.find((b) => b.id === Number(bookId));
  const totP = Math.max(1, Number((book && book.page_count) || 1));
  const curP = Number((book && book.current_page) || 0);
  const isAudio = Boolean(book && book.format === "Audio");
  const audioTotal = Number((book && book.audio_duration_minutes) || 0);
  const useAudioTracking = isAudio && audioTotal > 0;

  const modeEl = document.getElementById("m-sess-mode");
  const is_focused = isAudio ? false : (modeEl ? modeEl.value === "focus" : true);
  const duration_minutes = Math.max(0.5, Number(document.getElementById("m-sess-dur").value || 30));

  let start_page = curP;
  let end_page = curP;
  let audio_end_minutes = null;

  if (inputMode === "pct") {
    const sPct = Math.max(0, Math.min(100, Number(document.getElementById("m-sess-start-pct").value || 0)));
    const ePct = Math.max(sPct, Math.min(100, Number(document.getElementById("m-sess-end-pct").value || sPct)));
    start_page = Math.round((sPct / 100) * totP);
    end_page = Math.round((ePct / 100) * totP);
    if (useAudioTracking) {
      audio_end_minutes = Math.min(audioTotal, Math.round((ePct / 100) * audioTotal));
    }
  } else if (useAudioTracking) {
    const h = Math.max(0, Number(document.getElementById("m-sess-audio-h").value || 0));
    const m = Math.max(0, Number(document.getElementById("m-sess-audio-m").value || 0));
    audio_end_minutes = Math.min(audioTotal, Math.round(h * 60 + m));
    start_page = curP;
    end_page = Math.min(totP, Math.max(curP, Math.round((audio_end_minutes / audioTotal) * totP)));
  } else {
    start_page = Number(document.getElementById("m-sess-start").value || 0);
    end_page = Number(document.getElementById("m-sess-end").value || start_page);
  }

  window.closeModal();
  await apiCall("add_session", { book_id: bookId, start_page, end_page, duration_minutes, is_focused, audio_end_minutes });
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
          <select id="m-ed-format" onchange="const r=document.getElementById('m-ed-audio-row');if(r)r.style.display=this.value==='Audio'?'block':'none';">
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

      <div id="m-ed-audio-row" style="display:${book.format === "Audio" ? "block" : "none"};margin-top:8px;padding:10px;border-radius:10px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.35);">
        <div style="font-size:0.8rem;font-weight:700;color:var(--primary-light);margin-bottom:6px;">🎧 Suivi Livre Audio (optionnel)</div>
        <div class="grid-2">
          <div>
            <label style="font-size:0.74rem;">Durée totale (h)</label>
            <input type="number" min="0" id="m-ed-audio-th" value="${book.audio_duration_minutes ? Math.floor(book.audio_duration_minutes / 60) : ""}" placeholder="Ex: 14" />
          </div>
          <div>
            <label style="font-size:0.74rem;">Durée totale (min)</label>
            <input type="number" min="0" max="59" id="m-ed-audio-tm" value="${book.audio_duration_minutes ? (book.audio_duration_minutes % 60) : ""}" placeholder="Ex: 30" />
          </div>
        </div>
        <div class="grid-2" style="margin-top:6px;">
          <div>
            <label style="font-size:0.74rem;">Écouté (h)</label>
            <input type="number" min="0" id="m-ed-audio-ch" value="${Math.floor(Number(book.audio_current_minutes || 0) / 60)}" />
          </div>
          <div>
            <label style="font-size:0.74rem;">Écouté (min)</label>
            <input type="number" min="0" max="59" id="m-ed-audio-cm" value="${Number(book.audio_current_minutes || 0) % 60}" />
          </div>
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

      <label>✨ Sous-genres (séparés par virgules)</label>
      <input id="m-ed-subg" value="${escapeHtml((book.fantasy_subgenres || []).join(", "))}" placeholder="Ex: Romantasy, Thriller Psychologique, Space Opera, Cozy Mystery" />

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

  const fmt = g("m-ed-format");
  const aTH = Math.max(0, Number(g("m-ed-audio-th") || 0));
  const aTM = Math.max(0, Number(g("m-ed-audio-tm") || 0));
  const aCH = Math.max(0, Number(g("m-ed-audio-ch") || 0));
  const aCM = Math.max(0, Number(g("m-ed-audio-cm") || 0));
  const audioTotalMin = (fmt === "Audio" && (aTH > 0 || aTM > 0)) ? Math.round(aTH * 60 + aTM) : null;
  const audioCurMin = fmt === "Audio" ? Math.round(aCH * 60 + aCM) : 0;

  const data = {
    title: g("m-ed-title").trim(),
    author: g("m-ed-author").trim(),
    series_name: g("m-ed-series").trim() || null,
    series_volume: g("m-ed-vol") !== "" ? Number(g("m-ed-vol")) : null,
    status: g("m-ed-status"),
    current_page: Number(g("m-ed-page") || 0),
    page_count: Math.max(1, Number(g("m-ed-totpages") || 1)),
    format: fmt,
    audio_duration_minutes: audioTotalMin,
    audio_current_minutes: audioCurMin,
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
        <input id="auth-name" value="" placeholder="Votre prénom" />
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
        <h2 style="margin:6px 0 4px;">StaTome <span style="font-size:0.8rem;color:var(--primary-light);font-weight:600;">by TomeFab</span></h2>
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
        <input id="reg-code" placeholder="Entrez votre code d'invitation" style="border-color:var(--primary-light);font-weight:700;" />
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
  const display_name = document.getElementById("auth-name").value.trim() || "Propriétaire";
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
      <h3 style="margin:0;">👤 Mon Compte StaTome</h3>
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
