import { X } from 'lucide-react'
import { useEffect } from 'react'

interface InlineImageLightboxProps {
  src: string
  alt?: string | null
  onClose: () => void
}

export function InlineImageLightbox({
  src,
  alt,
  onClose,
}: InlineImageLightboxProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="正文插画大图预览"
      className="fixed inset-0 z-60 flex flex-col bg-zinc-950/92 text-white backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between px-4 py-3.5 sm:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="truncate text-sm font-medium text-zinc-200">
          {alt && alt !== 'illustration' ? alt : '正文插画预览'}
        </p>
        <button
          type="button"
          aria-label="关闭大图预览"
          onClick={onClose}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden px-4 pb-8 sm:px-10">
        <img
          src={src}
          alt={alt || '插画大图'}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[85vh] max-w-full rounded-md object-contain shadow-2xl select-none"
        />
      </div>
    </div>
  )
}
