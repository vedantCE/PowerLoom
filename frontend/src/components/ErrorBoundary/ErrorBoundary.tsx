import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { STRINGS } from '../../i18n/strings'
import type { Language } from '../../types/api'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Class component: read the language directly off the store rather
      // than the useT() hook, which requires a function component.
      const language = useAppStore.getState().language as Language
      const dict = STRINGS[language] ?? STRINGS.en

      return (
        <div className="my-8 rounded-xl border border-red-200 bg-red-50/50 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-base font-bold text-slate-900">
            {dict.errorBoundaryTitle}
          </h3>
          <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">
            {this.state.error?.message || dict.errorBoundaryDefaultMessage}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {dict.tryAgain}
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
