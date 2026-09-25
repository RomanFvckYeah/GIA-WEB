// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import type {IntlShape} from 'react-intl';
import {FormattedMessage, defineMessages} from 'react-intl';

import type {PasswordConfig} from 'mattermost-redux/selectors/entities/general';

import Constants from 'utils/constants';

const PASSWORD_GEN_LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const PASSWORD_GEN_UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PASSWORD_GEN_NUMBERS = '23456789';
const PASSWORD_GEN_SYMBOLS = '!@#$%^&*-_=+';

function randomInt(maxExclusive: number): number {
    const buf = new Uint32Array(1);
    window.crypto.getRandomValues(buf);
    return buf[0] % maxExclusive;
}

function randomChar(pool: string): string {
    return pool.charAt(randomInt(pool.length));
}

// generatePassword returns a random password that satisfies any possible
// PasswordSettings: it always includes at least one lowercase letter, uppercase
// letter, number and symbol, so it passes regardless of which character classes
// the server requires. Length is at least 16 (and never below the configured
// minimum). Ambiguous characters (0/O, 1/l/I) are excluded for readability.
export function generatePassword(passwordConfig: PasswordConfig): string {
    const minimumLength = Math.max(passwordConfig.minimumLength || Constants.MIN_PASSWORD_LENGTH, 16);
    const targetLength = Math.min(minimumLength, Constants.MAX_PASSWORD_LENGTH);
    const allChars = PASSWORD_GEN_LOWERCASE + PASSWORD_GEN_UPPERCASE + PASSWORD_GEN_NUMBERS + PASSWORD_GEN_SYMBOLS;

    for (let attempt = 0; attempt < 20; attempt++) {
        const chars = [
            randomChar(PASSWORD_GEN_LOWERCASE),
            randomChar(PASSWORD_GEN_UPPERCASE),
            randomChar(PASSWORD_GEN_NUMBERS),
            randomChar(PASSWORD_GEN_SYMBOLS),
        ];
        while (chars.length < targetLength) {
            chars.push(randomChar(allChars));
        }

        // Fisher-Yates shuffle so the guaranteed characters are not always first.
        for (let i = chars.length - 1; i > 0; i--) {
            const j = randomInt(i + 1);
            [chars[i], chars[j]] = [chars[j], chars[i]];
        }

        const password = chars.join('');
        if (isValidPassword(password, passwordConfig).valid) {
            return password;
        }
    }

    // Extremely unlikely fallback: a long all-class string is valid for any config.
    return (PASSWORD_GEN_UPPERCASE + PASSWORD_GEN_LOWERCASE + PASSWORD_GEN_NUMBERS + PASSWORD_GEN_SYMBOLS).slice(0, targetLength);
}

