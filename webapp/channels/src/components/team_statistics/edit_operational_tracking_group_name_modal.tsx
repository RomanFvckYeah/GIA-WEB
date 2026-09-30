// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {Modal} from 'react-bootstrap';
import {useIntl} from 'react-intl';
import {useDispatch} from 'react-redux';

import type {OperationalTrackingGroup} from '@mattermost/types/operational_tracking_groups';

import {updateOperationalTrackingGroupName} from 'mattermost-redux/actions/operational_tracking_groups';

import SaveButton from 'components/save_button';
import Input from 'components/widgets/inputs/input/input';

import {logSent, logResult} from './operational_tracking_debug';

// Matches model.OperationalTrackingGroupNameMaxLength on the server — kept in sync manually since
// there's no shared constant between the two right now.
const NAME_MAX_LENGTH = 64;

type Props = {
    group: OperationalTrackingGroup;
    onExited: () => void;
    onRenamed: (newName: string) => void;
};

const EditOperationalTrackingGroupNameModal = ({group, onExited, onRenamed}: Props) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const [show, setShow] = useState(true);
    const [name, setName] = useState(group.name);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const doHide = () => {
        setShow(false);
    };

    const handleSave = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            setError(formatMessage({id: 'team_statistics.operationalTracking.editName.invalidName', defaultMessage: 'Name cannot be empty'}));
            return;
        }
        if (trimmedName.length > NAME_MAX_LENGTH) {
            setError(formatMessage({id: 'team_statistics.operationalTracking.editName.nameTooLong', defaultMessage: 'Name cannot be more than {limit} characters'}, {limit: NAME_MAX_LENGTH}));
            return;
        }

        setSaving(true);
        setError(null);

        logSent('updateOperationalTrackingGroupName', {groupId: group.id, name: trimmedName});
        const result = await dispatch(updateOperationalTrackingGroupName(group.id, trimmedName));
        logResult('updateOperationalTrackingGroupName', result);

        setSaving(false);

        if ('error' in result && result.error) {
            setError(result.error.message ?? formatMessage({id: 'team_statistics.operationalTracking.editName.failed', defaultMessage: 'Could not rename the group — Covia did not confirm the change, so nothing was saved.'}));
            return;
        }

        onRenamed(trimmedName);
        doHide();
    };

    return (
        <Modal
            dialogClassName='a11y__modal team-statistics-modal'
            show={show}
            onHide={doHide}
            onExited={onExited}
            role='dialog'
        >
            <Modal.Header closeButton={true}>
                <Modal.Title>
                    {formatMessage({id: 'team_statistics.operationalTracking.editName.title', defaultMessage: 'Edit Group Name'})}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {error && (
                    <div className='team-statistics-edit-user-modal__error'>
                        {error}
                    </div>
                )}
                <Input
                    name='name'
                    label={formatMessage({id: 'team_statistics.operationalTracking.editName.name', defaultMessage: 'Name'})}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={saving}
                    limit={NAME_MAX_LENGTH}
                />
            </Modal.Body>
            <Modal.Footer className='team-statistics-edit-user-modal__footer'>
                <button
                    type='button'
                    className='btn btn-tertiary btn-sm'
                    onClick={doHide}
                >
                    {formatMessage({id: 'admin.user_item.cancel', defaultMessage: 'Cancel'})}
                </button>
                <SaveButton
                    saving={saving}
                    disabled={saving}
                    onClick={handleSave}
                    defaultMessage={formatMessage({id: 'team_statistics.operationalTracking.editName.save', defaultMessage: 'Save'})}
                    savingMessage={formatMessage({id: 'team_statistics.operationalTracking.editName.saving', defaultMessage: 'Saving...'})}
                />
            </Modal.Footer>
        </Modal>
    );
};

export default EditOperationalTrackingGroupNameModal;
