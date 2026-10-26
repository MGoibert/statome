"""
Vue : Onglet 4 - Statistiques, Semainier & Tableaux de bord (views/tab_stats.py)
Inclut le sélecteur universel de périmètre avec mois et années en clair,
le semainier visuel responsive avec miniatures, les KPIs de rythme arrondis à 2 décimales max,
la projection de fin de PAL et les graphiques d'analyse de catalogue avec infobulles personnalisées.
"""

from datetime import datetime, timedelta, date
import streamlit as st
import pandas as pd

from core.database import get_all_books, get_reading_sessions
from core.date_utils import format_month_year_french
from core.stats_engine import (
    get_week_boundaries, build_weekly_calendar_data,
    build_monthly_calendar_data, build_yearly_calendar_data,
    plot_daily_reading_activity, plot_weekday_vs_weekend,
    plot_genres_distribution, plot_tags_treemap,
    plot_fantasy_subgenres,
    plot_author_countries, plot_publishers_and_formats,
    plot_book_size_distribution, plot_radar_ratings,
    plot_rating_correlation
)


def render_tab_stats():
    st.markdown("### 📊 Statistiques & Tableaux de Bord")

    # ==========================================
    # Architecture de Filtrage Global (Le Sélecteur de Périmètre)
    # ==========================================
    curr_date = date.today()
    curr_month_french = format_month_year_french(curr_date)
    curr_month_code = curr_date.strftime("%Y-%m")
    curr_year_val = curr_date.year

    col_scope, col_time = st.columns([1, 1])
    with col_scope:
        scope = st.selectbox(
            "🎯 Périmètre d'analyse :",
            [
                "📖 Livres lus (Historique)",
                f"🎯 Ma PAL du mois ({curr_month_french})",
                f"📅 Ma PAL de l'année ({curr_year_val})",
                "📚 Ma Bibliothèque (Non lus)",
                "🛒 Wishlist / À acheter"
            ],
            key="stats_scope_selector"
        )

    # Filtre temporel additionnel si "Livres lus"
    time_filter = "Tout"
    if scope.startswith("📖 Livres lus"):
        with col_time:
            time_filter = st.selectbox(
                "Période des livres lus :",
                ["Tout", f"Mois en cours ({curr_month_french})", f"Année en cours ({curr_year_val})"]
            )
    else:
        with col_time:
            st.caption(f"Analyse ciblée sur : **{scope}**")

    # Chargement et filtrage des livres selon le périmètre
    all_books = get_all_books()
    all_sessions = get_reading_sessions()

    filtered_books = []
    if scope.startswith("📖 Livres lus"):
        read_books = [b for b in all_books if b["status"] == "Terminé"]
        if time_filter.startswith("Mois en cours"):
            filtered_books = [b for b in read_books if b.get("finished_at") and str(b["finished_at"]).startswith(curr_month_code)]
        elif time_filter.startswith("Année en cours"):
            filtered_books = [b for b in read_books if b.get("finished_at") and str(b["finished_at"]).startswith(str(curr_year_val))]
        else:
            filtered_books = read_books
    elif "PAL du mois" in scope:
        filtered_books = [b for b in all_books if b.get("pal_month") == curr_month_code]
    elif "PAL de l'année" in scope:
        filtered_books = [b for b in all_books if b.get("pal_year") == curr_year_val]
    elif "Bibliothèque" in scope:
        filtered_books = [b for b in all_books if b["status"] == "Bibliothèque"]
    elif "Wishlist" in scope:
        filtered_books = [b for b in all_books if b["status"] in ("Wishlist", "À acheter")]

    # Sous-onglets thématiques
    stat_tabs = st.tabs(["🗓️ Calendrier", "⚡ Rythme & PAL", "📚 Catalogue & Genres", "⭐ Notes & Radar"])

    # ==========================================
    # SECTION 1 : CALENDRIER DE LECTURE (Semainier / Mensuel / Annuel)
    # ==========================================
    with stat_tabs[0]:
        st.markdown("#### 🗓️ Calendrier de Lecture Visuel")
        st.caption("Visualisez vos séances de lecture quotidiennes, mensuelles et annuelles ainsi que les livres dévorés.")

        cal_mode = st.radio(
            "Période d'affichage :",
            ["📅 Semainier", "🗓️ Mensuel", "📊 Annuel"],
            horizontal=True,
            key="calendar_display_mode"
        )

        # ------------------------------------------
        # 1.1 VUE SEMAINIER (Agenda Hebdomadaire Horizontal)
        # ------------------------------------------
        if cal_mode == "📅 Semainier":
            if "week_offset" not in st.session_state:
                st.session_state.week_offset = 0

            col_w_prev, col_w_cur, col_w_next = st.columns([1, 2, 1])
            with col_w_prev:
                if st.button("◀️ Semaine préc.", width="stretch", key="w_prev"):
                    st.session_state.week_offset -= 1
                    st.rerun()
            with col_w_cur:
                if st.button("Semaine actuelle", width="stretch", key="w_cur"):
                    st.session_state.week_offset = 0
                    st.rerun()
            with col_w_next:
                if st.button("Semaine suiv. ▶️", width="stretch", key="w_next"):
                    st.session_state.week_offset += 1
                    st.rerun()

            ref_date = curr_date + timedelta(weeks=st.session_state.week_offset)
            monday, sunday = get_week_boundaries(ref_date)
            week_calendar = build_weekly_calendar_data(all_sessions, monday)
            tot_w_min = sum(d["total_minutes"] for d in week_calendar)
            tot_w_pages = sum(d["total_pages"] for d in week_calendar)

            st.markdown(
                f"<div style='text-align: center; color: #818CF8; font-weight: 700; font-size: 1.05rem; margin: 10px 0 4px 0;'>"
                f"Semaine du {monday.strftime('%d/%m/%Y')} au {sunday.strftime('%d/%m/%Y')}</div>"
                f"<div style='text-align: center; color: #94A3B8; font-size: 0.85rem; margin-bottom: 14px;'>"
                f"Total semaine : <b style='color: #34D399;'>+{tot_w_pages} pages</b> • <b style='color: #38BDF8;'>{tot_w_min:.2f} min</b></div>",
                unsafe_allow_html=True
            )

            # Agenda hebdomadaire en grille horizontale (7 colonnes côte à côte)
            week_cols_html = []
            for day in week_calendar:
                d_str = day["date"].strftime("%d/%m")
                is_active_day = day["total_minutes"] > 0
                border_color = "#6366F1" if day["is_today"] else ("#38BDF8" if is_active_day else "#334155")
                bg_color = "rgba(30, 41, 59, 0.9)" if is_active_day else "rgba(15, 23, 42, 0.4)"

                covers_html = ""
                for b in day["books"]:
                    b_min_val = round(float(b["minutes"]), 1)
                    if b.get("cover_url"):
                        covers_html += f'<img src="{b["cover_url"]}" title="{b["title"]} (+{b["pages"]}p, {b_min_val}min)" style="width: 44px; height: 64px; object-fit: cover; border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.5); margin: 3px auto; display: block;">'
                    else:
                        covers_html += f'<div style="padding: 3px 5px; background: #334155; border-radius: 4px; font-size: 0.7rem; margin: 2px 0; text-align: center;">📖 {b["title"][:9]}..</div>'

                badge_today = '<span style="background: #6366F1; color: white; padding: 1px 5px; border-radius: 6px; font-size: 0.65rem;">Auj.</span>' if day["is_today"] else ""
                badge_we = '<span style="color: #64748B; font-size: 0.7rem;">(WE)</span>' if day["is_weekend"] else ""
                min_display = f"{day['total_minutes']:.0f} min" if is_active_day else "—"
                pages_display = f"+{day['total_pages']} p." if is_active_day else "0 p."
                stat_color = "#34D399" if is_active_day else "#64748B"

                covers_display = covers_html if covers_html else '<div style="color: #475569; font-size: 0.75rem;">—</div>'

                week_cols_html.append(
                    f'<div style="background: {bg_color}; border: 1.5px solid {border_color}; border-radius: 10px; padding: 10px 6px; text-align: center; display: flex; flex-direction: column; justify-content: space-between; min-height: 185px;">'
                    f'<div>'
                    f'<div style="font-weight: 700; font-size: 0.88rem; color: #F8FAFC;">{day["day_name"][:3]}. {badge_today}{badge_we}</div>'
                    f'<div style="font-size: 0.78rem; color: #94A3B8; margin-bottom: 6px;">{d_str}</div>'
                    f'<div style="min-height: 70px; display: flex; flex-direction: column; justify-content: center; align-items: center;">{covers_display}</div>'
                    f'</div>'
                    f'<div style="margin-top: 6px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.08);">'
                    f'<div style="font-weight: 700; font-size: 0.85rem; color: {stat_color};">{pages_display}</div>'
                    f'<div style="font-size: 0.75rem; color: #94A3B8;">{min_display}</div>'
                    f'</div>'
                    f'</div>'
                )

            st.markdown(
                '<div style="display: grid; grid-template-columns: repeat(7, minmax(95px, 1fr)); gap: 8px; overflow-x: auto; padding: 4px 2px 12px 2px;">'
                + "".join(week_cols_html) +
                '</div>',
                unsafe_allow_html=True
            )

        # ------------------------------------------
        # 1.2 VUE MENSUELLE (Agenda Mensuel Grille de Calendrier)
        # ------------------------------------------
        elif cal_mode == "🗓️ Mensuel":
            if "month_offset" not in st.session_state:
                st.session_state.month_offset = 0

            col_m_prev, col_m_cur, col_m_next = st.columns([1, 2, 1])
            with col_m_prev:
                if st.button("◀️ Mois préc.", width="stretch", key="m_prev"):
                    st.session_state.month_offset -= 1
                    st.rerun()
            with col_m_cur:
                if st.button("Mois en cours", width="stretch", key="m_cur"):
                    st.session_state.month_offset = 0
                    st.rerun()
            with col_m_next:
                if st.button("Mois suiv. ▶️", width="stretch", key="m_next"):
                    st.session_state.month_offset += 1
                    st.rerun()

            total_m_idx = curr_date.year * 12 + (curr_date.month - 1) + st.session_state.month_offset
            target_year = total_m_idx // 12
            target_month = (total_m_idx % 12) + 1

            month_data = build_monthly_calendar_data(all_sessions, target_year, target_month)

            st.markdown(
                f"<div style='text-align: center; color: #818CF8; font-weight: 700; font-size: 1.15rem; margin: 10px 0 4px 0;'>"
                f"Mois de {month_data['month_name']} {month_data['year']}</div>"
                f"<div style='text-align: center; color: #94A3B8; font-size: 0.85rem; margin-bottom: 14px;'>"
                f"Total mois : <b style='color: #34D399;'>+{month_data['total_pages']} pages</b> • "
                f"<b style='color: #38BDF8;'>{month_data['total_minutes']:.2f} min</b> • "
                f"<b style='color: #F8FAFC;'>{month_data['active_days_count']}/{month_data['num_days']} jours actifs</b> • "
                f"<b style='color: #A78BFA;'>{len(month_data['distinct_books'])} livre(s) lu(s)</b></div>",
                unsafe_allow_html=True
            )

            # Entête des 7 jours de l'agenda
            header_days_html = (
                '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; font-weight: 700; font-size: 0.82rem; color: #818CF8; margin-bottom: 6px;">'
                '<div>Lun</div><div>Mar</div><div>Mer</div><div>Jeu</div><div>Ven</div><div>Sam</div><div>Dim</div>'
                '</div>'
            )

            # Cellules de la grille mensuelle
            cells_html = []

            # 1. Cases vides initiales avant le 1er jour du mois
            first_w = month_data.get("first_weekday", 0)
            for _ in range(first_w):
                cells_html.append(
                    '<div style="background: rgba(15, 23, 42, 0.2); border: 1px dashed rgba(51, 65, 85, 0.3); border-radius: 8px; min-height: 80px;"></div>'
                )

            # 2. Cases pour chaque jour du mois
            for day in month_data["days"]:
                is_active = (day["total_minutes"] > 0 or day["total_pages"] > 0)
                border_color = "#6366F1" if day["is_today"] else ("#38BDF8" if is_active else "rgba(51, 65, 85, 0.5)")
                bg_color = "rgba(30, 41, 59, 0.95)" if is_active else ("rgba(99, 102, 241, 0.12)" if day["is_today"] else "rgba(15, 23, 42, 0.4)")

                day_covers_html = ""
                for b in day["books"]:
                    if b.get("cover_url"):
                        day_covers_html += f'<img src="{b["cover_url"]}" title="{b["title"]} (+{b["pages"]}p, {b["minutes"]:.0f}m)" style="width: 26px; height: 38px; object-fit: cover; border-radius: 3px; box-shadow: 0 1px 4px rgba(0,0,0,0.5); margin: 1px;">'

                stat_badge = ""
                if is_active:
                    stat_badge = (
                        f'<div style="font-size: 0.65rem; font-weight: 700; color: #34D399; margin-top: 2px;">+{day["total_pages"]}p</div>'
                    )

                today_dot = ' <span style="color: #6366F1;">●</span>' if day["is_today"] else ""

                cells_html.append(
                    f'<div style="background: {bg_color}; border: 1px solid {border_color}; border-radius: 8px; padding: 4px; min-height: 80px; display: flex; flex-direction: column; justify-content: space-between; text-align: center;">'
                    f'<div style="font-weight: 700; font-size: 0.8rem; color: #F1F5F9; text-align: left; padding-left: 2px;">{day["day_num"]}{today_dot}</div>'
                    f'<div style="display: flex; flex-wrap: wrap; justify-content: center; align-items: center; min-height: 38px;">{day_covers_html}</div>'
                    f'<div>{stat_badge}</div>'
                    f'</div>'
                )

            # 3. Cases vides de fin pour compléter la dernière semaine
            total_cells = first_w + month_data["num_days"]
            trailing_cells = (7 - (total_cells % 7)) % 7
            for _ in range(trailing_cells):
                cells_html.append(
                    '<div style="background: rgba(15, 23, 42, 0.2); border: 1px dashed rgba(51, 65, 85, 0.3); border-radius: 8px; min-height: 80px;"></div>'
                )

            grid_month_html = (
                header_days_html +
                '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 12px;">'
                + "".join(cells_html) +
                '</div>'
            )
            st.markdown(grid_month_html, unsafe_allow_html=True)

            # Détail des lectures du mois sous forme de liste
            active_month_days = [d for d in month_data["days"] if d["total_minutes"] > 0 or d["total_pages"] > 0]
            if active_month_days:
                with st.expander(f"📖 Détail des séances de lecture ({len(active_month_days)} jours actifs)"):
                    for day in active_month_days:
                        d_str = day["date"].strftime("%d/%m")
                        c_list = []
                        for b in day["books"]:
                            c_list.append(f"**{b['title']}** (+{b['pages']} pages, {b['minutes']:.1f} min)")
                        books_line = " • ".join(c_list)
                        st.markdown(f"- **{day['day_name']} {d_str}** : +{day['total_pages']} pages ({day['total_minutes']:.1f} min) — {books_line}")

        # ------------------------------------------
        # 1.3 VUE ANNUELLE (Agenda Annuel 12 Mois)
        # ------------------------------------------
        elif cal_mode == "📊 Annuel":
            if "year_offset" not in st.session_state:
                st.session_state.year_offset = 0

            col_y_prev, col_y_cur, col_y_next = st.columns([1, 2, 1])
            with col_y_prev:
                if st.button("◀️ Année préc.", width="stretch", key="y_prev"):
                    st.session_state.year_offset -= 1
                    st.rerun()
            with col_y_cur:
                if st.button("Année en cours", width="stretch", key="y_cur"):
                    st.session_state.year_offset = 0
                    st.rerun()
            with col_y_next:
                if st.button("Année suiv. ▶️", width="stretch", key="y_next"):
                    st.session_state.year_offset += 1
                    st.rerun()

            target_year = curr_date.year + st.session_state.year_offset
            year_data = build_yearly_calendar_data(all_sessions, target_year)

            st.markdown(
                f"<div style='text-align: center; color: #818CF8; font-weight: 700; font-size: 1.2rem; margin: 10px 0 4px 0;'>"
                f"Bilan Annuel {year_data['year']}</div>"
                f"<div style='text-align: center; color: #94A3B8; font-size: 0.85rem; margin-bottom: 14px;'>"
                f"Total année : <b style='color: #34D399;'>+{year_data['total_pages']} pages</b> • "
                f"<b style='color: #38BDF8;'>{year_data['total_minutes']:.2f} min</b> • "
                f"<b style='color: #F8FAFC;'>{year_data['active_days_count']} jours de lecture</b> • "
                f"<b style='color: #A78BFA;'>{len(year_data['distinct_books'])} livre(s) lu(s)</b></div>",
                unsafe_allow_html=True
            )

            # Grille des 12 mois de l'année
            year_cards_html = []
            for m in year_data["months"]:
                is_active_m = m["total_minutes"] > 0 or m["total_pages"] > 0
                border_color = "#6366F1" if m["is_current_month"] else ("#38BDF8" if is_active_m else "#334155")
                bg_color = "rgba(30, 41, 59, 0.9)" if is_active_m else "rgba(15, 23, 42, 0.4)"

                covers_html = ""
                for b in m["books"][:4]:
                    b_min_val = round(float(b["minutes"]), 1)
                    if b.get("cover_url"):
                        covers_html += f'<img src="{b["cover_url"]}" title="{b["title"]} (+{b["pages"]}p, {b_min_val}min)" style="width: 32px; height: 46px; object-fit: cover; border-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.4); margin-right: 4px;">'
                    else:
                        covers_html += f'<span style="padding: 2px 4px; background: #334155; border-radius: 3px; font-size: 0.65rem; margin-right: 3px;">📖</span>'

                badge_cur = '<span style="background: #6366F1; color: white; padding: 1px 5px; border-radius: 6px; font-size: 0.65rem; margin-left: 4px;">En cours</span>' if m["is_current_month"] else ""
                active_days_label = f"{m['active_days_count']} j. actifs" if is_active_m else "0 j. actif"
                pages_display = f"+{m['total_pages']} p." if is_active_m else "0 p."
                min_display = f"{m['total_minutes']:.0f} min" if is_active_m else "—"
                stat_color = "#34D399" if is_active_m else "#64748B"

                month_covers_display = covers_html if covers_html else '<span style="color: #475569; font-size: 0.78rem;">Aucune lecture</span>'

                year_cards_html.append(
                    f'<div style="background: {bg_color}; border: 1.5px solid {border_color}; border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; min-height: 130px;">'
                    f'<div>'
                    f'<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">'
                    f'<div style="font-weight: 700; font-size: 0.95rem; color: #F8FAFC;">{m["month_name"]} {badge_cur}</div>'
                    f'<div style="font-size: 0.75rem; color: #94A3B8;">{active_days_label}</div>'
                    f'</div>'
                    f'<div style="display: flex; align-items: center; overflow-x: auto; min-height: 48px; padding: 2px 0;">'
                    f'{month_covers_display}'
                    f'</div>'
                    f'</div>'
                    f'<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 0.8rem;">'
                    f'<span style="font-weight: 700; color: {stat_color};">{pages_display}</span>'
                    f'<span style="color: #94A3B8;">{min_display}</span>'
                    f'</div>'
                    f'</div>'
                )

            st.markdown(
                '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; padding: 4px 0 12px 0;">'
                + "".join(year_cards_html) +
                '</div>',
                unsafe_allow_html=True
            )

            # Aperçu des livres lus dans l'année
            if year_data["distinct_books"]:
                with st.expander(f"📚 Tous les livres explorés en {target_year} ({len(year_data['distinct_books'])})"):
                    b_cols = st.columns(min(len(year_data["distinct_books"]), 4))
                    for idx, b_item in enumerate(year_data["distinct_books"]):
                        with b_cols[idx % len(b_cols)]:
                            if b_item.get("cover_url"):
                                st.image(b_item["cover_url"], width=80)
                            st.caption(f"**{b_item['title']}**\n\n+{b_item['pages']} p. ({b_item['minutes']:.0f}m)")

    # ==========================================
    # SECTION 2 : RYTHME & PROJECTION DE FIN DE PAL
    # ==========================================
    with stat_tabs[1]:
        st.markdown("#### ⚡ Statistiques de Rythme")

        df_s = pd.DataFrame(all_sessions) if all_sessions else pd.DataFrame()
        if not df_s.empty:
            df_s["session_date"] = pd.to_datetime(df_s["start_time"]).dt.date
            now_d = date.today()
            seven_days_ago = now_d - timedelta(days=7)
            thirty_days_ago = now_d - timedelta(days=30)

            s_week = df_s[df_s["session_date"] >= seven_days_ago]
            s_month = df_s[df_s["session_date"] >= thirty_days_ago]

            w_pages = s_week["pages_read"].sum() if not s_week.empty else 0
            w_min = s_week["duration_minutes"].sum() if not s_week.empty else 0.0
            w_speed = (w_pages / w_min) * 60.0 if w_min > 0 else 0.0

            m_pages = s_month["pages_read"].sum() if not s_month.empty else 0
            m_min = s_month["duration_minutes"].sum() if not s_month.empty else 0.0
            m_speed = (m_pages / m_min) * 60.0 if m_min > 0 else 0.0
        else:
            w_pages, w_min, w_speed = 0, 0.0, 0.0
            m_pages, m_min, m_speed = 0, 0.0, 0.0

        # KPI Cards avec 2 décimales maximum
        kpi1, kpi2, kpi3, kpi4 = st.columns(4)
        with kpi1:
            st.metric("Temps lu (7j)", f"{w_min:.2f} min", f"{w_min/60:.2f} h")
        with kpi2:
            st.metric("Pages lues (7j)", f"{w_pages} p.", f"{w_pages/7:.2f} p/jour")
        with kpi3:
            st.metric("Vitesse moy.", f"{w_speed:.2f} p/h", f"{m_speed:.2f} p/h (30j)")
        with kpi4:
            st.metric("Temps lu (30j)", f"{m_min/60:.2f} h", f"{m_pages} pages")

        st.markdown("---")
        # Graphique Bar Chart : Activité Journalière
        st.plotly_chart(
            plot_daily_reading_activity(all_sessions, days_limit=14),
            width="stretch",
            config={"displayModeBar": False}
        )

        # Graphique Comparatif Semaine vs Week-end
        st.plotly_chart(
            plot_weekday_vs_weekend(all_sessions),
            width="stretch",
            config={"displayModeBar": False}
        )

        st.markdown("---")
        # Projection de PAL du mois
        st.markdown("#### 🎯 Projection de fin de PAL du mois")
        pal_month_books = [b for b in all_books if b.get("pal_month") == curr_month_code]
        
        if pal_month_books:
            pages_remaining_pal = sum(max(b["page_count"] - (b["current_page"] or 0), 0) for b in pal_month_books if b["status"] != "Terminé")
            books_left_pal = len([b for b in pal_month_books if b["status"] != "Terminé"])

            speed_ref = w_speed if w_speed > 10 else (m_speed if m_speed > 10 else 45.0)
            hours_needed = pages_remaining_pal / speed_ref if speed_ref > 0 else 0.0

            import calendar
            last_day_of_month = calendar.monthrange(curr_date.year, curr_date.month)[1]
            days_left_in_month = max(last_day_of_month - curr_date.day, 1)
            daily_pages_needed = pages_remaining_pal / days_left_in_month

            pal_proj_html = (
                f'<div style="background: rgba(30, 41, 59, 0.7); border: 1px solid #6366F1; border-radius: 10px; padding: 16px; margin: 10px 0;">'
                f'<div style="font-size: 1.1rem; font-weight: 700; color: #818CF8;">PAL de {curr_month_french} : {books_left_pal} livre(s) restant(s)</div>'
                f'<div style="margin-top: 8px; color: #E2E8F0; font-size: 0.95rem;">📄 <b>{pages_remaining_pal} pages</b> à lire pour terminer votre sélection mensuelle.</div>'
                f'<div style="margin-top: 6px; color: #38BDF8; font-size: 0.95rem;">⏱️ Temps estimé nécessaire : <b>~{hours_needed:.2f} heures</b> (sur base de votre vitesse de {speed_ref:.2f} p/h).</div>'
                f'<div style="margin-top: 6px; color: #34D399; font-size: 0.95rem;">📅 Objectif quotidien restant : <b>{daily_pages_needed:.2f} pages / jour</b> pendant les {days_left_in_month} jours restants ce mois-ci.</div>'
                f'</div>'
            )
            st.markdown(pal_proj_html, unsafe_allow_html=True)
        else:
            st.info(f"Aucun livre n'est actuellement assigné à la PAL du mois ({curr_month_french}).")

    # ==========================================
    # SECTION 3 : ANALYSE DU CATALOGUE
    # ==========================================
    with stat_tabs[2]:
        st.markdown(f"#### 📚 Analyse du Catalogue ({len(filtered_books)} livres dans le périmètre)")

        # Économie & Valeur financière
        prices = [b.get("price") for b in filtered_books if b.get("price") is not None]
        total_val = sum(prices) if prices else 0.0
        avg_price = total_val / len(prices) if prices else 0.0

        c_ec1, c_ec2, c_ec3 = st.columns(3)
        with c_ec1:
            st.metric("Valeur financière totale", f"{total_val:.2f} €")
        with c_ec2:
            st.metric("Prix moyen", f"{avg_price:.2f} €")
        with c_ec3:
            total_pages_p = sum(b.get("page_count", 0) for b in filtered_books)
            st.metric("Pagination totale", f"{total_pages_p:,} p.".replace(",", " "))

        st.markdown("---")
        # Genres et Tags
        col_g, col_t = st.columns(2)
        with col_g:
            st.plotly_chart(
                plot_genres_distribution(filtered_books),
                width="stretch",
                config={"displayModeBar": False}
            )
        with col_t:
            st.plotly_chart(
                plot_tags_treemap(filtered_books),
                width="stretch",
                config={"displayModeBar": False}
            )

        # Graphique dédié aux sous-genres de la Fantasy
        has_subgenres = any((b.get("fantasy_subgenre") or "").strip() not in ("Aucun", "None", "") for b in filtered_books)
        if has_subgenres:
            st.plotly_chart(
                plot_fantasy_subgenres(filtered_books),
                width="stretch",
                config={"displayModeBar": False}
            )

        st.markdown("---")
        # Auteurs, Pays et Formats
        col_p, col_f = st.columns(2)
        with col_p:
            st.plotly_chart(
                plot_author_countries(filtered_books),
                width="stretch",
                config={"displayModeBar": False}
            )
        with col_f:
            st.plotly_chart(
                plot_publishers_and_formats(filtered_books),
                width="stretch",
                config={"displayModeBar": False}
            )

        st.markdown("---")
        # Morphologie (Distribution des pages)
        st.plotly_chart(
            plot_book_size_distribution(filtered_books),
            width="stretch",
            config={"displayModeBar": False}
        )

    # ==========================================
    # SECTION 4 : PROFIL DE NOTATION & RADAR
    # ==========================================
    with stat_tabs[3]:
        st.markdown("#### ⭐ Profil d'Évaluation & Corrélation")
        st.caption("Analyse des sous-critères (Rythme, Personnages, Worldbuilding, Plume, Intrigue)")

        rated_in_scope = [b for b in filtered_books if b.get("rating_global") is not None]
        if rated_in_scope:
            col_r1, col_r2 = st.columns(2)
            with col_r1:
                st.plotly_chart(
                    plot_radar_ratings(rated_in_scope),
                    width="stretch",
                    config={"displayModeBar": False}
                )
            with col_r2:
                st.plotly_chart(
                    plot_rating_correlation(rated_in_scope),
                    width="stretch",
                    config={"displayModeBar": False}
                )
        else:
            st.info("Aucun livre évalué dans ce périmètre pour générer le radar d'évaluation. Notez un livre dans l'onglet Lecture ou Bibliothèque !")
