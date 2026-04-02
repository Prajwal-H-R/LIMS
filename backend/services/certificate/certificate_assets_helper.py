# backend/services/certificate_assets_helper.py
"""Helper for certificate asset URLs (logos, QR code) used in preview and PDF."""

import base64
import os
from pathlib import Path

# 1x1 transparent PNG - used when asset file doesn't exist
_PLACEHOLDER_DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

ASSET_FILES = {
    "logo_left": "logo_left.png",
    "logo_right": "logo_right.png",
    "qr_code": "htw_qr_code_certificate.png",
}


def _get_assets_dir() -> Path:
    """Return the certificate_assets directory (sibling of backend)."""
    return Path(__file__).resolve().parent.parent.parent / "certificate_assets"


def get_asset_data_uri(filename: str) -> str:
    """
    Read image file and return as data URI. Used for PDF generation (no network needed).
    Returns placeholder if file doesn't exist.
    """
    assets_dir = _get_assets_dir()
    path = assets_dir / filename
    if not path.exists() or not path.is_file():
        return _PLACEHOLDER_DATA_URI
    try:
        with open(path, "rb") as f:
            raw = f.read()
        ext = path.suffix.lower()
        mime = "image/png" if ext == ".png" else "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
        b64 = base64.b64encode(raw).decode("ascii")
        return f"data:{mime};base64,{b64}"
    except Exception:
        return _PLACEHOLDER_DATA_URI


def get_asset_url(base_url: str, filename: str) -> str:
    """
    Return full API URL for an asset. Used for frontend preview.
    base_url should be e.g. 'http://localhost:8000' (no trailing slash).
    """
    base = (base_url or "").rstrip("/")
    if not base:
        return _PLACEHOLDER_DATA_URI
    return f"{base}/api/certificate-assets/{filename}"


def get_certificate_asset_urls(base_url: str | None = None, use_data_uris: bool = False) -> dict[str, str]:
    """
    Return dict with logo_left, logo_right, qr_code URLs.
    - use_data_uris=True: for PDF (self-contained, no network)
    - use_data_uris=False: API URLs for frontend preview (requires base_url)
    """
    if use_data_uris:
        return {
            "logo_left": get_asset_data_uri(ASSET_FILES["logo_left"]),
            "logo_right": get_asset_data_uri(ASSET_FILES["logo_right"]),
            "qr_code": get_asset_data_uri(ASSET_FILES["qr_code"]),
        }
    # API URLs
    base = base_url or os.getenv("BACKEND_BASE_URL", "http://localhost:8000")
    return {
        "logo_left": get_asset_url(base, ASSET_FILES["logo_left"]),
        "logo_right": get_asset_url(base, ASSET_FILES["logo_right"]),
        "qr_code": get_asset_url(base, ASSET_FILES["qr_code"]),
    }
