import { AIProvider } from './AIProvider.js';
import { OpenCodeProvider } from './OpenCodeProvider.js';
import { ClaudeCodeProvider } from './ClaudeCodeProvider.js';
import { GeminiProvider } from './GeminiProvider.js';
import { ProviderDetector, CLIType } from './ProviderDetector.js';
import { ConfigManager } from '../core/ConfigManager.js';
import * as readline from 'readline';

export class ProviderFactory {
  /**
   * Create a provider based on configuration and availability
   */
  static async create(options: {
    cliOverride?: CLIType;
    port?: number;
    debug?: boolean;
  }): Promise<{ provider: AIProvider; cliType: CLIType }> {
    const configManager = new ConfigManager();
    await configManager.load();

    // 1. If CLI explicitly specified via --cli flag, use it
    if (options.cliOverride) {
      const available = await ProviderDetector.isAvailable(options.cliOverride);
      if (!available) {
        throw new Error(
          `${options.cliOverride} CLI not found. Please install it first.\n` +
            `  - Claude Code: https://claude.com/download\n` +
            `  - OpenCode: https://opencode.ai/docs/cli/\n` +
            `  - Gemini CLI: https://geminicli.com/docs/cli/headless/`
        );
      }
      return {
        provider: this.createProvider(options.cliOverride, options, configManager),
        cliType: options.cliOverride,
      };
    }

    // 2. Check config file for preference
    const preferredCLI = configManager.getPreferredCLI();
    if (preferredCLI) {
      const available = await ProviderDetector.isAvailable(preferredCLI);
      if (available) {
        return {
          provider: this.createProvider(preferredCLI, options, configManager),
          cliType: preferredCLI,
        };
      }
      console.warn(
        `\nWarning: Configured CLI '${preferredCLI}' not found, detecting alternatives...\n`
      );
    }

    // 3. Auto-detect available CLIs
    const availableCLIs = await ProviderDetector.detectAvailable();

    if (availableCLIs.length === 0) {
      throw new Error(
        'No AI CLI found. Please install one of the following:\n' +
          '  - Claude Code: https://claude.com/download\n' +
          '  - OpenCode: https://opencode.ai/docs/cli/\n' +
          '  - Gemini CLI: https://geminicli.com/docs/cli/headless/'
      );
    }

    // 4. If only one CLI available, use it
    if (availableCLIs.length === 1) {
      const cliType = availableCLIs[0];
      console.log(`Using ${cliType} (only available CLI)`);

      // Save preference for next time
      configManager.setPreferredCLI(cliType);
      await configManager.save();

      return {
        provider: this.createProvider(cliType, options, configManager),
        cliType,
      };
    }

    // 5. Multiple CLIs available - prompt user
    const selectedCLI = await this.promptUserForCLI(availableCLIs);

    // Save preference
    configManager.setPreferredCLI(selectedCLI);
    await configManager.save();

    return {
      provider: this.createProvider(selectedCLI, options, configManager),
      cliType: selectedCLI,
    };
  }

  /**
   * Prompt user to choose between available CLIs
   */
  private static async promptUserForCLI(available: CLIType[]): Promise<CLIType> {
    console.log('\nMultiple AI CLIs detected:');
    available.forEach((cli, i) => {
      console.log(`  ${i + 1}. ${cli}`);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(`\nWhich would you like to use? (1-${available.length}): `, (answer) => {
        rl.close();
        const index = parseInt(answer.trim()) - 1;

        if (index >= 0 && index < available.length) {
          const selected = available[index];
          console.log(
            `\nUsing ${selected}. This preference will be saved to ~/.termai_config`
          );
          console.log(`You can change it later with: termai --cli <claude|opencode|gemini>\n`);
          resolve(selected);
        } else {
          // Default to first option
          console.log(`Invalid selection, defaulting to ${available[0]}\n`);
          resolve(available[0]);
        }
      });
    });
  }

  /**
   * Create the appropriate provider instance
   */
  private static createProvider(
    cliType: CLIType,
    options: { port?: number; debug?: boolean },
    configManager: ConfigManager
  ): AIProvider {
    switch (cliType) {
      case 'opencode':
        return new OpenCodeProvider({
          port: options.port || configManager.getOpenCodePort() || 4096,
          debug: options.debug,
        });

      case 'claude':
        return new ClaudeCodeProvider({
          sessionId: configManager.getClaudeSession(),
          debug: options.debug,
        });

      case 'gemini':
        return new GeminiProvider({
          debug: options.debug,
        });

      default:
        throw new Error(`Unknown CLI type: ${cliType}`);
    }
  }
}
