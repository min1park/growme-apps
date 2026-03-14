const { useState, useRef, useCallback, useEffect } = React;

// ─── CONFIG ────────────────────────────────────────────────────
const BG_THEMES_DARK = [
  "linear-gradient(135deg, #0d1117 0%, #161b22 40%, #1a1025 100%)",
  "linear-gradient(160deg, #0f1923 0%, #101820 50%, #0a1015 100%)",
  "linear-gradient(140deg, #12100a 0%, #1a150d 50%, #0f0d08 100%)",
  "linear-gradient(150deg, #0a0f17 0%, #0e1520 50%, #080c12 100%)",
  "linear-gradient(145deg, #110a0a 0%, #1a1010 50%, #0f0808 100%)",
  "linear-gradient(130deg, #0a110d 0%, #101a15 50%, #080f0c 100%)",
];

const BG_THEMES_LIGHT = [
  "linear-gradient(135deg, #f8f6f0 0%, #eee8dd 40%, #f5f0e8 100%)",
  "linear-gradient(160deg, #edf2f8 0%, #e2e8f0 50%, #f0f4fa 100%)",
  "linear-gradient(140deg, #f5f0e5 0%, #ebe4d4 50%, #f8f4ec 100%)",
  "linear-gradient(150deg, #e8eef5 0%, #dde4ed 50%, #f0f5fc 100%)",
  "linear-gradient(145deg, #f5e8e8 0%, #eddcdc 50%, #f8f0f0 100%)",
  "linear-gradient(130deg, #e8f5ed 0%, #ddeee4 50%, #f0f8f2 100%)",
];

const SCENE_PROMPT = `당신은 교육 영상의 씬 비주얼 디자이너입니다. 나레이션 텍스트를 분석하여 적절한 화면 구성을 JSON으로 반환하세요.
반드시 아래 JSON 형식만 출력하세요. 마크다운 백틱이나 설명 없이 순수 JSON만 출력하세요.
{"type":"intro|content|example|list|quote|closing","heading":"메인 제목 (10자 이내)","subheading":"부제목 (선택)","body":"본문 요약 (br 태그 가능)","keywords":["키워드1","키워드2"],"examples":[{"wrong":"틀린 예","correct":"맞는 예","explanation":"설명"}],"badge":"라벨 (인트로/클로징만)"}
규칙: intro=영상 시작, content=개념 설명, example=예시 비교, list=항목 나열, quote=인용, closing=마무리. heading은 짧게. keywords 2-4개. examples는 example 타입만. badge는 intro/closing만.`;

// ─── TTS PROVIDERS CONFIG ──────────────────────────────────────
const TTS_PROVIDERS = {
  browser: {
    name: "🌐 브라우저 내장",
    desc: "무료 · API 키 불필요 · 품질 보통",
    needsKey: false,
    voices: [],
  },
  openai: {
    name: "🤖 OpenAI TTS",
    desc: "고품질 · tts-1/tts-1-hd · $15/1M자",
    needsKey: true,
    keyPlaceholder: "sk-...",
    voices: [
      { id: "alloy", name: "Alloy (중성)" },
      { id: "echo", name: "Echo (남성)" },
      { id: "fable", name: "Fable (남성·영국)" },
      { id: "onyx", name: "Onyx (남성·저음)" },
      { id: "nova", name: "Nova (여성)" },
      { id: "shimmer", name: "Shimmer (여성)" },
      { id: "ash", name: "Ash (남성)" },
      { id: "coral", name: "Coral (여성)" },
      { id: "sage", name: "Sage (중성)" },
    ],
    models: ["tts-1", "tts-1-hd"],
  },
  google: {
    name: "☁️ Google Cloud TTS",
    desc: "최고 한국어 품질 · Wavenet/Neural2",
    needsKey: true,
    keyPlaceholder: "AIzaSy...",
    voices: [
      { id: "ko-KR-Wavenet-A", name: "Wavenet A (여성)" },
      { id: "ko-KR-Wavenet-B", name: "Wavenet B (여성)" },
      { id: "ko-KR-Wavenet-C", name: "Wavenet C (남성)" },
      { id: "ko-KR-Wavenet-D", name: "Wavenet D (남성)" },
      { id: "ko-KR-Neural2-A", name: "Neural2 A (여성)" },
      { id: "ko-KR-Neural2-B", name: "Neural2 B (여성)" },
      { id: "ko-KR-Neural2-C", name: "Neural2 C (남성)" },
      { id: "ko-KR-Standard-A", name: "Standard A (여성)" },
      { id: "ko-KR-Standard-B", name: "Standard B (여성)" },
      { id: "ko-KR-Standard-C", name: "Standard C (남성)" },
      { id: "ko-KR-Standard-D", name: "Standard D (남성)" },
    ],
  },
  elevenlabs: {
    name: "🎙️ ElevenLabs",
    desc: "가장 자연스러운 음성 · 다국어 지원",
    needsKey: true,
    keyPlaceholder: "xi-...",
    voices: [
      { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (여성)" },
      { id: "29vD33N1CtxCmqQRPOHJ", name: "Drew (남성)" },
      { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (여성)" },
      { id: "ErXwobaYiN019PkySvjV", name: "Antoni (남성)" },
      { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli (여성)" },
      { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh (남성)" },
      { id: "pNInz6obpgDQGcFmaJgB", name: "Adam (남성)" },
      { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam (남성)" },
    ],
  },
};

// ─── TTS ENGINE ────────────────────────────────────────────────
async function generateTTSAudio(text, provider, apiKey, voiceId, model, speed, trackUrl) {
  if (!text.trim()) return null;

  if (provider === "openai") {
    const resp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: model || "tts-1", voice: voiceId || "alloy", input: text, speed: speed || 1.0 }),
    });
    if (!resp.ok) throw new Error(`OpenAI TTS error: ${resp.status} ${await resp.text()}`);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    if (trackUrl) trackUrl(url);
    return url;
  }

  if (provider === "google") {
    const resp = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "ko-KR", name: voiceId || "ko-KR-Wavenet-A" },
        audioConfig: { audioEncoding: "MP3", speakingRate: speed || 1.0, pitch: 0 },
      }),
    });
    if (!resp.ok) throw new Error(`Google TTS error: ${resp.status} ${await resp.text()}`);
    const data = await resp.json();
    const audioBytes = atob(data.audioContent);
    const arr = new Uint8Array(audioBytes.length);
    for (let i = 0; i < audioBytes.length; i++) arr[i] = audioBytes.charCodeAt(i);
    const blob = new Blob([arr], { type: "audio/mp3" });
    const url = URL.createObjectURL(blob);
    if (trackUrl) trackUrl(url);
    return url;
  }

  if (provider === "elevenlabs") {
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId || "21m00Tcm4TlvDq8ikWAM"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: speed || 1.0 },
      }),
    });
    if (!resp.ok) throw new Error(`ElevenLabs TTS error: ${resp.status} ${await resp.text()}`);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    if (trackUrl) trackUrl(url);
    return url;
  }

  return null;
}

