CREATE TABLE IF NOT EXISTS WelcomeBotReports (
    Id         VARCHAR(26)   NOT NULL,
    UserId     VARCHAR(26)   NOT NULL,
    Message    VARCHAR(4000) NOT NULL,
    CreateAt   BIGINT        NOT NULL,
    Resolved   BOOLEAN       NOT NULL DEFAULT FALSE,
    ResolvedBy VARCHAR(26)   NOT NULL DEFAULT '',
    ResolvedAt BIGINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (Id)
);

CREATE INDEX IF NOT EXISTS idx_welcomebotreports_createat ON WelcomeBotReports (CreateAt);
