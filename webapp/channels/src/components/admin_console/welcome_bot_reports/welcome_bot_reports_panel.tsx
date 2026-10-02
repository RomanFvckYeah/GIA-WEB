// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import type {WelcomeBotReport} from '@mattermost/types/welcome_bot_reports';

import {getProfilesByIds} from 'mattermost-redux/actions/users';
import {getWelcomeBotReports, resolveWelcomeBotReport} from 'mattermost-redux/actions/welcome_bot_reports';
import {getUsers} from 'mattermost-redux/selectors/entities/users';

import type {Column, Row} from 'components/admin_console/data_grid/data_grid';
import DataGrid from 'components/admin_console/data_grid/data_grid';
import AdminHeader from 'components/widgets/admin_console/admin_header';

const PAGE_SIZE = 20;

const messages = defineMessages({
    title: {id: 'admin.welcomeBotReports.title', defaultMessage: 'Reportes del bot de bienvenida'},
    user: {id: 'admin.welcomeBotReports.user', defaultMessage: 'Usuario'},
    message: {id: 'admin.welcomeBotReports.message', defaultMessage: 'Mensaje'},
    date: {id: 'admin.welcomeBotReports.date', defaultMessage: 'Fecha'},
    status: {id: 'admin.welcomeBotReports.status', defaultMessage: 'Estado'},
    statusResolved: {id: 'admin.welcomeBotReports.status.resolved', defaultMessage: 'Resuelto'},
    statusOpen: {id: 'admin.welcomeBotReports.status.open', defaultMessage: 'Pendiente'},
    resolve: {id: 'admin.welcomeBotReports.resolve', defaultMessage: 'Marcar como resuelto'},
    empty: {id: 'admin.welcomeBotReports.empty', defaultMessage: 'No hay reportes'},
});

export const searchableStrings = [
    messages.title,
];

const WelcomeBotReportsPanel = () => {
    const {formatMessage, formatDate} = useIntl();
    const dispatch = useDispatch();
    const allUsersById = useSelector(getUsers);

    const [reports, setReports] = useState<WelcomeBotReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [resolvingId, setResolvingId] = useState<string | null>(null);

    useEffect(() => {
        let ignore = false;
        setLoading(true);
        dispatch(getWelcomeBotReports(page, PAGE_SIZE, false) as any).then((result: any) => {
            if (ignore) {
                return;
            }
            if ('data' in result && result.data) {
                const reportList = result.data as WelcomeBotReport[];
                setReports(reportList);
                dispatch(getProfilesByIds(reportList.map((r) => r.user_id)) as any);
            }
            setLoading(false);
        });
        return () => {
            ignore = true;
        };
    }, [dispatch, page]);

    const handleResolve = useCallback(async (reportId: string) => {
        setResolvingId(reportId);
        const result = await dispatch(resolveWelcomeBotReport(reportId) as any) as any;
        setResolvingId(null);
        if (!result.error) {
            setReports((prev) => prev.map((r) => (r.id === reportId ? {...r, resolved: true} : r)));
        }
    }, [dispatch]);

    const columns: Column[] = useMemo(() => [
        {
            name: formatMessage(messages.user),
            field: 'user',
            width: 2,
            fixed: true,
        },
        {
            name: formatMessage(messages.message),
            field: 'message',
            width: 4,
        },
        {
            name: formatMessage(messages.date),
            field: 'date',
        },
        {
            name: formatMessage(messages.status),
            field: 'status',
        },
        {
            name: '',
            field: 'actions',
        },
    ], [formatMessage]);

    const rows: Row[] = useMemo(() => reports.map((report) => ({
        cells: {
            id: report.id,
            user: allUsersById[report.user_id]?.username ?? report.user_id,
            message: report.message,
            date: formatDate(report.create_at, {year: 'numeric', month: 'short', day: 'numeric'}),
            status: formatMessage(report.resolved ? messages.statusResolved : messages.statusOpen),
            actions: report.resolved ? null : (
                <button
                    type='button'
                    className='btn btn-sm btn-tertiary'
                    disabled={resolvingId === report.id}
                    onClick={() => handleResolve(report.id)}
                >
                    <FormattedMessage {...messages.resolve}/>
                </button>
            ),
        },
    })), [reports, allUsersById, formatDate, formatMessage, resolvingId, handleResolve]);

    const hasMore = reports.length === PAGE_SIZE;
    const startCount = reports.length === 0 ? 0 : (page * PAGE_SIZE) + 1;
    const endCount = (page * PAGE_SIZE) + reports.length;
    const total = hasMore ? endCount + 1 : endCount;

    return (
        <div className='wrapper--fixed'>
            <AdminHeader>
                <FormattedMessage {...messages.title}/>
            </AdminHeader>
            <div className='admin-console__wrapper'>
                <DataGrid
                    className='customTable'
                    columns={columns}
                    rows={rows}
                    loading={loading}
                    startCount={startCount}
                    endCount={endCount}
                    total={total}
                    nextPage={() => setPage((p) => p + 1)}
                    previousPage={() => setPage((p) => Math.max(0, p - 1))}
                    placeholderEmpty={<span>{formatMessage(messages.empty)}</span>}
                />
            </div>
        </div>
    );
};

export default WelcomeBotReportsPanel;
