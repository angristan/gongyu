import { assert, it } from 'vitest';
import { bookmarkletCode } from '../../app/bookmarklet-code';

it('opens a popup large enough for the capture form', () => {
    const code = bookmarkletCode('https://gongyu.example');

    assert.include(
        code,
        "window.open('https://gongyu.example/bookmarklet?url='",
    );
    assert.include(
        code,
        "'gongyu','width=720,height=850,resizable=yes,scrollbars=yes'",
    );
});
