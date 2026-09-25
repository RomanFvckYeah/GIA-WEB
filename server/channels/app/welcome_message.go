// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"strings"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/request"
)

// SendWelcomeMessageDM sends the system bot's welcome DM to the given user: the
// admin-configured greeting (TeamSettings.WelcomeMessageDMText, Markdown) followed
// by the interactive FAQ menu when one is configured. It is a no-op when the
// feature is disabled or nothing is configured. Callers should log-and-continue
// on error — a failed welcome DM must never roll back account creation.
func (a *App) SendWelcomeMessageDM(rctx request.CTX, userID string) *model.AppError {
	if !*a.Config().TeamSettings.EnableWelcomeMessageDM {
		return nil
	}

	greeting := strings.TrimSpace(*a.Config().TeamSettings.WelcomeMessageDMText)
	menu := a.welcomeFaqEnabled()
	if greeting == "" && !menu {
		return nil
	}

	bot, appErr := a.GetSystemBot(rctx)
	if appErr != nil {
		return appErr
	}

	channel, appErr := a.GetOrCreateDirectChannel(rctx, bot.UserId, userID)
	if appErr != nil {
		return appErr
	}

	if greeting != "" {
		post := &model.Post{
			ChannelId: channel.Id,
			UserId:    bot.UserId,
			Message:   greeting,
			Type:      model.PostTypeDefault,
		}
		if _, _, appErr = a.CreatePost(rctx, post, channel, model.CreatePostFlags{SetOnline: true}); appErr != nil {
			return appErr
		}
	}

	if menu {
		if appErr = a.postWelcomeMenu(rctx, channel, bot.UserId); appErr != nil {
			return appErr
		}
	}

	return nil
}
