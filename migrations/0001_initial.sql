-- Migration 001: Initial schema

CREATE TABLE IF NOT EXISTS repositories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  url        TEXT    NOT NULL,
  description TEXT,
  indexed_context TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS developer_lens (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_style TEXT NOT NULL,
  explanation_style   TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
