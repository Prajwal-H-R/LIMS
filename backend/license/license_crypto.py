#lims-phase-2/backend/license/license_crypto.py
import hmac
import hashlib
from datetime import date, datetime

# 🔐 MUST MATCH KEY GENERATOR
SECRET = b"AIMLSN_YATHARTHATALIMS_PROD_SECRET"
PREFIX = "YatharthataLIMS"


def sign_expiry(expiry: date) -> str:
    """
    Used to store checksum in DB for tamper detection
    """
    payload = expiry.isoformat().encode()
    return hmac.new(SECRET, payload, hashlib.sha256).hexdigest()


def verify_activation_key(key: str) -> date:
    """
    Expected format:
    YatharthataLIMS|YYYY-MM-DD|HMAC
    """
    try:
        prefix, expiry_str, signature = key.strip().split("|")

        if prefix != PREFIX:
            raise ValueError("Invalid license prefix")

        expiry = datetime.strptime(expiry_str, "%Y-%m-%d").date()

        expected_sig = hmac.new(
            SECRET,
            f"{PREFIX}|{expiry_str}".encode(),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature, expected_sig):
            raise ValueError("Invalid activation key")

        return expiry

    except Exception:
        raise ValueError("Invalid activation key")
