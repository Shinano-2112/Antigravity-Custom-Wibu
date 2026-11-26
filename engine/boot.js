window.__AGY_LAZY_BOOT__ = function(ctx, forceReplay = false) {
  const {
    BOOT_ASSETS,
    escapeHtml,
    hashBootPasscode,
    resolveBootOperator,
    getState,
    applyTheme,
    resolveMediaUrl,
    sanitizeCssUrl,
    clearBootTimers,
    stopBootAudio,
    teardownBootOverlay,
    scheduleRevealWhenReady,
  } = ctx;
  function mountBootSequence(forceReplay = false) {
    const st = getState();
    if (!forceReplay && !st.bootIntro) {
      return;
    }
    window.__AGY_BOOT_PLAYED__ = true;
    teardownBootOverlay();

    const operatorDisplay = resolveBootOperator(st).toUpperCase();
    let storedPassHash = String(st.bootPassHash || '').trim();
    let hasPass = Boolean(storedPassHash);
    let passVerified = false;
    let confirming = false;
    let failedAttempts = 0;

    const starfieldUrl = sanitizeCssUrl(resolveMediaUrl(BOOT_ASSETS.starfieldBg || 'assets/starfield-boot-bg.jpg'));
    const iconColorUrl = resolveMediaUrl(BOOT_ASSETS.agyColorIcon || 'assets/agy-icon-color.png');
    const voiceUrls = {
      1: resolveMediaUrl(BOOT_ASSETS.voice1 || 'assets/voice/tawa_voice1.mp3'),
      2: resolveMediaUrl(BOOT_ASSETS.voice2 || 'assets/voice/tawa_voice2.mp3'),
      3: resolveMediaUrl(BOOT_ASSETS.voice3 || 'assets/voice/tawa_voice3.mp3'),
      4: resolveMediaUrl(BOOT_ASSETS.voice4 || 'assets/voice/tawa_voice4.mp3')
    };

    const bootStyle = document.createElement('style');
    bootStyle.id = 'agy-boot-styles';
    bootStyle.textContent = `
      #agy-boot-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        background: #000000;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 22px 30px;
        font-family: ui-monospace, 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace;
        color: #f4f4f5;
        overflow: hidden;
        transition: background-color 0.6s ease, opacity 0.65s ease;
        user-select: none;
      }
      #agy-boot-overlay.hud-mode { background: #050507; }
      #agy-boot-overlay.done { opacity: 0; pointer-events: none; }
      #agy-boot-overlay.done.instant { display: none; transition: none; }

      #agy-boot-overlay .agy-boot-starfield {
        position: absolute;
        inset: -8px;
        z-index: 0;
        background: url("${starfieldUrl}") center center / cover no-repeat;
        filter: blur(1.2px) brightness(0.62) contrast(1.08);
        opacity: 0;
        transition: opacity 0.85s ease;
        pointer-events: none;
      }
      #agy-boot-overlay.hud-mode .agy-boot-starfield { opacity: 0.55; }
      #agy-boot-overlay .agy-boot-vignette {
        position: absolute;
        inset: 0;
        z-index: 0;
        background: radial-gradient(circle at 50% 48%, rgba(4,4,6,0.25) 20%, rgba(4,4,6,0.74) 100%);
        opacity: 0;
        transition: opacity 0.85s ease;
        pointer-events: none;
      }
      #agy-boot-overlay.hud-mode .agy-boot-vignette { opacity: 1; }
      #agy-boot-overlay .agy-splash-sheen {
        position: absolute;
        inset: -30%;
        z-index: 3;
        pointer-events: none;
        transform: translateX(-85%);
        background: linear-gradient(112deg, transparent 38%, rgba(255,255,255,0.06) 48%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.05) 52%, transparent 62%);
      }
      #agy-boot-overlay .agy-splash-sheen.run { animation: agyDiagSheen 1.25s cubic-bezier(0.25,0.1,0.25,1) forwards; }
      @keyframes agyDiagSheen { from { transform: translateX(-85%); } to { transform: translateX(85%); } }

      #agy-boot-overlay .agy-hud-scanline {
        position: absolute; left: 0; right: 0; height: 46px; z-index: 4; pointer-events: none; opacity: 0;
        background: linear-gradient(180deg, transparent, rgba(255,255,255,0.08), transparent);
      }
      #agy-boot-overlay .agy-hud-scanline.sweep { animation: agyHudScan 0.85s ease-out forwards; }
      @keyframes agyHudScan {
        0% { top: 8%; opacity: 0; }
        25% { opacity: 1; }
        100% { top: 92%; opacity: 0; }
      }

      #agy-flash-curtain {
        position: fixed;
        inset: 0;
        z-index: 2147483001;
        pointer-events: none;
        opacity: 0;
        background: radial-gradient(circle at 82% 85%, rgba(255,255,255,0.96) 0%, rgba(212,212,216,0.78) 48%, rgba(161,161,170,0.55) 100%);
      }
      #agy-flash-curtain.burst { animation: agyFlashBurst 1.15s cubic-bezier(0.22,1,0.36,1) forwards; }
      @keyframes agyFlashBurst { 0% { opacity: 0; } 28% { opacity: 0.92; } 100% { opacity: 0; } }

      #agy-boot-overlay .agy-boot-header,
      #agy-boot-overlay .agy-boot-footer {
        position: relative; z-index: 5; display: flex; justify-content: space-between;
        font-size: 10.5px; letter-spacing: 0.14em; color: #71717a; opacity: 0; transition: opacity 0.45s ease;
      }
      #agy-boot-overlay .agy-boot-header { align-items: flex-start; }
      #agy-boot-overlay .agy-boot-footer { align-items: center; padding-bottom: 18px; }
      #agy-boot-overlay.hud-mode .agy-boot-header,
      #agy-boot-overlay.hud-mode .agy-boot-footer { opacity: 1; }

      #agy-boot-overlay .agy-boot-brand { display: flex; flex-direction: column; gap: 3px; }
      #agy-boot-overlay .agy-boot-brand strong {
        font-size: 14px; color: #ffffff; letter-spacing: 0.16em;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-weight: 700;
      }
      #agy-boot-overlay .agy-boot-brand .sub-line { font-size: 9px; color: #71717a; letter-spacing: 0.22em; }
      #agy-boot-overlay .agy-boot-rev { margin-top: 10px; font-size: 9.5px; color: #52525b; display: flex; align-items: center; gap: 8px; }
      #agy-boot-overlay .agy-boot-rev .blue-rev { color: #60a5fa; }

      #agy-boot-overlay .agy-boot-skip {
        cursor: pointer; background: transparent; border: none; color: #71717a;
        padding: 4px 8px; font-family: inherit; font-size: 10.5px; letter-spacing: 0.16em; transition: color 0.15s ease;
      }
      #agy-boot-overlay .agy-boot-skip:hover { color: #ffffff; }
      #agy-boot-overlay .agy-boot-skip.locked { visibility: hidden; pointer-events: none; }

      #agy-boot-overlay .agy-boot-stage-wrap {
        position: relative; z-index: 5; flex: 1; display: flex; align-items: center; justify-content: center;
      }
      #agy-boot-overlay .agy-boot-stage {
        display: none; flex-direction: column; align-items: center; text-align: center; max-width: 560px; width: 100%;
      }
      #agy-boot-overlay .agy-boot-stage.active { display: flex; }

      #agy-boot-overlay .agy-stagger-char {
        display: inline-block; opacity: 0; transform: translateY(2px); filter: blur(1.5px);
        animation: agyCharFadeIn 0.24s cubic-bezier(0.22,1,0.36,1) forwards;
      }
      #agy-boot-overlay .agy-stagger-space { display: inline-block; width: 0.32em; }
      @keyframes agyCharFadeIn { to { opacity: 1; transform: translateY(0); filter: blur(0); } }
      #agy-boot-overlay .wipe-out { opacity: 0; transition: opacity 0.28s ease; }
      #agy-boot-overlay .stage-fade-out { opacity: 0 !important; transform: scale(1.06); transition: opacity 0.58s ease, transform 0.58s cubic-bezier(0.22,1,0.36,1); }
      #agy-boot-overlay .agy-welcome-reveal { opacity: 0; transform: translateY(6px); animation: agyWelcomeIn 0.48s cubic-bezier(0.22,1,0.36,1) forwards; }
      @keyframes agyWelcomeIn { to { opacity: 1; transform: translateY(0); } }

      #agy-boot-overlay .agy-splash-logo {
        width: 68px; height: 68px; object-fit: contain; margin-bottom: 16px; opacity: 0;
        filter: drop-shadow(0 0 22px rgba(255,255,255,0.18)); animation: agySplashFade 2.5s ease forwards;
      }
      #agy-boot-overlay .agy-splash-wordmark {
        font-family: 'Segoe UI', system-ui, sans-serif; font-size: 15px; font-weight: 700; letter-spacing: 0.42em;
        color: #ffffff; margin-bottom: 5px; opacity: 0; animation: agySplashFade 2.5s ease 0.15s forwards;
      }
      #agy-boot-overlay .agy-splash-caption {
        font-size: 9px; letter-spacing: 0.36em; color: #71717a; opacity: 0; animation: agySplashFade 2.5s ease 0.25s forwards;
      }
      @keyframes agySplashFade {
        0% { opacity: 0; transform: scale(0.95); }
        20% { opacity: 1; transform: scale(1); }
        76% { opacity: 1; }
        100% { opacity: 0; }
      }

      #agy-boot-overlay .agy-hud-title {
        font-family: 'Segoe UI', system-ui, sans-serif; font-size: 26px; font-weight: 400; letter-spacing: 0.22em; color: #f4f4f5;
      }
      #agy-boot-overlay .agy-hud-subtitle { font-size: 10.5px; letter-spacing: 0.38em; color: #8c8c94; margin-bottom: 30px; }
      #agy-boot-overlay .agy-hud-btn {
        position: relative; overflow: hidden; cursor: pointer; background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.34); color: #e4e4e7; padding: 9px 26px;
        font-family: inherit; font-size: 11px; letter-spacing: 0.2em; transition: border-color 0.2s ease, color 0.2s ease;
      }
      #agy-boot-overlay .agy-hud-btn::before {
        content: ''; position: absolute; inset: 0; background: #ffffff; transform: scaleX(0); transform-origin: left center;
        transition: transform 0.28s cubic-bezier(0.22,1,0.36,1); z-index: 0;
      }
      #agy-boot-overlay .agy-hud-btn span { position: relative; z-index: 1; }
      #agy-boot-overlay .agy-hud-btn:hover::before,
      #agy-boot-overlay .agy-hud-btn.triggered::before { transform: scaleX(1); }
      #agy-boot-overlay .agy-hud-btn:hover,
      #agy-boot-overlay .agy-hud-btn.triggered { color: #000000; border-color: #ffffff; }
      #agy-boot-overlay .agy-hud-btn-row { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; }
      #agy-boot-overlay .agy-hud-btn.agy-hud-btn-ghost { border-color: rgba(255,255,255,0.16); color: #a1a1aa; padding: 9px 18px; }
      #agy-boot-overlay .agy-hud-hint { margin-top: 12px; font-size: 9.5px; color: #52525b; letter-spacing: 0.14em; transition: color 0.2s ease; }
      #agy-boot-overlay .agy-hud-hint.error { color: #f87171; }
      #agy-boot-overlay .agy-hud-hint.ok { color: #86efac; }
      #agy-boot-overlay .agy-rekey-trigger {
        margin-top: 12px; background: transparent; border: none; border-bottom: 1px solid transparent;
        color: #71717a; font-family: inherit; font-size: 9.5px; letter-spacing: 0.16em;
        padding: 3px 6px; cursor: pointer; transition: color 0.18s ease, border-color 0.18s ease;
      }
      #agy-boot-overlay .agy-rekey-trigger:hover { color: #f4f4f5; border-bottom-color: rgba(255,255,255,0.35); }
      #agy-boot-overlay .agy-rekey-trigger.hidden { display: none; }

      #agy-boot-overlay .agy-id-table { width: 290px; max-width: 90vw; padding: 12px 0; margin-bottom: 22px; display: flex; flex-direction: column; gap: 7px; font-size: 10.5px; }
      #agy-boot-overlay .agy-id-table.agy-id-table-wide { width: 320px; }
      #agy-boot-overlay .agy-match-status { color: #71717a !important; font-weight: 600; letter-spacing: 0.14em; transition: color 0.18s ease; }
      #agy-boot-overlay .agy-match-status.ok { color: #86efac !important; }
      #agy-boot-overlay .agy-match-status.warn { color: #fbbf24 !important; }
      #agy-boot-overlay .agy-match-status.err { color: #f87171 !important; }
      #agy-boot-overlay .agy-id-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      #agy-boot-overlay .agy-id-row > span:first-child { color: #52525b; letter-spacing: 0.14em; white-space: nowrap; }
      #agy-boot-overlay .agy-id-row > span:last-child { color: #f4f4f5; font-weight: 600; letter-spacing: 0.16em; }
      #agy-boot-overlay .agy-id-row-pass { cursor: text; }
      #agy-boot-overlay .agy-pass-input,
      #agy-boot-overlay .agy-pass-input:hover,
      #agy-boot-overlay .agy-pass-input:focus,
      #agy-boot-overlay .agy-pass-input:focus-visible,
      #agy-boot-overlay .agy-pass-input:active {
        flex: 1; min-width: 60px; width: 100%;
        background: transparent !important;
        background-color: transparent !important;
        border: 0 none transparent !important;
        outline: 0 none transparent !important;
        outline-offset: 0 !important;
        box-shadow: none !important;
        -webkit-appearance: none !important;
        appearance: none !important;
        border-radius: 0 !important;
        padding: 0 2px 0 0 !important;
        margin: 0 !important;
        color: #f4f4f5;
        font-family: inherit;
        font-size: 10.5px;
        font-weight: 600;
        letter-spacing: 0.2em;
        text-align: right;
        caret-color: #f4f4f5;
        user-select: text;
        line-height: 1.4;
      }
      #agy-boot-overlay .agy-pass-input.error {
        color: #f87171;
        caret-color: #f87171;
      }
      #agy-boot-overlay .agy-pass-input.verified {
        color: #60a5fa;
      }
      #agy-boot-overlay .agy-pass-input::-ms-reveal,
      #agy-boot-overlay .agy-pass-input::-ms-clear { display: none !important; }
      @keyframes agyPassShake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-6px); }
        40% { transform: translateX(6px); }
        60% { transform: translateX(-4px); }
        80% { transform: translateX(4px); }
      }
      #agy-boot-overlay .agy-id-row-pass.shake { animation: agyPassShake 0.34s ease; }

      #agy-boot-overlay .agy-icon-morph-box { position: relative; width: 112px; height: 112px; margin: 8px 0 14px; display: flex; align-items: center; justify-content: center; }
      #agy-boot-overlay .agy-icon-outline-svg { position: absolute; inset: 0; width: 100%; height: 100%; transition: opacity 0.45s ease; }
      #agy-boot-overlay .agy-icon-outline-svg.fade-stroke { opacity: 0; }
      #agy-boot-overlay .agy-icon-outline-path { fill: none; stroke: url(#agyBootStrokeGrad); stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 6px rgba(255,255,255,0.28)); }
      #agy-boot-overlay .agy-icon-outline-path.trace { animation: agyTraceOutline 1.05s cubic-bezier(0.35,0.05,0.25,1) forwards; }
      @keyframes agyTraceOutline { to { stroke-dashoffset: 0; } }
      #agy-boot-overlay .agy-icon-color-fill {
        position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: fill;
        clip-path: inset(85% 0 0 0); opacity: 0;
        transition: clip-path 1.05s cubic-bezier(0.35,0.05,0.25,1), opacity 0.12s ease, filter 0.45s ease;
      }
      #agy-boot-overlay .agy-icon-color-fill.filled { clip-path: inset(13% 0 0 0); opacity: 1; filter: drop-shadow(0 0 14px rgba(59,130,246,0.28)); }

      #agy-boot-overlay .agy-dot-grid-small { font-size: 10px; letter-spacing: 0.48em; color: #52525b; line-height: 1.8; }
      #agy-boot-overlay .agy-hex-column {
        position: absolute; right: 36px; top: 50%; transform: translateY(-50%); font-size: 9.5px; line-height: 1.85;
        color: rgba(255,255,255,0.24); letter-spacing: 0.16em; text-align: right; pointer-events: none; opacity: 0; transition: opacity 0.3s ease;
      }
      #agy-boot-overlay .agy-hex-column.visible { opacity: 1; }

      #agy-boot-overlay .agy-verify-ring-stage { position: relative; width: 390px; height: 390px; display: flex; align-items: center; justify-content: center; }
      #agy-boot-overlay .agy-arc-svg { position: absolute; inset: 0; width: 100%; height: 100%; animation: agySpinCW 4.2s linear infinite; }
      #agy-boot-overlay .agy-arc-svg-inner { position: absolute; inset: 28px; width: calc(100% - 56px); height: calc(100% - 56px); animation: agySpinCCW 5.5s linear infinite; }
      #agy-boot-overlay .agy-orbit-dots { position: absolute; inset: 42px; border-radius: 50%; animation: agySpinCW 3.4s linear infinite; }
      #agy-boot-overlay .agy-orbit-dot { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #60a5fa; }
      #agy-boot-overlay .agy-orbit-dot.w { background: #ffffff; width: 3px; height: 3px; }
      @keyframes agySpinCW { to { transform: rotate(360deg); } }
      @keyframes agySpinCCW { to { transform: rotate(-360deg); } }

      #agy-boot-overlay .agy-welcome-eyebrow { font-size: 16px; font-weight: 700; letter-spacing: 0.26em; color: #f4f4f5; margin-bottom: 10px; }
      #agy-boot-overlay .agy-welcome-solid-box {
        background: #ffffff; color: #050505; padding: 4px 18px; font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 17px; font-weight: 800; letter-spacing: 0.16em; margin-bottom: 22px; box-shadow: 0 0 28px rgba(255,255,255,0.22);
      }
      #agy-boot-overlay .agy-welcome-flare-wrap { position: relative; width: 260px; height: 58px; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
      #agy-boot-overlay .agy-welcome-flare-wrap img { width: 46px; height: 46px; object-fit: contain; position: relative; z-index: 2; }

      #agy-boot-overlay .agy-bottom-progress-track {
        position: absolute; left: 50%; transform: translateX(-50%); width: 33.33vw; max-width: 440px;
        bottom: 4px; height: 2px; background: rgba(255,255,255,0.12);
      }
      #agy-boot-overlay .agy-bottom-progress-bar { width: 0%; height: 100%; background: #ffffff; transition: width 0.55s cubic-bezier(0.22,1,0.36,1); }
      #agy-boot-overlay .agy-eq-bars { display: inline-flex; align-items: flex-end; gap: 2px; height: 11px; margin-right: 10px; }
      #agy-boot-overlay .agy-eq-bars span { width: 2px; background: #60a5fa; animation: agyEqPulse 0.9s ease-in-out infinite alternate; }
      #agy-boot-overlay .agy-eq-bars span:nth-child(2) { animation-delay: 0.2s; }
      #agy-boot-overlay .agy-eq-bars span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes agyEqPulse { from { height: 3px; opacity: 0.45; } to { height: 11px; opacity: 1; } }
    `;
    document.head.appendChild(bootStyle);

    const flashCurtain = document.createElement('div');
    flashCurtain.id = 'agy-flash-curtain';
    document.body.appendChild(flashCurtain);

    const overlay = document.createElement('section');
    overlay.id = 'agy-boot-overlay';
    overlay.setAttribute('aria-label', 'Boot Sequence');
    overlay.innerHTML = `
      <div class="agy-boot-starfield"></div>
      <div class="agy-boot-vignette"></div>
      <div class="agy-splash-sheen" id="agy-splash-sheen"></div>
      <div class="agy-hud-scanline" id="agy-hud-scanline"></div>

      <header class="agy-boot-header">
        <div class="agy-boot-brand">
          <strong>ANTIGRAVITY</strong>
          <span class="sub-line">SYNTHESIZE INTELLIGENCE</span>
          <div class="agy-boot-rev">
            <span>REV 0.1.9</span>
            <span>•</span>
            <span class="blue-rev" id="agy-hud-clock">WEB PROFILE 00:00:00</span>
          </div>
        </div>
        <button class="agy-boot-skip${hasPass ? ' locked' : ''}" id="agy-boot-skip" type="button">SKIP ▸</button>
      </header>

      <div class="agy-boot-stage-wrap">
        <div class="agy-boot-stage active" id="agy-stage-0">
          <img class="agy-splash-logo" id="agy-splash-logo" src="${iconColorUrl}" alt="Antigravity" />
          <div class="agy-splash-wordmark">ANTIGRAVITY</div>
          <div class="agy-splash-caption">SYNTHESIZE INTELLIGENCE</div>
        </div>

        <div class="agy-boot-stage" id="agy-stage-1">
          <div style="margin-bottom:6px"><span class="agy-hud-title" data-stagger="26">YÊU CẦU QUYỀN TRUY CẬP</span></div>
          <div class="agy-hud-subtitle" data-stagger="14">ACCESS PERMISSION REQUIRED</div>
          <button class="agy-hud-btn" id="agy-btn-grant" type="button">
            <span>CẤP QUYỀN &nbsp; GRANT ACCESS</span>
          </button>
          <div class="agy-hud-hint">Nhấn Enter / Space hoặc bấm nút để tiếp tục</div>
        </div>

        <div class="agy-boot-stage" id="agy-stage-2">
          <div style="margin-bottom:6px"><span class="agy-hud-title" data-stagger="26">XÁC MINH DANH TÍNH</span></div>
          <div class="agy-hud-subtitle" data-stagger="14">IDENTITY VERIFICATION</div>
          <div class="agy-id-table">
            <div class="agy-id-row"><span>TÊN TRUY CẬP / OPERATOR</span><span id="agy-boot-operator-val">${escapeHtml(operatorDisplay)}</span></div>
            <div class="agy-id-row agy-id-row-pass" id="agy-boot-pass-row">
              <span>MÃ ĐỊNH DANH / UID</span>
              <input id="agy-boot-pass-input" class="agy-pass-input" type="password" autocomplete="off" spellcheck="false" aria-label="Passcode" />
            </div>
            <div class="agy-id-row"><span>CẤP QUYỀN / LEVEL</span><span>∞</span></div>
          </div>
          <button class="agy-hud-btn" id="agy-btn-confirm" type="button">
            <span id="agy-btn-confirm-label">${hasPass ? 'XÁC NHẬN &nbsp; CONFIRM IDENTITY' : 'LƯU &amp; XÁC NHẬN &nbsp; SET PASSCODE'}</span>
          </button>
          <div class="agy-hud-hint" id="agy-boot-pass-hint">${hasPass ? 'Nhập mật khẩu rồi nhấn Enter hoặc bấm nút để xác nhận' : 'Chưa đặt mật khẩu • Nhập mật khẩu mới rồi nhấn Enter để lưu &amp; vào'}</div>
          <button class="agy-rekey-trigger${hasPass ? '' : ' hidden'}" id="agy-btn-rekey-open" type="button">↻ ĐỔI MÃ ĐỊNH DANH · REKEY UID</button>
        </div>

        <div class="agy-boot-stage" id="agy-stage-rekey-a">
          <div style="margin-bottom:6px"><span class="agy-hud-title" data-stagger="24">XÁC THỰC QUYỀN ĐỔI MÃ</span></div>
          <div class="agy-hud-subtitle" data-stagger="14">AUTHORIZE REKEY</div>
          <div class="agy-id-table agy-id-table-wide">
            <div class="agy-id-row"><span>TÊN TRUY CẬP / OPERATOR</span><span>${escapeHtml(operatorDisplay)}</span></div>
            <div class="agy-id-row agy-id-row-pass" id="agy-rekey-cur-row">
              <span>MÃ HIỆN TẠI / CURRENT</span>
              <input id="agy-rekey-cur-input" class="agy-pass-input" type="password" autocomplete="off" spellcheck="false" aria-label="Current Passcode" />
            </div>
            <div class="agy-id-row"><span>CẤP QUYỀN / LEVEL</span><span>∞</span></div>
          </div>
          <div class="agy-hud-btn-row">
            <button class="agy-hud-btn" id="agy-btn-rekey-next" type="button">
              <span>TIẾP TỤC &nbsp; VERIFY KEY</span>
            </button>
            <button class="agy-hud-btn agy-hud-btn-ghost" id="agy-btn-rekey-cancel-a" type="button">
              <span>HỦY &nbsp; ESC</span>
            </button>
          </div>
          <div class="agy-hud-hint" id="agy-rekey-a-hint">Nhập mật khẩu hiện tại rồi nhấn Enter để sang bước đặt mã mới • Esc để quay lại</div>
        </div>

        <div class="agy-boot-stage" id="agy-stage-rekey-b">
          <div style="margin-bottom:6px"><span class="agy-hud-title" data-stagger="24">THIẾT LẬP MÃ MỚI</span></div>
          <div class="agy-hud-subtitle" data-stagger="14">ISSUE NEW UID</div>
          <div class="agy-id-table agy-id-table-wide">
            <div class="agy-id-row agy-id-row-pass" id="agy-rekey-new-row">
              <span>MÃ MỚI / NEW UID</span>
              <input id="agy-rekey-new-input" class="agy-pass-input" type="password" autocomplete="off" spellcheck="false" aria-label="New Passcode" />
            </div>
            <div class="agy-id-row agy-id-row-pass" id="agy-rekey-cfm-row">
              <span>NHẬP LẠI / CONFIRM</span>
              <input id="agy-rekey-cfm-input" class="agy-pass-input" type="password" autocomplete="off" spellcheck="false" aria-label="Confirm New Passcode" />
            </div>
            <div class="agy-id-row">
              <span>TRẠNG THÁI / SYNC</span>
              <span id="agy-rekey-match-status" class="agy-match-status">AWAITING INPUT</span>
            </div>
          </div>
          <div class="agy-hud-btn-row">
            <button class="agy-hud-btn" id="agy-btn-rekey-save" type="button">
              <span>LƯU &amp; VÀO &nbsp; UPDATE KEY</span>
            </button>
            <button class="agy-hud-btn agy-hud-btn-ghost" id="agy-btn-rekey-cancel-b" type="button">
              <span>HỦY &nbsp; ESC</span>
            </button>
          </div>
          <div class="agy-hud-hint" id="agy-rekey-b-hint">Nhập mã mới rồi Enter sang ô xác nhận • Giữ Alt để soi nhanh • Esc để hủy</div>
        </div>

        <div class="agy-boot-stage" id="agy-stage-morph">
          <div style="margin-bottom:6px"><span class="agy-hud-title" id="agy-morph-title" data-stagger="16">ĐANG TIẾP NHẬN YÊU CẦU</span></div>
          <div class="agy-hud-subtitle" id="agy-morph-sub" data-stagger="10" style="margin-bottom:10px">ACCESS REQUEST RECEIVED</div>
          <div class="agy-icon-morph-box">
            <svg class="agy-icon-outline-svg" id="agy-icon-outline-svg" viewBox="0 0 256 256">
              <defs>
                <linearGradient id="agyBootStrokeGrad" x1="10%" y1="90%" x2="88%" y2="12%">
                  <stop offset="0%" stop-color="#3b82f6" />
                  <stop offset="38%" stop-color="#22c55e" />
                  <stop offset="68%" stop-color="#f59e0b" />
                  <stop offset="86%" stop-color="#ef4444" />
                  <stop offset="100%" stop-color="#3b82f6" />
                </linearGradient>
              </defs>
              <path
                id="agy-boot-outline-path"
                class="agy-icon-outline-path"
                d="M 116.50,42.00 Q 111.00,44.00 105.00,49.50 Q 99.00,55.00 94.00,64.00 Q 89.00,73.00 74.50,119.50 Q 60.00,166.00 53.50,178.00 Q 47.00,190.00 40.00,198.00 Q 33.00,206.00 32.50,209.00 Q 32.00,212.00 34.00,213.50 Q 36.00,215.00 39.00,215.00 Q 42.00,215.00 49.00,211.00 Q 56.00,207.00 64.50,198.00 Q 73.00,189.00 82.50,173.00 Q 92.00,157.00 98.00,149.50 Q 104.00,142.00 110.00,138.50 Q 116.00,135.00 125.50,134.50 Q 135.00,134.00 141.50,137.00 Q 148.00,140.00 152.50,144.50 Q 157.00,149.00 169.00,168.50 Q 181.00,188.00 187.50,195.50 Q 194.00,203.00 200.50,208.00 Q 207.00,213.00 210.00,214.00 Q 213.00,215.00 216.50,214.50 Q 220.00,214.00 221.00,213.00 Q 222.00,212.00 221.50,208.50 Q 221.00,205.00 212.00,194.00 Q 203.00,183.00 197.00,170.00 Q 191.00,157.00 182.50,127.00 Q 174.00,97.00 166.50,78.50 Q 159.00,60.00 153.50,53.50 Q 148.00,47.00 144.00,44.50 Q 140.00,42.00 131.00,41.00 Q 122.00,40.00 116.50,42.00 Z"
              />
            </svg>
            <img id="agy-boot-color-fill" class="agy-icon-color-fill" src="${iconColorUrl}" alt="Antigravity" />
          </div>
          <div class="agy-dot-grid-small">ANTIGRAVITY<br />· · · · · · · · · ·</div>
        </div>

        <div class="agy-boot-stage" id="agy-stage-5">
          <div class="agy-verify-ring-stage">
            <svg class="agy-arc-svg" viewBox="0 0 320 320">
              <circle cx="160" cy="160" r="146" fill="none" stroke="#ffffff" stroke-width="3.2" stroke-dasharray="430 140 160 220" stroke-linecap="round" />
              <circle cx="160" cy="14" r="4.5" fill="#ffffff" />
            </svg>
            <svg class="agy-arc-svg-inner" viewBox="0 0 264 264">
              <circle cx="132" cy="132" r="122" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1" stroke-dasharray="6 10" />
            </svg>
            <div class="agy-orbit-dots">
              <div class="agy-orbit-dot" style="top:12%;left:32%"></div>
              <div class="agy-orbit-dot w" style="top:28%;right:14%"></div>
              <div class="agy-orbit-dot" style="bottom:18%;left:22%"></div>
              <div class="agy-orbit-dot w" style="bottom:24%;right:28%"></div>
            </div>
            <div>
              <div class="agy-hud-title" data-stagger="24" style="font-size:17px;letter-spacing:0.1em;margin-bottom:6px">HOÀN TẤT · ĐÃ XÁC THỰC</div>
              <div class="agy-hud-subtitle" data-stagger="14" style="margin-bottom:0;font-size:9px;letter-spacing:0.24em">READ COMPLETE · VERIFIED</div>
            </div>
          </div>
        </div>

        <div class="agy-boot-stage" id="agy-stage-6">
          <div class="agy-welcome-eyebrow" data-stagger="28">WELCOME TO</div>
          <div class="agy-welcome-solid-box agy-welcome-reveal" style="animation-delay:240ms">ANTIGRAVITY</div>
          <div class="agy-welcome-flare-wrap agy-welcome-reveal" style="animation-delay:360ms">
            <img src="${iconColorUrl}" alt="Antigravity" />
          </div>
          <div class="agy-dot-grid-small agy-welcome-reveal" style="margin-bottom:8px;animation-delay:460ms">A N T I G R A V I T Y</div>
          <div class="agy-hud-hint agy-welcome-reveal" style="color:#a1a1aa;letter-spacing:0.2em;animation-delay:540ms">CHÀO MỪNG ${escapeHtml(operatorDisplay)} • SESSION READY</div>
        </div>
      </div>

      <div class="agy-hex-column" id="agy-hex-column"></div>

      <footer class="agy-boot-footer">
        <div style="display:flex;align-items:center">
          <div class="agy-eq-bars"><span></span><span></span><span></span></div>
          <span id="agy-boot-step-label">[ 01 / 06 ] AUTHORIZATION</span>
        </div>
        <span id="agy-boot-status-bottom">AWAITING OPERATOR CONSENT</span>
        <span id="agy-boot-id-footer">${hasPass ? 'ID STATUS : LOCKED' : 'ID STATUS : SETUP'}</span>
        <div class="agy-bottom-progress-track">
          <div class="agy-bottom-progress-bar" id="agy-bottom-progress"></div>
        </div>
      </footer>
    `;
    document.body.appendChild(overlay);

    const splashSheen = document.getElementById('agy-splash-sheen');
    const hudScanline = document.getElementById('agy-hud-scanline');
    const stepLabel = document.getElementById('agy-boot-step-label');
    const statusBottom = document.getElementById('agy-boot-status-bottom');
    const bottomProgress = document.getElementById('agy-bottom-progress');
    const hexColumn = document.getElementById('agy-hex-column');
    const hudClock = document.getElementById('agy-hud-clock');
    const morphTitle = document.getElementById('agy-morph-title');
    const morphSub = document.getElementById('agy-morph-sub');
    const iconOutlineSvg = document.getElementById('agy-icon-outline-svg');
    const outlinePath = document.getElementById('agy-boot-outline-path');
    const colorFillImg = document.getElementById('agy-boot-color-fill');
    const skipBtn = document.getElementById('agy-boot-skip');
    const confirmBtn = document.getElementById('agy-btn-confirm');
    const passRow = document.getElementById('agy-boot-pass-row');
    const passInput = document.getElementById('agy-boot-pass-input');
    const passHint = document.getElementById('agy-boot-pass-hint');
    const idFooter = document.getElementById('agy-boot-id-footer');
    const rekeyOpenBtn = document.getElementById('agy-btn-rekey-open');
    const rekeyStageA = document.getElementById('agy-stage-rekey-a');
    const rekeyStageB = document.getElementById('agy-stage-rekey-b');
    const rekeyCurRow = document.getElementById('agy-rekey-cur-row');
    const rekeyCurInput = document.getElementById('agy-rekey-cur-input');
    const rekeyNextBtn = document.getElementById('agy-btn-rekey-next');
    const rekeyCancelABtn = document.getElementById('agy-btn-rekey-cancel-a');
    const rekeyAHint = document.getElementById('agy-rekey-a-hint');
    const rekeyNewRow = document.getElementById('agy-rekey-new-row');
    const rekeyNewInput = document.getElementById('agy-rekey-new-input');
    const rekeyCfmRow = document.getElementById('agy-rekey-cfm-row');
    const rekeyCfmInput = document.getElementById('agy-rekey-cfm-input');
    const rekeyMatchStatus = document.getElementById('agy-rekey-match-status');
    const rekeySaveBtn = document.getElementById('agy-btn-rekey-save');
    const rekeyCancelBBtn = document.getElementById('agy-btn-rekey-cancel-b');
    const rekeyBHint = document.getElementById('agy-rekey-b-hint');
    const defaultPassHint = hasPass
      ? 'Nhập mật khẩu rồi nhấn Enter hoặc bấm nút để xác nhận'
      : 'Chưa đặt mật khẩu • Nhập mật khẩu mới rồi nhấn Enter để lưu & vào';
    const defaultRekeyAHint = 'Nhập mật khẩu hiện tại rồi nhấn Enter để sang bước đặt mã mới • Esc để quay lại';
    const defaultRekeyBHint = 'Nhập mã mới rồi Enter sang ô xác nhận • Giữ Alt để soi nhanh • Esc để hủy';
    let rekeyAuthorized = false;
    let rekeyBusy = false;
    const outlineTotalLen = Math.ceil(outlinePath.getTotalLength() || 673);
    outlinePath.style.strokeDasharray = `${outlineTotalLen}`;
    outlinePath.style.strokeDashoffset = `${outlineTotalLen}`;

    let currentStage = 0;
    let bootActx = null;
    const bootStartMs = performance.now();

    function playClickSfx(freq = 640, dur = 0.06, vol = 0.045) {
      try {
        bootActx = bootActx || new (window.AudioContext || window.webkitAudioContext)();
        if (bootActx.state === 'suspended') bootActx.resume();
        const osc = bootActx.createOscillator();
        const g = bootActx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, bootActx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.45, bootActx.currentTime + dur);
        g.gain.setValueAtTime(vol, bootActx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, bootActx.currentTime + dur);
        osc.connect(g);
        g.connect(bootActx.destination);
        osc.start();
        osc.stop(bootActx.currentTime + dur);
      } catch (e) {}
    }

    function playTawaVoice(slotNum) {
      stopBootAudio();
      const src = voiceUrls[slotNum];
      if (!src) return;
      try {
        const audio = new Audio(src);
        audio.volume = 0.92;
        window.__AGY_BOOT_AUDIO__ = audio;
        audio.play().catch(() => {});
      } catch (e) {}
    }

    function triggerScanline() {
      hudScanline.classList.remove('sweep');
      void hudScanline.offsetWidth;
      hudScanline.classList.add('sweep');
    }

    function startHexStream(active) {
      if (window.__AGY_BOOT_HEX__) {
        clearInterval(window.__AGY_BOOT_HEX__);
        window.__AGY_BOOT_HEX__ = null;
      }
      hexColumn.classList.toggle('visible', active);
      if (!active) return;
      const gen = () => {
        const lines = [];
        for (let i = 0; i < 6; i++) {
          const val = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
          lines.push(`0x${val} :: READ`);
        }
        hexColumn.innerHTML = lines.join('<br>');
      };
      gen();
      window.__AGY_BOOT_HEX__ = setInterval(gen, 110);
    }

    function applyCharStagger(el, stepMs = 24, baseDelayMs = 0) {
      if (!el) return;
      const raw = el.dataset.rawText || el.textContent.trim();
      el.dataset.rawText = raw;
      el.innerHTML = '';
      Array.from(raw).forEach((ch, idx) => {
        if (ch === ' ') {
          const sp = document.createElement('span');
          sp.className = 'agy-stagger-space';
          el.appendChild(sp);
        } else {
          const span = document.createElement('span');
          span.className = 'agy-stagger-char';
          span.textContent = ch;
          span.style.animationDelay = `${baseDelayMs + idx * stepMs}ms`;
          el.appendChild(span);
        }
      });
    }

    function setRekeyPeek(show) {
      const nextType = show ? 'text' : 'password';
      if (rekeyNewInput && !rekeyNewInput.disabled) rekeyNewInput.type = nextType;
      if (rekeyCfmInput && !rekeyCfmInput.disabled) rekeyCfmInput.type = nextType;
    }

    function updateRekeyMatchStatus() {
      if (!rekeyMatchStatus || !rekeyNewInput || !rekeyCfmInput) return;
      const nv = rekeyNewInput.value;
      const cv = rekeyCfmInput.value;
      rekeyMatchStatus.classList.remove('ok', 'warn', 'err');
      if (!nv && !cv) {
        rekeyMatchStatus.textContent = 'AWAITING INPUT';
        return;
      }
      if (nv && storedPassHash && hashBootPasscode(nv) === storedPassHash) {
        rekeyMatchStatus.textContent = 'SAME AS CURRENT';
        rekeyMatchStatus.classList.add('warn');
        return;
      }
      if (nv && !cv) {
        rekeyMatchStatus.textContent = 'CONFIRM REQUIRED';
        return;
      }
      if (nv === cv) {
        rekeyMatchStatus.textContent = 'MATCHED ✓';
        rekeyMatchStatus.classList.add('ok');
      } else {
        rekeyMatchStatus.textContent = 'MISMATCH';
        rekeyMatchStatus.classList.add('err');
      }
    }

    function cleanupRekeyListeners() {
      setRekeyPeek(false);
      if (window.__AGY_BOOT_KEYUP__) {
        window.removeEventListener('keyup', window.__AGY_BOOT_KEYUP__, true);
        window.__AGY_BOOT_KEYUP__ = null;
      }
      if (window.__AGY_BOOT_BLUR__) {
        window.removeEventListener('blur', window.__AGY_BOOT_BLUR__, true);
        window.__AGY_BOOT_BLUR__ = null;
      }
    }

    function showStage(idx, withCharAnim = true) {
      currentStage = idx;
      setRekeyPeek(false);
      const ids = {
        0: 'agy-stage-0',
        1: 'agy-stage-1',
        2: 'agy-stage-2',
        '2a': 'agy-stage-rekey-a',
        '2b': 'agy-stage-rekey-b',
        3: 'agy-stage-morph',
        4: 'agy-stage-morph',
        5: 'agy-stage-5',
        6: 'agy-stage-6'
      };
      const targetId = ids[idx];
      ['agy-stage-0', 'agy-stage-1', 'agy-stage-2', 'agy-stage-rekey-a', 'agy-stage-rekey-b', 'agy-stage-morph', 'agy-stage-5', 'agy-stage-6'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('wipe-out', 'stage-fade-out');
        el.classList.toggle('active', id === targetId);
      });
      if (withCharAnim && idx !== 0) {
        const activeEl = document.getElementById(targetId);
        if (activeEl) {
          activeEl.querySelectorAll('[data-stagger]').forEach((el, tIdx) => {
            applyCharStagger(el, parseInt(el.getAttribute('data-stagger') || '24', 10), tIdx * 90);
          });
        }
      }
      const meta = {
        0: ['[ 00 / 06 ] INITIALIZING', 'LOADING KERNEL...', 10],
        1: ['[ 01 / 06 ] AUTHORIZATION', 'AWAITING OPERATOR CONSENT', 24],
        2: ['[ 02 / 06 ] IDENTITY CHECK', hasPass ? 'PASSCODE REQUIRED / LEVEL ∞' : 'SET PASSCODE / LEVEL ∞', 42],
        '2a': ['[ 02A / REKEY ] AUTHORIZE', 'VERIFY CURRENT PASSCODE', 34],
        '2b': ['[ 02B / REKEY ] NEW KEY', 'ISSUE NEW UID PASSCODE', 46],
        3: ['[ 03 / 06 ] ACCESS VECTOR', 'SYNCHRONIZING NEURAL CORE', 58],
        4: ['[ 04 / 06 ] PERMISSION STREAM', 'STREAMING CLEARANCE KEYS', 74],
        5: ['[ 05 / 06 ] VERIFY', 'PERMISSION AUTHORIZED', 90],
        6: ['[ 06 / 06 ] WELCOME', `${operatorDisplay} SESSION ACTIVE`, 100]
      };
      const curMeta = meta[idx] || meta[0];
      stepLabel.textContent = curMeta[0];
      statusBottom.textContent = curMeta[1];
      bottomProgress.style.width = `${curMeta[2]}%`;
      if (idx === 2 && passInput) {
        confirming = false;
        rekeyAuthorized = false;
        rekeyBusy = false;
        storedPassHash = String(getState().bootPassHash || '').trim();
        hasPass = Boolean(storedPassHash);
        if (rekeyOpenBtn) rekeyOpenBtn.classList.toggle('hidden', !hasPass);
        if (idFooter) idFooter.textContent = hasPass ? 'ID STATUS : LOCKED' : 'ID STATUS : SETUP';
        passInput.disabled = false;
        passInput.value = '';
        passInput.classList.remove('error', 'verified');
        if (passHint) {
          passHint.classList.remove('error', 'ok');
          passHint.textContent = defaultPassHint;
        }
        window.__AGY_BOOT_TIMERS__.push(setTimeout(() => {
          if (currentStage === 2 && passInput && !passInput.disabled) {
            passInput.focus();
          }
        }, 60));
      } else if (idx === '2a' && rekeyCurInput) {
        rekeyAuthorized = false;
        rekeyBusy = false;
        if (idFooter) idFooter.textContent = 'REKEY MODE : STEP 1/2';
        if (rekeyNextBtn) rekeyNextBtn.classList.remove('triggered');
        rekeyCurInput.disabled = false;
        rekeyCurInput.value = '';
        rekeyCurInput.classList.remove('error', 'verified');
        if (rekeyAHint) {
          rekeyAHint.classList.remove('error', 'ok');
          rekeyAHint.textContent = defaultRekeyAHint;
        }
        window.__AGY_BOOT_TIMERS__.push(setTimeout(() => {
          if (currentStage === '2a' && rekeyCurInput && !rekeyCurInput.disabled) {
            rekeyCurInput.focus();
          }
        }, 60));
      } else if (idx === '2b' && rekeyNewInput && rekeyCfmInput) {
        rekeyBusy = false;
        if (idFooter) idFooter.textContent = 'REKEY MODE : STEP 2/2';
        if (rekeySaveBtn) rekeySaveBtn.classList.remove('triggered');
        rekeyNewInput.disabled = false;
        rekeyCfmInput.disabled = false;
        rekeyNewInput.type = 'password';
        rekeyCfmInput.type = 'password';
        rekeyNewInput.value = '';
        rekeyCfmInput.value = '';
        rekeyNewInput.classList.remove('error', 'verified');
        rekeyCfmInput.classList.remove('error', 'verified');
        if (rekeyBHint) {
          rekeyBHint.classList.remove('error', 'ok');
          rekeyBHint.textContent = defaultRekeyBHint;
        }
        updateRekeyMatchStatus();
        window.__AGY_BOOT_TIMERS__.push(setTimeout(() => {
          if (currentStage === '2b' && rekeyNewInput && !rekeyNewInput.disabled) {
            rekeyNewInput.focus();
          }
        }, 60));
      }
    }

    function finishBoot(instant = false) {
      cleanupRekeyListeners();
      clearBootTimers();
      startHexStream(false);
      window.__AGY_BOOT_FINISHED__ = true;
      if (instant) {
        stopBootAudio();
        overlay.classList.add('done', 'instant');
        scheduleRevealWhenReady(false);
        return;
      }
      flashCurtain.classList.remove('burst');
      void flashCurtain.offsetWidth;
      flashCurtain.classList.add('burst');
      window.__AGY_BOOT_TIMERS__.push(
        setTimeout(() => {
          overlay.classList.add('done');
          scheduleRevealWhenReady(false);
          window.__AGY_BOOT_TIMERS__.push(setTimeout(() => {
            overlay.style.display = 'none';
          }, 700));
        }, 340)
      );
    }

    function runAutoSequenceAfterConfirm() {
      morphTitle.dataset.rawText = 'ĐANG TIẾP NHẬN YÊU CẦU';
      morphTitle.textContent = 'ĐANG TIẾP NHẬN YÊU CẦU';
      morphSub.dataset.rawText = 'ACCESS REQUEST RECEIVED';
      morphSub.textContent = 'ACCESS REQUEST RECEIVED';
      iconOutlineSvg.classList.remove('fade-stroke');
      colorFillImg.classList.remove('filled');
      outlinePath.classList.remove('trace');
      outlinePath.style.strokeDashoffset = String(outlineTotalLen);
      showStage(3, true);
      void outlinePath.offsetWidth;
      outlinePath.classList.add('trace');
      playClickSfx(520, 0.06, 0.045);

      let fillPhaseStarted = false;
      const startColorFillStage = () => {
        if (fillPhaseStarted || !overlay.isConnected || overlay.classList.contains('done')) return;
        fillPhaseStarted = true;

        // Fill immediately on stroke completion while swapping the caption concurrently
        morphTitle.dataset.rawText = 'BẮT ĐẦU ĐỌC QUYỀN HẠN';
        morphTitle.textContent = 'BẮT ĐẦU ĐỌC QUYỀN HẠN';
        morphSub.dataset.rawText = 'PERMISSION READ STARTED';
        morphSub.textContent = 'PERMISSION READ STARTED';
        showStage(4, true);
        startHexStream(true);
        void colorFillImg.offsetWidth;
        colorFillImg.classList.add('filled');
        playClickSfx(620, 0.05, 0.04);

        window.__AGY_BOOT_TIMERS__.push(setTimeout(() => iconOutlineSvg.classList.add('fade-stroke'), 520));

        window.__AGY_BOOT_TIMERS__.push(setTimeout(() => {
          startHexStream(false);
          showStage(5, true);
          triggerScanline();
          playClickSfx(780, 0.08, 0.05);
          playTawaVoice(3);
        }, 1250));

        window.__AGY_BOOT_TIMERS__.push(setTimeout(() => {
          const st5 = document.getElementById('agy-stage-5');
          if (st5) st5.classList.add('stage-fade-out');
        }, 2950));

        window.__AGY_BOOT_TIMERS__.push(setTimeout(() => {
          showStage(6, true);
          playClickSfx(880, 0.1, 0.045);
          playTawaVoice(4);
        }, 3620));

        window.__AGY_BOOT_TIMERS__.push(setTimeout(() => finishBoot(false), 5850));
      };

      outlinePath.addEventListener('animationend', startColorFillStage, { once: true });
      window.__AGY_BOOT_TIMERS__.push(setTimeout(startColorFillStage, 1080));
    }

    window.__AGY_BOOT_CLOCK__ = setInterval(() => {
      const sec = Math.floor((performance.now() - bootStartMs) / 1000);
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      hudClock.textContent = `WEB PROFILE 00:${mm}:${ss}`;
    }, 250);

    showStage(0, false);
    window.__AGY_BOOT_TIMERS__.push(setTimeout(() => {
      splashSheen.classList.remove('run');
      void splashSheen.offsetWidth;
      splashSheen.classList.add('run');
    }, 1050));

    window.__AGY_BOOT_TIMERS__.push(setTimeout(() => {
      overlay.classList.add('hud-mode');
      showStage(1, true);
      triggerScanline();
    }, 2600));

    document.getElementById('agy-btn-grant').addEventListener('click', (e) => {
      if (currentStage !== 1) return;
      e.currentTarget.classList.add('triggered');
      playClickSfx(680, 0.06, 0.05);
      playTawaVoice(1);
      const st1 = document.getElementById('agy-stage-1');
      window.__AGY_BOOT_TIMERS__.push(setTimeout(() => st1 && st1.classList.add('wipe-out'), 240));
      window.__AGY_BOOT_TIMERS__.push(setTimeout(() => showStage(2, true), 580));
    });

    function triggerPassError(msg, bottomMsg) {
      playClickSfx(210, 0.12, 0.055);
      if (passInput) {
        passInput.classList.remove('verified');
        passInput.classList.add('error');
      }
      if (passRow) {
        passRow.classList.remove('shake');
        void passRow.offsetWidth;
        passRow.classList.add('shake');
      }
      if (passHint) {
        passHint.classList.add('error');
        passHint.textContent = msg;
      }
      if (bottomMsg) {
        statusBottom.textContent = bottomMsg;
      }
      if (passInput) {
        passInput.focus();
        passInput.select();
      }
    }

    if (passRow && passInput) {
      passRow.addEventListener('click', () => {
        if (!passInput.disabled) passInput.focus();
      });
    }

    const stage2El = document.getElementById('agy-stage-2');
    if (stage2El && passInput) {
      stage2El.addEventListener('click', (e) => {
        if (currentStage === 2 && !passInput.disabled && !e.target.closest('button')) {
          passInput.focus();
        }
      });
    }

    if (passInput) {
      passInput.addEventListener('input', () => {
        passInput.classList.remove('error');
        if (passHint && passHint.classList.contains('error')) {
          passHint.classList.remove('error');
          passHint.textContent = defaultPassHint;
        }
      });
      passInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (confirmBtn) confirmBtn.click();
          return;
        }
        if (e.key !== 'Escape') {
          e.stopPropagation();
        }
      });
    }

    confirmBtn.addEventListener('click', (e) => {
      if (currentStage !== 2 || confirming) return;
      const entered = passInput ? passInput.value : '';
      const latestHash = String(getState().bootPassHash || '').trim();
      storedPassHash = latestHash;
      hasPass = Boolean(latestHash);

      if (!entered || (!hasPass && !entered.trim())) {
        triggerPassError(
          'VUI LÒNG NHẬP MẬT KHẨU • PASSCODE REQUIRED',
          'PASSCODE REQUIRED'
        );
        return;
      }

      const enteredHash = hashBootPasscode(entered);
      if (!hasPass) {
        applyTheme({ bootPassHash: enteredHash });
        storedPassHash = enteredHash;
        hasPass = true;
      } else if (enteredHash !== storedPassHash) {
        failedAttempts += 1;
        triggerPassError(
          `SAI MẬT KHẨU • ACCESS DENIED (Lần ${failedAttempts})`,
          'ACCESS DENIED • INVALID PASSCODE'
        );
        return;
      }

      confirming = true;
      passVerified = true;
      if (passInput) {
        passInput.disabled = true;
        passInput.classList.remove('error');
        passInput.classList.add('verified');
      }
      if (passHint) {
        passHint.classList.remove('error');
        passHint.textContent = 'ĐÃ XÁC MINH • IDENTITY VERIFIED';
      }
      if (idFooter) idFooter.textContent = `ID CONFIRMED : ${operatorDisplay}`;
      if (skipBtn) skipBtn.classList.remove('locked');
      e.currentTarget.classList.add('triggered');
      playClickSfx(820, 0.06, 0.05);
      playTawaVoice(2);
      const st2 = document.getElementById('agy-stage-2');
      window.__AGY_BOOT_TIMERS__.push(setTimeout(() => st2 && st2.classList.add('wipe-out'), 240));
      window.__AGY_BOOT_TIMERS__.push(setTimeout(() => runAutoSequenceAfterConfirm(), 580));
    });

    function triggerFieldError(rowEl, inputEl, hintEl, msg, bottomMsg) {
      playClickSfx(210, 0.12, 0.055);
      if (inputEl) {
        inputEl.classList.remove('verified');
        inputEl.classList.add('error');
      }
      if (rowEl) {
        rowEl.classList.remove('shake');
        void rowEl.offsetWidth;
        rowEl.classList.add('shake');
      }
      if (hintEl) {
        hintEl.classList.remove('ok');
        hintEl.classList.add('error');
        hintEl.textContent = msg;
      }
      if (bottomMsg) {
        statusBottom.textContent = bottomMsg;
      }
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    }

    function openRekeyFlow() {
      if (currentStage !== 2 || confirming || rekeyBusy) return;
      storedPassHash = String(getState().bootPassHash || '').trim();
      hasPass = Boolean(storedPassHash);
      if (!hasPass) return;
      rekeyBusy = true;
      playClickSfx(620, 0.06, 0.045);
      const st2 = document.getElementById('agy-stage-2');
      if (st2) st2.classList.add('wipe-out');
      window.__AGY_BOOT_TIMERS__.push(setTimeout(() => {
        triggerScanline();
        showStage('2a', true);
      }, 240));
    }

    function cancelRekeyToStage2() {
      if ((currentStage !== '2a' && currentStage !== '2b') || confirming) return;
      rekeyBusy = true;
      rekeyAuthorized = false;
      setRekeyPeek(false);
      playClickSfx(420, 0.05, 0.035);
      const activeStageEl = currentStage === '2a' ? rekeyStageA : rekeyStageB;
      if (activeStageEl) activeStageEl.classList.add('wipe-out');
      window.__AGY_BOOT_TIMERS__.push(setTimeout(() => {
        triggerScanline();
        showStage(2, true);
      }, 220));
    }

    if (rekeyOpenBtn) {
      rekeyOpenBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openRekeyFlow();
      });
    }

    if (rekeyCancelABtn) rekeyCancelABtn.addEventListener('click', cancelRekeyToStage2);
    if (rekeyCancelBBtn) rekeyCancelBBtn.addEventListener('click', cancelRekeyToStage2);

    if (rekeyCurRow && rekeyCurInput) {
      rekeyCurRow.addEventListener('click', () => {
        if (!rekeyCurInput.disabled) rekeyCurInput.focus();
      });
    }
    if (rekeyStageA && rekeyCurInput) {
      rekeyStageA.addEventListener('click', (e) => {
        if (currentStage === '2a' && !rekeyCurInput.disabled && !e.target.closest('button')) {
          rekeyCurInput.focus();
        }
      });
    }
    if (rekeyCurInput) {
      rekeyCurInput.addEventListener('input', () => {
        rekeyCurInput.classList.remove('error');
        if (rekeyAHint && rekeyAHint.classList.contains('error')) {
          rekeyAHint.classList.remove('error');
          rekeyAHint.textContent = defaultRekeyAHint;
        }
      });
      rekeyCurInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (rekeyNextBtn) rekeyNextBtn.click();
          return;
        }
        if (e.key !== 'Escape') e.stopPropagation();
      });
    }

    if (rekeyNextBtn) {
      rekeyNextBtn.addEventListener('click', () => {
        if (currentStage !== '2a' || rekeyBusy) return;
        const curVal = rekeyCurInput ? rekeyCurInput.value : '';
        storedPassHash = String(getState().bootPassHash || '').trim();
        hasPass = Boolean(storedPassHash);
        if (!hasPass) {
          cancelRekeyToStage2();
          return;
        }
        if (!curVal) {
          triggerFieldError(
            rekeyCurRow,
            rekeyCurInput,
            rekeyAHint,
            'VUI LÒNG NHẬP MẬT KHẨU HIỆN TẠI • CURRENT PASSCODE REQUIRED',
            'CURRENT PASSCODE REQUIRED'
          );
          return;
        }
        if (hashBootPasscode(curVal) !== storedPassHash) {
          triggerFieldError(
            rekeyCurRow,
            rekeyCurInput,
            rekeyAHint,
            'SAI MẬT KHẨU HIỆN TẠI • AUTHORIZATION DENIED',
            'REKEY DENIED • INVALID CURRENT KEY'
          );
          return;
        }

        rekeyBusy = true;
        rekeyAuthorized = true;
        if (rekeyCurInput) {
          rekeyCurInput.disabled = true;
          rekeyCurInput.classList.remove('error');
          rekeyCurInput.classList.add('verified');
        }
        if (rekeyAHint) {
          rekeyAHint.classList.remove('error');
          rekeyAHint.classList.add('ok');
          rekeyAHint.textContent = 'ĐÃ XÁC THỰC • AUTHORIZED — ĐANG MỞ BƯỚC ĐẶT MÃ MỚI';
        }
        rekeyNextBtn.classList.add('triggered');
        playClickSfx(740, 0.07, 0.05);
        window.__AGY_BOOT_TIMERS__.push(setTimeout(() => {
          if (rekeyStageA) rekeyStageA.classList.add('wipe-out');
        }, 220));
        window.__AGY_BOOT_TIMERS__.push(setTimeout(() => {
          triggerScanline();
          showStage('2b', true);
        }, 520));
      });
    }

    if (rekeyNewRow && rekeyNewInput) {
      rekeyNewRow.addEventListener('click', () => {
        if (!rekeyNewInput.disabled) rekeyNewInput.focus();
      });
    }
    if (rekeyCfmRow && rekeyCfmInput) {
      rekeyCfmRow.addEventListener('click', () => {
        if (!rekeyCfmInput.disabled) rekeyCfmInput.focus();
      });
    }
    if (rekeyNewInput) {
      rekeyNewInput.addEventListener('input', () => {
        rekeyNewInput.classList.remove('error');
        if (rekeyCfmInput) rekeyCfmInput.classList.remove('error');
        if (rekeyBHint && rekeyBHint.classList.contains('error')) {
          rekeyBHint.classList.remove('error');
          rekeyBHint.textContent = defaultRekeyBHint;
        }
        updateRekeyMatchStatus();
      });
      rekeyNewInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (!rekeyNewInput.value.trim()) {
            triggerFieldError(
              rekeyNewRow,
              rekeyNewInput,
              rekeyBHint,
              'VUI LÒNG NHẬP MẬT KHẨU MỚI • NEW PASSCODE REQUIRED',
              'NEW PASSCODE REQUIRED'
            );
            return;
          }
          if (rekeyCfmInput && !rekeyCfmInput.disabled) rekeyCfmInput.focus();
          return;
        }
        if (e.key !== 'Escape' && e.key !== 'Alt') e.stopPropagation();
      });
    }
    if (rekeyCfmInput) {
      rekeyCfmInput.addEventListener('input', () => {
        rekeyCfmInput.classList.remove('error');
        if (rekeyBHint && rekeyBHint.classList.contains('error')) {
          rekeyBHint.classList.remove('error');
          rekeyBHint.textContent = defaultRekeyBHint;
        }
        updateRekeyMatchStatus();
      });
      rekeyCfmInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (rekeySaveBtn) rekeySaveBtn.click();
          return;
        }
        if (e.key !== 'Escape' && e.key !== 'Alt') e.stopPropagation();
      });
    }

    if (rekeySaveBtn) {
      rekeySaveBtn.addEventListener('click', () => {
        if (currentStage !== '2b' || rekeyBusy || !rekeyAuthorized) return;
        const newVal = rekeyNewInput ? rekeyNewInput.value : '';
        const cfmVal = rekeyCfmInput ? rekeyCfmInput.value : '';
        if (!newVal || !newVal.trim()) {
          triggerFieldError(
            rekeyNewRow,
            rekeyNewInput,
            rekeyBHint,
            'VUI LÒNG NHẬP MẬT KHẨU MỚI • NEW PASSCODE REQUIRED',
            'NEW PASSCODE REQUIRED'
          );
          return;
        }
        const nextHash = hashBootPasscode(newVal);
        if (storedPassHash && nextHash === storedPassHash) {
          triggerFieldError(
            rekeyNewRow,
            rekeyNewInput,
            rekeyBHint,
            'MÃ MỚI TRÙNG MÃ CŨ • VUI LÒNG CHỌN MÃ KHÁC',
            'REKEY REJECTED • IDENTICAL PASSCODE'
          );
          return;
        }
        if (!cfmVal) {
          triggerFieldError(
            rekeyCfmRow,
            rekeyCfmInput,
            rekeyBHint,
            'VUI LÒNG NHẬP LẠI ĐỂ XÁC NHẬN • CONFIRM PASSCODE REQUIRED',
            'CONFIRMATION REQUIRED'
          );
          return;
        }
        if (newVal !== cfmVal) {
          triggerFieldError(
            rekeyCfmRow,
            rekeyCfmInput,
            rekeyBHint,
            'MẬT KHẨU NHẬP LẠI KHÔNG KHỚP • PASSCODE MISMATCH',
            'REKEY ERROR • PASSCODE MISMATCH'
          );
          return;
        }

        rekeyBusy = true;
        confirming = true;
        passVerified = true;
        setRekeyPeek(false);
        applyTheme({ bootPassHash: nextHash });
        storedPassHash = nextHash;
        hasPass = true;
        if (rekeyNewInput) {
          rekeyNewInput.disabled = true;
          rekeyNewInput.classList.remove('error');
          rekeyNewInput.classList.add('verified');
        }
        if (rekeyCfmInput) {
          rekeyCfmInput.disabled = true;
          rekeyCfmInput.classList.remove('error');
          rekeyCfmInput.classList.add('verified');
        }
        if (rekeyMatchStatus) {
          rekeyMatchStatus.classList.remove('warn', 'err');
          rekeyMatchStatus.classList.add('ok');
          rekeyMatchStatus.textContent = 'KEY UPDATED ✓';
        }
        if (rekeyBHint) {
          rekeyBHint.classList.remove('error');
          rekeyBHint.classList.add('ok');
          rekeyBHint.textContent = 'ĐÃ CẬP NHẬT MÃ ĐỊNH DANH • PASSCODE UPDATED';
        }
        if (idFooter) idFooter.textContent = `ID CONFIRMED : ${operatorDisplay}`;
        if (skipBtn) skipBtn.classList.remove('locked');
        rekeySaveBtn.classList.add('triggered');
        playClickSfx(860, 0.08, 0.05);
        playTawaVoice(2);
        window.__AGY_BOOT_TIMERS__.push(setTimeout(() => {
          if (rekeyStageB) rekeyStageB.classList.add('wipe-out');
        }, 260));
        window.__AGY_BOOT_TIMERS__.push(setTimeout(() => runAutoSequenceAfterConfirm(), 600));
      });
    }

    skipBtn.addEventListener('click', () => {
      if (hasPass && !passVerified) return;
      finishBoot(true);
    });

    cleanupRekeyListeners();
    window.__AGY_BOOT_KEYUP__ = (e) => {
      if (e.key === 'Alt') setRekeyPeek(false);
    };
    window.__AGY_BOOT_BLUR__ = () => setRekeyPeek(false);
    window.addEventListener('keyup', window.__AGY_BOOT_KEYUP__, true);
    window.addEventListener('blur', window.__AGY_BOOT_BLUR__, true);

    window.__AGY_BOOT_KEYDOWN__ = (e) => {
      if (overlay.classList.contains('done')) return;
      if (e.key === 'Alt' && currentStage === '2b' && !rekeyBusy) {
        e.preventDefault();
        setRekeyPeek(true);
        return;
      }
      if (currentStage === 1 && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        e.stopPropagation();
        const btn = document.getElementById('agy-btn-grant');
        if (btn) btn.click();
      } else if (currentStage === 2 && e.key === 'F2') {
        e.preventDefault();
        e.stopPropagation();
        openRekeyFlow();
      } else if (currentStage === 2 && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (confirmBtn) confirmBtn.click();
      } else if (currentStage === '2a' && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (rekeyNextBtn) rekeyNextBtn.click();
      } else if (currentStage === '2b' && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (document.activeElement === rekeyNewInput) {
          if (!rekeyNewInput.value || !rekeyNewInput.value.trim()) {
            triggerFieldError(
              rekeyNewRow,
              rekeyNewInput,
              rekeyBHint,
              'VUI LÒNG NHẬP MẬT KHẨU MỚI • NEW PASSCODE REQUIRED',
              'NEW PASSCODE REQUIRED'
            );
          } else if (rekeyCfmInput && !rekeyCfmInput.disabled) {
            rekeyCfmInput.focus();
          }
        } else if (rekeySaveBtn) {
          rekeySaveBtn.click();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (currentStage === '2a' || currentStage === '2b') {
          cancelRekeyToStage2();
        } else if (!hasPass || passVerified) {
          finishBoot(true);
        } else if (currentStage === 2 && passInput && !passInput.disabled) {
          passInput.focus();
        }
      }
    };
    window.addEventListener('keydown', window.__AGY_BOOT_KEYDOWN__, true);
  }
  return mountBootSequence(forceReplay);
};
