// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

// GloballyDiscoverableUser marks a user a system_admin has designated as visible/searchable to
// members of every team on the server, even when team-scoped user visibility restrictions
// (PermissionViewMembers) would otherwise hide them. This only affects discoverability, not
// direct-message eligibility — see DirectMessageException for that.
type GloballyDiscoverableUser struct {
	UserId   string `json:"user_id"`
	CreateAt int64  `json:"create_at"`
	CreateBy string `json:"create_by"`
}
