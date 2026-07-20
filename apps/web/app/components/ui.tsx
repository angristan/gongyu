'use client';

import {
    ActionIcon,
    Alert,
    Badge as MantineBadge,
    Breadcrumbs as MantineBreadcrumbs,
    Button as MantineButton,
    Checkbox as MantineCheckbox,
    Modal,
    Paper,
    Stack,
    Text,
    Textarea,
    TextInput,
    Title,
} from '@mantine/core';
import { InfoIcon } from '@phosphor-icons/react';
import {
    type AriaAttributes,
    type ButtonHTMLAttributes,
    type ComponentType,
    cloneElement,
    createContext,
    type HTMLAttributes,
    type InputHTMLAttributes,
    type ReactElement,
    type ReactNode,
    type TextareaHTMLAttributes,
    useContext,
    useEffect,
    useState,
} from 'react';
import { Link } from 'react-router';

export function HydratedOnly({ children }: { readonly children: ReactNode }) {
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => setHydrated(true), []);
    return hydrated ? children : null;
}

export function cn(
    ...values: ReadonlyArray<string | false | null | undefined>
): string {
    return values.filter(Boolean).join(' ');
}

type Icon = ComponentType<{
    readonly 'aria-hidden'?: AriaAttributes['aria-hidden'];
    readonly size?: number;
}>;
type ButtonVariant =
    | 'destructive'
    | 'ghost'
    | 'primary'
    | 'secondary'
    | 'secondary-destructive';

function buttonAppearance(variant: ButtonVariant | undefined): {
    readonly color?: string;
    readonly variant: 'default' | 'filled' | 'light' | 'subtle';
} {
    switch (variant) {
        case 'primary':
            return { variant: 'filled' };
        case 'destructive':
            return { color: 'red', variant: 'filled' };
        case 'secondary-destructive':
            return { color: 'red', variant: 'light' };
        case 'ghost':
            return { variant: 'subtle' };
        default:
            return { variant: 'default' };
    }
}

interface ButtonProps
    extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
    readonly icon?: Icon;
    readonly loading?: boolean;
    readonly shape?: 'square';
    readonly size?: 'lg' | 'sm';
    readonly variant?: ButtonVariant;
}

export function Button({
    children,
    icon: IconComponent,
    loading,
    shape,
    size = 'sm',
    variant,
    ...props
}: ButtonProps) {
    const appearance = buttonAppearance(variant);
    if (shape === 'square') {
        return (
            <ActionIcon
                {...props}
                color={appearance.color}
                loading={loading}
                size={size === 'lg' ? 'lg' : 'md'}
                variant={appearance.variant}
            >
                {IconComponent === undefined ? (
                    children
                ) : (
                    <IconComponent aria-hidden="true" size={17} />
                )}
            </ActionIcon>
        );
    }
    return (
        <MantineButton
            {...props}
            color={appearance.color}
            leftSection={
                IconComponent === undefined ? undefined : (
                    <IconComponent aria-hidden="true" size={16} />
                )
            }
            loading={loading}
            size={size}
            variant={appearance.variant}
        >
            {children}
        </MantineButton>
    );
}

interface LinkButtonProps
    extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
    readonly external?: boolean;
    readonly href: string;
    readonly icon?: Icon;
    readonly shape?: 'square';
    readonly size?: 'lg' | 'sm';
    readonly variant?: ButtonVariant;
}

