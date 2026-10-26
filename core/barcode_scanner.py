"""
Module de décodage de code-barres pour ISBN-13 / EAN-13.
Chaîne de résilience complète :
1. Décodage 1D natif haute performance via zxing-cpp et pyzbar (avec multiples recadrages et filtres).
2. Moteur OCR de secours (RapidOCR ONNX) pour extraire l'ISBN textuel imprimé
   (ex: 'ISBN : 978-2-080-47097-3' ou les chiffres sous le code) si les barres 1D sont floues.
"""

from typing import Optional, List
import io
import re
from PIL import Image, ImageEnhance, ImageOps, ImageFilter
import numpy as np


def clean_isbn(raw_code: str) -> Optional[str]:
    """Nettoie et valide une chaîne pour en extraire un ISBN/EAN standard."""
    if not raw_code:
        return None
    cleaned = "".join(c for c in raw_code if c.isdigit() or c in ("X", "x"))
    
    # EAN-13 standard
    if len(cleaned) == 13 and (cleaned.startswith("978") or cleaned.startswith("979")):
        return cleaned
    elif len(cleaned) == 13:
        return cleaned
    
    # Si ISBN-10, conversion en ISBN-13
    if len(cleaned) == 10:
        base = "978" + cleaned[:-1]
        total = sum(int(num) * (1 if idx % 2 == 0 else 3) for idx, num in enumerate(base))
        check_digit = (10 - (total % 10)) % 10
        return f"{base}{check_digit}"

    # Si 12 chiffres commençant par 78 ou 79 (chiffre 9 initial omis par l'OCR)
    if len(cleaned) == 12 and (cleaned.startswith("78") or cleaned.startswith("79")):
        return "9" + cleaned

    # Si 11 chiffres commençant par 82 (97 initial omis)
    if len(cleaned) == 11 and cleaned.startswith("82"):
        return "97" + cleaned

    return cleaned if len(cleaned) in (10, 13) else None


def _decode_with_zxing(img: Image.Image) -> Optional[str]:
    """Tente le décodage d'une image avec zxingcpp."""
    try:
        import zxingcpp
        target_formats = (
            zxingcpp.BarcodeFormat.EAN13
            | zxingcpp.BarcodeFormat.EAN8
            | zxingcpp.BarcodeFormat.UPCA
            | zxingcpp.BarcodeFormat.UPCE
            | zxingcpp.BarcodeFormat.Code128
            | zxingcpp.BarcodeFormat.ISBN
        )

        for binarizer in [zxingcpp.Binarizer.LocalAverage, zxingcpp.Binarizer.GlobalHistogram]:
            results = zxingcpp.read_barcodes(
                img,
                formats=target_formats,
                try_rotate=True,
                try_downscale=True,
                try_invert=True,
                binarizer=binarizer
            )
            for res in results:
                cleaned = clean_isbn(res.text)
                if cleaned:
                    return cleaned
    except ImportError:
        pass
    except Exception as e:
        print(f"Erreur zxingcpp: {e}")
    return None


def _decode_with_pyzbar(img: Image.Image) -> Optional[str]:
    """Tente le décodage avec pyzbar."""
    try:
        from pyzbar.pyzbar import decode, ZBarSymbol
        gray_img = img.convert("L") if img.mode != "L" else img
        decoded_objects = decode(
            gray_img,
            symbols=[ZBarSymbol.EAN13, ZBarSymbol.ISBN13, ZBarSymbol.CODE128, ZBarSymbol.UPCA, ZBarSymbol.UPCE]
        )
        for obj in decoded_objects:
            raw = obj.data.decode("utf-8", errors="ignore")
            cleaned = clean_isbn(raw)
            if cleaned:
                return cleaned
    except ImportError:
        pass
    except Exception as e:
        print(f"Erreur pyzbar: {e}")
    return None