// ─── SAFE TEXT RENDERER (no dangerouslySetInnerHTML) ───────────
function renderSafeText(text, keywords = [], kwStyle) {
  if (!text) return null;
  const lines = text.split(/<br\s*\/?>/gi);
  return lines.flatMap((line, li) => {
    const result = [];
    if (li > 0) result.push(<br key={`br-${li}`} />);
    if (!keywords.length) {
      result.push(<span key={`t-${li}`}>{line}</span>);
    } else {
      const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const regex = new RegExp(`(${escaped.join("|")})`, "g");
      const parts = line.split(regex);
      parts.forEach((p, pi) => {
        if (keywords.includes(p)) {
          result.push(<span key={`k-${li}-${pi}`} style={kwStyle}>{p}</span>);
        } else if (p) {
          result.push(<span key={`p-${li}-${pi}`}>{p}</span>);
        }
      });
    }
    return result;
  });
}

// ─── SCENE VISUAL RENDERER ─────────────────────────────────────
function SceneVisual({ visual, lightTheme }) {
  if (!visual) return null;
  const { type, heading, subheading, body, keywords = [], examples = [], badge } = visual;
  const accent = lightTheme ? "#b8860b" : "#f0c040";
  const textColor = lightTheme ? "#333" : "#ddd";
  const subColor = lightTheme ? "#888" : "#777";
  const kw = { display: "inline", background: lightTheme ? "rgba(184,134,11,0.12)" : "rgba(240,192,64,0.13)", color: accent, padding: "1px 10px", borderRadius: 5, fontWeight: 500, border: `1px solid ${lightTheme ? "rgba(184,134,11,0.2)" : "rgba(240,192,64,0.18)"}` };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", animation: "fadeUp 0.7s ease both" }}>
      {heading && <div style={{ fontFamily: "'Black Han Sans'", fontSize: type === "intro" || type === "closing" ? 48 : 38, color: accent, textShadow: `0 0 40px ${lightTheme ? "rgba(184,134,11,0.15)" : "rgba(240,192,64,0.25)"}`, textAlign: "center", lineHeight: 1.3, marginBottom: 8 }}>{heading}</div>}
      {subheading && <div style={{ fontFamily: "'Nanum Myeongjo'", fontSize: 18, color: subColor, letterSpacing: 3, textAlign: "center", marginTop: 8 }}>{subheading}</div>}
      {badge && <div style={{ display: "inline-block", border: `1px solid ${lightTheme ? "rgba(184,134,11,0.4)" : "rgba(200,152,26,0.5)"}`, color: accent, fontSize: 12, padding: "5px 16px", borderRadius: 20, marginTop: 20, letterSpacing: 2, opacity: 0.7 }}>{badge}</div>}
      {type !== "quote" && body && <div style={{ fontSize: 20, lineHeight: 1.9, color: textColor, textAlign: "center", maxWidth: 650, fontWeight: 300, marginTop: 20 }}>{renderSafeText(body, keywords, kw)}</div>}
      {type === "example" && examples.map((ex, i) => (
        <div key={i} style={{ background: lightTheme ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.035)", border: `1px solid ${lightTheme ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, padding: "18px 26px", margin: "6px 0", width: "100%", maxWidth: 560, textAlign: "left", fontSize: 18, lineHeight: 1.7, animation: `fadeUp 0.6s ease ${0.2 + i * 0.15}s both` }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 4, letterSpacing: 1 }}>예시 {i + 1}</div>
          <span style={{ color: "#e05555", textDecoration: "line-through", opacity: 0.7 }}>{ex.wrong}</span><span style={{ color: "#555", margin: "0 8px" }}>→</span><span style={{ color: "#50d080", fontWeight: 500 }}>{ex.correct}</span>
          {ex.explanation && <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{ex.explanation}</div>}
        </div>
      ))}
      {type === "list" && keywords.length > 0 && <div style={{ marginTop: 16, textAlign: "left", maxWidth: 500, width: "100%" }}>{keywords.map((k, i) => <div key={i} style={{ padding: "10px 18px", background: lightTheme ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)", border: `1px solid ${lightTheme ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)"}`, borderRadius: 8, marginBottom: 6, fontSize: 18, color: textColor, animation: `fadeUp 0.5s ease ${0.1 + i * 0.1}s both`, display: "flex", alignItems: "center", gap: 10 }}><span style={{ color: accent, fontWeight: 700, fontSize: 14 }}>●</span> {k}</div>)}</div>}
      {type === "quote" && body && <div style={{ marginTop: 16, padding: "24px 32px", borderLeft: `3px solid ${accent}`, background: lightTheme ? "rgba(184,134,11,0.04)" : "rgba(240,192,64,0.04)", borderRadius: "0 8px 8px 0", maxWidth: 560, fontStyle: "italic", fontSize: 20, lineHeight: 1.8, color: lightTheme ? "#444" : "#ccc" }}>{renderSafeText(body, keywords, kw)}</div>}
    </div>
  );
}

// ─── RECORDING OVERLAY ─────────────────────────────────────────
function RecordingOverlay({ status, countdown, elapsed }) {
  if (status === "idle") return null;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  if (status === "countdown") return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}><div style={{ fontSize: 14, color: "#f0c040", letterSpacing: 3, marginBottom: 20 }}>녹화 준비</div><div style={{ fontFamily: "'Black Han Sans'", fontSize: 120, color: "#f0c040", textShadow: "0 0 60px rgba(240,192,64,0.4)", animation: "pulse 1s ease infinite" }}>{countdown}</div></div>;
  if (status === "recording") return <div style={{ position: "fixed", top: 16, right: 20, display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.75)", padding: "8px 16px", borderRadius: 8, zIndex: 9999, border: "1px solid rgba(255,0,0,0.3)" }}><div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff3333", animation: "blink 1s ease infinite" }} /><span style={{ fontSize: 13, color: "#ff6666", fontWeight: 700 }}>REC</span><span style={{ fontSize: 12, color: "#999" }}>{fmt(elapsed)}</span></div>;
  if (status === "processing") return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}><div style={{ width: 40, height: 40, border: "3px solid rgba(240,192,64,0.2)", borderTopColor: "#f0c040", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><div style={{ fontSize: 16, color: "#f0c040", marginTop: 20 }}>영상 파일 생성 중...</div></div>;
  return null;
}

// ─── TTS SETTINGS PANEL ────────────────────────────────────────
function TTSSettings({ tts, setTts, onPreview }) {
  const prov = TTS_PROVIDERS[tts.provider];
  const inputStyle = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#eee", fontFamily: "'Noto Sans KR'", fontSize: 13, padding: "8px 12px", outline: "none", boxSizing: "border-box" };
  const selectStyle = { ...inputStyle, appearance: "auto" };
  const labelStyle = { display: "block", fontSize: 11, color: "#888", marginBottom: 4, marginTop: 12, letterSpacing: 0.5 };

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "20px 24px", marginBottom: 16 }}>
      <div style={{ fontSize: 14, color: "#f0c040", fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
        🎙️ TTS 음성 설정
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {Object.entries(TTS_PROVIDERS).map(([key, p]) => (
          <button key={key} onClick={() => setTts({ ...tts, provider: key, voice: p.voices[0]?.id || "" })}
            style={{
              padding: "12px 14px", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "'Noto Sans KR'", transition: "all 0.15s",
              background: tts.provider === key ? "rgba(240,192,64,0.1)" : "rgba(255,255,255,0.02)",
              border: tts.provider === key ? "1px solid rgba(240,192,64,0.3)" : "1px solid rgba(255,255,255,0.06)",
            }}>
            <div style={{ fontSize: 13, color: tts.provider === key ? "#f0c040" : "#ccc", fontWeight: 600 }}>{p.name}</div>
            <div style={{ fontSize: 10, color: "#666", marginTop: 3 }}>{p.desc}</div>
          </button>
        ))}
      </div>

      {prov.needsKey && (
        <>
          <label style={labelStyle}>API 키</label>
          <input type="password" style={inputStyle} placeholder={prov.keyPlaceholder}
            value={tts.apiKey || ""} onChange={(e) => setTts({ ...tts, apiKey: e.target.value })} />
          <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>
            {tts.provider === "openai" && "platform.openai.com → API Keys"}
            {tts.provider === "google" && "console.cloud.google.com → Cloud Text-to-Speech API"}
            {tts.provider === "elevenlabs" && "elevenlabs.io → Profile → API Keys"}
          </div>
        </>
      )}

      <label style={labelStyle}>음성 선택</label>
      {tts.provider === "browser" ? (
        <select style={selectStyle} value={tts.voice} onChange={(e) => setTts({ ...tts, voice: e.target.value })}>
          {(tts.browserVoices || []).map((v, i) => <option key={i} value={v.name}>{v.name} ({v.lang})</option>)}
        </select>
      ) : (
        <select style={selectStyle} value={tts.voice} onChange={(e) => setTts({ ...tts, voice: e.target.value })}>
          {prov.voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      )}

      {tts.provider === "openai" && (
        <>
          <label style={labelStyle}>모델</label>
          <select style={selectStyle} value={tts.model || "tts-1"} onChange={(e) => setTts({ ...tts, model: e.target.value })}>
            <option value="tts-1">tts-1 (빠름, 저렴)</option>
            <option value="tts-1-hd">tts-1-hd (고품질, 2배 가격)</option>
          </select>
        </>
      )}

      <label style={labelStyle}>속도: {(tts.speed || 1.0).toFixed(1)}×</label>
      <input type="range" min="0.5" max="2.0" step="0.1" value={tts.speed || 1.0}
        onChange={(e) => setTts({ ...tts, speed: parseFloat(e.target.value) })}
        style={{ width: "100%", accentColor: "#f0c040" }} />

      <button onClick={onPreview}
        style={{ marginTop: 14, width: "100%", padding: "10px", background: "rgba(240,192,64,0.08)", border: "1px solid rgba(240,192,64,0.2)", borderRadius: 6, color: "#f0c040", fontSize: 13, cursor: "pointer", fontFamily: "'Noto Sans KR'" }}>
        🔊 테스트 음성 미리듣기
      </button>
    </div>
  );
}

// ─── VISUAL EDITOR PANEL ───────────────────────────────────────
function VisualEditor({ visual, onSave, onCancel }) {
  const [v, setV] = useState({ ...visual });
  const inputStyle = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#eee", fontFamily: "'Noto Sans KR'", fontSize: 12, padding: "6px 10px", outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontSize: 10, color: "#888", marginBottom: 2, marginTop: 8, display: "block" };

  return (
    <div style={{ background: "rgba(240,192,64,0.04)", border: "1px solid rgba(240,192,64,0.15)", borderRadius: 8, padding: "14px 18px", marginTop: 10 }}>
      <div style={{ fontSize: 12, color: "#f0c040", fontWeight: 700, marginBottom: 8 }}>비주얼 수동 편집</div>

      <label style={labelStyle}>타입</label>
      <select style={{ ...inputStyle, appearance: "auto" }} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
        {["intro", "content", "example", "list", "quote", "closing"].map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      <label style={labelStyle}>제목 (heading)</label>
      <input style={inputStyle} value={v.heading || ""} onChange={(e) => setV({ ...v, heading: e.target.value })} />

      <label style={labelStyle}>부제목 (subheading)</label>
      <input style={inputStyle} value={v.subheading || ""} onChange={(e) => setV({ ...v, subheading: e.target.value })} />

      <label style={labelStyle}>본문 (body, br 태그 사용 가능)</label>
      <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} value={v.body || ""} onChange={(e) => setV({ ...v, body: e.target.value })} />

      <label style={labelStyle}>키워드 (쉼표 구분)</label>
      <input style={inputStyle} value={(v.keywords || []).join(", ")} onChange={(e) => setV({ ...v, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })} />

      <label style={labelStyle}>뱃지 (intro/closing만)</label>
      <input style={inputStyle} value={v.badge || ""} onChange={(e) => setV({ ...v, badge: e.target.value })} />

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => onSave(v)} style={{ flex: 1, padding: "7px", background: "#f0c040", border: "none", borderRadius: 4, color: "#111", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Noto Sans KR'" }}>저장</button>
        <button onClick={onCancel} style={{ flex: 1, padding: "7px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#999", fontSize: 12, cursor: "pointer", fontFamily: "'Noto Sans KR'" }}>취소</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════
function NarrationVideoApp() {
  const [mode, setMode] = useState("editor");
  const [scenes, setScenes] = useState([
    { id: 1, narration: "띄어쓰기, 왜 중요할까요? 우리가 매일 쓰는 한글, 하지만 띄어쓰기는 늘 헷갈립니다. 오늘은 이 문제를 깔끔하게 정리해 보겠습니다.", visual: null, duration: 10, audioUrl: null },
    { id: 2, narration: "한글 맞춤법 제2항에 따르면, 문장의 각 단어는 띄어 씀을 원칙으로 합니다. 다만 조사는 그 앞 단어에 붙여 씁니다.", visual: null, duration: 12, audioUrl: null },
    { id: 3, narration: "자주 틀리는 예시를 볼까요? '그때 부터'는 틀린 표현입니다. '부터'는 조사이므로 '그때부터'로 붙여 써야 합니다. '할수있다'도 틀립니다. '수'는 의존명사이므로 '할 수 있다'로 띄어 써야 합니다.", visual: null, duration: 16, audioUrl: null },
    { id: 4, narration: "핵심 구분법을 알려드리겠습니다. 조사는 앞 단어에 붙여 쓰고, 의존명사는 앞 단어와 띄어 씁니다. 이 두 가지만 기억하면, 띄어쓰기의 80퍼센트는 해결할 수 있습니다.", visual: null, duration: 14, audioUrl: null },
    { id: 5, narration: "오늘도 한 걸음 성장했습니다. 구독과 좋아요 부탁드립니다. 다음 영상에서 만나요!", visual: null, duration: 9, audioUrl: null },
  ]);
  const [tts, setTts] = useState({ provider: "browser", apiKey: "", voice: "", model: "tts-1", speed: 1.0, browserVoices: [] });
  const [anthropicKey, setAnthropicKey] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState("");
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [audioProgress, setAudioProgress] = useState("");
  const [currentScene, setCurrentScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [subtitleText, setSubtitleText] = useState("");
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeDisplay, setTimeDisplay] = useState("0:00 / 0:00");
  const [nextId, setNextId] = useState(6);
  const [recStatus, setRecStatus] = useState("idle");
  const [recCountdown, setRecCountdown] = useState(3);
  const [recElapsed, setRecElapsed] = useState(0);
  const [bgTheme, setBgTheme] = useState("dark");
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [editingVisualId, setEditingVisualId] = useState(null);
  const [lastRecordingBlob, setLastRecordingBlob] = useState(null);
  const [mp4Converting, setMp4Converting] = useState(false);

  const playingRef = useRef(false);
  const currentSceneRef = useRef(0);
  const animFrameRef = useRef(null);
  const sceneStartRef = useRef(0);
  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const displayStreamRef = useRef(null);
  const recStartTimeRef = useRef(0);
  const recTimerRef = useRef(null);
  const scenesRef = useRef(scenes);
  const ttsRef = useRef(tts);
  const onPlaybackEndRef = useRef(null);
  const objectUrlsRef = useRef([]);
  const chromeTtsTimerRef = useRef(null);

  const trackUrl = useCallback((url) => { objectUrlsRef.current.push(url); }, []);

  useEffect(() => { scenesRef.current = scenes; }, [scenes]);
  useEffect(() => { ttsRef.current = tts; }, [tts]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      clearInterval(recTimerRef.current);
      clearInterval(chromeTtsTimerRef.current);
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (displayStreamRef.current) { displayStreamRef.current.getTracks().forEach((t) => t.stop()); }
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // ── Load saved settings from localStorage ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem("narration-maker-settings");
      if (saved) {
        const s = JSON.parse(saved);
        if (s.tts) setTts((prev) => ({ ...prev, provider: s.tts.provider || prev.provider, apiKey: s.tts.apiKey || "", voice: s.tts.voice || "", model: s.tts.model || "tts-1", speed: s.tts.speed ?? 1.0 }));
        if (s.anthropicKey) setAnthropicKey(s.anthropicKey);
        if (s.bgTheme) setBgTheme(s.bgTheme);
      }
    } catch (e) { /* ignore */ }
  }, []);

  // ── Save settings to localStorage ──
  useEffect(() => {
    try {
      localStorage.setItem("narration-maker-settings", JSON.stringify({
        tts: { provider: tts.provider, apiKey: tts.apiKey, voice: tts.voice, model: tts.model, speed: tts.speed },
        anthropicKey,
        bgTheme,
      }));
    } catch (e) { /* ignore */ }
  }, [tts.provider, tts.apiKey, tts.voice, tts.model, tts.speed, anthropicKey, bgTheme]);

  // ── Load browser voices ──
  useEffect(() => {
    if ("speechSynthesis" in window) {
      const load = () => {
        const v = speechSynthesis.getVoices();
        const ko = v.filter((x) => x.lang.startsWith("ko"));
        const others = v.filter((x) => !x.lang.startsWith("ko"));
        const sorted = [...ko, ...others];
        setTts((prev) => ({ ...prev, browserVoices: sorted, voice: prev.voice || sorted[0]?.name || "" }));
      };
      load();
      speechSynthesis.onvoiceschanged = load;
    }
  }, []);

  // ── Editor helpers ──
  const updateNarration = (id, text) => setScenes((p) => p.map((s) => s.id === id ? { ...s, narration: text, visual: null, audioUrl: null } : s));
  const addScene = () => { setScenes((p) => [...p, { id: nextId, narration: "", visual: null, duration: 8, audioUrl: null }]); setNextId((n) => n + 1); };
  const removeScene = (id) => setScenes((p) => p.length <= 1 ? p : p.filter((s) => s.id !== id));
  const moveScene = (i, d) => setScenes((p) => { const a = [...p]; const t = i + d; if (t < 0 || t >= a.length) return p; [a[i], a[t]] = [a[t], a[i]]; return a; });

  // ── Copy scene ──
  const copyScene = (scene) => {
    const newScene = { ...scene, id: nextId, audioUrl: null };
    setScenes((p) => [...p, newScene]);
    setNextId((n) => n + 1);
  };

  // ── Bulk import ──
  const importBulk = () => {
    if (!bulkText.trim()) return;
    const parts = bulkText.split(/\n\s*\n|\n---\n/).filter((p) => p.trim());
    if (!parts.length) return;
    const newScenes = parts.map((p, i) => ({
      id: nextId + i,
      narration: p.trim(),
      visual: null,
      duration: Math.max(5, Math.round(p.trim().length / 7)),
      audioUrl: null,
    }));
    setScenes(newScenes);
    setNextId((n) => n + parts.length);
    setShowBulkImport(false);
    setBulkText("");
  };

  // ── Drag and drop ──
  const handleDragStart = (idx) => setDragIdx(idx);
  const handleDragOver = (e, idx) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDrop = (idx) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    setScenes((p) => {
      const a = [...p];
      const [item] = a.splice(dragIdx, 1);
      a.splice(idx, 0, item);
      return a;
    });
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  // ── Individual scene preview (TTS) ──
  const previewSceneTTS = (scene) => {
    if (!scene.narration.trim()) return;
    if (tts.provider === "browser") {
      if ("speechSynthesis" in window) {
        speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(scene.narration);
        utt.rate = tts.speed || 1.0;
        const found = speechSynthesis.getVoices().find((v) => v.name === tts.voice);
        if (found) utt.voice = found;
        speechSynthesis.speak(utt);
      }
    } else if (scene.audioUrl) {
      if (audioRef.current) { audioRef.current.pause(); }
      const a = new Audio(scene.audioUrl);
      audioRef.current = a;
      a.play();
    }
  };

  // ── Update visual ──
  const updateVisual = (id, visual) => {
    setScenes((p) => p.map((s) => s.id === id ? { ...s, visual } : s));
    setEditingVisualId(null);
  };

  // ── Char count / estimated time ──
  const estimateTime = (text) => {
    if (!text.trim()) return 0;
    return Math.max(3, Math.ceil(text.length / 4.5));
  };

  // ── Generate Visuals ──
  const generateVisuals = async () => {
    if (!anthropicKey.trim()) { alert("Anthropic API 키를 입력해주세요."); return; }
    setGenerating(true);
    const updated = [...scenes];
    for (let i = 0; i < updated.length; i++) {
      const s = updated[i]; if (!s.narration.trim()) continue;
      setGenProgress(`씬 ${i + 1}/${updated.length} 비주얼 생성...`);
      const posHint = i === 0 ? "\n이 씬은 인트로입니다." : i === updated.length - 1 ? "\n이 씬은 클로징입니다." : `\n${i + 1}/${updated.length}번째 씬.`;
      try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: `나레이션:\n"${s.narration}"${posHint}\n\n화면 비주얼 JSON 생성.` }], system: SCENE_PROMPT }),
        });
        if (!resp.ok) throw new Error(`API error: ${resp.status}`);
        const data = await resp.json();
        const text = data.content?.map((c) => c.text || "").join("") || "";
        updated[i] = { ...updated[i], visual: JSON.parse(text.replace(/```json|```/g, "").trim()) };
        updated[i].duration = Math.max(5, Math.round(s.narration.length / 7));
      } catch (err) {
        console.error(err);
        updated[i] = { ...updated[i], visual: { type: "content", heading: `장면 ${i + 1}`, subheading: "", body: s.narration.substring(0, 80), keywords: [], examples: [], badge: "" } };
      }
    }
    setScenes(updated); setGenerating(false); setGenProgress("");
  };

  // ── Generate Audio ──
  const generateAllAudio = async () => {
    if (tts.provider === "browser") { setMode("player"); return; }
    if (tts.provider !== "browser" && !tts.apiKey) { alert("API 키를 입력해주세요."); return; }

    setAudioGenerating(true);
    const updated = [...scenes];
    for (let i = 0; i < updated.length; i++) {
      const s = updated[i]; if (!s.narration.trim()) continue;
      setAudioProgress(`씬 ${i + 1}/${updated.length} 음성 생성...`);
      try {
        // Revoke old audio URL if exists
        if (s.audioUrl) { URL.revokeObjectURL(s.audioUrl); }
        const url = await generateTTSAudio(s.narration, tts.provider, tts.apiKey, tts.voice, tts.model, tts.speed, trackUrl);
        if (url) {
          const dur = await new Promise((resolve) => {
            const a = new Audio(url);
            a.onloadedmetadata = () => resolve(a.duration);
            a.onerror = () => resolve(s.duration);
          });
          updated[i] = { ...updated[i], audioUrl: url, duration: Math.ceil(dur) };
        }
      } catch (err) {
        console.error(err);
        alert(`씬 ${i + 1} 음성 생성 실패: ${err.message}`);
        setAudioGenerating(false); setAudioProgress(""); return;
      }
    }
    setScenes(updated); setAudioGenerating(false); setAudioProgress("");
    setMode("player");
  };

  // ── Preview TTS ──
  const previewTTS = async () => {
    const testText = "안녕하세요, 테스트 음성입니다. 이 목소리로 나레이션을 녹음합니다.";
    if (tts.provider === "browser") {
      if ("speechSynthesis" in window) {
        speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(testText);
        utt.rate = tts.speed || 1.0;
        const found = speechSynthesis.getVoices().find((v) => v.name === tts.voice);
        if (found) utt.voice = found;
        speechSynthesis.speak(utt);
      }
      return;
    }
    if (!tts.apiKey) { alert("API 키를 먼저 입력해주세요."); return; }
    try {
      setAudioProgress("미리듣기 생성 중...");
      const url = await generateTTSAudio(testText, tts.provider, tts.apiKey, tts.voice, tts.model, tts.speed, trackUrl);
      if (url) { const a = new Audio(url); a.play(); }
      setAudioProgress("");
    } catch (err) {
      alert(`음성 생성 실패: ${err.message}`);
      setAudioProgress("");
    }
  };

  // ═══════════════ PLAYBACK ═══════════════
  const playSceneAt = useCallback((index) => {
    const sc = scenesRef.current;
    if (index >= sc.length) {
      playingRef.current = false; setIsPlaying(false);
      currentSceneRef.current = 0; setCurrentScene(0);
      clearInterval(chromeTtsTimerRef.current);
      if (onPlaybackEndRef.current) { onPlaybackEndRef.current(); onPlaybackEndRef.current = null; }
      return;
    }
    currentSceneRef.current = index; setCurrentScene(index);
    const scene = sc[index]; sceneStartRef.current = Date.now();
    const totalDur = sc.reduce((a, s) => a + s.duration, 0);
    const elapsed = sc.slice(0, index).reduce((a, s) => a + s.duration, 0);

    const trackProg = () => {
      if (!playingRef.current) return;
      const se = (Date.now() - sceneStartRef.current) / 1000;
      const total = elapsed + Math.min(se, scene.duration);
      setProgress((total / totalDur) * 100);
      const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
      setTimeDisplay(`${fmt(total)} / ${fmt(totalDur)}`);
      animFrameRef.current = requestAnimationFrame(trackProg);
    };
    trackProg();

    setSubtitleText(scene.narration); setShowSubtitle(true);

    const onEnd = () => {
      setShowSubtitle(false);
      cancelAnimationFrame(animFrameRef.current);
      clearInterval(chromeTtsTimerRef.current);
      if (playingRef.current) setTimeout(() => playSceneAt(index + 1), 500);
    };

    const t = ttsRef.current;

    // ── API-based TTS (pre-generated audio) ──
    if (t.provider !== "browser" && scene.audioUrl) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      const audio = new Audio(scene.audioUrl);
      audioRef.current = audio;
      audio.onended = onEnd;
      audio.onerror = () => { console.warn("Audio play error"); onEnd(); };
      audio.play().catch(() => onEnd());
      return;
    }

    // ── Browser TTS with Chrome 15s bug workaround ──
    if ("speechSynthesis" in window && scene.narration.trim()) {
      speechSynthesis.cancel();
      clearInterval(chromeTtsTimerRef.current);
      const utt = new SpeechSynthesisUtterance(scene.narration);
      utt.rate = t.speed || 1.0; utt.pitch = 1.0;
      const found = speechSynthesis.getVoices().find((v) => v.name === t.voice);
      if (found) utt.voice = found;
      else { const ko = speechSynthesis.getVoices().find((v) => v.lang.startsWith("ko")); if (ko) utt.voice = ko; }
      utt.onboundary = (e) => {
        if (e.charIndex !== undefined) {
          const before = scene.narration.substring(Math.max(0, e.charIndex - 10), e.charIndex);
          const after = scene.narration.substring(e.charIndex, Math.min(scene.narration.length, e.charIndex + 35));
          setSubtitleText(`${before}|${after}`);
        }
      };
      utt.onend = onEnd;
      utt.onerror = () => { clearInterval(chromeTtsTimerRef.current); doFallback(index, scene, t); };
      speechSynthesis.speak(utt);

      // Chrome workaround: pause/resume every 10s to prevent cutoff
      chromeTtsTimerRef.current = setInterval(() => {
        if (speechSynthesis.speaking && !speechSynthesis.paused) {
          speechSynthesis.pause();
          speechSynthesis.resume();
        }
      }, 10000);
      return;
    }

    // ── Fallback ──
    doFallback(index, scene, t);
  }, []);

  const doFallback = (index, scene, t) => {
    setSubtitleText(scene.narration); setShowSubtitle(true);
    setTimeout(() => { setShowSubtitle(false); cancelAnimationFrame(animFrameRef.current); if (playingRef.current) playSceneAt(index + 1); }, scene.duration * 1000);
  };

  const startPlayback = useCallback(() => { playingRef.current = true; setIsPlaying(true); playSceneAt(currentSceneRef.current); }, [playSceneAt]);
  const pausePlayback = useCallback(() => {
    playingRef.current = false; setIsPlaying(false);
    clearInterval(chromeTtsTimerRef.current);
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  const skipScene = (d) => {
    const next = Math.max(0, Math.min(scenesRef.current.length - 1, currentSceneRef.current + d));
    if (playingRef.current) { pausePlayback(); playingRef.current = true; setIsPlaying(true); playSceneAt(next); }
    else { currentSceneRef.current = next; setCurrentScene(next); }
  };

  const seekTo = (e) => {
    const rect = e.currentTarget.getBoundingClientRect(); const sc = scenesRef.current;
    const totalDur = sc.reduce((a, s) => a + s.duration, 0);
    let target = ((e.clientX - rect.left) / rect.width) * totalDur, acc = 0;
    for (let i = 0; i < sc.length; i++) { if (acc + sc[i].duration > target) { skipScene(i - currentSceneRef.current); return; } acc += sc[i].duration; }
  };

  // ═══════════════ RECORDING ═══════════════
  const startRecording = async () => {
    try {
      const ds = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser", width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, audio: true, preferCurrentTab: true });
      displayStreamRef.current = ds;
      ds.getVideoTracks()[0].onended = () => stopRecording();
      setRecStatus("countdown");
      for (let i = 3; i >= 1; i--) { setRecCountdown(i); await new Promise((r) => setTimeout(r, 1000)); }
      recordedChunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
      const rec = new MediaRecorder(ds, { mimeType: mime, videoBitsPerSecond: 5000000 });
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      rec.onstop = () => finishRecording();
      rec.start(100);
      setRecStatus("recording"); recStartTimeRef.current = Date.now();
      recTimerRef.current = setInterval(() => setRecElapsed(Math.floor((Date.now() - recStartTimeRef.current) / 1000)), 500);
      currentSceneRef.current = 0; setCurrentScene(0); setProgress(0);
      onPlaybackEndRef.current = () => setTimeout(() => stopRecording(), 1500);
      playingRef.current = true; setIsPlaying(true);
      setTimeout(() => playSceneAt(0), 300);
    } catch (err) { console.error(err); setRecStatus("idle"); alert("화면 캡처 권한이 필요합니다."); }
  };

  const stopRecording = () => {
    clearInterval(recTimerRef.current);
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    if (displayStreamRef.current) { displayStreamRef.current.getTracks().forEach((t) => t.stop()); displayStreamRef.current = null; }
    pausePlayback(); setRecStatus("processing");
  };

  const finishRecording = () => {
    const ch = recordedChunksRef.current;
    if (!ch.length) { setRecStatus("idle"); return; }
    const blob = new Blob(ch, { type: "video/webm" });
    setLastRecordingBlob(blob);
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = `narration_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}.webm`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setRecStatus("idle"); setRecElapsed(0); recordedChunksRef.current = [];
  };

  // ── MP4 Conversion (FFmpeg.wasm) ──
  const convertToMp4 = async () => {
    if (!lastRecordingBlob) { alert("먼저 녹화를 진행해주세요."); return; }
    setMp4Converting(true);
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util");

      const ffmpeg = new FFmpeg();
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      await ffmpeg.writeFile("input.webm", await fetchFile(lastRecordingBlob));
      await ffmpeg.exec(["-i", "input.webm", "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-c:a", "aac", "-b:a", "128k", "output.mp4"]);
      const data = await ffmpeg.readFile("output.mp4");

      const mp4Blob = new Blob([data], { type: "video/mp4" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(mp4Blob);
      const d = new Date();
      a.download = `narration_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}.mp4`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert("MP4 변환 실패.\n@ffmpeg/ffmpeg 패키지 설치가 필요합니다:\nnpm install @ffmpeg/ffmpeg @ffmpeg/util");
    }
    setMp4Converting(false);
  };

  // ── Helpers ──
  const canPlay = scenes.some((s) => s.visual !== null);
  const hasAudio = tts.provider === "browser" || scenes.some((s) => s.audioUrl !== null);
  const activeBgThemes = bgTheme === "dark" ? BG_THEMES_DARK : BG_THEMES_LIGHT;
  const isLightTheme = bgTheme === "light";

  const renderSubtitle = () => {
    if (!subtitleText) return null;
    if (subtitleText.includes("|")) { const [b, a] = subtitleText.split("|"); return <><span style={{ opacity: 0.5 }}>{b}</span><span style={{ color: "#f0c040", fontWeight: 500 }}>{a}</span></>; }
    return subtitleText;
  };
  const particlesData = useRef(Array.from({ length: 15 }, () => ({ left: `${Math.random() * 100}%`, top: `${50 + Math.random() * 40}%`, delay: `${Math.random() * 5}s`, dur: `${4 + Math.random() * 4}s` }))).current;
  const B = (p) => ({ background: p ? "#f0c040" : "rgba(255,255,255,0.05)", border: p ? "none" : "1px solid rgba(255,255,255,0.08)", color: p ? "#111" : "#ccc", fontFamily: "'Noto Sans KR'", fontSize: p ? 14 : 13, fontWeight: p ? 700 : 400, padding: p ? "9px 30px" : "8px 18px", borderRadius: 7, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6 });
  const SB = (c = "#999") => ({ background: "none", border: `1px solid ${c}33`, color: c, fontSize: 12, padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontFamily: "'Noto Sans KR'" });

  const inputStyle = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#eee", fontFamily: "'Noto Sans KR'", fontSize: 13, padding: "8px 12px", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ fontFamily: "'Noto Sans KR', sans-serif", background: "#08080d", color: "#eee", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=Black+Han+Sans&family=Nanum+Myeongjo:wght@400;700&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes particle { 0%{opacity:0;transform:translateY(60px) scale(0)} 25%{opacity:.35} 75%{opacity:.08} 100%{opacity:0;transform:translateY(-150px) scale(1)} }
        @keyframes spin { to { transform:rotate(360deg) } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.1);opacity:.7} }
        textarea:focus,input:focus { border-color: rgba(240,192,64,0.4) !important; }
        button:active { transform: scale(0.97); }
        input[type=range]::-webkit-slider-thumb { cursor:pointer; }
        .scene-card-drag-over { border-color: rgba(240,192,64,0.5) !important; background: rgba(240,192,64,0.05) !important; }
      `}</style>

      <RecordingOverlay status={recStatus} countdown={recCountdown} elapsed={recElapsed} />

      {/* HEADER */}
      <div style={{ padding: "20px 0 12px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Black Han Sans'", fontSize: 26, color: "#f0c040" }}>📽 나레이션 영상 메이커</div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4, letterSpacing: 1 }}>나레이션 → AI 비주얼 → TTS 음성 → 동영상 녹화</div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", marginBottom: 16 }}>
        {[["editor", "✏️ 대본/음성 설정"], ["player", "▶ 미리보기/녹화"]].map(([m, l]) => (
          <button key={m} onClick={() => { if (m === "player" && !canPlay) return; pausePlayback(); setMode(m); }}
            style={{ padding: "10px 32px", fontSize: 14, fontWeight: mode === m ? 700 : 400, color: mode === m ? "#111" : "#999", background: mode === m ? "#f0c040" : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", fontFamily: "'Noto Sans KR'", opacity: m === "player" && !canPlay ? 0.4 : 1 }}>
            {l}
          </button>
        ))}
      </div>

      {/* ════════ EDITOR ════════ */}
      {mode === "editor" && (
        <div style={{ width: 900, maxWidth: "95vw", paddingBottom: 40 }}>
          {/* Anthropic API Key */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "16px 24px", marginBottom: 16 }}>
            <div style={{ fontSize: 14, color: "#f0c040", fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              🔑 Anthropic API 키 <span style={{ fontSize: 10, color: "#666", fontWeight: 400 }}>(비주얼 생성용)</span>
            </div>
            <input type="password" style={inputStyle} placeholder="sk-ant-..." value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} />
            <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>console.anthropic.com → API Keys</div>
          </div>

          {/* TTS Settings */}
          <TTSSettings tts={tts} setTts={setTts} onPreview={previewTTS} />

          {/* Theme Toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: "#888" }}>영상 배경:</span>
            {[["dark", "🌙 어두운"], ["light", "☀️ 밝은"]].map(([key, label]) => (
              <button key={key} onClick={() => setBgTheme(key)}
                style={{ padding: "6px 16px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Sans KR'", transition: "all 0.15s", background: bgTheme === key ? "rgba(240,192,64,0.12)" : "rgba(255,255,255,0.03)", border: bgTheme === key ? "1px solid rgba(240,192,64,0.3)" : "1px solid rgba(255,255,255,0.06)", color: bgTheme === key ? "#f0c040" : "#888" }}>
                {label}
              </button>
            ))}
          </div>

          {(generating || audioGenerating) && (
            <div style={{ padding: "10px 16px", background: "rgba(240,192,64,0.06)", border: "1px solid rgba(240,192,64,0.15)", borderRadius: 8, fontSize: 13, color: "#f0c040", marginBottom: 12, textAlign: "center" }}>
              ⏳ {genProgress || audioProgress || "처리 중..."}
            </div>
          )}

          {/* Bulk Import Toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => setShowBulkImport(!showBulkImport)}
              style={{ ...SB("#f0c040"), fontSize: 13, padding: "8px 18px" }}>
              {showBulkImport ? "✕ 닫기" : "📋 대본 일괄 가져오기"}
            </button>
          </div>

          {showBulkImport && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "20px 24px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#f0c040", fontWeight: 700, marginBottom: 8 }}>📋 대본 일괄 가져오기</div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 10 }}>빈 줄 또는 "---"로 씬을 구분합니다. 기존 씬은 모두 대체됩니다.</div>
              <textarea style={{ ...inputStyle, minHeight: 150, resize: "vertical", fontSize: 13, lineHeight: 1.7 }}
                value={bulkText} onChange={(e) => setBulkText(e.target.value)}
                placeholder={"첫 번째 씬의 나레이션을 여기에 입력합니다.\n\n두 번째 씬의 나레이션입니다.\n빈 줄로 구분합니다.\n\n---\n\n세 번째 씬도 --- 로 구분 가능합니다."} />
              <button onClick={importBulk}
                style={{ marginTop: 10, width: "100%", padding: "10px", background: "#f0c040", border: "none", borderRadius: 6, color: "#111", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Noto Sans KR'" }}>
                가져오기 ({bulkText.split(/\n\s*\n|\n---\n/).filter((p) => p.trim()).length}개 씬)
              </button>
            </div>
          )}

          {/* Scene Cards */}
          {scenes.map((scene, idx) => (
            <div key={scene.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              className={dragOverIdx === idx ? "scene-card-drag-over" : ""}
              style={{
                background: dragIdx === idx ? "rgba(240,192,64,0.06)" : "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10, padding: "20px 24px", marginBottom: 12,
                opacity: dragIdx === idx ? 0.6 : 1,
                transition: "all 0.15s", cursor: "grab",
              }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16, color: "#555", cursor: "grab" }} title="드래그로 순서 변경">⠿</span>
                  <span style={{ fontSize: 13, color: "#f0c040", fontWeight: 700, letterSpacing: 1 }}>SCENE {idx + 1}</span>
                  <span style={{ fontSize: 11, color: "#555" }}>
                    {scene.narration.length}자 · 약 {estimateTime(scene.narration)}초
                  </span>
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {scene.audioUrl && <span style={{ fontSize: 11, color: "#50d080", marginRight: 4 }}>🔊 음성</span>}
                  {scene.visual && <span style={{ fontSize: 11, color: "#50d080", marginRight: 4 }}>🎨 비주얼</span>}
                  <button style={SB("#50d080")} onClick={() => previewSceneTTS(scene)} title="이 씬만 음성 미리듣기">▶</button>
                  <button style={SB("#888")} onClick={() => copyScene(scene)} title="씬 복사">📋</button>
                  <button style={SB("#888")} onClick={() => moveScene(idx, -1)} disabled={idx === 0}>↑</button>
                  <button style={SB("#888")} onClick={() => moveScene(idx, 1)} disabled={idx === scenes.length - 1}>↓</button>
                  <button style={SB("#e05555")} onClick={() => removeScene(scene.id)}>삭제</button>
                </div>
              </div>
              <textarea style={{ width: "100%", minHeight: 80, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#eee", fontFamily: "'Noto Sans KR'", fontSize: 14, padding: "10px 14px", resize: "vertical", lineHeight: 1.7, outline: "none", boxSizing: "border-box" }}
                value={scene.narration} onChange={(e) => updateNarration(scene.id, e.target.value)} placeholder="나레이션을 입력하세요..."
                onDragStart={(e) => e.stopPropagation()} draggable={false} />

              {/* Visual preview + edit */}
              {scene.visual && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ padding: "10px 14px", background: "rgba(240,192,64,0.04)", border: "1px solid rgba(240,192,64,0.1)", borderRadius: 6, fontSize: 12, color: "#aaa", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ color: "#f0c040", fontWeight: 700 }}>[{scene.visual.type}]</span> {scene.visual.heading}
                      {scene.visual.keywords?.length > 0 && <span style={{ color: "#888" }}> — {scene.visual.keywords.join(", ")}</span>}
                    </div>
                    <button style={SB("#f0c040")} onClick={() => setEditingVisualId(editingVisualId === scene.id ? null : scene.id)}>
                      {editingVisualId === scene.id ? "접기" : "✏️ 편집"}
                    </button>
                  </div>
                  {editingVisualId === scene.id && (
                    <VisualEditor
                      visual={scene.visual}
                      onSave={(v) => updateVisual(scene.id, v)}
                      onCancel={() => setEditingVisualId(null)}
                    />
                  )}
                </div>
              )}
            </div>
          ))}

          <button onClick={addScene} style={{ width: "100%", padding: 14, background: "rgba(255,255,255,0.02)", border: "2px dashed rgba(255,255,255,0.1)", borderRadius: 10, color: "#666", fontSize: 14, cursor: "pointer", fontFamily: "'Noto Sans KR'", marginBottom: 12 }}>
            + 새 장면 추가
          </button>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={generateVisuals} disabled={generating}
              style={{ flex: 1, padding: 14, background: generating ? "#555" : "#f0c040", border: "none", borderRadius: 10, color: "#111", fontSize: 14, fontWeight: 700, cursor: generating ? "not-allowed" : "pointer", fontFamily: "'Noto Sans KR'" }}>
              {generating ? "🔄 생성 중..." : "🎨 1단계: AI 비주얼 생성"}
            </button>
          </div>
          <button onClick={generateAllAudio} disabled={audioGenerating || !canPlay}
            style={{ width: "100%", padding: 14, background: (!canPlay || audioGenerating) ? "#333" : "rgba(240,192,64,0.15)", border: "1px solid rgba(240,192,64,0.3)", borderRadius: 10, color: (!canPlay || audioGenerating) ? "#666" : "#f0c040", fontSize: 14, fontWeight: 700, cursor: (!canPlay || audioGenerating) ? "not-allowed" : "pointer", fontFamily: "'Noto Sans KR'" }}>
            {audioGenerating ? `🔄 ${audioProgress}` : tts.provider === "browser" ? "🔊 2단계: 미리보기로 이동 →" : "🔊 2단계: 음성 생성 → 미리보기"}
          </button>
        </div>
      )}

      {/* ════════ PLAYER ════════ */}
      {mode === "player" && (
        <div style={{ width: 960, maxWidth: "95vw" }}>
          {/* TTS Provider Badge */}
          <div style={{ textAlign: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "#555", background: "rgba(255,255,255,0.03)", padding: "4px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
              음성: {TTS_PROVIDERS[tts.provider].name} {tts.provider !== "browser" && tts.voice && `· ${TTS_PROVIDERS[tts.provider].voices.find((v) => v.id === tts.voice)?.name || tts.voice}`}
            </span>
          </div>

          <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: isLightTheme ? "#f5f5f0" : "#111118", borderRadius: 12, overflow: "hidden", boxShadow: "0 20px 80px rgba(0,0,0,0.6)" }}>
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
              {particlesData.map((p, i) => <div key={i} style={{ position: "absolute", width: 2.5, height: 2.5, background: isLightTheme ? "#b8860b" : "#f0c040", borderRadius: "50%", left: p.left, top: p.top, opacity: 0, animation: `particle ${p.dur} ease-in-out ${p.delay} infinite` }} />)}
            </div>
            <div style={{ position: "absolute", top: 14, right: 18, fontSize: 11, color: isLightTheme ? "#aaa" : "#555", letterSpacing: 1, zIndex: 10 }}>SCENE {currentScene + 1} / {scenes.length}</div>

            {scenes.map((scene, idx) => (
              <div key={scene.id} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 60px 80px", opacity: idx === currentScene ? 1 : 0, transform: idx === currentScene ? "scale(1)" : "scale(1.05)", transition: "opacity 0.8s, transform 0.8s", pointerEvents: idx === currentScene ? "auto" : "none", background: activeBgThemes[idx % activeBgThemes.length] }}>
                <SceneVisual visual={scene.visual} lightTheme={isLightTheme} />
              </div>
            ))}

            <div style={{ position: "absolute", bottom: 44, left: "50%", transform: "translateX(-50%)", background: isLightTheme ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)", color: isLightTheme ? "#333" : "#fff", fontSize: 17, padding: "9px 26px", borderRadius: 7, textAlign: "center", maxWidth: "82%", opacity: showSubtitle ? 1 : 0, transition: "opacity 0.3s", zIndex: 50, lineHeight: 1.5, border: `1px solid ${isLightTheme ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)"}` }}>
              {renderSubtitle()}
            </div>

            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: "rgba(255,255,255,0.08)", zIndex: 100, cursor: "pointer" }} onClick={seekTo}>
              <div style={{ height: "100%", width: `${progress}%`, background: "#f0c040", transition: "width 0.15s linear", boxShadow: "0 0 8px rgba(240,192,64,0.4)" }} />
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button style={B(false)} onClick={() => skipScene(-1)}>⏮ 이전</button>
            <button style={B(true)} onClick={() => isPlaying ? pausePlayback() : startPlayback()}>{isPlaying ? "⏸ 일시정지" : "▶ 재생"}</button>
            <button style={B(false)} onClick={() => skipScene(1)}>다음 ⏭</button>
            <span style={{ fontSize: 12, color: "#666", fontVariantNumeric: "tabular-nums", marginLeft: 8 }}>{timeDisplay}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            {recStatus === "idle" && <button style={{ ...B(false), background: "rgba(255,50,50,0.1)", border: "1px solid rgba(255,50,50,0.25)", color: "#ff6666" }} onClick={startRecording}>🔴 동영상 녹화</button>}
            {recStatus === "recording" && <button style={{ ...B(false), background: "rgba(255,50,50,0.15)", border: "1px solid rgba(255,50,50,0.3)", color: "#ff4444" }} onClick={stopRecording}>⏹ 녹화 중지</button>}
            {lastRecordingBlob && recStatus === "idle" && (
              <button style={{ ...B(false), background: "rgba(100,150,255,0.1)", border: "1px solid rgba(100,150,255,0.25)", color: "#88aaff" }}
                onClick={convertToMp4} disabled={mp4Converting}>
                {mp4Converting ? "⏳ MP4 변환 중..." : "🎬 MP4로 변환"}
              </button>
            )}
            <button style={B(false)} onClick={() => { pausePlayback(); setMode("editor"); }}>✏️ 편집으로</button>
          </div>

          <div style={{ marginTop: 16, padding: "14px 18px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "#666", lineHeight: 1.8 }}>
            <div style={{ color: "#f0c040", fontWeight: 700, marginBottom: 4, fontSize: 13 }}>💡 녹화 가이드</div>
            <div>"녹화 시작" → <strong style={{ color: "#aaa" }}>"이 탭"</strong> 선택 + <strong style={{ color: "#aaa" }}>"탭 오디오 공유"</strong> 체크</div>
            <div>카운트다운 후 자동 재생 → 끝나면 WebM 자동 저장</div>
            <div>녹화 후 "MP4로 변환" 버튼으로 MP4 파일 생성 가능 (ffmpeg.wasm 필요)</div>
            {tts.provider !== "browser" && <div style={{ color: "#f0c040" }}>⚠️ 외부 TTS 사용 시 "탭 오디오 공유"를 반드시 체크해야 음성이 녹음됩니다</div>}
          </div>
        </div>
      )}
    </div>
  );
}
