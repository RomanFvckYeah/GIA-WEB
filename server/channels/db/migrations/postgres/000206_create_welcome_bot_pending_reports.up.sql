CREATE TABLE IF NOT EXISTS WelcomeBotPendingReports (
    UserId   VARCHAR(26) NOT NULL,
    CreateAt BIGINT      NOT NULL,
    PRIMARY KEY (UserId)
);