export function isValidPassword(password: string, passwordConfig: PasswordConfig, intl?: IntlShape) {
    let errorId: keyof typeof passwordErrors = 'passwordError';
    let valid = true;
    const minimumLength = passwordConfig.minimumLength || Constants.MIN_PASSWORD_LENGTH;

    if (password.length < minimumLength || password.length > Constants.MAX_PASSWORD_LENGTH) {
        valid = false;
    }

    if (passwordConfig.requireLowercase) {
        if (!password.match(/[a-z]/)) {
            valid = false;
        }

        errorId = `${errorId}Lowercase`;
    }

    if (passwordConfig.requireUppercase) {
        if (!password.match(/[A-Z]/)) {
            valid = false;
        }

        errorId = `${errorId}Uppercase`;
    }

    if (passwordConfig.requireNumber) {
        if (!password.match(/[0-9]/)) {
            valid = false;
        }

        errorId = `${errorId}Number`;
    }

    if (passwordConfig.requireSymbol) {
        if (!password.match(/[ !"\\#$%&'()*+,-./:;<=>?@[\]^_`|~]/)) {
            valid = false;
        }

        errorId = `${errorId}Symbol`;
    }

    let error;
    if (!valid) {
        const passwordErrorMessage = passwordErrors[errorId];
        error = intl ? (
            intl.formatMessage(passwordErrorMessage,
                {
                    min: minimumLength,
                    max: Constants.MAX_PASSWORD_LENGTH,
                },
            )
        ) : (
            <FormattedMessage
                {...passwordErrorMessage}
                values={{
                    min: minimumLength,
                    max: Constants.MAX_PASSWORD_LENGTH,
                }}
            />
        );
    }

    return {valid, error};
}

export const passwordErrors = defineMessages({
    passwordError: {id: 'user.settings.security.passwordError', defaultMessage: 'Your password must be {min}-{max} characters long.'},
    passwordErrorLowercase: {id: 'user.settings.security.passwordErrorLowercase', defaultMessage: 'Your password must be {min}-{max} characters long and include lowercase letters.'},
    passwordErrorLowercaseNumber: {id: 'user.settings.security.passwordErrorLowercaseNumber', defaultMessage: 'Your password must be {min}-{max} characters long and include lowercase letters and numbers.'},
    passwordErrorLowercaseNumberSymbol: {id: 'user.settings.security.passwordErrorLowercaseNumberSymbol', defaultMessage: 'Your password must be {min}-{max} characters long and include lowercase letters, numbers, and special characters.'},
    passwordErrorLowercaseSymbol: {id: 'user.settings.security.passwordErrorLowercaseSymbol', defaultMessage: 'Your password must be {min}-{max} characters long and include lowercase letters and special characters.'},
    passwordErrorLowercaseUppercase: {id: 'user.settings.security.passwordErrorLowercaseUppercase', defaultMessage: 'Your password must be {min}-{max} characters long and include both lowercase and uppercase letters.'},
    passwordErrorLowercaseUppercaseNumber: {id: 'user.settings.security.passwordErrorLowercaseUppercaseNumber', defaultMessage: 'Your password must be {min}-{max} characters long and include both lowercase and uppercase letters, and numbers.'},
    passwordErrorLowercaseUppercaseNumberSymbol: {id: 'user.settings.security.passwordErrorLowercaseUppercaseNumberSymbol', defaultMessage: 'Your password must be {min}-{max} characters long and include both lowercase and uppercase letters, numbers, and special characters.'},
    passwordErrorLowercaseUppercaseSymbol: {id: 'user.settings.security.passwordErrorLowercaseUppercaseSymbol', defaultMessage: 'Your password must be {min}-{max} characters long and include both lowercase and uppercase letters, and special characters.'},
    passwordErrorNumber: {id: 'user.settings.security.passwordErrorNumber', defaultMessage: 'Your password must be {min}-{max} characters long and include numbers.'},
    passwordErrorNumberSymbol: {id: 'user.settings.security.passwordErrorNumberSymbol', defaultMessage: 'Your password must be {min}-{max} characters long and include numbers and special characters.'},
    passwordErrorSymbol: {id: 'user.settings.security.passwordErrorSymbol', defaultMessage: 'Your password must be {min}-{max} characters long and include special characters.'},
    passwordErrorUppercase: {id: 'user.settings.security.passwordErrorUppercase', defaultMessage: 'Your password must be {min}-{max} characters long and include uppercase letters.'},
    passwordErrorUppercaseNumber: {id: 'user.settings.security.passwordErrorUppercaseNumber', defaultMessage: 'Your password must be {min}-{max} characters long and include uppercase letters, and numbers.'},
    passwordErrorUppercaseNumberSymbol: {id: 'user.settings.security.passwordErrorUppercaseNumberSymbol', defaultMessage: 'Your password must be {min}-{max} characters long and include uppercase letters, numbers, and special characters.'},
    passwordErrorUppercaseSymbol: {id: 'user.settings.security.passwordErrorUppercaseSymbol', defaultMessage: 'Your password must be {min}-{max} characters long and include uppercase letters, and special characters.'},
});
