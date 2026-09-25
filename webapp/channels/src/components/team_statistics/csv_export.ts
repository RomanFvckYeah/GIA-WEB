// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
    const csv = [headers, ...rows].
        map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).
        join('\n');

    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
}
