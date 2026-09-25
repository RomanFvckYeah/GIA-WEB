// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {lazy} from 'react';
import {useSelector} from 'react-redux';
import type {RouteComponentProps} from 'react-router-dom';
import {Route} from 'react-router-dom';

import {isCurrentUserPanicButtonOnly} from 'mattermost-redux/selectors/entities/general';

import {makeAsyncComponent} from 'components/async_load';
import CloudPreviewModalController from 'components/cloud_preview_modal/cloud_preview_modal_controller';
import LoggedIn from 'components/logged_in';

const OnBoardingTaskList = makeAsyncComponent('OnboardingTaskList', lazy(() => import('components/onboarding_tasklist')));

type Props = {
    component: React.ComponentType<RouteComponentProps<any>>;
    path: string | string[];
};

export default function LoggedInRoute(props: Props) {
    const {component: Component, ...rest} = props;

    // A panic-button-only account (see logged_in.tsx, which redirects every such session to
    // /panic_restricted before this ever renders anything else) has no team to onboard into and
    // nothing to preview — showing either of these here would be the only way either could leak
    // onto that screen, since it's the only LoggedInRoute page such a session can ever reach.
    const panicButtonOnly = useSelector(isCurrentUserPanicButtonOnly);

    return (
        <Route
            {...rest}
            render={(routeProps) => (
                <LoggedIn {...routeProps}>
                    {!panicButtonOnly && <OnBoardingTaskList/>}
                    {!panicButtonOnly && <CloudPreviewModalController/>}
                    <Component {...(routeProps)}/>
                </LoggedIn>
            )}
        />
    );
}
