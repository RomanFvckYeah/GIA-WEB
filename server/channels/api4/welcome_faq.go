// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"encoding/json"
	"net/http"
)

func (api *API) InitWelcomeFaq() {
	api.BaseRoutes.APIRoot.Handle("/welcome_faq/answer", api.APISessionRequired(answerWelcomeFaq)).Methods(http.MethodPost)
	api.BaseRoutes.APIRoot.Handle("/welcome_faq/report", api.APISessionRequired(submitWelcomeBotReport)).Methods(http.MethodPost)
}

// answerWelcomeFaq handles a click on a welcome-menu option button: the system
// bot posts the selected answer and re-posts the menu to the requesting user's DM.
func answerWelcomeFaq(c *Context, w http.ResponseWriter, r *http.Request) {
	var req struct {
		OptionID string `json:"option_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		c.SetInvalidParamWithErr("option_id", err)
		return
	}

	if err := c.App.AnswerWelcomeFaq(c.AppContext, c.AppContext.Session().UserId, req.OptionID); err != nil {
		c.Err = err
		return
	}

	ReturnStatusOK(w)
}

// submitWelcomeBotReport handles a user filing a free-text report ("Reportar un
// problema") from the welcome menu: the system bot saves it and confirms receipt.
func submitWelcomeBotReport(c *Context, w http.ResponseWriter, r *http.Request) {
	var req struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		c.SetInvalidParamWithErr("message", err)
		return
	}

	if _, err := c.App.CreateWelcomeBotReport(c.AppContext, c.AppContext.Session().UserId, req.Message); err != nil {
		c.Err = err
		return
	}

	ReturnStatusOK(w)
}
