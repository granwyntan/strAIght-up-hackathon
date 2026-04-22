import sqlite3
from pathlib import Path

from .settings import settings


def get_connection() -> sqlite3.Connection:
    db_path = Path(settings.resolved_database_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL;")
    connection.execute("PRAGMA synchronous=NORMAL;")
    connection.execute("PRAGMA foreign_keys=ON;")
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
                confidence_level TEXT,
                truth_classification TEXT NOT NULL DEFAULT '',
                source_count INTEGER NOT NULL DEFAULT 0,
                positive_count INTEGER NOT NULL DEFAULT 0,
                neutral_count INTEGER NOT NULL DEFAULT 0,
                negative_count INTEGER NOT NULL DEFAULT 0,
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

            CREATE TABLE IF NOT EXISTS push_subscriptions (
                expo_push_token TEXT PRIMARY KEY,
                platform TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_investigations_created_at ON investigations (created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_investigations_updated_at ON investigations (updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_investigations_verdict ON investigations (verdict);
            CREATE INDEX IF NOT EXISTS idx_investigations_score ON investigations (overall_score DESC);
            CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_seen ON push_subscriptions (last_seen_at DESC);
            """
        )

        existing_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(investigations)").fetchall()
        }
        column_definitions = {
            "confidence_level": "TEXT",
            "truth_classification": "TEXT NOT NULL DEFAULT ''",
            "source_count": "INTEGER NOT NULL DEFAULT 0",
            "positive_count": "INTEGER NOT NULL DEFAULT 0",
            "neutral_count": "INTEGER NOT NULL DEFAULT 0",
            "negative_count": "INTEGER NOT NULL DEFAULT 0",
        }
        for column_name, definition in column_definitions.items():
            if column_name in existing_columns:
                continue
            connection.execute(f"ALTER TABLE investigations ADD COLUMN {column_name} {definition}")
