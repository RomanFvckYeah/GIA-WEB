// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"encoding/json"
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

func (api *API) InitDirectMessageExceptions() {
	api.BaseRoutes.APIRoot.Handle("/direct_message_exceptions", api.APISessionRequired(getDirectMessageExceptions)).Methods(http.MethodGet)
	api.BaseRoutes.APIRoot.Handle("/direct_message_exceptions/{user_id:[A-Za-z0-9]+}/{other_user_id:[A-Za-z0-9]+}", api.APISessionRequired(addDirectMessageException)).Methods(http.MethodPost)
	api.BaseRoutes.APIRoot.Handle("/direct_message_exceptions/{user_id:[A-Za-z0-9]+}/{other_user_id:[A-Za-z0-9]+}", api.APISessionRequired(removeDirectMessageException)).Methods(http.MethodDelete)
	api.BaseRoutes.Users.Handle("/me/direct_message_exceptions", api.APISessionRequired(getMyDirectMessageExceptionPartners)).Methods(http.MethodGet)
}

// getDirectMessageExceptions lists every cross-team direct message exception a system_admin has
// configured. system_admin only, since it lists pairs across the whole server.
func getDirectMessageExceptions(c *Context, w http.ResponseWriter, r *http.Request) {
	if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionManageSystem) {
		c.SetPermissionError(model.PermissionManageSystem)
		return
	}

	exceptions, err := c.App.GetDirectMessageExceptions(c.AppContext)
	if err != nil {
		c.Err = err
		return
	}

	if err := json.NewEncoder(w).Encode(exceptions); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

// getMyDirectMessageExceptionPartners lists the IDs of users the calling session's own user has
// been granted a direct message exception with. Open to any authenticated session, self-only —
// the client needs this to merge exception partners into its own DM composer search results.
func getMyDirectMessageExceptionPartners(c *Context, w http.ResponseWriter, r *http.Request) {
	userIDs, err := c.App.GetDirectMessageExceptionPartnerIDs(c.AppContext, c.AppContext.Session().UserId)
	if err != nil {
		c.Err = err
		return
	}

	if _, err := w.Write([]byte(model.ArrayToJSON(userIDs))); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func addDirectMessageException(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireUserId().RequireOtherUserId()
	if c.Err != nil {
		return
	}

	if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionManageSystem) {
		c.SetPermissionError(model.PermissionManageSystem)
		return
	}

	if c.Params.UserId == c.Params.OtherUserId {
		c.Err = model.NewAppError("addDirectMessageException", "api.direct_message_exception.self_pair.app_error", nil, "", http.StatusBadRequest)
		return
	}

	if err := c.App.AddDirectMessageException(c.AppContext, c.Params.UserId, c.Params.OtherUserId, c.AppContext.Session().UserId); err != nil {
		c.Err = err
		return
	}

	ReturnStatusOK(w)
}

func removeDirectMessageException(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireUserId().RequireOtherUserId()
	if c.Err != nil {
		return
	}

	if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionManageSystem) {
		c.SetPermissionError(model.PermissionManageSystem)
		return
	}

	if err := c.App.RemoveDirectMessageException(c.AppContext, c.Params.UserId, c.Params.OtherUserId); err != nil {
		c.Err = err
		return
	}

	ReturnStatusOK(w)
}
