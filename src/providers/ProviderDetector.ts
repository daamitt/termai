import { spawn } from 'child_process';

export type CLIType = 'claude' | 'opencode' | 'gemini';

export class ProviderDetector {
  /**
   * Check if a CLI is available in PATH
   */
  static async isAvailable(cli: CLIType): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn('which', [cli], {
        stdio: 'ignore',
        shell: true,
      });

      process.on('exit', (code) => {
        resolve(code === 0);
      });

      process.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Detect all available CLIs
   */
  static async detectAvailable(): Promise<CLIType[]> {
    const available: CLIType[] = [];

    if (await this.isAvailable('claude')) {
      available.push('claude');
    }

    if (await this.isAvailable('opencode')) {
      available.push('opencode');
    }

    if (await this.isAvailable('gemini')) {
      available.push('gemini');
    }

    return available;
  }
}
