// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Modal} from 'react-bootstrap';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import type {ChannelWithTeamData} from '@mattermost/types/channels';

import {
    getChannel as fetchChannel,
    getChannelStats,
    removeChannelMember,
    updateChannelMemberSchemeRoles,
    updateChannelPrivacy,
} from 'mattermost-redux/actions/channels';
import {getTeamOrganizationMembers} from 'mattermost-redux/actions/teams';
import {getAllChannelStats, getChannel, getChannelMembersInChannels} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/common';
import {makeGetProfilesInChannel, makeSearchProfilesInChannel} from 'mattermost-redux/selectors/entities/users';
import {isDefault as isDefaultChannel} from 'mattermost-redux/utils/channel_utils';

import {loadProfilesAndReloadChannelMembers, searchProfilesAndChannelMembers} from 'actions/user_actions';
import {openModal} from 'actions/views/modals';

import type {Column, Row} from 'components/admin_console/data_grid/data_grid';
import DataGrid from 'components/admin_console/data_grid/data_grid';
import type {BaseMembership} from 'components/admin_console/user_grid/user_grid_role_dropdown';
import UserGridRoleDropdown from 'components/admin_console/user_grid/user_grid_role_dropdown';
import ChannelInviteModal from 'components/channel_invite_modal';

import {getChannelIconComponent} from 'utils/channel_utils';
import Constants, {ModalIdentifiers} from 'utils/constants';

import type {GlobalState} from 'types/store';

import UserNameCell from './user_name_cell';

const EMPTY_MEMBERSHIPS = {};
const PER_PAGE = 10;

type Props = {
    channel: ChannelWithTeamData;
    onExited: () => void;
};

