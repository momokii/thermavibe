import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useKioskStore } from '@/stores/kioskStore';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(_prevProps: Props, prevState: State) {
    if (this.state.hasError && !prevState.hasError) {
      this.resetTimer = setTimeout(() => {
        useKioskStore.getState().reset();
        this.setState({ hasError: false });
      }, 3000);
    }
  }

  componentWillUnmount() {
    if (this.resetTimer) clearTimeout(this.resetTimer);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-kiosk-background">
          <h2 className="text-3xl font-bold text-kiosk-text mb-2">Something went wrong</h2>
          <p className="text-kiosk-text/60">Restarting...</p>
        </div>
      );
    }
    return this.props.children;
  }
}
