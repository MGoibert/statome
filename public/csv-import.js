/**
 * StaTome — Import CSV 1-clic (Goodreads, StoryGraph, Babelio & Générique)
 * - Auto-détection encodage (UTF-8 / Windows-1252) & séparateur (',' / ';' / '\t')
 * - Dédoublonnage automatique (ISBN ou Titre + Auteur)
 * - Enrichissement progressif optionnel des couvertures, pages & genres
 */

(function () {
  let pendingImportBooks = [];
  let pendingSourceLabel = "";
  let pendingSkippedDupes = 0;
  let cancelEnrichFlag = false;

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normKey(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function cleanIsbn(raw) {
    // Nettoie le format Goodreads ="9780340837948" ou ""
    const digits = String(raw || "").replace(/[^0-9Xx]/g, "").toUpperCase();
    return digits.length === 13 || digits.length === 10 ? digits : "";
  }

  function parseDateIso(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    // YYYY/MM/DD ou YYYY-MM-DD
    const m1 = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m1) {
      return `${m1[1]}-${String(m1[2]).padStart(2, "0")}-${String(m1[3]).padStart(2, "0")}`;
    }
    // DD/MM/YYYY (Babelio / FR)
    const m2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m2) {
      return `${m2[3]}-${String(m2[2]).padStart(2, "0")}-${String(m2[1]).padStart(2, "0")}`;
    }
    return null;
  }

  function parseNum(raw) {
    const s = String(raw || "").replace(",", ".").replace(/[^0-9.]/g, "");
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function detectDelimiter(headerLine) {
    let inQuotes = false;
    const counts = { ",": 0, ";": 0, "\t": 0 };
    for (let i = 0; i < headerLine.length; i++) {
      const ch = headerLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && counts[ch] !== undefined) counts[ch]++;
    }
    if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
    if (counts["\t"] > counts[","] && counts["\t"] > counts[";"]) return "\t";
    return ",";
  }

  function parseCsvText(text) {
    const cleanText = String(text || "").replace(/^\uFEFF/, "");
    const firstNl = cleanText.indexOf("\n");
    const headerSample = firstNl >= 0 ? cleanText.slice(0, firstNl) : cleanText;
    const delim = detectDelimiter(headerSample);

    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
      const ch = cleanText[i];
      const next = cleanText[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cell += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delim) {
          row.push(cell);
          cell = "";
        } else if (ch === "\r" && next === "\n") {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
          i++;
        } else if (ch === "\n" || ch === "\r") {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
        } else {
          cell += ch;
        }
      }
    }
    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }

    if (rows.length < 2) return { headers: [], records: [] };
    const headers = rows[0].map((h) => String(h || "").trim());
    const records = [];
    for (let r = 1; r < rows.length; r++) {
      const cols = rows[r];
      if (!cols || cols.every((c) => !String(c || "").trim())) continue;
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        obj[headers[c]] = cols[c] !== undefined ? String(cols[c]).trim() : "";
      }
      records.push(obj);
    }
    return { headers, records };
  }

  function mapFormat(raw) {
    const s = String(raw || "").toLowerCase();
    if (/\b(audio|audible|audiobook|mp3|cd)\b/.test(s)) return "Audio";
    if (/\b(ebook|e-book|kindle|kobo|digital|numérique|numerique|epub)\b/.test(s)) return "Numérique";
    if (/\b(hardcover|relié|relie|collector)\b/.test(s)) return "Relié";
    if (/\b(mass market|poche|pocket)\b/.test(s)) return "Poche";
    return "Broché";
  }

  function mapStatus(rawStatus, ownedRaw = "") {
    const s = String(rawStatus || "").toLowerCase().trim();
    const owned = /^(yes|oui|true|1)$/i.test(String(ownedRaw || "").trim()) || Number(ownedRaw) > 0;
    if (["read", "lu", "terminé", "termine", "finished"].includes(s)) return "Terminé";
    if (["currently-reading", "en cours", "en cours de lecture", "reading"].includes(s)) return "En cours";
    if (["did-not-finish", "dnf", "abandonné", "abandonne", "abandoned"].includes(s)) return "DNF";
    if (["pense-bête", "pense-bete", "wishlist", "envie", "à acheter", "a acheter"].includes(s)) return "Wishlist";
    if (["to-read", "à lire", "a lire", "pal", "bibliothèque", "bibliotheque"].includes(s)) {
      return owned || s === "à lire" || s === "a lire" || s === "bibliothèque" ? "Bibliothèque" : "Wishlist";
    }
    return owned ? "Bibliothèque" : "Bibliothèque";
  }

  function mapRecordsToStaTome(headers, records) {
    const headerSet = new Set(headers.map((h) => h.toLowerCase().trim()));
    const normHeaders = {};
    headers.forEach((h) => {
      normHeaders[normKey(h)] = h;
    });
    const getCol = (rec, candidates) => {
      for (const c of candidates) {
        if (rec[c] !== undefined && rec[c] !== "") return rec[c];
        const nk = normHeaders[normKey(c)];
        if (nk && rec[nk] !== undefined && rec[nk] !== "") return rec[nk];
      }
      return "";
    };

    let source = "CSV Générique";
    if (headerSet.has("exclusive shelf") || headerSet.has("isbn13") || headerSet.has("book id")) {
      source = "Goodreads";
    } else if (headerSet.has("read status") && (headerSet.has("isbn/uid") || headerSet.has("star rating"))) {
      source = "StoryGraph";
    } else if (headerSet.has("date d'entrée dans babelio") || (headerSet.has("titre") && headerSet.has("statut") && headerSet.has("note"))) {
      source = "Babelio";
    }

    const existingBooks = (window.state && window.state.books) || [];
    const existingIsbns = new Set();
    const existingKeys = new Set();
    existingBooks.forEach((b) => {
      const ci = cleanIsbn(b.isbn);
      if (ci) existingIsbns.add(ci);
      const lastA = String(b.author || "").trim().split(/\s+/).pop() || "";
      existingKeys.add(`${normKey(b.title)}|${normKey(lastA)}`);
    });

    const mapped = [];
    let skippedDupes = 0;

    for (const rec of records) {
      const title = getCol(rec, ["Title", "Titre", "Nom", "Book Title", "Livre"]).trim();
      if (!title) continue;
      const author = getCol(rec, ["Author", "Authors", "Auteur", "Auteurs"]).trim() || "Auteur inconnu";
      const isbn = cleanIsbn(getCol(rec, ["ISBN13", "ISBN/UID", "ISBN", "EAN", "ISBN-13", "ISBN10"]));
      const lastA = author.split(/\s+/).pop() || "";
      const key = `${normKey(title)}|${normKey(lastA)}`;

      if ((isbn && existingIsbns.has(isbn)) || existingKeys.has(key)) {
        skippedDupes++;
        continue;
      }

      const rawStatus = getCol(rec, ["Exclusive Shelf", "Read Status", "Statut", "Status", "Étagère", "Shelf"]);
      const ownedVal = getCol(rec, ["Owned?", "Owned Copies", "Possédé"]);
      const status = mapStatus(rawStatus, ownedVal);
      const ratingRaw = parseNum(getCol(rec, ["Star Rating", "My Rating", "Note", "Rating", "Note Globale"]));
      const ratingGlobal = ratingRaw && ratingRaw > 0 ? Math.min(5, ratingRaw) : null;
      const pagesRaw = parseNum(getCol(rec, ["Number of Pages", "Pages", "Page Count", "Nombre de pages"]));
      const pageCount = pagesRaw && pagesRaw > 0 ? Math.round(pagesRaw) : 300;
      const publisher = getCol(rec, ["Publisher", "Éditeur", "Editeur"]).trim();
      const pubYearRaw = parseNum(getCol(rec, ["Year Published", "Original Publication Year", "Date de publication", "Année", "Year"]));
      const publicationYear = pubYearRaw && pubYearRaw >= 1400 && pubYearRaw <= 2100 ? Math.round(pubYearRaw) : null;
      const finishedAt = parseDateIso(getCol(rec, ["Date Read", "Last Date Read", "Date de fin", "Finished At"]));
      const format = mapFormat(getCol(rec, ["Format", "Binding", "Support"]));
      const review = getCol(rec, ["My Review", "Review", "Avis", "Critique", "Commentaire"]).trim();
      const rawTags = getCol(rec, ["Tags", "Bookshelves", "Moods"]);
      const tags = rawTags
        ? rawTags.split(/[,;]/).map((t) => t.trim()).filter((t) => t && !/^(read|to-read|currently-reading|did-not-finish)$/i.test(t)).slice(0, 6)
        : [];
      const avgPop = parseNum(getCol(rec, ["Average Rating", "Note communauté"]));

      mapped.push({
        isbn,
        title,
        author,
        publisher,
        publication_year: publicationYear,
        page_count: pageCount,
        format,
        status,
        finished_at: status === "Terminé" ? finishedAt : null,
        rating_global: ratingGlobal,
        popularity_score: avgPop && avgPop > 0 && avgPop <= 5 ? avgPop : null,
        final_review: review || null,
        tags
      });

      if (isbn) existingIsbns.add(isbn);
      existingKeys.add(key);
    }

    return { source, books: mapped, skippedDupes };
  }

  window.openCsvImportModal = function () {
    pendingImportBooks = [];
    pendingSourceLabel = "";
    pendingSkippedDupes = 0;
    cancelEnrichFlag = false;

    window.openModal(`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">
        <h3 style="margin:0;font-size:1rem;">📥 Importer une bibliothèque (CSV)</h3>
        <button class="btn" style="padding:4px 10px;" onclick="window.closeModal()">✕</button>
      </div>
      <div style="font-size:0.82rem;color:var(--muted);margin-bottom:12px;line-height:1.45;">
        Importez en 1 clic vos livres depuis <b>Goodreads</b>, <b>The StoryGraph</b>, <b>Babelio</b> ou un fichier Excel/CSV. Les doublons déjà dans StaTome sont automatiquement ignorés.
      </div>

      <input type="file" id="csv-import-file" accept=".csv,text/csv,text/plain" style="display:none;" onchange="window.handleCsvImportFile(event)" />
      <button class="btn btn-primary" style="width:100%;padding:12px;font-size:0.9rem;" onclick="document.getElementById('csv-import-file').click()">
        📂 Choisir mon fichier .csv
      </button>

      <details style="margin-top:12px;background:rgba(15,23,42,0.6);border:1px solid var(--border);border-radius:10px;padding:9px 11px;font-size:0.77rem;color:#CBD5E1;">
        <summary style="cursor:pointer;font-weight:700;color:var(--primary-light);">💡 Comment exporter mon CSV depuis mon ancienne app ?</summary>
        <div style="margin-top:8px;display:grid;gap:7px;line-height:1.4;">
          <div><b>• Goodreads (web)</b> : <i>My Books</i> → colonne gauche <i>Tools</i> → <b>Import and export</b> → <b>Export Library</b> (fichier CSV instantané, pas l'export RGPD).</div>
          <div><b>• The StoryGraph</b> : <i>Profil</i> → <i>Manage Account</i> → <b>Export StoryGraph Library</b>.</div>
          <div><b>• Babelio</b> : <i>Mes livres</i> → <b>Exporter ma bibliothèque</b> (format CSV).</div>
        </div>
      </details>

      <div id="csv-import-preview" style="margin-top:12px;"></div>
    `);
  };

  window.handleCsvImportFile = async function (event) {
    const file = event.target && event.target.files && event.target.files[0];
    if (!file) return;
    const previewEl = document.getElementById("csv-import-preview");
    if (previewEl) {
      previewEl.innerHTML = `<div style="text-align:center;font-size:0.82rem;color:var(--muted);padding:10px;">⏳ Analyse du fichier ${esc(file.name)}...</div>`;
    }

    try {
      const buf = await file.arrayBuffer();
      let text = "";
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
      } catch {
        text = new TextDecoder("windows-1252").decode(buf);
      }

      const { headers, records } = parseCsvText(text);
      if (records.length === 0) {
        if (previewEl) {
          previewEl.innerHTML = `<div style="color:#FCA5A5;font-size:0.82rem;">⚠️ Aucun livre lisible trouvé dans ce fichier CSV.</div>`;
        }
        return;
      }

      const { source, books, skippedDupes } = mapRecordsToStaTome(headers, records);
      pendingImportBooks = books;
      pendingSourceLabel = source;
      pendingSkippedDupes = skippedDupes;

      const byStatus = {};
      books.forEach((b) => { byStatus[b.status] = (byStatus[b.status] || 0) + 1; });
      const statusSummary = Object.entries(byStatus).map(([k, v]) => `${k} : <b>${v}</b>`).join(" • ");

      if (books.length === 0) {
        previewEl.innerHTML = `
          <div style="padding:10px;border-radius:10px;background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.35);font-size:0.82rem;color:#6EE7B7;">
            ✅ Source détectée : <b>${esc(source)}</b>.<br/>
            Tous les livres de ce fichier (${skippedDupes}) sont déjà présents dans votre bibliothèque !
          </div>
        `;
        return;
      }

      previewEl.innerHTML = `
        <div style="padding:11px;border-radius:10px;background:rgba(99,102,241,0.12);border:1px solid rgba(129,140,248,0.4);font-size:0.82rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-weight:800;color:var(--primary-light);">✨ ${esc(source)} détecté</span>
            <span style="font-weight:700;color:#34D399;">+${books.length} nouveau(x) livre(s)</span>
          </div>
          ${skippedDupes > 0 ? `<div style="font-size:0.76rem;color:var(--muted);margin-bottom:4px;">🔁 ${skippedDupes} doublon(s) déjà dans StaTome ignoré(s).</div>` : ""}
          <div style="font-size:0.76rem;color:#CBD5E1;margin-bottom:8px;">${statusSummary}</div>

          <div style="background:rgba(15,23,42,0.65);border-radius:8px;padding:7px 9px;font-size:0.75rem;margin-bottom:10px;display:grid;gap:4px;">
            <div style="color:var(--muted);font-weight:700;">Aperçu des premiers livres :</div>
            ${books.slice(0, 5).map((b) => `
              <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                • <b>${esc(b.title)}</b> — ${esc(b.author)} <span style="color:var(--primary-light);">(${b.status}${b.rating_global ? ` • ★${b.rating_global}` : ""})</span>
              </div>
            `).join("")}
            ${books.length > 5 ? `<div style="color:var(--muted);">… et ${books.length - 5} autre(s)</div>` : ""}
          </div>

          <label style="display:flex;align-items:center;gap:8px;font-size:0.78rem;margin:0 0 10px;cursor:pointer;">
            <input type="checkbox" id="csv-enrich-toggle" checked style="width:auto;margin:0;" />
            <span>✨ Compléter couvertures, genres & pages automatiquement après import</span>
          </label>

          <button class="btn btn-success" style="width:100%;padding:11px;font-size:0.88rem;" onclick="window.runCsvBatchImport()">
            🚀 Importer ${books.length} livre(s) maintenant
          </button>
        </div>
      `;
    } catch (e) {
      if (previewEl) {
        previewEl.innerHTML = `<div style="color:#FCA5A5;font-size:0.82rem;">❌ Erreur de lecture : ${esc(e && e.message ? e.message : e)}</div>`;
      }
    }
  };

  window.cancelCsvEnrich = function () {
    cancelEnrichFlag = true;
  };

  window.runCsvBatchImport = async function () {
    if (!pendingImportBooks || pendingImportBooks.length === 0) return;
    const shouldEnrich = Boolean(document.getElementById("csv-enrich-toggle")?.checked);
    const previewEl = document.getElementById("csv-import-preview");
    const total = pendingImportBooks.length;

    if (previewEl) {
      previewEl.innerHTML = `
        <div style="text-align:center;padding:12px;">
          <div style="font-weight:700;font-size:0.9rem;">⏳ Import de ${total} livre(s) en cours...</div>
        </div>
      `;
    }

    try {
      const res = await window.apiCall("import_books_batch", { books: pendingImportBooks });
      const importedIds = (res && res.imported_ids) || [];
      const importedCount = Number((res && res.imported_count) || 0);
      await window.syncFromServer();

      if (!shouldEnrich || importedIds.length === 0) {
        if (previewEl) {
          previewEl.innerHTML = `
            <div style="padding:12px;border-radius:10px;background:rgba(52,211,153,0.14);border:1px solid rgba(52,211,153,0.4);text-align:center;">
              <div style="font-weight:800;color:#34D399;font-size:0.95rem;">🎉 ${importedCount} livre(s) importé(s) avec succès !</div>
              <button class="btn btn-primary" style="margin-top:10px;width:100%;" onclick="window.closeModal();window.switchTab('library');">📚 Voir ma bibliothèque</button>
            </div>
          `;
        }
        return;
      }

      // Enrichissement progressif (lots de 3) pour récupérer couvertures, genres et pages
      cancelEnrichFlag = false;
      const toEnrich = (window.state.books || []).filter((b) => importedIds.includes(Number(b.id)) && !b.cover_url);
      let done = 0;

      const updateProgress = () => {
        if (!previewEl) return;
        const pct = Math.round((done / Math.max(1, toEnrich.length)) * 100);
        previewEl.innerHTML = `
          <div style="padding:12px;border-radius:10px;background:rgba(99,102,241,0.12);border:1px solid rgba(129,140,248,0.4);">
            <div style="font-weight:700;font-size:0.86rem;color:#34D399;margin-bottom:6px;">✅ ${importedCount} livre(s) importé(s) !</div>
            <div style="font-size:0.78rem;color:#CBD5E1;margin-bottom:6px;">✨ Récupération des couvertures & genres : <b>${done}/${toEnrich.length}</b> (${pct}%)</div>
            <div class="progress-track" style="height:8px;margin-bottom:10px;">
              <div class="progress-fill" style="width:${pct}%;"></div>
            </div>
            <button class="btn" style="width:100%;font-size:0.78rem;padding:7px;" onclick="window.cancelCsvEnrich()">⏹️ Arrêter ici (les livres sont déjà sauvegardés)</button>
          </div>
        `;
      };
      updateProgress();

      const chunkSize = 3;
      for (let i = 0; i < toEnrich.length; i += chunkSize) {
        if (cancelEnrichFlag) break;
        const batch = toEnrich.slice(i, i + chunkSize);
        await Promise.all(
          batch.map(async (b) => {
            try {
              const q = b.isbn ? b.isbn : `${b.title} ${b.author || ""}`.trim();
              const metaRes = await window.apiCall("enrich_book", { q });
              const m = metaRes && metaRes.best;
              if (m) {
                const patch = {};
                if (m.cover_url) patch.cover_url = m.cover_url;
                if (Array.isArray(m.genres) && m.genres.length > 0) patch.genres = m.genres;
                if (Array.isArray(m.fantasy_subgenres) && m.fantasy_subgenres.length > 0) patch.fantasy_subgenre = m.fantasy_subgenres;
                if (m.page_count && (!b.page_count || b.page_count === 300)) patch.page_count = m.page_count;
                if (m.series_name && !b.series_name) {
                  patch.series_name = m.series_name;
                  if (m.series_volume) patch.series_volume = m.series_volume;
                }
                if (m.popularity_score && !b.popularity_score) patch.popularity_score = m.popularity_score;
                if (m.author_country && m.author_country !== "France") patch.author_country = m.author_country;
                if (Object.keys(patch).length > 0) {
                  await window.apiCall("update_book", { book_id: b.id, data: patch });
                }
              }
            } catch {}
            done++;
            updateProgress();
          })
        );
      }

      await window.syncFromServer();
      if (previewEl) {
        previewEl.innerHTML = `
          <div style="padding:12px;border-radius:10px;background:rgba(52,211,153,0.14);border:1px solid rgba(52,211,153,0.4);text-align:center;">
            <div style="font-weight:800;color:#34D399;font-size:0.95rem;">🎉 Import terminé (${importedCount} livres, ${done} enrichis) !</div>
            <button class="btn btn-primary" style="margin-top:10px;width:100%;" onclick="window.closeModal();window.switchTab('library');">📚 Voir ma bibliothèque</button>
          </div>
        `;
      }
    } catch (e) {
      if (previewEl) {
        previewEl.innerHTML = `<div style="color:#FCA5A5;font-size:0.82rem;">❌ Erreur lors de l'import : ${esc(e && e.message ? e.message : e)}</div>`;
      }
    }
  };
})();
