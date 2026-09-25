// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Temporary debug logging for testing the "Rastreo Operativo" (Operational Tracking) feature —
// prints every request/response to the browser console so it's easy to confirm what's being
// sent and what the server returns while trying it out.
const PREFIX = '[RastreoOperativo]';

export function logSent(label: string, payload: unknown) {
    // eslint-disable-next-line no-console
    console.log(`${PREFIX} ${label} - enviado:`, payload);
}

export function logResult(label: string, result: unknown) {
    // eslint-disable-next-line no-console
    console.log(`${PREFIX} ${label} - resultado:`, result);
}
