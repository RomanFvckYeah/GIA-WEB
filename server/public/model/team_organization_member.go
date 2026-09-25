// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

// TeamOrganizationMember marks a (team, user) pair a system_admin has designated as a genuine
// member of that team's organization, as opposed to someone merely added to the team (e.g. for
// cross-organization support). team_admins may only edit/remove users they share organization
// membership with in that team.
type TeamOrganizationMember struct {
	TeamId   string `json:"team_id"`
	UserId   string `json:"user_id"`
	CreateAt int64  `json:"create_at"`
	CreateBy string `json:"create_by"`
}
