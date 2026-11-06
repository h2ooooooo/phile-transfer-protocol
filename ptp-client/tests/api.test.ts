import axios, {AxiosInstance} from 'axios';
import {Config} from '../src/Config';

describe('REST API Tests', () => {
    let axiosInstance: AxiosInstance;
    let config: Config;

    beforeAll(() => {
    // Load the test configuration
        config = new Config();
        const configPath = process.env.PTP_TEST_CONFIG || config.findConfigPath(__dirname, 'config/test.yaml');

        config.loadConfig(configPath);

        // Create axios instance with authentication
        axiosInstance = axios.create();
        axiosInstance.interceptors.request.use((axiosConfig) => {
            const authTokenRaw = `${config.apiUsername}:${config.apiPassword}`;
            const authToken = Buffer.from(authTokenRaw).toString('base64');

            axiosConfig.headers.Authorization = authToken ? `Basic ${authToken}` : '';

            return axiosConfig;
        });
    });

    // Test connection to the server
    test('should connect to the server', async () => {
        try {
            const response = await axios.get(`${config.apiEndPoint}?action=hello`);

            expect(response.status).toBe(200);
            expect(response.data).toBe('hi');
        } catch (error: any) {
            throw new Error('Failed to connect to the server. Make sure the server is running at ' + config.apiEndPoint);
        }
    });

    // Test getUniqueName endpoint
    test('should get a unique name', async () => {
        try {
            const response = await axiosInstance.get(`${config.apiEndPoint}?action=getUniqueName`, {
                auth: {
                    username: config.apiUsername,
                    password: config.apiPassword
                }
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data).toHaveProperty('uniqueName');
        } catch (error: any) {
            throw new Error('Failed to get a unique name: ' + error);
        }
    });

    // Test directory operations
    describe('Directory Operations', () => {
        const testDirPath = '/test-directory-' + Date.now();

        // Test mkdir endpoint
        test('should create a directory', async () => {
            try {
                const response = await axiosInstance.post(`${config.apiEndPoint}?action=mkdir&path=${testDirPath}`, null, {
                    auth: {
                        username: config.apiUsername,
                        password: config.apiPassword
                    }
                });

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            } catch (error: any) {
                throw new Error('Failed to create directory: ' + error);
            }
        });

        // Test list endpoint
        test('should list directory contents', async () => {
            try {
                const response = await axiosInstance.get(`${config.apiEndPoint}?action=list&path=${testDirPath}`, {
                    auth: {
                        username: config.apiUsername,
                        password: config.apiPassword
                    }
                });

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data).toHaveProperty('list');
                expect(Array.isArray(response.data.list)).toBe(true);
            } catch (error: any) {
                throw new Error('Failed to list directory: ' + error);
            }
        });

        // Test rmdir endpoint
        test('should remove a directory', async () => {
            try {
                const response = await axiosInstance.delete(`${config.apiEndPoint}?action=rmdir&path=${testDirPath}`, {
                    auth: {
                        username: config.apiUsername,
                        password: config.apiPassword
                    }
                });

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            } catch (error: any) {
                throw new Error('Failed to remove directory: ' + error);
            }
        });
    });

    // Test file operations
    describe('File Operations', () => {
        let testFilePath = '/test-file-' + Date.now() + '.txt';
        const testContent = 'This is a test file content';

        // Test write endpoint
        test('should write to a file', async () => {
            try {
                const response = await axiosInstance.post(`${config.apiEndPoint}?action=write&path=${testFilePath}`, testContent, {
                    auth: {
                        username: config.apiUsername,
                        password: config.apiPassword
                    },
                    headers: {
                        'Content-Type': 'text/plain'
                    }
                });

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            } catch (error: any) {
                throw new Error('Failed to write to file: ' + error);
            }
        });

        // Test get endpoint
        test('should get file information', async () => {
            try {
                const response = await axiosInstance.get(`${config.apiEndPoint}?action=get&path=${testFilePath}`, {
                    auth: {
                        username: config.apiUsername,
                        password: config.apiPassword
                    }
                });

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.file).toHaveProperty('name');
                expect(response.data.file).toHaveProperty('size');
                expect(response.data.file.isDirectory).toBe(false);
            } catch (error: any) {
                throw new Error('Failed to get file information: ' + error);
            }
        });

        // Test read endpoint
        test('should read file content', async () => {
            try {
                const response = await axiosInstance.get(`${config.apiEndPoint}?action=read&path=${testFilePath}`, {
                    auth: {
                        username: config.apiUsername,
                        password: config.apiPassword
                    }
                });

                expect(response.status).toBe(200);
                expect(response.data).toBe(testContent);
            } catch (error: any) {
                throw new Error('Failed to read file content: ' + error);
            }
        });

        // Test chmod endpoint
        test('should change file permissions', async () => {
            try {
                const response = await axiosInstance.post(`${config.apiEndPoint}?action=chmod&path=${testFilePath}&mode=644`, null, {
                    auth: {
                        username: config.apiUsername,
                        password: config.apiPassword
                    }
                });

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            } catch (error: any) {
                throw new Error('Failed to change file permissions: ' + error);
            }
        });

        // Test rename endpoint
        test('should rename a file', async () => {
            const newFilePath = '/test-file-renamed-' + Date.now() + '.txt';

            try {
                const response = await axiosInstance.post(`${config.apiEndPoint}?action=rename&from=${testFilePath}&to=${newFilePath}`, null, {
                    auth: {
                        username: config.apiUsername,
                        password: config.apiPassword
                    }
                });

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);

                // Update testFilePath for the delete test
                testFilePath = newFilePath;
            } catch (error: any) {
                throw new Error('Failed to rename file: ' + error);
            }
        });

        // Test delete endpoint
        test('should delete a file', async () => {
            try {
                const response = await axiosInstance.delete(`${config.apiEndPoint}?action=delete&path=${testFilePath}`, {
                    auth: {
                        username: config.apiUsername,
                        password: config.apiPassword
                    }
                });

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            } catch (error: any) {
                throw new Error('Failed to delete file: ' + error);
            }
        });
    });

    // Test error handling
    describe('Error Handling', () => {
    // Test 404 error for non-existent file
        test('should handle 404 error for non-existent file', async () => {
            try {
                await axiosInstance.get(`${config.apiEndPoint}?action=get&path=/non-existent-file.txt`, {
                    auth: {
                        username: config.apiUsername,
                        password: config.apiPassword
                    }
                });

                throw new Error('Expected 404 error but got success');
            } catch (error: any) {
                expect(error.response.status).toBe(404);
            }
        });

        // Test 401 error for invalid credentials
        test('should handle 401 error for invalid credentials', async () => {
            try {
                await axios.get(`${config.apiEndPoint}?action=list&path=/`, {
                    auth: {
                        username: 'invalid',
                        password: 'invalid'
                    }
                });

                throw new Error('Expected 401 error but got success');
            } catch (error: any) {
                expect(error.response.status).toBe(401);
            }
        });
    });
});
