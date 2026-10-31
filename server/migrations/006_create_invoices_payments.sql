-- 006: Invoices, invoice lines, payments, and cross-table redemption link

CREATE TABLE invoices (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_number   VARCHAR(32)     NOT NULL,
  subscription_id  BIGINT UNSIGNED NOT NULL,
  customer_id      BIGINT UNSIGNED NOT NULL,
  period_start     DATE            NOT NULL,
  period_end       DATE            NOT NULL,
  issue_date       DATE            NOT NULL,
  due_date         DATE            NOT NULL,
  currency_code    CHAR(3)         NOT NULL DEFAULT 'INR',
  subtotal         DECIMAL(12,2)   NOT NULL DEFAULT 0,
  discount_total   DECIMAL(12,2)   NOT NULL DEFAULT 0,
  tax_total        DECIMAL(12,2)   NOT NULL DEFAULT 0,
  grand_total      DECIMAL(12,2)   NOT NULL DEFAULT 0,
  status           ENUM('DRAFT','CONFIRMED','PAID','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  confirmed_at     DATETIME        NULL,
  cancelled_at     DATETIME        NULL,
  created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_invoices_number UNIQUE (invoice_number),
  -- The final defence against duplicate invoices for one period (BILLING_AND_FINANCE.md §7)
  CONSTRAINT uq_invoice_period UNIQUE (subscription_id, period_start, period_end),
  CONSTRAINT fk_invoices_subscription
    FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON DELETE RESTRICT,
  CONSTRAINT fk_invoices_customer
    FOREIGN KEY (customer_id) REFERENCES users (id) ON DELETE RESTRICT,
  INDEX idx_invoices_status_due (status, due_date),
  INDEX idx_invoices_customer (customer_id),
  INDEX idx_invoices_subscription (subscription_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoice_lines (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id         BIGINT UNSIGNED NOT NULL,
  product_id         BIGINT UNSIGNED NULL,
  variant_id         BIGINT UNSIGNED NULL,
  description_snapshot VARCHAR(500)  NOT NULL,
  quantity           INT UNSIGNED    NOT NULL,
  unit_price         DECIMAL(12,2)   NOT NULL,
  line_subtotal      DECIMAL(12,2)   NOT NULL,
  discount_amount    DECIMAL(12,2)   NOT NULL DEFAULT 0,
  discount_rule_id   BIGINT UNSIGNED NULL,
  tax_name_snapshot  VARCHAR(120)    NULL,
  tax_rate_snapshot  DECIMAL(5,2)    NULL,
  tax_mode_snapshot  ENUM('EXCLUSIVE','INCLUSIVE') NULL,
  tax_amount         DECIMAL(12,2)   NOT NULL DEFAULT 0,
  line_total         DECIMAL(12,2)   NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_invoice_lines_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE,
  CONSTRAINT fk_invoice_lines_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL,
  CONSTRAINT fk_invoice_lines_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE SET NULL,
  CONSTRAINT fk_invoice_lines_discount_rule
    FOREIGN KEY (discount_rule_id) REFERENCES discount_rules (id) ON DELETE SET NULL,
  INDEX idx_invoice_lines_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id  BIGINT UNSIGNED NOT NULL,
  method      VARCHAR(40)     NOT NULL,   -- UPI, bank transfer, cash, card terminal, …
  amount      DECIMAL(12,2)   NOT NULL,
  paid_at     DATETIME        NOT NULL,
  note        VARCHAR(500)    NULL,
  reference   VARCHAR(120)    NULL,
  status      ENUM('SUCCESSFUL','FAILED','REFUNDED') NOT NULL DEFAULT 'SUCCESSFUL',
  recorded_by BIGINT UNSIGNED NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT ck_payments_amount CHECK (amount > 0),
  CONSTRAINT fk_payments_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_recorded_by
    FOREIGN KEY (recorded_by) REFERENCES users (id) ON DELETE SET NULL,
  INDEX idx_payments_invoice (invoice_id),
  INDEX idx_payments_paid_at (paid_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Completes the discount_redemptions → invoices FK deferred from 005
ALTER TABLE discount_redemptions
  ADD CONSTRAINT fk_discount_redemptions_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE;
