// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';

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
    const [pending, setPending] = useState(false);

    const prompt = typeof post.props?.gia_welcome_prompt === 'string' ? post.props.gia_welcome_prompt : '';
    const items = readItems(post.props?.gia_welcome_items);

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

    if (items.length === 0) {
        return prompt ? <Markdown message={prompt}/> : null;
    }

    return (
        <div className='WelcomeFaqMenu'>
            {prompt && (
                <div className='WelcomeFaqMenu__prompt'>
                    <Markdown message={prompt}/>
                </div>
            )}
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
            </div>
        </div>
    );
};

export default WelcomeFaqMenu;
