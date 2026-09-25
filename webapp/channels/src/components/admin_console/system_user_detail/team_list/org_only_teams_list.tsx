// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {defineMessage, FormattedMessage} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import type {Team} from '@mattermost/types/teams';

import {getOrganizationTeamsForUser, getTeam, getTeamsForUser, removeTeamOrganizationMember} from 'mattermost-redux/actions/teams';

import AdminPanel from 'components/widgets/admin_console/admin_panel';
import TeamIcon from 'components/widgets/team_icon/team_icon';

import {imageURLForTeam} from 'utils/utils';

import type {GlobalState} from 'types/store';

const panelTitle = defineMessage({
    id: 'admin.systemUserDetail.orgOnlyTeams.title',
    defaultMessage: 'Organization (no team membership)',
});

const panelSubtitle = defineMessage({
    id: 'admin.systemUserDetail.orgOnlyTeams.hint',
    defaultMessage: 'This user is marked as a genuine organization member of these teams without being an actual team member — most commonly, Panic Button Only accounts.',
});

function renderTeamType(team: Team) {
    if (team.group_constrained) {
        return (
            <FormattedMessage
                id='admin.systemUserDetail.teamList.teamType.groupSync'
                defaultMessage='Group Sync'
            />
        );
    }
    if (team.allow_open_invite) {
        return (
            <FormattedMessage
                id='admin.systemUserDetail.teamList.teamType.anyoneCanJoin'
                defaultMessage='Anyone Can Join'
            />
        );
    }
    return (
        <FormattedMessage
            id='admin.systemUserDetail.teamList.teamType.inviteOnly'
            defaultMessage='Invite Only'
        />
    );
}

type Props = {
    userId: string;
};

// Shows the teams a user is a genuine "organization member" of (TeamOrganizationMembers) despite
// having no real TeamMember row for them — invisible in the TeamList above, which is built
// exclusively from real memberships. Its own AdminPanel (mirroring the "Team Membership" panel's
// look) rather than merged into that table: role and the membership-management actions there
// don't apply to a non-member, and reusing the same AbstractList/TeamRow classnames keeps it
// visually identical to the native list right above it.
export default function OrgOnlyTeamsList({userId}: Props) {
    const dispatch = useDispatch();

    const [orgOnlyTeamIds, setOrgOnlyTeamIds] = useState<string[]>([]);
    const [refreshKey, setRefreshKey] = useState(0);

    const teamsById = useSelector((state: GlobalState) => state.entities.teams.teams);

    const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

    useEffect(() => {
        Promise.all([
            dispatch(getTeamsForUser(userId)),
            dispatch(getOrganizationTeamsForUser(userId)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ]).then(([teamsResult, orgTeamsResult]: [any, any]) => {
            const realTeamIds = new Set((teamsResult.data ?? []).map((team: {id: string}) => team.id));
            const orgTeamIds: string[] = orgTeamsResult.data ?? [];
            const onlyOrgIds = orgTeamIds.filter((id) => !realTeamIds.has(id));

            setOrgOnlyTeamIds(onlyOrgIds);
            onlyOrgIds.forEach((teamId) => dispatch(getTeam(teamId)));
        });
    }, [dispatch, userId, refreshKey]);

    const teams = useMemo(() => {
        return orgOnlyTeamIds.
            map((teamId) => teamsById[teamId]).
            filter((team): team is Team => Boolean(team));
    }, [orgOnlyTeamIds, teamsById]);

    const handleRemove = useCallback((teamId: string) => {
        dispatch(removeTeamOrganizationMember(teamId, userId)).then(refresh);
    }, [dispatch, userId, refresh]);

    if (teams.length === 0) {
        return null;
    }

    return (
        <AdminPanel
            title={panelTitle}
            subtitle={panelSubtitle}
        >
            <div className='AbstractList'>
                <div className='AbstractList__header'>
                    <div
                        className='AbstractList__header-label'
                        style={{flexGrow: 1, minWidth: '284px', marginLeft: '16px'}}
                    >
                        <FormattedMessage
                            id='admin.systemUserDetail.teamList.header.name'
                            defaultMessage='Name'
                        />
                    </div>
                    <div
                        className='AbstractList__header-label'
                        style={{width: '150px'}}
                    >
                        <FormattedMessage
                            id='admin.systemUserDetail.teamList.header.type'
                            defaultMessage='Type'
                        />
                    </div>
                    <div
                        className='AbstractList__header-label'
                        style={{width: '150px'}}
                    />
                </div>
                <div className='AbstractList__body'>
                    {teams.map((team) => (
                        <div
                            key={team.id}
                            className='TeamRow'
                        >
                            <div className='TeamRow__row'>
                                <div className='TeamRow__team-name'>
                                    <div className='col-sm-auto'>
                                        <TeamIcon
                                            size='sm'
                                            url={imageURLForTeam(team)}
                                            content={team.display_name}
                                        />
                                    </div>
                                    <div className='col-md-auto'>
                                        <b>{team.display_name}</b>
                                    </div>
                                </div>
                                <span className='TeamRow__description'>
                                    {renderTeamType(team)}
                                </span>
                                <span className='TeamRow__actions'>
                                    <button
                                        type='button'
                                        className='btn btn-tertiary btn-sm'
                                        onClick={() => handleRemove(team.id)}
                                    >
                                        <FormattedMessage
                                            id='admin.systemUserDetail.orgOnlyTeams.remove'
                                            defaultMessage='Remove'
                                        />
                                    </button>
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </AdminPanel>
    );
}
