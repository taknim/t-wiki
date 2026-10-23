import { createRoot } from 'react-dom/client'
import type { AssetIndex, DocIndex } from '../types'
import { applyLightTheme, paletteFor, type ThemeSettings } from '../lib/theme'
import { PDF_LEADING, PDF_TEXT_SIZE, SHEET_WIDTH, sheetToPdf } from '../lib/pdfExport'
import { ThemeContext } from './themeContext'
import { Preview } from './Preview'
import { TextPreview } from './TextPreview'
import { SheetPreview, WordPreview } from './OfficePreview'

/** 앞머리(frontmatter)에 적어 둔 것. 화면에서 글 위에 서 있는 그대로 함께 냅니다. */
export interface PdfField {
  key: string
  values: string[]
}

export interface PdfJob {
  /** 어떻게 그려서 낼 것인지. 화면에서 그 파일을 그리는 방식과 같습니다. */
  kind: 'markdown' | 'table' | 'sheet' | 'word'
  path: string
  /** 마크다운 본문이나 표 원문. 파일에서 읽어 오는 종류(엑셀·워드)에는 없습니다. */
  text?: string
  fields?: PdfField[]
  root: FileSystemDirectoryHandle
  index: DocIndex
  assets: AssetIndex
  /** 사람이 고른 글꼴·글자 크기·줄 간격. 색만 밝은 벌로 바꿔 씁니다. */
  settings: ThemeSettings
}

/**
 * PDF 로 낼 글을 그리는 자리.
 *
 * **화면에서 쓰는 그 부품으로 그립니다.** 표와 글을 PDF 쪽에서 다시 짜 맞추는 길은
 * 버렸습니다 — 그러면 같은 표를 두 군데서 그리게 되고, 한쪽을 고칠 때마다 다른 쪽이
 * 조용히 낡습니다. 같은 부품을 쓰면 보던 것과 나온 것이 어긋날 길이 없습니다.
 */
/*
 * 이 부품과 그것을 띄우는 함수가 한 파일에 있습니다. 고쳐 가며 보는 화면(fast refresh)의
 * 몫이 줄어든다는 경고가 붙지만, 이 부품은 화면에 서지 않습니다 — 띄웠다 거두는 일과
 * 그려지는 모양이 한 몸이라 가르면 둘이 따로 낡습니다.
 */
