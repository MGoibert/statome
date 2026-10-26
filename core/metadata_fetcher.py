"""
Module d'enrichissement et d'acquisition de métadonnées de livres (core/metadata_fetcher.py).
Cascade multi-sources haute résilience :
1. BnF SRU API en UNIMARC (Autorité officielle française : titre, auteur, nationalité officielle via notice d'autorité, éditeur, année, pagination exacte, format, prix officiel en €, collection/série, couverture HD BnF).
2. Goodreads (JSON-LD & Genres : note communautaire /5, genres & tropes traduits en français, série & tome, couverture HD Amazon, pagination).
3. Google Books API (International, résumé, miniatures).
4. Open Library API (Fallback par ISBN et par Titre + Auteur).
5. Babelio & Place des Libraires (Complément prix et tags).
"""

import json
import html
import re
import urllib.parse
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Any, Optional, List, Tuple
import requests
import streamlit as st
from bs4 import BeautifulSoup
import xml.etree.ElementTree as ET

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7"
}

TIMEOUT = 6  # Secondes

# Table de conversion des codes pays ISO (BnF UNIMARC 102$a) vers le nom en français
ISO_COUNTRY_MAP = {
    "FR": "France",
    "GB": "Royaume-Uni",
    "UK": "Royaume-Uni",
    "US": "États-Unis",
    "CA": "Canada",
    "BE": "Belgique",
    "CH": "Suisse",
    "AU": "Australie",
    "NZ": "Nouvelle-Zélande",
    "IE": "Irlande",
    "DE": "Allemagne",
    "AT": "Autriche",
    "IT": "Italie",
    "ES": "Espagne",
    "PT": "Portugal",
    "JP": "Japon",
    "CN": "Chine",
    "KR": "Corée du Sud",
    "PL": "Pologne",
    "RU": "Russie",
    "SE": "Suède",
    "NO": "Norvège",
    "DK": "Danemark",
    "FI": "Finlande",
    "NL": "Pays-Bas",
    "AR": "Argentine",
    "MX": "Mexique",
    "BR": "Brésil",
    "IN": "Inde",
    "ZA": "Afrique du Sud",
}

# Genres principaux vs Tags/Tropes (traduction depuis Goodreads / anglais)
GENRE_TRANSLATION = {
    "fantasy": "Fantasy",
    "high fantasy": "High Fantasy",
    "epic fantasy": "Epic Fantasy",
    "urban fantasy": "Urban Fantasy",
    "dark fantasy": "Dark Fantasy",
    "cozy fantasy": "Fantasy",
    "cosy fantasy": "Fantasy",
    "historical fantasy": "Fantasy Historique",
    "romantasy": "Romantasy",
    "fantasy romance": "Romantasy",
    "grimdark": "Grimdark",
    "science fiction": "Science-Fiction",
    "sci fi": "Science-Fiction",
    "science fiction fantasy": "Imaginaire",
    "space opera": "Space Opera",
    "cyberpunk": "Cyberpunk",
    "steampunk": "Steampunk",
    "dystopia": "Dystopie",
    "post apocalyptic": "Post-Apocalyptique",
    "romance": "Romance",
    "paranormal romance": "Romance Paranormale",
    "historical fiction": "Historique",
    "historical": "Historique",
    "thriller": "Thriller",
    "mystery": "Mystère / Policier",
    "crime": "Policier",
    "horror": "Horreur",
    "gothic": "Gothique",
    "young adult": "Young Adult",
    "mythology": "Mythologie",
    "folklore": "Folklore",
    "fairy tales": "Contes",
    "retellings": "Réécriture de conte",
    "classics": "Classique",
    "contemporary": "Contemporain",
    "magical realism": "Réalisme Magique",
}

TAG_TRANSLATION = {
    "witches": "Sorcières",
    "witchcraft": "Sorcellerie",
    "magic": "Magie",
    "dragons": "Dragons",
    "fae": "Faë",
    "fairies": "Faë",
    "vampires": "Vampires",
    "werewolves": "Loups-garous",
    "ghosts": "Fantômes",
    "demons": "Démons",
    "angels": "Anges",
    "gods": "Dieux",
    "necromancy": "Nécromancie",
    "cozy": "Cozy",
    "autumn": "Automne",
    "halloween": "Halloween",
    "winter": "Hiver",
    "christmas": "Noël",
    "dark academia": "Dark Academia",
    "academia": "Académie",
    "enemies to lovers": "Enemies to Lovers",
    "friends to lovers": "Friends to Lovers",
    "slow burn": "Slow Burn",
    "found family": "Found Family",
    "forced proximity": "Proximité Forcée",
    "grumpy sunshine": "Grumpy / Sunshine",
    "politics": "Politique",
    "war": "Guerre",
    "military": "Militaire",
    "medieval": "Médiéval",
    "royalty": "Royauté",
    "pirates": "Pirates",
    "assassins": "Assassins",
    "thieves": "Voleurs",
    "heist": "Braquage",
    "time travel": "Voyage temporel",
    "adventure": "Aventure",
    "quest": "Quête",
    "paranormal": "Paranormal",
    "supernatural": "Surnaturel",
    "lgbt": "LGBTQ+",
    "queer": "LGBTQ+",
    "feminism": "Féminisme",
    "humor": "Humour",
}

# ==========================================
# Taxonomie des Sous-genres de la Fantasy
# ==========================================

FANTASY_SUBGENRES = [
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
]


def infer_fantasy_subgenres(text: str = "", publisher: str = "", title: str = "", author: str = "") -> List[str]:
    """Détecte automatiquement un ou plusieurs sous-genres de fantasy à partir des métadonnées du livre."""
    combined = f"{title} {author} {publisher} {text}".lower()

    rules = [
        (["litrpg", "progression fantasy", "cultivation", "wuxia", "xianxia", "dungeon", "donjon", "system apocalypse", "will wight", "cradle", "andrew rowe", "sarah lin"], "Progression Fantasy / LitRPG"),
        (["romantasy", "romantic fantasy", "romantic sff", "fourth wing", "yarros", "acotar", "sarah j. maas", "prince fae", "enemies to lovers", "t.j. klune", "grace draven"], "Romantasy / Romantic Fantasy"),
        (["flintlock", "powder mage", "mousquet", "mousquetaire", "fusil", "silex", "poudre", "lames du cardinal", "pierre pevel", "brian mcclellan", "django wexler", "glen cook", "compagnie noire", "1633"], "Flintlock Fantasy / Militaire"),
        (["grimdark", "poppy war", "rf kuang", "r.f. kuang", "abercrombie", "première loi", "nihiliste", "guerre sanglante"], "Grimdark"),
        (["cozy fantasy", "cosy fantasy", "cozy", "cosy", "slice of life", "tranche de vie", "légendes & lattes", "travis baldree", "rewitched", "lucy jane wood", "salon de thé", "librairie adorée", "douillet"], "Cozy Fantasy / Tranche de vie"),
        (["fantasy of manners", "fantasy de mœurs", "etiquette", "salons", "goblin emperor", "katherine addison", "ellen kushner", "swordspoint"], "Fantasy de Mœurs (Fantasy of Manners)"),
        (["retelling", "réécriture", "conte", "fairy tale", "cendrillon", "katherine arden", "juliet marillier", "robin mckinley"], "Contes & Réécritures (Retellings)"),
        (["alternate history", "uchronie", "histoire alternative", "naomi novik", "téméraire", "susanna clarke", "jonathan strange", "alix harrow"], "Uchronie / Histoire Alternative"),
        (["fantasy historique", "historical fantasy", "guy gavriel kay", "helene wecker", "aliette de bodard"], "Fantasy Historique"),
        (["sword and sorcery", "sword & sorcery", "épée et sorcellerie", "conan", "barbare", "robert e. howard", "fritz leiber"], "Sword & Sorcery"),
        (["science fantasy", "gideon the ninth", "tamsyn muir", "cinquième saison", "n.k. jemisin", "technomagie"], "Science Fantasy"),
        (["steampunk", "vapeur", "dirigeable", "rouages", "victorien", "scott westerfeld", "gail carriger"], "Steampunk"),
        (["urban fantasy", "fantastique urbain", "dresden", "fonda lee", "jade city", "seanan mcguire", "patricia briggs", "mercy thompson"], "Urban Fantasy"),
        (["dark fantasy", "berserk", "vampire", "démon", "nécromancie", "marlon james", "anne rice"], "Dark Fantasy"),
        (["epic fantasy", "high fantasy", "tolkien", "brandon sanderson", "ken liu", "jacqueline carey", "sauver le monde", "épopée"], "High / Epic Fantasy"),
        (["mythic fantasy", "mythologie", "mythologique", "madeline miller", "achille", "circé", "maggie stiefvater"], "Fantasy Mythologique"),
        (["magic realism", "magical realism", "réalisme magique", "night circus", "erin morgenstern", "isabelle allende"], "Réalisme Magique"),
        (["pratchett", "disque-monde", "humoristique", "parodie", "douglas adams"], "Fantasy Humoristique"),
        (["new weird", "weird", "china miéville", "jeff vandermeer", "annihilation"], "New Weird"),
        (["weird west", "fantasy western", "saloon", "cow-boy"], "Weird West / Fantasy Western"),
        (["paranormal romance", "métamorphe", "loup-garou", "nalini singh"], "Romance Paranormale"),
        (["young adult", "ya fantasy", "leigh bardugo", "six of crows", "grisha"], "Young Adult Fantasy"),
    ]

    detected: List[str] = []
    for keywords, subg in rules:
        if any(kw in combined for kw in keywords) and subg not in detected:
            detected.append(subg)

    return detected[:3]


