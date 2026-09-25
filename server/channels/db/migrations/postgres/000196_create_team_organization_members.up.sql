CREATE TABLE IF NOT EXISTS TeamOrganizationMembers (
    TeamId   VARCHAR(26) NOT NULL,
    UserId   VARCHAR(26) NOT NULL,
    CreateAt BIGINT      NOT NULL,
    CreateBy VARCHAR(26) NOT NULL,
    PRIMARY KEY (TeamId, UserId)
);
