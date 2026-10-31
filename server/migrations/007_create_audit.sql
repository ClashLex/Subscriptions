-- 007: Audit logging for privileged actions (SECURITY_AND_ACCESS.md §8)

CREATE TABLE audit_logs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action        VARCHAR(80)     NOT NULL,
  entity_type   VARCHAR(40)     NULL,
  entity_id     BIGINT UNSIGNED NULL,
  metadata_json JSON            NULL,  -- never store secrets or sensitive payloads here
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_audit_logs_actor
    FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL,
  INDEX idx_audit_logs_entity (entity_type, entity_id, created_at),
  INDEX idx_audit_logs_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
