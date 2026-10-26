"""
Utilitaires de gestion et de formatage des dates, mois et années en clair pour Statome.
"""

from datetime import datetime, date
from typing import Optional, Tuple

FRENCH_MONTHS = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
]

MONTH_TO_NUM = {m: f"{i+1:02d}" for i, m in enumerate(FRENCH_MONTHS)}
NUM_TO_MONTH = {f"{i+1:02d}": m for i, m in enumerate(FRENCH_MONTHS)}
NUM_TO_MONTH.update({str(i+1): m for i, m in enumerate(FRENCH_MONTHS)})


def get_current_month_name() -> str:
    """Retourne le nom en clair du mois courant en français (ex: 'Octobre')."""
    return FRENCH_MONTHS[datetime.now().month - 1]


def get_month_name_from_date(d: date) -> str:
    """Retourne le nom en clair du mois pour une date donnée."""
    return FRENCH_MONTHS[d.month - 1]


def format_month_year_french(d: Optional[date] = None, yyyy_mm: Optional[str] = None) -> str:
    """
    Formate un mois et une année en français (ex: 'Octobre 2026').
    Accepte un objet date ou une chaîne 'YYYY-MM'.
    """
    if yyyy_mm and "-" in yyyy_mm:
        try:
            parts = yyyy_mm.split("-")
            yr = parts[0]
            m_num = f"{int(parts[1]):02d}"
            m_name = NUM_TO_MONTH.get(m_num, m_num)
            return f"{m_name} {yr}"
        except Exception:
            return yyyy_mm

    target_date = d or date.today()
    return f"{FRENCH_MONTHS[target_date.month - 1]} {target_date.year}"


def split_pal_month(pal_month_str: Optional[str]) -> Tuple[str, Optional[int]]:
    """
    Décompose une chaîne 'YYYY-MM' stockée en base en (Nom du mois, Année).
    Retourne ('Aucun', None) si vide.
    """
    if not pal_month_str or "-" not in pal_month_str:
        return "Aucun", None

    try:
        parts = pal_month_str.split("-")
        yr = int(parts[0])
        m_num = f"{int(parts[1]):02d}"
        m_name = NUM_TO_MONTH.get(m_num, "Aucun")
        return m_name, yr
    except Exception:
        return "Aucun", None


def build_pal_month_string(month_name: str, year_val: Optional[int]) -> Optional[str]:
    """
    Construit la chaîne standard 'YYYY-MM' à partir du nom du mois et de l'année.
    Retourne None si le mois est 'Aucun' ou non renseigné.
    """
    if not month_name or month_name == "Aucun" or month_name not in MONTH_TO_NUM:
        return None

    yr = year_val or datetime.now().year
    m_num = MONTH_TO_NUM[month_name]
    return f"{yr}-{m_num}"
