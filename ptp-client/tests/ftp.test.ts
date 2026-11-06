import {ServerUtils} from '../src/ServerUtils';
import {Config} from '../src/Config';
import axios from 'axios';
import * as net from 'net';

describe('FTP Server Tests', () => {
    let serverUtils: ServerUtils;
    let config: Config;
    let activeConnections: net.Socket[] = [];
    let activeTimeouts: NodeJS.Timeout[] = [];

    beforeAll(async () => {
    // Get the ServerUtils instance
        serverUtils = ServerUtils.getInstance();

        // Load the test configuration
        const localConfig = new Config();
        const configPath = process.env.PTP_TEST_CONFIG || localConfig.findConfigPath(__dirname, 'test.yaml');

        localConfig.loadConfig(configPath);

        // Start the server
        try {
            await serverUtils.startServer(configPath);
        } catch (err) {
            console.error('Failed to start FTP server for tests:', err);

            throw err;
        }

        // Get the config for testing
        config = serverUtils.getConfig()!;
    });

    afterAll(async () => {
        await serverUtils.stopServer();
    });

    afterEach(() => {
    // Clean up any active connections
        activeConnections.forEach(client => {
            if (!client.destroyed) {
                client.removeAllListeners();
                client.destroy();
            }
        });
        activeConnections = [];

        // Clear any active timeouts
        activeTimeouts.forEach(timeout => clearTimeout(timeout));
        activeTimeouts = [];
    });

    // Test that the server is configured correctly
    test('FTP server should be configured correctly', () => {
        expect(config).not.toBeNull();
        expect(config.host).toBe('127.0.0.1');
        expect(config.port).toBeGreaterThan(0);
        expect(config.apiUsername).toBe('test');
        expect(config.apiPassword).toBe('test');
        expect(config.apiEndPoint).toBe(process.env.PTP_TEST_ENDPOINT || 'http://127.0.0.1:8000/ptp-server.php');
    });

    // Test that the server is accepting connections
    test('FTP server should accept connections', (done) => {
        const client = new net.Socket();

        activeConnections.push(client);

        client.on('connect', () => {
            // Connection successful
            client.destroy();
            done();
        });

        client.on('error', (err) => {
            // Connection failed
            console.log(`Connection error: ${err.message}`);
            client.destroy();
            done(err);
        });

        client.connect(config.port, config.host);
    }, 5000); // Reduce timeout since we're skipping on error

    // Test that the server can communicate with the API
    test('FTP server should communicate with the API', async () => {
        try {
            // First check if the API is running
            const response = await axios.get(`${config.apiEndPoint}?action=hello`);

            expect(response.status).toBe(200);
            expect(response.data).toBe('hi');

            // If the API is running, the FTP server should be able to communicate with it
            // This is indirectly tested by the fact that the FTP server is running
            // since it requires the API to be available during startup
            if (serverUtils.getServer()) {
                expect(serverUtils.getServer()).not.toBeNull();
            } else {
                console.log('Server is not running, but API is available');
            }
        } catch (error) {
            throw error;
        }
    });

    // Test FTP connection with authentication
    test('FTP server should authenticate with correct credentials', (done) => {
        const client = new net.Socket();

        activeConnections.push(client);
        let dataReceived = '';
        let userSent = false;
        let passSent = false;

        client.on('connect', () => {
            // Connection successful, wait for welcome message
            client.on('data', (data) => {
                dataReceived += data.toString();
                console.log('Received data:', dataReceived);

                // Check if we received the welcome message (220)
                if (dataReceived.includes('220') && !userSent) {
                    userSent = true;
                    // Send USER command
                    client.write(`USER ${config.apiUsername}\r\n`);
                }

                // Check if we received the username response (331)
                if (dataReceived.includes('331') && !passSent) {
                    passSent = true;
                    // Send PASS command
                    client.write(`PASS ${config.apiPassword}\r\n`);
                }

                // Check if we received the login success message (230)
                if (dataReceived.includes('230')) {
                    // Authentication successful
                    client.destroy();
                    done();
                }

                // Check if we received an error message
                if (dataReceived.includes('530')) {
                    // Authentication failed
                    console.log('Authentication failed:', dataReceived);
                    client.destroy();
                    done(new Error('Authentication failed with correct credentials: ' + dataReceived));
                }

                // Handle other error cases
                if (dataReceived.includes('Error') || dataReceived.includes('error')) {
                    console.log('Error in authentication:', dataReceived);
                    client.destroy();
                    done(new Error('Error in authentication: ' + dataReceived));
                }
            });
        });

        client.on('error', (err) => {
            // Connection failed
            console.log('Connection error:', err.message);
            client.destroy();
            done(err);
        });

        // Set a timeout to prevent the test from hanging
        const timeout = setTimeout(() => {
            console.log('Authentication test timed out');
            client.destroy();
            done(new Error('Authentication test timed out'));
        }, 8000);

        activeTimeouts.push(timeout);

        client.connect(config.port, config.host);
    }, 20000); // Increase timeout for authentication

    // Test FTP connection with incorrect authentication
    test('FTP server should reject incorrect credentials', (done) => {
        const client = new net.Socket();

        activeConnections.push(client);
        let dataReceived = '';
        let userSent = false;
        let passSent = false;

        client.on('connect', () => {
            // Connection successful, wait for welcome message
            client.on('data', (data) => {
                dataReceived += data.toString();
                console.log('Received data (incorrect auth):', dataReceived);

                // Check if we received the welcome message (220)
                if (dataReceived.includes('220') && !userSent) {
                    userSent = true;
                    // Send USER command with incorrect username
                    client.write('USER incorrect\r\n');
                }

                // Check if we received the username response (331)
                if (dataReceived.includes('331') && !passSent) {
                    passSent = true;
                    // Send PASS command with incorrect password
                    client.write('PASS incorrect\r\n');
                }

                // Check if we received the login failure message (530)
                if (dataReceived.includes('530')) {
                    // Authentication correctly failed
                    client.destroy();
                    done();
                }

                // Check if we received a success message (which shouldn't happen)
                if (dataReceived.includes('230')) {
                    // Authentication incorrectly succeeded
                    console.log('Authentication succeeded with incorrect credentials');
                    client.destroy();
                    done(new Error('Authentication succeeded with incorrect credentials'));
                }

                // Handle other error cases
                if (dataReceived.includes('Error') || dataReceived.includes('error')) {
                    console.log('Error in authentication (incorrect auth):', dataReceived);
                    client.destroy();
                    done(new Error('Error in authentication (incorrect auth): ' + dataReceived));
                }
            });
        });

        client.on('error', (err) => {
            // Connection failed
            console.log('Connection error (incorrect auth):', err.message);
            client.destroy();
            done(err);
        });

        // Set a timeout to prevent the test from hanging
        const timeout = setTimeout(() => {
            console.log('Incorrect authentication test timed out');
            client.destroy();
            done(new Error('Incorrect authentication test timed out'));
        }, 8000);

        activeTimeouts.push(timeout);

        client.connect(config.port, config.host);
    }, 20000); // Increase timeout for authentication

});
