"""
Vue : Onglet 3 - Bibliothèque, PAL, Filtres & Fiches Livres (views/tab_library.py)
Affichage mobile-first : filtres multicritères, statut mis en valeur tout en haut de la fiche,
notation avec 0.0 = Non noté par défaut (sans bouton intermédiaire),
gestion des PAL en clair et logique des suites de séries à acheter.
"""

from datetime import datetime, date
import streamlit as st

from core.database import (
    get_all_books, get_book, update_book, delete_book, add_book,
    get_reading_sessions, delete_reading_session,
    get_book_notes, add_book_note, delete_book_note,
    get_series_to_buy, get_books_by_series, add_series_next_volume_to_wishlist
)
from core.date_utils import (
    FRENCH_MONTHS, format_month_year_french,
    split_pal_month, build_pal_month_string
)
from core.metadata_fetcher import FANTASY_SUBGENRES, fetch_series_volumes, find_next_series_volume, infer_book_series

STATUS_COLORS = {
    "En cours": "#3B82F6",
    "Terminé": "#10B981",
    "Bibliothèque": "#F59E0B",
    "Wishlist": "#8B5CF6",
    "À acheter": "#F97316",
    "DNF": "#EF4444"
}


def _on_close_book_detail():
    st.session_state.active_dialog_book_id = None