def infer_fantasy_subgenre(text: str = "", publisher: str = "", title: str = "", author: str = "") -> List[str]:
    """Alias pour infer_fantasy_subgenres."""
    return infer_fantasy_subgenres(text, publisher, title, author)


def _norm_str(s: str) -> str:
    """Normalise une chaîne (sans accents, minuscule, alphanumérique)."""
    if not s:
        return ""
    n = unicodedata.normalize('NFKD', s).encode('ASCII', 'ignore').decode('utf-8').lower()
    return re.sub(r'[^a-z0-9\s]', ' ', n).strip()


def _norm_series_core(s: str) -> str:
    """Extrait le cœur sémantique d'un nom de série pour comparaison stricte."""
    tokens = _norm_str(s).split()
    stop = {
        'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd',
        'the', 'a', 'an', 'of', 'in', 'and', 'et',
        'trilogy', 'trilogie', 'series', 'serie', 'cycle', 'saga',
        'tome', 'book', 'vol', 'volume', 'recits', 'chronicles', 'chronique', 'chroniques'
    }
    core = [t for t in tokens if t not in stop]
    return " ".join(core) if core else " ".join(tokens)


def matches_author(cand_author: str, target_author: str) -> bool:
    """Vérifie rigoureusement si le nom d'auteur candidat correspond à l'auteur de l'ouvrage."""
    if not target_author or not cand_author:
        return False

    def clean_name_tokens(name: str) -> set:
        n = _norm_str(name)
        words = set(re.findall(r'\b[a-z]{3,}\b', n))
        return words - {'the', 'and', 'von', 'van', 'del', 'della', 'de', 'le', 'la', 'author', 'unknown', 'collectif', 'illustrator', 'translator'}

    c_toks = clean_name_tokens(cand_author)
    t_toks = clean_name_tokens(target_author)
    if not c_toks or not t_toks:
        return False
    # Le nom de famille (dernier token significatif) ou au moins tous les tokens de l'un doivent correspondre
    overlap = c_toks.intersection(t_toks)
    if not overlap:
        return False
    if len(t_toks) >= 2 and len(c_toks) >= 2:
        t_last = _norm_str(target_author).split()[-1]
        if len(t_last) >= 3 and t_last not in c_toks and len(overlap) < 2:
            return False
    return True


def is_series_match(cand_series: Optional[str], target_series: str, known_series: Optional[set] = None) -> bool:
    """Vérifie strictement si la série candidate correspond au nom de saga recherché ou à ses alias connus."""
    if not target_series or not cand_series:
        return False

    all_targets = {target_series}
    if known_series:
        all_targets.update(known_series)

    c_full = _norm_str(cand_series)
    c_core = _norm_series_core(cand_series)
    if not c_core:
        return False

    for t in all_targets:
        t_full = _norm_str(t)
        t_core = _norm_series_core(t)
        if not t_core:
            continue
        if c_full == t_full or c_core == t_core:
            return True
        # Inclusion stricte si le nom de série cœur fait au moins 5 caractères
        shorter, longer = (c_core, t_core) if len(c_core) <= len(t_core) else (t_core, c_core)
        if len(shorter) >= 5 and re.search(rf'\b{re.escape(shorter)}\b', longer):
            return True

    return False


def _is_split_part_title(text: str) -> bool:
    """Détecte si un titre correspond à une sous-partie/demi-tome d'édition poche/brochée française."""
    return bool(re.search(
        r"(?:,|\s+-|\s+)\s*(?:tome|vol(?:ume)?\.?|partie|part\.?)\s*[0-9]+\b|"
        r"\b(?:première|seconde|deuxième)\s+partie\b|"
        r"#\s*[0-9]+(?:\.[12]|\s*part(?:ie)?\.?\s*[12])\b",
        text,
        re.IGNORECASE
    ))


