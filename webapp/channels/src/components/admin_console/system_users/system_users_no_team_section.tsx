// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {defineMessage, useIntl} from 'react-intl';
import {useDispatch} from 'react-redux';
import {useHistory} from 'react-router-dom';

import {CursorPaginationDirection, UserReportSortColumns} from '@mattermost/types/reports';
import type {UserReport} from '@mattermost/types/reports';

import {getPanicButtonOnlyUsers} from 'mattermost-redux/actions/panic_button_only_users';
import {getStatusesByIds} from 'mattermost-redux/actions/users';

import {getUserCountForReporting, getUserReports} from 'actions/views/admin';

import type {Column, Row} from 'components/admin_console/data_grid/data_grid';
import DataGrid from 'components/admin_console/data_grid/data_grid';
import UserNameCell from 'components/team_statistics/user_name_cell';
import AdminPanel from 'components/widgets/admin_console/admin_panel';

const PAGE_SIZE = 10;

const panelTitle = defineMessage({
    id: 'admin.system_users.extraSections.noTeam.title',
    defaultMessage: 'Users without a team',
});

const panelSubtitle = defineMessage({
    id: 'admin.system_users.extraSections.noTeam.hint',
    defaultMessage: 'These accounts do not belong to any team. Panic Button Only accounts are listed separately above.',
});

// Uses the server's already-existing `has_no_team` report filter (server/public/model/report.go)
// with real server-side cursor pagination, since — unlike the admin-curated panic-only list — the
// no-team population could be large. Panic Button Only accounts always have zero teams by
// construction (App.MarkPanicButtonOnly enforces it), so every one of them would otherwise also
// show up here; they're filtered out client-side to keep the two sections mutually exclusive,
// same requirement already fixed for team_statistics's org-only section this session.
export function SystemUsersNoTeamSection() {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const history = useHistory();

    const [panicOnlyIds, setPanicOnlyIds] = useState<Set<string>>(new Set());
    const [rawUsers, setRawUsers] = useState<UserReport[]>([]);
    const [totalWithNoTeam, setTotalWithNoTeam] = useState(0);
    const [loading, setLoading] = useState(true);
    const [pageIndex, setPageIndex] = useState(0);
    const [cursorUserId, setCursorUserId] = useState<string | undefined>();
    const [cursorColumnValue, setCursorColumnValue] = useState<string | undefined>();
    const [cursorDirection, setCursorDirection] = useState<CursorPaginationDirection | undefined>();

    useEffect(() => {
        dispatch(getPanicButtonOnlyUsers()).then((result: any) => {
            if ('data' in result && result.data) {
                setPanicOnlyIds(new Set(result.data));
            }
        });
    }, [dispatch]);

    useEffect(() => {
        dispatch(getUserCountForReporting({has_no_team: true})).then((result: any) => {
            if ('data' in result && typeof result.data === 'number') {
                setTotalWithNoTeam(result.data);
            }
        });
    }, [dispatch]);

    useEffect(() => {
        setLoading(true);
        dispatch(getUserReports({
            has_no_team: true,
            sort_column: UserReportSortColumns.username,
            page_size: PAGE_SIZE,
            from_id: cursorUserId,
            from_column_value: cursorColumnValue,
            direction: cursorDirection,
        })).then((result: any) => {
            if ('data' in result && result.data) {
                setRawUsers(result.data);
                dispatch(getStatusesByIds((result.data as UserReport[]).map((user) => user.id)));
            }
            setLoading(false);
        });
    }, [dispatch, cursorUserId, cursorColumnValue, cursorDirection]);

    const filteredUsers = useMemo(() => {
        return rawUsers.filter((user) => !panicOnlyIds.has(user.id));
    }, [rawUsers, panicOnlyIds]);

    const handleNextPageClick = useCallback(() => {
        if (!rawUsers.length) {
            return;
        }
        const lastRow = rawUsers[rawUsers.length - 1];
        setPageIndex((p) => p + 1);
        setCursorDirection(CursorPaginationDirection.next);
        setCursorUserId(lastRow.id);
        setCursorColumnValue(lastRow.username);
    }, [rawUsers]);

    const handlePreviousPageClick = useCallback(() => {
        if (!rawUsers.length || pageIndex <= 0) {
            return;
        }
        const firstRow = rawUsers[0];
        setPageIndex((p) => Math.max(0, p - 1));
        setCursorDirection(CursorPaginationDirection.prev);
        setCursorUserId(firstRow.id);
        setCursorColumnValue(firstRow.username);
    }, [rawUsers, pageIndex]);

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
        return filteredUsers.map((user) => ({
            cells: {
                id: user.id,
                name: <UserNameCell user={user}/>,
                email: user.email,
            },
            onClick: () => history.push(`/admin_console/user_management/user/${user.id}`),
        }));
    }, [filteredUsers, history]);

    // Approximate — a page can be smaller than PAGE_SIZE once panic-only accounts are filtered
    // out of it, so exact running totals aren't available without fetching every prior page.
    const total = Math.max(0, totalWithNoTeam - panicOnlyIds.size);
    const startCount = filteredUsers.length === 0 ? 0 : (pageIndex * PAGE_SIZE) + 1;
    const endCount = (pageIndex * PAGE_SIZE) + filteredUsers.length;

    if (!loading && pageIndex === 0 && filteredUsers.length === 0) {
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
                loading={loading}
                startCount={startCount}
                endCount={endCount}
                total={total}
                nextPage={handleNextPageClick}
                previousPage={handlePreviousPageClick}
                placeholderEmpty={
                    <span>{formatMessage({id: 'admin.system_users.extraSections.empty', defaultMessage: 'No users found'})}</span>
                }
            />
        </AdminPanel>
    );
}

export default SystemUsersNoTeamSection;
