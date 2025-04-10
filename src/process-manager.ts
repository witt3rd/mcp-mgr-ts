import { spawn, ChildProcess } from 'child_process';
import { McpServerConfig } from './types';
import { defaultLogger, LoggerInterface } from './logger'; // Import LoggerInterface from logger.ts
import { ProcessError } from './errors';

/**
 * Manages the lifecycle of MCP server child processes.
 */
export class ProcessManager {
  private logger: LoggerInterface;
  private runningProcesses: Map<string, ChildProcess> = new Map();

  constructor(logger: LoggerInterface = defaultLogger) {
    this.logger = logger; // Use the provided logger directly
  }

  /**
   * Starts an MCP server process.
   * @param serverName - The unique name of the server.
   * @param config - The configuration for the server process.
   * @returns The spawned ChildProcess instance.
   * @throws {ProcessError} If spawning fails.
   */
  startServer(serverName: string, config: McpServerConfig): ChildProcess {
    if (this.runningProcesses.has(serverName)) {
      this.logger.warn(`Server process "${serverName}" is already running. Stopping existing process first.`);
      this.stopServer(serverName); // Ensure only one instance runs
    }

    this.logger.info(`Starting server process "${serverName}" with command: ${config.command} ${config.args?.join(' ') ?? ''}`);
    this.logger.debug(`Server "${serverName}" config:`, config);

    // Prepare environment variables
    const env = {
      ...process.env, // Inherit parent environment
      ...(config.env || {}), // Apply server-specific environment variables
    };
    // Filter out undefined values just in case
    const filteredEnv: Record<string, string> = {};
    for (const key in env) {
      if (env[key] !== undefined) {
        filteredEnv[key] = env[key] as string;
      }
    }

    try {
      const child = spawn(config.command, config.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'], // Use pipes for stdin, stdout, stderr
        env: filteredEnv,
        cwd: config.workingDir, // Set working directory if specified
        shell: false, // More secure and predictable, avoid shell interpretation unless needed
        // detached: true, // Consider if needed for independent lifecycle
      });

      this.runningProcesses.set(serverName, child);
      this.logger.info(`Server process "${serverName}" started with PID: ${child.pid}`);

      // Basic logging for stdout/stderr (more specific handling in ConnectionManager)
      child.stdout?.on('data', (data) => {
        this.logger.debug(`[${serverName} stdout]`, data.toString().trim());
      });
      child.stderr?.on('data', (data) => {
        this.logger.error(`[${serverName} stderr]`, data.toString().trim());
      });

      child.on('error', (error) => {
        this.logger.error(`Server process "${serverName}" encountered an error:`, error);
        this.runningProcesses.delete(serverName);
        // Consider emitting an event here
      });

      child.on('exit', (code, signal) => {
        this.logger.warn(`Server process "${serverName}" exited with code ${code}, signal ${signal}`);
        this.runningProcesses.delete(serverName);
        // Consider emitting an event here
      });

      return child;
    } catch (error: any) {
      this.logger.error(`Failed to spawn server process "${serverName}":`, error);
      throw new ProcessError(serverName, `Failed to spawn process: ${error.message}`, error);
    }
  }

  /**
   * Stops a running MCP server process.
   * @param serverName - The name of the server process to stop.
   * @returns True if the process was running and termination was attempted, false otherwise.
   */
  stopServer(serverName: string): boolean {
    const child = this.runningProcesses.get(serverName);
    if (child && !child.killed) {
      this.logger.info(`Stopping server process "${serverName}" (PID: ${child.pid})`);
      try {
        // Attempt graceful termination first
        const killed = child.kill('SIGTERM'); // Standard termination signal
        if (!killed) {
          this.logger.warn(`Failed to send SIGTERM to process "${serverName}", attempting SIGKILL.`);
          child.kill('SIGKILL'); // Force kill if SIGTERM fails
        }
        // Remove immediately after attempting kill, rely on 'exit' event for final cleanup confirmation
        this.runningProcesses.delete(serverName);
        return true;
      } catch (error: any) {
        this.logger.error(`Error stopping server process "${serverName}":`, error);
        // Still remove from map if stopping fails critically
        this.runningProcesses.delete(serverName);
        return false; // Indicate stopping failed
      }
    } else {
      this.logger.warn(`Server process "${serverName}" not found or already stopped.`);
      return false;
    }
  }

  /**
   * Stops all running server processes managed by this instance.
   */
  stopAllServers(): void {
    this.logger.info(`Stopping all (${this.runningProcesses.size}) managed server processes...`);
    // Create a copy of keys to avoid issues while iterating and deleting
    const serverNames = Array.from(this.runningProcesses.keys());
    serverNames.forEach(serverName => this.stopServer(serverName));
    this.logger.info('Finished attempting to stop all server processes.');
  }

  /**
   * Gets the ChildProcess instance for a running server.
   * @param serverName - The name of the server.
   * @returns The ChildProcess instance or undefined if not running.
   */
  getProcess(serverName: string): ChildProcess | undefined {
    return this.runningProcesses.get(serverName);
  }

  /**
   * Checks if a server process is currently managed and potentially running.
   * @param serverName - The name of the server.
   * @returns True if the process is in the map, false otherwise.
   */
  isRunning(serverName: string): boolean {
    return this.runningProcesses.has(serverName);
  }
}