def extract_series_info(text: str) -> tuple[Optional[str], Optional[float]]:
    """Détecte le nom d'une série et le numéro de tome depuis une chaîne."""
    if not text:
        return None, None

    cleaned = html.unescape(text).strip()
    # Retirer les mentions finales parasites type "(French Edition)"
    cleaned_no_ed = re.sub(r"\s*\((?:French|English| Kindle|Paperback|Hardcover| Broché|Poche|Relié).*?\)\s*$", "", cleaned, flags=re.IGNORECASE).strip()

    # 1. Format parenthèses Goodreads prioritaire :
    # ex: "Titre (Nom de la série, #1)", "Titre (Série #3.1)", "Titre (Série, Tome 5)", "Titre (Série, #2 part. 2)"
    paren_patterns = [
        r"\(([^()]+?)(?:,\s*|\s+)(?:#|book\s*|vol(?:ume)?\.?\s*|tome\s*|t\.\s*)0*([0-9]+(?:[\.,][0-9]+)?)(?:\s*(?:part(?:ie)?\.?|tome|vol\.?)\s*[0-9]+)?\)",
        # ex: "Rythme de guerre, volume 1 (Les Archives de Roshar, 4)" ou "(L'Épée de vérité (13))"
        r"\(([^(),]+?)(?:,\s*|\s+\()0*([0-9]+(?:[\.,][0-9]+)?)\)?\)",
    ]
    for pat in paren_patterns:
        matches = list(re.finditer(pat, cleaned_no_ed, re.IGNORECASE))
        if matches:
            m = matches[-1]
            s_name = m.group(1).strip(" -:;,()")
            if len(s_name) > 1 and not re.match(r"^(?:tome|vol|volume|part|partie|book|édition|edition)\b", s_name, re.IGNORECASE):
                try:
                    raw_vol = float(m.group(2).replace(",", "."))
                    # Normaliser les demi-tomes français (#1.1, #1.2, #2.1, etc.) vers le tome principal entier
                    if raw_vol >= 1.0 and round(raw_vol % 1, 1) in (0.1, 0.2):
                        raw_vol = float(int(raw_vol))
                    return s_name, raw_vol
                except ValueError:
                    return s_name, None

    # 2. Format "Titre - Tome 01 Nom de la série (01)"
    m_dash = re.search(r"-\s*(?:tome|vol(?:ume)?\.?)\s*0*([0-9]+)\s+([^(]+?)\s*\(0*\1\)", cleaned_no_ed, re.IGNORECASE)
    if m_dash:
        return m_dash.group(2).strip(" -:;,()"), float(m_dash.group(1))

    # 3. Format "Nom de la série, Tome 2 : Titre du livre" ou "Nom de la série, T13 : Titre"
    m_prefix = re.search(r"^([^:()]+?)[,.\s]+(?:tome|vol(?:ume)?\.?|t\.?)\s*0*([0-9]+(?:[\.,][0-9]+)?)\s*:\s*(.+)$", cleaned_no_ed, re.IGNORECASE)
    if m_prefix:
        s_name = m_prefix.group(1).strip(" -:;,()")
        if len(s_name) > 1:
            try:
                raw_vol = float(m_prefix.group(2).replace(",", "."))
                if raw_vol >= 1.0 and round(raw_vol % 1, 1) in (0.1, 0.2):
                    raw_vol = float(int(raw_vol))
                return s_name, raw_vol
            except ValueError:
                pass

    # 4. Format "Titre 1: Nom de la série 1" ou "Titre : Nom de la série, tome 4"
    m_colon = re.search(r":\s*([^:()]+?)(?:,?\s*(?:tome|vol(?:ume)?\.?)\s*|\s+)0*([0-9]+(?:[\.,][0-9]+)?)\s*$", cleaned_no_ed, re.IGNORECASE)
    if m_colon:
        s_name = m_colon.group(1).strip(" -:;,()")
        if len(s_name) > 2 and not re.search(r"\b(?:livres?\s+en|ans|siècle|édition)\b", s_name, re.IGNORECASE):
            try:
                raw_vol = float(m_colon.group(2).replace(",", "."))
                if raw_vol >= 1.0 and round(raw_vol % 1, 1) in (0.1, 0.2):
                    raw_vol = float(int(raw_vol))
                return s_name, raw_vol
            except ValueError:
                pass

    # 5. Format explicite "Série : X, Tome Y" (pour sous-titres BnF/Google Books)
    m_exp = re.search(r"(?:série|saga|cycle)\s*[:\-]?\s*([^,()]+),\s*(?:tome|vol(?:ume)?\.?)\s*0*([0-9]+(?:[\.,][0-9]+)?)", cleaned_no_ed, re.IGNORECASE)
    if m_exp:
        s_name = m_exp.group(1).strip(" -:;,()")
        if len(s_name) > 1:
            return s_name, float(m_exp.group(2).replace(",", "."))

    return None, None


def clean_title_from_series(title: str, series_name: str = "") -> str:
    """Nettoie un titre contenant la mention de série, d'édition ou de demi-tome."""
    if not title:
        return ""
    cleaned = html.unescape(title).strip()
    # Retirer "- Tome 01 Série" d'abord, puis les parenthèses finales (série, édition, etc.)
    cleaned = re.sub(r"\s*-\s*(?:tome|vol(?:ume)?\.?)\s*0*[0-9]+\s+.*$", "", cleaned, flags=re.IGNORECASE).strip()
    while re.search(r"\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*$", cleaned):
        cleaned = re.sub(r"\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*$", "", cleaned).strip()
    # Si le titre commence par "Nom de la série, Tome X : Vrai Titre", garder "Vrai Titre"
    m_pref = re.match(r"^([^:]+?)[,.\s]+(?:tome|vol(?:ume)?\.?|t\.?)\s*0*[0-9]+(?:[\.,][0-9]+)?\s*:\s*(.+)$", cleaned, re.IGNORECASE)
    if m_pref:
        cleaned = m_pref.group(2).strip()
    # Si le titre est de la forme "La Voie des rois 1: Les archives de Roshar 1"
    if ":" in cleaned:
        left, right = cleaned.split(":", 1)
        if series_name and is_series_match(re.sub(r"\s+[0-9.]+$", "", right).strip(), series_name):
            cleaned = re.sub(r"\s+[0-9]+$", "", left).strip()
    # Retirer les mentions de sous-parties d'édition (ex: ", tome 1", ", Volume 2", ", Partie 1", "- Seconde partie")
    cleaned = re.sub(r"(?:,|\s+-)\s*(?:tome|vol(?:ume)?\.?|partie|part\.?)\s*[0-9]+\s*$", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\s*-\s*(?:première|seconde|deuxième)\s+partie\s*$", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\s+by\s+[A-Z].*$", "", cleaned).strip()
    return cleaned.strip(" -:;.,")


def _fetch_gr_autocomplete(query: str) -> List[Dict[str, Any]]:
    """Exécute une requête Goodreads auto_complete et retourne la liste JSON."""
    if not query:
        return []
    url = f"https://www.goodreads.com/book/auto_complete?format=json&q={urllib.parse.quote(query.strip())}"
    try:
        resp = requests.get(url, headers=DEFAULT_HEADERS, timeout=4)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                return data
    except Exception:
        pass
    return []


@st.cache_data(ttl=3600, show_spinner=False)
def infer_book_series(title: str, author: str = "") -> Tuple[Optional[str], Optional[float]]:
    """
    Identifie si un livre fait partie d'une saga (nom de la saga et numéro de tome)
    en interrogeant Goodreads par Titre + Auteur et en vérifiant les éditions et tomes liés.
    """
    if not title:
        return None, None

    # 1. Vérifier d'abord si le titre contient déjà l'information
    s_name, s_vol = extract_series_info(title)
    if s_name and s_vol is not None:
        return s_name, s_vol

    clean_t = clean_title_from_series(title)
    norm_t = _norm_str(clean_t)
    if not norm_t:
        return None, None

    queries = [f"{clean_t} {author}".strip()]
    if author:
        queries.append(author.strip())

    items: List[Dict[str, Any]] = []
    seen_ids = set()
    with ThreadPoolExecutor(max_workers=2) as ex:
        for res in ex.map(_fetch_gr_autocomplete, queries):
            for it in res:
                bid = it.get("bookId")
                if bid and bid not in seen_ids:
                    seen_ids.add(bid)
                    items.append(it)

    matched_items = []
    for it in items:
        cand_auth = (it.get("author") or {}).get("name", "") if isinstance(it.get("author"), dict) else str(it.get("author") or "")
        if author and not matches_author(cand_auth, author):
            continue
        matched_items.append(it)

    # Prioriser par nombre de votes décroissant (évite les éditions fantômes à 0 vote)
    matched_items.sort(key=lambda x: int(x.get("ratingsCount") or 0), reverse=True)

    # Cas A : Un item du même auteur a le même titre et porte une mention (Série, #Tome)
    for it in matched_items:
        raw_cand = str(it.get("title") or "")
        cand_s_name, cand_s_vol = extract_series_info(raw_cand)
        if not cand_s_name or cand_s_vol is None:
            continue
        cand_bare = _norm_str(it.get("bookTitleBare") or clean_title_from_series(raw_cand, cand_s_name))
        if cand_bare == norm_t or (len(norm_t) >= 5 and (norm_t in cand_bare or cand_bare in norm_t)):
            return cand_s_name, cand_s_vol

    # Cas B : Un autre tome du même auteur porte le titre de ce livre comme nom de saga (ex: "Uncharmed (Rewitched, #2)")
    for it in matched_items:
        raw_cand = str(it.get("title") or "")
        cand_s_name, cand_s_vol = extract_series_info(raw_cand)
        if cand_s_name and cand_s_vol is not None and cand_s_vol >= 2.0:
            if _norm_str(cand_s_name) == norm_t:
                return cand_s_name, 1.0

    return None, None


