import os
import json
from datetime import datetime, date
from typing import List, Dict, Any, Optional

import streamlit as st
from sqlalchemy import (
    create_engine, Column, Integer, Float, String, Text, Boolean,
    DateTime, Date, ForeignKey, text
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, scoped_session

def invalidate_cache():
    """Invalide le cache Streamlit en mémoire lors de toute écriture en base."""
    try:
        st.cache_data.clear()
    except Exception:
        pass

# Configuration de la base de données (SQLite en local ou PostgreSQL/Supabase en production)
def get_database_url() -> str:
    # 1. Tentative de lecture depuis st.secrets (Streamlit)
    try:
        import streamlit as st
        if "DATABASE_URL" in st.secrets:
            url = st.secrets["DATABASE_URL"]
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql://", 1)
            return url
    except Exception:
        pass

    # 2. Variable d'environnement
    env_url = os.environ.get("DATABASE_URL")
    if env_url:
        if env_url.startswith("postgres://"):
            env_url = env_url.replace("postgres://", "postgresql://", 1)
        return env_url

    # 3. Base locale SQLite par défaut
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "reading_tracker.db")
    return f"sqlite:///{db_path}"

DATABASE_URL = get_database_url()

@st.cache_resource
def get_engine():
    return create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
        pool_pre_ping=True
    )

engine = get_engine()

SessionLocal = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=engine))
Base = declarative_base()


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, autoincrement=True)
    isbn = Column(String(20), index=True, nullable=True)
    title = Column(Text, nullable=False)
    series_name = Column(Text, nullable=True)
    series_volume = Column(Float, nullable=True)
    author = Column(Text, nullable=False)
    author_country = Column(String(100), nullable=True)
    publisher = Column(String(150), nullable=True)
    publication_year = Column(Integer, nullable=True)
    page_count = Column(Integer, nullable=False, default=1)
    chapter_count = Column(Integer, nullable=True)
    price = Column(Float, nullable=True)
    format = Column(String(50), nullable=True)  # Broché, Poche, Relié, Numérique, Audio
    genres = Column(Text, default="[]")  # Stocké en JSON
    tags = Column(Text, default="[]")    # Stocké en JSON
    fantasy_subgenre = Column(String(100), nullable=True)  # Sous-genre spécifique de Fantasy
    popularity_score = Column(Float, nullable=True)
    cover_url = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="Bibliothèque")  # En cours, Bibliothèque, Wishlist, À acheter, Terminé, DNF
    pal_month = Column(String(7), nullable=True)  # YYYY-MM
    pal_year = Column(Integer, nullable=True)     # YYYY
    current_page = Column(Integer, nullable=False, default=0)
    started_at = Column(Date, nullable=True)
    finished_at = Column(Date, nullable=True)
    rating_global = Column(Float, nullable=True)   # Note /5
    rating_pacing = Column(Float, nullable=True)   # /5
    rating_chars = Column(Float, nullable=True)    # /5
    rating_world = Column(Float, nullable=True)    # /5
    rating_writing = Column(Float, nullable=True)  # /5
    rating_plot = Column(Float, nullable=True)     # /5
    final_review = Column(Text, nullable=True)

    sessions = relationship("ReadingSession", back_populates="book", cascade="all, delete-orphan", order_by="ReadingSession.start_time.desc()")
    notes = relationship("BookNote", back_populates="book", cascade="all, delete-orphan", order_by="BookNote.created_at.desc()")

    def to_dict(self) -> Dict[str, Any]:
        try:
            parsed_genres = json.loads(self.genres) if self.genres else []
        except Exception:
            parsed_genres = [g.strip() for g in self.genres.split(",") if g.strip()] if self.genres else []

        try:
            parsed_tags = json.loads(self.tags) if self.tags else []
        except Exception:
            parsed_tags = [t.strip() for t in self.tags.split(",") if t.strip()] if self.tags else []

        try:
            parsed_subg = json.loads(self.fantasy_subgenre) if self.fantasy_subgenre else []
            if isinstance(parsed_subg, str):
                parsed_subg = [s.strip() for s in parsed_subg.split(",") if s.strip()]
        except Exception:
            parsed_subg = [s.strip() for s in self.fantasy_subgenre.split(",") if s.strip()] if self.fantasy_subgenre else []

        return {
            "id": self.id,
            "isbn": self.isbn or "",
            "title": self.title,
            "series_name": self.series_name or "",
            "series_volume": self.series_volume,
            "author": self.author,
            "author_country": self.author_country or "Inconnu",
            "publisher": self.publisher or "",
            "publication_year": self.publication_year,
            "page_count": self.page_count or 1,
            "chapter_count": self.chapter_count,
            "price": self.price,
            "format": self.format or "Broché",
            "genres": parsed_genres,
            "tags": parsed_tags,
            "fantasy_subgenres": parsed_subg,
            "fantasy_subgenre": ", ".join(parsed_subg) if parsed_subg else "",
            "popularity_score": self.popularity_score,
            "cover_url": self.cover_url or "",
            "status": self.status,
            "pal_month": self.pal_month or "",
            "pal_year": self.pal_year,
            "current_page": self.current_page or 0,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "rating_global": self.rating_global,
            "rating_pacing": self.rating_pacing,
            "rating_chars": self.rating_chars,
            "rating_world": self.rating_world,
            "rating_writing": self.rating_writing,
            "rating_plot": self.rating_plot,
            "final_review": self.final_review or ""
        }


