# 아키텍처 설계: CF정산표 작성 웹앱

**작성일**: 2026-03-14
**기획서**: docs/specs/2026-03-14-cf-reconciliation-app.md
**디자인**: docs/designs/2026-03-14-cf-reconciliation-app.md
**설계자**: Claude

## 1. 개요

### 1.1 목적
순수 클라이언트 사이드 웹앱으로 CF정산표를 작성.
서버 없이 브라우저에서 모든 처리(TB 파싱, 매핑, 검증, Excel 출력)를 수행하고,
IndexedDB에 프로젝트 데이터를 로컬 저장한다.

### 1.2 범위
- **포함**: 별도 CF정산표 작성 전 과정, 프로젝트 저장/불러오기, Excel 입출력
- **제외**: 서버 API, 인증, 연결 CF정산표 (v2), 다중 통화 (v2)

### 1.3 기술 스택
| 항목 | 기술 | 버전 |
|------|------|------|
| 프레임워크 | Next.js (App Router, Static Export) | 14.x |
| 언어 | TypeScript | 5.x |
| 상태관리 | Zustand + immer middleware | 4.x |
| UI 컴포넌트 | shadcn/ui + Radix UI | latest |
| 스타일 | Tailwind CSS | 3.x |
| 그리드 가상화 | @tanstack/react-virtual | 3.x |
| Excel 파싱 | SheetJS (xlsx) | 0.20.x |
| Excel 출력 | ExcelJS | 4.x |
| 로컬 저장 | idb (IndexedDB wrapper) | 8.x |
| 빌드 | Static Export (next export) | - |

## 2. 시스템 아키텍처

### 2.1 전체 구조
```
┌─────────────────────────────────────────────────────┐
│                    Browser                           │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │              Next.js App (Static)            │    │
│  │                                             │    │
│  │  ┌─────────┐  ┌─────────┐  ┌────────────┐  │    │
│  │  │  Pages   │  │Components│  │   Hooks    │  │    │
│  │  │ (5 steps)│  │(Grid,UI) │  │(useGrid,..)│  │    │
│  │  └────┬────┘  └────┬────┘  └─────┬──────┘  │    │
│  │       │             │             │          │    │
│  │  ┌────▼─────────────▼─────────────▼──────┐  │    │
│  │  │           Zustand Store               │  │    │
│  │  │  ┌──────────────────────────────────┐ │  │    │
│  │  │  │ ProjectStore                     │ │  │    │
│  │  │  │  - project meta                  │ │  │    │
│  │  │  │  - accounts (TB data)            │ │  │    │
│  │  │  │  - coaMapping                    │ │  │    │
│  │  │  │  - cfTemplate (CF items)         │ │  │    │
│  │  │  │  - entries (grid cell values)    │ │  │    │
│  │  │  │  - validation (computed)         │ │  │    │
│  │  │  └──────────────────────────────────┘ │  │    │
│  │  └──────────┬──────────────┬─────────────┘  │    │
│  │             │              │                  │    │
│  │  ┌──────────▼───┐  ┌──────▼──────────────┐  │    │
│  │  │  Services    │  │  Engines            │  │    │
│  │  │  - TBParser  │  │  - ValidationEngine │  │    │
│  │  │  - ExcelExport│ │  - MappingEngine   │  │    │
│  │  │  - Storage   │  │  - CFCalculator    │  │    │
│  │  └──────┬───────┘  └─────────────────────┘  │    │
│  │         │                                    │    │
│  │  ┌──────▼───────┐                            │    │
│  │  │  IndexedDB   │                            │    │
│  │  │  (idb)       │                            │    │
│  │  └──────────────┘                            │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │  SheetJS      │  │  ExcelJS     │                 │
│  │  (파싱)       │  │  (출력)      │                 │
│  └──────────────┘  └──────────────┘                 │
└─────────────────────────────────────────────────────┘
```

### 2.2 레이어 구조
```
┌─────────────────────────────────────┐
│  Presentation Layer                 │
│  Pages, Components, Hooks           │
├─────────────────────────────────────┤
│  State Layer                        │
│  Zustand Store (single source)      │
├─────────────────────────────────────┤
│  Business Logic Layer               │
│  Engines (Validation, Mapping, CF)  │
├─────────────────────────────────────┤
│  Service Layer                      │
│  TBParser, ExcelExporter, Storage   │
├─────────────────────────────────────┤
│  Infrastructure Layer               │
│  IndexedDB, File API, Web Workers   │
└─────────────────────────────────────┘
```

