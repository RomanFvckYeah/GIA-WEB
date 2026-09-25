CREATE TABLE IF NOT EXISTS PanicButtonOnlyUsers (
    UserId   VARCHAR(26) NOT NULL,
    CreateAt BIGINT      NOT NULL,
    CreateBy VARCHAR(26) NOT NULL,
    PRIMARY KEY (UserId)
);