class ReadingSession(Base):
    __tablename__ = "reading_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    duration_minutes = Column(Float, nullable=False)
    start_page = Column(Integer, nullable=False)
    end_page = Column(Integer, nullable=False)
    pages_read = Column(Integer, nullable=False)
    pages_per_hour = Column(Float, nullable=False)
    is_weekend = Column(Boolean, nullable=False)

    book = relationship("Book", back_populates="sessions")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "book_id": self.book_id,
            "book_title": self.book.title if self.book else "",
            "book_cover": self.book.cover_url if self.book else "",
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_minutes": round(self.duration_minutes, 1),
            "start_page": self.start_page,
            "end_page": self.end_page,
            "pages_read": self.pages_read,
            "pages_per_hour": round(self.pages_per_hour, 1),
            "is_weekend": self.is_weekend
        }


class BookNote(Base):
    __tablename__ = "book_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    page_number = Column(Integer, nullable=True)
    chapter_number = Column(Integer, nullable=True)
    note_type = Column(String(30), nullable=False)  # Citation, Commentaire, Théorie, Personnage
    content = Column(Text, nullable=False)

    book = relationship("Book", back_populates="notes")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "book_id": self.book_id,
            "book_title": self.book.title if self.book else "",
            "created_at": self.created_at,
            "page_number": self.page_number,
            "chapter_number": self.chapter_number,
            "note_type": self.note_type,
            "content": self.content
        }


@st.cache_resource
def init_db():
    """Initialise les tables de la base de données et applique les migrations douces."""
    Base.metadata.create_all(bind=engine)
    try:
        with engine.begin() as conn:
            if DATABASE_URL.startswith("sqlite"):
                cols = [row[1] for row in conn.execute(text("PRAGMA table_info(books)")).fetchall()]
                if "fantasy_subgenre" not in cols:
                    conn.execute(text("ALTER TABLE books ADD COLUMN fantasy_subgenre VARCHAR(100)"))
            else:
                conn.execute(text("ALTER TABLE books ADD COLUMN IF NOT EXISTS fantasy_subgenre VARCHAR(100)"))
    except Exception as e:
        print(f"Migration note (fantasy_subgenre): {e}")


# ==========================================
# CRUD & Requetes Metier
# ==========================================

