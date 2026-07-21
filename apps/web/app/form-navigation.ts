interface FormNavigation {
    readonly formAction?: string;
    readonly formData?: FormData;
    readonly formMethod?: string;
    readonly state: string;
}

interface FormSubmissionMatch {
    readonly action: string;
    readonly fields?: Readonly<Record<string, string>>;
    readonly method: 'GET' | 'POST';
}

export function matchesFormSubmission(
    navigation: FormNavigation,
    expected: FormSubmissionMatch,
): boolean {
    if (
        navigation.state === 'idle' ||
        navigation.formData === undefined ||
        navigation.formAction === undefined ||
        navigation.formMethod?.toUpperCase() !== expected.method
    ) {
        return false;
    }
    const actionPath = new URL(navigation.formAction, 'https://gongyu.invalid')
        .pathname;
    if (actionPath !== expected.action) {
        return false;
    }
    return Object.entries(expected.fields ?? {}).every(
        ([name, value]) => navigation.formData?.get(name) === value,
    );
}

export function submittedFormValue(
    navigation: FormNavigation,
    expected: Omit<FormSubmissionMatch, 'fields'>,
    name: string,
): string | null {
    if (!matchesFormSubmission(navigation, expected)) {
        return null;
    }
    const value = navigation.formData?.get(name);
    return typeof value === 'string' ? value : null;
}
