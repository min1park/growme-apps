/**
 * 산출물 생성 모듈
 */
const ReportGenerator = {

    // ── 계정별 증감표 ──────────────────────────────────
    createAccountDCSummary(data) {
        const map = {};
        data.forEach(r => {
            const key = r.account_code + '||' + r.account_name;
            if (!map[key]) map[key] = { code: r.account_code, name: r.account_name,
                                         전기이월: 0, 차변: 0, 대변: 0, '차변/대변': 0, 무금액: 0 };
            const dc = r.dc_type || '무금액';
            map[key][dc] = (map[key][dc] || 0) + (r.net_amount || 0);
        });

        const rows = Object.values(map).sort((a, b) => a.code < b.code ? -1 : 1);
        rows.forEach(r => {
            r.총합계 = (r.전기이월 || 0) + (r.차변 || 0) + (r.대변 || 0) +
                       (r['차변/대변'] || 0) + (r.무금액 || 0);
        });

        const total = { code: '총합계', name: '', 전기이월: 0, 차변: 0, 대변: 0, 총합계: 0 };
        rows.forEach(r => {
            total.전기이월 += r.전기이월 || 0;
            total.차변 += r.차변 || 0;
            total.대변 += r.대변 || 0;
            total.총합계 += r.총합계 || 0;
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

        // 가공 필드 (고정)
        const processedHeaders = ['회계일','전표번호','계정과목코드','계정과목','차변금액','대변금액',
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
            const processedRow = [
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
        const colWidths = [
            {wch:12},{wch:28},{wch:16},{wch:30},{wch:18},{wch:18},
            {wch:18},{wch:10},{wch:6},{wch:45},{wch:10},{wch:10},{wch:10}
        ];
        if (rawCols.length > 0) {
            colWidths.push({wch:3}); // 구분 열
            rawCols.forEach(() => colWidths.push({wch:18}));
        }
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, '가공원장');
        return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    },

    // ── 엑셀 파일 생성: 전체 리포트 ────────────────────
    generateFullReportExcel(accountSummary, monthlySummary, validationResults,
                            anomalySummary, anomalyDetails) {
        const wb = XLSX.utils.book_new();

        // 1. 검증 결과
        if (validationResults && validationResults.length > 0) {
            const wsData = [['테스트','상태','메시지','상세']];
            validationResults.forEach(r => {
                const statusIcon = r.status === 'success' ? '✅ 통과' :
                                   r.status === 'error' ? '❌ 오류' : '⚠️ 경고';
                wsData.push([r.test, statusIcon, r.message, r.detail]);
            });
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [{wch:20},{wch:12},{wch:50},{wch:50}];
            XLSX.utils.book_append_sheet(wb, ws, '검증결과');
        }

        // 2. 계정별 증감표
        if (accountSummary && accountSummary.length > 0) {
            const wsData = [['계정과목코드','계정과목','전기이월','차변','대변','총합계']];
            accountSummary.forEach(r => {
                wsData.push([r.code, r.name, r.전기이월||0, r.차변||0, r.대변||0, r.총합계||0]);
            });
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [{wch:16},{wch:30},{wch:18},{wch:18},{wch:18},{wch:18}];
            XLSX.utils.book_append_sheet(wb, ws, '계정별증감표');
        }

        // 3. 월별 증감표
        if (monthlySummary) {
            const { rows, months } = monthlySummary;
            const headers = ['계정과목코드', '계정과목'];
            months.forEach(m => headers.push(m === 0 ? '전기이월' : `${m}월`));
            headers.push('총합계');

            const wsData = [headers];
            rows.forEach(r => {
                const row = [r.code, r.name];
                months.forEach(m => row.push(r[`m${m}`] || 0));
                row.push(r.총합계 || 0);
                wsData.push(row);
            });
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [{wch:16},{wch:30}, ...months.map(()=>({wch:16})), {wch:16}];
            XLSX.utils.book_append_sheet(wb, ws, '월별증감표');
        }

        // 4. 이상분개 요약
        if (anomalySummary && anomalySummary.length > 0) {
            const wsData = [['테스트 항목','탐지 건수','비율(%)','상태']];
            anomalySummary.forEach(r => {
                wsData.push([r.name, r.count, r.pct, r.status]);
            });
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [{wch:25},{wch:12},{wch:10},{wch:15}];
            XLSX.utils.book_append_sheet(wb, ws, '이상분개_요약');
        }

        // 5. 이상분개 상세
        if (anomalyDetails) {
            for (const [testName, items] of Object.entries(anomalyDetails)) {
                if (items.length === 0) continue;
                const sheetName = testName.replace(/[\/\\*?\[\]:]/g, '_').substring(0, 31);
                const headers = ['회계일','전표번호','계정코드','계정명',
                               '차변','대변','증감','적요','기표자','승인자','탐지사유'];
                const wsData = [headers];
                items.forEach(r => {
                    wsData.push([
                        r.date instanceof Date ? DataProcessor.formatDate(r.date) : '',
                        r.entry_no || '', r.account_code || '', r.account_name || '',
                        r.debit || 0, r.credit || 0, r.net_amount || 0,
                        r.description || '', r.preparer || '', r.approver || '',
                        r.test_reason || ''
                    ]);
                });
                const ws = XLSX.utils.aoa_to_sheet(wsData);
                ws['!cols'] = [{wch:12},{wch:25},{wch:15},{wch:25},
                              {wch:18},{wch:18},{wch:18},{wch:40},{wch:10},{wch:10},{wch:20}];
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
            }
        }

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
