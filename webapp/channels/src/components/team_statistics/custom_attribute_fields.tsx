// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import ReactSelect from 'react-select';

import type {UserPropertyField} from '@mattermost/types/properties';

import {getInputTypeFromValueType} from 'mattermost-redux/utils/helpers';

import Input from 'components/widgets/inputs/input/input';

type Props = {
    fields: UserPropertyField[];
    values: Record<string, string | string[]>;
    onChange: (fieldId: string, value: string | string[]) => void;
    disabled: boolean;

    // Only a system_admin may set/change a field marked "managed by admin" — a team_admin
    // gets a 403 from the server for those, so the input is disabled here to match
    // (server/channels/api4/custom_profile_attributes.go patchCPAValuesForUser).
    canEditManaged: boolean;
};

const sortFields = (fields: UserPropertyField[]) => {
    return [...fields].sort((a, b) => (a.attrs?.sort_order ?? 0) - (b.attrs?.sort_order ?? 0));
};

const CustomAttributeFields = ({fields, values, onChange, disabled, canEditManaged}: Props) => {
    const {formatMessage} = useIntl();

    return (
        <>
            {sortFields(fields).map((field) => {
                const isManaged = field.attrs?.managed === 'admin';
                const fieldDisabled = disabled || (isManaged && !canEditManaged);
                const value = values[field.id] ?? '';

                let control: React.ReactNode;
                if (field.type === 'select') {
                    const options = field.attrs?.options || [];
                    control = (
                        <label className='team-statistics-custom-attribute-field__select'>
                            {field.name}
                            <select
                                className='form-control'
                                value={Array.isArray(value) ? value[0] || '' : value}
                                onChange={(e) => onChange(field.id, e.target.value)}
                                disabled={fieldDisabled}
                            >
                                <option value=''>
                                    {formatMessage({id: 'team_statistics.users.customAttributes.selectOption', defaultMessage: 'Select an option'})}
                                </option>
                                {options.map((option) => (
                                    <option
                                        key={option.id}
                                        value={option.id}
                                    >
                                        {option.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    );
                } else if (field.type === 'multiselect') {
                    const options = field.attrs?.options || [];
                    const selectedValues = Array.isArray(value) ? value : [];
                    const selectOptions = options.map((option) => ({value: option.id, label: option.name}));
                    const selectedOptions = selectedValues.
                        map((id) => options.find((option) => option.id === id)).
                        filter((option): option is {id: string; name: string} => Boolean(option)).
                        map((option) => ({value: option.id, label: option.name}));

                    control = (
                        <label className='team-statistics-custom-attribute-field__select'>
                            {field.name}
                            <ReactSelect
                                isMulti={true}
                                options={selectOptions}
                                value={selectedOptions}
                                onChange={(selected) => onChange(field.id, selected ? selected.map((option) => option.value) : [])}
                                isDisabled={fieldDisabled}
                                isClearable={false}
                                placeholder={formatMessage({id: 'team_statistics.users.customAttributes.selectOptions', defaultMessage: 'Select options...'})}
                            />
                        </label>
                    );
                } else {
                    const inputType = getInputTypeFromValueType(field.attrs?.value_type);
                    control = (
                        <Input
                            name={`cpa-${field.id}`}
                            type={inputType === 'undefined' ? 'text' : inputType}
                            label={field.name}
                            value={Array.isArray(value) ? value.join(', ') : value}
                            onChange={(e) => onChange(field.id, e.target.value)}
                            disabled={fieldDisabled}
                        />
                    );
                }

                return (
                    <div
                        className='team-statistics-custom-attribute-field'
                        key={field.id}
                    >
                        {control}
                        {isManaged && !canEditManaged && (
                            <div className='team-statistics-custom-attribute-field__hint'>
                                {formatMessage({id: 'team_statistics.users.customAttributes.adminManagedHint', defaultMessage: 'Only a system administrator can edit this field.'})}
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
};

export default CustomAttributeFields;
