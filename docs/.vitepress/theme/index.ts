import DefaultTheme from 'vitepress/theme';
import LanguageTabs from './LanguageTabs.vue';
import ReleaseDownloads from './ReleaseDownloads.vue';
import DownloadLink from './DownloadLink.vue';
import './style.scss';

export default {
    extends: DefaultTheme,
    enhanceApp({app}) {
        app.component('LanguageTabs', LanguageTabs);
        app.component('ReleaseDownloads', ReleaseDownloads);
        app.component('DownloadLink', DownloadLink);
    },
};
