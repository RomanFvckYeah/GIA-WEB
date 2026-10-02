// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/i18n"
)

func enableWelcomeBotReports(th *TestHelper) {
	th.App.UpdateConfig(func(cfg *model.Config) {
		*cfg.TeamSettings.EnableWelcomeMessageDM = true
		*cfg.TeamSettings.WelcomeMessageDMText = ""
		*cfg.TeamSettings.EnableWelcomeBotReports = true
	})
}

func TestCreateWelcomeBotReport(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	enableWelcomeBotReports(th)

	report, appErr := th.App.CreateWelcomeBotReport(th.Context, th.BasicUser.Id, "  Se me cae la app al iniciar sesión  ")
	require.Nil(t, appErr)
	require.NotEmpty(t, report.Id)
	require.Equal(t, th.BasicUser.Id, report.UserId)
	require.Equal(t, "Se me cae la app al iniciar sesión", report.Message)
	require.False(t, report.Resolved)

	// the bot should have confirmed receipt and re-posted the menu in the user's DM
	posts := botDMPosts(t, th, th.BasicUser.Id)
	require.GreaterOrEqual(t, len(posts), 2)
	require.Equal(t, model.PostTypeDefault, posts[len(posts)-2].Type)
	require.Equal(t, welcomeMenuPostType, posts[len(posts)-1].Type)
	require.Equal(t, true, posts[len(posts)-1].Props["gia_welcome_report_enabled"])

	t.Run("rejects an empty message", func(t *testing.T) {
		_, appErr := th.App.CreateWelcomeBotReport(th.Context, th.BasicUser.Id, "   ")
		require.NotNil(t, appErr)
		require.Equal(t, "model.welcome_bot_report.is_valid.message.app_error", appErr.Id)
	})
}

func TestGetAndResolveWelcomeBotReports(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	enableWelcomeBotReports(th)

	r1, appErr := th.App.CreateWelcomeBotReport(th.Context, th.BasicUser.Id, "primer reporte")
	require.Nil(t, appErr)
	r2, appErr := th.App.CreateWelcomeBotReport(th.Context, th.BasicUser2.Id, "segundo reporte")
	require.Nil(t, appErr)

	all, appErr := th.App.GetWelcomeBotReports(0, 50, false)
	require.Nil(t, appErr)
	ids := map[string]bool{}
	for _, r := range all {
		ids[r.Id] = true
	}
	require.True(t, ids[r1.Id])
	require.True(t, ids[r2.Id])

	appErr = th.App.ResolveWelcomeBotReport(r1.Id, th.SystemAdminUser.Id)
	require.Nil(t, appErr)

	unresolved, appErr := th.App.GetWelcomeBotReports(0, 50, true)
	require.Nil(t, appErr)
	for _, r := range unresolved {
		require.NotEqual(t, r1.Id, r.Id)
	}

	all, appErr = th.App.GetWelcomeBotReports(0, 50, false)
	require.Nil(t, appErr)
	for _, r := range all {
		if r.Id == r1.Id {
			require.True(t, r.Resolved)
			require.Equal(t, th.SystemAdminUser.Id, r.ResolvedBy)
			require.NotZero(t, r.ResolvedAt)
		}
	}
}

func TestGetWelcomeBotMarksBotGloballyDiscoverable(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	bot, appErr := th.App.GetSystemBot(th.Context)
	require.Nil(t, appErr)
	require.False(t, th.App.IsGloballyDiscoverable(th.Context, bot.UserId))

	_, appErr = th.App.getWelcomeBot(th.Context)
	require.Nil(t, appErr)
	require.True(t, th.App.IsGloballyDiscoverable(th.Context, bot.UserId))
}

