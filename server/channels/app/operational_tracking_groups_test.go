// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOperationalTrackingGroups(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	t.Run("creates a group with just a name", func(t *testing.T) {
		team := th.CreateTeam(t)

		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo 1", th.SystemAdminUser.Id)
		require.Nil(t, appErr)
		require.NotEmpty(t, group.Id)
		require.Equal(t, team.Id, group.TeamId)
		require.Equal(t, "Grupo 1", group.Name)
		require.Equal(t, th.SystemAdminUser.Id, group.CreateBy)
	})

	t.Run("a user can create many groups, and lists come back with member counts", func(t *testing.T) {
		team := th.CreateTeam(t)

		group1, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo A", th.SystemAdminUser.Id)
		require.Nil(t, appErr)
		group2, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo B", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		orgMember := th.CreateUser(t)
		appErr = th.App.AddUserToTeamOrganization(th.Context, team.Id, orgMember.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)
		appErr = th.App.AddOperationalTrackingGroupMember(th.Context, group1.Id, orgMember.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		groups, appErr := th.App.GetOperationalTrackingGroupsForTeam(th.Context, team.Id)
		require.Nil(t, appErr)
		require.Len(t, groups, 2)

		byID := map[string]int{}
		for _, g := range groups {
			byID[g.Id] = g.MemberCount
		}
		require.Equal(t, 1, byID[group1.Id])
		require.Equal(t, 0, byID[group2.Id])
	})

	t.Run("adding a member who IS an organization member succeeds", func(t *testing.T) {
		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		orgMember := th.CreateUser(t)
		appErr = th.App.AddUserToTeamOrganization(th.Context, team.Id, orgMember.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		appErr = th.App.AddOperationalTrackingGroupMember(th.Context, group.Id, orgMember.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		members, appErr := th.App.GetOperationalTrackingGroupMembers(th.Context, group.Id)
		require.Nil(t, appErr)
		require.Len(t, members, 1)
		require.Equal(t, orgMember.Id, members[0].UserId)
		require.Equal(t, th.SystemAdminUser.Id, members[0].CreateBy)
	})

	t.Run("adding a member who is NOT an organization member is rejected", func(t *testing.T) {
		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		outsider := th.CreateUser(t)

		appErr = th.App.AddOperationalTrackingGroupMember(th.Context, group.Id, outsider.Id, th.SystemAdminUser.Id)
		require.NotNil(t, appErr)

		members, appErr := th.App.GetOperationalTrackingGroupMembers(th.Context, group.Id)
		require.Nil(t, appErr)
		require.Empty(t, members)
	})

	t.Run("a user can belong to more than one group", func(t *testing.T) {
		team := th.CreateTeam(t)
		group1, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo 1", th.SystemAdminUser.Id)
		require.Nil(t, appErr)
		group2, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo 2", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		orgMember := th.CreateUser(t)
		appErr = th.App.AddUserToTeamOrganization(th.Context, team.Id, orgMember.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		appErr = th.App.AddOperationalTrackingGroupMember(th.Context, group1.Id, orgMember.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)
		appErr = th.App.AddOperationalTrackingGroupMember(th.Context, group2.Id, orgMember.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		members1, appErr := th.App.GetOperationalTrackingGroupMembers(th.Context, group1.Id)
		require.Nil(t, appErr)
		members2, appErr := th.App.GetOperationalTrackingGroupMembers(th.Context, group2.Id)
		require.Nil(t, appErr)
		require.Len(t, members1, 1)
		require.Len(t, members2, 1)
	})

	t.Run("removing a member", func(t *testing.T) {
		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		orgMember := th.CreateUser(t)
		require.Nil(t, th.App.AddUserToTeamOrganization(th.Context, team.Id, orgMember.Id, th.SystemAdminUser.Id))
		appErr = th.App.AddOperationalTrackingGroupMember(th.Context, group.Id, orgMember.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		appErr = th.App.RemoveOperationalTrackingGroupMember(th.Context, group.Id, orgMember.Id)
		require.Nil(t, appErr)

		members, appErr := th.App.GetOperationalTrackingGroupMembers(th.Context, group.Id)
		require.Nil(t, appErr)
		require.Empty(t, members)
	})

	t.Run("deleting a group also removes its members", func(t *testing.T) {
		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		orgMember := th.CreateUser(t)
		require.Nil(t, th.App.AddUserToTeamOrganization(th.Context, team.Id, orgMember.Id, th.SystemAdminUser.Id))
		appErr = th.App.AddOperationalTrackingGroupMember(th.Context, group.Id, orgMember.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		appErr = th.App.DeleteOperationalTrackingGroup(th.Context, group.Id)
		require.Nil(t, appErr)

		_, appErr = th.App.GetOperationalTrackingGroup(th.Context, group.Id)
		require.NotNil(t, appErr)

		groups, appErr := th.App.GetOperationalTrackingGroupsForTeam(th.Context, team.Id)
		require.Nil(t, appErr)
		require.Empty(t, groups)
	})

	t.Run("renaming a group", func(t *testing.T) {
		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Nombre Original", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		updated, appErr := th.App.UpdateOperationalTrackingGroupName(th.Context, group.Id, "  Nombre Actualizado  ")
		require.Nil(t, appErr)
		require.Equal(t, "Nombre Actualizado", updated.Name)

		fetched, appErr := th.App.GetOperationalTrackingGroup(th.Context, group.Id)
		require.Nil(t, appErr)
		require.Equal(t, "Nombre Actualizado", fetched.Name)
	})

	t.Run("renaming a group to an empty name is rejected", func(t *testing.T) {
		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Nombre Original", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		_, appErr = th.App.UpdateOperationalTrackingGroupName(th.Context, group.Id, "   ")
		require.NotNil(t, appErr)

		fetched, appErr := th.App.GetOperationalTrackingGroup(th.Context, group.Id)
		require.Nil(t, appErr)
		require.Equal(t, "Nombre Original", fetched.Name)
	})
}
