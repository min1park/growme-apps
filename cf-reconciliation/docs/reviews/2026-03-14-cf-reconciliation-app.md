# 설계 문서 리뷰: CF정산표 작성 웹앱

**리뷰 일시**: 2026-03-14
**리뷰어**: Claude
**리뷰 대상**: 기획서, UI 설계서, 아키텍처 설계서

## 요약
- 리뷰 문서: 3개 (기획/디자인/아키텍처)
- 이슈 발견: 8개 (Critical: 0, High: 2, Medium: 4, Low: 2)
- 전체 평가: **양호** — 3개 문서 간 정합성이 높고, 도메인 분석이 탄탄함

---

## 발견 이슈

### High (개발 전 수정 권장)

#### H-1. 데이터 모델 불일치: 기획서 vs 아키텍처
- **기획서** `Account` 인터페이스에 `bsCategory` 필드가 포함되어 있으나
- **아키텍처** `Account` 인터페이스에서는 `bsCategory`를 제거하고 `CoAMapping`으로 분리
- **기획서** `Project`에 `entries: CFEntry[]` (배열) vs **아키텍처** `gridData: Map<CellKey, CellValue>` (sparse Map)
- **기획서** `nonCashItems: NonCashEntry[]` 별도 타입 vs **아키텍처** 비현금은 cfItems에 통합
- **권장**: 아키텍처 기준이 더 적절함. 기획서를 아키텍처에 맞춰 갱신하거나, 아키텍처를 최종 기준으로 명시

#### H-2. 부호 규칙 미정의
- CF정산표에서 가장 중요한 것이 **부호 규칙** (sign convention)
- 자산 증가 = DR = 양수? 음수? → TB에서의 부호 체계가 명확하지 않음
- 실무 CF정산표 기준: 자산 증감은 그대로 표시, CF에서 반영 시 부호 반전 필요 (자산 증가 → CF 마이너스)
- 아키텍처 `CFItem.sign: 1 | -1` 필드가 있으나, **어떤 항목에 어떤 sign을 적용하는지 규칙 미정의**
- **권장**: 부호 규칙표를 별도로 정의
  - 영업-자산변동: 자산 증가 시 CF 마이너스 (sign = -1)
  - 영업-부채변동: 부채 증가 시 CF 플러스 (sign = 1)
  - 영업-조정: 비현금 비용은 CF 플러스 (감가상각비 = 장부상 비용이나 현금유출 아님)
  - 투자/재무: 취득(유출) = CF 마이너스, 처분(유입) = CF 플러스

### Medium (개선 권장)

#### M-1. CFSection.type 불일치
- **기획서**: `'operating' | 'investing' | 'financing' | 'noncash'` (4개)
- **아키텍처**: `'operating' | 'investing' | 'financing' | 'cash-summary' | 'noncash'` (5개, `cash-summary` 추가)
- **권장**: `cash-summary` 타입이 IV~VI 현금 요약에 필요하므로 아키텍처 기준 통일

#### M-2. CFItem 구조: children vs parentId
- **기획서**: `CFItem.children?: CFItem[]` (트리 구조)
- **아키텍처**: `CFItem.parentId: string | null` (flat 구조 + 참조)
- 두 방식 모두 가능하나, flat + parentId가 Zustand 스토어에서 관리하기 용이
- **권장**: flat 구조(아키텍처 기준) 확정. 트리 렌더링은 parentId로 재구성

#### M-3. debitCredit 판별 로직 부족
- `debitCredit: (closing - opening) >= 0 ? 'DR' : 'CR'` — 이 로직이 부정확
- 회계에서 DR/CR은 계정 성격에 따라 결정됨 (자산/비용 = DR, 부채/자본/수익 = CR)
- 증감의 부호와 DR/CR은 별개 개념
- **권장**: BSCategory 기반으로 DR/CR 결정하거나, TB에서 직접 파싱. 또는 이 필드 자체 삭제 검토 (CF정산표에서 직접 사용하지 않음)

#### M-4. Static Export + Dynamic Routes 호환성
- Next.js `output: 'export'`에서 `[id]` 동적 라우트 사용 시 `generateStaticParams` 필요
- 순수 클라이언트 앱에서 프로젝트 ID는 런타임에 결정 → Static Export와 충돌 가능
- **권장 대안**:
  1. Hash 라우팅 사용 (`/#/project/xxx/grid`)
  2. SPA 모드로 전환: 단일 page.tsx + 클라이언트 라우팅
  3. 또는 Next.js 대신 Vite + React Router 사용 (더 가벼움, static 친화적)

