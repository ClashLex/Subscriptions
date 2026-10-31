-- Optional contract lines can be switched on and off for future invoices.
ALTER TABLE quotation_template_items
  ADD COLUMN is_add_on BOOLEAN NOT NULL DEFAULT FALSE AFTER tax_id;

ALTER TABLE subscription_lines
  ADD COLUMN is_add_on BOOLEAN NOT NULL DEFAULT FALSE AFTER line_amount,
  ADD COLUMN is_enabled BOOLEAN NOT NULL DEFAULT TRUE AFTER is_add_on,
  ADD CONSTRAINT ck_subscription_lines_base_enabled CHECK (is_add_on = TRUE OR is_enabled = TRUE);
