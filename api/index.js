/**
 * StaTome — Ultra-Fast Serverless API for Vercel (Zero-Dependency Neon HTTP SQL)
 * Includes the complete multi-source book enrichment cascade:
 * 1. BnF SRU UNIMARC (recordSchema=unimarcXchange + Notice d'Autorité 102$a + Couverture HD)
 * 2. Goodreads AutoComplete JSON (Note communauté /5, Saga & Tome, Résumé, Couverture HD Amazon)
 * 3. OpenLibrary & Google Books API
 */

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7"
};

const ISO_COUNTRY_MAP = {
  FR: "France", GB: "Royaume-Uni", UK: "Royaume-Uni", US: "États-Unis",
  CA: "Canada", BE: "Belgique", CH: "Suisse", AU: "Australie",
  NZ: "Nouvelle-Zélande", IE: "Irlande", DE: "Allemagne", AT: "Autriche",
  IT: "Italie", ES: "Espagne", PT: "Portugal", JP: "Japon",
  CN: "Chine", KR: "Corée du Sud", PL: "Pologne", RU: "Russie",
  SE: "Suède", NO: "Norvège", DK: "Danemark", FI: "Finlande",
  NL: "Pays-Bas", AR: "Argentine", MX: "Mexique", BR: "Brésil",
  IN: "Inde", ZA: "Afrique du Sud"
};

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
    target_finish_date: row.target_finish_date ? String(row.target_finish_date).slice(0, 10) : "",
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
    duration_minutes: Math.round(Number(row.duration_minutes || 0) * 100) / 100,
    start_page: Number(row.start_page || 0),
    end_page: Number(row.end_page || 0),
    pages_read: Number(row.pages_read || 0),
    pages_per_hour: Math.round(Number(row.pages_per_hour || 0) * 100) / 100,
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

