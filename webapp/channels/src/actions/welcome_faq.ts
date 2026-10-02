// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Client4} from 'mattermost-redux/client';

import type {ActionFuncAsync} from 'types/store';

// answerWelcomeFaq tells the server that the current user picked a welcome-menu
// option; the system bot posts the answer and re-posts the menu over websocket.
export function answerWelcomeFaq(optionId: string): ActionFuncAsync<boolean> {
    return async () => {
        try {
            await Client4.answerWelcomeFaq(optionId);
        } catch (error) {
            return {error};
        }
        return {data: true};
    };
}

// submitWelcomeBotReport sends a free-text report from the welcome menu's "Reportar
// un problema" button; the system bot confirms receipt and re-posts the menu over
// websocket, same as answerWelcomeFaq.
export function submitWelcomeBotReport(message: string): ActionFuncAsync<boolean> {
    return async () => {
        try {
            await Client4.submitWelcomeBotReport(message);
        } catch (error) {
            return {error};
        }
        return {data: true};
    };
}
