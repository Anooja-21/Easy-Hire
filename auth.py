"""
auth.py — Password hashing helpers for EasyHire
Uses Python's built-in hashlib (no extra install needed)
"""
import hashlib
import os
import hmac


def hash_password(password: str) -> str:
    """Hash a password with a random salt. Returns 'salt:hash' string."""
    salt = os.urandom(32).hex()
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
    return f"{salt}:{key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Verify a password against a stored 'salt:hash' string."""
    try:
        salt, key_hex = stored.split(":", 1)
        key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
        return hmac.compare_digest(key.hex(), key_hex)
    except Exception:
        return False
