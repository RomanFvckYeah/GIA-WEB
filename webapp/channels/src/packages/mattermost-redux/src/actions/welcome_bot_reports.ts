// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {bindClientFunc} from 'mattermost-redux/actions/helpers';
import {Client4} from 'mattermost-redux/client';

export function getWelcomeBotReports(page = 0, perPage = 50, unresolvedOnly = false) {
    return bindClientFunc({
        clientFunc: Client4.getWelcomeBotReports,
        params: [
            page,
            perPage,
            unresolvedOnly,
        ],
    });
}

export function resolveWelcomeBotReport(reportId: string) {
    return bindClientFunc({
        clientFunc: Client4.resolveWelcomeBotReport,
        params: [
            reportId,
        ],
    });
}
