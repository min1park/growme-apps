/**
 * DSD → Excel 변환기 - Excel 워크북 생성 모듈
 * ExcelJS를 사용하여 파싱된 DSD 데이터로부터 Excel 워크북을 생성한다.
 */

// ============================================================================
// 파싱된 테이블 → Excel 시트 기록
// ============================================================================

/**
 * 파싱된 테이블 데이터를 시트에 기록하고 다음 행 번호 반환.
 */
function writeParsedTable(ws, tableData, startRow, startCol) {
    const hasBorder = tableData.border;
    const colWidths = tableData.colWidths;
    const allRows = [...tableData.theadRows, ...tableData.tbodyRows];
    const numThead = tableData.theadRows.length;

    if (allRows.length === 0) return startRow;

    // 열 너비 설정
    for (let i = 0; i < colWidths.length; i++) {
        const colIdx = startCol + i;
        const col = ws.getColumn(colIdx);
        const newWidth = pxToExcelWidth(colWidths[i]);
        if (!col.width || newWidth > col.width) {
            col.width = newWidth;
        }
    }

    // 셀 점유 맵 (rowspan/colspan 처리)
    const occupied = {};

    let rowOffset = 0;
    for (let rowIdx = 0; rowIdx < allRows.length; rowIdx++) {
        const rowCells = allRows[rowIdx];
        const isTheadRow = rowIdx < numThead;
        let colOffset = 0;

        for (const cellData of rowCells) {
            while (occupied[`${rowOffset},${colOffset}`]) {
                colOffset++;
            }

            const colspan = cellData.colspan;
            const rowspan = cellData.rowspan;
            const text = cellData.text;
            const isHeader = cellData.isHeader || isTheadRow;

            const { value, isNumber } = tryParseNumber(text);

            const excelRow = startRow + rowOffset;
            const excelCol = startCol + colOffset;
            const cell = ws.getCell(excelRow, excelCol);
            cell.value = value;

            // 폰트
            const umInfo = parseUsermark(cellData.usermark || '');
            const fontSize = umInfo.size || DEFAULT_FONT_SIZE;
            const fontBold = umInfo.bold !== undefined ? umInfo.bold : isHeader;
            const fontObj = { name: DEFAULT_FONT_NAME, size: fontSize, bold: fontBold };
            if (umInfo.color) fontObj.color = { argb: 'FF' + umInfo.color };
            cell.font = fontObj;

            // 정렬
            let hAlign = (cellData.align || '').toLowerCase() || undefined;
            let vAlign = (cellData.valign || '').toLowerCase() || undefined;
            if (hAlign === 'justify') hAlign = 'left';
            if (vAlign === 'middle') vAlign = 'center';
            if (isHeader && !hAlign) hAlign = 'center';
            cell.alignment = {
                horizontal: hAlign,
                vertical: vAlign,
                wrapText: true
            };

            // 숫자 포맷
            if (isNumber) {
                cell.numFmt = NUMBER_FORMAT;
            }

            // 테두리
            if (hasBorder) {
                cell.border = ALL_THIN_BORDERS;
            }

            // 병합
            if (colspan > 1 || rowspan > 1) {
                const endRow = excelRow + rowspan - 1;
                const endCol = excelCol + colspan - 1;
                ws.mergeCells(excelRow, excelCol, endRow, endCol);

                if (hasBorder) {
                    for (let r = excelRow; r <= endRow; r++) {
                        for (let c = excelCol; c <= endCol; c++) {
                            ws.getCell(r, c).border = ALL_THIN_BORDERS;
                        }
                    }
                }

                for (let dr = 0; dr < rowspan; dr++) {
                    for (let dc = 0; dc < colspan; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        occupied[`${rowOffset + dr},${colOffset + dc}`] = true;
                    }
                }
            }

            colOffset += colspan;
        }

        rowOffset++;
    }

    return startRow + rowOffset;
}

/**
 * TABLE XML 요소를 직접 파싱하여 시트에 기록.
 */
function writeTableToSheet(ws, tableElem, startRow, startCol) {
    const tableData = parseTable(tableElem);
    return writeParsedTable(ws, tableData, startRow, startCol);
}


// ============================================================================
// Cover 시트
// ============================================================================

