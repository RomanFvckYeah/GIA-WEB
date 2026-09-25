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

type coviaGroupMemberPayload struct {
	UserId     string                     `json:"user_id"`
	PhotoURL   string                     `json:"photo_url"`
	FirstName  string                     `json:"first_name"`
	LastName   string                     `json:"last_name"`
	Attributes map[string]json.RawMessage `json:"attributes"`
}

// coviaDo issues one request to Covia and returns its status code. The response body is drained
// and discarded — Covia's real response shape isn't known yet, and none of the callers need it,
// only whether the request succeeded.
func (a *App) coviaDo(method, path string, body io.Reader) (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), coviaRequestTimeout)
	defer cancel()

	baseURL := strings.TrimRight(*a.Config().CoviaSettings.BaseURL, "/")
	req, err := http.NewRequestWithContext(ctx, method, baseURL+path, body)
	if err != nil {
		return 0, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if apiKey := *a.Config().CoviaSettings.APIKey; apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := a.Srv().coviaClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body) //nolint:errcheck // best-effort drain so the connection can be reused

	return resp.StatusCode, nil
}

func coviaRecover(rctx request.CTX, op string) {
	if r := recover(); r != nil {
		rctx.Logger().Error("Recovered from panic while syncing to Covia", mlog.String("op", op), mlog.Any("panic", r))
	}
}

// SyncOperationalTrackingGroupToCovia notifies Covia that a group was created. Fire-and-forget:
// never blocks or fails the caller, and the group already exists locally regardless of whether
// Covia acknowledges it — CoviaSyncStatus only ever reflects Covia's response, it never gates
// local existence/usability.
func (a *App) SyncOperationalTrackingGroupToCovia(rctx request.CTX, group *model.OperationalTrackingGroup) {
	if !*a.Config().CoviaSettings.Enable {
		return
	}

	groupID, createdBy, name := group.Id, group.CreateBy, group.Name

	a.Srv().Go(func() {
		defer coviaRecover(rctx, "SyncOperationalTrackingGroupToCovia")

		jsonBytes, err := json.Marshal(coviaGroupPayload{Id: groupID, CreatedBy: createdBy, Name: name})
		if err != nil {
			rctx.Logger().Error("Failed to encode operational tracking group for Covia", mlog.String("group_id", groupID), mlog.Err(err))
			return
		}

		status, reqErr := a.coviaDo(http.MethodPost, "/groups", bytes.NewReader(jsonBytes))

		syncStatus := model.OperationalTrackingGroupCoviaSyncStatusFailed
		if reqErr != nil {
			rctx.Logger().Error("Failed to sync operational tracking group to Covia", mlog.String("group_id", groupID), mlog.Err(reqErr))
		} else if status >= 200 && status < 300 {
			syncStatus = model.OperationalTrackingGroupCoviaSyncStatusSynced
		} else {
			rctx.Logger().Error("Covia rejected operational tracking group sync", mlog.String("group_id", groupID), mlog.Int("status", status))
		}

		if updErr := a.Srv().Store().OperationalTrackingGroup().UpdateCoviaSyncStatus(groupID, syncStatus); updErr != nil {
			rctx.Logger().Error("Failed to update Covia sync status", mlog.String("group_id", groupID), mlog.Err(updErr))
		}
	})
}

// SyncOperationalTrackingGroupMemberAddedToCovia notifies Covia that a single member was added —
// only that one member is sent, never the group's full member list (each add/remove syncs just
// its own change).
func (a *App) SyncOperationalTrackingGroupMemberAddedToCovia(rctx request.CTX, groupID, userID string) {
	if !*a.Config().CoviaSettings.Enable {
		return
	}

	a.Srv().Go(func() {
		defer coviaRecover(rctx, "SyncOperationalTrackingGroupMemberAddedToCovia")

		payload, appErr := a.buildCoviaGroupMemberPayload(rctx, userID)
		if appErr != nil {
			rctx.Logger().Error("Failed to build Covia member payload", mlog.String("group_id", groupID), mlog.String("user_id", userID), mlog.Err(appErr))
			return
		}

		jsonBytes, err := json.Marshal(payload)
		if err != nil {
			rctx.Logger().Error("Failed to encode operational tracking group member for Covia", mlog.String("group_id", groupID), mlog.String("user_id", userID), mlog.Err(err))
			return
		}

		status, reqErr := a.coviaDo(http.MethodPost, "/groups/"+groupID+"/members", bytes.NewReader(jsonBytes))
		if reqErr != nil {
			rctx.Logger().Error("Failed to sync added operational tracking group member to Covia", mlog.String("group_id", groupID), mlog.String("user_id", userID), mlog.Err(reqErr))
			return
		}
		if status < 200 || status >= 300 {
			rctx.Logger().Error("Covia rejected operational tracking group member sync", mlog.String("group_id", groupID), mlog.String("user_id", userID), mlog.Int("status", status))
		}
	})
}

// SyncOperationalTrackingGroupMemberRemovedToCovia notifies Covia that a single member was
// removed — no body needed, the group/user ids in the URL are enough to identify what to remove.
func (a *App) SyncOperationalTrackingGroupMemberRemovedToCovia(rctx request.CTX, groupID, userID string) {
	if !*a.Config().CoviaSettings.Enable {
		return
	}

	a.Srv().Go(func() {
		defer coviaRecover(rctx, "SyncOperationalTrackingGroupMemberRemovedToCovia")

		status, err := a.coviaDo(http.MethodDelete, "/groups/"+groupID+"/members/"+userID, nil)
		if err != nil {
			rctx.Logger().Error("Failed to sync removed operational tracking group member to Covia", mlog.String("group_id", groupID), mlog.String("user_id", userID), mlog.Err(err))
			return
		}
		if status < 200 || status >= 300 {
			rctx.Logger().Error("Covia rejected operational tracking group member removal sync", mlog.String("group_id", groupID), mlog.String("user_id", userID), mlog.Int("status", status))
		}
	})
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
