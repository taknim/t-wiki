import assert from 'node:assert/strict'
import {
  reindentXml, untabYaml, trimWhitespace,
} from '../../src/lib/textPreview'

let passed = 0
const check = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log('  ok  ' + name) }
  catch (e) { console.log('FAIL  ' + name + '\n      ' + (e as Error).message); process.exitCode = 1 }
}

console.log('\n[XML 들여쓰기]')
check('한 줄짜리를 펼친다', () => {
  assert.equal(reindentXml('<a><b>1</b><c>2</c></a>'), '<a>\n  <b>1</b>\n  <c>2</c>\n</a>\n')
})
check('깊이만큼 들여쓴다', () => {
  assert.equal(reindentXml('<a><b><c>x</c></b></a>'), '<a>\n  <b>\n    <c>x</c>\n  </b>\n</a>\n')
})
check('어긋난 들여쓰기를 바로잡는다', () => {
  assert.equal(reindentXml('<a>\n      <b>1</b>\n<c>2</c>\n   </a>'),
    '<a>\n  <b>1</b>\n  <c>2</c>\n</a>\n')
})
check('선언과 주석을 지킨다', () => {
  assert.equal(reindentXml('<?xml version="1.0"?><!-- 메모 --><a><b/></a>'),
    '<?xml version="1.0"?>\n<!-- 메모 -->\n<a>\n  <b/>\n</a>\n')
})
check('빈 요소는 한 줄로', () => {
  assert.equal(reindentXml('<a><b></b></a>'), '<a>\n  <b></b>\n</a>\n')
})
check('속성값 안의 > 에 속지 않는다', () => {
  assert.equal(reindentXml('<a><b t="1 > 0">x</b></a>'), '<a>\n  <b t="1 > 0">x</b>\n</a>\n')
})
check('글과 태그가 섞인 요소는 그대로 둔다', () => {
  const source = '<p>앞 <b>강조</b> 뒤</p>'
  assert.equal(reindentXml(`<a>${source}</a>`), `<a>\n  ${source}\n</a>\n`)
})
check('xml:space="preserve" 는 손대지 않는다', () => {
  const source = '<pre xml:space="preserve"><a>1</a>   <b>2</b></pre>'
  assert.equal(reindentXml(`<r>${source}</r>`), `<r>\n  ${source}\n</r>\n`)
})
check('CDATA 안을 건드리지 않는다', () => {
  const out = reindentXml('<a><s><![CDATA[ if (1 < 2) { } ]]></s></a>')!
  assert.ok(out.includes('<![CDATA[ if (1 < 2) { } ]]>'), out)
})
check('한글 태그와 값', () => {
  assert.equal(reindentXml('<문서><제목>안녕</제목></문서>'), '<문서>\n  <제목>안녕</제목>\n</문서>\n')
})
check('DOCTYPE 을 지킨다', () => {
  assert.ok(reindentXml('<!DOCTYPE note><note><to>가</to></note>')!.startsWith('<!DOCTYPE note>\n<note>'))
})
check('짝이 맞지 않으면 손대지 않는다', () => {
  assert.equal(reindentXml('<a><b></a>'), null)
  assert.equal(reindentXml('<a>'), null)
  assert.equal(reindentXml('<a></a></b>'), null)
})
check('빈 글이나 글만 있으면 null', () => {
  assert.equal(reindentXml(''), null)
  assert.equal(reindentXml('   '), null)
  assert.equal(reindentXml('태그가 없는 글'), null)
})
check('이미 정돈된 문서는 그대로', () => {
  const tidy = '<a>\n  <b>1</b>\n</a>\n'
  assert.equal(reindentXml(tidy), tidy)
})
check('두 번 돌려도 같다', () => {
  const once = reindentXml('<a><b><c>x</c></b><d/></a>')!
  assert.equal(reindentXml(once), once)
})
check('실체 참조를 풀지 않는다', () => {
  assert.ok(reindentXml('<a><b>&amp; &lt; &#48708;</b></a>')!.includes('&amp; &lt; &#48708;'))
})

