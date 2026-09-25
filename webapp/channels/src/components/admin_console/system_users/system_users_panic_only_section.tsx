// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useMemo, useState} from 'react';
import {defineMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {useHistory} from 'react-router-dom';

import type {UserProfile} from '@mattermost/types/users';

import {getPanicButtonOnlyUsers} from 'mattermost-redux/actions/panic_button_only_users';
import {getStatusesByIds, getProfilesByIds} from 'mattermost-redux/actions/users';
import {getUsers} from 'mattermost-redux/selectors/entities/users';

import type {Column, Row} from 'components/admin_console/data_grid/data_grid';
import DataGrid from 'components/admin_console/data_grid/data_grid';
import UserNameCell from 'components/team_statistics/user_name_cell';
import AdminPanel from 'components/widgets/admin_console/admin_panel';

const USERS_PER_PAGE = 10;

const panelTitle = defineMessage({
    id: 'admin.system_users.extraSections.panicOnly.title',
    defaultMessage: 'Panic Button Only accounts',
});

const panelSubtitle = defineMessage({
    id: 'admin.system_users.extraSections.panicOnly.hint',
    defaultMessage: 'These accounts are restricted from ever joining a team or channel.',
});

// Global, admin-curated list (server/channels/app/panic_button_only_users.go) — expected to stay
// small, so unlike SystemUsersNoTeamSection it's simplest to load it fully and paginate/search on
// the client, same pattern already proven in team_statistics/team_users_tab.tsx.
export function SystemUsersPanicOnlySection() {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const history = useHistory();

    const allUsersById = useSelector(getUsers);

    const [panicOnlyIds, setPanicOnlyIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [term, setTerm] = useState('');

    useEffect(() => {
        dispatch(getPanicButtonOnlyUsers()).then((result: any) => {
            if ('data' in result && result.data) {
                setPanicOnlyIds(result.data);
            }
        });
    }, [dispatch]);

    useEffect(() => {
        if (panicOnlyIds.length === 0) {
            return;
        }
        dispatch(getProfilesByIds(panicOnlyIds)).then(() => {
            dispatch(getStatusesByIds(panicOnlyIds));
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatch, panicOnlyIds.join(',')]);

    const users = useMemo(() => {
        return panicOnlyIds.
            map((id) => allUsersById[id]).
            filter((user): user is UserProfile => Boolean(user)).
            sort((a, b) => a.username.localeCompare(b.username));
    }, [panicOnlyIds, allUsersById]);

    const filteredUsers = useMemo(() => {
        if (!term) {
            return users;
        }
        const lowerTerm = term.toLowerCase();
        return users.filter((user) => user.username.toLowerCase().includes(lowerTerm) || user.email.toLowerCase().includes(lowerTerm));
    }, [users, term]);

    const columns: Column[] = useMemo(() => [
        {
            name: formatMessage({id: 'admin.system_users.extraSections.name', defaultMessage: 'Name'}),
            field: 'name',
            width: 3,
            fixed: true,
        },
        {
            name: formatMessage({id: 'admin.system_users.extraSections.email', defaultMessage: 'Email'}),
            field: 'email',
        },
    ], [formatMessage]);

    const rows: Row[] = useMemo(() => {
        const startIndex = page * USERS_PER_PAGE;
        return filteredUsers.slice(startIndex, startIndex + USERS_PER_PAGE).map((user) => ({
            cells: {
                id: user.id,
                name: <UserNameCell user={user}/>,
                email: user.email,
            },
            onClick: () => history.push(`/admin_console/user_management/user/${user.id}`),
        }));
    }, [filteredUsers, page, history]);

    const startCount = filteredUsers.length === 0 ? 0 : (page * USERS_PER_PAGE) + 1;
    const endCount = Math.min((page + 1) * USERS_PER_PAGE, filteredUsers.length);

    if (users.length === 0) {
        return null;
    }

    return (
        <AdminPanel
            title={panelTitle}
            subtitle={panelSubtitle}
        >
            <DataGrid
                className='customTable'
                columns={columns}
                rows={rows}
                loading={false}
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
                placeholderEmpty={
                    <span>{formatMessage({id: 'admin.system_users.extraSections.empty', defaultMessage: 'No users found'})}</span>
                }
            />
        </AdminPanel>
    );
}

export default SystemUsersPanicOnlySection;
