// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GeneralTypes} from 'mattermost-redux/action_types';
import {bindClientFunc} from 'mattermost-redux/actions/helpers';
import {Client4} from 'mattermost-redux/client';
import type {ActionFuncAsync} from 'mattermost-redux/types/actions';

import {logError} from './errors';

// Fetches the full panic-button-only user list and derives whether the CURRENT user is one of
// them, storing just that boolean (state.entities.general.panicButtonOnly) — dispatched once on
// login (see components/logged_in/logged_in.tsx), mirroring how customProfileAttributesEnabled
// is fetched there.
export function fetchIsCurrentUserPanicButtonOnly(): ActionFuncAsync<boolean> {
    return async (dispatch, getState) => {
        let userIDs: string[];
        try {
            userIDs = await Client4.getPanicButtonOnlyUsers();
        } catch (error) {
            dispatch(logError(error));
            return {error};
        }

        const currentUserId = getState().entities.users.currentUserId;
        const isPanicButtonOnly = userIDs.includes(currentUserId);

        dispatch({type: GeneralTypes.PANIC_BUTTON_ONLY_RECEIVED, data: isPanicButtonOnly});

        return {data: isPanicButtonOnly};
    };
}

export function getPanicButtonOnlyUsers() {
    return bindClientFunc({
        clientFunc: Client4.getPanicButtonOnlyUsers,
    });
}

export function addPanicButtonOnlyUser(userId: string) {
    return bindClientFunc({
        clientFunc: Client4.addPanicButtonOnlyUser,
        params: [
            userId,
        ],
    });
}

export function removePanicButtonOnlyUser(userId: string) {
    return bindClientFunc({
        clientFunc: Client4.removePanicButtonOnlyUser,
        params: [
            userId,
        ],
    });
}
