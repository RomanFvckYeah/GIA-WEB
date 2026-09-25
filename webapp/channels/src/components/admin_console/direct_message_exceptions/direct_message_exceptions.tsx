// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import type {DirectMessageException} from '@mattermost/client';
import type {UserProfile} from '@mattermost/types/users';

import {getProfilesByIds} from 'mattermost-redux/actions/users';
import {getUsers} from 'mattermost-redux/selectors/entities/users';

import AdminHeader from 'components/widgets/admin_console/admin_header';

import {
    addDirectMessageException,
    addGloballyDiscoverableUser,
    getDirectMessageExceptions,
    getGloballyDiscoverableUsers,
    removeDirectMessageException,
    removeGloballyDiscoverableUser,
} from 'mattermost-redux/actions/direct_message_exceptions';

import UserPicker from './user_picker';

import './direct_message_exceptions.scss';

type TabKey = 'pairs' | 'discoverable';

const DirectMessageExceptionsPage = () => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const profiles = useSelector(getUsers);

    const [activeTab, setActiveTab] = useState<TabKey>('pairs');

    const [exceptions, setExceptions] = useState<DirectMessageException[]>([]);
    const [exceptionsLoading, setExceptionsLoading] = useState(true);
    const [pendingUser1, setPendingUser1] = useState<UserProfile | null>(null);
    const [pendingUser2, setPendingUser2] = useState<UserProfile | null>(null);
    const [pairError, setPairError] = useState<string | null>(null);

    const [discoverableIds, setDiscoverableIds] = useState<string[]>([]);
    const [discoverableLoading, setDiscoverableLoading] = useState(true);

    const loadExceptions = useCallback(async () => {
        setExceptionsLoading(true);
        const {data} = await dispatch(getDirectMessageExceptions() as any) as {data?: DirectMessageException[]};
        const list = data || [];
        setExceptions(list);
        setExceptionsLoading(false);

        const ids = Array.from(new Set(list.flatMap((item) => [item.user_id_1, item.user_id_2])));
        if (ids.length) {
            dispatch(getProfilesByIds(ids) as any);
        }
    }, [dispatch]);

    const loadDiscoverable = useCallback(async () => {
        setDiscoverableLoading(true);
        const {data} = await dispatch(getGloballyDiscoverableUsers() as any) as {data?: string[]};
        const ids = data || [];
        setDiscoverableIds(ids);
        setDiscoverableLoading(false);

        if (ids.length) {
            dispatch(getProfilesByIds(ids) as any);
        }
    }, [dispatch]);

    useEffect(() => {
        loadExceptions();
        loadDiscoverable();
    }, [loadExceptions, loadDiscoverable]);

    const userLabel = (userId: string): string => {
        const user = profiles[userId];
        return user ? `${user.username}` : userId;
    };

    const handleAddPair = async () => {
        setPairError(null);
        if (!pendingUser1 || !pendingUser2) {
            return;
        }
        if (pendingUser1.id === pendingUser2.id) {
            setPairError(formatMessage({id: 'admin.direct_message_exceptions.self_pair_error', defaultMessage: 'Choose two different users.'}));
            return;
        }
        const {error} = await dispatch(addDirectMessageException(pendingUser1.id, pendingUser2.id) as any) as {error?: {message: string}};
        if (error) {
            setPairError(error.message);
            return;
        }
        setPendingUser1(null);
        setPendingUser2(null);
        loadExceptions();
    };

    const handleRemovePair = async (item: DirectMessageException) => {
        await dispatch(removeDirectMessageException(item.user_id_1, item.user_id_2) as any);
        loadExceptions();
    };

    const handleAddDiscoverable = async (user: UserProfile) => {
        await dispatch(addGloballyDiscoverableUser(user.id) as any);
        loadDiscoverable();
    };

    const handleRemoveDiscoverable = async (userId: string) => {
        await dispatch(removeGloballyDiscoverableUser(userId) as any);
        loadDiscoverable();
    };

    return (
        <div className='wrapper--fixed DirectMessageExceptions'>
            <AdminHeader>
                <FormattedMessage
                    id='admin.direct_message_exceptions.title'
                    defaultMessage='Direct Message Exceptions'
                />
            </AdminHeader>
            <div className='admin-console__wrapper'>
                <div className='admin-console__content'>
                    <div
                        className='DirectMessageExceptions__tabs'
                        role='tablist'
                    >
                        <button
                            type='button'
                            role='tab'
                            aria-selected={activeTab === 'pairs'}
                            className={'DirectMessageExceptions__tab' + (activeTab === 'pairs' ? ' active' : '')}
                            onClick={() => setActiveTab('pairs')}
                        >
                            <FormattedMessage
                                id='admin.direct_message_exceptions.tab_pairs'
                                defaultMessage='Cross-Team DM Pairs'
                            />
                        </button>
                        <button
                            type='button'
                            role='tab'
                            aria-selected={activeTab === 'discoverable'}
                            className={'DirectMessageExceptions__tab' + (activeTab === 'discoverable' ? ' active' : '')}
                            onClick={() => setActiveTab('discoverable')}
                        >
                            <FormattedMessage
                                id='admin.direct_message_exceptions.tab_discoverable'
                                defaultMessage='Globally Discoverable Users'
                            />
                        </button>
                    </div>

                    {activeTab === 'pairs' && (
                        <div className='DirectMessageExceptions__section'>
                            <p className='DirectMessageExceptions__description'>
                                <FormattedMessage
                                    id='admin.direct_message_exceptions.pairs_description'
                                    defaultMessage='Allow two specific users to send each other direct messages even if they do not share a team. This only applies when "Enable users to open Direct Message channels with" is set to "Any member of the team".'
                                />
                            </p>
                            <div className='DirectMessageExceptions__addRow'>
                                <UserPicker
                                    onSelect={setPendingUser1}
                                    excludeUserIds={pendingUser2 ? [pendingUser2.id] : []}
                                    placeholder={formatMessage({id: 'admin.direct_message_exceptions.user_a', defaultMessage: 'First user'})}
                                />
                                {pendingUser1 && <span className='DirectMessageExceptions__chip'>{'@' + pendingUser1.username}</span>}
                                <span className='DirectMessageExceptions__and'>
                                    <FormattedMessage
                                        id='admin.direct_message_exceptions.and'
                                        defaultMessage='and'
                                    />
                                </span>
                                <UserPicker
                                    onSelect={setPendingUser2}
                                    excludeUserIds={pendingUser1 ? [pendingUser1.id] : []}
                                    placeholder={formatMessage({id: 'admin.direct_message_exceptions.user_b', defaultMessage: 'Second user'})}
                                />
                                {pendingUser2 && <span className='DirectMessageExceptions__chip'>{'@' + pendingUser2.username}</span>}
                                <button
                                    type='button'
                                    className='btn btn-primary'
                                    disabled={!pendingUser1 || !pendingUser2}
                                    onClick={handleAddPair}
                                >
                                    <FormattedMessage
                                        id='admin.direct_message_exceptions.add_pair'
                                        defaultMessage='Add exception'
                                    />
                                </button>
                            </div>
                            {pairError && <div className='DirectMessageExceptions__error'>{pairError}</div>}

                            {exceptionsLoading && (
                                <div className='DirectMessageExceptions__empty'>
                                    <FormattedMessage
                                        id='admin.direct_message_exceptions.loading'
                                        defaultMessage='Loading…'
                                    />
                                </div>
                            )}
                            {!exceptionsLoading && exceptions.length === 0 && (
                                <div className='DirectMessageExceptions__empty'>
                                    <FormattedMessage
                                        id='admin.direct_message_exceptions.no_pairs'
                                        defaultMessage='No direct message exceptions configured yet.'
                                    />
                                </div>
                            )}
                            {!exceptionsLoading && exceptions.length > 0 && (
                                <ul className='DirectMessageExceptions__list'>
                                    {exceptions.map((item) => (
                                        <li key={`${item.user_id_1}:${item.user_id_2}`}>
                                            <span>{`@${userLabel(item.user_id_1)} ↔ @${userLabel(item.user_id_2)}`}</span>
                                            <button
                                                type='button'
                                                className='btn btn-tertiary btn-sm'
                                                onClick={() => handleRemovePair(item)}
                                            >
                                                <FormattedMessage
                                                    id='admin.direct_message_exceptions.remove'
                                                    defaultMessage='Remove'
                                                />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {activeTab === 'discoverable' && (
                        <div className='DirectMessageExceptions__section'>
                            <p className='DirectMessageExceptions__description'>
                                <FormattedMessage
                                    id='admin.direct_message_exceptions.discoverable_description'
                                    defaultMessage='Users marked here can be found in search and @mention results by members of every team, even when team-scoped visibility is restricted. This does not, by itself, allow them to receive direct messages from users outside their team.'
                                />
                            </p>
                            <div className='DirectMessageExceptions__addRow'>
                                <UserPicker
                                    onSelect={handleAddDiscoverable}
                                    excludeUserIds={discoverableIds}
                                    placeholder={formatMessage({id: 'admin.direct_message_exceptions.discoverable_add', defaultMessage: 'Add a user'})}
                                />
                            </div>

                            {discoverableLoading && (
                                <div className='DirectMessageExceptions__empty'>
                                    <FormattedMessage
                                        id='admin.direct_message_exceptions.loading'
                                        defaultMessage='Loading…'
                                    />
                                </div>
                            )}
                            {!discoverableLoading && discoverableIds.length === 0 && (
                                <div className='DirectMessageExceptions__empty'>
                                    <FormattedMessage
                                        id='admin.direct_message_exceptions.no_discoverable'
                                        defaultMessage='No globally discoverable users configured yet.'
                                    />
                                </div>
                            )}
                            {!discoverableLoading && discoverableIds.length > 0 && (
                                <ul className='DirectMessageExceptions__list'>
                                    {discoverableIds.map((userId) => (
                                        <li key={userId}>
                                            <span>{`@${userLabel(userId)}`}</span>
                                            <button
                                                type='button'
                                                className='btn btn-tertiary btn-sm'
                                                onClick={() => handleRemoveDiscoverable(userId)}
                                            >
                                                <FormattedMessage
                                                    id='admin.direct_message_exceptions.remove'
                                                    defaultMessage='Remove'
                                                />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DirectMessageExceptionsPage;
