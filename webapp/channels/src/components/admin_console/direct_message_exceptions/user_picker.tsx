// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch} from 'react-redux';

import type {UserProfile} from '@mattermost/types/users';

import {searchProfiles} from 'mattermost-redux/actions/users';

import {displayEntireNameForUser} from 'utils/utils';

const SEARCH_DEBOUNCE_MS = 200;

type Props = {
    onSelect: (user: UserProfile) => void;
    excludeUserIds?: string[];
    placeholder?: string;
};

const UserPicker = ({onSelect, excludeUserIds, placeholder}: Props) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const [term, setTerm] = useState('');
    const [results, setResults] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

    const runSearch = async (value: string) => {
        if (!value) {
            setResults([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        const {data} = await dispatch(searchProfiles(value, {allow_inactive: false}) as any) as {data?: UserProfile[]};
        const filtered = (data || []).filter((user) => !excludeUserIds || !excludeUserIds.includes(user.id));
        setResults(filtered);
        setLoading(false);
    };

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setTerm(value);
        setOpen(true);

        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        setDebounceTimer(setTimeout(() => runSearch(value), SEARCH_DEBOUNCE_MS));
    };

    const handleSelect = (user: UserProfile) => {
        onSelect(user);
        setTerm('');
        setResults([]);
        setOpen(false);
    };

    return (
        <div className='DirectMessageExceptions__userPicker'>
            <input
                type='text'
                className='form-control'
                value={term}
                onChange={handleChange}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder={placeholder || formatMessage({id: 'admin.direct_message_exceptions.search_placeholder', defaultMessage: 'Search for a user by name or email'})}
            />
            {open && term && (
                <div className='DirectMessageExceptions__userPicker-results'>
                    {loading && (
                        <div className='DirectMessageExceptions__userPicker-empty'>
                            {formatMessage({id: 'admin.direct_message_exceptions.searching', defaultMessage: 'Searching…'})}
                        </div>
                    )}
                    {!loading && results.length === 0 && (
                        <div className='DirectMessageExceptions__userPicker-empty'>
                            {formatMessage({id: 'admin.direct_message_exceptions.no_results', defaultMessage: 'No users found'})}
                        </div>
                    )}
                    {!loading && results.map((user) => (
                        <div
                            key={user.id}
                            className='DirectMessageExceptions__userPicker-row'
                            onMouseDown={() => handleSelect(user)}
                        >
                            <span className='DirectMessageExceptions__userPicker-name'>{displayEntireNameForUser(user)}</span>
                            <span className='DirectMessageExceptions__userPicker-username'>{'@' + user.username}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default UserPicker;