const ManageChannelModal = ({channel: initialChannel, onExited}: Props) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const [show, setShow] = useState(true);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [term, setTerm] = useState('');
    const [orgMemberIds, setOrgMemberIds] = useState<Set<string>>(new Set());

    const doGetProfilesInChannel = useMemo(() => makeGetProfilesInChannel(), []);
    const doSearchProfilesInChannel = useMemo(() => makeSearchProfilesInChannel(), []);

    const currentUserId = useSelector(getCurrentUserId);
    const channel = useSelector((state: GlobalState) => getChannel(state, initialChannel.id)) ?? initialChannel;
    const memberships = useSelector((state: GlobalState) => getChannelMembersInChannels(state)[channel.id]) ?? EMPTY_MEMBERSHIPS;
    const totalCount = useSelector((state: GlobalState) => getAllChannelStats(state)[channel.id]?.member_count) ?? 0;

    const members = useSelector((state: GlobalState) => (
        term ? doSearchProfilesInChannel(state, channel.id, term, false) : doGetProfilesInChannel(state, channel.id)
    ));

    useEffect(() => {
        setLoading(true);
        dispatch(getChannelStats(channel.id)).finally(() => setLoading(false));

        // The channel list this modal is opened from (searchAllChannels, team_admin path)
        // returns a sanitized channel — only id/team_id/type/display_name are populated,
        // so fields like `name` (needed to detect the Town Square default channel) are
        // always empty. Re-fetch the single channel here, which isn't sanitized.
        dispatch(fetchChannel(channel.id));
    }, [dispatch, channel.id]);

    useEffect(() => {
        dispatch(getTeamOrganizationMembers(channel.team_id)).then((result) => {
            if ('data' in result && result.data) {
                setOrgMemberIds(new Set(result.data));
            }
        });
    }, [dispatch, channel.team_id]);

    useEffect(() => {
        setPage(0);
    }, [channel.id, term]);

    const searchTimeoutId = useRef(0);

    useEffect(() => {
        setLoading(true);
        window.clearTimeout(searchTimeoutId.current);

        if (term) {
            searchTimeoutId.current = window.setTimeout(() => {
                dispatch(searchProfilesAndChannelMembers(term, {in_channel_id: channel.id})).finally(() => setLoading(false));
            }, Constants.SEARCH_TIMEOUT_MILLISECONDS);
            return;
        }

        dispatch(loadProfilesAndReloadChannelMembers(page, PER_PAGE, channel.id, '', {active: true})).finally(() => setLoading(false));

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatch, channel.id, page, term]);

    const doHide = () => {
        setShow(false);
    };

    const isDefault = isDefaultChannel(channel);

    const handleTogglePrivacy = () => {
        if (isDefault) {
            return;
        }
        const newType = channel.type === 'O' ? 'P' : 'O';
        dispatch(updateChannelPrivacy(channel.id, newType));
    };

    const handleAddMembers = () => {
        dispatch(openModal({
            modalId: ModalIdentifiers.CHANNEL_INVITE,
            dialogType: ChannelInviteModal,

            // channelId/teamId make the invite modal look up "who's not in this
            // channel" against the channel being managed here, instead of whatever
            // channel the admin happens to have open elsewhere in the app — otherwise
            // the admin can never find themselves in the results if they're not a
            // member of the channel they have open.
            dialogProps: {channel, channelId: channel.id, teamId: channel.team_id},
        }));
    };

    const handleRemove = (userId: string, canRemove: boolean) => {
        if (!canRemove) {
            return;
        }
        dispatch(removeChannelMember(channel.id, userId));
    };

    const handleUpdateMembership = (membership: BaseMembership) => {
        dispatch(updateChannelMemberSchemeRoles(channel.id, membership.user_id, membership.scheme_user, membership.scheme_admin));
    };

    const columns: Column[] = [
        {
            name: formatMessage({id: 'team_statistics.channels.manage.name', defaultMessage: 'Name'}),
            field: 'name',
            width: 3,
            fixed: true,
        },
        {
            name: formatMessage({id: 'team_statistics.channels.manage.role', defaultMessage: 'Role'}),
            field: 'role',
            overflow: 'visible',
        },
        {
            name: '',
            field: 'remove',
            textAlign: 'right',
            fixed: true,
        },
    ];

    // members accumulates every page fetched so far for this channel (the redux store
    // merges each loadProfilesAndReloadChannelMembers page into the same normalized
    // bucket), so the current page window still needs to be sliced out client-side —
    // same mechanism UserGrid itself uses internally.
    const pagedMembers = useMemo(
        () => members.slice(page * PER_PAGE, (page + 1) * PER_PAGE),
        [members, page],
    );

    const defaultChannelHint = formatMessage({
        id: 'team_statistics.channels.manage.defaultChannelHint',
        defaultMessage: 'This is the team\'s default channel: it cannot be converted to private, and members (other than guests) cannot be removed from it.',
    });

    const notSameOrganizationHint = formatMessage({
        id: 'team_statistics.channels.manage.notSameOrganizationHint',
        defaultMessage: 'This user does not share organization membership with you in this team and cannot be removed.',
    });

    const rows: Row[] = pagedMembers.map((user) => {
        const membership = memberships[user.id];

        // The server permanently blocks removing non-guest members from the default
        // channel (server/channels/app/channel.go, removeUserFromChannel) regardless of
        // the caller's permissions — guests are the one exception.
        const isDefaultBlocked = isDefault && !user.roles.includes('guest');
        const isSameOrganization = orgMemberIds.has(user.id) && orgMemberIds.has(currentUserId);
        const canRemove = !isDefaultBlocked && isSameOrganization;

        let removeHint: string | undefined;
        if (isDefaultBlocked) {
            removeHint = defaultChannelHint;
        } else if (!isSameOrganization) {
            removeHint = notSameOrganizationHint;
        }

        return {
            cells: {
                id: user.id,
                name: <UserNameCell user={user}/>,
                role: membership ? (
                    <UserGridRoleDropdown
                        user={user}
                        membership={membership}
                        scope='channel'
                        handleUpdateMembership={handleUpdateMembership}
                    />
                ) : null,
                remove: (
                    <button
                        type='button'
                        className='style--none color--link'
                        onClick={() => handleRemove(user.id, canRemove)}
                        disabled={!canRemove}
                        title={removeHint}
                    >
                        {formatMessage({id: 'team_statistics.channels.manage.remove', defaultMessage: 'Remove'})}
                    </button>
                ),
            },
        };
    });

    const ChannelIcon = getChannelIconComponent(channel);

    return (
        <Modal
            dialogClassName='a11y__modal team-statistics-modal team-statistics-manage-channel-modal modal-xl'
            show={show}
            onHide={doHide}
            onExited={onExited}
            role='dialog'
        >
            <Modal.Header closeButton={true}>
                <Modal.Title>
                    <ChannelIcon
                        size={20}
                        className='team-statistics-manage-channel-modal__icon'
                    />
                    {channel.display_name}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {isDefault && (
                    <p className='team-statistics-manage-channel-modal__hint'>
                        {defaultChannelHint}
                    </p>
                )}
                <div className='team-statistics-manage-channel-modal__toolbar'>
                    <button
                        type='button'
                        className={classNames('btn btn-tertiary btn-sm')}
                        onClick={handleTogglePrivacy}
                        disabled={isDefault}
                        title={isDefault ? formatMessage({id: 'admin.channel_settings.channel_details.isDefaultDescr', defaultMessage: 'This default channel cannot be converted into a private channel.'}) : undefined}
                    >
                        {channel.type === 'O' ? formatMessage({id: 'team_statistics.channels.manage.makePrivate', defaultMessage: 'Make Private'}) : formatMessage({id: 'team_statistics.channels.manage.makePublic', defaultMessage: 'Make Public'})}
                    </button>
                    <button
                        type='button'
                        className='btn btn-primary btn-sm'
                        onClick={handleAddMembers}
                    >
                        {formatMessage({id: 'team_statistics.channels.manage.addMembers', defaultMessage: 'Add Members'})}
                    </button>
                </div>
                <DataGrid
                    className='customTable'
                    columns={columns}
                    rows={rows}
                    loading={loading}
                    startCount={rows.length === 0 ? 0 : (page * PER_PAGE) + 1}
                    endCount={(page * PER_PAGE) + rows.length}
                    total={totalCount}
                    nextPage={() => setPage((p) => p + 1)}
                    previousPage={() => setPage((p) => Math.max(0, p - 1))}
                    onSearch={(newTerm: string) => setTerm(newTerm)}
                    term={term}
                    placeholderEmpty={(
                        <span>{formatMessage({id: 'team_statistics.channels.manage.empty', defaultMessage: 'No members found'})}</span>
                    )}
                />
            </Modal.Body>
        </Modal>
    );
};

export default ManageChannelModal;
