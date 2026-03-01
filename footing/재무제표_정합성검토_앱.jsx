import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

/* ─────────────────────────────────────────
   색상 / 디자인 상수
───────────────────────────────────────── */
const COLORS = {
  navy: "#0F1E3C",
  blue: "#1A3A6B",
  accent: "#2563EB",
  accentLight: "#3B82F6",
  red: "#DC2626",
  redBg: "#FEF2F2",
  redBorder: "#FECACA",
  orange: "#D97706",
  orangeBg: "#FFFBEB",
  orangeBorder: "#FDE68A",
  green: "#059669",
  greenBg: "#F0FDF4",
  greenBorder: "#A7F3D0",
  gray50: "#F8FAFC",
  gray100: "#F1F5F9",
  gray200: "#E2E8F0",
  gray400: "#94A3B8",
  gray600: "#475569",
  gray800: "#1E293B",
  white: "#FFFFFF",
};

/* ─────────────────────────────────────────
   Excel 파싱 유틸
───────────────────────────────────────── */
function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const sheets = {};
        wb.SheetNames.forEach((name) => {
          const ws = wb.Sheets[name];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
          // 빈 행 제거 + 최대 80행
          const filtered = data
            .filter((row) => row.some((v) => v !== null && v !== ""))
            .slice(0, 80);
          sheets[name] = filtered;
        });
        resolve({ sheetNames: wb.SheetNames, sheets });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function sheetsToPrompt(sheetNames, sheets) {
  // 재무제표 본문 시트 + 주석 시트 추출
  const fsSheetsKw = ["BS", "IS", "CF", "CE"];
  const noteSheets = sheetNames.filter((n) => /^\d+$/.test(n));

  let text = "";

  // 재무제표 본문
  for (const name of fsSheetsKw) {
    if (sheets[name]) {
      text += `\n=== 시트: ${name} ===\n`;
      sheets[name].forEach((row) => {
        const nonNull = row.filter((v) => v !== null && v !== "");
        if (nonNull.length) text += nonNull.join(" | ") + "\n";
      });
    }
  }

  // 주석 (최대 30개, 각 60행)
  for (const name of noteSheets.slice(0, 30)) {
    const rows = (sheets[name] || []).slice(0, 60);
    text += `\n=== 주석 ${name} ===\n`;
    rows.forEach((row) => {
      const nonNull = row.filter((v) => v !== null && v !== "");
      if (nonNull.length) text += nonNull.join(" | ") + "\n";
    });
  }

  return text;
}

