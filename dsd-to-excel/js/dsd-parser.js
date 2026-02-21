/**
 * DSD → Excel 변환기 - DSD 파싱 모듈
 * DSD 파일(ZIP)에서 XML을 추출하고 문서 구조를 분석한다.
 */

// ============================================================================
// DSD 파일 파싱
// ============================================================================

/**
 * DSD 파일(ArrayBuffer)에서 contents.xml과 meta.xml을 파싱하여 반환.
 * @param {ArrayBuffer} arrayBuffer - DSD 파일 내용
 * @returns {Promise<{metaDoc: Document, contentsDoc: Document}>}
 */
async function parseDsd(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);

    const metaFile = zip.file('meta.xml');
    const contentsFile = zip.file('contents.xml');
    if (!contentsFile) {
        throw new Error('contents.xml을 찾을 수 없습니다. 올바른 DSD 파일인지 확인하세요.');
    }

    let metaDoc = null;
    if (metaFile) {
        const metaStr = await metaFile.async('string');
        metaDoc = new DOMParser().parseFromString(metaStr, 'text/xml');
    }

    let contentsStr = await contentsFile.async('string');
    // &cr; 커스텀 엔티티를 줄바꿈으로 치환
    contentsStr = contentsStr.replace(/&cr;/g, '\n');
    const contentsDoc = new DOMParser().parseFromString(contentsStr, 'text/xml');

    // XML 파싱 에러 체크
    const parserError = contentsDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error('XML 파싱 오류: ' + parserError.textContent.substring(0, 200));
    }

    return { metaDoc, contentsDoc };
}


// ============================================================================
// 테이블 파싱
// ============================================================================

/**
 * TABLE XML 요소를 파싱하여 구조화된 객체 반환.
 */
function parseTable(tableElem) {
    const result = {
        border: (tableElem.getAttribute('BORDER') || '0') === '1',
        width: parseInt(tableElem.getAttribute('WIDTH') || '600', 10),
        aclass: tableElem.getAttribute('ACLASS') || 'NORMAL',
        colWidths: [],
        theadRows: [],
        tbodyRows: [],
    };

    const colgroup = findChild(tableElem, 'COLGROUP');
    if (colgroup) {
        for (const col of findChildren(colgroup, 'COL')) {
            result.colWidths.push(parseInt(col.getAttribute('WIDTH') || '100', 10));
        }
    }

    const thead = findChild(tableElem, 'THEAD');
    if (thead) {
        for (const tr of findChildren(thead, 'TR')) {
            result.theadRows.push(parseTr(tr, true));
        }
    }

    const tbody = findChild(tableElem, 'TBODY');
    if (tbody) {
        for (const tr of findChildren(tbody, 'TR')) {
            result.tbodyRows.push(parseTr(tr, false));
        }
    }

    return result;
}

/**
 * TR 요소를 파싱하여 셀 목록 반환.
 */
function parseTr(trElem, isHeader) {
    const cells = [];
    for (const cellElem of trElem.children) {
        const tag = cellElem.tagName;
        if (!['TH', 'TD', 'TE', 'TU'].includes(tag)) continue;
        cells.push({
            tag: tag,
            text: getText(cellElem).trim(),
            colspan: parseInt(cellElem.getAttribute('COLSPAN') || '1', 10),
            rowspan: parseInt(cellElem.getAttribute('ROWSPAN') || '1', 10),
            align: (cellElem.getAttribute('ALIGN') || '').toUpperCase(),
            valign: (cellElem.getAttribute('VALIGN') || '').toUpperCase(),
            usermark: cellElem.getAttribute('USERMARK') || '',
            width: parseInt(cellElem.getAttribute('WIDTH') || '0', 10),
            isHeader: tag === 'TH' || isHeader,
        });
    }
    return cells;
}


// ============================================================================
// 문서 구조 분석
// ============================================================================

/**
 * XML 문서 구조를 분석하여 섹션별 콘텐츠 매핑.
 */
