import { useState, useRef, useCallback, useEffect } from "react";

// ─── SCENE VISUAL TYPES & BACKGROUNDS ──────────────────────────
const BG_THEMES = [
  "linear-gradient(135deg, #0d1117 0%, #161b22 40%, #1a1025 100%)",
  "linear-gradient(160deg, #0f1923 0%, #101820 50%, #0a1015 100%)",
  "linear-gradient(140deg, #12100a 0%, #1a150d 50%, #0f0d08 100%)",
  "linear-gradient(150deg, #0a0f17 0%, #0e1520 50%, #080c12 100%)",
  "linear-gradient(145deg, #110a0a 0%, #1a1010 50%, #0f0808 100%)",
  "linear-gradient(130deg, #0a110d 0%, #101a15 50%, #080f0c 100%)",
];

const SCENE_PROMPT = `당신은 교육 영상의 씬 비주얼 디자이너입니다. 나레이션 텍스트를 분석하여 적절한 화면 구성을 JSON으로 반환하세요.

반드시 아래 JSON 형식만 출력하세요. 마크다운 백틱이나 설명 없이 순수 JSON만 출력하세요.

{
  "type": "intro|content|example|list|quote|closing",
  "heading": "화면에 표시할 메인 제목 (짧게, 10자 이내)",
  "subheading": "부제목 또는 보조 설명 (선택사항, 없으면 빈 문자열)",
  "body": "본문 텍스트 (나레이션의 핵심을 요약. HTML <br> 태그로 줄바꿈 가능)",
  "keywords": ["핵심키워드1", "핵심키워드2"],
  "examples": [
    {"wrong": "틀린 예", "correct": "맞는 예", "explanation": "설명"}
  ],
  "badge": "채널명이나 라벨 (인트로/클로징에만)"
}

규칙:
1. type 결정 기준:
   - "intro": 영상 시작, 주제 소개
   - "content": 개념 설명, 원칙 설명
   - "example": 구체적 예시, 비교, 맞다/틀리다
   - "list": 여러 항목 나열
   - "quote": 인용구, 명언, 법조문
   - "closing": 영상 마무리, 구독 유도
2. heading은 임팩트 있게 짧게
3. keywords는 나레이션에서 강조할 단어 2-4개
4. examples는 type이 "example"일 때만 채우고, 나머지는 빈 배열
5. body에서 keywords에 해당하는 단어는 그대로 두세요 (프론트에서 하이라이트 처리)
6. badge는 type이 "intro"나 "closing"일 때만`;

