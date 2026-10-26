"""
Composant Streamlit v2 de Scan Vidéo ISBN en direct (core/scanner_component/__init__.py).
Architecture Hybride Client + Serveur :
1. Flux vidéo HTML5 direct (<video autoplay playsinline muted>) sans bouton superflu.
2. Détection rapide côté navigateur via BarcodeDetector natif (si disponible).
3. Capture périodique automatique de frames vidéo envoyées au moteur Python
   (zxing-cpp + pyzbar + RapidOCR) pour décoder aussi bien les barres 1D nettes
   que les numéros "ISBN 978-..." imprimés lorsque la caméra est floue de près.
"""

import base64
import io
from typing import Optional
from PIL import Image
import streamlit as st
from core.barcode_scanner import scan_barcode_from_image, clean_isbn

_HTML = """
<div class="scanner-wrap" id="scannerWrap">
    <div class="scanner-header">
        <div class="scanner-badge" id="scannerStatus">
            <span class="pulse-dot"></span>
            <span id="statusText">Initialisation de la caméra...</span>
        </div>
        <select id="cameraSelect" class="camera-select" style="display:none;" title="Changer de caméra"></select>
    </div>

    <div class="video-viewport" id="videoViewport" title="Touchez l'image pour forcer une analyse immédiate">
        <video id="scannerVideo" autoplay playsinline muted></video>
        <div class="scan-overlay">
            <div class="scan-target">
                <div class="corner tl"></div>
                <div class="corner tr"></div>
                <div class="corner bl"></div>
                <div class="corner br"></div>
                <div class="laser-line"></div>
            </div>
        </div>
        <div class="scan-hint">Placez le code-barres ou le numéro ISBN dans le cadre</div>
    </div>
</div>
"""

_CSS = """
.scanner-wrap {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #1E293B;
    border: 1px solid rgba(99, 102, 241, 0.35);
    border-radius: 14px;
    padding: 12px;
    color: #F8FAFC;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}
.scanner-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
}
.scanner-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.82rem;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba(99, 102, 241, 0.15);
    color: #A5B4FC;
    border: 1px solid rgba(99, 102, 241, 0.3);
}
.scanner-badge.success {
    background: rgba(16, 185, 129, 0.2);
    color: #6EE7B7;
    border-color: rgba(16, 185, 129, 0.45);
}
.scanner-badge.error {
    background: rgba(239, 68, 68, 0.2);
    color: #FCA5A5;
    border-color: rgba(239, 68, 68, 0.45);
}
.pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #818CF8;
    animation: pulseAnim 1.4s infinite ease-in-out;
}
.scanner-badge.success .pulse-dot {
    background: #10B981;
    animation: none;
}
@keyframes pulseAnim {
    0%, 100% { transform: scale(0.85); opacity: 0.6; }
    50% { transform: scale(1.25); opacity: 1; }
}
.camera-select {
    background: #0F172A;
    color: #E2E8F0;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 4px 10px;
    font-size: 0.78rem;
    outline: none;
    cursor: pointer;
}
.video-viewport {
    position: relative;
    width: 100%;
    max-width: 520px;
    height: 270px;
    margin: 0 auto;
    border-radius: 10px;
    overflow: hidden;
    background: #090D16;
    cursor: pointer;
}
#scannerVideo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}
.scan-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
}
.scan-target {
    position: relative;
    width: 78%;
    height: 58%;
    border-radius: 10px;
    box-shadow: 0 0 0 9999px rgba(9, 13, 22, 0.38);
}
.corner {
    position: absolute;
    width: 22px;
    height: 22px;
    border-color: #818CF8;
    border-style: solid;
    border-width: 0;
}
.corner.tl { top: -2px; left: -2px; border-top-width: 3px; border-left-width: 3px; border-top-left-radius: 8px; }
.corner.tr { top: -2px; right: -2px; border-top-width: 3px; border-right-width: 3px; border-top-right-radius: 8px; }
.corner.bl { bottom: -2px; left: -2px; border-bottom-width: 3px; border-left-width: 3px; border-bottom-left-radius: 8px; }
.corner.br { bottom: -2px; right: -2px; border-bottom-width: 3px; border-right-width: 3px; border-bottom-right-radius: 8px; }
.laser-line {
    position: absolute;
    left: 6%;
    right: 6%;
    height: 2px;
    background: linear-gradient(90deg, transparent, #6366F1, #EC4899, #6366F1, transparent);
    box-shadow: 0 0 10px #6366F1;
    animation: laserSweep 2.1s infinite ease-in-out;
}
@keyframes laserSweep {
    0% { top: 12%; opacity: 0.5; }
    50% { top: 88%; opacity: 1; }
    100% { top: 12%; opacity: 0.5; }
}
.scan-hint {
    position: absolute;
    bottom: 8px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 0.75rem;
    color: #E2E8F0;
    text-shadow: 0 1px 3px rgba(0,0,0,0.9);
    pointer-events: none;
}
"""

