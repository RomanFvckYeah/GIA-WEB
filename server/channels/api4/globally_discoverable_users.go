// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

func (api *API) InitGloballyDiscoverableUsers() {
	api.BaseRoutes.APIRoot.Handle("/globally_discoverable_users", api.APISessionRequired(getGloballyDiscoverableUsers)).Methods(http.MethodGet)
	api.BaseRoutes.APIRoot.Handle("/globally_discoverable_users/{user_id:[A-Za-z0-9]+}", api.APISessionRequired(addGloballyDiscoverableUser)).Methods(http.MethodPost)
	api.BaseRoutes.APIRoot.Handle("/globally_discoverable_users/{user_id:[A-Za-z0-9]+}", api.APISessionRequired(removeGloballyDiscoverableUser)).Methods(http.MethodDelete)
}

// getGloballyDiscoverableUsers lists the IDs of users a system_admin has marked visible to every
// team on the server. Open to any authenticated session — clients need this list to merge
// globally discoverable users into their own team-scoped search results.
func getGloballyDiscoverableUsers(c *Context, w http.ResponseWriter, r *http.Request) {
	userIDs, err := c.App.GetGloballyDiscoverableUserIDs(c.AppContext)
	if err != nil {
		c.Err = err
		return
	}

	if _, err := w.Write([]byte(model.ArrayToJSON(userIDs))); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func addGloballyDiscoverableUser(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireUserId()
	if c.Err != nil {
		return
	}

	if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionManageSystem) {
		c.SetPermissionError(model.PermissionManageSystem)
		return
	}

	if err := c.App.AddGloballyDiscoverableUser(c.AppContext, c.Params.UserId, c.AppContext.Session().UserId); err != nil {
		c.Err = err
		return
	}

	ReturnStatusOK(w)
}

func removeGloballyDiscoverableUser(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireUserId()
	if c.Err != nil {
		return
	}

	if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionManageSystem) {
		c.SetPermissionError(model.PermissionManageSystem)
		return
	}

	if err := c.App.RemoveGloballyDiscoverableUser(c.AppContext, c.Params.UserId); err != nil {
		c.Err = err
		return
	}

	ReturnStatusOK(w)
}
