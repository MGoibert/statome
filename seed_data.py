"""
Script d'initialisation de données de démonstration (seed_data.py).
Injecte 10 livres de fantasy francophone / internationale avec des métadonnées riches,
des sessions de lecture réalistes réparties sur la semaine et le week-end, et des notes/citations.
"""

import sys
import os
from datetime import datetime, timedelta, date

# S'assurer que le dossier racine est dans le sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.database import init_db, add_book, add_reading_session, add_book_note, SessionLocal, Book, ReadingSession, BookNote

def seed():
    print("🌱 Initialisation de la base de données...")
    init_db()

    # Nettoyage préalable pour un seed propre
    session = SessionLocal()
    session.query(BookNote).delete()
    session.query(ReadingSession).delete()
    session.query(Book).delete()
    session.commit()
    session.close()

    print("📚 Insertion des livres de démonstration...")

    # Liste de 10 livres avec métadonnées variées
    books_data = [
        {
            "isbn": "9782811201494",
            "title": "Le Nom du Vent",
            "series_name": "Chronique du Tueur de Roi",
            "series_volume": 1.0,
            "author": "Patrick Rothfuss",
            "author_country": "États-Unis",
            "publisher": "Bragelonne",
            "publication_year": 2009,
            "page_count": 784,
            "chapter_count": 92,
            "price": 25.00,
            "format": "Broché",
            "genres": ["Fantasy", "Heroic Fantasy", "Conte épique"],
            "tags": ["Musique", "Académie de magie", "Auberge", "Légende"],
            "popularity_score": 4.6,
            "cover_url": "https://m.media-amazon.com/images/I/81fH5hYvJGL._AC_UF1000,1000_QL80_.jpg",
            "status": "Terminé",
            "pal_month": "2026-09",
            "pal_year": 2026,
            "current_page": 784,
            "started_at": "2026-09-01",
            "finished_at": "2026-09-28",
            "rating_global": 5.0,
            "rating_pacing": 4.5,
            "rating_chars": 5.0,
            "rating_world": 5.0,
            "rating_writing": 5.0,
            "rating_plot": 4.75,
            "final_review": "Un chef-d'œuvre absolu de narration poétique. La plume de Rothfuss donne vie à Kvothe comme aucun autre roman de fantasy moderne."
        },
        {
            "isbn": "9782811205379",
            "title": "La Peur du Sage",
            "series_name": "Chronique du Tueur de Roi",
            "series_volume": 2.0,
            "author": "Patrick Rothfuss",
            "author_country": "États-Unis",
            "publisher": "Bragelonne",
            "publication_year": 2012,
            "page_count": 1024,
            "chapter_count": 152,
            "price": 28.00,
            "format": "Broché",
            "genres": ["Fantasy", "Heroic Fantasy"],
            "tags": ["Féerie", "Voyage", "Arts martiaux Adem", "Cour royale"],
            "popularity_score": 4.5,
            "cover_url": "https://m.media-amazon.com/images/I/91t1KzDcfhL._AC_UF1000,1000_QL80_.jpg",
            "status": "En cours",
            "pal_month": "2026-10",
            "pal_year": 2026,
            "current_page": 445,
            "started_at": "2026-10-10",
            "finished_at": None,
            "rating_global": None,
            "rating_pacing": None,
            "rating_chars": None,
            "rating_world": None,
            "rating_writing": None,
            "rating_plot": None,
            "final_review": None
        },
        {
            "isbn": "9782915793611",
            "title": "Gagner la Guerre",
            "series_name": "Vieux Royaume",
            "series_volume": 1.0,
            "author": "Jean-Philippe Jaworski",
            "author_country": "France",
            "publisher": "Les Moutons Électriques",
            "publication_year": 2009,
            "page_count": 980,
            "chapter_count": 35,
            "price": 26.90,
            "format": "Broché",
            "genres": ["Fantasy", "Grimdark", "Fantasy Historique"],
            "tags": ["Politique", "Assassin", "Venise imaginaire", "Machiavélisme", "Complots"],
            "popularity_score": 4.7,
            "cover_url": "https://m.media-amazon.com/images/I/81dG2tYJ3mL._AC_UF1000,1000_QL80_.jpg",
            "status": "Terminé",
            "pal_month": "2026-08",
            "pal_year": 2026,
            "current_page": 980,
            "started_at": "2026-08-05",
            "finished_at": "2026-08-30",
            "rating_global": 4.75,
            "rating_pacing": 4.5,
            "rating_chars": 5.0,
            "rating_world": 5.0,
            "rating_writing": 5.0,
            "rating_plot": 4.5,
            "final_review": "Benvenuto Sassone est l'un des personnages les plus savoureux de la fantasy francophone. Un style d'une richesse éblouissante !"
        },
        {
            "isbn": "9782070463428",
            "title": "Le Sentiment du Fer",
            "series_name": "Vieux Royaume",
            "series_volume": 2.0,
            "author": "Jean-Philippe Jaworski",
            "author_country": "France",
            "publisher": "Folio SF",
            "publication_year": 2015,
            "page_count": 448,
            "chapter_count": 7,
            "price": 8.90,
            "format": "Poche",
            "genres": ["Fantasy", "Nouvelles"],
            "tags": ["Guerre", "Honneur", "Duels", "Chevalerie"],
            "popularity_score": 4.3,
            "cover_url": "https://m.media-amazon.com/images/I/71u9sX7LpUL._AC_UF1000,1000_QL80_.jpg",
            "status": "Bibliothèque",
            "pal_month": "2026-11",
            "pal_year": 2026,
            "current_page": 0,
            "started_at": None,
            "finished_at": None,
            "rating_global": None,
            "final_review": None
        },
        {
            "isbn": "9782253191230",
            "title": "La Voie des Rois",
            "series_name": "Les Archives de Roshar",
            "series_volume": 1.0,
            "author": "Brandon Sanderson",
            "author_country": "États-Unis",
            "publisher": "Le Livre de Poche",
            "publication_year": 2015,
            "page_count": 1440,
            "chapter_count": 75,
            "price": 14.20,
            "format": "Poche",
            "genres": ["Fantasy", "High Fantasy", "Épique"],
            "tags": ["Tempêtes", "Armures magiques", "Esclavage", "Guerre", "Héroïsme"],
            "popularity_score": 4.8,
            "cover_url": "https://m.media-amazon.com/images/I/91tK4vIomgL._AC_UF1000,1000_QL80_.jpg",
            "status": "Terminé",
            "pal_month": "2026-07",
            "pal_year": 2026,
            "current_page": 1440,
            "started_at": "2026-07-01",
            "finished_at": "2026-07-31",
            "rating_global": 4.75,
            "rating_pacing": 4.25,
            "rating_chars": 4.75,
            "rating_world": 5.0,
            "rating_writing": 4.0,
            "rating_plot": 5.0,
            "final_review": "Un univers immense, un système de magie unique. Le final de Kaladin donne des frissons."
        },
        {
            "isbn": "9782253191254",
            "title": "Le Chevalier des Éclats",
            "series_name": "Les Archives de Roshar",
            "series_volume": 2.0,
            "author": "Brandon Sanderson",
            "author_country": "États-Unis",
            "publisher": "Le Livre de Poche",
            "publication_year": 2016,
            "page_count": 1408,
            "chapter_count": 89,
            "price": 14.90,
            "format": "Poche",
            "genres": ["Fantasy", "High Fantasy"],
            "tags": ["Chevaliers Radieux", "Ponts", "Secrets", "Bataille"],
            "popularity_score": 4.85,
            "cover_url": "https://m.media-amazon.com/images/I/91X+qGz3GQL._AC_UF1000,1000_QL80_.jpg",
            "status": "En cours",
            "pal_month": "2026-10",
            "pal_year": 2026,
            "current_page": 220,
            "started_at": "2026-10-18",
            "finished_at": None,
            "rating_global": None,
            "final_review": None
        },
        {
            "isbn": "9782253191278",
            "title": "Justicière",
            "series_name": "Les Archives de Roshar",
            "series_volume": 3.0,
            "author": "Brandon Sanderson",
            "author_country": "États-Unis",
            "publisher": "Le Livre de Poche",
            "publication_year": 2019,
            "page_count": 1480,
            "chapter_count": 95,
            "price": 15.50,
            "format": "Poche",
            "genres": ["Fantasy", "High Fantasy"],
            "tags": ["Cité engloutie", "Psychologie", "Guerre totale"],
            "popularity_score": 4.7,
            "cover_url": "https://m.media-amazon.com/images/I/91hZlGvY0eL._AC_UF1000,1000_QL80_.jpg",
            "status": "À acheter",
            "pal_month": None,
            "pal_year": 2026,
            "current_page": 0,
            "started_at": None,
            "finished_at": None,
            "rating_global": None,
            "final_review": None
        },
        {
            "isbn": "9782811231873",
            "title": "Le Prieuré de l'Oranger",
            "series_name": "Les Racines du Chaos",
            "series_volume": 1.0,
            "author": "Samantha Shannon",
            "author_country": "Royaume-Uni",
            "publisher": "De Saxus",
            "publication_year": 2019,
            "page_count": 992,
            "chapter_count": 60,
            "price": 24.90,
            "format": "Relié",
            "genres": ["Fantasy", "Feminist Fantasy"],
            "tags": ["Dragons", "Reine", "Magie de l'Inys", "Orient vs Occident"],
            "popularity_score": 4.4,
            "cover_url": "https://m.media-amazon.com/images/I/91XQh-o65bL._AC_UF1000,1000_QL80_.jpg",
            "status": "Bibliothèque",
            "pal_month": "2026-10",
            "pal_year": 2026,
            "current_page": 0,
            "started_at": None,
            "finished_at": None,
            "rating_global": None,
            "final_review": None
        },
        {
            "isbn": "9782811200107",
            "title": "La Première Leçon du Sorcier",
            "series_name": "L'Épée de Vérité",
            "series_volume": 1.0,
            "author": "Terry Goodkind",
            "author_country": "États-Unis",
            "publisher": "Bragelonne",
            "publication_year": 2004,
            "page_count": 520,
            "chapter_count": 40,
            "price": 20.00,
            "format": "Broché",
            "genres": ["Fantasy"],
            "tags": ["Magie", "Tyran", "Quête"],
            "popularity_score": 3.6,
            "cover_url": "https://m.media-amazon.com/images/I/81xU9d4N48L._AC_UF1000,1000_QL80_.jpg",
            "status": "DNF",
            "pal_month": "2026-06",
            "pal_year": 2026,
            "current_page": 160,
            "started_at": "2026-06-10",
            "finished_at": "2026-06-15",
            "rating_global": 2.0,
            "rating_pacing": 2.5,
            "rating_chars": 2.0,
            "rating_world": 3.0,
            "rating_writing": 2.0,
            "rating_plot": 2.0,
            "final_review": "Trop de facilités scénaristiques et personnages caricaturaux. Abandonné après 160 pages."
        },
        {
            "isbn": "9782072798832",
            "title": "Les Flèches d'Athéna",
            "series_name": "Le Chevalier aux Épines",
            "series_volume": 1.0,
            "author": "Jean-Philippe Jaworski",
            "author_country": "France",
            "publisher": "Les Moutons Électriques",
            "publication_year": 2023,
            "page_count": 480,
            "chapter_count": 22,
            "price": 21.90,
            "format": "Broché",
            "genres": ["Fantasy", "Chivalric Fantasy"],
            "tags": ["Tournoi", "Chevalerie", "Cour d'amour", "Enquête"],
            "popularity_score": 4.5,
            "cover_url": "https://m.media-amazon.com/images/I/81k45i3Q64L._AC_UF1000,1000_QL80_.jpg",
            "status": "Wishlist",
            "pal_month": None,
            "pal_year": 2026,
            "current_page": 0,
            "started_at": None,
            "finished_at": None,
            "rating_global": None,
            "final_review": None
        }
    ]

    book_ids = {}
    for b in books_data:
        bid = add_book(b)
        book_ids[b["title"]] = bid

    print(f"✅ {len(book_ids)} livres insérés.")

    print("⏱️ Insertion des sessions de lecture réalistes...")
    
    # Génération de sessions de lecture pour la semaine courante (du Lundi 19 au Dimanche 25 Octobre 2026)
    # et pour les semaines antérieures (pour les statistiques mensuelles et comparatifs)
    sessions = [
        # Semaine en cours (19 au 25 Octobre 2026)
        # Lundi 19 Octobre 2026 (Semaine)
        {
            "book_id": book_ids["La Peur du Sage"],
            "start_time": datetime(2026, 10, 19, 19, 0, 0),
            "end_time": datetime(2026, 10, 19, 19, 45, 0),
            "duration_minutes": 45,
            "start_page": 280,
            "end_page": 315
        },
        # Mardi 20 Octobre 2026 (Semaine)
        {
            "book_id": book_ids["La Peur du Sage"],
            "start_time": datetime(2026, 10, 20, 21, 15, 0),
            "end_time": datetime(2026, 10, 20, 22, 10, 0),
            "duration_minutes": 55,
            "start_page": 315,
            "end_page": 358
        },
        # Mercredi 21 Octobre 2026 (Semaine) - Deux sessions (deux livres différents !)
        {
            "book_id": book_ids["La Peur du Sage"],
            "start_time": datetime(2026, 10, 21, 12, 30, 0),
            "end_time": datetime(2026, 10, 21, 13, 0, 0),
            "duration_minutes": 30,
            "start_page": 358,
            "end_page": 380
        },
        {
            "book_id": book_ids["Le Chevalier des Éclats"],
            "start_time": datetime(2026, 10, 21, 20, 30, 0),
            "end_time": datetime(2026, 10, 21, 21, 40, 0),
            "duration_minutes": 70,
            "start_page": 100,
            "end_page": 155
        },
        # Jeudi 22 Octobre 2026 (Semaine)
        {
            "book_id": book_ids["Le Chevalier des Éclats"],
            "start_time": datetime(2026, 10, 22, 22, 0, 0),
            "end_time": datetime(2026, 10, 22, 22, 50, 0),
            "duration_minutes": 50,
            "start_page": 155,
            "end_page": 195
        },
        # Vendredi 23 Octobre 2026 (Semaine)
        {
            "book_id": book_ids["La Peur du Sage"],
            "start_time": datetime(2026, 10, 23, 18, 30, 0),
            "end_time": datetime(2026, 10, 23, 19, 30, 0),
            "duration_minutes": 60,
            "start_page": 380,
            "end_page": 425
        },
        # Samedi 24 Octobre 2026 (Week-end !) - Grande session
        {
            "book_id": book_ids["La Peur du Sage"],
            "start_time": datetime(2026, 10, 24, 14, 0, 0),
            "end_time": datetime(2026, 10, 24, 15, 30, 0),
            "duration_minutes": 90,
            "start_page": 425,
            "end_page": 445
        },
        {
            "book_id": book_ids["Le Chevalier des Éclats"],
            "start_time": datetime(2026, 10, 24, 16, 30, 0),
            "end_time": datetime(2026, 10, 24, 17, 30, 0),
            "duration_minutes": 60,
            "start_page": 195,
            "end_page": 220
        },

        # Sessions antérieures en Octobre pour alimenter les KPIs mensuels
        {
            "book_id": book_ids["La Peur du Sage"],
            "start_time": datetime(2026, 10, 11, 15, 0, 0),
            "end_time": datetime(2026, 10, 11, 16, 45, 0),
            "duration_minutes": 105,
            "start_page": 0,
            "end_page": 90
        },
        {
            "book_id": book_ids["La Peur du Sage"],
            "start_time": datetime(2026, 10, 13, 20, 0, 0),
            "end_time": datetime(2026, 10, 13, 21, 20, 0),
            "duration_minutes": 80,
            "start_page": 90,
            "end_page": 160
        },
        {
            "book_id": book_ids["La Peur du Sage"],
            "start_time": datetime(2026, 10, 15, 21, 0, 0),
            "end_time": datetime(2026, 10, 15, 22, 15, 0),
            "duration_minutes": 75,
            "start_page": 160,
            "end_page": 230
        },
        {
            "book_id": book_ids["La Peur du Sage"],
            "start_time": datetime(2026, 10, 17, 10, 0, 0),
            "end_time": datetime(2026, 10, 17, 11, 30, 0),
            "duration_minutes": 90,
            "start_page": 230,
            "end_page": 280
        },

        # Sessions en Septembre pour "Le Nom du Vent"
        {
            "book_id": book_ids["Le Nom du Vent"],
            "start_time": datetime(2026, 9, 20, 14, 0, 0),
            "end_time": datetime(2026, 9, 20, 16, 0, 0),
            "duration_minutes": 120,
            "start_page": 600,
            "end_page": 700
        },
        {
            "book_id": book_ids["Le Nom du Vent"],
            "start_time": datetime(2026, 9, 28, 20, 0, 0),
            "end_time": datetime(2026, 9, 28, 21, 40, 0),
            "duration_minutes": 100,
            "start_page": 700,
            "end_page": 784
        }
    ]

    for s in sessions:
        add_reading_session(s)

    print(f"✅ {len(sessions)} sessions de lecture insérées.")

    print("📝 Insertion des notes et citations...")
    notes = [
        {
            "book_id": book_ids["Le Nom du Vent"],
            "page_number": 42,
            "chapter_number": 3,
            "note_type": "Citation",
            "content": "« Il y a trois choses que tous les sages craignent : la mer par gros temps, une nuit sans lune et la colère d'un homme doux. »"
        },
        {
            "book_id": book_ids["Le Nom du Vent"],
            "page_number": 180,
            "chapter_number": 26,
            "note_type": "Citation",
            "content": "« Les mots peuvent agir comme de minuscules doses d'arsenic, absorbées sans qu'on s'en rende compte. »"
        },
        {
            "book_id": book_ids["Le Nom du Vent"],
            "page_number": 350,
            "chapter_number": 45,
            "note_type": "Théorie",
            "content": "Les Chandrians ne cherchent peut-être pas à effacer leur trace par orgueil, mais pour cacher une faiblesse liée à leur nom véritable."
        },
        {
            "book_id": book_ids["La Peur du Sage"],
            "page_number": 312,
            "chapter_number": 48,
            "note_type": "Citation",
            "content": "« L'amour commence là où s'arrêtent la prudence et la raison. »"
        },
        {
            "book_id": book_ids["La Peur du Sage"],
            "page_number": 410,
            "chapter_number": 65,
            "note_type": "Commentaire",
            "content": "Scène fascinante chez les Adem. L'usage du langage des gestes et du regard apporte une dynamique sociale ultra originale."
        },
        {
            "book_id": book_ids["Gagner la Guerre"],
            "page_number": 15,
            "chapter_number": 1,
            "note_type": "Citation",
            "content": "« On prend toujours un risque à vouloir régler leurs comptes aux vivants ; il vaut mieux se fier aux morts. »"
        },
        {
            "book_id": book_ids["La Voie des Rois"],
            "page_number": 720,
            "chapter_number": 43,
            "note_type": "Citation",
            "content": "« La vie avant la mort. La force avant la faiblesse. Le voyage avant la destination. »"
        }
    ]

    for n in notes:
        add_book_note(n)

    print(f"✅ {len(notes)} notes/citations insérées.")
    print("✨ Base de données initialisée avec succès !")

if __name__ == "__main__":
    seed()
