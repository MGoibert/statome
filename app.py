"""
Application Mobile-First de Suivi de Lecture & d'Analyse Statistique Avancée.
Point d'entrée principal Streamlit (app.py).
"""

import streamlit as st

# Configuration de la page Streamlit (optimisée pour mobile)
st.set_page_config(
    page_title="Statome",
    page_icon="📖",
    layout="centered",
    initial_sidebar_state="collapsed"
)

# Injection de style CSS moderne pour ergonomie tactile mobile
st.markdown(
    """
    <style>
    /* Optimisation Mobile-First */
    .block-container {
        padding-top: 1rem;
        padding-bottom: 2.5rem;
        padding-left: 0.8rem;
        padding-right: 0.8rem;
        max-width: 800px;
    }

    /* Style des onglets */
    .stTabs [data-baseweb="tab-list"] {
        gap: 6px;
        background-color: #1E293B;
        padding: 6px;
        border-radius: 12px;
        justify-content: space-around;
        margin-bottom: 12px;
    }

    .stTabs [data-baseweb="tab"] {
        border-radius: 8px;
        padding: 8px 12px;
        color: #94A3B8;
        font-weight: 600;
        font-size: 0.95rem;
    }

    .stTabs [aria-selected="true"] {
        background-color: #6366F1 !important;
        color: #FFFFFF !important;
    }

    /* Boutons larges tactiles */
    .stButton > button {
        border-radius: 10px;
        font-weight: 600;
        min-height: 44px;
        transition: all 0.2s ease;
    }

    /* Cartes et conteneurs */
    div[data-testid="stExpander"] {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        background: rgba(30, 41, 59, 0.5);
    }

    /* Champs de saisie */
    .stTextInput input, .stNumberInput input, .stSelectbox select {
        border-radius: 8px;
    }

    /* Masquer le menu Streamlit superflu sur mobile */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    </style>
    """,
    unsafe_allow_html=True
)

from core.database import init_db
from views.tab_reading import render_tab_reading
from views.tab_add_book import render_tab_add_book
from views.tab_library import render_tab_library
from views.tab_stats import render_tab_stats

# Initialisation automatique de la base SQLite ou PostgreSQL
init_db()


def check_authentication() -> bool:
    """Vérifie le code PIN ou mot de passe configuré dans st.secrets."""
    app_pin = ""
    try:
        if "APP_PIN" in st.secrets and st.secrets["APP_PIN"]:
            app_pin = str(st.secrets["APP_PIN"]).strip()
        elif "APP_PASSWORD" in st.secrets and st.secrets["APP_PASSWORD"]:
            app_pin = str(st.secrets["APP_PASSWORD"]).strip()
    except Exception:
        pass

    # Si aucun code PIN n'est défini, accès libre
    if not app_pin:
        return True

    if "authenticated" not in st.session_state:
        st.session_state.authenticated = False

    if st.session_state.authenticated:
        return True

    # Écran de verrouillage tactile
    auth_html = (
        '<div style="text-align: center; margin-top: 40px; margin-bottom: 20px;">'
        '<div style="font-size: 3.5rem;">🔒</div>'
        '<h2>Accès Personnel Sécurisé</h2>'
        '<p style="color: #94A3B8;">Veuillez saisir votre code PIN pour ouvrir votre suivi de lecture.</p>'
        '</div>'
    )
    st.markdown(auth_html, unsafe_allow_html=True)

    with st.form("auth_form"):
        pin_input = st.text_input("Code PIN", type="password", placeholder="••••", label_visibility="collapsed")
        unlock_btn = st.form_submit_button("Déverrouiller", width="stretch", type="primary")

        if unlock_btn:
            if pin_input.strip() == app_pin:
                st.session_state.authenticated = True
                st.success("Accès autorisé !")
                st.rerun()
            else:
                st.error("Code PIN incorrect.")

    return False


def main():
    if not check_authentication():
        return

    # Barre d'en-tête mobile épurée
    header_html = (
        '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">'
        '<div style="font-size: 1.35rem; font-weight: 800; color: #F8FAFC; letter-spacing: -0.5px;">'
        '📚 Statome<span style="color: #6366F1;">.</span>'
        '</div>'
        '<div style="font-size: 0.8rem; background: rgba(99, 102, 241, 0.2); color: #818CF8; padding: 3px 8px; border-radius: 20px; font-weight: 600;">'
        'Mobile PWA'
        '</div>'
        '</div>'
    )
    st.markdown(header_html, unsafe_allow_html=True)

    # Navigation principale par onglets
    tab1, tab2, tab3, tab4 = st.tabs([
        "📖 Lecture",
        "➕ Ajouter",
        "📚 Bibliothèque",
        "📊 Statistiques"
    ])

    with tab1:
        render_tab_reading()

    with tab2:
        render_tab_add_book()

    with tab3:
        render_tab_library()

    with tab4:
        render_tab_stats()


if __name__ == "__main__":
    main()
