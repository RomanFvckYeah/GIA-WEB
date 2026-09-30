// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage, defineMessages} from 'react-intl';

import {EmailOutlineIcon, GlobeIcon, MapMarkerOutlineIcon, PhoneOutlineIcon} from '@mattermost/compass-icons/components';

import GiaLogo from 'components/common/gia_logo/gia_logo';
import ExternalLink from 'components/external_link';
import AdminHeader from 'components/widgets/admin_console/admin_header';

import './gia_edition_panel.scss';

const messages = defineMessages({
    title: {id: 'admin.license.title', defaultMessage: 'Edition and License'},
    developedBy: {id: 'admin.license.gia.developedBy', defaultMessage: 'Developed and maintained by the Okip team.'},
    contactIntro: {id: 'admin.license.gia.contactIntro', defaultMessage: 'Have a question or need help? Contact us:'},
    emailLabel: {id: 'admin.license.gia.emailLabel', defaultMessage: 'Email'},
    phoneLabel: {id: 'admin.license.gia.phoneLabel', defaultMessage: 'Phone'},
    websiteLabel: {id: 'admin.license.gia.websiteLabel', defaultMessage: 'Website'},
    locationLabel: {id: 'admin.license.gia.locationLabel', defaultMessage: 'Location'},
});

export const searchableStrings = [
    messages.title,
    messages.developedBy,
];

type ContactRowProps = {
    icon: React.ReactNode;
    label: React.ReactNode;
    value: React.ReactNode;
};

const ContactRow = ({icon, label, value}: ContactRowProps) => (
    <li className='gia-edition-panel__contactItem'>
        <span className='gia-edition-panel__icon'>
            {icon}
        </span>
        <span className='gia-edition-panel__contactText'>
            <span className='gia-edition-panel__label'>
                {label}
            </span>
            <span className='gia-edition-panel__value'>
                {value}
            </span>
        </span>
    </li>
);

const GiaEditionPanel = () => {
    return (
        <div className='wrapper--fixed'>
            <AdminHeader>
                <FormattedMessage {...messages.title}/>
            </AdminHeader>
            <div className='admin-console__wrapper'>
                <div className='gia-edition-panel'>
                    <div className='gia-edition-panel__card'>
                        <div className='gia-edition-panel__logoWrap'>
                            <GiaLogo height={56}/>
                        </div>
                        <p className='gia-edition-panel__developedBy'>
                            <FormattedMessage {...messages.developedBy}/>
                        </p>
                        <div className='gia-edition-panel__divider'/>
                        <p className='gia-edition-panel__contactIntro'>
                            <FormattedMessage {...messages.contactIntro}/>
                        </p>
                        <ul className='gia-edition-panel__contactList'>
                            <ContactRow
                                icon={<EmailOutlineIcon size={18}/>}
                                label={<FormattedMessage {...messages.emailLabel}/>}
                                value={(
                                    <a href='mailto:mesadeayuda@okip.com.mx'>
                                        {'mesadeayuda@okip.com.mx'}
                                    </a>
                                )}
                            />
                            <ContactRow
                                icon={<PhoneOutlineIcon size={18}/>}
                                label={<FormattedMessage {...messages.phoneLabel}/>}
                                value={(
                                    <a href='tel:+525644995204'>
                                        {'+52 564 499 5204'}
                                    </a>
                                )}
                            />
                            <ContactRow
                                icon={<GlobeIcon size={18}/>}
                                label={<FormattedMessage {...messages.websiteLabel}/>}
                                value={(
                                    <ExternalLink
                                        location='gia_edition_panel'
                                        href='https://www.okip.com.mx'
                                    >
                                        {'www.okip.com.mx'}
                                    </ExternalLink>
                                )}
                            />
                            <ContactRow
                                icon={<MapMarkerOutlineIcon size={18}/>}
                                label={<FormattedMessage {...messages.locationLabel}/>}
                                value={'San Miguel de Allende, GTO.'}
                            />
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GiaEditionPanel;
