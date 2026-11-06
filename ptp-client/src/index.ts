import {ServerUtils} from './ServerUtils';
import packageInfo from '../package.json';

const argument = process.argv[2];

if (argument === '--help' || argument === '-h') {
    console.log('PTP ' + packageInfo.version);
    console.log('Usage: ptp <config.yaml>');
    console.log('');
    console.log('Run the local FTP bridge using a YAML profile on the host.');
    console.log('  --help, -h     Show this help and exit');
    console.log('  --version, -v  Show the installed version and exit');
    console.log('');
    console.log('Example: ptp ./site.yaml');
    process.exit(0);
}

if (argument === '--version' || argument === '-v') {
    console.log(packageInfo.version);
    process.exit(0);
}

if (!process.argv[2]) {
    console.error('Usage: ptp <config.yaml>');
    process.exit(1);
}

const siteConfigName = process.argv[2];

// Get the server utils instance
const serverUtils = ServerUtils.getInstance();

let shuttingDown = false;

async function shutdown(): Promise<void> {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    try {
        await serverUtils.stopServer();
        process.exit(0);
    } catch (error) {
        console.error('Failed to stop FTP server:', error);
        process.exit(1);
    }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

// Start the server with the specified config
serverUtils.startServer(siteConfigName).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
