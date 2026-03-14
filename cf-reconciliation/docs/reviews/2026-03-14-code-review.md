# 코드 리뷰: CF정산표 웹앱 구현

## 요약
- 리뷰 파일: 12개
- 이슈 발견: 14개 (Critical: 2, High: 4, Medium: 5, Low: 3)

### 리뷰 대상 파일
| 파일 | 역할 |
|------|------|
| `src/engines/mapping.ts` | 계정과목 자동 매핑 엔진 |
| `src/engines/validation.ts` | 그리드 검증 엔진 |
| `src/stores/useGridStore.ts` | Zustand 그리드 상태 관리 |
| `src/data/cf-template-kifrs.ts` | K-IFRS 현금흐름표 템플릿 |
| `src/components/grid/CFGrid.tsx` | 가상화 그리드 메인 컴포넌트 |
| `src/components/grid/GridCell.tsx` | 개별 셀 편집 컴포넌트 |
| `src/services/excel-exporter.ts` | Excel 내보내기 |
| `src/services/tb-parser.ts` | 시산표 Excel 파서 |
| `src/types/index.ts` | 타입 re-export |
| `src/types/project.ts` | 프로젝트/계정 타입 정의 |
| `src/types/cf-template.ts` | CF 템플릿 타입 정의 |
| `src/types/grid.ts` | 그리드 셀/검증 타입 정의 |
| `src/lib/format.ts` | 숫자 포맷/파싱 유틸 |

---

## 발견 이슈

### Critical

#### C-1. sign 컨벤션(H-2)이 검증/집계에서 미적용
- **파일**: `src/engines/validation.ts`, `src/components/grid/CFGrid.tsx`, `src/services/excel-exporter.ts`
- **내용**: `CFItem.sign` 필드가 `1` 또는 `-1`로 정의되어 있으나, 검증 엔진(`validateGrid`)과 소계 계산(`getSubtotalAmount`), Excel 내보내기에서 `sign`이 전혀 사용되지 않는다. 모든 금액이 `cell.amount`를 그대로 합산하고 있다.
- **영향**: 현금흐름표에서 유출 항목(이자지급, 법인세납부, 유형자산취득 등)의 부호가 올바르게 처리되지 않을 수 있다. 사용자가 음수로 직접 입력하면 동작하지만, sign 컨벤션의 설계 의도(양수 입력 후 sign으로 부호 결정)와 불일치한다.
- **검증 코드 (validation.ts:28-29)**:
  ```typescript
  // 현재: sign 무시
  if (cell) sum += cell.amount;
  // 의도된 구현이 있다면: sum += cell.amount * item.sign;
  ```
- **권장**: sign 컨벤션의 의도를 명확히 결정하고, (a) sign을 적용하여 합산하거나, (b) sign 필드를 제거하고 사용자가 부호를 직접 입력하도록 통일해야 한다.

#### C-2. fromJSON에서 입력 데이터 검증 부재 (보안/안정성)
- **파일**: `src/stores/useGridStore.ts:225-240`
- **내용**: `fromJSON`이 `data as Record<string, unknown>`으로 단순 캐스팅만 하고, 실제 구조/타입 검증을 전혀 수행하지 않는다. `accounts`, `cfItems`, `gridData` 등이 올바른 형태인지 확인하지 않는다.
- **영향**: 손상된 저장 파일이나 악의적으로 조작된 JSON을 로드하면 런타임 크래시, 데이터 손상, 또는 예기치 않은 동작이 발생할 수 있다.
- **권장**: Zod 같은 스키마 검증 라이브러리를 사용하거나, 최소한 필수 필드와 타입을 수동으로 체크하는 로직을 추가해야 한다.

### High

#### H-1. validation 엔진의 행 검증이 항상 통과
- **파일**: `src/engines/validation.ts:36-47`
- **내용**: `passedRows`가 무조건 증가(`passedRows++`)하고, 실제 기대값과 비교하는 로직이 없다. `rowChecks`에 합계를 저장하지만 통과 여부를 판단하지 않는다.
- **영향**: 행 단위 검증이 사실상 비활성 상태이므로, 사용자가 행 수준의 오류를 인지하지 못할 수 있다.
- **권장**: 행 합계에 대한 기대값(예: PL 항목과의 대조)을 정의하고, 실제 차이 기반으로 pass/fail을 판단해야 한다.

