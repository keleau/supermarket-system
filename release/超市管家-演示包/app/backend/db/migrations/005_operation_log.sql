-- 操作日志
CREATE TABLE IF NOT EXISTS `operation_log` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       BIGINT UNSIGNED NULL COMMENT '操作人 id',
  `username`      VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '操作人账号',
  `role`          VARCHAR(10)  NOT NULL DEFAULT '' COMMENT '角色',
  `position`      VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '职位',
  `module`        VARCHAR(20)  NOT NULL COMMENT '模块',
  `action`        VARCHAR(30)  NOT NULL COMMENT '动作',
  `biz_no`        VARCHAR(40)  NOT NULL DEFAULT '' COMMENT '业务单号或对象标识',
  `before_status` TINYINT      NULL COMMENT '变更前状态',
  `after_status`  TINYINT      NULL COMMENT '变更后状态',
  `detail`        VARCHAR(500) NOT NULL DEFAULT '' COMMENT '操作摘要',
  `ip`            VARCHAR(45)  NOT NULL DEFAULT '' COMMENT '操作 IP',
  `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_module_action` (`module`, `action`),
  KEY `idx_username` (`username`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志';
