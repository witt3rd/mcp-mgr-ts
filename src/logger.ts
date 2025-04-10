export interface LoggerInterface {
    debug: (...args: any[]) => void;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
}

export class ConsoleLogger implements LoggerInterface {
    private prefix: string;

    constructor(prefix = '[McpManager]') {
        this.prefix = prefix;
    }

    private log(level: string, ...args: any[]) {
        const timestamp = new Date().toISOString();
        console.log(`${timestamp} ${this.prefix} [${level.toUpperCase()}]`, ...args);
    }

    debug(...args: any[]): void {
        if (process.env.NODE_ENV === 'development') {
            this.log('debug', ...args);
        }
    }

    info(...args: any[]): void {
        this.log('info', ...args);
    }

    warn(...args: any[]): void {
        this.log('warn', ...args);
    }

    error(...args: any[]): void {
        this.log('error', ...args);
    }
}

export const defaultLogger = new ConsoleLogger();
