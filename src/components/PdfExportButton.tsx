import { PdfIcon } from './icons'

/**
 * 제목 줄의 PDF 단추.
 *
 * 마크다운 문서와 첨부(그림·표·엑셀·워드)가 같은 단추를 씁니다. 두 자리에 따로 적어
 * 두었더니 한쪽만 고쳐져 낯이 달라졌습니다.
 *
 * 뜨는 동안에는 잠가 둡니다. 몇 초 걸리는 일이라, 눌리는 채로 두면 사람이 두 번 눌러
 * 같은 파일을 두 벌 뜨게 됩니다.
 */
export function PdfExportButton({ busy, onExport }: { busy: boolean; onExport: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-small head-pdf"
      data-tip="보고 있는 그대로 PDF 파일로 냅니다"
      disabled={busy}
      onClick={onExport}
    >
      <PdfIcon />
      {busy ? '만드는 중…' : 'PDF'}
    </button>
  )
}
