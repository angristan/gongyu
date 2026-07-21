import { assert, it } from 'vitest';
import {
    matchesFormSubmission,
    submittedFormValue,
} from '../../app/form-navigation';

const searchSubmission = {
    action: '/admin/bookmarks',
    method: 'GET' as const,
};

it('does not match link navigation', () => {
    assert.isFalse(
        matchesFormSubmission(
            {
                formAction: '/admin/bookmarks',
                formMethod: 'GET',
                state: 'loading',
            },
            searchSubmission,
        ),
    );
});

it('does not match another form action or method', () => {
    const formData = new FormData();
    formData.set('q', 'effect');

    assert.isFalse(
        matchesFormSubmission(
            {
                formAction: '/theme',
                formData,
                formMethod: 'POST',
                state: 'submitting',
            },
            searchSubmission,
        ),
    );
});

it('keeps the submitted form pending while its action reloads data', () => {
    const formData = new FormData();
    formData.set('q', 'effect');
    const navigation = {
        formAction: '/admin/bookmarks?view=list',
        formData,
        formMethod: 'GET',
        state: 'loading',
    };

    assert.isTrue(matchesFormSubmission(navigation, searchSubmission));
    assert.strictEqual(
        submittedFormValue(navigation, searchSubmission, 'q'),
        'effect',
    );
});

it('matches only the submitted intent', () => {
    const formData = new FormData();
    formData.set('intent', 'delete');
    const navigation = {
        formAction: '/admin/bookmarks/Example1/edit',
        formData,
        formMethod: 'POST',
        state: 'submitting',
    };

    assert.isTrue(
        matchesFormSubmission(navigation, {
            action: '/admin/bookmarks/Example1/edit',
            fields: { intent: 'delete' },
            method: 'POST',
        }),
    );
    assert.isFalse(
        matchesFormSubmission(navigation, {
            action: '/admin/bookmarks/Example1/edit',
            fields: { intent: 'update' },
            method: 'POST',
        }),
    );
});