def _extract_isbn_from_ocr_text(text: str) -> Optional[str]:
    """Analyse un texte OCR pour y trouver une séquence ISBN."""
    if not text:
        return None

    # 1. Motif 'ISBN ...'
    m_isbn = re.findall(r'ISBN\s*[:\.]?\s*([0-9\-\s]{10,20})', text, re.IGNORECASE)
    for cand in m_isbn:
        cleaned = clean_isbn(cand)
        if cleaned:
            return cleaned

    # 2. Motif 978 ou 979
    m_978 = re.findall(r'(?:978|979)[\d\-\s]{9,17}', text)
    for cand in m_978:
        cleaned = clean_isbn(cand)
        if cleaned:
            return cleaned

    # 3. Tous les blocs numériques de 10 à 14 chiffres
    blocks = re.findall(r'\d{10,14}', text)
    for b in blocks:
        cleaned = clean_isbn(b)
        if cleaned:
            return cleaned

    # 4. Blocs de 11 ou 12 chiffres avec préfixe manquant
    m_loose = re.findall(r'\b(78\d{10}|82\d{9})\b', text)
    for l in m_loose:
        cleaned = clean_isbn(l)
        if cleaned:
            return cleaned

    return None


_OCR_ENGINE = None


def _get_ocr_engine():
    """Charge et met en cache le moteur RapidOCR ONNX en mémoire."""
    global _OCR_ENGINE
    if _OCR_ENGINE is None:
        from rapidocr_onnxruntime import RapidOCR
        _OCR_ENGINE = RapidOCR()
    return _OCR_ENGINE


def _decode_with_ocr(img: Image.Image) -> Optional[str]:
    """Fallback OCR : Lit le texte textuel ISBN présent sur la couverture/dos de livre."""
    try:
        engine = _get_ocr_engine()
        w, h = img.size
        # Redimensionner à 800px max pour une inférence OCR ultra-rapide (< 0.25s)
        ocr_img = img
        if max(w, h) > 800:
            scale = 800.0 / float(max(w, h))
            ocr_img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.BILINEAR)

        for rot in [0, 90, 270]:
            target_img = ocr_img.rotate(rot, expand=True) if rot else ocr_img
            np_arr = np.array(target_img)
            res, _ = engine(np_arr)
            if res:
                full_text = " ".join([line[1] for line in res])
                found_isbn = _extract_isbn_from_ocr_text(full_text)
                if found_isbn:
                    return found_isbn
    except ImportError:
        pass
    except Exception as e:
        print(f"Erreur RapidOCR: {e}")
    return None


def scan_barcode_from_image(image_input) -> Optional[str]:
    """
    Décode un code-barres depuis un objet image (frame vidéo, UploadedFile ou PIL.Image).
    1. Tente le décodage 1D ultra-rapide (ZXing C++ / PyZbar).
    2. Bascule immédiatement sur l'OCR (RapidOCR mis en cache) pour lire l'ISBN en texte clair
       si les barres 1D sont floues.
    """
    if image_input is None:
        return None

    try:
        if hasattr(image_input, "seek"):
            image_input.seek(0)

        if isinstance(image_input, Image.Image):
            pil_image = image_input.copy()
        elif hasattr(image_input, "__array_interface__"):
            pil_image = Image.fromarray(np.array(image_input))
        else:
            pil_image = Image.open(image_input)
            pil_image.load()
    except Exception as e:
        print(f"Erreur d'ouverture d'image: {e}")
        return None

    try:
        pil_image = ImageOps.exif_transpose(pil_image)
    except Exception:
        pass

    w, h = pil_image.size
    max_dim = 1200
    if max(w, h) > max_dim:
        scale = max_dim / float(max(w, h))
        pil_image = pil_image.resize((int(w * scale), int(h * scale)), Image.Resampling.BILINEAR)
        w, h = pil_image.size

    # Phase 1 : Décodage 1D rapide (image directe + autocontraste accentué)
    code = _decode_with_zxing(pil_image) or _decode_with_pyzbar(pil_image)
    if code:
        return code

    gray = pil_image.convert("L")
    enhanced = ImageOps.autocontrast(gray, cutoff=2).filter(ImageFilter.SHARPEN)
    code = _decode_with_zxing(enhanced) or _decode_with_pyzbar(enhanced)
    if code:
        return code

    # Recadrage central (cible de visée vidéo)
    center_crop = enhanced.crop((int(w * 0.10), int(h * 0.18), int(w * 0.90), int(h * 0.82)))
    code = _decode_with_zxing(center_crop) or _decode_with_pyzbar(center_crop)
    if code:
        return code

    # Phase 2 : Lecture OCR directe du numéro ISBN imprimé
    ocr_code = _decode_with_ocr(pil_image)
    if ocr_code:
        return ocr_code

    return None
