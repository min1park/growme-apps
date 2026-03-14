# 테스트 결과: CF정산표 작성 웹앱

**테스트 일시**: 2026-03-14
**테스터**: Claude

## 요약
- 전체: 36개 항목 (33 단위테스트 + 3 빌드검증)
- 통과: 36개
- 실패: 0개

## 상세 결과

### 빌드 테스트
- [x] TypeScript 타입 체크 (`npx tsc --noEmit`): 통과
- [x] Next.js 빌드 (`npm run build`): 통과
- [x] Static Export 생성: 통과 (out/ 디렉토리)

### 단위 테스트 (vitest)

#### MappingEngine (13개)
- [x] 현금 계정 매핑 (현금, 보통예금 → cash, locked)
- [x] 매출채권 → operating-asset
- [x] 대손충당금 → operating-adjust
- [x] 토지/건물/기계 → investing-ppe
- [x] 감가상각누계액 → operating-adjust
- [x] 사용권자산 → noncash
- [x] 매입채무 → operating-liability
- [x] 리스부채 → financing
- [x] 자본금/이익잉여금 → equity (locked)
- [x] 특허권 → investing-intangible
- [x] 단기차입금 → financing
- [x] 전체 계정 매핑 + isAutoMatched 표시 (H-2 fix)
- [x] 미매핑 계정 isAutoMatched=false 확인 (H-2 fix)

#### CFTemplate (6개)
- [x] 5개 섹션 존재 (operating/investing/financing/cash-summary/noncash)
- [x] 영업 조정항목 (감가상각비, 무형자산상각비, 대손상각비, 사용권자산감가)
- [x] 운전자본 항목 (매출채권, 재고자산, 매입채무)
- [x] 부호 규칙 (C-1 fix): 자산원천=-1, 부채원천=1, contra-asset=-1
- [x] 소계 항목 존재 (I/II/III 영업/투자/재무)
- [x] getAllCFItems flat 배열 + parentId 참조 무결성

#### ValidationEngine (6개)
- [x] 미배분 열 감지 (1500 ≠ 2000 → 차이 -500)
- [x] 완전 배분 열 검증 통과 (2000 = 2000 → 차이 0)
- [x] 현금 계정 열검증 제외
- [x] Signed 소계 계산 (C-1 fix): 2000×(-1) + 1000×(1) = -1000
- [x] Nested signed 소계 계산 (C-1 fix): op-generated = 500 + 2000 + (-2000) = 500
- [x] 행 검증에서 데이터 있는 행만 카운트 (H-1 fix)
- [x] 행 검증에서 signed 금액 표시 (C-1 fix)

#### Format Utilities (5개)
- [x] 양수 천단위 콤마 (1,234,567)
- [x] 음수 괄호 표기 ((1,234,567))
- [x] 0 → 대시 (-)
- [x] null/undefined → 대시
- [x] 입력 파싱 (콤마/괄호 제거)

#### Grid 유틸 (2개)
- [x] makeCellKey 생성
- [x] parseCellKey 파싱

## 수정 사항 (코드 리뷰 반영)

### Critical
1. **C-1. sign convention 적용**: CFItem.sign 필드를 validation engine, grid display, excel export에 일괄 적용. Template sign 값을 BS증감→CF 변환 규칙에 맞게 전면 수정 (자산원천=-1, 부채원천=1).
2. **C-2. fromJSON 입력 검증**: 필수 필드 존재/타입 체크, 배열 요소 검증, gridData 엔트리 형식 검증 추가.

### High
3. **H-1. 행 검증 로직 수정**: passedRows 무조건 증가 → 데이터가 있는 행만 카운트하도록 변경.
4. **H-2. autoMap 미매핑 표시**: isAutoMatched 플래그 추가로 규칙 매칭 실패 계정 식별 가능.

### Other
5. **M-5. 순환 참조 방지**: getSubtotalAmount에 visited Set 추가.
6. **L-2. projectName 활용**: Excel 시트명/헤더에 프로젝트명 반영.

## 최종 상태
- ✅ 타입 체크: 통과
- ✅ 빌드: 통과
- ✅ 테스트: 33/33 통과
- ✅ Critical/High 코드 리뷰 이슈 수정 완료
