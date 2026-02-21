/**
 * 데이터 완전성 및 정합성 검증 모듈
 */
const Validator = {

    runAll(data) {
        const results = [];
        results.push(this._checkBeginningBalance(data));
        results.push(this._checkDebitCreditBalance(data));
        results.push(this._checkNetAmountTotal(data));
        results.push(this._checkMonthlyBalance(data));
        results.push(this._checkMissingAccountInfo(data));
        results.push(this._checkDuplicateEntries(data));
        return results.filter(r => r !== null);
    },

    _checkBeginningBalance(data) {
        const bb = data.filter(r => r.dc_type === '전기이월');
        if (bb.length === 0) {
            return { test: '기초잔액 완전성', status: 'warning',
                     message: '기초잔액(전기이월) 데이터가 없습니다.',
                     detail: '기초잔액을 업로드하지 않은 경우 정상입니다.' };
        }
        const total = bb.reduce((s, r) => s + r.net_amount, 0);
        if (Math.abs(total) < 1) {
            return { test: '기초잔액 완전성', status: 'success',
                     message: `기초잔액 합계 = ${DataProcessor.formatNumber(total)} (정상)`,
                     detail: `전기이월 건수: ${bb.length.toLocaleString()}건` };
        }
        return { test: '기초잔액 완전성', status: 'error',
                 message: `기초잔액 합계 = ${DataProcessor.formatNumber(total)} (0이 아님)`,
                 detail: '자산 합계와 부채+자본 합계가 일치하지 않습니다.' };
    },

    _checkDebitCreditBalance(data) {
        const journal = data.filter(r => r.dc_type !== '전기이월');
        if (journal.length === 0) return null;
        const totalDebit = journal.reduce((s, r) => s + (r.debit || 0), 0);
        const totalCredit = journal.reduce((s, r) => s + (r.credit || 0), 0);
        const diff = totalDebit - totalCredit;
        if (Math.abs(diff) < 1) {
            return { test: '차변/대변 일치', status: 'success',
                     message: `차변 합계: ${DataProcessor.formatNumber(totalDebit)} | 대변 합계: ${DataProcessor.formatNumber(totalCredit)}`,
                     detail: `분개 건수: ${journal.length.toLocaleString()}건` };
        }
        return { test: '차변/대변 일치', status: 'error',
                 message: `차변-대변 차이: ${DataProcessor.formatNumber(diff)}`,
                 detail: `차변: ${DataProcessor.formatNumber(totalDebit)} | 대변: ${DataProcessor.formatNumber(totalCredit)}` };
    },

    _checkNetAmountTotal(data) {
        const total = data.reduce((s, r) => s + (r.net_amount || 0), 0);
        if (Math.abs(total) < 1) {
            return { test: '증감 총합', status: 'success',
                     message: `증감 총합 = ${DataProcessor.formatNumber(total)} (정상)`,
                     detail: '전체 데이터(기초잔액 포함)의 증감 합계가 0입니다.' };
        }
        return { test: '증감 총합', status: 'error',
                 message: `증감 총합 = ${DataProcessor.formatNumber(total)} (0이 아님)`,
                 detail: '데이터의 완전성에 문제가 있을 수 있습니다.' };
    },

    _checkMonthlyBalance(data) {
        const monthly = {};
        data.forEach(r => {
            const m = r.month ?? 0;
            monthly[m] = (monthly[m] || 0) + (r.net_amount || 0);
        });
        const errors = Object.entries(monthly).filter(([, v]) => Math.abs(v) >= 1);
        if (errors.length === 0) {
            return { test: '월별 증감 균형', status: 'success',
                     message: '모든 월의 증감 합계가 0입니다.',
                     detail: `검증 월: ${Object.keys(monthly).sort((a,b)=>a-b).join(', ')}` };
        }
        const errStr = errors.map(([m, v]) => `${m}월(${DataProcessor.formatNumber(v)})`).join(', ');
        return { test: '월별 증감 균형', status: 'error',
                 message: `증감 불균형 월: ${errStr}`,
                 detail: '해당 월의 분개 데이터를 확인해주세요.' };
    },

    _checkMissingAccountInfo(data) {
        let missingCode = 0, missingName = 0;
        data.forEach(r => {
            if (!r.account_code || r.account_code === '' || r.account_code === 'nan') missingCode++;
            if (!r.account_name || r.account_name === '' || r.account_name === 'nan') missingName++;
        });
        if (missingCode === 0 && missingName === 0) {
            return { test: '계정 정보 완전성', status: 'success',
                     message: '모든 분개에 계정코드와 계정명이 존재합니다.', detail: '' };
        }
        return { test: '계정 정보 완전성', status: 'warning',
                 message: `계정코드 누락: ${missingCode}건, 계정명 누락: ${missingName}건`,
                 detail: '누락된 건의 데이터를 확인해주세요.' };
    },

    // ── 중복 분개 확인 (line_no 포함 보완) ──────────────
    _checkDuplicateEntries(data) {
        const journal = data.filter(r => r.dc_type !== '전기이월');
        // entry_no가 하나라도 유효한 값이 있는지 확인
        const hasEntryNo = journal.some(r => r.entry_no && String(r.entry_no).trim() &&
                                              String(r.entry_no).trim() !== 'nan');
        if (!hasEntryNo) return null;

        const hasLineNo = journal.some(r => r.line_no !== undefined && r.line_no !== '' &&
                                             String(r.line_no).trim() !== 'nan');

        const seen = new Set();
        let dupes = 0;
        journal.forEach(r => {
            // line_no가 있으면 함께 사용하여 정당한 동일 계정 복수 행 구분
            let key = `${r.entry_no}|${r.account_code}|${r.debit}|${r.credit}`;
            if (hasLineNo) {
                key += `|${r.line_no}`;
            }
            if (seen.has(key)) dupes++;
            seen.add(key);
        });

        if (dupes === 0) {
            return { test: '중복 분개 확인', status: 'success',
                     message: '중복 분개가 발견되지 않았습니다.',
                     detail: `검증 기준: 전표번호+계정코드+금액${hasLineNo ? '+행번호' : ''}` };
        }
        return { test: '중복 분개 확인', status: 'warning',
                 message: `중복 의심 분개: ${dupes}건`,
                 detail: `동일 전표번호, 계정코드, 금액${hasLineNo ? ', 행번호' : ''}를 가진 분개가 존재합니다.` };
    }
};