def add_book(data: Dict[str, Any]) -> int:
    """Ajoute un livre et retourne son ID."""
    session = SessionLocal()
    try:
        # Sérialisation des listes en JSON
        genres = data.get("genres", [])
        if isinstance(genres, list):
            genres_str = json.dumps(genres, ensure_ascii=False)
        else:
            genres_str = json.dumps([g.strip() for g in str(genres).split(",") if g.strip()], ensure_ascii=False)

        tags = data.get("tags", [])
        if isinstance(tags, list):
            tags_str = json.dumps(tags, ensure_ascii=False)
        else:
            tags_str = json.dumps([t.strip() for t in str(tags).split(",") if t.strip()], ensure_ascii=False)

        subg = data.get("fantasy_subgenres")
        if subg is None:
            subg = data.get("fantasy_subgenre", [])
        if isinstance(subg, list):
            subg_str = json.dumps(subg, ensure_ascii=False)
        elif isinstance(subg, str):
            try:
                json.loads(subg)
                subg_str = subg
            except Exception:
                subg_str = json.dumps([s.strip() for s in subg.split(",") if s.strip()], ensure_ascii=False)
        else:
            subg_str = json.dumps([], ensure_ascii=False)

        started_at = data.get("started_at")
        if isinstance(started_at, str) and started_at:
            started_at = datetime.strptime(started_at, "%Y-%m-%d").date()

        finished_at = data.get("finished_at")
        if isinstance(finished_at, str) and finished_at:
            finished_at = datetime.strptime(finished_at, "%Y-%m-%d").date()

        book = Book(
            isbn=data.get("isbn") or None,
            title=data.get("title", "Sans titre"),
            series_name=data.get("series_name") or None,
            series_volume=float(data["series_volume"]) if data.get("series_volume") not in (None, "") else None,
            author=data.get("author", "Auteur inconnu"),
            author_country=data.get("author_country") or None,
            publisher=data.get("publisher") or None,
            publication_year=int(data["publication_year"]) if data.get("publication_year") not in (None, "") else None,
            page_count=int(data.get("page_count", 1)) or 1,
            chapter_count=int(data["chapter_count"]) if data.get("chapter_count") not in (None, "") else None,
            price=float(data["price"]) if data.get("price") not in (None, "") else None,
            format=data.get("format", "Broché"),
            genres=genres_str,
            tags=tags_str,
            fantasy_subgenre=subg_str,
            popularity_score=float(data["popularity_score"]) if data.get("popularity_score") not in (None, "") else None,
            cover_url=data.get("cover_url") or None,
            status=data.get("status", "Bibliothèque"),
            pal_month=data.get("pal_month") or None,
            pal_year=int(data["pal_year"]) if data.get("pal_year") not in (None, "") else None,
            current_page=int(data.get("current_page", 0)),
            started_at=started_at,
            finished_at=finished_at,
            rating_global=float(data["rating_global"]) if data.get("rating_global") not in (None, "") else None,
            rating_pacing=float(data["rating_pacing"]) if data.get("rating_pacing") not in (None, "") else None,
            rating_chars=float(data["rating_chars"]) if data.get("rating_chars") not in (None, "") else None,
            rating_world=float(data["rating_world"]) if data.get("rating_world") not in (None, "") else None,
            rating_writing=float(data["rating_writing"]) if data.get("rating_writing") not in (None, "") else None,
            rating_plot=float(data["rating_plot"]) if data.get("rating_plot") not in (None, "") else None,
            final_review=data.get("final_review") or None,
        )
        session.add(book)
        session.commit()
        session.refresh(book)
        new_id = book.id
        invalidate_cache()
        return new_id
    finally:
        session.close()


@st.cache_data(ttl=3600, show_spinner=False)
def get_book(book_id: int) -> Optional[Dict[str, Any]]:
    """Récupère un livre par son ID."""
    session = SessionLocal()
    try:
        book = session.query(Book).filter(Book.id == book_id).first()
        return book.to_dict() if book else None
    finally:
        session.close()


