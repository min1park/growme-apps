# 개선 기획: 자동배분(Auto-Allocate) + 검증대사(Verify vs 회사CF)

**작성일**: 2026-07-24
**배경**: 실사용(뉴라텍 FY2026 반기) 결과, 현재 앱은 "백지에서 손으로 만드는 도구"라
(1) 셀을 전부 수동 입력해야 하고 (2) 정답을 모르면 오분류를 못 잡는다.
목표: **자동배분으로 "쉽게" + 검증대사로 "정확하게"**.

## 1. 현재 문제 (실측)

| # | 문제 | 근거 |
|---|------|------|
| P1 | 자동배분 없음 — 40+개 BS계정을 CF라인에 손으로 입력 | `grep autoAllocate` → 0건 |
| P2 | 자동매핑 오분류 (뉴라텍서 6건 수정) | 건물관리비→투자, 지분법손실→투자, 외환차익→operating, 당기순이익→유동자산 |
| P3 | 비현금/이중계상을 사람이 판단 | 전환사채 상각 90.6M, 자산취득 미지급금 112.8M을 수동으로 비현금 분리해야 라인 tie |
| P4 | 정답 검증 수단 없음 | 회사가 이미 만든 CF와 대사하는 기능 부재 → 틀려도 모름 |

## 2. 기능 A: 자동배분 (Auto-Allocate)

### 원리
각 BS계정의 증감을, 그 계정의 CF분류(mapping.cfCategory) + CF템플릿의
`defaultCfCategories`를 이용해 **가장 그럴듯한 CF라인에 자동 배정**한다.
사용자는 백지가 아니라 "이미 채워진 초안"에서 검토·수정만 한다.

### 규칙 (계정 성격별)
```
자산 증가(Δ>0)  → 해당 CF유출 라인 (예: 매출채권 증가 → op-wc-ar, 음수)
자산 감소(Δ<0)  → 해당 CF유입/감소 라인
부채 증가       → op-wc-ap / fin-* (양수)
감가상각누계 Δ  → op-adj-depr (contra, sign=-1)
사용권자산      → noncash (nc-rou-new)
투자계정 취득   → inv-*-acquire ; 처분 → inv-*-dispose
차입/사채/리스  → fin-* (유입/상환 자동 구분)
P&L 조정계정    → op-adj-* (감가상각비/이자/외환/지분법/주식보상)
```
각 계정 → CF라인 매핑 테이블(ALLOCATION_MAP)을 defaultCfCategories와
계정명 키워드로 산출. 결과를 gridData에 프리필(prefill).

### 핵심: 증가/감소 방향 자동 분리
투자·재무는 유입/유출 라인이 분리돼 있으므로 Δ 부호로 자동 라우팅:
- 정기예금 Δ<0 → `inv-deposit-dec`(유입) / Δ>0 → `inv-deposit-inc`(유출)
- 차입금 Δ>0 → `fin-borrow-inc` / Δ<0 → `fin-borrow-dec`

### 산출
`autoAllocate(accounts, mappings, cfItems) → Map<CellKey, CellValue>`
→ store.gridData 초기값. 배정 못한 잔여는 `_unallocated` 플래그로 경고.

## 3. 기능 B: 검증대사 (Verify vs 회사 CF)

### 원리
회사가 이미 작성한 CF(또는 DART 공시 CF)를 **CF라인별 참조금액**으로 입력받아,
앱이 산출한 CF와 라인별로 비교. 기존 `referenceData: Map<cfItemId, ReferenceData>`
슬롯을 그대로 활용 → **차이나는 라인만 빨간색**.

### 입력 경로
1. **회사 CF 업로드**: 간단한 2열(항목명 | 금액) 엑셀 → CF라인 자동 매칭(라벨 유사도)
2. 또는 요약(Summary) 화면에서 라인별 참조금액 직접 입력

### 표시
Summary/그리드에 컬럼 추가: `앱산출 | 회사CF(참조) | 차이 | 상태(✔/✗)`.
- 차이 0 → ✔ 일치 (초록)
- 차이 ≠ 0 → ✗ + 금액 (빨강) → "이 라인만 보면 됨"

### 효과
정답을 몰라도, 회사 CF를 기준선으로 **차이 나는 곳만 집중 검토**.
= 감사인이 실제로 하는 방식(P4 해결). 뉴라텍 실측에서 이 방식으로 전 라인 tie 확인함.

## 4. 구현 범위 (최소 침습)

| 파일 | 변경 |
|------|------|
| `src/engines/allocation.ts` (신규) | autoAllocate() 순수함수 |
| `src/engines/verify.ts` (신규) | matchCompanyCF() 라벨매칭 + diff |
| `src/stores/useGridStore.ts` | `autoAllocate()` 액션, `loadCompanyCF()` 액션 추가 |
| `src/components/mapping/CoAMapping.tsx` | "자동배분 실행" 버튼 |
| `src/components/summary/Summary.tsx` | 대사 컬럼(참조/차이/상태) |
| `src/__tests__/allocation.test.ts` (신규) | 뉴라텍 데이터로 회귀 테스트 |

## 5. 검증 (Acceptance)
- [ ] 뉴라텍 계정별증감 업로드 → 자동배분 → **수동입력 0회**로 CF초안 생성
- [ ] 회사 CF 참조 입력 → 전 라인 ✔ (뉴라텍은 DART와 100% tie 확인됨)
- [ ] 오분류(건물관리비 등)는 자동배분이 경고 or 올바르게 라우팅
- [ ] 기존 테스트(engines.test.ts) 통과