console.log('\n[YAML 탭 고치기]')
check('들여쓰기의 탭을 공백으로', () => {
  assert.equal(untabYaml('목록:\n\t- 하나\n\t- 둘\n'), '목록:\n  - 하나\n  - 둘\n')
})
check('깊이의 앞뒤 관계를 지킨다', () => {
  assert.equal(untabYaml('가:\n\t나:\n\t\t다: 1\n'), '가:\n  나:\n    다: 1\n')
})
check('탭과 공백이 섞여 있어도', () => {
  assert.equal(untabYaml('가:\n  \t나: 1\n'), '가:\n    나: 1\n')
})
check('값 안의 탭은 그대로 둔다', () => {
  assert.equal(untabYaml('\t이름: 가\t나\n'), '  이름: 가\t나\n')
})
check('블록 스칼라 안쪽은 손대지 않는다', () => {
  assert.equal(untabYaml('글: |\n\t\t첫 줄\n\t\t둘째 줄\n'), null)
})
check('블록 밖으로 나오면 다시 고친다', () => {
  const out = untabYaml('글: |\n\t안쪽\n\t다음\n뒤:\n\t값: 1\n')!
  assert.ok(out.includes('|\n\t안쪽\n\t다음\n'), JSON.stringify(out))
  assert.ok(out.endsWith('뒤:\n  값: 1\n'), JSON.stringify(out))
})
check('접기 블록(>)도 마찬가지', () => {
  const out = untabYaml('글: >-\n\t안쪽\n뒤:\n\t값: 1\n')!
  assert.ok(out.includes('>-\n\t안쪽\n'), JSON.stringify(out))
  assert.ok(out.endsWith('뒤:\n  값: 1\n'), JSON.stringify(out))
})
check('고칠 탭이 없으면 null', () => {
  assert.equal(untabYaml('가: 1\n나:\n  - 둘\n'), null)
  assert.equal(untabYaml(''), null)
  assert.equal(untabYaml('이름: 가\t나\n'), null)
})
check('주석 줄도 맞춘다', () => {
  assert.equal(untabYaml('가:\n\t# 메모\n\t나: 1\n'), '가:\n  # 메모\n  나: 1\n')
})
check('두 번 돌려도 같다', () => {
  assert.equal(untabYaml(untabYaml('가:\n\t나:\n\t\t다: 1\n')!), null)
})
check('윈도 줄바꿈을 지킨다', () => {
  assert.equal(untabYaml('가:\r\n\t나: 1\r\n'), '가:\r\n  나: 1\r\n')
})

console.log('\n[줄 끝 공백 지우기]')
check('줄 끝 공백을 지운다', () => {
  assert.equal(trimWhitespace('가  \n나\t\n', 'a.txt'), '가\n나\n')
})
check('문서 앞뒤 빈 줄을 걷어낸다', () => {
  assert.equal(trimWhitespace('\n\n  \n본문\n\n  \n', 'a.txt'), '본문\n')
})
check('줄바꿈 하나로 끝맺는다', () => {
  assert.equal(trimWhitespace('본문', 'a.txt'), '본문\n')
})
check('마크다운의 줄바꿈 공백은 남긴다', () => {
  assert.equal(trimWhitespace('첫 줄  \n둘째 줄   \n', 'a.md'), null)
})
check('마크다운이라도 공백 하나는 지운다', () => {
  assert.equal(trimWhitespace('첫 줄 \n둘째 줄\n', 'a.md'), '첫 줄\n둘째 줄\n')
})
check('마크다운의 빈 줄은 비운다', () => {
  assert.equal(trimWhitespace('가\n   \n나\n', 'a.md'), '가\n\n나\n')
})
check('다른 형식에서는 공백 둘도 지운다', () => {
  assert.equal(trimWhitespace('가  \n', 'a.txt'), '가\n')
})
check('YAML 블록 스칼라 안쪽은 손대지 않는다', () => {
  assert.equal(trimWhitespace('글: |\n  안쪽  \n  줄 끝 공백도 내용  \n', 'a.yaml'), null)
})
check('YAML 블록 밖은 지운다', () => {
  assert.equal(trimWhitespace('글: |\n  안쪽  \n뒤: 1  \n', 'a.yaml'), '글: |\n  안쪽  \n뒤: 1\n')
})
check('|+ 로 끝나는 빈 줄은 값이라 남긴다', () => {
  assert.equal(trimWhitespace('글: |+\n  안쪽\n\n\n', 'a.yaml'), null)
})
check('윈도 줄바꿈을 지킨다', () => {
  assert.equal(trimWhitespace('가  \r\n나\r\n', 'a.txt'), '가\r\n나\r\n')
})
check('바꿀 것이 없으면 null', () => {
  assert.equal(trimWhitespace('가\n나\n', 'a.txt'), null)
  assert.equal(trimWhitespace('', 'a.txt'), null)
})
check('두 번 돌려도 같다', () => {
  assert.equal(trimWhitespace(trimWhitespace('\n가  \n\n', 'a.txt')!, 'a.txt'), null)
})

console.log('\n' + passed + ' 통과')
