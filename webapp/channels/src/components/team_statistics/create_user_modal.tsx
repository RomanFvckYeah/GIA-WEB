// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {Modal} from 'react-bootstrap';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import type {UserProfile} from '@mattermost/types/users';

import {getCustomProfileAttributeFields} from 'mattermost-redux/actions/general';
import {createTeamMember} from 'mattermost-redux/actions/teams';
import {getCustomProfileAttributes, getPasswordConfig, isCustomProfileAttributesEnabled} from 'mattermost-redux/selectors/entities/general';
import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {isEmail} from 'mattermost-redux/utils/helpers';

import SaveButton from 'components/save_button';
import Input from 'components/widgets/inputs/input/input';

import {generatePassword, isValidPassword} from 'utils/password';

import CustomAttributeFields from './custom_attribute_fields';

type Props = {
    teamId: string;
    onExited: () => void;
    onCreated: () => void;
};

const CreateUserModal = ({teamId, onExited, onCreated}: Props) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const passwordConfig = useSelector(getPasswordConfig);
    const canEditManaged = useSelector(isCurrentUserSystemAdmin);
    const customAttributesEnabled = useSelector(isCustomProfileAttributesEnabled);
    const customAttributeFields = useSelector(getCustomProfileAttributes);

    const [show, setShow] = useState(true);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(true);
    const [position, setPosition] = useState('');
    const [sendCredentials, setSendCredentials] = useState(true);
    const [copied, setCopied] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [cpaValues, setCpaValues] = useState<Record<string, string | string[]>>({});
    const [panicButtonOnly, setPanicButtonOnly] = useState(false);

    useEffect(() => {
        if (customAttributesEnabled && customAttributeFields.length === 0) {
            dispatch(getCustomProfileAttributeFields());
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatch, customAttributesEnabled]);

    const handleCpaValueChange = (fieldId: string, value: string | string[]) => {
        setCpaValues((prev) => ({...prev, [fieldId]: value}));
    };

    const doHide = () => {
        setShow(false);
    };

    const handleGeneratePassword = () => {
        setPassword(generatePassword(passwordConfig));
        setShowPassword(true);
        setCopied(false);
    };

    const handleCopyPassword = () => {
        if (!navigator.clipboard) {
            return;
        }
        navigator.clipboard.writeText(password).then(() => {
            setCopied(true);
        }, () => {
            // ignore clipboard errors — the password is visible for manual copy
        });
    };

    const handleSave = async () => {
        const trimmedUsername = username.trim();
        const trimmedEmail = email.trim();

        if (!trimmedUsername) {
            setError(formatMessage({id: 'admin.user_item.invalidUsername', defaultMessage: 'Username cannot be empty'}));
            return;
        }
        if (!isEmail(trimmedEmail)) {
            setError(formatMessage({id: 'admin.user_item.invalidEmail', defaultMessage: 'Invalid email address'}));
            return;
        }
        if (!password) {
            setError(formatMessage({id: 'team_statistics.users.create.invalidPassword', defaultMessage: 'Password cannot be empty'}));
            return;
        }
        const passwordCheck = isValidPassword(password, passwordConfig);
        if (!passwordCheck.valid) {
            setError(passwordCheck.error as string);
            return;
        }

        setSaving(true);
        setError(null);

        // Only send fields the admin actually filled in — an empty value for a select/
        // multiselect field isn't a meaningful choice, and an unset text field should just
        // stay unset rather than being created with an empty string value.
        const customProfileAttributes: Record<string, string | string[]> = {};
        for (const [fieldId, value] of Object.entries(cpaValues)) {
            if (Array.isArray(value) ? value.length > 0 : value.trim() !== '') {
                customProfileAttributes[fieldId] = value;
            }
        }

        const newUser = {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            username: trimmedUsername,
            email: trimmedEmail,
            password,
            position: position.trim(),
            custom_profile_attributes: customProfileAttributes,
            panic_button_only: panicButtonOnly,
        } as unknown as UserProfile;

        const result = await dispatch(createTeamMember(teamId, newUser, {sendCredentials}));

        setSaving(false);

        if ('error' in result && result.error) {
            setError(result.error.message ?? formatMessage({id: 'team_statistics.users.create.userCreateFailed', defaultMessage: 'Failed to create user'}));
            return;
        }

        onCreated();

        if (sendCredentials) {
            setSuccess(formatMessage({id: 'team_statistics.users.create.credentialsSent', defaultMessage: 'An email with the sign-in credentials was sent to {email}.'}, {email: trimmedEmail}));
            return;
        }

        doHide();
    };

    return (
        <Modal
            dialogClassName='a11y__modal team-statistics-modal team-statistics-create-user-modal'
            show={show}
            onHide={doHide}
            onExited={onExited}
            role='dialog'
        >
            <Modal.Header closeButton={true}>
                <Modal.Title>
                    {formatMessage({id: 'team_statistics.users.create.title', defaultMessage: 'Create User'})}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <div className='team-statistics-create-user-modal__hint'>
                    {formatMessage({id: 'team_statistics.users.create.orgMemberHint', defaultMessage: 'This user will be added to this team and automatically marked as a member of its organization.'})}
                </div>
                {error && (
                    <div className='team-statistics-create-user-modal__error'>
                        {error}
                    </div>
                )}
                {success && (
                    <div className='team-statistics-create-user-modal__success'>
                        {success}
                    </div>
                )}
                {success ? (
                    <div className='team-statistics-create-user-modal__summary'>
                        <span>{formatMessage({id: 'team_statistics.users.create.password', defaultMessage: 'Password'})}</span>
                        <code>{password}</code>
                    </div>
                ) : (
                    <>
                        <div className='team-statistics-create-user-modal__row'>
                            <Input
                                name='firstName'
                                label={formatMessage({id: 'team_statistics.users.edit.firstName', defaultMessage: 'First Name'})}
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                disabled={saving}
                            />
                            <Input
                                name='lastName'
                                label={formatMessage({id: 'team_statistics.users.edit.lastName', defaultMessage: 'Last Name'})}
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                disabled={saving}
                            />
                        </div>
                        <Input
                            name='username'
                            label={formatMessage({id: 'admin.userManagement.userDetail.username', defaultMessage: 'Username'})}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            disabled={saving}
                        />
                        <Input
                            name='email'
                            type='email'
                            label={formatMessage({id: 'admin.userManagement.userDetail.email', defaultMessage: 'Email'})}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={saving}
                        />
                        <Input
                            name='password'
                            type={showPassword ? 'text' : 'password'}
                            label={formatMessage({id: 'team_statistics.users.create.password', defaultMessage: 'Password'})}
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setCopied(false);
                            }}
                            disabled={saving}
                        />
                        <div className='team-statistics-create-user-modal__password-actions'>
                            <button
                                type='button'
                                className='btn btn-tertiary btn-sm'
                                onClick={handleGeneratePassword}
                                disabled={saving}
                            >
                                {formatMessage({id: 'team_statistics.users.create.generatePassword', defaultMessage: 'Generate'})}
                            </button>
                            <button
                                type='button'
                                className='btn btn-tertiary btn-sm'
                                onClick={() => setShowPassword((v) => !v)}
                                disabled={saving}
                            >
                                {showPassword ? formatMessage({id: 'team_statistics.users.create.hidePassword', defaultMessage: 'Hide'}) : formatMessage({id: 'team_statistics.users.create.showPassword', defaultMessage: 'Show'})}
                            </button>
                            <button
                                type='button'
                                className='btn btn-tertiary btn-sm'
                                onClick={handleCopyPassword}
                                disabled={saving || !password}
                            >
                                {copied ? formatMessage({id: 'team_statistics.users.create.copied', defaultMessage: 'Copied'}) : formatMessage({id: 'team_statistics.users.create.copyPassword', defaultMessage: 'Copy'})}
                            </button>
                        </div>
                        <Input
                            name='position'
                            label={formatMessage({id: 'team_statistics.users.edit.position', defaultMessage: 'Position'})}
                            value={position}
                            onChange={(e) => setPosition(e.target.value)}
                            disabled={saving}
                        />
                        {customAttributesEnabled && customAttributeFields.length > 0 && (
                            <CustomAttributeFields
                                fields={customAttributeFields}
                                values={cpaValues}
                                onChange={handleCpaValueChange}
                                disabled={saving}
                                canEditManaged={canEditManaged}
                            />
                        )}
                        <label className='team-statistics-create-user-modal__checkbox'>
                            <input
                                type='checkbox'
                                checked={sendCredentials}
                                onChange={(e) => setSendCredentials(e.target.checked)}
                                disabled={saving}
                            />
                            {formatMessage({id: 'team_statistics.users.create.sendCredentials', defaultMessage: 'Email the sign-in credentials to the new user'})}
                        </label>
                        <label className='team-statistics-create-user-modal__checkbox'>
                            <input
                                type='checkbox'
                                checked={panicButtonOnly}
                                onChange={(e) => setPanicButtonOnly(e.target.checked)}
                                disabled={saving}
                            />
                            {formatMessage({id: 'team_statistics.users.create.panicButtonOnly', defaultMessage: 'Panic Button Only'})}
                        </label>
                        {panicButtonOnly && (
                            <div className='team-statistics-create-user-modal__hint'>
                                {formatMessage({id: 'team_statistics.users.create.panicButtonOnlyHint', defaultMessage: 'This account will not be added to this team or any channel — it will only be able to use the panic button in the mobile app.'})}
                            </div>
                        )}
                    </>
                )}
            </Modal.Body>
            <Modal.Footer className='team-statistics-create-user-modal__footer'>
                {success ? (
                    <button
                        type='button'
                        className='btn btn-primary btn-sm'
                        onClick={doHide}
                    >
                        {formatMessage({id: 'team_statistics.users.create.done', defaultMessage: 'Done'})}
                    </button>
                ) : (
                    <>
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
                            defaultMessage={formatMessage({id: 'team_statistics.users.create.create', defaultMessage: 'Create'})}
                            savingMessage={formatMessage({id: 'team_statistics.users.create.creating', defaultMessage: 'Creating...'})}
                        />
                    </>
                )}
            </Modal.Footer>
        </Modal>
    );
};

export default CreateUserModal;
