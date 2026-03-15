import { create } from 'zustand';
import { Account, CoAMapping, CellKey, CellValue, ValidationResult, makeCellKey, GridAction, ReferenceData, CF_CATEGORY_MIGRATION, CFCategory } from '@/types';
import { CFItem } from '@/types/cf-template';
import { KIFRS_CF_TEMPLATE, getAllCFItems } from '@/data/cf-template-kifrs';
import { validateGrid, getSubtotalAmount } from '@/engines/validation';

interface GridState {
  accounts: Account[];
  cfItems: CFItem[];
  mappings: CoAMapping[];
  gridData: Map<CellKey, CellValue>;
  referenceData: Map<string, ReferenceData>; // cfItemId → 참조금액
  validation: ValidationResult;

  selectedCell: CellKey | null;
  editingCell: CellKey | null;
  collapsedSections: Set<string>;
  showNonCash: boolean;
  columnOrder: string[] | null; // 사용자 커스텀 열 순서 (null = 기본 정렬)

  undoStack: GridAction[];
  redoStack: GridAction[];

  setAccounts: (accounts: Account[]) => void;
  setMappings: (mappings: CoAMapping[]) => void;
  initCFItems: () => void;

  setCellValue: (cfItemId: string, accountId: string, value: number | null, memo?: string) => void;
  deleteCellValue: (cfItemId: string, accountId: string) => void;

  selectCell: (key: CellKey | null) => void;
  startEditing: (key: CellKey) => void;
  stopEditing: () => void;
  toggleSection: (sectionId: string) => void;
  setShowNonCash: (show: boolean) => void;

  revalidate: () => void;

  getCFAmount: (cfItemId: string) => number;
  getSubtotal: (subtotalId: string) => number;
  getRawSubtotal: (subtotalId: string) => number;

  undo: () => void;
  redo: () => void;

  addCFItem: (item: CFItem, afterItemId?: string) => void;
  removeCFItem: (itemId: string) => void;
  addNonCashItem: (label: string) => void;
  removeNonCashItem: (itemId: string) => void;
  addItemToSection: (parentId: string, label: string) => void;
  removeItemFromSection: (itemId: string) => void;

  setReferenceData: (cfItemId: string, data: ReferenceData | null) => void;

  setColumnOrder: (order: string[] | null) => void;
  moveColumn: (fromId: string, toId: string) => void;

  toJSON: () => object;
  fromJSON: (data: unknown) => void;
}

const emptyValidation: ValidationResult = {
  columnChecks: new Map(),
  rowChecks: new Map(),
  noncashChecks: new Map(),
  cashCheck: 0,
  passedColumns: 0,
  totalColumns: 0,
  passedRows: 0,
  totalRows: 0,
};