// ==========================================
// MOTEUR D'ENRICHISSEMENT (Portage fidèle de core/metadata_fetcher.py)
// ==========================================
function unescapeHtml(str) {
  return String(str || "")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normStr(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSeriesInfo(text) {
  if (!text) return { seriesName: null, seriesVolume: null };
  const cleaned = unescapeHtml(text).replace(/\s*\((?:French|English|Kindle|Paperback|Hardcover|Broché|Poche|Relié).*?\)\s*$/i, "").trim();

  // 1. Format parenthèses Goodreads: "Titre (Nom de la série, #1)" ou "(Série, Tome 2)"
  const parenRegex = /\(([^()]+?)(?:,\s*|\s+)(?:#|book\s*|vol(?:ume)?\.?\s*|tome\s*|t\.\s*)0*([0-9]+(?:[.,][0-9]+)?)(?:\s*(?:part(?:ie)?\.?|tome|vol\.?)\s*[0-9]+)?\)/gi;
  let matches = [...cleaned.matchAll(parenRegex)];
  if (matches.length === 0) {
    const parenRegex2 = /\(([^(),]+?)(?:,\s*|\s+\()0*([0-9]+(?:[.,][0-9]+)?)\)?\)/gi;
    matches = [...cleaned.matchAll(parenRegex2)];
  }
  if (matches.length > 0) {
    const m = matches[matches.length - 1];
    const sName = m[1].replace(/^[-:;,()\s]+|[-:;,()\s]+$/g, "");
    if (sName.length > 1 && !/^(?:tome|vol|volume|part|partie|book|édition|edition)\b/i.test(sName)) {
      let vol = parseFloat(m[2].replace(",", "."));
      if (vol >= 1 && (Math.round((vol % 1) * 10) === 1 || Math.round((vol % 1) * 10) === 2)) {
        vol = Math.floor(vol);
      }
      return { seriesName: sName, seriesVolume: isNaN(vol) ? null : vol };
    }
  }

  // 2. Format "Nom de la série, Tome 2 : Titre"
  const mPrefix = cleaned.match(/^([^:()]+?)[,.\s]+(?:tome|vol(?:ume)?\.?|t\.?)\s*0*([0-9]+(?:[.,][0-9]+)?)\s*:\s*(.+)$/i);
  if (mPrefix) {
    const sName = mPrefix[1].replace(/^[-:;,()\s]+|[-:;,()\s]+$/g, "");
    const vol = parseFloat(mPrefix[2].replace(",", "."));
    if (sName.length > 1) return { seriesName: sName, seriesVolume: isNaN(vol) ? null : vol };
  }

  // 3. Format "Série : X, Tome Y"
  const mExp = cleaned.match(/(?:série|saga|cycle)\s*[:\-]?\s*([^,()]+),\s*(?:tome|vol(?:ume)?\.?)\s*0*([0-9]+(?:[.,][0-9]+)?)/i);
  if (mExp) {
    const sName = mExp[1].replace(/^[-:;,()\s]+|[-:;,()\s]+$/g, "");
    const vol = parseFloat(mExp[2].replace(",", "."));
    if (sName.length > 1) return { seriesName: sName, seriesVolume: isNaN(vol) ? null : vol };
  }

  return { seriesName: null, seriesVolume: null };
}

function cleanTitleFromSeries(title) {
  if (!title) return "";
  let cleaned = unescapeHtml(title);
  cleaned = cleaned.replace(/\s*-\s*(?:tome|vol(?:ume)?\.?)\s*0*[0-9]+\s+.*$/i, "").trim();
  while (/\s*\([^()]*\)\s*$/.test(cleaned)) {
    cleaned = cleaned.replace(/\s*\([^()]*\)\s*$/, "").trim();
  }
  const mPref = cleaned.match(/^([^:]+?)[,.\s]+(?:tome|vol(?:ume)?\.?|t\.?)\s*0*[0-9]+(?:[.,][0-9]+)?\s*:\s*(.+)$/i);
  if (mPref) cleaned = mPref[2].trim();
  cleaned = cleaned.replace(/(?:,|\s+-)\s*(?:tome|vol(?:ume)?\.?|partie|part\.?)\s*[0-9]+\s*$/i, "").trim();
  return cleaned.replace(/^[-:;.,\s]+|[-:;.,\s]+$/g, "");
}

function hasKeyword(text, kw) {
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(text);
}

function inferGenresAndTags(text, publisher = "") {
  const combined = `${text} ${publisher}`.toLowerCase();
  const genres = [];
  const tags = [];

  const genreRules = [
    [["magie", "magic", "sorcière", "sorcières", "sorcellerie", "witch", "dragon", "dragons", "royaume", "elfe", "sortilège", "féerique", "fae", "faë", "bragelonne", "calix", "de saxus", "mnémos", "rivka", "fantasy", "tolkien", "sanderson", "romantasy", "grimdark"], "Fantasy"],
    [["planète", "galaxie", "vaisseau", "dystopie", "dystopian", "science-fiction", "science fiction", "sci-fi", "spatial", "cyberpunk", "space opera", "robot", "androïde", "post-apo", "post-apocalyptique"], "Science-Fiction"],
    [["enquête", "meurtre", "crime", "assassin", "mystère", "mystery", "police", "policier", "roman policier", "thriller", "complot", "détective", "detective", "commissaire", "inspecteur", "polar", "suspense"], "Thriller / Polar"],
    [["amour", "romance", "amant", "passion", "romantasy", "fiancé", "séduction", "feel-good", "rom-com"], "Romance"],
    [["xviie", "xixe", "siècle", "mousquetaire", "médiéval", "historique", "historical", "antiquité", "révolution", "guerre mondiale", "history"], "Historique"],
    [["vampire", "vampires", "démon", "fantôme", "ténèbres", "horreur", "horror", "épouvante", "malédiction", "cauchemar", "paranormal", "occulte", "gothique"], "Horreur & Fantastique"],
    [["manga", "mangas", "shonen", "seinen", "shojo", "bande dessinée", "bandes dessinées", "bd", "roman graphique", "graphic novels", "comics", "webtoon", "casterman", "dargaud", "glénat", "kurokawa", "ki-oon", "pika", "kana"], "Manga, BD & Graphique"],
    [["essai", "essais", "biographie", "biography", "autobiographie", "philosophie", "philosophy", "psychologie", "psychology", "développement personnel", "self-help", "économie", "economics", "mémoires", "non-fiction", "nonfiction", "documentaire"], "Non-Fiction & Essais"],
    [["contemporain", "contemporary", "roman contemporain", "littérature contemporaine", "literary fiction", "classique", "classiques", "littérature générale"], "Littérature & Contemporain"]
  ];
  for (const [kws, label] of genreRules) {
    if (kws.some((kw) => hasKeyword(combined, kw)) && !genres.includes(label)) genres.push(label);
  }

  const tagRules = [
    [["sorcière", "sorcières", "sorcellerie", "witch", "coven"], "Sorcières"],
    [["magie", "sortilège", "magic", "alchimie"], "Magie"],
    [["dragon", "dragons"], "Dragons"],
    [["fae", "faë", "fairies"], "Faë"],
    [["vampire", "vampires"], "Vampires"],
    [["royaume", "trône", "politique", "complot", "intrigue", "king", "queen"], "Politique & Complots"],
    [["académie", "université", "academia", "campus"], "Académie / Campus"],
    [["secret", "mystère", "énigme", "mystery", "enquête"], "Enquête & Mystères"],
    [["enemies to lovers", "ennemis", "rival"], "Enemies to Lovers"],
    [["found family", "allié", "équipier"], "Found Family"],
    [["psychologique", "manipulation", "mensonge"], "Suspense Psychologique"],
    [["espace", "planète", "galaxie"], "Exploration Spatiale"],
    [["quête", "aventure"], "Quête & Aventure"]
  ];
  for (const [kws, label] of tagRules) {
    if (kws.some((kw) => hasKeyword(combined, kw)) && !tags.includes(label)) tags.push(label);
  }

  return { genres: genres.slice(0, 4), tags: tags.slice(0, 6) };
}

function inferFantasySubgenres(text = "", publisher = "", title = "", author = "") {
  const combined = `${title} ${author} ${publisher} ${text}`.toLowerCase();
  const isManga = ["manga", "mangas", "shonen", "shōnen", "seinen", "shojo", "shōjo", "josei"].some((kw) => hasKeyword(combined, kw));
  const isNonFiction = ["nonfiction", "non-fiction", "essai", "essais", "biographie", "biography", "memoir"].some((kw) => hasKeyword(combined, kw));
  const rules = [
    // Fantasy
    [["litrpg", "progression fantasy", "cultivation", "dungeon", "donjon", "will wight"], "Progression Fantasy / LitRPG"],
    [["romantasy", "romantic fantasy", "fantasy romance", "fourth wing", "yarros", "acotar", "sarah j. maas", "enemies to lovers"], "Romantasy / Romantic Fantasy"],
    [["flintlock", "powder mage", "mousquet", "mousquetaire", "lames du cardinal", "pierre pevel", "1633"], "Flintlock Fantasy / Militaire"],
    [["grimdark", "poppy war", "kuang", "abercrombie", "john gwynne", "malice", "guerre sanglante"], "Grimdark"],
    [["cozy fantasy", "cosy fantasy", "slice of life", "tranche de vie", "travis baldree", "rewitched", "lucy jane wood", "salon de thé"], "Cozy Fantasy / Tranche de vie"],
    [["retelling", "retellings", "réécriture", "fairy tale", "fairy tales"], "Contes & Réécritures (Retellings)"],
    [["uchronie", "alternate history"], "Uchronie / Histoire Alternative"],
    [["fantasy historique", "historical fantasy", "guy gavriel kay", "jacquelyn benson"], "Fantasy Historique"],
    [["sword and sorcery", "sword & sorcery", "conan"], "Sword & Sorcery"],
    [["science fantasy", "tamsyn muir", "jemisin", "margot dessenne"], "Science Fantasy"],
    [["steampunk", "victorien"], "Steampunk"],
    [["urban fantasy", "fantastique urbain", "dresden", "patricia briggs"], "Urban Fantasy"],
    [["dark fantasy", "nécromancie", "anouck faure", "cité diaphane"], "Dark Fantasy"],
    [["epic fantasy", "high fantasy", "tolkien", "sanderson", "gwynne", "épopée"], "High / Epic Fantasy"],
    [["mythology", "mythic", "mythologie", "mythologique", "madeline miller"], "Fantasy Mythologique"],
    [["paranormal romance", "romance paranormale"], "Romance Paranormale"],
    [["magical realism", "réalisme magique"], "Réalisme Magique"],
    [["young adult fantasy", "ya fantasy", "bardugo"], "Young Adult Fantasy"],
    // Science-Fiction
    [["space opera", "empire galactique", "asimov", "dune"], "Space Opera"],
    [["dystopia", "dystopie", "dystopian", "post-apocalyptique", "post apocalyptic", "post-apo", "effondrement"], "Dystopie / Post-Apocalyptique"],
    [["cyberpunk", "solarpunk", "intelligence artificielle", "hacker"], "Cyberpunk / Solarpunk"],
    [["hard sf", "hard science fiction", "hard science", "astrophysique"], "Hard SF"],
    [["time travel", "voyage temporel"], "Uchronie / Voyage temporel"],
    [["aliens", "first contact", "extraterrestre"], "First Contact / Aliens"],
    // Thriller & Polar
    [["psychological thriller", "thriller psychologique", "domestic thriller", "manipulation", "huis clos"], "Thriller Psychologique"],
    [["polar", "enquête policière", "murder mystery", "mystery thriller", "crime", "commissaire", "inspecteur", "détective", "detective"], "Polar / Enquête policière"],
    [["cosy mystery", "cozy mystery", "détective amateur", "agatha christie"], "Cosy Mystery"],
    [["roman noir", "hardboiled", "noir"], "Roman Noir / Hardboiled"],
    [["espionnage", "espionage", "espion", "géopolitique"], "Espionnage / Géopolitique"],
    [["true crime"], "True Crime"],
    // Romance
    [["contemporary romance", "romance contemporaine", "coup de foudre", "amour moderne"], "Romance Contemporaine"],
    [["rom-com", "romantic comedy", "chick lit", "comédie romantique", "feel-good", "feel good"], "Rom-Com / Feel-Good"],
    [["dark romance"], "Dark Romance"],
    [["new adult", "sports romance", "college", "campus", "université", "colocation"], "New Adult / Campus"],
    [["historical romance", "romance historique", "regency", "régence", "bridgerton"], "Romance Historique"],
    // Littérature, Historique, Horreur, Manga, Non-Fiction (exactement alignés sur GENRE_TAXONOMY de public/app.js)
    [["classics", "classique", "littérature classique"], "Classique"],
    [["roman contemporain", "contemporary fiction", "contemporary"], "Roman Contemporain"],
    [["saga familiale", "family saga"], "Saga Familiale"],
    [["coming of age", "récit initiatique"], "Récit initiatique"],
    [["poetry", "poésie", "théâtre", "plays"], "Poésie / Théâtre"],
    [["short stories", "nouvelles"], "Nouvelles"],
    [["historical fiction", "roman historique", "mémoire historique"], "Roman Historique"],
    [["world war", "guerre mondiale", "xxe siècle"], "XXe siècle / Guerres mondiales"],
    [["medieval", "moyen âge", "antiquité", "ancient history"], "Antiquité / Moyen Âge"],
    [["horror", "horreur", "épouvante", "stephen king", "terreur"], "Horreur / Épouvante"],
    [["gothic", "gothique", "manoir", "hanté"], "Gothique"],
    [["paranormal", "supernatural", "occult", "occulte"], "Paranormal / Occulte"],
    [["lovecraft", "cosmic horror"], "Cosmic Horror / Lovecraftien"],
    [["shonen", "shōnen"], "Manga (Shōnen)"],
    [["seinen"], "Manga (Seinen)"],
    [["shojo", "shōjo", "josei"], "Manga (Shōjo / Josei)"],
    ...(isManga ? [] : [
      [["bande dessinée", "franco-belge"], "Bande Dessinée Franco-Belge"],
      [["graphic novels", "graphic novel", "roman graphique"], "Roman Graphique"],
      [["comics", "comic book"], "Comics"]
    ]),
    [["webtoon", "manhwa"], "Webtoon"],
    ...(isNonFiction ? [[["history", "histoire", "civilisations"], "Histoire & Civilisations"]] : []),
    [["self help", "self-help", "personal development", "développement personnel"], "Développement Personnel"],
    [["biography", "autobiography", "memoir", "biographie", "autobiographie", "mémoires"], "Biographie / Mémoires"],
    [["psychology", "philosophy", "psychologie", "philosophie"], "Philosophie & Psychologie"],
    [["sociology", "politics", "feminism", "société", "politique", "féminisme"], "Société & Politique"],
    [["business", "economics", "finance", "économie"], "Économie & Business"],
    [["popular science", "science", "nature", "écologie"], "Sciences & Nature"]
  ];
  const detected = [];
  for (const [kws, label] of rules) {
    if (kws.some((kw) => hasKeyword(combined, kw)) && !detected.includes(label)) detected.push(label);
  }
  return detected.slice(0, 4);
}

const SUBGENRE_TO_GENRE = {
  "Progression Fantasy / LitRPG": ["Fantasy"],
  "Romantasy / Romantic Fantasy": ["Fantasy", "Romance"],
  "Flintlock Fantasy / Militaire": ["Fantasy"],
  "Grimdark": ["Fantasy"],
  "Cozy Fantasy / Tranche de vie": ["Fantasy"],
  "Contes & Réécritures (Retellings)": ["Fantasy"],
  "Uchronie / Histoire Alternative": ["Fantasy"],
  "Fantasy Historique": ["Fantasy"],
  "Sword & Sorcery": ["Fantasy"],
  "Science Fantasy": ["Fantasy", "Science-Fiction"],
  "Steampunk": ["Science-Fiction"],
  "Urban Fantasy": ["Fantasy"],
  "Dark Fantasy": ["Fantasy"],
  "High / Epic Fantasy": ["Fantasy"],
  "Fantasy Mythologique": ["Fantasy"],
  "Romance Paranormale": ["Fantasy", "Romance"],
  "Réalisme Magique": ["Fantasy"],
  "Young Adult Fantasy": ["Fantasy"],
  "Space Opera": ["Science-Fiction"],
  "Dystopie / Post-Apocalyptique": ["Science-Fiction"],
  "Cyberpunk / Solarpunk": ["Science-Fiction"],
  "Hard SF": ["Science-Fiction"],
  "Uchronie / Voyage temporel": ["Science-Fiction"],
  "First Contact / Aliens": ["Science-Fiction"],
  "Thriller Psychologique": ["Thriller / Polar"],
  "Polar / Enquête policière": ["Thriller / Polar"],
  "Cosy Mystery": ["Thriller / Polar"],
  "Roman Noir / Hardboiled": ["Thriller / Polar"],
  "Espionnage / Géopolitique": ["Thriller / Polar"],
  "True Crime": ["Thriller / Polar", "Non-Fiction & Essais"],
  "Romance Contemporaine": ["Romance"],
  "Rom-Com / Feel-Good": ["Romance"],
  "Dark Romance": ["Romance"],
  "New Adult / Campus": ["Romance"],
  "Romance Historique": ["Romance", "Historique"],
  "Classique": ["Littérature & Contemporain"],
  "Roman Contemporain": ["Littérature & Contemporain"],
  "Saga Familiale": ["Littérature & Contemporain"],
  "Récit initiatique": ["Littérature & Contemporain"],
  "Poésie / Théâtre": ["Littérature & Contemporain"],
  "Nouvelles": ["Littérature & Contemporain"],
  "Roman Historique": ["Historique"],
  "XXe siècle / Guerres mondiales": ["Historique"],
  "Antiquité / Moyen Âge": ["Historique"],
  "Horreur / Épouvante": ["Horreur & Fantastique"],
  "Gothique": ["Horreur & Fantastique"],
  "Paranormal / Occulte": ["Horreur & Fantastique"],
  "Cosmic Horror / Lovecraftien": ["Horreur & Fantastique"],
  "Manga (Shōnen)": ["Manga, BD & Graphique"],
  "Manga (Seinen)": ["Manga, BD & Graphique"],
  "Manga (Shōjo / Josei)": ["Manga, BD & Graphique"],
  "Bande Dessinée Franco-Belge": ["Manga, BD & Graphique"],
  "Roman Graphique": ["Manga, BD & Graphique"],
  "Webtoon": ["Manga, BD & Graphique"],
  "Comics": ["Manga, BD & Graphique"],
  "Développement Personnel": ["Non-Fiction & Essais"],
  "Histoire & Civilisations": ["Non-Fiction & Essais"],
  "Biographie / Mémoires": ["Non-Fiction & Essais"],
  "Philosophie & Psychologie": ["Non-Fiction & Essais"],
  "Société & Politique": ["Non-Fiction & Essais"],
  "Économie & Business": ["Non-Fiction & Essais"],
  "Sciences & Nature": ["Non-Fiction & Essais"]
};

function mapSingleShelfToGenre(s, allNormShelves = []) {
  const matchAny = (list) => list.some((kw) => s === kw || hasKeyword(s, kw));

  if (matchAny(["manga", "mangas", "comics", "graphic novels", "graphic novel", "bande dessinée", "bandes dessinées", "shonen", "seinen", "shojo", "josei", "webtoon", "manhwa", "comic book"])) {
    return "Manga, BD & Graphique";
  }
  if (matchAny(["fantasy", "romantasy", "high fantasy", "epic fantasy", "urban fantasy", "dark fantasy", "grimdark", "cozy fantasy", "fae", "magic", "dragons", "witches", "mythology", "fairy tales"])) {
    return "Fantasy";
  }
  if (matchAny(["science fiction", "sci-fi", "sci fi", "dystopia", "dystopian", "space opera", "cyberpunk", "post apocalyptic", "post-apocalyptic", "time travel", "steampunk", "hard science fiction", "aliens"])) {
    return "Science-Fiction";
  }
  if (matchAny(["thriller", "mystery", "crime", "mystery thriller", "psychological thriller", "detective", "suspense", "noir", "cozy mystery", "espionage", "policier", "polar", "whodunit"])) {
    return "Thriller / Polar";
  }
  if (matchAny(["contemporary romance", "historical romance", "dark romance", "paranormal romance", "new adult", "chick lit", "romantic comedy", "rom-com", "sports romance"])) {
    return "Romance";
  }
  if (s === "romance") {
    // Si "Fiction" / "Roman" est arrivé avant "Romance" et qu'il y a "Book Club" / "French Literature" sans sous-genre romance dédié, c'est plutôt Littérature & Contemporain
    const romIdx = allNormShelves.indexOf("romance");
    const ficIdx = allNormShelves.findIndex((x) => x === "fiction" || x === "roman");
    const hasLitMarkers = allNormShelves.some((x) => ["french literature", "book club", "literary fiction", "classics"].includes(x));
    const hasDedicatedRom = allNormShelves.some((x) => ["contemporary romance", "dark romance", "historical romance", "new adult", "sports romance", "romantasy"].includes(x));
    if (ficIdx >= 0 && ficIdx < romIdx && hasLitMarkers && !hasDedicatedRom) {
      return "Littérature & Contemporain";
    }
    return "Romance";
  }
  if (matchAny(["historical fiction", "roman historique", "world war ii", "ancient history", "medieval"])) {
    return "Historique";
  }
  if (matchAny(["horror", "horreur", "épouvante", "gothic", "ghosts", "vampires", "supernatural", "occult", "paranormal", "zombies", "werewolves", "lovecraftian"])) {
    return "Horreur & Fantastique";
  }
  if (matchAny(["nonfiction", "non-fiction", "biography", "memoir", "autobiography", "self help", "self-help", "personal development", "psychology", "philosophy", "business", "economics", "sociology", "politics", "essays", "popular science", "true crime", "essai", "biographie"])) {
    return "Non-Fiction & Essais";
  }
  if (matchAny(["contemporary", "contemporary fiction", "literary fiction", "classics", "classic", "poetry", "plays", "short stories", "womens fiction"])) {
    return "Littérature & Contemporain";
  }
  return null;
}

function mapOfficialShelvesToGenres(shelves = []) {
  const normShelves = shelves.map((s) => String(s || "").trim().toLowerCase()).filter(Boolean);
  if (normShelves.length === 0) return [];

  const hasAny = (list) => normShelves.some((s) => list.some((kw) => s === kw || hasKeyword(s, kw)));

  // 1. Priorité absolue au format Manga / BD / Comics / Webtoon
  if (hasAny(["manga", "mangas", "comics", "graphic novels", "graphic novel", "bande dessinée", "bandes dessinées", "shonen", "seinen", "shojo", "josei", "webtoon", "manhwa", "comic book"])) {
    return ["Manga, BD & Graphique"];
  }

  // 2. Priorité absolue à la Non-Fiction quand "Nonfiction" / "Biography" / "Essai" est présent sans être un roman ("Fiction"/"Roman" absent ou secondaire)
  const nonFicIdx = normShelves.findIndex((s) => ["nonfiction", "non-fiction", "biography", "memoir", "autobiography", "self help", "self-help", "essai", "essais", "biographie"].some((kw) => s === kw || hasKeyword(s, kw)));
  const ficIdx = normShelves.findIndex((s) => s === "fiction" || s === "roman" || s === "novels");
  if (nonFicIdx >= 0 && (ficIdx === -1 || nonFicIdx < ficIdx)) {
    return ["Non-Fiction & Essais"];
  }

  // 3. Pour les romans : on parcourt les shelves dans l'ordre exact des votes pour retenir LE genre principal dominant
  for (const s of normShelves) {
    const mapped = mapSingleShelfToGenre(s, normShelves);
    if (mapped) return [mapped];
  }

  // 4. Si seules des étiquettes génériques de roman ("Fiction", "Roman", "Novels", "Literature") sont présentes
  if (hasAny(["fiction", "roman", "novels", "novel", "literature", "french literature", "book club", "general fiction", "drama"])) {
    return ["Littérature & Contemporain"];
  }

  return [];
}

async function fetchBnfAuthorCountry(authorRecordId) {
  if (!authorRecordId) return null;
  try {
    const url = `https://catalogue.bnf.fr/api/SRU?operation=searchRetrieve&version=1.2&query=aut.recordid+all+"${encodeURIComponent(authorRecordId)}"&recordSchema=unimarcXchange&maximumRecords=1`;
    const resp = await fetch(url, { headers: DEFAULT_HEADERS });
    if (!resp.ok) return null;
    const xml = await resp.text();
    const df102 = xml.match(/<mxc:datafield[^>]*tag="102"[^>]*>([\s\S]*?)<\/mxc:datafield>/i);
    if (df102) {
      const sfa = df102[1].match(/<mxc:subfield[^>]*code="a"[^>]*>([\s\S]*?)<\/mxc:subfield>/i);
      if (sfa) {
        const code = sfa[1].trim().toUpperCase();
        if (ISO_COUNTRY_MAP[code]) return ISO_COUNTRY_MAP[code];
      }
    }
  } catch {}
  return null;
}

async function fetchFromBnf(isbnOrQuery) {
  const data = {};
  try {
    const cleanQ = String(isbnOrQuery || "").replace(/-/g, "").trim();
    const isIsbn = /^\d{10}(\d{3})?$/.test(cleanQ);
    const queryStr = isIsbn
      ? `bib.isbn+adj+"${cleanQ}"`
      : `bib.anywhere+all+"${encodeURIComponent(isbnOrQuery)}"`;

    // IMPORTANT: recordSchema=unimarcXchange (with capital X!)
    const url = `https://catalogue.bnf.fr/api/SRU?operation=searchRetrieve&version=1.2&query=${queryStr}&recordSchema=unimarcXchange&maximumRecords=1`;
    const resp = await fetch(url, { headers: DEFAULT_HEADERS });
    if (!resp.ok) return data;
    const xml = await resp.text();
    if (!xml.includes("<mxc:record")) return data;

    const getFieldBlocks = (tag) => {
      const re = new RegExp(`<mxc:datafield[^>]*tag="${tag}"[^>]*>([\\s\\S]*?)<\\/mxc:datafield>`, "gi");
      return [...xml.matchAll(re)].map((m) => m[1]);
    };
    const getSub = (block, code) => {
      const re = new RegExp(`<mxc:subfield[^>]*code="${code}"[^>]*>([\\s\\S]*?)<\\/mxc:subfield>`, "i");
      const m = block.match(re);
      return m ? unescapeHtml(m[1]) : "";
    };

    const recMatch = xml.match(/<mxc:record[^>]*id="([^"]+)"/i);
    const arkId = recMatch ? recMatch[1] : "";

    // 010: ISBN ($a), format ($b), price ($d)
    for (const b of getFieldBlocks("010")) {
      const sfa = getSub(b, "a").replace(/\D/g, "");
      if ((sfa.length === 10 || sfa.length === 13) && !data.isbn) data.isbn = sfa;
      const sfb = getSub(b, "b").toLowerCase();
      if (sfb.includes("rel") || sfb.includes("cart")) data.format = "Relié";
      else if (sfb.includes("poche")) data.format = "Poche";
      else if (sfb.includes("br")) data.format = "Broché";
      const sfd = getSub(b, "d");
      const pm = sfd.match(/(\d+(?:[.,]\d{1,2})?)/);
      if (pm) {
        const pv = parseFloat(pm[1].replace(",", "."));
        if (pv >= 1 && pv <= 300) data.price = Math.round(pv * 100) / 100;
      }
    }

    // 073: EAN-13
    for (const b of getFieldBlocks("073")) {
      const sfa = getSub(b, "a").replace(/\D/g, "");
      if (sfa.length === 13) data.isbn = sfa;
    }

    // 101: Original language ($c)
    let origLang = "";
    for (const b of getFieldBlocks("101")) {
      const sfc = getSub(b, "c").toLowerCase();
      if (sfc) origLang = sfc;
    }

    // 200: Title ($a), Volume ($h), Subtitle ($e), Author ($f)
    for (const b of getFieldBlocks("200")) {
      const sfa = getSub(b, "a");
      if (sfa) data.title = sfa;
      const sfh = getSub(b, "h");
      if (sfh && !data.series_volume) {
        const vm = sfh.match(/(\d+(?:[.,]\d+)?)/);
        if (vm) data.series_volume = parseFloat(vm[1].replace(",", "."));
      }
      const sfe = getSub(b, "e");
      if (sfe) {
        const { seriesName, seriesVolume } = extractSeriesInfo(sfe);
        if (seriesName) {
          data.series_name = seriesName;
          data.series_volume = seriesVolume;
        }
      }
      const sff = getSub(b, "f");
      if (sff && !data.author) data.author = sff;
    }

    // 214 / 210: Publisher ($c), Year ($d)
    for (const tag of ["214", "210"]) {
      for (const b of getFieldBlocks(tag)) {
        const sfc = getSub(b, "c").replace(/^[\[\]\s:]+|[\[\]\s:]+$/g, "");
        if (sfc && !sfc.toLowerCase().includes("impr.") && !data.publisher) {
          data.publisher = sfc;
        }
        const sfd = getSub(b, "d");
        const ym = sfd.match(/\b(19\d\d|20\d\d)\b/);
        if (ym && !data.publication_year) data.publication_year = Number(ym[1]);
      }
    }

    // 215: Page count ($a)
    for (const b of getFieldBlocks("215")) {
      const sfa = getSub(b, "a");
      const pm = sfa.match(/(\d+)\s*p\b/i) || sfa.match(/(\d{2,4})/);
      if (pm) data.page_count = Number(pm[1]);
    }

    // 330: Summary ($a) & 606/608/610: Subject / Genre headings ($a)
    const bnfSummaries = [];
    for (const b of getFieldBlocks("330")) {
      const sfa = getSub(b, "a");
      if (sfa) bnfSummaries.push(sfa);
    }
    if (bnfSummaries.length) data.summary = bnfSummaries.join(" ");

    const bnfSubjects = [];
    for (const tag of ["606", "608", "610"]) {
      for (const b of getFieldBlocks(tag)) {
        const sfa = getSub(b, "a");
        if (sfa) bnfSubjects.push(sfa);
      }
    }
    if (bnfSubjects.length) data.bnf_subjects = bnfSubjects.join(" ");

    // 454: Original Title ($t) for translated works (e.g. "The housemaid" for "La femme de ménage")
    for (const b of getFieldBlocks("454")) {
      const sft = getSub(b, "t").trim();
      if (sft && !data.original_title) data.original_title = sft;
    }

    // 461 / 410 / 225: Series ($t or $a) & Volume ($v)
    for (const tag of ["461", "410", "225"]) {
      for (const b of getFieldBlocks(tag)) {
        const sft = getSub(b, "t") || getSub(b, "a");
        const sfv = getSub(b, "v");
        if (sft && /poche|folio|pocket|j'ai lu|livre de poche|10-18|points/i.test(sft)) {
          data.format = "Poche";
        } else if (sft && sfv && !data.series_name) {
          const vm = sfv.match(/(\d+(?:[.,]\d+)?)/);
          if (vm) {
            data.series_name = sft;
            data.series_volume = parseFloat(vm[1].replace(",", "."));
          }
        }
      }
    }

    // 700: Author ($b First, $a Last, $3 Authority ID)
    for (const b of getFieldBlocks("700")) {
      const sfa = getSub(b, "a");
      const sfb = getSub(b, "b");
      if (sfa) data.author = `${sfb} ${sfa}`.trim();
      const sf3 = getSub(b, "3");
      if (sf3) {
        const country = await fetchBnfAuthorCountry(sf3);
        if (country) data.author_country = country;
      }
    }

    if (!data.author_country && origLang) {
      const langMap = {
        eng: "Royaume-Uni", jpn: "Japon", ger: "Allemagne", deu: "Allemagne",
        spa: "Espagne", ita: "Italie", pol: "Pologne", rus: "Russie", swe: "Suède"
      };
      if (langMap[origLang]) data.author_country = langMap[origLang];
    }

    // 856: BnF official HD cover
    if (arkId) {
      for (const b of getFieldBlocks("856")) {
        const sfb = getSub(b, "b").toLowerCase();
        if (sfb.includes("couverture")) {
          data.cover_url = `https://catalogue.bnf.fr/couverture?appName=NE&idArk=${arkId}&couverture=1`;
          break;
        }
      }
    }
  } catch (e) {
    console.warn("BnF error:", e);
  }
  return data;
}

async function fetchGoodreadsBookGenres(bookUrl) {
  if (!bookUrl) return [];
  const fullUrl = bookUrl.startsWith("http") ? bookUrl : `https://www.goodreads.com${bookUrl}`;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 2800) : null;
  try {
    const resp = await fetch(fullUrl, {
      headers: DEFAULT_HEADERS,
      signal: controller ? controller.signal : undefined
    });
    if (!resp.ok) return [];
    const html = await resp.text();
    const blockMatch = html.match(/"bookGenres":\[(.*?)\]/);
    if (!blockMatch) return [];
    const names = [...blockMatch[1].matchAll(/"name":"([^"]+)"/g)].map((m) => unescapeHtml(m[1]));
    return Array.from(new Set(names));
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function authorLastNameToken(author = "") {
  const parts = normStr(author).split(" ").filter((w) => w.length >= 3);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

async function fetchFromGoodreads(query, expectedAuthor = "") {
  const data = {};
  if (!query) return data;
  try {
    const url = `https://www.goodreads.com/book/auto_complete?format=json&q=${encodeURIComponent(query.trim())}`;
    const resp = await fetch(url, { headers: DEFAULT_HEADERS });
    if (!resp.ok) return data;
    const items = await resp.json();
    if (!Array.isArray(items) || items.length === 0) return data;

    const authToken = authorLastNameToken(expectedAuthor);
    const matchingItems = authToken
      ? items.filter((it) => normStr((it.author && it.author.name) || "").includes(authToken))
      : items;
    const pool = matchingItems.length > 0 ? matchingItems : (expectedAuthor ? [] : items);
    if (pool.length === 0) return data;

    let bestItem = pool[0];
    for (const it of pool) {
      if (Number(it.avgRating || 0) > 0 && Number(it.ratingsCount || 0) > Number(bestItem.ratingsCount || 0)) {
        bestItem = it;
      }
    }

    if (bestItem.bookUrl) data.book_url = bestItem.bookUrl;
    data.ratings_count = Number(bestItem.ratingsCount || 0);

    const rawTitle = unescapeHtml(bestItem.title || "");
    const bareTitle = cleanTitleFromSeries(bestItem.bookTitleBare || rawTitle);
    if (bareTitle) data.title = bareTitle;

    const bestWid = bestItem.workId;
    const bestNormT = normStr(bareTitle);

    for (const it of [bestItem, ...items]) {
      const candTitle = unescapeHtml(it.title || "");
      const { seriesName, seriesVolume } = extractSeriesInfo(candTitle);
      if (seriesName && seriesVolume !== null) {
        const candBare = normStr(cleanTitleFromSeries(it.bookTitleBare || candTitle));
        if ((bestWid && it.workId === bestWid) || (bestNormT && candBare === bestNormT)) {
          data.series_name = seriesName;
          data.series_volume = seriesVolume;
          break;
        }
      }
    }

    if (Number(bestItem.avgRating || 0) > 0) {
      data.popularity_score = Math.round(Number(bestItem.avgRating) * 100) / 100;
    }
    if (Number(bestItem.numPages || 0) > 0) {
      data.page_count = Number(bestItem.numPages);
    }
    if (bestItem.author && bestItem.author.name) {
      data.author = unescapeHtml(bestItem.author.name);
    }
    const imgUrl = String(bestItem.imageUrl || "");
    if (imgUrl && !imgUrl.includes("nophoto")) {
      data.cover_url = imgUrl
        .replace(/\._S[XY]\d+_\./g, ".")
        .replace(/\._S[XY]\d+_CR\d+,\d+,\d+,\d+_\./g, ".");
    }
    const descHtml = (bestItem.description && bestItem.description.html) || "";
    if (descHtml) {
      data.summary = unescapeHtml(descHtml);
    }
  } catch (e) {
    console.warn("Goodreads error:", e);
  }
  return data;
}

async function fetchFromOpenLibrary(isbnOrQuery) {
  const data = {};
  const cleanQ = String(isbnOrQuery || "").replace(/-/g, "").trim();
  const isIsbn = /^\d{10}(\d{3})?$/.test(cleanQ);
  try {
    if (isIsbn) {
      const resp = await fetch(`https://openlibrary.org/isbn/${cleanQ}.json`, { headers: DEFAULT_HEADERS });
      if (resp.ok) {
        const item = await resp.json();
        if (item.title) data.title = item.title;
        if (item.number_of_pages) data.page_count = Number(item.number_of_pages);
        if (item.publish_date) {
          const ym = String(item.publish_date).match(/\b(19\d\d|20\d\d)\b/);
          if (ym) data.publication_year = Number(ym[1]);
        }
        if (Array.isArray(item.publishers) && item.publishers[0]) data.publisher = item.publishers[0];
        if (Array.isArray(item.covers) && item.covers[0]) {
          data.cover_url = `https://covers.openlibrary.org/b/id/${item.covers[0]}-L.jpg`;
        }
      }
    }
  } catch {}
  return data;
}

async function fetchOpenLibrarySubjects(title, author = "") {
  const q = `${cleanTitleFromSeries(title || "")} ${author || ""}`.trim();
  if (!q) return "";
  try {
    const resp = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=2&fields=title,author_name,subject`,
      { headers: DEFAULT_HEADERS }
    );
    if (!resp.ok) return "";
    const json = await resp.json();
    const docs = (json && json.docs) || [];
    const subjects = [];
    for (const d of docs) {
      if (Array.isArray(d.subject)) subjects.push(...d.subject.slice(0, 15));
    }
    return subjects.join(" ");
  } catch {
    return "";
  }
}

async function fetchFromGoogleBooks(isbnOrQuery, apiKey = "") {
  const data = {};
  const results = [];
  const cleanQ = String(isbnOrQuery || "").replace(/-/g, "").trim();
  const isIsbn = /^\d{10}(\d{3})?$/.test(cleanQ);
  const qParam = isIsbn ? `isbn:${cleanQ}` : isbnOrQuery;
  const keySuffix = apiKey ? `&key=${encodeURIComponent(apiKey)}` : "";
  try {
    let resp = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(qParam)}&maxResults=6${keySuffix}`);
    let json = resp.ok ? await resp.json() : null;
    let items = (json && json.items) || [];
    if (items.length === 0 && isIsbn) {
      resp = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(cleanQ)}&maxResults=4${keySuffix}`);
      json = resp.ok ? await resp.json() : null;
      items = (json && json.items) || [];
    }

    for (const it of items) {
      const vol = it.volumeInfo || {};
      const ids = vol.industryIdentifiers || [];
      const isbnObj = ids.find((i) => i.type === "ISBN_13") || ids.find((i) => i.type === "ISBN_10") || {};
      let cover = (vol.imageLinks && (vol.imageLinks.thumbnail || vol.imageLinks.smallThumbnail)) || "";
      if (cover) {
        cover = cover.replace("http://", "https://").replace(/&edge=curl/g, "");
      }
      const { seriesName, seriesVolume } = extractSeriesInfo(vol.subtitle || vol.title || "");
      const cleanT = cleanTitleFromSeries(vol.title || "");
      const ym = String(vol.publishedDate || "").match(/\b(19\d\d|20\d\d)\b/);
      const itemData = {
        isbn: isbnObj.identifier || (isIsbn ? cleanQ : ""),
        title: cleanT || vol.title || "",
        author: (vol.authors || []).join(", "),
        publisher: vol.publisher || "",
        publication_year: ym ? Number(ym[1]) : null,
        page_count: vol.pageCount ? Number(vol.pageCount) : null,
        series_name: seriesName || "",
        series_volume: seriesVolume,
        cover_url: cover,
        popularity_score: vol.averageRating ? Number(vol.averageRating) : null,
        description: vol.description || "",
        categories: Array.isArray(vol.categories) ? vol.categories.join(" ") : ""
      };
      results.push(itemData);
    }

    if (results[0]) Object.assign(data, results[0]);
  } catch {}
  return { data, results };
}

async function enrichBookMetadata(isbnOrQuery, googleBooksApiKey = "") {
  const cleanInput = String(isbnOrQuery || "").trim();
  const digitsOnly = cleanInput.replace(/[^0-9Xx]/g, "").toUpperCase();
  const isIsbn = (digitsOnly.length === 10 || digitsOnly.length === 13) &&
    (digitsOnly.startsWith("978") || digitsOnly.startsWith("979") || digitsOnly.length === 10);
  const isbn = isIsbn ? digitsOnly : "";

  const result = {
    isbn,
    title: "",
    series_name: "",
    series_volume: null,
    author: "",
    author_country: "France",
    publisher: "",
    publication_year: new Date().getFullYear(),
    page_count: 300,
    chapter_count: null,
    price: null,
    format: "Broché",
    genres: [],
    tags: [],
    fantasy_subgenres: [],
    popularity_score: null,
    cover_url: ""
  };

  // Run BnF, Goodreads (initial), OpenLibrary, and Google Books in parallel for maximum speed!
  const [bnfData, grInitial, olData, gbRes] = await Promise.all([
    fetchFromBnf(isbn || cleanInput),
    fetchFromGoodreads(isbn || cleanInput),
    fetchFromOpenLibrary(isbn || cleanInput),
    fetchFromGoogleBooks(isbn || cleanInput, googleBooksApiKey)
  ]);

  // 1. Apply BnF (Official French Edition Authority)
  for (const [k, v] of Object.entries(bnfData)) {
    if (k === "original_title" || k === "bnf_subjects" || k === "summary") continue;
    if (v !== null && v !== undefined && v !== "") result[k] = v;
  }

  // 2. Query Goodreads (Original Title / French Title + Author / Title-only), OpenLibrary Subjects, and Google Books Title fallback in parallel
  let grData = grInitial;
  const knownTitle = result.title || (gbRes.data && gbRes.data.title) || olData.title || "";
  const knownAuthor = result.author || (gbRes.data && gbRes.data.author) || "";
  const origTitle = bnfData.original_title || "";
  let olSubjects = "";
  let gbFallbackCategories = "";
  let gbFallbackDesc = "";

  if (knownTitle) {
    const cleanT = cleanTitleFromSeries(knownTitle);
    const qOrigAuth = origTitle ? `${cleanTitleFromSeries(origTitle)} ${knownAuthor}`.trim() : "";
    const qTitleAuth = `${cleanT} ${knownAuthor}`.trim();
    const needGrFallback = !grData.book_url || Number(grData.ratings_count || 0) < 25;
    const currentGbCats = String((gbRes.data && gbRes.data.categories) || "").trim();
    const needGbTitleFallback = !currentGbCats || /^fiction$/i.test(currentGbCats);
    const gbQueryStr = origTitle
      ? `intitle:${cleanTitleFromSeries(origTitle)} ${authorLastNameToken(knownAuthor)}`
      : `intitle:${cleanT} ${authorLastNameToken(knownAuthor)}`;

    const [grOrig, grTitleAuth, grTitleOnly, subjectsFr, subjectsOrig, gbTitleRes] = await Promise.all([
      needGrFallback && qOrigAuth ? fetchFromGoodreads(qOrigAuth, knownAuthor) : Promise.resolve(null),
      needGrFallback && qTitleAuth ? fetchFromGoodreads(qTitleAuth, knownAuthor) : Promise.resolve(null),
      needGrFallback && cleanT ? fetchFromGoodreads(cleanT, knownAuthor) : Promise.resolve(null),
      fetchOpenLibrarySubjects(cleanT, knownAuthor),
      origTitle ? fetchOpenLibrarySubjects(origTitle, knownAuthor) : Promise.resolve(""),
      needGbTitleFallback ? fetchFromGoogleBooks(gbQueryStr.trim(), googleBooksApiKey) : Promise.resolve(null)
    ]);

    olSubjects = `${subjectsFr || ""} ${subjectsOrig || ""}`.trim();
    if (gbTitleRes && gbTitleRes.results) {
      gbFallbackCategories = gbTitleRes.results.map((r) => r.categories || "").filter(Boolean).join(" ");
      gbFallbackDesc = (gbTitleRes.data && gbTitleRes.data.description) || "";
    }

    // Pick the Goodreads candidate with the highest community ratingsCount (ensuring canonical work with rich bookGenres!)
    const grCandidates = [grData, grOrig, grTitleAuth, grTitleOnly].filter((c) => c && (c.title || c.book_url));
    grCandidates.sort((a, b) => Number(b.ratings_count || 0) - Number(a.ratings_count || 0));
    if (grCandidates[0]) {
      const bestGr = { ...grCandidates[0] };
      for (const cand of grCandidates.slice(1)) {
        for (const [k, v] of Object.entries(cand)) {
          if (v !== null && v !== undefined && v !== "" && !bestGr[k]) bestGr[k] = v;
        }
      }
      grData = bestGr;
    }
  }

  // Fetch official community-voted Goodreads genres (e.g. ["Fantasy", "Epic Fantasy"] or ["Thriller", "Psychological Thriller"])
  const grOfficialGenres = grData.book_url ? await fetchGoodreadsBookGenres(grData.book_url) : [];

  // 3. Merge Goodreads
  if (grData.popularity_score) result.popularity_score = grData.popularity_score;
  if (grData.genres && grData.genres.length) result.genres = grData.genres;
  if (grData.tags && grData.tags.length) result.tags = grData.tags;
  if (grData.series_name && !result.series_name) {
    result.series_name = grData.series_name;
    result.series_volume = grData.series_volume;
  }
  if (grData.cover_url && !result.cover_url) result.cover_url = grData.cover_url;
  if (grData.title && !result.title) result.title = grData.title;
  if (grData.author && !result.author) result.author = grData.author;
  if (grData.page_count && !bnfData.page_count) result.page_count = grData.page_count;

  // 4. Merge OpenLibrary & Google Books for any missing fields
  for (const src of [olData, gbRes.data || {}]) {
    for (const k of ["title", "author", "publisher", "publication_year", "page_count", "cover_url", "isbn", "popularity_score"]) {
      if (src[k] && (!result[k] || (k === "page_count" && result.page_count === 300 && !bnfData.page_count))) {
        result[k] = src[k];
      }
    }
  }

  // 5. Series cleanup from title
  if (!result.series_name && result.title) {
    const { seriesName, seriesVolume } = extractSeriesInfo(result.title);
    if (seriesName) {
      result.series_name = seriesName;
      result.series_volume = seriesVolume;
      result.title = cleanTitleFromSeries(result.title);
    }
  } else if (result.title) {
    result.title = cleanTitleFromSeries(result.title) || result.title;
  }

  // 6. Infer Genres, Tags & Subgenres (Goodreads Official Genres + BnF + OpenLibrary + Google Books)
  const structuredLabels = [
    ...grOfficialGenres,
    ...(bnfData.bnf_subjects ? bnfData.bnf_subjects.split(/\s{2,}|;|,/) : []),
    ...((gbRes.data && gbRes.data.categories) ? [gbRes.data.categories] : []),
    ...(gbFallbackCategories ? [gbFallbackCategories] : []),
    ...(olSubjects ? olSubjects.split(/\s{2,}|;|,/) : [])
  ].filter(Boolean);

  const officialGenres = mapOfficialShelvesToGenres(structuredLabels);

  const allCategoriesText = `${grOfficialGenres.join(" ")} ${bnfData.bnf_subjects || ""} ${olSubjects} ${(gbRes.data && gbRes.data.categories) || ""} ${gbFallbackCategories}`;
  const textBlob = `${result.title} ${origTitle} ${result.series_name} ${allCategoriesText} ${bnfData.summary || ""} ${grData.summary || ""} ${(gbRes.data && gbRes.data.description) || ""} ${gbFallbackDesc}`;

  const { genres: kwGenres, tags } = inferGenresAndTags(textBlob, result.publisher);
  if (!result.tags || result.tags.length === 0) result.tags = tags;

  const rawSubgenres = inferFantasySubgenres(
    `${textBlob} ${result.tags.join(" ")}`,
    result.publisher,
    `${result.title} ${origTitle}`,
    result.author
  );

  // Détermination d'UN SEUL genre principal propre (priorité : Manga/BD > Non-Fiction > 1er genre officiel voté > mots-clés > sous-genre)
  let primaryGenre = "";
  if (officialGenres.length > 0) {
    primaryGenre = officialGenres[0];
  } else if (kwGenres.includes("Manga, BD & Graphique")) {
    primaryGenre = "Manga, BD & Graphique";
  } else if (kwGenres.includes("Non-Fiction & Essais") && kwGenres.length === 1) {
    primaryGenre = "Non-Fiction & Essais";
  } else if (kwGenres.length > 0) {
    primaryGenre = kwGenres[0];
  } else if (rawSubgenres.length > 0) {
    const parents = SUBGENRE_TO_GENRE[rawSubgenres[0]] || [];
    if (parents[0]) primaryGenre = parents[0];
  }

  result.genres = primaryGenre ? [primaryGenre] : [];

  // Filtre les sous-genres pour ne garder que ceux cohérents avec le genre principal retenu
  result.fantasy_subgenres = primaryGenre
    ? rawSubgenres.filter((sg) => {
        const parents = SUBGENRE_TO_GENRE[sg] || [];
        return parents.length === 0 || parents.includes(primaryGenre);
      }).slice(0, 3)
    : rawSubgenres.slice(0, 3);

  const listResults = (gbRes.results && gbRes.results.length > 0)
    ? [result, ...gbRes.results.slice(1)]
    : [result];

  return { best: result, results: listResults };
}

// ==========================================
// AUTHENTIFICATION & MULTI-TENANT (CRYPTO)
// ==========================================
const crypto = require("node:crypto");
const { Buffer } = require("node:buffer");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, key] = storedHash.split(":");
  const derived = crypto.scryptSync(String(password), salt, 64);
  const keyBuf = Buffer.from(key, "hex");
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function getAuthSecret(connStr) {
  return crypto.createHash("sha256").update(`statome-jwt-secret:${connStr}`).digest("hex");
}

function createAuthToken(user, connStr) {
  const payload = {
    uid: Number(user.id),
    email: user.email,
    name: user.display_name || user.email.split("@")[0],
    admin: Boolean(user.is_admin),
    exp: Date.now() + 365 * 86400 * 1000 // 1 an de session permanente
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", getAuthSecret(connStr)).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verifyAuthToken(token, connStr) {
  if (!token || !token.includes(".")) return null;
  const [b64, sig] = token.split(".");
  const expectedSig = crypto.createHmac("sha256", getAuthSecret(connStr)).update(b64).digest("base64url");
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function extractToken(headers, query, body) {
  const authHeader = (headers && (headers["authorization"] || headers["Authorization"] || headers["x-auth-token"])) || "";
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7).trim();
  if (authHeader) return authHeader.trim();
  return (body && body.token) || (query && query.token) || "";
}

let goalsSchemaReady = false;
async function ensureGoalsSchema(connStr) {
  if (goalsSchemaReady) return;
  await Promise.all([
    neonQuery(connStr, "ALTER TABLE users ADD COLUMN IF NOT EXISTS annual_books_goal INTEGER DEFAULT 24").catch(() => {}),
    neonQuery(connStr, "ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_minutes_goal INTEGER DEFAULT 30").catch(() => {}),
    neonQuery(connStr, "ALTER TABLE books ADD COLUMN IF NOT EXISTS target_finish_date TEXT").catch(() => {})
  ]);
  goalsSchemaReady = true;
}

async function getBetaSettings(connStr) {
  try {
    const rows = await neonQuery(connStr, "SELECT * FROM app_settings WHERE id = 1");
    if (rows && rows.length > 0) {
      const s = rows[0];
      return {
        beta_open: s.beta_open === true || s.beta_open === "t" || s.beta_open === "true",
        invite_code: String(s.invite_code || "TOMEFAB").trim(),
        max_users: Number(s.max_users || 10)
      };
    }
  } catch {}
  return { beta_open: true, invite_code: "TOMEFAB", max_users: 10 };
}

async function handleApiRequest({ query = {}, headers = {}, body = {}, env = {} }) {
  try {
    const action = query.action || body.action || "bootstrap";
    let connStr = env.DATABASE_URL || process.env.DATABASE_URL || headers["x-database-url"] || "";
    if (connStr.startsWith("postgres://")) {
      connStr = connStr.replace("postgres://", "postgresql://");
    }
    connStr = connStr.trim();

    // 1. Vérification du statut d'authentification & places disponibles dans la Bêta (max 10)
    if (action === "auth_status") {
      const [countRows, settings] = await Promise.all([
        neonQuery(connStr, "SELECT COUNT(*) AS cnt FROM users"),
        getBetaSettings(connStr)
      ]);
      const userCount = Number((countRows[0] && countRows[0].cnt) || 0);
      const spotsLeft = Math.max(0, settings.max_users - userCount);
      const allowSignups = Boolean(settings.beta_open) && spotsLeft > 0;
      const token = extractToken(headers, query, body);
      const decoded = verifyAuthToken(token, connStr);
      return {
        status: 200,
        data: {
          ok: true,
          needs_setup: userCount === 0,
          beta_open: settings.beta_open,
          max_users: settings.max_users,
          user_count: userCount,
          spots_left: spotsLeft,
          allow_signups: allowSignups,
          authenticated: Boolean(decoded),
          user: decoded || null
        }
      };
    }

    // 2. Configuration initiale du compte Propriétaire (uniquement si 0 utilisateur en base)
    if (action === "auth_setup") {
      const countRows = await neonQuery(connStr, "SELECT COUNT(*) AS cnt FROM users");
      const userCount = Number((countRows[0] && countRows[0].cnt) || 0);
      if (userCount > 0) {
        return { status: 403, data: { ok: false, error: "Le compte propriétaire a déjà été configuré." } };
      }
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const displayName = String(body.display_name || "Propriétaire").trim();
      if (!email || password.length < 4) {
        return { status: 400, data: { ok: false, error: "Veuillez saisir un email et un mot de passe (4 caractères min)." } };
      }
      const pwHash = hashPassword(password);
      const rows = await neonQuery(
        connStr,
        `INSERT INTO users (email, password_hash, display_name, is_admin, plan)
         VALUES ($1, $2, $3, TRUE, 'premium')
         RETURNING id, email, display_name, is_admin, plan`,
        [email, pwHash, displayName]
      );
      const owner = rows[0];
      const ownerId = Number(owner.id);

      await Promise.all([
        neonQuery(connStr, "UPDATE books SET user_id = $1 WHERE user_id IS NULL OR user_id = 1", [ownerId]),
        neonQuery(connStr, "UPDATE reading_sessions SET user_id = $1 WHERE user_id IS NULL OR user_id = 1", [ownerId]),
        neonQuery(connStr, "UPDATE book_notes SET user_id = $1 WHERE user_id IS NULL OR user_id = 1", [ownerId]),
        neonQuery(connStr, "UPDATE active_timer SET user_id = $1 WHERE user_id IS NULL OR user_id = 1", [ownerId])
      ]);

      const token = createAuthToken(owner, connStr);
      return {
        status: 200,
        data: {
          ok: true,
          token,
          user: { uid: ownerId, email: owner.email, name: owner.display_name, admin: true }
        }
      };
    }

    // 3. Connexion (Login)
    if (action === "auth_login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const rows = await neonQuery(connStr, "SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1", [email]);
      if (!rows.length || !verifyPassword(password, rows[0].password_hash)) {
        return { status: 401, data: { ok: false, error: "Email ou mot de passe incorrect." } };
      }
      const u = rows[0];
      const isAdmin = u.is_admin === true || u.is_admin === "t" || u.is_admin === "true" || Number(u.id) === 1;
      const token = createAuthToken({ ...u, is_admin: isAdmin }, connStr);
      return {
        status: 200,
        data: {
          ok: true,
          token,
          user: { uid: Number(u.id), email: u.email, name: u.display_name || u.email, admin: isAdmin }
        }
      };
    }

    // 4. Inscription Bêta-Testeur (Code d'invitation + Plafond max 10 utilisateurs)
    if (action === "auth_register") {
      const [countRows, settings] = await Promise.all([
        neonQuery(connStr, "SELECT COUNT(*) AS cnt FROM users"),
        getBetaSettings(connStr)
      ]);
      const userCount = Number((countRows[0] && countRows[0].cnt) || 0);

      if (!settings.beta_open) {
        return { status: 403, data: { ok: false, error: "Les inscriptions à la Bêta sont actuellement fermées par l'administrateur." } };
      }
      if (userCount >= settings.max_users) {
        return { status: 403, data: { ok: false, error: `La Bêta est complète (${settings.max_users}/${settings.max_users} places utilisées).` } };
      }

      const providedCode = String(body.invite_code || "").trim().toUpperCase();
      if (!providedCode || providedCode !== settings.invite_code.toUpperCase()) {
        return { status: 403, data: { ok: false, error: "Code d'invitation Bêta invalide." } };
      }

      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const displayName = String(body.display_name || email.split("@")[0]).trim();
      if (!email || !email.includes("@") || password.length < 4) {
        return { status: 400, data: { ok: false, error: "Email valide et mot de passe d'au moins 4 caractères requis." } };
      }
      const existing = await neonQuery(connStr, "SELECT id FROM users WHERE LOWER(email) = $1", [email]);
      if (existing.length > 0) {
        return { status: 400, data: { ok: false, error: "Un compte existe déjà avec cet email." } };
      }
      const pwHash = hashPassword(password);
      const rows = await neonQuery(
        connStr,
        `INSERT INTO users (email, password_hash, display_name, is_admin, plan)
         VALUES ($1, $2, $3, FALSE, 'beta')
         RETURNING id, email, display_name, is_admin, plan`,
        [email, pwHash, displayName]
      );
      const u = rows[0];
      const token = createAuthToken({ ...u, is_admin: false }, connStr);
      return {
        status: 200,
        data: {
          ok: true,
          token,
          user: { uid: Number(u.id), email: u.email, name: u.display_name, admin: false }
        }
      };
    }

    // 5. Authentification requise pour toutes les actions suivantes
    const token = extractToken(headers, query, body);
    const authUser = verifyAuthToken(token, connStr);
    if (!authUser || !authUser.uid) {
      return { status: 401, data: { ok: false, auth_required: true, error: "Authentification requise." } };
    }
    const userId = Number(authUser.uid);
    const isAdmin = Boolean(authUser.admin) || userId === 1;

    // 6. Actions d'administration Bêta (réservées au Propriétaire)
    if (action === "admin_get_dashboard") {
      if (!isAdmin) return { status: 403, data: { ok: false, error: "Accès réservé au propriétaire." } };
      const [settings, usersRows] = await Promise.all([
        getBetaSettings(connStr),
        neonQuery(
          connStr,
          `SELECT u.id, u.email, u.display_name, u.is_admin, u.plan, u.created_at,
                  (SELECT COUNT(*) FROM books b WHERE b.user_id = u.id) AS books_count,
                  (SELECT COUNT(*) FROM reading_sessions s WHERE s.user_id = u.id) AS sessions_count
           FROM users u
           ORDER BY u.id ASC`
        )
      ]);
      return {
        status: 200,
        data: {
          ok: true,
          settings,
          users: usersRows.map((u) => ({
            id: Number(u.id),
            email: u.email,
            display_name: u.display_name || u.email,
            is_admin: u.is_admin === true || u.is_admin === "t" || Number(u.id) === 1,
            plan: u.plan || "beta",
            created_at: u.created_at,
            books_count: Number(u.books_count || 0),
            sessions_count: Number(u.sessions_count || 0)
          }))
        }
      };
    }

    if (action === "admin_update_settings") {
      if (!isAdmin) return { status: 403, data: { ok: false, error: "Accès réservé au propriétaire." } };
      const betaOpen = Boolean(body.beta_open);
      const inviteCode = String(body.invite_code || "TOMEFAB").trim().toUpperCase();
      const maxUsers = Math.max(1, Math.min(500, Number(body.max_users || 10)));
      await neonQuery(
        connStr,
        `INSERT INTO app_settings (id, beta_open, invite_code, max_users, updated_at)
         VALUES (1, $1, $2, $3, NOW())
         ON CONFLICT (id) DO UPDATE SET
           beta_open = EXCLUDED.beta_open,
           invite_code = EXCLUDED.invite_code,
           max_users = EXCLUDED.max_users,
           updated_at = NOW()`,
        [betaOpen, inviteCode, maxUsers]
      );
      return { status: 200, data: { ok: true } };
    }

    if (action === "admin_reset_password") {
      if (!isAdmin) return { status: 403, data: { ok: false, error: "Accès réservé au propriétaire." } };
      const targetId = Number(body.target_user_id);
      const newPass = String(body.new_password || "").trim();
      if (!targetId || newPass.length < 4) {
        return { status: 400, data: { ok: false, error: "Nouveau mot de passe de 4 caractères min requis." } };
      }
      const pwHash = hashPassword(newPass);
      await neonQuery(connStr, "UPDATE users SET password_hash = $1 WHERE id = $2", [pwHash, targetId]);
      return { status: 200, data: { ok: true } };
    }

    if (action === "admin_delete_user") {
      if (!isAdmin) return { status: 403, data: { ok: false, error: "Accès réservé au propriétaire." } };
      const targetId = Number(body.target_user_id);
      if (!targetId || targetId === 1 || targetId === userId) {
        return { status: 400, data: { ok: false, error: "Impossible de supprimer le compte propriétaire." } };
      }
      await Promise.all([
        neonQuery(connStr, "DELETE FROM reading_sessions WHERE user_id = $1", [targetId]),
        neonQuery(connStr, "DELETE FROM book_notes WHERE user_id = $1", [targetId]),
        neonQuery(connStr, "DELETE FROM active_timer WHERE id = $1 OR user_id = $1", [targetId]),
        neonQuery(connStr, "DELETE FROM books WHERE user_id = $1", [targetId]),
        neonQuery(connStr, "DELETE FROM users WHERE id = $1", [targetId])
      ]);
      return { status: 200, data: { ok: true } };
    }

    if (action === "delete_my_account") {
      if (userId === 1 || isAdmin) {
        return { status: 400, data: { ok: false, error: "Le compte propriétaire ne peut pas être supprimé d'ici." } };
      }
      await Promise.all([
        neonQuery(connStr, "DELETE FROM reading_sessions WHERE user_id = $1", [userId]),
        neonQuery(connStr, "DELETE FROM book_notes WHERE user_id = $1", [userId]),
        neonQuery(connStr, "DELETE FROM active_timer WHERE id = $1 OR user_id = $1", [userId]),
        neonQuery(connStr, "DELETE FROM books WHERE user_id = $1", [userId]),
        neonQuery(connStr, "DELETE FROM users WHERE id = $1", [userId])
      ]);
      return { status: 200, data: { ok: true } };
    }

    // 7. Enrichissement avec Cache Catalogue Partagé entre Bêta-Testeurs (0.02s si déjà scanné !)
    if (action === "search_external" || action === "enrich_book") {
      const q = String(query.q || body.q || "").trim();
      const cacheKey = q.toLowerCase().replace(/\s+/g, " ").slice(0, 110);
      if (cacheKey) {
        const cached = await neonQuery(connStr, "SELECT payload FROM catalog_cache WHERE query_key = $1", [cacheKey]).catch(() => []);
        if (cached && cached.length > 0 && cached[0].payload) {
          try {
            const parsed = JSON.parse(cached[0].payload);
            if (parsed && parsed.best && parsed.best.title && Array.isArray(parsed.best.genres) && parsed.best.genres.length > 0) {
              return { status: 200, data: { ok: true, best: parsed.best, results: parsed.results || [parsed.best], cached: true } };
            }
          } catch {}
        }
      }
      const googleBooksApiKey = (env && env.GOOGLE_BOOKS_API_KEY) || process.env.GOOGLE_BOOKS_API_KEY || "";
      const { best, results } = await enrichBookMetadata(q, googleBooksApiKey);
      if (cacheKey && best && best.title) {
        neonQuery(
          connStr,
          `INSERT INTO catalog_cache (query_key, payload, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (query_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
          [cacheKey, JSON.stringify({ best, results })]
        ).catch(() => {});
      }
      return { status: 200, data: { ok: true, best, results } };
    }

    if (action === "bootstrap") {
      await ensureGoalsSchema(connStr);
      const [rawBooks, rawSessions, rawNotes, rawTimer, rawUser] = await Promise.all([
        neonQuery(connStr, "SELECT * FROM books WHERE user_id = $1 ORDER BY id DESC", [userId]),
        neonQuery(connStr, "SELECT * FROM reading_sessions WHERE user_id = $1 ORDER BY start_time DESC", [userId]),
        neonQuery(connStr, "SELECT * FROM book_notes WHERE user_id = $1 ORDER BY page_number ASC NULLS LAST, created_at DESC", [userId]),
        neonQuery(connStr, "SELECT * FROM active_timer WHERE id = $1 OR user_id = $1 ORDER BY updated_at DESC LIMIT 1", [userId]).catch(() => []),
        neonQuery(connStr, "SELECT annual_books_goal, daily_minutes_goal FROM users WHERE id = $1 LIMIT 1", [userId]).catch(() => [])
      ]);

      const uRow = (rawUser && rawUser[0]) || {};
      const goals = {
        annual_books: Number(uRow.annual_books_goal || 24),
        daily_minutes: Number(uRow.daily_minutes_goal || 30)
      };

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

      return {
        status: 200,
        data: {
          ok: true,
          user: { ...authUser, admin: isAdmin },
          goals,
          books,
          sessions,
          notes,
          active_timer: activeTimer
        }
      };
    }

    if (action === "save_goals") {
      await ensureGoalsSchema(connStr);
      const annualBooks = Math.max(1, Math.min(500, Number(body.annual_books || 24)));
      const dailyMinutes = Math.max(5, Math.min(600, Number(body.daily_minutes || 30)));
      await neonQuery(
        connStr,
        "UPDATE users SET annual_books_goal = $1, daily_minutes_goal = $2 WHERE id = $3",
        [annualBooks, dailyMinutes, userId]
      );
      return { status: 200, data: { ok: true, goals: { annual_books: annualBooks, daily_minutes: dailyMinutes } } };
    }

    if (action === "save_timer") {
      const { book_id, is_running, start_time, accumulated_seconds, is_focused } = body;
      await neonQuery(
        connStr,
        `INSERT INTO active_timer (id, user_id, book_id, is_running, start_time, accumulated_seconds, is_focused, updated_at)
         VALUES ($1, $1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           book_id = EXCLUDED.book_id,
           is_running = EXCLUDED.is_running,
           start_time = EXCLUDED.start_time,
           accumulated_seconds = EXCLUDED.accumulated_seconds,
           is_focused = EXCLUDED.is_focused,
           updated_at = NOW()`,
        [userId, book_id || null, Boolean(is_running), start_time || null, Number(accumulated_seconds || 0), is_focused !== false]
      );
      return { status: 200, data: { ok: true } };
    }

    if (action === "clear_timer") {
      await neonQuery(
        connStr,
        `UPDATE active_timer SET is_running = FALSE, start_time = NULL, accumulated_seconds = 0, book_id = NULL, updated_at = NOW() WHERE id = $1 OR user_id = $1`,
        [userId]
      );
      return { status: 200, data: { ok: true } };
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
         (user_id, book_id, start_time, end_time, duration_minutes, start_page, end_page, pages_read, pages_per_hour, is_weekend, is_focused)
         VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [userId, bookId, nowIso, durationMin, startPage, endPage, pagesRead, pagesPerHour, isWeekend, isFocused]
      );

      await neonQuery(
        connStr,
        `UPDATE books
         SET current_page = GREATEST(COALESCE(current_page, 0), $2),
             started_at = COALESCE(started_at, CURRENT_DATE),
             status = CASE WHEN status IN ('Bibliothèque', 'Wishlist', 'À acheter') THEN 'En cours' ELSE status END
         WHERE id = $1 AND user_id = $3`,
        [bookId, endPage, userId]
      );

      await neonQuery(
        connStr,
        `UPDATE active_timer SET is_running = FALSE, start_time = NULL, accumulated_seconds = 0, book_id = NULL, updated_at = NOW() WHERE id = $1 OR user_id = $1`,
        [userId]
      ).catch(() => {});

      return { status: 200, data: { ok: true } };
    }

    if (action === "delete_session") {
      await neonQuery(connStr, "DELETE FROM reading_sessions WHERE id = $1 AND user_id = $2", [Number(body.session_id), userId]);
      return { status: 200, data: { ok: true } };
    }

    if (action === "add_note") {
      await neonQuery(
        connStr,
        `INSERT INTO book_notes (user_id, book_id, created_at, page_number, chapter_number, note_type, content)
         VALUES ($1, $2, NOW(), $3, $4, $5, $6)`,
        [
          userId,
          Number(body.book_id),
          body.page_number ? Number(body.page_number) : null,
          body.chapter_number ? Number(body.chapter_number) : null,
          body.note_type || "Citation",
          String(body.content || "").trim()
        ]
      );
      return { status: 200, data: { ok: true } };
    }

    if (action === "delete_note") {
      await neonQuery(connStr, "DELETE FROM book_notes WHERE id = $1 AND user_id = $2", [Number(body.note_id), userId]);
      return { status: 200, data: { ok: true } };
    }

    if (action === "add_book") {
      const genresJson = JSON.stringify(Array.isArray(body.genres) ? body.genres : parseJsonArray(body.genres || "Fantasy"));
      const tagsJson = JSON.stringify(Array.isArray(body.tags) ? body.tags : parseJsonArray(body.tags || ""));
      const subgJson = JSON.stringify(Array.isArray(body.fantasy_subgenres) ? body.fantasy_subgenres : parseJsonArray(body.fantasy_subgenre || ""));
      const rows = await neonQuery(
        connStr,
        `INSERT INTO books
         (user_id, isbn, title, series_name, series_volume, author, author_country, publisher, publication_year,
          page_count, chapter_count, price, format, genres, tags, fantasy_subgenre, popularity_score, cover_url,
          status, pal_month, pal_year, current_page, started_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         RETURNING id`,
        [
          userId,
          body.isbn || null,
          body.title || "Sans titre",
          body.series_name || null,
          body.series_volume ? Number(body.series_volume) : null,
          body.author || "Auteur inconnu",
          body.author_country || "France",
          body.publisher || null,
          body.publication_year ? Number(body.publication_year) : null,
          Math.max(Number(body.page_count || 1), 1),
          body.chapter_count ? Number(body.chapter_count) : null,
          body.price ? Number(body.price) : null,
          body.format || "Broché",
          genresJson,
          tagsJson,
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
      return { status: 200, data: { ok: true, id: rows[0] ? Number(rows[0].id) : null } };
    }

    if (action === "update_book") {
      await ensureGoalsSchema(connStr);
      const bookId = Number(body.book_id);
      const data = body.data || {};
      const sets = [];
      const vals = [];
      let idx = 1;

      const allowed = [
        "isbn", "title", "author", "author_country", "publisher", "publication_year",
        "series_name", "series_volume", "page_count", "chapter_count", "current_page",
        "status", "pal_month", "pal_year", "format", "price", "popularity_score", "cover_url",
        "started_at", "finished_at", "target_finish_date", "rating_global", "rating_pacing", "rating_chars",
        "rating_world", "rating_writing", "rating_plot", "final_review",
        "genres", "tags", "fantasy_subgenre"
      ];

      for (const key of allowed) {
        if (key in data) {
          sets.push(`${key} = $${idx++}`);
          let v = data[key];
          if (["fantasy_subgenre", "genres", "tags"].includes(key)) {
            v = JSON.stringify(Array.isArray(v) ? v : parseJsonArray(v || ""));
          }
          if (v === "") v = null;
          vals.push(v);
        }
      }

      if (sets.length > 0) {
        vals.push(bookId);
        vals.push(userId);
        await neonQuery(connStr, `UPDATE books SET ${sets.join(", ")} WHERE id = $${idx} AND user_id = $${idx + 1}`, vals);
      }
      return { status: 200, data: { ok: true } };
    }

    if (action === "delete_book") {
      await neonQuery(connStr, "DELETE FROM books WHERE id = $1 AND user_id = $2", [Number(body.book_id), userId]);
      return { status: 200, data: { ok: true } };
    }

    return { status: 400, data: { ok: false, error: `Action inconnue: ${action}` } };
  } catch (err) {
    return { status: 500, data: { ok: false, error: err.message || String(err) } };
  }
}

async function vercelHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-auth-token, x-database-url");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const result = await handleApiRequest({
    query: req.query || {},
    headers: req.headers || {},
    body,
    env: process.env || {}
  });
  return res.status(result.status).json(result.data);
}

vercelHandler.handleApiRequest = handleApiRequest;
module.exports = vercelHandler;