@st.cache_data(ttl=3600, show_spinner=False)
def fetch_series_volumes(series_name: str, author: str = "", book_title: str = "") -> List[Dict[str, Any]]:
    """
    Recherche et retourne l'ensemble des tomes connus d'une saga,
    en vérifiant rigoureusement la correspondance de l'auteur, du nom de série (et ses alias) et du numéro de tome.
    Interroge les tomes en parallèle pour contourner la limite de 5 résultats par requête Goodreads.
    """
    if not series_name:
        return []

    # Récupérer aussi les livres déjà présents en base pour cette série afin d'ancrer les titres connus
    local_books: List[Dict[str, Any]] = []
    try:
        from core.database import get_books_by_series
        local_books = get_books_by_series(series_name, author)
    except Exception:
        local_books = []

    queries = []
    if series_name and author:
        queries.append(f"{series_name} {author}".strip())
    if author:
        queries.append(author.strip())
    if book_title and author:
        queries.append(f"{book_title} {author}".strip())
    for lb in local_books[:3]:
        if lb.get("title") and author:
            q_lb = f"{lb['title']} {author}".strip()
            if q_lb not in queries:
                queries.append(q_lb)
    # Requêtes ciblées par numéro de tome pour découvrir tous les tomes (ex: Tomes 4 et 5 des Archives de Roshar)
    for i in range(1, 11):
        queries.append(f"{series_name} #{i}")

    items: List[Dict[str, Any]] = []
    seen_ids = set()

    with ThreadPoolExecutor(max_workers=8) as executor:
        for res in executor.map(_fetch_gr_autocomplete, queries):
            for it in res:
                bid = it.get("bookId")
                if bid and bid not in seen_ids:
                    seen_ids.add(bid)
                    items.append(it)

    # 1. Filtrage strict sur l'auteur
    author_matched_items = []
    for it in items:
        cand_auth = (it.get("author") or {}).get("name", "") if isinstance(it.get("author"), dict) else str(it.get("author") or "")
        if author and not matches_author(cand_auth, author):
            continue
        author_matched_items.append(it)

    # 2. Découverte stricte des alias de la saga (ex: Selcouth <-> Rewitched, Le Livre de la Sagesse <-> The Book of Wisdom Trilogy)
    # Uniquement via les œuvres (workId) ou titres exacts appartenant de façon certaine à la saga cible !
    known_series = {series_name.strip()}
    known_titles = set()
    known_work_ids = set()

    if book_title:
        nt = _norm_str(clean_title_from_series(book_title, series_name))
        if nt:
            known_titles.add(nt)
    for lb in local_books:
        if lb.get("title"):
            nt = _norm_str(clean_title_from_series(lb["title"], series_name))
            if nt:
                known_titles.add(nt)

    # Deux passes de propagation d'alias (Titre/Série -> workId -> Alias de série -> Requêtes supplémentaires si alias découvert)
    for _ in range(2):
        for it in author_matched_items:
            raw_t = str(it.get("title") or "")
            s_name, s_vol = extract_series_info(raw_t)
            bare_t = _norm_str(clean_title_from_series(it.get("bookTitleBare") or raw_t, s_name or series_name))
            wid = it.get("workId")

            if s_name and is_series_match(s_name, series_name, known_series):
                known_series.add(s_name)
                if bare_t:
                    known_titles.add(bare_t)
                if wid:
                    known_work_ids.add(wid)
            elif (bare_t and bare_t in known_titles) or (wid and wid in known_work_ids):
                if wid:
                    known_work_ids.add(wid)
                if bare_t:
                    known_titles.add(bare_t)
                if s_name:
                    known_series.add(s_name)

    # 3. Constitution et fusion intelligente des tomes de la série
    by_vol: Dict[float, Dict[str, Any]] = {}

    for it in author_matched_items:
        raw_title = str(it.get("title") or "")
        s_name, s_vol = extract_series_info(raw_title)

        # Un livre sans numéro de tome ou d'une autre série est exclu
        if s_vol is None or not s_name:
            continue
        if not is_series_match(s_name, series_name, known_series):
            continue

        # Filtrer les coffrets / intégrales multi-tomes
        if re.search(r"\b(?:box set|collection|books?\s+1\s*[-–to]+\s*[0-9]+|#1-[0-9]+|tomes?\s*1\s*[-à]\s*[0-9]+|intégrale)\b", raw_title, re.IGNORECASE):
            continue

        clean_t = clean_title_from_series(it.get("bookTitleBare") or raw_title, s_name)
        if not clean_t:
            clean_t = clean_title_from_series(raw_title, s_name)

        ratings_count = int(it.get("ratingsCount") or 0)
        num_pages = int(it["numPages"]) if (it.get("numPages") is not None and int(it.get("numPages") or 0) > 0) else None
        avg_rating = float(it.get("avgRating") or 0)
        is_split = _is_split_part_title(raw_title)

        # Préférer la langue/série exacte de l'utilisateur (ex: titre français si la série est en français)
        is_direct_lang = is_series_match(s_name, series_name, None)
        score = (
            (10_000_000 if is_direct_lang else 0)
            + (1_000_000 if not is_split else 0)
            + ratings_count
        )

        img = str(it.get("imageUrl") or "")
        if img and "nophoto" not in img:
            img = re.sub(r"\._S[XY]\d+_\.", ".", img)
            img = re.sub(r"\._S[XY]\d+_CR\d+,\d+,\d+,\d+_\.", ".", img)
        else:
            img = ""

        vol_key = round(float(s_vol), 1)
        cand_entry = {
            "title": clean_t,
            "raw_title": raw_title,
            "series_name": s_name,
            "series_volume": vol_key,
            "ratings_count": ratings_count,
            "avg_rating": round(avg_rating, 2) if avg_rating > 0 else None,
            "num_pages": num_pages,
            "cover_url": img,
            "author": (it.get("author") or {}).get("name", author) if isinstance(it.get("author"), dict) else author,
            "_score": score,
            "_work_id": it.get("workId"),
        }

        if vol_key not in by_vol:
            by_vol[vol_key] = cand_entry
        else:
            existing = by_vol[vol_key]
            # Conserver le meilleur titre/édition selon le score, tout en consolidant pages, notes et couverture
            if cand_entry["_score"] > existing["_score"]:
                cand_entry["num_pages"] = cand_entry["num_pages"] or existing["num_pages"]
                cand_entry["ratings_count"] = max(cand_entry["ratings_count"], existing["ratings_count"])
                cand_entry["avg_rating"] = cand_entry["avg_rating"] or existing["avg_rating"]
                cand_entry["cover_url"] = cand_entry["cover_url"] or existing["cover_url"]
                by_vol[vol_key] = cand_entry
            else:
                existing["num_pages"] = existing["num_pages"] or cand_entry["num_pages"]
                existing["ratings_count"] = max(existing["ratings_count"], cand_entry["ratings_count"])
                existing["avg_rating"] = existing["avg_rating"] or cand_entry["avg_rating"]
                existing["cover_url"] = existing["cover_url"] or cand_entry["cover_url"]

    # 4. Intégrer les tomes déjà présents dans la base locale (garantit qu'aucun tome possédé ne manque)
    for lb in local_books:
        if lb.get("series_volume") is None:
            continue
        vol_key = round(float(lb["series_volume"]), 1)
        if vol_key not in by_vol:
            by_vol[vol_key] = {
                "title": lb["title"],
                "raw_title": lb["title"],
                "series_name": lb.get("series_name") or series_name,
                "series_volume": vol_key,
                "ratings_count": 100,
                "avg_rating": lb.get("popularity_score") or lb.get("rating_global"),
                "num_pages": lb.get("page_count"),
                "cover_url": lb.get("cover_url") or "",
                "author": lb.get("author") or author,
                "_score": 20_000_000,
            }

    # 5. Dédoublonnage par œuvre (workId) ou titre identique (évite qu'un livre coupé en 2 poches ou renuméroté en VO/VF apparaisse deux fois)
    deduped_vols: List[Dict[str, Any]] = []
    seen_works: Dict[Any, Dict[str, Any]] = {}
    seen_norm_titles: Dict[str, Dict[str, Any]] = {}

    for vol_key in sorted(by_vol.keys()):
        v = by_vol[vol_key]
        wid = v.get("_work_id")
        nt = _norm_str(v["title"])

        dup_target = None
        if wid and wid in seen_works:
            dup_target = seen_works[wid]
        elif nt and nt in seen_norm_titles:
            dup_target = seen_norm_titles[nt]

        if dup_target is not None:
            if v.get("_score", 0) > dup_target.get("_score", 0):
                dup_target["title"] = v["title"]
                dup_target["series_volume"] = v["series_volume"]
                dup_target["_score"] = v.get("_score", 0)
            dup_target["num_pages"] = dup_target.get("num_pages") or v.get("num_pages")
            dup_target["ratings_count"] = max(dup_target.get("ratings_count", 0), v.get("ratings_count", 0))
            continue

        if wid:
            seen_works[wid] = v
        if nt:
            seen_norm_titles[nt] = v
        deduped_vols.append(v)

    # 6. Détermination du statut de parution final pour chaque tome
    volumes: List[Dict[str, Any]] = []
    for v in sorted(deduped_vols, key=lambda x: x["series_volume"]):
        v.pop("_score", None)
        v.pop("_work_id", None)
        is_untitled = bool(re.search(r"\b(?:untitled|tbd|to be announced|sans titre)\b", v["title"], re.IGNORECASE))
        pages = v.get("num_pages")
        ratings = v.get("ratings_count", 0)

        # Un tome est publié s'il a une pagination réelle (> 40 pages) ou un grand nombre de lecteurs (>= 10 000)
        if not is_untitled and ((pages is not None and int(pages) > 40) or ratings >= 10000):
            v["is_published"] = True
            v["pub_status_label"] = "Publié"
        else:
            v["is_published"] = False
            v["pub_status_label"] = "À paraître / Non publié"

        volumes.append(v)

    return volumes


