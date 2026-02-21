/**
 * DSD → Excel 변환기 - 유틸리티 함수
 */

// ============================================================================
// 상수
// ============================================================================
const DEFAULT_FONT_NAME = '맑은 고딕';
const DEFAULT_FONT_SIZE = 8;
const THIN_BORDER_STYLE = { style: 'thin' };
const ALL_THIN_BORDERS = {
    top: THIN_BORDER_STYLE,
    left: THIN_BORDER_STYLE,
    bottom: THIN_BORDER_STYLE,
    right: THIN_BORDER_STYLE
};
const NUMBER_FORMAT = '#,##0_);\\(#,##0\\);\\-_)';
const FS_DIVIDER = 1000;
const DATA_COL_START = 4; // D열


// ============================================================================
// XML 텍스트 추출
// ============================================================================

/**
 * XML 요소와 모든 하위 요소의 텍스트를 합쳐서 반환.
 * Python의 get_text(elem) 함수와 동일한 역할.
 * JS DOM에는 tail이 없으므로 childNodes를 순회하여 TEXT_NODE와 ELEMENT_NODE를 구분.
 */
function getText(elem) {
    if (!elem) return '';
    let result = '';
    for (const node of elem.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            result += getText(node);
        }
    }
    // XML 레벨에서 치환되지 않은 리터럴 &cr; 처리
    result = result.replace(/&cr;/g, '\n');
    return result;
}


// ============================================================================
// USERMARK 파싱
// ============================================================================

/**
 * USERMARK 문자열에서 폰트 정보 추출.
 * 반환: { bold?: boolean, size?: number, color?: string }
 */
function parseUsermark(usermark) {
    if (!usermark) return {};
    const info = {};
    const tokens = usermark.trim().split(/\s+/);
    for (const token of tokens) {
        if (token === 'B') {
            info.bold = true;
        } else if (token === '!B') {
            info.bold = false;
        } else if (token.startsWith('F-') && token !== 'F-GL') {
            const sizeStr = token.substring(2).replace('BT', '');
            const size = parseInt(sizeStr, 10);
            if (!isNaN(size)) info.size = size;
        } else if (token.startsWith('P') && /^\d+$/.test(token.substring(1))) {
            const size = parseInt(token.substring(1), 10);
            if (!isNaN(size)) info.size = size;
        } else if (token.startsWith('0X') || token.startsWith('0x')) {
            const color = token.substring(2);
            if (color.length === 6) info.color = color;
        }
    }
    return info;
}


// ============================================================================
// 숫자 파싱
// ============================================================================

/**
 * 천단위 구분 쉼표가 올바른 형식인지 검증.
 * 올바른 형식: 1,234 / 12,345,678
 * 잘못된 형식: 6,25,29 / 1,23
 */
function isValidThousandsFormat(s) {
    if (!s.includes(',')) return true;
    // 음수 부호 제거
    s = s.replace(/^-/, '');
    const parts = s.split(',');
    if (!parts[0] || !/^\d+$/.test(parts[0])) return false;
    // 첫 번째 부분: 1~3자리
    if (parts[0].length > 3 || parts[0].length === 0) return false;
    // 나머지 부분: 정확히 3자리
    for (let i = 1; i < parts.length; i++) {
        if (parts[i].length !== 3 || !/^\d{3}$/.test(parts[i])) return false;
    }
    return true;
}

/**
 * 텍스트에서 숫자를 파싱 시도.
 * 반환: { value: any, isNumber: boolean }
 */
function tryParseNumber(text) {
    if (!text) return { value: text, isNumber: false };
    const cleaned = text.trim();
    if (!cleaned || cleaned === '\u3000') return { value: cleaned, isNumber: false };

    // 대시(-)는 숫자 0으로 처리
    if (cleaned === '-') return { value: 0, isNumber: true };

    // 괄호 음수: (1,234,567)
    const negMatch = cleaned.match(/^\(([0-9,]+)\)$/);
    if (negMatch) {
        const inner = negMatch[1];
        if (!isValidThousandsFormat(inner)) return { value: cleaned, isNumber: false };
        const numStr = inner.replace(/,/g, '');
        const num = parseInt(numStr, 10);
        if (isNaN(num)) return { value: cleaned, isNumber: false };
        return { value: -num, isNumber: true };
    }

    // 일반 정수: 1,234,567 또는 -1,234,567
    const numMatch = cleaned.match(/^-?[0-9,]+$/);
    if (numMatch) {
        if (!isValidThousandsFormat(cleaned)) return { value: cleaned, isNumber: false };
        const numStr = cleaned.replace(/,/g, '');
        const num = parseInt(numStr, 10);
        if (isNaN(num)) return { value: cleaned, isNumber: false };
        return { value: num, isNumber: true };
    }

    // 소수: 1,234.56
    const decMatch = cleaned.match(/^(-?[0-9,]+)\.[0-9]+$/);
    if (decMatch) {
        const intPart = decMatch[1].replace(/^-/, '');
        if (!isValidThousandsFormat(intPart)) return { value: cleaned, isNumber: false };
        const numStr = cleaned.replace(/,/g, '');
        const num = parseFloat(numStr);
        if (isNaN(num)) return { value: cleaned, isNumber: false };
        return { value: num, isNumber: true };
    }

    return { value: cleaned, isNumber: false };
}


// ============================================================================
// Excel 단위 변환
// ============================================================================

/**
 * 픽셀 너비를 Excel 열 너비 단위로 변환
 */
function pxToExcelWidth(px) {
    return Math.max(px / 7.0, 2.0);
}

/**
 * 1-based column index를 Excel 열 문자로 변환 (1 → 'A', 4 → 'D')
 */
function getColumnLetter(colIndex) {
    let result = '';
    let idx = colIndex;
    while (idx > 0) {
        const mod = (idx - 1) % 26;
        result = String.fromCharCode(65 + mod) + result;
        idx = Math.floor((idx - 1) / 26);
    }
    return result;
}


// ============================================================================
// XML 헬퍼
// ============================================================================

/**
 * elem의 직접 자식 중 특정 tagName을 가진 첫 번째 요소 반환 (Python find() 동치)
 */
function findChild(elem, tagName) {
    if (!elem) return null;
    for (const child of elem.children) {
        if (child.tagName === tagName) return child;
    }
    return null;
}

/**
 * elem의 직접 자식 중 특정 tagName을 가진 모든 요소 반환 (Python findall() 동치)
 */
function findChildren(elem, tagName) {
    if (!elem) return [];
    return Array.from(elem.children).filter(c => c.tagName === tagName);
}

/**
 * elem의 직접 자식을 모두 배열로 반환
 */
function getChildren(elem) {
    if (!elem) return [];
    return Array.from(elem.children);
}
