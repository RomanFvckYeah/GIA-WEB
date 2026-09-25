// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';

import giaMark from 'images/LogoGIAWhite.png';

// The GIA "GA" mark as a theme-aware monochrome icon, used where Mattermost shows
// its logo as an avatar for system messages (e.g. "X joined the channel").
//
// The mark's shape comes from the white-on-transparent LogoGIAWhite.png used as an
// SVG mask over a <rect> with no explicit fill, so the rect inherits `fill` from
// the surrounding CSS (`.post__img .icon { fill: var(--center-channel-color) }`) —
// the same way the plain <path> elements in the Mattermost logo SVG did — and stays
// legible in both light and dark themes. viewBox is cropped tight to the mark's
// pixel bounds within the 300x300 source image.
export default function GiaLogoMark(props: React.HTMLAttributes<HTMLSpanElement>) {
    const {formatMessage} = useIntl();
    return (
        <span {...props}>
            <svg
                viewBox='18 62 273 176'
                role='img'
                aria-label={formatMessage({id: 'generic_icons.giaLogo', defaultMessage: 'GIA Logo'})}
            >
                <mask id='giaLogoMarkMask'>
                    <image
                        href={giaMark}
                        x='0'
                        y='0'
                        width='300'
                        height='300'
                    />
                </mask>
                <rect
                    x='18'
                    y='62'
                    width='273'
                    height='176'
                    mask='url(#giaLogoMarkMask)'
                />
            </svg>
        </span>
    );
}