function analyzeDocument(root) {
    const doc = {
        header: {},
        cover: null,
        toc: null,
        opinionSection: null,
        fsSection: null,
        notesSection: null,
        conductSection: null,
    };

    const dh = findChild(root, 'DOCUMENT-HEADER');
    if (dh) {
        const dn = findChild(dh, 'DOCUMENT-NAME');
        const cn = findChild(dh, 'COMPANY-NAME');
        doc.header.docName = dn ? getText(dn) : '';
        doc.header.companyCik = cn ? (cn.getAttribute('AREGCIK') || '') : '';
    }

    const body = findChild(root, 'BODY');
    if (!body) {
        throw new Error('BODY 요소를 찾을 수 없습니다.');
    }

    for (const child of body.children) {
        const tag = child.tagName;

        if (tag === 'COVER') {
            doc.cover = child;
        } else if (tag === 'TOC') {
            doc.toc = child;
        } else if (tag === 'INSERTION') {
            if (child.getAttribute('AFREQUENCY') === '1') {
                const lib = findChild(child, 'LIBRARY');
                if (lib) {
                    const sec1 = findChild(lib, 'SECTION-1');
                    if (sec1) {
                        const titleElem = findChild(sec1, 'TITLE');
                        const titleText = titleElem ? getText(titleElem) : '';
                        if (titleText.includes('감사') && titleText.includes('보고서')) {
                            doc.opinionSection = sec1;
                        }
                    }
                }
            }
        } else if (tag === 'SECTION-1') {
            const titleElem = findChild(child, 'TITLE');
            const titleText = titleElem ? getText(titleElem) : '';

            if (titleText.includes('재') && titleText.includes('무') && titleText.includes('표')) {
                doc.fsSection = child;
                for (const sec2 of findChildren(child, 'SECTION-2')) {
                    const sec2Title = findChild(sec2, 'TITLE');
                    const sec2Text = sec2Title ? getText(sec2Title) : '';
                    if (sec2Text.includes('주석')) {
                        doc.notesSection = sec2;
                    }
                }
            } else if (titleText.includes('외부감사')) {
                doc.conductSection = child;
            }
        }
    }

    return doc;
}


// ============================================================================
// 표지 정보 추출
// ============================================================================

/**
 * COVER 요소에서 표지 정보 추출.
 */
function extractCoverInfo(coverElem) {
    const info = {
        companyName: '',
        reportSubtitle: '',
        reportTitle: '',
        periodLine1: '',
        periodFrom: '',
        periodTo: '',
        auditorName: '',
    };
    if (!coverElem) return info;

    const tables = findChildren(coverElem, 'TABLE');
    const coverTitle = findChild(coverElem, 'COVER-TITLE');
    const tableGroups = findChildren(coverElem, 'TABLE-GROUP');

    const tableTexts = [];
    for (const t of tables) {
        const txt = getText(t).trim();
        if (txt) tableTexts.push(txt);
    }

    if (tableTexts.length >= 1) info.companyName = tableTexts[0];
    if (tableTexts.length >= 2) info.reportSubtitle = tableTexts[1];
    if (tableTexts.length >= 3) info.auditorName = tableTexts[2];

    if (coverTitle) {
        info.reportTitle = getText(coverTitle).trim();
    }

    for (const tg of tableGroups) {
        for (const table of findChildren(tg, 'TABLE')) {
            const tbody = findChild(table, 'TBODY');
            if (!tbody) continue;
            for (const tr of findChildren(tbody, 'TR')) {
                for (const cell of tr.children) {
                    if (cell.tagName === 'TU') {
                        const aunit = cell.getAttribute('AUNIT') || '';
                        const text = getText(cell).trim();
                        if (aunit === 'PERIODFROM') info.periodFrom = text;
                        else if (aunit === 'PERIODTO') info.periodTo = text;
                    } else if (cell.tagName === 'TD') {
                        const text = getText(cell).trim();
                        if (text.includes('기') && (text.includes('당') || text.includes('전'))) {
                            info.periodLine1 = text;
                        }
                    }
                }
            }
        }
    }

    return info;
}


// ============================================================================
// 목차 추출
// ============================================================================

/**
 * TOC에서 목차 항목 추출.
 */
function extractTocItems(tocElem) {
    const items = [];
    if (!tocElem) return items;

    const titleElem = findChild(tocElem, 'TITLE');
    if (titleElem) {
        items.push({ type: 'title', text: getText(titleElem).trim() });
    }

    for (const table of findChildren(tocElem, 'TABLE')) {
        const tbody = findChild(table, 'TBODY');
        if (!tbody) continue;
        for (const tr of findChildren(tbody, 'TR')) {
            const cells = findChildren(tr, 'TD');
            if (cells.length >= 2) {
                const left = getText(cells[0]).trim();
                const right = getText(cells[1]).trim();
                if (left) items.push({ type: 'entry', left, right });
            } else if (cells.length === 1) {
                const text = getText(cells[0]).trim();
                if (text) items.push({ type: 'entry', left: text, right: '' });
            }
        }
    }
    return items;
}


// ============================================================================
// 재무제표 분리
// ============================================================================

/**
 * 재무제표 SECTION-1에서 개별 재무제표 분리.
 * 각 재무제표는 BORDER=1 TABLE(데이터) + 앞 BORDER=0 TABLE(제목) + 뒤 TABLE(각주) 패턴.
 */
