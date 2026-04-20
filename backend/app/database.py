import sqlite3
from pathlib import Path

from .settings import settings


def get_connection() -> sqlite3.Connection:
    db_path = Path(settings.database_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS investigations (
                id TEXT PRIMARY KEY,
                claim TEXT NOT NULL,
                context TEXT NOT NULL,
                status TEXT NOT NULL,
                mode TEXT NOT NULL,
                desired_depth TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                overall_score INTEGER,
                verdict TEXT,
                summary TEXT NOT NULL DEFAULT '',
                state_json TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS agent_runs (
                id TEXT PRIMARY KEY,
                investigation_id TEXT NOT NULL,
                agent_key TEXT NOT NULL,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                started_at TEXT NOT NULL,
                finished_at TEXT,
                FOREIGN KEY (investigation_id) REFERENCES investigations (id)
            );

            CREATE TABLE IF NOT EXISTS progress_events (
                id TEXT PRIMARY KEY,
                investigation_id TEXT NOT NULL,
                agent_key TEXT NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (investigation_id) REFERENCES investigations (id)
            );

            CREATE TABLE IF NOT EXISTS cache_entries (
                cache_key TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS source_domains (
                domain TEXT PRIMARY KEY,
                latest_url TEXT NOT NULL,
                source_bucket TEXT NOT NULL DEFAULT 'tier_1_blog',
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                seen_count INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS calorie_entries (
                id TEXT PRIMARY KEY,
                entry_date TEXT NOT NULL,
                calories INTEGER NOT NULL,
                meal_name TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_calorie_entries_entry_date ON calorie_entries(entry_date);
            """
        )
