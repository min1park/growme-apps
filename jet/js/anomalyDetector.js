/**
 * 이상 분개 탐지 모듈
 */
const AnomalyDetector = {

    run(data, config) {
        const journal = data.filter(r => r.dc_type !== '전기이월');
        const results = {};

        if (config.weekend)
            results['주말_공휴일 분개'] = this._testWeekend(journal);
        if (config.round)
            results['라운드넘버 분개'] = this._testRoundNumbers(journal, config.roundThreshold);
        if (config.noDesc)
            results['적요 없는 분개'] = this._testNoDescription(journal);
        if (config.samePA)
            results['기표자=승인자 분개'] = this._testPreparerIsApprover(journal);
        if (config.noAppr)
            results['승인자 없는 분개'] = this._testNoApprover(journal);
        if (config.period)
            results['결산일 전후 분개'] = this._testPeriodEnd(journal);
        if (config.large)
            results['비정상 대금액 분개'] = this._testLargeAmounts(journal, config.largeStd);
        if (config.combo)
            results['비정상 계정조합'] = this._testUnusualCombos(journal);
        if (config.reversal)
            results['역분개 의심'] = this._testReversals(journal, config.reversalDays);
        if (config.user && config.specificUsers && config.specificUsers.length > 0)
            results['특정 사용자 분개'] = this._testSpecificUser(journal, config.specificUsers);

        return results;
    },

    getSummary(results, totalCount) {
        return Object.entries(results).map(([name, items]) => {
            const count = items.length;
            const pct = totalCount > 0 ? (count / totalCount * 100).toFixed(1) : '0.0';
            return { name, count, pct: pct + '%', status: count > 0 ? '⚠️ 검토필요' : '✅ 정상' };
        });
    },

    // ── 1. 주말 분개 ───────────────────────────────────
    _testWeekend(data) {
        // weekday: 0=일 ~ 6=토
        return data.filter(r => r.weekday === 0 || r.weekday === 6)
            .map(r => ({ ...r, test_reason: r.weekday === 0 ? '일요일 입력' : '토요일 입력' }));
    },

    // ── 2. 라운드넘버 ──────────────────────────────────
    _testRoundNumbers(data, threshold) {
        const isRound = (amt) => {
            const a = Math.abs(amt);
            if (a < threshold) return false;
            return (a >= 1000000 && a % 1000000 === 0);
        };
        return data.filter(r => isRound(r.debit) || isRound(r.credit))
            .map(r => ({ ...r, test_reason: '라운드넘버' }));
    },

    // ── 3. 적요 없음 ──────────────────────────────────
    _testNoDescription(data) {
        return data.filter(r => {
            const desc = (r.description || '').toString().trim();
            return !desc || desc === 'nan' || desc.length < 2;
        }).map(r => ({ ...r, test_reason: '적요 없음' }));
    },

    // ── 4. 기표자=승인자 ──────────────────────────────
    _testPreparerIsApprover(data) {
        return data.filter(r => {
            const p = (r.preparer || '').toString().trim();
            const a = (r.approver || '').toString().trim();
            return p && a && p !== 'nan' && a !== 'nan' && p === a;
        }).map(r => ({ ...r, test_reason: '기표자=승인자' }));
    },

    // ── 5. 승인자 없음 ────────────────────────────────
    _testNoApprover(data) {
        return data.filter(r => {
            const a = (r.approver || '').toString().trim();
            return !a || a === 'nan';
        }).map(r => ({ ...r, test_reason: '승인자 없음' }));
    },

    // ── 6. 결산일 전후 ────────────────────────────────
    _testPeriodEnd(data) {
        return data.filter(r => {
            if (!(r.date instanceof Date)) return false;
            const day = r.date.getDate();
            const lastDay = new Date(r.date.getFullYear(), r.date.getMonth() + 1, 0).getDate();
            return (lastDay - day) <= 2;
        }).map(r => ({ ...r, test_reason: '월말 3일 이내' }));
    },

    // ── 7. 비정상 대금액 ──────────────────────────────
    _testLargeAmounts(data, nStd) {
        const stats = {};
        data.forEach(r => {
            const code = r.account_code;
            if (!stats[code]) stats[code] = [];
            stats[code].push(Math.abs(r.net_amount || 0));
        });

        const thresholds = {};
        for (const [code, vals] of Object.entries(stats)) {
            if (vals.length < 5) continue;
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
            const std = Math.sqrt(variance);
            if (std > 0) thresholds[code] = mean + nStd * std;
        }

        return data.filter(r => {
            const t = thresholds[r.account_code];
            return t && Math.abs(r.net_amount) > t;
        }).map(r => ({ ...r, test_reason: `평균+${nStd}σ 초과` }));
    },

    // ── 8. 비정상 계정조합 (최적화) ────────────────────
    _testUnusualCombos(data) {
        // entry_no가 유효한 값이 하나라도 있는지 확인
        const hasEntryNo = data.some(r =>
            r.entry_no && String(r.entry_no).trim() && String(r.entry_no).trim() !== 'nan'
        );
        if (!hasEntryNo) return [];

        const unusualPairs = new Set(['4-4','5-5','3-5','5-3','3-6','6-3']);

        // 전표별 차변/대변 대분류 코드만 수집 (Set으로 중복 제거)
        const entryMap = {};
        data.forEach(r => {
            const eno = r.entry_no;
            if (!eno || String(eno).trim() === '' || String(eno).trim() === 'nan') return;
            if (!entryMap[eno]) entryMap[eno] = { debitCats: new Set(), creditCats: new Set() };
            const firstChar = (r.account_code || ' ')[0];
            if (r.debit > 0) entryMap[eno].debitCats.add(firstChar);
            if (r.credit > 0) entryMap[eno].creditCats.add(firstChar);
        });

        // Set을 사용하므로 전표당 대분류 조합은 최대 7×7=49번만 비교
        const unusualEntries = new Set();
        for (const [eno, { debitCats, creditCats }] of Object.entries(entryMap)) {
            for (const d of debitCats) {
                for (const c of creditCats) {
                    if (unusualPairs.has(`${d}-${c}`)) {
                        unusualEntries.add(eno);
                        break;
                    }
                }
                if (unusualEntries.has(eno)) break;
            }
        }

        return data.filter(r => unusualEntries.has(r.entry_no))
            .map(r => ({ ...r, test_reason: '비정상 계정조합' }));
    },

    // ── 9. 역분개 의심 (최적화) ────────────────────────
    _testReversals(data, days) {
        const filtered = data.filter(r => r.net_amount !== 0 && r.date instanceof Date);
        if (filtered.length === 0) return [];

        const byAccount = {};
        filtered.forEach((r, idx) => {
            const code = r.account_code;
            if (!byAccount[code]) byAccount[code] = [];
            byAccount[code].push({ ...r, _idx: idx });
        });

        const matchedIndices = new Set();

        for (const items of Object.values(byAccount)) {
            if (items.length < 2) continue;

            const amountMap = {};
            items.forEach(item => {
                const amt = item.net_amount;
                if (!amountMap[amt]) amountMap[amt] = [];
                amountMap[amt].push(item);
            });

            for (const item of items) {
                const opposite = amountMap[-item.net_amount];
                if (!opposite) continue;
                for (const opp of opposite) {
                    if (opp._idx <= item._idx) continue;
                    const dayDiff = Math.abs(
                        (item.date.getTime() - opp.date.getTime()) / (86400 * 1000)
                    );
                    if (dayDiff <= days) {
                        matchedIndices.add(item._idx);
                        matchedIndices.add(opp._idx);
                    }
                }
            }
        }

        return filtered.filter(r => matchedIndices.has(r._idx))
            .map(r => ({ ...r, test_reason: `${days}일 내 역분개` }));
    },

    // ── 10. 특정 사용자 ────────────────────────────────
    _testSpecificUser(data, users) {
        return data.filter(r => {
            const p = (r.preparer || '').toString().trim();
            return users.includes(p);
        }).map(r => ({ ...r, test_reason: '특정 사용자' }));
    }
};
