/**
 * ErrorBoundary Component
 * Catches unhandled React errors and displays a recovery UI
 * instead of crashing to a white screen.
 *
 * @author Subash Karki
 */
import { Component, type ReactNode } from 'react';
import { Button, Center, Stack, Text, Title } from '@mantine/core';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Center h="100vh">
          <Stack align="center" gap="md">
            <Title order={3}>System Error</Title>
            <Text size="sm" c="dimmed">
              {this.state.error?.message}
            </Text>
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.hash = '#cockpit';
              }}
            >
              Return to Cockpit
            </Button>
          </Stack>
        </Center>
      );
    }
    return this.props.children;
  }
}
