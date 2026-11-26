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

- [x] **Exports visuels « Story-Ready » en 1 clic** *(livré — Carrousel Bilan 4 slides swipable, Calendrier mensuel en couvertures, Fiche Avis + Radar 6 critères, Cartes Citations & Carte ADN, 1080×1920 PNG + partage natif)*

---

## 🌟 P3 bis — Facteurs différenciants exclusifs (Introuvables chez les concurrents)

- [x] **🧬 Analyseur de Profil Lecteur complet (« ADN StaTome »)** *(livré — onglet `Stats → 🧬 Mon ADN` : archétype, moteurs de coups de cœur, dynamique Début/Milieu/Fin, habitudes horaires, empreinte genres/DNF et thèmes récurrents des notes)*
- [x] **⏱️ Temps restant personnalisé (Focus / Détente) & Planificateur Date Cible** *(livré)*
- [x] **💶 Coût par heure de plaisir (€/heure)** *(livré)*
- [x] **🎲 Piocheur de PAL (Mood Picker intelligent)** *(livré)*
- [x] **🐉 Tableau de bord « Mes Sagas » & Anti-trou de mémoire** *(livré)*

---

## ✨ P4 — Confort & Usages avancés de lecteurs passionnés

- [ ] **Mode Relecture (Rereads)**
  - Pouvoir relire un livre déjà terminé sans écraser la date ni la note de la première lecture.
- [ ] **Suivi des prêts de livres**
  - Indiquer à qui un livre a été prêté et depuis quelle date (*« Prêté à Julie le 12/11 »*) avec un filtre dédié dans la bibliothèque.
- [x] **Meilleure gestion des Livres Audio (Audiobooks)** *(livré — durée totale en `h/min`, suivi en heures/minutes ou `%`, exclu de la vitesse Focus `pages/h`)*
- [x] **Ajout ultra-rapide pour Liseuses (Kindle / Kobo / Vivlio) & Audiobooks (sans code-barres)** *(livré — 3 pastilles format, autocomplétion visuelle FR instantanée avec couvertures, collage de lien Amazon/Kindle/Audible/Kobo/Fnac/Goodreads ; suivi `%` sur liseuse)*
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
