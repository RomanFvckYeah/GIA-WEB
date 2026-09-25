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

type SqlPanicButtonOnlyUserStore struct {
	*SqlStore
}

func newSqlPanicButtonOnlyUserStore(sqlStore *SqlStore) store.PanicButtonOnlyUserStore {
	return &SqlPanicButtonOnlyUserStore{
		SqlStore: sqlStore,
	}
}

func (s *SqlPanicButtonOnlyUserStore) IsPanicButtonOnly(userID string) (bool, error) {
	query := s.getQueryBuilder().
		Select("COUNT(*)").
		From("PanicButtonOnlyUsers").
		Where(sq.Eq{"UserId": userID})

	var count int64
	err := s.GetReplica().GetBuilder(&count, query)
	if err != nil {
		return false, errors.Wrapf(err, "failed to check PanicButtonOnlyUsers for userId=%s", userID)
	}

	return count > 0, nil
}

func (s *SqlPanicButtonOnlyUserStore) Save(rctx request.CTX, userID, createdBy string) error {
	query := s.getQueryBuilder().
		Insert("PanicButtonOnlyUsers").
		Columns("UserId", "CreateAt", "CreateBy").
		Values(userID, model.GetMillis(), createdBy).
		Suffix("ON CONFLICT (UserId) DO NOTHING")

	_, err := s.GetMaster().ExecBuilder(query)
	if err != nil {
		return errors.Wrapf(err, "failed to save PanicButtonOnlyUser for userId=%s", userID)
	}

	return nil
}

func (s *SqlPanicButtonOnlyUserStore) Delete(userID string) error {
	query := s.getQueryBuilder().
		Delete("PanicButtonOnlyUsers").
		Where(sq.Eq{"UserId": userID})

	_, err := s.GetMaster().ExecBuilder(query)
	if err != nil {
		return errors.Wrapf(err, "failed to delete PanicButtonOnlyUser for userId=%s", userID)
	}

	return nil
}

func (s *SqlPanicButtonOnlyUserStore) GetAll() ([]string, error) {
	query := s.getQueryBuilder().
		Select("UserId").
		From("PanicButtonOnlyUsers")

	var userIDs []string
	err := s.GetReplica().SelectBuilder(&userIDs, query)
	if err != nil && err != sql.ErrNoRows {
		return nil, errors.Wrap(err, "failed to get PanicButtonOnlyUsers")
	}

	return userIDs, nil
}
