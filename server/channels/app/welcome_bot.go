// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/i18n"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/mattermost/server/public/shared/request"
)

// welcomeMenuPostType is the custom post type for the system bot's interactive
// welcome menu. The webapp renders a dedicated component for it (buttons); other
// clients fall back to post.Message (the prompt text).
const welcomeMenuPostType = model.PostCustomTypePrefix + "gia_welcome_menu"

// getWelcomeBot returns the System Bot and makes sure it is globally discoverable --
// so an existing account (created before this feature existed, or on a team that
// doesn't share one with it) can still find it in "start a DM" search and message
// it directly to pull up the welcome menu, regardless of
// TeamSettings.RestrictDirectMessage. Idempotent (ON CONFLICT DO NOTHING under the
// hood), so it's fine to call this on every bot interaction.
func (a *App) getWelcomeBot(rctx request.CTX) (*model.Bot, *model.AppError) {
	bot, appErr := a.GetSystemBot(rctx)
	if appErr != nil {
		return nil, appErr
	}
	if appErr := a.AddGloballyDiscoverableUser(rctx, bot.UserId, bot.UserId); appErr != nil {
		rctx.Logger().Warn("Failed to mark welcome bot as globally discoverable", mlog.Err(appErr))
	}
	return bot, nil
}

var welcomeFaqAccentReplacer = strings.NewReplacer(
	"á", "a", "à", "a", "ä", "a", "â", "a",
	"é", "e", "è", "e", "ë", "e", "ê", "e",
	"í", "i", "ì", "i", "ï", "i", "î", "i",
	"ó", "o", "ò", "o", "ö", "o", "ô", "o",
	"ú", "u", "ù", "u", "ü", "u", "û", "u",
	"ñ", "n",
)

func normalizeWelcomeFaqText(s string) string {
	return welcomeFaqAccentReplacer.Replace(strings.ToLower(strings.TrimSpace(s)))
}

// validWelcomeFaqItems returns the configured menu options that have both a label
// and an answer, in configured order. Its index is the option id used in the menu
// post and the answer endpoint.
func (a *App) validWelcomeFaqItems() []*model.WelcomeFaqItem {
	items := a.Config().TeamSettings.WelcomeFaqItems
	valid := make([]*model.WelcomeFaqItem, 0, len(items))
	for _, item := range items {
		if item == nil || item.Label == nil || item.Answer == nil {
			continue
		}
		if strings.TrimSpace(*item.Label) == "" || strings.TrimSpace(*item.Answer) == "" {
			continue
		}
		valid = append(valid, item)
	}
	return valid
}

// welcomeFaqEnabled reports whether the interactive welcome menu should be shown.
func (a *App) welcomeFaqEnabled() bool {
	return *a.Config().TeamSettings.EnableWelcomeMessageDM && len(a.validWelcomeFaqItems()) > 0
}

func (a *App) welcomeFaqPrompt() string {
	prompt := strings.TrimSpace(*a.Config().TeamSettings.WelcomeFaqPrompt)
	if prompt == "" {
		prompt = i18n.T("app.welcome_bot.default_prompt")
	}
	return prompt
}

// isReportTrigger reports whether text expresses the intent to file a report (e.g.
// "quiero reportar un problema"), using the same accent/case-insensitive "contains"
// matching as the FAQ items.
func isReportTrigger(text string) bool {
	norm := normalizeWelcomeFaqText(text)
	return strings.Contains(norm, "reportar") || strings.Contains(norm, "reporte")
}

// postWelcomeMenu posts the interactive menu (prompt + option buttons) as the
// system bot into the given DM channel.
func (a *App) postWelcomeMenu(rctx request.CTX, channel *model.Channel, botUserID string) *model.AppError {
	items := a.validWelcomeFaqItems()
	reportEnabled := a.welcomeBotReportsEnabled()
	if len(items) == 0 && !reportEnabled {
		return nil
	}

	prompt := a.welcomeFaqPrompt()

	menuItems := make([]any, 0, len(items))
	for i, item := range items {
		menuItems = append(menuItems, map[string]any{
			"id":    strconv.Itoa(i),
			"label": strings.TrimSpace(*item.Label),
		})
	}

	post := &model.Post{
		ChannelId: channel.Id,
		UserId:    botUserID,
		Message:   prompt,
		Type:      welcomeMenuPostType,
		Props: model.StringInterface{
			"gia_welcome_prompt":         prompt,
			"gia_welcome_items":          menuItems,
			"gia_welcome_report_enabled": reportEnabled,
		},
	}

	if _, _, appErr := a.CreatePost(rctx, post, channel, model.CreatePostFlags{SetOnline: true}); appErr != nil {
		return appErr
	}
	return nil
}

