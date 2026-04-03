import { useRef } from 'react'
import { CalendarDays } from 'lucide-react'

import { cn } from '@/lib/utils'

type PickerInputProps = {
  className?: string
  onChange: React.ChangeEventHandler<HTMLInputElement>
  type: 'date' | 'month'
  value: string
}

export function PickerInput(props: PickerInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  function openPicker() {
    if (inputRef.current?.showPicker) {
      inputRef.current.showPicker()
      return
    }

    inputRef.current?.focus()
    inputRef.current?.click()
  }

  return (
    <div className="pipboy-picker">
      <input
        ref={inputRef}
        type={props.type}
        value={props.value}
        onChange={props.onChange}
        onClick={openPicker}
        className={cn('pipboy-input pipboy-picker-input px-4 py-3 pr-14', props.className)}
      />
      <button type="button" onClick={openPicker} className="pipboy-picker-button" aria-label="Atvērt datuma izvēli">
        <CalendarDays className="h-4 w-4" />
      </button>
    </div>
  )
}