function writeCoverSheet(wb, coverInfo) {
    const ws = wb.addWorksheet('Cover');
    const fontTitle = { name: DEFAULT_FONT_NAME, size: 18 };
    const fontNormal = { name: DEFAULT_FONT_NAME, size: DEFAULT_FONT_SIZE };
    const center = { horizontal: 'center', vertical: 'center' };

    const data = [
        [1, coverInfo.companyName, fontTitle],
        [3, coverInfo.reportSubtitle, fontTitle],
        [5, coverInfo.reportTitle, fontTitle],
        [6, coverInfo.periodLine1, fontNormal],
        [7, coverInfo.periodFrom ? (coverInfo.periodFrom + ' 부터') : '', fontNormal],
        [8, coverInfo.periodTo ? (coverInfo.periodTo + ' 까지') : '', fontNormal],
        [10, coverInfo.auditorName, fontTitle],
    ];

    for (const [row, text, font] of data) {
        if (text) {
            const cell = ws.getCell(row, DATA_COL_START);
            cell.value = text;
            cell.font = font;
            cell.alignment = center;
        }
    }

    if (coverInfo.periodLine1) {
        ws.mergeCells(6, DATA_COL_START, 6, DATA_COL_START + 1);
    }

    ws.getColumn('D').width = 40;
    ws.getColumn('E').width = 20;
    return ws;
}


// ============================================================================
// ToC 시트
// ============================================================================

function writeTocSheet(wb, tocItems) {
    const ws = wb.addWorksheet('ToC');
    const fontTitle = { name: DEFAULT_FONT_NAME, size: 12, bold: true };
    const fontNormal = { name: DEFAULT_FONT_NAME, size: DEFAULT_FONT_SIZE };

    let row = 1;
    for (const item of tocItems) {
        if (item.type === 'title') {
            const cell = ws.getCell(row, DATA_COL_START);
            cell.value = item.text;
            cell.font = fontTitle;
            cell.alignment = { horizontal: 'center' };
        } else if (item.type === 'entry') {
            let text = item.left;
            if (item.right) text = `${item.left}  ${item.right}`;
            const cell = ws.getCell(row, DATA_COL_START);
            cell.value = text;
            cell.font = fontNormal;
        }
        row++;
    }

    ws.getColumn('D').width = 60;
    return ws;
}


// ============================================================================
// Opinion 시트
// ============================================================================

function writeOpinionSheet(wb, opinionSection) {
    const ws = wb.addWorksheet('Opinion');
    if (!opinionSection) return ws;

    const fontNormal = { name: DEFAULT_FONT_NAME, size: DEFAULT_FONT_SIZE };
    const fontBold = { name: DEFAULT_FONT_NAME, size: DEFAULT_FONT_SIZE, bold: true };
    let row = 1;

    for (const child of opinionSection.children) {
        const tag = child.tagName;

        if (tag === 'TITLE') {
            const cell = ws.getCell(row, DATA_COL_START);
            cell.value = getText(child).trim();
            cell.font = { name: DEFAULT_FONT_NAME, size: 12, bold: true };
            row++;
            continue;
        }

        if (tag === 'P') {
            const text = getText(child).trim();
            if (!text) {
                row++;
                continue;
            }

            const usermark = child.getAttribute('USERMARK') || '';
            const info = parseUsermark(usermark);
            const isBold = info.bold || false;

            const lines = text.split('\n');
            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (line) {
                    const cell = ws.getCell(row, DATA_COL_START);
                    cell.value = line;
                    cell.font = isBold ? fontBold : fontNormal;
                    cell.alignment = { wrapText: true };
                }
                row++;
            }
            continue;
        }

        if (tag === 'TABLE') {
            row = writeTableToSheet(ws, child, row, DATA_COL_START);
        }
    }

    ws.getColumn('D').width = 80;
    return ws;
}


// ============================================================================
// FS 시트
// ============================================================================

function writeFsSheet(wb, headerElements) {
    const ws = wb.addWorksheet('FS');
    let row = 1;

    for (const elem of headerElements) {
        const tag = elem.tagName;
        if (tag === 'P') {
            const text = getText(elem).trim();
            if (text) {
                const usermark = elem.getAttribute('USERMARK') || '';
                const info = parseUsermark(usermark);
                const size = info.size || DEFAULT_FONT_SIZE;
                const bold = info.bold || false;
                const cell = ws.getCell(row, DATA_COL_START);
                cell.value = text;
                cell.font = { name: DEFAULT_FONT_NAME, size, bold };
            }
            row++;
        } else if (tag === 'TABLE') {
            row = writeTableToSheet(ws, elem, row, DATA_COL_START);
        } else if (tag === 'TABLE-GROUP') {
            for (const t of findChildren(elem, 'TABLE')) {
                row = writeTableToSheet(ws, t, row, DATA_COL_START);
            }
        }
    }

    ws.getColumn('D').width = 40;
    ws.getColumn('E').width = 20;
    ws.getColumn('F').width = 20;
    return ws;
}


