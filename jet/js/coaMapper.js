/**
 * CoA(계정체계) 매핑 모듈 — 범용
 *
 * 사용자가 업로드한 "CoA 매핑표"(계정과목↔코드↔계층)를 읽어,
 * 분개장의 각 행에 계정과목코드 및 CoA 계층(대구분/중구분/공시단위/연결CoA)을 부착한다.
 *
 * 특징(범용):
 *  - 특정 회사 컬럼명에 의존하지 않음. 사용자가 매핑표의 컬럼을 지정.
 *  - 계정과목명 매칭: 완전일치 → 공백무시 → 괄호접미사((제조)(판관)등) 제거 후 base명 매칭.
 *  - 대분류(자산/부채/자본/수익/비용) 자동판정:
 *      1) 매핑표에 대구분 컬럼이 있으면 사용
 *      2) 없으면 연결CoA코드 첫 글자(A/L/E·Q/R/C 등) 규칙 또는
 *         계정과목코드 첫 자리(1자산 2부채 3자본 4수익 5·9비용 6영업외) 규칙으로 보정
 *  - CoA 매핑표가 없어도 앱은 정상 동작(계층 컬럼만 비어있음).
 */
const CoAMapper = {
    enabled: false,          // CoA 매핑 사용 여부
    rawData: null,           // 업로드된 매핑표 원본
    rawColumns: [],
    mapping: null,           // 사용자가 지정한 컬럼 매핑
    // 조회 인덱스
    codeToCoa: {},           // 계정과목코드 -> {대구분,중구분,공시단위CoA,연결CoA코드,연결CoA,계정과목}
    nameToCode: {},          // 계정과목명 -> 코드
    nameToCodeNorm: {},      // 공백제거 계정과목명 -> 코드
    baseToCode: {},          // 괄호접미사 제거 base명 -> 코드

    // 매핑표에서 지정 가능한 필드
    FIELDS: [
        { key: 'account_code', label: '계정과목코드', required: false },
        { key: 'account_name', label: '계정과목명',   required: true  },
        { key: 'major',        label: '대구분(자산/부채/…)', required: false },
        { key: 'middle',       label: '중구분',        required: false },
        { key: 'unit_coa',     label: '공시단위CoA',   required: false },
        { key: 'coa_code',     label: '연결CoA코드',   required: false },
        { key: 'coa_name',     label: '연결CoA(과목)', required: false },
    ],

    AUTO_SUGGEST: {
        account_code: ['계정과목코드','계정코드','account_code','코드'],
        account_name: ['계정과목','계정명','계정과목명','account_name'],
        major:        ['대구분','대분류','major'],
        middle:       ['중구분','중분류','middle'],
        unit_coa:     ['공시단위CoA','공시단위','unit'],
        coa_code:     ['연결CoA코드','CoA코드','coa_code'],
        coa_name:     ['연결CoA','CoA','coa'],
    },

    // ── 매핑표 로드 ──
    async loadMappingTable(file) {
        const data = await DataProcessor.readFile(file);
        this.rawData = data;
        this.rawColumns = data.length > 0 ? Object.keys(data[0]) : [];
        return data;
    },

    suggestColumn(fieldKey) {
        const kws = this.AUTO_SUGGEST[fieldKey] || [];
        // 1순위: 완전일치 (계정과목 vs 계정과목코드 혼동 방지)
        for (const kw of kws) {
            for (const col of this.rawColumns) {
                if (kw.toLowerCase() === col.toLowerCase()) return col;
            }
        }
        // 2순위: 부분포함
        for (const kw of kws) {
            for (const col of this.rawColumns) {
                if (col.includes(kw)) return col;
            }
        }
        return '';
    },

    _norm(s) { return String(s == null ? '' : s).replace(/\s/g, '').trim(); },
    _stripSuffix(s) { return String(s == null ? '' : s).replace(/\(.*?\)/g, '').trim(); },

    // 대분류 판정 (코드/연결CoA코드 기반 보정)
    _majorFromCodes(acctCode, coaCode) {
        // 연결CoA코드 첫 글자
        const p = coaCode ? String(coaCode).trim()[0] : '';
        const PMAP = { A: '자산', L: '부채', E: '자본', Q: '자본', R: '수익', C: '비용' };
        if (PMAP[p]) return PMAP[p];
        // 계정과목코드 첫 자리
        const d = acctCode ? String(acctCode).trim()[0] : '';
        const DMAP = { '1': '자산', '2': '부채', '3': '자본', '4': '수익',
                       '5': '비용', '6': '영업외손익', '9': '비용' };
        return DMAP[d] || null;
    },

    // ── 매핑 적용 → 인덱스 구축 ──
    applyMapping(mapping) {
        this.mapping = mapping;
        this.codeToCoa = {};
        this.nameToCode = {};
        this.nameToCodeNorm = {};
        this.baseToCode = {};

        const m = mapping;
        (this.rawData || []).forEach(row => {
            const name = m.account_name ? String(row[m.account_name] ?? '').trim() : '';
            const code = m.account_code ? String(row[m.account_code] ?? '').trim() : '';
            if (!name && !code) return;

            const coaCode = m.coa_code ? (row[m.coa_code] ?? null) : null;
            let major = m.major ? (row[m.major] ?? null) : null;
            if (!major) major = this._majorFromCodes(code, coaCode);

            const rec = {
                대구분: major,
                중구분: m.middle ? (row[m.middle] ?? null) : null,
                공시단위CoA: m.unit_coa ? (row[m.unit_coa] ?? null) : null,
                연결CoA코드: coaCode,
                연결CoA: m.coa_name ? (row[m.coa_name] ?? null) : null,
                계정과목: name,
                계정과목코드: code,
            };
            if (code) this.codeToCoa[code] = rec;
            if (name) {
                if (!this.nameToCode[name]) this.nameToCode[name] = code || name;
                const nn = this._norm(name);
                if (!this.nameToCodeNorm[nn]) this.nameToCodeNorm[nn] = code || name;
                const b = this._stripSuffix(name);
                if (b && !this.baseToCode[b]) this.baseToCode[b] = code || name;
                // 코드가 없으면 이름을 키로도 CoA 저장 (코드 없는 매핑표 대비)
                if (!code && !this.codeToCoa[name]) this.codeToCoa[name] = rec;
            }
        });
        this.enabled = true;
        return {
            codes: Object.keys(this.codeToCoa).length,
            names: Object.keys(this.nameToCode).length,
        };
    },

    // 계정과목명 → 코드 (직접→공백무시→접미사제거)
    resolveCode(name) {
        if (!name) return '';
        return this.nameToCode[name]
            || this.nameToCodeNorm[this._norm(name)]
            || this.baseToCode[this._stripSuffix(name)]
            || '';
    },

    // 계정과목명(또는 코드)로 CoA 계층 조회
    lookup(name, code) {
        if (!this.enabled) return null;
        let c = code || this.resolveCode(name);
        let rec = c ? this.codeToCoa[c] : null;
        if (!rec && name) rec = this.codeToCoa[name] ||
            this.codeToCoa[this.resolveCode(name)] || null;
        if (rec) return { ...rec, _code: c || rec.계정과목코드 || '' };
        // 매핑표엔 없지만 코드/이름으로 대분류만 보정
        const major = this._majorFromCodes(code, null);
        return { 대구분: major, 중구분: null, 공시단위CoA: null,
                 연결CoA코드: null, 연결CoA: null, _code: code || '' };
    },

    // 결합데이터 전체에 CoA 계층 부착 (row에 coa_* 필드 추가)
    enrich(data) {
        if (!this.enabled) return data;
        data.forEach(r => {
            const rec = this.lookup(r.account_name, r.account_code);
            if (rec) {
                if (!r.account_code && rec._code) r.account_code = rec._code;
                r.coa_major   = rec.대구분 || '';
                r.coa_middle  = rec.중구분 || '';
                r.coa_unit    = rec.공시단위CoA || '';
                r.coa_code    = rec.연결CoA코드 || '';
                r.coa_name    = rec.연결CoA || '';
            }
        });
        return data;
    },

    reset() {
        this.enabled = false; this.rawData = null; this.rawColumns = [];
        this.mapping = null; this.codeToCoa = {}; this.nameToCode = {};
        this.nameToCodeNorm = {}; this.baseToCode = {};
    }
};
