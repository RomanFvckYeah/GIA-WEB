// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import type {ChannelWithTeamData} from '@mattermost/types/channels';

import {getChannelsMemberCount as fetchChannelsMemberCount, searchAllChannels} from 'mattermost-redux/actions/channels';
import {getChannelsMemberCount} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';

import type {Column, Row} from 'components/admin_console/data_grid/data_grid';
import DataGrid from 'components/admin_console/data_grid/data_grid';
import type {FilterOptions} from 'components/admin_console/filter/filter';

import {getChannelIconComponent} from 'utils/channel_utils';

import {downloadCsv} from './csv_export';
import ManageChannelModal from './manage_channel_modal';

const CHANNELS_PER_PAGE = 10;

const TeamChannelsTab = () => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const currentTeamId = useSelector(getCurrentTeamId);
    const memberCounts = useSelector(getChannelsMemberCount);

    const [channels, setChannels] = useState<ChannelWithTeamData[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [term, setTerm] = useState('');
    const [filters, setFilters] = useState<FilterOptions>({
        channels: {
            name: formatMessage({id: 'team_statistics.channels.filterTitle', defaultMessage: 'Channel Type'}),
            keys: ['public', 'private'],
            values: {
                public: {
                    name: formatMessage({id: 'team_statistics.channels.filterPublic', defaultMessage: 'Public'}),
                    value: true,
                },
                private: {
                    name: formatMessage({id: 'team_statistics.channels.filterPrivate', defaultMessage: 'Private'}),
                    value: true,
                },
            },
        },
    });
    const [selectedChannel, setSelectedChannel] = useState<ChannelWithTeamData | null>(null);

    useEffect(() => {
        if (!currentTeamId) {
            return;
        }
        setLoading(true);

        // Includes private channels the current user hasn't joined — the server only
        // allows this for a team_admin/system_admin of this specific team.
        dispatch(searchAllChannels('', {team_ids: [currentTeamId]})).then((result) => {
            if ('data' in result && Array.isArray(result.data)) {
                setChannels(result.data);
            }
        }).finally(() => {
            setLoading(false);
        });
    }, [dispatch, currentTeamId]);

    const filteredChannels = useMemo(() => {
        const showPublic = filters.channels.values.public.value as boolean;
        const showPrivate = filters.channels.values.private.value as boolean;
        const lowerTerm = term.toLowerCase();

        return channels.filter((channel) => {
            if (channel.delete_at !== 0) {
                return false;
            }
            if (channel.type === 'O' && !showPublic) {
                return false;
            }
            if (channel.type === 'P' && !showPrivate) {
                return false;
            }
            if (term && !channel.display_name.toLowerCase().includes(lowerTerm)) {
                return false;
            }
            return true;
        });
    }, [channels, filters, term]);

    const pagedChannels = useMemo(() => {
        const startIndex = page * CHANNELS_PER_PAGE;
        return filteredChannels.slice(startIndex, startIndex + CHANNELS_PER_PAGE);
    }, [filteredChannels, page]);

    useEffect(() => {
        if (pagedChannels.length === 0) {
            return;
        }

        // Some private channels the current user isn't a member of can make the whole
        // batch request fail with a permission error. The action already catches that
        // internally and resolves with {error} instead of throwing, so a failed page
        // just leaves the member count column blank instead of breaking the tab.
        dispatch(fetchChannelsMemberCount(pagedChannels.map((channel) => channel.id)));
    }, [dispatch, pagedChannels]);

    const columns: Column[] = useMemo(() => [
        {
            name: formatMessage({id: 'team_statistics.channels.name', defaultMessage: 'Name'}),
            field: 'name',
            width: 3,
            fixed: true,
        },
        {
            name: formatMessage({id: 'team_statistics.channels.type', defaultMessage: 'Type'}),
            field: 'type',
        },
        {
            name: formatMessage({id: 'team_statistics.channels.members', defaultMessage: 'Members'}),
            field: 'members',
        },
    ], [formatMessage]);

    const rows: Row[] = useMemo(() => {
        const publicLabel = formatMessage({id: 'team_statistics.channels.filterPublic', defaultMessage: 'Public'});
        const privateLabel = formatMessage({id: 'team_statistics.channels.filterPrivate', defaultMessage: 'Private'});

        return pagedChannels.map((channel) => {
            const ChannelIcon = getChannelIconComponent(channel);
            const memberCount = memberCounts[channel.id];
            return {
                cells: {
                    id: channel.id,
                    name: (
                        <span className='team-statistics-channel-name'>
                            <ChannelIcon size={16}/>
                            {channel.display_name}
                        </span>
                    ),
                    type: channel.type === 'O' ? publicLabel : privateLabel,
                    members: memberCount === undefined ? '' : String(memberCount),
                },
                onClick: () => setSelectedChannel(channel),
            };
        });
    }, [pagedChannels, memberCounts, formatMessage]);

    const startCount = filteredChannels.length === 0 ? 0 : (page * CHANNELS_PER_PAGE) + 1;
    const endCount = Math.min((page + 1) * CHANNELS_PER_PAGE, filteredChannels.length);

    const handleExportCsv = () => {
        const publicLabel = formatMessage({id: 'team_statistics.channels.filterPublic', defaultMessage: 'Public'});
        const privateLabel = formatMessage({id: 'team_statistics.channels.filterPrivate', defaultMessage: 'Private'});

        downloadCsv(
            'canales.csv',
            [
                formatMessage({id: 'team_statistics.channels.name', defaultMessage: 'Name'}),
                formatMessage({id: 'team_statistics.channels.type', defaultMessage: 'Type'}),
                formatMessage({id: 'team_statistics.channels.members', defaultMessage: 'Members'}),
            ],
            filteredChannels.map((channel) => [
                channel.display_name,
                channel.type === 'O' ? publicLabel : privateLabel,
                memberCounts[channel.id] ?? '',
            ]),
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
                total={filteredChannels.length}
                nextPage={() => setPage((p) => p + 1)}
                previousPage={() => setPage((p) => Math.max(0, p - 1))}
                onSearch={(newTerm: string) => {
                    setTerm(newTerm);
                    setPage(0);
                }}
                term={term}
                filterProps={{
                    options: filters,
                    keys: ['channels'],
                    onFilter: (newFilters: FilterOptions) => {
                        setFilters(newFilters);
                        setPage(0);
                    },
                }}
                placeholderEmpty={(
                    <span>{formatMessage({id: 'team_statistics.channels.empty', defaultMessage: 'No channels found'})}</span>
                )}
                extraComponent={(
                    <button
                        type='button'
                        className='btn btn-tertiary btn-sm'
                        onClick={handleExportCsv}
                    >
                        {formatMessage({id: 'team_statistics.channels.exportCsv', defaultMessage: 'Export CSV'})}
                    </button>
                )}
            />
            {selectedChannel && (
                <ManageChannelModal
                    channel={selectedChannel}
                    onExited={() => setSelectedChannel(null)}
                />
            )}
        </>
    );
};

export default TeamChannelsTab;
