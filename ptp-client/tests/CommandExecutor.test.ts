import {RestFileSystem} from '../src/RestFileSystem';
import {CommandExecutor} from '../src/CommandExecutor';

describe('CommandExecutor', () => {
    let fs: RestFileSystem;
    let executor: CommandExecutor;

    beforeEach(() => {
        // Minimal mock of RestFileSystem
        fs = {
            workingDirectory: '/home/test',
        } as any;
        executor = new CommandExecutor(fs);
    });

    test('should recognize built-in commands', () => {
        expect(executor.isCommand('DEBUG')).toBe(true);
        expect(executor.isCommand('MAGIC')).toBe(true);
        expect(executor.isCommand('UNKNOWN')).toBe(false);
    });

    test('should execute MAGIC command', () => {
        const result = executor.executeCommand('MAGIC');

        expect(result).toBe('THE WORLD IS MAGIC');
    });

    test('should execute DEBUG command', () => {
        const result = executor.executeCommand('DEBUG');

        expect(result).toContain('cwd: /home/test');
    });

    test('should throw error for unknown command', () => {
        expect(() => executor.executeCommand('UNKNOWN')).toThrow('Unknown command: UNKNOWN');
    });

    test('should list commands', () => {
        const commands = executor.getCommands();

        expect(commands).toContain('DEBUG');
        expect(commands).toContain('MAGIC');
    });
});
