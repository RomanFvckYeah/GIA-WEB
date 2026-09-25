// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {PureComponent} from 'react';
import {FormattedMessage} from 'react-intl';

import Setting from './setting';

import './welcome_faq_setting.scss';

// Matches the server model.WelcomeFaqItem (Go field names, no json tags).
type FaqItem = {
    Label: string;
    Answer: string;
    Keywords: string;
};

type Props = {
    id: string;
    value?: Array<Partial<FaqItem>> | null;
    onChange: (id: string, value: FaqItem[]) => void;
    disabled: boolean;
    setByEnv: boolean;
};

type State = {
    items: FaqItem[];
};

function normalize(value?: Array<Partial<FaqItem>> | null): FaqItem[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((it) => ({
        Label: typeof it?.Label === 'string' ? it.Label : '',
        Answer: typeof it?.Answer === 'string' ? it.Answer : '',
        Keywords: typeof it?.Keywords === 'string' ? it.Keywords : '',
    }));
}

export default class WelcomeFaqSetting extends PureComponent<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {items: normalize(props.value)};
    }

    private commit(items: FaqItem[]) {
        this.setState({items});
        this.props.onChange(this.props.id, items);
    }

    private handleField(index: number, field: keyof FaqItem, fieldValue: string) {
        const items = this.state.items.map((item, i) => (i === index ? {...item, [field]: fieldValue} : item));
        this.commit(items);
    }

    private handleAdd = () => {
        this.commit([...this.state.items, {Label: '', Answer: '', Keywords: ''}]);
    };

    private handleRemove(index: number) {
        this.commit(this.state.items.filter((_, i) => i !== index));
    }

    private handleMove(index: number, delta: number) {
        const target = index + delta;
        if (target < 0 || target >= this.state.items.length) {
            return;
        }
        const items = [...this.state.items];
        [items[index], items[target]] = [items[target], items[index]];
        this.commit(items);
    }

    render() {
        const {disabled, setByEnv} = this.props;
        const readOnly = disabled || setByEnv;

        return (
            <Setting
                label={
                    <FormattedMessage
                        id='admin.customization.welcomeFaq.itemsTitle'
                        defaultMessage='Welcome Menu Options:'
                    />
                }
                helpText={
                    <FormattedMessage
                        id='admin.customization.welcomeFaq.itemsDesc'
                        defaultMessage='Each option becomes a button in the System Bot welcome menu. The Answer (Markdown) is what the bot replies with. Keywords (comma-separated) are matched against free-text messages the user sends to the bot.'
                    />
                }
                inputId={this.props.id}
                setByEnv={setByEnv}
            >
                <div className='WelcomeFaqSetting'>
                    {this.state.items.length === 0 && (
                        <div className='WelcomeFaqSetting__empty'>
                            <FormattedMessage
                                id='admin.customization.welcomeFaq.empty'
                                defaultMessage='No options yet. Add one below.'
                            />
                        </div>
                    )}
                    {this.state.items.map((item, index) => (
                        <div

                            // eslint-disable-next-line react/no-array-index-key
                            key={index}
                            className='WelcomeFaqSetting__item'
                        >
                            <div className='WelcomeFaqSetting__itemHeader'>
                                <span className='WelcomeFaqSetting__itemNumber'>{index + 1}</span>
                                <div className='WelcomeFaqSetting__itemActions'>
                                    <button
                                        type='button'
                                        className='btn btn-icon btn-sm'
                                        disabled={readOnly || index === 0}
                                        onClick={() => this.handleMove(index, -1)}
                                        aria-label='Move up'
                                    >
                                        <i className='icon icon-arrow-up'/>
                                    </button>
                                    <button
                                        type='button'
                                        className='btn btn-icon btn-sm'
                                        disabled={readOnly || index === this.state.items.length - 1}
                                        onClick={() => this.handleMove(index, 1)}
                                        aria-label='Move down'
                                    >
                                        <i className='icon icon-arrow-down'/>
                                    </button>
                                    <button
                                        type='button'
                                        className='btn btn-sm btn-tertiary btn-danger'
                                        disabled={readOnly}
                                        onClick={() => this.handleRemove(index)}
                                    >
                                        <FormattedMessage
                                            id='admin.customization.welcomeFaq.removeOption'
                                            defaultMessage='Remove'
                                        />
                                    </button>
                                </div>
                            </div>
                            <label className='WelcomeFaqSetting__label'>
                                <FormattedMessage
                                    id='admin.customization.welcomeFaq.labelField'
                                    defaultMessage='Button label'
                                />
                                <input
                                    type='text'
                                    className='form-control'
                                    value={item.Label}
                                    disabled={readOnly}
                                    onChange={(e) => this.handleField(index, 'Label', e.target.value)}
                                />
                            </label>
                            <label className='WelcomeFaqSetting__label'>
                                <FormattedMessage
                                    id='admin.customization.welcomeFaq.answerField'
                                    defaultMessage='Answer (Markdown)'
                                />
                                <textarea
                                    className='form-control'
                                    rows={3}
                                    value={item.Answer}
                                    disabled={readOnly}
                                    onChange={(e) => this.handleField(index, 'Answer', e.target.value)}
                                />
                            </label>
                            <label className='WelcomeFaqSetting__label'>
                                <FormattedMessage
                                    id='admin.customization.welcomeFaq.keywordsField'
                                    defaultMessage='Keywords (comma-separated)'
                                />
                                <input
                                    type='text'
                                    className='form-control'
                                    value={item.Keywords}
                                    disabled={readOnly}
                                    onChange={(e) => this.handleField(index, 'Keywords', e.target.value)}
                                />
                            </label>
                        </div>
                    ))}
                    <button
                        type='button'
                        className='btn btn-sm btn-tertiary'
                        disabled={readOnly}
                        onClick={this.handleAdd}
                    >
                        <FormattedMessage
                            id='admin.customization.welcomeFaq.addOption'
                            defaultMessage='+ Add option'
                        />
                    </button>
                </div>
            </Setting>
        );
    }
}
