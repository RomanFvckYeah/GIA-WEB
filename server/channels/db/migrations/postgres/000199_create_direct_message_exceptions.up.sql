CREATE TABLE IF NOT EXISTS DirectMessageExceptions (
    UserId1  VARCHAR(26) NOT NULL,
    UserId2  VARCHAR(26) NOT NULL,
    CreateAt BIGINT      NOT NULL,
    CreateBy VARCHAR(26) NOT NULL,
    PRIMARY KEY (UserId1, UserId2)
);

CREATE INDEX IF NOT EXISTS idx_directmessageexceptions_userid2 ON DirectMessageExceptions (UserId2);
