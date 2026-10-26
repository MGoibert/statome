"""
Vue : Onglet 2 - Ajouter un livre (views/tab_add_book.py)
Prend en charge le scan vidéo continu (code-barres + OCR ISBN en direct),
la recherche par ISBN/Titre, le pré-remplissage automatique instantané de tous
les champs du formulaire et la classification dans la PAL avec mois et années en clair.
"""

import streamlit as st
from datetime import datetime
from core.metadata_fetcher import enrich_book_metadata, FANTASY_SUBGENRES
from core.database import add_book
from core.scanner_component import render_live_video_scanner
from core.date_utils import (
    FRENCH_MONTHS, build_pal_month_string, split_pal_month
)


def _apply_new_metadata(meta_res: dict, code_label: str):
    """Met à jour les métadonnées en session et incrémente la version du formulaire pour forcer le pré-remplissage immédiat."""
    st.session_state.scanned_metadata = meta_res
    st.session_state.last_scanned_code = code_label
    st.session_state.form_fill_version = st.session_state.get("form_fill_version", 0) + 1


def render_tab_add_book():
    st.markdown("### ➕ Ajouter un livre à votre collection")
    st.caption("Scannez le code-barres en direct via la caméra vidéo ou saisissez un titre / ISBN.")

    # État pour conserver les métadonnées pré-remplies et forcer le rafraîchissement des champs du formulaire
    if "scanned_metadata" not in st.session_state:
        st.session_state.scanned_metadata = None
    if "last_scanned_code" not in st.session_state:
        st.session_state.last_scanned_code = None
    if "form_fill_version" not in st.session_state:
        st.session_state.form_fill_version = 0

    # Sélection du mode d'acquisition (Recherche par défaut pour ne pas allumer la caméra)
    input_mode = st.radio(
        "Mode d'acquisition :",
        ["🔍 Recherche ISBN / Titre", "📷 Scanner le code-barres (Vidéo)"],
        horizontal=True,
        key="add_mode_radio"
    )

    if input_mode.startswith("📷 Scanner"):
        camera_active = st.toggle(
            "📸 Allumer la caméra pour scanner",
            value=st.session_state.get("camera_scan_active", False),
            key="camera_scan_active",
            help="Allume la caméra uniquement lorsque vous souhaitez scanner un code-barres."
        )

        if camera_active:
            st.markdown(
                '<div style="background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 0.85rem; color: #CBD5E1;">'
                '📹 <b>Scan Vidéo & OCR ISBN en cours :</b> Pointez la caméra vers le code-barres arrière du livre.<br>'
                'La détection et le remplissage de tous les champs s\'effectuent <b>automatiquement en direct</b> !'
                '</div>',
                unsafe_allow_html=True
            )

            scanned_code = render_live_video_scanner(key="live_barcode_video_scanner")

            if scanned_code and scanned_code != st.session_state.get("last_scanned_code"):
                with st.spinner(f"ISBN {scanned_code} détecté ! Récupération automatique des informations du livre..."):
                    meta_res = enrich_book_metadata(scanned_code)
                    _apply_new_metadata(meta_res, scanned_code)
                # Éteindre automatiquement la caméra une fois le code scanné
                st.session_state.camera_scan_active = False
                st.toast(f"Livre « {meta_res.get('title', scanned_code)} » pré-rempli automatiquement ! 🎉")
                st.rerun()
        else:
            st.info("📷 **La caméra est éteinte.** Activez l'interrupteur ci-dessus uniquement lorsque vous souhaitez scanner un livre.")

        if st.session_state.get("last_scanned_code"):
            col_sc1, col_sc2 = st.columns([3, 1])
            with col_sc1:
                loaded_title = (st.session_state.scanned_metadata or {}).get("title", "")
                st.success(f"✅ Dernier ISBN détecté : **{st.session_state.last_scanned_code}** — *{loaded_title}*")
            with col_sc2:
                if st.button("🔄 Nouveau scan", width="stretch"):
                    st.session_state.last_scanned_code = None
                    st.session_state.scanned_metadata = None
                    st.session_state.camera_scan_active = True
                    st.session_state.form_fill_version += 1
                    st.rerun()

    else:
        # Recherche manuelle
        col_search, col_btn = st.columns([3, 1])
        with col_search:
            search_input = st.text_input(
                "Saisir un ISBN (ex: 9782080470973) ou un Titre + Auteur",
                placeholder="Ex: Rewitched Lucy Jane Wood ou 9782080470973",
                key="manual_search_input"
            )
        with col_btn:
            st.markdown("<div style='height: 28px;'></div>", unsafe_allow_html=True)
            search_btn = st.button("Chercher", width="stretch", type="primary")

        if search_btn and search_input.strip():
            q_str = search_input.strip()
            with st.spinner("Recherche et enrichissement automatique des métadonnées..."):
                meta_res = enrich_book_metadata(q_str)
                _apply_new_metadata(meta_res, q_str)
            st.toast(f"Fiche « {meta_res.get('title', q_str)} » complétée ! ✨")

    # Formulaire de validation pré-rempli
    meta = st.session_state.scanned_metadata or {}
    fv = st.session_state.form_fill_version

    st.markdown("---")
    st.subheader("📝 Fiche du livre")

    # Aperçu de la couverture si existante
    cover_url_val = meta.get("cover_url", "")
    if cover_url_val:
        col_prev_img, col_prev_info = st.columns([1, 3])
        with col_prev_img:
            st.image(cover_url_val, width=110)
        with col_prev_info:
            st.markdown(f"**{meta.get('title', 'Titre à compléter')}**")
            st.markdown(f"_{meta.get('author', 'Auteur')} — {meta.get('publisher', 'Éditeur')}_")
            if meta.get("series_name"):
                vol_str = f" (Tome {meta.get('series_volume')})" if meta.get("series_volume") else ""
                st.caption(f"📚 Saga : **{meta.get('series_name')}**{vol_str}")
            raw_prev_subg = meta.get("fantasy_subgenres") or meta.get("fantasy_subgenre") or []
            if isinstance(raw_prev_subg, str):
                raw_prev_subg = [s.strip() for s in raw_prev_subg.split(",") if s.strip()]
            if raw_prev_subg:
                st.markdown(f"✨ Sous-genres : **{' • '.join(raw_prev_subg)}**")
            if meta.get("popularity_score"):
                st.markdown(f"⭐ Note communauté : **{float(meta.get('popularity_score')):.2f} / 5**")

    with st.form("book_form", clear_on_submit=False):
        col1, col2 = st.columns(2)
        with col1:
            title = st.text_input("Titre du livre *", value=meta.get("title", ""), key=f"bf_title_{fv}")
            author = st.text_input("Auteur *", value=meta.get("author", ""), key=f"bf_author_{fv}")
            series_name = st.text_input("Série / Saga", value=meta.get("series_name", ""), key=f"bf_series_{fv}")

            vol_val = meta.get("series_volume")
            series_volume = st.number_input(
                "Numéro de tome",
                min_value=0.0,
                max_value=999.0,
                step=0.5,
                value=float(vol_val) if vol_val is not None else 0.0,
                help="Laisser 0 si roman indépendant",
                key=f"bf_vol_{fv}"
            )

            publisher = st.text_input("Éditeur", value=meta.get("publisher", ""), key=f"bf_pub_{fv}")
            author_country = st.text_input(
                "Pays / Nationalité de l'auteur",
                value=meta.get("author_country", "France"),
                key=f"bf_country_{fv}"
            )

        with col2:
            isbn_val = st.text_input("ISBN-13", value=meta.get("isbn", ""), key=f"bf_isbn_{fv}")
            page_count = st.number_input(
                "Nombre de pages *",
                min_value=1,
                max_value=9999,
                value=int(meta.get("page_count") or 300),
                key=f"bf_pages_{fv}"
            )
            chapter_count = st.number_input(
                "Nombre de chapitres",
                min_value=0,
                max_value=999,
                value=int(meta.get("chapter_count") or 0),
                key=f"bf_chaps_{fv}"
            )
            price = st.number_input(
                "Prix (€)",
                min_value=0.0,
                max_value=500.0,
                step=0.1,
                value=round(float(meta.get("price") or 0.0), 2),
                key=f"bf_price_{fv}"
            )

            format_options = ["Broché", "Poche", "Relié", "Numérique", "Audio"]
            current_fmt = meta.get("format", "Broché")
            fmt_idx = format_options.index(current_fmt) if current_fmt in format_options else 0
            book_format = st.selectbox("Format", format_options, index=fmt_idx, key=f"bf_fmt_{fv}")

            pub_year = st.number_input(
                "Année de publication",
                min_value=1800,
                max_value=2100,
                value=int(meta.get("publication_year") or datetime.now().year),
                key=f"bf_year_{fv}"
            )

        col3, col4 = st.columns(2)
        with col3:
            existing_genres = ", ".join(meta.get("genres", [])) if isinstance(meta.get("genres"), list) else str(meta.get("genres") or "")
            genres_input = st.text_input(
                "Genres (séparés par virgules)",
                value=existing_genres or "Fantasy",
                key=f"bf_genres_{fv}"
            )

            existing_tags = ", ".join(meta.get("tags", [])) if isinstance(meta.get("tags"), list) else str(meta.get("tags") or "")
            tags_input = st.text_input(
                "Tags & Tropes (séparés par virgules)",
                value=existing_tags,
                placeholder="ex: Magie, Politique, Académie",
                key=f"bf_tags_{fv}"
            )

            # Sélecteur multiple de sous-genres Fantasy / Imaginaire
            raw_subg = meta.get("fantasy_subgenres") or meta.get("fantasy_subgenre") or []
            if isinstance(raw_subg, str):
                raw_subg = [s.strip() for s in raw_subg.split(",") if s.strip()]
            default_subgs = [s for s in raw_subg if s in FANTASY_SUBGENRES]

            selected_subgenres = st.multiselect(
                "✨ Sous-genres (Fantasy & Imaginaire)",
                options=FANTASY_SUBGENRES,
                default=default_subgs,
                help="Sélectionnez un ou plusieurs sous-genres de Fantasy (ex: Romantasy, Flintlock, LitRPG, Grimdark, Cozy Fantasy...)",
                key=f"bf_subg_{fv}"
            )

        with col4:
            popularity = st.number_input(
                "Note communauté (/5)",
                min_value=0.0,
                max_value=5.0,
                step=0.05,
                value=round(float(meta.get("popularity_score") or 0.0), 2),
                key=f"bf_pop_{fv}"
            )
            cover_url = st.text_input("URL Couverture (HD)", value=meta.get("cover_url", ""), key=f"bf_cover_{fv}")

        st.markdown("#### 🎯 Classification initiale & PAL")
        c_status, c_pal_m, c_pal_y = st.columns(3)
        with c_status:
            status_options = ["Bibliothèque", "En cours", "Wishlist", "À acheter", "Terminé", "DNF"]
            init_status = meta.get("status", "Bibliothèque")
            st_idx = status_options.index(init_status) if init_status in status_options else 0
            status = st.selectbox("Statut initial", status_options, index=st_idx, key=f"bf_status_{fv}")

        # Pré-remplissage du mois et année en clair si déjà présents
        initial_m_name, initial_y_val = split_pal_month(meta.get("pal_month"))

        with c_pal_m:
            month_choices = ["Aucun"] + FRENCH_MONTHS
            m_idx = month_choices.index(initial_m_name) if initial_m_name in month_choices else 0
            selected_pal_month = st.selectbox(
                "Mois de la PAL :",
                options=month_choices,
                index=m_idx,
                help="Sélectionnez le mois en clair pour votre Pile À Lire",
                key=f"bf_pal_m_{fv}"
            )

        with c_pal_y:
            curr_y = datetime.now().year
            year_choices = ["Aucune"] + [str(y) for y in range(curr_y - 2, curr_y + 6)]
            target_year = str(initial_y_val or meta.get("pal_year") or curr_y)
            y_idx = year_choices.index(target_year) if target_year in year_choices else 0
            selected_pal_year = st.selectbox(
                "Année de la PAL :",
                options=year_choices,
                index=y_idx,
                help="Sélectionnez l'année pour votre PAL",
                key=f"bf_pal_y_{fv}"
            )

        submit_btn = st.form_submit_button("💾 Enregistrer dans ma bibliothèque", width="stretch", type="primary")

        if submit_btn:
            if not title.strip() or not author.strip():
                st.error("Le titre et l'auteur sont obligatoires !")
            else:
                genres_list = [g.strip() for g in genres_input.split(",") if g.strip()]
                tags_list = [t.strip() for t in tags_input.split(",") if t.strip()]

                pal_y = int(selected_pal_year) if selected_pal_year != "Aucune" else None
                pal_m = build_pal_month_string(selected_pal_month, pal_y)

                book_payload = {
                    "isbn": isbn_val.strip() or None,
                    "title": title.strip(),
                    "series_name": series_name.strip() or None,
                    "series_volume": series_volume if series_volume > 0 else None,
                    "author": author.strip(),
                    "author_country": author_country.strip() or "France",
                    "publisher": publisher.strip() or None,
                    "publication_year": pub_year if pub_year > 0 else None,
                    "page_count": page_count,
                    "chapter_count": chapter_count if chapter_count > 0 else None,
                    "price": round(price, 2) if price > 0 else None,
                    "format": book_format,
                    "genres": genres_list,
                    "tags": tags_list,
                    "fantasy_subgenres": selected_subgenres,
                    "fantasy_subgenre": selected_subgenres,
                    "popularity_score": round(popularity, 2) if popularity > 0 else None,
                    "cover_url": cover_url.strip() or None,
                    "status": status,
                    "pal_month": pal_m,
                    "pal_year": pal_y,
                    "current_page": 0,
                    "started_at": datetime.now().date() if status == "En cours" else None
                }

                new_id = add_book(book_payload)
                st.success(f"✅ Livre « **{title}** » enregistré avec succès ! (ID: #{new_id})")
                st.session_state.scanned_metadata = None
                st.session_state.last_scanned_code = None
                st.session_state.form_fill_version += 1
                st.balloons()
