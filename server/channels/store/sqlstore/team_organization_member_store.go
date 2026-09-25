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

type SqlTeamOrganizationMemberStore struct {
	*SqlStore
}

func newSqlTeamOrganizationMemberStore(sqlStore *SqlStore) store.TeamOrganizationMemberStore {
	return &SqlTeamOrganizationMemberStore{
		SqlStore: sqlStore,
	}
}

func (s *SqlTeamOrganizationMemberStore) IsOrgMember(teamID, userID string) (bool, error) {
	query := s.getQueryBuilder().
		Select("COUNT(*)").
		From("TeamOrganizationMembers").
		Where(sq.Eq{"TeamId": teamID, "UserId": userID})

	var count int64
	err := s.GetReplica().GetBuilder(&count, query)
	if err != nil {
		return false, errors.Wrapf(err, "failed to check TeamOrganizationMembers for teamId=%s userId=%s", teamID, userID)
	}

	return count > 0, nil
}

func (s *SqlTeamOrganizationMemberStore) Save(rctx request.CTX, teamID, userID, createdBy string) error {
	query := s.getQueryBuilder().
		Insert("TeamOrganizationMembers").
		Columns("TeamId", "UserId", "CreateAt", "CreateBy").
		Values(teamID, userID, model.GetMillis(), createdBy).
		Suffix("ON CONFLICT (TeamId, UserId) DO NOTHING")

	_, err := s.GetMaster().ExecBuilder(query)
	if err != nil {
		return errors.Wrapf(err, "failed to save TeamOrganizationMember for teamId=%s userId=%s", teamID, userID)
	}

	return nil
}

func (s *SqlTeamOrganizationMemberStore) Delete(teamID, userID string) error {
	query := s.getQueryBuilder().
		Delete("TeamOrganizationMembers").
		Where(sq.Eq{"TeamId": teamID, "UserId": userID})

	_, err := s.GetMaster().ExecBuilder(query)
	if err != nil {
		return errors.Wrapf(err, "failed to delete TeamOrganizationMember for teamId=%s userId=%s", teamID, userID)
	}

	return nil
}

func (s *SqlTeamOrganizationMemberStore) GetForTeam(teamID string) ([]string, error) {
	query := s.getQueryBuilder().
		Select("UserId").
		From("TeamOrganizationMembers").
		Where(sq.Eq{"TeamId": teamID})

	var userIDs []string
	err := s.GetReplica().SelectBuilder(&userIDs, query)
	if err != nil && err != sql.ErrNoRows {
		return nil, errors.Wrapf(err, "failed to get TeamOrganizationMembers for teamId=%s", teamID)
	}

	return userIDs, nil
}

func (s *SqlTeamOrganizationMemberStore) GetForUser(userID string) ([]string, error) {
	query := s.getQueryBuilder().
		Select("TeamId").
		From("TeamOrganizationMembers").
		Where(sq.Eq{"UserId": userID})

	var teamIDs []string
	err := s.GetReplica().SelectBuilder(&teamIDs, query)
	if err != nil && err != sql.ErrNoRows {
		return nil, errors.Wrapf(err, "failed to get TeamOrganizationMembers for userId=%s", userID)
	}

	return teamIDs, nil
}