export function LinkButton({
    children,
    external = false,
    href,
    icon: IconComponent,
    shape,
    size = 'sm',
    variant,
    ...props
}: LinkButtonProps) {
    const appearance = buttonAppearance(variant);
    const icon =
        IconComponent === undefined ? undefined : (
            <IconComponent aria-hidden="true" size={17} />
        );
    const externalProps = external
        ? { rel: 'noreferrer', target: '_blank' as const }
        : {};

    if (shape === 'square') {
        return external ? (
            <ActionIcon
                component="a"
                href={href}
                {...externalProps}
                {...props}
                color={appearance.color}
                size={size === 'lg' ? 'lg' : 'md'}
                variant={appearance.variant}
            >
                {icon ?? children}
            </ActionIcon>
        ) : (
            <ActionIcon
                component={Link}
                to={href}
                {...props}
                color={appearance.color}
                size={size === 'lg' ? 'lg' : 'md'}
                variant={appearance.variant}
            >
                {icon ?? children}
            </ActionIcon>
        );
    }

    return external ? (
        <MantineButton
            component="a"
            href={href}
            {...externalProps}
            {...props}
            color={appearance.color}
            leftSection={icon}
            size={size}
            variant={appearance.variant}
        >
            {children}
        </MantineButton>
    ) : (
        <MantineButton
            component={Link}
            to={href}
            {...props}
            color={appearance.color}
            leftSection={icon}
            size={size}
            variant={appearance.variant}
        >
            {children}
        </MantineButton>
    );
}

interface InputProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
    readonly description?: ReactNode;
    readonly error?: ReactNode | { readonly message: ReactNode };
    readonly label?: ReactNode;
    readonly leftSection?: ReactNode;
    readonly size?: 'lg' | 'sm';
}

export function Input({
    description,
    error,
    label,
    leftSection,
    size,
    ...props
}: InputProps) {
    return (
        <TextInput
            {...props}
            description={description}
            error={
                typeof error === 'object' &&
                error !== null &&
                'message' in error
                    ? error.message
                    : error
            }
            label={label}
            leftSection={leftSection}
            size={size}
        />
    );
}

interface InputAreaProps
    extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
    readonly description?: ReactNode;
    readonly error?: ReactNode | { readonly message: ReactNode };
    readonly label?: ReactNode;
}

export function InputArea({
    description,
    error,
    label,
    ...props
}: InputAreaProps) {
    return (
        <Textarea
            {...props}
            autosize={false}
            description={description}
            error={
                typeof error === 'object' &&
                error !== null &&
                'message' in error
                    ? error.message
                    : error
            }
            label={label}
            minRows={4}
        />
    );
}

interface CheckboxProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
    readonly label: ReactNode;
    readonly onCheckedChange?: (checked: boolean) => void;
}

export function Checkbox({ onCheckedChange, ...props }: CheckboxProps) {
    return (
        <MantineCheckbox
            {...props}
            onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
        />
    );
}