@st.dialog("📖 Fiche Détaillée & Édition", on_dismiss=_on_close_book_detail)
def dialog_book_detail(book_id: int):
    book = get_book(book_id)
    if not book:
        st.session_state.active_dialog_book_id = None
        st.error("Livre introuvable.")
        return

    st_color = STATUS_COLORS.get(book["status"], "#6366F1")
    rating_badge = f"⭐ <b>{float(book['rating_global']):.2f}/5</b>" if book.get("rating_global") else "<span style='color: #94A3B8;'>Non noté</span>"

    # Statut mis en valeur tout en haut de manière isolée avec changement direct
    status_header_html = (
        f'<div style="background: rgba(30, 41, 59, 0.95); border: 1.5px solid {st_color}; border-radius: 12px; padding: 12px 16px; margin-bottom: 10px;">'
        f'<div style="display: flex; justify-content: space-between; align-items: center;">'
        f'<div>'
        f'<div style="font-size: 0.72rem; color: #94A3B8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Statut actuel</div>'
        f'<div style="background: {st_color}25; color: {st_color}; font-weight: 800; font-size: 1.05rem; padding: 2px 12px; border-radius: 20px; display: inline-block; margin-top: 2px;">'
        f'{book["status"]}'
        f'</div>'
        f'</div>'
        f'<div style="text-align: right;">'
        f'<div style="font-size: 0.72rem; color: #94A3B8; text-transform: uppercase; font-weight: 700;">Évaluation</div>'
        f'<div style="font-size: 0.95rem; margin-top: 2px;">{rating_badge}</div>'
        f'</div>'
        f'</div>'
        f'</div>'
    )
    st.markdown(status_header_html, unsafe_allow_html=True)

    status_list = ["Bibliothèque", "En cours", "Wishlist", "À acheter", "Terminé", "DNF"]
    cur_st = book["status"]
    st_idx = status_list.index(cur_st) if cur_st in status_list else 0

    def on_change_book_status():
        new_val = st.session_state[f"quick_status_{book_id}"]
        payload = {"status": new_val}
        if new_val == "En cours" and not book.get("started_at"):
            payload["started_at"] = date.today()
        elif new_val == "Terminé" and not book.get("finished_at"):
            payload["finished_at"] = date.today()
        update_book(book_id, payload)
        st.toast(f"Statut changé en « {new_val} » ! ✅")

    st.selectbox(
        "Changer le statut directement :",
        status_list,
        index=st_idx,
        key=f"quick_status_{book_id}",
        on_change=on_change_book_status,
        help="Modifie le statut immédiatement sans avoir à chercher dans les métadonnées."
    )

    st.markdown(f"### {book['title']}")
    series_info = f"— Série : {book['series_name']} (Tome {book['series_volume']})" if book.get('series_name') else ""
    st.caption(f"De **{book['author']}** {series_info}")
    subg_list_disp = book.get("fantasy_subgenres") or ([book["fantasy_subgenre"]] if book.get("fantasy_subgenre") else [])
    if subg_list_disp:
        badges_html = " ".join([f"<span style='background: rgba(232, 121, 249, 0.15); color: #E879F9; border: 1px solid rgba(232, 121, 249, 0.35); padding: 2px 10px; border-radius: 12px; font-size: 0.78rem; font-weight: 600; margin-right: 4px; display: inline-block;'>✨ {sg}</span>" for sg in subg_list_disp])
        st.markdown(f"<div style='margin-top: -6px; margin-bottom: 8px;'>{badges_html}</div>", unsafe_allow_html=True)

    # Bandeau informatif si le livre fait partie d'une saga
    has_series = bool(book.get("series_name"))
    if has_series:
        vol_txt = f"Tome {book.get('series_volume'):g}" if book.get("series_volume") is not None else "Tome non spécifié"
        saga_banner_html = (
            f'<div style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.18)); border: 1.5px solid rgba(168, 85, 247, 0.45); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">'
            f'<div>'
            f'<div style="font-size: 0.72rem; color: #C084FC; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Saga / Série</div>'
            f'<div style="font-size: 1.02rem; font-weight: 800; color: #F8FAFC;">📚 {book["series_name"]}</div>'
            f'</div>'
            f'<div style="text-align: right;">'
            f'<span style="background: #A855F7; color: white; padding: 3px 12px; border-radius: 20px; font-size: 0.82rem; font-weight: 800; display: inline-block;">{vol_txt}</span>'
            f'</div>'
            f'</div>'
        )
        st.markdown(saga_banner_html, unsafe_allow_html=True)

    if has_series:
        subtab1, subtab_saga, subtab2, subtab3 = st.tabs(["📋 Métadonnées", "📚 Saga & Tomes", "⭐ Évaluation & Avis", "📝 Notes & Sessions"])
    else:
        subtab1, subtab2, subtab3 = st.tabs(["📋 Métadonnées", "⭐ Évaluation & Avis", "📝 Notes & Sessions"])
        subtab_saga = None

    with subtab1:
        with st.form(f"edit_book_form_{book_id}"):
            col1, col2 = st.columns(2)
            with col1:
                title = st.text_input("Titre", value=book["title"])
                author = st.text_input("Auteur", value=book["author"])
                series_name = st.text_input("Série / Saga", value=book["series_name"] or "")
                series_volume = st.number_input(
                    "Tome",
                    min_value=0.0,
                    max_value=999.0,
                    step=0.5,
                    value=float(book["series_volume"]) if book.get("series_volume") is not None else 0.0
                )
                publisher = st.text_input("Éditeur", value=book["publisher"] or "")
                author_country = st.text_input("Pays de l'auteur", value=book["author_country"] or "France")

            with col2:
                page_count = st.number_input("Nombre de pages", min_value=1, value=int(book["page_count"] or 1))
                current_page = st.number_input("Page actuelle", min_value=0, max_value=int(page_count), value=int(book["current_page"] or 0))
                price = st.number_input("Prix (€)", min_value=0.0, step=0.1, value=round(float(book["price"] or 0.0), 2))

                format_list = ["Broché", "Poche", "Relié", "Numérique", "Audio"]
                cur_fmt = book.get("format", "Broché")
                fmt_idx = format_list.index(cur_fmt) if cur_fmt in format_list else 0
                b_format = st.selectbox("Format", format_list, index=fmt_idx)

            col3, col4 = st.columns(2)
            init_m_name, init_y_val = split_pal_month(book.get("pal_month"))

            with col3:
                month_choices = ["Aucun"] + FRENCH_MONTHS
                m_idx = month_choices.index(init_m_name) if init_m_name in month_choices else 0
                selected_pal_month = st.selectbox("Mois de la PAL :", month_choices, index=m_idx)

            with col4:
                curr_y = datetime.now().year
                year_choices = ["Aucune"] + [str(y) for y in range(curr_y - 2, curr_y + 6)]
                target_year = str(init_y_val or book.get("pal_year") or curr_y)
                y_idx = year_choices.index(target_year) if target_year in year_choices else 0
                selected_pal_year = st.selectbox("Année de la PAL :", year_choices, index=y_idx)

            genres_str = ", ".join(book.get("genres", []))
            tags_str = ", ".join(book.get("tags", []))
            genres = st.text_input("Genres", value=genres_str)
            tags = st.text_input("Tags & Tropes", value=tags_str)

            cur_subgs = book.get("fantasy_subgenres") or []
            if not cur_subgs and book.get("fantasy_subgenre"):
                cur_subgs = [s.strip() for s in book["fantasy_subgenre"].split(",") if s.strip()]
            default_subgs = [s for s in cur_subgs if s in FANTASY_SUBGENRES]
            selected_subgenres = st.multiselect(
                "✨ Sous-genres (Fantasy & Imaginaire)",
                options=FANTASY_SUBGENRES,
                default=default_subgs,
                help="Sélectionnez un ou plusieurs sous-genres précis (ex: Romantasy, Flintlock, LitRPG, Grimdark, Cozy Fantasy...)"
            )

            cover_url = st.text_input("URL Couverture", value=book.get("cover_url") or "")

            save_meta = st.form_submit_button("💾 Enregistrer les modifications", width="stretch", type="primary")

            if save_meta:
                g_list = [g.strip() for g in genres.split(",") if g.strip()]
                t_list = [t.strip() for t in tags.split(",") if t.strip()]

                pal_y = int(selected_pal_year) if selected_pal_year != "Aucune" else None
                pal_m = build_pal_month_string(selected_pal_month, pal_y)

                current_status = st.session_state.get(f"quick_status_{book_id}", book["status"])
                update_book(book_id, {
                    "title": title.strip(),
                    "author": author.strip(),
                    "series_name": series_name.strip() or None,
                    "series_volume": series_volume if series_volume > 0 else None,
                    "publisher": publisher.strip() or None,
                    "author_country": author_country.strip() or "France",
                    "page_count": page_count,
                    "current_page": current_page,
                    "price": round(price, 2) if price > 0 else None,
                    "status": current_status,
                    "format": b_format,
                    "pal_month": pal_m,
                    "pal_year": pal_y,
                    "genres": g_list,
                    "tags": t_list,
                    "fantasy_subgenres": selected_subgenres,
                    "fantasy_subgenre": selected_subgenres,
                    "cover_url": cover_url.strip() or None
                })
                st.success("Métadonnées mises à jour !")
                st.rerun()

    if subtab_saga is not None:
        with subtab_saga:
            st.markdown(f"#### 📚 Saga : **{book['series_name']}**")
            vol_curr = f"Tome {book.get('series_volume'):g}" if book.get("series_volume") is not None else "Tome non spécifié"
            st.caption(f"Auteur : **{book['author']}** — Vous consultez actuellement le **{vol_curr}**")

            # 1. Vos tomes dans l'application
            db_series_books = get_books_by_series(book["series_name"], book.get("author", ""))
            nb_finished = sum(1 for b in db_series_books if b["status"] == "Terminé")
            
            st.markdown("##### 📖 Vos tomes dans votre collection")
            st.caption(f"Vous possédez **{len(db_series_books)}** tome(s) de cette saga ({nb_finished} terminé(s)).")

            for sb in db_series_books:
                is_current = (sb["id"] == book["id"])
                sb_st_color = STATUS_COLORS.get(sb["status"], "#6366F1")
                border_style = "2px solid #A855F7" if is_current else "1px solid rgba(255, 255, 255, 0.1)"
                bg_style = "rgba(168, 85, 247, 0.14)" if is_current else "rgba(30, 41, 59, 0.6)"
                vol_label = f"Tome {sb.get('series_volume'):g}" if sb.get('series_volume') is not None else "Hors-série"
                current_badge = "<span style='background: #A855F7; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 700; margin-left: 6px;'>📍 Ce livre</span>" if is_current else ""
                rating_badge = f"<span style='color: #FBBF24; font-size: 0.78rem; font-weight: 600;'>⭐ {float(sb['rating_global']):.2f}/5</span>" if sb.get("rating_global") else ""

                cover_img = (
                    f'<img src="{sb["cover_url"]}" style="width: 48px; height: 72px; object-fit: cover; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">'
                    if sb.get("cover_url")
                    else '<div style="width: 48px; height: 72px; background: #334155; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 16px;">📖</div>'
                )

                sb_card_html = (
                    f'<div style="background: {bg_style}; border: {border_style}; border-radius: 8px; padding: 10px; margin-bottom: 8px; display: flex; align-items: center; gap: 12px;">'
                    f'{cover_img}'
                    f'<div style="flex: 1; min-width: 0;">'
                    f'<div style="display: flex; justify-content: space-between; align-items: center;">'
                    f'<div style="font-weight: 700; font-size: 0.88rem; color: #F8FAFC;">{vol_label} : {sb["title"]} {current_badge}</div>'
                    f'{rating_badge}'
                    f'</div>'
                    f'<div style="margin-top: 4px;">'
                    f'<span style="background: {sb_st_color}25; color: {sb_st_color}; border: 1px solid {sb_st_color}55; padding: 1px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 700;">{sb["status"]}</span>'
                    f'<span style="font-size: 0.75rem; color: #94A3B8; margin-left: 8px;">{sb.get("current_page", 0)} / {sb.get("page_count", 1)} pages</span>'
                    f'</div>'
                    f'</div>'
                    f'</div>'
                )
                st.markdown(sb_card_html, unsafe_allow_html=True)

            st.markdown("---")
            # 2. Tous les tomes de la saga (Découverte externe à la demande pour une ouverture instantanée)
            st.markdown("##### 🌐 Tous les tomes connus de la saga")

            load_ext = st.checkbox(
                "🔍 Rechercher tous les tomes sur Goodreads",
                value=False,
                key=f"chk_load_saga_ext_{book_id}",
                help="Interroge Goodreads pour découvrir les tomes parus ou annoncés de cette saga."
            )

            if not load_ext:
                st.caption("💡 Cochez la case ci-dessus pour explorer tous les tomes parus ou à paraître de cette saga.")
            else:
                with st.spinner("Recherche des tomes sur Goodreads..."):
                    all_known = fetch_series_volumes(book["series_name"], book.get("author", ""), book.get("title", ""))

                if not all_known:
                    st.info("Aucun tome externe supplémentaire trouvé pour cette saga.")
                else:
                    db_vols_map = {
                        round(float(b["series_volume"]), 1): b
                        for b in db_series_books
                        if b.get("series_volume") is not None
                    }

                    for kv in all_known:
                        kv_vol = kv.get("series_volume")
                        kv_vol_round = round(float(kv_vol), 1) if kv_vol is not None else None
                        in_db_book = db_vols_map.get(kv_vol_round) if kv_vol_round is not None else None

                        # Statut de parution
                        if kv["is_published"]:
                            pub_badge = "<span style='background: rgba(16, 185, 129, 0.18); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.4); padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700;'>🟢 Publié</span>"
                        else:
                            pub_badge = "<span style='background: rgba(245, 158, 11, 0.18); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.4); padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700;'>🟡 À paraître / Non publié</span>"

                        vol_display = f"Tome {kv_vol:g}" if kv_vol is not None else "Hors-série"
                        pages_info = f" • {kv['num_pages']} p." if kv.get("num_pages") else ""
                        rating_info = f" • ⭐ {kv['avg_rating']}/5" if kv.get("avg_rating") else ""

                        c_img, c_info, c_action = st.columns([1, 3, 2])
                        with c_img:
                            if kv.get("cover_url"):
                                st.image(kv["cover_url"], width=52)
                            else:
                                st.markdown('<div style="width: 52px; height: 75px; background: #334155; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 18px;">📖</div>', unsafe_allow_html=True)

                        with c_info:
                            st.markdown(f"**{vol_display} : {kv['title']}**")
                            st.markdown(f"{pub_badge} <span style='font-size: 0.75rem; color: #94A3B8;'>{pages_info}{rating_info}</span>", unsafe_allow_html=True)
                            if in_db_book:
                                in_st = in_db_book["status"]
                                c_color = STATUS_COLORS.get(in_st, "#6366F1")
                                st.markdown(f"<span style='color: {c_color}; font-size: 0.78rem; font-weight: 700;'>✅ Dans votre collection ({in_st})</span>", unsafe_allow_html=True)

                        with c_action:
                            if not in_db_book:
                                if kv["is_published"]:
                                    col_b1, col_b2 = st.columns(2)
                                    safe_key = f"{kv_vol}_{abs(hash(kv['title'])) % 10000}_{book_id}"
                                    with col_b1:
                                        if st.button("🎁 Wishlist", key=f"btn_w_{safe_key}", help="Ajouter à ma Wishlist"):
                                            add_book({
                                                "title": kv["title"],
                                                "series_name": book["series_name"],
                                                "series_volume": kv_vol,
                                                "author": kv.get("author") or book.get("author", "Inconnu"),
                                                "author_country": book.get("author_country", "France"),
                                                "publisher": book.get("publisher"),
                                                "format": book.get("format", "Broché"),
                                                "genres": book.get("genres", ["Fantasy"]),
                                                "tags": book.get("tags", []),
                                                "fantasy_subgenres": book.get("fantasy_subgenres", []),
                                                "fantasy_subgenre": book.get("fantasy_subgenres", []),
                                                "cover_url": kv.get("cover_url") or None,
                                                "status": "Wishlist",
                                                "current_page": 0,
                                                "page_count": kv.get("num_pages") or 300
                                            })
                                            st.toast(f"« {kv['title']} » ajouté à votre Wishlist ! 🎁")
                                            st.rerun()
                                    with col_b2:
                                        if st.button("🛒 Acheter", key=f"btn_b_{safe_key}", help="Marquer À acheter"):
                                            add_book({
                                                "title": kv["title"],
                                                "series_name": book["series_name"],
                                                "series_volume": kv_vol,
                                                "author": kv.get("author") or book.get("author", "Inconnu"),
                                                "author_country": book.get("author_country", "France"),
                                                "publisher": book.get("publisher"),
                                                "format": book.get("format", "Broché"),
                                                "genres": book.get("genres", ["Fantasy"]),
                                                "tags": book.get("tags", []),
                                                "fantasy_subgenres": book.get("fantasy_subgenres", []),
                                                "fantasy_subgenre": book.get("fantasy_subgenres", []),
                                                "cover_url": kv.get("cover_url") or None,
                                                "status": "À acheter",
                                                "current_page": 0,
                                                "page_count": kv.get("num_pages") or 300
                                            })
                                            st.toast(f"« {kv['title']} » marqué À acheter ! 🛒")
                                            st.rerun()
                                else:
                                    st.caption("🟡 Non disponible (à paraître)")
                            else:
                                st.caption("Possédé")
                        st.markdown("<hr style='margin: 6px 0; border: none; border-top: 1px dashed rgba(255,255,255,0.08);'>", unsafe_allow_html=True)

    with subtab2:
        with st.form(f"rating_form_{book_id}"):
            st.caption("💡 Laissez la **Note Globale à 0.0** si vous souhaitez laisser ce livre comme **Non noté**.")

            cur_global = float(book.get("rating_global") or 0.0)
            r_global = st.select_slider(
                "Note Globale (/5)",
                options=[round(x * 0.25, 2) for x in range(0, 21)],
                value=cur_global,
                help="0.0 signifie que le livre n'est pas encore évalué."
            )

            st.markdown("##### Critères détaillés (/5)")
            col_r1, col_r2 = st.columns(2)
            with col_r1:
                r_pacing = st.slider("Rythme", 0.0, 5.0, float(book.get("rating_pacing") or 0.0), step=0.25)
                r_chars = st.slider("Personnages", 0.0, 5.0, float(book.get("rating_chars") or 0.0), step=0.25)
                r_world = st.slider("Worldbuilding", 0.0, 5.0, float(book.get("rating_world") or 0.0), step=0.25)
            with col_r2:
                r_writing = st.slider("Plume", 0.0, 5.0, float(book.get("rating_writing") or 0.0), step=0.25)
                r_plot = st.slider("Intrigue", 0.0, 5.0, float(book.get("rating_plot") or 0.0), step=0.25)

            review = st.text_area("Avis final / Critique", value=book.get("final_review") or "")

            # Case à cocher pour ajouter le tome suivant à la Wishlist lors de la notation
            add_next_wishlist = False
            next_vol_candidate = None
            if book.get("series_name"):
                check_next = st.checkbox(
                    "🎁 Vérifier si le tome suivant existe pour l'ajouter à ma Wishlist",
                    value=False,
                    key=f"chk_check_next_{book_id}",
                    help="Recherche le tome suivant de la saga pour l'ajouter automatiquement à votre Wishlist."
                )
                if check_next:
                    cur_vol = float(book.get("series_volume") or 1.0)
                    with st.spinner("Recherche du tome suivant..."):
                        next_vol_candidate = find_next_series_volume(book["series_name"], book.get("author", ""), cur_vol, book.get("title", ""))
                    if next_vol_candidate:
                        if next_vol_candidate.get("is_published"):
                            existing_sb = get_books_by_series(book["series_name"], book.get("author", ""))
                            has_next_in_db = any(eb.get("series_volume") is not None and abs(float(eb["series_volume"]) - float(next_vol_candidate["series_volume"])) < 0.05 for eb in existing_sb)
                            if not has_next_in_db:
                                add_next_wishlist = True
                                st.success(f"Tome {next_vol_candidate['series_volume']:g} trouvé : **« {next_vol_candidate['title']} »** (sera ajouté lors de l'enregistrement)")
                            else:
                                st.info(f"Le Tome {next_vol_candidate['series_volume']:g} : « {next_vol_candidate['title']} » est déjà dans votre collection.")
                        else:
                            st.caption(f"🟡 **Tome {next_vol_candidate['series_volume']:g} ({next_vol_candidate['title']})** : À paraître / non encore publié (non disponible).")
                    else:
                        st.caption("🏁 **Dernier tome répertorié :** Aucun tome suivant n'est connu ou annoncé pour cette saga.")

            save_ratings = st.form_submit_button("⭐ Enregistrer l'évaluation", width="stretch", type="primary")
            if save_ratings:
                if r_global == 0.0:
                    update_book(book_id, {
                        "rating_global": None,
                        "rating_pacing": None,
                        "rating_chars": None,
                        "rating_world": None,
                        "rating_writing": None,
                        "rating_plot": None,
                        "final_review": review.strip() or None
                    })
                    st.info("Livre enregistré comme Non noté.")
                else:
                    update_book(book_id, {
                        "rating_global": r_global,
                        "rating_pacing": r_pacing if r_pacing > 0 else None,
                        "rating_chars": r_chars if r_chars > 0 else None,
                        "rating_world": r_world if r_world > 0 else None,
                        "rating_writing": r_writing if r_writing > 0 else None,
                        "rating_plot": r_plot if r_plot > 0 else None,
                        "final_review": review.strip() or None
                    })
                    st.success(f"Évaluation enregistrée : {r_global:.2f}/5 !")

                if book.get("series_name") and add_next_wishlist and next_vol_candidate is not None:
                    new_wid = add_series_next_volume_to_wishlist(book_id, target_status="Wishlist")
                    if new_wid:
                        st.toast(f"Tome {next_vol_candidate['series_volume']:g} ajouté à votre Wishlist ! 🎁")

                st.rerun()

    with subtab3:
        st.markdown("##### ➕ Ajouter une note ou citation")
        with st.form(f"add_note_form_{book_id}", clear_on_submit=True):
            cn1, cn2 = st.columns([1, 1])
            with cn1:
                ntype = st.selectbox("Type", ["Citation", "Commentaire", "Théorie", "Personnage"], key=f"ntype_{book_id}")
            with cn2:
                npage = st.number_input("Page", min_value=0, max_value=int(book["page_count"]), value=int(book["current_page"]), key=f"npage_{book_id}")

            ncontent = st.text_area("Contenu", placeholder="Votre texte...", key=f"ncontent_{book_id}")
            if st.form_submit_button("Enregistrer la note"):
                if ncontent.strip():
                    add_book_note({
                        "book_id": book_id,
                        "page_number": int(npage) if npage > 0 else None,
                        "note_type": ntype,
                        "content": ncontent.strip()
                    })
                    st.success("Note ajoutée !")
                    st.rerun()

        notes = get_book_notes(book_id)
        st.markdown(f"##### 📜 Citations et réflexions ({len(notes)})")
        if notes:
            for n in notes:
                col_n_text, col_n_del = st.columns([5, 1])
                with col_n_text:
                    p_info = f"Page {n['page_number']}" if n.get('page_number') else ""
                    note_html = (
                        f'<div style="background: rgba(15, 23, 42, 0.5); padding: 8px 12px; border-radius: 6px; margin-bottom: 6px; border-left: 3px solid #818CF8;">'
                        f'<div style="font-size: 0.75rem; color: #A5B4FC;"><b>{n["note_type"]}</b> {f"— {p_info}" if p_info else ""}</div>'
                        f'<div style="font-size: 0.85rem; color: #F8FAFC; margin-top: 3px;">{n["content"]}</div>'
                        f'</div>'
                    )
                    st.markdown(note_html, unsafe_allow_html=True)
                with col_n_del:
                    if st.button("🗑️", key=f"del_n_{n['id']}", help="Supprimer cette note"):
                        delete_book_note(n["id"])
                        st.rerun()
        else:
            st.caption("Aucune note enregistrée.")

        st.markdown("---")
        sessions = get_reading_sessions(book_id=book_id)
        st.markdown(f"##### ⏱️ Historique des sessions ({len(sessions)})")
        if sessions:
            for s in sessions:
                cs_info, cs_del = st.columns([5, 1])
                with cs_info:
                    s_date_str = s["start_time"].strftime("%d/%m/%Y") if isinstance(s["start_time"], (datetime, date)) else str(s["start_time"])
                    dur_val = round(float(s['duration_minutes']), 2)
                    speed_val = round(float(s['pages_per_hour']), 2)
                    session_html = (
                        f'<div style="font-size: 0.85rem; color: #CBD5E1; padding: 4px 0;">'
                        f'🗓️ <b>{s_date_str}</b> : {dur_val:.2f} min | +{s["pages_read"]} pages (p. {s["start_page"]} → {s["end_page"]}) | ⚡ {speed_val:.2f} p/h'
                        f'</div>'
                    )
                    st.markdown(session_html, unsafe_allow_html=True)
                with cs_del:
                    if st.button("❌", key=f"del_s_{s['id']}", help="Supprimer cette session"):
                        delete_reading_session(s["id"])
                        st.rerun()

    st.markdown("---")
    with st.expander("⚠️ Zone danger"):
        st.caption("La suppression est irréversible et supprime l'ensemble des sessions et notes associées.")
        if st.button("🗑️ Supprimer définitivement ce livre", type="secondary", width="stretch"):
            delete_book(book_id)
            st.session_state.active_dialog_book_id = None
            st.success("Livre supprimé de votre bibliothèque.")
            st.rerun()