// matchWelcomeFaqItem returns the first configured option whose label or one of
// its comma-separated keywords appears (accent- and case-insensitively) in the
// given free-text message, or nil if none match.
func (a *App) matchWelcomeFaqItem(text string) *model.WelcomeFaqItem {
	normText := normalizeWelcomeFaqText(text)
	if normText == "" {
		return nil
	}

	for _, item := range a.validWelcomeFaqItems() {
		if label := normalizeWelcomeFaqText(*item.Label); label != "" && strings.Contains(normText, label) {
			return item
		}
		if item.Keywords == nil {
			continue
		}
		for _, kw := range strings.Split(*item.Keywords, ",") {
			kw = normalizeWelcomeFaqText(kw)
			if kw != "" && strings.Contains(normText, kw) {
				return item
			}
		}
	}
	return nil
}

// AnswerWelcomeFaq is called when a user clicks a welcome-menu button: the system
// bot posts the selected option's answer and then re-posts the menu.
func (a *App) AnswerWelcomeFaq(rctx request.CTX, userID, optionID string) *model.AppError {
	items := a.validWelcomeFaqItems()
	idx, err := strconv.Atoi(optionID)
	if err != nil || idx < 0 || idx >= len(items) {
		return model.NewAppError("AnswerWelcomeFaq", "app.welcome_bot.invalid_option", nil, "", http.StatusBadRequest)
	}

	bot, appErr := a.getWelcomeBot(rctx)
	if appErr != nil {
		return appErr
	}

	channel, appErr := a.GetOrCreateDirectChannel(rctx, bot.UserId, userID)
	if appErr != nil {
		return appErr
	}

	answer := &model.Post{
		ChannelId: channel.Id,
		UserId:    bot.UserId,
		Message:   strings.TrimSpace(*items[idx].Answer),
		Type:      model.PostTypeDefault,
	}
	if _, _, appErr = a.CreatePost(rctx, answer, channel, model.CreatePostFlags{SetOnline: true}); appErr != nil {
		return appErr
	}

	return a.postWelcomeMenu(rctx, channel, bot.UserId)
}

// HandleWelcomeBotReply responds to a free-text message a user sends to the system
// bot in a DM: it matches the message against the configured menu options and
// replies with the matching answer (or a fallback), then re-posts the menu -- this
// is how an existing account (one created before the welcome DM was enabled, or
// that just deleted it) can still pull up the menu/report button on demand by
// simply messaging the bot. It mirrors the guards of the out-of-office
// auto-responder and is invoked from the same place in handlePostEvents.
func (a *App) HandleWelcomeBotReply(rctx request.CTX, channel *model.Channel, sender *model.User, post *model.Post) *model.AppError {
	if channel.Type != model.ChannelTypeDirect {
		return nil
	}
	if sender.IsBot {
		return nil
	}
	if post.Type != "" {
		return nil
	}
	if !a.welcomeFaqEnabled() && !a.welcomeBotReportsEnabled() {
		return nil
	}

	otherUserID := channel.GetOtherUserIdForDM(sender.Id)
	if otherUserID == "" {
		return nil
	}

	bot, appErr := a.getWelcomeBot(rctx)
	if appErr != nil {
		return appErr
	}
	if bot.UserId != otherUserID {
		return nil
	}

	// Two-step report flow, needed for a client without the interactive menu
	// (mobile): the user first says something like "quiero reportar un problema"
	// (isReportTrigger), the bot asks them to send the report as their next
	// message, and THAT message -- whatever it says -- gets captured here because
	// this user is now "pending" in WelcomeBotPendingReports. After it's captured,
	// the flag is cleared and the menu/prompt shows again on the next message, same
	// as any other reply.
	reportsEnabled := a.welcomeBotReportsEnabled()
	isPending := false
	if reportsEnabled {
		isPending, _ = a.Srv().Store().WelcomeBotReport().IsPending(sender.Id)
	}

	message := i18n.GetUserTranslations(sender.Locale)("app.welcome_bot.no_match")
	repostMenu := true

	if isPending {
		_ = a.Srv().Store().WelcomeBotReport().ClearPending(sender.Id)
		if _, appErr := a.saveWelcomeBotReport(sender.Id, post.Message); appErr == nil {
			message = i18n.GetUserTranslations(sender.Locale)("app.welcome_bot.report_submitted")
		}
	} else if item := a.matchWelcomeFaqItem(post.Message); item != nil {
		message = strings.TrimSpace(*item.Answer)
	} else if reportsEnabled && isReportTrigger(post.Message) {
		if err := a.Srv().Store().WelcomeBotReport().SetPending(sender.Id, model.GetMillis()); err == nil {
			message = i18n.GetUserTranslations(sender.Locale)("app.welcome_bot.report_prompt")
			// The user is mid-flow, about to type their report -- re-showing the
			// full menu/prompt right now would just be confusing.
			repostMenu = false
		}
	}

	reply := &model.Post{
		ChannelId: channel.Id,
		UserId:    bot.UserId,
		Message:   message,
		Type:      model.PostTypeDefault,
	}
	if _, _, appErr = a.CreatePost(rctx, reply, channel, model.CreatePostFlags{SetOnline: true}); appErr != nil {
		return appErr
	}

	if !repostMenu {
		return nil
	}
	return a.postWelcomeMenu(rctx, channel, bot.UserId)
}