def find_next_series_volume(series_name: str, author: str = "", current_volume: float = 1.0, book_title: str = "") -> Optional[Dict[str, Any]]:
    """
    Recherche le tome suivant réel d'une saga (ex: cur_vol + 1 ou le tome suivant immédiat).
    Retourne le dictionnaire du tome (avec is_published) ou None si aucun tome suivant n'existe/n'est répertorié.
    """
    if not series_name:
        return None
    vols = fetch_series_volumes(series_name, author, book_title=book_title)
    if not vols:
        return None

    # Chercher les tomes principaux de numéro strictement supérieur à current_volume
    higher_vols = [v for v in vols if v.get("series_volume") is not None and v["series_volume"] > (current_volume + 0.05)]
    if not higher_vols:
        return None

    higher_vols.sort(key=lambda x: x["series_volume"])
    return higher_vols[0]


def clean_author_country(country_str: str) -> str:
    """Normalise la nationalité ou le code pays en nom de pays en français."""
    if not country_str:
        return "France"
    up = country_str.upper().strip()
    if up in ISO_COUNTRY_MAP:
        return ISO_COUNTRY_MAP[up]

    norm = country_str.lower().strip()
    mapping = {
        "français": "France",
        "française": "France",
        "france": "France",
        "américain": "États-Unis",
        "américaine": "États-Unis",
        "états-unis": "États-Unis",
        "usa": "États-Unis",
        "britannique": "Royaume-Uni",
        "anglais": "Royaume-Uni",
        "anglaise": "Royaume-Uni",
        "écossais": "Royaume-Uni",
        "gallois": "Royaume-Uni",
        "canadien": "Canada",
        "canadienne": "Canada",
        "belge": "Belgique",
        "suisse": "Suisse",
        "australien": "Australie",
        "australienne": "Australie",
        "japonais": "Japon",
        "japonaise": "Japon",
        "allemand": "Allemagne",
        "allemande": "Allemagne",
        "espagnol": "Espagne",
        "espagnole": "Espagne",
        "italien": "Italie",
        "italienne": "Italie",
        "irlandais": "Irlande",
        "irlandaise": "Irlande",
        "suédois": "Suède",
        "suédoise": "Suède",
        "polonais": "Pologne",
        "polonaise": "Pologne",
    }
    for k, v in mapping.items():
        if k in norm:
            return v
    return country_str.capitalize()


# ==========================================
# 1. BnF SRU API (UNIMARC + Notice d'Autorité Auteur + Couverture HD)
# ==========================================

def _fetch_bnf_author_country(author_record_id: str) -> Optional[str]:
    """Récupère le code pays ISO de l'auteur depuis sa notice d'autorité BnF (champ UNIMARC 102$a)."""
    if not author_record_id:
        return None
    url = (
        f'http://catalogue.bnf.fr/api/SRU?operation=searchRetrieve&version=1.2'
        f'&query=aut.recordid+all+"{author_record_id}"&recordSchema=unimarcXchange'
    )
    try:
        resp = requests.get(url, headers=DEFAULT_HEADERS, timeout=3)
        if resp.status_code == 200 and "<mxc:record" in resp.text:
            root = ET.fromstring(resp.content)
            ns = {"mxc": "info:lc/xmlns/marcxchange-v2"}
            for df in root.findall(".//mxc:datafield[@tag='102']", ns):
                sf_a = df.find("mxc:subfield[@code='a']", ns)
                if sf_a is not None and sf_a.text:
                    code = sf_a.text.strip().upper()
                    if code in ISO_COUNTRY_MAP:
                        return ISO_COUNTRY_MAP[code]
    except Exception:
        pass
    return None


