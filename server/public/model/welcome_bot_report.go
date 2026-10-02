// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import (
	"net/http"
	"strings"
)

const WelcomeBotReportMessageMaxLength = 4000

// WelcomeBotReport is a free-text report a user submits to the system bot's welcome
// menu (the "Reportar un problema" button) — a lightweight ticket a system_admin
// reviews and resolves from System Console.
type WelcomeBotReport struct {
	Id         string `json:"id"`
	UserId     string `json:"user_id"`
	Message    string `json:"message"`
	CreateAt   int64  `json:"create_at"`
	Resolved   bool   `json:"resolved"`
	ResolvedBy string `json:"resolved_by,omitempty"`
	ResolvedAt int64  `json:"resolved_at,omitempty"`
}

func (r *WelcomeBotReport) PreSave() {
	if r.Id == "" {
		r.Id = NewId()
	}
	r.Message = SanitizeUnicode(strings.TrimSpace(r.Message))
	r.CreateAt = GetMillis()
}

func (r *WelcomeBotReport) IsValid() *AppError {
	if !IsValidId(r.Id) {
		return NewAppError("WelcomeBotReport.IsValid", "model.welcome_bot_report.is_valid.id.app_error", nil, "", http.StatusBadRequest)
	}

	if !IsValidId(r.UserId) {
		return NewAppError("WelcomeBotReport.IsValid", "model.welcome_bot_report.is_valid.user_id.app_error", nil, "id="+r.Id, http.StatusBadRequest)
	}

	if r.Message == "" || len(r.Message) > WelcomeBotReportMessageMaxLength {
		return NewAppError("WelcomeBotReport.IsValid", "model.welcome_bot_report.is_valid.message.app_error", nil, "id="+r.Id, http.StatusBadRequest)
	}

	if r.CreateAt == 0 {
		return NewAppError("WelcomeBotReport.IsValid", "model.welcome_bot_report.is_valid.create_at.app_error", nil, "id="+r.Id, http.StatusBadRequest)
	}

	return nil
}
