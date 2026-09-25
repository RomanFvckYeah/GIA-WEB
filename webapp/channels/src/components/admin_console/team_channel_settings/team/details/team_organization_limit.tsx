// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage, defineMessage} from 'react-intl';

import AdminPanel from 'components/widgets/admin_console/admin_panel';

type Props = {
    organizationMemberLimit: number;
    onChange: (value: number) => void;
    isDisabled?: boolean;
}

export const TeamOrganizationLimit = ({organizationMemberLimit, onChange, isDisabled}: Props) => (
    <AdminPanel
        id='team_organization_limit'
        title={defineMessage({id: 'admin.team_settings.team_detail.organizationLimitTitle', defaultMessage: 'Organization Member Limit'})}
        subtitle={defineMessage({id: 'admin.team_settings.team_detail.organizationLimitDescription', defaultMessage: 'Maximum number of accounts that can be created for this team\'s organization from the "Create User" button in the team statistics panel. A system_admin can always exceed this from the System Console regardless of the limit.'})}
    >
        <div className='group-teams-and-channels'>
            <div className='group-teams-and-channels--body'>
                <div className='form-group'>
                    <label
                        className='control-label'
                        htmlFor='organizationMemberLimitInput'
                    >
                        <FormattedMessage
                            id='admin.team_settings.team_detail.organizationLimitLabel'
                            defaultMessage='Organization member limit'
                        />
                    </label>
                    <input
                        id='organizationMemberLimitInput'
                        type='number'
                        min={0}
                        value={organizationMemberLimit}
                        className='form-control'
                        disabled={isDisabled}
                        onChange={(e) => {
                            const value = parseInt(e.currentTarget.value, 10);
                            onChange(Number.isNaN(value) ? 0 : Math.max(0, value));
                        }}
                    />
                </div>
            </div>
        </div>
    </AdminPanel>
);
