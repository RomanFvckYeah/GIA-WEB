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

type SqlGloballyDiscoverableUserStore struct {
	*SqlStore
}

func newSqlGloballyDiscoverableUserStore(sqlStore *SqlStore) store.GloballyDiscoverableUserStore {
	return &SqlGloballyDiscoverableUserStore{
		SqlStore: sqlStore,
	}
}

func (s *SqlGloballyDiscoverableUserStore) IsDiscoverable(userID string) (bool, error) {
	query := s.getQueryBuilder().
		Select("COUNT(*)").
		From("GloballyDiscoverableUsers").
		Where(sq.Eq{"UserId": userID})

	var count int64
	err := s.GetReplica().GetBuilder(&count, query)
	if err != nil {
		return false, errors.Wrapf(err, "failed to check GloballyDiscoverableUsers for userId=%s", userID)
	}

	return count > 0, nil
}

func (s *SqlGloballyDiscoverableUserStore) Save(rctx request.CTX, userID, createdBy string) error {
	query := s.getQueryBuilder().
		Insert("GloballyDiscoverableUsers").
		Columns("UserId", "CreateAt", "CreateBy").
		Values(userID, model.GetMillis(), createdBy).
		Suffix("ON CONFLICT (UserId) DO NOTHING")

	_, err := s.GetMaster().ExecBuilder(query)
	if err != nil {
		return errors.Wrapf(err, "failed to save GloballyDiscoverableUser for userId=%s", userID)
	}

	return nil
}

func (s *SqlGloballyDiscoverableUserStore) Delete(userID string) error {
	query := s.getQueryBuilder().
		Delete("GloballyDiscoverableUsers").
		Where(sq.Eq{"UserId": userID})

	_, err := s.GetMaster().ExecBuilder(query)
	if err != nil {
		return errors.Wrapf(err, "failed to delete GloballyDiscoverableUser for userId=%s", userID)
	}

	return nil
}

func (s *SqlGloballyDiscoverableUserStore) GetAll() ([]string, error) {
	query := s.getQueryBuilder().
		Select("UserId").
		From("GloballyDiscoverableUsers")

	var userIDs []string
	err := s.GetReplica().SelectBuilder(&userIDs, query)
	if err != nil && err != sql.ErrNoRows {
		return nil, errors.Wrap(err, "failed to get GloballyDiscoverableUsers")
	}

	return userIDs, nil
}
