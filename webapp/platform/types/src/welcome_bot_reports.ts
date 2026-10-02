// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export type WelcomeBotReport = {
    id: string;
    user_id: string;
    message: string;
    create_at: number;
    resolved: boolean;
    resolved_by?: string;
    resolved_at?: number;
};
