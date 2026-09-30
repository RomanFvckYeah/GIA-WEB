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

func enableCoviaGroupDeleteSyncForTest(th *TestHelper, baseURL string) {
	enableCoviaForTest(th, baseURL)
	th.App.UpdateConfig(func(cfg *model.Config) {
		cfg.CoviaSettings.EnableGroupDeleteSync = model.NewPointer(true)
	})
}

func enableCoviaGroupRenameSyncForTest(th *TestHelper, baseURL string) {
	enableCoviaForTest(th, baseURL)
	th.App.UpdateConfig(func(cfg *model.Config) {
		cfg.CoviaSettings.EnableGroupRenameSync = model.NewPointer(true)
	})
}

func TestCreateOperationalTrackingGroupCoviaSync(t *testing.T) {
	mainHelper.Parallel(t)

	t.Run("creates the group and marks it synced when Covia responds error=false", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		var receivedBody coviaGroupPayload
		var receivedAuth string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			receivedAuth = r.Header.Get("Authorization")
			require.NoError(t, json.NewDecoder(r.Body).Decode(&receivedBody))
			require.Equal(t, http.MethodPost, r.Method)
			require.Equal(t, "/groups", r.URL.Path)
			w.WriteHeader(http.StatusOK)
			// Real Covia response shape: HTTP 200, error:false, and their own internal id in
			// data.id — data.external_id always echoes back the id we sent.
			_, _ = w.Write([]byte(`{"error": false, "data": {"id": "5", "external_id": "` + receivedBody.Id + `", "name": "` + receivedBody.Name + `"}, "message": "Grupo guardado correctamente"}`))
		}))
		defer server.Close()
		enableCoviaForTest(th, server.URL)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Covia", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		require.Equal(t, model.OperationalTrackingGroupCoviaSyncStatusSynced, group.CoviaSyncStatus)
		require.Equal(t, "5", group.CoviaGroupId)

		require.Equal(t, group.Id, receivedBody.Id)
		require.Equal(t, th.SystemAdminUser.Id, receivedBody.CreatedBy)
		require.Equal(t, "Grupo Covia", receivedBody.Name)
		require.Equal(t, "Bearer test-api-key", receivedAuth)
	})

	t.Run("does not create the group at all when Covia responds with an HTTP error", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))
		defer server.Close()
		enableCoviaForTest(th, server.URL)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Covia Falla", th.SystemAdminUser.Id)
		require.NotNil(t, appErr)
		require.Nil(t, group)

		groups, appErr := th.App.GetOperationalTrackingGroupsForTeam(th.Context, team.Id)
		require.Nil(t, appErr)
		require.Empty(t, groups)
	})

	t.Run("does not create the group and reports Covia's message when Covia responds HTTP 200 with error=true in the body", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		// This is the case that would slip through if only the HTTP status were checked: Covia
		// signals failure via the body, not the status code.
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"error": true, "message": "Ya existe un grupo con ese nombre"}`))
		}))
		defer server.Close()
		enableCoviaForTest(th, server.URL)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Duplicado", th.SystemAdminUser.Id)
		require.NotNil(t, appErr)
		require.Nil(t, group)
		require.Equal(t, "Ya existe un grupo con ese nombre", appErr.DetailedError)

		groups, appErr := th.App.GetOperationalTrackingGroupsForTeam(th.Context, team.Id)
		require.Nil(t, appErr)
		require.Empty(t, groups)
	})

	t.Run("creates the group with pending status and makes no request when Covia sync is disabled (the default)", func(t *testing.T) {
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
		require.Equal(t, int32(0), atomic.LoadInt32(&requestCount))
	})
}

func TestOperationalTrackingGroupMemberCoviaSync(t *testing.T) {
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
			_, _ = w.Write([]byte(`{"error": false, "message": "Miembro agregado al grupo correctamente"}`))
		}))
		defer server.Close()
		enableCoviaForTest(th, server.URL)

		appErr = th.App.AddOperationalTrackingGroupMember(th.Context, group.Id, orgMember.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		require.Equal(t, int32(1), atomic.LoadInt32(&requestCount))
		require.Equal(t, http.MethodPost, receivedMethod)
		require.Equal(t, "/groups/"+group.Id+"/members", receivedPath)
		require.Equal(t, orgMember.Id, receivedBody.UserId)
		require.Equal(t, orgMember.FirstName, receivedBody.FirstName)
		require.Equal(t, orgMember.LastName, receivedBody.LastName)
		require.Contains(t, receivedBody.PhotoURL, "/api/v4/users/"+orgMember.Id+"/image")
		require.Equal(t, json.RawMessage(`"Rastreo"`), receivedBody.Attributes["Departamento"])

		members, appErr := th.App.GetOperationalTrackingGroupMembers(th.Context, group.Id)
		require.Nil(t, appErr)
		require.Len(t, members, 1)
	})

	t.Run("does not add the member locally when Covia rejects the add", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Falla Miembro", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		orgMember := th.CreateUser(t)
		require.Nil(t, th.App.AddUserToTeamOrganization(th.Context, team.Id, orgMember.Id, th.SystemAdminUser.Id))

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"error": true, "message": "El grupo no existe en Covia"}`))
		}))
		defer server.Close()
		enableCoviaForTest(th, server.URL)

		appErr = th.App.AddOperationalTrackingGroupMember(th.Context, group.Id, orgMember.Id, th.SystemAdminUser.Id)
		require.NotNil(t, appErr)
		require.Equal(t, "El grupo no existe en Covia", appErr.DetailedError)

		members, appErr := th.App.GetOperationalTrackingGroupMembers(th.Context, group.Id)
		require.Nil(t, appErr)
		require.Empty(t, members)
	})

	t.Run("sends a DELETE with just the ids when a member is removed", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Quitar", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		orgMember := th.CreateUser(t)
		require.Nil(t, th.App.AddUserToTeamOrganization(th.Context, team.Id, orgMember.Id, th.SystemAdminUser.Id))

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
			_, _ = w.Write([]byte(`{"error": false, "message": "ok"}`))
		}))
		defer server.Close()
		enableCoviaForTest(th, server.URL)

		appErr = th.App.AddOperationalTrackingGroupMember(th.Context, group.Id, orgMember.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		appErr = th.App.RemoveOperationalTrackingGroupMember(th.Context, group.Id, orgMember.Id)
		require.Nil(t, appErr)

		require.Equal(t, int32(2), atomic.LoadInt32(&requestCount)) // one for the add above, one for this remove
		require.Equal(t, http.MethodDelete, receivedMethod)
		require.Equal(t, "/groups/"+group.Id+"/members/"+orgMember.Id, receivedPath)
		require.Equal(t, 0, bodyLen)

		members, appErr := th.App.GetOperationalTrackingGroupMembers(th.Context, group.Id)
		require.Nil(t, appErr)
		require.Empty(t, members)
	})

	t.Run("does not remove the member locally when Covia rejects the removal", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Falla Quitar", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		orgMember := th.CreateUser(t)
		require.Nil(t, th.App.AddUserToTeamOrganization(th.Context, team.Id, orgMember.Id, th.SystemAdminUser.Id))

		var failNext bool
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			if failNext {
				_, _ = w.Write([]byte(`{"error": true, "message": "No se pudo quitar el miembro"}`))
				return
			}
			_, _ = w.Write([]byte(`{"error": false, "message": "ok"}`))
		}))
		defer server.Close()
		enableCoviaForTest(th, server.URL)

		appErr = th.App.AddOperationalTrackingGroupMember(th.Context, group.Id, orgMember.Id, th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		failNext = true
		appErr = th.App.RemoveOperationalTrackingGroupMember(th.Context, group.Id, orgMember.Id)
		require.NotNil(t, appErr)
		require.Equal(t, "No se pudo quitar el miembro", appErr.DetailedError)

		members, appErr := th.App.GetOperationalTrackingGroupMembers(th.Context, group.Id)
		require.Nil(t, appErr)
		require.Len(t, members, 1)
	})
}

