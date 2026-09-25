// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {Modal} from 'react-bootstrap';
import {useIntl} from 'react-intl';
import {useDispatch} from 'react-redux';

import {createOperationalTrackingGroup} from 'mattermost-redux/actions/operational_tracking_groups';

import SaveButton from 'components/save_button';
import Input from 'components/widgets/inputs/input/input';

import {logSent, logResult} from './operational_tracking_debug';

type Props = {
    teamId: string;
    onExited: () => void;
    onCreated: () => void;
};

const CreateOperationalTrackingGroupModal = ({teamId, onExited, onCreated}: Props) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const [show, setShow] = useState(true);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const doHide = () => {
        setShow(false);
    };

    const handleSave = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            setError(formatMessage({id: 'team_statistics.operationalTracking.create.invalidName', defaultMessage: 'Name cannot be empty'}));
            return;
        }

        setSaving(true);
        setError(null);

        logSent('createOperationalTrackingGroup', {teamId, name: trimmedName});
        const result = await dispatch(createOperationalTrackingGroup(teamId, trimmedName));
        logResult('createOperationalTrackingGroup', result);

        setSaving(false);

        if ('error' in result && result.error) {
            setError(result.error.message ?? formatMessage({id: 'team_statistics.operationalTracking.create.failed', defaultMessage: 'Failed to create group'}));
            return;
        }

        onCreated();
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
                    {formatMessage({id: 'team_statistics.operationalTracking.create.title', defaultMessage: 'Create Group'})}
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
                    label={formatMessage({id: 'team_statistics.operationalTracking.create.name', defaultMessage: 'Name'})}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={saving}
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
                    defaultMessage={formatMessage({id: 'team_statistics.operationalTracking.create.create', defaultMessage: 'Create'})}
                    savingMessage={formatMessage({id: 'team_statistics.operationalTracking.create.creating', defaultMessage: 'Creating...'})}
                />
            </Modal.Footer>
        </Modal>
    );
};

export default CreateOperationalTrackingGroupModal;