// ============================================================================
// 재무제표 시트 (BS, IS, CF, CE)
// ============================================================================

function writeFinancialStatementSheet(wb, sheetName, elements, colStart) {
    colStart = colStart || DATA_COL_START;
    const ws = wb.addWorksheet(sheetName);
    let row = 1;

    for (const elem of elements) {
        const tag = elem.tagName;
        if (tag === 'P') {
            const text = getText(elem).trim();
            if (text) {
                const usermark = elem.getAttribute('USERMARK') || '';
                const info = parseUsermark(usermark);
                const size = info.size || DEFAULT_FONT_SIZE;
                const bold = info.bold || false;
                const lines = text.split('\n');
                for (const rawLine of lines) {
                    const line = rawLine.trim();
                    if (line) {
                        const cell = ws.getCell(row, colStart);
                        cell.value = line;
                        cell.font = { name: DEFAULT_FONT_NAME, size, bold };
                        cell.alignment = { horizontal: 'center' };
                    }
                    row++;
                }
            } else {
                row++;
            }
        } else if (tag === 'TABLE') {
            const tableData = parseTable(elem);
            row = writeParsedTable(ws, tableData, row, colStart);
        } else if (tag === 'TABLE-GROUP') {
            for (const t of findChildren(elem, 'TABLE')) {
                const tableData = parseTable(t);
                row = writeParsedTable(ws, tableData, row, colStart);
            }
        }
    }

    // 열 너비 설정
    ws.getColumn('A').width = 9;
    ws.getColumn('A').hidden = true;
    ws.getColumn('C').width = 3;
    ws.getColumn('D').width = 31;
    ws.getColumn('E').width = 21;
    ws.getColumn('F').width = 20;
    ws.getColumn('G').width = 20;
    ws.getColumn('H').width = 20;
    ws.getColumn('I').width = 20;
    ws.getColumn('J').width = 5;

    return ws;
}


// ============================================================================
// 재무제표 천원 시트 (BS2, IS2, CF2, CE2)
// ============================================================================

function writeFinancialStatementDivided(wb, origSheetName, divSheetName) {
    const origWs = wb.getWorksheet(origSheetName);
    const ws = wb.addWorksheet(divSheetName);

    // 원본 시트의 모든 행을 순회
    origWs.eachRow({ includeEmpty: true }, (origRow, rowNumber) => {
        origRow.eachCell({ includeEmpty: true }, (origCell, colNumber) => {
            const newCell = ws.getCell(rowNumber, colNumber);

            if (typeof origCell.value === 'number' && origCell.value !== 0) {
                const divided = Math.round(origCell.value / FS_DIVIDER);
                newCell.value = divided !== 0 ? divided : origCell.value;
            } else {
                newCell.value = origCell.value;
            }

            // 스타일 복사
            if (origCell.font) newCell.font = { ...origCell.font };
            if (origCell.alignment) newCell.alignment = { ...origCell.alignment };
            if (origCell.border) newCell.border = { ...origCell.border };
            if (origCell.numFmt) newCell.numFmt = origCell.numFmt;
        });
    });

    // 병합 셀 복사
    // ExcelJS에서 병합 정보는 ws._merges에 저장됨
    if (origWs._merges) {
        for (const mergeRef of Object.keys(origWs._merges)) {
            try {
                ws.mergeCells(mergeRef);
            } catch (e) {
                // 이미 병합된 경우 무시
            }
        }
    }

    // 열 너비/숨김 복사
    for (let colIdx = 1; colIdx <= 20; colIdx++) {
        const origCol = origWs.getColumn(colIdx);
        const newCol = ws.getColumn(colIdx);
        if (origCol.width) newCol.width = origCol.width;
        if (origCol.hidden) newCol.hidden = origCol.hidden;
    }

    // 단위 텍스트 수정
    ws.eachRow((row) => {
        row.eachCell((cell) => {
            if (typeof cell.value === 'string' && cell.value.includes('단위') && cell.value.includes('원')) {
                cell.value = cell.value.replace('단위 : 원', '단위 : 천원').replace('단위: 원', '단위: 천원');
            }
        });
    });

    return ws;
}