### Low (참고)

#### L-1. 기획서에 `AG Grid` 언급 but 아키텍처에서는 커스텀 구현
- 기획서 기술 스택: "AG Grid 또는 커스텀 가상화 테이블"
- 아키텍처: `@tanstack/react-virtual` 커스텀 구현으로 확정
- AG Grid Community는 무료이나 번들 크기 대비 CF정산표의 특수한 구조(frozen pane + 검증행)에 맞추기 어려울 수 있음
- **현재 결정(커스텀)이 적절**

#### L-2. Web Workers 불확실
- 아키텍처에서 `workers/validation.worker.ts` 언급하나 "(선택)"으로 표기
- 실무 데이터 규모(300~500 셀 값)에서는 메인 스레드 검증으로 충분
- **권장**: v1에서는 Web Worker 제외, 성능 이슈 발생 시 v2에서 도입

---

## 정합성 매트릭스

| 항목 | 기획서 | 디자인 | 아키텍처 | 일치 |
|------|--------|--------|----------|:----:|
| 5단계 화면 흐름 | ✅ | ✅ | ✅ | ✅ |
| 검증 체계 (열/행/현금) | ✅ | ✅ | ✅ | ✅ |
| TB 업로드 기능 | ✅ | ✅ | ✅ | ✅ |
| CoA 매핑 | ✅ | ✅ | ✅ | ✅ |
| 그리드 고정 영역 | ✅ | ✅ | ✅ | ✅ |
| Excel 출력 | ✅ | ✅ | ✅ | ✅ |
| 프로젝트 저장 (IndexedDB) | ✅ | ✅ | ✅ | ✅ |
| K-IFRS 템플릿 | ✅ | ✅ | ✅ | ✅ |
| Account 인터페이스 | ⚠️ | - | ⚠️ | H-1 |
| CFItem 구조 | children | - | parentId | M-2 |
| CFSection.type | 4개 | - | 5개 | M-1 |
| 부호 규칙 | 미정의 | - | sign 필드만 | H-2 |

---

## 좋은 점

1. **도메인 분석 수준 우수**: 실제 CF정산표 Excel을 완전히 분석하여 146컬럼 × 120행 구조를 정확히 반영
2. **검증 체계 3중 설계**: 열검증/행검증/현금검증의 원리와 수식이 명확
3. **sparse Map 전략**: 12,000 셀 중 실제 값 300~500개만 저장하는 효율적 설계
4. **가상화 성능 고려**: @tanstack/react-virtual 적용으로 대규모 그리드 렌더링 해결
5. **디자인 상세도**: 셀 상태, 키보드 네비게이션, 숫자 표시 규칙이 실무 수준으로 정의
6. **서버리스 보안**: 재무 데이터가 브라우저 밖으로 나가지 않는 아키텍처

---

## 권장 조치

### 개발 전 필수 (High)
- [ ] **H-1**: Account/Project 인터페이스를 아키텍처 기준으로 통일 → 기획서 갱신 또는 아키텍처를 최종 기준으로 선언
- [ ] **H-2**: 부호 규칙표(sign convention) 작성 — 각 CFCategory별 BS증감 → CF금액 변환 규칙

### 개발 시 반영 (Medium)
- [ ] **M-1**: CFSection.type을 5개로 통일
- [ ] **M-2**: CFItem은 flat + parentId로 확정
- [ ] **M-3**: debitCredit 필드 삭제 또는 BSCategory 기반 결정으로 변경
- [ ] **M-4**: Dynamic Routes 호환성 검증 — Next.js static export 테스트 또는 Vite 전환 검토

### 개발 중 참고 (Low)
- [ ] **L-1**: 커스텀 그리드 구현 확정 (AG Grid 불요)
- [ ] **L-2**: Web Worker는 v1에서 제외

---

## 최종 판정

**✅ 개발 진행 가능** — High 이슈 2건은 개발 초기(타입 정의 단계)에 해결 가능.
H-2(부호 규칙)는 가장 중요한 도메인 로직이므로 개발 착수 전 확정 필수.

## 다음 단계
→ `/develop` (프로젝트 초기 설정부터 시작)
→ H-2 부호 규칙은 cf-template-kifrs.ts 작성 시 함께 정의
