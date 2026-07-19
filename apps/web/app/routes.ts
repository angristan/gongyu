import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
    index('routes/home.tsx'),
    route('theme', 'routes/theme.ts'),
] satisfies RouteConfig;
