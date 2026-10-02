// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';

import type {Post} from '@mattermost/types/posts';

import Markdown from 'components/markdown';

import './welcome_faq_menu.scss';

type MenuItem = {
    id: string;
    label: string;
};

type Props = {
    post: Post;
    actions: {
        answerWelcomeFaq: (optionId: string) => Promise<{data?: boolean; error?: unknown}>;
        submitWelcomeBotReport: (message: string) => Promise<{data?: boolean; error?: unknown}>;
    };
};

function readItems(value: unknown): MenuItem[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.
        filter((it): it is {id: unknown; label: unknown} => Boolean(it) && typeof it === 'object').
        map((it) => ({id: String(it.id), label: String(it.label)})).
        filter((it) => it.label !== '');
}

const WelcomeFaqMenu = ({post, actions}: Props) => {
    const intl = useIntl();
    const [pending, setPending] = useState(false);
    const [showReportForm, setShowReportForm] = useState(false);
    const [reportMessage, setReportMessage] = useState('');

    const prompt = typeof post.props?.gia_welcome_prompt === 'string' ? post.props.gia_welcome_prompt : '';
    const items = readItems(post.props?.gia_welcome_items);
    const reportEnabled = post.props?.gia_welcome_report_enabled === true;

    const handleClick = useCallback(async (optionId: string) => {
        if (pending) {
            return;
        }
        setPending(true);
        const result = await actions.answerWelcomeFaq(optionId);
        if (result.error) {
            setPending(false);
        }

        // On success we intentionally keep the buttons disabled: the bot posts the
        // answer plus a fresh menu, so this menu instance is now stale.
    }, [actions, pending]);

    const handleSubmitReport = useCallback(async () => {
        const trimmed = reportMessage.trim();
        if (pending || trimmed === '') {
            return;
        }
        setPending(true);
        const result = await actions.submitWelcomeBotReport(trimmed);
        if (result.error) {
            setPending(false);
            return;
        }

        // On success we intentionally keep this menu instance stale, same as handleClick:
        // the bot posts its confirmation plus a fresh menu as new messages.
        setShowReportForm(false);
    }, [actions, pending, reportMessage]);

    if (items.length === 0 && !reportEnabled) {
        return prompt ? <Markdown message={prompt}/> : null;
    }

    return (
        <div className='WelcomeFaqMenu'>
            {prompt && (
                <div className='WelcomeFaqMenu__prompt'>
                    <Markdown message={prompt}/>
                </div>
            )}
            {showReportForm ? (
                <div className='WelcomeFaqMenu__reportForm'>
                    <textarea
                        className='WelcomeFaqMenu__reportTextarea form-control'
                        rows={3}
                        value={reportMessage}
                        disabled={pending}
                        placeholder={intl.formatMessage({id: 'welcome_faq_menu.report.placeholder', defaultMessage: 'Describe el problema que quieres reportar...'})}
                        onChange={(e) => setReportMessage(e.target.value)}
                    />
                    <div className='WelcomeFaqMenu__reportActions'>
                        <button
                            type='button'
                            className='btn btn-sm btn-primary'
                            disabled={pending || reportMessage.trim() === ''}
                            onClick={handleSubmitReport}
                        >
                            <FormattedMessage
                                id='welcome_faq_menu.report.submit'
                                defaultMessage='Enviar'
                            />
                        </button>
                        <button
                            type='button'
                            className='btn btn-sm btn-tertiary'
                            disabled={pending}
                            onClick={() => {
                                setShowReportForm(false);
                                setReportMessage('');
                            }}
                        >
                            <FormattedMessage
                                id='welcome_faq_menu.report.cancel'
                                defaultMessage='Cancelar'
                            />
                        </button>
                    </div>
                </div>
            ) : (
                <div className='WelcomeFaqMenu__options'>
                    {items.map((item) => (
                        <button
                            key={item.id}
                            type='button'
                            className='WelcomeFaqMenu__option btn btn-sm btn-tertiary'
                            disabled={pending}
                            onClick={() => handleClick(item.id)}
                        >
                            {item.label}
                        </button>
                    ))}
                    {reportEnabled && (
                        <button
                            type='button'
                            className='WelcomeFaqMenu__option btn btn-sm btn-tertiary'
                            disabled={pending}
                            onClick={() => setShowReportForm(true)}
                        >
                            <FormattedMessage
                                id='welcome_faq_menu.report.button'
                                defaultMessage='Reportar un problema'
                            />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default WelcomeFaqMenu;