// ============================================================================
// FN 시트
// ============================================================================

function writeFnSheet(wb, coverInfo) {
    const ws = wb.addWorksheet('FN');
    const fontTitle = { name: DEFAULT_FONT_NAME, size: 12, bold: true };
    const fontNormal = { name: DEFAULT_FONT_NAME, size: DEFAULT_FONT_SIZE };

    ws.getCell(1, DATA_COL_START).value = '주석';
    ws.getCell(1, DATA_COL_START).font = fontTitle;

    if (coverInfo.periodFrom && coverInfo.periodTo) {
        ws.getCell(2, DATA_COL_START).value = `제46(당)기 ${coverInfo.periodFrom} 부터 ${coverInfo.periodTo} 까지`;
        ws.getCell(2, DATA_COL_START).font = fontNormal;
        ws.getCell(3, DATA_COL_START).value = '제45(전)기';
        ws.getCell(3, DATA_COL_START).font = fontNormal;
    }

    ws.getCell(5, DATA_COL_START).value = coverInfo.companyName || '';
    ws.getCell(5, DATA_COL_START).font = fontNormal;

    ws.getColumn('D').width = 60;
    return ws;
}


// ============================================================================
// 주석 시트 (개별)
// ============================================================================

function writeNoteSheet(wb, sheetName, noteElements) {
    const ws = wb.addWorksheet(sheetName);
    const fontNormal = { name: DEFAULT_FONT_NAME, size: DEFAULT_FONT_SIZE };
    let row = 1;

    for (const elem of noteElements) {
        const tag = elem.tagName;
        if (tag === 'P') {
            const text = getText(elem).trim();
            if (!text) {
                row++;
                continue;
            }

            const usermark = elem.getAttribute('USERMARK') || '';
            const info = parseUsermark(usermark);
            const size = info.size || DEFAULT_FONT_SIZE;
            const bold = info.bold || false;

            const lines = text.split('\n');
            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (line) {
                    const cell = ws.getCell(row, DATA_COL_START);
                    cell.value = line;
                    cell.font = { name: DEFAULT_FONT_NAME, size, bold };
                    cell.alignment = { wrapText: true };
                }
                row++;
            }
        } else if (tag === 'TABLE') {
            const tableData = parseTable(elem);
            row = writeParsedTable(ws, tableData, row, DATA_COL_START);
        } else if (tag === 'TABLE-GROUP') {
            for (const t of findChildren(elem, 'TABLE')) {
                const tableData = parseTable(t);
                row = writeParsedTable(ws, tableData, row, DATA_COL_START);
            }
        }
    }

    ws.getColumn('D').width = 35;
    for (let colIdx = 5; colIdx <= 14; colIdx++) {
        ws.getColumn(colIdx).width = 18;
    }

    return ws;
}


// ============================================================================
// Conduct 시트
// ============================================================================

