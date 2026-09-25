// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

// UserPropsKeyPanicButtonOnly is the User.Props key used to surface panic-button-only status to
// clients (login response, GET /users/me) without adding a dedicated column/field to model.User.
// Value is the string "true" or "false", always set explicitly (see App.AttachPanicButtonOnlyProp).
const UserPropsKeyPanicButtonOnly = "panic_button_only"

// PanicButtonOnlyUser marks a user account as restricted to the mobile panic-button flow only:
// it must never become a member of any team (enforced in App.JoinUserToTeam), so it can never
// see any team or channel content — only the panic button in the branded mobile app.
type PanicButtonOnlyUser struct {
	UserId   string `json:"user_id"`
	CreateAt int64  `json:"create_at"`
	CreateBy string `json:"create_by"`
}
