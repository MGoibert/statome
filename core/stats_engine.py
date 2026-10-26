"""
Moteur de calculs statistiques et générateur de graphiques Plotly (core/stats_engine.py).
Fournit l'ensemble des métriques, agrégations Pandas et visualisations interactives
optimisées pour l'affichage mobile.
"""

from datetime import datetime, timedelta, date
import calendar
from typing import List, Dict, Any, Tuple, Optional
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

from core.date_utils import FRENCH_MONTHS

# Palette de couleurs moderne
COLOR_PRIMARY = "#6366F1"   # Indigo
COLOR_ACCENT = "#38BDF8"    # Sky
COLOR_SUCCESS = "#10B981"   # Emerald
COLOR_WARNING = "#F59E0B"   # Amber
COLOR_DANGER = "#EF4444"    # Rose
COLOR_BG_CARD = "#1E293B"   # Card Slate
COLOR_TEXT = "#F8FAFC"      # White slate
COLOR_MUTED = "#94A3B8"     # Muted text
COLOR_GRID = "#334155"      # Grid line

PLOTLY_LAYOUT_DEFAULTS = dict(
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
    font=dict(color=COLOR_TEXT, family="sans-serif", size=12),
    margin=dict(l=25, r=25, t=40, b=30),
    xaxis=dict(gridcolor=COLOR_GRID, zerolinecolor=COLOR_GRID),
    yaxis=dict(gridcolor=COLOR_GRID, zerolinecolor=COLOR_GRID),
    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
)


# ==========================================
# 1. Agrégations & Semainier Visuel
# ==========================================