## 3. 디렉토리 구조

```
cf-reconciliation/
├── public/
│   └── favicon.ico
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # → ProjectHome
│   │   ├── project/
│   │   │   └── [id]/
│   │   │       ├── page.tsx          # → redirect to last step
│   │   │       ├── upload/
│   │   │       │   └── page.tsx      # Step 2: TB Upload
│   │   │       ├── mapping/
│   │   │       │   └── page.tsx      # Step 3: CoA Mapping
│   │   │       ├── grid/
│   │   │       │   └── page.tsx      # Step 4: CF Grid
│   │   │       └── summary/
│   │   │           └── page.tsx      # Step 5: Summary
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── select.tsx
│   │   │   ├── input.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── tooltip.tsx
│   │   │   ├── card.tsx
│   │   │   ├── collapsible.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── progress.tsx
│   │   │   ├── skeleton.tsx
│   │   │   └── table.tsx
│   │   │
│   │   ├── layout/
│   │   │   ├── TopBar.tsx
│   │   │   ├── BottomBar.tsx
│   │   │   ├── Stepper.tsx
│   │   │   └── AppShell.tsx
│   │   │
│   │   ├── project/
│   │   │   ├── ProjectCard.tsx
│   │   │   ├── NewProjectModal.tsx
│   │   │   └── ProjectList.tsx
│   │   │
│   │   ├── upload/
│   │   │   ├── DropZone.tsx
│   │   │   ├── SheetSelector.tsx
│   │   │   ├── ColumnMapper.tsx
│   │   │   └── PreviewTable.tsx
│   │   │
│   │   ├── mapping/
│   │   │   ├── MappingTable.tsx
│   │   │   ├── MappingRow.tsx
│   │   │   ├── MappingSummary.tsx
│   │   │   └── TemplateManager.tsx
│   │   │
│   │   ├── grid/                     # 핵심 CF정산표 그리드
│   │   │   ├── CFGrid.tsx            # 메인 그리드 컨테이너
│   │   │   ├── GridToolbar.tsx       # 상단 도구 모음
│   │   │   ├── HeaderPanel.tsx       # 고정 헤더 (계정명, 잔액, 검증)
│   │   │   ├── SidePanel.tsx         # 좌측 CF항목 트리
│   │   │   ├── GridBody.tsx          # 가상화 그리드 본문
│   │   │   ├── GridCell.tsx          # 개별 셀 (편집 가능)
│   │   │   ├── GridRow.tsx           # 행 컴포넌트
│   │   │   ├── ContextMenu.tsx       # 우클릭 메뉴
│   │   │   ├── AddRowModal.tsx       # 행 추가 모달
│   │   │   └── ValidationBadge.tsx   # 검증 뱃지
│   │   │
│   │   └── summary/
│   │       ├── ValidationSummary.tsx
│   │       ├── CFPreview.tsx
│   │       └── ExportOptions.tsx
│   │
│   ├── stores/
│   │   ├── useProjectStore.ts        # 프로젝트 메타 & 목록
│   │   ├── useGridStore.ts           # CF정산표 그리드 상태 (핵심)
│   │   └── useUIStore.ts             # UI 상태 (사이드바, 모달 등)
│   │
│   ├── engines/
│   │   ├── validation.ts             # 검증 엔진 (열/행/현금)
│   │   ├── mapping.ts                # CoA 자동 매핑 엔진
│   │   ├── calculator.ts             # CF 소계/합계 자동 계산
│   │   └── formatter.ts              # 숫자 포맷팅 (천단위, 음수 괄호)
│   │
│   ├── services/
│   │   ├── tb-parser.ts              # TB Excel/CSV 파싱
│   │   ├── excel-exporter.ts         # CF정산표 Excel 출력
│   │   ├── storage.ts                # IndexedDB CRUD
│   │   └── json-io.ts                # JSON 파일 입출력
│   │
│   ├── data/
│   │   ├── cf-template-kifrs.ts      # K-IFRS 표준 CF 항목 템플릿
│   │   ├── coa-mapping-rules.ts      # 계정과목 자동 매핑 규칙
│   │   └── default-accounts.ts       # 표준 계정과목 목록
│   │
│   ├── types/
│   │   ├── project.ts                # Project, Account 등 인터페이스
│   │   ├── cf-template.ts            # CFSection, CFItem 등
│   │   ├── grid.ts                   # GridCell, GridState 등
│   │   └── mapping.ts                # CoAMapping 등
│   │
│   ├── hooks/
│   │   ├── useGrid.ts                # 그리드 키보드/마우스 핸들링
│   │   ├── useVirtualGrid.ts         # 가상화 스크롤 훅
│   │   ├── useValidation.ts          # 검증 결과 구독
│   │   ├── useUndo.ts                # Ctrl+Z 되돌리기
│   │   └── useAutoSave.ts            # 자동 저장 (30초)
│   │
│   ├── lib/
│   │   ├── utils.ts                  # 유틸리티 (cn, etc.)
│   │   └── constants.ts              # 상수 정의
│   │
│   └── workers/                      # Web Workers (선택)
│       └── validation.worker.ts      # 검증 계산 오프로딩
│
├── next.config.js                    # output: 'export'
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── components.json                   # shadcn/ui config
```

