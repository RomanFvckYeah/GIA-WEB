// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {bindClientFunc} from 'mattermost-redux/actions/helpers';
import {Client4} from 'mattermost-redux/client';

export function createOperationalTrackingGroup(teamId: string, name: string) {
    return bindClientFunc({
        clientFunc: Client4.createOperationalTrackingGroup,
        params: [
            teamId,
            name,
        ],
    });
}

export function getOperationalTrackingGroupsForTeam(teamId: string) {
    return bindClientFunc({
        clientFunc: Client4.getOperationalTrackingGroupsForTeam,
        params: [
            teamId,
        ],
    });
}

export function updateOperationalTrackingGroupName(groupId: string, name: string) {
    return bindClientFunc({
        clientFunc: Client4.updateOperationalTrackingGroupName,
        params: [
            groupId,
            name,
        ],
    });
}

export function deleteOperationalTrackingGroup(groupId: string) {
    return bindClientFunc({
        clientFunc: Client4.deleteOperationalTrackingGroup,
        params: [
            groupId,
        ],
    });
}

export function getOperationalTrackingGroupMembers(groupId: string) {
    return bindClientFunc({
        clientFunc: Client4.getOperationalTrackingGroupMembers,
        params: [
            groupId,
        ],
    });
}

export function addOperationalTrackingGroupMember(groupId: string, userId: string) {
    return bindClientFunc({
        clientFunc: Client4.addOperationalTrackingGroupMember,
        params: [
            groupId,
            userId,
        ],
    });
}

export function removeOperationalTrackingGroupMember(groupId: string, userId: string) {
    return bindClientFunc({
        clientFunc: Client4.removeOperationalTrackingGroupMember,
        params: [
            groupId,
            userId,
        ],
    });
}
