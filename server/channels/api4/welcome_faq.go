// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"encoding/json"
	"net/http"
)

func (api *API) InitWelcomeFaq() {
	api.BaseRoutes.APIRoot.Handle("/welcome_faq/answer", api.APISessionRequired(answerWelcomeFaq)).Methods(http.MethodPost)
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