## 4. 데이터 모델 상세

### 4.1 TypeScript 인터페이스 (전체)

```typescript
// === types/project.ts ===

export interface ProjectMeta {
  id: string;                          // uuid
  name: string;                        // "샘플회사 20XX 4Q"
  company: string;                     // "(주)샘플"
  periodStart: string;                 // "2025-01-01"
  periodEnd: string;                   // "2025-12-31"
  templateId: string;                  // "kifrs-standard"
  currentStep: StepId;                 // 마지막 작업 단계
  createdAt: string;                   // ISO datetime
  updatedAt: string;
}

export type StepId = 'upload' | 'mapping' | 'grid' | 'summary';

export interface Account {
  id: string;                          // uuid
  code: string;                        // "1010"
  name: string;                        // "현금"
  openingBalance: number;              // 당기초 (원 단위)
  closingBalance: number;              // 당기말
  // 아래는 자동 계산
  change: number;                      // closingBalance - openingBalance
  debitCredit: 'DR' | 'CR';            // 차변/대변
  columnIndex: number;                 // 정산표 열 순서
}

export interface CoAMapping {
  accountId: string;                   // Account.id
  bsCategory: BSCategory;
  cfCategory: CFCategory;
  isLocked: boolean;                   // 자동 잠금 (현금, 자본)
}

export type BSCategory =
  | 'current-asset'      // 유동자산
  | 'noncurrent-asset'   // 비유동자산
  | 'current-liability'  // 유동부채
  | 'noncurrent-liability' // 비유동부채
  | 'equity';            // 자본

export type CFCategory =
  | 'cash'               // 현금 (IV~VI에 사용)
  | 'operating-adjust'   // 영업-조정 (감가상각비 등)
  | 'operating-asset'    // 영업-자산변동
  | 'operating-liability'// 영업-부채변동
  | 'investing-ppe'      // 투자-유형자산
  | 'investing-intangible'// 투자-무형자산
  | 'investing-financial'// 투자-금융상품
  | 'investing-other'    // 투자-기타
  | 'financing'          // 재무활동
  | 'equity'             // 자본 (자동)
  | 'noncash';           // 비현금 거래


// === types/cf-template.ts ===

export interface CFTemplate {
  id: string;                          // "kifrs-standard"
  name: string;                        // "K-IFRS 표준"
  sections: CFSection[];
}

export interface CFSection {
  id: string;                          // "operating"
  type: 'operating' | 'investing' | 'financing' | 'cash-summary' | 'noncash';
  title: string;                       // "I. 영업활동으로 인한 현금흐름"
  items: CFItem[];
}

export interface CFItem {
  id: string;                          // "op-adj-depreciation"
  parentId: string | null;             // 부모 항목 ID
  label: string;                       // "감가상각비"
  level: number;                       // 0=대, 1=중, 2=소, 3=상세
  isSubtotal: boolean;                 // true면 자식 합계 자동 계산
  isEditable: boolean;                 // false면 입력 불가 (소계/합계)
  order: number;                       // 표시 순서
  sign: 1 | -1;                        // CF 부호 규칙
  defaultCfCategories?: CFCategory[];  // 이 항목에 매핑 가능한 CF 카테고리
}


// === types/grid.ts ===

// 그리드 셀 키: "cfItemId:accountId"
export type CellKey = `${string}:${string}`;

export interface CellValue {
  amount: number;
  memo?: string;
}

// 전체 그리드 데이터: sparse map (값이 있는 셀만 저장)
export type GridData = Map<CellKey, CellValue>;

// 검증 결과
export interface ValidationResult {
  columnChecks: Map<string, number>;   // accountId → 차이값 (0=pass)
  rowChecks: Map<string, number>;      // cfItemId → 차이값
  cashCheck: number;                   // 현금 검증 차이
  passedColumns: number;
  totalColumns: number;
  passedRows: number;
  totalRows: number;
}

// 되돌리기용 히스토리
export interface GridAction {
  type: 'set' | 'delete' | 'batch';
  cells: { key: CellKey; oldValue: CellValue | null; newValue: CellValue | null }[];
  timestamp: number;
}
```

