// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import logoDark from 'images/logo_email_dark.png';
import logoLight from 'images/logoWhite.png';

type Props = {

    // true when the logo sits on a dark background and needs the light-colored version
    isDarkBackground?: boolean;
    height?: number;
    className?: string;
};

const GiaLogo = ({isDarkBackground, height = 24, className}: Props) => (
    <img
        src={isDarkBackground ? logoLight : logoDark}
        alt='Guardián Inteligente'
        height={height}
        className={className}
    />
);

export default GiaLogo;
