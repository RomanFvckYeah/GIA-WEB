// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import type {RouteComponentProps} from 'react-router-dom';

import * as GlobalActions from 'actions/global_actions';

// Full-page screen shown instead of the normal team/channel UI to an account restricted to the
// mobile panic-button flow only (see logged_in.tsx, which redirects here and nowhere else for
// such an account) — this account has no team memberships and never will (enforced server-side
// in App.JoinUserToTeam), so there is nothing else in the browser for it to do. Typed as
// React.FC<RouteComponentProps> (props unused) only because react-router's
// <Route component={...}/> requires it.
const PanicRestricted: React.FC<RouteComponentProps> = () => {
    const {formatMessage} = useIntl();

    useEffect(() => {
        document.body.setAttribute('class', 'sticky error');
        return () => {
            document.body.removeAttribute('class');
        };
    }, []);

    const handleLogout = (e: React.MouseEvent) => {
        e.preventDefault();
        GlobalActions.emitUserLoggedOutEvent('/login', true, true);
    };

    return (
        <div className='container-fluid'>
            <div className='error__container'>
                <div className='error__icon'>
                    <i
                        className='fa fa-shield'
                        title={formatMessage({id: 'panic_restricted.icon', defaultMessage: 'Restricted Account Icon'})}
                    />
                </div>
                <h2 data-testid='panicRestrictedTitle'>
                    <FormattedMessage
                        id='panic_restricted.title'
                        defaultMessage='This account is for the panic button only'
                    />
                </h2>
                <p>
                    <FormattedMessage
                        id='panic_restricted.message'
                        defaultMessage='This account is not a member of any team or channel. Use the mobile app to access the panic button.'
                    />
                </p>
                <a
                    href='/login'
                    onClick={handleLogout}
                >
                    <FormattedMessage
                        id='panic_restricted.logout'
                        defaultMessage='Log Out'
                    />
                </a>
            </div>
        </div>
    );
};

export default PanicRestricted;