### 4.2 IndexedDB 스키마

```typescript
// services/storage.ts

import { openDB, DBSchema } from 'idb';

interface CFReconciliationDB extends DBSchema {
  projects: {
    key: string;                       // project.id
    value: {
      meta: ProjectMeta;
      accounts: Account[];
      mappings: CoAMapping[];
      templateId: string;
      customItems: CFItem[];           // 사용자 추가 항목
      gridData: [CellKey, CellValue][]; // Map을 배열로 직렬화
      undoStack: GridAction[];
    };
    indexes: {
      'by-updated': string;            // updatedAt 기준 정렬
    };
  };
  templates: {
    key: string;                       // template.id
    value: {
      id: string;
      name: string;
      mappingRules: CoAMapping[];
      createdAt: string;
    };
  };
}

const DB_NAME = 'cf-reconciliation';
const DB_VERSION = 1;

export async function getDB() {
  return openDB<CFReconciliationDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // projects store
      const projectStore = db.createObjectStore('projects', { keyPath: 'meta.id' });
      projectStore.createIndex('by-updated', 'meta.updatedAt');

      // templates store (CoA 매핑 템플릿)
      db.createObjectStore('templates', { keyPath: 'id' });
    },
  });
}
```

## 5. Zustand 스토어 설계

### 5.1 useGridStore (핵심 스토어)

```typescript
// stores/useGridStore.ts

interface GridState {
  // === State ===
  projectId: string | null;
  accounts: Account[];                 // TB 계정 목록 (열)
  cfItems: CFItem[];                   // CF 항목 목록 (행), 템플릿 + 커스텀
  mappings: CoAMapping[];              // CoA 매핑
  gridData: Map<CellKey, CellValue>;   // 셀 데이터 (sparse)
  validation: ValidationResult;        // 검증 결과 (derived)

  // UI State
  selectedCell: CellKey | null;
  editingCell: CellKey | null;
  collapsedSections: Set<string>;      // 접힌 섹션 ID

  // Undo
  undoStack: GridAction[];
  redoStack: GridAction[];

  // === Actions ===
  // 초기화
  initProject: (project: ProjectData) => void;
  resetGrid: () => void;

  // 계정 (TB)
  setAccounts: (accounts: Account[]) => void;

  // 매핑
  setMappings: (mappings: CoAMapping[]) => void;
  updateMapping: (accountId: string, mapping: Partial<CoAMapping>) => void;

  // CF 항목
  addCFItem: (item: CFItem, afterItemId?: string) => void;
  removeCFItem: (itemId: string) => void;
  updateCFItem: (itemId: string, updates: Partial<CFItem>) => void;

  // 그리드 편집
  setCellValue: (cfItemId: string, accountId: string, value: number | null, memo?: string) => void;
  batchSetCells: (cells: { cfItemId: string; accountId: string; value: number | null }[]) => void;
  deleteCellValue: (cfItemId: string, accountId: string) => void;

  // 검증 (자동 계산)
  revalidate: () => void;

  // UI
  selectCell: (key: CellKey | null) => void;
  startEditing: (key: CellKey) => void;
  stopEditing: () => void;
  toggleSection: (sectionId: string) => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;

  // 계산된 값
  getCFAmount: (cfItemId: string) => number;         // E열 금액
  getColumnTotal: (accountId: string) => number;     // 열 합계
  getSubtotal: (cfItemId: string) => number;         // 소계
}
```

