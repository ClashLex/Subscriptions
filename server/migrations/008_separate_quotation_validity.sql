-- 008: Separate quotation validity from the contract end
--
-- Before this migration, submitting a quotation wrote its validity window into
-- subscriptions.expiry_date, the same column activation used as the contract
-- end. That forced activation to invent a one-interval expiry, so every
-- subscription produced exactly one invoice and recurring billing never
-- recurred. Quotation validity now has its own column; expiry_date is NULL for
-- an open-ended contract that keeps billing each interval until it is closed.

ALTER TABLE subscriptions
  ADD COLUMN quotation_valid_until DATE NULL AFTER expiry_date;
