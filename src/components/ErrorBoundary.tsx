import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorDetails = null;
      try {
        if (this.state.error?.message) {
          errorDetails = JSON.parse(this.state.error.message);
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-stone-200">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-serif font-bold text-stone-900 mb-4">문제가 발생했습니다</h1>
            <p className="text-stone-600 mb-8">
              {errorDetails 
                ? "데이터베이스 권한 설정에 문제가 있는 것 같습니다. 관리자에게 문의하거나 다시 시도해 주세요."
                : "애플리케이션 실행 중 예상치 못한 오류가 발생했습니다."}
            </p>
            
            {errorDetails && (
              <div className="mb-8 p-4 bg-stone-50 rounded-xl text-left text-xs font-mono text-stone-500 overflow-auto max-h-40">
                <p>Operation: {errorDetails.operationType}</p>
                <p>Path: {errorDetails.path}</p>
                <p>Error: {errorDetails.error}</p>
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full py-3 px-6 bg-stone-900 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-stone-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              다시 시도하기
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