### 5.2 useProjectStore

```typescript
// stores/useProjectStore.ts

interface ProjectStoreState {
  projects: ProjectMeta[];
  currentProjectId: string | null;
  isLoading: boolean;

  // Actions
  loadProjects: () => Promise<void>;
  createProject: (meta: Omit<ProjectMeta, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  deleteProject: (id: string) => Promise<void>;
  saveCurrentProject: () => Promise<void>;
  loadProject: (id: string) => Promise<void>;
  exportProjectJSON: (id: string) => Promise<void>;
  importProjectJSON: (file: File) => Promise<void>;
}
```

### 5.3 스토어 관계도
```
useProjectStore
  ├── 프로젝트 목록 관리
  ├── IndexedDB CRUD 호출
  └── useGridStore.initProject() 호출

useGridStore (핵심)
  ├── accounts, cfItems, mappings, gridData
  ├── validation (revalidate 시 재계산)
  ├── undo/redo stack
  └── 셀 편집 상태

useUIStore
  ├── 현재 단계 (step)
  ├── 사이드바 너비
  ├── 모달 open/close
  └── 토스트 메시지
```

## 6. 핵심 엔진 설계

### 6.1 ValidationEngine

```typescript
// engines/validation.ts

export function validateGrid(
  accounts: Account[],
  cfItems: CFItem[],
  gridData: Map<CellKey, CellValue>,
  nonCashItemIds: Set<string>
): ValidationResult {

  const columnChecks = new Map<string, number>();
  const rowChecks = new Map<string, number>();

  // 1. 열 검증: 각 계정별 Σ(배분) - 증감 = 0
  for (const account of accounts) {
    let sum = 0;
    for (const item of cfItems) {
      const key: CellKey = `${item.id}:${account.id}`;
      const cell = gridData.get(key);
      if (cell) sum += cell.amount;
    }
    // 현금 계정은 별도 검증 (IV~VI에서 처리)
    if (account.cfCategory !== 'cash') {
      columnChecks.set(account.id, sum - account.change);
    }
  }

  // 2. 행 검증: 각 CF항목별 Σ(계정) = E열 표시값
  // (소계 항목은 자식 합계와 비교)

  // 3. 현금 검증: CF_I + CF_II + CF_III + 환율 = 기말 - 기초

  return { columnChecks, rowChecks, cashCheck, ... };
}
```

### 6.2 MappingEngine

```typescript
// engines/mapping.ts

// 계정명 키워드 기반 자동 매핑 규칙
const MAPPING_RULES: { pattern: RegExp; bs: BSCategory; cf: CFCategory; locked?: boolean }[] = [
  // 현금성 자산
  { pattern: /^(현금|보통예금|당좌예금|MMF|CMA)/,     bs: 'current-asset',      cf: 'cash',                locked: true },
  // 유동자산
  { pattern: /^(매출채권|받을어음)/,                    bs: 'current-asset',      cf: 'operating-asset' },
  { pattern: /^(미수금|미수수익|선급금|선급비용)/,        bs: 'current-asset',      cf: 'operating-asset' },
  { pattern: /^(대손충당금)/,                           bs: 'current-asset',      cf: 'operating-adjust' },
  { pattern: /^(제품|상품|재공품|원재료|저장품|재고)/,    bs: 'current-asset',      cf: 'operating-asset' },
  // 비유동자산
  { pattern: /^(토지|건물|구축물|기계|비품|차량|공구|건설중|금형|시설)/,
                                                       bs: 'noncurrent-asset',   cf: 'investing-ppe' },
  { pattern: /감가상각누계/,                            bs: 'noncurrent-asset',   cf: 'operating-adjust' },
  { pattern: /^(특허|실용신안|소프트웨어|개발비|회원권|영업권)/,
                                                       bs: 'noncurrent-asset',   cf: 'investing-intangible' },
  { pattern: /^(사용권자산)/,                           bs: 'noncurrent-asset',   cf: 'noncash' },
  { pattern: /^(투자부동산)/,                           bs: 'noncurrent-asset',   cf: 'investing-other' },
  { pattern: /^(정기예금|장기금융|보증금|대여금)/,        bs: 'noncurrent-asset',   cf: 'investing-financial' },
  { pattern: /^(지분법)/,                               bs: 'noncurrent-asset',   cf: 'investing-other' },
  // 유동부채
  { pattern: /^(매입채무|지급어음)/,                     bs: 'current-liability',  cf: 'operating-liability' },
  { pattern: /^(미지급금|미지급비용|예수금|선수금|가수금)/,bs: 'current-liability',  cf: 'operating-liability' },
  { pattern: /^(단기차입금)/,                           bs: 'current-liability',  cf: 'financing' },
  { pattern: /^(리스부채|단기리스)/,                     bs: 'current-liability',  cf: 'financing' },
  { pattern: /충당부채/,                                bs: 'current-liability',  cf: 'operating-liability' },
  // 비유동부채
  { pattern: /^(장기차입금|사채)/,                      bs: 'noncurrent-liability',cf: 'financing' },
  { pattern: /^(장기리스|장기복구)/,                     bs: 'noncurrent-liability',cf: 'financing' },
  { pattern: /^(퇴직급여|확정급여)/,                    bs: 'noncurrent-liability',cf: 'operating-adjust' },
  // 자본
  { pattern: /^(자본금|주식발행|자기주식|이익잉여금|기타자본)/,
                                                       bs: 'equity',             cf: 'equity',             locked: true },
];

export function autoMap(accounts: Account[]): CoAMapping[] {
  return accounts.map(account => {
    const rule = MAPPING_RULES.find(r => r.pattern.test(account.name));
    return {
      accountId: account.id,
      bsCategory: rule?.bs ?? 'current-asset',
      cfCategory: rule?.cf ?? 'operating-asset',
      isLocked: rule?.locked ?? false,
    };
  });
}
```

