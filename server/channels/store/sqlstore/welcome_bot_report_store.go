// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package sqlstore

import (
	"database/sql"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/pkg/errors"

	"github.com/mattermost/mattermost/server/v8/channels/store"

	sq "github.com/mattermost/squirrel"
)

type SqlWelcomeBotReportStore struct {
	*SqlStore
}

func newSqlWelcomeBotReportStore(sqlStore *SqlStore) store.WelcomeBotReportStore {
	return &SqlWelcomeBotReportStore{
		SqlStore: sqlStore,
	}
}

func (s *SqlWelcomeBotReportStore) Save(report *model.WelcomeBotReport) (*model.WelcomeBotReport, error) {
	report.PreSave()
	if err := report.IsValid(); err != nil {
		return nil, err
	}

	query := s.getQueryBuilder().
		Insert("WelcomeBotReports").
		Columns("Id", "UserId", "Message", "CreateAt", "Resolved", "ResolvedBy", "ResolvedAt").
		Values(report.Id, report.UserId, report.Message, report.CreateAt, report.Resolved, report.ResolvedBy, report.ResolvedAt)

	if _, err := s.GetMaster().ExecBuilder(query); err != nil {
		return nil, errors.Wrapf(err, "failed to save WelcomeBotReport id=%s", report.Id)
	}

	return report, nil
}

func (s *SqlWelcomeBotReportStore) GetPage(page, perPage int, onlyUnresolved bool) ([]*model.WelcomeBotReport, error) {
	query := s.getQueryBuilder().
		Select("Id", "UserId", "Message", "CreateAt", "Resolved", "ResolvedBy", "ResolvedAt").
		From("WelcomeBotReports").
		OrderBy("CreateAt DESC").
		Limit(uint64(perPage)).
		Offset(uint64(page * perPage))

	if onlyUnresolved {
		query = query.Where(sq.Eq{"Resolved": false})
	}

	// GetMaster(): an admin resolving a report immediately re-fetches this page, and needs
	// to see that change right away rather than wait out replica lag.
	var reports []*model.WelcomeBotReport
	if err := s.GetMaster().SelectBuilder(&reports, query); err != nil && err != sql.ErrNoRows {
		return nil, errors.Wrap(err, "failed to get WelcomeBotReports page")
	}

	return reports, nil
}

func (s *SqlWelcomeBotReportStore) Resolve(reportID, resolvedBy string, resolvedAt int64) error {
	query := s.getQueryBuilder().
		Update("WelcomeBotReports").
		Set("Resolved", true).
		Set("ResolvedBy", resolvedBy).
		Set("ResolvedAt", resolvedAt).
		Where(sq.Eq{"Id": reportID})

	if _, err := s.GetMaster().ExecBuilder(query); err != nil {
		return errors.Wrapf(err, "failed to resolve WelcomeBotReport id=%s", reportID)
	}

	return nil
}

// SetPending marks userID as mid-way through the "report a problem" free-text
// flow: their next DM to the bot will be captured as the report body instead of
// being matched against the FAQ items.
func (s *SqlWelcomeBotReportStore) SetPending(userID string, createAt int64) error {
	query := s.getQueryBuilder().
		Insert("WelcomeBotPendingReports").
		Columns("UserId", "CreateAt").
		Values(userID, createAt).
		Suffix("ON CONFLICT (UserId) DO NOTHING")

	if _, err := s.GetMaster().ExecBuilder(query); err != nil {
		return errors.Wrapf(err, "failed to set WelcomeBotPendingReport userId=%s", userID)
	}

	return nil
}

func (s *SqlWelcomeBotReportStore) IsPending(userID string) (bool, error) {
	query := s.getQueryBuilder().
		Select("COUNT(*)").
		From("WelcomeBotPendingReports").
		Where(sq.Eq{"UserId": userID})

	var count int64
	if err := s.GetMaster().GetBuilder(&count, query); err != nil {
		return false, errors.Wrapf(err, "failed to check WelcomeBotPendingReports userId=%s", userID)
	}

	return count > 0, nil
}

func (s *SqlWelcomeBotReportStore) ClearPending(userID string) error {
	query := s.getQueryBuilder().
		Delete("WelcomeBotPendingReports").
		Where(sq.Eq{"UserId": userID})

	if _, err := s.GetMaster().ExecBuilder(query); err != nil {
		return errors.Wrapf(err, "failed to clear WelcomeBotPendingReport userId=%s", userID)
	}

	return nil
}
