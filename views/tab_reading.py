"""
Vue : Onglet 1 - Lecture en cours, Chronomètre & Notes rapides (views/tab_reading.py)
Interface tactile mobile : suivi visuel du livre actif (sans bug de balises HTML brutes),
chronomètre dynamique en temps réel côté client, prise de notes instantanée
et clôture de lecture avec notation multi-critères personnalisée.
"""

import time
from datetime import datetime, date
from typing import Optional
import streamlit as st
from core.metadata_fetcher import find_next_series_volume, infer_book_series

from core.database import (
    get_all_books, get_book, update_book, add_reading_session,
    add_book_note, get_reading_sessions, get_book_notes,
    get_books_by_series, add_series_next_volume_to_wishlist
)


def _on_close_reading_dialog():
    st.session_state.active_reading_dialog = None


@st.dialog("🌟 Clôture du Livre", on_dismiss=_on_close_reading_dialog)
def dialog_finish_book(book: dict):
    st.markdown(f"### Félicitations pour avoir terminé **{book['title']}** ! 🎉")
    st.caption("💡 Laissez la **Note Globale à 0.0** pour clôturer sans attribuer de note (il restera 'Non noté').")

    with st.form("finish_book_form"):
        finished_date = st.date_input("Date de fin de lecture", value=date.today())

        st.markdown("#### 🎯 Évaluation globale & critères (/5)")
        cur_global = float(book.get("rating_global") or 0.0)
        rating_global = st.select_slider(
            "Note Globale (/5)",
            options=[round(x * 0.25, 2) for x in range(0, 21)],
            value=cur_global,
            help="0.0 signifie que le livre n'est pas évalué."
        )

        col1, col2 = st.columns(2)
        with col1:
            rating_pacing = st.slider("Rythme", 0.0, 5.0, float(book.get("rating_pacing") or 0.0), step=0.25)
            rating_chars = st.slider("Personnages", 0.0, 5.0, float(book.get("rating_chars") or 0.0), step=0.25)
            rating_world = st.slider("Worldbuilding", 0.0, 5.0, float(book.get("rating_world") or 0.0), step=0.25)
        with col2:
            rating_writing = st.slider("Plume / Style", 0.0, 5.0, float(book.get("rating_writing") or 0.0), step=0.25)
            rating_plot = st.slider("Intrigue", 0.0, 5.0, float(book.get("rating_plot") or 0.0), step=0.25)

        review_input = st.text_area("Votre avis & critique", value=book.get("final_review") or "", placeholder="Ce que vous avez pensé de cette œuvre...")
        final_review = review_input.strip() or None

        # Case à cocher pour ajouter le tome suivant de la saga à la Wishlist
        add_next_wishlist = False
        next_vol_candidate = None
        if book.get("series_name"):
            check_next = st.checkbox(
                "🎁 Vérifier si le tome suivant existe pour l'ajouter à ma Wishlist",
                value=False,
                key=f"finish_chk_next_{book['id']}",
                help="Recherche le tome suivant de la saga pour l'ajouter automatiquement à votre Wishlist."
            )
            if check_next:
                cur_vol = float(book.get("series_volume") or 1.0)
                with st.spinner("Recherche du tome suivant..."):
                    next_vol_candidate = find_next_series_volume(book["series_name"], book.get("author", ""), cur_vol, book.get("title", ""))
                if next_vol_candidate:
                    if next_vol_candidate.get("is_published"):
                        existing_series_books = get_books_by_series(book["series_name"], book.get("author", ""))
                        has_next = any(eb.get("series_volume") is not None and abs(float(eb["series_volume"]) - float(next_vol_candidate["series_volume"])) < 0.05 for eb in existing_series_books)
                        if not has_next:
                            add_next_wishlist = True
                            st.success(f"Tome {next_vol_candidate['series_volume']:g} trouvé : **« {next_vol_candidate['title']} »** (sera ajouté à votre Wishlist)")
                        else:
                            st.info(f"Le Tome {next_vol_candidate['series_volume']:g} : « {next_vol_candidate['title']} » est déjà dans votre collection.")
                    else:
                        st.caption(f"🟡 **Tome {next_vol_candidate['series_volume']:g} ({next_vol_candidate['title']})** : À paraître / non encore publié (non disponible).")
                else:
                    st.caption("🏁 **Dernier tome répertorié :** Aucun tome suivant n'existe pour cette saga.")
                st.markdown("---")
                st.caption("🏁 **Dernier tome répertorié :** Aucun tome suivant n'existe pour cette saga.")

        submitted = st.form_submit_button("✅ Clôturer la lecture", width="stretch", type="primary")
        if submitted:
            payload = {
                "status": "Terminé",
                "current_page": book["page_count"],
                "finished_at": finished_date,
                "final_review": final_review
            }
            if rating_global > 0.0:
                payload.update({
                    "rating_global": rating_global,
                    "rating_pacing": rating_pacing if rating_pacing > 0.0 else None,
                    "rating_chars": rating_chars if rating_chars > 0.0 else None,
                    "rating_world": rating_world if rating_world > 0.0 else None,
                    "rating_writing": rating_writing if rating_writing > 0.0 else None,
                    "rating_plot": rating_plot if rating_plot > 0.0 else None,
                })
            else:
                payload.update({
                    "rating_global": None,
                    "rating_pacing": None,
                    "rating_chars": None,
                    "rating_world": None,
                    "rating_writing": None,
                    "rating_plot": None,
                })

            update_book(book["id"], payload)
            if add_next_wishlist and next_vol_candidate is not None:
                new_id = add_series_next_volume_to_wishlist(book["id"], target_status="Wishlist")
                if new_id:
                    st.toast(f"Tome {next_vol_candidate['series_volume']:g} ajouté à votre Wishlist ! 🎁")
            st.session_state.active_reading_dialog = None
            st.success("Lecture clôturée avec succès !")
            st.rerun()