### 6.3 TBParser

```typescript
// services/tb-parser.ts

export interface TBParseConfig {
  sheetName: string;
  startRow: number;
  columns: {
    code: number;         // 계정코드 열 인덱스
    name: number;         // 계정명 열 인덱스
    opening: number;      // 당기초 잔액 열 인덱스
    closing: number;      // 당기말 잔액 열 인덱스
    debitCredit?: number; // 차변/대변 구분 열 (선택)
  };
}

export function parseTB(
  workbook: XLSX.WorkBook,
  config: TBParseConfig
): Account[] {
  const sheet = workbook.Sheets[config.sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const accounts: Account[] = [];
  for (let i = config.startRow; i < data.length; i++) {
    const row = data[i] as any[];
    const code = String(row[config.columns.code] ?? '').trim();
    const name = String(row[config.columns.name] ?? '').trim();
    if (!code && !name) continue;

    const opening = Number(row[config.columns.opening]) || 0;
    const closing = Number(row[config.columns.closing]) || 0;

    accounts.push({
      id: crypto.randomUUID(),
      code,
      name,
      openingBalance: opening,
      closingBalance: closing,
      change: closing - opening,
      debitCredit: (closing - opening) >= 0 ? 'DR' : 'CR',
      columnIndex: accounts.length,
    });
  }

  return accounts;
}

// 자동 컬럼 감지
export function detectColumns(sheet: XLSX.Sheet): Partial<TBParseConfig['columns']> {
  // 헤더 행에서 "계정코드", "계정명", "당기초", "당기말" 등 키워드 찾기
  const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[];
  const result: Partial<TBParseConfig['columns']> = {};

  headerRow.forEach((cell, idx) => {
    const s = String(cell).trim();
    if (/코드|계정번호/.test(s)) result.code = idx;
    if (/계정명|과목명/.test(s)) result.name = idx;
    if (/당기초|기초|전기말|기초잔액/.test(s)) result.opening = idx;
    if (/당기말|기말|당기말잔액/.test(s)) result.closing = idx;
  });

  return result;
}
```

### 6.4 ExcelExporter

```typescript
// services/excel-exporter.ts

export async function exportToExcel(
  project: ProjectMeta,
  accounts: Account[],
  cfItems: CFItem[],
  gridData: Map<CellKey, CellValue>,
  validation: ValidationResult,
  options: {
    includeReconciliation: boolean;  // CF정산표 시트
    includeCFDraft: boolean;         // CF초안 시트
    unit: 'won' | 'thousand';        // 단위
  }
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();

  if (options.includeReconciliation) {
    createReconciliationSheet(workbook, accounts, cfItems, gridData, validation, options.unit);
  }

  if (options.includeCFDraft) {
    createCFDraftSheet(workbook, cfItems, gridData, project, options.unit);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

function createReconciliationSheet(/* ... */) {
  // 실제 CF정산표와 동일한 레이아웃:
  // R1: 검증행
  // R2: 당기말
  // R6: 계정명
  // R7: 당기초
  // R8: 당기말
  // R9: 증감
  // R11~: CF 항목별 배분
  //
  // 서식:
  // - 숫자: #,##0;(#,##0);"-"
  // - 검증 0: 녹색 배경
  // - 검증 ≠0: 빨강 배경
  // - 소계: 볼드 + 연파랑 배경
  // - 대분류: 볼드 + 회색 배경
}
```