@st.cache_data(ttl=3600, show_spinner=False)
def get_all_books(
    status: Optional[str] = None,
    pal_month: Optional[str] = None,
    pal_year: Optional[int] = None,
    search: Optional[str] = None,
    fantasy_subgenre: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Récupère tous les livres selon les filtres spécifiés."""
    session = SessionLocal()
    try:
        query = session.query(Book)
        if status and status != "Tous":
            query = query.filter(Book.status == status)
        if pal_month:
            query = query.filter(Book.pal_month == pal_month)
        if pal_year:
            query = query.filter(Book.pal_year == pal_year)
        books = query.order_by(Book.id.desc()).all()
        result = [b.to_dict() for b in books]

        if fantasy_subgenre and fantasy_subgenre != "Tous":
            target_subg = fantasy_subgenre.lower().strip()
            result = [
                b for b in result
                if any(target_subg == s.lower().strip() for s in b.get("fantasy_subgenres", []))
            ]

        if search:
            s_low = search.lower()
            result = [
                b for b in result
                if s_low in b["title"].lower()
                or s_low in b["author"].lower()
                or s_low in (b["series_name"] or "").lower()
                or s_low in (b.get("fantasy_subgenre") or "").lower()
                or any(s_low in g.lower() for g in b["genres"])
                or any(s_low in t.lower() for t in b["tags"])
            ]

        return result
    finally:
        session.close()


def update_book(book_id: int, data: Dict[str, Any]) -> bool:
    """Met à jour un livre existant."""
    session = SessionLocal()
    try:
        book = session.query(Book).filter(Book.id == book_id).first()
        if not book:
            return False

        for key, val in data.items():
            if key in ("genres", "tags", "fantasy_subgenre", "fantasy_subgenres"):
                target_col = "fantasy_subgenre" if key in ("fantasy_subgenre", "fantasy_subgenres") else key
                if isinstance(val, list):
                    setattr(book, target_col, json.dumps(val, ensure_ascii=False))
                elif isinstance(val, str):
                    try:
                        # vérifie si c'est déjà du json valide
                        json.loads(val)
                        setattr(book, target_col, val)
                    except Exception:
                        setattr(book, target_col, json.dumps([x.strip() for x in val.split(",") if x.strip()], ensure_ascii=False))
                elif val is None:
                    setattr(book, target_col, json.dumps([], ensure_ascii=False))
            elif key in ("started_at", "finished_at"):
                if isinstance(val, str) and val:
                    setattr(book, key, datetime.strptime(val, "%Y-%m-%d").date())
                elif isinstance(val, (date, datetime)):
                    setattr(book, key, val if isinstance(val, date) else val.date())
                elif val is None:
                    setattr(book, key, None)
            elif key in ("series_volume", "price", "popularity_score", "rating_global", 
                         "rating_pacing", "rating_chars", "rating_world", "rating_writing", "rating_plot"):
                setattr(book, key, float(val) if val not in (None, "") else None)
            elif key in ("page_count", "chapter_count", "current_page", "pal_year", "publication_year"):
                setattr(book, key, int(val) if val not in (None, "") else None)
            elif hasattr(book, key):
                setattr(book, key, val)

        session.commit()
        invalidate_cache()
        return True
    finally:
        session.close()


def delete_book(book_id: int) -> bool:
    """Supprime un livre et ses données associées en cascade."""
    session = SessionLocal()
    try:
        book = session.query(Book).filter(Book.id == book_id).first()
        if not book:
            return False
        session.delete(book)
        session.commit()
        invalidate_cache()
        return True
    finally:
        session.close()


def add_reading_session(data: Dict[str, Any]) -> int:
    """Enregistre une session de lecture et met à jour books.current_page."""
    session = SessionLocal()
    try:
        book_id = data["book_id"]
        start_time = data["start_time"]
        end_time = data["end_time"]
        start_page = int(data["start_page"])
        end_page = int(data["end_page"])
        duration_minutes = float(data.get("duration_minutes", 0))

        if duration_minutes <= 0:
            duration_minutes = max((end_time - start_time).total_seconds() / 60.0, 1.0)

        pages_read = max(end_page - start_page, 0)
        pages_per_hour = (pages_read / duration_minutes) * 60.0 if duration_minutes > 0 else 0.0

        # Vérifie si samedi (5) ou dimanche (6)
        is_weekend = start_time.weekday() in (5, 6)

        reading_session = ReadingSession(
            book_id=book_id,
            start_time=start_time,
            end_time=end_time,
            duration_minutes=duration_minutes,
            start_page=start_page,
            end_page=end_page,
            pages_read=pages_read,
            pages_per_hour=pages_per_hour,
            is_weekend=is_weekend
        )
        session.add(reading_session)

        # Mise à jour de la page actuelle du livre si supérieure
        book = session.query(Book).filter(Book.id == book_id).first()
        if book:
            if end_page > (book.current_page or 0):
                book.current_page = end_page
            if not book.started_at:
                book.started_at = start_time.date()
            if book.status in ("Bibliothèque", "Wishlist", "À acheter"):
                book.status = "En cours"

        session.commit()
        session.refresh(reading_session)
        new_id = reading_session.id
        invalidate_cache()
        return new_id
    finally:
        session.close()


@st.cache_data(ttl=3600, show_spinner=False)
def get_reading_sessions(
    book_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> List[Dict[str, Any]]:
    """Récupère l'historique des sessions de lecture."""
    session = SessionLocal()
    try:
        query = session.query(ReadingSession)
        if book_id:
            query = query.filter(ReadingSession.book_id == book_id)
        if start_date:
            query = query.filter(ReadingSession.start_time >= start_date)
        if end_date:
            query = query.filter(ReadingSession.start_time <= end_date)
            
        sessions = query.order_by(ReadingSession.start_time.desc()).all()
        return [s.to_dict() for s in sessions]
    finally:
        session.close()


def delete_reading_session(session_id: int) -> bool:
    """Supprime une session de lecture."""
    session = SessionLocal()
    try:
        s = session.query(ReadingSession).filter(ReadingSession.id == session_id).first()
        if not s:
            return False
        session.delete(s)
        session.commit()
        invalidate_cache()
        return True
    finally:
        session.close()


def add_book_note(data: Dict[str, Any]) -> int:
    """Ajoute une note ou citation."""
    session = SessionLocal()
    try:
        created_at = data.get("created_at") or datetime.utcnow()
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)

        note = BookNote(
            book_id=data["book_id"],
            created_at=created_at,
            page_number=int(data["page_number"]) if data.get("page_number") not in (None, "") else None,
            chapter_number=int(data["chapter_number"]) if data.get("chapter_number") not in (None, "") else None,
            note_type=data.get("note_type", "Commentaire"),
            content=data["content"].strip()
        )
        session.add(note)
        session.commit()
        session.refresh(note)
        new_id = note.id
        invalidate_cache()
        return new_id
    finally:
        session.close()