function writeConductSheet(wb, conductSection) {
    const ws = wb.addWorksheet('Conduct');
    if (!conductSection) return ws;

    const fontNormal = { name: DEFAULT_FONT_NAME, size: DEFAULT_FONT_SIZE };
    let row = 1;

    for (const child of conductSection.children) {
        const tag = child.tagName;

        if (tag === 'TITLE') {
            const cell = ws.getCell(row, DATA_COL_START);
            cell.value = getText(child).trim();
            cell.font = { name: DEFAULT_FONT_NAME, size: 12, bold: true };
            row++;
        } else if (tag === 'SECTION-2') {
            for (const secChild of child.children) {
                const secTag = secChild.tagName;
                if (secTag === 'TITLE') {
                    const cell = ws.getCell(row, DATA_COL_START);
                    cell.value = getText(secChild).trim();
                    cell.font = { name: DEFAULT_FONT_NAME, size: 10, bold: true };
                    row++;
                } else if (secTag === 'TABLE') {
                    const tableData = parseTable(secChild);
                    row = writeParsedTable(ws, tableData, row, DATA_COL_START);
                } else if (secTag === 'TABLE-GROUP') {
                    for (const t of findChildren(secChild, 'TABLE')) {
                        const tableData = parseTable(t);
                        row = writeParsedTable(ws, tableData, row, DATA_COL_START);
                    }
                } else if (secTag === 'P') {
                    const text = getText(secChild).trim();
                    if (text) {
                        const lines = text.split('\n');
                        for (const rawLine of lines) {
                            const line = rawLine.trim();
                            if (line) {
                                ws.getCell(row, DATA_COL_START).value = line;
                                ws.getCell(row, DATA_COL_START).font = fontNormal;
                            }
                            row++;
                        }
                    } else {
                        row++;
                    }
                }
            }
        } else if (tag === 'P') {
            const text = getText(child).trim();
            if (text) {
                const lines = text.split('\n');
                for (const rawLine of lines) {
                    const line = rawLine.trim();
                    if (line) {
                        ws.getCell(row, DATA_COL_START).value = line;
                        ws.getCell(row, DATA_COL_START).font = fontNormal;
                    }
                    row++;
                }
            } else {
                row++;
            }
        } else if (tag === 'TABLE') {
            const tableData = parseTable(child);
            row = writeParsedTable(ws, tableData, row, DATA_COL_START);
        } else if (tag === 'TABLE-GROUP') {
            for (const t of findChildren(child, 'TABLE')) {
                const tableData = parseTable(t);
                row = writeParsedTable(ws, tableData, row, DATA_COL_START);
            }
        }
    }

    ws.getColumn('D').width = 20;
    for (let colIdx = 5; colIdx <= 19; colIdx++) {
        ws.getColumn(colIdx).width = 12;
    }

    return ws;
}


// ============================================================================
// 메인 변환 함수
// ============================================================================

/**
 * DSD ArrayBuffer → ExcelJS Workbook 생성
 * @param {ArrayBuffer} arrayBuffer - DSD 파일 내용
 * @param {Function} onProgress - 진행 상태 콜백 (message)
 * @returns {Promise<{workbook: ExcelJS.Workbook, coverInfo: object}>}
 */
async function convertDsdToExcel(arrayBuffer, onProgress) {
    onProgress = onProgress || (() => {});

    // 1. DSD 파싱
    onProgress('ZIP 해제 및 XML 파싱 중...');
    const { metaDoc, contentsDoc } = await parseDsd(arrayBuffer);
    const root = contentsDoc.documentElement;

    // 2. 문서 구조 분석
    onProgress('문서 구조 분석 중...');
    const doc = analyzeDocument(root);
    const coverInfo = extractCoverInfo(doc.cover);
    const tocItems = extractTocItems(doc.toc);
    const statements = splitFinancialStatements(doc.fsSection);
    const notes = splitNotes(doc.notesSection);

    // 3. Excel 워크북 생성
    onProgress('Excel 워크북 생성 중...');
    const wb = new ExcelJS.Workbook();

    onProgress('Cover 시트 생성...');
    writeCoverSheet(wb, coverInfo);

    onProgress('ToC 시트 생성...');
    writeTocSheet(wb, tocItems);

    onProgress('Opinion 시트 생성...');
    writeOpinionSheet(wb, doc.opinionSection);

    onProgress('FS 시트 생성...');
    writeFsSheet(wb, statements.fsHeader);

    // 재무제표
    const fsPairs = [
        ['BS', 'BS2', statements.bs],
        ['IS', 'IS2', statements.is],
        ['CF', 'CF2', statements.cf],
        ['CE', 'CE2', statements.ce],
    ];

    for (const [name, name2, elems] of fsPairs) {
        onProgress(`${name} 시트 생성...`);
        writeFinancialStatementSheet(wb, name, elems);
        onProgress(`${name2} 시트 생성...`);
        writeFinancialStatementDivided(wb, name, name2);
    }

    onProgress('FN 시트 생성...');
    writeFnSheet(wb, coverInfo);

    // 주석
    for (const note of notes) {
        onProgress(`주석 ${note.num} 시트 생성...`);
        writeNoteSheet(wb, String(note.num), note.elements);
    }

    // Sox 빈 시트
    wb.addWorksheet('Sox');

    onProgress('Conduct 시트 생성...');
    writeConductSheet(wb, doc.conductSection);

    onProgress('Excel 파일 생성 중...');

    return { workbook: wb, coverInfo };
}
