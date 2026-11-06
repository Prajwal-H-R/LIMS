"""Helper for certificate asset URLs (logos, QR code) used in preview and PDF."""

import base64
import os
from pathlib import Path

from backend.core.storage_paths import CERTIFICATE_ASSETS_DIR


# 1x1 transparent PNG - used when asset file doesn't exist.
_PLACEHOLDER_DATA_URI = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)

ASSET_FILES = {
    "logo_left": "logo_left.png",
    "logo_right": "logo_right.png",
    "qr_code": "htw_qr_code_certificate.png",
}


def _get_assets_dir() -> Path:
    """
    Return the configured certificate assets directory.

    The actual path is resolved centrally through storage_paths.py.

    Docker container example:
        /app/backend/certificate_assets
    """
    return CERTIFICATE_ASSETS_DIR


def get_asset_data_uri(filename: str) -> str:
    """
    Read an image and return it as a data URI.

    Used by PDF generation, so no network request is required.
    Returns a transparent placeholder if the asset is missing or unreadable.
    """
    assets_dir = _get_assets_dir()

    try:
        path = (assets_dir / filename).resolve()
        assets_root = assets_dir.resolve()

        # Prevent reading files outside the configured assets directory.
        if path == assets_root or assets_root not in path.parents:
            return _PLACEHOLDER_DATA_URI

        if not path.exists() or not path.is_file():
            return _PLACEHOLDER_DATA_URI

        with path.open("rb") as file:
            raw = file.read()

        ext = path.suffix.lower()

        mime = (
            "image/png"
            if ext == ".png"
            else "image/jpeg"
            if ext in (".jpg", ".jpeg")
            else "image/png"
        )

        encoded = base64.b64encode(raw).decode("ascii")

        return f"data:{mime};base64,{encoded}"

    except Exception:
        return _PLACEHOLDER_DATA_URI


def get_asset_url(base_url: str, filename: str) -> str:
    """
    Return the API URL for an asset used by frontend preview.

    The URL stays relative so it works with local and production
    frontend API proxy configurations.
    """
    base = (base_url or "").rstrip("/")

    if not base:
        return _PLACEHOLDER_DATA_URI

    return f"/api/certificate-assets/{filename}"


def get_certificate_asset_urls(
    base_url: str | None = None,
    use_data_uris: bool = False,
) -> dict[str, str]:
    """
    Return URLs for logo_left, logo_right and qr_code.

    use_data_uris=True:
        Return embedded base64 image data for PDF generation.

    use_data_uris=False:
        Return API URLs for frontend preview.
    """
    if use_data_uris:
        return {
            "logo_left": get_asset_data_uri(ASSET_FILES["logo_left"]),
            "logo_right": get_asset_data_uri(ASSET_FILES["logo_right"]),
            "qr_code": get_asset_data_uri(ASSET_FILES["qr_code"]),
        }

    base = base_url or os.getenv(
        "BACKEND_BASE_URL",
        "http://localhost:8000",
    )

    return {
        "logo_left": get_asset_url(base, ASSET_FILES["logo_left"]),
        "logo_right": get_asset_url(base, ASSET_FILES["logo_right"]),
        "qr_code": get_asset_url(base, ASSET_FILES["qr_code"]),
    }