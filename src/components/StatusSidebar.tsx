import React from 'react';
import { Box, Text } from 'ink';
import { useStore } from '../state/store.js';

export const StatusSidebar: React.FC = () => {
  const { commandHistory, serverStatus } = useStore();

  const recentAICommands = commandHistory.filter((h) => h.isAI).slice(-10).reverse();

  const statusColor =
    serverStatus === 'running'
      ? 'green'
      : serverStatus === 'starting'
        ? 'yellow'
        : serverStatus === 'error'
          ? 'red'
          : 'gray';

  return (
    <Box flexDirection="column" paddingLeft={1} borderLeft borderStyle="single" borderColor="gray">
      <Text bold color="green">
        termai
      </Text>
      <Text dimColor>──────────────</Text>

      <Box marginTop={1}>
        <Text color="cyan">Serverssss: </Text>
        <Text color={statusColor}>●</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="yellow">AI History:</Text>
        {recentAICommands.length === 0 ? (
          <Text dimColor>None</Text>
        ) : (
          recentAICommands.slice(0, 5).map((cmd, idx) => (
            <Text key={idx} color="gray">
              {cmd.command.slice(0, 25)}
            </Text>
          ))
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>^C exit</Text>
      </Box>
    </Box>
  );
};
