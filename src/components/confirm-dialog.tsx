import { Trash2 } from 'lucide-react'
import { useEffect } from 'react'

type ConfirmDialogProps = {
  message: string
  onCancel: () => void
  onConfirm: () => void
  title?: string
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { message, onCancel, onConfirm, title = 'Apstiprināt darbību' } = props

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
      if (event.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, onConfirm])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[rgba(2,5,2,0.75)] backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="pipboy-panel relative w-full max-w-sm rounded-[24px] border border-[rgba(0,255,70,0.22)] p-6 shadow-[0_0_40px_rgba(0,255,65,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(255,107,107,0.3)] bg-[rgba(255,107,107,0.08)]">
          <Trash2 className="h-5 w-5 text-[#ff6b6b]" />
        </div>

        <h4 className="pipboy-title text-lg font-semibold">{title}</h4>
        <p className="pipboy-subtle mt-2 text-sm leading-6">{message}</p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="pipboy-button pipboy-button-danger flex-1 px-4 py-2.5 text-sm font-medium"
          >
            Dzēst
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="pipboy-button flex-1 px-4 py-2.5 text-sm font-medium"
          >
            Atcelt
          </button>
        </div>
      </div>
    </div>
  )
}
