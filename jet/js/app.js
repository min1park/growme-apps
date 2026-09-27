/**
 * 메인 앱 — 단계별 흐름 제어 및 UI
 */

let currentStep = 1;
let chartInstances = {};

let appState = {
    validationResults: null,
    accountSummary: null,
    monthlySummary: null,
    anomalyResults: null,
    anomalySummary: null,
};

// ═══════════════════════════════════════════════════════
// HTML 이스케이프 (XSS 방지)
// ═══════════════════════════════════════════════════════
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════
// 단계 이동
// ═══════════════════════════════════════════════════════
function goToStep(step) {
    currentStep = step;

    // 단계별 진입 시 초기화 동작
    if (step === 2) buildMappingUI();
    if (step === 3) initCoAStep();
    if (step === 5) runValidation();
    if (step === 6) renderOutputs();

    // 모든 섹션 숨김 후 해당 섹션만 표시
    document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${step}`).classList.add('active');

    // 사이드바 업데이트
    document.querySelectorAll('.step-item').forEach((item, idx) => {
        item.classList.remove('active', 'completed');
        if (idx + 1 === step) item.classList.add('active');
        else if (idx + 1 < step) item.classList.add('completed');
    });

    window.scrollTo(0, 0);
}

function resetAll() {
    location.reload();
}

// ═══════════════════════════════════════════════════════
// UI 헬퍼
// ═══════════════════════════════════════════════════════
function toggleCollapsible(btn) {
    const content = btn.nextElementSibling;
    content.classList.toggle('open');
}

function switchTab(btn, tabId) {
    const parent = btn.closest('.step-section');
    parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

function showLoading(text) {
    document.getElementById('loading-text').textContent = text || '처리 중...';
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

function createTable(headers, rows, options = {}) {
    let html = '<table class="data-table"><thead><tr>';
    headers.forEach(h => { html += `<th>${escapeHTML(h)}</th>`; });
    html += '</tr></thead><tbody>';

    rows.forEach((row, rowIdx) => {
        const isTotal = options.totalRow && rowIdx === rows.length - 1;
        const isBB = options.bbHighlight && row._isBB;
        const cls = isTotal ? 'total-row' : (isBB ? 'bb-row' : '');
        html += `<tr class="${cls}">`;
        row.cells.forEach(cell => {
            const numCls = cell.isNum ? ' num' : '';
            html += `<td class="${numCls}">${escapeHTML(cell.value)}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
}

function createMetricCard(label, value) {
    return `<div class="metric-card">
        <div class="metric-label">${escapeHTML(label)}</div>
        <div class="metric-value">${escapeHTML(value)}</div>
    </div>`;
}

// ═══════════════════════════════════════════════════════
// Step 1: 분개장 업로드
// ═══════════════════════════════════════════════════════
async function handleJournalUpload(input) {
    if (!input.files || !input.files[0]) return;
    showLoading('분개장 파일을 읽는 중...');

    try {
        const file = input.files[0];
        const data = await DataProcessor.loadJournal(file);

        document.getElementById('journal-load-info').textContent =
            `✅ 파일 로드 완료: ${data.length.toLocaleString()}건, ${DataProcessor.rawColumns.length}개 컬럼`;

        // 미리보기 테이블
        const previewHeaders = DataProcessor.rawColumns;
        const previewRows = data.slice(0, 20).map(row => ({
            cells: previewHeaders.map(h => ({ value: row[h] ?? '', isNum: false }))
        }));
        document.getElementById('journal-preview-table').innerHTML =
            createTable(previewHeaders, previewRows);

        // 컬럼 목록
        const colHeaders = ['컬럼명', '샘플 값'];
        const colRows = DataProcessor.rawColumns.map(col => ({
            cells: [
                { value: col, isNum: false },
                { value: String(data[0]?.[col] ?? '').substring(0, 50), isNum: false }
            ]
        }));
        document.getElementById('journal-columns-table').innerHTML =
            createTable(colHeaders, colRows);

        document.getElementById('journal-preview').classList.remove('hidden');
    } catch (err) {
        alert('파일 로드 오류: ' + err.message);
    }
    hideLoading();
}