#### H-2. autoMap의 폴백(fallback) 기본값이 부정확할 수 있음
- **파일**: `src/engines/mapping.ts:50-51`
- **내용**: 매칭되는 규칙이 없는 계정에 대해 `bsCategory: 'current-asset'`, `cfCategory: 'operating-asset'`으로 기본 매핑된다. 이는 비유동자산이나 부채 계정이 유동자산으로 잘못 분류될 수 있다.
- **권장**: 매칭 실패 시 `'unmatched'` 같은 별도 카테고리를 사용하여 사용자에게 수동 매핑을 유도하거나, 최소한 isLocked을 false로 유지하면서 시각적으로 미매핑 상태를 표시해야 한다.

#### H-3. parseCellKey에서 UUID 내부 콜론 처리 취약
- **파일**: `src/types/grid.ts:30-36`
- **내용**: `parseCellKey`가 첫 번째 `:`로만 분할한다. cfItemId에 `:`가 포함되면 잘못 파싱된다. 현재 cfItemId는 하드코딩된 slug이므로 실제 문제가 되지 않지만, accountId는 UUID이므로 안전하다. 다만 사용자 정의 CF 항목 ID에 `:`가 포함되면 문제가 된다.
- **권장**: 구분자를 `:`가 아닌 더 안전한 문자(예: `\x00` 또는 `|`)로 변경하거나, cfItemId에 콜론을 금지하는 검증을 추가해야 한다.

#### H-4. 그리드 헤더 스크롤 동기화가 불안정
- **파일**: `src/components/grid/CFGrid.tsx:178`
- **내용**: 헤더의 가로 스크롤 동기화가 `transform: translateX(-${bodyRef.current?.scrollLeft ?? 0}px)`로 구현되어 있으나, `onScroll` 핸들러에서 `dispatchEvent(new Event('scroll'))`로 강제 re-render를 유발하는 방식은 비효율적이고, 스크롤 시 깜빡임이나 지연이 발생할 수 있다.
- **권장**: `onScroll`에서 `requestAnimationFrame`을 사용하거나, CSS `position: sticky`와 `overflow` 조합으로 네이티브 스크롤 동기화를 구현하는 것이 좋다.

### Medium

#### M-1. Excel 내보내기에서 검증 열이 cash 계정을 포함
- **파일**: `src/services/excel-exporter.ts:18`
- **내용**: Excel 내보내기에서 `accounts.map(a => a.name)`으로 모든 계정을 헤더에 포함하지만, 그리드 뷰에서는 cash 계정을 제외한다. 열 검증 결과도 cash 계정에 대해서는 존재하지 않으므로, Excel에서 cash 계정 열의 검증값이 `0`으로 표시된다.
- **권장**: Excel 내보내기도 cash 계정을 별도 처리하거나, 그리드와 동일하게 제외해야 한다.

#### M-2. parseNumberInput의 음수 처리 로직 미흡
- **파일**: `src/lib/format.ts:25-29`
- **내용**: `input.includes('(')` 체크로 괄호 음수를 처리하지만, `cleaned`에서 이미 괄호를 제거했으므로 `Number(cleaned)`는 양수가 된다. 이후 `-Math.abs(num)`으로 음수를 만든다. 그러나 `input.startsWith('-')`와 `input.includes('(')`가 동시에 참이면 이중 음수 처리가 된다 (예: `-(100)` 입력 시 -100이 되어야 하지만, 실제로도 -100이 된다). 다만 `(-100)` 같은 입력은 `-Math.abs(-100)` = -100으로 올바르게 처리된다.
- **실제 버그**: `100)` (열린 괄호 없이 닫는 괄호만 있는 경우)도 음수로 처리됨. 엄격한 괄호 매칭이 없다.
- **권장**: 괄호 패턴을 `^\(.*\)$`로 정규식 매칭하여 더 엄격하게 처리하는 것이 좋다.

#### M-3. undoStack 크기 제한이 100개로 하드코딩
- **파일**: `src/stores/useGridStore.ts:100`
- **내용**: `state.undoStack.slice(-99)`로 최대 100개까지만 유지한다. 대규모 정산표 작업에서 100개가 부족할 수 있고, 이 제한이 사용자에게 알려지지 않는다.
- **권장**: 설정 가능한 상수로 분리하고, undo 스택이 가득 찼을 때 알림을 고려할 수 있다. 심각한 문제는 아니다.

#### M-4. TB 파서에서 계정 코드 중복 체크 미수행
- **파일**: `src/services/tb-parser.ts:68-91`
- **내용**: 동일한 계정 코드가 여러 행에 있을 때 모두 별개 계정으로 처리된다. 실무에서 시산표에 동일 코드가 여러 번 나타날 수 있다 (합계 행, 중간 소계 등).
- **권장**: 중복 코드 감지 및 합산/경고 로직을 추가해야 한다.

