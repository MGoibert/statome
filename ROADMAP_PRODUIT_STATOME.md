# 📖 StaTome — Roadmap & Idées Produit

> **Positionnement actuel** : Un véritable « Strava / tableau de bord analytique de la lecture » — rapide sur mobile, sans pub, privé, avec scan code-barres ZBar, suivi Focus vs Détente, évaluation sur 6 critères, sous-genres précis, PAL mensuelle et statistiques avancées.

---

## 🎯 P1 — Indispensables avant le lancement payant (Adoption & Support)

- [ ] **Import CSV en 1 clic (Goodreads / StoryGraph / Babelio / générique)**
  - *Besoin* : supprimer le « syndrome de la page blanche » pour les lecteurs qui ont déjà 50 à 300 livres ailleurs.
  - *Bénéfice* : un nouvel utilisateur retrouve sa bibliothèque et son historique en 30 secondes.
- [ ] **Mot de passe oublié & gestion du mot de passe**
  - *Besoin* : indispensable dès l'ouverture commerciale pour éviter qu'un client payant soit bloqué.
  - *Piste technique* : réinitialisation par email (ex. Resend / Brevo, offre gratuite) + changement de mot de passe dans `👤 Mon Compte`.

---

## 🔥 P2 — Rétention quotidienne (Donner envie d'ouvrir l'app chaque soir)

- [x] **Objectifs de lecture personnalisables** *(livré — Livres/Pages/Temps × Jour/Semaine/Mois/An + Pace Tracker)*
- [x] **Séries de lecture (Streaks 🔥 / 🌿 Hebdo bienveillant) & Défis thématiques** *(livré)*

---

## 🚀 P3 — Croissance organique & Viralité (Bookstagram / BookTok)

- [ ] **Exports visuels « Story-Ready » en 1 clic**
  - **Calendrier mensuel en couvertures** (déjà présent dans l'onglet Stats) exportable en image propre sans barre de navigation.
  - **Fiche Avis + Graphique Radar 6 critères** : couverture + note globale + radar + mini-critique prêts à poster en story.
  - **Carte Bilan du Mois / de l'Année (Wrap-up)** : mosaïque des couvertures lues, pages totales, temps de lecture, coup de cœur + discret logo *StaTome*.
  - **Cartes Citations** : mise en page élégante d'une citation enregistrée sur fond sombre.

---

## 🌟 P3 bis — Facteurs différenciants exclusifs (Introuvables chez les concurrents)

- [ ] **🧬 Analyseur de Profil Lecteur complet (« ADN StaTome »)**
  - Portrait analytique holistique combinant **toutes** les données de lecture :
    - **Moteurs de tes coups de cœur** : corrélation entre tes 6 critères (*Intrigue, Personnages, Worldbuilding, Plume, Rythme, Émotion*) et ta Note Globale (ex. *« Tu pardonnes un rythme lent si les personnages et le worldbuilding dépassent 4/5 »*).
    - **Dynamique de vitesse au fil d'un livre** : détection de ta courbe d'engagement (*début / milieu / fin* — ex. baisse de vitesse quand tu te désintéresses, accélération sur le dernier tiers d'un page-turner).
    - **Style & Habitudes horaires** : lecteur du matin, de la pause déj, du soir ou nocturne ; semaine vs week-end ; ratio *Focus* vs *Détente* ; créneau horaire où ta vitesse est maximale.
    - **Empreinte Genres & Sous-genres** : comparaison entre ce que tu lis le plus, ce que tu notes le mieux, et tes taux d'abandon (DNF) par genre/sous-genre.
    - **Analyse de tes notes & critiques écrites** : extraction des thèmes et motifs récurrents dans tes commentaires, théories et critiques finales.
- [x] **⏱️ Temps restant personnalisé (Focus / Détente) & Planificateur Date Cible** *(livré)*
- [x] **💶 Coût par heure de plaisir (€/heure)** *(livré)*
- [x] **🎲 Piocheur de PAL (Mood Picker intelligent)** *(livré sur `staging`)*
- [x] **🐉 Tableau de bord « Mes Sagas » & Anti-trou de mémoire** *(livré sur `staging`)*

---

## ✨ P4 — Confort & Usages avancés de lecteurs passionnés

- [ ] **Mode Relecture (Rereads)**
  - Pouvoir relire un livre déjà terminé sans écraser la date ni la note de la première lecture.
- [ ] **Suivi des prêts de livres**
  - Indiquer à qui un livre a été prêté et depuis quelle date (*« Prêté à Julie le 12/11 »*) avec un filtre dédié dans la bibliothèque.
- [ ] **Meilleure gestion des Livres Audio (Audiobooks)**
  - Permettre de suivre l'avancement en heures/minutes ou en pourcentage (`%`) plutôt qu'uniquement en nombre de pages.
- [ ] **Ajout ultra-rapide pour Liseuses (Kindle / Kobo / Vivlio) & Audiobooks (sans code-barres)**
  - *Problème* : pas de code-barres papier à scanner sur une liseuse ou une app audio.
  - *Pistes* :
    - **Recherche instantanée avec vignettes de couvertures** (autocomplétion dès 3–4 lettres, 1 tap pour pré-remplir en format `Numérique` ou `Audio`).
    - **Coller un lien (Amazon / Kindle / Audible / Kobo / Fnac / Goodreads)** : extraction automatique de l'ISBN/ASIN/titre depuis l'URL copiée depuis l'app du lecteur.
    - **Lecture locale d'un fichier `.epub`** (lecture des métadonnées titre/auteur/couverture dans le navigateur sans uploader le fichier).
- [ ] **Support des Magazines & Revues (ex. *Fluide Glacial*, *Bifrost*, *Métal Hurlant*, *Science & Vie*)**
  - *Faisabilité* : oui ! Les magazines utilisent un code-barres **`977...` (ISSN)** (ou `378...` en kiosque FR) au lieu de `978/979` (ISBN).
  - *Pistes* :
    - Ajouter le format **`Magazine / Revue`** (avec le numéro de parution géré comme un numéro de tome / série).
    - Autoriser les codes **`977...`** dans le scanner ZBar et interroger la **BnF par ISSN (`bib.issn`)** pour pré-remplir automatiquement le titre de la revue et l'éditeur.

---

## 💳 P5 — Monétisation & Professionnalisation (TomeFab)

- [ ] **Nom de domaine dédié** (ex. `statome.app` ou `app.tomefab.io`) relié au Worker Cloudflare.
- [ ] **Offre Freemium / Premium + paiement Stripe**
  - *Gratuit* : bibliothèque (ex. jusqu'à 20–30 livres ou fonctions essentielles) + scan + suivi de lecture.
  - *Premium* : livres illimités, statistiques avancées complètes, export CSV, cartes bilan partageables, relectures & prêts.

---

## 💬 Questions à poser aux bêta-testeurs (après 1 semaine d'usage)

1. *« Qu'est-ce qui t'a le plus plu ou donné envie de rouvrir l'app ? »*
2. *« Qu'est-ce qui t'a agacé(e) ou manqué le plus cette semaine ? »*
3. *« Si l'app devenait payante demain, quelle fonctionnalité te ferait dire oui sans hésiter ? »*
