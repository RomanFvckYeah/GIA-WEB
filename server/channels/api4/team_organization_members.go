// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

func (api *API) InitTeamOrganizationMembers() {
	api.BaseRoutes.Team.Handle("/organization_members", api.APISessionRequired(getTeamOrganizationMembers)).Methods(http.MethodGet)
	api.BaseRoutes.Team.Handle("/organization_members/{user_id:[A-Za-z0-9]+}", api.APISessionRequired(addTeamOrganizationMember)).Methods(http.MethodPost)
	api.BaseRoutes.Team.Handle("/organization_members/{user_id:[A-Za-z0-9]+}", api.APISessionRequired(removeTeamOrganizationMember)).Methods(http.MethodDelete)
	api.BaseRoutes.User.Handle("/organization_teams", api.APISessionRequired(getUserOrganizationTeams)).Methods(http.MethodGet)
}

// getTeamOrganizationMembers lists the IDs of users a system_admin has marked as genuine
// organization members of this team. Open to any authenticated session — this isn't sensitive,
// and both the system_admin managing the list and any team_admin viewing the custom
// team-management panels need to know who shares organization membership in order to know
// which actions are allowed.
func getTeamOrganizationMembers(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireTeamId()
	if c.Err != nil {
		return
	}

	userIDs, err := c.App.GetTeamOrganizationMemberIDs(c.AppContext, c.Params.TeamId)
	if err != nil {
		c.Err = err
		return
	}

	if _, err := w.Write([]byte(model.ArrayToJSON(userIDs))); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func addTeamOrganizationMember(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireTeamId().RequireUserId()
	if c.Err != nil {
		return
	}

	if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionManageSystem) {
		c.SetPermissionError(model.PermissionManageSystem)
		return
	}

	if err := c.App.AddUserToTeamOrganization(c.AppContext, c.Params.TeamId, c.Params.UserId, c.AppContext.Session().UserId); err != nil {
		c.Err = err
		return
	}

	ReturnStatusOK(w)
}

func removeTeamOrganizationMember(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireTeamId().RequireUserId()
	if c.Err != nil {
		return
	}

	if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionManageSystem) {
		c.SetPermissionError(model.PermissionManageSystem)
		return
	}

	if err := c.App.RemoveUserFromTeamOrganization(c.AppContext, c.Params.TeamId, c.Params.UserId); err != nil {
		c.Err = err
		return
	}

	ReturnStatusOK(w)
}

// getUserOrganizationTeams lists the IDs of every team a user has been marked a genuine
// organization member of, across all teams — the reverse of getTeamOrganizationMembers. Gated on
// PermissionManageSystem (unlike the team-scoped GET, which is open to any session): this reveals
// a user's organization membership across every team at once, not just one the caller already has
// access-context for.
func getUserOrganizationTeams(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireUserId()
	if c.Err != nil {
		return
	}

	if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionManageSystem) {
		c.SetPermissionError(model.PermissionManageSystem)
		return
	}

	teamIDs, err := c.App.GetTeamOrganizationTeamsForUser(c.AppContext, c.Params.UserId)
	if err != nil {
		c.Err = err
		return
	}

	if _, err := w.Write([]byte(model.ArrayToJSON(teamIDs))); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}
