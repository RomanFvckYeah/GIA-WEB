// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useMemo, useState} from 'react';
import {FormattedDate, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import type {UserProfile} from '@mattermost/types/users';

import {getPostsPerDayAnalytics, getUsersPerDayAnalytics} from 'mattermost-redux/actions/admin';
import {getTeamStats} from 'mattermost-redux/actions/teams';
import {getProfilesInTeam} from 'mattermost-redux/actions/users';
import {General} from 'mattermost-redux/constants';
import {getChannelsInCurrentTeam} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeamId, getCurrentTeamStats} from 'mattermost-redux/selectors/entities/teams';

import {getCurrentLocale} from 'selectors/i18n';

import {formatPostsPerDayData, formatUsersWithPostsPerDayData, synchronizeChartLabels} from 'components/analytics/format';
import LineChart from 'components/analytics/line_chart';
import StatisticCount from 'components/analytics/statistic_count';
import type {TableItem} from 'components/analytics/table_chart';
import TableChart from 'components/analytics/table_chart';

import {StatTypes} from 'utils/constants';
import {getMonthLong} from 'utils/i18n';

import type {GlobalState} from 'types/store';

function formatRecentUsersData(data: UserProfile[], locale: string): TableItem[] {
    return data.map((user) => ({
        name: user.username,
        tip: user.email,
        value: (
            <FormattedDate
                value={user.last_activity_at}
                day='numeric'
                month={getMonthLong(locale)}
                year='numeric'
                hour='2-digit'
                minute='2-digit'
            />
        ),
    }));
}

function formatNewUsersData(data: UserProfile[], locale: string): TableItem[] {
    return data.map((user) => ({
        name: user.username,
        tip: user.email,
        value: (
            <FormattedDate
                value={user.create_at}
                day='numeric'
                month={getMonthLong(locale)}
                year='numeric'
                hour='2-digit'
                minute='2-digit'
            />
        ),
    }));
}

const TeamOverviewTab = () => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const currentTeamId = useSelector(getCurrentTeamId);
    const stats = useSelector(getCurrentTeamStats);
    const channels = useSelector(getChannelsInCurrentTeam);
    const teamAnalytics = useSelector((state: GlobalState) => state.entities.admin.teamAnalytics[currentTeamId]);
    const locale = useSelector(getCurrentLocale);

    const [recentlyActiveUsers, setRecentlyActiveUsers] = useState<UserProfile[]>([]);
    const [newUsers, setNewUsers] = useState<UserProfile[]>([]);

    useEffect(() => {
        if (!currentTeamId) {
            return;
        }

        dispatch(getTeamStats(currentTeamId));
        dispatch(getPostsPerDayAnalytics(currentTeamId));
        dispatch(getUsersPerDayAnalytics(currentTeamId));

        dispatch(getProfilesInTeam(currentTeamId, 0, General.PROFILE_CHUNK_SIZE, 'last_activity_at')).then((result) => {
            if ('data' in result && result.data) {
                setRecentlyActiveUsers(result.data);
            }
        });
        dispatch(getProfilesInTeam(currentTeamId, 0, General.PROFILE_CHUNK_SIZE, 'create_at')).then((result) => {
            if ('data' in result && result.data) {
                setNewUsers(result.data);
            }
        });
    }, [dispatch, currentTeamId]);

    const {publicChannelCount, privateChannelCount} = useMemo(() => {
        let publicCount = 0;
        let privateCount = 0;
        for (const channel of channels) {
            if (channel.delete_at !== 0) {
                continue;
            }
            if (channel.type === 'O') {
                publicCount++;
            } else if (channel.type === 'P') {
                privateCount++;
            }
        }
        return {publicChannelCount: publicCount, privateChannelCount: privateCount};
    }, [channels]);

    const {postCountsDay, userCountsWithPostsDay} = useMemo(() => {
        const postsPerDay = teamAnalytics?.[StatTypes.POST_PER_DAY];
        const usersWithPostsPerDay = teamAnalytics?.[StatTypes.USERS_WITH_POSTS_PER_DAY];
        const labels = synchronizeChartLabels(postsPerDay, usersWithPostsPerDay);
        return {
            postCountsDay: formatPostsPerDayData(labels, postsPerDay),
            userCountsWithPostsDay: formatUsersWithPostsPerDayData(labels, usersWithPostsPerDay),
        };
    }, [teamAnalytics]);

    const recentActiveUsersData = useMemo(() => formatRecentUsersData(recentlyActiveUsers, locale), [recentlyActiveUsers, locale]);
    const newlyCreatedUsersData = useMemo(() => formatNewUsersData(newUsers, locale), [newUsers, locale]);

    return (
        <>
            <div className='grid-statistics'>
                <StatisticCount
                    id='totalMembers'
                    icon='fa-users'
                    title={formatMessage({id: 'team_statistics.totalMembers', defaultMessage: 'Total members'})}
                    count={stats?.total_member_count}
                />
                <StatisticCount
                    id='activeMembers'
                    icon='fa-user'
                    title={formatMessage({id: 'team_statistics.activeMembers', defaultMessage: 'Active members'})}
                    count={stats?.active_member_count}
                />
                <StatisticCount
                    id='publicChannels'
                    icon='fa-globe'
                    title={formatMessage({id: 'team_statistics.publicChannels', defaultMessage: 'Public channels'})}
                    count={publicChannelCount}
                />
                <StatisticCount
                    id='privateChannels'
                    icon='fa-lock'
                    title={formatMessage({id: 'team_statistics.privateChannels', defaultMessage: 'Private channels'})}
                    count={privateChannelCount}
                />
            </div>
            <div className='row'>
                <LineChart
                    key={currentTeamId + '-postCountsDay'}
                    id='postCountsDay'
                    title={formatMessage({id: 'team_statistics.messagesPerDay', defaultMessage: 'Total Messages'})}
                    data={postCountsDay}
                    width={740}
                    height={225}
                />
            </div>
            <div className='row'>
                <LineChart
                    key={currentTeamId + '-userCountsWithPostsDay'}
                    id='userCountsWithPostsDay'
                    title={formatMessage({id: 'team_statistics.activeUsersPerDay', defaultMessage: 'Active Users With Posts'})}
                    data={userCountsWithPostsDay}
                    width={740}
                    height={225}
                />
            </div>
            <div className='row'>
                <TableChart
                    title={formatMessage({id: 'team_statistics.recentlyActiveUsers', defaultMessage: 'Recently Active Users'})}
                    data={recentActiveUsersData}
                />
                <TableChart
                    title={formatMessage({id: 'team_statistics.newlyCreatedUsers', defaultMessage: 'Newly Created Users'})}
                    data={newlyCreatedUsersData}
                />
            </div>
        </>
    );
};

export default TeamOverviewTab;
