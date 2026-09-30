// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/mattermost/server/public/shared/request"
)

// Prepares (but doesn't yet activate) syncing Operational Tracking Groups and their members to
// the external Covia service. Covia's real endpoint doesn't exist yet — everything here is
// gated on CoviaSettings.Enable (false by default), so until an admin sets a real BaseURL/APIKey
// and turns it on, none of this makes a single outgoing request or changes any local behavior.
//
// Mirrors this repo's existing Outgoing Webhooks pattern (channels/app/webhook.go): a shared
// *http.Client built once at server startup (Server.coviaClient), a per-request context timeout,
// and — since this is a genuine side effect on a third-party service, not something the caller
// should ever wait on — fired via Srv().Go() with its own panic recovery (Srv().Go() itself
// doesn't provide any).

const coviaRequestTimeout = 10 * time.Second

type coviaGroupPayload struct {
	Id        string `json:"id"`
	CreatedBy string `json:"created_by"`
	Name      string `json:"name"`
}

type coviaRenameGroupPayload struct {
	Name string `json:"name"`
}

type coviaGroupMemberPayload struct {
	UserId     string                     `json:"user_id"`
	PhotoURL   string                     `json:"photo_url"`
	FirstName  string                     `json:"first_name"`
	LastName   string                     `json:"last_name"`
	Attributes map[string]json.RawMessage `json:"attributes"`
}

