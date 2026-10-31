-- Preserve the agreed day of month across short months and leap years.
-- Existing unpaused contracts retain their original start-day anniversary.
-- Contracts resumed in the past retain the day of their current shifted due date.
ALTER TABLE subscriptions
  ADD COLUMN billing_anchor_day TINYINT UNSIGNED NULL AFTER next_billing_at,
  ADD CONSTRAINT ck_subscriptions_billing_anchor_day
    CHECK (billing_anchor_day IS NULL OR billing_anchor_day BETWEEN 1 AND 31);

UPDATE subscriptions AS s
SET s.billing_anchor_day = CASE
  WHEN s.start_date IS NULL THEN NULL
  WHEN s.next_billing_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM subscription_events AS e
    WHERE e.subscription_id = s.id AND e.event_type = 'RESUMED'
  ) THEN DAY(s.next_billing_at)
  ELSE DAY(s.start_date)
END;
