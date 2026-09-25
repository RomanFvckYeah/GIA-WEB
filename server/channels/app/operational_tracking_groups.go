// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"errors"
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/request"
)

func (a *App) CreateOperationalTrackingGroup(rctx request.CTX, teamID, name, createdBy string) (*model.OperationalTrackingGroup, *model.AppError) {
	group := &model.OperationalTrackingGroup{
		TeamId:   teamID,
		Name:     name,
		CreateBy: createdBy,
	}

	savedGroup, err := a.Srv().Store().OperationalTrackingGroup().Save(rctx, group)
	if err != nil {
		var appErr *model.AppError
		if errors.As(err, &appErr) {
			return nil, appErr
		}
		return nil, model.NewAppError("CreateOperationalTrackingGroup", "app.operational_tracking_group.save.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}

	a.SyncOperationalTrackingGroupToCovia(rctx, savedGroup)

	return savedGroup, nil
}

func (a *App) GetOperationalTrackingGroup(rctx request.CTX, groupID string) (*model.OperationalTrackingGroup, *model.AppError) {
	group, err := a.Srv().Store().OperationalTrackingGroup().Get(groupID)
	if err != nil {
		return nil, model.NewAppError("GetOperationalTrackingGroup", "app.operational_tracking_group.get.app_error", nil, "", http.StatusNotFound).Wrap(err)
	}
	return group, nil
}

func (a *App) GetOperationalTrackingGroupsForTeam(rctx request.CTX, teamID string) ([]*model.OperationalTrackingGroup, *model.AppError) {
	groups, err := a.Srv().Store().OperationalTrackingGroup().GetForTeam(teamID)
	if err != nil {
		return nil, model.NewAppError("GetOperationalTrackingGroupsForTeam", "app.operational_tracking_group.get_for_team.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return groups, nil
}

func (a *App) DeleteOperationalTrackingGroup(rctx request.CTX, groupID string) *model.AppError {
	if err := a.Srv().Store().OperationalTrackingGroup().Delete(groupID); err != nil {
		return model.NewAppError("DeleteOperationalTrackingGroup", "app.operational_tracking_group.delete.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return nil
}

// AddOperationalTrackingGroupMember enforces the "organization members only" restriction: userID
// must already be a genuine TeamOrganizationMember of the group's team, otherwise the addition is
// rejected server-side, not just hidden from the UI's "add member" picker.
func (a *App) AddOperationalTrackingGroupMember(rctx request.CTX, groupID, userID, addedBy string) *model.AppError {
	group, appErr := a.GetOperationalTrackingGroup(rctx, groupID)
	if appErr != nil {
		return appErr
	}

	if !a.IsUserOrgMemberOfTeam(rctx, group.TeamId, userID) {
		return model.NewAppError("AddOperationalTrackingGroupMember", "app.operational_tracking_group.add_member.not_org_member.app_error", nil, "", http.StatusBadRequest)
	}

	if err := a.Srv().Store().OperationalTrackingGroup().AddMember(rctx, groupID, userID, addedBy); err != nil {
		return model.NewAppError("AddOperationalTrackingGroupMember", "app.operational_tracking_group.add_member.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}

	a.SyncOperationalTrackingGroupMemberAddedToCovia(rctx, groupID, userID)

	return nil
}

func (a *App) RemoveOperationalTrackingGroupMember(rctx request.CTX, groupID, userID string) *model.AppError {
	if err := a.Srv().Store().OperationalTrackingGroup().RemoveMember(groupID, userID); err != nil {
		return model.NewAppError("RemoveOperationalTrackingGroupMember", "app.operational_tracking_group.remove_member.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}

	a.SyncOperationalTrackingGroupMemberRemovedToCovia(rctx, groupID, userID)

	return nil
}

func (a *App) GetOperationalTrackingGroupMembers(rctx request.CTX, groupID string) ([]*model.OperationalTrackingGroupMember, *model.AppError) {
	members, err := a.Srv().Store().OperationalTrackingGroup().GetMembers(groupID)
	if err != nil {
		return nil, model.NewAppError("GetOperationalTrackingGroupMembers", "app.operational_tracking_group.get_members.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return members, nil
}