#### M-5. getSubtotalAmount의 재귀 깊이 제한 없음
- **파일**: `src/engines/validation.ts:79-95`
- **내용**: `getSubtotalAmount`가 재귀적으로 자식을 순회하지만, 순환 참조(parentId 체인이 순환)가 있으면 무한 재귀에 빠진다. 현재 하드코딩된 템플릿에서는 문제가 없으나, 사용자 정의 항목 추가(`addCFItem`) 시 순환이 발생할 수 있다.
- **권장**: visited Set을 사용한 순환 감지 또는 최대 재귀 깊이 제한을 추가해야 한다.

### Low

#### L-1. formatNumber와 formatNumberWon이 동일한 구현
- **파일**: `src/lib/format.ts:1-13`
- **내용**: `formatNumber`와 `formatNumberWon`이 완전히 동일한 코드이다.
- **권장**: 하나를 제거하거나, `formatNumberWon`에 원화 기호 등을 추가하여 차별화해야 한다.

#### L-2. exportToExcel에서 projectName 미사용
- **파일**: `src/services/excel-exporter.ts:13`
- **내용**: `void projectName;`으로 명시적으로 무시하고 있다. 파일명이나 시트 제목에 프로젝트명을 반영하지 않는다.
- **권장**: 워크시트 제목이나 헤더에 프로젝트명을 포함하거나, 매개변수를 제거해야 한다.

#### L-3. CFGrid 헤더에서 가상화를 사용하지 않음
- **파일**: `src/components/grid/CFGrid.tsx:181`
- **내용**: 헤더 영역에서 `gridAccounts.map()`으로 모든 계정을 렌더링한다. 본문은 `colVirtualizer`를 사용하지만 헤더는 가상화하지 않는다. 계정 수가 많으면 성능 저하가 있을 수 있다.
- **권장**: 헤더도 가상화하거나, 최소한 계정이 많을 때의 성능을 테스트해야 한다.

---

## 좋은 점

1. **명확한 타입 시스템**: TypeScript 타입이 잘 정의되어 있으며, `CellKey` 템플릿 리터럴 타입, union 타입 기반 카테고리 등이 타입 안전성을 높인다.

2. **가상화 적용**: `@tanstack/react-virtual`을 사용한 행/열 가상화로 대규모 그리드에서도 성능을 확보하고 있다.

3. **K-IFRS 표준 충실도**: CF 템플릿이 K-IFRS 간접법 현금흐름표 구조를 충실히 반영하고 있다. 영업/투자/재무 활동 분류, 비현금 거래 별도 표시 등이 적절하다.

4. **Undo/Redo 구현**: 셀 단위 undo/redo가 깔끔하게 구현되어 있으며, 스택 크기 제한도 적용되어 있다.

5. **키보드 네비게이션**: GridCell에서 Arrow, Tab, Enter, F2, Delete, Backspace, 숫자 직접 입력 등 스프레드시트 스타일의 키보드 조작이 잘 구현되어 있다.

6. **자동 매핑 규칙**: 한국 실무에서 사용하는 계정 과목명을 기반으로 한 정규식 매핑이 실용적이다.

7. **Excel 내보내기 품질**: 숫자 포맷(`#,##0;(#,##0);"-"`), 소계 행 스타일링 등 실무 사용에 적합한 Excel 출력을 생성한다.

8. **상태 직렬화**: `toJSON`/`fromJSON`으로 작업 상태의 저장/복원이 가능하다.

---

## 권장 조치

### 즉시 조치 (Sprint 내)
1. **[C-1] sign 컨벤션 통일**: sign 필드의 의도를 명확히 하고, 검증/집계/내보내기에 일관되게 적용해야 한다. 이것이 해결되지 않으면 현금흐름표 금액이 부정확할 수 있다.
2. **[C-2] fromJSON 입력 검증 추가**: 최소한 필수 필드 존재 여부와 배열/객체 타입을 확인하는 방어 코드를 추가해야 한다.
3. **[H-1] 행 검증 로직 수정**: `passedRows` 무조건 증가 로직을 수정하여 실질적인 검증을 수행해야 한다.

### 단기 조치 (다음 Sprint)
4. **[H-2] autoMap 폴백 개선**: 미매핑 계정을 명시적으로 표시하여 사용자가 수동으로 확인하도록 해야 한다.
5. **[M-1] Excel 내보내기에서 cash 계정 처리 통일**
6. **[M-4] TB 파서 중복 코드 감지 추가**
7. **[M-5] 재귀 순환 방지 로직 추가**

### 중기 조치
8. **[H-4] 헤더 스크롤 동기화 개선**: `requestAnimationFrame` 또는 CSS sticky 방식으로 전환
9. **[M-2] parseNumberInput 괄호 매칭 강화**
10. **[L-1~L-3] 코드 정리 및 미사용 코드 제거**