def get_week_boundaries(reference_date: date) -> Tuple[date, date]:
    """Retourne la date du Lundi et du Dimanche pour une semaine donnée."""
    monday = reference_date - timedelta(days=reference_date.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def build_weekly_calendar_data(sessions: List[Dict[str, Any]], start_monday: date) -> List[Dict[str, Any]]:
    """
    Construit la structure de données des 7 jours de la semaine (Lundi à Dimanche)
    avec les couvertures des livres lus, le temps lu et le nombre de pages.
    """
    days_data = []
    days_names_fr = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

    df = pd.DataFrame(sessions) if sessions else pd.DataFrame()
    if not df.empty:
        df["session_date"] = pd.to_datetime(df["start_time"]).dt.date

    for i in range(7):
        current_d = start_monday + timedelta(days=i)
        day_name = days_names_fr[i]

        day_sessions = df[df["session_date"] == current_d] if not df.empty else pd.DataFrame()

        total_min = day_sessions["duration_minutes"].sum() if not day_sessions.empty else 0.0
        total_pages = day_sessions["pages_read"].sum() if not day_sessions.empty else 0

        # Liste des livres distincts lus ce jour avec leurs couvertures
        books_read = []
        if not day_sessions.empty:
            for b_id, grp in day_sessions.groupby("book_id"):
                b_title = grp["book_title"].iloc[0]
                b_cover = grp["book_cover"].iloc[0]
                b_pages = grp["pages_read"].sum()
                b_min = grp["duration_minutes"].sum()
                books_read.append({
                    "book_id": b_id,
                    "title": b_title,
                    "cover_url": b_cover,
                    "pages": b_pages,
                    "minutes": b_min
                })

        days_data.append({
            "date": current_d,
            "day_name": day_name,
            "is_weekend": i in (5, 6),
            "is_today": current_d == date.today(),
            "total_minutes": round(total_min, 2),
            "total_pages": int(total_pages),
            "books": books_read
        })

    return days_data


def build_monthly_calendar_data(sessions: List[Dict[str, Any]], target_year: int, target_month: int) -> Dict[str, Any]:
    """
    Construit la structure de données pour chaque jour du mois spécifié,
    avec les couvertures des livres lus, le temps lu et le nombre de pages.
    """
    first_weekday, num_days = calendar.monthrange(target_year, target_month)
    days_names_fr = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

    df = pd.DataFrame(sessions) if sessions else pd.DataFrame()
    if not df.empty:
        df["session_date"] = pd.to_datetime(df["start_time"]).dt.date

    days_data = []
    total_month_min = 0.0
    total_month_pages = 0
    active_days_count = 0
    all_books_this_month: Dict[Any, Dict[str, Any]] = {}

    for d in range(1, num_days + 1):
        current_d = date(target_year, target_month, d)
        day_name = days_names_fr[current_d.weekday()]

        day_sessions = df[df["session_date"] == current_d] if not df.empty else pd.DataFrame()
        total_min = float(day_sessions["duration_minutes"].sum()) if not day_sessions.empty else 0.0
        total_pages = int(day_sessions["pages_read"].sum()) if not day_sessions.empty else 0

        if total_min > 0 or total_pages > 0:
            active_days_count += 1
            total_month_min += total_min
            total_month_pages += total_pages

        books_read = []
        if not day_sessions.empty:
            for b_id, grp in day_sessions.groupby("book_id"):
                b_title = grp["book_title"].iloc[0]
                b_cover = grp["book_cover"].iloc[0]
                b_pages = int(grp["pages_read"].sum())
                b_min = float(grp["duration_minutes"].sum())
                books_read.append({
                    "book_id": b_id,
                    "title": b_title,
                    "cover_url": b_cover,
                    "pages": b_pages,
                    "minutes": b_min
                })
                if b_id not in all_books_this_month:
                    all_books_this_month[b_id] = {
                        "book_id": b_id,
                        "title": b_title,
                        "cover_url": b_cover,
                        "pages": 0,
                        "minutes": 0.0
                    }
                all_books_this_month[b_id]["pages"] += b_pages
                all_books_this_month[b_id]["minutes"] += b_min

        days_data.append({
            "date": current_d,
            "day_num": d,
            "day_name": day_name,
            "is_weekend": current_d.weekday() in (5, 6),
            "is_today": current_d == date.today(),
            "total_minutes": round(total_min, 2),
            "total_pages": total_pages,
            "books": books_read
        })

    month_name = FRENCH_MONTHS[target_month - 1]
    return {
        "year": target_year,
        "month": target_month,
        "month_name": month_name,
        "num_days": num_days,
        "first_weekday": first_weekday,
        "total_minutes": round(total_month_min, 2),
        "total_pages": total_month_pages,
        "active_days_count": active_days_count,
        "distinct_books": list(all_books_this_month.values()),
        "days": days_data
    }


def build_yearly_calendar_data(sessions: List[Dict[str, Any]], target_year: int) -> Dict[str, Any]:
    """
    Construit la structure de données des 12 mois de l'année spécifiée,
    avec les couvertures des livres lus, le temps lu et le nombre de pages par mois.
    """
    df = pd.DataFrame(sessions) if sessions else pd.DataFrame()
    if not df.empty:
        df["dt"] = pd.to_datetime(df["start_time"])
        df["year"] = df["dt"].dt.year
        df["month"] = df["dt"].dt.month
        df["session_date"] = df["dt"].dt.date
        df_year = df[df["year"] == target_year]
    else:
        df_year = pd.DataFrame()

    months_data = []
    total_year_min = 0.0
    total_year_pages = 0
    all_year_books: Dict[Any, Dict[str, Any]] = {}
    active_days_in_year = set()

    for m in range(1, 13):
        m_name = FRENCH_MONTHS[m - 1]
        m_sessions = df_year[df_year["month"] == m] if not df_year.empty else pd.DataFrame()

        m_min = float(m_sessions["duration_minutes"].sum()) if not m_sessions.empty else 0.0
        m_pages = int(m_sessions["pages_read"].sum()) if not m_sessions.empty else 0
        active_days_m = len(m_sessions["session_date"].unique()) if not m_sessions.empty else 0

        total_year_min += m_min
        total_year_pages += m_pages

        if not m_sessions.empty:
            for s_d in m_sessions["session_date"].unique():
                active_days_in_year.add(s_d)

        books_read = []
        if not m_sessions.empty:
            for b_id, grp in m_sessions.groupby("book_id"):
                b_title = grp["book_title"].iloc[0]
                b_cover = grp["book_cover"].iloc[0]
                b_pages = int(grp["pages_read"].sum())
                b_min = float(grp["duration_minutes"].sum())
                books_read.append({
                    "book_id": b_id,
                    "title": b_title,
                    "cover_url": b_cover,
                    "pages": b_pages,
                    "minutes": b_min
                })
                if b_id not in all_year_books:
                    all_year_books[b_id] = {
                        "book_id": b_id,
                        "title": b_title,
                        "cover_url": b_cover,
                        "pages": 0,
                        "minutes": 0.0
                    }
                all_year_books[b_id]["pages"] += b_pages
                all_year_books[b_id]["minutes"] += b_min

        months_data.append({
            "month_num": m,
            "month_name": m_name,
            "is_current_month": (target_year == date.today().year and m == date.today().month),
            "total_minutes": round(m_min, 2),
            "total_pages": m_pages,
            "active_days_count": active_days_m,
            "books": books_read
        })

    return {
        "year": target_year,
        "total_minutes": round(total_year_min, 2),
        "total_pages": total_year_pages,
        "active_days_count": len(active_days_in_year),
        "distinct_books": list(all_year_books.values()),
        "months": months_data
    }


# ==========================================
# 2. Graphiques de Rythme Hebdo / Mensuel
# ==========================================

def plot_daily_reading_activity(sessions: List[Dict[str, Any]], days_limit: int = 7) -> go.Figure:
    """Graphique en barres : Pages lues et temps passé par jour avec livres lus au survol."""
    if not sessions:
        fig = go.Figure()
        fig.update_layout(**PLOTLY_LAYOUT_DEFAULTS, title="Aucune session de lecture")
        return fig

    df = pd.DataFrame(sessions)
    df["session_date"] = pd.to_datetime(df["start_time"]).dt.date

    # Grouper par date et agréger pages, minutes et livres lus
    grouped_rows = []
    for s_date, grp in df.groupby("session_date"):
        tot_pages = grp["pages_read"].sum()
        tot_min = grp["duration_minutes"].sum()
        unique_books = []
        for _, row in grp.iterrows():
            bt = row.get("book_title") or "Livre"
            if bt not in unique_books:
                unique_books.append(bt)
        sample = unique_books[:4]
        prev = "<br>• " + "<br>• ".join(sample)
        if len(unique_books) > 4:
            prev += f"<br><i>... et {len(unique_books) - 4} autre(s)</i>"
        grouped_rows.append({
            "session_date": s_date,
            "pages_read": tot_pages,
            "duration_minutes": tot_min,
            "preview": prev
        })

    daily = pd.DataFrame(grouped_rows).sort_values("session_date")
    if days_limit > 0:
        daily = daily.tail(days_limit)

    daily["date_str"] = pd.to_datetime(daily["session_date"]).dt.strftime("%d/%m")

    fig = go.Figure()

    # Barres pour les pages lues
    fig.add_trace(go.Bar(
        x=daily["date_str"],
        y=daily["pages_read"],
        name="Pages lues",
        marker_color=COLOR_PRIMARY,
        yaxis="y1",
        customdata=daily["preview"],
        hovertemplate="<b>%{x}</b><br>Pages lues : <b>%{y:.0f} p.</b><br><br><b>Ouvrages lus :</b>%{customdata}<extra></extra>"
    ))

    # Courbe pour la durée en minutes
    fig.add_trace(go.Scatter(
        x=daily["date_str"],
        y=daily["duration_minutes"].round(2),
        name="Minutes lues",
        mode="lines+markers",
        marker=dict(size=8, color=COLOR_ACCENT),
        line=dict(width=3, color=COLOR_ACCENT),
        yaxis="y2",
        customdata=daily["preview"],
        hovertemplate="<b>%{x}</b><br>Temps lu : <b>%{y:.2f} min</b><br><br><b>Ouvrages lus :</b>%{customdata}<extra></extra>"
    ))

    layout = dict(PLOTLY_LAYOUT_DEFAULTS)
    layout.update(
        title="Activité Journalière (Pages & Minutes)",
        yaxis=dict(title="Pages lues", gridcolor=COLOR_GRID),
        yaxis2=dict(title="Minutes", overlaying="y", side="right", showgrid=False)
    )
    fig.update_layout(**layout)
    return fig


def plot_weekday_vs_weekend(sessions: List[Dict[str, Any]]) -> go.Figure:
    """Comparatif Semaine (Lun-Ven) vs Week-end (Sam-Dim) : Temps moyen et Vitesse moyenne."""
    if not sessions:
        fig = go.Figure()
        fig.update_layout(**PLOTLY_LAYOUT_DEFAULTS, title="Aucune donnée pour le comparatif")
        return fig

    df = pd.DataFrame(sessions)
    df["day_type"] = df["is_weekend"].map({True: "Week-end (Sam-Dim)", False: "Semaine (Lun-Ven)"})

    grouped = df.groupby("day_type").agg({
        "duration_minutes": "mean",
        "pages_per_hour": "mean",
        "pages_read": "mean"
    }).reset_index()

    fig = go.Figure()

    fig.add_trace(go.Bar(
        x=grouped["day_type"],
        y=grouped["duration_minutes"].round(2),
        name="Temps moyen par session (min)",
        marker_color="#818CF8",
        text=grouped["duration_minutes"].round(2).astype(str) + " min",
        textposition="auto",
        hovertemplate="<b>%{x}</b><br>Temps moyen : <b>%{y:.2f} min</b><extra></extra>"
    ))

    fig.add_trace(go.Bar(
        x=grouped["day_type"],
        y=grouped["pages_per_hour"].round(2),
        name="Vitesse moyenne (pages/h)",
        marker_color="#34D399",
        text=grouped["pages_per_hour"].round(2).astype(str) + " p/h",
        textposition="auto",
        hovertemplate="<b>%{x}</b><br>Vitesse moyenne : <b>%{y:.2f} p/h</b><extra></extra>"
    ))

    layout = dict(PLOTLY_LAYOUT_DEFAULTS)
    layout.update(
        title="Comparatif Semaine vs Week-end",
        barmode="group",
        yaxis=dict(title="Valeur", gridcolor=COLOR_GRID)
    )
    fig.update_layout(**layout)
    return fig


# ==========================================
# 3. Analyse du Catalogue (Genres, Auteurs, Pays, etc.)
# ==========================================

def plot_genres_distribution(books: List[Dict[str, Any]]) -> go.Figure:
    """Diagramme en barres horizontales des genres les plus représentés avec aperçu des livres au survol."""
    genre_to_books: Dict[str, List[str]] = {}
    for b in books:
        b_title = b.get("title", "Sans titre")
        for g in b.get("genres", []):
            if g:
                g_clean = g.strip().capitalize()
                if g_clean not in genre_to_books:
                    genre_to_books[g_clean] = []
                if b_title not in genre_to_books[g_clean]:
                    genre_to_books[g_clean].append(b_title)

    if not genre_to_books:
        fig = go.Figure()
        fig.update_layout(**PLOTLY_LAYOUT_DEFAULTS, title="Aucun genre renseigné")
        return fig

    # Top 10 genres triés par count croissant pour l'affichage bar horizontal
    sorted_genres = sorted(genre_to_books.items(), key=lambda x: len(x[1]), reverse=False)[-10:]

    genres = []
    counts = []
    previews = []

    for g_name, titles in sorted_genres:
        c = len(titles)
        genres.append(g_name)
        counts.append(c)
        sample = titles[:4]
        preview = "<br>• " + "<br>• ".join(sample)
        if c > 4:
            preview += f"<br><i>... et {c - 4} autre(s)</i>"
        previews.append(preview)

    fig = go.Figure(go.Bar(
        x=counts,
        y=genres,
        orientation="h",
        marker=dict(
            color=counts,
            colorscale="Viridis",
            showscale=False
        ),
        text=counts,
        textposition="auto",
        customdata=previews,
        hovertemplate="<b>%{y}</b><br>Total : <b>%{x} livre(s)</b><br><br><b>Ouvrages associés :</b>%{customdata}<extra></extra>"
    ))

    layout = dict(PLOTLY_LAYOUT_DEFAULTS)
    layout.update(
        title="Top 10 des Genres",
        xaxis=dict(title="Nombre de livres", gridcolor=COLOR_GRID),
        yaxis=dict(title=""),
        margin=dict(l=20, r=20, t=40, b=30)
    )
    fig.update_layout(**layout)
    return fig


def plot_fantasy_subgenres(books: List[Dict[str, Any]]) -> go.Figure:
    """Graphique de répartition des sous-genres de Fantasy avec aperçu des livres au survol."""
    subg_to_books: Dict[str, List[str]] = {}
    for b in books:
        b_title = b.get("title", "Sans titre")
        subg_list = b.get("fantasy_subgenres") or []
        if not subg_list and b.get("fantasy_subgenre"):
            subg_list = [s.strip() for s in b["fantasy_subgenre"].split(",") if s.strip()]
        for subg in subg_list:
            clean_s = subg.strip()
            if clean_s and clean_s not in ("Aucun", "None", ""):
                if clean_s not in subg_to_books:
                    subg_to_books[clean_s] = []
                if b_title not in subg_to_books[clean_s]:
                    subg_to_books[clean_s].append(b_title)

    if not subg_to_books:
        fig = go.Figure()
        fig.update_layout(**PLOTLY_LAYOUT_DEFAULTS, title="✨ Sous-genres de Fantasy (aucun renseigné)")
        return fig

    sorted_subg = sorted(subg_to_books.items(), key=lambda x: len(x[1]), reverse=False)

    subgenres = []
    counts = []
    previews = []

    for name, titles in sorted_subg:
        c = len(titles)
        subgenres.append(name)
        counts.append(c)
        sample = titles[:4]
        preview = "<br>• " + "<br>• ".join(sample)
        if c > 4:
            preview += f"<br><i>... et {c - 4} autre(s)</i>"
        previews.append(preview)

    fig = go.Figure(go.Bar(
        x=counts,
        y=subgenres,
        orientation="h",
        marker=dict(
            color=counts,
            colorscale="Plasma",
            showscale=False
        ),
        text=counts,
        textposition="auto",
        customdata=previews,
        hovertemplate="<b>%{y}</b><br>Total : <b>%{x} livre(s)</b><br><br><b>Ouvrages associés :</b>%{customdata}<extra></extra>"
    ))

    layout = dict(PLOTLY_LAYOUT_DEFAULTS)
    layout.update(
        title="✨ Répartition des Sous-genres de Fantasy",
        xaxis=dict(title="Nombre de livres", gridcolor=COLOR_GRID),
        yaxis=dict(title=""),
        margin=dict(l=20, r=20, t=40, b=30)
    )
    fig.update_layout(**layout)
    return fig


def plot_tags_treemap(books: List[Dict[str, Any]]) -> go.Figure:
    """Treemap des tags / tropes les plus fréquents avec infobulle listant le nombre et les livres associés."""
    tag_to_books: Dict[str, List[str]] = {}
    for b in books:
        b_title = b.get("title", "Sans titre")
        for t in b.get("tags", []):
            if t:
                t_clean = t.strip().capitalize()
                if t_clean not in tag_to_books:
                    tag_to_books[t_clean] = []
                if b_title not in tag_to_books[t_clean]:
                    tag_to_books[t_clean].append(b_title)

    if not tag_to_books:
        fig = go.Figure()
        fig.update_layout(**PLOTLY_LAYOUT_DEFAULTS, title="Aucun tag/trope renseigné")
        return fig

    # Trier par nombre de livres décroissant, top 15
    sorted_tags = sorted(tag_to_books.items(), key=lambda x: len(x[1]), reverse=True)[:15]

    tags = []
    counts = []
    book_previews = []

    for tag, b_titles in sorted_tags:
        count = len(b_titles)
        tags.append(tag)
        counts.append(count)
        # Afficher 3 ou 4 livres max dans l'infobulle
        sample = b_titles[:4]
        preview = "<br>• " + "<br>• ".join(sample)
        if count > 4:
            preview += f"<br><i>... et {count - 4} autre(s)</i>"
        book_previews.append(preview)

    fig = go.Figure(go.Treemap(
        labels=tags,
        parents=[""] * len(tags),
        values=counts,
        customdata=book_previews,
        textinfo="label+value",
        marker=dict(
            colors=counts,
            colorscale="Purples",
            showscale=False
        ),
        hovertemplate="<b>%{label}</b><br>Total : <b>%{value} livre(s)</b><br><br><b>Ouvrages associés :</b>%{customdata}<extra></extra>"
    ))

    layout = dict(PLOTLY_LAYOUT_DEFAULTS)
    layout.update(
        title="Top 15 des Tags & Tropes",
        margin=dict(l=15, r=15, t=40, b=15)
    )
    fig.update_layout(**layout)
    return fig


def plot_author_countries(books: List[Dict[str, Any]]) -> go.Figure:
    """Répartition par pays/nationalité des auteurs (Donut chart) avec aperçu des livres au survol."""
    country_to_books: Dict[str, List[str]] = {}
    for b in books:
        c = b.get("author_country") or "Inconnu"
        item = f"{b.get('title', 'Sans titre')} ({b.get('author', 'Auteur')})"
        if c not in country_to_books:
            country_to_books[c] = []
        if item not in country_to_books[c]:
            country_to_books[c].append(item)

    if not country_to_books:
        fig = go.Figure()
        fig.update_layout(**PLOTLY_LAYOUT_DEFAULTS, title="Aucune donnée de nationalité")
        return fig

    countries = []
    counts = []
    previews = []

    for c_name, items in sorted(country_to_books.items(), key=lambda x: len(x[1]), reverse=True):
        count = len(items)
        countries.append(c_name)
        counts.append(count)
        sample = items[:4]
        preview = "<br>• " + "<br>• ".join(sample)
        if count > 4:
            preview += f"<br><i>... et {count - 4} autre(s)</i>"
        previews.append(preview)

    fig = go.Figure(go.Pie(
        labels=countries,
        values=counts,
        hole=0.45,
        customdata=previews,
        marker=dict(colors=px.colors.qualitative.Pastel),
        hovertemplate="<b>%{label}</b><br>Total : <b>%{value} livre(s) (%{percent})</b><br><br><b>Ouvrages :</b>%{customdata}<extra></extra>"
    ))
    layout = dict(PLOTLY_LAYOUT_DEFAULTS)
    layout.update(
        title="Nationalité des Auteurs",
        legend=dict(
            orientation="h",
            yanchor="top",
            y=-0.12,
            xanchor="center",
            x=0.5
        ),
        margin=dict(l=20, r=20, t=50, b=60)
    )
    fig.update_layout(**layout)
    return fig


def plot_publishers_and_formats(books: List[Dict[str, Any]]) -> go.Figure:
    """Répartition des livres par format d'édition avec aperçu des livres au survol."""
    format_to_books: Dict[str, List[str]] = {}
    for b in books:
        f = b.get("format") or "Broché"
        title = b.get("title", "Sans titre")
        if f not in format_to_books:
            format_to_books[f] = []
        if title not in format_to_books[f]:
            format_to_books[f].append(title)

    if not format_to_books:
        fig = go.Figure()
        fig.update_layout(**PLOTLY_LAYOUT_DEFAULTS, title="Aucun format renseigné")
        return fig

    formats = []
    counts = []
    previews = []

    for f_name, items in sorted(format_to_books.items(), key=lambda x: len(x[1]), reverse=True):
        count = len(items)
        formats.append(f_name)
        counts.append(count)
        sample = items[:4]
        preview = "<br>• " + "<br>• ".join(sample)
        if count > 4:
            preview += f"<br><i>... et {count - 4} autre(s)</i>"
        previews.append(preview)

    fig = go.Figure(go.Pie(
        labels=formats,
        values=counts,
        customdata=previews,
        marker=dict(colors=px.colors.qualitative.Vivid),
        hovertemplate="<b>%{label}</b><br>Total : <b>%{value} livre(s) (%{percent})</b><br><br><b>Ouvrages :</b>%{customdata}<extra></extra>"
    ))
    layout = dict(PLOTLY_LAYOUT_DEFAULTS)
    layout.update(
        title="Répartition par Format d'Édition",
        legend=dict(
            orientation="h",
            yanchor="top",
            y=-0.12,
            xanchor="center",
            x=0.5
        ),
        margin=dict(l=20, r=20, t=50, b=60)
    )
    fig.update_layout(**layout)
    return fig


def plot_book_size_distribution(books: List[Dict[str, Any]]) -> go.Figure:
    """Distribution de la taille des livres (< 300p, 300-500p, 500-800p, > 800p) avec aperçu des livres au survol."""
    categories = ["< 300 p.", "300 - 500 p.", "500 - 800 p.", "> 800 p."]
    size_to_books: Dict[str, List[str]] = {cat: [] for cat in categories}

    for b in books:
        p = b.get("page_count", 0) or 0
        item = f"{b.get('title', 'Sans titre')} ({p} p.)"
        if p < 300:
            size_to_books["< 300 p."].append(item)
        elif p <= 500:
            size_to_books["300 - 500 p."].append(item)
        elif p <= 800:
            size_to_books["500 - 800 p."].append(item)
        else:
            size_to_books["> 800 p."].append(item)

    counts = [len(size_to_books[cat]) for cat in categories]
    previews = []
    for cat in categories:
        items = size_to_books[cat]
        c = len(items)
        if c == 0:
            previews.append("<br><i>Aucun livre</i>")
        else:
            sample = items[:4]
            prev = "<br>• " + "<br>• ".join(sample)
            if c > 4:
                prev += f"<br><i>... et {c - 4} autre(s)</i>"
            previews.append(prev)

    fig = go.Figure(go.Bar(
        x=categories,
        y=counts,
        marker_color=["#38BDF8", "#818CF8", "#A855F7", "#EC4899"],
        text=counts,
        textposition="auto",
        customdata=previews,
        hovertemplate="<b>%{x}</b><br>Total : <b>%{y} ouvrage(s)</b><br><br><b>Ouvrages :</b>%{customdata}<extra></extra>"
    ))

    layout = dict(PLOTLY_LAYOUT_DEFAULTS)
    layout.update(
        title="Morphologie des Livres (Pagination)",
        yaxis=dict(title="Nombre d'ouvrages", gridcolor=COLOR_GRID),
        margin=dict(l=20, r=20, t=40, b=30)
    )
    fig.update_layout(**layout)
    return fig

    fig = go.Figure(go.Bar(
        x=categories,
        y=counts,
        marker_color=["#38BDF8", "#818CF8", "#A855F7", "#EC4899"],
        text=counts,
        textposition="auto"
    ))

    layout = dict(PLOTLY_LAYOUT_DEFAULTS)
    layout.update(
        title="Morphologie des Livres (Pagination)",
        yaxis=dict(title="Nombre d'ouvrages", gridcolor=COLOR_GRID)
    )
    fig.update_layout(**layout)
    return fig


def plot_radar_ratings(books: List[Dict[str, Any]]) -> go.Figure:
    """Graphique radar (Scatterpolar) de la moyenne des sous-notes pour les livres notés."""
    rated_books = [b for b in books if b.get("rating_global") is not None]

    categories = ["Rythme", "Personnages", "Worldbuilding", "Plume", "Intrigue"]
    
    if not rated_books:
        fig = go.Figure()
        fig.update_layout(**PLOTLY_LAYOUT_DEFAULTS, title="Aucun livre évalué pour le radar")
        return fig

    pacing_avg = np.nanmean([b.get("rating_pacing") for b in rated_books if b.get("rating_pacing") is not None] or [0])
    chars_avg = np.nanmean([b.get("rating_chars") for b in rated_books if b.get("rating_chars") is not None] or [0])
    world_avg = np.nanmean([b.get("rating_world") for b in rated_books if b.get("rating_world") is not None] or [0])
    writing_avg = np.nanmean([b.get("rating_writing") for b in rated_books if b.get("rating_writing") is not None] or [0])
    plot_avg = np.nanmean([b.get("rating_plot") for b in rated_books if b.get("rating_plot") is not None] or [0])

    values = [pacing_avg, chars_avg, world_avg, writing_avg, plot_avg]
    # Fermer le polygone
    values.append(values[0])
    categories.append(categories[0])

    fig = go.Figure()

    fig.add_trace(go.Scatterpolar(
        r=[round(float(v), 2) for v in values],
        theta=categories,
        fill="toself",
        fillcolor="rgba(99, 102, 241, 0.3)",
        line=dict(color="#818CF8", width=2),
        name="Moyenne Personnelle (/5)",
        hovertemplate="Critère : <b>%{theta}</b><br>Note moyenne : <b>%{r:.2f} / 5</b><extra></extra>"
    ))

    fig.update_layout(
        polar=dict(
            radialaxis=dict(visible=True, range=[0, 5], gridcolor=COLOR_GRID, linecolor=COLOR_GRID),
            bgcolor="rgba(0,0,0,0)"
        ),
        paper_bgcolor="rgba(0,0,0,0)",
        font=dict(color=COLOR_TEXT),
        title="Profil d'Évaluation (Moyenne des Critères)",
        margin=dict(l=30, r=30, t=40, b=30),
        showlegend=False
    )
    return fig


def plot_rating_correlation(books: List[Dict[str, Any]]) -> go.Figure:
    """Nuage de points : Corrélation entre note communautaire et note personnelle."""
    rated = [
        b for b in books
        if b.get("rating_global") is not None and b.get("popularity_score") is not None
    ]

    if not rated:
        fig = go.Figure()
        fig.update_layout(**PLOTLY_LAYOUT_DEFAULTS, title="Pas assez de données pour la corrélation")
        return fig

    df = pd.DataFrame(rated)

    fig = px.scatter(
        df,
        x="popularity_score",
        y="rating_global",
        hover_data={"title": True, "author": True, "popularity_score": ":.2f", "rating_global": ":.2f"},
        color="rating_global",
        color_continuous_scale="Bluered",
        title="Corrélation Note Communauté vs Note Personnelle",
        labels={
            "popularity_score": "Note Communautaire (/5)",
            "rating_global": "Votre Note Globale (/5)"
        }
    )
    fig.update_traces(
        hovertemplate="<b>%{customdata[0]}</b> (%{customdata[1]})<br>Note communauté : <b>%{x:.2f} / 5</b><br>Votre note : <b>%{y:.2f} / 5</b><extra></extra>"
    )

    # Ligne d'égalité y = x
    fig.add_trace(go.Scatter(
        x=[2, 5],
        y=[2, 5],
        mode="lines",
        name="Accord Parfait (y=x)",
        line=dict(color="#64748B", dash="dash")
    ))

    layout = dict(PLOTLY_LAYOUT_DEFAULTS)
    layout.update(
        xaxis=dict(range=[2.5, 5.0], gridcolor=COLOR_GRID),
        yaxis=dict(range=[1.0, 5.2], gridcolor=COLOR_GRID)
    )
    fig.update_layout(**layout)
    fig.update_coloraxes(showscale=False)
    return fig
