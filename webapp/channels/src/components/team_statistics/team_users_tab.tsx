// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import type {TeamMembership} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';

import {getPanicButtonOnlyUsers} from 'mattermost-redux/actions/panic_button_only_users';
import {getTeamOrganizationMembers} from 'mattermost-redux/actions/teams';
import {getStatusesByIds, getProfilesByIds} from 'mattermost-redux/actions/users';
import {getCurrentTeamId, getMembersInCurrentTeam} from 'mattermost-redux/selectors/entities/teams';
import {getUsers, getProfilesInCurrentTeam} from 'mattermost-redux/selectors/entities/users';

import {loadProfilesAndTeamMembers} from 'actions/user_actions';

import type {Column, Row} from 'components/admin_console/data_grid/data_grid';
import DataGrid from 'components/admin_console/data_grid/data_grid';
import UserGridRoleDropdown from 'components/admin_console/user_grid/user_grid_role_dropdown';

import CreateUserModal from './create_user_modal';
import {downloadCsv} from './csv_export';
import EditUserModal from './edit_user_modal';
import UserNameCell from './user_name_cell';

const USERS_PER_PAGE = 10;
const MAX_USERS_LOADED = 200;

const noop = () => {};
const EMPTY_MEMBERSHIPS: Record<string, TeamMembership> = {};

function getUserRoleLabel(user: UserProfile, membership?: TeamMembership): string {
    if (user.roles.includes('system_admin')) {
        return 'System Admin';
    }
    if (membership?.scheme_admin) {
        return 'Team Admin';
    }
    if (user.roles.includes('guest')) {
        return 'Guest';
    }
    return 'Member';
}

