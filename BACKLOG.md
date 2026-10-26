# 📋 Statome — Backlog & Spécifications des Correctifs

### État d'avancement des correctifs : **100% Résolus & Validés** ✅

---

### 1. 📷 Scanner de code-barres mobile — [RÉSOLU ✅]
- **Correctif appliqué** :
  - Pipeline de résilience d'image dans [`core/barcode_scanner.py`](file:///Users/morgane/Documents/Divers%20%26%20Perso/Code/app_suivi_lecture/core/barcode_scanner.py) :
    - Gestion universelle des types (`PIL.Image`, `zxingcpp.Image`, buffer `st.camera_input` avec `.seek(0)`).
    - Découpages stratégiques automatisés : zone centrale 50%, moitié inférieure du livre (emplacement standard des EAN-13), tiers inférieur.
    - Égalisation d'histogramme, autocontraste `ImageOps.autocontrast`, filtre de netteté `ImageFilter.SHARPEN` pour éliminer le flou de bougé.
    - Double binarisation `zxingcpp.Binarizer.LocalAverage` et `GlobalHistogram`.
  - Guide utilisateur et conseils de cadrage ajoutés dans [`views/tab_add_book.py`](file:///Users/morgane/Documents/Divers%20%26%20Perso/Code/app_suivi_lecture/views/tab_add_book.py).

---

### 2. 🖥️ Affichage de balises HTML brutes sur l'écran d'accueil — [RÉSOLU ✅]
- **Cause** : Indentation accidentelle à 4 espaces ou plus dans les f-strings Markdown de Streamlit, déclenchant le mode bloc de code `<pre><code>`.
- **Correctif appliqué** :
  - Refonte complète de la génération HTML de la carte dans [`views/tab_reading.py`](file:///Users/morgane/Documents/Divers%20%26%20Perso/Code/app_suivi_lecture/views/tab_reading.py) et [`views/tab_library.py`](file:///Users/morgane/Documents/Divers%20%26%20Perso/Code/app_suivi_lecture/views/tab_library.py).
  - Suppression totale des indentations superflues : toutes les balises HTML sont désormais construites à plat en colonne 0, empêchant tout basculement en mode bloc de code.

---

### 3. ⭐ Pré-remplissage des notes d'évaluation par défaut — [RÉSOLU ✅]
- **Cause** : Absence d'état « non noté » explicite, forçant un 4.0/5 lors de l'ouverture du formulaire.
- **Correctif appliqué** :
  - Ajout d'une case à cocher « Attribuer une note / évaluation » dans la modale d'édition de la bibliothèque ([`views/tab_library.py`](file:///Users/morgane/Documents/Divers%20%26%20Perso/Code/app_suivi_lecture/views/tab_library.py)) et à la clôture de lecture ([`views/tab_reading.py`](file:///Users/morgane/Documents/Divers%20%26%20Perso/Code/app_suivi_lecture/views/tab_reading.py)).
  - Si non cochée, les champs restent strictement à `None` et l'ouvrage est étiqueté « Non noté », sans note artificielle.

---

### 4. 📊 Précision des statistiques (2 décimales max) & Infobulles Plotly r / theta — [RÉSOLU ✅]
- **Correctif appliqué** :
  - Formatage systématique à 2 décimales maximum (`:.2f` ou `round(val, 2)`) sur l'ensemble des vitesses (`p/h`), pourcentages, durées, valeurs financières et estimations de temps restant.
  - Personnalisation explicite des `hovertemplate` sur tous les graphiques Plotly dans [`core/stats_engine.py`](file:///Users/morgane/Documents/Divers%20%26%20Perso/Code/app_suivi_lecture/core/stats_engine.py) :
    - Graphique radar : `Critère : %{theta}<br>Note moyenne : %{r:.2f} / 5`.
    - Graphique d'activité : date en clair, pages lues et durée en minutes.
    - Comparatif semaine vs week-end : labels clairs avec unités.

---

### 5. ⏱️ Chronomètre en direct temps réel — [RÉSOLU ✅]
- **Cause** : Streamlit ne rafraîchissait pas l'affichage seconde par seconde côté navigateur.
- **Correctif appliqué** :
  - Intégration d'un composant dynamique HTML5/JavaScript léger (`components.html`) dans [`views/tab_reading.py`](file:///Users/morgane/Documents/Divers%20%26%20Perso/Code/app_suivi_lecture/views/tab_reading.py).
  - Le chronomètre s'incrémente de façon fluide chaque seconde en direct sur l'écran du smartphone sans recharger la page, tout en garantissant une précision à la milliseconde via l'horodatage serveur Python.

---

### 6. 🐛 Bug sur la sélection de la PAL du mois à l'ajout d'un livre — [RÉSOLU ✅]
- **Cause** : Variable `pal_month_str` appelée mais non définie dans le formulaire d'ajout.
- **Correctif appliqué** :
  - Suppression de l'ancienne logique et bascule sur le module dédié [`core/date_utils.py`](file:///Users/morgane/Documents/Divers%20%26%20Perso/Code/app_suivi_lecture/core/date_utils.py).
  - Sélection sécurisée sans aucune exception lors de la soumission.

---

### 7. 📅 Mois et années en clair & Sélecteurs séparés — [RÉSOLU ✅]
- **Correctif appliqué** :
  - Création du module utilitaire [`core/date_utils.py`](file:///Users/morgane/Documents/Divers%20%26%20Perso/Code/app_suivi_lecture/core/date_utils.py).
  - Deux sélecteurs distincts mis en place :
    1. Sélecteur de mois : Menu déroulant avec les 12 mois en français (« Aucun », « Janvier », ..., « Décembre »).
    2. Sélecteur d'année : Menu déroulant avec années en chiffres (« Aucune », 2024, 2025, 2026, ...).
  - Affichage en clair partout dans l'application (ex: « Octobre 2026 » au lieu de « 2026-10 ») dans les filtres, fiches livres et tableaux de bord.
