import {
  clampCrop, clampSide, isUpright, keepRatio, MAX_SIDE, orientCss, orientedSize, orientName,
  outputName, ratioOf, reshapeCrop, sizeCrop, turnBy, UPRIGHT,
} from '../../src/lib/imageEdit'
import { clampPercent, MAX_PERCENT, MIN_PERCENT, stepZoom, ZOOMS } from '../../src/lib/zoom'

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
same('png 를 jpg 로', outputName('사진.png', 'jpeg'), '사진_modified.jpg')
same('jpg 를 png 로', outputName('자료/사진.jpg', 'png'), '사진_modified.png')
same('확장자가 없어도', outputName('사진', 'png'), '사진_modified.png')
same('점이 여럿이어도 마지막만', outputName('a.b.c.png', 'png'), 'a.b.c_modified.png')
expect('원본 이름과 같지 않음', outputName('사진.png', 'png') !== '사진.png')

console.log('\n>>> 5. 보기 배율은 지금 값에서 한 걸음씩, 큰 쪽일수록 성글게 옮긴다')
// 작을 때는 20% 씩, 100% 를 넘으면 25% 씩, 200% 를 넘으면 50% 씩.
same('100% 아래는 20% 씩', stepZoom(0.8, -1), 0.6)
same('100% 에서 위로는 25%', stepZoom(1, 1), 1.25)
same('100% 에서 아래로는 20%', stepZoom(1, -1), 0.8)
same('200% 를 넘으면 50% 씩', stepZoom(2, 1), 2.5)
// 아주 큰 그림은 20% 로도 한 화면에 들지 않습니다. 맨 아래만 10% 를 따로 둡니다.
same('맨 아래는 10%', stepZoom(0.2, -1), 0.1)
same('10% 에서 올라가면 20%', stepZoom(0.1, 1), 0.2)
expect('300% 에서 멈춤', ZOOMS[ZOOMS.length - 1] === 3, String(ZOOMS[ZOOMS.length - 1]))
/*
 * 화면 맞춤은 칸에 따라 37% 처럼 어중간한 값이 됩니다. 표에서 자리를 못 찾아 100% 부터
 * 세었더니, 크게 보기를 눌렀는데 오히려 150% 로 건너뛰었습니다.
 */
same('어중간한 값에서 위로는 바로 위 눈금', stepZoom(0.37, 1), 0.4)
same('어중간한 값에서 아래로는 바로 아래 눈금', stepZoom(0.37, -1), 0.2)
same('맨 위에서 더 눌러도 그대로', stepZoom(3, 1), ZOOMS[ZOOMS.length - 1])
same('맨 아래에서 더 눌러도 그대로', stepZoom(0.1, -1), ZOOMS[0])
// 재서 나온 값은 소수점 아래가 지저분합니다. 100.2% 는 100% 로 봐야 150% 로 갑니다.
same('재다 생긴 티끌은 같은 값으로', stepZoom(1.002, 1), 1.25)

console.log('\n>>> 6. 손으로 적어 넣은 배율은 쓸 수 있는 자리로 눌러 둔다')
same('그 사이는 그대로', clampPercent(137), 137)
same('아래로 넘치면 맨 아래', clampPercent(3), MIN_PERCENT)
same('위로 넘치면 맨 위', clampPercent(1000), MAX_PERCENT)
same('소수는 반올림', clampPercent(42.6), 43)
// 숫자가 아니면 본디 크기로 둡니다. 빈 칸을 100% 로 읽는 것이 가장 덜 놀랍습니다.
same('숫자가 아니면 100', clampPercent(Number.NaN), 100)

console.log('\n>>> 7. 돌리기와 뒤집기는 90도 단위로 돌고 가로세로를 바꾼다')
same('오른쪽으로 한 번', turnBy(0, 1), 90)
same('왼쪽으로 한 번은 한 바퀴 뒤에서', turnBy(0, -1), 270)
// 한 바퀴를 넘으면 처음으로 돌아옵니다. 눌린 횟수를 세어 두면 그 수가 끝없이 자랍니다.
same('세 번 더 돌면 제자리', turnBy(270, 1), 0)
same('90도면 가로세로가 바뀜', orientedSize({ width: 200, height: 100 }, 90), { width: 100, height: 200 })
same('180도면 그대로', orientedSize({ width: 200, height: 100 }, 180), { width: 200, height: 100 })
same('270도도 바뀜', orientedSize({ width: 200, height: 100 }, 270), { width: 100, height: 200 })
expect('손대지 않은 방향', isUpright(UPRIGHT))
expect('뒤집기만 해도 손댄 것', !isUpright({ ...UPRIGHT, flipX: true }))

console.log('\n>>> 8. 화면에 그리는 변환은 canvas 에 그리는 차례와 같다')
/*
 * 뒤집기가 돌리기보다 **앞에** 적혀야 합니다(나중에 적은 것이 먼저 먹으므로 그림은 돌아간
 * 뒤에 뒤집힙니다). 차례가 어긋나면 90도 돌려 놓은 그림에서 좌우 뒤집기가 상하로 듭니다.
 */
