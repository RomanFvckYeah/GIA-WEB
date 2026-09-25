// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useSelector} from 'react-redux';
import styled from 'styled-components';

import {getTheme} from 'mattermost-redux/selectors/entities/preferences';
import {getContrastingSimpleColor} from 'mattermost-redux/utils/theme_utils';

import GiaLogo from 'components/common/gia_logo/gia_logo';

const ProductBrandingFreeEditionContainer = styled.span`
    display: flex;
    align-items: center;
`;

const ProductBrandingFreeEdition = (): JSX.Element => {
    const theme = useSelector(getTheme);
    const isDarkBackground = getContrastingSimpleColor(theme.sidebarBg) === '#FFFFFF';

    return (
        <ProductBrandingFreeEditionContainer tabIndex={-1}>
            <GiaLogo
                isDarkBackground={isDarkBackground}
                height={20}
            />
        </ProductBrandingFreeEditionContainer>
    );
};

export default ProductBrandingFreeEdition;
