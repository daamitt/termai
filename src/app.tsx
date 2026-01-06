import React, { useEffect } from 'react';
import { Box } from 'ink';
import { MainShell } from './components/MainShell.js';
import { StatusSidebar } from './components/StatusSidebar.js';
import { ShellManager } from './core/ShellManager.js';
import { CommandRouter } from './core/CommandRouter.js';
import { HistoryManager } from './core/HistoryManager.js';
import { useStore } from './state/store.js';

interface AppProps {
  shellManager: ShellManager;
  commandRouter: CommandRouter;
  historyManager: HistoryManager;
}

export const App: React.FC<AppProps> = ({ shellManager, commandRouter, historyManager }) => {
  const setCommandHistory = useStore((state) => state.setCommandHistory);

  useEffect(() => {
    // Load history on mount
    historyManager.load().then(() => {
      setCommandHistory(historyManager.getHistory());
    });

    // Save history periodically
    const saveInterval = setInterval(() => {
      historyManager.save();
    }, 30000); // Save every 30 seconds

    return () => {
      clearInterval(saveInterval);
      historyManager.save();
    };
  }, [historyManager, setCommandHistory]);

  return (
    <Box flexDirection="row">
      <Box flexGrow={1} flexShrink={1}>
        <MainShell shellManager={shellManager} commandRouter={commandRouter} />
      </Box>
      {/* <Box width={30} flexShrink={0}>
        <StatusSidebar />
      </Box> */}
    </Box>
  );
};