function splitFinancialStatements(fsSection) {
    const statements = {
        fsHeader: [],
        bs: [],
        is: [],
        ce: [],
        cf: [],
    };

    if (!fsSection) return statements;

    // SECTION-2(주석) 제외한 직접 자식 수집
    const children = [];
    for (const child of fsSection.children) {
        if (child.tagName === 'SECTION-2') continue;
        children.push(child);
    }

    // 재무제표 데이터 TABLE(BORDER=1) 위치 찾기
    const border1Indices = [];
    for (let i = 0; i < children.length; i++) {
        if (children[i].tagName === 'TABLE' && children[i].getAttribute('BORDER') === '1') {
            border1Indices.push(i);
        }
    }

    // 각 BORDER=1 테이블의 제목으로 재무제표 유형 판별
    const fsBlocks = []; // { type, start, end }
    for (const bi of border1Indices) {
        const dataTable = children[bi];
        const thead = findChild(dataTable, 'THEAD');
        if (!thead) continue;

        // 제목 TABLE = 바로 앞 TABLE (BORDER=0)
        let titleIdx = bi - 1;
        while (titleIdx >= 0 && ['P', 'WARNING', 'INSERTION'].includes(children[titleIdx].tagName)) {
            titleIdx--;
        }

        // 제목 텍스트로 유형 판별
        let titleText = '';
        if (titleIdx >= 0 && children[titleIdx].tagName === 'TABLE') {
            titleText = getText(children[titleIdx]).trim();
        }

        // 각주 TABLE = 바로 뒤
        const footerIdx = bi + 1;

        // 유형 판별 (공백 제거 후 비교)
        const noSpace = titleText.replace(/\s/g, '');
        let fsType = null;
        if (noSpace.includes('재무상태표')) fsType = 'bs';
        else if (noSpace.includes('손익계산서')) fsType = 'is';
        else if (noSpace.includes('자본변동표')) fsType = 'ce';
        else if (noSpace.includes('현금흐름표')) fsType = 'cf';

        if (fsType) {
            const start = titleIdx;
            let end = footerIdx;
            // 각주 TABLE 확인
            if (end < children.length && children[end].tagName === 'TABLE') {
                const footerText = getText(children[end]).trim();
                if (footerText.includes('주석') || footerText.includes('별첨')) {
                    // 각주 포함
                } else {
                    end = bi; // 데이터까지만
                }
            }
            fsBlocks.push({ type: fsType, start, end });
        }
    }

    // 블록 인덱스 셋
    const blockIndices = new Set();
    for (const block of fsBlocks) {
        for (let i = block.start; i <= block.end; i++) {
            blockIndices.add(i);
        }
    }

    // fsHeader: 첫 번째 재무제표 제목 전까지
    const firstTitle = fsBlocks.length > 0 ? fsBlocks[0].start : children.length;
    for (let i = 0; i < firstTitle; i++) {
        const child = children[i];
        if (['INSERTION', 'WARNING', 'PGBRK', 'TITLE'].includes(child.tagName)) continue;
        statements.fsHeader.push(child);
    }

    // 각 재무제표 블록 할당
    for (const block of fsBlocks) {
        for (let i = block.start; i <= block.end; i++) {
            if (i < children.length) {
                statements[block.type].push(children[i]);
            }
        }
    }

    return statements;
}


// ============================================================================
// 주석 분리
// ============================================================================

/**
 * 주석 SECTION-2를 주석 번호(N. 제목) 기준으로 분리.
 * maxSheetNum 이후의 주석은 마지막 시트에 합침.
 * @returns {Array<{num: number, elements: Array}>}
 */
function splitNotes(notesSection, maxSheetNum = 33) {
    if (!notesSection) return [];

    // 모든 자식 수집 (TITLE 제외)
    const children = [];
    for (const child of notesSection.children) {
        if (child.tagName === 'TITLE') continue;
        children.push(child);
    }

    // 주석 번호 시작점 찾기: "N. " 패턴으로 시작하는 P 요소
    const noteStarts = []; // { index, num }
    const noteNumberRe = /^(\d+)\.\s/;

    for (let i = 0; i < children.length; i++) {
        if (children[i].tagName === 'P') {
            const text = getText(children[i]).trim();
            const m = text.match(noteNumberRe);
            if (m) {
                noteStarts.push({ index: i, num: parseInt(m[1], 10) });
            }
        }
    }

    if (noteStarts.length === 0) {
        return children.length > 0 ? [{ num: 1, elements: children }] : [];
    }

    // 각 주석의 요소 범위 결정
    const rawNotes = [];
    for (let idx = 0; idx < noteStarts.length; idx++) {
        const startI = noteStarts[idx].index;
        const endI = (idx + 1 < noteStarts.length) ? noteStarts[idx + 1].index : children.length;

        const noteElements = [];
        for (let i = startI; i < endI; i++) {
            if (children[i].tagName === 'PGBRK') continue;
            noteElements.push(children[i]);
        }

        if (noteElements.length > 0) {
            rawNotes.push({ num: noteStarts[idx].num, elements: noteElements });
        }
    }

    // maxSheetNum 이후의 주석을 마지막 시트에 합침
    const notes = [];
    for (const note of rawNotes) {
        if (note.num <= maxSheetNum) {
            notes.push(note);
        } else {
            if (notes.length > 0) {
                notes[notes.length - 1].elements.push(...note.elements);
            } else {
                notes.push(note);
            }
        }
    }

    return notes;
}