## 7. 데이터 흐름

### 7.1 TB 업로드 → 그리드 흐름
```
[Excel 파일 선택]
    │
    ▼
[SheetJS 파싱] → workbook 객체
    │
    ▼
[시트/컬럼 선택] → TBParseConfig
    │
    ▼
[parseTB()] → Account[] (당기초/당기말/증감)
    │
    ▼
[autoMap()] → CoAMapping[] (자동 매핑 제안)
    │
    ▼
[사용자 매핑 확인/수정]
    │
    ▼
[CF 템플릿 로드] → CFItem[] (K-IFRS 표준)
    │
    ▼
[그리드 초기화] → accounts(열) × cfItems(행) 매트릭스
    │
    ▼
[사용자 입력] → gridData.set(cellKey, value)
    │                    │
    │                    ▼
    │            [revalidate()] → ValidationResult
    │                    │
    │                    ▼
    │            [UI 검증 표시 갱신]
    │
    ▼
[Excel 출력] → ExcelJS → .xlsx Blob → 다운로드
```

### 7.2 셀 편집 흐름
```
[셀 클릭] → selectCell(key)
    │
    ▼
[더블클릭/타이핑] → startEditing(key)
    │
    ▼
[숫자 입력] → 로컬 input state
    │
    ▼
[Enter/Tab] → setCellValue(cfItemId, accountId, value)
    │
    ├──→ gridData 업데이트
    ├──→ undoStack에 push
    ├──→ revalidate() (디바운스 100ms)
    └──→ 소계/합계 자동 재계산
```

### 7.3 저장/불러오기 흐름
```
[자동저장 (30초)] 또는 [Ctrl+S]
    │
    ▼
[gridData → 직렬화] (Map → Array)
    │
    ▼
[IndexedDB put()] → projects store

[프로젝트 열기]
    │
    ▼
[IndexedDB get()] → 직렬화된 데이터
    │
    ▼
[역직렬화] (Array → Map)
    │
    ▼
[useGridStore.initProject()] → 상태 복원
```

## 8. 성능 최적화

### 8.1 그리드 가상화 전략
```
전체: 100열 × 120행 = 12,000 셀
보이는 영역: ~15열 × ~30행 = 450 셀 (96% 절약)

@tanstack/react-virtual:
  - rowVirtualizer: overscan=5, estimateSize=32px
  - columnVirtualizer: overscan=3, estimateSize=120px
  - 스크롤 시 visible range만 렌더
```

### 8.2 검증 최적화
```
변경된 셀의 행/열만 재검증 (incremental):
  setCellValue(cfItemId, accountId, value)
    → columnChecks.set(accountId, recalcColumn(accountId))
    → rowChecks.set(cfItemId, recalcRow(cfItemId))
    → cashCheck 재계산 (영업/투자/재무 소계 변경 시만)

전체 검증: 프로젝트 로드 시 1회, 이후 incremental
```

### 8.3 메모리 관리
```
GridData: sparse Map (값 있는 셀만)
  - 실무 CF정산표: 보통 300~500개 셀만 값 보유 (12,000 중)
  - Map 크기: ~50KB

Undo Stack: 최대 100개 액션
  - 초과 시 오래된 것부터 제거
```

## 9. 보안 체크리스트

| 항목 | 상태 | 비고 |
|------|------|------|
| 서버 전송 없음 | ✅ | 모든 데이터 로컬 처리 |
| 파일 접근 | ✅ | File API로 사용자 선택 파일만 읽기 |
| IndexedDB 격리 | ✅ | 브라우저 same-origin policy |
| XSS 방지 | ✅ | React 기본 escape + 숫자만 입력 |
| 민감 데이터 | ⚠️ | 재무 데이터는 로컬에만 존재, 브라우저 캐시 주의 |

