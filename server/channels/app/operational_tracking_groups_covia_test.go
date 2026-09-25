// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost/server/public/model"
)

func enableCoviaForTest(th *TestHelper, baseURL string) {
	th.App.UpdateConfig(func(cfg *model.Config) {
		cfg.CoviaSettings.Enable = model.NewPointer(true)
		cfg.CoviaSettings.BaseURL = model.NewPointer(baseURL)
		cfg.CoviaSettings.APIKey = model.NewPointer("test-api-key")
	})
}

func TestSyncOperationalTrackingGroupToCovia(t *testing.T) {
	mainHelper.Parallel(t)

	t.Run("marks the group synced when Covia responds OK", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		var receivedBody coviaGroupPayload
		var receivedAuth string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			receivedAuth = r.Header.Get("Authorization")
			require.NoError(t, json.NewDecoder(r.Body).Decode(&receivedBody))
			require.Equal(t, http.MethodPost, r.Method)
			require.Equal(t, "/groups", r.URL.Path)
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()
		enableCoviaForTest(th, server.URL)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Covia", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		require.Eventually(t, func() bool {
			updated, getErr := th.App.GetOperationalTrackingGroup(th.Context, group.Id)
			return getErr == nil && updated.CoviaSyncStatus == model.OperationalTrackingGroupCoviaSyncStatusSynced
		}, 2*time.Second, 10*time.Millisecond)

		require.Equal(t, group.Id, receivedBody.Id)
		require.Equal(t, th.SystemAdminUser.Id, receivedBody.CreatedBy)
		require.Equal(t, "Grupo Covia", receivedBody.Name)
		require.Equal(t, "Bearer test-api-key", receivedAuth)
	})

	t.Run("marks the group failed when Covia errors, but the group keeps existing", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))
		defer server.Close()
		enableCoviaForTest(th, server.URL)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Covia Falla", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		require.Eventually(t, func() bool {
			updated, getErr := th.App.GetOperationalTrackingGroup(th.Context, group.Id)
			return getErr == nil && updated.CoviaSyncStatus == model.OperationalTrackingGroupCoviaSyncStatusFailed
		}, 2*time.Second, 10*time.Millisecond)

		// The group is fully usable locally regardless of Covia's outcome.
		groups, appErr := th.App.GetOperationalTrackingGroupsForTeam(th.Context, team.Id)
		require.Nil(t, appErr)
		require.Len(t, groups, 1)
	})

	t.Run("makes no request at all when Covia sync is disabled (the default)", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		var requestCount int32
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&requestCount, 1)
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()
		// Deliberately NOT calling enableCoviaForTest — CoviaSettings.Enable defaults to false.

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Sin Covia", th.SystemAdminUser.Id)
		require.Nil(t, appErr)
		require.Equal(t, model.OperationalTrackingGroupCoviaSyncStatusPending, group.CoviaSyncStatus)

		time.Sleep(100 * time.Millisecond)
		require.Equal(t, int32(0), atomic.LoadInt32(&requestCount))
	})
}