same('그대로', orientCss(UPRIGHT), 'translate(-50%, -50%) scale(1, 1) rotate(0deg)')
same('돌리고 좌우 뒤집기', orientCss({ turn: 90, flipX: true, flipY: false }),
  'translate(-50%, -50%) scale(-1, 1) rotate(90deg)')
same('상하 뒤집기', orientCss({ turn: 0, flipX: false, flipY: true }),
  'translate(-50%, -50%) scale(1, -1) rotate(0deg)')

console.log('\n>>> 9. 지금 방향을 사람 말로 적는다')
same('손대지 않았으면', orientName(UPRIGHT), '그대로')
same('돌리고 뒤집었으면 함께', orientName({ turn: 180, flipX: true, flipY: false }),
  '오른쪽으로 180° · 좌우 뒤집음')
same('뒤집기만', orientName({ turn: 0, flipX: false, flipY: true }), '상하 뒤집음')

console.log('\n>>> 10. 씌운 비율은 눕히고 세울 수 있다')
same('가로로 누우면 긴 쪽이 너비', ratioOf('16:9', 'wide'), 16 / 9)
same('세우면 뒤집힘', ratioOf('16:9', 'tall'), 9 / 16)
same('정사각은 어느 쪽이든 1', ratioOf('1:1', 'tall'), 1)
same('씌우지 않았으면 없음', ratioOf(null, 'wide'), null)

console.log('\n>>> 11. 비율을 씌우고 끌면 그 비를 지킨다')
const sheet = { width: 400, height: 300 }
const both = { x: true, y: true }
// 마음대로 고를 때는 두 점이 만드는 네모 그대로입니다.
same('씌우지 않으면 끈 대로', sizeCrop({ from: { x: 10, y: 10 }, to: { x: 90, y: 40 }, axes: both, base: null }, null, sheet),
  { x: 10, y: 10, width: 80, height: 30 })
/*
 * 비율을 씌우면 **손끝을 덮는 쪽**에 맞춥니다. 작은 쪽에 맞추면 손은 저만치 갔는데
 * 네모가 따라오지 않아 끌리지 않는 것처럼 보입니다.
 */
same('가로가 길면 가로에 맞춤', sizeCrop({ from: { x: 0, y: 0 }, to: { x: 160, y: 20 }, axes: both, base: null }, 16 / 9, sheet),
  { x: 0, y: 0, width: 160, height: 90 })
same('세로가 길면 세로에 맞춤', sizeCrop({ from: { x: 0, y: 0 }, to: { x: 10, y: 90 }, axes: both, base: null }, 16 / 9, sheet),
  { x: 0, y: 0, width: 160, height: 90 })
// 왼쪽·위로 끌면 붙박이가 오른쪽 아래가 됩니다.
same('거꾸로 끌어도 붙박이는 그대로', sizeCrop({ from: { x: 200, y: 200 }, to: { x: 40, y: 190 }, axes: both, base: null }, 16 / 9, sheet),
  { x: 40, y: 110, width: 160, height: 90 })
/*
 * 그림 밖으로 넘치면 비율을 지킨 채 줄입니다. 안으로 밀어 넣기만 하면 잡고 있던
 * 꼭지점이 손에서 빠져나갑니다.
 */
const spilled = sizeCrop({ from: { x: 0, y: 0 }, to: { x: 399, y: 299 }, axes: both, base: null }, 16 / 9, sheet)
same('넘치면 비율을 지킨 채 줄임', spilled, { x: 0, y: 0, width: 400, height: 225 })
// 변을 잡아 한 축만 움직이면 다른 축이 가운데를 지키며 따라옵니다.
const sideways = sizeCrop({
  from: { x: 100, y: 0 }, to: { x: 260, y: 0 }, axes: { x: true, y: false },
  base: { x: 100, y: 100, width: 40, height: 40 },
}, 16 / 9, sheet)
same('변을 잡으면 다른 축이 가운데로 따라옴', sideways, { x: 100, y: 75, width: 160, height: 90 })

console.log('\n>>> 12. 비율을 갈아 끼우면 이미 고른 자리도 다시 잡는다')
// 고른 네모 **안에** 들어가도록 줄입니다. 늘이면 그림 밖으로 삐져나갑니다.
same('넓은 네모는 높이에 맞춰 줄임', reshapeCrop({ x: 10, y: 10, width: 200, height: 100 }, 1, sheet),
  { x: 60, y: 10, width: 100, height: 100 })
same('가운데를 지킴', reshapeCrop({ x: 0, y: 0, width: 160, height: 160 }, 16 / 9, sheet),
  { x: 0, y: 35, width: 160, height: 90 })
expect('줄인 자리는 그림 안', (() => {
  const got = reshapeCrop({ x: 380, y: 280, width: 20, height: 20 }, 16 / 9, sheet)
  return got.x >= 0 && got.y >= 0 && got.x + got.width <= sheet.width && got.y + got.height <= sheet.height
})())

console.log('\n' + (problems ? `FAIL ${problems}건` : '모두 통과'))
if (problems) process.exitCode = 1