export const useGridStore = create<GridState>((set, get) => ({
  accounts: [],
  cfItems: getAllCFItems(KIFRS_CF_TEMPLATE),
  mappings: [],
  gridData: new Map(),
  referenceData: new Map(),
  validation: emptyValidation,

  selectedCell: null,
  editingCell: null,
  collapsedSections: new Set(),
  showNonCash: true,
  columnOrder: null,

  undoStack: [],
  redoStack: [],

  setAccounts: (accounts) => set({ accounts }),
  setMappings: (mappings) => set({ mappings }),
  initCFItems: () => set({ cfItems: getAllCFItems(KIFRS_CF_TEMPLATE) }),

  setCellValue: (cfItemId, accountId, value, memo) => {
    const state = get();
    const key = makeCellKey(cfItemId, accountId);
    const oldValue = state.gridData.get(key) ?? null;
    const newGridData = new Map(state.gridData);

    if (value === null || value === 0) {
      newGridData.delete(key);
    } else {
      newGridData.set(key, { amount: value, memo });
    }

    const newValue = value !== null && value !== 0 ? { amount: value, memo } : null;
    const action: GridAction = {
      type: 'set',
      cells: [{ key, oldValue, newValue }],
      timestamp: Date.now(),
    };

    set({
      gridData: newGridData,
      undoStack: [...state.undoStack.slice(-99), action],
      redoStack: [],
    });

    get().revalidate();
  },

  deleteCellValue: (cfItemId, accountId) => {
    get().setCellValue(cfItemId, accountId, null);
  },

  selectCell: (key) => set({ selectedCell: key, editingCell: null }),
  startEditing: (key) => set({ selectedCell: key, editingCell: key }),
  stopEditing: () => set({ editingCell: null }),
  toggleSection: (sectionId) => {
    const state = get();
    const newSet = new Set(state.collapsedSections);
    if (newSet.has(sectionId)) {
      newSet.delete(sectionId);
    } else {
      newSet.add(sectionId);
    }
    set({ collapsedSections: newSet });
  },
  setShowNonCash: (show) => set({ showNonCash: show }),

  revalidate: () => {
    const state = get();
    if (state.accounts.length === 0) return;
    const validation = validateGrid(state.accounts, state.cfItems, state.mappings, state.gridData);
    set({ validation });
  },

  getCFAmount: (cfItemId) => {
    const state = get();
    let sum = 0;
    for (const account of state.accounts) {
      const key = makeCellKey(cfItemId, account.id);
      const cell = state.gridData.get(key);
      if (cell) sum += cell.amount;
    }
    return sum; // 입력값 합계 그대로 (sign 미적용, 예시 Excel과 동일)
  },

  getSubtotal: (subtotalId) => {
    const state = get();
    return getSubtotalAmount(subtotalId, state.cfItems, state.accounts, state.gridData);
  },

  getRawSubtotal: (subtotalId) => {
    const state = get();
    return getSubtotalAmount(subtotalId, state.cfItems, state.accounts, state.gridData);
  },

  undo: () => {
    const state = get();
    if (state.undoStack.length === 0) return;
    const action = state.undoStack[state.undoStack.length - 1];
    const newGridData = new Map(state.gridData);

    for (const cell of action.cells) {
      if (cell.oldValue) {
        newGridData.set(cell.key, cell.oldValue);
      } else {
        newGridData.delete(cell.key);
      }
    }

    set({
      gridData: newGridData,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, action],
    });
    get().revalidate();
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return;
    const action = state.redoStack[state.redoStack.length - 1];
    const newGridData = new Map(state.gridData);

    for (const cell of action.cells) {
      if (cell.newValue) {
        newGridData.set(cell.key, cell.newValue);
      } else {
        newGridData.delete(cell.key);
      }
    }

    set({
      gridData: newGridData,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, action],
    });
    get().revalidate();
  },

  addCFItem: (item, afterItemId) => {
    const state = get();
    const items = [...state.cfItems];
    if (afterItemId) {
      const idx = items.findIndex(i => i.id === afterItemId);
      if (idx >= 0) {
        items.splice(idx + 1, 0, item);
      } else {
        items.push(item);
      }
    } else {
      items.push(item);
    }
    set({ cfItems: items });
  },

  removeCFItem: (itemId) => {
    const state = get();
    set({ cfItems: state.cfItems.filter(i => i.id !== itemId) });
  },

  addNonCashItem: (label) => {
    const state = get();
    const ncItems = state.cfItems.filter(i => i.sectionId === 'noncash' && i.isEditable);
    const lastNc = ncItems.length > 0 ? ncItems[ncItems.length - 1] : null;
    const newItem: CFItem = {
      id: `nc-custom-${Date.now()}`,
      parentId: 'nc',
      sectionId: 'noncash',
      label,
      level: 1,
      isSubtotal: false,
      isEditable: true,
      order: (lastNc?.order ?? 0) + 1,
      sign: 1,
    };
    get().addCFItem(newItem, lastNc?.id);
    get().revalidate();
  },

  removeNonCashItem: (itemId) => {
    get().removeItemFromSection(itemId);
  },

  addItemToSection: (parentId, label) => {
    const state = get();
    const parent = state.cfItems.find(i => i.id === parentId);
    if (!parent) return;

    const siblings = state.cfItems.filter(i => i.parentId === parentId && i.isEditable);
    const lastSibling = siblings.length > 0 ? siblings[siblings.length - 1] : null;

    const newItem: CFItem = {
      id: `${parentId}-custom-${Date.now()}`,
      parentId,
      sectionId: parent.sectionId,
      label,
      level: parent.level + 1,
      isSubtotal: false,
      isEditable: true,
      order: (lastSibling?.order ?? parent.order) + 1,
      sign: 1,
    };
    get().addCFItem(newItem, lastSibling?.id);
    get().revalidate();
  },

  removeItemFromSection: (itemId) => {
    const state = get();
    const item = state.cfItems.find(i => i.id === itemId);
    if (!item || !item.isEditable) return;

    const newGridData = new Map(state.gridData);
    Array.from(newGridData.keys()).forEach(key => {
      if (key.startsWith(`${itemId}:`)) {
        newGridData.delete(key);
      }
    });
    const newRefData = new Map(state.referenceData);
    newRefData.delete(itemId);
    set({
      cfItems: state.cfItems.filter(i => i.id !== itemId),
      gridData: newGridData,
      referenceData: newRefData,
    });
    get().revalidate();
  },

  setColumnOrder: (order) => set({ columnOrder: order }),

  moveColumn: (fromId, toId) => {
    const state = get();
    // 현재 순서 가져오기 (커스텀이 없으면 현재 accounts 순서 사용)
    const currentOrder = state.columnOrder ?? state.accounts.map(a => a.id);
    const newOrder = [...currentOrder];
    const fromIdx = newOrder.indexOf(fromId);
    const toIdx = newOrder.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    // fromIdx 위치의 항목을 toIdx 위치로 이동
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    set({ columnOrder: newOrder });
  },

  setReferenceData: (cfItemId, data) => {
    const state = get();
    const newRefData = new Map(state.referenceData);
    if (data === null) {
      newRefData.delete(cfItemId);
    } else {
      newRefData.set(cfItemId, data);
    }
    set({ referenceData: newRefData });
  },

  toJSON: () => {
    const state = get();
    return {
      accounts: state.accounts,
      cfItems: state.cfItems,
      mappings: state.mappings,
      gridData: Array.from(state.gridData.entries()),
      referenceData: Array.from(state.referenceData.entries()),
      showNonCash: state.showNonCash,
      columnOrder: state.columnOrder,
    };
  },

  fromJSON: (data: unknown) => {
    // C-2 fix: 입력 데이터 검증
    if (!data || typeof data !== 'object') {
      console.error('fromJSON: invalid data - not an object');
      return;
    }

    const d = data as Record<string, unknown>;

    // 필수 필드 검증
    const accounts = Array.isArray(d.accounts) ? d.accounts.filter(
      (a): a is Account =>
        a !== null && typeof a === 'object' &&
        'id' in a && 'code' in a && 'name' in a &&
        typeof (a as Account).openingBalance === 'number' &&
        typeof (a as Account).closingBalance === 'number' &&
        typeof (a as Account).change === 'number'
    ) : [];

    const cfItems = Array.isArray(d.cfItems) && d.cfItems.length > 0
      ? d.cfItems.filter(
          (i): i is CFItem =>
            i !== null && typeof i === 'object' &&
            'id' in i && 'label' in i && 'sign' in i
        )
      : getAllCFItems(KIFRS_CF_TEMPLATE);

    const mappings = Array.isArray(d.mappings) ? d.mappings.filter(
      (m): m is CoAMapping =>
        m !== null && typeof m === 'object' &&
        'accountId' in m && 'bsCategory' in m && 'cfCategory' in m
    ).map(m => {
      // 구 CF분류 → 신 CF분류 마이그레이션
      const migrated = CF_CATEGORY_MIGRATION[m.cfCategory];
      return migrated ? { ...m, cfCategory: migrated as CFCategory } : m;
    }) : [];

    const gridEntries = Array.isArray(d.gridData) ? d.gridData.filter(
      (entry): entry is [CellKey, CellValue] =>
        Array.isArray(entry) && entry.length === 2 &&
        typeof entry[0] === 'string' && entry[0].includes(':') &&
        entry[1] !== null && typeof entry[1] === 'object' &&
        typeof (entry[1] as CellValue).amount === 'number'
    ) : [];

    const refEntries = Array.isArray(d.referenceData) ? d.referenceData.filter(
      (entry): entry is [string, ReferenceData] =>
        Array.isArray(entry) && entry.length === 2 &&
        typeof entry[0] === 'string' &&
        entry[1] !== null && typeof entry[1] === 'object' &&
        typeof (entry[1] as ReferenceData).amount === 'number'
    ) : [];

    set({
      accounts,
      cfItems,
      mappings,
      gridData: new Map(gridEntries),
      referenceData: new Map(refEntries),
      showNonCash: typeof d.showNonCash === 'boolean' ? d.showNonCash : true,
      columnOrder: Array.isArray(d.columnOrder) ? d.columnOrder as string[] : null,
      undoStack: [],
      redoStack: [],
      selectedCell: null,
      editingCell: null,
      collapsedSections: new Set(),
    });
    get().revalidate();
  },
}));
