import { Breadcrumbs } from '@cloudflare/kumo/components/breadcrumbs';
import { PageShell } from '@gongyu/ui/page-shell';
import type { ComponentProps } from 'react';

interface AdminPageProps
    extends Omit<
        ComponentProps<typeof PageShell>,
        'breadcrumbs' | 'eyebrow' | 'width'
    > {
    readonly section?: string;
    readonly sectionHref?: string;
    readonly width?: 'default' | 'wide';
}

export function AdminPage({
    section,
    sectionHref,
    title,
    width = 'wide',
    ...props
}: AdminPageProps) {
    return (
        <PageShell
            {...props}
            breadcrumbs={
                <Breadcrumbs size="sm">
                    <Breadcrumbs.Link href="/admin/dashboard">
                        Administrator
                    </Breadcrumbs.Link>
                    {section === undefined ? null : (
                        <>
                            <Breadcrumbs.Separator />
                            {sectionHref === undefined ? (
                                <Breadcrumbs.Current>
                                    {section}
                                </Breadcrumbs.Current>
                            ) : (
                                <Breadcrumbs.Link href={sectionHref}>
                                    {section}
                                </Breadcrumbs.Link>
                            )}
                        </>
                    )}
                    {section !== undefined && sectionHref !== undefined ? (
                        <>
                            <Breadcrumbs.Separator />
                            <Breadcrumbs.Current>{title}</Breadcrumbs.Current>
                        </>
                    ) : null}
                </Breadcrumbs>
            }
            eyebrow="Gongyu administrator"
            title={title}
            width={width}
        />
    );
}