def fetch_from_bnf(isbn_or_query: str) -> Dict[str, Any]:
    """Interroge l'API SRU de la BnF en UNIMARC pour récupérer toutes les données officielles."""
    data: Dict[str, Any] = {}
    clean_q = isbn_or_query.replace("-", "").strip()
    is_isbn = clean_q.isdigit() and len(clean_q) in (10, 13)

    if is_isbn:
        query_str = f'bib.isbn+adj+"{clean_q}"'
    else:
        query_str = f'bib.anywhere+all+"{urllib.parse.quote(isbn_or_query)}"'

    url = f'http://catalogue.bnf.fr/api/SRU?operation=searchRetrieve&version=1.2&query={query_str}&recordSchema=unimarcXchange&maximumRecords=1'
    try:
        resp = requests.get(url, headers=DEFAULT_HEADERS, timeout=TIMEOUT)
        if resp.status_code == 200 and "<mxc:record" in resp.text:
            root = ET.fromstring(resp.content)
            ns = {
                "srw": "http://www.loc.gov/zing/srw/",
                "mxc": "info:lc/xmlns/marcxchange-v2"
            }

            rec = root.find(".//mxc:record", ns)
            if rec is None:
                return data

            ark_id = rec.attrib.get("id", "")

            # 010 : ISBN, reliure/format ($b), prix officiel ($d)
            for df in rec.findall("mxc:datafield[@tag='010']", ns):
                sf_a = df.find("mxc:subfield[@code='a']", ns)
                if sf_a is not None and sf_a.text and "isbn" not in data:
                    digits = "".join(c for c in sf_a.text if c.isdigit())
                    if len(digits) in (10, 13):
                        data["isbn"] = digits

                sf_b = df.find("mxc:subfield[@code='b']", ns)
                if sf_b is not None and sf_b.text:
                    b_txt = sf_b.text.lower()
                    if "rel" in b_txt or "cart" in b_txt:
                        data["format"] = "Relié"
                    elif "poche" in b_txt:
                        data["format"] = "Poche"
                    elif "br" in b_txt:
                        data["format"] = "Broché"

                sf_d = df.find("mxc:subfield[@code='d']", ns)
                if sf_d is not None and sf_d.text:
                    match_price = re.search(r"(\d+(?:[,\.]\d{1,2})?)", sf_d.text)
                    if match_price:
                        val_p = float(match_price.group(1).replace(",", "."))
                        if 1.0 <= val_p <= 300.0:
                            data["price"] = round(val_p, 2)

            # 073 : EAN-13
            for df in rec.findall("mxc:datafield[@tag='073']", ns):
                sf_a = df.find("mxc:subfield[@code='a']", ns)
                if sf_a is not None and sf_a.text:
                    digits = "".join(c for c in sf_a.text if c.isdigit())
                    if len(digits) == 13:
                        data["isbn"] = digits

            # 101 : Langue d'origine si traduit ($c)
            orig_lang = None
            for df in rec.findall("mxc:datafield[@tag='101']", ns):
                sf_c = df.find("mxc:subfield[@code='c']", ns)
                if sf_c is not None and sf_c.text:
                    orig_lang = sf_c.text.strip().lower()

            # 200 : Titre ($a), Complément du titre ($e), Auteur ($f)
            for df in rec.findall("mxc:datafield[@tag='200']", ns):
                sf_a = df.find("mxc:subfield[@code='a']", ns)
                if sf_a is not None and sf_a.text:
                    data["title"] = sf_a.text.strip()
                sf_e = df.find("mxc:subfield[@code='e']", ns)
                if sf_e is not None and sf_e.text:
                    s_name, s_vol = extract_series_info(sf_e.text)
                    if s_name:
                        data["series_name"] = s_name
                        data["series_volume"] = s_vol
                sf_f = df.find("mxc:subfield[@code='f']", ns)
                if sf_f is not None and sf_f.text and "author" not in data:
                    data["author"] = sf_f.text.strip()

            # 214 / 210 : Éditeur ($c) et Année ($d)
            for tag_pub in ("214", "210"):
                for df in rec.findall(f"mxc:datafield[@tag='{tag_pub}']", ns):
                    sf_c = df.find("mxc:subfield[@code='c']", ns)
                    if sf_c is not None and sf_c.text and "publisher" not in data:
                        pub_clean = re.sub(r"^[\[\]\s:]+|[\[\]\s:]+$", "", sf_c.text).strip()
                        if pub_clean and "impr." not in pub_clean.lower():
                            data["publisher"] = pub_clean
                    sf_d = df.find("mxc:subfield[@code='d']", ns)
                    if sf_d is not None and sf_d.text and "publication_year" not in data:
                        m_yr = re.search(r"\b(19\d\d|20\d\d)\b", sf_d.text)
                        if m_yr:
                            data["publication_year"] = int(m_yr.group(1))

            # 215 : Pagination ($a)
            for df in rec.findall("mxc:datafield[@tag='215']", ns):
                sf_a = df.find("mxc:subfield[@code='a']", ns)
                if sf_a is not None and sf_a.text:
                    m_pages = re.search(r"(\d+)\s*p\b", sf_a.text)
                    if m_pages:
                        data["page_count"] = int(m_pages.group(1))

            # 225 / 410 / 461 : Collection ou Série ($a/$t) et numéro de tome ($v)
            for tag_ser in ("461", "410", "225"):
                for df in rec.findall(f"mxc:datafield[@tag='{tag_ser}']", ns):
                    sf_t = df.find("mxc:subfield[@code='t']", ns) or df.find("mxc:subfield[@code='a']", ns)
                    sf_v = df.find("mxc:subfield[@code='v']", ns)
                    if sf_t is not None and sf_t.text and sf_v is not None and sf_v.text:
                        s_title = sf_t.text.strip()
                        m_vol = re.search(r"(\d+(?:\.\d+)?)", sf_v.text)
                        if m_vol and "series_name" not in data:
                            data["series_name"] = s_title
                            data["series_volume"] = float(m_vol.group(1))

            # 700 : Auteur principal ($b Prénom, $a Nom, $3 ID Autorité pour pays officiel)
            for df in rec.findall("mxc:datafield[@tag='700']", ns):
                sf_a = df.find("mxc:subfield[@code='a']", ns)
                sf_b = df.find("mxc:subfield[@code='b']", ns)
                if sf_a is not None and sf_a.text:
                    last_n = sf_a.text.strip()
                    first_n = sf_b.text.strip() if (sf_b is not None and sf_b.text) else ""
                    data["author"] = f"{first_n} {last_n}".strip()

                sf_3 = df.find("mxc:subfield[@code='3']", ns)
                if sf_3 is not None and sf_3.text:
                    country = _fetch_bnf_author_country(sf_3.text.strip())
                    if country:
                        data["author_country"] = country

            # Fallback pays via la langue d'origine si notice d'autorité absente
            if "author_country" not in data and orig_lang:
                lang_map = {
                    "eng": "Royaume-Uni",
                    "jpn": "Japon",
                    "ger": "Allemagne",
                    "deu": "Allemagne",
                    "spa": "Espagne",
                    "ita": "Italie",
                    "pol": "Pologne",
                    "rus": "Russie",
                    "swe": "Suède",
                }
                if orig_lang in lang_map:
                    data["author_country"] = lang_map[orig_lang]

            # 856 : Couverture officielle BnF
            if ark_id:
                for df in rec.findall("mxc:datafield[@tag='856']", ns):
                    sf_b = df.find("mxc:subfield[@code='b']", ns)
                    if sf_b is not None and sf_b.text and "couverture" in sf_b.text.lower():
                        data["cover_url"] = f"https://catalogue.bnf.fr/couverture?appName=NE&idArk={ark_id}&couverture=1"
                        break

    except Exception as e:
        print(f"BnF SRU API error: {e}")

    return data


# ==========================================
# 2. Goodreads (JSON-LD, Note communauté, Genres & Tropes, Série, Couverture HD)
# ==========================================

def _infer_genres_and_tags(text: str, publisher: str = "") -> Tuple[List[str], List[str]]:
    """Déduit automatiquement les genres et les tags/tropes à partir du résumé, du titre et de l'éditeur."""
    combined = f"{text} {publisher}".lower()
    genres: List[str] = []
    tags: List[str] = []

    genre_rules = [
        (["magie", "sorcière", "sorcellerie", "witch", "dragon", "royaume", "elfe", "sortilège", "féerique", "fae", "bragelonne", "calix", "de saxus", "livr's", "cozy", "cosy", "salon de thé", "librairie"], "Fantasy"),
        (["amour", "romance", "amant", "sédu", "passion", "cœur", "coup de foudre"], "Romance"),
        (["1633", "xviie", "xixe", "siècle", "cardinal", "mousquetaire", "médiéval", "époque", "historique", "histoire"], "Historique"),
        (["enquête", "meurtre", "crime", "assassin", "mystère", "police", "détective", "complot"], "Thriller / Polar"),
        (["planète", "galaxie", "vaisseau", "futur", "dystopie", "science-fiction", "androïde", "spatial"], "Science-Fiction"),
        (["vampire", "démon", "fantôme", "ténèbres", "horreur", "épouvante", "malédiction", "ombre"], "Fantastique / Sombre"),
    ]
    for keywords, g_label in genre_rules:
        if any(kw in combined for kw in keywords) and g_label not in genres:
            genres.append(g_label)

    tag_rules = [
        (["sorcière", "sorcellerie", "witch", "coven"], "Sorcières"),
        (["magie", "sortilège", "pouvoir", "alchimie", "alchimiste"], "Magie"),
        (["dragon"], "Dragons"),
        (["librairie", "bibliothèque", "lunar books"], "Livres & Librairie"),
        (["cardinal", "lame", "mousquetaire", "duel", "épée"], "Cape et d'Épée"),
        (["royaume", "cour", "trône", "politique", "complot", "intrigue", "espion"], "Politique & Complots"),
        (["académie", "école", "université", "apprentissage"], "Académie"),
        (["secret", "mystère", "énigme", "caché", "dissimuler"], "Secrets & Mystères"),
        (["paris", "londres", "ville", "urbain"], "Urban Fantasy"),
        (["rival", "ennemi"], "Enemies to Lovers"),
        (["amitié", "allié", "équipe", "famille"], "Found Family"),
    ]
    for keywords, t_label in tag_rules:
        if any(kw in combined for kw in keywords) and t_label not in tags:
            tags.append(t_label)

    return genres[:4], tags[:6]