/* ─────────────────────────────────────────
   Anthropic API 호출
───────────────────────────────────────── */
async function runAnalysis(sheetNames, sheets) {
  const dataText = sheetsToPrompt(sheetNames, sheets);

  const systemPrompt = `당신은 공인회계사(CPA)로서 재무제표와 주석 간 정합성을 검토하는 전문가입니다.
주어진 Excel 데이터를 분석하여 재무제표 본문(BS/IS/CF/CE)과 각 주석 간의 수치 불일치를 찾아내세요.

반드시 JSON 형식으로만 응답하세요. 다른 텍스트는 일절 포함하지 마세요.

응답 형식:
{
  "company": "회사명",
  "period": "기준일",
  "summary": {
    "total_checked": 숫자,
    "matched": 숫자,
    "mismatched": 숫자
  },
  "issues": [
    {
      "id": 1,
      "severity": "high" | "medium" | "low",
      "category": "불일치 카테고리",
      "description": "불일치 내용 설명",
      "fs_sheet": "재무제표 시트명",
      "fs_value": 숫자 또는 "값",
      "note_sheet": "주석 시트명",
      "note_value": 숫자 또는 "값",
      "difference": 숫자,
      "possible_cause": "원인 추정"
    }
  ],
  "matched_items": [
    {
      "account": "계정과목",
      "value": 숫자,
      "fs_sheet": "시트명",
      "note_sheet": "주석번호"
    }
  ]
}`;

  const userPrompt = `아래 Excel 데이터를 분석하여 재무제표 본문과 주석 간 정합성을 검토해주세요.
모든 수치를 꼼꼼히 대조하고, 불일치 항목을 빠짐없이 찾아주세요.

${dataText}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) throw new Error(`API 오류: ${response.status}`);
  const data = await response.json();
  const text = data.content.map((b) => b.text || "").join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

/* ─────────────────────────────────────────
   숫자 포맷
───────────────────────────────────────── */
function fmtNum(n) {
  if (n === null || n === undefined) return "-";
  if (typeof n === "string") return n;
  return Math.abs(n) >= 1000
    ? n.toLocaleString("ko-KR") + "원"
    : String(n);
}

/* ─────────────────────────────────────────
   컴포넌트
───────────────────────────────────────── */
export default function App() {
  const [stage, setStage] = useState("upload"); // upload | parsing | analyzing | result | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("issues");
  const dropRef = useRef();

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (!file.name.match(/\.xlsx?$/i)) {
      setError("Excel 파일(.xlsx)만 업로드 가능합니다.");
      setStage("error");
      return;
    }
    setFileName(file.name);
    setStage("parsing");
    setProgress(20);

    try {
      const { sheetNames, sheets } = await parseExcel(file);
      setProgress(50);
      setStage("analyzing");

      const prog = setInterval(() => {
        setProgress((p) => (p < 88 ? p + 3 : p));
      }, 800);

      const res = await runAnalysis(sheetNames, sheets);
      clearInterval(prog);
      setProgress(100);
      setResult(res);
      setStage("result");
    } catch (err) {
      setError(err.message || "분석 중 오류가 발생했습니다.");
      setStage("error");
    }
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = useCallback(
    (e) => handleFile(e.target.files[0]),
    [handleFile]
  );

  const reset = () => {
    setStage("upload");
    setResult(null);
    setError("");
    setFileName("");
    setProgress(0);
    setActiveTab("issues");
  };

  /* ── 심각도 설정 ── */
  const severityConfig = {
    high: { label: "높음", bg: COLORS.redBg, border: COLORS.redBorder, color: COLORS.red, icon: "⚠" },
    medium: { label: "중간", bg: COLORS.orangeBg, border: COLORS.orangeBorder, color: COLORS.orange, icon: "●" },
    low: { label: "낮음", bg: COLORS.gray100, border: COLORS.gray200, color: COLORS.gray600, icon: "ℹ" },
  };

  /* ══════════════════════════════
     RENDER
  ══════════════════════════════ */
  return (
    <div style={{ fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif", minHeight: "100vh", background: `linear-gradient(135deg, ${COLORS.navy} 0%, ${COLORS.blue} 100%)`, padding: "0" }}>
      {/* ── 헤더 ── */}
      <div style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📋</div>
          <div>
            <div style={{ color: COLORS.white, fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>재무제표 정합성 검토</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>Financial Statement Cross-Validation</div>
          </div>
        </div>
        {stage === "result" && (
          <button onClick={reset} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: COLORS.white, borderRadius: 8, padding: "8px 18px", fontSize: 13, cursor: "pointer", transition: "all 0.2s" }}
            onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.18)"}
            onMouseLeave={e => e.target.style.background = "rgba(255,255,255,0.1)"}>
            ↩ 새 파일 검토
          </button>
        )}
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {/* ═══════════════════════════
            UPLOAD
        ═══════════════════════════ */}
        {stage === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, paddingTop: 40 }}>
            <div style={{ textAlign: "center" }}>
              <h1 style={{ color: COLORS.white, fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: "-1px" }}>재무제표 ↔ 주석 정합성 검토</h1>
              <p style={{ color: "rgba(255,255,255,0.55)", marginTop: 10, fontSize: 15 }}>Excel 파일을 업로드하면 AI가 재무제표 본문과 주석 간 수치 불일치를 자동으로 분석합니다</p>
            </div>

            {/* 드래그앤드롭 영역 */}
            <div
              ref={dropRef}
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); dropRef.current.style.borderColor = COLORS.accentLight; dropRef.current.style.background = "rgba(59,130,246,0.08)"; }}
              onDragLeave={() => { dropRef.current.style.borderColor = "rgba(255,255,255,0.2)"; dropRef.current.style.background = "rgba(255,255,255,0.04)"; }}
              style={{ width: "100%", maxWidth: 520, border: "2px dashed rgba(255,255,255,0.2)", borderRadius: 20, background: "rgba(255,255,255,0.04)", padding: "56px 40px", textAlign: "center", transition: "all 0.25s", cursor: "pointer" }}
              onClick={() => document.getElementById("fileInput").click()}
            >
              <div style={{ fontSize: 52, marginBottom: 16 }}>📊</div>
              <div style={{ color: COLORS.white, fontWeight: 600, fontSize: 17, marginBottom: 8 }}>여기에 파일을 드래그하거나 클릭하세요</div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>.xlsx 파일 지원 | 재무제표 + 주석이 포함된 파일</div>
              <input id="fileInput" type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={onInputChange} />
              <div style={{ marginTop: 24, background: COLORS.accent, color: COLORS.white, borderRadius: 10, padding: "10px 28px", display: "inline-block", fontWeight: 600, fontSize: 14 }}>파일 선택</div>
            </div>

            {/* 안내 카드 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, width: "100%", maxWidth: 700 }}>
              {[
                { icon: "📁", title: "시트 구성", desc: "BS·IS·CF·CE + 번호형 주석 시트" },
                { icon: "🔍", title: "AI 분석", desc: "수치 대조 및 불일치 자동 탐지" },
                { icon: "📝", title: "결과 리포트", desc: "심각도별 분류 및 원인 추정" },
              ].map((c, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "18px 16px", border: "1px solid rgba(255,255,255,0.1)", textAlign: "center" }}>
                  <div style={{ fontSize: 26, marginBottom: 8 }}>{c.icon}</div>
                  <div style={{ color: COLORS.white, fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{c.title}</div>
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════
            LOADING
        ═══════════════════════════ */}
        {(stage === "parsing" || stage === "analyzing") && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, paddingTop: 80 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, animation: "spin 2s linear infinite" }}>
              {stage === "parsing" ? "📊" : "🤖"}
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: COLORS.white, fontWeight: 700, fontSize: 22 }}>
                {stage === "parsing" ? "Excel 파일 파싱 중..." : "AI 정합성 분석 중..."}
              </div>
              <div style={{ color: "rgba(255,255,255,0.5)", marginTop: 8, fontSize: 14 }}>
                {stage === "parsing" ? "시트 데이터를 읽고 있습니다" : `${fileName} 분석 중 — 재무제표 ↔ 주석 교차 검증`}
              </div>
            </div>
            <div style={{ width: 380, background: "rgba(255,255,255,0.1)", borderRadius: 999, height: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accentLight})`, width: `${progress}%`, transition: "width 0.6s ease", borderRadius: 999 }} />
            </div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{progress}%</div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ═══════════════════════════
            ERROR
        ═══════════════════════════ */}
        {stage === "error" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingTop: 80 }}>
            <div style={{ fontSize: 52 }}>❌</div>
            <div style={{ color: COLORS.white, fontWeight: 700, fontSize: 20 }}>오류가 발생했습니다</div>
            <div style={{ background: COLORS.redBg, border: `1px solid ${COLORS.redBorder}`, borderRadius: 12, padding: "14px 24px", color: COLORS.red, fontSize: 14, maxWidth: 500, textAlign: "center" }}>{error}</div>
            <button onClick={reset} style={{ background: COLORS.accent, color: COLORS.white, border: "none", borderRadius: 10, padding: "10px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>다시 시도</button>
          </div>
        )}

        {/* ═══════════════════════════
            RESULT
        ═══════════════════════════ */}
        {stage === "result" && result && (() => {
          const issues = result.issues || [];
          const matched = result.matched_items || [];
          const highIssues = issues.filter((i) => i.severity === "high");
          const medIssues = issues.filter((i) => i.severity === "medium");
          const lowIssues = issues.filter((i) => i.severity === "low");

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* 상단 정보 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ color: COLORS.white, fontWeight: 800, fontSize: 22 }}>{result.company || "분석 완료"}</div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{result.period} | {fileName}</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "6px 16px", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                  총 {result.summary?.total_checked || issues.length + matched.length}건 검토
                </div>
              </div>

              {/* KPI 카드 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                {[
                  { label: "검토 항목", value: result.summary?.total_checked || issues.length + matched.length, color: COLORS.accentLight, bg: "rgba(59,130,246,0.12)" },
                  { label: "일치 항목", value: result.summary?.matched || matched.length, color: COLORS.green, bg: "rgba(5,150,105,0.12)" },
                  { label: "불일치 항목", value: issues.length, color: COLORS.red, bg: "rgba(220,38,38,0.12)" },
                  { label: "높음 심각도", value: highIssues.length, color: COLORS.orange, bg: "rgba(217,119,6,0.12)" },
                ].map((k, i) => (
                  <div key={i} style={{ background: k.bg, border: `1px solid ${k.color}33`, borderRadius: 14, padding: "18px 16px", textAlign: "center" }}>
                    <div style={{ color: k.color, fontWeight: 800, fontSize: 28 }}>{k.value}</div>
                    <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 4 }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* 탭 */}
              <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 4 }}>
                {[
                  { key: "issues", label: `불일치 항목 (${issues.length})` },
                  { key: "matched", label: `일치 항목 (${matched.length})` },
                ].map((tab) => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
                      background: activeTab === tab.key ? COLORS.white : "transparent",
                      color: activeTab === tab.key ? COLORS.navy : "rgba(255,255,255,0.55)" }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* 불일치 목록 */}
              {activeTab === "issues" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {issues.length === 0 && (
                    <div style={{ background: COLORS.greenBg, border: `1px solid ${COLORS.greenBorder}`, borderRadius: 14, padding: 28, textAlign: "center", color: COLORS.green, fontSize: 16, fontWeight: 600 }}>
                      🎉 불일치 항목이 발견되지 않았습니다
                    </div>
                  )}
                  {[...highIssues, ...medIssues, ...lowIssues].map((issue, idx) => {
                    const sc = severityConfig[issue.severity] || severityConfig.low;
                    return (
                      <div key={idx} style={{ background: COLORS.white, borderRadius: 14, border: `1.5px solid ${sc.border}`, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
                        {/* 헤더 */}
                        <div style={{ background: sc.bg, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${sc.border}` }}>
                          <span style={{ background: sc.color, color: COLORS.white, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{sc.icon} {sc.label}</span>
                          <span style={{ color: sc.color, fontWeight: 700, fontSize: 14 }}>#{issue.id}</span>
                          <span style={{ color: COLORS.gray800, fontWeight: 600, fontSize: 14 }}>{issue.category}</span>
                          <span style={{ marginLeft: "auto", background: sc.color + "22", color: sc.color, borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
                            차이: {typeof issue.difference === "number" ? issue.difference.toLocaleString("ko-KR") + "원" : issue.difference}
                          </span>
                        </div>

                        {/* 본문 */}
                        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={{ color: COLORS.gray800, fontSize: 14, lineHeight: 1.6 }}>{issue.description}</div>

                          {/* 수치 비교 */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center" }}>
                            <div style={{ background: COLORS.gray50, borderRadius: 10, padding: "10px 14px", border: `1px solid ${COLORS.gray200}` }}>
                              <div style={{ color: COLORS.gray400, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>재무제표 ({issue.fs_sheet})</div>
                              <div style={{ color: COLORS.gray800, fontWeight: 700, fontSize: 15 }}>{fmtNum(issue.fs_value)}</div>
                            </div>
                            <div style={{ color: COLORS.gray400, fontSize: 18 }}>≠</div>
                            <div style={{ background: sc.bg, borderRadius: 10, padding: "10px 14px", border: `1px solid ${sc.border}` }}>
                              <div style={{ color: sc.color, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>주석 ({issue.note_sheet})</div>
                              <div style={{ color: sc.color, fontWeight: 700, fontSize: 15 }}>{fmtNum(issue.note_value)}</div>
                            </div>
                          </div>

                          {issue.possible_cause && (
                            <div style={{ background: COLORS.gray50, borderRadius: 8, padding: "8px 12px", border: `1px solid ${COLORS.gray200}`, display: "flex", gap: 8, alignItems: "flex-start" }}>
                              <span style={{ color: COLORS.gray400, fontSize: 13 }}>💡</span>
                              <span style={{ color: COLORS.gray600, fontSize: 13 }}><b>원인 추정:</b> {issue.possible_cause}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 일치 항목 */}
              {activeTab === "matched" && (
                <div style={{ background: COLORS.white, borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
                  <div style={{ background: COLORS.greenBg, padding: "12px 18px", borderBottom: `1px solid ${COLORS.greenBorder}` }}>
                    <span style={{ color: COLORS.green, fontWeight: 700, fontSize: 14 }}>✓ 일치 확인 항목 ({matched.length}건)</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: COLORS.gray50 }}>
                          {["계정과목", "금액(원)", "재무제표 시트", "주석", "결과"].map((h, i) => (
                            <th key={i} style={{ padding: "10px 16px", textAlign: i >= 1 ? "right" : "left", color: COLORS.gray600, fontWeight: 600, borderBottom: `1px solid ${COLORS.gray200}`, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matched.map((m, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${COLORS.gray100}` }}
                            onMouseEnter={e => e.currentTarget.style.background = COLORS.gray50}
                            onMouseLeave={e => e.currentTarget.style.background = ""}>
                            <td style={{ padding: "10px 16px", color: COLORS.gray800, fontWeight: 500 }}>{m.account}</td>
                            <td style={{ padding: "10px 16px", textAlign: "right", color: COLORS.gray800, fontFamily: "monospace" }}>{typeof m.value === "number" ? m.value.toLocaleString("ko-KR") : m.value}</td>
                            <td style={{ padding: "10px 16px", textAlign: "right", color: COLORS.gray600 }}>{m.fs_sheet}</td>
                            <td style={{ padding: "10px 16px", textAlign: "right", color: COLORS.gray600 }}>주석{m.note_sheet}</td>
                            <td style={{ padding: "10px 16px", textAlign: "right" }}>
                              <span style={{ background: COLORS.greenBg, color: COLORS.green, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>✓ 일치</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