_JS = """
const scannerInstances = new WeakMap();

function normalizeIsbnCandidate(raw) {
    if (!raw) return null;
    const cleaned = String(raw).replace(/[^0-9Xx]/g, "").toUpperCase();
    if (cleaned.length === 13 && (cleaned.startsWith("978") || cleaned.startsWith("979"))) {
        return cleaned;
    }
    if (cleaned.length === 10) {
        return cleaned;
    }
    return null;
}

export default function(component) {
    const { parentElement, setTriggerValue } = component;
    if (scannerInstances.has(parentElement)) {
        return;
    }

    const video = parentElement.querySelector("#scannerVideo");
    const statusBadge = parentElement.querySelector("#scannerStatus");
    const statusText = parentElement.querySelector("#statusText");
    const cameraSelect = parentElement.querySelector("#cameraSelect");
    const viewport = parentElement.querySelector("#videoViewport");

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const state = {
        stream: null,
        clientTimer: null,
        serverTimer: null,
        lastSentIsbn: null,
        lastSentTime: 0,
        activeDeviceId: null,
        detector: null
    };
    scannerInstances.set(parentElement, state);

    if ("BarcodeDetector" in window) {
        try {
            state.detector = new window.BarcodeDetector({
                formats: ["ean_13", "ean_8", "upc_a", "code_128"]
            });
        } catch (e) {
            state.detector = null;
        }
    }

    function stopStream() {
        if (state.stream) {
            state.stream.getTracks().forEach(t => t.stop());
            state.stream = null;
        }
    }

    async function startCamera(deviceId) {
        stopStream();
        const constraints = {
            audio: false,
            video: deviceId
                ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
                : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
        };

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            state.stream = stream;
            video.srcObject = stream;
            await video.play();

            const track = stream.getVideoTracks()[0];
            if (track && track.applyConstraints) {
                track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
            }

            statusBadge.className = "scanner-badge";
            statusText.textContent = "Analyse vidéo & OCR ISBN en direct...";

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(d => d.kind === "videoinput");
            if (videoInputs.length > 1) {
                cameraSelect.style.display = "inline-block";
                const currentSettings = track ? track.getSettings() : {};
                cameraSelect.innerHTML = "";
                videoInputs.forEach((d, idx) => {
                    const opt = document.createElement("option");
                    opt.value = d.deviceId;
                    opt.textContent = d.label || ("Caméra " + (idx + 1));
                    if (currentSettings.deviceId && d.deviceId === currentSettings.deviceId) {
                        opt.selected = true;
                    }
                    cameraSelect.appendChild(opt);
                });
            }
        } catch (err) {
            statusBadge.className = "scanner-badge error";
            statusText.textContent = "Accès caméra refusé ou indisponible";
        }
    }

    cameraSelect.addEventListener("change", (e) => {
        if (e.target.value) {
            startCamera(e.target.value);
        }
    });

    function emitIsbn(isbn) {
        const now = Date.now();
        if (isbn === state.lastSentIsbn && (now - state.lastSentTime) < 4000) {
            return;
        }
        state.lastSentIsbn = isbn;
        state.lastSentTime = now;
        statusBadge.className = "scanner-badge success";
        statusText.textContent = "ISBN détecté : " + isbn + " — Chargement...";
        if (navigator.vibrate) {
            navigator.vibrate(80);
        }
        setTriggerValue("scanned_isbn", isbn);
    }

    function captureAndSendFrame() {
        if (!video || video.readyState < 2 || !video.videoWidth) return;
        const wrap = parentElement.querySelector("#scannerWrap") || parentElement;
        if (!wrap || wrap.offsetParent === null || document.hidden || state.lastSentIsbn) return;
        const targetW = Math.min(960, video.videoWidth);
        const scale = targetW / video.videoWidth;
        const targetH = Math.round(video.videoHeight * scale);
        canvas.width = targetW;
        canvas.height = targetH;
        ctx.drawImage(video, 0, 0, targetW, targetH);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        setTriggerValue("frame_b64", dataUrl);
    }

    // 1. Boucle rapide côté client (BarcodeDetector natif si supporté)
    state.clientTimer = setInterval(async () => {
        if (!state.detector || !video || video.readyState < 2) return;
        const wrap = parentElement.querySelector("#scannerWrap") || parentElement;
        if (!wrap || wrap.offsetParent === null || document.hidden || state.lastSentIsbn) return;
        try {
            const barcodes = await state.detector.detect(video);
            if (barcodes && barcodes.length > 0) {
                for (const b of barcodes) {
                    const candidate = normalizeIsbnCandidate(b.rawValue);
                    if (candidate) {
                        emitIsbn(candidate);
                        break;
                    }
                }
            }
        } catch (e) {}
    }, 250);

    // 2. Boucle hybride serveur (zxing-cpp + pyzbar + RapidOCR pour lire aussi le texte ISBN)
    state.serverTimer = setInterval(() => {
        const wrap = parentElement.querySelector("#scannerWrap") || parentElement;
        if (!wrap || wrap.offsetParent === null || document.hidden || state.lastSentIsbn) return;
        if (Date.now() - state.lastSentTime < 4000) return;
        captureAndSendFrame();
    }, 2500);

    // Permettre aussi un clic/tap sur la vidéo pour déclencher une capture immédiate
    viewport.addEventListener("click", () => {
        statusText.textContent = "Analyse haute précision en cours...";
        captureAndSendFrame();
    });

    startCamera(null);

    return () => {
        if (state.clientTimer) clearInterval(state.clientTimer);
        if (state.serverTimer) clearInterval(state.serverTimer);
        stopStream();
        scannerInstances.delete(parentElement);
    };
}
"""

