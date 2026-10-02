// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"errors"
	"net/http"
	"strings"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/i18n"
	"github.com/mattermost/mattermost/server/public/shared/request"
)

// welcomeBotReportsEnabled reports whether the "Reportar un problema" button should
// be shown in the welcome menu.
func (a *App) welcomeBotReportsEnabled() bool {
	return *a.Config().TeamSettings.EnableWelcomeBotReports
}

// saveWelcomeBotReport validates and saves a free-text report, without touching
// the user's DM with the bot -- the caller decides what (if anything) to post back.
// Shared by CreateWelcomeBotReport (the web button/form) and HandleWelcomeBotReply
// (any client messaging the bot directly, including mobile, which never renders the
// interactive menu at all -- see welcomeMenuPostType's doc comment).
func (a *App) saveWelcomeBotReport(userID, message string) (*model.WelcomeBotReport, *model.AppError) {
	report := &model.WelcomeBotReport{
		UserId:  userID,
		Message: strings.TrimSpace(message),
	}

	saved, err := a.Srv().Store().WelcomeBotReport().Save(report)
	if err != nil {
		var appErr *model.AppError
		if errors.As(err, &appErr) {
			return nil, appErr
		}
		return nil, model.NewAppError("saveWelcomeBotReport", "app.welcome_bot_report.create.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}

	return saved, nil
}

// CreateWelcomeBotReport saves a free-text report a user submitted through the
// system bot's welcome menu, then has the bot confirm receipt and re-post the menu
// in the user's DM with it -- mirroring the tail of AnswerWelcomeFaq.
func (a *App) CreateWelcomeBotReport(rctx request.CTX, userID, message string) (*model.WelcomeBotReport, *model.AppError) {
	saved, appErr := a.saveWelcomeBotReport(userID, message)
	if appErr != nil {
		return nil, appErr
	}

	// In case the user also triggered the free-text flow (HandleWelcomeBotReply) and
	// then used this button/form instead of typing their report as instructed --
	// clear the pending flag so their next ordinary message isn't swallowed as a
	// second report.
	_ = a.Srv().Store().WelcomeBotReport().ClearPending(userID)

	bot, appErr := a.getWelcomeBot(rctx)
	if appErr != nil {
		return saved, nil
	}

	channel, appErr := a.GetOrCreateDirectChannel(rctx, bot.UserId, userID)
	if appErr != nil {
		return saved, nil
	}

	confirmation := &model.Post{
		ChannelId: channel.Id,
		UserId:    bot.UserId,
		Message:   i18n.T("app.welcome_bot.report_submitted"),
		Type:      model.PostTypeDefault,
	}
	if _, _, appErr = a.CreatePost(rctx, confirmation, channel, model.CreatePostFlags{SetOnline: true}); appErr != nil {
		return saved, nil
	}

	_ = a.postWelcomeMenu(rctx, channel, bot.UserId)

	return saved, nil
}

// GetWelcomeBotReports returns a page of reports, newest first, for the System
// Console reports panel.
func (a *App) GetWelcomeBotReports(page, perPage int, onlyUnresolved bool) ([]*model.WelcomeBotReport, *model.AppError) {
	reports, err := a.Srv().Store().WelcomeBotReport().GetPage(page, perPage, onlyUnresolved)
	if err != nil {
		return nil, model.NewAppError("GetWelcomeBotReports", "app.welcome_bot_report.get_page.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return reports, nil
}

// ResolveWelcomeBotReport marks a report as resolved by resolvedBy.
func (a *App) ResolveWelcomeBotReport(reportID, resolvedBy string) *model.AppError {
	if err := a.Srv().Store().WelcomeBotReport().Resolve(reportID, resolvedBy, model.GetMillis()); err != nil {
		return model.NewAppError("ResolveWelcomeBotReport", "app.welcome_bot_report.resolve.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return nil
}