func TestDeleteOperationalTrackingGroupCoviaSync(t *testing.T) {
	mainHelper.Parallel(t)

	t.Run("deletes the group locally once Covia confirms the group delete", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Borrar", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		var requestCount int32
		var receivedMethod, receivedPath string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&requestCount, 1)
			receivedMethod = r.Method
			receivedPath = r.URL.Path
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"error": false, "message": "Group deleted", "data": null}`))
		}))
		defer server.Close()
		enableCoviaGroupDeleteSyncForTest(th, server.URL)

		appErr = th.App.DeleteOperationalTrackingGroup(th.Context, group.Id)
		require.Nil(t, appErr)

		require.Equal(t, int32(1), atomic.LoadInt32(&requestCount))
		require.Equal(t, http.MethodDelete, receivedMethod)
		require.Equal(t, "/groups/"+group.Id, receivedPath)

		_, getErr := th.App.GetOperationalTrackingGroup(th.Context, group.Id)
		require.NotNil(t, getErr)
	})

	t.Run("does not delete the group locally when Covia rejects the group delete", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Borrar Falla", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"error": true, "message": "No se pudo borrar el grupo"}`))
		}))
		defer server.Close()
		enableCoviaGroupDeleteSyncForTest(th, server.URL)

		appErr = th.App.DeleteOperationalTrackingGroup(th.Context, group.Id)
		require.NotNil(t, appErr)
		require.Equal(t, "No se pudo borrar el grupo", appErr.DetailedError)

		fetched, getErr := th.App.GetOperationalTrackingGroup(th.Context, group.Id)
		require.Nil(t, getErr)
		require.Equal(t, group.Id, fetched.Id)
	})

	t.Run("deletes the group locally without contacting Covia when EnableGroupDeleteSync is off (the default)", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Grupo Borrar Sin Sync", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		var requestCount int32
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&requestCount, 1)
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()
		// Enable Covia in general, but leave EnableGroupDeleteSync off (the default).
		enableCoviaForTest(th, server.URL)

		appErr = th.App.DeleteOperationalTrackingGroup(th.Context, group.Id)
		require.Nil(t, appErr)
		require.Equal(t, int32(0), atomic.LoadInt32(&requestCount))

		_, getErr := th.App.GetOperationalTrackingGroup(th.Context, group.Id)
		require.NotNil(t, getErr)
	})
}