_isbn_live_scanner_component = st.components.v2.component(
    "isbn_live_scanner",
    html=_HTML,
    css=_CSS,
    js=_JS,
    isolate_styles=False,
)


def render_live_video_scanner(key: str = "live_barcode_video_scanner") -> Optional[str]:
    """
    Affiche le scanner vidéo HTML5 + OCR hybride en direct et retourne l'ISBN décodé (ou None).
    Dès qu'un code-barres 1D ou un texte "ISBN 978-..." est détecté dans le flux vidéo,
    l'ISBN nettoyé est retourné immédiatement à Python.
    """
    res = _isbn_live_scanner_component(
        key=key,
        on_scanned_isbn_change=lambda: None,
        on_frame_b64_change=lambda: None,
    )
    if not res:
        return None

    # 1. ISBN détecté directement côté client
    direct_isbn = res.get("scanned_isbn") if isinstance(res, dict) else getattr(res, "scanned_isbn", None)
    if direct_isbn:
        cleaned = clean_isbn(str(direct_isbn))
        if len(cleaned) in (10, 13):
            return cleaned

    # 2. Frame vidéo envoyée au moteur Python (zxing-cpp + pyzbar + RapidOCR)
    frame_b64 = res.get("frame_b64") if isinstance(res, dict) else getattr(res, "frame_b64", None)
    if frame_b64 and isinstance(frame_b64, str) and "," in frame_b64:
        try:
            raw_bytes = base64.b64decode(frame_b64.split(",", 1)[1])
            pil_img = Image.open(io.BytesIO(raw_bytes))
            decoded_isbn = scan_barcode_from_image(pil_img)
            if decoded_isbn:
                return decoded_isbn
        except Exception:
            pass

    return None
