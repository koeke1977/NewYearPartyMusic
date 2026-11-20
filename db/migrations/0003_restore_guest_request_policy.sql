-- Restore the agreed guest request policy: unlimited active queue entries and 20 requests per rolling hour.
INSERT INTO settings (key, value, updated_at)
VALUES ('max_requests_per_hour', '20', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;

DELETE FROM settings
WHERE key IN ('max_open_requests_per_guest', 'max_requests_per_30_minutes');