## 10. 빌드 & 배포

### 10.1 정적 빌드
```javascript
// next.config.js
module.exports = {
  output: 'export',           // 정적 HTML/JS/CSS 생성
  images: { unoptimized: true },
  basePath: '',               // 로컬 실행 시 빈 문자열
};
```

### 10.2 실행 방법
```bash
# 개발
npm run dev          # localhost:3000

# 빌드 & 실행
npm run build        # out/ 디렉토리에 정적 파일 생성
npx serve out        # 로컬 서버로 실행

# 또는 index.html 직접 열기 (file:// 프로토콜)
```

## 11. 구현 순서 (의존성 기반)

```
Phase 1: 기반 (30분)
  ├── 프로젝트 scaffolding (Next.js + 의존성 설치)
  ├── 타입 정의 (types/*.ts)
  ├── shadcn/ui 컴포넌트 설치
  └── AppShell 레이아웃 (TopBar, BottomBar, Stepper)

Phase 2: 데이터 입력 (35분)
  ├── TBParser 서비스
  ├── TB Upload 페이지 (DropZone, ColumnMapper, PreviewTable)
  ├── MappingEngine
  └── CoA Mapping 페이지 (MappingTable)

Phase 3: 핵심 그리드 (55분)
  ├── CF 템플릿 데이터 (K-IFRS 표준)
  ├── useGridStore (Zustand)
  ├── ValidationEngine
  ├── GridCell 컴포넌트
  ├── HeaderPanel + SidePanel (frozen panes)
  ├── GridBody (가상화)
  └── CFGrid 통합

Phase 4: 출력 & 완성 (25분)
  ├── ExcelExporter 서비스
  ├── CFPreview 컴포넌트
  ├── Summary 페이지
  ├── Storage 서비스 (IndexedDB)
  ├── 자동 저장 + JSON 입출력
  └── ProjectHome 페이지

Phase 5: 품질 (20분)
  ├── 키보드 네비게이션
  ├── Undo/Redo
  ├── 실제 데이터 테스트
  └── 버그 수정
```

## 12. 참고: 실제 CF정산표 매핑

실제 `CF정산표` 시트의 열 구조를 앱의 Account 모델로 매핑:

```
Excel 열 F~EP (약 140개) → Account[] 배열
  F: 현금및현금등가물     → { code: '1010', name: '현금및현금등가물', cf: 'cash' }
  G: 정기예금(유동)      → { code: '1020', name: '정기예금', cf: 'investing-financial' }
  ...
  AY: 토지              → { code: '2010', name: '토지', cf: 'investing-ppe' }
  AZ: 건물              → { code: '2020', name: '건물', cf: 'investing-ppe' }
  BA: 건물감누           → { code: '2021', name: '건물감가상각누계액', cf: 'operating-adjust' }
  ...
  CI: 사용권자산(부동산)  → { code: '2510', name: '사용권자산', cf: 'noncash' }
  ...
  CM: 단기차입금         → { code: '3010', name: '단기차입금', cf: 'financing' }
  ...
  EI: 이익잉여금         → { code: '4050', name: '이익잉여금', cf: 'equity' }
```

실제 CF정산표 행 R12~R90 → CFItem[] 배열:
```
  R12: I.영업활동        → { id: 'cf-operating', level: 0, isSubtotal: true }
  R13: 1.영업창출        → { id: 'cf-op-generated', level: 1, isSubtotal: true }
  R14: (1)당기순이익     → { id: 'cf-op-ni', level: 2 }
  R15: (2)조정           → { id: 'cf-op-adjust', level: 2, isSubtotal: true }
  R16: 감가상각비        → { id: 'cf-op-adj-depr', level: 3 }
  ...
  R62: II.투자활동       → { id: 'cf-investing', level: 0, isSubtotal: true }
  ...
  R81: III.재무활동      → { id: 'cf-financing', level: 0, isSubtotal: true }
  ...
  R87: IV.현금순증감     → { id: 'cf-net-change', level: 0, isSubtotal: true }
  R88: V.기초현금        → { id: 'cf-opening-cash', level: 0 }
  R89: VI.기말현금       → { id: 'cf-closing-cash', level: 0 }
  R90: 환율효과          → { id: 'cf-fx-effect', level: 0 }
```
