// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/mattermost/server/public/shared/request"
)

// IsDirectMessageException reports whether userID1 and userID2 have been designated by a
// system_admin as allowed to open a direct message channel with each other despite
// TeamSettings.RestrictDirectMessage="team" and sharing no common team. Fails open (false) on
// store error, matching the fail-open behavior of other permission lookups in this package.
func (a *App) IsDirectMessageException(rctx request.CTX, userID1, userID2 string) bool {
	isException, err := a.Srv().Store().DirectMessageException().IsException(userID1, userID2)
	if err != nil {
		rctx.Logger().Warn("Failed to check direct message exception", mlog.Err(err))
		return false
	}
	return isException
}

// CanBypassDirectMessageTeamRestriction reports whether userID1 and userID2 are allowed to open or
// post in a direct message channel with each other despite TeamSettings.RestrictDirectMessage="team"
// and sharing no common team: either a system_admin explicitly paired them as an exception, or
// either one of them is marked globally discoverable, which (by design) grants DM-ability to and
// from anyone on the server, not just search/mention visibility.
func (a *App) CanBypassDirectMessageTeamRestriction(rctx request.CTX, userID1, userID2 string) bool {
	if a.IsDirectMessageException(rctx, userID1, userID2) {
		return true
	}
	return a.IsGloballyDiscoverable(rctx, userID1) || a.IsGloballyDiscoverable(rctx, userID2)
}

func (a *App) AddDirectMessageException(rctx request.CTX, userID1, userID2, createdBy string) *model.AppError {
	if err := a.Srv().Store().DirectMessageException().Save(rctx, userID1, userID2, createdBy); err != nil {
		return model.NewAppError("AddDirectMessageException", "app.direct_message_exception.save.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return nil
}

func (a *App) RemoveDirectMessageException(rctx request.CTX, userID1, userID2 string) *model.AppError {
	if err := a.Srv().Store().DirectMessageException().Delete(userID1, userID2); err != nil {
		return model.NewAppError("RemoveDirectMessageException", "app.direct_message_exception.delete.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return nil
}

func (a *App) GetDirectMessageExceptions(rctx request.CTX) ([]*model.DirectMessageException, *model.AppError) {
	exceptions, err := a.Srv().Store().DirectMessageException().GetAll()
	if err != nil {
		return nil, model.NewAppError("GetDirectMessageExceptions", "app.direct_message_exception.get_all.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return exceptions, nil
}

func (a *App) GetDirectMessageExceptionPartnerIDs(rctx request.CTX, userID string) ([]string, *model.AppError) {
	userIDs, err := a.Srv().Store().DirectMessageException().GetPartnersForUser(userID)
	if err != nil {
		return nil, model.NewAppError("GetDirectMessageExceptionPartnerIDs", "app.direct_message_exception.get_partners.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return userIDs, nil
}
