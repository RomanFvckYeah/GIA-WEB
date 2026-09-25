// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

// DirectMessageException marks an unordered pair of users a system_admin has designated as
// allowed to open a direct message channel with each other even when TeamSettings.RestrictDirectMessage
// is "team" and the two users share no common team.
type DirectMessageException struct {
	UserId1  string `json:"user_id_1"`
	UserId2  string `json:"user_id_2"`
	CreateAt int64  `json:"create_at"`
	CreateBy string `json:"create_by"`
}
