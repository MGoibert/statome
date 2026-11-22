/**
 * StatOme — Ultra-Fast Serverless API for Vercel (Zero-Dependency Neon HTTP SQL)
 * Connects directly to Neon PostgreSQL over HTTPS in < 50ms without TCP cold starts.
 */

function getConnectionString(req) {
  let url = process.env.DATABASE_URL || req.headers["x-database-url"] || "";
  if (url.startsWith("postgres://")) {
    url = url.replace("postgres://", "postgresql://");
  }
  return url.trim();
}

async function neonQuery(connStr, query, params = []) {
  if (!connStr) {
    throw new Error("DATABASE_URL non configurée dans les variables d'environnement Vercel.");
  }
  const parsed = new URL(connStr);
  const endpoint = `https://${parsed.hostname}/sql`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Neon-Connection-String": connStr,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, params })
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Erreur Neon SQL (${resp.status}): ${errText}`);
  }
  const data = await resp.json();
  return data.rows || [];
}

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    return String(val)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function normalizeBook(row) {
  const subg = parseJsonArray(row.fantasy_subgenre);
  return {
    id: Number(row.id),
    isbn: row.isbn || "",
    title: row.title || "Sans titre",
    series_name: row.series_name || "",
    series_volume: row.series_volume !== null && row.series_volume !== undefined ? Number(row.series_volume) : null,
    author: row.author || "Auteur inconnu",
    author_country: row.author_country || "France",
    publisher: row.publisher || "",
    publication_year: row.publication_year ? Number(row.publication_year) : null,
    page_count: Number(row.page_count || 1),
    chapter_count: row.chapter_count ? Number(row.chapter_count) : null,
    price: row.price !== null && row.price !== undefined ? Number(row.price) : null,
    format: row.format || "Broché",
    genres: parseJsonArray(row.genres),
    tags: parseJsonArray(row.tags),
    fantasy_subgenres: subg,
    fantasy_subgenre: subg.join(", "),
    popularity_score: row.popularity_score !== null && row.popularity_score !== undefined ? Number(row.popularity_score) : null,
    cover_url: row.cover_url || "",
    status: row.status || "Bibliothèque",
    pal_month: row.pal_month || "",
    pal_year: row.pal_year ? Number(row.pal_year) : null,
    current_page: Number(row.current_page || 0),
    started_at: row.started_at ? String(row.started_at).slice(0, 10) : null,
    finished_at: row.finished_at ? String(row.finished_at).slice(0, 10) : null,
    rating_global: row.rating_global !== null && row.rating_global !== undefined ? Number(row.rating_global) : null,
    rating_pacing: row.rating_pacing !== null && row.rating_pacing !== undefined ? Number(row.rating_pacing) : null,
    rating_chars: row.rating_chars !== null && row.rating_chars !== undefined ? Number(row.rating_chars) : null,
    rating_world: row.rating_world !== null && row.rating_world !== undefined ? Number(row.rating_world) : null,
    rating_writing: row.rating_writing !== null && row.rating_writing !== undefined ? Number(row.rating_writing) : null,
    rating_plot: row.rating_plot !== null && row.rating_plot !== undefined ? Number(row.rating_plot) : null,
    final_review: row.final_review || ""
  };
}

function normalizeSession(row, booksById) {
  const b = booksById[Number(row.book_id)] || {};
  return {
    id: Number(row.id),
    book_id: Number(row.book_id),
    book_title: b.title || row.book_title || "",
    book_cover: b.cover_url || row.book_cover || "",
    start_time: row.start_time,
    end_time: row.end_time,
    duration_minutes: Math.round(Number(row.duration_minutes || 0) * 10) / 10,
    start_page: Number(row.start_page || 0),
    end_page: Number(row.end_page || 0),
    pages_read: Number(row.pages_read || 0),
    pages_per_hour: Math.round(Number(row.pages_per_hour || 0) * 10) / 10,
    is_weekend: row.is_weekend === true || row.is_weekend === "t" || row.is_weekend === "true",
    is_focused: row.is_focused === undefined || row.is_focused === null ? true : (row.is_focused === true || row.is_focused === "t" || row.is_focused === "true")
  };
}

function normalizeNote(row, booksById) {
  const b = booksById[Number(row.book_id)] || {};
  return {
    id: Number(row.id),
    book_id: Number(row.book_id),
    book_title: b.title || "",
    created_at: row.created_at,
    page_number: row.page_number !== null && row.page_number !== undefined ? Number(row.page_number) : null,
    chapter_number: row.chapter_number !== null && row.chapter_number !== undefined ? Number(row.chapter_number) : null,
    note_type: row.note_type || "Commentaire",
    content: row.content || ""
  };
}

async function searchGoogleBooks(q) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=8&langRestrict=fr`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.items || []).map((item) => {
    const info = item.volumeInfo || {};
    const ids = info.industryIdentifiers || [];
    const isbnObj = ids.find((i) => i.type === "ISBN_13") || ids.find((i) => i.type === "ISBN_10") || {};
    let cover = (info.imageLinks && (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail)) || "";
    if (cover.startsWith("http://")) cover = cover.replace("http://", "https://");
    return {
      title: info.title || "Sans titre",
      author: (info.authors || ["Auteur inconnu"]).join(", "),
      publisher: info.publisher || "",
      publication_year: info.publishedDate ? Number(String(info.publishedDate).slice(0, 4)) || null : null,
      page_count: Number(info.pageCount || 300),
      isbn: isbnObj.identifier || "",
      cover_url: cover,
      genres: info.categories || ["Fantasy"],
      popularity_score: info.averageRating ? Number(info.averageRating) : null
    };
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-database-url");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const action = (req.query && req.query.action) || (req.body && req.body.action) || "bootstrap";

    if (action === "search_external") {
      const q = (req.query && req.query.q) || (req.body && req.body.q) || "";
      const results = await searchGoogleBooks(q);
      return res.status(200).json({ ok: true, results });
    }

    const connStr = getConnectionString(req);

    if (action === "bootstrap") {
      const [rawBooks, rawSessions, rawNotes, rawTimer] = await Promise.all([
        neonQuery(connStr, "SELECT * FROM books ORDER BY id DESC"),
        neonQuery(connStr, "SELECT * FROM reading_sessions ORDER BY start_time DESC"),
        neonQuery(connStr, "SELECT * FROM book_notes ORDER BY page_number ASC NULLS LAST, created_at DESC"),
        neonQuery(connStr, "SELECT * FROM active_timer WHERE id = 1").catch(() => [])
      ]);

      const books = rawBooks.map(normalizeBook);
      const booksById = {};
      for (const b of books) booksById[b.id] = b;

      const sessions = rawSessions.map((s) => normalizeSession(s, booksById));
      const notes = rawNotes.map((n) => normalizeNote(n, booksById));
      let activeTimer = null;
      if (rawTimer && rawTimer.length > 0) {
        const t = rawTimer[0];
        const isRunning = t.is_running === true || t.is_running === "t" || t.is_running === "true";
        const accum = Number(t.accumulated_seconds || 0);
        if (isRunning || accum > 0) {
          activeTimer = {
            book_id: t.book_id ? Number(t.book_id) : null,
            is_running: isRunning,
            start_time: t.start_time ? Number(t.start_time) : null,
            accumulated_seconds: accum,
            is_focused: t.is_focused === undefined || t.is_focused === null ? true : (t.is_focused === true || t.is_focused === "t" || t.is_focused === "true")
          };
        }
      }

      return res.status(200).json({
        ok: true,
        books,
        sessions,
        notes,
        active_timer: activeTimer
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    if (action === "save_timer") {
      const { book_id, is_running, start_time, accumulated_seconds, is_focused } = body;
      await neonQuery(
        connStr,
        `INSERT INTO active_timer (id, book_id, is_running, start_time, accumulated_seconds, is_focused, updated_at)
         VALUES (1, $1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id) DO UPDATE SET
           book_id = EXCLUDED.book_id,
           is_running = EXCLUDED.is_running,
           start_time = EXCLUDED.start_time,
           accumulated_seconds = EXCLUDED.accumulated_seconds,
           is_focused = EXCLUDED.is_focused,
           updated_at = NOW()`,
        [book_id || null, Boolean(is_running), start_time || null, Number(accumulated_seconds || 0), is_focused !== false]
      );
      return res.status(200).json({ ok: true });
    }

    if (action === "clear_timer") {
      await neonQuery(
        connStr,
        `UPDATE active_timer SET is_running = FALSE, start_time = NULL, accumulated_seconds = 0, book_id = NULL, updated_at = NOW() WHERE id = 1`
      );
      return res.status(200).json({ ok: true });
    }

    if (action === "add_session") {
      const bookId = Number(body.book_id);
      const startPage = Number(body.start_page || 0);
      const endPage = Number(body.end_page || startPage);
      const durationMin = Math.max(Number(body.duration_minutes || 1), 0.5);
      const pagesRead = Math.max(endPage - startPage, 0);
      const pagesPerHour = durationMin > 0 ? (pagesRead / durationMin) * 60.0 : 0.0;
      const nowIso = body.date ? new Date(body.date).toISOString() : new Date().toISOString();
      const dayOfWeek = new Date(nowIso).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isFocused = body.is_focused !== false;

      await neonQuery(
        connStr,
        `INSERT INTO reading_sessions
         (book_id, start_time, end_time, duration_minutes, start_page, end_page, pages_read, pages_per_hour, is_weekend, is_focused)
         VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [bookId, nowIso, durationMin, startPage, endPage, pagesRead, pagesPerHour, isWeekend, isFocused]
      );

      await neonQuery(
        connStr,
        `UPDATE books
         SET current_page = GREATEST(COALESCE(current_page, 0), $2),
             started_at = COALESCE(started_at, CURRENT_DATE),
             status = CASE WHEN status IN ('Bibliothèque', 'Wishlist', 'À acheter') THEN 'En cours' ELSE status END
         WHERE id = $1`,
        [bookId, endPage]
      );

      await neonQuery(
        connStr,
        `UPDATE active_timer SET is_running = FALSE, start_time = NULL, accumulated_seconds = 0, book_id = NULL, updated_at = NOW() WHERE id = 1`
      ).catch(() => {});

      return res.status(200).json({ ok: true });
    }

    if (action === "delete_session") {
      await neonQuery(connStr, "DELETE FROM reading_sessions WHERE id = $1", [Number(body.session_id)]);
      return res.status(200).json({ ok: true });
    }

    if (action === "add_note") {
      await neonQuery(
        connStr,
        `INSERT INTO book_notes (book_id, created_at, page_number, chapter_number, note_type, content)
         VALUES ($1, NOW(), $2, $3, $4, $5)`,
        [
          Number(body.book_id),
          body.page_number ? Number(body.page_number) : null,
          body.chapter_number ? Number(body.chapter_number) : null,
          body.note_type || "Citation",
          String(body.content || "").trim()
        ]
      );
      return res.status(200).json({ ok: true });
    }

    if (action === "delete_note") {
      await neonQuery(connStr, "DELETE FROM book_notes WHERE id = $1", [Number(body.note_id)]);
      return res.status(200).json({ ok: true });
    }

    if (action === "add_book") {
      const genresJson = JSON.stringify(Array.isArray(body.genres) ? body.genres : parseJsonArray(body.genres || "Fantasy"));
      const subgJson = JSON.stringify(Array.isArray(body.fantasy_subgenres) ? body.fantasy_subgenres : parseJsonArray(body.fantasy_subgenre || ""));
      const rows = await neonQuery(
        connStr,
        `INSERT INTO books
         (isbn, title, series_name, series_volume, author, author_country, publisher, publication_year,
          page_count, price, format, genres, tags, fantasy_subgenre, popularity_score, cover_url,
          status, pal_month, pal_year, current_page, started_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'[]',$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id`,
        [
          body.isbn || null,
          body.title || "Sans titre",
          body.series_name || null,
          body.series_volume ? Number(body.series_volume) : null,
          body.author || "Auteur inconnu",
          body.author_country || "France",
          body.publisher || null,
          body.publication_year ? Number(body.publication_year) : null,
          Math.max(Number(body.page_count || 1), 1),
          body.price ? Number(body.price) : null,
          body.format || "Broché",
          genresJson,
          subgJson,
          body.popularity_score ? Number(body.popularity_score) : null,
          body.cover_url || null,
          body.status || "Bibliothèque",
          body.pal_month || null,
          body.pal_year ? Number(body.pal_year) : null,
          Number(body.current_page || 0),
          body.status === "En cours" ? new Date().toISOString().slice(0, 10) : null
        ]
      );
      return res.status(200).json({ ok: true, id: rows[0] ? Number(rows[0].id) : null });
    }

    if (action === "update_book") {
      const bookId = Number(body.book_id);
      const data = body.data || {};
      const sets = [];
      const vals = [];
      let idx = 1;

      const allowed = [
        "title", "author", "series_name", "series_volume", "page_count", "current_page",
        "status", "pal_month", "pal_year", "format", "price", "cover_url",
        "started_at", "finished_at", "rating_global", "rating_pacing", "rating_chars",
        "rating_world", "rating_writing", "rating_plot", "final_review", "fantasy_subgenre"
      ];

      for (const key of allowed) {
        if (key in data) {
          sets.push(`${key} = $${idx++}`);
          let v = data[key];
          if (key === "fantasy_subgenre" && Array.isArray(v)) {
            v = JSON.stringify(v);
          }
          if (v === "") v = null;
          vals.push(v);
        }
      }

      if (sets.length > 0) {
        vals.push(bookId);
        await neonQuery(connStr, `UPDATE books SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
      }
      return res.status(200).json({ ok: true });
    }

    if (action === "delete_book") {
      await neonQuery(connStr, "DELETE FROM books WHERE id = $1", [Number(body.book_id)]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: `Action inconnue: ${action}` });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
};
