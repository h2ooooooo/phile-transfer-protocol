import {RestFileSystem} from './RestFileSystem';

type Command = 'DEBUG' | 'MAGIC';

export class CommandExecutor {
    protected fileSystem: RestFileSystem;

    protected commandCallbacks: Record<Command, Function> = {
        'DEBUG': this.debug,
        'MAGIC': this.magic
    };

    public constructor(fileSystem: RestFileSystem) {
        this.fileSystem = fileSystem;

        this.registerCommand('DEBUG', this.debug);
        this.registerCommand('MAGIC', this.magic);
    }

    protected registerCommand(command: Command, commandCallback: Function) {
        this.commandCallbacks[command] = commandCallback;
    }

    public isCommand(command: string) {
        return Object.keys(this.commandCallbacks).includes(command);
    }

    public executeCommand(command: string): string {
        if (this.isCommand(command)) {
            return this.commandCallbacks[command as Command].call(this.fileSystem);
        }

        throw new Error(`Unknown command: ${command}`);
    }

    public getCommands(): string[] {
        return Object.keys(this.commandCallbacks);
    }

    public debug(this: RestFileSystem): string {
        const debugSegments: Record<string, string> = {
            'cwd': this.workingDirectory,
            // Connection properties are not directly accessible in RestFileSystem
            // Removing references to this.connection to fix TypeScript errors
        };

        const debugSegmentsText = [];
        const debugSegmentLabels = Object.keys(debugSegments);

        for (const debugSegmentLabel of debugSegmentLabels) {
            const debugSegmentValue: string = debugSegments[debugSegmentLabel];

            debugSegmentsText.push(`${debugSegmentLabel}: ${debugSegmentValue}`);
        }

        return debugSegmentsText.join(' | ');
    }

    public magic(): string {
        return 'THE WORLD IS MAGIC';
    }
}