// coviaResponse is the shape every real Covia endpoint responds with (confirmed against their
// docs): HTTP 200 even on failure, with success/failure signaled by the "error" field in the
// body, not the status code.
type coviaResponse struct {
	Error   bool            `json:"error"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

// coviaCreateGroupResponseData is coviaResponse.Data for the create-group endpoint specifically.
// ExternalId always echoes back the same id we sent as coviaGroupPayload.Id — Covia's own
// internal id lives in Id, which we keep around purely for reference (never used in any
// subsequent URL; those all use OUR id, per Covia's ":external_id" path param naming).
type coviaCreateGroupResponseData struct {
	Id         string `json:"id"`
	ExternalId string `json:"external_id"`
}

// coviaDo issues one request to Covia and returns its status code and raw response body — the
// body is needed now to check the "error" field (see coviaResponse), not just the HTTP status.
func (a *App) coviaDo(method, path string, body io.Reader) (int, []byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), coviaRequestTimeout)
	defer cancel()

	baseURL := strings.TrimRight(*a.Config().CoviaSettings.BaseURL, "/")
	req, err := http.NewRequestWithContext(ctx, method, baseURL+path, body)
	if err != nil {
		return 0, nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if apiKey := *a.Config().CoviaSettings.APIKey; apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := a.Srv().coviaClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return resp.StatusCode, nil, err
	}

	return resp.StatusCode, respBody, nil
}

// coviaSucceeded reports whether a Covia call actually succeeded: the HTTP status must be 2xx
// AND the body must parse as a coviaResponse with error=false. A body that fails to parse is
// treated as a failure too — if we can't confirm success, we don't assume it.
func coviaSucceeded(status int, body []byte) (bool, *coviaResponse) {
	if status < 200 || status >= 300 {
		return false, nil
	}

	var parsed coviaResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return false, nil
	}

	return !parsed.Error, &parsed
}

// SyncOperationalTrackingGroupToCovia notifies Covia that a group is about to be created and waits
// for the outcome — this is called BEFORE the group is saved locally (see
// App.CreateOperationalTrackingGroup), so it never touches the database itself: it's purely the
// HTTP call, and it's up to the caller to decide whether/what to persist based on the result.
// Synchronous now that Covia is live and confirmed fast (~0.3s): this is only ever called from
// admin actions that already show their own "saving" state, never a chat hot path.
func (a *App) SyncOperationalTrackingGroupToCovia(rctx request.CTX, groupID, createdBy, name string) (succeeded bool, coviaGroupID, coviaMessage string) {
	if !*a.Config().CoviaSettings.Enable {
		return true, "", ""
	}

	jsonBytes, err := json.Marshal(coviaGroupPayload{Id: groupID, CreatedBy: createdBy, Name: name})
	if err != nil {
		rctx.Logger().Error("Failed to encode operational tracking group for Covia", mlog.String("group_id", groupID), mlog.Err(err))
		return false, "", err.Error()
	}

	status, respBody, reqErr := a.coviaDo(http.MethodPost, "/groups", bytes.NewReader(jsonBytes))
	if reqErr != nil {
		rctx.Logger().Error("Failed to sync operational tracking group to Covia", mlog.String("group_id", groupID), mlog.Err(reqErr))
		return false, "", reqErr.Error()
	}

	ok, parsed := coviaSucceeded(status, respBody)
	if !ok {
		if parsed != nil {
			coviaMessage = parsed.Message
		}
		rctx.Logger().Error("Covia rejected operational tracking group sync", mlog.String("group_id", groupID), mlog.Int("status", status), mlog.String("covia_message", coviaMessage))
		return false, "", coviaMessage
	}

	var data coviaCreateGroupResponseData
	if err := json.Unmarshal(parsed.Data, &data); err == nil {
		coviaGroupID = data.Id
	}
	return true, coviaGroupID, ""
}

// SyncOperationalTrackingGroupDeletedToCovia notifies Covia that a group (and, on Covia's side,
// all of its members) should be deleted. Gated separately by EnableGroupDeleteSync, not just
// Enable — Covia doesn't have this endpoint yet, so while the extra switch is off (the default)
// this always succeeds without attempting any call, and deleting a group locally behaves exactly
// as it did before this endpoint was planned. Once Covia confirms it exists and the switch is
// flipped on, a real failure here blocks the local delete too.
func (a *App) SyncOperationalTrackingGroupDeletedToCovia(rctx request.CTX, groupID string) (succeeded bool, coviaMessage string) {
	if !*a.Config().CoviaSettings.Enable || !*a.Config().CoviaSettings.EnableGroupDeleteSync {
		return true, ""
	}

	status, respBody, err := a.coviaDo(http.MethodDelete, "/groups/"+groupID, nil)
	if err != nil {
		rctx.Logger().Error("Failed to sync deleted operational tracking group to Covia", mlog.String("group_id", groupID), mlog.Err(err))
		return false, err.Error()
	}

	ok, parsed := coviaSucceeded(status, respBody)
	if !ok {
		if parsed != nil {
			coviaMessage = parsed.Message
		}
		rctx.Logger().Error("Covia rejected operational tracking group deletion sync", mlog.String("group_id", groupID), mlog.Int("status", status), mlog.String("covia_message", coviaMessage))
	}
	return ok, coviaMessage
}

// SyncOperationalTrackingGroupRenamedToCovia notifies Covia of a group's new name. Gated
// separately by EnableGroupRenameSync — same reasoning as SyncOperationalTrackingGroupDeletedToCovia.
func (a *App) SyncOperationalTrackingGroupRenamedToCovia(rctx request.CTX, groupID, name string) (succeeded bool, coviaMessage string) {
	if !*a.Config().CoviaSettings.Enable || !*a.Config().CoviaSettings.EnableGroupRenameSync {
		return true, ""
	}

	jsonBytes, err := json.Marshal(coviaRenameGroupPayload{Name: name})
	if err != nil {
		rctx.Logger().Error("Failed to encode operational tracking group rename for Covia", mlog.String("group_id", groupID), mlog.Err(err))
		return false, err.Error()
	}

	status, respBody, reqErr := a.coviaDo(http.MethodPatch, "/groups/"+groupID, bytes.NewReader(jsonBytes))
	if reqErr != nil {
		rctx.Logger().Error("Failed to sync renamed operational tracking group to Covia", mlog.String("group_id", groupID), mlog.Err(reqErr))
		return false, reqErr.Error()
	}

	ok, parsed := coviaSucceeded(status, respBody)
	if !ok {
		if parsed != nil {
			coviaMessage = parsed.Message
		}
		rctx.Logger().Error("Covia rejected operational tracking group rename sync", mlog.String("group_id", groupID), mlog.Int("status", status), mlog.String("covia_message", coviaMessage))
	}
	return ok, coviaMessage
}

// SyncOperationalTrackingGroupMemberAddedToCovia notifies Covia that a single member was added —
// only that one member is sent, never the group's full member list (each add/remove syncs just
// its own change). Synchronous, same reasoning as SyncOperationalTrackingGroupToCovia.
func (a *App) SyncOperationalTrackingGroupMemberAddedToCovia(rctx request.CTX, groupID, userID string) (succeeded bool, coviaMessage string) {
	if !*a.Config().CoviaSettings.Enable {
		return true, ""
	}

	payload, appErr := a.buildCoviaGroupMemberPayload(rctx, userID)
	if appErr != nil {
		rctx.Logger().Error("Failed to build Covia member payload", mlog.String("group_id", groupID), mlog.String("user_id", userID), mlog.Err(appErr))
		return false, appErr.Error()
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		rctx.Logger().Error("Failed to encode operational tracking group member for Covia", mlog.String("group_id", groupID), mlog.String("user_id", userID), mlog.Err(err))
		return false, err.Error()
	}

	status, respBody, reqErr := a.coviaDo(http.MethodPost, "/groups/"+groupID+"/members", bytes.NewReader(jsonBytes))
	if reqErr != nil {
		rctx.Logger().Error("Failed to sync added operational tracking group member to Covia", mlog.String("group_id", groupID), mlog.String("user_id", userID), mlog.Err(reqErr))
		return false, reqErr.Error()
	}

	ok, parsed := coviaSucceeded(status, respBody)
	if !ok {
		if parsed != nil {
			coviaMessage = parsed.Message
		}
		rctx.Logger().Error("Covia rejected operational tracking group member sync", mlog.String("group_id", groupID), mlog.String("user_id", userID), mlog.Int("status", status), mlog.String("covia_message", coviaMessage))
	}
	return ok, coviaMessage
}

// SyncOperationalTrackingGroupMemberRemovedToCovia notifies Covia that a single member was
// removed — no body needed, the group/user ids in the URL are enough to identify what to remove.
// Synchronous, same reasoning as SyncOperationalTrackingGroupToCovia.
func (a *App) SyncOperationalTrackingGroupMemberRemovedToCovia(rctx request.CTX, groupID, userID string) (succeeded bool, coviaMessage string) {
	if !*a.Config().CoviaSettings.Enable {
		return true, ""
	}

	status, respBody, err := a.coviaDo(http.MethodDelete, "/groups/"+groupID+"/members/"+userID, nil)
	if err != nil {
		rctx.Logger().Error("Failed to sync removed operational tracking group member to Covia", mlog.String("group_id", groupID), mlog.String("user_id", userID), mlog.Err(err))
		return false, err.Error()
	}

	ok, parsed := coviaSucceeded(status, respBody)
	if !ok {
		if parsed != nil {
			coviaMessage = parsed.Message
		}
		rctx.Logger().Error("Covia rejected operational tracking group member removal sync", mlog.String("group_id", groupID), mlog.String("user_id", userID), mlog.Int("status", status), mlog.String("covia_message", coviaMessage))
	}
	return ok, coviaMessage
}

// buildCoviaGroupMemberPayload assembles what Covia asked for: user id, a URL to their profile
// photo (the existing GET /users/{user_id}/image route — nothing new needed for the photo
// itself), first/last name, and their Custom Profile Attribute values keyed by the attribute's
// human-readable NAME rather than its internal field id, since Covia has no reason to know our
// internal ids.
func (a *App) buildCoviaGroupMemberPayload(rctx request.CTX, userID string) (*coviaGroupMemberPayload, *model.AppError) {
	user, appErr := a.GetUser(userID)
	if appErr != nil {
		return nil, appErr
	}

	fields, appErr := a.ListCPAFields(rctx)
	if appErr != nil {
		return nil, appErr
	}

	fieldNamesByID := make(map[string]string, len(fields))
	for _, field := range fields {
		fieldNamesByID[field.ID] = field.Name
	}

	values, appErr := a.ListCPAValues(rctx, userID)
	if appErr != nil {
		return nil, appErr
	}

	attributes := make(map[string]json.RawMessage, len(values))
	for _, value := range values {
		name, ok := fieldNamesByID[value.FieldID]
		if !ok {
			continue
		}
		attributes[name] = value.Value
	}

	return &coviaGroupMemberPayload{
		UserId:     user.Id,
		PhotoURL:   a.GetSiteURL() + "/api/v4/users/" + user.Id + "/image",
		FirstName:  user.FirstName,
		LastName:   user.LastName,
		Attributes: attributes,
	}, nil
}

// PreviewCoviaGroupPayload builds the exact same payload SyncOperationalTrackingGroupToCovia
// would send, without sending it — used to echo it back in the create-group API response so it's
// visible in the browser console while there's no real Covia endpoint yet to verify against.
func (a *App) PreviewCoviaGroupPayload(group *model.OperationalTrackingGroup) json.RawMessage {
	jsonBytes, err := json.Marshal(coviaGroupPayload{Id: group.Id, CreatedBy: group.CreateBy, Name: group.Name})
	if err != nil {
		return nil
	}
	return jsonBytes
}

// PreviewCoviaGroupMemberPayload builds the exact same payload
// SyncOperationalTrackingGroupMemberAddedToCovia would send for userID, without sending it — used
// to echo it back in the add-member API response for the same reason as PreviewCoviaGroupPayload.
func (a *App) PreviewCoviaGroupMemberPayload(rctx request.CTX, userID string) (json.RawMessage, *model.AppError) {
	payload, appErr := a.buildCoviaGroupMemberPayload(rctx, userID)
	if appErr != nil {
		return nil, appErr
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, model.NewAppError("PreviewCoviaGroupMemberPayload", "app.operational_tracking_group.covia_preview.app_error", nil, "", http.StatusInternalServerError).Wrap(err)
	}

	return jsonBytes, nil
}
