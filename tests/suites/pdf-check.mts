import {
  canExportPdf, CONTENT_HEIGHT, CONTENT_WIDTH, fitOnPage, pageBreaks, PAGE_HEIGHT, PAGE_MARGIN,
  PAGE_WIDTH, PDF_LEADING, PDF_TEXT_SIZE, pdfNameFor, rasterScale, SHEET_WIDTH,
} from '../../src/lib/pdfExport'
import { LEADINGS, SIZES } from '../../src/lib/theme'

/*
 * PDF 로 낼 때의 셈만 따로 잽니다. 쪽을 어디서 가르는지, 그림을 어느 자리에 앉히는지.
 */

let problems = 0
const ok = (name: string) => console.log('  ok  ' + name)
const fail = (name: string, detail: string) => {
  problems++
  console.log('FAIL  ' + name + '\n      ' + detail)
}
const expect = (name: string, condition: boolean, detail = '') => (condition ? ok(name) : fail(name, detail))
const same = (name: string, got: unknown, want: unknown) =>
  (JSON.stringify(got) === JSON.stringify(want) ? ok(name) : fail(name, `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`))

console.log('\n>>> 1. 그려서 보여 주는 것만 낸다')
expect('마크다운', canExportPdf('회의록.md'))
expect('표', canExportPdf('매출.csv') && canExportPdf('매출.tsv'))
expect('엑셀', canExportPdf('판매표.xlsx') && canExportPdf('옛판매표.xls'))
expect('워드', canExportPdf('안내문.docx'))
/*
 * 그림은 빠집니다. 종이로 내는 일을 **수정 화면의 형식 고르기**(PNG·JPG·PDF)로 옮겼습니다.
 * 보는 화면에도 단추를 두면 손질하려던 사람은 파일을 한 번 만들어 남기고 그것을 다시 열어
 * 눌러야 했습니다.
 */
expect('그림은 보는 화면에서 내지 않음',
  ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico']
    .every((one) => !canExportPdf(`그림.${one}`)))
// 글자를 글자 그대로(또는 강조만 입혀) 보여 주는 것은 PDF 로 감싸도 더해지는 것이 없습니다.
same('그냥 글은 아님', [canExportPdf('메모.txt'), canExportPdf('어제.log')], [false, false])
same('코드도 아님', [canExportPdf('도구.py'), canExportPdf('설정.json'), canExportPdf('쪽.html')],
  [false, false, false])
// 앱이 아직 그려 보여 주지 못하는 형식입니다. 낼 그림이 없습니다.
same('못 그리는 문서는 아님',
  ['test.pptx', 'test.ppt', 'test.hwp', 'test.hwpx', 'test.doc'].map(canExportPdf),
  [false, false, false, false, false])
same('압축·PDF 는 아님', [canExportPdf('자료.zip'), canExportPdf('안내.pdf')], [false, false])

console.log('\n>>> 2. 이름은 원래 것 뒤에 .pdf 를 덧붙인다')
/*
 * 확장자를 갈아 치우지 않습니다. 갈아 치우면 `판매표.xlsx` 와 `판매표.csv` 가 둘 다
 * `판매표.pdf` 가 되어, 한 자리에 모아 둘 때 뒤에 낸 것이 앞의 것을 말없이 덮습니다.
 */
same('마크다운', pdfNameFor('회의/주간 회의.md'), '주간 회의.md.pdf')
same('엑셀', pdfNameFor('판매표.xlsx'), '판매표.xlsx.pdf')
// 같은 이름의 다른 형식은 다른 PDF 가 됩니다.
expect('형식이 다르면 이름도 다름', pdfNameFor('판매표.xlsx') !== pdfNameFor('판매표.csv'),
  pdfNameFor('판매표.csv'))
same('두 번 찍힌 확장자', pdfNameFor('자료.2026.xlsx'), '자료.2026.xlsx.pdf')
same('확장자가 없어도 그대로 붙임', pdfNameFor('README'), 'README.pdf')
same('숨은 파일', pdfNameFor('.gitignore'), '.gitignore.pdf')

console.log('\n>>> 3. 쪽은 A4 세로, 네 변에 여백을 둔다')
same('A4 포인트', [PAGE_WIDTH, PAGE_HEIGHT], [595.28, 841.89])
same('여백 12.7mm', PAGE_MARGIN, 36)
same('글 자리', [CONTENT_WIDTH, CONTENT_HEIGHT], [523.28, 769.89])
// 1pt = 1/72인치, CSS 1px = 1/96인치. 포인트 자리를 4/3 배 하면 픽셀 자리입니다.
same('글을 앉히는 너비', SHEET_WIDTH, 698)

