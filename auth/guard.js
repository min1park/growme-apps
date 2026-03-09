// GrowMe Apps - 비밀번호 보호 가드
// 보호할 앱의 <head>에 config.js와 함께 포함하세요.
(function () {
    var config = window.AUTH_CONFIG;
    if (!config || !config.passwordHash || !config.protectedApps || config.protectedApps.length === 0) return;

    // 현재 경로가 보호 대상인지 확인
    var currentPath = window.location.pathname;
    var isProtected = false;
    for (var i = 0; i < config.protectedApps.length; i++) {
        if (currentPath.indexOf(config.protectedApps[i]) !== -1) {
            isProtected = true;
            break;
        }
    }
    if (!isProtected) return;

    // 유효 월 확인
    var now = new Date();
    var currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    if (config.validMonth !== currentMonth) {
        // 비밀번호 만료 → 로그인 페이지로 (만료 표시)
        var returnUrl = encodeURIComponent(window.location.href);
        window.location.replace('/auth/login.html?expired=1&return=' + returnUrl);
        return;
    }

    // 이미 인증되었는지 확인 (localStorage)
    var authKey = 'growme_auth_' + config.validMonth;
    if (localStorage.getItem(authKey) === config.passwordHash) return;

    // 인증 필요 → 로그인 페이지로 리다이렉트
    var returnUrl = encodeURIComponent(window.location.href);
    window.location.replace('/auth/login.html?return=' + returnUrl);
})();
