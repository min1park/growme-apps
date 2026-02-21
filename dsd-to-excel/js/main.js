/**
 * DSD → Excel 변환기 - 메인 UI 로직
 */

document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileNameSpan = document.getElementById('fileName');
    const fileSizeSpan = document.getElementById('fileSize');
    const progressArea = document.getElementById('progressArea');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const resultArea = document.getElementById('resultArea');
    const resultIcon = document.getElementById('resultIcon');
    const resultTitle = document.getElementById('resultTitle');
    const resultDetail = document.getElementById('resultDetail');
    const resultButtons = document.getElementById('resultButtons');
    const sheetSummary = document.getElementById('sheetSummary');

    let lastBlob = null;
    let lastFilename = '';

    // ========================================================================
    // 드래그 앤 드롭
    // ========================================================================

    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleFile(fileInput.files[0]);
        }
    });

    // ========================================================================
    // 파일 처리
    // ========================================================================

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    async function handleFile(file) {
        // 파일 확장자 체크
        if (!file.name.toLowerCase().endsWith('.dsd')) {
            showError('DSD 파일(.dsd)만 업로드할 수 있습니다.');
            return;
        }

        // UI 초기화
        resetResult();
        showFileInfo(file);
        showProgress();
        dropZone.classList.add('disabled');

        try {
            const arrayBuffer = await file.arrayBuffer();

            const { workbook, coverInfo } = await convertDsdToExcel(arrayBuffer, (msg) => {
                updateProgress(msg);
            });

            // 워크북을 버퍼로 변환
            updateProgress('Excel 파일 생성 중...');
            const buffer = await workbook.xlsx.writeBuffer();

            // Blob 생성
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });

            lastBlob = blob;
            lastFilename = file.name.replace(/\.dsd$/i, '.xlsx');

            // 시트 정보
            const sheetNames = workbook.worksheets.map(ws => ws.name);

            // 자동 다운로드
            downloadBlob(blob, lastFilename);

            // 성공 표시
            showSuccess(lastFilename, sheetNames, coverInfo);

        } catch (err) {
            console.error('변환 에러:', err);
            showError(err.message || '변환 중 오류가 발생했습니다.');
        } finally {
            dropZone.classList.remove('disabled');
        }
    }

    // ========================================================================
    // 다운로드
    // ========================================================================

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    // ========================================================================
    // UI 상태 관리
    // ========================================================================

    function showFileInfo(file) {
        fileNameSpan.textContent = file.name;
        fileSizeSpan.textContent = formatFileSize(file.size);
        fileInfo.classList.add('visible');
    }

    function showProgress() {
        progressArea.classList.add('visible');
        progressBar.classList.add('indeterminate');
        progressText.textContent = '변환 시작 중...';
        resultArea.classList.remove('visible');
    }

    function updateProgress(msg) {
        progressText.textContent = msg;
    }

    function hideProgress() {
        progressArea.classList.remove('visible');
        progressBar.classList.remove('indeterminate');
    }

    function resetResult() {
        resultArea.classList.remove('visible', 'success', 'error');
        resultButtons.innerHTML = '';
        sheetSummary.textContent = '';
    }

    function showSuccess(filename, sheetNames, coverInfo) {
        hideProgress();
        resultArea.classList.add('visible', 'success');
        resultIcon.textContent = '\u2705';
        resultTitle.textContent = '변환 완료!';

        let detail = `${filename} (${sheetNames.length}개 시트)`;
        if (coverInfo && coverInfo.companyName) {
            detail = `${coverInfo.companyName} - ${detail}`;
        }
        resultDetail.textContent = detail;

        // 버튼
        resultButtons.innerHTML = '';

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn btn-primary';
        downloadBtn.textContent = '\uD83D\uDCE5 다시 다운로드';
        downloadBtn.addEventListener('click', () => {
            if (lastBlob) downloadBlob(lastBlob, lastFilename);
        });
        resultButtons.appendChild(downloadBtn);

        const resetBtn = document.createElement('button');
        resetBtn.className = 'btn btn-secondary';
        resetBtn.textContent = '\uD83D\uDD04 새 파일 변환';
        resetBtn.addEventListener('click', () => {
            resetAll();
        });
        resultButtons.appendChild(resetBtn);

        // 시트 목록
        sheetSummary.textContent = '시트: ' + sheetNames.join(', ');
    }

    function showError(message) {
        hideProgress();
        resultArea.classList.add('visible', 'error');
        resultIcon.textContent = '\u274C';
        resultTitle.textContent = '변환 실패';
        resultDetail.textContent = message;

        resultButtons.innerHTML = '';
        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn btn-secondary';
        retryBtn.textContent = '\uD83D\uDD04 다시 시도';
        retryBtn.addEventListener('click', () => {
            resetAll();
        });
        resultButtons.appendChild(retryBtn);

        sheetSummary.textContent = '';
    }

    function resetAll() {
        resetResult();
        hideProgress();
        fileInfo.classList.remove('visible');
        fileInput.value = '';
        lastBlob = null;
        lastFilename = '';
    }
});
