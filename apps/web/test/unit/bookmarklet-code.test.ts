import { assert, it } from 'vitest';
import { bookmarkletCode } from '../../app/bookmarklet-code';

it('opens the capture form in a named tab', () => {
    const code = bookmarkletCode('https://gongyu.example');

    assert.include(
        code,
        "window.open('https://gongyu.example/bookmarklet?url='",
    );
    // A window name without a features string opens a reusable tab, not a popup window.
    assert.include(code, "'gongyu')");
    assert.notInclude(code, 'width=');
});