// ═══════════════════════════════════════════════════════
// Step 2: 필드 매핑
// ═══════════════════════════════════════════════════════
function buildMappingUI() {
    // 이미 빌드되었으면 재빌드하지 않음
    if (document.getElementById('required-mapping').children.length > 0) return;

    const fields = DataProcessor.STANDARD_FIELDS;
    const columns = DataProcessor.rawColumns;

    let reqHTML = '';
    let optHTML = '';

    for (const [key, info] of Object.entries(fields)) {
        const suggested = DataProcessor.suggestMapping(key);
        let options = '<option value="">(선택안함)</option>';
        columns.forEach(col => {
            const selected = col === suggested ? 'selected' : '';
            options += `<option value="${escapeHTML(col)}" ${selected}>${escapeHTML(col)}</option>`;
        });

        const label = info.required ? `★ ${escapeHTML(info.label)}` : escapeHTML(info.label);
        const html = `<div class="mapping-item">
            <label>${label}</label>
            <select id="map-${escapeHTML(key)}">${options}</select>
        </div>`;

        if (info.required) reqHTML += html;
        else optHTML += html;
    }

    document.getElementById('required-mapping').innerHTML = reqHTML;
    document.getElementById('optional-mapping').innerHTML = optHTML;
}

function applyMapping() {
    const fields = DataProcessor.STANDARD_FIELDS;
    const mapping = {};

    let allRequired = true;
    for (const [key, info] of Object.entries(fields)) {
        const select = document.getElementById(`map-${key}`);
        if (select) {
            mapping[key] = select.value;
            if (info.required && !select.value) allRequired = false;
        }
    }

    if (!allRequired) {
        document.getElementById('mapping-warning').classList.remove('hidden');
        return;
    }
    document.getElementById('mapping-warning').classList.add('hidden');

    showLoading('매핑 적용 중...');
    try {
        DataProcessor.applyMapping(mapping);
        DataProcessor.createDerivedFields(DataProcessor.mappedData);
        hideLoading();
        goToStep(3);
    } catch (err) {
        hideLoading();
        alert('매핑 오류: ' + err.message);
    }
}

// ═══════════════════════════════════════════════════════
// Step 3: CoA 계정체계 매핑 (선택)
// ═══════════════════════════════════════════════════════
function initCoAStep() {
    // 라디오 상태에 맞춰 섹션 표시
    toggleCoAUpload();
}

function toggleCoAUpload() {
    const useYes = document.querySelector('input[name="use-coa"][value="yes"]').checked;
    document.getElementById('coa-upload-section').classList.toggle('hidden', !useYes);
    document.getElementById('coa-skip-section').classList.toggle('hidden', useYes);
}

async function handleCoAUpload(input) {
    if (!input.files || !input.files[0]) return;
    showLoading('CoA 매핑표를 읽는 중...');
    try {
        const data = await CoAMapper.loadMappingTable(input.files[0]);
        document.getElementById('coa-load-info').textContent =
            `✅ CoA 매핑표 로드: ${data.length.toLocaleString()}건, ${CoAMapper.rawColumns.length}개 컬럼`;

        // 필드 지정 UI
        let html = '';
        CoAMapper.FIELDS.forEach(f => {
            const suggested = CoAMapper.suggestColumn(f.key);
            let opts = '<option value="">(선택안함)</option>';
            CoAMapper.rawColumns.forEach(col => {
                const sel = col === suggested ? 'selected' : '';
                opts += `<option value="${escapeHTML(col)}" ${sel}>${escapeHTML(col)}</option>`;
            });
            const label = f.required ? `★ ${escapeHTML(f.label)}` : escapeHTML(f.label);
            html += `<div class="mapping-item">
                <label>${label}</label>
                <select id="coa-map-${escapeHTML(f.key)}">${opts}</select>
            </div>`;
        });
        document.getElementById('coa-mapping').innerHTML = html;
        document.getElementById('coa-preview').classList.remove('hidden');
    } catch (err) {
        alert('CoA 매핑표 로드 오류: ' + err.message);
    }
    hideLoading();
}

