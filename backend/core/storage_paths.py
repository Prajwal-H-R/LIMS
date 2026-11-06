
"""
Central storage path configuration for YLIMS.

Host directories are configured using:
    UPLOADS_DIR
    CERTIFICATE_ASSETS_DIR

When running inside Docker, use the corresponding APP_* variables
for the paths visible inside the container:

    APP_UPLOADS_DIR=/app/backend/uploads
    APP_CERTIFICATE_ASSETS_DIR=/app/backend/certificate_assets

APP_* takes precedence so a Windows host path is never mistakenly
used as a Linux container path.
"""

import os
from pathlib import Path, PureWindowsPath
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent

# Load the project-root .env into os.environ.
# Existing OS environment variables take priority.
load_dotenv(
    dotenv_path=PROJECT_ROOT / ".env",
    override=False,
)


def _configured_path(variable_name: str, default_path: Path) -> Path:
    """
    Resolve a storage directory from the environment.

    Priority:
        1. APP_<VARIABLE_NAME> - path visible to the application/container.
        2. <VARIABLE_NAME>     - path for direct execution outside Docker.
        3. Default backend directory.
    """
    raw_value = (
        os.getenv(f"APP_{variable_name}")
        or os.getenv(variable_name)
        or ""
    ).strip()

    if not raw_value:
        return default_path.expanduser().resolve()

    # A Windows host path cannot be used directly by a Linux container.
    if os.name != "nt" and PureWindowsPath(raw_value).is_absolute():
        raise RuntimeError(
            f"{variable_name} is configured with a Windows host path: "
            f"{raw_value!r}. The backend is running on Linux. "
            f"Mount the host directory into Docker and set "
            f"APP_{variable_name} to the Linux container mount path."
        )

    configured_path = Path(raw_value).expanduser()

    if not configured_path.is_absolute():
        configured_path = BACKEND_DIR / configured_path

    return configured_path.resolve()


# ------------------------------------------------------------
# ROOT STORAGE DIRECTORIES
# ------------------------------------------------------------

UPLOADS_DIR = _configured_path(
    "UPLOADS_DIR",
    BACKEND_DIR / "uploads",
)

CERTIFICATE_ASSETS_DIR = _configured_path(
    "CERTIFICATE_ASSETS_DIR",
    BACKEND_DIR / "certificate_assets",
)


# ------------------------------------------------------------
# UPLOAD SUBDIRECTORIES
# ------------------------------------------------------------

INWARD_PHOTOS_DIR = UPLOADS_DIR / "inward_photos"

CALIBRATION_BOOKINGS_DIR = (
    UPLOADS_DIR / "calibration_bookings"
)

DEVIATIONS_DIR = (
    UPLOADS_DIR / "deviations"
)

# Laboratory Scope uploaded documents.
LAB_SCOPE_DIR = (
    UPLOADS_DIR / "lab_scope"
)


# ------------------------------------------------------------
# MANUAL CALIBRATION SUBDIRECTORIES
# ------------------------------------------------------------

MANUAL_CALIBRATION_DIR = (
    UPLOADS_DIR / "manual_calibration"
)

MANUAL_CALIBRATION_WORKSHEET_DIR = (
    MANUAL_CALIBRATION_DIR / "worksheet"
)

# Retain the existing spelling to preserve compatibility with
# previously stored file URLs.
MANUAL_CALIBRATION_CERTIFICATE_DIR = (
    MANUAL_CALIBRATION_DIR / "certficate"
)


# ------------------------------------------------------------
# CREATE ALL REQUIRED DIRECTORIES
# ------------------------------------------------------------

STORAGE_DIRECTORIES = (
    UPLOADS_DIR,
    INWARD_PHOTOS_DIR,
    CALIBRATION_BOOKINGS_DIR,
    DEVIATIONS_DIR,
    LAB_SCOPE_DIR,
    MANUAL_CALIBRATION_DIR,
    MANUAL_CALIBRATION_WORKSHEET_DIR,
    MANUAL_CALIBRATION_CERTIFICATE_DIR,
    CERTIFICATE_ASSETS_DIR,
)

for directory in STORAGE_DIRECTORIES:
    directory.mkdir(
        parents=True,
        exist_ok=True,
    )


# ------------------------------------------------------------
# URL HELPERS
# ------------------------------------------------------------

def get_upload_relative_path(file_path: Path) -> str:
    """
    Return a POSIX path relative to the configured uploads directory.

    Example:
        manual_calibration/worksheet/example.pdf

    Raises ValueError if the file is outside UPLOADS_DIR.
    """
    return (
        file_path.resolve()
        .relative_to(UPLOADS_DIR.resolve())
        .as_posix()
    )


def get_upload_url(file_path: Path) -> str:
    """Return the public API URL for an uploaded file."""
    return f"/api/uploads/{get_upload_relative_path(file_path)}"
