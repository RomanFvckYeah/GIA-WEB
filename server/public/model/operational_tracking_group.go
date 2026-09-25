// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import (
	"encoding/json"
	"net/http"
)

const OperationalTrackingGroupNameMaxLength = 64

const (
	OperationalTrackingGroupCoviaSyncStatusPending = "pending"
	OperationalTrackingGroupCoviaSyncStatusSynced  = "synced"
	OperationalTrackingGroupCoviaSyncStatusFailed  = "failed"
)

// OperationalTrackingGroup is a team-scoped group a team_admin/system_admin creates under the
// "Rastreo Operativo" tab. Deliberately named to avoid any collision with Mattermost's own
// Group/GroupMember (LDAP/SAML sync) — this is unrelated, fork-specific data.
type OperationalTrackingGroup struct {
	Id       string `json:"id"`
	TeamId   string `json:"team_id"`
	Name     string `json:"name"`
	CreateAt int64  `json:"create_at"`
	CreateBy string `json:"create_by"`

	// MemberCount is populated by GetForTeam via a correlated subquery — not a stored column.
	MemberCount int `json:"member_count"`

	// CoviaSyncStatus/CoviaSyncedAt track whether the external Covia service has acknowledged
	// this group (see App.SyncOperationalTrackingGroupToCovia) — purely informational, never
	// gates whether the group exists or can be used locally.
	CoviaSyncStatus string `json:"covia_sync_status"`
	CoviaSyncedAt   int64  `json:"covia_synced_at"`

	// CoviaSyncPreview is filled in by the create-group API handler only (see
	// App.PreviewCoviaGroupPayload) — the exact payload that was/will be sent to Covia for this
	// group, echoed back purely so it's visible for verification. Never a stored column, never
	// set by anything that reads a group back out of the store.
	CoviaSyncPreview json.RawMessage `json:"covia_sync_preview,omitempty"`
}

// OperationalTrackingGroupMember records that UserId belongs to GroupId, and who added them
// (CreateBy) — a user can belong to many groups, and a group can have many members.
type OperationalTrackingGroupMember struct {
	GroupId  string `json:"group_id"`
	UserId   string `json:"user_id"`
	CreateAt int64  `json:"create_at"`
	CreateBy string `json:"create_by"`
}

func (g *OperationalTrackingGroup) PreSave() {
	if g.Id == "" {
		g.Id = NewId()
	}
	g.Name = SanitizeUnicode(g.Name)
	g.CreateAt = GetMillis()
	if g.CoviaSyncStatus == "" {
		g.CoviaSyncStatus = OperationalTrackingGroupCoviaSyncStatusPending
	}
}

func (g *OperationalTrackingGroup) IsValid() *AppError {
	if !IsValidId(g.Id) {
		return NewAppError("OperationalTrackingGroup.IsValid", "model.operational_tracking_group.is_valid.id.app_error", nil, "", http.StatusBadRequest)
	}

	if !IsValidId(g.TeamId) {
		return NewAppError("OperationalTrackingGroup.IsValid", "model.operational_tracking_group.is_valid.team_id.app_error", nil, "id="+g.Id, http.StatusBadRequest)
	}

	if g.Name == "" || len(g.Name) > OperationalTrackingGroupNameMaxLength {
		return NewAppError("OperationalTrackingGroup.IsValid", "model.operational_tracking_group.is_valid.name.app_error", nil, "id="+g.Id, http.StatusBadRequest)
	}

	if g.CreateAt == 0 {
		return NewAppError("OperationalTrackingGroup.IsValid", "model.operational_tracking_group.is_valid.create_at.app_error", nil, "id="+g.Id, http.StatusBadRequest)
	}

	return nil
}
