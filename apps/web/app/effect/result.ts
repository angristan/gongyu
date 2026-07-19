export interface Failure<E> {
    readonly error: E;
    readonly ok: false;
}

export interface Success<A> {
    readonly ok: true;
    readonly value: A;
}

export function failure<E>(error: E): Failure<E> {
    return { error, ok: false };
}

export function success<A>(value: A): Success<A> {
    return { ok: true, value };
}
