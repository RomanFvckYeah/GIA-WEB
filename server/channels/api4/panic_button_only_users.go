// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

func (api *API) InitPanicButtonOnlyUsers() {
	api.BaseRoutes.APIRoot.Handle("/panic_button_only_users", api.APISessionRequired(getPanicButtonOnlyUsers)).Methods(http.MethodGet)
	api.BaseRoutes.APIRoot.Handle("/panic_button_only_users/{user_id:[A-Za-z0-9]+}", api.APISessionRequired(addPanicButtonOnlyUser)).Methods(http.MethodPost)
	api.BaseRoutes.APIRoot.Handle("/panic_button_only_users/{user_id:[A-Za-z0-9]+}", api.APISessionRequired(removePanicButtonOnlyUser)).Methods(http.MethodDelete)
}

// getPanicButtonOnlyUsers lists the IDs of users restricted to the mobile panic-button flow
// only. Open to any authenticated session — the webapp needs this both to know whether the
// CURRENT user is restricted (and should be redirected to the panic-restricted screen) and to
// pre-fill the toggle in the team_statistics admin panel.
func getPanicButtonOnlyUsers(c *Context, w http.ResponseWriter, r *http.Request) {
	userIDs, err := c.App.GetPanicButtonOnlyUserIDs(c.AppContext)
	if err != nil {
		c.Err = err
		return
	}

	if _, err := w.Write([]byte(model.ArrayToJSON(userIDs))); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

// hasPanicButtonOnlyManagePermission reports whether the session may set/clear the
// panic-button-only flag for userID: a system_admin always can, and a team_admin can for a
// user who is a genuine organization member of a team the caller also manages (see
// SessionHasPermissionToOrgMemberViaTeamAdmin — a plain SessionHasPermissionToUserViaTeamAdmin
// check won't work here since a panic-button-only target has no real TeamMember row to look up).
func hasPanicButtonOnlyManagePermission(c *Context, userID string) bool {
	session := *c.AppContext.Session()
	return c.App.SessionHasPermissionTo(session, model.PermissionManageSystem) ||
		c.App.SessionHasPermissionToOrgMemberViaTeamAdmin(c.AppContext, session, userID)
}

func addPanicButtonOnlyUser(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireUserId()
	if c.Err != nil {
		return
	}

	if !hasPanicButtonOnlyManagePermission(c, c.Params.UserId) {
		c.SetPermissionError(model.PermissionManageSystem)
		return
	}

	if err := c.App.MarkPanicButtonOnly(c.AppContext, c.Params.UserId, c.AppContext.Session().UserId); err != nil {
		c.Err = err
		return
	}

	ReturnStatusOK(w)
}

func removePanicButtonOnlyUser(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireUserId()
	if c.Err != nil {
		return
	}

	if !hasPanicButtonOnlyManagePermission(c, c.Params.UserId) {
		c.SetPermissionError(model.PermissionManageSystem)
		return
	}

	if err := c.App.RemovePanicButtonOnlyUser(c.AppContext, c.Params.UserId); err != nil {
		c.Err = err
		return
	}

	ReturnStatusOK(w)
}
