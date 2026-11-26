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

  let lastExportBlob = null;
  let lastExportFilename = "statome-story.png";

  function openStoryPreviewModal(canvas, title, filename) {
    lastExportFilename = filename || "statome-story.png";
    const dataUrl = canvas.toDataURL("image/png");
    canvas.toBlob((blob) => {
      lastExportBlob = blob;
    }, "image/png");

    const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
    window.openModal(`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">
        <h3 style="margin:0;font-size:1rem;">📸 ${title}</h3>
        <button class="btn" style="padding:4px 10px;" onclick="window.closeModal()">✕</button>
      </div>
      <div style="display:flex;justify-content:center;background:#070B14;border-radius:12px;padding:8px;border:1px solid var(--border);">
        <img src="${dataUrl}" alt="Aperçu Story" style="max-height:58vh;max-width:100%;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.6);" />
      </div>
      <div style="display:grid;grid-template-columns:${canShare ? "1fr 1fr" : "1fr"};gap:10px;margin-top:12px;">
        ${canShare ? `<button class="btn btn-primary" onclick="window.shareLastStoryCard()">📤 Partager (Story)</button>` : ""}
        <button class="btn ${canShare ? "" : "btn-primary"}" onclick="window.downloadLastStoryCard()">⬇️ Télécharger PNG</button>
      </div>
      <div style="font-size:0.74rem;color:var(--muted);text-align:center;margin-top:8px;">
        Format HD 1080×1920 prêt pour Instagram / TikTok / WhatsApp.
      </div>
    `);
  }

  window.downloadLastStoryCard = function () {
    if (!lastExportBlob) return;
    const url = URL.createObjectURL(lastExportBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = lastExportFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  window.shareLastStoryCard = async function () {
    if (!lastExportBlob) return window.downloadLastStoryCard();
    try {
      const file = new File([lastExportBlob], lastExportFilename, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "StaTome — Ma Story Lecture" });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    window.downloadLastStoryCard();
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
  // 4. EXPORT 2 — CARTE BILAN DU MOIS / ANNÉE (WRAP-UP)
  // ==========================================
  window.exportWrapUpStory = async function (mode = "month") {
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth();
    const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const periodPrefix = mode === "month"
      ? `${curY}-${String(curM + 1).padStart(2, "0")}`
      : String(curY);
    const periodLabel = mode === "month" ? `${months[curM]} ${curY}` : `Année ${curY}`;

    showExportLoading(`Bilan ${periodLabel}`);

    const books = (window.state && window.state.books) || [];
    const sessions = (window.state && window.state.sessions) || [];

    const periodBooks = books
      .filter((b) => b.status === "Terminé" && String(b.finished_at || "").startsWith(periodPrefix))
      .sort((a, b) => Number(b.rating_global || 0) - Number(a.rating_global || 0));

    const periodSessions = sessions.filter((s) => String(s.start_time || "").startsWith(periodPrefix));
    const totPages = periodSessions.reduce((a, s) => a + Number(s.pages_read || 0), 0) ||
      periodBooks.reduce((a, b) => a + Number(b.page_count || 0), 0);
    const totHours = Math.round((periodSessions.reduce((a, s) => a + Number(s.duration_minutes || 0), 0) / 60) * 10) / 10;
    const rated = periodBooks.filter((b) => Number(b.rating_global || 0) > 0);
    const avgNote = rated.length > 0
      ? (rated.reduce((a, b) => a + Number(b.rating_global), 0) / rated.length).toFixed(2)
      : "—";
    const favoriteBook = rated[0] || periodBooks[0] || null;

    const mosaicBooks = periodBooks.slice(0, 12);
    const imgs = await Promise.all(mosaicBooks.map((b) => loadCoverImage(b.cover_url)));

    const { canvas, ctx } = createStoryCanvas();

    ctx.textAlign = "center";
    ctx.fillStyle = "#38BDF8";
    ctx.font = "700 30px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(mode === "month" ? "BILAN DU MOIS" : "BILAN DE L'ANNÉE", STORY_W / 2, 125);

    ctx.fillStyle = "#F8FAFC";
    ctx.font = "800 72px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(periodLabel, STORY_W / 2, 210);

    // 4 KPI Cards
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

    // Mosaïque de couvertures
    if (mosaicBooks.length > 0) {
      const cols = mosaicBooks.length <= 4 ? mosaicBooks.length : (mosaicBooks.length <= 6 ? 3 : 4);
      const rows = Math.ceil(mosaicBooks.length / cols);
      const mGap = 24;
      const maxGridW = 920;
      const cw = Math.min(220, Math.floor((maxGridW - mGap * (cols - 1)) / cols));
      const ch = Math.round(cw * 1.48);
      const totalGridW = cols * cw + (cols - 1) * mGap;
      const startX = (STORY_W - totalGridW) / 2;
      const startY = 445;

      mosaicBooks.forEach((b, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const bx = startX + c * (cw + mGap);
        const by = startY + r * (ch + mGap);
        drawCoverFit(ctx, imgs[i], bx, by, cw, ch, 14, b.title);
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

    // Coup de cœur spotlight
    if (favoriteBook) {
      const boxY = 1490;
      drawRoundedRect(ctx, 80, boxY, STORY_W - 160, 210, 24);
      ctx.fillStyle = "rgba(99,102,241,0.16)";
      ctx.fill();
      ctx.strokeStyle = "rgba(129,140,248,0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#FBBF24";
      ctx.font = "700 26px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("🏆 COUP DE CŒUR DE LA PÉRIODE", 120, boxY + 56);

      ctx.fillStyle = "#F8FAFC";
      ctx.font = "800 38px -apple-system, BlinkMacSystemFont, sans-serif";
      wrapText(ctx, favoriteBook.title, 120, boxY + 112, STORY_W - 240, 44, 1);

      ctx.fillStyle = "#CBD5E1";
      ctx.font = "600 28px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(
        `${favoriteBook.author}${favoriteBook.rating_global ? ` • ★ ${favoriteBook.rating_global}/5` : ""}`,
        120,
        boxY + 164
      );
    }

    drawBrandFooter(ctx, `Wrap-up ${periodLabel}`);
    openStoryPreviewModal(canvas, `Bilan ${periodLabel}`, `statome-bilan-${periodPrefix}.png`);
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