def fetch_from_goodreads(isbn_or_query: str) -> Dict[str, Any]:
    """Récupère la note communautaire, les genres, les tags/tropes, la série et la couverture via l'API JSON Goodreads."""
    data: Dict[str, Any] = {}
    if not isbn_or_query:
        return data

    ac_url = f"https://www.goodreads.com/book/auto_complete?format=json&q={urllib.parse.quote(isbn_or_query.strip())}"
    try:
        resp_ac = requests.get(ac_url, headers=DEFAULT_HEADERS, timeout=TIMEOUT)
        if resp_ac.status_code != 200:
            return data

        items = resp_ac.json()
        if not isinstance(items, list) or not items:
            return data

        # Choisir le meilleur résultat (celui qui a des votes ou le premier)
        best_item = items[0]
        for item in items:
            if float(item.get("avgRating") or 0) > 0 and int(item.get("ratingsCount") or 0) > int(best_item.get("ratingsCount") or 0):
                best_item = item

        raw_title = html.unescape(str(best_item.get("title") or "")).strip()
        best_bare = clean_title_from_series(best_item.get("bookTitleBare") or raw_title)
        if raw_title:
            data["title"] = best_bare

        best_wid = best_item.get("workId")
        best_norm_t = _norm_str(best_bare)

        # Chercher une mention de série d'abord sur best_item ou les éditions de la même œuvre
        for item in [best_item] + items:
            cand_title = html.unescape(str(item.get("title") or "")).strip()
            s_name, s_vol = extract_series_info(cand_title)
            if not s_name or s_vol is None:
                continue
            cand_bare = _norm_str(clean_title_from_series(item.get("bookTitleBare") or cand_title, s_name))
            if (best_wid and item.get("workId") == best_wid) or (best_norm_t and cand_bare == best_norm_t):
                data["series_name"] = s_name
                data["series_volume"] = s_vol
                break

        # Cas où un autre tome de la même saga porte le titre de ce livre comme nom de saga (ex: "Uncharmed (Rewitched, #2)")
        if "series_name" not in data and best_norm_t:
            for item in items:
                cand_title = html.unescape(str(item.get("title") or "")).strip()
                s_name, s_vol = extract_series_info(cand_title)
                if s_name and s_vol is not None and s_vol >= 2.0 and _norm_str(s_name) == best_norm_t:
                    data["series_name"] = s_name
                    data["series_volume"] = 1.0
                    break

        if best_item.get("avgRating") and float(best_item["avgRating"]) > 0:
            data["popularity_score"] = round(float(best_item["avgRating"]), 2)

        if best_item.get("numPages") and int(best_item["numPages"]) > 0:
            data["page_count"] = int(best_item["numPages"])

        auth_obj = best_item.get("author")
        if isinstance(auth_obj, dict) and auth_obj.get("name"):
            data["author"] = html.unescape(str(auth_obj["name"])).strip()

        img_url = str(best_item.get("imageUrl") or "")
        if img_url and "nophoto" not in img_url:
            hd_img = re.sub(r"\._S[XY]\d+_\.", ".", img_url)
            hd_img = re.sub(r"\._S[XY]\d+_CR\d+,\d+,\d+,\d+_\.", ".", hd_img)
            data["cover_url"] = hd_img

        # Extraire le résumé depuis Goodreads auto_complete pour déduire genres et tags
        desc_obj = best_item.get("description")
        desc_html = desc_obj.get("html", "") if isinstance(desc_obj, dict) else ""
        if desc_html:
            clean_desc = BeautifulSoup(html.unescape(desc_html), "lxml").get_text(" ", strip=True)
            data["summary"] = clean_desc
            g_list, t_list = _infer_genres_and_tags(f"{raw_title} {clean_desc}")
            if g_list:
                data["genres"] = g_list
            if t_list:
                data["tags"] = t_list

    except Exception as e:
        print(f"Goodreads API error: {e}")

    return data


# ==========================================
# 3. Google Books API
# ==========================================

def fetch_from_google_books(isbn_or_query: str) -> Dict[str, Any]:
    """Interroge l'API Google Books avec gestion de clé API si fournie."""
    data: Dict[str, Any] = {}
    clean_q = isbn_or_query.replace("-", "").strip()
    is_isbn = clean_q.isdigit() and len(clean_q) in (10, 13)
    query_param = f"isbn:{clean_q}" if is_isbn else isbn_or_query

    api_key = ""
    try:
        import streamlit as st
        if "GOOGLE_BOOKS_API_KEY" in st.secrets:
            api_key = f"&key={st.secrets['GOOGLE_BOOKS_API_KEY']}"
    except Exception:
        pass

    url = f"https://www.googleapis.com/books/v1/volumes?q={urllib.parse.quote(query_param)}&maxResults=1{api_key}"

    try:
        resp = requests.get(url, timeout=TIMEOUT)
        if resp.status_code == 200:
            items = resp.json().get("items", [])
            if items:
                vol = items[0].get("volumeInfo", {})
                data["title"] = vol.get("title", "")

                subtitle = vol.get("subtitle", "")
                if subtitle:
                    s_name, s_vol = extract_series_info(subtitle)
                    if s_name:
                        data["series_name"] = s_name
                        data["series_volume"] = s_vol

                authors = vol.get("authors", [])
                if authors:
                    data["author"] = authors[0]

                if "publisher" in vol:
                    data["publisher"] = vol["publisher"]

                pub_date = vol.get("publishedDate", "")
                if pub_date:
                    match_year = re.search(r"\b(19\d\d|20\d\d)\b", pub_date)
                    if match_year:
                        data["publication_year"] = int(match_year.group(1))

                if "pageCount" in vol and vol["pageCount"] > 0:
                    data["page_count"] = vol["pageCount"]

                cats = vol.get("categories", [])
                if cats:
                    genres = []
                    for c in cats:
                        parts = c.split("/")
                        genres.extend([p.strip() for p in parts if p.strip()])
                    data["genres"] = list(dict.fromkeys(genres))

                img_links = vol.get("imageLinks", {})
                cover = img_links.get("thumbnail") or img_links.get("smallThumbnail")
                if cover:
                    cover = cover.replace("http://", "https://")
                    cover = re.sub(r"&edge=curl", "", cover)
                    cover = re.sub(r"zoom=[0-9]", "zoom=2", cover)
                    data["cover_url"] = cover

                if "averageRating" in vol:
                    data["popularity_score"] = float(vol["averageRating"])

                for ident in vol.get("industryIdentifiers", []):
                    if ident.get("type") in ("ISBN_13", "ISBN_10") and "isbn" not in data:
                        data["isbn"] = ident.get("identifier")
    except Exception:
        pass

    return data


# ==========================================
# 4. Open Library API
# ==========================================

