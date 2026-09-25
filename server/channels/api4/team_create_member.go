// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/mattermost/server/v8/channels/app"
)

func (api *API) InitTeamCreateMember() {
	api.BaseRoutes.Team.Handle("/create_member", api.APISessionRequired(createTeamMember)).Methods(http.MethodPost)
}

// createTeamMember lets a team_admin of this team (or a system_admin) create a brand-new user
// account, add it to this team, and mark it as a genuine organization member of this team —
// all in one call. It deliberately does not reuse the general-purpose createUser or
// addTeamOrganizationMember endpoints: those require system_admin outright, whereas this is
// scoped narrowly so a team_admin can only ever create accounts within (and grant organization
// membership for) their own team, never touch any other existing user's organization status.
func createTeamMember(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireTeamId()
	if c.Err != nil {
		return
	}

	if !c.App.SessionHasPermissionToTeam(*c.AppContext.Session(), c.Params.TeamId, model.PermissionManageTeam) &&
		!c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionManageSystem) {
		c.SetPermissionError(model.PermissionManageTeam)
		return
	}

	team, err := c.App.GetTeam(c.Params.TeamId)
	if err != nil {
		c.Err = err
		return
	}

	// system_admin always bypasses this cap, same as every other rule in this feature —
	// it exists to constrain team_admin, not the person who sets it.
	if !c.IsSystemAdmin() {
		existingMembers, err := c.App.GetTeamOrganizationMemberIDs(c.AppContext, c.Params.TeamId)
		if err != nil {
			c.Err = err
			return
		}
		if len(existingMembers) >= team.OrganizationMemberLimit {
			c.Err = model.NewAppError("createTeamMember", "api.team.create_member.organization_limit_reached.app_error", nil, "", http.StatusForbidden)
			return
		}
	}

	sendCredentials := r.URL.Query().Get("send_credentials") == "true"

	bodyBytes, ioErr := io.ReadAll(r.Body)
	if ioErr != nil {
		c.SetInvalidParamWithErr("user", ioErr)
		return
	}

	var user model.User
	if jsonErr := json.Unmarshal(bodyBytes, &user); jsonErr != nil {
		c.SetInvalidParamWithErr("user", jsonErr)
		return
	}

	// Optional initial values for any User Attributes (custom profile attribute) fields,
	// set on the newly created user as part of this same privileged request rather than a
	// separate call to the general-purpose custom_profile_attributes endpoints — the caller
	// is already authorized to fully provision this brand-new account, so no additional
	// per-value permission check is needed beyond the admin-managed guard below.
	var extra struct {
		CustomProfileAttributes map[string]json.RawMessage `json:"custom_profile_attributes"`
		PanicButtonOnly         bool                       `json:"panic_button_only"`
	}
	_ = json.Unmarshal(bodyBytes, &extra)

	rctx := app.RequestContextWithCallerID(c.AppContext, c.AppContext.Session().UserId)
	if len(extra.CustomProfileAttributes) > 0 && !c.IsSystemAdmin() {
		fields, appErr := c.App.ListCPAFields(rctx)
		if appErr != nil {
			c.Err = appErr
			return
		}
		for _, field := range fields {
			if _, isBeingSet := extra.CustomProfileAttributes[field.ID]; isBeingSet && field.IsAdminManaged() {
				c.Err = model.NewAppError("createTeamMember", "app.custom_profile_attributes.property_field_is_managed.app_error", nil, "", http.StatusForbidden)
				return
			}
		}
	}

	user.SanitizeInput(c.IsSystemAdmin())

	// This is a trusted admin provisioning flow: the account is created for someone by
	// an admin who then hands them working credentials, so mark the email verified so
	// they can sign in immediately (SanitizeInput forces this back to false for a
	// team_admin caller, hence setting it explicitly here after).
	user.EmailVerified = true

	// The plaintext password is only available here — CreateUser hashes user.Password
	// in place via (*model.User).PreSave.
	plainPassword := user.Password

	auditRec := c.MakeAuditRecord(model.AuditEventCreateUser, model.AuditStatusFail)
	defer c.LogAuditRec(auditRec)
	model.AddEventParameterToAuditRec(auditRec, "team_id", c.Params.TeamId)
	model.AddEventParameterAuditableToAuditRec(auditRec, "user", &user)

	// CreateUserAsAdmin is just CreateUser + SendWelcomeEmail; we inline it so we can
	// send the credentials email instead of (not in addition to) the welcome email.
	ruser, err := c.App.CreateUser(c.AppContext, &user)
	if err != nil {
		c.Err = err
		return
	}

	// A failed provisioning email must not roll back the account creation.
	if sendCredentials && plainPassword != "" {
		if mailErr := c.App.Srv().EmailService.SendAccountCredentialsEmail(ruser.Email, ruser.Username, plainPassword, ruser.Locale, c.App.GetSiteURL()); mailErr != nil {
			c.Logger.Warn("Failed to send account credentials email to the newly created user", mlog.Err(mailErr))
		}
	} else {
		if mailErr := c.App.Srv().EmailService.SendWelcomeEmail(ruser.Id, ruser.Email, ruser.EmailVerified, ruser.DisableWelcomeEmail, ruser.Locale, c.App.GetSiteURL(), ""); mailErr != nil {
			c.Logger.Warn("Failed to send welcome email to the newly created user", mlog.Err(mailErr))
		}
	}

	if extra.PanicButtonOnly {
		if appErr := c.App.AddPanicButtonOnlyUser(rctx, ruser.Id, c.AppContext.Session().UserId); appErr != nil {
			c.Err = appErr
			return
		}
	} else if _, err := c.App.AddTeamMember(c.AppContext, c.Params.TeamId, ruser.Id); err != nil {
		c.Err = err
		return
	}

	if err := c.App.AddUserToTeamOrganization(c.AppContext, c.Params.TeamId, ruser.Id, c.AppContext.Session().UserId); err != nil {
		c.Err = err
		return
	}

	// A failed (or partially failed) attribute value save must not roll back the account
	// creation, same as the email/DM below — the admin can always fix it up afterward from
	// the edit screen.
	for fieldID, rawValue := range extra.CustomProfileAttributes {
		if _, appErr := c.App.PatchCPAValue(rctx, ruser.Id, fieldID, rawValue, false); appErr != nil {
			c.Logger.Warn("Failed to set an initial custom profile attribute value for the newly created user", mlog.String("field_id", fieldID), mlog.Err(appErr))
		}
	}

	// A failed welcome DM must not roll back the account creation.
	if dmErr := c.App.SendWelcomeMessageDM(c.AppContext, ruser.Id); dmErr != nil {
		c.Logger.Warn("Failed to send welcome DM to the newly created user", mlog.Err(dmErr))
	}

	auditRec.Success()
	auditRec.AddEventResultState(ruser)
	auditRec.AddEventObjectType("user")

	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(ruser); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}