console.log('\n>>> 3-2. 종이의 글자는 화면에서 고를 수 있는 어느 크기보다 작다')
/*
 * 화면은 한 번에 한 화면만 보여 주므로 넉넉한 편이 읽기 좋지만, 종이는 쪽 수가 곧
 * 무게입니다. 고를 수 있는 가장 작은 값(13px)보다도 작아야 "작게 뽑았다" 가 됩니다.
 */
const smallest = Math.min(...SIZES.map((one) => Number.parseFloat(one.value)))
expect('가장 작은 화면 글자보다 작음', Number.parseFloat(PDF_TEXT_SIZE) < smallest,
  `${PDF_TEXT_SIZE} ≥ ${smallest}px`)
// 글자만 줄이면 줄 사이만 허옇게 벌어집니다. 줄 간격도 함께 줄입니다.
const normal = LEADINGS.find((one) => one.id === 'normal')
expect('줄 간격도 보통보다 촘촘함', Number(PDF_LEADING) < Number(normal?.value),
  `${PDF_LEADING} ≥ ${normal?.value}`)
// 그렇다고 읽을 수 없을 만큼 줄이지는 않습니다. 9pt 가 바닥입니다.
expect('9pt(12px) 밑으로는 내려가지 않음', Number.parseFloat(PDF_TEXT_SIZE) >= 12, PDF_TEXT_SIZE)
expect('줄 간격도 가장 좁은 값보다는 넓음',
  Number(PDF_LEADING) > Math.min(...LEADINGS.map((one) => Number(one.value))), PDF_LEADING)

console.log('\n>>> 4. 끊어도 되는 자리에서 쪽을 가른다')
// 한 쪽에 100 씩. 110 과 190 에서 끊을 수 있으면 190 까지 채워 넣습니다.
same('들어가는 가장 아래 자리', pageBreaks([110, 190, 260], 300, 200), [190])
same('한 쪽에 들어가면 가르지 않음', pageBreaks([50], 90, 100), [])
same('꼭 맞으면 가르지 않음', pageBreaks([50], 100, 100), [])
same('여러 쪽', pageBreaks([90, 180, 270, 360], 400, 100), [90, 180, 270, 360])
// 끊을 자리가 아예 없으면(아주 큰 그림 한 장) 어쩔 수 없이 가운데를 자릅니다.
same('끊을 자리가 없으면 정해진 높이로', pageBreaks([], 250, 100), [100, 200])
// 한 덩어리가 쪽보다 길 때도 마찬가지입니다. 자르지 않으면 어느 쪽에도 못 들어갑니다.
same('덩어리가 쪽보다 길면', pageBreaks([5, 500], 600, 100), [5, 105, 205, 305, 405, 500])
same('총 길이 밖의 자리는 버림', pageBreaks([90, 400, -10], 300, 100), [90, 190, 290])

console.log('\n>>> 5. 그림은 쪽 하나에 넘치는 것만 줄여 가운데로 앉힌다')
const wide = fitOnPage(2000, 500)
same('가로로 길면 쪽을 누임', wide.orientation, 'landscape')
same('누운 쪽 크기', [wide.pageWidth, wide.pageHeight], [PAGE_HEIGHT, PAGE_WIDTH])
expect('여백 안에 듦', wide.x >= PAGE_MARGIN - 0.01 && wide.y >= PAGE_MARGIN - 0.01,
  JSON.stringify(wide))
expect('가로세로 비가 그대로', Math.abs(wide.width / wide.height - 4) < 0.001, JSON.stringify(wide))
expect('가운데', Math.abs(wide.x * 2 + wide.width - wide.pageWidth) < 0.001, JSON.stringify(wide))

const tall = fitOnPage(300, 400)
same('세로로 길면 세운 쪽', tall.orientation, 'portrait')
same('넘치지 않는 그림은 그대로', [tall.width, tall.height], [300, 400])
expect('가운데', Math.abs(tall.y * 2 + tall.height - PAGE_HEIGHT) < 0.001, JSON.stringify(tall))

console.log('\n>>> 6. 긴 글은 뜨는 배율을 낮춘다')
// 짧은 글은 두 배로 떠야 종이에서 획이 또렷합니다.
same('짧은 글은 두 배', rasterScale(698, 1000), 2)
// 긴 글을 두 배로 뜨면 canvas 가 한계에 걸려 빈 그림을 돌려줍니다.
expect('아주 긴 글은 낮춤', rasterScale(698, 40_000) < 2, String(rasterScale(698, 40_000)))
expect('그래도 한 배보다 낮추지는 않음', rasterScale(698, 400_000) === 1,
  String(rasterScale(698, 400_000)))

console.log('\n' + (problems ? `FAIL ${problems}건` : '모두 통과'))
if (problems) process.exitCode = 1