def fetch_from_open_library(isbn_or_query: str) -> Dict[str, Any]:
    """Interroge Open Library (recherche texte ou ISBN)."""
    data: Dict[str, Any] = {}
    clean_q = isbn_or_query.replace("-", "").strip()
    is_isbn = clean_q.isdigit() and len(clean_q) in (10, 13)

    try:
        if is_isbn:
            url = f"https://openlibrary.org/isbn/{clean_q}.json"
            resp = requests.get(url, timeout=TIMEOUT)
            if resp.status_code == 200:
                item = resp.json()
                if "title" in item:
                    data["title"] = item["title"]
                if "number_of_pages" in item:
                    data["page_count"] = int(item["number_of_pages"])
                if "publish_date" in item:
                    match_year = re.search(r"\b(19\d\d|20\d\d)\b", str(item["publish_date"]))
                    if match_year:
                        data["publication_year"] = int(match_year.group(1))
                if "publishers" in item and item["publishers"]:
                    data["publisher"] = item["publishers"][0]
                if "covers" in item and item["covers"]:
                    data["cover_url"] = f"https://covers.openlibrary.org/b/id/{item['covers'][0]}-L.jpg"
        else:
            url = f"https://openlibrary.org/search.json?q={urllib.parse.quote(isbn_or_query)}&limit=1"
            resp = requests.get(url, timeout=TIMEOUT)
            if resp.status_code == 200:
                docs = resp.json().get("docs", [])
                if docs:
                    d = docs[0]
                    data["title"] = d.get("title", "")
                    if d.get("author_name"):
                        data["author"] = d["author_name"][0]
                    if d.get("publisher"):
                        data["publisher"] = d["publisher"][0]
                    if d.get("first_publish_year"):
                        data["publication_year"] = int(d["first_publish_year"])
                    if d.get("number_of_pages_median"):
                        data["page_count"] = int(d["number_of_pages_median"])
                    if d.get("isbn"):
                        data["isbn"] = d["isbn"][0]
                    if d.get("cover_i"):
                        data["cover_url"] = f"https://covers.openlibrary.org/b/id/{d['cover_i']}-L.jpg"
    except Exception:
        pass

    return data


# ==========================================
# 5. Pipeline Unifié d'Enrichissement
# ==========================================

def enrich_book_metadata(isbn_or_query: str) -> Dict[str, Any]:
    """
    Exécute le pipeline en cascade complet :
    1. BnF UNIMARC (Autorité officielle française : titre, auteur, pays de l'auteur, éditeur, année, pages, format, prix €, couverture HD)
    2. Goodreads (Note communauté /5, genres et tags/tropes en français, série & tome, couverture HD)
    3. Google Books & Open Library (Compléments éventuels)
    Retourne un dictionnaire complet prêt à pré-remplir tous les champs du formulaire.
    """
    clean_input = isbn_or_query.strip()
    digits_only = "".join(c for c in clean_input if c.isdigit() or c in ("X", "x"))
    is_isbn = len(digits_only) in (10, 13) and (digits_only[:3] in ("978", "979") or len(digits_only) == 10)
    isbn = digits_only if is_isbn else ""

    result: Dict[str, Any] = {
        "isbn": isbn,
        "title": "",
        "series_name": "",
        "series_volume": None,
        "author": "",
        "author_country": "France",
        "publisher": "",
        "publication_year": None,
        "page_count": 300,
        "chapter_count": None,
        "price": None,
        "format": "Broché",
        "genres": [],
        "tags": [],
        "fantasy_subgenre": None,
        "popularity_score": None,
        "cover_url": "",
        "status": "Bibliothèque",
        "pal_month": "",
        "pal_year": None,
        "current_page": 0
    }

    # Étape 1 : BnF SRU UNIMARC (Prioritaire pour l'édition française exacte)
    bnf_data = fetch_from_bnf(isbn if is_isbn else clean_input)
    for k, v in bnf_data.items():
        if v is not None and v != "":
            result[k] = v

    # Étape 2 : Goodreads (par ISBN d'abord, puis par Titre + Auteur si besoin)
    gr_query = result.get("isbn") or isbn or clean_input
    gr_data = fetch_from_goodreads(gr_query)
    if not gr_data.get("popularity_score") and result.get("title"):
        q_title_auth = f"{result['title']} {result.get('author', '')}".strip()
        if q_title_auth.lower() != gr_query.lower():
            gr_fallback = fetch_from_goodreads(q_title_auth)
            for k, v in gr_fallback.items():
                if v and not gr_data.get(k):
                    gr_data[k] = v

    # Fusion intelligente des données Goodreads
    if gr_data.get("popularity_score") is not None:
        result["popularity_score"] = gr_data["popularity_score"]
    if gr_data.get("genres"):
        result["genres"] = gr_data["genres"]
    if gr_data.get("tags"):
        result["tags"] = gr_data["tags"]
    if gr_data.get("series_name") and not result.get("series_name"):
        result["series_name"] = gr_data["series_name"]
        result["series_volume"] = gr_data.get("series_volume")
    if gr_data.get("cover_url") and not result.get("cover_url"):
        result["cover_url"] = gr_data["cover_url"]
    if gr_data.get("title") and not result.get("title"):
        result["title"] = gr_data["title"]
    if gr_data.get("author") and not result.get("author"):
        result["author"] = gr_data["author"]
    if gr_data.get("page_count") and (not bnf_data.get("page_count")):
        result["page_count"] = gr_data["page_count"]
    if gr_data.get("format") and (not bnf_data.get("format")):
        result["format"] = gr_data["format"]
    if gr_data.get("isbn") and not result.get("isbn"):
        result["isbn"] = gr_data["isbn"]

    # Si on a récupéré un ISBN via Goodreads/recherche texte et qu'on n'avait pas les infos BnF (éditeur, prix, pays)
    if not is_isbn and result.get("isbn") and not bnf_data.get("publisher"):
        bnf_by_isbn = fetch_from_bnf(result["isbn"])
        for k in ("publisher", "publication_year", "page_count", "price", "format", "author_country", "cover_url"):
            if bnf_by_isbn.get(k) and (not result.get(k) or k in ("publisher", "price", "format", "author_country")):
                result[k] = bnf_by_isbn[k]

    # Étape 3 : Open Library / Google Books si certains champs clés manquent encore
    if not result.get("title") or not result.get("cover_url") or not result.get("publisher"):
        ol_query = result.get("isbn") or f"{result.get('title', '')} {result.get('author', '')}".strip() or clean_input
        ol_data = fetch_from_open_library(ol_query)
        for k, v in ol_data.items():
            if v and not result.get(k):
                result[k] = v

    if not result.get("title") or not result.get("cover_url"):
        gb_data = fetch_from_google_books(result.get("isbn") or clean_input)
        for k, v in gb_data.items():
            if v and not result.get(k):
                result[k] = v

    # Détection de série depuis le titre ou via Goodreads Titre+Auteur si toujours absente
    if not result.get("series_name") and result.get("title"):
        s_name, s_vol = extract_series_info(result["title"])
        if s_name:
            result["series_name"] = s_name
            result["series_volume"] = s_vol
            result["title"] = clean_title_from_series(result["title"])
        else:
            inf_s, inf_v = infer_book_series(result["title"], result.get("author", ""))
            if inf_s:
                result["series_name"] = inf_s
                result["series_volume"] = inf_v

    # Enrichissement final des genres et tags si certains manquent
    if not result.get("genres") or not result.get("tags"):
        extra_g, extra_t = _infer_genres_and_tags(
            f"{result.get('title', '')} {result.get('series_name', '')} {gr_data.get('summary', '')}",
            str(result.get("publisher") or "")
        )
        if not result.get("genres") and extra_g:
            result["genres"] = extra_g
        if not result.get("tags") and extra_t:
            result["tags"] = extra_t

    # Retirer Cozy Fantasy des genres principaux (c'est un sous-genre de la Fantasy)
    cleaned_genres = [g for g in result.get("genres", []) if g not in ("Cozy Fantasy", "Cosy Fantasy")]
    if not cleaned_genres:
        cleaned_genres = ["Fantasy"]
    result["genres"] = cleaned_genres

    # Détection automatique de plusieurs sous-genres de Fantasy
    detected_subgs = infer_fantasy_subgenres(
        text=f"{gr_data.get('summary', '')} {' '.join(result.get('tags', []))} {' '.join(result.get('genres', []))}",
        publisher=str(result.get("publisher") or ""),
        title=str(result.get("title") or ""),
        author=str(result.get("author") or "")
    )
    result["fantasy_subgenres"] = detected_subgs
    result["fantasy_subgenre"] = detected_subgs

    if not result.get("title"):
        result["title"] = clean_input if not is_isbn else f"Livre {isbn}"

    return result
