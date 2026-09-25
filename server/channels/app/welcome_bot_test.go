// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost/server/public/model"
)

func configureWelcomeFaq(th *TestHelper, prompt string, items ...*model.WelcomeFaqItem) {
	th.App.UpdateConfig(func(cfg *model.Config) {
		*cfg.TeamSettings.EnableWelcomeMessageDM = true
		*cfg.TeamSettings.WelcomeMessageDMText = ""
		*cfg.TeamSettings.WelcomeFaqPrompt = prompt
		cfg.TeamSettings.WelcomeFaqItems = items
	})
}

func faqItem(label, answer, keywords string) *model.WelcomeFaqItem {
	return &model.WelcomeFaqItem{
		Label:    model.NewPointer(label),
		Answer:   model.NewPointer(answer),
		Keywords: model.NewPointer(keywords),
	}
}

func botDMPosts(t *testing.T, th *TestHelper, userID string) []*model.Post {
	t.Helper()
	bot, appErr := th.App.GetSystemBot(th.Context)
	require.Nil(t, appErr)
	ch, err := th.App.Srv().Store().Channel().GetByName("", model.GetDMNameFromIds(bot.UserId, userID), false)
	if err != nil {
		return nil
	}
	postList, err := th.App.Srv().Store().Post().GetPosts(th.Context, model.GetPostsOptions{ChannelId: ch.Id, Page: 0, PerPage: 30}, false, map[string]bool{})
	require.NoError(t, err)
	posts := make([]*model.Post, 0, len(postList.Order))
	for i := len(postList.Order) - 1; i >= 0; i-- { // oldest first
		posts = append(posts, postList.Posts[postList.Order[i]])
	}
	return posts
}

func TestWelcomeFaqMatching(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	configureWelcomeFaq(th, "¿Qué quieres saber?",
		faqItem("📱 Descargar la app", "iOS o Android", "app, celular, movil"),
		faqItem("🔔 Notificaciones", "Perfil → Notificaciones", "notificaciones, avisos"),
	)

	require.Equal(t, "iOS o Android", *th.App.matchWelcomeFaqItem("como descargo la app en mi celular").Answer)
	require.Equal(t, "Perfil → Notificaciones", *th.App.matchWelcomeFaqItem("no me llegan las NOTIFICACIONES").Answer)
	require.Equal(t, "Perfil → Notificaciones", *th.App.matchWelcomeFaqItem("quiero cambiar mis avisos").Answer)
	require.Nil(t, th.App.matchWelcomeFaqItem("hola, buenos dias"))
	require.Nil(t, th.App.matchWelcomeFaqItem(""))
}

func TestWelcomeFaqEnabled(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	th.App.UpdateConfig(func(cfg *model.Config) { *cfg.TeamSettings.EnableWelcomeMessageDM = false })
	require.False(t, th.App.welcomeFaqEnabled())

	configureWelcomeFaq(th, "", faqItem("A", "answer", ""))
	require.True(t, th.App.welcomeFaqEnabled())

	// item without an answer is ignored
	configureWelcomeFaq(th, "", faqItem("A", "", ""))
	require.False(t, th.App.welcomeFaqEnabled())

	th.App.UpdateConfig(func(cfg *model.Config) { *cfg.TeamSettings.EnableWelcomeMessageDM = false })
	require.False(t, th.App.welcomeFaqEnabled())
}

func TestAnswerWelcomeFaq(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	configureWelcomeFaq(th, "Elige:",
		faqItem("Opción A", "Respuesta A", ""),
		faqItem("Opción B", "Respuesta B", ""),
	)

	require.Nil(t, th.App.AnswerWelcomeFaq(th.Context, th.BasicUser.Id, "1"))

	posts := botDMPosts(t, th, th.BasicUser.Id)
	require.Len(t, posts, 2)
	require.Equal(t, "Respuesta B", posts[0].Message)
	require.Equal(t, model.PostTypeDefault, posts[0].Type)
	require.Equal(t, welcomeMenuPostType, posts[1].Type)
	require.Equal(t, "Elige:", posts[1].Props["gia_welcome_prompt"])

	// out-of-range option
	err := th.App.AnswerWelcomeFaq(th.Context, th.BasicUser.Id, "9")
	require.NotNil(t, err)
	require.Equal(t, "app.welcome_bot.invalid_option", err.Id)
}

func TestHandleWelcomeBotReply(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	configureWelcomeFaq(th, "Menu:", faqItem("Ayuda", "Escríbenos a soporte", "ayuda, soporte"))

	bot, appErr := th.App.GetSystemBot(th.Context)
	require.Nil(t, appErr)
	dm, appErr := th.App.GetOrCreateDirectChannel(th.Context, bot.UserId, th.BasicUser.Id)
	require.Nil(t, appErr)

	t.Run("matched free-text reply", func(t *testing.T) {
		post := &model.Post{ChannelId: dm.Id, UserId: th.BasicUser.Id, Message: "necesito ayuda por favor"}
		require.Nil(t, th.App.HandleWelcomeBotReply(th.Context, dm, th.BasicUser, post))

		posts := botDMPosts(t, th, th.BasicUser.Id)
		require.GreaterOrEqual(t, len(posts), 2)
		require.Equal(t, "Escríbenos a soporte", posts[len(posts)-2].Message)
		require.Equal(t, welcomeMenuPostType, posts[len(posts)-1].Type)
	})

	t.Run("skips bot senders", func(t *testing.T) {
		before := len(botDMPosts(t, th, th.BasicUser.Id))
		botUser, appErr := th.App.GetUser(bot.UserId)
		require.Nil(t, appErr)
		post := &model.Post{ChannelId: dm.Id, UserId: bot.UserId, Message: "ayuda"}
		require.Nil(t, th.App.HandleWelcomeBotReply(th.Context, dm, botUser, post))
		require.Equal(t, before, len(botDMPosts(t, th, th.BasicUser.Id)))
	})

	t.Run("skips non-DM channels", func(t *testing.T) {
		post := &model.Post{ChannelId: th.BasicChannel.Id, UserId: th.BasicUser.Id, Message: "ayuda"}
		require.Nil(t, th.App.HandleWelcomeBotReply(th.Context, th.BasicChannel, th.BasicUser, post))
	})
}
