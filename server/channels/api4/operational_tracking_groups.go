// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"encoding/json"
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

func (api *API) InitOperationalTrackingGroups() {
	api.BaseRoutes.Team.Handle("/operational_tracking_groups", api.APISessionRequired(createOperationalTrackingGroup)).Methods(http.MethodPost)
	api.BaseRoutes.Team.Handle("/operational_tracking_groups", api.APISessionRequired(getOperationalTrackingGroupsForTeam)).Methods(http.MethodGet)
	api.BaseRoutes.APIRoot.Handle("/operational_tracking_groups/{group_id:[A-Za-z0-9]+}", api.APISessionRequired(updateOperationalTrackingGroupName)).Methods(http.MethodPatch)
	api.BaseRoutes.APIRoot.Handle("/operational_tracking_groups/{group_id:[A-Za-z0-9]+}", api.APISessionRequired(deleteOperationalTrackingGroup)).Methods(http.MethodDelete)
	api.BaseRoutes.APIRoot.Handle("/operational_tracking_groups/{group_id:[A-Za-z0-9]+}/members", api.APISessionRequired(getOperationalTrackingGroupMembers)).Methods(http.MethodGet)
	api.BaseRoutes.APIRoot.Handle("/operational_tracking_groups/{group_id:[A-Za-z0-9]+}/members/{user_id:[A-Za-z0-9]+}", api.APISessionRequired(addOperationalTrackingGroupMember)).Methods(http.MethodPost)
	api.BaseRoutes.APIRoot.Handle("/operational_tracking_groups/{group_id:[A-Za-z0-9]+}/members/{user_id:[A-Za-z0-9]+}", api.APISessionRequired(removeOperationalTrackingGroupMember)).Methods(http.MethodDelete)
}

// canManageOperationalTrackingGroupsForTeam reports whether the session may create/list/manage
// operational tracking groups for teamID — same gate as createTeamMember (team_create_member.go):
// a team_admin of that specific team, or a system_admin.
func canManageOperationalTrackingGroupsForTeam(c *Context, teamID string) bool {
	session := *c.AppContext.Session()
	return c.App.SessionHasPermissionToTeam(session, teamID, model.PermissionManageTeam) ||
		c.App.SessionHasPermissionTo(session, model.PermissionManageSystem)
}

func createOperationalTrackingGroup(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireTeamId()
	if c.Err != nil {
		return
	}

	if !canManageOperationalTrackingGroupsForTeam(c, c.Params.TeamId) {
		c.SetPermissionError(model.PermissionManageTeam)
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	if jsonErr := json.NewDecoder(r.Body).Decode(&body); jsonErr != nil {
		c.SetInvalidParamWithErr("name", jsonErr)
		return
	}

	group, appErr := c.App.CreateOperationalTrackingGroup(c.AppContext, c.Params.TeamId, body.Name, c.AppContext.Session().UserId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	// Echoes back the exact payload that was (or will be) sent to Covia for this group, purely
	// so it's visible in the browser console for verification while Covia's real endpoint
	// doesn't exist yet — see App.PreviewCoviaGroupPayload.
	group.CoviaSyncPreview = c.App.PreviewCoviaGroupPayload(group)

	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(group); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func getOperationalTrackingGroupsForTeam(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireTeamId()
	if c.Err != nil {
		return
	}

	if !canManageOperationalTrackingGroupsForTeam(c, c.Params.TeamId) {
		c.SetPermissionError(model.PermissionManageTeam)
		return
	}

	groups, appErr := c.App.GetOperationalTrackingGroupsForTeam(c.AppContext, c.Params.TeamId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if err := json.NewEncoder(w).Encode(groups); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func updateOperationalTrackingGroupName(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireGroupId()
	if c.Err != nil {
		return
	}

	group, appErr := c.App.GetOperationalTrackingGroup(c.AppContext, c.Params.GroupId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if !canManageOperationalTrackingGroupsForTeam(c, group.TeamId) {
		c.SetPermissionError(model.PermissionManageTeam)
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	if jsonErr := json.NewDecoder(r.Body).Decode(&body); jsonErr != nil {
		c.SetInvalidParamWithErr("name", jsonErr)
		return
	}

	updated, appErr := c.App.UpdateOperationalTrackingGroupName(c.AppContext, group.Id, body.Name)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if err := json.NewEncoder(w).Encode(updated); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func deleteOperationalTrackingGroup(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireGroupId()
	if c.Err != nil {
		return
	}

	group, appErr := c.App.GetOperationalTrackingGroup(c.AppContext, c.Params.GroupId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if !canManageOperationalTrackingGroupsForTeam(c, group.TeamId) {
		c.SetPermissionError(model.PermissionManageTeam)
		return
	}

	if appErr := c.App.DeleteOperationalTrackingGroup(c.AppContext, group.Id); appErr != nil {
		c.Err = appErr
		return
	}

	ReturnStatusOK(w)
}

func getOperationalTrackingGroupMembers(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireGroupId()
	if c.Err != nil {
		return
	}

	group, appErr := c.App.GetOperationalTrackingGroup(c.AppContext, c.Params.GroupId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if !canManageOperationalTrackingGroupsForTeam(c, group.TeamId) {
		c.SetPermissionError(model.PermissionManageTeam)
		return
	}

	members, appErr := c.App.GetOperationalTrackingGroupMembers(c.AppContext, group.Id)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if err := json.NewEncoder(w).Encode(members); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func addOperationalTrackingGroupMember(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireGroupId().RequireUserId()
	if c.Err != nil {
		return
	}

	group, appErr := c.App.GetOperationalTrackingGroup(c.AppContext, c.Params.GroupId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if !canManageOperationalTrackingGroupsForTeam(c, group.TeamId) {
		c.SetPermissionError(model.PermissionManageTeam)
		return
	}

	if appErr := c.App.AddOperationalTrackingGroupMember(c.AppContext, group.Id, c.Params.UserId, c.AppContext.Session().UserId); appErr != nil {
		c.Err = appErr
		return
	}

	// Echoes back the exact payload that was sent to Covia for this member, purely so it's
	// visible in the browser console for verification. A failure here doesn't affect the add
	// itself (already committed above, since it required Covia's confirmation); the preview is
	// just omitted.
	preview, previewErr := c.App.PreviewCoviaGroupMemberPayload(c.AppContext, c.Params.UserId)
	if previewErr != nil {
		c.Logger.Warn("Failed to build Covia sync preview", mlog.Err(previewErr))
	}

	response := struct {
		Status           string          `json:"status"`
		CoviaSyncPreview json.RawMessage `json:"covia_sync_preview,omitempty"`
	}{
		Status:           model.StatusOk,
		CoviaSyncPreview: preview,
	}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func removeOperationalTrackingGroupMember(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireGroupId().RequireUserId()
	if c.Err != nil {
		return
	}

	group, appErr := c.App.GetOperationalTrackingGroup(c.AppContext, c.Params.GroupId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if !canManageOperationalTrackingGroupsForTeam(c, group.TeamId) {
		c.SetPermissionError(model.PermissionManageTeam)
		return
	}

	if appErr := c.App.RemoveOperationalTrackingGroupMember(c.AppContext, group.Id, c.Params.UserId); appErr != nil {
		c.Err = appErr
		return
	}

	ReturnStatusOK(w)
}
