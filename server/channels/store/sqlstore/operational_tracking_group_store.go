// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package sqlstore

import (
	"database/sql"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/request"
	"github.com/pkg/errors"

	"github.com/mattermost/mattermost/server/v8/channels/store"

	sq "github.com/mattermost/squirrel"
)

type SqlOperationalTrackingGroupStore struct {
	*SqlStore
}

func newSqlOperationalTrackingGroupStore(sqlStore *SqlStore) store.OperationalTrackingGroupStore {
	return &SqlOperationalTrackingGroupStore{
		SqlStore: sqlStore,
	}
}

func (s *SqlOperationalTrackingGroupStore) Save(rctx request.CTX, group *model.OperationalTrackingGroup) (*model.OperationalTrackingGroup, error) {
	group.PreSave()
	if err := group.IsValid(); err != nil {
		return nil, err
	}

	query := s.getQueryBuilder().
		Insert("OperationalTrackingGroups").
		Columns("Id", "TeamId", "Name", "CreateAt", "CreateBy", "CoviaSyncStatus", "CoviaSyncedAt").
		Values(group.Id, group.TeamId, group.Name, group.CreateAt, group.CreateBy, group.CoviaSyncStatus, group.CoviaSyncedAt)

	if _, err := s.GetMaster().ExecBuilder(query); err != nil {
		return nil, errors.Wrapf(err, "failed to save OperationalTrackingGroup id=%s", group.Id)
	}

	return group, nil
}

func (s *SqlOperationalTrackingGroupStore) Get(groupID string) (*model.OperationalTrackingGroup, error) {
	query := s.getQueryBuilder().
		Select("Id", "TeamId", "Name", "CreateAt", "CreateBy", "CoviaSyncStatus", "CoviaSyncedAt").
		From("OperationalTrackingGroups").
		Where(sq.Eq{"Id": groupID})

	var group model.OperationalTrackingGroup
	if err := s.GetReplica().GetBuilder(&group, query); err != nil {
		return nil, errors.Wrapf(err, "failed to get OperationalTrackingGroup id=%s", groupID)
	}

	return &group, nil
}

func (s *SqlOperationalTrackingGroupStore) GetForTeam(teamID string) ([]*model.OperationalTrackingGroup, error) {
	query := s.getQueryBuilder().
		Select(
			"Id", "TeamId", "Name", "CreateAt", "CreateBy", "CoviaSyncStatus", "CoviaSyncedAt",
			"(SELECT COUNT(*) FROM OperationalTrackingGroupMembers m WHERE m.GroupId = OperationalTrackingGroups.Id) AS MemberCount",
		).
		From("OperationalTrackingGroups").
		Where(sq.Eq{"TeamId": teamID}).
		OrderBy("Name ASC")

	var groups []*model.OperationalTrackingGroup
	if err := s.GetReplica().SelectBuilder(&groups, query); err != nil && err != sql.ErrNoRows {
		return nil, errors.Wrapf(err, "failed to get OperationalTrackingGroups for teamId=%s", teamID)
	}

	return groups, nil
}

func (s *SqlOperationalTrackingGroupStore) Delete(groupID string) error {
	query := s.getQueryBuilder().
		Delete("OperationalTrackingGroups").
		Where(sq.Eq{"Id": groupID})

	if _, err := s.GetMaster().ExecBuilder(query); err != nil {
		return errors.Wrapf(err, "failed to delete OperationalTrackingGroup id=%s", groupID)
	}

	memberQuery := s.getQueryBuilder().
		Delete("OperationalTrackingGroupMembers").
		Where(sq.Eq{"GroupId": groupID})

	if _, err := s.GetMaster().ExecBuilder(memberQuery); err != nil {
		return errors.Wrapf(err, "failed to delete OperationalTrackingGroupMembers for groupId=%s", groupID)
	}

	return nil
}

func (s *SqlOperationalTrackingGroupStore) AddMember(rctx request.CTX, groupID, userID, createdBy string) error {
	query := s.getQueryBuilder().
		Insert("OperationalTrackingGroupMembers").
		Columns("GroupId", "UserId", "CreateAt", "CreateBy").
		Values(groupID, userID, model.GetMillis(), createdBy).
		Suffix("ON CONFLICT (GroupId, UserId) DO NOTHING")

	if _, err := s.GetMaster().ExecBuilder(query); err != nil {
		return errors.Wrapf(err, "failed to save OperationalTrackingGroupMember groupId=%s userId=%s", groupID, userID)
	}

	return nil
}

func (s *SqlOperationalTrackingGroupStore) RemoveMember(groupID, userID string) error {
	query := s.getQueryBuilder().
		Delete("OperationalTrackingGroupMembers").
		Where(sq.Eq{"GroupId": groupID, "UserId": userID})

	if _, err := s.GetMaster().ExecBuilder(query); err != nil {
		return errors.Wrapf(err, "failed to delete OperationalTrackingGroupMember groupId=%s userId=%s", groupID, userID)
	}

	return nil
}

func (s *SqlOperationalTrackingGroupStore) UpdateCoviaSyncStatus(groupID, status string) error {
	query := s.getQueryBuilder().
		Update("OperationalTrackingGroups").
		Set("CoviaSyncStatus", status).
		Set("CoviaSyncedAt", model.GetMillis()).
		Where(sq.Eq{"Id": groupID})

	if _, err := s.GetMaster().ExecBuilder(query); err != nil {
		return errors.Wrapf(err, "failed to update Covia sync status for OperationalTrackingGroup id=%s", groupID)
	}

	return nil
}

func (s *SqlOperationalTrackingGroupStore) GetMembers(groupID string) ([]*model.OperationalTrackingGroupMember, error) {
	query := s.getQueryBuilder().
		Select("GroupId", "UserId", "CreateAt", "CreateBy").
		From("OperationalTrackingGroupMembers").
		Where(sq.Eq{"GroupId": groupID}).
		OrderBy("CreateAt ASC")

	var members []*model.OperationalTrackingGroupMember
	if err := s.GetReplica().SelectBuilder(&members, query); err != nil && err != sql.ErrNoRows {
		return nil, errors.Wrapf(err, "failed to get OperationalTrackingGroupMembers for groupId=%s", groupID)
	}

	return members, nil
}