function applyCoAAndNext() {
    const mapping = {};
    CoAMapper.FIELDS.forEach(f => {
        mapping[f.key] = document.getElementById(`coa-map-${f.key}`)?.value || '';
    });
    if (!mapping.account_name) {
        alert('최소한 계정과목명 컬럼은 지정해주세요.');
        return;
    }
    showLoading('CoA 매핑 적용 중...');
    try {
        const stat = CoAMapper.applyMapping(mapping);
        hideLoading();
        alert(`CoA 매핑 완료 — 코드 ${stat.codes}개, 계정과목명 ${stat.names}개 인덱싱`);
        goToStep(4);
    } catch (err) {
        hideLoading();
        alert('CoA 매핑 오류: ' + err.message);
    }
}

function skipCoA() {
    CoAMapper.reset();
    goToStep(4);
}

// ═══════════════════════════════════════════════════════
// Step 4: 기초잔액
// ═══════════════════════════════════════════════════════
function toggleBBUpload() {
    const useYes = document.querySelector('input[name="use-bb"][value="yes"]').checked;
    document.getElementById('bb-upload-section').classList.toggle('hidden', !useYes);
    document.getElementById('bb-skip-section').classList.toggle('hidden', useYes);
}

async function handleBBUpload(input) {
    if (!input.files || !input.files[0]) return;
    showLoading('기초잔액 파일을 읽는 중...');

    try {
        const file = input.files[0];
        const data = await DataProcessor.loadBeginningBalance(file);
        const bbColumns = Object.keys(data[0] || {});

        document.getElementById('bb-load-info').textContent =
            `✅ 기초잔액 로드: ${data.length.toLocaleString()}건`;

        const bbFields = [
            { key: 'account_code', label: '계정과목코드' },
            { key: 'account_name', label: '계정과목명' },
            { key: 'net_amount', label: '증감(잔액) — 자산(+), 부채·자본(-)' },
        ];

        let html = '';
        bbFields.forEach(f => {
            let options = '<option value="">(선택안함)</option>';
            bbColumns.forEach(col => {
                options += `<option value="${escapeHTML(col)}">${escapeHTML(col)}</option>`;
            });
            html += `<div class="mapping-item">
                <label>${escapeHTML(f.label)}</label>
                <select id="bb-map-${escapeHTML(f.key)}">${options}</select>
            </div>`;
        });
        document.getElementById('bb-mapping').innerHTML = html;
        document.getElementById('bb-preview').classList.remove('hidden');
    } catch (err) {
        alert('파일 로드 오류: ' + err.message);
    }
    hideLoading();
}

function applyBBAndCombine() {
    const bbMapping = {
        account_code: document.getElementById('bb-map-account_code')?.value || '',
        account_name: document.getElementById('bb-map-account_name')?.value || '',
        net_amount: document.getElementById('bb-map-net_amount')?.value || '',
    };

    if (!bbMapping.account_code || !bbMapping.account_name || !bbMapping.net_amount) {
        alert('기초잔액 필드를 모두 매핑해주세요.');
        return;
    }

    showLoading('기초잔액 통합 중...');
    try {
        const bbProcessed = DataProcessor.processBeginningBalance(
            DataProcessor.beginningBalance, bbMapping
        );
        DataProcessor.combineData(DataProcessor.mappedData, bbProcessed);
        CoAMapper.enrich(DataProcessor.combinedData);   // CoA 계층 부착(있으면)
        // 캐시 초기화
        appState.validationResults = null;
        appState.accountSummary = null;
        appState.monthlySummary = null;
        appState.anomalyResults = null;
        appState.anomalySummary = null;
        hideLoading();
        goToStep(5);
    } catch (err) {
        hideLoading();
        alert('기초잔액 처리 오류: ' + err.message);
    }
}

function skipBBAndCombine() {
    showLoading('데이터 통합 중...');
    DataProcessor.combineData(DataProcessor.mappedData, null);
    CoAMapper.enrich(DataProcessor.combinedData);       // CoA 계층 부착(있으면)
    appState.validationResults = null;
    appState.accountSummary = null;
    appState.monthlySummary = null;
    appState.anomalyResults = null;
    appState.anomalySummary = null;
    hideLoading();
    goToStep(5);
}

// ═══════════════════════════════════════════════════════
// Step 4: 데이터 검증
// ═══════════════════════════════════════════════════════
function runValidation() {
    if (appState.validationResults) {
        renderValidation(appState.validationResults);
        return;
    }
    const data = DataProcessor.combinedData;
    const results = Validator.runAll(data);
    appState.validationResults = results;
    renderValidation(results);
}

