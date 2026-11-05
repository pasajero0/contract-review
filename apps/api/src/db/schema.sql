-- All timestamps are integer epoch milliseconds, UTC (docs/adr/archive/0009-utc-storage-workspace-time-zone.md).

CREATE TABLE IF NOT EXISTS lawyers (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  title TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL,
  pages         INTEGER NOT NULL,
  uploaded_at   INTEGER NOT NULL,
  uploaded_by   TEXT NOT NULL REFERENCES lawyers (id),
  supersedes_id TEXT REFERENCES documents (id) DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE IF NOT EXISTS reviews (
  id             TEXT PRIMARY KEY,
  -- Facts: never change.
  document_id    TEXT NOT NULL REFERENCES documents (id),
  requested_by   TEXT NOT NULL REFERENCES lawyers (id),
  requested_at   INTEGER NOT NULL,
  deadline_at    INTEGER NOT NULL,
  -- Outcome: a trigger freezes a finished review. Inserting one as finished and finishing
  -- after the deadline are prevented by the service's conditional SQL (ADR 0022).
  status         TEXT NOT NULL DEFAULT 'running',
  failure_reason TEXT,
  finished_at    INTEGER,
  CHECK (
    (status = 'running' AND failure_reason IS NULL AND finished_at IS NULL)
    OR (status = 'completed' AND failure_reason IS NULL AND finished_at IS NOT NULL)
    -- IS NOT NULL is needed: a CHECK passes on NULL, and NULL IN (...) is NULL.
    OR (status = 'failed' AND failure_reason IS NOT NULL
        AND failure_reason IN ('ai_error', 'timeout') AND finished_at IS NOT NULL)
  )
) STRICT;

CREATE TABLE IF NOT EXISTS findings (
  id          TEXT PRIMARY KEY,
  review_id   TEXT NOT NULL REFERENCES reviews (id),
  seq         INTEGER NOT NULL,
  clause      TEXT,
  title       TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  excerpt     TEXT,
  explanation TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  UNIQUE (review_id, seq)
) STRICT;

-- At most one running review per document.
CREATE UNIQUE INDEX IF NOT EXISTS one_running_review_per_document
  ON reviews (document_id)
  WHERE status = 'running';

CREATE TRIGGER IF NOT EXISTS review_facts_never_change
BEFORE UPDATE OF id, document_id, requested_by, requested_at, deadline_at ON reviews
BEGIN
  SELECT RAISE(ABORT, 'review facts cannot change');
END;

CREATE TRIGGER IF NOT EXISTS reviews_no_delete
BEFORE DELETE ON reviews
BEGIN
  SELECT RAISE(ABORT, 'reviews cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS finished_review_is_frozen
BEFORE UPDATE ON reviews
WHEN OLD.status <> 'running'
BEGIN
  SELECT RAISE(ABORT, 'review is finished');
END;

CREATE TRIGGER IF NOT EXISTS no_findings_for_finished_review
BEFORE INSERT ON findings
WHEN (SELECT status FROM reviews WHERE id = NEW.review_id) <> 'running'
BEGIN
  SELECT RAISE(ABORT, 'review is finished');
END;

CREATE TRIGGER IF NOT EXISTS findings_no_update
BEFORE UPDATE ON findings
BEGIN
  SELECT RAISE(ABORT, 'findings are insert-only');
END;

CREATE TRIGGER IF NOT EXISTS findings_no_delete
BEFORE DELETE ON findings
BEGIN
  SELECT RAISE(ABORT, 'findings are insert-only');
END;