@st.dialog("🛑 Abandonner le livre (DNF)", on_dismiss=_on_close_reading_dialog)
def dialog_dnf_book(book: dict):
    st.markdown(f"### Marquer **{book['title']}** comme DNF (Did Not Finish)")
    with st.form("dnf_form"):
        stop_page = st.number_input("Page d'abandon", min_value=0, max_value=book["page_count"], value=book["current_page"])
        dnf_date = st.date_input("Date d'abandon", value=date.today())
        rate_dnf = st.checkbox("Attribuer une note indicative", value=False)
        rating = None
        if rate_dnf:
            rating = st.slider("Note globale indicative (/5)", 0.0, 5.0, 2.0, step=0.25)
        reason = st.text_area("Raison de l'abandon / Critique", placeholder="Pourquoi n'avez-vous pas accroché ?")
        
        submitted = st.form_submit_button("Confirmer l'abandon", width="stretch", type="primary")
        if submitted:
            payload = {
                "status": "DNF",
                "current_page": stop_page,
                "finished_at": dnf_date,
                "final_review": f"[DNF à la page {stop_page}] : {reason.strip()}" if reason.strip() else f"[DNF à la page {stop_page}]"
            }
            if rate_dnf and rating is not None:
                payload["rating_global"] = rating

            update_book(book["id"], payload)
            st.session_state.active_reading_dialog = None
            st.warning("Livre classé en DNF.")
            st.rerun()


