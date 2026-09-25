// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createMemoryHistory} from 'history';
import React from 'react';

import type {DeepPartial} from '@mattermost/types/utilities';

import {Client4} from 'mattermost-redux/client';

import {renderWithContext, screen, userEvent} from 'tests/react_testing_utils';

import type {GlobalState} from 'types/store';

import TeamStatistics from './team_statistics';

function baseState(roles: string): DeepPartial<GlobalState> {
    return {
        entities: {
            channels: {
                channels: {
                    public_channel: {
                        id: 'public_channel',
                        name: 'public-channel',
                        display_name: 'Public Channel',
                        delete_at: 0,
                        type: 'O',
                        team_id: 'team-id',
                    },
                    private_channel: {
                        id: 'private_channel',
                        name: 'private-channel',
                        display_name: 'Private Channel',
                        delete_at: 0,
                        type: 'P',
                        team_id: 'team-id',
                    },
                    archived_channel: {
                        id: 'archived_channel',
                        name: 'archived-channel',
                        display_name: 'Archived Channel',
                        delete_at: 123,
                        type: 'O',
                        team_id: 'team-id',
                    },
                },
                channelsInTeam: {
                    'team-id': new Set(['public_channel', 'private_channel', 'archived_channel']),
                },
            },
            teams: {
                currentTeamId: 'team-id',
                teams: {
                    'team-id': {
                        id: 'team-id',
                        name: 'team-1',
                        display_name: 'Team 1',
                    },
                },
                myMembers: {
                    'team-id': {
                        team_id: 'team-id',
                        user_id: 'current_user_id',
                        roles,
                    },
                },
                membersInTeam: {
                    'team-id': {
                        current_user_id: {team_id: 'team-id', user_id: 'current_user_id', roles, scheme_admin: roles === 'team_admin', scheme_user: true},
                        other_user_id: {team_id: 'team-id', user_id: 'other_user_id', roles: '', scheme_admin: false, scheme_user: true},
                    },
                },
                stats: {
                    'team-id': {
                        team_id: 'team-id',
                        total_member_count: 12,
                        active_member_count: 10,
                    },
                },
            },
            users: {
                currentUserId: 'current_user_id',
                profiles: {
                    current_user_id: {id: 'current_user_id', roles, username: 'current_user', email: 'current_user@example.com'},
                    other_user_id: {id: 'other_user_id', roles: 'system_user', username: 'other_user', email: 'other_user@example.com'},
                },
                profilesInTeam: {
                    'team-id': new Set(['current_user_id', 'other_user_id']),
                },
            },
            admin: {
                teamAnalytics: {
                    'team-id': {
                        POST_PER_DAY: [{name: '2024-01-01', value: 5}],
                        USERS_WITH_POSTS_PER_DAY: [{name: '2024-01-01', value: 3}],
                    },
                },
            },
        },
    };
}

describe('components/team_statistics/TeamStatistics', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('should render statistics for a system admin', () => {
        renderWithContext(<TeamStatistics/>, baseState('system_admin'));

        expect(screen.getByText('Team 1')).toBeInTheDocument();
        expect(screen.getByText('Team Statistics')).toBeInTheDocument();
        expect(screen.getByTestId('totalMembers')).toHaveTextContent('12');
        expect(screen.getByTestId('activeMembers')).toHaveTextContent('10');
        expect(screen.getByTestId('publicChannels')).toHaveTextContent('1');
        expect(screen.getByTestId('privateChannels')).toHaveTextContent('1');
        expect(screen.getByText('Total Messages')).toBeInTheDocument();
        expect(screen.getByText('Active Users With Posts')).toBeInTheDocument();
        expect(screen.getByTestId('postCountsDay')).toBeInTheDocument();
        expect(screen.getByTestId('userCountsWithPostsDay')).toBeInTheDocument();
        expect(screen.getByText('Recently Active Users')).toBeInTheDocument();
        expect(screen.getByText('Newly Created Users')).toBeInTheDocument();
    });

    test('should render statistics for a team admin of the current team', () => {
        renderWithContext(<TeamStatistics/>, baseState('team_admin'));

        expect(screen.getByText('Team Statistics')).toBeInTheDocument();
        expect(screen.getByText('Total Messages')).toBeInTheDocument();
        expect(screen.getByText('Active Users With Posts')).toBeInTheDocument();
        expect(screen.getByText('Recently Active Users')).toBeInTheDocument();
        expect(screen.getByText('Newly Created Users')).toBeInTheDocument();
    });

    test('should switch to the Users tab and list team members', async () => {
        renderWithContext(<TeamStatistics/>, baseState('system_admin'));

        await userEvent.click(screen.getByText('Users'));

        expect(await screen.findByText('current_user')).toBeInTheDocument();
        expect(screen.getByText('other_user')).toBeInTheDocument();
        expect(screen.getAllByRole('img')).toHaveLength(2);
        expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });

    test('should switch to the Channels tab and filter by type', async () => {
        jest.spyOn(Client4, 'searchAllChannels').mockResolvedValue([
            {
                id: 'public_channel',
                name: 'public-channel',
                display_name: 'Public Channel',
                delete_at: 0,
                type: 'O',
                team_id: 'team-id',
            },
            {
                id: 'private_channel',
                name: 'private-channel',
                display_name: 'Private Channel',
                delete_at: 0,
                type: 'P',
                team_id: 'team-id',
            },
            {
                id: 'archived_channel',
                name: 'archived-channel',
                display_name: 'Archived Channel',
                delete_at: 123,
                type: 'O',
                team_id: 'team-id',
            },
        ] as never);

        renderWithContext(<TeamStatistics/>, baseState('system_admin'));

        await userEvent.click(screen.getByText('Channels'));

        expect(await screen.findByText('Public Channel')).toBeInTheDocument();
        expect(screen.getByText('Private Channel')).toBeInTheDocument();
        expect(screen.queryByText('Archived Channel')).not.toBeInTheDocument();
        expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });

    test('should redirect a regular member back to the team', () => {
        const history = createMemoryHistory({initialEntries: ['/team-1/statistics']});

        renderWithContext(
            <TeamStatistics/>,
            baseState('team_user'),
            {history},
        );

        expect(screen.queryByText('Team Statistics')).not.toBeInTheDocument();
        expect(history.location.pathname).toBe('/team-1');
    });
});
