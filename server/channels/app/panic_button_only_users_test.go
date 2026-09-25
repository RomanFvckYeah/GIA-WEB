// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost/server/public/model"
)

func TestMarkPanicButtonOnly(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	t.Run("removes an existing real team membership", func(t *testing.T) {
		team := th.CreateTeam(t)
		user := th.CreateUser(t)
		th.LinkUserToTeam(t, user, team)

		// Sanity check: the user is really a team member before marking them panic-button-only.
		teamMembers, appErr := th.App.GetTeamMembersForUser(th.Context, user.Id, "", false)
		require.Nil(t, appErr)
		require.Len(t, teamMembers, 1)
		require.Equal(t, team.Id, teamMembers[0].TeamId)

		appErr = th.App.MarkPanicButtonOnly(th.Context, user.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)
		defer func() {
			appErr := th.App.RemovePanicButtonOnlyUser(th.Context, user.Id)
			require.Nil(t, appErr)
		}()

		require.True(t, th.App.IsPanicButtonOnly(th.Context, user.Id))

		teamMembers, appErr = th.App.GetTeamMembersForUser(th.Context, user.Id, "", false)
		require.Nil(t, appErr)
		require.Empty(t, teamMembers, "marking a user panic-button-only should remove them from every team they were really a member of")

		// And, per the JoinUserToTeam guard, they can no longer be added back while the flag holds.
		_, appErr = th.App.JoinUserToTeam(th.Context, team, user, "")
		require.NotNil(t, appErr)
	})

	t.Run("is a no-op for a user with no team memberships", func(t *testing.T) {
		user := th.CreateUser(t)

		appErr := th.App.MarkPanicButtonOnly(th.Context, user.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)
		defer func() {
			appErr := th.App.RemovePanicButtonOnlyUser(th.Context, user.Id)
			require.Nil(t, appErr)
		}()

		require.True(t, th.App.IsPanicButtonOnly(th.Context, user.Id))
	})
}

func TestAttachPanicButtonOnlyProp(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	t.Run("sets the prop to true for a panic-button-only user", func(t *testing.T) {
		user := th.CreateUser(t)

		appErr := th.App.MarkPanicButtonOnly(th.Context, user.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)
		defer func() {
			appErr := th.App.RemovePanicButtonOnlyUser(th.Context, user.Id)
			require.Nil(t, appErr)
		}()

		isPanicButtonOnly := th.App.AttachPanicButtonOnlyProp(th.Context, user)
		require.True(t, isPanicButtonOnly)
		require.Equal(t, "true", user.Props[model.UserPropsKeyPanicButtonOnly])
	})

	t.Run("sets the prop to false for a regular user", func(t *testing.T) {
		user := th.CreateUser(t)

		isPanicButtonOnly := th.App.AttachPanicButtonOnlyProp(th.Context, user)
		require.False(t, isPanicButtonOnly)
		require.Equal(t, "false", user.Props[model.UserPropsKeyPanicButtonOnly])
	})

	t.Run("initializes a nil Props map", func(t *testing.T) {
		user := th.CreateUser(t)
		user.Props = nil

		require.NotPanics(t, func() {
			th.App.AttachPanicButtonOnlyProp(th.Context, user)
		})
		require.Equal(t, "false", user.Props[model.UserPropsKeyPanicButtonOnly])
	})
}
