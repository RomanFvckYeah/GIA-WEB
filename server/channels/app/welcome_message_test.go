// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost/server/public/model"
)

func TestSendWelcomeMessageDM(t *testing.T) {
	mainHelper.Parallel(t)

	getDMPost := func(t *testing.T, th *TestHelper, userID string) *model.Post {
		t.Helper()
		bot, appErr := th.App.GetSystemBot(th.Context)
		require.Nil(t, appErr)

		ch, err := th.App.Srv().Store().Channel().GetByName("", model.GetDMNameFromIds(bot.UserId, userID), false)
		if err != nil {
			return nil
		}
		postList, err := th.App.Srv().Store().Post().GetPosts(th.Context, model.GetPostsOptions{ChannelId: ch.Id, Page: 0, PerPage: 1}, false, map[string]bool{})
		require.NoError(t, err)
		if len(postList.Order) == 0 {
			return nil
		}
		return postList.Posts[postList.Order[0]]
	}

	t.Run("no-op when disabled", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		th.App.UpdateConfig(func(cfg *model.Config) {
			*cfg.TeamSettings.EnableWelcomeMessageDM = false
			*cfg.TeamSettings.WelcomeMessageDMText = "hello there"
		})

		require.Nil(t, th.App.SendWelcomeMessageDM(th.Context, th.BasicUser.Id))
		require.Nil(t, getDMPost(t, th, th.BasicUser.Id))
	})

	t.Run("no-op when enabled but text is blank", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		th.App.UpdateConfig(func(cfg *model.Config) {
			*cfg.TeamSettings.EnableWelcomeMessageDM = true
			*cfg.TeamSettings.WelcomeMessageDMText = "   \n  "
		})

		require.Nil(t, th.App.SendWelcomeMessageDM(th.Context, th.BasicUser.Id))
		require.Nil(t, getDMPost(t, th, th.BasicUser.Id))
	})

	t.Run("sends a DM from the system bot when enabled with text", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		const msg = "**Welcome to GIA!**\n- Read the guide\n- Say hi"
		th.App.UpdateConfig(func(cfg *model.Config) {
			*cfg.TeamSettings.EnableWelcomeMessageDM = true
			*cfg.TeamSettings.WelcomeMessageDMText = msg
		})

		bot, appErr := th.App.GetSystemBot(th.Context)
		require.Nil(t, appErr)

		require.Nil(t, th.App.SendWelcomeMessageDM(th.Context, th.BasicUser.Id))

		post := getDMPost(t, th, th.BasicUser.Id)
		require.NotNil(t, post)
		require.Equal(t, bot.UserId, post.UserId)
		require.Equal(t, msg, post.Message)
		require.Equal(t, model.PostTypeDefault, post.Type)
	})
}