// ─── VISUAL RENDERER ───────────────────────────────────────────
function SceneVisual({ visual }) {
  if (!visual) return null;
  const { type, heading, subheading, body, keywords = [], examples = [], badge } = visual;

  const kwStyle = { display: "inline", background: "rgba(240,192,64,0.13)", color: "#f0c040", padding: "1px 10px", borderRadius: 5, fontWeight: 500, border: "1px solid rgba(240,192,64,0.18)" };

  const highlightKeywords = (text) => {
    if (!text || !keywords.length) return text;
    let result = text;
    keywords.forEach((k) => { result = result.replace(new RegExp(`(${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "g"), `<kw>$1</kw>`); });
    return result.split(/(<kw>.*?<\/kw>)/g).map((part, i) => {
      const m = part.match(/<kw>(.*?)<\/kw>/);
      if (m) return <span key={i} style={kwStyle}>{m[1]}</span>;
      return <span key={i} dangerouslySetInnerHTML={{ __html: part }} />;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", animation: "fadeUp 0.7s ease both" }}>
      {heading && <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: type === "intro" || type === "closing" ? 48 : 38, color: "#f0c040", textShadow: "0 0 40px rgba(240,192,64,0.25)", textAlign: "center", lineHeight: 1.3, marginBottom: 8 }}>{heading}</div>}
      {subheading && <div style={{ fontFamily: "'Nanum Myeongjo', serif", fontSize: 18, color: "#777", letterSpacing: 3, textAlign: "center", marginTop: 8 }}>{subheading}</div>}
      {badge && <div style={{ display: "inline-block", border: "1px solid rgba(200,152,26,0.5)", color: "#f0c040", fontSize: 12, padding: "5px 16px", borderRadius: 20, marginTop: 20, letterSpacing: 2, opacity: 0.7 }}>{badge}</div>}
      {type !== "quote" && body && <div style={{ fontSize: 20, lineHeight: 1.9, color: "#ddd", textAlign: "center", maxWidth: 650, fontWeight: 300, marginTop: 20 }}>{highlightKeywords(body)}</div>}

      {type === "example" && examples.map((ex, i) => (
        <div key={i} style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "18px 26px", margin: "6px 0", width: "100%", maxWidth: 560, textAlign: "left", fontSize: 18, lineHeight: 1.7, animation: `fadeUp 0.6s ease ${0.2 + i * 0.15}s both` }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 4, letterSpacing: 1 }}>예시 {i + 1}</div>
          <span style={{ color: "#e05555", textDecoration: "line-through", opacity: 0.7 }}>{ex.wrong}</span>
          <span style={{ color: "#555", margin: "0 8px" }}>→</span>
          <span style={{ color: "#50d080", fontWeight: 500 }}>{ex.correct}</span>
          {ex.explanation && <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{ex.explanation}</div>}
        </div>
      ))}

      {type === "list" && keywords.length > 0 && (
        <div style={{ marginTop: 16, textAlign: "left", maxWidth: 500, width: "100%" }}>
          {keywords.map((k, i) => (
            <div key={i} style={{ padding: "10px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, marginBottom: 6, fontSize: 18, color: "#ddd", animation: `fadeUp 0.5s ease ${0.1 + i * 0.1}s both`, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#f0c040", fontWeight: 700, fontSize: 14 }}>●</span> {k}
            </div>
          ))}
        </div>
      )}

      {type === "quote" && body && (
        <div style={{ marginTop: 16, padding: "24px 32px", borderLeft: "3px solid #f0c040", background: "rgba(240,192,64,0.04)", borderRadius: "0 8px 8px 0", maxWidth: 560, fontStyle: "italic", fontSize: 20, lineHeight: 1.8, color: "#ccc" }}>
          {highlightKeywords(body)}
        </div>
      )}
    </div>
  );
}

// ─── RECORDING OVERLAY ─────────────────────────────────────────
function RecordingOverlay({ status, countdown, elapsed }) {
  if (status === "idle") return null;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  if (status === "countdown") return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ fontSize: 14, color: "#f0c040", letterSpacing: 3, marginBottom: 20 }}>녹화 준비</div>
      <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 120, color: "#f0c040", textShadow: "0 0 60px rgba(240,192,64,0.4)", animation: "pulse 1s ease infinite" }}>{countdown}</div>
      <div style={{ fontSize: 14, color: "#666", marginTop: 20 }}>잠시 후 녹화가 시작됩니다</div>
    </div>
  );

  if (status === "recording") return (
    <div style={{ position: "fixed", top: 16, right: 20, display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.75)", padding: "8px 16px", borderRadius: 8, zIndex: 9999, border: "1px solid rgba(255,0,0,0.3)" }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff3333", animation: "blink 1s ease infinite" }} />
      <span style={{ fontSize: 13, color: "#ff6666", fontWeight: 700 }}>REC</span>
      <span style={{ fontSize: 12, color: "#999", fontVariantNumeric: "tabular-nums" }}>{fmt(elapsed)}</span>
    </div>
  );

  if (status === "processing") return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ width: 40, height: 40, border: "3px solid rgba(240,192,64,0.2)", borderTopColor: "#f0c040", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontSize: 16, color: "#f0c040", marginTop: 20 }}>영상 파일 생성 중...</div>
    </div>
  );
  return null;
}

// ─── MAIN APP ──────────────────────────────────────────────────
export default function NarrationVideoApp() {
  const [mode, setMode] = useState("editor");
  const [scenes, setScenes] = useState([
    { id: 1, narration: "띄어쓰기, 왜 중요할까요? 우리가 매일 쓰는 한글, 하지만 띄어쓰기는 늘 헷갈립니다. 오늘은 이 문제를 깔끔하게 정리해 보겠습니다.", visual: null, duration: 10 },
    { id: 2, narration: "한글 맞춤법 제2항에 따르면, 문장의 각 단어는 띄어 씀을 원칙으로 합니다. 다만 조사는 그 앞 단어에 붙여 씁니다. 이것이 가장 기본적인 원칙입니다.", visual: null, duration: 12 },
    { id: 3, narration: "자주 틀리는 예시를 볼까요? 첫 번째, '그때 부터'는 틀린 표현입니다. '부터'는 조사이므로 '그때부터'로 붙여 써야 합니다. 두 번째, '할수있다'도 틀립니다. '수'는 의존명사이므로 '할 수 있다'로 띄어 써야 합니다.", visual: null, duration: 16 },
    { id: 4, narration: "핵심 구분법을 알려드리겠습니다. 조사는 앞 단어에 붙여 쓰고, 의존명사는 앞 단어와 띄어 씁니다. 이 두 가지만 기억하면, 띄어쓰기의 80퍼센트는 해결할 수 있습니다.", visual: null, duration: 14 },
    { id: 5, narration: "오늘도 한 걸음 성장했습니다. 이 영상이 도움이 되셨다면, 구독과 좋아요 부탁드립니다. 다음 영상에서 만나요!", visual: null, duration: 9 },
  ]);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState("");
  const [currentScene, setCurrentScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [subtitleText, setSubtitleText] = useState("");
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [timeDisplay, setTimeDisplay] = useState("0:00 / 0:00");
  const [nextId, setNextId] = useState(6);
  const [recStatus, setRecStatus] = useState("idle");
  const [recCountdown, setRecCountdown] = useState(3);
  const [recElapsed, setRecElapsed] = useState(0);

  const playingRef = useRef(false);
  const currentSceneRef = useRef(0);
  const animFrameRef = useRef(null);
  const sceneStartRef = useRef(0);
  const playerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const displayStreamRef = useRef(null);
  const recStartTimeRef = useRef(0);
  const recTimerRef = useRef(null);
  const scenesRef = useRef(scenes);
  const speechRateRef = useRef(speechRate);
  const onPlaybackEndRef = useRef(null);

  useEffect(() => { scenesRef.current = scenes; }, [scenes]);
  useEffect(() => { speechRateRef.current = speechRate; }, [speechRate]);

  // ── Editor ──
  const updateNarration = (id, text) => setScenes((p) => p.map((s) => s.id === id ? { ...s, narration: text, visual: null } : s));
  const addScene = () => { setScenes((p) => [...p, { id: nextId, narration: "", visual: null, duration: 8 }]); setNextId((n) => n + 1); };
  const removeScene = (id) => setScenes((p) => p.length <= 1 ? p : p.filter((s) => s.id !== id));
  const moveScene = (i, d) => setScenes((p) => { const a = [...p]; const t = i + d; if (t < 0 || t >= a.length) return p; [a[i], a[t]] = [a[t], a[i]]; return a; });

  // ── Claude API ──
  const generateVisuals = async () => {
    setGenerating(true);
    const updated = [...scenes];
    for (let i = 0; i < updated.length; i++) {
      const s = updated[i];
      if (!s.narration.trim()) continue;
      setGenProgress(`씬 ${i + 1}/${updated.length} 생성 중...`);
      const posHint = i === 0 ? "\n이 씬은 영상의 첫 번째 장면(인트로)입니다." : i === updated.length - 1 ? "\n이 씬은 영상의 마지막 장면(클로징)입니다." : `\n이 씬은 영상의 ${i + 1}번째 장면입니다(전체 ${updated.length}개 중).`;
      try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: `나레이션:\n"${s.narration}"${posHint}\n\n위 나레이션에 맞는 화면 비주얼을 JSON으로 생성하세요.` }], system: SCENE_PROMPT }),
        });
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

  // ═══════════════ PLAYBACK ═══════════════
  const playSceneAt = useCallback((index) => {
    const sc = scenesRef.current;
    if (index >= sc.length) {
      playingRef.current = false; setIsPlaying(false);
      currentSceneRef.current = 0; setCurrentScene(0);
      if (onPlaybackEndRef.current) { onPlaybackEndRef.current(); onPlaybackEndRef.current = null; }
      return;
    }
    currentSceneRef.current = index; setCurrentScene(index);
    const scene = sc[index]; sceneStartRef.current = Date.now();
    const rate = speechRateRef.current;
    const totalDur = sc.reduce((a, s) => a + s.duration, 0);
    const elapsed = sc.slice(0, index).reduce((a, s) => a + s.duration, 0);
    const trackProg = () => {
      if (!playingRef.current) return;
      const se = ((Date.now() - sceneStartRef.current) / 1000) * rate;
      const total = elapsed + Math.min(se, scene.duration);
      setProgress((total / totalDur) * 100);
      const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
      setTimeDisplay(`${fmt(total)} / ${fmt(totalDur)}`);
      animFrameRef.current = requestAnimationFrame(trackProg);
    };
    trackProg();

    if ("speechSynthesis" in window && scene.narration.trim()) {
      speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(scene.narration);
      utt.rate = rate; utt.pitch = 1.0;
      const voices = speechSynthesis.getVoices();
      const koVoice = voices.find((v) => v.lang.startsWith("ko"));
      if (koVoice) utt.voice = koVoice;
      utt.onstart = () => { setSubtitleText(scene.narration); setShowSubtitle(true); };
      utt.onboundary = (e) => {
        if (e.charIndex !== undefined) {
          const before = scene.narration.substring(Math.max(0, e.charIndex - 10), e.charIndex);
          const after = scene.narration.substring(e.charIndex, Math.min(scene.narration.length, e.charIndex + 35));
          setSubtitleText(`${before}|${after}`);
        }
      };
      utt.onend = () => { setShowSubtitle(false); cancelAnimationFrame(animFrameRef.current); if (playingRef.current) setTimeout(() => playSceneAt(index + 1), 500); };
      utt.onerror = () => doFallback(index, scene);
      speechSynthesis.speak(utt);
    } else {
      doFallback(index, scene);
    }
  }, []);

  const doFallback = (index, scene) => {
    setSubtitleText(scene.narration); setShowSubtitle(true);
    setTimeout(() => { setShowSubtitle(false); cancelAnimationFrame(animFrameRef.current); if (playingRef.current) playSceneAt(index + 1); }, (scene.duration / speechRateRef.current) * 1000);
  };

  const startPlayback = useCallback(() => { playingRef.current = true; setIsPlaying(true); playSceneAt(currentSceneRef.current); }, [playSceneAt]);
  const pausePlayback = useCallback(() => { playingRef.current = false; setIsPlaying(false); if ("speechSynthesis" in window) speechSynthesis.cancel(); cancelAnimationFrame(animFrameRef.current); }, []);

  const skipScene = (d) => {
    const next = Math.max(0, Math.min(scenesRef.current.length - 1, currentSceneRef.current + d));
    if (playingRef.current) { if ("speechSynthesis" in window) speechSynthesis.cancel(); cancelAnimationFrame(animFrameRef.current); playSceneAt(next); }
    else { currentSceneRef.current = next; setCurrentScene(next); }
  };

  const seekTo = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sc = scenesRef.current; const totalDur = sc.reduce((a, s) => a + s.duration, 0);
    let target = ((e.clientX - rect.left) / rect.width) * totalDur, acc = 0;
    for (let i = 0; i < sc.length; i++) {
      if (acc + sc[i].duration > target) {
        if (playingRef.current) { if ("speechSynthesis" in window) speechSynthesis.cancel(); cancelAnimationFrame(animFrameRef.current); playSceneAt(i); }
        else { currentSceneRef.current = i; setCurrentScene(i); }
        return;
      }
      acc += sc[i].duration;
    }
  };

  // ═══════════════ RECORDING ═══════════════
  const startRecording = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser", width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: true,
        preferCurrentTab: true,
      });
      displayStreamRef.current = displayStream;
      displayStream.getVideoTracks()[0].onended = () => stopRecording();

      // Countdown
      setRecStatus("countdown");
      for (let i = 3; i >= 1; i--) { setRecCountdown(i); await new Promise((r) => setTimeout(r, 1000)); }

      // MediaRecorder
      recordedChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
      const recorder = new MediaRecorder(displayStream, { mimeType, videoBitsPerSecond: 5000000 });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = () => finishRecording();
      recorder.start(100);

      setRecStatus("recording");
      recStartTimeRef.current = Date.now();
      recTimerRef.current = setInterval(() => setRecElapsed(Math.floor((Date.now() - recStartTimeRef.current) / 1000)), 500);

      // Reset & play
      currentSceneRef.current = 0; setCurrentScene(0); setProgress(0);
      onPlaybackEndRef.current = () => setTimeout(() => stopRecording(), 1500);
      playingRef.current = true; setIsPlaying(true);
      setTimeout(() => playSceneAt(0), 300);
    } catch (err) {
      console.error(err); setRecStatus("idle");
      alert("화면 캡처 권한이 필요합니다.\n'이 탭'을 선택하고, '탭 오디오도 공유'를 체크해주세요.");
    }
  };

  const stopRecording = () => {
    clearInterval(recTimerRef.current);
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    if (displayStreamRef.current) { displayStreamRef.current.getTracks().forEach((t) => t.stop()); displayStreamRef.current = null; }
    pausePlayback(); setRecStatus("processing");
  };

  const finishRecording = () => {
    const chunks = recordedChunksRef.current;
    if (!chunks.length) { setRecStatus("idle"); return; }
    const blob = new Blob(chunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const d = new Date();
    a.download = `narration_video_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}_${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}.webm`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setRecStatus("idle"); setRecElapsed(0); recordedChunksRef.current = [];
  };

  // ── Helpers ──
  const canPlay = scenes.some((s) => s.visual !== null);
  const renderSubtitle = () => {
    if (!subtitleText) return null;
    if (subtitleText.includes("|")) {
      const [before, after] = subtitleText.split("|");
      return <><span style={{ opacity: 0.5 }}>{before}</span><span style={{ color: "#f0c040", fontWeight: 500 }}>{after}</span></>;
    }
    return subtitleText;
  };

  const particlesData = useRef(Array.from({ length: 15 }, () => ({
    left: `${Math.random() * 100}%`, top: `${50 + Math.random() * 40}%`,
    delay: `${Math.random() * 5}s`, dur: `${4 + Math.random() * 4}s`,
  }))).current;

  const B = (primary) => ({
    background: primary ? "#f0c040" : "rgba(255,255,255,0.05)", border: primary ? "none" : "1px solid rgba(255,255,255,0.08)",
    color: primary ? "#111" : "#ccc", fontFamily: "'Noto Sans KR', sans-serif", fontSize: primary ? 14 : 13,
    fontWeight: primary ? 700 : 400, padding: primary ? "9px 30px" : "8px 18px", borderRadius: 7, cursor: "pointer",
    transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6,
  });

  const SB = (c = "#999") => ({ background: "none", border: `1px solid ${c}33`, color: c, fontSize: 12, padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontFamily: "'Noto Sans KR', sans-serif" });

  return (
    <div style={{ fontFamily: "'Noto Sans KR', sans-serif", background: "#08080d", color: "#eee", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=Black+Han+Sans&family=Nanum+Myeongjo:wght@400;700&display=swap');
        @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes particle { 0% { opacity: 0; transform: translateY(60px) scale(0); } 25% { opacity: 0.35; } 75% { opacity: 0.08; } 100% { opacity: 0; transform: translateY(-150px) scale(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.7; } }
        textarea:focus { border-color: rgba(240,192,64,0.4) !important; }
        button:active { transform: scale(0.97); }
      `}</style>

      <RecordingOverlay status={recStatus} countdown={recCountdown} elapsed={recElapsed} />

      {/* HEADER */}
      <div style={{ padding: "20px 0 12px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 26, color: "#f0c040" }}>📽 나레이션 영상 메이커</div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4, letterSpacing: 1 }}>나레이션 입력 → AI 비주얼 생성 → 동영상 녹화/저장</div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", marginBottom: 16 }}>
        {[["editor", "✏️ 대본 편집"], ["player", "▶ 미리보기/녹화"]].map(([m, label]) => (
          <button key={m} onClick={() => { if (m === "player" && !canPlay) return; pausePlayback(); setMode(m); }}
            style={{ padding: "10px 32px", fontSize: 14, fontWeight: mode === m ? 700 : 400, color: mode === m ? "#111" : "#999", background: mode === m ? "#f0c040" : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", fontFamily: "'Noto Sans KR', sans-serif", opacity: m === "player" && !canPlay ? 0.4 : 1 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ════════ EDITOR ════════ */}
      {mode === "editor" && (
        <div style={{ width: 900, maxWidth: "95vw", paddingBottom: 40 }}>
          {generating && <div style={{ padding: "10px 16px", background: "rgba(240,192,64,0.06)", border: "1px solid rgba(240,192,64,0.15)", borderRadius: 8, fontSize: 13, color: "#f0c040", marginBottom: 12, textAlign: "center" }}>⏳ {genProgress || "생성 중..."}</div>}

          {scenes.map((scene, idx) => (
            <div key={scene.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "20px 24px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#f0c040", fontWeight: 700, letterSpacing: 1 }}>SCENE {idx + 1}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button style={SB("#888")} onClick={() => moveScene(idx, -1)} disabled={idx === 0}>↑</button>
                  <button style={SB("#888")} onClick={() => moveScene(idx, 1)} disabled={idx === scenes.length - 1}>↓</button>
                  <button style={SB("#e05555")} onClick={() => removeScene(scene.id)}>삭제</button>
                </div>
              </div>
              <textarea style={{ width: "100%", minHeight: 80, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#eee", fontFamily: "'Noto Sans KR', sans-serif", fontSize: 14, padding: "10px 14px", resize: "vertical", lineHeight: 1.7, outline: "none" }}
                value={scene.narration} onChange={(e) => updateNarration(scene.id, e.target.value)} placeholder="나레이션을 입력하세요..." />
              {scene.visual && (
                <div style={{ marginTop: 10, padding: "12px 16px", background: "rgba(240,192,64,0.04)", border: "1px solid rgba(240,192,64,0.1)", borderRadius: 6, fontSize: 12, color: "#aaa" }}>
                  <span style={{ color: "#f0c040", fontWeight: 700 }}>[{scene.visual.type}]</span> <span style={{ color: "#bbb" }}>{scene.visual.heading}</span>
                  {scene.visual.keywords?.length > 0 && <span style={{ color: "#888" }}> — {scene.visual.keywords.join(", ")}</span>}
                  <span style={{ color: "#555", marginLeft: 8 }}>✅</span>
                </div>
              )}
            </div>
          ))}

          <button onClick={addScene} style={{ width: "100%", padding: 14, background: "rgba(255,255,255,0.02)", border: "2px dashed rgba(255,255,255,0.1)", borderRadius: 10, color: "#666", fontSize: 14, cursor: "pointer", fontFamily: "'Noto Sans KR', sans-serif", marginBottom: 16 }}>
            + 새 장면 추가
          </button>
          <button onClick={generateVisuals} disabled={generating}
            style={{ width: "100%", padding: 16, background: generating ? "#888" : "#f0c040", border: "none", borderRadius: 10, color: "#111", fontSize: 16, fontWeight: 700, cursor: generating ? "not-allowed" : "pointer", fontFamily: "'Noto Sans KR', sans-serif", boxShadow: "0 4px 24px rgba(240,192,64,0.3)" }}>
            {generating ? "🔄 생성 중..." : "🤖 AI 비주얼 자동 생성 → 미리보기"}
          </button>
        </div>
      )}

      {/* ════════ PLAYER ════════ */}
      {mode === "player" && (
        <div style={{ width: 960, maxWidth: "95vw" }}>
          <div ref={playerRef} style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: "#111118", borderRadius: 12, overflow: "hidden", boxShadow: "0 20px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)" }}>
            {/* Particles */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
              {particlesData.map((p, i) => <div key={i} style={{ position: "absolute", width: 2.5, height: 2.5, background: "#f0c040", borderRadius: "50%", left: p.left, top: p.top, opacity: 0, animation: `particle ${p.dur} ease-in-out ${p.delay} infinite` }} />)}
            </div>

            <div style={{ position: "absolute", top: 14, right: 18, fontSize: 11, color: "#555", letterSpacing: 1, zIndex: 10 }}>SCENE {currentScene + 1} / {scenes.length}</div>

            {scenes.map((scene, idx) => (
              <div key={scene.id} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 60px 80px", opacity: idx === currentScene ? 1 : 0, transform: idx === currentScene ? "scale(1)" : "scale(1.05)", transition: "opacity 0.8s ease, transform 0.8s ease", pointerEvents: idx === currentScene ? "auto" : "none", background: BG_THEMES[idx % BG_THEMES.length] }}>
                <SceneVisual visual={scene.visual} />
              </div>
            ))}

            <div style={{ position: "absolute", bottom: 44, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)", color: "#fff", fontSize: 17, padding: "9px 26px", borderRadius: 7, textAlign: "center", maxWidth: "82%", opacity: showSubtitle ? 1 : 0, transition: "opacity 0.3s", zIndex: 50, lineHeight: 1.5, border: "1px solid rgba(255,255,255,0.06)" }}>
              {renderSubtitle()}
            </div>

            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: "rgba(255,255,255,0.08)", zIndex: 100, cursor: "pointer" }} onClick={seekTo}>
              <div style={{ height: "100%", width: `${progress}%`, background: "#f0c040", transition: "width 0.15s linear", boxShadow: "0 0 8px rgba(240,192,64,0.4)" }} />
            </div>
          </div>

          {/* Row 1: Playback */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button style={B(false)} onClick={() => setSpeechRate((r) => Math.max(0.5, +(r - 0.1).toFixed(1)))}>🐢</button>
            <span style={{ fontSize: 12, color: "#777", minWidth: 40, textAlign: "center" }}>{speechRate.toFixed(1)}×</span>
            <button style={B(false)} onClick={() => setSpeechRate((r) => Math.min(2.0, +(r + 0.1).toFixed(1)))}>🐇</button>
            <button style={B(false)} onClick={() => skipScene(-1)}>⏮ 이전</button>
            <button style={B(true)} onClick={() => isPlaying ? pausePlayback() : startPlayback()}>{isPlaying ? "⏸ 일시정지" : "▶ 재생"}</button>
            <button style={B(false)} onClick={() => skipScene(1)}>다음 ⏭</button>
            <span style={{ fontSize: 12, color: "#666", fontVariantNumeric: "tabular-nums", marginLeft: 8 }}>{timeDisplay}</span>
          </div>

          {/* Row 2: Recording */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            {recStatus === "idle" && (
              <button style={{ ...B(false), background: "rgba(255,50,50,0.1)", border: "1px solid rgba(255,50,50,0.25)", color: "#ff6666" }} onClick={startRecording}>
                🔴 동영상 녹화 시작
              </button>
            )}
            {recStatus === "recording" && (
              <button style={{ ...B(false), background: "rgba(255,50,50,0.15)", border: "1px solid rgba(255,50,50,0.3)", color: "#ff4444" }} onClick={stopRecording}>
                ⏹ 녹화 중지 & 저장
              </button>
            )}
            <button style={B(false)} onClick={() => { pausePlayback(); setMode("editor"); }}>✏️ 편집으로</button>
          </div>

          {/* Recording Guide */}
          <div style={{ marginTop: 16, padding: "16px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "#666", lineHeight: 1.8 }}>
            <div style={{ color: "#f0c040", fontWeight: 700, marginBottom: 6, fontSize: 13 }}>💡 녹화 가이드</div>
            <div>1. <strong style={{ color: "#aaa" }}>"동영상 녹화 시작"</strong> 클릭 → 브라우저에서 <strong style={{ color: "#aaa" }}>"이 탭"</strong> 선택</div>
            <div>2. <strong style={{ color: "#aaa" }}>"탭 오디오도 공유"</strong>를 반드시 체크 → TTS 음성이 녹음됩니다</div>
            <div>3. 3초 카운트다운 후 자동으로 처음부터 재생 & 녹화가 시작됩니다</div>
            <div>4. 모든 씬이 끝나면 <strong style={{ color: "#aaa" }}>WebM 파일로 자동 다운로드</strong> / 수동 중지도 가능</div>
            <div>5. WebM → MP4 변환: <span style={{ color: "#f0c040" }}>CloudConvert.com</span> 또는 <span style={{ color: "#f0c040" }}>FFmpeg</span> (무료)</div>
          </div>
        </div>
      )}
    </div>
  );
}
