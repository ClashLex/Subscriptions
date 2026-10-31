-- 005: Discount rules, scoping, and concurrency-safe redemptions

CREATE TABLE discount_rules (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name              VARCHAR(255)    NOT NULL,
  discount_type     ENUM('FIXED','PERCENTAGE') NOT NULL,
  value             DECIMAL(12,2)   NOT NULL,
  minimum_purchase  DECIMAL(12,2)   NULL,
  minimum_quantity  INT UNSIGNED    NULL,
  starts_at         DATETIME        NULL,
  ends_at           DATETIME        NULL,
  usage_limit       INT UNSIGNED    NULL,
  usage_count       INT UNSIGNED    NOT NULL DEFAULT 0,
  scope             ENUM('PRODUCTS','SUBSCRIPTION') NOT NULL DEFAULT 'SUBSCRIPTION',
  is_active         TINYINT(1)      NOT NULL DEFAULT 1,
  created_by        BIGINT UNSIGNED NULL,
  created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_discount_rules_name UNIQUE (name),
  CONSTRAINT ck_discount_rules_value CHECK (value >= 0),
  CONSTRAINT ck_discount_rules_percent CHECK (discount_type <> 'PERCENTAGE' OR value <= 100),
  CONSTRAINT fk_discount_rules_creator
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  INDEX idx_discount_rules_active (is_active, starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE discount_products (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  discount_rule_id BIGINT UNSIGNED NOT NULL,
  product_id      BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_discount_products UNIQUE (discount_rule_id, product_id),
  CONSTRAINT fk_discount_products_rule
    FOREIGN KEY (discount_rule_id) REFERENCES discount_rules (id) ON DELETE CASCADE,
  CONSTRAINT fk_discount_products_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE discount_redemptions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  discount_rule_id BIGINT UNSIGNED NOT NULL,
  subscription_id BIGINT UNSIGNED NULL,
  invoice_id      BIGINT UNSIGNED NULL,   -- FK added in 006 after invoices exist
  customer_id     BIGINT UNSIGNED NULL,
  redeemed_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_discount_redemptions_rule
    FOREIGN KEY (discount_rule_id) REFERENCES discount_rules (id) ON DELETE RESTRICT,
  CONSTRAINT fk_discount_redemptions_subscription
    FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON DELETE SET NULL,
  CONSTRAINT fk_discount_redemptions_customer
    FOREIGN KEY (customer_id) REFERENCES users (id) ON DELETE SET NULL,
  INDEX idx_discount_redemptions_rule (discount_rule_id, redeemed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