func TestSyncOperationalTrackingGroupMemberToCovia(t *testing.T) {
	mainHelper.Parallel(t)

	t.Run("sends only the added member, including CPA attributes keyed by name", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		cpaID, cErr := th.App.CpaGroupID()
		require.Nil(t, cErr)

		field, ferr := model.NewCPAFieldFromPropertyField(&model.PropertyField{
			GroupID: cpaID,
			Name:    "Departamento",
			Type:    model.PropertyFieldTypeText,
		})
		require.NoError(t, ferr)
		createdField, appErr := th.App.CreateCPAField(th.Context, field)
		require.Nil(t, appErr)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Miembros", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		orgMember := th.CreateUser(t)
		require.Nil(t, th.App.AddUserToTeamOrganization(th.Context, team.Id, orgMember.Id, th.SystemAdminUser.Id))

		_, appErr = th.App.PatchCPAValue(th.Context, orgMember.Id, createdField.ID, json.RawMessage(`"Rastreo"`), true)
		require.Nil(t, appErr)

		var requestCount int32
		var receivedMethod, receivedPath string
		var receivedBody coviaGroupMemberPayload
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&requestCount, 1)
			receivedMethod = r.Method
			receivedPath = r.URL.Path
			bodyBytes, _ := io.ReadAll(r.Body)
			_ = json.Unmarshal(bodyBytes, &receivedBody)
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()
		enableCoviaForTest(th, server.URL)

		appErr = th.App.AddOperationalTrackingGroupMember(th.Context, group.Id, orgMember.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		require.Eventually(t, func() bool {
			return atomic.LoadInt32(&requestCount) == 1
		}, 2*time.Second, 10*time.Millisecond)

		require.Equal(t, http.MethodPost, receivedMethod)
		require.Equal(t, "/groups/"+group.Id+"/members", receivedPath)
		require.Equal(t, orgMember.Id, receivedBody.UserId)
		require.Equal(t, orgMember.FirstName, receivedBody.FirstName)
		require.Equal(t, orgMember.LastName, receivedBody.LastName)
		require.Contains(t, receivedBody.PhotoURL, "/api/v4/users/"+orgMember.Id+"/image")
		require.Equal(t, json.RawMessage(`"Rastreo"`), receivedBody.Attributes["Departamento"])
	})

	t.Run("sends a DELETE with just the ids when a member is removed", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Quitar", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		orgMember := th.CreateUser(t)
		require.Nil(t, th.App.AddUserToTeamOrganization(th.Context, team.Id, orgMember.Id, th.SystemAdminUser.Id))
		require.Nil(t, th.App.AddOperationalTrackingGroupMember(th.Context, group.Id, orgMember.Id, th.SystemAdminUser.Id))

		var requestCount int32
		var receivedMethod, receivedPath string
		var bodyLen int
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&requestCount, 1)
			receivedMethod = r.Method
			receivedPath = r.URL.Path
			bodyBytes, _ := io.ReadAll(r.Body)
			bodyLen = len(bodyBytes)
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()
		enableCoviaForTest(th, server.URL)

		appErr = th.App.RemoveOperationalTrackingGroupMember(th.Context, group.Id, orgMember.Id)
		require.Nil(t, appErr)

		require.Eventually(t, func() bool {
			return atomic.LoadInt32(&requestCount) == 1
		}, 2*time.Second, 10*time.Millisecond)

		require.Equal(t, http.MethodDelete, receivedMethod)
		require.Equal(t, "/groups/"+group.Id+"/members/"+orgMember.Id, receivedPath)
		require.Equal(t, 0, bodyLen)
	})
}

// TestPreviewCoviaPayloads confirms the preview functions used to echo the Covia payload back in
// API responses (for browser-console verification) return EXACTLY what would really be sent —
// same fields, same values — not a separate/approximate reimplementation.
func TestPreviewCoviaPayloads(t *testing.T) {
	mainHelper.Parallel(t)

	t.Run("group preview matches the real payload shape", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Preview", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		previewBytes := th.App.PreviewCoviaGroupPayload(group)

		var preview coviaGroupPayload
		require.NoError(t, json.Unmarshal(previewBytes, &preview))
		require.Equal(t, group.Id, preview.Id)
		require.Equal(t, th.SystemAdminUser.Id, preview.CreatedBy)
		require.Equal(t, "Grupo Preview", preview.Name)
	})

	t.Run("member preview matches the real payload shape, including CPA attributes by name", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		cpaID, cErr := th.App.CpaGroupID()
		require.Nil(t, cErr)

		field, ferr := model.NewCPAFieldFromPropertyField(&model.PropertyField{
			GroupID: cpaID,
			Name:    "Zona",
			Type:    model.PropertyFieldTypeText,
		})
		require.NoError(t, ferr)
		createdField, appErr := th.App.CreateCPAField(th.Context, field)
		require.Nil(t, appErr)

		user := th.CreateUser(t)
		_, appErr = th.App.PatchCPAValue(th.Context, user.Id, createdField.ID, json.RawMessage(`"Norte"`), true)
		require.Nil(t, appErr)

		previewBytes, appErr := th.App.PreviewCoviaGroupMemberPayload(th.Context, user.Id)
		require.Nil(t, appErr)

		var preview coviaGroupMemberPayload
		require.NoError(t, json.Unmarshal(previewBytes, &preview))
		require.Equal(t, user.Id, preview.UserId)
		require.Equal(t, user.FirstName, preview.FirstName)
		require.Equal(t, user.LastName, preview.LastName)
		require.Contains(t, preview.PhotoURL, "/api/v4/users/"+user.Id+"/image")
		require.Equal(t, json.RawMessage(`"Norte"`), preview.Attributes["Zona"])
	})

	t.Run("create-group API response includes the preview", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo API", th.SystemAdminUser.Id)
		require.Nil(t, appErr)
		group.CoviaSyncPreview = th.App.PreviewCoviaGroupPayload(group)

		encoded, err := json.Marshal(group)
		require.NoError(t, err)
		require.Contains(t, string(encoded), `"covia_sync_preview"`)
		require.Contains(t, string(encoded), `"Grupo API"`)
	})
}
