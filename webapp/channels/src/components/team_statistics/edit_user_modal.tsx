// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {Modal} from 'react-bootstrap';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import type {UserProfile} from '@mattermost/types/users';

import {TeamTypes, UserTypes} from 'mattermost-redux/action_types';
import {getCustomProfileAttributeFields} from 'mattermost-redux/actions/general';
import {addPanicButtonOnlyUser, getPanicButtonOnlyUsers, removePanicButtonOnlyUser} from 'mattermost-redux/actions/panic_button_only_users';
import {getTeamOrganizationMembers} from 'mattermost-redux/actions/teams';
import {getCustomProfileAttributeValues, getUser as fetchUser, patchUser, saveCustomProfileAttribute, updateUserPassword} from 'mattermost-redux/actions/users';
import {getCustomProfileAttributes, getPasswordConfig, isCustomProfileAttributesEnabled} from 'mattermost-redux/selectors/entities/general';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUserId, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {isEmail} from 'mattermost-redux/utils/helpers';

import {openModal} from 'actions/views/modals';

// The raw (unconnected) component, not the default export from
// components/admin_console/reset_password_modal — that one is wrapped in connect() and
// its mapStateToProps unconditionally injects the real currentUserId, which would make
// "resetting your own row" show the self-service current-password flow no matter what we
// pass via dialogProps. This panel is an admin tool, so "Reset Password" should always
// be the admin-reset flow (new password only), even for that edge case.
import ResetPasswordModal from 'components/admin_console/reset_password_modal/reset_password_modal';
import SaveButton from 'components/save_button';
import Input from 'components/widgets/inputs/input/input';

import {ModalIdentifiers} from 'utils/constants';

import CustomAttributeFields from './custom_attribute_fields';

type Props = {
    user: UserProfile;
    onExited: () => void;

    // Called right after a successful save (not on cancel or a failed save) — lets the caller
    // refresh whatever list it built this modal's `user` from, since edits made here (e.g.
    // toggling "Panic Button Only", which removes real team membership server-side) can change
    // which list that user actually belongs in.
    onSaved?: () => void;
};