export function LayerCard({
    className,
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return (
        <Paper
            {...props}
            className={className}
            radius="md"
            shadow="xs"
            withBorder
        />
    );
}

type BannerVariant = 'alert' | 'default' | 'error' | 'secondary';

export function Banner({
    description,
    icon,
    title,
    variant = 'default',
}: {
    readonly description?: ReactNode;
    readonly icon?: ReactNode;
    readonly title?: string;
    readonly variant?: BannerVariant;
}) {
    const color =
        variant === 'error'
            ? 'red'
            : variant === 'alert'
              ? 'yellow'
              : variant === 'secondary'
                ? 'gray'
                : 'blue';
    return (
        <Alert
            color={color}
            icon={icon ?? <InfoIcon aria-hidden="true" size={18} />}
            title={title}
            variant="light"
        >
            {description}
        </Alert>
    );
}

export type BadgeVariant =
    | 'danger'
    | 'error'
    | 'info'
    | 'secondary'
    | 'success'
    | 'warning';

export function Badge({
    appearance,
    children,
    variant = 'secondary',
}: {
    readonly appearance?: 'dot';
    readonly children: ReactNode;
    readonly variant?: BadgeVariant;
}) {
    const color = {
        danger: 'red',
        error: 'red',
        info: 'blue',
        secondary: 'gray',
        success: 'teal',
        warning: 'yellow',
    }[variant];
    return (
        <MantineBadge
            color={color}
            leftSection={
                appearance === 'dot' ? (
                    <span
                        aria-hidden="true"
                        className="block size-1.5 rounded-full bg-current"
                    />
                ) : undefined
            }
            size="sm"
            variant="light"
        >
            {children}
        </MantineBadge>
    );
}

export function Empty({
    className,
    contents,
    description,
    icon,
    size,
    title,
}: {
    readonly className?: string;
    readonly contents?: ReactNode;
    readonly description?: ReactNode;
    readonly icon?: ReactNode;
    readonly size?: 'sm';
    readonly title: ReactNode;
}) {
    const compact = size === 'sm';
    return (
        <Stack
            align="center"
            className={className}
            gap={compact ? 4 : 'xs'}
            p={compact ? 'md' : 'xl'}
        >
            {icon}
            <Title order={3} size={compact ? 'h6' : 'h5'}>
                {title}
            </Title>
            {description === undefined ? null : (
                <Text
                    c="dimmed"
                    maw={460}
                    size={compact ? 'xs' : 'sm'}
                    ta="center"
                >
                    {description}
                </Text>
            )}
            {contents}
        </Stack>
    );
}

const DialogContext = createContext<{
    readonly close: () => void;
    readonly open: () => void;
    readonly opened: boolean;
} | null>(null);

function DialogRoot({
    children,
    defaultOpen = false,
}: {
    readonly children: ReactNode;
    readonly defaultOpen?: boolean;
    readonly role?: string;
}) {
    const [opened, setOpened] = useState(defaultOpen);
    return (
        <DialogContext.Provider
            value={{
                close: () => setOpened(false),
                open: () => setOpened(true),
                opened,
            }}
        >
            {children}
        </DialogContext.Provider>
    );
}

function useDialog() {
    const value = useContext(DialogContext);
    if (value === null) {
        throw new Error(
            'Dialog components must be rendered inside Dialog.Root',
        );
    }
    return value;
}

function DialogTrigger({
    children,
    render,
}: {
    readonly children: ReactNode;
    readonly render: ReactElement<{
        readonly children?: ReactNode;
        readonly onClick?: () => void;
    }>;
}) {
    const dialog = useDialog();
    return cloneElement(render, { children, onClick: dialog.open });
}

function DialogClose({
    children,
    render,
}: {
    readonly children: ReactNode;
    readonly render: ReactElement<{
        readonly children?: ReactNode;
        readonly onClick?: () => void;
    }>;
}) {
    const dialog = useDialog();
    return cloneElement(render, { children, onClick: dialog.close });
}

function DialogContent({
    children,
    className,
    size,
}: {
    readonly children: ReactNode;
    readonly className?: string;
    readonly size?: 'lg';
}) {
    const dialog = useDialog();
    return (
        <Modal
            aria-label="Confirmation dialog"
            centered
            classNames={{ body: className }}
            onClose={dialog.close}
            opened={dialog.opened}
            padding="lg"
            size={size}
            withCloseButton={false}
        >
            {children}
        </Modal>
    );
}

function DialogTitle({ children }: { readonly children: ReactNode }) {
    return (
        <Title order={2} size="h4">
            {children}
        </Title>
    );
}

function DialogDescription({ children }: { readonly children: ReactNode }) {
    return (
        <Text c="dimmed" size="sm">
            {children}
        </Text>
    );
}

export const Dialog = Object.assign(DialogContent, {
    Close: DialogClose,
    Description: DialogDescription,
    Root: DialogRoot,
    Title: DialogTitle,
    Trigger: DialogTrigger,
});

function BreadcrumbLink({
    children,
    href,
}: {
    readonly children: ReactNode;
    readonly href: string;
}) {
    return (
        <Text component={Link} size="sm" to={href}>
            {children}
        </Text>
    );
}

function BreadcrumbCurrent({ children }: { readonly children: ReactNode }) {
    return (
        <Text c="dimmed" size="sm">
            {children}
        </Text>
    );
}

function BreadcrumbsRoot({
    children,
    className,
}: {
    readonly children: ReactNode;
    readonly className?: string;
    readonly size?: 'sm';
}) {
    return (
        <MantineBreadcrumbs className={className} separator="/">
            {children}
        </MantineBreadcrumbs>
    );
}

export const Breadcrumbs = Object.assign(BreadcrumbsRoot, {
    Current: BreadcrumbCurrent,
    Link: BreadcrumbLink,
});
