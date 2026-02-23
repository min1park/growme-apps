/**
 * 데이터 가공 처리 모듈
 */
const DataProcessor = {
    rawData: null,
    rawColumns: [],
    mappedData: null,
    beginningBalance: null,
    combinedData: null,

    STANDARD_FIELDS: {
        date:         { label: '회계일(전표일자)', required: true },
        entry_no:     { label: '전표번호',         required: false },
        line_no:      { label: '행번호',           required: false },
        account_code: { label: '계정과목코드',     required: true },
        account_name: { label: '계정과목명',       required: true },
        debit:        { label: '차변금액',         required: true },
        credit:       { label: '대변금액',         required: true },
        description:  { label: '적요',             required: false },
        preparer:     { label: '기표자',           required: false },
        approver:     { label: '승인자',           required: false },
        prepare_date: { label: '기표일',           required: false },
        entry_type:   { label: '전표유형',         required: false },
        department:   { label: '기표부서',         required: false },
        vendor:       { label: '거래처',           required: false },
        vendor_id:    { label: '거래처사업자번호', required: false },
    },

    AUTO_SUGGEST: {
        date:         ['회계일','전표일자','일자','date','posting_date','BUDAT'],
        entry_no:     ['기표번호','전표번호','전표기표번호','entry_no','BELNR'],
        line_no:      ['행번호','line_no','라인'],
        account_code: ['계정과목코드','계정코드','account_code','HKONT','과목코드'],
        account_name: ['계정과목','계정명','계정과목명','account_name'],
        debit:        ['차변금액','차변','debit','WRSOL'],
        credit:       ['대변금액','대변','credit','WRSHB'],
        description:  ['적요','설명','description','memo','비고'],
        preparer:     ['기표자','작성자','입력자','preparer','USNAM'],
        approver:     ['승인자','approver'],
        prepare_date: ['기표일','작성일','prepare_date'],
        entry_type:   ['전표분개유형','전표유형','전표종류','entry_type'],
        department:   ['기표부서','부서','department'],
        vendor:       ['거래처','거래처명','vendor'],
        vendor_id:    ['거래처사업자번호','사업자번호','vendor_id'],
    },

    // ── 파일 읽기 ──────────────────────────────────────
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                    resolve(jsonData);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },

    // ── 분개장 로드 ────────────────────────────────────
    async loadJournal(file) {
        const data = await this.readFile(file);
        this.rawData = data;
        this.rawColumns = data.length > 0 ? Object.keys(data[0]) : [];
        return data;
    },

    // ── 자동 매핑 추천 ─────────────────────────────────
    suggestMapping(stdField) {
        const keywords = this.AUTO_SUGGEST[stdField] || [];
        for (const kw of keywords) {
            for (const col of this.rawColumns) {
                if (kw.toLowerCase() === col.toLowerCase() || col.includes(kw)) {
                    return col;
                }
            }
        }
        return '';
    },

    // ── 매핑 적용 ──────────────────────────────────────
    applyMapping(mapping) {
        if (!this.rawData) throw new Error('데이터가 로드되지 않았습니다.');

        // 매핑에 사용된 원본 컬럼명 목록
        const mappedSourceCols = new Set(Object.values(mapping).filter(v => v && v !== ''));

        this.mappedData = this.rawData.map(row => {
            const mapped = {};
            for (const [stdField, sourceCol] of Object.entries(mapping)) {
                if (sourceCol && sourceCol !== '') {
                    mapped[stdField] = row[sourceCol] ?? '';
                }
            }
            // 원본 row 전체를 보존 (매핑되지 않은 필드 포함)
            mapped._raw = { ...row };
            return mapped;
        });

        this._cleanDataTypes(this.mappedData);
        return this.mappedData;
    },

    // ── 금액 문자열 파싱 (괄호 음수, 쉼표 등 처리) ────
    _parseAmount(val) {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return val;

        let str = String(val).trim();

        // 괄호 음수 표기: (1,000,000) → -1000000
        let negative = false;
        if (/^\(.*\)$/.test(str)) {
            negative = true;
            str = str.slice(1, -1);
        }
        // 마이너스 기호
        if (str.startsWith('-')) {
            negative = true;
            str = str.slice(1);
        }

        // 쉼표, 공백 제거
        str = str.replace(/,/g, '').replace(/\s/g, '');

        const num = parseFloat(str);
        if (isNaN(num)) return 0;
        return negative ? -num : num;
    },

    // ── 데이터 타입 정리 ───────────────────────────────
    _cleanDataTypes(data) {
        data.forEach(row => {
            // 금액: 괄호 음수 포함 파싱
            for (const col of ['debit', 'credit']) {
                if (row[col] !== undefined) {
                    row[col] = this._parseAmount(row[col]);
                }
            }
            // 날짜 변환
            if (row.date !== undefined) {
                row.date = this._parseDate(row.date);
            }
            if (row.prepare_date !== undefined) {
                row.prepare_date = this._parseDate(row.prepare_date);
            }
            // 계정코드: 문자열
            if (row.account_code !== undefined) {
                let code = String(row.account_code).trim();
                if (code === 'nan' || code === 'undefined' || code === 'null') code = '';
                row.account_code = code;
            }
            if (row.account_name !== undefined) {
                let name = String(row.account_name).trim();
                if (name === 'nan' || name === 'undefined' || name === 'null') name = '';
                row.account_name = name;
            }
        });
    },

    // ── 날짜 파싱 (타임존 안전) ────────────────────────
    _parseDate(val) {
        if (val instanceof Date) {
            // 이미 Date 객체면 유효성만 확인
            return isNaN(val.getTime()) ? null : val;
        }
        if (typeof val === 'number') {
            // 엑셀 시리얼 날짜 → UTC 기준으로 생성하여 타임존 밀림 방지
            const utcMs = (val - 25569) * 86400 * 1000;
            const d = new Date(utcMs);
            if (isNaN(d.getTime())) return null;
            // UTC 날짜 성분을 로컬 Date로 재구성 (시간 부분 제거)
            return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        }
        if (typeof val === 'string') {
            // 'YYYY-MM-DD' 또는 'YYYY/MM/DD' 패턴 직접 파싱 (타임존 안전)
            const match = val.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
            if (match) {
                return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
            }
            // 기타 형식은 Date 생성자에 위임
            const d = new Date(val);
            return isNaN(d.getTime()) ? null : d;
        }
        return null;
    },

    // ── 파생 필드 생성 ─────────────────────────────────
    createDerivedFields(data) {
        data = data || this.mappedData;
        data.forEach(row => {
            row.net_amount = (row.debit || 0) - (row.credit || 0);

            // 차대구분
            const d = row.debit || 0;
            const c = row.credit || 0;
            if (d > 0 && c === 0) row.dc_type = '차변';
            else if (c > 0 && d === 0) row.dc_type = '대변';
            else if (d > 0 && c > 0) row.dc_type = '차변/대변';
            else row.dc_type = '무금액';

            // 월 추출
            if (row.date instanceof Date && !isNaN(row.date.getTime())) {
                row.month = row.date.getMonth() + 1;
                row.weekday = row.date.getDay(); // 0=일 ~ 6=토
                const dayNames = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
                row.weekday_name = dayNames[row.weekday];
            } else {
                row.month = 0;
                row.weekday = null;
                row.weekday_name = '';
            }
        });
        return data;
    },

    // ── 기초잔액 로드 ──────────────────────────────────
    async loadBeginningBalance(file) {
        const data = await this.readFile(file);
        this.beginningBalance = data;
        return data;
    },

    // ── 기초잔액 처리 ──────────────────────────────────
    processBeginningBalance(bbData, bbMapping) {
        return bbData.map(row => {
            let netAmount = 0;
            if (bbMapping.net_amount) {
                netAmount = this._parseAmount(row[bbMapping.net_amount]);
            }

            let acctCode = String(row[bbMapping.account_code] || '').trim();
            if (acctCode === 'nan' || acctCode === 'undefined') acctCode = '';

            let acctName = String(row[bbMapping.account_name] || '').trim();
            if (acctName === 'nan' || acctName === 'undefined') acctName = '';

            return {
                date: null,
                entry_no: '전기이월',
                account_code: acctCode,
                account_name: acctName,
                debit: netAmount > 0 ? netAmount : 0,
                credit: netAmount < 0 ? Math.abs(netAmount) : 0,
                net_amount: netAmount,
                dc_type: '전기이월',
                month: 0,
                description: '전기이월',
                preparer: '',
                approver: '',
                weekday: null,
                weekday_name: '',
            };
        });
    },

    // ── 데이터 통합 ────────────────────────────────────
    combineData(journalData, bbData) {
        let combined = [];
        if (bbData && bbData.length > 0) {
            combined = [...bbData, ...journalData];
        } else {
            combined = [...journalData];
        }

        combined.sort((a, b) => {
            if (a.month !== b.month) return a.month - b.month;
            if (a.account_code < b.account_code) return -1;
            if (a.account_code > b.account_code) return 1;
            return 0;
        });

        this.combinedData = combined;
        return combined;
    },

    // ── 계정 분류 ──────────────────────────────────────
    classifyAccountCategory(code) {
        if (!code || code === '' || code === 'nan') return '기타';
        const first = String(code)[0];
        const map = { '1':'자산', '2':'부채', '3':'자본',
                      '4':'수익', '5':'비용', '6':'영업외손익', '9':'제조원가' };
        return map[first] || '기타';
    },

    // ── 날짜 포맷 ──────────────────────────────────────
    formatDate(d) {
        if (!(d instanceof Date) || isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    // ── 숫자 포맷 ──────────────────────────────────────
    formatNumber(n) {
        if (n === null || n === undefined || n === '') return '';
        const num = Number(n);
        if (isNaN(num)) return '';
        return num.toLocaleString('ko-KR');
    }
};