// eslint-disable-next-line react-refresh/only-export-components
function PdfSheet({ job }: { job: PdfJob }) {
  return (
    <>
      {job.fields && job.fields.length > 0 && (
        <dl className="frontmatter">
          {job.fields.map((field) => (
            <div key={field.key}>
              <dt>{field.key}</dt>
              <dd>
                {field.values.length === 0
                  ? <span className="fm-empty">—</span>
                  : field.values.map((value) => (
                      <span key={value} className="fm-value">{value}</span>
                    ))}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {job.kind === 'markdown' && (
        <Preview
          markdown={job.text ?? ''}
          index={job.index}
          assets={job.assets}
          root={job.root}
          docPath={job.path}
          onOpenLink={() => {}}
          onToggleTask={() => {}}
        />
      )}
      {job.kind === 'table' && <TextPreview kind="table" path={job.path} text={job.text ?? ''} />}
      {job.kind === 'sheet' && <SheetPreview root={job.root} path={job.path} flat />}
      {job.kind === 'word' && <WordPreview root={job.root} path={job.path} />}
    </>
  )
}

/** 그리기를 기다릴 최대 시간. 큰 엑셀은 벌을 내려받고 읽는 데만 몇 초가 걸립니다. */
const READY_TIMEOUT = 30_000
const TICK = 150

/**
 * 다 그려졌는지 기다립니다.
 *
 * 그리는 일이 죄다 비동기입니다. 마크다운은 220ms 를 기다렸다 그리고, 그림은 blob 주소를
 * 받아 따로 읽히고, 엑셀·워드는 읽는 벌을 내려받은 뒤에야 글이 서고, 다이어그램은 mermaid
 * 가 SVG 를 돌려준 다음입니다. 하나라도 덜 된 채로 떠서 담으면 그 자리가 빈 PDF 가 나옵니다.
 *
 * 기다리는 일마다 끝났다는 신호를 받아 오는 길은 버렸습니다 — 화면에 쓰는 부품 넷에 모두
 * 그 신호를 달아야 하고, 그러면 PDF 때문에 화면 부품이 어수선해집니다. 대신 **멎을 때까지**
 * 봅니다. 키가 두 번 잇달아 그대로이고 읽는 중이라는 표시가 없으면 다 그려진 것입니다.
 *
 * 시간이 다 되면 그때까지 그려진 것으로 뜹니다. 아주 큰 파일에서 몇 초가 모자랐다고
 * 여태 그린 것을 버리고 빈손으로 돌아가는 것보다는 낫습니다.
 */
async function settled(sheet: HTMLElement): Promise<void> {
  await document.fonts.ready

  const until = Date.now() + READY_TIMEOUT
  let last = -1
  let same = 0

  while (Date.now() < until) {
    await new Promise((done) => window.setTimeout(done, TICK))

    const busy = sheet.querySelector('.asset-note') !== null
      || sheet.querySelector('.mermaid-block:not([data-rendered])') !== null
      || [...sheet.querySelectorAll('img')].some((image) => !image.complete)
    const height = sheet.scrollHeight

    if (!busy && height > 0 && height === last) {
      same += 1
      if (same >= 2) return
    } else {
      same = 0
    }
    last = height
  }
}

/**
 * 보던 파일을 PDF 한 벌로 냅니다.
 *
 * 화면에 있는 칸을 그대로 뜨지 않고 **눈에 보이지 않는 자리에 다시 그려서** 뜹니다.
 * 보이는 칸을 뜨면 창을 넓혀 둔 사람과 좁혀 둔 사람의 PDF 가 달라지고, 나란히 보기에서는
 * 반 폭짜리가 나오며, 편집만 하고 있던 문서에서는 뜰 것이 아예 없습니다.
 */
export async function exportDocumentPdf(job: PdfJob): Promise<Blob> {
  const host = document.createElement('div')
  host.className = 'pdf-sheet'
  host.style.width = `${SHEET_WIDTH}px`
  applyLightTheme(host, job.settings)
  /*
   * 종이는 **흰 바탕**입니다.
   *
   * 테마의 바탕색을 그대로 쓰면 글이 앉은 자리만 누렇고(세피아 같은 테마) 네 변의 여백은
   * 희어, 쪽 한가운데에 색종이를 붙여 놓은 꼴이 됩니다. 쪽 전체를 그 색으로 칠하는 길은
   * 버렸습니다 — 종이 한 장을 꽉 채워 칠하는 일이라 잉크를 들이켭니다.
   * 글자·강조·표 머리·코드 칸의 색은 고른 테마 그대로 둡니다. 그쪽은 흰 바탕 위에서
   * 옅은 음영으로 읽혀, 화면에서 보던 결이 남습니다.
   */
  host.style.setProperty('--bg', '#ffffff')
  /*
   * 본문 너비 설정은 쓰지 않습니다. 종이에서는 **쪽 너비가 자**입니다.
   * 스타일시트가 아니라 여기서 적습니다 — 바로 위 applyLightTheme 가 같은 값을 칸에
   * 직접 적어 두므로, 스타일시트에 적은 것은 덮여 아무 일도 하지 않습니다.
   */
  host.style.setProperty('--doc-width', 'none')
  /*
   * 글자는 화면에서 보던 것보다 작게, 줄도 촘촘히. 종이는 쪽 수가 곧 무게입니다.
   * 까닭은 pdfExport 의 PDF_TEXT_SIZE 에 적어 두었습니다.
   */
  host.style.setProperty('--doc-size', PDF_TEXT_SIZE)
  host.style.setProperty('--doc-leading', PDF_LEADING)
  document.body.append(host)

  const root = createRoot(host)
  /*
   * 테마 값을 손으로 지어 넣습니다. ThemeProvider 를 한 벌 더 띄우면 그쪽도 <html> 에
   * 색을 얹어, PDF 를 뜨는 동안 보던 화면의 색이 바뀝니다.
   * 다이어그램도 이 값을 보고 그려지므로 여기서 밝은 벌을 못 박아 둡니다.
   */
  const light: ThemeSettings = { ...job.settings, mode: 'light' }
  root.render(
    <ThemeContext.Provider
      value={{
        settings: light,
        isDark: false,
        palette: paletteFor(light, false),
        update: () => {},
      }}
    >
      <PdfSheet job={job} />
    </ThemeContext.Provider>,
  )

  try {
    await settled(host)
    const failed = host.querySelector('.status-error')
    if (failed) throw new Error(failed.textContent ?? '파일을 읽지 못했습니다.')
    return await sheetToPdf(host)
  } finally {
    root.unmount()
    host.remove()
  }
}
