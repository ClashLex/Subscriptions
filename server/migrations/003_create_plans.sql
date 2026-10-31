-- 003: Plans and plan items

CREATE TABLE plans (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                  VARCHAR(255)    NOT NULL,
  description           TEXT            NULL,
  price                 DECIMAL(12,2)   NOT NULL,
  billing_interval_unit ENUM('DAY','WEEK','MONTH','YEAR') NOT NULL DEFAULT 'MONTH',
  billing_interval_count INT UNSIGNED   NOT NULL DEFAULT 1,
  minimum_quantity      INT UNSIGNED    NOT NULL DEFAULT 1,
  available_from        DATE            NULL,
  available_until       DATE            NULL,
  allow_pause           TINYINT(1)      NOT NULL DEFAULT 1,
  allow_early_close     TINYINT(1)      NOT NULL DEFAULT 1,
  allow_renewal         TINYINT(1)      NOT NULL DEFAULT 1,
  auto_close            TINYINT(1)      NOT NULL DEFAULT 0,
  is_active             TINYINT(1)      NOT NULL DEFAULT 1,
  created_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_plans_name UNIQUE (name),
  CONSTRAINT ck_plans_price CHECK (price >= 0),
  CONSTRAINT ck_plans_interval_count CHECK (billing_interval_count >= 1),
  CONSTRAINT ck_plans_minimum_quantity CHECK (minimum_quantity >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE plan_items (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_id     BIGINT UNSIGNED NOT NULL,
  product_id  BIGINT UNSIGNED NOT NULL,
  variant_id  BIGINT UNSIGNED NULL,
  quantity    INT UNSIGNED    NOT NULL DEFAULT 1,
  unit_price  DECIMAL(12,2)   NOT NULL,          -- default agreed unit price (snapshot source)
  tax_id      BIGINT UNSIGNED NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT ck_plan_items_quantity CHECK (quantity >= 1),
  CONSTRAINT fk_plan_items_plan FOREIGN KEY (plan_id) REFERENCES plans (id) ON DELETE CASCADE,
  CONSTRAINT fk_plan_items_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT,
  CONSTRAINT fk_plan_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE SET NULL,
  CONSTRAINT fk_plan_items_tax FOREIGN KEY (tax_id) REFERENCES taxes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
