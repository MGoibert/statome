/**
 * StaTome — Moteur d'Analyse ADN Lecteur & Exports Visuels « Story-Ready » (1080×1920 PNG)
 */

(function () {
  const STORY_W = 1080;
  const STORY_H = 1920;

  const FRENCH_STOP_WORDS = new Set([
    "alors", "apres", "après", "assez", "aussi", "autre", "autres", "avant", "avec", "avoir",
    "beaucoup", "bien", "cette", "ceux", "chaque", "comme", "comment", "contre", "dans", "depuis",
    "deux", "dire", "doit", "donc", "dont", "elle", "elles", "encore", "entre", "etait", "était",
    "etais", "étais", "etre", "être", "faire", "fait", "faut", "fois", "grand", "grande", "juste",
    "leur", "leurs", "livre", "livres", "mais", "meme", "même", "moins", "monde", "notre", "nous",
    "parce", "parfois", "partie", "passe", "pendant", "petit", "petite", "peut", "plus", "point",
    "pour", "pourquoi", "premiere", "première", "premier", "quand", "quel", "quelle", "quelque",
    "quelques", "quitte", "reste", "rien", "sans", "selon", "sera", "serait", "seul", "seule",
    "si", "sinon", "soir", "sont", "sous", "souvent", "suis", "super", "temps", "tome", "toujours",
    "tous", "tout", "toute", "toutes", "tres", "très", "trop", "trouve", "trouvé", "une", "vers",
    "veut", "vraiment", "vous", "lecture", "pages", "page", "chapitre", "histoire", "auteur",
    "personnage", "personnages", "debut", "début", "fin", "milieu", "aime", "aimé", "adoré", "adore"
  ]);

  // ==========================================
  // 1. ANALYSEUR DE PROFIL LECTEUR (« ADN STATOME »)
  // ==========================================
  window.computeReaderDna = function () {
    const books = (window.state && window.state.books) || [];
    const sessions = (window.state && window.state.sessions) || [];
    const notes = (window.state && window.state.notes) || [];

    const booksById = {};
    for (const b of books) booksById[Number(b.id)] = b;

    const finishedBooks = books.filter((b) => b.status === "Terminé");
    const dnfBooks = books.filter((b) => b.status === "DNF");
    const totalMinutes = sessions.reduce((acc, s) => acc + Number(s.duration_minutes || 0), 0);
    const totalPages = sessions.reduce((acc, s) => acc + Number(s.pages_read || 0), 0);

    // 1. Moteurs des coups de cœur (corrélation des 6 critères vs rating_global)
    const criteriaDefs = [
      { key: "rating_plot", label: "Intrigue", emoji: "🧩" },
      { key: "rating_chars", label: "Personnages", emoji: "🎭" },
      { key: "rating_world", label: "Worldbuilding", emoji: "🌍" },
      { key: "rating_writing", label: "Plume", emoji: "✍️" },
      { key: "rating_pacing", label: "Rythme", emoji: "⚡" },
      { key: "rating_global", label: "Émotion", emoji: "❤️", isFallback: true }
    ];
    // On a 5 sous-critères stockés en base : pacing, chars, world, writing, plot
    const subCriteriaDefs = [
      { key: "rating_plot", label: "Intrigue", emoji: "🧩" },
      { key: "rating_chars", label: "Personnages", emoji: "🎭" },
      { key: "rating_world", label: "Worldbuilding", emoji: "🌍" },
      { key: "rating_writing", label: "Plume", emoji: "✍️" },
      { key: "rating_pacing", label: "Rythme", emoji: "⚡" }
    ];

    const ratedDetailed = books.filter(
      (b) => Number(b.rating_global || 0) > 0 &&
        subCriteriaDefs.some((c) => Number(b[c.key] || 0) > 0)
    );

    const criteriaStats = subCriteriaDefs.map((c) => {
      const pairs = ratedDetailed
        .filter((b) => Number(b[c.key] || 0) > 0)
        .map((b) => ({ x: Number(b[c.key]), y: Number(b.rating_global) }));

      if (pairs.length === 0) {
        return { ...c, avgAll: 0, avgTop: 0, corr: 0, count: 0 };
      }
      const meanX = pairs.reduce((a, p) => a + p.x, 0) / pairs.length;
      const meanY = pairs.reduce((a, p) => a + p.y, 0) / pairs.length;
      const topPairs = pairs.filter((p) => p.y >= 4.25);
      const avgTop = topPairs.length > 0
        ? topPairs.reduce((a, p) => a + p.x, 0) / topPairs.length
        : meanX;

      let num = 0, denX = 0, denY = 0;
      for (const p of pairs) {
        const dx = p.x - meanX;
        const dy = p.y - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
      }
      const corr = denX > 0 && denY > 0 ? num / Math.sqrt(denX * denY) : 0;
      return {
        ...c,
        avgAll: Math.round(meanX * 100) / 100,
        avgTop: Math.round(avgTop * 100) / 100,
        corr: Math.round(corr * 100) / 100,
        count: pairs.length
      };
    });

    const rankedCriteria = [...criteriaStats]
      .filter((c) => c.count >= 2)
      .sort((a, b) => (b.corr * 0.65 + (b.avgTop / 5) * 0.35) - (a.corr * 0.65 + (a.avgTop / 5) * 0.35));

    const topDriver = rankedCriteria[0] || null;
    const forgivenCriterion = rankedCriteria.length >= 2 ? rankedCriteria[rankedCriteria.length - 1] : null;

    // 2. Dynamique de vitesse au fil d'un livre (Début / Milieu / Fin)
    const thirds = {
      start: { label: "Début (0–33%)", pages: 0, mins: 0, count: 0 },
      mid: { label: "Milieu (33–66%)", pages: 0, mins: 0, count: 0 },
      end: { label: "Fin (66–100%)", pages: 0, mins: 0, count: 0 }
    };

    for (const s of sessions) {
      const b = booksById[Number(s.book_id)];
      if (!b || b.format === "Audio") continue;
      const totP = Number(b.page_count || 0);
      const dur = Number(s.duration_minutes || 0);
      const pRead = Number(s.pages_read || 0);
      if (totP < 40 || dur < 3 || pRead <= 0) continue;
      const midPage = (Number(s.start_page || 0) + Number(s.end_page || 0)) / 2;
      const ratio = Math.max(0, Math.min(1, midPage / totP));
      const bucket = ratio < 0.333 ? thirds.start : (ratio < 0.666 ? thirds.mid : thirds.end);
      bucket.pages += pRead;
      bucket.mins += dur;
      bucket.count += 1;
    }

    const speedCurve = ["start", "mid", "end"].map((k) => {
      const t = thirds[k];
      const pph = t.mins > 0 ? Math.round((t.pages / t.mins) * 60) : 0;
      return { key: k, label: t.label, pph, count: t.count };
    });

    let curveInsight = "Continue d'enregistrer tes sessions pour révéler ta courbe d'engagement.";
    if (speedCurve[0].pph > 0 && speedCurve[2].pph > 0) {
      const diffPct = Math.round(((speedCurve[2].pph - speedCurve[0].pph) / speedCurve[0].pph) * 100);
      if (diffPct >= 10) {
        curveInsight = `Effet page-turner : tu accélères de +${diffPct}% dans le dernier tiers de tes romans !`;
      } else if (diffPct <= -10) {
        curveInsight = `Tu démarres vite (${speedCurve[0].pph} p/h) puis tu savoures la fin plus posément (${speedCurve[2].pph} p/h).`;
      } else {
        curveInsight = `Rythme métronomique : ta vitesse reste ultra-régulière du début (${speedCurve[0].pph} p/h) à la fin (${speedCurve[2].pph} p/h).`;
      }
    }

    // 3. Habitudes horaires, semaine vs week-end, Focus vs Détente
    const slots = [
      { id: "morning", label: "Matin (5h–11h)", emoji: "🌅", mins: 0, pages: 0, visMins: 0 },
      { id: "noon", label: "Midi (11h–14h)", emoji: "☀️", mins: 0, pages: 0, visMins: 0 },
      { id: "afternoon", label: "Après-midi (14h–18h)", emoji: "🌤️", mins: 0, pages: 0, visMins: 0 },
      { id: "evening", label: "Soirée (18h–22h)", emoji: "🌆", mins: 0, pages: 0, visMins: 0 },
      { id: "night", label: "Nocturne (22h–5h)", emoji: "🌙", mins: 0, pages: 0, visMins: 0 }
    ];

    let weekendMins = 0;
    let weekdayMins = 0;
    let focusMins = 0;
    let chillMins = 0;

    for (const s of sessions) {
      const dt = new Date(s.start_time);
      const dur = Number(s.duration_minutes || 0);
      if (isNaN(dt.getTime()) || dur <= 0) continue;
      const h = dt.getHours();
      const slotIdx = h >= 5 && h < 11 ? 0 : (h >= 11 && h < 14 ? 1 : (h >= 14 && h < 18 ? 2 : (h >= 18 && h < 22 ? 3 : 4)));
      slots[slotIdx].mins += dur;
      const b = booksById[Number(s.book_id)];
      if (!b || b.format !== "Audio") {
        slots[slotIdx].pages += Number(s.pages_read || 0);
        slots[slotIdx].visMins += dur;
      }
      const dow = dt.getDay();
      if (dow === 0 || dow === 6) weekendMins += dur;
      else weekdayMins += dur;
      if (s.is_focused !== false) focusMins += dur;
      else chillMins += dur;
    }

    slots.forEach((sl) => {
      sl.pct = totalMinutes > 0 ? Math.round((sl.mins / totalMinutes) * 100) : 0;
      sl.pph = sl.visMins >= 15 && sl.pages > 0 ? Math.round((sl.pages / sl.visMins) * 60) : 0;
    });

    const peakTimeSlot = [...slots].sort((a, b) => b.mins - a.mins)[0] || slots[3];
    const peakSpeedSlot = [...slots].filter((s) => s.pph > 0).sort((a, b) => b.pph - a.pph)[0] || null;
    const focusPct = focusMins + chillMins > 0 ? Math.round((focusMins / (focusMins + chillMins)) * 100) : 100;
    const weekendPct = weekendMins + weekdayMins > 0 ? Math.round((weekendMins / (weekendMins + weekdayMins)) * 100) : 0;

    // 4. Empreinte Genres, Sous-genres & DNF
    const genreMap = {};
    for (const b of [...finishedBooks, ...dnfBooks]) {
      const gs = Array.isArray(b.genres) && b.genres.length > 0 ? b.genres : ["Autre"];
      for (const g of gs) {
        if (!genreMap[g]) genreMap[g] = { genre: g, read: 0, dnf: 0, ratingSum: 0, ratingCnt: 0 };
        if (b.status === "Terminé") genreMap[g].read += 1;
        else if (b.status === "DNF") genreMap[g].dnf += 1;
        if (Number(b.rating_global || 0) > 0) {
          genreMap[g].ratingSum += Number(b.rating_global);
          genreMap[g].ratingCnt += 1;
        }
      }
    }
    const genreStats = Object.values(genreMap).map((g) => ({
      ...g,
      avgRating: g.ratingCnt > 0 ? Math.round((g.ratingSum / g.ratingCnt) * 100) / 100 : null,
      dnfRate: g.read + g.dnf > 0 ? Math.round((g.dnf / (g.read + g.dnf)) * 100) : 0
    }));
    const mostReadGenre = [...genreStats].sort((a, b) => b.read - a.read)[0] || null;
    const bestRatedGenre = [...genreStats].filter((g) => g.ratingCnt >= 2).sort((a, b) => b.avgRating - a.avgRating)[0] || mostReadGenre;

    // 5. Mots-clés récurrents dans les notes & critiques
    const wordCounts = {};
    const allTexts = [
      ...notes.map((n) => n.content || ""),
      ...books.map((b) => b.final_review || "")
    ];
    for (const txt of allTexts) {
      const words = String(txt)
        .toLowerCase()
        .replace(/[^a-zàâäéèêëîïôöùûüçœ'-]/g, " ")
        .split(/\s+/);
      for (const rawW of words) {
        const w = rawW.replace(/^['-]+|['-]+$/g, "");
        if (w.length < 4 || FRENCH_STOP_WORDS.has(w)) continue;
        wordCounts[w] = (wordCounts[w] || 0) + 1;
      }
    }
    const topKeywords = Object.entries(wordCounts)
      .filter(([, cnt]) => cnt >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word, count]) => ({ word, count }));

    // 6. Archétype lecteur dynamique
    const sagaShare = finishedBooks.length > 0
      ? finishedBooks.filter((b) => Boolean(b.series_name)).length / finishedBooks.length
      : 0;
    let archetype = { title: "Explorateur Littéraire", emoji: "🧭", desc: "Tu construis un profil curieux et équilibré au fil de tes lectures." };
    if (peakTimeSlot.id === "night" && peakTimeSlot.pct >= 30) {
      archetype = { title: "Noctambule Immersif", emoji: "🌙", desc: "C'est quand tout s'éteint que tu plonges le plus profondément dans tes romans." };
    } else if (sagaShare >= 0.55) {
      archetype = { title: "Dévoreur de Sagas", emoji: "🐉", desc: "Tu aimes les grands univers au long cours où l'on s'attache sur plusieurs tomes." };
    } else if (focusPct >= 80 && totalMinutes >= 120) {
      archetype = { title: "Lecteur Focus & Chirurgical", emoji: "🎯", desc: "Des sessions concentrées, intenses, où chaque minute compte." };
    } else if (peakTimeSlot.id === "morning" && peakTimeSlot.pct >= 28) {
      archetype = { title: "Lecteur de l'Aube", emoji: "🌅", desc: "Tu démarres tes journées un livre à la main avant le tumulte." };
    } else if (weekendPct >= 45) {
      archetype = { title: "Marathonien du Week-End", emoji: "🛋️", desc: "Tu profites des week-ends pour enchaîner de longues sessions immersives." };
    }

    const avgGlobal = finishedBooks.filter((b) => Number(b.rating_global || 0) > 0);
    const avgRating = avgGlobal.length > 0
      ? Math.round((avgGlobal.reduce((a, b) => a + Number(b.rating_global), 0) / avgGlobal.length) * 100) / 100
      : null;

    return {
      archetype,
      finishedCount: finishedBooks.length,
      dnfCount: dnfBooks.length,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      totalPages,
      avgRating,
      criteriaStats,
      rankedCriteria,
      topDriver,
      forgivenCriterion,
      speedCurve,
      curveInsight,
      slots,
      peakTimeSlot,
      peakSpeedSlot,
      focusPct,
      weekendPct,
      genreStats: genreStats.sort((a, b) => b.read - a.read).slice(0, 5),
      mostReadGenre,
      bestRatedGenre,
      topKeywords
    };
  };

  // ==========================================
  // 2. OUTILS CANVAS & PROXY COUVERTURES (SANS TAINTED CANVAS)
  // ==========================================
  function loadCoverImage(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const cleanUrl = String(url).trim();
      const proxied = cleanUrl.startsWith("https://")
        ? `/api/cover-proxy?url=${encodeURIComponent(cleanUrl)}`
        : cleanUrl;
      const img = new Image();
      img.crossOrigin = "anonymous";
      const timer = setTimeout(() => resolve(null), 5500);
      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = proxied;
    });
  }

  function createStoryCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = STORY_W;
    canvas.height = STORY_H;
    const ctx = canvas.getContext("2d");

    // Fond premium dégradé sombre StaTome
    const bg = ctx.createLinearGradient(0, 0, STORY_W, STORY_H);
    bg.addColorStop(0, "#0B1120");
    bg.addColorStop(0.5, "#111A33");
    bg.addColorStop(1, "#090E1C");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, STORY_W, STORY_H);

    // Halos lumineux subtils
    const glow1 = ctx.createRadialGradient(180, 220, 20, 180, 220, 520);
    glow1.addColorStop(0, "rgba(99, 102, 241, 0.24)");
    glow1.addColorStop(1, "rgba(99, 102, 241, 0)");
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, STORY_W, STORY_H);

    const glow2 = ctx.createRadialGradient(900, 1650, 20, 900, 1650, 560);
    glow2.addColorStop(0, "rgba(56, 189, 248, 0.16)");
    glow2.addColorStop(1, "rgba(56, 189, 248, 0)");
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, STORY_W, STORY_H);

    return { canvas, ctx };
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function drawCoverFit(ctx, img, x, y, w, h, r = 14, fallbackTitle = "") {
    ctx.save();
    drawRoundedRect(ctx, x, y, w, h, r);
    ctx.clip();
    if (img) {
      const imgRatio = img.width / img.height;
      const boxRatio = w / h;
      let dw = w, dh = h, dx = x, dy = y;
      if (imgRatio > boxRatio) {
        dh = h;
        dw = h * imgRatio;
        dx = x - (dw - w) / 2;
      } else {
        dw = w;
        dh = w / imgRatio;
        dy = y - (dh - h) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = "#1E293B";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#94A3B8";
      ctx.font = `600 ${Math.max(16, Math.round(w * 0.12))}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = "center";
      wrapText(ctx, fallbackTitle || "📖", x + w / 2, y + h / 2, w - 16, Math.max(20, Math.round(w * 0.15)), 3);
    }
    ctx.restore();
    // Bordure discrète
    ctx.save();
    drawRoundedRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 6) {
    const words = String(text || "").split(/\s+/);
    let line = "";
    let lineCount = 0;
    let curY = y;
    for (let i = 0; i < words.length; i++) {
      const testLine = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(testLine).width > maxWidth && line) {
        lineCount++;
        if (lineCount >= maxLines) {
          ctx.fillText(line.slice(0, -1) + "…", x, curY);
          return curY + lineHeight;
        }
        ctx.fillText(line, x, curY);
        line = words[i];
        curY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, x, curY);
      curY += lineHeight;
    }
    return curY;
  }

  function drawBrandFooter(ctx, subtitle = "Mon suivi de lecture") {
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, STORY_H - 135);
    ctx.lineTo(STORY_W - 80, STORY_H - 135);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#F8FAFC";
    ctx.font = "800 34px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("📖 StaTome", 80, STORY_H - 72);

    ctx.textAlign = "right";
    ctx.fillStyle = "#94A3B8";
    ctx.font = "500 26px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(subtitle, STORY_W - 80, STORY_H - 72);
    ctx.restore();
  }

  function drawRadarPolygon(ctx, cx, cy, radius, labels, values) {
    const n = labels.length;
    ctx.save();
    // Grilles concentriques (1 à 5)
    for (let level = 1; level <= 5; level++) {
      const r = (radius * level) / 5;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const px = cx + r * Math.cos(ang);
        const py = cy + r * Math.sin(ang);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = level === 5 ? "rgba(148,163,184,0.35)" : "rgba(148,163,184,0.16)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Axes
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.cos(ang), cy + radius * Math.sin(ang));
      ctx.strokeStyle = "rgba(148,163,184,0.18)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Polygone des notes
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, Math.min(5, Number(values[i] || 0)));
      const r = (radius * v) / 5;
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const px = cx + r * Math.cos(ang);
      const py = cy + r * Math.sin(ang);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(99, 102, 241, 0.35)";
    ctx.fill();
    ctx.strokeStyle = "#818CF8";
    ctx.lineWidth = 5;
    ctx.stroke();

    // Points + Labels
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, Math.min(5, Number(values[i] || 0)));
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const r = (radius * v) / 5;
      ctx.beginPath();
      ctx.arc(cx + r * Math.cos(ang), cy + r * Math.sin(ang), 8, 0, Math.PI * 2);
      ctx.fillStyle = "#38BDF8";
      ctx.fill();

      const lx = cx + (radius + 54) * Math.cos(ang);
      const ly = cy + (radius + 44) * Math.sin(ang);
      ctx.fillStyle = "#E2E8F0";
      ctx.font = "700 26px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(labels[i], lx, ly);
      ctx.fillStyle = "#818CF8";
      ctx.font = "700 24px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(v > 0 ? `${v}/5` : "—", lx, ly + 30);
    }
    ctx.restore();
  }

  let carouselSlides = []; // [{ label, dataUrl, blob, filename }]
  let carouselIdx = 0;
  let carouselModalTitle = "Story";

  function canvasToBlobAsync(canvas) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  }

  function updateCarouselUiState() {
    const slide = carouselSlides[carouselIdx];
    const lblEl = document.getElementById("story-carousel-label");
    if (lblEl && slide) {
      lblEl.textContent = `${slide.label} (${carouselIdx + 1}/${carouselSlides.length})`;
    }
    document.querySelectorAll(".story-carousel-dot").forEach((dot, i) => {
      dot.style.width = i === carouselIdx ? "18px" : "7px";
      dot.style.background = i === carouselIdx ? "#818CF8" : "rgba(148,163,184,0.35)";
    });
  }

  let carouselScrollTick = null;
  window.onStoryCarouselScroll = function (el) {
    if (!el || carouselSlides.length <= 1) return;
    if (carouselScrollTick) clearTimeout(carouselScrollTick);
    carouselScrollTick = setTimeout(() => {
      const w = el.clientWidth || 1;
      const newIdx = Math.max(0, Math.min(carouselSlides.length - 1, Math.round(el.scrollLeft / w)));
      if (newIdx !== carouselIdx) {
        carouselIdx = newIdx;
        updateCarouselUiState();
      }
    }, 60);
  };

  function renderCarouselModalBody() {
    const slide = carouselSlides[carouselIdx];
    if (!slide) return;
    const total = carouselSlides.length;
    const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

    const navHtml = total > 1 ? `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
        <button class="btn" style="padding:5px 12px;font-size:0.8rem;" onclick="window.shiftStorySlide(-1)">◀️ Préc.</button>
        <div style="text-align:center;">
          <div id="story-carousel-label" style="font-size:0.78rem;font-weight:700;color:var(--primary-light);">${slide.label} (${carouselIdx + 1}/${total})</div>
          <div style="display:flex;justify-content:center;gap:6px;margin-top:4px;">
            ${carouselSlides.map((_, i) => `
              <span class="story-carousel-dot" onclick="window.setStorySlide(${i})" style="cursor:pointer;width:${i === carouselIdx ? "18px" : "7px"};height:7px;border-radius:999px;background:${i === carouselIdx ? "#818CF8" : "rgba(148,163,184,0.35)"};transition:all 0.2s;"></span>
            `).join("")}
          </div>
        </div>
        <button class="btn" style="padding:5px 12px;font-size:0.8rem;" onclick="window.shiftStorySlide(1)">Suiv. ▶️</button>
      </div>
    ` : "";

    const multiShareHtml = total > 1 ? `
      <div style="display:grid;grid-template-columns:${canShare ? "1fr 1fr" : "1fr"};gap:8px;margin-top:8px;">
        ${canShare ? `<button class="btn btn-primary" style="padding:10px;font-size:0.84rem;" onclick="window.shareAllStorySlides()">📤 Partager tout (${total} slides)</button>` : ""}
        <button class="btn" style="padding:10px;font-size:0.84rem;" onclick="window.downloadAllStorySlides()">⬇️ Tout télécharger (${total})</button>
      </div>
    ` : "";

    window.openModal(`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
        <h3 style="margin:0;font-size:0.98rem;">📸 ${carouselModalTitle}</h3>
        <button class="btn" style="padding:4px 10px;" onclick="window.closeModal()">✕</button>
      </div>
      ${navHtml}
      <div id="story-carousel-track" onscroll="window.onStoryCarouselScroll(this)" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;background:#070B14;border-radius:12px;border:1px solid var(--border);">
        ${carouselSlides.map((s) => `
          <div style="flex:0 0 100%;width:100%;scroll-snap-align:center;display:flex;justify-content:center;align-items:center;padding:8px;box-sizing:border-box;">
            <img src="${s.dataUrl}" alt="${s.label}" style="max-height:54vh;max-width:100%;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.6);pointer-events:none;user-select:none;" />
          </div>
        `).join("")}
      </div>
      ${multiShareHtml}
      <div style="display:grid;grid-template-columns:${canShare ? "1fr 1fr" : "1fr"};gap:8px;margin-top:8px;">
        ${canShare ? `<button class="btn ${total > 1 ? "" : "btn-primary"}" style="padding:9px;font-size:0.82rem;" onclick="window.shareCurrentStorySlide()">📤 ${total > 1 ? "Partager cette slide" : "Partager (Story)"}</button>` : ""}
        <button class="btn ${!canShare && total === 1 ? "btn-primary" : ""}" style="padding:9px;font-size:0.82rem;" onclick="window.downloadCurrentStorySlide()">⬇️ ${total > 1 ? "Télécharger cette slide" : "Télécharger PNG"}</button>
      </div>
      <div style="font-size:0.72rem;color:var(--muted);text-align:center;margin-top:7px;">
        ${total > 1 ? "👈 Glissez horizontalement pour parcourir les slides • " : ""}Format HD 1080×1920 prêt pour Instagram / TikTok.
      </div>
    `);
  }

  async function openStoryCarouselModal(rawSlides, title) {
    carouselModalTitle = title || "Carrousel Story";
    carouselIdx = 0;
    carouselSlides = await Promise.all(
      rawSlides.map(async (s) => ({
        label: s.label || "Slide",
        filename: s.filename || "statome-story.png",
        dataUrl: s.canvas.toDataURL("image/png"),
        blob: await canvasToBlobAsync(s.canvas)
      }))
    );
    renderCarouselModalBody();
  }

  async function openStoryPreviewModal(canvas, title, filename) {
    await openStoryCarouselModal([{ label: title, canvas, filename }], title);
  }

  window.setStorySlide = function (idx) {
    if (idx < 0 || idx >= carouselSlides.length) return;
    carouselIdx = idx;
    updateCarouselUiState();
    const track = document.getElementById("story-carousel-track");
    if (track) {
      track.scrollTo({ left: idx * track.clientWidth, behavior: "smooth" });
    }
  };

  window.shiftStorySlide = function (delta) {
    if (carouselSlides.length <= 1) return;
    const nextIdx = (carouselIdx + delta + carouselSlides.length) % carouselSlides.length;
    window.setStorySlide(nextIdx);
  };

  function triggerBlobDownload(blob, filename) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  window.downloadCurrentStorySlide = function () {
    const s = carouselSlides[carouselIdx];
    if (s) triggerBlobDownload(s.blob, s.filename);
  };

  window.downloadAllStorySlides = function () {
    carouselSlides.forEach((s, i) => {
      setTimeout(() => triggerBlobDownload(s.blob, s.filename), i * 300);
    });
  };

  window.shareCurrentStorySlide = async function () {
    const s = carouselSlides[carouselIdx];
    if (!s || !s.blob) return;
    try {
      const file = new File([s.blob], s.filename, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `StaTome — ${s.label}` });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    triggerBlobDownload(s.blob, s.filename);
  };

  window.shareAllStorySlides = async function () {
    const files = carouselSlides
      .filter((s) => s.blob)
      .map((s) => new File([s.blob], s.filename, { type: "image/png" }));
    if (files.length === 0) return;
    try {
      if (navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({ files, title: `StaTome — ${carouselModalTitle}` });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    window.downloadAllStorySlides();
  };

  function showExportLoading(label) {
    window.openModal(`
      <div style="text-align:center;padding:28px 14px;">
        <div style="font-size:2.4rem;margin-bottom:10px;">🎨</div>
        <div style="font-weight:700;font-size:1rem;">Génération de votre Story HD...</div>
        <div style="font-size:0.82rem;color:var(--muted);margin-top:6px;">${label}</div>
      </div>
    `);
  }

  // ==========================================
  // 3. EXPORT 1 — CALENDRIER MENSUEL EN COUVERTURES
  // ==========================================
  window.exportMonthlyCalendarStory = async function (year, monthIdx) {
    const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const mName = months[monthIdx] || "";
    showExportLoading(`Calendrier ${mName} ${year}`);

    const sessions = (window.state && window.state.sessions) || [];
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const firstDow = (new Date(year, monthIdx, 1).getDay() + 6) % 7;

    const dayCoverMap = {};
    let totPages = 0;
    let totMins = 0;
    const uniqueCoverUrls = new Set();

    for (let d = 1; d <= daysInMonth; d++) {
      const dKey = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const ds = sessions.filter((s) => {
        const dt = new Date(s.start_time);
        if (isNaN(dt.getTime())) return false;
        const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
        return k === dKey;
      });
      if (ds.length > 0) {
        totPages += ds.reduce((a, s) => a + Number(s.pages_read || 0), 0);
        totMins += ds.reduce((a, s) => a + Number(s.duration_minutes || 0), 0);
        const best = ds.find((s) => s.book_cover) || ds[0];
        dayCoverMap[d] = { cover: best.book_cover || "", title: best.book_title || "" };
        if (best.book_cover) uniqueCoverUrls.add(best.book_cover);
      }
    }

    const imgCache = {};
    await Promise.all(
      Array.from(uniqueCoverUrls).map(async (u) => {
        imgCache[u] = await loadCoverImage(u);
      })
    );

    const { canvas, ctx } = createStoryCanvas();
    ctx.textAlign = "center";
    ctx.fillStyle = "#818CF8";
    ctx.font = "700 30px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("CALENDRIER DE LECTURE", STORY_W / 2, 130);

    ctx.fillStyle = "#F8FAFC";
    ctx.font = "800 68px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(`${mName} ${year}`, STORY_W / 2, 215);

    const activeDays = Object.keys(dayCoverMap).length;
    ctx.fillStyle = "#94A3B8";
    ctx.font = "600 30px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(`${activeDays} jours lus • ${totPages} pages • ${Math.round((totMins / 60) * 10) / 10} h`, STORY_W / 2, 275);

    const padX = 56;
    const gap = 12;
    const cellW = Math.floor((STORY_W - padX * 2 - gap * 6) / 7);
    const cellH = 195;
    const startY = 365;
    const headers = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];

    ctx.font = "700 24px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "#64748B";
    headers.forEach((h, i) => {
      ctx.fillText(h, padX + i * (cellW + gap) + cellW / 2, startY - 22);
    });

    for (let d = 1; d <= daysInMonth; d++) {
      const idx = firstDow + (d - 1);
      const col = idx % 7;
      const row = Math.floor(idx / 7);
      const x = padX + col * (cellW + gap);
      const y = startY + row * (cellH + gap);

      const info = dayCoverMap[d];
      if (info && info.cover && imgCache[info.cover]) {
        drawCoverFit(ctx, imgCache[info.cover], x, y, cellW, cellH, 12, info.title);
      } else {
        drawRoundedRect(ctx, x, y, cellW, cellH, 12);
        ctx.fillStyle = info ? "rgba(99,102,241,0.22)" : "rgba(30,41,59,0.55)";
        ctx.fill();
        ctx.strokeStyle = info ? "rgba(129,140,248,0.5)" : "rgba(148,163,184,0.14)";
        ctx.lineWidth = 2;
        ctx.stroke();
        if (info) {
          ctx.fillStyle = "#E2E8F0";
          ctx.font = "600 20px -apple-system, BlinkMacSystemFont, sans-serif";
          wrapText(ctx, info.title, x + cellW / 2, y + cellH / 2, cellW - 14, 24, 3);
        }
      }

      // Pastille numéro du jour
      ctx.save();
      drawRoundedRect(ctx, x + 6, y + 6, 36, 30, 8);
      ctx.fillStyle = "rgba(11,17,32,0.78)";
      ctx.fill();
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "700 20px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(d), x + 24, y + 28);
      ctx.restore();
    }

    drawBrandFooter(ctx, `Calendrier ${mName} ${year}`);
    openStoryPreviewModal(canvas, `Calendrier ${mName} ${year}`, `statome-calendrier-${year}-${monthIdx + 1}.png`);
  };

  // ==========================================
  // 4. EXPORT 2 — CARROUSEL BILAN DU MOIS / ANNÉE (4 SLIDES HD)
  // ==========================================
  window.exportWrapUpStory = async function (mode = "month") {
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth();
    const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const monthsShort = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
    const periodPrefix = mode === "month"
      ? `${curY}-${String(curM + 1).padStart(2, "0")}`
      : String(curY);
    const periodLabel = mode === "month" ? `${months[curM]} ${curY}` : `Année ${curY}`;

    showExportLoading(`Carrousel 4 slides — ${periodLabel}`);

    const books = (window.state && window.state.books) || [];
    const sessions = (window.state && window.state.sessions) || [];
    const booksById = {};
    books.forEach((b) => { booksById[Number(b.id)] = b; });

    // Associer chaque livre à sa dernière session (pour rattraper les livres marqués "Terminé" sans finished_at)
    const lastSessionDateByBook = {};
    sessions.forEach((s) => {
      const bid = Number(s.book_id);
      const dtStr = String(s.start_time || "");
      if (!lastSessionDateByBook[bid] || dtStr > lastSessionDateByBook[bid]) {
        lastSessionDateByBook[bid] = dtStr;
      }
    });

    const periodBooks = books
      .filter((b) => {
        if (b.status !== "Terminé") return false;
        if (b.finished_at) return String(b.finished_at).startsWith(periodPrefix);
        const lastSess = lastSessionDateByBook[Number(b.id)] || "";
        return lastSess.startsWith(periodPrefix);
      })
      .sort((a, b) => Number(b.rating_global || 0) - Number(a.rating_global || 0));

    const periodSessions = sessions.filter((s) => String(s.start_time || "").startsWith(periodPrefix));
    const totPages = periodSessions.reduce((a, s) => a + Number(s.pages_read || 0), 0) ||
      periodBooks.reduce((a, b) => a + Number(b.page_count || 0), 0);
    const totMins = periodSessions.reduce((a, s) => a + Number(s.duration_minutes || 0), 0);
    const totHours = Math.round((totMins / 60) * 10) / 10;
    const rated = periodBooks.filter((b) => Number(b.rating_global || 0) > 0);
    const avgNote = rated.length > 0
      ? (rated.reduce((a, b) => a + Number(b.rating_global), 0) / rated.length).toFixed(2)
      : "—";
    const favoriteBook = rated[0] || periodBooks[0] || null;

    // Précharger toutes les couvertures utiles en parallèle
    const coverUrls = new Set();
    periodBooks.slice(0, 12).forEach((b) => { if (b.cover_url) coverUrls.add(b.cover_url); });
    periodSessions.forEach((s) => { if (s.book_cover) coverUrls.add(s.book_cover); });
    const imgCache = {};
    await Promise.all(
      Array.from(coverUrls).map(async (u) => {
        imgCache[u] = await loadCoverImage(u);
      })
    );

    const drawSlidePill = (ctx, idx, total) => {
      ctx.save();
      drawRoundedRect(ctx, STORY_W - 185, 62, 115, 44, 22);
      ctx.fillStyle = "rgba(129,140,248,0.2)";
      ctx.fill();
      ctx.strokeStyle = "rgba(129,140,248,0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = "#C7D2FE";
      ctx.font = "700 24px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(`${idx} / ${total}`, STORY_W - 127, 92);
      ctx.restore();
    };

    // ---------------------------------------------------------
    // SLIDE 1/4 : RÉSUMÉ & MOSAÏQUE DES LIVRES DE LA PÉRIODE
    // ---------------------------------------------------------
    const s1 = createStoryCanvas();
    {
      const { ctx } = s1;
      drawSlidePill(ctx, 1, 4);
      ctx.textAlign = "center";
      ctx.fillStyle = "#38BDF8";
      ctx.font = "700 30px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(mode === "month" ? "BILAN DU MOIS" : "BILAN DE L'ANNÉE", STORY_W / 2, 125);

      ctx.fillStyle = "#F8FAFC";
      ctx.font = "800 72px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(periodLabel, STORY_W / 2, 210);

      const kpis = [
        { v: String(periodBooks.length), l: "Livres lus" },
        { v: String(totPages), l: "Pages" },
        { v: `${totHours} h`, l: "Temps lu" },
        { v: avgNote !== "—" ? `${avgNote}★` : "—", l: "Note moy." }
      ];
      const kW = 218, kH = 126, kGap = 20, kStartX = (STORY_W - (kW * 4 + kGap * 3)) / 2;
      kpis.forEach((k, i) => {
        const kx = kStartX + i * (kW + kGap);
        drawRoundedRect(ctx, kx, 265, kW, kH, 20);
        ctx.fillStyle = "rgba(30,41,59,0.85)";
        ctx.fill();
        ctx.strokeStyle = "rgba(129,140,248,0.35)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#F8FAFC";
        ctx.font = "800 44px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(k.v, kx + kW / 2, 330);
        ctx.fillStyle = "#94A3B8";
        ctx.font = "600 24px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(k.l, kx + kW / 2, 368);
      });

      const mosaicBooks = periodBooks.slice(0, 12);
      if (mosaicBooks.length > 0) {
        const cols = mosaicBooks.length <= 4 ? mosaicBooks.length : (mosaicBooks.length <= 6 ? 3 : 4);
        const mGap = 24;
        const maxGridW = 920;
        const maxSingleW = mosaicBooks.length === 1 ? 360 : (mosaicBooks.length === 2 ? 300 : 220);
        const cw = Math.min(maxSingleW, Math.floor((maxGridW - mGap * (cols - 1)) / cols));
        const ch = Math.round(cw * 1.48);
        const totalGridW = cols * cw + (cols - 1) * mGap;
        const startX = (STORY_W - totalGridW) / 2;
        const startY = mosaicBooks.length <= 2 ? 520 : 445;

        mosaicBooks.forEach((b, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          const bx = startX + c * (cw + mGap);
          const by = startY + r * (ch + mGap);
          drawCoverFit(ctx, b.cover_url ? imgCache[b.cover_url] : null, bx, by, cw, ch, 14, b.title);
          if (Number(b.rating_global || 0) > 0) {
            drawRoundedRect(ctx, bx + cw - 82, by + ch - 38, 74, 30, 10);
            ctx.fillStyle = "rgba(11,17,32,0.86)";
            ctx.fill();
            ctx.fillStyle = "#FBBF24";
            ctx.font = "700 20px -apple-system, BlinkMacSystemFont, sans-serif";
            ctx.fillText(`★ ${b.rating_global}`, bx + cw - 45, by + ch - 16);
          }
        });
      } else {
        ctx.fillStyle = "#64748B";
        ctx.font = "600 32px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText("Aucun livre terminé sur cette période", STORY_W / 2, 760);
      }

      if (favoriteBook) {
        const boxY = 1490;
        drawRoundedRect(ctx, 80, boxY, STORY_W - 160, 210, 24);
        ctx.fillStyle = "rgba(99,102,241,0.16)";
        ctx.fill();
        ctx.strokeStyle = "rgba(129,140,248,0.5)";
        ctx.lineWidth = 2;
        ctx.stroke();

        drawCoverFit(ctx, favoriteBook.cover_url ? imgCache[favoriteBook.cover_url] : null, 110, boxY + 25, 105, 160, 10, favoriteBook.title);

        ctx.textAlign = "left";
        ctx.fillStyle = "#FBBF24";
        ctx.font = "700 25px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText("🏆 COUP DE CŒUR", 242, boxY + 62);

        ctx.fillStyle = "#F8FAFC";
        ctx.font = "800 36px -apple-system, BlinkMacSystemFont, sans-serif";
        wrapText(ctx, favoriteBook.title, 242, boxY + 114, 710, 42, 1);

        ctx.fillStyle = "#CBD5E1";
        ctx.font = "600 27px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(
          `${favoriteBook.author}${favoriteBook.rating_global ? ` • ★ ${favoriteBook.rating_global}/5` : ""}`,
          242,
          boxY + 162
        );
      }
      drawBrandFooter(ctx, `Résumé • ${periodLabel}`);
    }

    // ---------------------------------------------------------
    // SLIDE 2/4 : CALENDRIER / RYTHME & VITESSE DE LECTURE
    // ---------------------------------------------------------
    const s2 = createStoryCanvas();
    {
      const { ctx } = s2;
      drawSlidePill(ctx, 2, 4);
      ctx.textAlign = "center";
      ctx.fillStyle = "#34D399";
      ctx.font = "700 30px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("RYTHME & RÉGULARITÉ", STORY_W / 2, 125);

      ctx.fillStyle = "#F8FAFC";
      ctx.font = "800 64px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(mode === "month" ? `Calendrier ${periodLabel}` : `Activité ${curY}`, STORY_W / 2, 205);

      const visualFocusSess = periodSessions.filter((s) => {
        const b = booksById[Number(s.book_id)];
        return (!b || b.format !== "Audio") && s.is_focused !== false;
      });
      const focusMinsV = visualFocusSess.reduce((a, s) => a + Number(s.duration_minutes || 0), 0);
      const focusPagesV = visualFocusSess.reduce((a, s) => a + Number(s.pages_read || 0), 0);
      const focusSpeed = focusMinsV > 0 && focusPagesV > 0 ? Math.round((focusPagesV / focusMinsV) * 60) : 0;

      const activeDaySet = new Set();
      let focusAllM = 0;
      periodSessions.forEach((s) => {
        const dt = new Date(s.start_time);
        if (!isNaN(dt.getTime())) {
          activeDaySet.add(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`);
        }
        if (s.is_focused !== false) focusAllM += Number(s.duration_minutes || 0);
      });
      const focusRatio = totMins > 0 ? Math.round((focusAllM / totMins) * 100) : 100;
      const avgSessMin = periodSessions.length > 0 ? Math.round(totMins / periodSessions.length) : 0;

      if (mode === "month") {
        // Mini calendrier mensuel en couvertures
        const daysInMonth = new Date(curY, curM + 1, 0).getDate();
        const firstDow = (new Date(curY, curM, 1).getDay() + 6) % 7;
        const padX = 64;
        const gap = 10;
        const cellW = Math.floor((STORY_W - padX * 2 - gap * 6) / 7);
        const cellH = 160;
        const startY = 300;
        const headers = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];

        ctx.font = "700 22px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillStyle = "#64748B";
        headers.forEach((h, i) => ctx.fillText(h, padX + i * (cellW + gap) + cellW / 2, startY - 18));

        for (let d = 1; d <= daysInMonth; d++) {
          const dKey = `${curY}-${String(curM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const ds = periodSessions.filter((s) => {
            const dt = new Date(s.start_time);
            if (isNaN(dt.getTime())) return false;
            return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}` === dKey;
          });
          const idx = firstDow + (d - 1);
          const col = idx % 7;
          const row = Math.floor(idx / 7);
          const x = padX + col * (cellW + gap);
          const y = startY + row * (cellH + gap);

          const best = ds.find((s) => s.book_cover) || ds[0];
          if (best && best.book_cover && imgCache[best.book_cover]) {
            drawCoverFit(ctx, imgCache[best.book_cover], x, y, cellW, cellH, 10, best.book_title);
          } else {
            drawRoundedRect(ctx, x, y, cellW, cellH, 10);
            ctx.fillStyle = ds.length > 0 ? "rgba(52,211,153,0.22)" : "rgba(30,41,59,0.5)";
            ctx.fill();
            ctx.strokeStyle = ds.length > 0 ? "rgba(52,211,153,0.55)" : "rgba(148,163,184,0.14)";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          drawRoundedRect(ctx, x + 5, y + 5, 32, 26, 7);
          ctx.fillStyle = "rgba(11,17,32,0.8)";
          ctx.fill();
          ctx.fillStyle = "#F8FAFC";
          ctx.font = "700 18px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(String(d), x + 21, y + 24);
        }
      } else {
        // Graphique barres 12 mois de l'année
        const monthCounts = Array.from({ length: 12 }, (_, m) => {
          const pref = `${curY}-${String(m + 1).padStart(2, "0")}`;
          const bCnt = periodBooks.filter((b) => String(b.finished_at || "").startsWith(pref)).length;
          const pCnt = periodSessions.filter((s) => String(s.start_time || "").startsWith(pref)).reduce((a, s) => a + Number(s.pages_read || 0), 0);
          return { m, bCnt, pCnt };
        });
        const maxVal = Math.max(1, ...monthCounts.map((x) => x.bCnt > 0 ? x.bCnt : 0));
        const chartX = 80, chartY = 330, chartW = STORY_W - 160, chartH = 740;
        drawRoundedRect(ctx, chartX, chartY, chartW, chartH, 26);
        ctx.fillStyle = "rgba(30,41,59,0.65)";
        ctx.fill();
        ctx.strokeStyle = "rgba(148,163,184,0.2)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#CBD5E1";
        ctx.font = "700 28px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText("Livres terminés mois par mois", STORY_W / 2, chartY + 58);

        const barGap = 16;
        const barW = Math.floor((chartW - 80 - barGap * 11) / 12);
        const baseLineY = chartY + chartH - 95;
        const maxBarH = 490;

        monthCounts.forEach((mc, i) => {
          const bx = chartX + 40 + i * (barW + barGap);
          const bh = mc.bCnt > 0 ? Math.max(24, Math.round((mc.bCnt / maxVal) * maxBarH)) : 8;
          const isBest = mc.bCnt === maxVal && mc.bCnt > 0;
          drawRoundedRect(ctx, bx, baseLineY - bh, barW, bh, 10);
          ctx.fillStyle = isBest ? "#34D399" : (mc.bCnt > 0 ? "#818CF8" : "rgba(148,163,184,0.2)");
          ctx.fill();

          if (mc.bCnt > 0) {
            ctx.fillStyle = isBest ? "#34D399" : "#F8FAFC";
            ctx.font = "800 26px -apple-system, BlinkMacSystemFont, sans-serif";
            ctx.fillText(String(mc.bCnt), bx + barW / 2, baseLineY - bh - 14);
          }
          ctx.fillStyle = "#94A3B8";
          ctx.font = "700 22px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.fillText(monthsShort[i], bx + barW / 2, baseLineY + 38);
        });
      }

      // 4 cartes stats de rythme en bas
      const rStats = [
        { e: "⚡", v: focusSpeed > 0 ? `${focusSpeed} p/h` : "—", l: "Vitesse Focus" },
        { e: "🔥", v: `${activeDaySet.size} j.`, l: "Jours actifs" },
        { e: "⏱️", v: avgSessMin > 0 ? `${avgSessMin} min` : "—", l: "Moy. / session" },
        { e: "🎯", v: `${focusRatio}%`, l: "Lecture Focus" }
      ];
      const boxW = 445, boxH = 150, bGap = 30;
      rStats.forEach((st, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const rx = 80 + col * (boxW + bGap);
        const ry = 1365 + row * (boxH + 26);
        drawRoundedRect(ctx, rx, ry, boxW, boxH, 22);
        ctx.fillStyle = "rgba(30,41,59,0.85)";
        ctx.fill();
        ctx.strokeStyle = "rgba(52,211,153,0.32)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.textAlign = "left";
        ctx.fillStyle = "#94A3B8";
        ctx.font = "700 24px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(`${st.e} ${st.l}`, rx + 28, ry + 54);

        ctx.fillStyle = "#F8FAFC";
        ctx.font = "800 48px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(st.v, rx + 28, ry + 116);
      });

      drawBrandFooter(ctx, `Rythme • ${periodLabel}`);
    }

    // ---------------------------------------------------------
    // SLIDE 3/4 : GENRES, SOUS-GENRES & FORMATS
    // ---------------------------------------------------------
    const s3 = createStoryCanvas();
    {
      const { ctx } = s3;
      drawSlidePill(ctx, 3, 4);
      ctx.textAlign = "center";
      ctx.fillStyle = "#E879F9";
      ctx.font = "700 30px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("UNIVERS & SAVEURS", STORY_W / 2, 125);

      ctx.fillStyle = "#F8FAFC";
      ctx.font = "800 64px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("Genres & Sous-genres", STORY_W / 2, 205);

      // Comptage Genres, Sous-genres et Formats (livres terminés ou lus pendant la période)
      const activeBookIds = new Set(periodSessions.map((s) => Number(s.book_id)));
      const genreSourceBooks = periodBooks.length > 0
        ? periodBooks
        : books.filter((b) => activeBookIds.has(Number(b.id)));

      const gMap = {};
      const sgMap = {};
      const fmtMap = { Papier: 0, Liseuse: 0, Audio: 0 };
      const sizeMap = { court: 0, moyen: 0, long: 0, pave: 0 };
      let sumBookPages = 0;

      genreSourceBooks.forEach((b) => {
        const gs = Array.isArray(b.genres) && b.genres.length > 0 ? b.genres : ["Autre"];
        gs.forEach((g) => {
          if (!gMap[g]) gMap[g] = { name: g, count: 0, rSum: 0, rCnt: 0 };
          gMap[g].count++;
          if (Number(b.rating_global || 0) > 0) {
            gMap[g].rSum += Number(b.rating_global);
            gMap[g].rCnt++;
          }
        });
        (b.fantasy_subgenres || []).forEach((sg) => {
          sgMap[sg] = (sgMap[sg] || 0) + 1;
        });
        if (b.format === "Audio") fmtMap.Audio++;
        else if (b.format === "Numérique") fmtMap.Liseuse++;
        else fmtMap.Papier++;

        const p = Number(b.page_count || 0);
        if (p > 0) {
          sumBookPages += p;
          if (p < 300) sizeMap.court++;
          else if (p < 500) sizeMap.moyen++;
          else if (p < 700) sizeMap.long++;
          else sizeMap.pave++;
        }
      });

      const topGenres = Object.values(gMap).sort((a, b) => b.count - a.count).slice(0, 4);
      const topSubgenres = Object.entries(sgMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const totalGenreCount = Math.max(1, topGenres.reduce((a, g) => a + g.count, 0));
      const barColors = ["#818CF8", "#38BDF8", "#E879F9", "#34D399", "#FB923C"];

      // Bloc 1 : Top Genres
      drawRoundedRect(ctx, 80, 260, STORY_W - 160, 465, 26);
      ctx.fillStyle = "rgba(30,41,59,0.78)";
      ctx.fill();
      ctx.strokeStyle = "rgba(129,140,248,0.28)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#818CF8";
      ctx.font = "700 25px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("📚 TOP GENRES LUS", 120, 318);

      if (topGenres.length > 0) {
        topGenres.forEach((g, i) => {
          const gy = 374 + i * 86;
          const pct = Math.round((g.count / totalGenreCount) * 100);
          const avgR = g.rCnt > 0 ? ` • ★ ${(g.rSum / g.rCnt).toFixed(1)}` : "";

          ctx.textAlign = "left";
          ctx.fillStyle = "#F8FAFC";
          ctx.font = "700 28px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.fillText(g.name, 120, gy);

          ctx.textAlign = "right";
          ctx.fillStyle = "#CBD5E1";
          ctx.font = "700 25px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.fillText(`${g.count} (${pct}%)${avgR}`, STORY_W - 120, gy);

          const trackW = STORY_W - 240;
          drawRoundedRect(ctx, 120, gy + 14, trackW, 20, 10);
          ctx.fillStyle = "rgba(15,23,42,0.8)";
          ctx.fill();

          drawRoundedRect(ctx, 120, gy + 14, Math.max(32, Math.round((pct / 100) * trackW)), 20, 10);
          ctx.fillStyle = barColors[i % barColors.length];
          ctx.fill();
        });
      } else {
        ctx.fillStyle = "#64748B";
        ctx.font = "600 28px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText("Aucune donnée de genre sur cette période.", 120, 420);
      }

      // Bloc 2 : Sous-genres favoris (pills)
      drawRoundedRect(ctx, 80, 755, STORY_W - 160, 290, 26);
      ctx.fillStyle = "rgba(30,41,59,0.78)";
      ctx.fill();
      ctx.strokeStyle = "rgba(232,121,249,0.32)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#E879F9";
      ctx.font = "700 25px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("✨ SOUS-GENRES DOMINANTS", 120, 812);

      if (topSubgenres.length > 0) {
        let px = 120;
        let py = 848;
        ctx.font = "700 25px -apple-system, BlinkMacSystemFont, sans-serif";
        topSubgenres.forEach(([sg, cnt]) => {
          const txt = `${sg} (${cnt})`;
          const w = ctx.measureText(txt).width + 40;
          if (px + w > STORY_W - 110) {
            px = 120;
            py += 64;
          }
          if (py > 980) return;
          drawRoundedRect(ctx, px, py, w, 48, 24);
          ctx.fillStyle = "rgba(232,121,249,0.16)";
          ctx.fill();
          ctx.strokeStyle = "rgba(232,121,249,0.5)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "#F5D0FE";
          ctx.fillText(txt, px + 20, py + 32);
          px += w + 14;
        });
      } else {
        ctx.fillStyle = "#64748B";
        ctx.font = "600 26px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText("Ajoute des sous-genres pour voir tes nuances favorites.", 120, 895);
      }

      // Bloc 3 : Taille des livres (Court / Moyen / Long / Pavé)
      drawRoundedRect(ctx, 80, 1075, STORY_W - 160, 315, 26);
      ctx.fillStyle = "rgba(30,41,59,0.78)";
      ctx.fill();
      ctx.strokeStyle = "rgba(52,211,153,0.32)";
      ctx.lineWidth = 2;
      ctx.stroke();

      const avgPagesPerBook = genreSourceBooks.length > 0 ? Math.round(sumBookPages / genreSourceBooks.length) : 0;
      ctx.textAlign = "left";
      ctx.fillStyle = "#34D399";
      ctx.font = "700 25px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("📏 TAILLE DES LIVRES", 120, 1132);
      if (avgPagesPerBook > 0) {
        ctx.textAlign = "right";
        ctx.fillStyle = "#94A3B8";
        ctx.font = "700 24px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(`Moy. ${avgPagesPerBook} pages/livre`, STORY_W - 120, 1132);
      }

      const totSized = Math.max(1, sizeMap.court + sizeMap.moyen + sizeMap.long + sizeMap.pave);
      const sizeCards = [
        { e: "⚡", lbl: "Court", sub: "< 300 p.", cnt: sizeMap.court, col: "#38BDF8" },
        { e: "📖", lbl: "Moyen", sub: "300–499 p.", cnt: sizeMap.moyen, col: "#818CF8" },
        { e: "📚", lbl: "Long", sub: "500–699 p.", cnt: sizeMap.long, col: "#E879F9" },
        { e: "🧱", lbl: "Pavé", sub: "700+ p.", cnt: sizeMap.pave, col: "#FBBF24" }
      ];
      const scW = 198, scGap = 16, scStartX = 120;
      sizeCards.forEach((sc, i) => {
        const sx = scStartX + i * (scW + scGap);
        const sy = 1165;
        const pct = Math.round((sc.cnt / totSized) * 100);
        drawRoundedRect(ctx, sx, sy, scW, 195, 18);
        ctx.fillStyle = "rgba(15,23,42,0.72)";
        ctx.fill();
        ctx.strokeStyle = sc.cnt > 0 ? `${sc.col}66` : "rgba(148,163,184,0.16)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.font = "34px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(sc.e, sx + scW / 2, sy + 48);

        ctx.fillStyle = sc.cnt > 0 ? sc.col : "#64748B";
        ctx.font = "800 40px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(String(sc.cnt), sx + scW / 2, sy + 102);

        ctx.fillStyle = "#F8FAFC";
        ctx.font = "700 22px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(`${sc.lbl} (${pct}%)`, sx + scW / 2, sy + 140);

        ctx.fillStyle = "#94A3B8";
        ctx.font = "600 18px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(sc.sub, sx + scW / 2, sy + 170);
      });

      // Bloc 4 : Formats (Papier / Liseuse / Audio)
      drawRoundedRect(ctx, 80, 1420, STORY_W - 160, 285, 26);
      ctx.fillStyle = "rgba(30,41,59,0.78)";
      ctx.fill();
      ctx.strokeStyle = "rgba(56,189,248,0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#38BDF8";
      ctx.font = "700 25px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("📖 FORMATS DE LECTURE", 120, 1478);

      const totFmt = Math.max(1, fmtMap.Papier + fmtMap.Liseuse + fmtMap.Audio);
      const fmtEntries = [
        { label: "📖 Papier", count: fmtMap.Papier, color: "#818CF8" },
        { label: "📱 Liseuse", count: fmtMap.Liseuse, color: "#38BDF8" },
        { label: "🎧 Audio", count: fmtMap.Audio, color: "#34D399" }
      ];
      const segW = STORY_W - 240;
      let curSegX = 120;
      fmtEntries.forEach((fe) => {
        if (fe.count <= 0) return;
        const w = Math.max(24, Math.round((fe.count / totFmt) * segW));
        drawRoundedRect(ctx, curSegX, 1515, Math.min(w, 120 + segW - curSegX), 32, 12);
        ctx.fillStyle = fe.color;
        ctx.fill();
        curSegX += w + 6;
      });

      fmtEntries.forEach((fe, i) => {
        const fx = 120 + i * 290;
        const pct = Math.round((fe.count / totFmt) * 100);
        ctx.fillStyle = fe.color;
        ctx.font = "800 36px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(`${pct}%`, fx, 1612);
        ctx.fillStyle = "#CBD5E1";
        ctx.font = "600 25px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(`${fe.label} (${fe.count})`, fx, 1652);
      });

      drawBrandFooter(ctx, `Genres & Tailles • ${periodLabel}`);
    }

    // ---------------------------------------------------------
    // SLIDE 4/4 : PALMARÈS TOP 3 & TEMPS FORTS / RECORDS
    // ---------------------------------------------------------
    const s4 = createStoryCanvas();
    {
      const { ctx } = s4;
      drawSlidePill(ctx, 4, 4);
      ctx.textAlign = "center";
      ctx.fillStyle = "#FBBF24";
      ctx.font = "700 30px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("PALMARÈS & RECORDS", STORY_W / 2, 125);

      ctx.fillStyle = "#F8FAFC";
      ctx.font = "800 64px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(`Temps forts ${periodLabel}`, STORY_W / 2, 205);

      // Podium Top 3 (ou livres lus sur la période si aucun terminé)
      const activeIdsS4 = new Set(periodSessions.map((s) => Number(s.book_id)));
      const podiumPool = periodBooks.length > 0
        ? periodBooks
        : books.filter((b) => activeIdsS4.has(Number(b.id))).sort((a, b) => Number(b.rating_global || 0) - Number(a.rating_global || 0));
      const top3 = podiumPool.slice(0, 3);
      const medals = ["🥇", "🥈", "🥉"];
      if (top3.length > 0) {
        const colW = top3.length === 1 ? 420 : 280;
        const colGap = 35;
        const startX = (STORY_W - (top3.length * colW + (top3.length - 1) * colGap)) / 2;
        top3.forEach((b, i) => {
          const bx = startX + i * (colW + colGap);
          const by = i === 0 ? 275 : 320;
          const cw = top3.length === 1 ? 280 : (i === 0 ? 260 : 230);
          const ch = Math.round(cw * 1.48);
          const cx = bx + (colW - cw) / 2;

          ctx.textAlign = "center";
          ctx.font = "54px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.fillText(medals[i], bx + colW / 2, by + 20);

          drawCoverFit(ctx, b.cover_url ? imgCache[b.cover_url] : null, cx, by + 42, cw, ch, 16, b.title);

          ctx.fillStyle = "#F8FAFC";
          ctx.font = "700 26px -apple-system, BlinkMacSystemFont, sans-serif";
          wrapText(ctx, b.title, bx + colW / 2, by + ch + 82, colW, 32, 2);

          if (Number(b.rating_global || 0) > 0) {
            ctx.fillStyle = "#FBBF24";
            ctx.font = "800 30px -apple-system, BlinkMacSystemFont, sans-serif";
            ctx.fillText(`★ ${b.rating_global}/5`, bx + colW / 2, by + ch + 150);
          }
        });
      }

      // Records de la période
      const biggestBook = [...podiumPool].sort((a, b) => Number(b.page_count || 0) - Number(a.page_count || 0))[0] || null;
      const dayPagesMap = {};
      const slotCounts = [0, 0, 0, 0, 0];
      const slotLabels = ["🌅 Matin (5h–11h)", "☀️ Midi (11h–14h)", "🌤️ Après-midi (14h–18h)", "🌆 Soirée (18h–22h)", "🌙 Nocturne (22h–5h)"];
      periodSessions.forEach((s) => {
        const dt = new Date(s.start_time);
        if (!isNaN(dt.getTime())) {
          const dk = `${dt.getDate()}/${dt.getMonth() + 1}`;
          dayPagesMap[dk] = (dayPagesMap[dk] || 0) + Number(s.pages_read || 0);
          const h = dt.getHours();
          const idx = h >= 5 && h < 11 ? 0 : (h >= 11 && h < 14 ? 1 : (h >= 14 && h < 18 ? 2 : (h >= 18 && h < 22 ? 3 : 4)));
          slotCounts[idx] += Number(s.duration_minutes || 0);
        }
      });
      const bestDay = Object.entries(dayPagesMap).sort((a, b) => b[1] - a[1])[0] || null;
      const bestSlotIdx = slotCounts.indexOf(Math.max(...slotCounts));
      const totalSpent = podiumPool.reduce((a, b) => a + Number(b.price || 0), 0);
      const costPerHour = totalSpent > 0 && totHours > 0 ? (totalSpent / totHours).toFixed(2) : null;
      const avgPagesPerSess = periodSessions.length > 0 ? Math.round(totPages / periodSessions.length) : 0;

      const records = [
        { k: "📏 PLUS GROS PAVÉ", v: biggestBook ? `${biggestBook.title} (${biggestBook.page_count} p.)` : "—" },
        { k: "🔥 PLUS GROSSE JOURNÉE", v: bestDay && bestDay[1] > 0 ? `+${bestDay[1]} pages le ${bestDay[0]}` : "—" },
        { k: "🕒 CRÉNEAU FAVORI", v: slotCounts[bestSlotIdx] > 0 ? slotLabels[bestSlotIdx] : "—" },
        costPerHour
          ? { k: "🎬 COÛT / HEURE DE PLAISIR", v: `${costPerHour} € / heure (${totalSpent.toFixed(0)} €)` }
          : { k: "📖 RYTHME DES SESSIONS", v: `${periodSessions.length} sessions • ${avgPagesPerSess} pages / session` }
      ];

      let ry = top3.length > 0 ? 955 : 340;
      records.forEach((rec) => {
        drawRoundedRect(ctx, 80, ry, STORY_W - 160, 160, 22);
        ctx.fillStyle = "rgba(30,41,59,0.82)";
        ctx.fill();
        ctx.strokeStyle = "rgba(251,191,36,0.28)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.textAlign = "left";
        ctx.fillStyle = "#FBBF24";
        ctx.font = "700 23px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(rec.k, 120, ry + 54);

        ctx.fillStyle = "#F8FAFC";
        ctx.font = "800 34px -apple-system, BlinkMacSystemFont, sans-serif";
        wrapText(ctx, rec.v, 120, ry + 112, STORY_W - 240, 40, 1);
        ry += 188;
      });

      drawBrandFooter(ctx, `Temps forts • ${periodLabel}`);
    }

    await openStoryCarouselModal(
      [
        { label: "1. Résumé & Livres", canvas: s1.canvas, filename: `statome-${periodPrefix}-1-resume.png` },
        { label: "2. Calendrier & Rythme", canvas: s2.canvas, filename: `statome-${periodPrefix}-2-rythme.png` },
        { label: "3. Genres & Sous-genres", canvas: s3.canvas, filename: `statome-${periodPrefix}-3-genres.png` },
        { label: "4. Palmarès & Records", canvas: s4.canvas, filename: `statome-${periodPrefix}-4-records.png` }
      ],
      `Carrousel Bilan ${periodLabel}`
    );
  };

  // ==========================================
  // 5. EXPORT 3 — FICHE AVIS + RADAR 6 CRITÈRES
  // ==========================================
  window.exportBookReviewStory = async function (bookId) {
    const books = (window.state && window.state.books) || [];
    const book = books.find((b) => Number(b.id) === Number(bookId));
    if (!book) return;
    showExportLoading(`Fiche Avis : ${book.title}`);

    const coverImg = await loadCoverImage(book.cover_url);
    const { canvas, ctx } = createStoryCanvas();

    // Couverture centrée en haut
    drawCoverFit(ctx, coverImg, (STORY_W - 290) / 2, 105, 290, 435, 20, book.title);

    ctx.textAlign = "center";
    ctx.fillStyle = "#F8FAFC";
    ctx.font = "800 50px -apple-system, BlinkMacSystemFont, sans-serif";
    const afterTitleY = wrapText(ctx, book.title, STORY_W / 2, 605, 920, 58, 2);

    ctx.fillStyle = "#94A3B8";
    ctx.font = "600 32px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(book.author || "", STORY_W / 2, afterTitleY + 6);

    // Note globale
    const gNote = Number(book.rating_global || 0);
    if (gNote > 0) {
      drawRoundedRect(ctx, STORY_W / 2 - 140, afterTitleY + 34, 280, 68, 34);
      ctx.fillStyle = "rgba(251, 191, 36, 0.18)";
      ctx.fill();
      ctx.strokeStyle = "rgba(251, 191, 36, 0.65)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "#FBBF24";
      ctx.font = "800 38px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(`★ ${gNote} / 5`, STORY_W / 2, afterTitleY + 81);
    }

    // Radar 6 critères
    const radarLabels = ["Global", "Intrigue", "Persos", "Worldb.", "Plume", "Rythme"];
    const radarValues = [
      book.rating_global || 0,
      book.rating_plot || 0,
      book.rating_chars || 0,
      book.rating_world || 0,
      book.rating_writing || 0,
      book.rating_pacing || 0
    ];
    drawRadarPolygon(ctx, STORY_W / 2, 1075, 225, radarLabels, radarValues);

    // Avis écrit si présent
    if (book.final_review && book.final_review.trim()) {
      const rY = 1430;
      drawRoundedRect(ctx, 80, rY, STORY_W - 160, 290, 24);
      ctx.fillStyle = "rgba(30,41,59,0.78)";
      ctx.fill();
      ctx.strokeStyle = "rgba(148,163,184,0.22)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#818CF8";
      ctx.font = "700 24px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("MON AVIS", 120, rY + 52);

      ctx.fillStyle = "#E2E8F0";
      ctx.font = "italic 30px Georgia, serif";
      wrapText(ctx, `« ${book.final_review.trim()} »`, 120, rY + 106, STORY_W - 240, 42, 4);
    }

    drawBrandFooter(ctx, "Fiche Avis & Radar");
    openStoryPreviewModal(canvas, `Avis : ${book.title}`, `statome-avis-${book.id}.png`);
  };

  // ==========================================
  // 6. EXPORT 4 — CARTE CITATION
  // ==========================================
  window.exportQuoteStory = async function (noteId) {
    const notes = (window.state && window.state.notes) || [];
    const books = (window.state && window.state.books) || [];
    const note = notes.find((n) => Number(n.id) === Number(noteId));
    if (!note) return;
    const book = books.find((b) => Number(b.id) === Number(note.book_id)) || {};

    showExportLoading("Carte Citation");
    const coverImg = await loadCoverImage(book.cover_url);
    const { canvas, ctx } = createStoryCanvas();

    // Guillemet décoratif
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(129, 140, 248, 0.32)";
    ctx.font = "800 220px Georgia, serif";
    ctx.fillText("“", STORY_W / 2, 340);

    // Citation centrée
    const text = String(note.content || "").trim();
    const fontSize = text.length > 260 ? 38 : (text.length > 140 ? 46 : 54);
    const lineH = Math.round(fontSize * 1.42);
    ctx.fillStyle = "#F8FAFC";
    ctx.font = `italic ${fontSize}px Georgia, serif`;
    wrapText(ctx, text, STORY_W / 2, 460, 860, lineH, 13);

    // Carte livre en bas
    const cardY = 1430;
    drawRoundedRect(ctx, 90, cardY, STORY_W - 180, 240, 24);
    ctx.fillStyle = "rgba(30,41,59,0.82)";
    ctx.fill();
    ctx.strokeStyle = "rgba(129,140,248,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    drawCoverFit(ctx, coverImg, 125, cardY + 30, 120, 180, 12, book.title || "");

    ctx.textAlign = "left";
    ctx.fillStyle = "#F8FAFC";
    ctx.font = "800 36px -apple-system, BlinkMacSystemFont, sans-serif";
    wrapText(ctx, book.title || note.book_title || "", 275, cardY + 90, 670, 44, 2);

    ctx.fillStyle = "#94A3B8";
    ctx.font = "600 28px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(
      `${book.author || ""}${note.page_number ? ` • p. ${note.page_number}` : ""}`,
      275,
      cardY + 190
    );

    drawBrandFooter(ctx, note.note_type || "Citation");
    openStoryPreviewModal(canvas, "Carte Citation", `statome-citation-${note.id}.png`);
  };

  // ==========================================
  // 7. EXPORT 5 — CARTE ADN LECTEUR
  // ==========================================
  window.exportReaderDnaStory = async function () {
    showExportLoading("Carte ADN Lecteur");
    const dna = window.computeReaderDna();
    const { canvas, ctx } = createStoryCanvas();

    ctx.textAlign = "center";
    ctx.fillStyle = "#818CF8";
    ctx.font = "700 30px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("MON ADN LECTEUR", STORY_W / 2, 135);

    ctx.font = "120px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(dna.archetype.emoji, STORY_W / 2, 295);

    ctx.fillStyle = "#F8FAFC";
    ctx.font = "800 64px -apple-system, BlinkMacSystemFont, sans-serif";
    wrapText(ctx, dna.archetype.title, STORY_W / 2, 390, 920, 72, 2);

    ctx.fillStyle = "#CBD5E1";
    ctx.font = "500 30px -apple-system, BlinkMacSystemFont, sans-serif";
    wrapText(ctx, dna.archetype.desc, STORY_W / 2, 485, 860, 42, 3);

    // 4 blocs d'insights ADN
    const blocks = [
      {
        title: "🎯 MOTEUR DE MES COUPS DE CŒUR",
        val: dna.topDriver ? `${dna.topDriver.emoji} ${dna.topDriver.label} (${dna.topDriver.avgTop}/5 sur mes tops)` : "En cours de calcul"
      },
      {
        title: "🕒 CRÉNEAU DE PRÉDILECTION",
        val: `${dna.peakTimeSlot.emoji} ${dna.peakTimeSlot.label} (${dna.peakTimeSlot.pct}% du temps)`
      },
      {
        title: "⚡ DYNAMIQUE DE LECTURE",
        val: dna.speedCurve[0].pph > 0
          ? `Début ${dna.speedCurve[0].pph} → Milieu ${dna.speedCurve[1].pph || "—"} → Fin ${dna.speedCurve[2].pph || "—"} p/h`
          : `${dna.focusPct}% Lecture Focus`
      },
      {
        title: "📚 GENRE SIGNATURE",
        val: dna.mostReadGenre
          ? `${dna.mostReadGenre.genre} (${dna.mostReadGenre.read} lus${dna.mostReadGenre.avgRating ? ` • ★ ${dna.mostReadGenre.avgRating}` : ""})`
          : `${dna.finishedCount} livres terminés`
      }
    ];

    let curY = 640;
    for (const bl of blocks) {
      drawRoundedRect(ctx, 80, curY, STORY_W - 160, 175, 24);
      ctx.fillStyle = "rgba(30,41,59,0.82)";
      ctx.fill();
      ctx.strokeStyle = "rgba(129,140,248,0.32)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#818CF8";
      ctx.font = "700 24px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(bl.title, 120, curY + 58);

      ctx.fillStyle = "#F8FAFC";
      ctx.font = "800 36px -apple-system, BlinkMacSystemFont, sans-serif";
      wrapText(ctx, bl.val, 120, curY + 118, STORY_W - 240, 44, 2);
      curY += 205;
    }

    // Mots-clés des notes
    if (dna.topKeywords.length > 0) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#94A3B8";
      ctx.font = "700 24px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("MOTIFS RÉCURRENTS DANS MES NOTES", STORY_W / 2, 1510);

      ctx.fillStyle = "#38BDF8";
      ctx.font = "700 34px -apple-system, BlinkMacSystemFont, sans-serif";
      wrapText(ctx, dna.topKeywords.slice(0, 6).map((k) => `#${k.word}`).join("   "), STORY_W / 2, 1575, 900, 48, 2);
    }

    drawBrandFooter(ctx, `${dna.finishedCount} livres • ${dna.totalHours} h lues`);
    openStoryPreviewModal(canvas, "Mon ADN Lecteur", "statome-adn-lecteur.png");
  };
})();
