import {defineConfig} from 'vitepress';

const guideSidebar = [
    {text: 'Getting started', items: [
        {text: 'How PTP works', link: '/guide/how-it-works'},
        {text: 'Install the client', link: '/guide/client-install'},
        {text: 'Desktop connection manager', link: '/guide/desktop'},
        {text: 'WordPress quick start', link: '/guide/wordpress'},
        {text: 'Standalone PHP quick start', link: '/guide/quick-start'},
        {text: 'Downloads and releases', link: '/downloads'},
    ]},
    {text: 'Common tasks', items: [
        {text: 'Connect an FTP editor', link: '/guide/editors'},
        {text: 'Update and roll back', link: '/guide/updates'},
        {text: 'Troubleshoot access', link: '/guide/troubleshooting'},
    ]},
    {text: 'Advanced', collapsed: true, items: [
        {text: 'Encrypted POST and upgrades', link: '/advanced/encrypted-requests'},
        {text: 'PHP deployment layouts', link: '/advanced/deployment'},
        {text: 'Docker Compose', link: '/advanced/docker'},
        {text: 'Transfers and recovery', link: '/advanced/transfers'},
        {text: 'Credentials and permissions', link: '/advanced/security'},
    ]},
    {text: 'Reference', collapsed: true, items: [
        {text: 'Client YAML', link: '/reference/client'},
        {text: 'Server configuration', link: '/reference/server'},
        {text: 'Why PTP?', link: '/guide/why-ptp'},
        {text: 'Acceptable use', link: '/acceptable-use'},
    ]},
];

const apiSidebar = [
    {text: 'API: getting started', items: [
        {text: 'HTTP API overview', link: '/api/'},
        {text: 'Run a complete example', link: '/examples/api-list'},
    ]},
    {text: 'Common tasks', items: [{text: 'List, download and write', link: '/api/tasks'}]},
    {text: 'Advanced and reference', items: [
        {text: 'Encrypted POST protocol', link: '/advanced/encrypted-requests'},
        {text: 'Actions and responses', link: '/reference/api'},
        {text: 'Verified upload sessions', link: '/advanced/transfers'},
        {text: 'Authentication and access', link: '/advanced/security'},
    ]},
];

const cliSidebar = [
    {text: 'CLI: getting started', items: [
        {text: 'CLI overview', link: '/cli/'},
        {text: 'Install and run', link: '/guide/client-install'},
    ]},
    {text: 'Tasks and reference', items: [
        {text: 'Commands and output', link: '/cli/client'},
        {text: 'Profiles and YAML', link: '/reference/client'},
        {text: 'Updates and rollback', link: '/guide/updates'},
        {text: 'Troubleshooting', link: '/guide/troubleshooting'},
    ]},
];

const serverSidebar = [
    {text: 'PHP server', items: [
        {text: 'Choose an installation', link: '/server/'},
        {text: 'Upload the runtime ZIP', link: '/guide/quick-start'},
        {text: 'Install with Composer', link: '/server/composer'},
        {text: 'Configuration and compiler', link: '/reference/server'},
        {text: 'Advanced deployment', link: '/advanced/deployment'},
        {text: 'HTTP API', link: '/reference/api'},
    ]},
];

export default defineConfig({
    title: 'PTP',
    description: 'A local FTP bridge for standalone PHP hosting and WordPress. Install, configure, connect.',
    lang: 'en',
    base: process.env.DOCS_BASE || '/',
    cleanUrls: false,
    head: [['link', {rel: 'icon', href: `${process.env.DOCS_BASE || '/'}mark.svg`}]],
    markdown: {
        theme: {light: 'github-light', dark: 'github-dark'},
        languageAlias: {mjs: 'javascript', cjs: 'javascript'},
    },
    themeConfig: {
        siteTitle: 'PTP',
        logo: '/mark.svg',
        nav: [
            {text: 'Guides', link: '/guide/client-install'},
            {text: 'CLI documentation', link: '/cli/'},
            {text: 'API documentation', link: '/api/'},
            {text: 'PHP server', link: '/server/'},
            {text: 'Downloads', link: '/downloads'},
            {text: 'Contributing', items: [
                {text: 'Source development', link: '/contributing/development'},
                {text: 'Release preparation', link: '/contributing/releases'},
                {text: 'Work on docs', link: '/contributing/docs'},
            ]},
        ],
        sidebar: {
            '/api/': apiSidebar,
            '/examples/': apiSidebar,
            '/reference/api': apiSidebar,
            '/cli/': cliSidebar,
            '/reference/client': cliSidebar,
            '/server/': serverSidebar,
            '/reference/server': serverSidebar,
            '/contributing/': [{text: 'Contributing', items: [
                {text: 'Source development', link: '/contributing/development'},
                {text: 'Prepare releases', link: '/contributing/releases'},
                {text: 'Work on docs', link: '/contributing/docs'},
            ]}],
            '/': guideSidebar,
        },
        search: {provider: 'local'},
        outline: {level: [2, 3]},
        footer: {message: 'PTP. Authorized maintenance only.'},
    },
});