func TestHandleWelcomeBotReplyReportFlow(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	// No FAQ items configured at all -- only the report flow is on. An existing
	// account that never got (or deleted) the welcome DM should still be able to
	// message the bot directly to file a report, two messages at a time.
	th.App.UpdateConfig(func(cfg *model.Config) {
		*cfg.TeamSettings.EnableWelcomeMessageDM = true
		cfg.TeamSettings.WelcomeFaqItems = nil
		*cfg.TeamSettings.EnableWelcomeBotReports = true
	})

	bot, appErr := th.App.GetSystemBot(th.Context)
	require.Nil(t, appErr)
	dm, appErr := th.App.GetOrCreateDirectChannel(th.Context, bot.UserId, th.BasicUser2.Id)
	require.Nil(t, appErr)

	t.Run("saying something unrelated does nothing but the usual no_match", func(t *testing.T) {
		post := &model.Post{ChannelId: dm.Id, UserId: th.BasicUser2.Id, Message: "hola, buenos dias"}
		require.Nil(t, th.App.HandleWelcomeBotReply(th.Context, dm, th.BasicUser2, post))

		posts := botDMPosts(t, th, th.BasicUser2.Id)
		require.Equal(t, i18n.GetUserTranslations(th.BasicUser2.Locale)("app.welcome_bot.no_match"), posts[len(posts)-2].Message)
		require.Equal(t, welcomeMenuPostType, posts[len(posts)-1].Type)

		pending, err := th.App.Srv().Store().WelcomeBotReport().IsPending(th.BasicUser2.Id)
		require.NoError(t, err)
		require.False(t, pending)
	})

	t.Run("the trigger phrase asks for the report and does NOT repost the menu", func(t *testing.T) {
		post := &model.Post{ChannelId: dm.Id, UserId: th.BasicUser2.Id, Message: "quiero reportar un problema"}
		require.Nil(t, th.App.HandleWelcomeBotReply(th.Context, dm, th.BasicUser2, post))

		posts := botDMPosts(t, th, th.BasicUser2.Id)
		last := posts[len(posts)-1]
		require.Equal(t, i18n.GetUserTranslations(th.BasicUser2.Locale)("app.welcome_bot.report_prompt"), last.Message)
		require.NotEqual(t, welcomeMenuPostType, last.Type)

		pending, err := th.App.Srv().Store().WelcomeBotReport().IsPending(th.BasicUser2.Id)
		require.NoError(t, err)
		require.True(t, pending)
	})

	t.Run("the next message is captured as the report, then the menu shows again", func(t *testing.T) {
		post := &model.Post{ChannelId: dm.Id, UserId: th.BasicUser2.Id, Message: "la app se cierra sola"}
		require.Nil(t, th.App.HandleWelcomeBotReply(th.Context, dm, th.BasicUser2, post))

		posts := botDMPosts(t, th, th.BasicUser2.Id)
		require.Equal(t, i18n.GetUserTranslations(th.BasicUser2.Locale)("app.welcome_bot.report_submitted"), posts[len(posts)-2].Message)
		require.Equal(t, welcomeMenuPostType, posts[len(posts)-1].Type)

		pending, err := th.App.Srv().Store().WelcomeBotReport().IsPending(th.BasicUser2.Id)
		require.NoError(t, err)
		require.False(t, pending)

		reports, appErr := th.App.GetWelcomeBotReports(0, 50, false)
		require.Nil(t, appErr)
		found := false
		for _, r := range reports {
			if r.UserId == th.BasicUser2.Id && r.Message == "la app se cierra sola" {
				found = true
			}
		}
		require.True(t, found, "expected the captured message to be saved as a report")
	})

	t.Run("writing again afterwards goes back to normal (no longer captured)", func(t *testing.T) {
		post := &model.Post{ChannelId: dm.Id, UserId: th.BasicUser2.Id, Message: "otra cosa sin relacion"}
		require.Nil(t, th.App.HandleWelcomeBotReply(th.Context, dm, th.BasicUser2, post))

		posts := botDMPosts(t, th, th.BasicUser2.Id)
		require.Equal(t, i18n.GetUserTranslations(th.BasicUser2.Locale)("app.welcome_bot.no_match"), posts[len(posts)-2].Message)

		reports, appErr := th.App.GetWelcomeBotReports(0, 50, false)
		require.Nil(t, appErr)
		for _, r := range reports {
			require.NotEqual(t, "otra cosa sin relacion", r.Message)
		}
	})
}

func TestHandleWelcomeBotReplyTriggerIgnoredWhenReportsDisabled(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	configureWelcomeFaq(th, "Elige:", faqItem("Opción A", "Respuesta A", "palabraclave"))
	th.App.UpdateConfig(func(cfg *model.Config) { *cfg.TeamSettings.EnableWelcomeBotReports = false })

	bot, appErr := th.App.GetSystemBot(th.Context)
	require.Nil(t, appErr)
	dm, appErr := th.App.GetOrCreateDirectChannel(th.Context, bot.UserId, th.BasicUser2.Id)
	require.Nil(t, appErr)

	post := &model.Post{ChannelId: dm.Id, UserId: th.BasicUser2.Id, Message: "quiero reportar un problema"}
	require.Nil(t, th.App.HandleWelcomeBotReply(th.Context, dm, th.BasicUser2, post))

	posts := botDMPosts(t, th, th.BasicUser2.Id)
	require.GreaterOrEqual(t, len(posts), 2)
	require.Equal(t, i18n.GetUserTranslations(th.BasicUser2.Locale)("app.welcome_bot.no_match"), posts[len(posts)-2].Message)
	require.Equal(t, welcomeMenuPostType, posts[len(posts)-1].Type)

	pending, err := th.App.Srv().Store().WelcomeBotReport().IsPending(th.BasicUser2.Id)
	require.NoError(t, err)
	require.False(t, pending)
}

func TestWelcomeFaqPromptDoesNotChangeWhenOnlyReportsEnabled(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	th.App.UpdateConfig(func(cfg *model.Config) {
		*cfg.TeamSettings.WelcomeFaqPrompt = ""
		cfg.TeamSettings.WelcomeFaqItems = nil
		*cfg.TeamSettings.EnableWelcomeBotReports = false
	})
	require.Equal(t, i18n.T("app.welcome_bot.default_prompt"), th.App.welcomeFaqPrompt())

	th.App.UpdateConfig(func(cfg *model.Config) { *cfg.TeamSettings.EnableWelcomeBotReports = true })
	require.Equal(t, i18n.T("app.welcome_bot.default_prompt"), th.App.welcomeFaqPrompt())

	// an admin-configured prompt always wins
	th.App.UpdateConfig(func(cfg *model.Config) { *cfg.TeamSettings.WelcomeFaqPrompt = "Hola, ¿en qué te ayudo?" })
	require.Equal(t, "Hola, ¿en qué te ayudo?", th.App.welcomeFaqPrompt())
}

func TestPostWelcomeMenuShowsReportButtonWithNoFaqItems(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	th.App.UpdateConfig(func(cfg *model.Config) {
		*cfg.TeamSettings.EnableWelcomeMessageDM = true
		*cfg.TeamSettings.WelcomeMessageDMText = ""
		cfg.TeamSettings.WelcomeFaqItems = nil
		*cfg.TeamSettings.EnableWelcomeBotReports = true
	})

	appErr := th.App.SendWelcomeMessageDM(th.Context, th.BasicUser2.Id)
	require.Nil(t, appErr)

	posts := botDMPosts(t, th, th.BasicUser2.Id)
	require.Len(t, posts, 1)
	require.Equal(t, welcomeMenuPostType, posts[0].Type)
	require.Equal(t, true, posts[0].Props["gia_welcome_report_enabled"])
}
