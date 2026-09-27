'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  UploadIcon,
  WandIcon,
  TableIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileSpreadsheetIcon,
  AlertTriangleIcon,
  HelpCircleIcon,
} from 'lucide-react';

interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 섹션 제목 */
function H({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-bold text-blue-700 mt-5 mb-2">
      {icon}
      {children}
    </h3>
  );
}

/** 코드/파일명 인라인 강조 */
function Code({ children }: { children: React.ReactNode }) {
  return <code className="px-1 py-0.5 rounded bg-slate-100 text-[12px] text-slate-800 font-mono">{children}</code>;
}

export function HelpDialog({ open, onOpenChange }: HelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircleIcon className="h-5 w-5 text-blue-600" />
            CF정산표 작성기 — 사용 가이드
          </DialogTitle>
          <DialogDescription>
            시산표(계정별증감)만 올리면 K-IFRS 현금흐름표 정산표를 자동으로 만들고, 회사 CF와 대사·검증합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="text-[13px] leading-relaxed text-slate-700">
          {/* 전체 흐름 */}
          <H icon={<span className="text-blue-600">▶</span>}>전체 흐름 (4단계)</H>
          <div className="flex flex-wrap items-center gap-1.5 text-xs mb-1">
            {['① 업로드', '② 매핑 확인', '③ 자동배분·정산', '④ 검증·다운로드'].map((s, i) => (
              <React.Fragment key={s}>
                <span className="px-2 py-1 rounded-md bg-blue-50 border border-blue-200 font-medium text-blue-700">{s}</span>
                {i < 3 && <span className="text-blue-300">→</span>}
              </React.Fragment>
            ))}
          </div>
          <p className="text-xs text-slate-500">모든 데이터는 브라우저 안에서만 처리됩니다(서버 전송 없음).</p>

          {/* 1. 업로드 */}
          <H icon={<UploadIcon className="h-4 w-4" />}>1. 시산표(계정별증감) 업로드</H>
          <p>Excel 파일을 올립니다. 아래 <b>6컬럼</b> 형식을 자동 인식합니다.</p>
          <div className="my-2 overflow-x-auto">
            <table className="text-[12px] border-collapse w-full">
              <thead>
                <tr className="bg-slate-100">
                  {['계정과목코드', '계정과목', '전기이월', '차변', '대변', '총합계'].map(h => (
                    <th key={h} className="border px-2 py-1 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border px-2 py-1">BS0301</td>
                  <td className="border px-2 py-1">외상매출금</td>
                  <td className="border px-2 py-1 text-right">300,657,468</td>
                  <td className="border px-2 py-1"></td>
                  <td className="border px-2 py-1"></td>
                  <td className="border px-2 py-1 text-right">468,667,109</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 items-start rounded-md bg-amber-50 border border-amber-200 p-2.5 my-2">
            <AlertTriangleIcon className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-[12px] text-amber-800">
              <b>부호 규약(중요)</b>: 원장(GL) 기준 — 자산 <b>+</b>, 부채·자본 <b>−</b>, 수익 <b>−</b>, 비용 <b>+</b>.
              전기이월 합계와 총합계 합계가 각각 <b>0</b>이어야 정상(복식부기). 손익 계정도 모두 포함해야 정확합니다.
            </div>
          </div>

          {/* 2. 매핑 */}
          <H icon={<TableIcon className="h-4 w-4" />}>2. 계정 매핑(CoA) 확인</H>
          <p>
            각 계정이 <b>BS분류</b>(유동자산·부채·자본·손익)와 <b>CF분류</b>(현금·영업·투자·재무·비현금·손익조정)로
            자동 매핑됩니다. <Code>자동매핑</Code> 버튼으로 재실행할 수 있고, 틀린 항목은 드롭다운으로 직접 고칩니다.
          </p>
          <ul className="list-disc pl-5 my-1 space-y-0.5 text-[12px]">
            <li>사용권자산 → <b>비현금</b>, 리스부채/차입금/전환사채 → <b>재무</b></li>
            <li>감가상각비·무형상각·이자·지분법·주식보상 → <b>손익-조정</b></li>
            <li>매출·매출원가·판관비 → <b>손익-해당없음</b>(당기순이익에 이미 포함)</li>
          </ul>

          {/* 3. 자동배분 */}
          <H icon={<WandIcon className="h-4 w-4" />}>3. 자동배분 → 정산표 자동 완성</H>
          <p>
            정산표 화면 상단의 <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[11px] font-medium"><WandIcon className="h-3 w-3" />자동배분</span> 버튼을 누르면,
            각 계정의 <b>증감</b>이 알맞은 CF 항목(행)에 자동으로 채워집니다. <b>수동 입력 없이 초안 완성</b>.
          </p>
          <ul className="list-disc pl-5 my-1 space-y-0.5 text-[12px]">
            <li>투자·재무는 증감 부호로 <b>유입/유출</b>을 자동 구분</li>
            <li>배분 못 한 계정은 <b>“⚠ 미배분 N건”</b>으로 알려줍니다 → 해당 계정만 수동 확인</li>
            <li>배분값은 CF방향으로 넣어 <b>열 검증이 자동으로 0</b>이 되게 설계됨</li>
          </ul>

          {/* 4. 검증 */}
          <H icon={<CheckCircle2Icon className="h-4 w-4" />}>4. 검증 (열·행·현금·회사CF 대사)</H>
          <ul className="list-disc pl-5 my-1 space-y-1 text-[12px]">
            <li><b>열 검증</b>: 각 BS계정 <Code>증감 + 배분합 = 0</Code> → 그 계정 증감이 CF에 완전 반영됨</li>
            <li><b>현금 검증</b>: <Code>영업 + 투자 + 재무 + 환율 = 현금 순증감</Code></li>
            <li>
              <b>회사 CF 대사</b>: 회사(또는 DART) 확정 CF를 <b>참조금액</b>으로 넣으면 라인별로 비교 →
              <b>차이나는 줄만 빨간색</b>. 정답을 몰라도 “다른 곳만” 집중 검토할 수 있습니다.
            </li>
          </ul>

          {/* 출력 */}
          <H icon={<DownloadIcon className="h-4 w-4" />}>5. Excel 출력 (매트릭스 정산표)</H>
          <p>
            <span className="inline-flex items-center gap-1"><DownloadIcon className="h-3 w-3" />Excel</span> 버튼으로 다운로드하면
            <b> 행=CF항목 × 열=BS계정</b> 매트릭스로 나옵니다(감사조서용 CF정산표 형식).
          </p>
          <ul className="list-disc pl-5 my-1 space-y-0.5 text-[12px]">
            <li>상단: 계정별 <b>전기말 / 당기말 / 증감</b></li>
            <li>본문: 당기순이익 → 조정 → 자산·부채변동 → 투자 → 재무 (셀 = 그 계정이 그 항목에 배분된 금액)</li>
            <li><b>현금 계정은 별도 열</b>(<Code>(현금)</Code> 표시) — 배분 대상이 아니라 CF의 결과</li>
            <li>하단: 열 합계 + <b>검증행(증감+배분=0)</b> — 정산표 무결성 확인</li>
          </ul>

          {/* 팁 */}
          <H icon={<FileSpreadsheetIcon className="h-4 w-4" />}>자주 묻는 것</H>
          <div className="space-y-1.5 text-[12px]">
            <p><b>Q. 현금 열의 검증이 0이 아니에요.</b><br />정상입니다. 현금은 배분 대상이 아니라 <b>CF 순증감(결과)</b>이라서 그 값이 표시됩니다.</p>
            <p><b>Q. 소계가 공시 CF와 달라요.</b><br />CF금액 열은 <b>BS증감의 배분합</b>이라, 비현금 항목이 섞이면 공시 현금CF와 표시 관점이 다를 수 있습니다. 무결성은 <b>검증행=0</b>으로 확인하세요.</p>
            <p><b>Q. 작업을 저장하려면?</b><br />상단 <b>저장</b>(Ctrl/⌘+S)으로 JSON 저장, 홈에서 <b>JSON 불러오기</b>로 재개합니다. <b>Ctrl+Z / Ctrl+Shift+Z</b>로 실행취소/재실행.</p>
          </div>

          <p className="mt-4 text-[11px] text-slate-400 border-t pt-2">
            K-IFRS 표준 템플릿 기반. 계정·CF항목은 자유롭게 추가·삭제·이동할 수 있습니다.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
