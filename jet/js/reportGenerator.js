/**
 * 산출물 생성 모듈
 */
const ReportGenerator = {

    // CoA 계층 사용 여부
    _hasCoA() { return typeof CoAMapper !== 'undefined' && CoAMapper.enabled; },

    // ── 계정별 증감표 ──────────────────────────────────
    createAccountDCSummary(data) {
        const map = {};
        data.forEach(r => {
            const key = r.account_code + '||' + r.account_name;
            if (!map[key]) map[key] = { code: r.account_code, name: r.account_name,
                                         major: r.coa_major||'', middle: r.coa_middle||'',
                                         unit: r.coa_unit||'', coa: r.coa_name||'',
                                         전기이월: 0, 차변: 0, 대변: 0 };
            const dc = r.dc_type || '';
            if (dc === '전기이월') {
                map[key].전기이월 += (r.net_amount || 0);
            } else {
                // 차변/대변 금액을 각각 합산 (음수 포함)
                map[key].차변 += (r.debit || 0);
                map[key].대변 += (r.credit || 0);
            }
        });

        // CoA 있으면 대분류(자산1부채2자본3수익4비용5) → 코드 순 정렬
        const ORD = {'자산':1,'부채':2,'자본':3,'수익':4,'비용':5,'영업외손익':6};
        const rows = Object.values(map).sort((a, b) => {
            if (this._hasCoA()) {
                const oa = ORD[a.major]||9, ob = ORD[b.major]||9;
                if (oa !== ob) return oa - ob;
            }
            return a.code < b.code ? -1 : 1;
        });
        rows.forEach(r => {
            r.기말 = (r.전기이월 || 0) + (r.차변 || 0) - (r.대변 || 0);
        });

        const total = { code: '총합계', name: '', major:'', middle:'', unit:'', coa:'',
                        전기이월: 0, 차변: 0, 대변: 0, 기말: 0 };
        rows.forEach(r => {
            total.전기이월 += r.전기이월 || 0;
            total.차변 += r.차변 || 0;
            total.대변 += r.대변 || 0;
            total.기말 += r.기말 || 0;
        });
        rows.push(total);

        return rows;
    },

    // ── 월별 증감표 ────────────────────────────────────
    createMonthlySummary(data) {
        const map = {};
        const allMonths = new Set();

        data.forEach(r => {
            const key = r.account_code + '||' + r.account_name;
            const m = r.month ?? 0;
            allMonths.add(m);
            if (!map[key]) map[key] = { code: r.account_code, name: r.account_name, months: {} };
            map[key].months[m] = (map[key].months[m] || 0) + (r.net_amount || 0);
        });

        const months = [...allMonths].sort((a, b) => a - b);
        const rows = Object.values(map).sort((a, b) => a.code < b.code ? -1 : 1);

        rows.forEach(r => {
            r.총합계 = 0;
            months.forEach(m => {
                r[`m${m}`] = r.months[m] || 0;
                r.총합계 += r[`m${m}`];
            });
        });

        const total = { code: '총합계', name: '', 총합계: 0, months: {} };
        months.forEach(m => {
            total[`m${m}`] = 0;
            rows.forEach(r => { if (r.code !== '총합계') total[`m${m}`] += r[`m${m}`] || 0; });
            total.총합계 += total[`m${m}`];
        });
        rows.push(total);

        return { rows, months };
    },

    // ── 엑셀 파일 생성: 가공원장 ───────────────────────
    generateProcessedLedgerExcel(data) {
        const wb = XLSX.utils.book_new();

        const hasCoA = this._hasCoA();
        // CoA 계층 (있을 때만, 맨 앞)
        const coaHeaders = hasCoA
            ? ['대구분','중구분','공시단위CoA','연결CoA코드','연결CoA'] : [];
        // 가공 필드 (고정)
        const processedHeaders = [...coaHeaders,
                        '회계일','전표번호','계정과목코드','계정과목','차변금액','대변금액',
                        '증감','차대구분','월','적요','기표자','승인자','요일'];

        // 원본 컬럼 수집 (_raw가 있는 행에서)
        const rawColSet = new Set();
        data.forEach(r => {
            if (r._raw) Object.keys(r._raw).forEach(k => rawColSet.add(k));
        });
        const rawCols = [...rawColSet];

        // 원본 컬럼이 있으면 구분선 + 원본 헤더 추가
        const headers = rawCols.length > 0
            ? [...processedHeaders, '', ...rawCols.map(c => '[원본] ' + c)]
            : processedHeaders;
        const wsData = [headers];

        data.forEach(r => {
            const coaCells = hasCoA
                ? [r.coa_major||'', r.coa_middle||'', r.coa_unit||'', r.coa_code||'', r.coa_name||'']
                : [];
            const processedRow = [
                ...coaCells,
                r.date instanceof Date ? DataProcessor.formatDate(r.date) : (r.date || ''),
                r.entry_no || '',
                r.account_code || '',
                r.account_name || '',
                r.debit || 0,
                r.credit || 0,
                r.net_amount || 0,
                r.dc_type || '',
                r.month ?? 0,
                r.description || '',
                r.preparer || '',
                r.approver || '',
                r.weekday_name || '',
            ];

            if (rawCols.length > 0) {
                processedRow.push(''); // 구분 빈 열
                rawCols.forEach(col => {
                    const val = r._raw ? (r._raw[col] ?? '') : '';
                    processedRow.push(val);
                });
            }

            wsData.push(processedRow);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const colWidths = [];
        if (hasCoA) { colWidths.push({wch:8},{wch:12},{wch:16},{wch:14},{wch:16}); }
        colWidths.push(
            {wch:12},{wch:28},{wch:16},{wch:30},{wch:18},{wch:18},
            {wch:18},{wch:10},{wch:6},{wch:45},{wch:10},{wch:10},{wch:10}
        );
        if (rawCols.length > 0) {
            colWidths.push({wch:3}); // 구분 열
            rawCols.forEach(() => colWidths.push({wch:18}));
        }
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, '가공원장');
        return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    },

    // ── 시트 헬퍼: 검증결과 ──
    _sheetValidation(wb, validationResults) {
        if (!validationResults || !validationResults.length) return;
        const wsData = [['테스트','상태','메시지','상세']];
        validationResults.forEach(r => {
            const icon = r.status==='success'?'✅ 통과':r.status==='error'?'❌ 오류':'⚠️ 경고';
            wsData.push([r.test, icon, r.message, r.detail]);
        });
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{wch:20},{wch:12},{wch:50},{wch:50}];
        XLSX.utils.book_append_sheet(wb, ws, '검증결과');
    },

    // ── 시트 헬퍼: 계정별 증감표 (CoA 반영) ──
    _sheetAccountSummary(wb, accountSummary) {
        if (!accountSummary || !accountSummary.length) return;
        const hasCoA = this._hasCoA();
        const head = hasCoA
            ? ['대구분','중구분','공시단위CoA','연결CoA','계정과목코드','계정과목',
               '기초(전기이월)','당기차변','당기대변','증감','기말잔액']
            : ['계정과목코드','계정과목','전기이월','차변','대변','기말'];
        const wsData = [head];
        accountSummary.forEach(r => {
            if (hasCoA) {
                wsData.push([r.major||'', r.middle||'', r.unit||'', r.coa||'',
                    r.code, r.name, r.전기이월||0, r.차변||0, r.대변||0,
                    (r.차변||0)-(r.대변||0), r.기말||0]);
            } else {
                wsData.push([r.code, r.name, r.전기이월||0, r.차변||0, r.대변||0, r.기말||0]);
            }
        });
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = hasCoA
            ? [{wch:8},{wch:12},{wch:16},{wch:16},{wch:16},{wch:26},
               {wch:18},{wch:18},{wch:18},{wch:18},{wch:18}]
            : [{wch:16},{wch:30},{wch:18},{wch:18},{wch:18},{wch:18}];
        XLSX.utils.book_append_sheet(wb, ws, '계정별증감표');
    },

    // ── 시트 헬퍼: 월별 증감표 (CoA 반영) ──
    _sheetMonthlySummary(wb, monthlySummary) {
        if (!monthlySummary) return;
        const { rows, months } = monthlySummary;
        const hasCoA = this._hasCoA();
        const headers = hasCoA ? ['대구분','계정과목코드','계정과목'] : ['계정과목코드','계정과목'];
        months.forEach(m => headers.push(m === 0 ? '전기이월' : `${m}월`));
        headers.push('총합계');
        const wsData = [headers];
        rows.forEach(r => {
            const row = hasCoA ? [r.major||'', r.code, r.name] : [r.code, r.name];
            months.forEach(m => row.push(r[`m${m}`] || 0));
            row.push(r.총합계 || 0);
            wsData.push(row);
        });
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const lead = hasCoA ? [{wch:8},{wch:16},{wch:26}] : [{wch:16},{wch:30}];
        ws['!cols'] = [...lead, ...months.map(()=>({wch:16})), {wch:16}];
        XLSX.utils.book_append_sheet(wb, ws, '월별증감표');
    },

    // ── 시트 헬퍼: 이상분개 요약+상세 ──
    _sheetAnomaly(wb, anomalySummary, anomalyDetails) {
        if (anomalySummary && anomalySummary.length) {
            const wsData = [['테스트 항목','탐지 건수','비율(%)','상태']];
            anomalySummary.forEach(r => wsData.push([r.name, r.count, r.pct, r.status]));
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [{wch:25},{wch:12},{wch:10},{wch:15}];
            XLSX.utils.book_append_sheet(wb, ws, '이상분개_요약');
        }
        if (anomalyDetails) {
            const hasCoA = this._hasCoA();
            for (const [testName, items] of Object.entries(anomalyDetails)) {
                if (!items || items.length === 0) continue;
                const sheetName = testName.replace(/[\/\\*?\[\]:]/g,'_').substring(0,31);
                const headers = (hasCoA?['대구분']:[]).concat(
                    ['회계일','전표번호','계정코드','계정명','차변','대변','증감',
                     '적요','기표자','승인자','탐지사유']);
                const wsData = [headers];
                items.forEach(r => {
                    const lead = hasCoA ? [r.coa_major||''] : [];
                    wsData.push([...lead,
                        r.date instanceof Date ? DataProcessor.formatDate(r.date) : '',
                        r.entry_no||'', r.account_code||'', r.account_name||'',
                        r.debit||0, r.credit||0, r.net_amount||0,
                        r.description||'', r.preparer||'', r.approver||'', r.test_reason||'']);
                });
                const ws = XLSX.utils.aoa_to_sheet(wsData);
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
            }
        }
    },

    // ── 개별: 증감표만 ──
    generateSummariesExcel(accountSummary, monthlySummary) {
        const wb = XLSX.utils.book_new();
        this._sheetAccountSummary(wb, accountSummary);
        this._sheetMonthlySummary(wb, monthlySummary);
        return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    },

    // ── 개별: JET 결과만 ──
    generateJetExcel(anomalySummary, anomalyDetails) {
        const wb = XLSX.utils.book_new();
        this._sheetAnomaly(wb, anomalySummary, anomalyDetails);
        if (wb.SheetNames.length === 0) {
            const ws = XLSX.utils.aoa_to_sheet([['탐지된 이상분개가 없습니다.']]);
            XLSX.utils.book_append_sheet(wb, ws, '결과');
        }
        return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    },

    // ── 개별: 검증결과만 ──
    generateValidationExcel(validationResults) {
        const wb = XLSX.utils.book_new();
        this._sheetValidation(wb, validationResults);
        return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    },

    // ── 엑셀 파일 생성: 전체 리포트(통합) ──────────────
    generateFullReportExcel(accountSummary, monthlySummary, validationResults,
                            anomalySummary, anomalyDetails, ledgerData) {
        const wb = XLSX.utils.book_new();

        // 1. 가공원장 (원본전체+가공+CoA) — 통합파일 첫 시트
        if (ledgerData && ledgerData.length) {
            const buf = this.generateProcessedLedgerExcel(ledgerData);
            const lwb = XLSX.read(buf, { type: 'array' });
            const lws = lwb.Sheets['가공원장'];
            if (lws) XLSX.utils.book_append_sheet(wb, lws, '가공원장');
        }
        // 2~5
        this._sheetValidation(wb, validationResults);
        this._sheetAccountSummary(wb, accountSummary);
        this._sheetMonthlySummary(wb, monthlySummary);
        this._sheetAnomaly(wb, anomalySummary, anomalyDetails);

        return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    },

    // ── 다운로드 헬퍼 (Blob URL 지연 해제) ─────────────
    downloadExcel(buffer, filename) {
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // 다운로드 시작 후 충분한 시간 뒤에 URL 해제
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
};
