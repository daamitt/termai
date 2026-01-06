import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { ShellManager } from '../core/ShellManager.js';
import { CommandRouter } from '../core/CommandRouter.js';
import { useStore } from '../state/store.js';

interface MainShellProps {
  shellManager: ShellManager;
  commandRouter: CommandRouter;
}

export const MainShell: React.FC<MainShellProps> = ({ shellManager, commandRouter }) => {
  const [output, setOutput] = useState<string[]>([]);
  const [inputBuffer, setInputBuffer] = useState('');
  const { exit } = useApp();
  const addToHistory = useStore((state) => state.addToHistory);

  useEffect(() => {
    shellManager.onData((data) => {
      // Write directly to stdout instead of capturing
      process.stdout.write(data);
      setOutput((prev) => [...prev, data].slice(-100));
    });

    // Handle terminal resize
    const handleResize = () => {
      if (process.stdout.columns && process.stdout.rows) {
        shellManager.resize(process.stdout.columns - 30, process.stdout.rows);
      }
    };

    process.stdout.on('resize', handleResize);
    handleResize();

    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, [shellManager]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    if (key.return) {
      // Submit command
      const command = inputBuffer;
      setInputBuffer('');

      if (command.trim()) {
        const isAI = command.trim().startsWith('#');
        addToHistory(command, isAI);
        commandRouter.route(command);
      } else {
        shellManager.write('\r');
      }
    } else if (key.backspace || key.delete) {
      setInputBuffer((prev) => prev.slice(0, -1));
    } else if (!key.ctrl && !key.meta && input) {
      setInputBuffer((prev) => prev + input);
    }
  });

  // Don't render shell output through Ink - it writes directly to stdout
  return null;
};