function renderValidation(results) {
    const data = DataProcessor.combinedData;
    let html = '';
    results.forEach(r => {
        const icon = r.status === 'success' ? '✅' : r.status === 'error' ? '❌' : '⚠️';
        html += `<div class="info-box ${r.status}">
            <strong>${escapeHTML(r.test)}</strong> — ${icon} ${escapeHTML(r.message)}
            ${r.detail ? `<br><small>${escapeHTML(r.detail)}</small>` : ''}
        </div>`;
    });
    document.getElementById('validation-results').innerHTML = html;

    // 메트릭
    const journal = data.filter(r => r.dc_type !== '전기이월');
    const bb = data.filter(r => r.dc_type === '전기이월');
    const months = [...new Set(data.map(r => r.month))].sort((a,b)=>a-b);
    const preparers = new Set(
        data.map(r => (r.preparer||'').toString().trim()).filter(p => p && p !== 'nan')
    );

    let metricsHTML = '';
    metricsHTML += createMetricCard('총 데이터 건수', data.length.toLocaleString());
    metricsHTML += createMetricCard('분개 건수', journal.length.toLocaleString());
    metricsHTML += createMetricCard('기초잔액 건수', bb.length.toLocaleString());
    metricsHTML += createMetricCard('계정과목 수',
        new Set(data.map(r=>r.account_code)).size.toLocaleString());
    metricsHTML += createMetricCard('차변 합계',
        DataProcessor.formatNumber(journal.reduce((s,r)=>s+(r.debit||0),0)));
    metricsHTML += createMetricCard('대변 합계',
        DataProcessor.formatNumber(journal.reduce((s,r)=>s+(r.credit||0),0)));
    metricsHTML += createMetricCard('데이터 기간',
        `${Math.min(...months)}~${Math.max(...months)}월`);
    metricsHTML += createMetricCard('기표자 수', preparers.size.toLocaleString());
    document.getElementById('data-summary-metrics').innerHTML = metricsHTML;
}

// ═══════════════════════════════════════════════════════
// Step 5: 산출물
// ═══════════════════════════════════════════════════════
function renderOutputs() {
    const data = DataProcessor.combinedData;

    if (!appState.accountSummary) {
        appState.accountSummary = ReportGenerator.createAccountDCSummary(data);
    }
    renderAccountSummary(appState.accountSummary);

    if (!appState.monthlySummary) {
        appState.monthlySummary = ReportGenerator.createMonthlySummary(data);
    }
    renderMonthlySummary(appState.monthlySummary);

    renderCharts(data);
    renderLedgerPreview(data);
}

function renderAccountSummary(summary) {
    const hasCoA = typeof CoAMapper !== 'undefined' && CoAMapper.enabled;
    const headers = hasCoA
        ? ['대구분','연결CoA','계정과목코드','계정과목','전기이월','차변','대변','기말']
        : ['계정과목코드','계정과목','전기이월','차변','대변','기말'];
    const rows = summary.map(r => ({
        cells: (hasCoA ? [
            { value: r.major||'', isNum: false },
            { value: r.coa||'', isNum: false },
        ] : []).concat([
            { value: r.code, isNum: false },
            { value: r.name, isNum: false },
            { value: DataProcessor.formatNumber(r.전기이월), isNum: true },
            { value: DataProcessor.formatNumber(r.차변), isNum: true },
            { value: DataProcessor.formatNumber(r.대변), isNum: true },
            { value: DataProcessor.formatNumber(r.기말), isNum: true },
        ])
    }));
    document.getElementById('account-summary-table').innerHTML =
        createTable(headers, rows, { totalRow: true });
}

function renderMonthlySummary(summary) {
    const { rows, months } = summary;
    const headers = ['계정과목코드', '계정과목'];
    months.forEach(m => headers.push(m === 0 ? '전기이월' : `${m}월`));
    headers.push('총합계');

    const tableRows = rows.map(r => ({
        cells: [
            { value: r.code, isNum: false },
            { value: r.name, isNum: false },
            ...months.map(m => ({
                value: DataProcessor.formatNumber(r[`m${m}`]), isNum: true
            })),
            { value: DataProcessor.formatNumber(r.총합계), isNum: true },
        ]
    }));
    document.getElementById('monthly-summary-table').innerHTML =
        createTable(headers, tableRows, { totalRow: true });
}

