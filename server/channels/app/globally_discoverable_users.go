// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/mattermost/server/public/shared/request"
)

// IsGloballyDiscoverable reports whether userID has been designated by a system_admin as visible
// to members of every team on the server. Fails open (false) on store error, matching the
// fail-open behavior of other permission lookups in this package.
func (a *App) IsGloballyDiscoverable(rctx request.CTX, userID string) bool {
	discoverable, err := a.Srv().Store().GloballyDiscoverableUser().IsDiscoverable(userID)
	if err != nil {
		rctx.Logger().Warn("Failed to check globally discoverable user", mlog.Err(err))
		return false
	}
	return discoverable
}

func (a *App) AddGloballyDiscoverableUser(rctx request.CTX, userID, createdBy string) *model.AppError {
	if err := a.Srv().Store().GloballyDiscoverableUser().Save(rctx, userID, createdBy); err != nil {
		return model.NewAppError("AddGloballyDiscoverableUser", "app.globally_discoverable_user.save.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return nil
}

func (a *App) RemoveGloballyDiscoverableUser(rctx request.CTX, userID string) *model.AppError {
	if err := a.Srv().Store().GloballyDiscoverableUser().Delete(userID); err != nil {
		return model.NewAppError("RemoveGloballyDiscoverableUser", "app.globally_discoverable_user.delete.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return nil
}

func (a *App) GetGloballyDiscoverableUserIDs(rctx request.CTX) ([]string, *model.AppError) {
	userIDs, err := a.Srv().Store().GloballyDiscoverableUser().GetAll()
	if err != nil {
		return nil, model.NewAppError("GetGloballyDiscoverableUserIDs", "app.globally_discoverable_user.get_all.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return userIDs, nil
}
