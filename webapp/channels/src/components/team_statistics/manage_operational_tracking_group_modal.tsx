// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Modal} from 'react-bootstrap';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import type {OperationalTrackingGroup, OperationalTrackingGroupMember} from '@mattermost/types/operational_tracking_groups';
import type {UserProfile} from '@mattermost/types/users';

import {
    addOperationalTrackingGroupMember,
    deleteOperationalTrackingGroup,
    getOperationalTrackingGroupMembers,
    removeOperationalTrackingGroupMember,
} from 'mattermost-redux/actions/operational_tracking_groups';
import {getTeamOrganizationMembers} from 'mattermost-redux/actions/teams';
import {getProfilesByIds} from 'mattermost-redux/actions/users';
import {getCurrentUserId, getUsers} from 'mattermost-redux/selectors/entities/users';

import type {Column, Row} from 'components/admin_console/data_grid/data_grid';
import DataGrid from 'components/admin_console/data_grid/data_grid';
import ConfirmModal from 'components/confirm_modal';

import EditOperationalTrackingGroupNameModal from './edit_operational_tracking_group_name_modal';
import {logSent, logResult} from './operational_tracking_debug';
import UserNameCell from './user_name_cell';

const PER_PAGE = 10;

type Props = {
    group: OperationalTrackingGroup;
    onExited: () => void;

    // Called (with +1/-1) right after a member is successfully added/removed, so the parent's
    // group list can update that group's member count without waiting on a refetch.
    onMemberCountChanged: (delta: number) => void;

    // Called right after the group is successfully deleted, so the parent can drop it from its
    // list without waiting on a refetch.
    onDeleted: () => void;

    // Called right after the group is successfully renamed, so the parent can update its list
    // without waiting on a refetch.
    onRenamed: (newName: string) => void;
};

