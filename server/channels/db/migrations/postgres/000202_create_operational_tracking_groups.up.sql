CREATE TABLE IF NOT EXISTS OperationalTrackingGroups (
    Id       VARCHAR(26) NOT NULL,
    TeamId   VARCHAR(26) NOT NULL,
    Name     VARCHAR(64) NOT NULL,
    CreateAt BIGINT      NOT NULL,
    CreateBy VARCHAR(26) NOT NULL,
    PRIMARY KEY (Id)
);

CREATE INDEX IF NOT EXISTS idx_operationaltrackinggroups_teamid ON OperationalTrackingGroups (TeamId);

CREATE TABLE IF NOT EXISTS OperationalTrackingGroupMembers (
    GroupId  VARCHAR(26) NOT NULL,
    UserId   VARCHAR(26) NOT NULL,
    CreateAt BIGINT      NOT NULL,
    CreateBy VARCHAR(26) NOT NULL,
    PRIMARY KEY (GroupId, UserId)
);
