export { Phase0Workflow } from './phase0-workflow';

export default {
    fetch() {
        return new Response('Not found', { status: 404 });
    },
} satisfies ExportedHandler<Env>;
