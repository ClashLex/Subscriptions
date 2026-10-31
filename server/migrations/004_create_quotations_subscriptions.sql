-- 004: Quotation templates and subscriptions (lines, events)

CREATE TABLE quotation_templates (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(255)    NOT NULL,
  validity_days INT UNSIGNED    NOT NULL DEFAULT 15,
  default_plan_id BIGINT UNSIGNED NULL,
  created_by    BIGINT UNSIGNED NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_quotation_templates_name UNIQUE (name),
  CONSTRAINT ck_quotation_templates_validity CHECK (validity_days >= 1),
  CONSTRAINT fk_quotation_templates_plan FOREIGN KEY (default_plan_id) REFERENCES plans (id) ON DELETE SET NULL,
  CONSTRAINT fk_quotation_templates_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quotation_template_items (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  product_id  BIGINT UNSIGNED NOT NULL,
  variant_id  BIGINT UNSIGNED NULL,
  quantity    INT UNSIGNED    NOT NULL DEFAULT 1,
  unit_price  DECIMAL(12,2)   NOT NULL,
  tax_id      BIGINT UNSIGNED NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT ck_quotation_template_items_quantity CHECK (quantity >= 1),
  CONSTRAINT fk_quotation_template_items_template
    FOREIGN KEY (template_id) REFERENCES quotation_templates (id) ON DELETE CASCADE,
  CONSTRAINT fk_quotation_template_items_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT,
  CONSTRAINT fk_quotation_template_items_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE SET NULL,
  CONSTRAINT fk_quotation_template_items_tax
    FOREIGN KEY (tax_id) REFERENCES taxes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subscriptions (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subscription_number    VARCHAR(32)     NOT NULL,
  customer_id            BIGINT UNSIGNED NOT NULL,
  plan_id                BIGINT UNSIGNED NOT NULL,
  quotation_template_id  BIGINT UNSIGNED NULL,
  status                 ENUM('DRAFT','QUOTATION','CONFIRMED','ACTIVE','PAUSED','CLOSED')
                                         NOT NULL DEFAULT 'DRAFT',
  start_date             DATE            NULL,
  expiry_date            DATE            NULL,
  payment_terms_days     INT UNSIGNED    NOT NULL DEFAULT 0,
  next_billing_at        TIMESTAMP       NULL,   -- set on activation; advanced only after invoice commit
  previous_subscription_id BIGINT UNSIGNED NULL,
  paused_at              DATETIME        NULL,
  closed_at              DATETIME        NULL,
  created_by             BIGINT UNSIGNED NULL,
  created_at             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_subscriptions_number UNIQUE (subscription_number),
  CONSTRAINT fk_subscriptions_customer FOREIGN KEY (customer_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES plans (id) ON DELETE RESTRICT,
  CONSTRAINT fk_subscriptions_template
    FOREIGN KEY (quotation_template_id) REFERENCES quotation_templates (id) ON DELETE SET NULL,
  CONSTRAINT fk_subscriptions_previous
    FOREIGN KEY (previous_subscription_id) REFERENCES subscriptions (id) ON DELETE SET NULL,
  CONSTRAINT fk_subscriptions_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  INDEX idx_subscriptions_billing (status, next_billing_at),
  INDEX idx_subscriptions_customer (customer_id),
  INDEX idx_subscriptions_plan (plan_id),
  INDEX idx_subscriptions_start_date (start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subscription_lines (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subscription_id      BIGINT UNSIGNED NOT NULL,
  product_id           BIGINT UNSIGNED NULL,
  variant_id           BIGINT UNSIGNED NULL,
  description_snapshot VARCHAR(500)    NOT NULL,
  quantity             INT UNSIGNED    NOT NULL,
  unit_price           DECIMAL(12,2)   NOT NULL,   -- agreed snapshot price
  tax_id               BIGINT UNSIGNED NULL,
  tax_name_snapshot    VARCHAR(120)    NULL,
  tax_rate_snapshot    DECIMAL(5,2)    NULL,
  tax_mode_snapshot    ENUM('EXCLUSIVE','INCLUSIVE') NULL,
  line_amount          DECIMAL(12,2)   NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT ck_subscription_lines_quantity CHECK (quantity >= 1),
  CONSTRAINT fk_subscription_lines_subscription
    FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_lines_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL,
  CONSTRAINT fk_subscription_lines_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE SET NULL,
  CONSTRAINT fk_subscription_lines_tax
    FOREIGN KEY (tax_id) REFERENCES taxes (id) ON DELETE SET NULL,
  INDEX idx_subscription_lines_subscription (subscription_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subscription_events (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subscription_id BIGINT UNSIGNED NOT NULL,
  actor_user_id   BIGINT UNSIGNED NULL,
  event_type      VARCHAR(64)     NOT NULL,
  from_status     VARCHAR(20)     NULL,
  to_status       VARCHAR(20)     NULL,
  reason          VARCHAR(500)    NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_subscription_events_subscription
    FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_events_actor
    FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL,
  INDEX idx_subscription_events_subscription (subscription_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