function renderCharts(data) {
    const journal = data.filter(r => r.dc_type !== '전기이월');

    const monthlyDC = {};
    journal.forEach(r => {
        const m = r.month;
        if (!monthlyDC[m]) monthlyDC[m] = { debit: 0, credit: 0, count: 0 };
        monthlyDC[m].debit += r.debit || 0;
        monthlyDC[m].credit += r.credit || 0;
        monthlyDC[m].count++;
    });

    const monthKeys = Object.keys(monthlyDC).sort((a,b)=>a-b);
    const labels = monthKeys.map(m => m + '월');

    // 차변/대변 차트
    if (chartInstances['dc']) chartInstances['dc'].destroy();
    chartInstances['dc'] = new Chart(document.getElementById('chart-dc-trend'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: '차변', data: monthKeys.map(m => monthlyDC[m].debit),
                  backgroundColor: '#2F5496' },
                { label: '대변', data: monthKeys.map(m => monthlyDC[m].credit),
                  backgroundColor: '#C00000' },
            ]
        },
        options: { responsive: true, plugins: { legend: { position: 'top' } } }
    });

    // 월별 건수
    if (chartInstances['count']) chartInstances['count'].destroy();
    chartInstances['count'] = new Chart(document.getElementById('chart-monthly-count'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '분개 건수',
                data: monthKeys.map(m => monthlyDC[m].count),
                backgroundColor: '#2F5496'
            }]
        },
        options: { responsive: true }
    });

    // 대분류별 기말잔액 (CoA 있으면 coa_major 사용)
    const hasCoA = typeof CoAMapper !== 'undefined' && CoAMapper.enabled;
    const catMap = {};
    data.forEach(r => {
        const cat = hasCoA
            ? (r.coa_major || '기타')
            : DataProcessor.classifyAccountCategory(r.account_code);
        catMap[cat] = (catMap[cat] || 0) + (r.net_amount || 0);
    });
    const catLabels = Object.keys(catMap);
    const catValues = catLabels.map(c => catMap[c]);

    if (chartInstances['cat']) chartInstances['cat'].destroy();
    chartInstances['cat'] = new Chart(document.getElementById('chart-category'), {
        type: 'bar',
        data: {
            labels: catLabels,
            datasets: [{
                label: '기말잔액',
                data: catValues,
                backgroundColor: ['#2F5496','#C00000','#70AD47','#FFC000',
                                  '#5B9BD5','#ED7D31','#A5A5A5']
            }]
        },
        options: { responsive: true }
    });
}

function renderLedgerPreview(data) {
    const bb = data.filter(r => r.dc_type === '전기이월');
    const journal = data.filter(r => r.dc_type !== '전기이월');

    let metricsHTML = '';
    metricsHTML += createMetricCard('전체 건수', data.length.toLocaleString());
    metricsHTML += createMetricCard('전기이월', bb.length.toLocaleString());
    metricsHTML += createMetricCard('당기분개', journal.length.toLocaleString());
    metricsHTML += createMetricCard('증감 합계', DataProcessor.formatNumber(
        data.reduce((s,r)=>s+(r.net_amount||0),0)
    ));
    document.getElementById('ledger-summary-metrics').innerHTML = metricsHTML;

    const headers = ['회계일','전표번호','계정코드','계정명','차변','대변',
                     '증감','차대구분','월','적요'];
    const preview = data.slice(0, 30).map(r => ({
        _isBB: r.dc_type === '전기이월',
        cells: [
            { value: DataProcessor.formatDate(r.date), isNum: false },
            { value: r.entry_no || '', isNum: false },
            { value: r.account_code || '', isNum: false },
            { value: r.account_name || '', isNum: false },
            { value: DataProcessor.formatNumber(r.debit), isNum: true },
            { value: DataProcessor.formatNumber(r.credit), isNum: true },
            { value: DataProcessor.formatNumber(r.net_amount), isNum: true },
            { value: r.dc_type || '', isNum: false },
            { value: r.month ?? '', isNum: false },
            { value: (r.description || '').toString().substring(0, 30), isNum: false },
        ]
    }));
    document.getElementById('ledger-preview-table').innerHTML =
        createTable(headers, preview, { bbHighlight: true });
}

