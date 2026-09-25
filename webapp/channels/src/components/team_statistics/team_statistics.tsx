// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useState} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {Redirect} from 'react-router-dom';
import {createGlobalStyle} from 'styled-components';

import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getCurrentRelativeTeamUrl, getCurrentTeam, getCurrentTeamMembership, isCurrentUserCurrentTeamAdmin} from 'mattermost-redux/selectors/entities/teams';
import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';

import BackstageNavbar from 'components/backstage/components/backstage_navbar';

import type {GlobalState} from 'types/store';

import TeamChannelsTab from './team_channels_tab';
import TeamOperationalTrackingTab from './team_operational_tracking_tab';
import TeamOverviewTab from './team_overview_tab';
import TeamUsersTab from './team_users_tab';

import './team_statistics.scss';

const TAB_KEYS = {
    OVERVIEW: 'overview',
    USERS: 'users',
    CHANNELS: 'channels',
    OPERATIONAL_TRACKING: 'operational_tracking',
};

const TeamStatistics = () => {
    const {formatMessage} = useIntl();

    const isSystemAdmin = useSelector(isCurrentUserSystemAdmin);
    const isTeamAdmin = useSelector(isCurrentUserCurrentTeamAdmin);
    const canView = isSystemAdmin || isTeamAdmin;
    const currentTeamUrl = useSelector(getCurrentRelativeTeamUrl);
    const currentTeam = useSelector(getCurrentTeam);
    const siteName = useSelector((state: GlobalState) => getConfig(state).SiteName);

    // On a fresh page load, the current team's membership (which isTeamAdmin depends on)
    // may not have reached the store yet, even though the user is a valid team_admin.
    // Wait for it before redirecting, so a direct link/refresh doesn't bounce a real
    // team_admin back to the channel view.
    const membershipLoaded = Boolean(useSelector(getCurrentTeamMembership));

    const [activeTab, setActiveTab] = useState<string>(TAB_KEYS.OVERVIEW);

    if (!isSystemAdmin && !membershipLoaded) {
        return null;
    }

    if (!canView) {
        return <Redirect to={currentTeamUrl}/>;
    }

    const tabs = [
        {key: TAB_KEYS.OVERVIEW, label: formatMessage({id: 'team_statistics.tabs.overview', defaultMessage: 'Team Statistics'})},
        {key: TAB_KEYS.USERS, label: formatMessage({id: 'team_statistics.tabs.users', defaultMessage: 'Users'})},
        {key: TAB_KEYS.CHANNELS, label: formatMessage({id: 'team_statistics.tabs.channels', defaultMessage: 'Channels'})},
        {key: TAB_KEYS.OPERATIONAL_TRACKING, label: formatMessage({id: 'team_statistics.tabs.operationalTracking', defaultMessage: 'Operational Tracking'})},
    ];

    return (
        <>
            <BackstageNavbar
                team={currentTeam}
                siteName={siteName}
            />
            <div className='backstage-body'>
                <div className='team-statistics-content team_statistics'>
                    <h1 className='team-statistics-team-name'>
                        {currentTeam?.display_name}
                    </h1>
                    <div className='team-statistics-layout'>
                        <div
                            className='team-statistics-nav'
                            role='tablist'
                            aria-orientation='vertical'
                        >
                            {tabs.map((tab) => (
                                <button
                                    key={tab.key}
                                    type='button'
                                    role='tab'
                                    aria-selected={activeTab === tab.key}
                                    className={classNames('team-statistics-nav__item', {active: activeTab === tab.key})}
                                    onClick={() => setActiveTab(tab.key)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <div
                            className='team-statistics-panel'
                            role='tabpanel'
                        >
                            {activeTab === TAB_KEYS.OVERVIEW && <TeamOverviewTab/>}
                            {activeTab === TAB_KEYS.USERS && <TeamUsersTab/>}
                            {activeTab === TAB_KEYS.CHANNELS && <TeamChannelsTab/>}
                            {activeTab === TAB_KEYS.OPERATIONAL_TRACKING && <TeamOperationalTrackingTab/>}
                        </div>
                    </div>
                </div>
            </div>
            <TeamStatisticsGlobalStyle/>
        </>
    );
};

export default TeamStatistics;

const TeamStatisticsGlobalStyle = createGlobalStyle`
    #root {
        > #global-header,
        > .team-sidebar,
        > .main-wrapper .sidebar--right,
        > .app-bar {
            display: none;
        }
    }
`;
