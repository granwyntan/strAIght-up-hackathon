import json
import random
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any

from .database import get_connection
from .settings import settings


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def cache_key(*parts: str) -> str:
    digest = sha256()
    for part in parts:
        digest.update(part.encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def get_json(category: str, key: str) -> Any | None:
    _maybe_cleanup_expired()
    now = utc_now_iso()
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT payload_json, expires_at
            FROM cache_entries
            WHERE cache_key = ? AND category = ?
            """,
            (key, category),
        ).fetchone()
        if row is None:
            return None
        if row["expires_at"] <= now:
            connection.execute("DELETE FROM cache_entries WHERE cache_key = ? AND category = ?", (key, category))
            return None
        return json.loads(row["payload_json"])


def set_json(category: str, key: str, payload: Any, ttl_seconds: int) -> None:
    now = datetime.now(UTC)
    expires_at = now.timestamp() + ttl_seconds
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO cache_entries (cache_key, category, payload_json, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
                category = excluded.category,
                payload_json = excluded.payload_json,
                expires_at = excluded.expires_at,
                created_at = excluded.created_at
            """,
            (
                key,
                category,
                json.dumps(payload, ensure_ascii=True),
                datetime.fromtimestamp(expires_at, UTC).isoformat(),
                now.isoformat(),
            ),
        )


def _maybe_cleanup_expired() -> None:
    if random.random() > settings.cache_cleanup_probability:
        return
    with get_connection() as connection:
        connection.execute("DELETE FROM cache_entries WHERE expires_at <= ?", (utc_now_iso(),))
