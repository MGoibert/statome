# 📚 Statome - Application Mobile-First de Suivi de Lecture & d'Analyse Statistique

Application Web Progressive (PWA) conçue avec **Python 3.11+** et **Streamlit**, optimisée pour une expérience tactile sur smartphone (iOS & Android).

Elle combine l'acquisition automatique de métadonnées (APIs BnF, Google Books, Babelio, scan caméra de code-barres), le chronométrage actif de séances de lecture avec prise de notes instantanée, la gestion de PAL (Pile À Lire) mensuelle / annuelle, et des tableaux de bord statistiques avancés (Semainier visuel, comparatif semaine vs week-end, radar multi-critères, treemap de genres).

---

## 🏗️ Architecture & Arborescence

```plaintext
app_suivi_lecture/
├── app.py                      # Point d'entrée Streamlit (Navigation & Layout)
├── seed_data.py                # Script d'injection de 10 livres de test & sessions
├── requirements.txt            # Dépendances Python
├── packages.txt                # Dépendances système Linux (Streamlit Cloud : libzbar0)
├── .streamlit/
│   ├── config.toml             # Thème sombre moderne & configuration serveur
│   └── secrets.toml            # Clés d'authentification (PIN) & Supabase
├── core/
│   ├── database.py             # Modèles SQLAlchemy (SQLite / Supabase) & CRUD
│   ├── metadata_fetcher.py     # Pipeline cascade (Google Books, BnF, Babelio)
│   ├── barcode_scanner.py      # Décodage d'image EAN-13 (zxing-cpp & pyzbar)
│   └── stats_engine.py         # Calculs Pandas et visualisations interactives Plotly
└── views/
    ├── tab_reading.py          # Onglet 1 : Lecture en cours, Chrono & Prise de notes
    ├── tab_add_book.py         # Onglet 2 : Scan caméra, Recherche & Fiche d'ajout
    ├── tab_library.py          # Onglet 3 : Bibliothèque, PAL, Filtres & Fiches livres
    └── tab_stats.py            # Onglet 4 : Semainier visuel & Analyses graphiques
```

---

## 🚀 Démarrage Rapide en Local

### 1. Cloner ou ouvrir le projet
```bash
cd app_suivi_lecture
```

### 2. Créer et activer l'environnement virtuel Python
```bash
python3 -m venv venv
source venv/bin/activate  # Sur macOS / Linux
# ou: venv\Scripts\activate sous Windows
```

### 3. Installer les dépendances
```bash
pip install -r requirements.txt
```

### 4. (Optionnel) Injecter les données de démonstration
Pour tester immédiatement avec 10 romans de fantasy francophone, des sessions réalistes sur la semaine et le week-end, et des citations :
```bash
python3 seed_data.py
```

### 5. Lancer l'application
```bash
streamlit run app.py
```
L'application s'ouvre sur `http://localhost:8501`.

---

## 🔒 Sécurisation & Persistance Supabase (Cloud)

Dans le fichier `.streamlit/secrets.toml` :

```toml
# 1. Code PIN personnel (laisser vide pour désactiver le verrouillage en local)
APP_PIN = "1234"

# 2. Base de données Supabase / PostgreSQL (Optionnel : SQLite en local par défaut)
# Si renseigné, l'application bascule automatiquement sur votre base cloud PostgreSQL !
DATABASE_URL = "postgresql://postgres.xxxx:your_password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"

# 3. Clé Google Books API (Optionnel pour augmenter le quota d'API)
# GOOGLE_BOOKS_API_KEY = "AIzaSy..."
```

---

## ☁️ Déploiement sur Streamlit Community Cloud

1. Déposez votre dépôt sur votre compte **GitHub**.
2. Rendez-vous sur [share.streamlit.io](https://share.streamlit.io/).
3. Cliquez sur **"New app"** et sélectionnez votre dépôt.
4. Paramètres :
   - **Main file path** : `app.py`
   - **Python version** : `3.11`
5. Dans les **Advanced Settings** -> **Secrets**, copiez-collez vos variables (`APP_PIN`, `DATABASE_URL`, etc.).
6. Cliquez sur **Deploy** !
> 💡 Grâce au fichier `packages.txt` contenant `libzbar0`, le décodage de code-barres par caméra fonctionne immédiatement sur le cloud Linux.

---

## 📱 Installation sur Smartphone (Mode Plein Écran PWA)

Pour une expérience identique à une application native mobile :

### Sur iPhone / iPad (Safari) :
1. Ouvrez l'URL de votre application Streamlit dans **Safari**.
2. Appuyez sur le bouton **Partager** (icône rectangle avec flèche vers le haut au centre en bas).
3. Faites défiler vers le bas et sélectionnez **« Sur l'écran d'accueil »**.
4. Nommez l'icône « Statome » et validez. L'application s'ouvrira en plein écran sans les barres du navigateur !

### Sur Android (Google Chrome) :
1. Ouvrez l'URL dans **Chrome**.
2. Appuyez sur les trois points verticaux en haut à droite.
3. Sélectionnez **« Ajouter à l'écran d'accueil »** (ou « Installer l'application »).
4. Confirmez. L'icône est créée sur votre écran d'accueil avec affichage plein écran tactile.

---

## ✨ Fonctionnalités Clés

- **Scan Caméra instantané** : Détection automatique des codes EAN-13 des livres.
- **Pipeline de métadonnées** : Titre, tome de saga, auteur, pays, pagination exacte (BnF), prix (€), tags et notes Babelio.
- **Chronomètre de session** : Minuteur persistant, validation de la page atteinte, calcul de la vitesse (pages/heure) et temps restant estimé.
- **Citations & Notes en cours de lecture** : Saisie rapide sans quitter la page active.
- **Notation multi-critères** : Note globale sur 5 + sous-notes (Rythme, Personnages, Worldbuilding, Plume, Intrigue) et critique rédigée.
- **Gestion des PAL** : Filtrage par mois (ex: `2026-10`) et par année, projection du temps requis pour finir la PAL.
- **Suites de séries à acheter** : Détecte automatiquement les tomes suivants de vos sagas dont le tome précédent est terminé.
- **Semainier visuel** : Grille calendrier des 7 jours affichant les couvertures des livres lus et les minutes consacrées.
- **Tableaux de bord Plotly** : Radar d'évaluation, comparatif semaine vs week-end, treemap des genres et tropes.
