// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"net/http"
	"strconv"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/mattermost/server/public/shared/request"
)

// IsPanicButtonOnly reports whether userID has been designated by an admin as restricted to
// the mobile panic-button flow only. Fails open (false) on store error, matching the fail-open
// behavior of other permission lookups in this package.
func (a *App) IsPanicButtonOnly(rctx request.CTX, userID string) bool {
	isPanicButtonOnly, err := a.Srv().Store().PanicButtonOnlyUser().IsPanicButtonOnly(userID)
	if err != nil {
		rctx.Logger().Warn("Failed to check panic button only user", mlog.Err(err))
		return false
	}
	return isPanicButtonOnly
}

func (a *App) AddPanicButtonOnlyUser(rctx request.CTX, userID, createdBy string) *model.AppError {
	if err := a.Srv().Store().PanicButtonOnlyUser().Save(rctx, userID, createdBy); err != nil {
		return model.NewAppError("AddPanicButtonOnlyUser", "app.panic_button_only_user.save.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return nil
}

// MarkPanicButtonOnly marks userID panic-button-only and, if they were already a real member of
// one or more teams, removes them from every one of those teams so the "never in any team"
// guarantee holds immediately — not just for future join attempts (those are blocked separately
// in JoinUserToTeam). requestorId is recorded as both the flag's creator and the actor for the
// team-removal audit trail.
func (a *App) MarkPanicButtonOnly(rctx request.CTX, userID, requestorId string) *model.AppError {
	if err := a.AddPanicButtonOnlyUser(rctx, userID, requestorId); err != nil {
		return err
	}

	teamMembers, err := a.GetTeamMembersForUser(rctx, userID, "", false)
	if err != nil {
		return err
	}

	for _, tm := range teamMembers {
		if err := a.RemoveUserFromTeam(rctx, tm.TeamId, userID, requestorId); err != nil {
			return err
		}
	}

	return nil
}

func (a *App) RemovePanicButtonOnlyUser(rctx request.CTX, userID string) *model.AppError {
	if err := a.Srv().Store().PanicButtonOnlyUser().Delete(userID); err != nil {
		return model.NewAppError("RemovePanicButtonOnlyUser", "app.panic_button_only_user.delete.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return nil
}

func (a *App) GetPanicButtonOnlyUserIDs(rctx request.CTX) ([]string, *model.AppError) {
	userIDs, err := a.Srv().Store().PanicButtonOnlyUser().GetAll()
	if err != nil {
		return nil, model.NewAppError("GetPanicButtonOnlyUserIDs", "app.panic_button_only_user.get_all.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return userIDs, nil
}

// AttachPanicButtonOnlyProp sets user.Props[model.UserPropsKeyPanicButtonOnly] to "true"/"false"
// so clients (mobile app, web) get this status directly in the login/GET-me response instead of
// having to call GET /panic_button_only_users separately. Always sets the key explicitly (never
// leaves it unset) so clients can rely on its presence rather than treating "absent" as false.
// Returns the value it set, so callers that also need it for etag/caching purposes (see getUser
// in api4/user.go) don't have to look it up a second time.
func (a *App) AttachPanicButtonOnlyProp(rctx request.CTX, user *model.User) bool {
	isPanicButtonOnly := a.IsPanicButtonOnly(rctx, user.Id)
	if user.Props == nil {
		user.Props = make(model.StringMap)
	}
	user.Props[model.UserPropsKeyPanicButtonOnly] = strconv.FormatBool(isPanicButtonOnly)
	return isPanicButtonOnly
}
