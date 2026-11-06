import DefaultTheme from 'vitepress/theme';
import {h} from 'vue';
import LanguageTabs from './LanguageTabs.vue';
import ReleaseDownloads from './ReleaseDownloads.vue';
import ReleaseNotice from './ReleaseNotice.vue';
import DownloadLink from './DownloadLink.vue';
import './style.scss';

export default {
    extends: DefaultTheme,
    Layout: () => h(DefaultTheme.Layout, null, {
        'doc-before': () => h(ReleaseNotice),
        'home-hero-before': () => h(ReleaseNotice),
    }),
    enhanceApp({app}) {
        app.component('LanguageTabs', LanguageTabs);
        app.component('ReleaseDownloads', ReleaseDownloads);
        app.component('DownloadLink', DownloadLink);
    },
};