const TeamUsersTab = () => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const currentTeamId = useSelector(getCurrentTeamId);
    const users = useSelector(getProfilesInCurrentTeam);
    const teamMembers = useSelector(getMembersInCurrentTeam) ?? EMPTY_MEMBERSHIPS;
    const allUsersById = useSelector(getUsers);

    const [page, setPage] = useState(0);
    const [term, setTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [showCreateUser, setShowCreateUser] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // IDs of everyone marked a genuine "organization member" of this team (see
    // TeamOrganizationMember) — a superset of real team members. A "Panic Button Only" account
    // (server/channels/app/panic_button_only_users.go) is deliberately marked this way while
    // never becoming a real TeamMember, so it's the main way this list and teamMembers diverge.
    const [orgMemberIds, setOrgMemberIds] = useState<string[]>([]);
    const [orgOnlyPage, setOrgOnlyPage] = useState(0);
    const [orgOnlyTerm, setOrgOnlyTerm] = useState('');

    // Authoritative, freshly-fetched-every-time source of truth for "is this user panic-button-
    // only" — used instead of trusting `teamMembers` to have already dropped them. mattermost-
    // redux's own team-membership reducers only ever MERGE what they're given; a member who no
    // longer comes back in a fetch is never pruned unless a specific removal action is dispatched
    // (we do dispatch one, in edit_user_modal.tsx, but only at the moment of toggling the flag —
    // it can't retroactively fix a browser tab that already had a stale cached entry from before).
    // Cross-checking against this list directly makes both tables correct regardless of that.
    const [panicOnlyIds, setPanicOnlyIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!currentTeamId) {
            return;
        }
        setLoading(true);
        dispatch(loadProfilesAndTeamMembers(0, MAX_USERS_LOADED, currentTeamId, {active: true})).finally(() => {
            setLoading(false);
        });
    }, [dispatch, currentTeamId, refreshKey]);

    useEffect(() => {
        if (users.length > 0) {
            dispatch(getStatusesByIds(users.map((user) => user.id)));
        }
    }, [dispatch, users]);

    useEffect(() => {
        if (!currentTeamId) {
            return;
        }
        dispatch(getTeamOrganizationMembers(currentTeamId)).then((result) => {
            if ('data' in result && result.data) {
                setOrgMemberIds(result.data);
            }
        });
    }, [dispatch, currentTeamId, refreshKey]);

    useEffect(() => {
        dispatch(getPanicButtonOnlyUsers()).then((result) => {
            if ('data' in result && result.data) {
                setPanicOnlyIds(new Set(result.data));
            }
        });
    }, [dispatch, refreshKey]);

    const orgOnlyIds = useMemo(() => {
        return orgMemberIds.filter((id) => panicOnlyIds.has(id) || !(id in teamMembers));
    }, [orgMemberIds, teamMembers, panicOnlyIds]);

    useEffect(() => {
        if (orgOnlyIds.length === 0) {
            return;
        }
        dispatch(getProfilesByIds(orgOnlyIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatch, orgOnlyIds.join(',')]);

    const orgOnlyUsers = useMemo(() => {
        return orgOnlyIds.
            map((id) => allUsersById[id]).
            filter((user): user is UserProfile => Boolean(user)).
            sort((a, b) => a.username.localeCompare(b.username));
    }, [orgOnlyIds, allUsersById]);

    const filteredOrgOnlyUsers = useMemo(() => {
        if (!orgOnlyTerm) {
            return orgOnlyUsers;
        }
        const lowerTerm = orgOnlyTerm.toLowerCase();
        return orgOnlyUsers.filter((user) => user.username.toLowerCase().includes(lowerTerm) || user.email.toLowerCase().includes(lowerTerm));
    }, [orgOnlyUsers, orgOnlyTerm]);

    // A panic-button-only user is excluded here even if a stale cache entry still claims they're
    // a real team member (see panicOnlyIds above) — this list is never their real home.
    const realTeamUsers = useMemo(() => {
        return users.filter((user) => !panicOnlyIds.has(user.id));
    }, [users, panicOnlyIds]);

    const filteredUsers = useMemo(() => {
        if (!term) {
            return realTeamUsers;
        }
        const lowerTerm = term.toLowerCase();
        return realTeamUsers.filter((user) => user.username.toLowerCase().includes(lowerTerm) || user.email.toLowerCase().includes(lowerTerm));
    }, [realTeamUsers, term]);

    const columns: Column[] = useMemo(() => [
        {
            name: formatMessage({id: 'team_statistics.users.name', defaultMessage: 'Name'}),
            field: 'name',
            width: 3,
            fixed: true,
        },
        {
            name: formatMessage({id: 'team_statistics.users.role', defaultMessage: 'Role'}),
            field: 'role',
            overflow: 'visible',
        },
    ], [formatMessage]);

    const orgOnlyRows: Row[] = useMemo(() => {
        const startIndex = orgOnlyPage * USERS_PER_PAGE;
        return filteredOrgOnlyUsers.slice(startIndex, startIndex + USERS_PER_PAGE).map((user) => ({
            cells: {
                id: user.id,
                name: <UserNameCell user={user}/>,

                // These users have no real team membership to hold a team role — a plain label
                // (derived from their system-wide roles only) avoids implying otherwise, unlike
                // the interactive team-role dropdown the main table below uses.
                role: <span>{getUserRoleLabel(user)}</span>,
            },
            onClick: () => setSelectedUser(user),
        }));
    }, [filteredOrgOnlyUsers, orgOnlyPage]);

    const orgOnlyStartCount = filteredOrgOnlyUsers.length === 0 ? 0 : (orgOnlyPage * USERS_PER_PAGE) + 1;
    const orgOnlyEndCount = Math.min((orgOnlyPage + 1) * USERS_PER_PAGE, filteredOrgOnlyUsers.length);

    const rows: Row[] = useMemo(() => {
        const startIndex = page * USERS_PER_PAGE;
        return filteredUsers.slice(startIndex, startIndex + USERS_PER_PAGE).map((user) => ({
            cells: {
                id: user.id,
                name: <UserNameCell user={user}/>,
                role: (
                    <UserGridRoleDropdown
                        user={user}
                        membership={teamMembers[user.id]}
                        scope='team'
                        handleUpdateMembership={noop}
                        isDisabled={true}
                    />
                ),
            },
            onClick: () => setSelectedUser(user),
        }));
    }, [filteredUsers, teamMembers, page]);

    const startCount = filteredUsers.length === 0 ? 0 : (page * USERS_PER_PAGE) + 1;
    const endCount = Math.min((page + 1) * USERS_PER_PAGE, filteredUsers.length);

    const handleExportCsv = () => {
        downloadCsv(
            'usuarios.csv',
            [
                formatMessage({id: 'team_statistics.users.name', defaultMessage: 'Name'}),
                formatMessage({id: 'team_statistics.users.role', defaultMessage: 'Role'}),
                formatMessage({id: 'team_statistics.users.email', defaultMessage: 'Email'}),
            ],
            filteredUsers.map((user) => [user.username, getUserRoleLabel(user, teamMembers[user.id]), user.email]),
        );
    };

    return (
        <>
            <DataGrid
                className='customTable'
                columns={columns}
                rows={rows}
                loading={loading}
                startCount={startCount}
                endCount={endCount}
                total={filteredUsers.length}
                nextPage={() => setPage((p) => p + 1)}
                previousPage={() => setPage((p) => Math.max(0, p - 1))}
                onSearch={(newTerm: string) => {
                    setTerm(newTerm);
                    setPage(0);
                }}
                term={term}
                placeholderEmpty={(
                    <span>{formatMessage({id: 'team_statistics.users.empty', defaultMessage: 'No users found'})}</span>
                )}
                extraComponent={(
                    <>
                        <button
                            type='button'
                            className='btn btn-tertiary btn-sm'
                            onClick={handleExportCsv}
                        >
                            {formatMessage({id: 'team_statistics.users.exportCsv', defaultMessage: 'Export CSV'})}
                        </button>
                        <button
                            type='button'
                            className='btn btn-primary btn-sm'
                            onClick={() => setShowCreateUser(true)}
                        >
                            {formatMessage({id: 'team_statistics.users.create.button', defaultMessage: 'Create User'})}
                        </button>
                    </>
                )}
            />
            {orgOnlyUsers.length > 0 && (
                <div className='team-statistics-org-only-section'>
                    <h3 className='team-statistics-org-only-section__title'>
                        {formatMessage({id: 'team_statistics.users.orgOnly.title', defaultMessage: 'Organization members without team membership'})}
                    </h3>
                    <p className='team-statistics-org-only-section__hint'>
                        {formatMessage({id: 'team_statistics.users.orgOnly.hint', defaultMessage: 'These accounts are marked as members of this team\'s organization but are not actual team members — most commonly, "Panic Button Only" accounts.'})}
                    </p>
                    <DataGrid
                        className='customTable'
                        columns={columns}
                        rows={orgOnlyRows}
                        loading={false}
                        startCount={orgOnlyStartCount}
                        endCount={orgOnlyEndCount}
                        total={filteredOrgOnlyUsers.length}
                        nextPage={() => setOrgOnlyPage((p) => p + 1)}
                        previousPage={() => setOrgOnlyPage((p) => Math.max(0, p - 1))}
                        onSearch={(newTerm: string) => {
                            setOrgOnlyTerm(newTerm);
                            setOrgOnlyPage(0);
                        }}
                        term={orgOnlyTerm}
                        placeholderEmpty={(
                            <span>{formatMessage({id: 'team_statistics.users.empty', defaultMessage: 'No users found'})}</span>
                        )}
                    />
                </div>
            )}
            {selectedUser && (
                <EditUserModal
                    user={selectedUser}
                    onExited={() => setSelectedUser(null)}
                    onSaved={() => setRefreshKey((k) => k + 1)}
                />
            )}
            {showCreateUser && currentTeamId && (
                <CreateUserModal
                    teamId={currentTeamId}
                    onExited={() => setShowCreateUser(false)}
                    onCreated={() => setRefreshKey((k) => k + 1)}
                />
            )}
        </>
    );
};

export default TeamUsersTab;
