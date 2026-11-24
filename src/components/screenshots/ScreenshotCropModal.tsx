import { useEffect, useRef, useState } from 'react'
import { Button } from '../base/Button.js'
import { useScreenshots } from '../../services/native/screenshots.js'

type Rect = { x: number; y: number; w: number; h: number }

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(0,0,0,.85)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  padding: 16,
  color: '#fff',
}

/** 拖拽裁剪一张新截图，确认后交给调用方（attach 到当前输入框）。 */
export const ScreenshotCropModal = ({
  dataUrl,
  onCancel,
  onConfirm,
}: {
  dataUrl: string
  onCancel: () => void
  onConfirm: (file: File) => void
}) => {
  const imgRef = useRef<HTMLImageElement>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const point = (event: React.PointerEvent): { x: number; y: number } => {
    const img = imgRef.current
    if (!img) return { x: 0, y: 0 }
    const box = img.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(box.width, event.clientX - box.left)),
      y: Math.max(0, Math.min(box.height, event.clientY - box.top)),
    }
  }

  const begin = (event: React.PointerEvent) => {
    drag.current = point(event)
    setRect({ ...drag.current, w: 0, h: 0 })
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
  }

  const move = (event: React.PointerEvent) => {
    if (!drag.current) return
    const current = point(event)
    const x = Math.min(drag.current.x, current.x)
    const y = Math.min(drag.current.y, current.y)
    setRect({ x, y, w: Math.abs(current.x - drag.current.x), h: Math.abs(current.y - drag.current.y) })
  }

  const crop = async (): Promise<void> => {
    const img = imgRef.current
    if (!img) return
    const box = img.getBoundingClientRect()
    const scale = img.naturalWidth / box.width
    const area = rect && rect.w > 8 && rect.h > 8 ? rect : { x: 0, y: 0, w: box.width, h: box.height }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(area.w * scale)
    canvas.height = Math.round(area.h * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(
      img,
      area.x * scale,
      area.y * scale,
      area.w * scale,
      area.h * scale,
      0,
      0,
      canvas.width,
      canvas.height
    )
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.92)
    )
    if (!blob) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    onConfirm(new File([blob], `screenshot-${stamp}.jpg`, { type: 'image/jpeg' }))
  }

  return (
    <div style={overlay}>
      <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 760, alignItems: 'center' }}>
        <span style={{ flex: 1, fontSize: 13, opacity: 0.8 }}>
          拖拽框选要发给 AI 的区域，直接点「发送整张」也行
        </span>
        <Button variant="outlined" size="m" onClick={onCancel}>
          取消
        </Button>
        <Button variant="primary" size="m" onClick={() => void crop()}>
          {rect && rect.w > 8 ? '发送选区' : '发送整张'}
        </Button>
      </div>
      <div style={{ position: 'relative', maxWidth: 760, maxHeight: '70vh' }}>
        <img
          ref={imgRef}
          src={dataUrl}
          alt="截图"
          style={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', userSelect: 'none', touchAction: 'none' }}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={() => (drag.current = null)}
        />
        {rect && rect.w > 2 ? (
          <div
            style={{
              position: 'absolute',
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              border: '2px solid #4d9fff',
              background: 'rgba(77,159,255,.15)',
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

/** 挂在输入框里：有新截图就弹裁剪框，确认后作为附件加进当前草稿。 */
export const ScreenshotImportHost = ({ onAttach }: { onAttach: (file: File) => void }) => {
  const candidates = useScreenshots((state) => state.candidates)
  const shift = useScreenshots((state) => state.shift)
  const clear = useScreenshots((state) => state.clear)
  if (candidates.length === 0) {
    return null
  }
  return (
    <ScreenshotCropModal
      dataUrl={candidates[0]}
      onCancel={() => clear()}
      onConfirm={(file) => {
        shift()
        onAttach(file)
      }}
    />
  )
}
