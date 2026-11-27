import { useState } from 'react'
import { COVERS, SIZES, SIZE_ORDER, isLight, type Notebook } from '../types'

interface Props {
  initial?: Notebook
  submitLabel: string
  onSubmit: (nb: Notebook) => void
  onCancel?: () => void
}

/** 살짝 비스듬히 놓인 입체 노트: 앞표지, 책등, 종이 단면, 고무줄, 가름끈. opening이면 표지가 넘어가며 첫 장이 드러난다. */
export function Notebook3D({
  cover,
  light,
  title,
  year,
  ratio,
  height = 280,
  opening = false,
  closing = false,
}: {
  cover: string
  light: boolean
  title: string
  year: number
  ratio: number
  height?: number
  opening?: boolean
  closing?: boolean
}) {
  const H = height
  const W = Math.round(H * ratio)
  return (
    <div className="book-stage">
      <div className={'book' + (opening ? ' opening' : '') + (closing ? ' closing' : '')} style={{ width: W, height: H, ['--cover' as string]: cover }}>
        <div className="book-face back" />
        {/* 뒤표지 판 안쪽: 펼쳤을 때 오른쪽 종이 밑에 받쳐 보인다 */}
        <div className="book-face board" />
        <div className="book-face spine" />
        <div className="book-face pages-right" />
        <div className="book-face pages-top" />
        <div className="book-face pages-bottom" />
        <div className="book-face firstpage" />
        {/* 펼칠 때 차르륵 넘어가는 속지 */}
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="book-face leaf" style={{ ['--i' as string]: i }} />
        ))}
        {/* 표지 안쪽(면지): 표지를 넘길 때 보인다 */}
        <div className="book-face front-inside" />
        <div className="book-face front" style={{ color: light ? '#2b2a28' : '#f3ede1' }}>
          <div className="book-sheen" />
          <div className="book-title">{title}</div>
          <div className="book-year">{year}</div>
          <div className="book-band" />
        </div>
        <div className="book-ribbon" />
      </div>
      <div className="book-shadow" style={{ width: W * 1.05 }} />
    </div>
  )
}

export default function NotebookForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '나의 노트')
  const [size, setSize] = useState(initial?.size ?? 'medium')
  const [cover, setCover] = useState(initial?.cover ?? COVERS[0].color)
  const year = new Date().getFullYear()
  const light = isLight(cover)
  const s = SIZES[size]

  return (
    <form
      className="nb-form"
      onSubmit={(e) => {
        e.preventDefault()
        // 이름은 비워 둬도 된다 (표지에 제목 없이)
        onSubmit({ name: name.trim(), size, cover })
      }}
    >
      <div className="nb-preview-wrap">
        <Notebook3D cover={cover} light={light} title={name} year={year} ratio={s.cols / s.rows} />
      </div>

      <div className="nb-fields">
        <label className="field">
          <span>노트 이름</span>
          <input value={name} maxLength={30} placeholder="비워 두면 이름 없는 노트" onChange={(e) => setName(e.target.value)} />
        </label>

        <fieldset className="field">
          <legend>크기</legend>
          <div className="size-grid">
            {SIZE_ORDER.map((k) => {
              const v = SIZES[k]
              return (
                <button
                  type="button"
                  key={k}
                  className={'size-card' + (k === size ? ' on' : '')}
                  onClick={() => setSize(k)}
                  aria-pressed={k === size}
                >
                  <span className="size-shape" style={{ width: v.cols * 1.1, height: v.rows * 1.1 }} />
                  <span className="size-label">{v.label}</span>
                  <span className="size-sub">
                    {v.mm}mm · {v.cols}×{v.rows}칸
                  </span>
                </button>
              )
            })}
          </div>
          {initial && initial.size !== size && (
            <p className="hint">크기를 바꾸면 새로 만드는 페이지부터 적용돼요. 이미 쓴 페이지는 그대로예요.</p>
          )}
        </fieldset>

        <fieldset className="field">
          <legend>표지 색</legend>
          <div className="cover-row">
            {COVERS.map((c) => (
              <button
                type="button"
                key={c.color}
                className={'swatch' + (c.color === cover ? ' on' : '')}
                style={{ background: c.color }}
                title={c.name}
                aria-label={c.name}
                aria-pressed={c.color === cover}
                onClick={() => setCover(c.color)}
              />
            ))}
          </div>
        </fieldset>

        <div className="form-actions">
          {onCancel && (
            <button type="button" className="btn ghost" onClick={onCancel}>
              취소
            </button>
          )}
          <button type="submit" className="btn primary">
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  )
}
