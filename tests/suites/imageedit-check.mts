import { clampCrop, clampSide, keepRatio, MAX_SIDE, outputName } from '../../src/lib/imageEdit'
import { stepZoom, ZOOMS } from '../../src/lib/zoom'

/*
 * 그림을 고칠 때 쓰는 셈만 따로 잽니다.
 *
 * 끌어 고른 자리를 그림 안으로 밀어 넣는 일, 비율을 지키는 일, 새 이름을 짓는 일은
 * 화면 없이도 틀렸는지 알 수 있습니다. 화면을 띄워 재는 묶음(imageedit)은 실제로
 * 파일이 나오는지를 보고, 여기서는 가장자리 값들을 촘촘히 훑습니다.
 */

let problems = 0
const ok = (name: string) => console.log('  ok  ' + name)
const fail = (name: string, detail: string) => {
  problems++
  console.log('FAIL  ' + name + '\n      ' + detail)
}
const expect = (name: string, condition: boolean, detail = '') => (condition ? ok(name) : fail(name, detail))
const same = (name: string, got: unknown, want: unknown) =>
  expect(name, JSON.stringify(got) === JSON.stringify(want), `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`)

console.log('\n>>> 1. 크기는 1 과 10000 사이로 눌러 둔다')
same('0 은 1 로', clampSide(0), 1)
same('음수도 1 로', clampSide(-40), 1)
same('소수는 반올림', clampSide(12.6), 13)
same('너무 크면 끝에서 멈춤', clampSide(999999), MAX_SIDE)
same('숫자가 아니면 1', clampSide(Number.NaN), 1)

console.log('\n>>> 2. 고른 자리는 그림 밖으로 나가지 않는다')
const paper = { width: 300, height: 200 }
same('안쪽은 그대로', clampCrop({ x: 10, y: 20, width: 100, height: 50 }, paper),
  { x: 10, y: 20, width: 100, height: 50 })
// 끌다 보면 가장자리를 넘어갑니다. 그대로 그리면 빈 자리가 검게 남습니다.
same('오른쪽으로 넘치면 안으로', clampCrop({ x: 280, y: 0, width: 100, height: 50 }, paper),
  { x: 200, y: 0, width: 100, height: 50 })
same('아래로 넘치면 안으로', clampCrop({ x: 0, y: 190, width: 50, height: 100 }, paper),
  { x: 0, y: 100, width: 50, height: 100 })
same('그림보다 크면 그림만큼', clampCrop({ x: -50, y: -50, width: 9999, height: 9999 }, paper),
  { x: 0, y: 0, width: 300, height: 200 })
same('한 점만 찍어도 1픽셀은 남김', clampCrop({ x: 10, y: 10, width: 0, height: 0 }, paper),
  { x: 10, y: 10, width: 1, height: 1 })

console.log('\n>>> 3. 한쪽을 정하면 다른 쪽이 비율을 따라온다')
same('절반으로 줄이면 높이도 절반', keepRatio(150, 300, 200), 100)
same('두 배로 늘리면 높이도 두 배', keepRatio(600, 300, 200), 400)
same('아주 작게 줄여도 1 아래로는 안 감', keepRatio(1, 300, 200), 1)

console.log('\n>>> 4. 새 이름은 확장자를 갈고 원본을 덮지 않는다')
same('png 를 jpg 로', outputName('사진.png', 'jpeg'), '사진 (고침).jpg')
same('jpg 를 png 로', outputName('자료/사진.jpg', 'png'), '사진 (고침).png')
same('확장자가 없어도', outputName('사진', 'png'), '사진 (고침).png')
same('점이 여럿이어도 마지막만', outputName('a.b.c.png', 'png'), 'a.b.c (고침).png')
expect('원본 이름과 같지 않음', outputName('사진.png', 'png') !== '사진.png')

console.log('\n>>> 5. 보기 배율은 지금 값에서 한 걸음씩 옮긴다')
same('눈금 위에서 한 걸음 위로', stepZoom(1, 1), 1.5)
same('눈금 위에서 한 걸음 아래로', stepZoom(1, -1), 0.75)
/*
 * 화면 맞춤은 칸에 따라 37% 처럼 어중간한 값이 됩니다. 표에서 자리를 못 찾아 100% 부터
 * 세었더니, 크게 보기를 눌렀는데 오히려 150% 로 건너뛰었습니다.
 */
same('어중간한 값에서 위로는 바로 위 눈금', stepZoom(0.37, 1), 0.5)
same('어중간한 값에서 아래로는 바로 아래 눈금', stepZoom(0.37, -1), 0.25)
same('맨 위에서 더 눌러도 그대로', stepZoom(4, 1), ZOOMS[ZOOMS.length - 1])
same('맨 아래에서 더 눌러도 그대로', stepZoom(0.25, -1), ZOOMS[0])
// 재서 나온 값은 소수점 아래가 지저분합니다. 100.2% 는 100% 로 봐야 150% 로 갑니다.
same('재다 생긴 티끌은 같은 값으로', stepZoom(1.002, 1), 1.5)

console.log('\n' + (problems ? `FAIL ${problems}건` : '모두 통과'))
if (problems) process.exitCode = 1
