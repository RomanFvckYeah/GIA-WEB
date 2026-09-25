// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
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
import {getUsers} from 'mattermost-redux/selectors/entities/users';

import type {Column, Row} from 'components/admin_console/data_grid/data_grid';
import DataGrid from 'components/admin_console/data_grid/data_grid';

import {logSent, logResult} from './operational_tracking_debug';
import UserNameCell from './user_name_cell';

const PER_PAGE = 10;

type Props = {
    group: OperationalTrackingGroup;
    onExited: () => void;

    // Called after any change that affects the parent group list's member count (add/remove
    // member) or its contents (delete group) — lets the caller refresh its own table.
    onChanged: () => void;
};

const ManageOperationalTrackingGroupModal = ({group, onExited, onChanged}: Props) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const allUsersById = useSelector(getUsers);

    const [show, setShow] = useState(true);
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState<OperationalTrackingGroupMember[]>([]);
    const [orgMemberIds, setOrgMemberIds] = useState<string[]>([]);
    const [memberTerm, setMemberTerm] = useState('');
    const [memberPage, setMemberPage] = useState(0);
    const [eligibleTerm, setEligibleTerm] = useState('');
    const [eligiblePage, setEligiblePage] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const refresh = useCallback(() => {
        setLoading(true);
        logSent('getOperationalTrackingGroupMembers', {groupId: group.id});
        logSent('getTeamOrganizationMembers', {teamId: group.team_id});
        Promise.all([
            dispatch(getOperationalTrackingGroupMembers(group.id)),
            dispatch(getTeamOrganizationMembers(group.team_id)),
        ]).then(([membersResult, orgResult]) => {
            logResult('getOperationalTrackingGroupMembers', membersResult);
            logResult('getTeamOrganizationMembers', orgResult);
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
        setError(null);
        logSent('addOperationalTrackingGroupMember', {groupId: group.id, userId});
        const result = await dispatch(addOperationalTrackingGroupMember(group.id, userId));
        logResult('addOperationalTrackingGroupMember', result);
        if ('error' in result && result.error) {
            setError(result.error.message ?? formatMessage({id: 'team_statistics.operationalTracking.manage.addFailed', defaultMessage: 'Failed to add member'}));
            return;
        }
        refresh();
        onChanged();
    };

    const handleRemove = async (userId: string) => {
        setError(null);
        logSent('removeOperationalTrackingGroupMember', {groupId: group.id, userId});
        const result = await dispatch(removeOperationalTrackingGroupMember(group.id, userId));
        logResult('removeOperationalTrackingGroupMember', result);
        if ('error' in result && result.error) {
            setError(result.error.message ?? formatMessage({id: 'team_statistics.operationalTracking.manage.removeFailed', defaultMessage: 'Failed to remove member'}));
            return;
        }
        refresh();
        onChanged();
    };

    const handleDeleteGroup = async () => {
        setDeleting(true);
        setError(null);
        logSent('deleteOperationalTrackingGroup', {groupId: group.id});
        const result = await dispatch(deleteOperationalTrackingGroup(group.id));
        logResult('deleteOperationalTrackingGroup', result);
        setDeleting(false);
        if ('error' in result && result.error) {
            setError(result.error.message ?? formatMessage({id: 'team_statistics.operationalTracking.manage.deleteFailed', defaultMessage: 'Failed to delete group'}));
            return;
        }
        onChanged();
        doHide();
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
                    onClick={handleDeleteGroup}
                    disabled={deleting}
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
        </Modal>
    );
};

export default ManageOperationalTrackingGroupModal;
