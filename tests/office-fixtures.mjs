import { execFileSync } from 'node:child_process'
import * as XLSX from 'xlsx'

/*
 * 시험용 오피스 파일은 여기서 지어 씁니다. 이진 파일을 저장소에 넣어 두면
 * 무엇이 들었는지 아무도 열어 보지 못하고, 고칠 일이 생기면 손댈 수도 없습니다.
 */
const book = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
  ['이름', '수량', '날짜'],
  ['첫째 줄', 12, '2026-01-02'],
  ['둘째 줄', 34, '2026-03-04'],
]), '판매')
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['둘째 시트의 값']]), '메모')
export const XLSX_B64 = XLSX.write(book, { type: 'base64', bookType: 'xlsx' })

/** 워드는 규격대로 묶은 zip 입니다. 최소한의 부품만 넣어 파이썬으로 짓습니다. */
export const DOCX_B64 = execFileSync('python3', ['-c', `
import base64, io, zipfile
body = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>워드 제목</w:t></w:r></w:p>
<w:p><w:r><w:t>첫 문단입니다.</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>굵은 글씨</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>목록 한 줄</w:t></w:r></w:p>
</w:body></w:document>'''
types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>'''
rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''
numbering = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>'''
doc_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>'''
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', types)
    z.writestr('_rels/.rels', rels)
    z.writestr('word/document.xml', body)
    z.writestr('word/numbering.xml', numbering)
    z.writestr('word/_rels/document.xml.rels', doc_rels)
print(base64.b64encode(buf.getvalue()).decode())
`], { encoding: 'utf8' }).trim()