def render_tab_library():
    if "active_dialog_book_id" not in st.session_state:
        st.session_state.active_dialog_book_id = None

    if st.session_state.active_dialog_book_id is not None:
        dialog_book_detail(st.session_state.active_dialog_book_id)

    st.markdown("### 📚 Votre Bibliothèque & PAL")

    search_query = st.text_input("🔍 Rechercher un titre, auteur, saga, genre ou sous-genre...", placeholder="Ex: Kvothe, Sanderson, Grimdark, Romantasy...", label_visibility="collapsed")

    f_col1, f_col2, f_col3, f_col4 = st.columns(4)
    
    with f_col1:
        status_filter = st.selectbox(
            "Statut",
            ["Tous", "En cours", "Bibliothèque", "Wishlist", "À acheter", "Terminé", "DNF"]
        )

    with f_col2:
        curr_date = date.today()
        curr_m_french = format_month_year_french(curr_date)
        curr_m_code = curr_date.strftime("%Y-%m")
        curr_y = curr_date.year
        pal_filter = st.selectbox(
            "Périmètre PAL",
            ["Toutes", f"PAL du mois ({curr_m_french})", f"PAL de l'année ({curr_y})", "Hors PAL"]
        )

    with f_col3:
        subg_options = ["Tous"] + [s for s in FANTASY_SUBGENRES if s != "Aucun"]
        subgenre_filter = st.selectbox(
            "Sous-genre Fantasy",
            subg_options,
            help="Filtrer par sous-genre spécifique de Fantasy"
        )

    with f_col4:
        view_mode = st.selectbox(
            "Vue spéciale",
            ["Grille catalogue", "🛒 Suites de séries à acheter"]
        )

    if view_mode == "🛒 Suites de séries à acheter":
        st.info("💡 Cette vue identifie les tomes suivants de vos sagas dont le tome précédent est terminé !", icon="✨")
        books_to_display = get_series_to_buy()
    else:
        filter_status = None if status_filter == "Tous" else status_filter
        filter_month = curr_m_code if pal_filter.startswith("PAL du mois") else None
        filter_year = curr_y if pal_filter.startswith("PAL de l'année") else None
        filter_subg = None if subgenre_filter == "Tous" else subgenre_filter

        books_to_display = get_all_books(
            status=filter_status,
            pal_month=filter_month,
            pal_year=filter_year,
            search=search_query.strip() or None,
            fantasy_subgenre=filter_subg
        )

        if pal_filter == "Hors PAL":
            books_to_display = [b for b in books_to_display if not b.get("pal_month") and not b.get("pal_year")]

    st.markdown(f"**{len(books_to_display)}** livre(s) trouvé(s)")

    if not books_to_display:
        empty_html = (
            '<div style="text-align: center; padding: 40px 20px; color: #94A3B8;">'
            '<div style="font-size: 3rem;">📚</div>'
            '<div style="font-size: 1.1rem; font-weight: 600;">Aucun livre ne correspond à vos filtres</div>'
            '<div style="font-size: 0.85rem; margin-top: 4px;">Modifiez les filtres ci-dessus ou ajoutez un nouveau livre.</div>'
            '</div>'
        )
        st.markdown(empty_html, unsafe_allow_html=True)
        return

    for i in range(0, len(books_to_display), 2):
        row_books = books_to_display[i:i+2]
        cols = st.columns(2)
        for idx, b in enumerate(row_books):
            with cols[idx]:
                st_color = STATUS_COLORS.get(b["status"], "#64748B")
                curr_p = b.get("current_page", 0) or 0
                tot_p = max(b.get("page_count", 1) or 1, 1)
                pct = round(min(curr_p / tot_p, 1.0) * 100, 2)

                cover_html = (
                    f'<img src="{b["cover_url"]}" style="width: 70px; height: 105px; object-fit: cover; border-radius: 6px; box-shadow: 0 4px 8px rgba(0,0,0,0.4);">'
                    if b.get("cover_url")
                    else '<div style="width: 70px; height: 105px; background: #334155; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 20px;">📖</div>'
                )

                rating_str = ""
                if b.get("rating_global") is not None and float(b["rating_global"]) > 0:
                    rating_str = f"⭐ {float(b['rating_global']):.2f}/5"
                elif b.get("popularity_score") is not None:
                    rating_str = f"👥 {float(b['popularity_score']):.2f}/5"

                series_str = f"{b['series_name']} (T.{b['series_volume']})" if b.get("series_name") else ""
                pal_badge = format_month_year_french(yyyy_mm=b["pal_month"]) if b.get("pal_month") else ""

                series_div = f'<div style="font-size: 0.75rem; color: #818CF8; margin-top: 2px;">{series_str}</div>' if series_str else ""
                subg_list_card = b.get("fantasy_subgenres") or ([b["fantasy_subgenre"]] if b.get("fantasy_subgenre") else [])
                subg_str = " • ".join(subg_list_card) if subg_list_card else ""
                subg_div = f'<div style="font-size: 0.72rem; color: #E879F9; margin-top: 2px;">✨ {subg_str}</div>' if subg_str else ""
                pal_div = f'<div style="font-size: 0.72rem; color: #38BDF8; margin-top: 2px;">🎯 {pal_badge}</div>' if pal_badge else ""
                prog_div = f'<div style="margin-top: 6px; font-size: 0.72rem; color: #94A3B8;">{curr_p}/{tot_p} p. ({pct:.1f}%)</div>' if b["status"] in ("En cours", "Terminé", "DNF") else ""

                card_html = (
                    f'<div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 12px; margin-bottom: 10px; display: flex; gap: 12px; align-items: center;">'
                    f'{cover_html}'
                    f'<div style="flex: 1; min-width: 0;">'
                    f'<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">'
                    f'<span style="background: {st_color}22; color: {st_color}; border: 1px solid {st_color}55; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700;">{b["status"]}</span>'
                    f'<span style="font-size: 0.75rem; color: #FBBF24; font-weight: 600;">{rating_str}</span>'
                    f'</div>'
                    f'<div style="font-weight: 700; font-size: 0.95rem; color: #F8FAFC; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{b["title"]}</div>'
                    f'<div style="font-size: 0.8rem; color: #94A3B8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{b["author"]}</div>'
                    f'{series_div}'
                    f'{subg_div}'
                    f'{pal_div}'
                    f'{prog_div}'
                    f'</div>'
                    f'</div>'
                )

                st.markdown(card_html, unsafe_allow_html=True)

                if st.button("Détails / Éditer", key=f"btn_book_{b['id']}", width="stretch"):
                    st.session_state.active_dialog_book_id = b["id"]
                    st.rerun()
