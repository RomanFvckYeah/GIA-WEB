// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {bindClientFunc} from 'mattermost-redux/actions/helpers';
import {Client4} from 'mattermost-redux/client';

export function getDirectMessageExceptions() {
    return bindClientFunc({
        clientFunc: Client4.getDirectMessageExceptions,
    });
}

export function addDirectMessageException(userId1: string, userId2: string) {
    return bindClientFunc({
        clientFunc: Client4.addDirectMessageException,
        params: [
            userId1,
            userId2,
        ],
    });
}

export function removeDirectMessageException(userId1: string, userId2: string) {
    return bindClientFunc({
        clientFunc: Client4.removeDirectMessageException,
        params: [
            userId1,
            userId2,
        ],
    });
}

export function getMyDirectMessageExceptionPartners() {
    return bindClientFunc({
        clientFunc: Client4.getMyDirectMessageExceptionPartners,
    });
}

export function getGloballyDiscoverableUsers() {
    return bindClientFunc({
        clientFunc: Client4.getGloballyDiscoverableUsers,
    });
}

export function addGloballyDiscoverableUser(userId: string) {
    return bindClientFunc({
        clientFunc: Client4.addGloballyDiscoverableUser,
        params: [
            userId,
        ],
    });
}

export function removeGloballyDiscoverableUser(userId: string) {
    return bindClientFunc({
        clientFunc: Client4.removeGloballyDiscoverableUser,
        params: [
            userId,
        ],
    });
}
