// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"errors"
	"net/http"
	"strings"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/request"
)

// coviaSyncFailedError is the shared error returned by every Operational Tracking Group mutation
// when Covia doesn't confirm success — nothing is changed locally in that case. 502 (Bad Gateway)
// because the failure is on the external service's side, not ours.
func coviaSyncFailedError(where, coviaMessage string) *model.AppError {
	return model.NewAppError(where, "app.operational_tracking_group.covia_sync_failed.app_error", nil, coviaMessage, http.StatusBadGateway)
}

// CreateOperationalTrackingGroup syncs to Covia BEFORE saving anything locally — if Covia doesn't
// confirm, no group is created at all (see coviaSyncFailedError).
func (a *App) CreateOperationalTrackingGroup(rctx request.CTX, teamID, name, createdBy string) (*model.OperationalTrackingGroup, *model.AppError) {
	group := &model.OperationalTrackingGroup{
		Id:       model.NewId(),
		TeamId:   teamID,
		Name:     model.SanitizeUnicode(strings.TrimSpace(name)),
		CreateBy: createdBy,
	}
	if group.Name == "" || len(group.Name) > model.OperationalTrackingGroupNameMaxLength {
		return nil, model.NewAppError("CreateOperationalTrackingGroup", "model.operational_tracking_group.is_valid.name.app_error", nil, "", http.StatusBadRequest)
	}

	succeeded, coviaGroupID, coviaMessage := a.SyncOperationalTrackingGroupToCovia(rctx, group.Id, group.CreateBy, group.Name)
	if !succeeded {
		return nil, coviaSyncFailedError("CreateOperationalTrackingGroup", coviaMessage)
	}
	if coviaGroupID != "" {
		group.CoviaSyncStatus = model.OperationalTrackingGroupCoviaSyncStatusSynced
		group.CoviaGroupId = coviaGroupID
		group.CoviaSyncedAt = model.GetMillis()
	}

	savedGroup, err := a.Srv().Store().OperationalTrackingGroup().Save(rctx, group)
	if err != nil {
		var appErr *model.AppError
		if errors.As(err, &appErr) {
			return nil, appErr
		}
		return nil, model.NewAppError("CreateOperationalTrackingGroup", "app.operational_tracking_group.save.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}

	return savedGroup, nil
}

// UpdateOperationalTrackingGroupName syncs the new name to Covia BEFORE renaming locally — if
// Covia doesn't confirm, the name doesn't change locally either (see coviaSyncFailedError).
func (a *App) UpdateOperationalTrackingGroupName(rctx request.CTX, groupID, name string) (*model.OperationalTrackingGroup, *model.AppError) {
	group, appErr := a.GetOperationalTrackingGroup(rctx, groupID)
	if appErr != nil {
		return nil, appErr
	}

	trimmedName := model.SanitizeUnicode(strings.TrimSpace(name))
	if trimmedName == "" || len(trimmedName) > model.OperationalTrackingGroupNameMaxLength {
		return nil, model.NewAppError("UpdateOperationalTrackingGroupName", "model.operational_tracking_group.is_valid.name.app_error", nil, "id="+groupID, http.StatusBadRequest)
	}

	succeeded, coviaMessage := a.SyncOperationalTrackingGroupRenamedToCovia(rctx, groupID, trimmedName)
	if !succeeded {
		return nil, coviaSyncFailedError("UpdateOperationalTrackingGroupName", coviaMessage)
	}

	if err := a.Srv().Store().OperationalTrackingGroup().UpdateName(groupID, trimmedName); err != nil {
		return nil, model.NewAppError("UpdateOperationalTrackingGroupName", "app.operational_tracking_group.update_name.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}

	group.Name = trimmedName
	return group, nil
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

// DeleteOperationalTrackingGroup syncs the deletion to Covia BEFORE deleting anything locally —
// Covia removes all of that group's members on its own side; we still remove our own local
// OperationalTrackingGroupMembers rows here (store.Delete already does both in one call), since
// that data lives in our own database regardless of what Covia does with its copy.
func (a *App) DeleteOperationalTrackingGroup(rctx request.CTX, groupID string) *model.AppError {
	succeeded, coviaMessage := a.SyncOperationalTrackingGroupDeletedToCovia(rctx, groupID)
	if !succeeded {
		return coviaSyncFailedError("DeleteOperationalTrackingGroup", coviaMessage)
	}

	if err := a.Srv().Store().OperationalTrackingGroup().Delete(groupID); err != nil {
		return model.NewAppError("DeleteOperationalTrackingGroup", "app.operational_tracking_group.delete.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}

	return nil
}

// AddOperationalTrackingGroupMember enforces the "organization members only" restriction: userID
// must already be a genuine TeamOrganizationMember of the group's team, otherwise the addition is
// rejected server-side, not just hidden from the UI's "add member" picker. Syncs to Covia BEFORE
// adding the member locally — if Covia doesn't confirm, the member isn't added locally either.
func (a *App) AddOperationalTrackingGroupMember(rctx request.CTX, groupID, userID, addedBy string) *model.AppError {
	group, appErr := a.GetOperationalTrackingGroup(rctx, groupID)
	if appErr != nil {
		return appErr
	}

	if !a.IsUserOrgMemberOfTeam(rctx, group.TeamId, userID) {
		return model.NewAppError("AddOperationalTrackingGroupMember", "app.operational_tracking_group.add_member.not_org_member.app_error", nil, "", http.StatusBadRequest)
	}

	if succeeded, coviaMessage := a.SyncOperationalTrackingGroupMemberAddedToCovia(rctx, groupID, userID); !succeeded {
		return coviaSyncFailedError("AddOperationalTrackingGroupMember", coviaMessage)
	}

	if err := a.Srv().Store().OperationalTrackingGroup().AddMember(rctx, groupID, userID, addedBy); err != nil {
		return model.NewAppError("AddOperationalTrackingGroupMember", "app.operational_tracking_group.add_member.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}

	return nil
}

// RemoveOperationalTrackingGroupMember syncs to Covia BEFORE removing the member locally — if
// Covia doesn't confirm, the member isn't removed locally either.
func (a *App) RemoveOperationalTrackingGroupMember(rctx request.CTX, groupID, userID string) *model.AppError {
	if succeeded, coviaMessage := a.SyncOperationalTrackingGroupMemberRemovedToCovia(rctx, groupID, userID); !succeeded {
		return coviaSyncFailedError("RemoveOperationalTrackingGroupMember", coviaMessage)
	}

	if err := a.Srv().Store().OperationalTrackingGroup().RemoveMember(groupID, userID); err != nil {
		return model.NewAppError("RemoveOperationalTrackingGroupMember", "app.operational_tracking_group.remove_member.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}

	return nil
}

func (a *App) GetOperationalTrackingGroupMembers(rctx request.CTX, groupID string) ([]*model.OperationalTrackingGroupMember, *model.AppError) {
	members, err := a.Srv().Store().OperationalTrackingGroup().GetMembers(groupID)
	if err != nil {
		return nil, model.NewAppError("GetOperationalTrackingGroupMembers", "app.operational_tracking_group.get_members.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}
	return members, nil
}
