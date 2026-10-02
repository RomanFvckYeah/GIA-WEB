// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

func (api *API) InitWelcomeBotReports() {
	api.BaseRoutes.APIRoot.Handle("/welcome_bot_reports", api.APISessionRequired(getWelcomeBotReports)).Methods(http.MethodGet)
	api.BaseRoutes.APIRoot.Handle("/welcome_bot_reports/{report_id:[A-Za-z0-9]+}/resolve", api.APISessionRequired(resolveWelcomeBotReport)).Methods(http.MethodPost)
}

// getWelcomeBotReports lists reports for the System Console reports panel. Global
// across the whole server, so it's restricted to real system_admins.
func getWelcomeBotReports(c *Context, w http.ResponseWriter, r *http.Request) {
	if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionManageSystem) {
		c.SetPermissionError(model.PermissionManageSystem)
		return
	}

	page := 0
	if p, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && p >= 0 {
		page = p
	}
	perPage := 50
	if pp, err := strconv.Atoi(r.URL.Query().Get("per_page")); err == nil && pp > 0 {
		perPage = pp
	}
	onlyUnresolved := r.URL.Query().Get("unresolved_only") == "true"

	reports, err := c.App.GetWelcomeBotReports(page, perPage, onlyUnresolved)
	if err != nil {
		c.Err = err
		return
	}

	if err := json.NewEncoder(w).Encode(reports); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

// resolveWelcomeBotReport marks a report as resolved by the requesting system_admin.
func resolveWelcomeBotReport(c *Context, w http.ResponseWriter, r *http.Request) {
	if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionManageSystem) {
		c.SetPermissionError(model.PermissionManageSystem)
		return
	}

	reportID := mux.Vars(r)["report_id"]

	if err := c.App.ResolveWelcomeBotReport(reportID, c.AppContext.Session().UserId); err != nil {
		c.Err = err
		return
	}

	ReturnStatusOK(w)
}