function downloadProcessedLedger() {
    showLoading('가공원장 엑셀 생성 중...');
    setTimeout(() => {
        const buffer = ReportGenerator.generateProcessedLedgerExcel(
            DataProcessor.combinedData
        );
        ReportGenerator.downloadExcel(buffer, '가공원장_기초잔액_월_증감_차대구분.xlsx');
        hideLoading();
    }, 100);
}

// ═══════════════════════════════════════════════════════
// Step 6: 이상분개 탐지
// ═══════════════════════════════════════════════════════
function runAnomalyDetection() {
    // 특정 사용자 목록 수집
    const selectedUsers = [...document.querySelectorAll('.user-cb:checked')]
        .map(cb => cb.value);

    const config = {
        weekend:       document.getElementById('cfg-weekend').checked,
        round:         document.getElementById('cfg-round').checked,
        roundThreshold: parseInt(document.getElementById('cfg-round-threshold').value) || 10000000,
        noDesc:        document.getElementById('cfg-no-desc').checked,
        samePA:        document.getElementById('cfg-same-pa').checked,
        noAppr:        document.getElementById('cfg-no-appr').checked,
        period:        document.getElementById('cfg-period').checked,
        large:         document.getElementById('cfg-large').checked,
        largeStd:      parseInt(document.getElementById('cfg-large-std').value) || 3,
        combo:         document.getElementById('cfg-combo').checked,
        reversal:      document.getElementById('cfg-reversal').checked,
        reversalDays:  parseInt(document.getElementById('cfg-reversal-days').value) || 7,
        user:          document.getElementById('cfg-user').checked,
        specificUsers: selectedUsers,
    };

    showLoading('이상 분개 탐지 중...');

    setTimeout(() => {
        try {
            const data = DataProcessor.combinedData;
            const results = AnomalyDetector.run(data, config);
            const journal = data.filter(r => r.dc_type !== '전기이월');
            const summary = AnomalyDetector.getSummary(results, journal.length);

            appState.anomalyResults = results;
            appState.anomalySummary = summary;

            renderAnomalyResults(results, summary, journal.length);
            document.getElementById('anomaly-results').classList.remove('hidden');

            // Step 8(리포트)로 전환 — Step 7 결과를 유지하면서 다운로드 섹션 활성화
            currentStep = 8;
            document.getElementById('step-8').classList.add('active');
            document.querySelectorAll('.step-item').forEach((item, idx) => {
                item.classList.remove('active', 'completed');
                if (idx + 1 < 8) item.classList.add('completed');
                if (idx + 1 === 8) item.classList.add('active');
            });

            // Step 8 위치로 스크롤
            document.getElementById('step-8').scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            alert('이상분개 탐지 오류: ' + err.message);
        }
        hideLoading();
    }, 100);
}

function renderAnomalyResults(results, summary, totalCount) {
    const sumHeaders = ['테스트 항목','탐지 건수','비율(%)','상태'];
    const sumRows = summary.map(r => ({
        cells: [
            { value: r.name, isNum: false },
            { value: r.count.toLocaleString(), isNum: true },
            { value: r.pct, isNum: false },
            { value: r.status, isNum: false },
        ]
    }));
    document.getElementById('anomaly-summary-table').innerHTML =
        createTable(sumHeaders, sumRows);

    const totalAnomalies = summary.reduce((s, r) => s + r.count, 0);
    const pct = totalCount > 0 ? (totalAnomalies / totalCount * 100).toFixed(1) : '0.0';
    document.getElementById('anomaly-total-info').textContent =
        `총 분개 ${totalCount.toLocaleString()}건 중 이상 분개 ${totalAnomalies.toLocaleString()}건 탐지 (${pct}%)`;

    let detailHTML = '';
    for (const [testName, items] of Object.entries(results)) {
        if (items.length === 0) continue;
        detailHTML += `<div class="collapsible">
            <button class="collapsible-header" onclick="toggleCollapsible(this)">
                🔸 ${escapeHTML(testName)} (${items.length.toLocaleString()}건)
            </button>
            <div class="collapsible-content">
                <div class="table-wrapper">${renderAnomalyDetailTable(items)}</div>
            </div>
        </div>`;
    }
    document.getElementById('anomaly-details').innerHTML = detailHTML;
}

