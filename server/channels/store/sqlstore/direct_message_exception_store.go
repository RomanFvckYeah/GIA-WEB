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

type SqlDirectMessageExceptionStore struct {
	*SqlStore
}

func newSqlDirectMessageExceptionStore(sqlStore *SqlStore) store.DirectMessageExceptionStore {
	return &SqlDirectMessageExceptionStore{
		SqlStore: sqlStore,
	}
}

// canonicalDMExceptionPair returns (userID1, userID2) ordered the same way
// model.GetDMNameFromIds orders a DM channel's two participants, so a pair is stored and looked
// up under a single canonical row regardless of which user is passed first.
func canonicalDMExceptionPair(userID1, userID2 string) (string, string) {
	if userID1 > userID2 {
		return userID2, userID1
	}
	return userID1, userID2
}

func (s *SqlDirectMessageExceptionStore) IsException(userID1, userID2 string) (bool, error) {
	userID1, userID2 = canonicalDMExceptionPair(userID1, userID2)

	query := s.getQueryBuilder().
		Select("COUNT(*)").
		From("DirectMessageExceptions").
		Where(sq.Eq{"UserId1": userID1, "UserId2": userID2})

	var count int64
	err := s.GetReplica().GetBuilder(&count, query)
	if err != nil {
		return false, errors.Wrapf(err, "failed to check DirectMessageExceptions for userId1=%s userId2=%s", userID1, userID2)
	}

	return count > 0, nil
}

func (s *SqlDirectMessageExceptionStore) Save(rctx request.CTX, userID1, userID2, createdBy string) error {
	userID1, userID2 = canonicalDMExceptionPair(userID1, userID2)

	query := s.getQueryBuilder().
		Insert("DirectMessageExceptions").
		Columns("UserId1", "UserId2", "CreateAt", "CreateBy").
		Values(userID1, userID2, model.GetMillis(), createdBy).
		Suffix("ON CONFLICT (UserId1, UserId2) DO NOTHING")

	_, err := s.GetMaster().ExecBuilder(query)
	if err != nil {
		return errors.Wrapf(err, "failed to save DirectMessageException for userId1=%s userId2=%s", userID1, userID2)
	}

	return nil
}

func (s *SqlDirectMessageExceptionStore) Delete(userID1, userID2 string) error {
	userID1, userID2 = canonicalDMExceptionPair(userID1, userID2)

	query := s.getQueryBuilder().
		Delete("DirectMessageExceptions").
		Where(sq.Eq{"UserId1": userID1, "UserId2": userID2})

	_, err := s.GetMaster().ExecBuilder(query)
	if err != nil {
		return errors.Wrapf(err, "failed to delete DirectMessageException for userId1=%s userId2=%s", userID1, userID2)
	}

	return nil
}

func (s *SqlDirectMessageExceptionStore) GetAll() ([]*model.DirectMessageException, error) {
	query := s.getQueryBuilder().
		Select("UserId1", "UserId2", "CreateAt", "CreateBy").
		From("DirectMessageExceptions")

	var exceptions []*model.DirectMessageException
	err := s.GetReplica().SelectBuilder(&exceptions, query)
	if err != nil && err != sql.ErrNoRows {
		return nil, errors.Wrap(err, "failed to get DirectMessageExceptions")
	}

	return exceptions, nil
}

func (s *SqlDirectMessageExceptionStore) GetPartnersForUser(userID string) ([]string, error) {
	asUserID1Query := s.getQueryBuilder().
		Select("UserId2").
		From("DirectMessageExceptions").
		Where(sq.Eq{"UserId1": userID})

	var partnersFromUserID1 []string
	if err := s.GetReplica().SelectBuilder(&partnersFromUserID1, asUserID1Query); err != nil && err != sql.ErrNoRows {
		return nil, errors.Wrapf(err, "failed to get DirectMessageException partners for userId=%s", userID)
	}

	asUserID2Query := s.getQueryBuilder().
		Select("UserId1").
		From("DirectMessageExceptions").
		Where(sq.Eq{"UserId2": userID})

	var partnersFromUserID2 []string
	if err := s.GetReplica().SelectBuilder(&partnersFromUserID2, asUserID2Query); err != nil && err != sql.ErrNoRows {
		return nil, errors.Wrapf(err, "failed to get DirectMessageException partners for userId=%s", userID)
	}

	return append(partnersFromUserID1, partnersFromUserID2...), nil
}
