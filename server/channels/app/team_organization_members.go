// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/mattermost/server/public/shared/request"
)

// IsUserOrgMemberOfTeam reports whether userID is a designated genuine member of teamID's
// organization. Fails open (false) on store error, matching the fail-open behavior of other
// permission lookups in this file.
func (a *App) IsUserOrgMemberOfTeam(rctx request.CTX, teamID, userID string) bool {
	isMember, err := a.Srv().Store().TeamOrganizationMember().IsOrgMember(teamID, userID)
	if err != nil {
		rctx.Logger().Warn("Failed to check team organization membership", mlog.Err(err))
		return false
	}
	return isMember
}

func (a *App) AddUserToTeamOrganization(rctx request.CTX, teamID, userID, createdBy string) *model.AppError {
	if err := a.Srv().Store().TeamOrganizationMember().Save(rctx, teamID, userID, createdBy); err != nil {
		return model.NewAppError("AddUserToTeamOrganization", "app.team_organization_member.save.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return nil
}

func (a *App) RemoveUserFromTeamOrganization(rctx request.CTX, teamID, userID string) *model.AppError {
	if err := a.Srv().Store().TeamOrganizationMember().Delete(teamID, userID); err != nil {
		return model.NewAppError("RemoveUserFromTeamOrganization", "app.team_organization_member.delete.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return nil
}

func (a *App) GetTeamOrganizationMemberIDs(rctx request.CTX, teamID string) ([]string, *model.AppError) {
	userIDs, err := a.Srv().Store().TeamOrganizationMember().GetForTeam(teamID)
	if err != nil {
		return nil, model.NewAppError("GetTeamOrganizationMemberIDs", "app.team_organization_member.get_for_team.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return userIDs, nil
}

// GetTeamOrganizationTeamsForUser returns the IDs of every team userID has been marked a genuine
// organization member of, regardless of whether they hold a real TeamMember row for that team —
// the reverse direction of GetTeamOrganizationMemberIDs.
func (a *App) GetTeamOrganizationTeamsForUser(rctx request.CTX, userID string) ([]string, *model.AppError) {
	teamIDs, err := a.Srv().Store().TeamOrganizationMember().GetForUser(userID)
	if err != nil {
		return nil, model.NewAppError("GetTeamOrganizationTeamsForUser", "app.team_organization_member.get_for_user.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return teamIDs, nil
}