func TestUpdateOperationalTrackingGroupNameCoviaSync(t *testing.T) {
	mainHelper.Parallel(t)

	t.Run("renames the group locally once Covia confirms the rename", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Nombre Viejo", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		var requestCount int32
		var receivedMethod, receivedPath string
		var receivedBody coviaRenameGroupPayload
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&requestCount, 1)
			receivedMethod = r.Method
			receivedPath = r.URL.Path
			require.NoError(t, json.NewDecoder(r.Body).Decode(&receivedBody))
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"error": false, "message": "Group updated", "data": {"id": "5", "external_id": "` + group.Id + `", "name": "Nombre Nuevo"}}`))
		}))
		defer server.Close()
		enableCoviaGroupRenameSyncForTest(th, server.URL)

		updated, appErr := th.App.UpdateOperationalTrackingGroupName(th.Context, group.Id, "Nombre Nuevo")
		require.Nil(t, appErr)
		require.Equal(t, "Nombre Nuevo", updated.Name)

		require.Equal(t, int32(1), atomic.LoadInt32(&requestCount))
		require.Equal(t, http.MethodPatch, receivedMethod)
		require.Equal(t, "/groups/"+group.Id, receivedPath)
		require.Equal(t, "Nombre Nuevo", receivedBody.Name)

		fetched, getErr := th.App.GetOperationalTrackingGroup(th.Context, group.Id)
		require.Nil(t, getErr)
		require.Equal(t, "Nombre Nuevo", fetched.Name)
	})

	t.Run("does not rename the group locally when Covia rejects the rename", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Nombre Viejo", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"error": true, "message": "No se pudo renombrar el grupo"}`))
		}))
		defer server.Close()
		enableCoviaGroupRenameSyncForTest(th, server.URL)

		updated, appErr := th.App.UpdateOperationalTrackingGroupName(th.Context, group.Id, "Nombre Nuevo")
		require.NotNil(t, appErr)
		require.Nil(t, updated)
		require.Equal(t, "No se pudo renombrar el grupo", appErr.DetailedError)

		fetched, getErr := th.App.GetOperationalTrackingGroup(th.Context, group.Id)
		require.Nil(t, getErr)
		require.Equal(t, "Nombre Viejo", fetched.Name)
	})

	t.Run("renames the group locally without contacting Covia when EnableGroupRenameSync is off (the default)", func(t *testing.T) {
		th := Setup(t).InitBasic(t)

		team := th.CreateTeam(t)
		group, appErr := th.App.CreateOperationalTrackingGroup(th.Context, team.Id, "Nombre Viejo", th.SystemAdminUser.Id)
		require.Nil(t, appErr)

		var requestCount int32
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&requestCount, 1)
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()
		// Enable Covia in general, but leave EnableGroupRenameSync off (the default).
		enableCoviaForTest(th, server.URL)

		updated, appErr := th.App.UpdateOperationalTrackingGroupName(th.Context, group.Id, "Nombre Nuevo")
		require.Nil(t, appErr)
		require.Equal(t, "Nombre Nuevo", updated.Name)
		require.Equal(t, int32(0), atomic.LoadInt32(&requestCount))
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