function renderAnomalyDetailTable(items) {
    const headers = ['회계일','전표번호','계정코드','계정명','차변','대변',
                     '증감','적요','기표자','탐지사유'];
    const rows = items.slice(0, 500).map(r => ({
        cells: [
            { value: DataProcessor.formatDate(r.date), isNum: false },
            { value: r.entry_no || '', isNum: false },
            { value: r.account_code || '', isNum: false },
            { value: r.account_name || '', isNum: false },
            { value: DataProcessor.formatNumber(r.debit), isNum: true },
            { value: DataProcessor.formatNumber(r.credit), isNum: true },
            { value: DataProcessor.formatNumber(r.net_amount), isNum: true },
            { value: (r.description || '').toString().substring(0, 40), isNum: false },
            { value: r.preparer || '', isNum: false },
            { value: r.test_reason || '', isNum: false },
        ]
    }));
    return createTable(headers, rows);
}

// ═══════════════════════════════════════════════════════
// Step 7: 전체 리포트 다운로드
// ═══════════════════════════════════════════════════════
function downloadFullReport() {
    showLoading('엑셀 리포트 생성 중...');
    setTimeout(() => {
        // 산출물 캐시가 없으면 생성
        ensureSummaries();
        const buffer = ReportGenerator.generateFullReportExcel(
            appState.accountSummary,
            appState.monthlySummary,
            appState.validationResults,
            appState.anomalySummary,
            appState.anomalyResults,
            DataProcessor.combinedData         // 가공원장 시트 포함
        );
        ReportGenerator.downloadExcel(buffer, '저널엔트리테스트_통합결과.xlsx');
        hideLoading();
    }, 100);
}

// 산출물(증감표) 캐시 보장
function ensureSummaries() {
    const data = DataProcessor.combinedData;
    if (!appState.accountSummary)
        appState.accountSummary = ReportGenerator.createAccountDCSummary(data);
    if (!appState.monthlySummary)
        appState.monthlySummary = ReportGenerator.createMonthlySummary(data);
}

// ── 개별 다운로드 ──
function downloadSummaries() {
    showLoading('증감표 엑셀 생성 중...');
    setTimeout(() => {
        ensureSummaries();
        const buffer = ReportGenerator.generateSummariesExcel(
            appState.accountSummary, appState.monthlySummary);
        ReportGenerator.downloadExcel(buffer, '증감표_계정별_월별.xlsx');
        hideLoading();
    }, 100);
}

function downloadJetResult() {
    if (!appState.anomalyResults) {
        alert('먼저 ⑦ 이상분개 탐지를 실행해주세요.');
        return;
    }
    showLoading('JET 결과 엑셀 생성 중...');
    setTimeout(() => {
        const buffer = ReportGenerator.generateJetExcel(
            appState.anomalySummary, appState.anomalyResults);
        ReportGenerator.downloadExcel(buffer, '이상분개_JET_결과.xlsx');
        hideLoading();
    }, 100);
}

function downloadValidation() {
    if (!appState.validationResults) {
        alert('먼저 ⑤ 데이터 검증을 실행해주세요.');
        return;
    }
    showLoading('검증결과 엑셀 생성 중...');
    setTimeout(() => {
        const buffer = ReportGenerator.generateValidationExcel(appState.validationResults);
        ReportGenerator.downloadExcel(buffer, '데이터_검증결과.xlsx');
        hideLoading();
    }, 100);
}

// ═══════════════════════════════════════════════════════
// 초기화
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    goToStep(1);

    // 특정 사용자 체크박스 토글
    document.getElementById('cfg-user')?.addEventListener('change', function() {
        const section = document.getElementById('specific-user-section');
        section.classList.toggle('hidden', !this.checked);
        if (this.checked && DataProcessor.combinedData) {
            const users = new Set();
            DataProcessor.combinedData.forEach(r => {
                const p = (r.preparer || '').toString().trim();
                if (p && p !== 'nan' && p !== '전기이월') users.add(p);
            });
            let html = '';
            [...users].sort().forEach(u => {
                html += `<label class="checkbox-label">
                    <input type="checkbox" class="user-cb" value="${escapeHTML(u)}"> ${escapeHTML(u)}
                </label>`;
            });
            document.getElementById('user-checkboxes').innerHTML = html;
        }
    });
});
