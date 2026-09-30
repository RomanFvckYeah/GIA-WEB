// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import type {OperationalTrackingGroup} from '@mattermost/types/operational_tracking_groups';

import {getOperationalTrackingGroupsForTeam} from 'mattermost-redux/actions/operational_tracking_groups';
import {getProfilesByIds} from 'mattermost-redux/actions/users';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {getUsers} from 'mattermost-redux/selectors/entities/users';

import type {Column, Row} from 'components/admin_console/data_grid/data_grid';
import DataGrid from 'components/admin_console/data_grid/data_grid';

import CreateOperationalTrackingGroupModal from './create_operational_tracking_group_modal';
import ManageOperationalTrackingGroupModal from './manage_operational_tracking_group_modal';
import {logSent, logResult} from './operational_tracking_debug';

const GROUPS_PER_PAGE = 10;

const TeamOperationalTrackingTab = () => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const currentTeamId = useSelector(getCurrentTeamId);
    const allUsersById = useSelector(getUsers);

    const [groups, setGroups] = useState<OperationalTrackingGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [term, setTerm] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<OperationalTrackingGroup | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

    useEffect(() => {
        if (!currentTeamId) {
            return undefined;
        }
        let ignore = false;
        setLoading(true);
        logSent('getOperationalTrackingGroupsForTeam', {teamId: currentTeamId});
        dispatch(getOperationalTrackingGroupsForTeam(currentTeamId)).then((result) => {
            logResult('getOperationalTrackingGroupsForTeam', result);
            if (ignore) {
                return;
            }
            if ('data' in result && result.data) {
                const groupList = result.data as OperationalTrackingGroup[];
                setGroups(groupList);
                dispatch(getProfilesByIds(groupList.map((g) => g.create_by)));
            }
            setLoading(false);
        });
        return () => {
            ignore = true;
        };
    }, [dispatch, currentTeamId, refreshKey]);

    const filteredGroups = useMemo(() => {
        if (!term) {
            return groups;
        }
        const lowerTerm = term.toLowerCase();
        return groups.filter((group) => group.name.toLowerCase().includes(lowerTerm));
    }, [groups, term]);

    const columns: Column[] = useMemo(() => [
        {
            name: formatMessage({id: 'team_statistics.operationalTracking.groups.name', defaultMessage: 'Name'}),
            field: 'name',
            width: 3,
            fixed: true,
        },
        {
            name: formatMessage({id: 'team_statistics.operationalTracking.groups.createdBy', defaultMessage: 'Created by'}),
            field: 'createdBy',
        },
        {
            name: formatMessage({id: 'team_statistics.operationalTracking.groups.members', defaultMessage: 'Members'}),
            field: 'members',
            textAlign: 'center',
        },
    ], [formatMessage]);

    const pagedGroups = filteredGroups.slice(page * GROUPS_PER_PAGE, (page + 1) * GROUPS_PER_PAGE);
    const rows: Row[] = pagedGroups.map((group) => ({
        cells: {
            id: group.id,
            name: group.name,
            createdBy: allUsersById[group.create_by]?.username ?? '',
            members: String(group.member_count),
        },
        onClick: () => setSelectedGroup(group),
    }));

    const startCount = filteredGroups.length === 0 ? 0 : (page * GROUPS_PER_PAGE) + 1;
    const endCount = Math.min((page + 1) * GROUPS_PER_PAGE, filteredGroups.length);

    return (
        <>
            <h2 className='team-statistics-operational-tracking__title'>
                {formatMessage({id: 'team_statistics.operationalTracking.groupsTitle', defaultMessage: 'Groups of your team'})}
            </h2>
            <DataGrid
                className='customTable'
                columns={columns}
                rows={rows}
                loading={loading}
                startCount={startCount}
                endCount={endCount}
                total={filteredGroups.length}
                nextPage={() => setPage((p) => p + 1)}
                previousPage={() => setPage((p) => Math.max(0, p - 1))}
                onSearch={(newTerm: string) => {
                    setTerm(newTerm);
                    setPage(0);
                }}
                term={term}
                placeholderEmpty={(
                    <span>{formatMessage({id: 'team_statistics.operationalTracking.groups.empty', defaultMessage: 'No groups yet'})}</span>
                )}
                extraComponent={(
                    <button
                        type='button'
                        className='btn btn-primary btn-sm'
                        onClick={() => setShowCreate(true)}
                    >
                        {formatMessage({id: 'team_statistics.operationalTracking.groups.create', defaultMessage: 'Create Group'})}
                    </button>
                )}
            />
            {showCreate && currentTeamId && (
                <CreateOperationalTrackingGroupModal
                    teamId={currentTeamId}
                    onExited={() => setShowCreate(false)}
                    onCreated={refresh}
                />
            )}
            {selectedGroup && (
                <ManageOperationalTrackingGroupModal
                    group={selectedGroup}
                    onExited={() => setSelectedGroup(null)}
                    onMemberCountChanged={(delta) => {
                        const groupId = selectedGroup.id;
                        setGroups((prev) => prev.map((g) => (g.id === groupId ? {...g, member_count: g.member_count + delta} : g)));
                    }}
                    onDeleted={() => {
                        const groupId = selectedGroup.id;
                        setGroups((prev) => prev.filter((g) => g.id !== groupId));
                    }}
                    onRenamed={(newName) => {
                        const groupId = selectedGroup.id;
                        setGroups((prev) => prev.map((g) => (g.id === groupId ? {...g, name: newName} : g)));
                        setSelectedGroup((prev) => (prev && prev.id === groupId ? {...prev, name: newName} : prev));
                    }}
                />
            )}
        </>
    );
};

export default TeamOperationalTrackingTab;
