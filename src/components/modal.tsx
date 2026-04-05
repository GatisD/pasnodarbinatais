import { X } from 'lucide-react'
import { useEffect } from 'react'

const sizeClasses = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl',
}

type ModalProps = {
  children: React.ReactNode
  onClose: () => void
  size?: keyof typeof sizeClasses
  title: string
}

export function Modal(props: ModalProps) {
  const { children, onClose, size = 'lg', title } = props

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-8"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-[rgba(2,5,2,0.8)] backdrop-blur-sm" />

      {/* Panel */}
      <div
        className={`pipboy-panel relative w-full ${sizeClasses[size]} rounded-[28px] border border-[rgba(0,255,70,0.22)] p-6 shadow-[0_0_60px_rgba(0,255,65,0.1)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <h4 className="pipboy-title text-2xl font-semibold">{title}</h4>
          <button
            type="button"
            onClick={onClose}
            className="pipboy-button h-10 w-10 shrink-0 rounded-full p-0"
            aria-label="Aizvērt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