@st.dialog("⏱️ Enregistrer une session de lecture manuelle", on_dismiss=_on_close_reading_dialog)
def dialog_manual_session(book: dict):
    st.markdown(f"### Ajouter une session sur **{book['title']}**")
    with st.form("manual_session_form"):
        s_date = st.date_input("Date de la session", value=date.today())
        col_t1, col_t2 = st.columns(2)
        with col_t1:
            start_p = st.number_input("Page de départ", min_value=0, max_value=book["page_count"], value=book["current_page"])
        with col_t2:
            end_p = st.number_input("Nouvelle page atteinte", min_value=start_p, max_value=book["page_count"], value=min(start_p + 30, book["page_count"]))

        duration = st.number_input("Durée de lecture (en minutes)", min_value=1, max_value=1440, value=45)
        submitted = st.form_submit_button("💾 Enregistrer la session", width="stretch", type="primary")

        if submitted:
            start_dt = datetime.combine(s_date, datetime.min.time())
            end_dt = datetime.combine(s_date, datetime.min.time())
            add_reading_session({
                "book_id": book["id"],
                "start_time": start_dt,
                "end_time": end_dt,
                "duration_minutes": float(duration),
                "start_page": int(start_p),
                "end_page": int(end_p)
            })
            st.session_state.active_reading_dialog = None
            st.success("Session manuelle ajoutée !")
            st.rerun()


def render_live_timer(is_running: bool, accumulated_sec: float, start_timestamp: Optional[float]):
    """Composant chronomètre dynamique en temps réel côté client (JS)."""
    start_ms = int(start_timestamp * 1000) if (is_running and start_timestamp) else 0
    accum_sec = int(accumulated_sec)
    color = '#34D399' if is_running else ('#F59E0B' if accum_sec > 0 else '#94A3B8')
    sub_text = '🟢 Chrono en direct (lecture active)' if is_running else ('🟡 Chronomètre en pause' if accum_sec > 0 else '⚪ En attente de démarrage')

    html_code = f"""
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8">
    <style>
      body {{
        margin: 0;
        padding: 0;
        background: transparent;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      }}
      #timer-box {{
        font-size: 2.8rem;
        font-weight: 800;
        letter-spacing: 2px;
        color: {color};
        margin: 2px 0;
      }}
      #timer-sub {{
        font-size: 0.85rem;
        color: #94A3B8;
      }}
    </style>
    </head>
    <body>
      <div id="timer-box">00:00</div>
      <div id="timer-sub">{sub_text}</div>
      <script>
        const isRunning = {'true' if is_running else 'false'};
        const accumSec = {accum_sec};
        const startMs = {start_ms};

        function formatTime(totalSec) {{
          const h = Math.floor(totalSec / 3600);
          const m = Math.floor((totalSec % 3600) / 60);
          const s = totalSec % 60;
          const pad = (n) => String(n).padStart(2, '0');
          if (h > 0) {{
            return pad(h) + ':' + pad(m) + ':' + pad(s);
          }}
          return pad(m) + ':' + pad(s);
        }}

        function tick() {{
          let cur = accumSec;
          if (isRunning && startMs > 0) {{
            const diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
            cur += diff;
          }}
          document.getElementById('timer-box').innerText = formatTime(cur);
        }}

        tick();
        if (isRunning) {{
          setInterval(tick, 1000);
        }}
      </script>
    </body>
    </html>
    """
    st.iframe(html_code, height=90)


