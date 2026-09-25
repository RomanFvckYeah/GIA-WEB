// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Deliberately named "OperationalTrackingGroup", not "Group" — unrelated to this app's native
// Group/GroupMember (LDAP/SAML sync) types in ./groups.ts.
export type OperationalTrackingGroup = {
    id: string;
    team_id: string;
    name: string;
    create_at: number;
    create_by: string;
    member_count: number;
    covia_sync_status: string;
    covia_synced_at: number;

    // Only present on the create-group response — the server echoes back the exact payload it
    // sent (or will send) to Covia for this group, purely so it's visible for verification while
    // Covia's real endpoint doesn't exist yet.
    covia_sync_preview?: unknown;
};

export type OperationalTrackingGroupMember = {
    group_id: string;
    user_id: string;
    create_at: number;
    create_by: string;
};

// Response of POST .../operational_tracking_groups/{group_id}/members/{user_id} — same reasoning
// as OperationalTrackingGroup.covia_sync_preview above, but for the member that was just added.
export type AddOperationalTrackingGroupMemberResponse = {
    status: string;
    covia_sync_preview?: unknown;
};