@st.cache_data(ttl=3600, show_spinner=False)
def get_book_notes(book_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Récupère les notes associées à un livre (ou toutes les notes)."""
    session = SessionLocal()
    try:
        query = session.query(BookNote)
        if book_id:
            query = query.filter(BookNote.book_id == book_id)
        # Tri par page_number ascendant puis date
        notes = query.order_by(BookNote.page_number.asc().nulls_last(), BookNote.created_at.desc()).all()
        return [n.to_dict() for n in notes]
    finally:
        session.close()


def delete_book_note(note_id: int) -> bool:
    """Supprime une note."""
    session = SessionLocal()
    try:
        note = session.query(BookNote).filter(BookNote.id == note_id).first()
        if not note:
            return False
        session.delete(note)
        session.commit()
        invalidate_cache()
        return True
    finally:
        session.close()


@st.cache_data(ttl=3600, show_spinner=False)
def get_series_to_buy() -> List[Dict[str, Any]]:
    """
    Logique 'Suites de séries à acheter' :
    Identifie les livres marqués 'À acheter' faisant partie d'une série,
    ou les séries dont un tome est 'Terminé' et dont le tome suivant n'est pas encore lu/en bibliothèque.
    """
    session = SessionLocal()
    try:
        # 1. Livres explicitement au statut 'À acheter'
        explicit_to_buy = session.query(Book).filter(Book.status == "À acheter").all()
        results = [b.to_dict() for b in explicit_to_buy]
        explicit_ids = {b["id"] for b in results}

        # 2. Séries dont un tome est terminé et dont le tome suivant (series_volume + 1) existe ou est manquant
        series_books = session.query(Book).filter(Book.series_name != None).all()
        series_dict: Dict[str, List[Book]] = {}
        for b in series_books:
            s_name = b.series_name.strip()
            if s_name:
                series_dict.setdefault(s_name, []).append(b)

        for s_name, b_list in series_dict.items():
            # Trouver le tome max terminé
            finished_volumes = [b.series_volume for b in b_list if b.status == "Terminé" and b.series_volume is not None]
            if finished_volumes:
                max_finished = max(finished_volumes)
                # Trouver les tomes possédés supérieurs
                for b in b_list:
                    if b.id not in explicit_ids and b.series_volume is not None and b.series_volume > max_finished and b.status not in ("Terminé", "En cours"):
                        b_dict = b.to_dict()
                        b_dict["is_auto_suggested_next"] = True
                        b_dict["previous_volume_finished"] = max_finished
                        results.append(b_dict)
                        explicit_ids.add(b.id)

        return results
    finally:
        session.close()


@st.cache_data(ttl=3600, show_spinner=False)
def get_books_by_series(series_name: str, author: str = "") -> List[Dict[str, Any]]:
    """Récupère tous les livres d'une saga présents dans la base de données, triés par tome."""
    if not series_name:
        return []
    session = SessionLocal()
    try:
        from core.metadata_fetcher import is_series_match, matches_author
        clean = series_name.strip()
        books = session.query(Book).filter(
            Book.series_name != None
        ).order_by(Book.series_volume.asc(), Book.id.asc()).all()
        matched = []
        for b in books:
            d = b.to_dict()
            if not is_series_match(d.get("series_name"), clean):
                continue
            if author and d.get("author") and not matches_author(d["author"], author):
                continue
            matched.append(d)
        return matched
    finally:
        session.close()


def add_series_next_volume_to_wishlist(book_id: int, target_status: str = "Wishlist") -> Optional[int]:
    """
    Ajoute automatiquement le tome suivant réel d'une saga à la Wishlist (ou À acheter)
    s'il existe, est publié et n'est pas déjà présent dans la collection.
    Si le tome suivant n'existe pas ou n'est pas publié, ne fait rien et retourne None.
    """
    book = get_book(book_id)
    if not book or not book.get("series_name"):
        return None

    s_name = book["series_name"].strip()
    cur_vol = float(book.get("series_volume") or 1.0)

    from core.metadata_fetcher import find_next_series_volume
    next_vol_info = find_next_series_volume(s_name, book.get("author", ""), cur_vol, book_title=book.get("title", ""))

    # Si aucun tome suivant n'existe ou s'il n'est pas publié, ne rien faire
    if not next_vol_info or not next_vol_info.get("is_published"):
        return None

    next_vol_num = float(next_vol_info["series_volume"])

    # Vérifier si le tome suivant existe déjà dans la base
    existing = get_books_by_series(s_name, book.get("author", ""))
    for eb in existing:
        if eb.get("series_volume") is not None and abs(float(eb["series_volume"]) - next_vol_num) < 0.05:
            return eb["id"]  # Déjà présent

    payload = {
        "title": next_vol_info.get("title") or f"{s_name} (Tome {next_vol_num:g})",
        "series_name": s_name,
        "series_volume": next_vol_num,
        "author": next_vol_info.get("author") or book.get("author", "Auteur inconnu"),
        "author_country": book.get("author_country", "France"),
        "publisher": book.get("publisher"),
        "format": book.get("format", "Broché"),
        "genres": book.get("genres", ["Fantasy"]),
        "tags": book.get("tags", []),
        "fantasy_subgenres": book.get("fantasy_subgenres", []),
        "fantasy_subgenre": book.get("fantasy_subgenres", []),
        "cover_url": next_vol_info.get("cover_url") or None,
        "status": target_status,
        "current_page": 0,
        "page_count": next_vol_info.get("num_pages") or book.get("page_count", 300)
    }
    return add_book(payload)