def render_tab_reading():
    st.markdown("### 📖 Lecture en cours & Chronomètre")

    # Initialisation de l'état du chronomètre
    if "timer_running" not in st.session_state:
        st.session_state.timer_running = False
    if "timer_start_time" not in st.session_state:
        st.session_state.timer_start_time = None
    if "timer_accumulated" not in st.session_state:
        st.session_state.timer_accumulated = 0.0
    if "timer_book_id" not in st.session_state:
        st.session_state.timer_book_id = None
    if "session_saved_state" not in st.session_state:
        st.session_state.session_saved_state = None
    if "active_reading_dialog" not in st.session_state:
        st.session_state.active_reading_dialog = None

    # Récupération des livres "En cours"
    current_books = get_all_books(status="En cours")

    if not current_books:
        st.info("💡 Vous n'avez actuellement aucun livre avec le statut **« En cours »**.")
        all_books = get_all_books()
        if all_books:
            st.markdown("Sélectionnez un livre de votre bibliothèque pour commencer à le lire :")
            book_to_start = st.selectbox(
                "Choisir un livre à démarrer :",
                options=all_books,
                format_func=lambda b: f"{b['title']} - {b['author']} ({b['status']})"
            )
            if st.button("▶️ Démarrer la lecture de ce livre", type="primary", width="stretch"):
                update_book(book_to_start["id"], {
                    "status": "En cours",
                    "started_at": date.today()
                })
                st.rerun()
        else:
            st.markdown("Rendez-vous dans l'onglet **➕ Ajouter** pour enregistrer votre premier ouvrage !")
        return

    # Sélecteur du livre actif parmi ceux en cours
    book_options = {b["id"]: b for b in current_books}
    
    default_index = 0
    if st.session_state.timer_book_id in book_options:
        default_index = list(book_options.keys()).index(st.session_state.timer_book_id)

    selected_book_id = st.selectbox(
        "Livre actif :",
        options=list(book_options.keys()),
        index=default_index,
        format_func=lambda bid: f"{book_options[bid]['title']} — {book_options[bid]['author']}"
    )

    book = get_book(selected_book_id)
    if not book:
        return

    # Gestion persistante des dialogues modaux de lecture
    if st.session_state.active_reading_dialog == "finish":
        dialog_finish_book(book)
    elif st.session_state.active_reading_dialog == "dnf":
        dialog_dnf_book(book)
    elif st.session_state.active_reading_dialog == "manual":
        dialog_manual_session(book)

    # ==========================================
    # Carte Visuelle de Progression Mobile (Sans HTML brut)
    # ==========================================
    current_page = book["current_page"] or 0
    total_pages = max(book["page_count"] or 1, 1)
    progress_ratio = min(max(current_page / total_pages, 0.0), 1.0)
    percent_done = round(progress_ratio * 100, 2)
    pages_left = max(total_pages - current_page, 0)

    # Calcul de la vitesse moyenne de lecture
    book_sessions = get_reading_sessions(book_id=book["id"])
    total_min = sum(s["duration_minutes"] for s in book_sessions)
    total_p = sum(s["pages_read"] for s in book_sessions)
    
    if total_min > 0 and total_p > 0:
        speed_c = (total_p / total_min) * 60.0
    else:
        all_s = get_reading_sessions()
        all_min = sum(s["duration_minutes"] for s in all_s)
        all_p = sum(s["pages_read"] for s in all_s)
        speed_c = (all_p / all_min) * 60.0 if all_min > 0 and all_p > 0 else 45.0

    speed_c = round(speed_c, 2)
    hours_left = pages_left / speed_c if speed_c > 0 else 0
    h_int = int(hours_left)
    m_int = int((hours_left - h_int) * 60)
    time_estimate_str = f"~{h_int}h {m_int}min" if h_int > 0 else f"~{m_int} min"

    cover_html = (
        f'<img src="{book["cover_url"]}" style="width: 85px; height: 125px; object-fit: cover; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">'
        if book.get("cover_url")
        else '<div style="width: 85px; height: 125px; background: #334155; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📖</div>'
    )

    series_line = (
        f'<div style="font-size: 0.8rem; color: #818CF8; margin-top: 2px;">{book["series_name"]} (Tome {book.get("series_volume", 1)})</div>'
        if book.get("series_name")
        else ''
    )
    subg_list_r = book.get("fantasy_subgenres") or ([book["fantasy_subgenre"]] if book.get("fantasy_subgenre") else [])
    subg_line = (
        f'<div style="font-size: 0.78rem; color: #E879F9; margin-top: 2px;">✨ {" • ".join(subg_list_r)}</div>'
        if subg_list_r
        else ''
    )

    card_html = (
        f'<div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 16px; margin-bottom: 12px;">'
        f'<div style="display: flex; gap: 16px; align-items: flex-start;">'
        f'{cover_html}'
        f'<div style="flex: 1;">'
        f'<div style="font-size: 1.15rem; font-weight: 700; line-height: 1.25; color: #F8FAFC;">{book["title"]}</div>'
        f'<div style="font-size: 0.9rem; color: #94A3B8; margin-top: 2px;">{book["author"]}</div>'
        f'{series_line}'
        f'{subg_line}'
        f'<div style="display: flex; gap: 12px; margin-top: 10px; font-size: 0.85rem; color: #E2E8F0;">'
        f'<div><b>{current_page}</b> / {total_pages} p.</div>'
        f'<div>•</div>'
        f'<div style="color: #6366F1; font-weight: 600;">{percent_done:.2f}%</div>'
        f'</div>'
        f'<div style="font-size: 0.8rem; color: #A5B4FC; margin-top: 4px;">'
        f'⏳ {pages_left} pages restantes ({time_estimate_str} à {speed_c:.2f} p/h)'
        f'</div>'
        f'</div>'
        f'</div>'
        f'</div>'
    )

    with st.container():
        st.markdown(card_html, unsafe_allow_html=True)
        st.progress(progress_ratio)

    # ==========================================
    # Le Chronomètre de Session (Dynamique JS)
    # ==========================================
    st.markdown("#### ⏱️ Chronomètre de lecture")

    render_live_timer(
        is_running=st.session_state.timer_running,
        accumulated_sec=st.session_state.timer_accumulated,
        start_timestamp=st.session_state.timer_start_time
    )

    current_elapsed = st.session_state.timer_accumulated
    if st.session_state.timer_running and st.session_state.timer_start_time:
        current_elapsed += (time.time() - st.session_state.timer_start_time)

    col_btn1, col_btn2, col_btn3 = st.columns(3)
    
    with col_btn1:
        if not st.session_state.timer_running:
            if st.button("▶️ Démarrer", width="stretch", type="primary"):
                st.session_state.timer_running = True
                st.session_state.timer_start_time = time.time()
                st.session_state.timer_book_id = book["id"]
                st.rerun()
        else:
            if st.button("⏸️ Pause", width="stretch"):
                st.session_state.timer_running = False
                st.session_state.timer_accumulated += (time.time() - st.session_state.timer_start_time)
                st.session_state.timer_start_time = None
                st.rerun()

    with col_btn2:
        if st.button("⏹️ Terminer", width="stretch", disabled=(current_elapsed < 1)):
            if st.session_state.timer_running:
                st.session_state.timer_accumulated += (time.time() - st.session_state.timer_start_time)
                st.session_state.timer_running = False
                st.session_state.timer_start_time = None
            st.session_state.session_saved_state = {
                "duration_minutes": max(round(st.session_state.timer_accumulated / 60.0, 2), 1.0),
                "book_id": book["id"],
                "start_page": current_page
            }
            st.rerun()

    with col_btn3:
        if st.button("➕ Manuel", width="stretch", help="Ajouter une session lue hors chrono"):
            st.session_state.active_reading_dialog = "manual"
            st.rerun()

    # Mini formulaire de validation post-chrono
    if st.session_state.session_saved_state and st.session_state.session_saved_state.get("book_id") == book["id"]:
        st.markdown("---")
        st.markdown("##### 📝 Validation de la session de lecture")
        dur = st.session_state.session_saved_state["duration_minutes"]
        st.info(f"Durée mesurée : **{dur:.2f} min** | Page de départ : **{current_page}**")

        with st.form("validate_session_form"):
            new_p = st.number_input(
                "Nouvelle page atteinte * :",
                min_value=current_page,
                max_value=total_pages,
                value=min(current_page + 20, total_pages)
            )
            col_val, col_cancel = st.columns(2)
            with col_val:
                confirm_btn = st.form_submit_button("✅ Enregistrer la session", type="primary", width="stretch")
            with col_cancel:
                cancel_btn = st.form_submit_button("Annuler", width="stretch")

            if confirm_btn:
                now_dt = datetime.now()
                add_reading_session({
                    "book_id": book["id"],
                    "start_time": now_dt,
                    "end_time": now_dt,
                    "duration_minutes": dur,
                    "start_page": current_page,
                    "end_page": int(new_p)
                })
                st.session_state.timer_running = False
                st.session_state.timer_start_time = None
                st.session_state.timer_accumulated = 0.0
                st.session_state.session_saved_state = None
                st.success(f"Session de {dur:.2f} min enregistrée ! Page actuelle : {new_p}")
                st.rerun()

            if cancel_btn:
                st.session_state.timer_accumulated = 0.0
                st.session_state.session_saved_state = None
                st.rerun()

    # ==========================================
    # Prise de Note Rapide (In-Session)
    # ==========================================
    st.markdown("---")
    with st.expander("✍️ Prise de note rapide / Citation", expanded=False):
        with st.form("quick_note_form", clear_on_submit=True):
            col_n1, col_n2, col_n3 = st.columns([1, 1, 1])
            with col_n1:
                n_type = st.selectbox("Type", ["Citation", "Commentaire", "Théorie", "Personnage"])
            with col_n2:
                n_page = st.number_input("Page", min_value=0, max_value=total_pages, value=current_page)
            with col_n3:
                n_chap = st.number_input("Chapitre", min_value=0, max_value=999, value=0)

            n_content = st.text_area("Contenu de la note / citation *", placeholder="Tapez votre citation ou réflexion ici...")
            submit_note = st.form_submit_button("Enregistrer la note", width="stretch", type="secondary")

            if submit_note:
                if n_content.strip():
                    add_book_note({
                        "book_id": book["id"],
                        "page_number": int(n_page) if n_page > 0 else None,
                        "chapter_number": int(n_chap) if n_chap > 0 else None,
                        "note_type": n_type,
                        "content": n_content.strip()
                    })
                    st.success("Note enregistrée avec succès !")
                else:
                    st.warning("Le contenu de la note ne peut pas être vide.")

    # ==========================================
    # Clôture du Livre (Terminé / Abandon)
    # ==========================================
    st.markdown("---")
    st.markdown("##### 🏁 Clôture de l'ouvrage")
    col_end1, col_end2 = st.columns(2)
    with col_end1:
        if st.button("✅ Livre Terminé", width="stretch", type="primary"):
            st.session_state.active_reading_dialog = "finish"
            st.rerun()
    with col_end2:
        if st.button("🛑 Abandonner (DNF)", width="stretch"):
            st.session_state.active_reading_dialog = "dnf"
            st.rerun()

    # Mini aperçu des dernières notes du livre
    recent_notes = get_book_notes(book["id"])
    if recent_notes:
        with st.expander(f"📜 Citations et notes prises sur ce livre ({len(recent_notes)})"):
            for note in recent_notes[:5]:
                p_info = f"p. {note['page_number']}" if note.get('page_number') else ""
                ch_info = f"Ch. {note['chapter_number']}" if note.get('chapter_number') else ""
                loc = " • ".join([x for x in [p_info, ch_info] if x])
                
                note_html = (
                    f'<div style="background: rgba(15, 23, 42, 0.6); padding: 10px 14px; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid #6366F1;">'
                    f'<div style="font-size: 0.75rem; color: #818CF8; font-weight: 600;">{note["note_type"].upper()} {f"— {loc}" if loc else ""}</div>'
                    f'<div style="font-size: 0.9rem; color: #F1F5F9; margin-top: 4px; font-style: {"italic" if note["note_type"] == "Citation" else "normal"};">{note["content"]}</div>'
                    f'</div>'
                )
                st.markdown(note_html, unsafe_allow_html=True)
