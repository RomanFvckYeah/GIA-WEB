// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useSelector} from 'react-redux';

import type {UserProfile} from '@mattermost/types/users';

import {Client4} from 'mattermost-redux/client';
import {getStatusForUserId} from 'mattermost-redux/selectors/entities/users';

import ProfilePicture from 'components/profile_picture';

import type {GlobalState} from 'types/store';

const UserNameCell = ({user}: {user: UserProfile}) => {
    const status = useSelector((state: GlobalState) => getStatusForUserId(state, user.id));

    return (
        <div className='team-statistics-user-name'>
            <ProfilePicture
                src={Client4.getProfilePictureUrl(user.id, user.last_picture_update)}
                status={status}
                size='sm'
                userId={user.id}
            />
            <span>{user.username}</span>
        </div>
    );
};

export default UserNameCell;
