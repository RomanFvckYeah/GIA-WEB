// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {PureComponent} from 'react';
import {FormattedMessage} from 'react-intl';

import BrowserStore from 'stores/browser_store';

import GiaLogo from 'components/common/gia_logo/gia_logo';
import ExternalLink from 'components/external_link';

import desktopImg from 'images/deep-linking/deeplinking-desktop-img.png';
import mobileImg from 'images/deep-linking/deeplinking-mobile-img.png';
import {LandingPreferenceTypes} from 'utils/constants';
import * as UserAgent from 'utils/user_agent';

type Props = {
    iosAppLink?: string;
    androidAppLink?: string;
    siteUrl?: string;
    enableCustomBrand: boolean;
}

type State = {
    rememberChecked: boolean;
    location: string;
    navigating: boolean;
}

function safeRedirect(path: string) {
    const url = new URL(path);

    // Remove '/landing' from the end of the pathname
    url.pathname = url.pathname.slice(0, -'/landing'.length);

    const hash = url.hash.slice(1);
    const baseUrl = new URL(url.pathname, url.origin);

    // Default to base URL if no hash
    if (!hash) {
        return baseUrl.href;
    }

    let redirectUrl;

    try {
        // Attempt to construct URL from hash (handles both absolute and relative URLs)
        redirectUrl = new URL(hash, baseUrl);
    } catch (e) {
        // Invalid hash, return safe default
        return baseUrl.href;
    }

    // Only allow same-origin redirects
    if (redirectUrl.origin !== baseUrl.origin) {
        return baseUrl.href;
    }

    return redirectUrl.href;
}

export default class LinkingLandingPage extends PureComponent<Props, State> {
    constructor(props: Props) {
        super(props);

        const finalLocation = safeRedirect(window.location.href);

        this.state = {
            rememberChecked: false,
            location: finalLocation,
            navigating: false,
        };

        if (!BrowserStore.hasSeenLandingPage()) {
            BrowserStore.setLandingPageSeen(true);
        }
    }

    componentDidMount() {
        window.addEventListener('beforeunload', this.clearLandingPreferenceIfNotChecked);
    }

    componentWillUnmount() {
        window.removeEventListener('beforeunload', this.clearLandingPreferenceIfNotChecked);
    }

    clearLandingPreferenceIfNotChecked = () => {
        if (!this.state.navigating && !this.state.rememberChecked) {
            BrowserStore.clearLandingPreference(this.props.siteUrl);
        }
    };

    checkLandingPreferenceBrowser = () => {
        const landingPreference = BrowserStore.getLandingPreference(this.props.siteUrl);
        return landingPreference && landingPreference === LandingPreferenceTypes.BROWSER;
    };

    isEmbedded = () => {
        // this cookie is set by any plugin that facilitates iframe embedding (e.g. mattermost-plugin-msteams-sync).
        const cookieName = 'MMEMBED';
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith(cookieName + '=')) {
                const value = cookie.substring(cookieName.length + 1);
                return decodeURIComponent(value) === '1';
            }
        }
        return false;
    };

    handleChecked = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.setState({rememberChecked: e.target.checked});

        // If it was checked, and now we're unchecking it, clear the preference
        if (!e.target.checked) {
            BrowserStore.clearLandingPreference(this.props.siteUrl);
        }
    };

    setBrowserPreference = (clearIfNotChecked?: boolean) => {
        if (!this.state.rememberChecked) {
            if (clearIfNotChecked) {
                BrowserStore.clearLandingPreference(this.props.siteUrl);
            }
            return;
        }

        BrowserStore.setLandingPreferenceToBrowser(this.props.siteUrl);
    };

    openInBrowser = () => {
        this.setBrowserPreference();
        window.location.href = this.state.location;
    };

    renderStoreButtons = () => {
        return (
            <>
                {this.props.androidAppLink && (
                    <ExternalLink
                        href={this.props.androidAppLink}
                        location='landingPage'
                        className='btn btn-primary btn-lg get-app__download'
                    >
                        <FormattedMessage
                            id='get_app.downloadForAndroid'
                            defaultMessage='Download for Android'
                        />
                    </ExternalLink>
                )}
                {this.props.iosAppLink && (
                    <ExternalLink
                        href={this.props.iosAppLink}
                        location='landingPage'
                        className='btn btn-primary btn-lg get-app__download'
                    >
                        <FormattedMessage
                            id='get_app.downloadForIos'
                            defaultMessage='Download for iOS'
                        />
                    </ExternalLink>
                )}
            </>
        );
    };

    renderGraphic = () => {
        const isMobile = UserAgent.isMobile();

        if (isMobile) {
            return (
                <img
                    src={mobileImg}
                    alt=''
                />
            );
        }

        return (
            <img
                src={desktopImg}
                alt=''
            />
        );
    };

    renderDialogHeader = () => {
        return (
            <div className='get-app__launching'>
                <FormattedMessage
                    id='get_app.launching'
                    tagName='h1'
                    defaultMessage='Where would you like to view this?'
                />
                <div className='get-app__alternative'>
                    <FormattedMessage
                        id='get_app.ifNothingPrompts'
                        defaultMessage='Download the {siteName} app for Android or iOS, or continue in your web browser.'
                        values={{
                            siteName: this.props.enableCustomBrand ? '' : ' Mattermost',
                        }}
                    />
                </div>
            </div>
        );
    };

    renderDialogBody = () => {
        return (
            <div className='get-app__dialog-body'>
                {this.renderDialogHeader()}
                <div className='get-app__buttons'>
                    {this.renderStoreButtons()}
                    <a
                        href={this.state.location}
                        onMouseDown={() => {
                            this.setBrowserPreference(true);
                        }}
                        onClick={() => {
                            this.setBrowserPreference(true);
                            this.setState({navigating: true});
                        }}
                        className='btn btn-tertiary btn-lg'
                    >
                        <FormattedMessage
                            id='get_app.continueToBrowser'
                            defaultMessage='View in Browser'
                        />
                    </a>
                </div>
                <label className='get-app__preference'>
                    <input
                        type='checkbox'
                        checked={this.state.rememberChecked}
                        className='get-app__checkbox'
                        onChange={this.handleChecked}
                    />
                    <FormattedMessage
                        id='get_app.rememberMyPreference'
                        defaultMessage='Remember my preference'
                    />
                </label>
            </div>
        );
    };

    renderHeader = () => {
        return (
            <div className='get-app__header'>
                <GiaLogo
                    isDarkBackground={true}
                    height={32}
                    className='get-app__logo'
                />
            </div>
        );
    };

    render() {
        const isMobile = UserAgent.isMobile();

        if (this.checkLandingPreferenceBrowser() || this.isEmbedded()) {
            this.openInBrowser();
            return null;
        }

        return (
            <div className='get-app'>
                {this.renderHeader()}
                <div className='get-app__dialog'>
                    <div
                        className={`get-app__graphic ${isMobile ? 'mobile' : ''}`}
                    >
                        {this.renderGraphic()}
                    </div>
                    {this.renderDialogBody()}
                </div>
            </div>
        );
    }
}