const EditUserModal = ({user, onExited, onSaved}: Props) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const passwordConfig = useSelector(getPasswordConfig);
    const currentUserId = useSelector(getCurrentUserId);
    const currentTeamId = useSelector(getCurrentTeamId);
    const canEditManaged = useSelector(isCurrentUserSystemAdmin);
    const customAttributesEnabled = useSelector(isCustomProfileAttributesEnabled);
    const customAttributeFields = useSelector(getCustomProfileAttributes);

    const [show, setShow] = useState(true);
    const [firstName, setFirstName] = useState(user.first_name);
    const [lastName, setLastName] = useState(user.last_name);
    const [username, setUsername] = useState(user.username);
    const [email, setEmail] = useState(user.email);
    const [position, setPosition] = useState(user.position);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [orgMemberIds, setOrgMemberIds] = useState<Set<string>>(new Set());
    const [cpaValues, setCpaValues] = useState<Record<string, string | string[]>>({});
    const [originalCpaValues, setOriginalCpaValues] = useState<Record<string, string | string[]>>({});
    const [panicButtonOnly, setPanicButtonOnly] = useState(false);
    const [originalPanicButtonOnly, setOriginalPanicButtonOnly] = useState(false);

    // The server permanently blocks editing/resetting the password of a system_admin
    // account unless the caller is also a system_admin (server/channels/api4/user.go) —
    // a team_admin using this panel never is, so this is disabled here rather than
    // letting every action fail with a generic permission error. A system_admin caller
    // (canEditManaged) is exempt from this, same as the server.
    const isTargetSystemAdmin = !canEditManaged && user.roles.includes('system_admin');

    // A system_admin marks (team, user) pairs as genuine organization members of the
    // current team; a team_admin can only edit users they share organization membership
    // with (see SessionHasPermissionToUserViaTeamAdmin, server/channels/app/authorization.go).
    // This restriction exists to scope team_admin, not the system_admin using this same
    // panel — a system_admin caller (canEditManaged) always passes it, same as the server's
    // own SessionHasPermissionToUserOrBot/PermissionManageSystem bypass.
    const isSameOrganization = canEditManaged || (orgMemberIds.has(user.id) && orgMemberIds.has(currentUserId));

    const fieldsDisabled = loading || isTargetSystemAdmin || !isSameOrganization;

    // The server requires your OWN current password to reset your OWN password
    // (server/channels/api4/user.go) — a real security measure, not a bug, so this isn't
    // bypassed. This panel is for managing other users' accounts; resetting your own
    // password belongs in Account Settings instead.
    const isOwnAccount = user.id === currentUserId;
    const resetPasswordDisabled = fieldsDisabled || isOwnAccount;

    useEffect(() => {
        // The list this modal is opened from shows a sanitized profile for anyone who
        // isn't a system_admin (server-side privacy sanitization) — email/full name come
        // back blank. Re-fetch the single user here; the server now returns the full
        // profile for a team_admin who's authorized to edit this specific user.
        dispatch(fetchUser(user.id)).then((result) => {
            if ('data' in result && result.data) {
                setFirstName(result.data.first_name);
                setLastName(result.data.last_name);
                setUsername(result.data.username);
                setEmail(result.data.email);
                setPosition(result.data.position);
            }
            setLoading(false);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatch, user.id]);

    useEffect(() => {
        dispatch(getTeamOrganizationMembers(currentTeamId)).then((result) => {
            if ('data' in result && result.data) {
                setOrgMemberIds(new Set(result.data));
            }
        });
    }, [dispatch, currentTeamId]);

    useEffect(() => {
        if (!customAttributesEnabled) {
            return;
        }
        if (customAttributeFields.length === 0) {
            dispatch(getCustomProfileAttributeFields());
        }
        dispatch(getCustomProfileAttributeValues(user.id)).then((result) => {
            if ('data' in result && result.data) {
                setCpaValues(result.data);
                setOriginalCpaValues(result.data);
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatch, user.id, customAttributesEnabled]);

    useEffect(() => {
        dispatch(getPanicButtonOnlyUsers()).then((result) => {
            if ('data' in result && result.data) {
                const isPanicButtonOnly = (result.data as string[]).includes(user.id);
                setPanicButtonOnly(isPanicButtonOnly);
                setOriginalPanicButtonOnly(isPanicButtonOnly);
            }
        });
    }, [dispatch, user.id]);

    const handleCpaValueChange = (fieldId: string, value: string | string[]) => {
        setCpaValues((prev) => ({...prev, [fieldId]: value}));
    };

    const doHide = () => {
        setShow(false);
    };

    const handleSave = async () => {
        if (fieldsDisabled) {
            return;
        }

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

        setSaving(true);
        setError(null);

        const updatedUser: UserProfile = {
            ...user,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            username: trimmedUsername,
            email: trimmedEmail,
            position: position.trim(),
        };

        const result = await dispatch(patchUser(updatedUser));

        if ('error' in result && result.error) {
            setSaving(false);
            setError(result.error.message ?? formatMessage({id: 'admin.user_item.userUpdateFailed', defaultMessage: 'Failed to update user'}));
            return;
        }

        // Only send fields whose value actually changed — an unchanged admin-managed field's
        // value would otherwise be flagged as "being updated" and rejected by the server for
        // a team_admin caller (app.custom_profile_attributes.property_field_is_managed.app_error).
        const changedCpaEntries = Object.entries(cpaValues).filter(([fieldId, value]) => {
            const original = originalCpaValues[fieldId] ?? '';
            return JSON.stringify(value) !== JSON.stringify(original);
        });

        for (const [fieldId, value] of changedCpaEntries) {
            // eslint-disable-next-line no-await-in-loop
            const cpaResult = await dispatch(saveCustomProfileAttribute(user.id, fieldId, value));
            if ('error' in cpaResult && cpaResult.error) {
                setSaving(false);
                setError(cpaResult.error.message ?? formatMessage({id: 'admin.user_item.userUpdateFailed', defaultMessage: 'Failed to update user'}));
                return;
            }
        }

        if (panicButtonOnly !== originalPanicButtonOnly) {
            const panicResult = panicButtonOnly ?
                await dispatch(addPanicButtonOnlyUser(user.id)) :
                await dispatch(removePanicButtonOnlyUser(user.id));
            if ('error' in panicResult && panicResult.error) {
                setSaving(false);
                setError(panicResult.error.message ?? formatMessage({id: 'admin.user_item.userUpdateFailed', defaultMessage: 'Failed to update user'}));
                return;
            }

            // The server just force-removed this user's real membership of every team they were
            // in (see App.MarkPanicButtonOnly) — but mattermost-redux's own team-members/profiles
            // reducers only ever MERGE what they're given, they never prune an entry that simply
            // stops showing up in a later fetch. Without this, re-fetching (below, via onSaved)
            // would keep showing this user as a real member of the current team forever, no
            // matter how many times the list is reloaded — only these exact action types (the
            // same ones the real "remove from team" flow dispatches) actually clear the cache.
            if (panicButtonOnly && currentTeamId) {
                dispatch({type: UserTypes.RECEIVED_PROFILE_NOT_IN_TEAM, data: {id: currentTeamId, user_id: user.id}});
                dispatch({type: TeamTypes.REMOVE_MEMBER_FROM_TEAM, data: {team_id: currentTeamId, user_id: user.id}});
            }
        }

        setSaving(false);
        onSaved?.();
        doHide();
    };

    let resetPasswordHint: string | undefined;
    if (isOwnAccount) {
        resetPasswordHint = formatMessage({id: 'team_statistics.users.edit.ownAccountResetHint', defaultMessage: 'To reset your own password, use Account Settings instead.'});
    } else if (!isSameOrganization) {
        resetPasswordHint = formatMessage({id: 'team_statistics.users.edit.notSameOrganizationHint', defaultMessage: 'This user does not share organization membership with you in this team and cannot be edited from this panel.'});
    }

    const handleResetPassword = () => {
        if (resetPasswordDisabled) {
            return;
        }
        dispatch(openModal({
            modalId: ModalIdentifiers.RESET_PASSWORD_MODAL,
            dialogType: ResetPasswordModal,
            dialogProps: {
                user,

                // Deliberately blank rather than the acting admin's real id: this panel
                // is an admin tool for managing other users' accounts, so "Reset
                // Password" should always be the admin-reset flow (new password only),
                // even on the rare case where the admin's own row is clicked — never the
                // self-service "confirm your current password" flow.
                currentUserId: '',
                passwordConfig,
                actions: {
                    updateUserPassword: (userId: string, currentPassword: string, password: string) => dispatch(updateUserPassword(userId, currentPassword, password)),
                },
            },
        }));
    };

    return (
        <Modal
            dialogClassName='a11y__modal team-statistics-modal team-statistics-edit-user-modal'
            show={show}
            onHide={doHide}
            onExited={onExited}
            role='dialog'
        >
            <Modal.Header closeButton={true}>
                <Modal.Title>
                    {user.username}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {isTargetSystemAdmin && (
                    <div className='team-statistics-edit-user-modal__hint'>
                        {formatMessage({id: 'team_statistics.users.edit.systemAdminHint', defaultMessage: 'System administrator accounts cannot be edited from this panel.'})}
                    </div>
                )}
                {!isTargetSystemAdmin && !isSameOrganization && (
                    <div className='team-statistics-edit-user-modal__hint'>
                        {formatMessage({id: 'team_statistics.users.edit.notSameOrganizationHint', defaultMessage: 'This user does not share organization membership with you in this team and cannot be edited from this panel.'})}
                    </div>
                )}
                {!isTargetSystemAdmin && isSameOrganization && isOwnAccount && (
                    <div className='team-statistics-edit-user-modal__hint'>
                        {formatMessage({id: 'team_statistics.users.edit.ownAccountResetHint', defaultMessage: 'To reset your own password, use Account Settings instead.'})}
                    </div>
                )}
                {error && (
                    <div className='team-statistics-edit-user-modal__error'>
                        {error}
                    </div>
                )}
                <div className='team-statistics-edit-user-modal__row'>
                    <Input
                        name='firstName'
                        label={formatMessage({id: 'team_statistics.users.edit.firstName', defaultMessage: 'First Name'})}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        disabled={fieldsDisabled}
                    />
                    <Input
                        name='lastName'
                        label={formatMessage({id: 'team_statistics.users.edit.lastName', defaultMessage: 'Last Name'})}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={fieldsDisabled}
                    />
                </div>
                <Input
                    name='username'
                    label={formatMessage({id: 'admin.userManagement.userDetail.username', defaultMessage: 'Username'})}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={fieldsDisabled}
                />
                <Input
                    name='email'
                    type='email'
                    label={formatMessage({id: 'admin.userManagement.userDetail.email', defaultMessage: 'Email'})}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={fieldsDisabled}
                />
                <Input
                    name='position'
                    label={formatMessage({id: 'team_statistics.users.edit.position', defaultMessage: 'Position'})}
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    disabled={fieldsDisabled}
                />
                {customAttributesEnabled && customAttributeFields.length > 0 && (
                    <CustomAttributeFields
                        fields={customAttributeFields}
                        values={cpaValues}
                        onChange={handleCpaValueChange}
                        disabled={fieldsDisabled}
                        canEditManaged={canEditManaged}
                    />
                )}
                <label className='team-statistics-edit-user-modal__checkbox'>
                    <input
                        type='checkbox'
                        checked={panicButtonOnly}
                        onChange={(e) => setPanicButtonOnly(e.target.checked)}
                        disabled={fieldsDisabled}
                    />
                    {formatMessage({id: 'team_statistics.users.create.panicButtonOnly', defaultMessage: 'Panic Button Only'})}
                </label>
                {panicButtonOnly && !originalPanicButtonOnly && (
                    <div className='team-statistics-edit-user-modal__hint'>
                        {formatMessage({id: 'team_statistics.users.create.panicButtonOnlyHint', defaultMessage: 'This account will not be added to this team or any channel — it will only be able to use the panic button in the mobile app.'})}
                    </div>
                )}
                {!panicButtonOnly && originalPanicButtonOnly && (
                    <div className='team-statistics-edit-user-modal__hint'>
                        {formatMessage({id: 'team_statistics.users.edit.panicButtonOnlyRemoveHint', defaultMessage: 'This account will become eligible to be added to a team again, but will not be added automatically.'})}
                    </div>
                )}
                <button
                    type='button'
                    className='btn btn-tertiary btn-sm team-statistics-edit-user-modal__resetPassword'
                    disabled={resetPasswordDisabled}
                    title={resetPasswordHint}
                    onClick={handleResetPassword}
                >
                    {formatMessage({id: 'admin.user_item.resetPwd', defaultMessage: 'Reset Password'})}
                </button>
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
                    disabled={fieldsDisabled}
                    onClick={handleSave}
                />
            </Modal.Footer>
        </Modal>
    );
};

export default EditUserModal;