const ManageOperationalTrackingGroupModal = ({group, onExited, onMemberCountChanged, onDeleted, onRenamed}: Props) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const allUsersById = useSelector(getUsers);
    const currentUserId = useSelector(getCurrentUserId);

    const [show, setShow] = useState(true);
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState<OperationalTrackingGroupMember[]>([]);
    const [orgMemberIds, setOrgMemberIds] = useState<string[]>([]);
    const [memberTerm, setMemberTerm] = useState('');
    const [memberPage, setMemberPage] = useState(0);
    const [eligibleTerm, setEligibleTerm] = useState('');
    const [eligiblePage, setEligiblePage] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showEditName, setShowEditName] = useState(false);
    const [pendingRemoveUserId, setPendingRemoveUserId] = useState<string | null>(null);

    // Guards against an earlier-issued-but-later-resolving refresh() call overwriting state that
    // a more recent refresh() call already applied.
    const refreshRequestIdRef = useRef(0);

    const refresh = useCallback(() => {
        const requestId = ++refreshRequestIdRef.current;
        setLoading(true);
        logSent('getOperationalTrackingGroupMembers', {groupId: group.id});
        logSent('getTeamOrganizationMembers', {teamId: group.team_id});
        Promise.all([
            dispatch(getOperationalTrackingGroupMembers(group.id)),
            dispatch(getTeamOrganizationMembers(group.team_id)),
        ]).then(([membersResult, orgResult]) => {
            logResult('getOperationalTrackingGroupMembers', membersResult);
            logResult('getTeamOrganizationMembers', orgResult);
            if (requestId !== refreshRequestIdRef.current) {
                return;
            }
            if ('data' in membersResult && membersResult.data) {
                const memberRows = membersResult.data as OperationalTrackingGroupMember[];
                setMembers(memberRows);
                dispatch(getProfilesByIds(memberRows.map((m) => m.user_id)));
                dispatch(getProfilesByIds(memberRows.map((m) => m.create_by)));
            }
            if ('data' in orgResult && orgResult.data) {
                const orgIds = orgResult.data as string[];
                setOrgMemberIds(orgIds);
                dispatch(getProfilesByIds(orgIds));
            }
            setLoading(false);
        });
    }, [dispatch, group.id, group.team_id]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const memberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);
    const memberByUserId = useMemo(() => {
        const map = new Map<string, OperationalTrackingGroupMember>();
        members.forEach((m) => map.set(m.user_id, m));
        return map;
    }, [members]);

    const memberUsers = useMemo(() => {
        return members.
            map((m) => allUsersById[m.user_id]).
            filter((user): user is UserProfile => Boolean(user)).
            sort((a, b) => a.username.localeCompare(b.username));
    }, [members, allUsersById]);

    const filteredMemberUsers = useMemo(() => {
        if (!memberTerm) {
            return memberUsers;
        }
        const lowerTerm = memberTerm.toLowerCase();
        return memberUsers.filter((user) => user.username.toLowerCase().includes(lowerTerm) || user.email.toLowerCase().includes(lowerTerm));
    }, [memberUsers, memberTerm]);

    const eligibleUsers = useMemo(() => {
        return orgMemberIds.
            filter((id) => !memberIds.has(id)).
            map((id) => allUsersById[id]).
            filter((user): user is UserProfile => Boolean(user)).
            sort((a, b) => a.username.localeCompare(b.username));
    }, [orgMemberIds, memberIds, allUsersById]);

    const filteredEligibleUsers = useMemo(() => {
        if (!eligibleTerm) {
            return eligibleUsers;
        }
        const lowerTerm = eligibleTerm.toLowerCase();
        return eligibleUsers.filter((user) => user.username.toLowerCase().includes(lowerTerm) || user.email.toLowerCase().includes(lowerTerm));
    }, [eligibleUsers, eligibleTerm]);

    const doHide = () => {
        setShow(false);
    };

    const handleAdd = async (userId: string) => {
        if (busy) {
            return;
        }
        setBusy(true);
        setError(null);
        logSent('addOperationalTrackingGroupMember', {groupId: group.id, userId});
        const result = await dispatch(addOperationalTrackingGroupMember(group.id, userId));
        logResult('addOperationalTrackingGroupMember', result);
        setBusy(false);
        if ('error' in result && result.error) {
            setError(result.error.message ?? formatMessage({id: 'team_statistics.operationalTracking.manage.addFailed', defaultMessage: 'Could not add the member — Covia did not confirm it, so nothing was saved.'}));
            return;
        }

        // Apply the change to local state directly instead of waiting on a refetch — the server
        // already told us it succeeded, so there's no reason the list should lag behind it.
        setMembers((prev) => (prev.some((m) => m.user_id === userId) ? prev : [
            ...prev,
            {group_id: group.id, user_id: userId, create_at: Date.now(), create_by: currentUserId},
        ]));
        onMemberCountChanged(1);
    };

    // Only ever called after the user confirms via the ConfirmModal below.
    const doRemove = async (userId: string) => {
        if (busy) {
            return;
        }
        setBusy(true);
        setError(null);
        logSent('removeOperationalTrackingGroupMember', {groupId: group.id, userId});
        const result = await dispatch(removeOperationalTrackingGroupMember(group.id, userId));
        logResult('removeOperationalTrackingGroupMember', result);
        setBusy(false);
        if ('error' in result && result.error) {
            setError(result.error.message ?? formatMessage({id: 'team_statistics.operationalTracking.manage.removeFailed', defaultMessage: 'Could not remove the member — Covia did not confirm it, so nothing was saved.'}));
            return;
        }

        // Apply the change to local state directly instead of waiting on a refetch — the server
        // already told us it succeeded, so there's no reason the list should lag behind it.
        setMembers((prev) => prev.filter((m) => m.user_id !== userId));
        onMemberCountChanged(-1);
    };

    const handleRemove = (userId: string) => {
        if (busy) {
            return;
        }
        setPendingRemoveUserId(userId);
    };

    // Only ever called after the user confirms via the ConfirmModal below.
    const doDeleteGroup = async () => {
        if (busy) {
            return;
        }
        setBusy(true);
        setError(null);
        logSent('deleteOperationalTrackingGroup', {groupId: group.id});
        const result = await dispatch(deleteOperationalTrackingGroup(group.id));
        logResult('deleteOperationalTrackingGroup', result);
        setBusy(false);
        if ('error' in result && result.error) {
            setError(result.error.message ?? formatMessage({id: 'team_statistics.operationalTracking.manage.deleteFailed', defaultMessage: 'Could not delete the group — Covia did not confirm it, so nothing was deleted.'}));
            return;
        }

        onDeleted();
        doHide();
    };

    const handleDeleteGroup = () => {
        if (busy) {
            return;
        }
        setShowDeleteConfirm(true);
    };

    const handleEditName = () => {
        if (busy) {
            return;
        }
        setShowEditName(true);
    };

    const memberColumns: Column[] = [
        {
            name: formatMessage({id: 'team_statistics.operationalTracking.manage.name', defaultMessage: 'Name'}),
            field: 'name',
            width: 3,
            fixed: true,
        },
        {
            name: formatMessage({id: 'team_statistics.operationalTracking.manage.addedBy', defaultMessage: 'Added by'}),
            field: 'addedBy',
        },
        {
            name: '',
            field: 'remove',
            textAlign: 'right',
            fixed: true,
        },
    ];

    const eligibleColumns: Column[] = [
        {
            name: formatMessage({id: 'team_statistics.operationalTracking.manage.name', defaultMessage: 'Name'}),
            field: 'name',
            width: 3,
            fixed: true,
        },
        {
            name: '',
            field: 'add',
            textAlign: 'right',
            fixed: true,
        },
    ];

    const pagedMemberUsers = filteredMemberUsers.slice(memberPage * PER_PAGE, (memberPage + 1) * PER_PAGE);
    const memberRows: Row[] = pagedMemberUsers.map((user) => {
        const addedBy = memberByUserId.get(user.id)?.create_by;
        const addedByUser = addedBy ? allUsersById[addedBy] : undefined;
        return {
            cells: {
                id: user.id,
                name: <UserNameCell user={user}/>,
                addedBy: addedByUser?.username ?? '',
                remove: (
                    <button
                        type='button'
                        className='style--none color--link'
                        onClick={() => handleRemove(user.id)}
                        disabled={busy}
                    >
                        {formatMessage({id: 'team_statistics.operationalTracking.manage.remove', defaultMessage: 'Remove'})}
                    </button>
                ),
            },
        };
    });

    const pagedEligibleUsers = filteredEligibleUsers.slice(eligiblePage * PER_PAGE, (eligiblePage + 1) * PER_PAGE);
    const eligibleRows: Row[] = pagedEligibleUsers.map((user) => ({
        cells: {
            id: user.id,
            name: <UserNameCell user={user}/>,
            add: (
                <button
                    type='button'
                    className='style--none color--link'
                    onClick={() => handleAdd(user.id)}
                    disabled={busy}
                >
                    {formatMessage({id: 'team_statistics.operationalTracking.manage.add', defaultMessage: 'Add'})}
                </button>
            ),
        },
    }));

    return (
        <Modal
            dialogClassName='a11y__modal team-statistics-modal modal-xl'
            show={show}
            onHide={doHide}
            onExited={onExited}
            role='dialog'
        >
            <Modal.Header closeButton={true}>
                <Modal.Title>
                    {group.name}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {error && (
                    <div className='team-statistics-edit-user-modal__error'>
                        {error}
                    </div>
                )}
                <h3 className='team-statistics-org-only-section__title'>
                    {formatMessage({id: 'team_statistics.operationalTracking.manage.membersTitle', defaultMessage: 'Current members'})}
                </h3>
                <DataGrid
                    className='customTable'
                    columns={memberColumns}
                    rows={memberRows}
                    loading={loading}
                    startCount={filteredMemberUsers.length === 0 ? 0 : (memberPage * PER_PAGE) + 1}
                    endCount={Math.min((memberPage + 1) * PER_PAGE, filteredMemberUsers.length)}
                    total={filteredMemberUsers.length}
                    nextPage={() => setMemberPage((p) => p + 1)}
                    previousPage={() => setMemberPage((p) => Math.max(0, p - 1))}
                    onSearch={(newTerm: string) => {
                        setMemberTerm(newTerm);
                        setMemberPage(0);
                    }}
                    term={memberTerm}
                    placeholderEmpty={(
                        <span>{formatMessage({id: 'team_statistics.operationalTracking.manage.noMembers', defaultMessage: 'No members yet'})}</span>
                    )}
                />

                <h3 className='team-statistics-org-only-section__title'>
                    {formatMessage({id: 'team_statistics.operationalTracking.manage.addTitle', defaultMessage: 'Add members'})}
                </h3>
                <p className='team-statistics-org-only-section__hint'>
                    {formatMessage({id: 'team_statistics.operationalTracking.manage.addHint', defaultMessage: 'Only members of this team\'s organization can be added to a group.'})}
                </p>
                <DataGrid
                    className='customTable'
                    columns={eligibleColumns}
                    rows={eligibleRows}
                    loading={loading}
                    startCount={filteredEligibleUsers.length === 0 ? 0 : (eligiblePage * PER_PAGE) + 1}
                    endCount={Math.min((eligiblePage + 1) * PER_PAGE, filteredEligibleUsers.length)}
                    total={filteredEligibleUsers.length}
                    nextPage={() => setEligiblePage((p) => p + 1)}
                    previousPage={() => setEligiblePage((p) => Math.max(0, p - 1))}
                    onSearch={(newTerm: string) => {
                        setEligibleTerm(newTerm);
                        setEligiblePage(0);
                    }}
                    term={eligibleTerm}
                    placeholderEmpty={(
                        <span>{formatMessage({id: 'team_statistics.operationalTracking.manage.noEligible', defaultMessage: 'No eligible users found'})}</span>
                    )}
                />
            </Modal.Body>
            <Modal.Footer className='team-statistics-edit-user-modal__footer'>
                <button
                    type='button'
                    className='btn btn-tertiary btn-sm'
                    onClick={handleEditName}
                    disabled={busy}
                >
                    {formatMessage({id: 'team_statistics.operationalTracking.manage.editName', defaultMessage: 'Edit name'})}
                </button>
                <button
                    type='button'
                    className='btn btn-tertiary btn-sm'
                    onClick={handleDeleteGroup}
                    disabled={busy}
                >
                    {formatMessage({id: 'team_statistics.operationalTracking.manage.deleteGroup', defaultMessage: 'Delete group'})}
                </button>
                <button
                    type='button'
                    className='btn btn-primary btn-sm'
                    onClick={doHide}
                >
                    {formatMessage({id: 'team_statistics.operationalTracking.manage.close', defaultMessage: 'Close'})}
                </button>
            </Modal.Footer>
            {showDeleteConfirm && (
                <ConfirmModal
                    show={true}
                    isStacked={true}
                    title={formatMessage({id: 'team_statistics.operationalTracking.manage.deleteConfirmTitle', defaultMessage: 'Delete group?'})}
                    message={formatMessage({id: 'team_statistics.operationalTracking.manage.deleteConfirmMessage', defaultMessage: 'This will also remove its members from Covia. This action cannot be undone.'})}
                    confirmButtonText={formatMessage({id: 'team_statistics.operationalTracking.manage.deleteGroup', defaultMessage: 'Delete group'})}
                    confirmButtonClass='btn btn-danger'
                    onConfirm={() => {
                        setShowDeleteConfirm(false);
                        doDeleteGroup();
                    }}
                    onCancel={() => setShowDeleteConfirm(false)}
                />
            )}
            {pendingRemoveUserId && (
                <ConfirmModal
                    show={true}
                    isStacked={true}
                    title={formatMessage({id: 'team_statistics.operationalTracking.manage.removeConfirmTitle', defaultMessage: 'Remove member?'})}
                    message={formatMessage({id: 'team_statistics.operationalTracking.manage.removeConfirmMessage', defaultMessage: 'This will also remove this user from the group in Covia.'})}
                    confirmButtonText={formatMessage({id: 'team_statistics.operationalTracking.manage.remove', defaultMessage: 'Remove'})}
                    confirmButtonClass='btn btn-danger'
                    onConfirm={() => {
                        const userId = pendingRemoveUserId;
                        setPendingRemoveUserId(null);
                        doRemove(userId);
                    }}
                    onCancel={() => setPendingRemoveUserId(null)}
                />
            )}
            {showEditName && (
                <EditOperationalTrackingGroupNameModal
                    group={group}
                    onExited={() => setShowEditName(false)}
                    onRenamed={onRenamed}
                />
            )}
        </Modal>
    );
};

export default ManageOperationalTrackingGroupModal;
