window.__AGY_LAZY_STUDIO__ = function(ctx) {
  const {
    THEMES,
    THEME_KEYS,
    DEFAULT_THEME_KEY,
    STORAGE_THEME,
    STORAGE_THEME_ENABLED,
    STORAGE_BUBBLE,
    STORAGE_INPUT,
    STORAGE_DIMMING,
    STORAGE_WP_ENABLED,
    STORAGE_WP_MODE,
    STORAGE_CUSTOM_WP,
    STORAGE_CUSTOM_VIDEO,
    STORAGE_TASK_VOICE_ENABLED,
    STORAGE_TASK_VOICE_VOL,
    STORAGE_CUSTOM_GREETINGS,
    STORAGE_USER_AVATAR,
    STORAGE_AGENT_AVATAR,
    STORAGE_GLASS_BLUR,
    STORAGE_AVATAR_SIZE,
    STORAGE_AVATAR_RADIUS,
    STORAGE_BOOT_INTRO,
    STORAGE_BOOT_OPERATOR,
    STORAGE_BOOT_PASS_HASH,
    STORAGE_SKETCH_REVEAL,
    STORAGE_TAWA_GREETING,
    STORAGE_MECHA_WORKING,
    STORAGE_WORKING_STYLE,
    STORAGE_WORKING_TEXTS,
    STORAGE_WORKING_ICON,
    STORAGE_WORKING_SHOW_TIMER,
    CHECK_SVG,
    INPUT_STYLES,
    WORKING_STYLES,
    escapeHtml,
    hashBootPasscode,
    resolveBootOperator,
    canonicalMediaKey,
    isSameMediaUrl,
    deriveMediaName,
    getMediaLibrary,
    upsertSavedMedia,
    removeSavedMediaFromStore,
    normalizeGreetingLines,
    getState,
    resolveMediaUrl,
    sanitizeCssUrl,
    applyTheme,
    syncEmptyGreeting,
    syncWorkingTelemetry,
    playOneShotTaskAudio,
    playRandomTaskVoice,
    mountBootSequence,
    triggerSketchBloomReveal,
  } = ctx;
  function compressAvatarFile(file, callback) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const size = 192;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const natW = img.naturalWidth || size;
          const natH = img.naturalHeight || size;
          const side = Math.min(natW, natH);
          const sx = Math.max(0, Math.floor((natW - side) / 2));
          const sy = Math.max(0, Math.floor((natH - side) / 2));
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          const out = canvas.toDataURL('image/webp', 0.88);
          callback(out && out.startsWith('data:image/webp') ? out : canvas.toDataURL('image/png'));
        } catch (e) {
          callback(String(reader.result || ''));
        }
      };
      img.onerror = () => callback(String(reader.result || ''));
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  function syncMasterToggleUi() {
    const cur = getState();
    const isOn = cur.themeEnabled !== false;
    const btn = document.getElementById('agy-master-theme-toggle');
    const lbl = document.getElementById('agy-master-toggle-label');
    const track = document.getElementById('agy-master-toggle-track');
    const knob = document.getElementById('agy-master-toggle-knob');
    if (btn) {
      btn.setAttribute('aria-checked', String(isOn));
      btn.style.background = isOn ? 'rgba(34, 197, 94, 0.16)' : 'rgba(251, 191, 36, 0.12)';
      btn.style.border = isOn ? '1px solid rgba(74, 222, 128, 0.45)' : '1px solid rgba(251, 191, 36, 0.38)';
      btn.style.color = isOn ? '#bbf7d0' : '#fde68a';
    }
    if (lbl) lbl.textContent = isOn ? 'Theme: ON' : 'Mặc định (OFF)';
    if (track) track.style.background = isOn ? '#22c55e' : 'rgba(113, 113, 122, 0.6)';
    if (knob) knob.style.transform = isOn ? 'translateX(16px)' : 'translateX(0px)';
    const banner = document.getElementById('agy-theme-disabled-banner');
    if (banner) {
      banner.style.display = isOn ? 'none' : 'flex';
    }
  }

  function openCustomThemeModal() {
    let backdrop = document.getElementById('agy-custom-theme-modal-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'agy-custom-theme-modal-backdrop';
      backdrop.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px;
        background: rgba(0, 0, 0, 0.72);
      `;

      backdrop.innerHTML = `
        <div id="agy-custom-theme-modal-dialog" style="background: rgba(15, 16, 22, 0.97); border: 1.2px solid rgba(148, 163, 184, 0.28); border-radius: 18px; width: 100%; max-width: 900px; height: 86vh; max-height: 860px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.9); font-family: system-ui, -apple-system, sans-serif;">
          <div id="agy-custom-theme-modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: rgba(20, 22, 30, 0.92); gap: 12px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 17px; font-weight: 600; color: #f4f4f5; letter-spacing: -0.2px;">Custom Theme Studio</span>
              <span id="agy-custom-theme-badge" style="font-size: 11.5px; padding: 2.5px 9px; border-radius: 9999px; background: rgba(148, 163, 184, 0.16); color: #e2e8f0; font-weight: 500; border: 1px solid rgba(148, 163, 184, 0.3);">${THEME_KEYS.length} Preset${THEME_KEYS.length > 1 ? 's' : ''}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <button id="agy-master-theme-toggle" type="button" role="switch" aria-checked="true" title="Bật/Tắt toàn bộ Custom Theme để quay về giao diện mặc định gốc mà không cần gỡ mod" style="display: inline-flex; align-items: center; gap: 8px; padding: 5px 10px 5px 12px; border-radius: 9999px; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.18s ease; user-select: none;">
                <span id="agy-master-toggle-label">Theme: ON</span>
                <span id="agy-master-toggle-track" style="position: relative; width: 34px; height: 18px; border-radius: 9999px; transition: background 0.18s ease; display: inline-flex; align-items: center; padding: 2px; box-sizing: border-box;">
                  <span id="agy-master-toggle-knob" style="width: 14px; height: 14px; border-radius: 9999px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.45); transition: transform 0.18s ease; display: block;"></span>
                </span>
              </button>
              <button id="agy-theme-modal-close-btn" type="button" style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); color: #d4d4d8; cursor: pointer; width: 30px; height: 30px; border-radius: 8px; font-size: 15px; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease;">✕</button>
            </div>
          </div>
          <div id="agy-theme-modal-body" style="flex: 1; overflow-y: auto; height: 100%;"></div>
        </div>
      `;

      document.body.appendChild(backdrop);

      const closeModal = () => {
        backdrop.style.display = 'none';
        if (typeof syncWorkingTelemetry === 'function') syncWorkingTelemetry();
      };
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
      });
      backdrop.querySelector('#agy-theme-modal-close-btn').addEventListener('click', closeModal);
      const masterToggleBtn = backdrop.querySelector('#agy-master-theme-toggle');
      if (masterToggleBtn) {
        masterToggleBtn.addEventListener('click', () => {
          const nextOn = getState().themeEnabled === false;
          applyTheme({ themeEnabled: nextOn });
          syncMasterToggleUi();
          if (nextOn) {
            const modalBody = backdrop.querySelector('#agy-theme-modal-body');
            if (modalBody) renderThemePanels(modalBody);
          }
        });
      }
      if (window.__AGY_MODAL_AC__) {
        try { window.__AGY_MODAL_AC__.abort(); } catch (e) {}
      }
      window.__AGY_MODAL_AC__ = new AbortController();
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && backdrop.style.display !== 'none') {
          closeModal();
        }
      }, { signal: window.__AGY_MODAL_AC__.signal });
    }

    backdrop.style.display = 'flex';
    const body = backdrop.querySelector('#agy-theme-modal-body');
    renderThemePanels(body);
    syncMasterToggleUi();
  }

  function renderThemePanels(container) {
    const st = getState();
    const mainTheme = THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY];
    const effUserAv = st.userAvatar === 'none' ? '' : (st.userAvatar || mainTheme.userAvatar || '');
    const effAgentAv = st.agentAvatar === 'none' ? '' : (st.agentAvatar || mainTheme.agentAvatar || '');
    const workingStyleMap = WORKING_STYLES || {
      mecha: { label: 'Mecha Telemetry', badge: '⚡ Mecha', desc: 'Sci-Fi monospace + đồng hồ thực' },
      hud_pill: { label: 'Schale HUD Pill', badge: '💠 HUD Pill', desc: 'Viên thuốc HUD + equalizer' },
      starlight: { label: 'Starlight Shimmer', badge: '✦ Starlight', desc: 'Không khung + chữ ánh sao' },
      chibi_mali: { label: 'Chibi + Mali', badge: '🌸 Chibi', desc: 'Font viết tay Mali + icon/GIF' },
      default: { label: 'Mặc định', badge: '○ Mặc định', desc: 'Chữ Working nguyên bản' }
    };
    const activeWorkingMeta = workingStyleMap[st.workingStyle] || workingStyleMap.mecha;
    const effWorkingIconUrl = resolveMediaUrl(st.workingIcon || mainTheme.sticker || effAgentAv || '');

    container.innerHTML = `
      <div id="agy-theme-scroll-container" style="padding: 24px 32px 48px 32px; max-width: 860px; margin: 0 auto; overflow-y: auto; height: 100%; color: #f4f4f5;">
        <div id="agy-theme-disabled-banner" style="display: ${st.themeEnabled !== false ? 'none' : 'flex'}; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; border: 1px solid rgba(251, 191, 36, 0.35); background: rgba(251, 191, 36, 0.10); border-radius: 12px; padding: 12px 16px; margin-bottom: 14px;">
          <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 240px;">
            <div style="font-size: 13px; font-weight: 600; color: #fde68a;">Custom Theme đang tạm tắt — đang dùng giao diện mặc định gốc</div>
            <div style="font-size: 11.5px; color: #d4d4d8; line-height: 1.4;">Mọi preset, ảnh/video nền, mật khẩu Boot HUD và câu chào vẫn được lưu an toàn. Gạt công tắc ON hoặc bấm nút bên cạnh để bật lại ngay.</div>
          </div>
          <button id="agy-theme-reenable-btn" type="button" style="padding: 6px 14px; border-radius: 8px; background: #22c55e; color: #052e16; font-weight: 700; font-size: 12px; border: none; cursor: pointer; white-space: nowrap;">Bật lại Theme ngay</button>
        </div>
        <div style="border: 1px solid ${mainTheme.borderColor}; background: ${mainTheme.cardBg || 'rgba(22, 16, 14, 0.72)'}; border-radius: 12px; padding: 16px 20px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <div style="font-size: 14.5px; font-weight: 600; color: #f4f4f5; margin-bottom: 2px;">Wallpaper, Pre-Baked Blur & Config</div>
              <div style="font-size: 12.5px; color: #a1a1aa;">Balance artwork clarity, 120fps pre-baked frosted glass blur, or share config JSON.</div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #d4d4d8; cursor: pointer;">
                <input id="agy-wp-toggle" type="checkbox" ${st.wpEnabled ? 'checked' : ''} style="accent-color: ${mainTheme.primary}; cursor: pointer;" />
                Backdrop
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #a1a1aa;">
                Dim
                <input id="agy-dim-slider" type="range" min="15" max="92" value="${st.dimming}" style="width: 96px; cursor: pointer; accent-color: #ffffff; height: 5px;" />
                <span id="agy-dim-val" style="min-width: 32px; text-align: right;">${st.dimming}%</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #a1a1aa;">
                Blur
                <input id="agy-blur-slider" type="range" min="0" max="16" value="${st.glassBlur}" style="width: 78px; cursor: pointer; accent-color: ${mainTheme.primary}; height: 5px;" />
                <span id="agy-blur-val" style="min-width: 30px; text-align: right;">${st.glassBlur}px</span>
              </label>
              <div style="display: inline-flex; border-radius: 8px; overflow: hidden; border: 1px solid ${mainTheme.borderColor}; background: rgba(0,0,0,0.28);">
                <button id="agy-mode-image" type="button" style="padding: 4px 10px; font-size: 11.5px; cursor: pointer; border: none; background: ${st.wpMode === 'image' ? 'rgba(255,255,255,0.18)' : 'transparent'}; color: ${st.wpMode === 'image' ? '#ffffff' : '#a1a1aa'}; font-weight: ${st.wpMode === 'image' ? '600' : '400'};">Ảnh tĩnh</button>
                <button id="agy-mode-video" type="button" style="padding: 4px 10px; font-size: 11.5px; cursor: pointer; border: none; border-left: 1px solid ${mainTheme.borderColor}; background: ${st.wpMode === 'video' ? 'rgba(255,255,255,0.18)' : 'transparent'}; color: ${st.wpMode === 'video' ? '#ffffff' : '#a1a1aa'}; font-weight: ${st.wpMode === 'video' ? '600' : '400'};">Video động</button>
              </div>
              <label style="padding: 5px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${mainTheme.borderColor}; color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Chọn Ảnh / Video
                <input id="agy-wp-upload" type="file" accept="image/*,video/mp4,video/webm,video/quicktime,video/*" style="display: none;" />
              </label>
              <button id="agy-export-btn" type="button" style="padding: 5px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.16); color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Export JSON
              </button>
              <button id="agy-import-toggle" type="button" style="padding: 5px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.16); color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Import JSON
              </button>
              <button id="agy-reset-btn" type="button" style="padding: 5px 10px; border-radius: 8px; background: rgba(239, 68, 68, 0.14); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Reset
              </button>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.07);">
            <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #d4d4d8; cursor: pointer;">
                <input id="agy-boot-toggle" type="checkbox" ${st.bootIntro ? 'checked' : ''} style="accent-color: ${mainTheme.primary}; cursor: pointer;" />
                Boot Intro + Tawa Voice
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #d4d4d8; cursor: pointer;">
                <input id="agy-sketch-toggle" type="checkbox" ${st.sketchReveal ? 'checked' : ''} style="accent-color: ${mainTheme.primary}; cursor: pointer;" />
                Vẽ nét → Loang màu
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #d4d4d8; cursor: pointer;">
                <input id="agy-greeting-toggle" type="checkbox" ${st.tawaGreeting ? 'checked' : ''} style="accent-color: ${mainTheme.primary}; cursor: pointer;" />
                Câu chào Custom
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #d4d4d8; cursor: pointer;">
                <input id="agy-task-voice-toggle" type="checkbox" ${st.taskVoiceEnabled ? 'checked' : ''} style="accent-color: ${mainTheme.primary}; cursor: pointer;" />
                Voice xong Task
              </label>
              <span id="agy-upload-status" style="font-size: 11.5px; color: #93c5fd;"></span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <button id="agy-working-custom-toggle" type="button" style="padding: 4px 10px; border-radius: 7px; background: rgba(255,255,255,0.08); border: 1px solid ${mainTheme.borderColor}; color: #e4e4e7; font-size: 11.5px; cursor: pointer;">
                ${escapeHtml(activeWorkingMeta.badge)} · Working ▾
              </button>
              <button id="agy-boot-auth-toggle" type="button" style="padding: 4px 10px; border-radius: 7px; background: rgba(255,255,255,0.08); border: 1px solid ${mainTheme.borderColor}; color: #e4e4e7; font-size: 11.5px; cursor: pointer;">
                ${st.bootPassHash ? '🔒 Boot Pass ▾' : '🔓 Đặt Boot Pass ▾'}
              </button>
              <button id="agy-custom-vg-toggle" type="button" style="padding: 4px 10px; border-radius: 7px; background: rgba(255,255,255,0.08); border: 1px solid ${mainTheme.borderColor}; color: #e4e4e7; font-size: 11.5px; cursor: pointer;">
                Tùy chỉnh Voice &amp; Câu chào ▾
              </button>
              <button id="agy-replay-boot-btn" type="button" style="padding: 4px 10px; border-radius: 7px; background: rgba(255,255,255,0.08); border: 1px solid ${mainTheme.borderColor}; color: #e4e4e7; font-size: 11.5px; cursor: pointer;">
                Replay Intro
              </button>
              <button id="agy-replay-reveal-btn" type="button" style="padding: 4px 10px; border-radius: 7px; background: rgba(255,255,255,0.08); border: 1px solid ${mainTheme.borderColor}; color: #e4e4e7; font-size: 11.5px; cursor: pointer;">
                Replay Vẽ Nền
              </button>
            </div>
          </div>
          <div id="agy-boot-auth-box" style="display: none; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);">
            <div style="display: flex; flex-direction: column; gap: 8px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <span style="font-size: 12.5px; font-weight: 600; color: #f4f4f5;">Tên truy cập / Operator</span>
                <span id="agy-boot-op-msg" style="font-size: 11px; color: #93c5fd;"></span>
              </div>
              <div style="display: flex; gap: 8px;">
                <input id="agy-boot-operator-input" type="text" value="${escapeHtml(resolveBootOperator(st))}" placeholder="VD: OPERATOR hoặc SENSEI" style="flex: 1; background: rgba(0,0,0,0.38); color: #f4f4f5; border: 1px solid ${mainTheme.borderColor}; border-radius: 7px; padding: 6px 9px; font-size: 12px; outline: none;" />
                <button id="agy-boot-operator-save" type="button" style="padding: 5px 12px; border-radius: 7px; background: ${mainTheme.primary}; color: #090d16; font-weight: 600; font-size: 11.5px; border: none; cursor: pointer; white-space: nowrap;">Lưu tên</button>
              </div>
              <div style="font-size: 11px; color: #71717a;">Hiển thị ở dòng 1 (TÊN TRUY CẬP / OPERATOR) và màn hình chào mừng.</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <span style="font-size: 12.5px; font-weight: 600; color: #f4f4f5;">Mật khẩu Boot HUD (UID)</span>
                <span id="agy-boot-pass-status" style="font-size: 11px; color: ${st.bootPassHash ? '#86efac' : '#fbbf24'};">${st.bootPassHash ? 'Đã thiết lập ✓' : 'Chưa đặt mật khẩu'}</span>
              </div>
              <div style="display: flex; gap: 6px; align-items: center;">
                <input id="agy-boot-pass-new" type="password" autocomplete="off" placeholder="${st.bootPassHash ? 'Nhập mật khẩu mới để đổi...' : 'Nhập mật khẩu muốn đặt...'}" style="flex: 1; background: rgba(0,0,0,0.38); color: #f4f4f5; border: 1px solid ${mainTheme.borderColor}; border-radius: 7px; padding: 6px 9px; font-size: 12px; outline: none;" />
                <button id="agy-boot-pass-vis" type="button" title="Hiện / Ẩn mật khẩu" style="padding: 5px 8px; border-radius: 7px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); color: #d4d4d8; font-size: 11.5px; cursor: pointer;">👁</button>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <span id="agy-boot-auth-msg" style="font-size: 11px; color: #93c5fd;"></span>
                <div style="display: flex; gap: 8px;">
                  <button id="agy-boot-pass-clear" type="button" style="padding: 4px 10px; border-radius: 7px; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); color: #fca5a5; font-size: 11.5px; cursor: pointer;">Xóa pass</button>
                  <button id="agy-boot-pass-save" type="button" style="padding: 4px 12px; border-radius: 7px; background: ${mainTheme.primary}; color: #090d16; font-weight: 600; font-size: 11.5px; border: none; cursor: pointer;">Lưu mật khẩu</button>
                </div>
              </div>
              <div style="font-size: 11px; color: #71717a;">Lưu dạng hash SHA-256 vào theme_config.json (chỉ 1 chế độ nhập pass, Level ∞).</div>
            </div>
          </div>
          <div id="agy-custom-vg-box" style="display: none; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);">
            <div style="display: flex; flex-direction: column; gap: 8px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-size: 12.5px; font-weight: 600; color: #f4f4f5;">Voice báo xong Task (Random)</span>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button id="agy-task-voice-test" type="button" title="Nghe thử ngẫu nhiên" style="padding: 4px 8px; border-radius: 7px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); color: #e4e4e7; font-size: 11.5px; cursor: pointer;">🎲 Test</button>
                  <label style="padding: 4px 9px; border-radius: 7px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${mainTheme.borderColor}; color: #f4f4f5; font-size: 11.5px; cursor: pointer; white-space: nowrap;">
                    Thêm Voice
                    <input id="agy-task-voice-upload" type="file" multiple accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac" style="display: none;" />
                  </label>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 11.5px; color: #a1a1aa;">Âm lượng</span>
                <input id="agy-task-voice-vol" type="range" min="0" max="100" value="${st.taskVoiceVol}" style="flex: 1; cursor: pointer; accent-color: ${mainTheme.primary}; height: 5px;" />
                <span id="agy-task-voice-vol-val" style="min-width: 34px; text-align: right; font-size: 11.5px; color: #d4d4d8;">${st.taskVoiceVol}%</span>
              </div>
              <div id="agy-task-voice-list" style="display: flex; flex-direction: column; gap: 5px; max-height: 112px; overflow-y: auto;"></div>
              <div style="font-size: 11px; color: #71717a;">Chỉ tạo Audio khi tác vụ vừa xong rồi tự hủy (0 MB RAM khi rảnh).</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <span style="font-size: 12.5px; font-weight: 600; color: #f4f4f5;">Câu chào Custom (mỗi dòng 1 câu)</span>
                <span id="agy-greeting-msg" style="font-size: 11px; color: #93c5fd;"></span>
              </div>
              <textarea id="agy-greeting-lines" rows="4" placeholder="Nhập câu chào riêng của bạn (mỗi dòng 1 câu)..." style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.38); color: #f4f4f5; border: 1px solid ${mainTheme.borderColor}; border-radius: 7px; padding: 7px 9px; font-size: 12px; resize: vertical; line-height: 1.45;">${escapeHtml((st.customGreetings || []).join('\n'))}</textarea>
              <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button id="agy-greeting-reset" type="button" style="padding: 4px 10px; border-radius: 7px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); color: #d4d4d8; font-size: 11.5px; cursor: pointer;">Xóa hết</button>
                <button id="agy-greeting-save" type="button" style="padding: 4px 12px; border-radius: 7px; background: ${mainTheme.primary}; color: #090d16; font-weight: 600; font-size: 11.5px; border: none; cursor: pointer;">Lưu câu chào</button>
              </div>
            </div>
          </div>
          <div id="agy-working-custom-box" style="display: none; flex-direction: column; gap: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; background: rgba(0,0,0,0.32); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 14px;">
              <div style="display: flex; flex-direction: column; gap: 5px; min-width: 0; flex: 1;">
                <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #a1a1aa;">Xem trước trạng thái Working (Live Preview)</span>
                <div id="agy-working-preview-stage" style="display: flex; align-items: center; min-height: 40px; overflow: hidden;">
                  <div id="agy-working-preview-el" data-testid="agent-loading" style="color: #a1a1aa; font-size: 13px;"><span>Working</span></div>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: #d4d4d8; cursor: pointer; white-space: nowrap; padding: 4px 9px; border-radius: 7px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);" title="Hiện đồng hồ đếm thời gian AI đang xử lý (áp dụng cho cả 5 style: Starlight, Chibi, Mặc định, Mecha, HUD Pill)">
                  <input id="agy-working-timer-toggle" type="checkbox" ${st.workingShowTimer !== false ? 'checked' : ''} style="accent-color: ${mainTheme.primary}; cursor: pointer;" />
                  ⏱ Hiện thời gian
                </label>
                <button id="agy-working-preview-shuffle" type="button" style="padding: 5px 10px; border-radius: 7px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); color: #e4e4e7; font-size: 11.5px; cursor: pointer; white-space: nowrap;">🎲 Đổi câu</button>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 8px;">
              ${Object.entries(workingStyleMap).map(([key, item]) => {
                const isSel = key === st.workingStyle;
                return `
                  <div class="agy-working-style-card" data-wstyle="${key}" style="border-radius: 9px; border: ${isSel ? `1.5px solid ${mainTheme.primary}` : '1px solid rgba(255,255,255,0.10)'}; background: ${isSel ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.24)'}; padding: 9px 11px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; transition: border-color 0.15s ease, background-color 0.15s ease;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                      <span style="font-size: 12px; font-weight: 600; color: #f4f4f5;">${escapeHtml(item.badge)}</span>
                      <div class="agy-wstyle-check" style="width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;">${isSel ? CHECK_SVG : ''}</div>
                    </div>
                    <span style="font-size: 10.5px; color: #a1a1aa; line-height: 1.35;">${escapeHtml(item.desc)}</span>
                  </div>
                `;
              }).join('')}
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;">
              <div style="display: flex; flex-direction: column; gap: 7px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 11px;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                  <span style="font-size: 12px; font-weight: 600; color: #f4f4f5;">Câu trạng thái Custom (mỗi dòng 1 câu)</span>
                  <span id="agy-working-text-msg" style="font-size: 11px; color: #93c5fd;"></span>
                </div>
                <textarea id="agy-working-lines" rows="3" placeholder="Để trống sẽ tự dùng bộ câu Sensei theo từng Style. Nhập mỗi dòng 1 câu để xoay ngẫu nhiên..." style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.38); color: #f4f4f5; border: 1px solid ${mainTheme.borderColor}; border-radius: 7px; padding: 6px 8px; font-size: 12px; resize: vertical; line-height: 1.4;">${escapeHtml((st.workingTexts || []).join('\n'))}</textarea>
                <div style="display: flex; justify-content: flex-end; gap: 8px;">
                  <button id="agy-working-text-reset" type="button" style="padding: 4px 10px; border-radius: 7px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); color: #d4d4d8; font-size: 11.5px; cursor: pointer;">Xóa hết</button>
                  <button id="agy-working-text-save" type="button" style="padding: 4px 12px; border-radius: 7px; background: ${mainTheme.primary}; color: #090d16; font-weight: 600; font-size: 11.5px; border: none; cursor: pointer;">Lưu câu</button>
                </div>
              </div>
              <div style="display: flex; flex-direction: column; justify-content: space-between; gap: 8px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 11px;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                  <span style="font-size: 12px; font-weight: 600; color: #f4f4f5;">Icon / GIF Chibi Mini (kiểu Chibi + Mali)</span>
                  <span id="agy-working-icon-msg" style="font-size: 11px; color: #93c5fd;"></span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div id="agy-working-icon-preview" style="width: 44px; height: 44px; flex-shrink: 0; border-radius: 10px; border: 1px solid ${mainTheme.borderColor}; background: rgba(255,255,255,0.05) ${effWorkingIconUrl ? `url('${sanitizeCssUrl(effWorkingIconUrl)}') center/contain no-repeat` : ''}; display: flex; align-items: center; justify-content: center; font-size: 16px; color: ${mainTheme.primary};">${effWorkingIconUrl ? '' : '✦'}</div>
                  <div style="display: flex; flex-direction: column; gap: 6px; flex: 1;">
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                      <label style="padding: 4px 10px; border-radius: 7px; background: rgba(255,255,255,0.08); border: 1px solid ${mainTheme.borderColor}; color: #f4f4f5; font-size: 11.5px; cursor: pointer; white-space: nowrap;">
                        Chọn GIF / Ảnh
                        <input id="agy-working-icon-upload" type="file" accept="image/gif,image/webp,image/png,image/jpeg,image/svg+xml,image/*" style="display: none;" />
                      </label>
                      <button id="agy-working-icon-clear" type="button" style="padding: 4px 9px; border-radius: 7px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); color: #d4d4d8; font-size: 11.5px; cursor: pointer;">Mặc định</button>
                    </div>
                    <span style="font-size: 10.5px; color: #71717a; line-height: 1.35;">Hỗ trợ GIF/WebP động (vd: Arona/mèo gõ phím). Để trống sẽ tự lấy sticker của preset.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div id="agy-import-box" style="display: none; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08);">
            <textarea id="agy-import-text" rows="3" placeholder='Paste exported theme config JSON here (e.g. {"themeName":"WLOP Cosmic","dimming":45,...})' style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.35); color: #f4f4f5; border: 1px solid ${mainTheme.borderColor}; border-radius: 8px; padding: 8px 10px; font-family: monospace; font-size: 12px; resize: vertical;"></textarea>
            <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
              <span id="agy-import-msg" style="font-size: 12px; color: #fca5a5;"></span>
              <button id="agy-import-apply" type="button" style="padding: 5px 12px; border-radius: 7px; background: ${mainTheme.primary}; color: #090d16; font-weight: 600; font-size: 12px; border: none; cursor: pointer;">Apply JSON</button>
            </div>
          </div>
        </div>

        <div style="border: 1px solid ${mainTheme.borderColor}; background: ${mainTheme.cardBg || 'rgba(22, 16, 14, 0.72)'}; border-radius: 12px; padding: 14px 20px; margin-bottom: 24px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 2px;">
                <span style="font-size: 14px; font-weight: 600; color: #f4f4f5;">Chat Avatars (User & AI Agent)</span>
                <span id="agy-av-msg" style="font-size: 11.5px; color: #93c5fd;"></span>
              </div>
              <div style="font-size: 12px; color: #a1a1aa;">Profile badges rendered beside chat messages (auto-compressed WebP).</div>
            </div>
            <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div id="agy-user-av-preview" style="width: 30px; height: 30px; border-radius: ${st.avatarRadius}%; border: 1.5px solid ${mainTheme.primary}; background: rgba(255,255,255,0.06) ${effUserAv ? `url('${effUserAv}') center/cover no-repeat` : ''}; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #a1a1aa;">${effUserAv ? '' : 'U'}</div>
                <label style="padding: 4px 10px; border-radius: 7px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${mainTheme.borderColor}; color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                  User
                  <input id="agy-user-av-upload" type="file" accept="image/*" style="display: none;" />
                </label>
                <button id="agy-user-av-clear" type="button" style="padding: 4px 9px; border-radius: 7px; background: transparent; border: 1px solid rgba(255, 255, 255, 0.14); color: #a1a1aa; font-size: 11.5px; cursor: pointer; transition: all 0.15s ease;">Xóa</button>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div id="agy-agent-av-preview" style="width: 30px; height: 30px; border-radius: ${st.avatarRadius}%; border: 1.5px solid ${mainTheme.secondary || mainTheme.primary}; background: rgba(255,255,255,0.06) ${effAgentAv ? `url('${effAgentAv}') center/cover no-repeat` : ''}; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #a1a1aa;">${effAgentAv ? '' : 'AI'}</div>
                <label style="padding: 4px 10px; border-radius: 7px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${mainTheme.borderColor}; color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                  Agent
                  <input id="agy-agent-av-upload" type="file" accept="image/*" style="display: none;" />
                </label>
                <button id="agy-agent-av-clear" type="button" style="padding: 4px 9px; border-radius: 7px; background: transparent; border: 1px solid rgba(255, 255, 255, 0.14); color: #a1a1aa; font-size: 11.5px; cursor: pointer; transition: all 0.15s ease;">Xóa</button>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.07);">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a1a1aa;">
              Size
              <input id="agy-av-size" type="range" min="22" max="52" value="${st.avatarSize}" style="width: 100px; cursor: pointer; accent-color: ${mainTheme.primary}; height: 5px;" />
              <span id="agy-av-size-val" style="min-width: 34px;">${st.avatarSize}px</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a1a1aa;">
              Corner Radius
              <input id="agy-av-rad" type="range" min="0" max="50" value="${st.avatarRadius}" style="width: 100px; cursor: pointer; accent-color: ${mainTheme.primary}; height: 5px;" />
              <span id="agy-av-rad-val" style="min-width: 34px;">${st.avatarRadius}%</span>
            </label>
          </div>
        </div>

        <div style="margin-bottom: 28px;">
          <div style="font-size: 15px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">User Chat Bubble</div>
          <div style="font-size: 12.5px; color: #a1a1aa; margin-bottom: 14px;">Mix and match bubble frame & ornament independently from the active wallpaper.</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            ${THEME_KEYS.map(name => {
              const th = THEMES[name];
              const isSelected = name === st.bubbleName;
              const stickerTop = th.isOrnament ? Math.round((th.stickerTop || 0) * 0.85) : Math.round((th.stickerTop || 0) * 0.74);
              const stickerW = Math.round((th.stickerW || 0) * 0.78);
              const stickerH = th.isOrnament ? Math.round((th.stickerH || 0) * 0.8) : Math.round((th.stickerH || 0) * 0.78);
              return `
                <div class="agy-bubble-card" data-name="${name}" style="position: relative; border-radius: 12px; border: ${isSelected ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)'}; background: ${isSelected ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)'}; padding: 24px 18px 14px 18px; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between; min-height: 112px; transition: border-color 0.15s ease, background-color 0.15s ease;">
                  <div style="display: flex; justify-content: center; align-items: center; width: 100%; margin-top: 6px; margin-bottom: 10px;">
                    <div style="position: relative; width: 192px; height: 46px; padding: 1.2px; border-radius: ${th.isScroll ? '6px' : '12px'}; background: ${th.frameBg}; box-shadow: 0 4px 14px rgba(0,0,0,0.45), 0 0 10px ${th.glow};">
                      <div style="position: relative; width: 100%; height: 100%; background: ${th.bg}; border: ${th.innerBorder || '1px solid ' + th.borderColor}; border-radius: ${th.isScroll ? '4px' : '11px'}; display: flex; align-items: center; padding: 0 16px;">
                        ${th.sticker ? `<div style="position: absolute; top: ${stickerTop}px; right: 8px; width: ${stickerW}px; height: ${stickerH}px; background-image: url('${th.sticker}'); background-size: contain; background-position: ${th.isOrnament ? 'center' : 'bottom center'}; background-repeat: no-repeat; pointer-events: none;"></div>` : ''}
                        <span style="font-size: 13.5px; font-weight: 500; color: ${th.textColor};">Hello ✨</span>
                      </div>
                    </div>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 13.5px; font-weight: 500; color: #e4e4e7;">${name}</span>
                    <div class="agy-card-check-slot">${isSelected ? CHECK_SVG : ''}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="margin-bottom: 28px;">
          <div style="font-size: 15px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">Composer Style</div>
          <div style="font-size: 12.5px; color: #a1a1aa; margin-bottom: 14px;">Customize the chat input frame without affecting keyboard shortcuts or attachments.</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            ${Object.entries(INPUT_STYLES).map(([key, item]) => {
              const isSelected = key === st.inputStyle;
              const activeBubbleTh = THEMES[st.bubbleName] || mainTheme;
              const previewStickerStyle = activeBubbleTh.isOrnament
                ? 'top: -12px; right: 10px; width: 72px; height: 22px; background-position: center;'
                : 'top: -22px; right: 10px; width: 32px; height: 28px; background-position: bottom center;';
              const previewInnerBg = key === 'glass'
                ? (activeBubbleTh.inputGlassBg || 'rgba(20, 15, 13, 0.45)')
                : (activeBubbleTh.inputCardBg || 'rgba(26, 18, 15, 0.92)');
              return `
                <div class="agy-input-card" data-style="${key}" style="border-radius: 12px; border: ${isSelected ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)'}; background: ${isSelected ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)'}; padding: 16px 18px; cursor: pointer; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.15s ease, background-color 0.15s ease;">
                  <div class="agy-input-preview-outer" style="position: relative; margin-top: 8px; padding: 1.5px; border-radius: 10px; background: ${key === 'double_gold' ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' : activeBubbleTh.frameBg};">
                    <div class="agy-input-preview-sticker" style="position: absolute; ${previewStickerStyle} background-image: url('${activeBubbleTh.sticker || ''}'); background-size: contain; background-repeat: no-repeat; display: ${key !== 'minimal' && activeBubbleTh.sticker ? 'block' : 'none'}; pointer-events: none;"></div>
                    <div class="agy-input-preview-inner" style="background: ${previewInnerBg}; border-radius: 9px; padding: 8px 12px; font-size: 12px; color: #a1a1aa; display: flex; justify-content: space-between; align-items: center;">
                      <span>Ask anything, @ to mention...</span>
                      <span class="agy-input-preview-turbo" style="color: ${activeBubbleTh.primary}; font-size: 11px;">Send →</span>
                    </div>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <div style="font-size: 13.5px; font-weight: 500; color: #e4e4e7;">${item.label}</div>
                      <div style="font-size: 11.5px; color: #a1a1aa;">${item.desc}</div>
                    </div>
                    <div class="agy-card-check-slot">${isSelected ? CHECK_SVG : ''}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div id="agy-presets-section"></div>
      </div>
    `;

    function updateInputPreviews(bName) {
      const activeTh = THEMES[bName] || THEMES[DEFAULT_THEME_KEY];
      container.querySelectorAll('.agy-input-card').forEach(card => {
        const key = card.dataset.style;
        const outer = card.querySelector('.agy-input-preview-outer');
        if (outer) {
          outer.style.background = key === 'double_gold'
            ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
            : activeTh.frameBg;
        }
        const inner = card.querySelector('.agy-input-preview-inner');
        if (inner) {
          inner.style.background = key === 'glass'
            ? (activeTh.inputGlassBg || 'rgba(20, 15, 13, 0.45)')
            : (activeTh.inputCardBg || 'rgba(26, 18, 15, 0.92)');
        }
        const sticker = card.querySelector('.agy-input-preview-sticker');
        if (sticker) {
          if (key !== 'minimal' && activeTh.sticker) {
            sticker.style.display = 'block';
            sticker.style.backgroundImage = `url('${activeTh.sticker}')`;
            if (activeTh.isOrnament) {
              sticker.style.top = '-12px';
              sticker.style.width = '72px';
              sticker.style.height = '22px';
              sticker.style.backgroundPosition = 'center';
            } else {
              sticker.style.top = '-22px';
              sticker.style.width = '32px';
              sticker.style.height = '28px';
              sticker.style.backgroundPosition = 'bottom center';
            }
          } else {
            sticker.style.display = 'none';
          }
        }
        const turbo = card.querySelector('.agy-input-preview-turbo');
        if (turbo) {
          turbo.style.color = activeTh.primary;
        }
      });
    }

    const slider = container.querySelector('#agy-dim-slider');
    const valLabel = container.querySelector('#agy-dim-val');
    slider.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      valLabel.textContent = v + '%';
      applyTheme({ dimming: v }, { debounceSave: true });
    });
    slider.addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      valLabel.textContent = v + '%';
      applyTheme({ dimming: v }, { debounceSave: false });
    });

    const wpToggle = container.querySelector('#agy-wp-toggle');
    wpToggle.addEventListener('change', (e) => {
      applyTheme({ wpEnabled: e.target.checked });
    });

    const modeImgBtn = container.querySelector('#agy-mode-image');
    const modeVidBtn = container.querySelector('#agy-mode-video');
    const uploadStatus = container.querySelector('#agy-upload-status');
    function syncModeButtons(activeMode) {
      if (modeImgBtn) {
        modeImgBtn.style.background = activeMode === 'image' ? 'rgba(255,255,255,0.18)' : 'transparent';
        modeImgBtn.style.color = activeMode === 'image' ? '#ffffff' : '#a1a1aa';
        modeImgBtn.style.fontWeight = activeMode === 'image' ? '600' : '400';
      }
      if (modeVidBtn) {
        modeVidBtn.style.background = activeMode === 'video' ? 'rgba(255,255,255,0.18)' : 'transparent';
        modeVidBtn.style.color = activeMode === 'video' ? '#ffffff' : '#a1a1aa';
        modeVidBtn.style.fontWeight = activeMode === 'video' ? '600' : '400';
      }
    }
    if (modeImgBtn) {
      modeImgBtn.addEventListener('click', () => {
        applyTheme({ wpMode: 'image', wpEnabled: true });
        syncModeButtons('image');
        if (wpToggle) wpToggle.checked = true;
        if (uploadStatus) uploadStatus.textContent = '';
        renderPresetsSection();
      });
    }
    if (modeVidBtn) {
      modeVidBtn.addEventListener('click', () => {
        const curSt = getState();
        const curTh = THEMES[curSt.themeName] || {};
        const hasVid = Boolean(curSt.customVideo || curTh.wallpaperVideo);
        applyTheme({ wpMode: 'video', wpEnabled: true });
        syncModeButtons('video');
        if (wpToggle) wpToggle.checked = true;
        if (uploadStatus) {
          uploadStatus.textContent = hasVid ? '' : 'Hãy chọn Furina Live hoặc một Video đã lưu bên dưới';
        }
        renderPresetsSection();
      });
    }

    const bootToggle = container.querySelector('#agy-boot-toggle');
    if (bootToggle) {
      bootToggle.addEventListener('change', (e) => {
        applyTheme({ bootIntro: e.target.checked });
      });
    }
    const sketchToggle = container.querySelector('#agy-sketch-toggle');
    if (sketchToggle) {
      sketchToggle.addEventListener('change', (e) => {
        applyTheme({ sketchReveal: e.target.checked });
      });
    }
    const greetingToggle = container.querySelector('#agy-greeting-toggle');
    if (greetingToggle) {
      greetingToggle.addEventListener('change', (e) => {
        applyTheme({ tawaGreeting: e.target.checked });
      });
    }
    function closeHostModalsForPreview() {
      const bd = document.getElementById('agy-custom-theme-modal-backdrop');
      if (bd) bd.style.display = 'none';
      const settingsBox = document.querySelector('.settings-modal-container');
      if (settingsBox) {
        const sr = settingsBox.getBoundingClientRect();
        const closeBtn = Array.from(settingsBox.querySelectorAll('button')).find((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.top - sr.top) < 64 && (sr.right - r.right) < 64;
        });
        if (closeBtn) {
          closeBtn.click();
        } else {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
        }
      }
    }
    const replayBootBtn = container.querySelector('#agy-replay-boot-btn');
    if (replayBootBtn) {
      replayBootBtn.addEventListener('click', () => {
        closeHostModalsForPreview();
        mountBootSequence(true);
      });
    }
    const replayRevealBtn = container.querySelector('#agy-replay-reveal-btn');
    if (replayRevealBtn) {
      replayRevealBtn.addEventListener('click', () => {
        closeHostModalsForPreview();
        setTimeout(() => triggerSketchBloomReveal(false), 120);
      });
    }

    function compressWallpaperImageFile(file, maxDim = 2560) {
      if (!file || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        return Promise.resolve(file);
      }
      const lowerName = String(file.name || '').toLowerCase();
      const lowerType = String(file.type || '').toLowerCase();
      if (lowerType === 'image/gif' || lowerType === 'image/svg+xml' || /\.(gif|svg)$/i.test(lowerName)) {
        return Promise.resolve(file);
      }
      return new Promise((resolve) => {
        const objUrl = URL.createObjectURL(file);
        const img = new Image();
        const cleanup = () => { try { URL.revokeObjectURL(objUrl); } catch (e) {} };
        img.onload = () => {
          try {
            const natW = img.naturalWidth || 0;
            const natH = img.naturalHeight || 0;
            const longest = Math.max(natW, natH);
            if (!longest || (longest <= maxDim && file.size <= 1.5 * 1024 * 1024)) {
              cleanup();
              resolve(file);
              return;
            }
            const scale = longest > maxDim ? (maxDim / longest) : 1;
            const targetW = Math.max(1, Math.round(natW * scale));
            const targetH = Math.max(1, Math.round(natH * scale));
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              cleanup();
              resolve(file);
              return;
            }
            ctx.drawImage(img, 0, 0, targetW, targetH);
            cleanup();
            if (typeof canvas.toBlob === 'function') {
              canvas.toBlob((blob) => {
                canvas.width = 0;
                canvas.height = 0;
                if (blob && blob.size > 0 && (longest > maxDim || blob.size < file.size)) {
                  const base = String(file.name || 'wallpaper').replace(/\.[^.]+$/, '');
                  resolve(new File([blob], `${base}.webp`, { type: 'image/webp' }));
                } else {
                  resolve(file);
                }
              }, 'image/webp', 0.88);
            } else {
              canvas.width = 0;
              canvas.height = 0;
              resolve(file);
            }
          } catch (e) {
            cleanup();
            resolve(file);
          }
        };
        img.onerror = () => {
          cleanup();
          resolve(file);
        };
        img.src = objUrl;
      });
    }

    async function uploadMediaToServer(file, fallbackName) {
      const base = window.__AGY_MEDIA_BASE_URL__ ? String(window.__AGY_MEDIA_BASE_URL__).replace(/\/+$/, '') : '';
      if (!base) return null;
      try {
        const resp = await fetch(`${base}/upload?name=${encodeURIComponent(file.name || fallbackName)}`, {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file
        });
        if (resp.ok) {
          const info = await resp.json();
          if (info && info.url) return info;
        }
      } catch (err) {}
      return null;
    }

    function triggerRevealOnReady(kind) {
      if (!getState().sketchReveal) return;
      if (kind === 'video') {
        const vidEl = document.getElementById('agy-live-bg-video');
        if (vidEl) {
          const onReady = () => triggerSketchBloomReveal(false);
          if (vidEl.readyState >= 2) onReady();
          else vidEl.addEventListener('loadeddata', onReady, { once: true });
        }
      } else {
        const imgEl = document.getElementById('agy-live-bg-img');
        if (imgEl) {
          const onReady = () => triggerSketchBloomReveal(false);
          if (imgEl.complete) onReady();
          else imgEl.addEventListener('load', onReady, { once: true });
        }
      }
    }

    const wpUpload = container.querySelector('#agy-wp-upload');
    wpUpload.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const isVideo = (file.type && file.type.startsWith('video/')) || /\.(mp4|webm|mov|m4v)$/i.test(file.name || '');
      const kind = isVideo ? 'video' : 'image';
      if (uploadStatus) uploadStatus.textContent = isVideo ? 'Đang nạp video...' : 'Đang tối ưu & nạp ảnh nền...';

      const preparedFile = isVideo ? file : await compressWallpaperImageFile(file, 2560);
      const uploaded = await uploadMediaToServer(preparedFile, isVideo ? 'custom.mp4' : 'custom.webp');
      let mediaUrl = uploaded && uploaded.url ? uploaded.url : '';
      const displayName = (uploaded && uploaded.name) || preparedFile.name || (isVideo ? 'Custom Video' : 'Custom Image');

      if (!mediaUrl) {
        if (isVideo) {
          mediaUrl = URL.createObjectURL(preparedFile);
        } else {
          mediaUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => resolve('');
            reader.readAsDataURL(preparedFile);
          });
        }
      }

      wpUpload.value = '';
      if (!mediaUrl) {
        if (uploadStatus) uploadStatus.textContent = 'Không đọc được tệp đã chọn!';
        return;
      }

      const nextList = upsertSavedMedia(kind, {
        url: mediaUrl,
        name: displayName,
        addedAt: Date.now()
      });

      if (isVideo) {
        applyTheme({ wpMode: 'video', customVideo: mediaUrl, savedVideos: nextList, wpEnabled: true });
        syncModeButtons('video');
        if (uploadStatus) uploadStatus.textContent = uploaded && uploaded.duplicate ? 'Đã chọn lại video đã lưu!' : 'Đã lưu & cập nhật video nền!';
      } else {
        applyTheme({ wpMode: 'image', customWp: mediaUrl, savedImages: nextList, wpEnabled: true });
        syncModeButtons('image');
        if (uploadStatus) uploadStatus.textContent = uploaded && uploaded.duplicate ? 'Đã chọn lại ảnh đã lưu!' : 'Đã lưu & cập nhật ảnh nền!';
      }
      if (wpToggle) wpToggle.checked = true;
      renderPresetsSection();
      triggerRevealOnReady(kind);
    });

    const reenableBtn = container.querySelector('#agy-theme-reenable-btn');
    if (reenableBtn) {
      reenableBtn.addEventListener('click', () => {
        applyTheme({ themeEnabled: true });
        syncMasterToggleUi();
        renderThemePanels(container);
      });
    }

    const userAvUpload = container.querySelector('#agy-user-av-upload');
    const userAvPreview = container.querySelector('#agy-user-av-preview');
    const userAvClear = container.querySelector('#agy-user-av-clear');
    const agentAvUpload = container.querySelector('#agy-agent-av-upload');
    const agentAvPreview = container.querySelector('#agy-agent-av-preview');
    const agentAvClear = container.querySelector('#agy-agent-av-clear');
    const avMsg = container.querySelector('#agy-av-msg');
    let avMsgTimer = 0;

    function flashAvMsg(text, color = '#93c5fd') {
      if (!avMsg) return;
      avMsg.style.color = color;
      avMsg.textContent = text;
      if (avMsgTimer) clearTimeout(avMsgTimer);
      avMsgTimer = setTimeout(() => { if (avMsg) avMsg.textContent = ''; }, 2200);
    }

    function syncAvPreview(el, url, fallbackText) {
      if (!el) return;
      if (url) {
        el.style.backgroundImage = `url("${url}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
      } else {
        el.style.backgroundImage = 'none';
        el.textContent = fallbackText;
      }
    }

    function syncAvatarClearBtns() {
      const cur = getState();
      const curTh = THEMES[cur.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
      const hasUser = Boolean(cur.userAvatar === 'none' ? '' : (cur.userAvatar || curTh.userAvatar || ''));
      const hasAgent = Boolean(cur.agentAvatar === 'none' ? '' : (cur.agentAvatar || curTh.agentAvatar || ''));
      const styleBtn = (btn, active, roleLabel) => {
        if (!btn) return;
        btn.disabled = !active;
        btn.title = active
          ? `Xóa avatar ${roleLabel}`
          : `Chưa đặt avatar ${roleLabel} (bấm nút "${roleLabel}" bên cạnh để tải ảnh)`;
        btn.style.opacity = active ? '1' : '0.42';
        btn.style.cursor = active ? 'pointer' : 'not-allowed';
        btn.style.borderColor = active ? 'rgba(239, 68, 68, 0.35)' : 'rgba(255, 255, 255, 0.14)';
        btn.style.color = active ? '#fca5a5' : '#71717a';
        btn.style.background = active ? 'rgba(239, 68, 68, 0.10)' : 'transparent';
      };
      styleBtn(userAvClear, hasUser, 'User');
      styleBtn(agentAvClear, hasAgent, 'Agent');
    }
    syncAvatarClearBtns();

    if (userAvUpload) {
      userAvUpload.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        compressAvatarFile(file, (dataUrl) => {
          userAvUpload.value = '';
          applyTheme({ userAvatar: dataUrl });
          syncAvPreview(userAvPreview, dataUrl, 'U');
          syncAvatarClearBtns();
          flashAvMsg('Đã cập nhật avatar User ✓', '#86efac');
        });
      });
    }
    if (userAvClear) {
      userAvClear.addEventListener('click', () => {
        if (userAvClear.disabled) return;
        applyTheme({ userAvatar: 'none' });
        syncAvPreview(userAvPreview, '', 'U');
        syncAvatarClearBtns();
        flashAvMsg('Đã xóa avatar User', '#fbbf24');
      });
    }
    if (agentAvUpload) {
      agentAvUpload.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        compressAvatarFile(file, (dataUrl) => {
          agentAvUpload.value = '';
          applyTheme({ agentAvatar: dataUrl });
          syncAvPreview(agentAvPreview, dataUrl, 'AI');
          syncAvatarClearBtns();
          flashAvMsg('Đã cập nhật avatar Agent ✓', '#86efac');
        });
      });
    }
    if (agentAvClear) {
      agentAvClear.addEventListener('click', () => {
        if (agentAvClear.disabled) return;
        applyTheme({ agentAvatar: 'none' });
        syncAvPreview(agentAvPreview, '', 'AI');
        syncAvatarClearBtns();
        flashAvMsg('Đã xóa avatar Agent', '#fbbf24');
      });
    }

    const blurSlider = container.querySelector('#agy-blur-slider');
    const blurLabel = container.querySelector('#agy-blur-val');
    if (blurSlider) {
      blurSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (blurLabel) blurLabel.textContent = v + 'px';
        applyTheme({ glassBlur: v }, { debounceSave: true });
      });
      blurSlider.addEventListener('change', (e) => {
        const v = parseInt(e.target.value, 10);
        if (blurLabel) blurLabel.textContent = v + 'px';
        applyTheme({ glassBlur: v }, { debounceSave: false });
      });
    }

    const avSizeSlider = container.querySelector('#agy-av-size');
    const avSizeVal = container.querySelector('#agy-av-size-val');
    if (avSizeSlider) {
      avSizeSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (avSizeVal) avSizeVal.textContent = v + 'px';
        applyTheme({ avatarSize: v }, { debounceSave: true });
      });
      avSizeSlider.addEventListener('change', (e) => {
        const v = parseInt(e.target.value, 10);
        if (avSizeVal) avSizeVal.textContent = v + 'px';
        applyTheme({ avatarSize: v }, { debounceSave: false });
      });
    }

    const avRadSlider = container.querySelector('#agy-av-rad');
    const avRadVal = container.querySelector('#agy-av-rad-val');
    if (avRadSlider) {
      avRadSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (avRadVal) avRadVal.textContent = v + '%';
        if (userAvPreview) userAvPreview.style.borderRadius = v + '%';
        if (agentAvPreview) agentAvPreview.style.borderRadius = v + '%';
        applyTheme({ avatarRadius: v }, { debounceSave: true });
      });
      avRadSlider.addEventListener('change', (e) => {
        const v = parseInt(e.target.value, 10);
        if (avRadVal) avRadVal.textContent = v + '%';
        applyTheme({ avatarRadius: v }, { debounceSave: false });
      });
    }

    const exportBtn = container.querySelector('#agy-export-btn');
    const importToggle = container.querySelector('#agy-import-toggle');
    const importBox = container.querySelector('#agy-import-box');
    const importText = container.querySelector('#agy-import-text');
    const importApply = container.querySelector('#agy-import-apply');
    const importMsg = container.querySelector('#agy-import-msg');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const exportObj = { ...getState() };
        delete exportObj.bootPassHash;
        const json = JSON.stringify(exportObj, null, 2);
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(json).then(() => {
            exportBtn.textContent = 'Copied ✓';
            setTimeout(() => { exportBtn.textContent = 'Export JSON'; }, 1500);
          }).catch(() => {
            if (importBox && importText) {
              importBox.style.display = 'flex';
              importText.value = json;
              importText.select();
            }
          });
        } else if (importBox && importText) {
          importBox.style.display = 'flex';
          importText.value = json;
          importText.select();
        }
      });
    }
    if (importToggle && importBox) {
      importToggle.addEventListener('click', () => {
        importBox.style.display = importBox.style.display === 'none' ? 'flex' : 'none';
        if (importMsg) importMsg.textContent = '';
      });
    }
    if (importApply && importText) {
      importApply.addEventListener('click', () => {
        try {
          const parsed = JSON.parse(importText.value.trim());
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Config must be a JSON object');
          }
          const allowed = {};
          const keys = ['themeEnabled', 'themeName', 'bubbleName', 'inputStyle', 'dimming', 'wpEnabled', 'wpMode', 'customWp', 'customVideo', 'savedImages', 'savedVideos', 'taskVoices', 'taskVoiceEnabled', 'taskVoiceVol', 'customGreetings', 'userAvatar', 'agentAvatar', 'glassBlur', 'avatarSize', 'avatarRadius', 'bootIntro', 'bootOperator', 'sketchReveal', 'tawaGreeting', 'mechaWorking', 'workingStyle', 'workingTexts', 'workingIcon', 'workingShowTimer'];
          keys.forEach((k) => {
            if (parsed[k] !== undefined) allowed[k] = parsed[k];
          });
          applyTheme(allowed);
          syncMasterToggleUi();
          renderThemePanels(container);
        } catch (err) {
          if (importMsg) importMsg.textContent = 'Invalid JSON: ' + err.message;
        }
      });
    }

    const resetBtn = container.querySelector('#agy-reset-btn');
    resetBtn.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_THEME_ENABLED);
      localStorage.removeItem(STORAGE_CUSTOM_WP);
      localStorage.removeItem(STORAGE_CUSTOM_VIDEO);
      localStorage.removeItem(STORAGE_WP_MODE);
      localStorage.removeItem(STORAGE_USER_AVATAR);
      localStorage.removeItem(STORAGE_AGENT_AVATAR);
      localStorage.removeItem(STORAGE_GLASS_BLUR);
      localStorage.removeItem(STORAGE_AVATAR_SIZE);
      localStorage.removeItem(STORAGE_AVATAR_RADIUS);
      localStorage.removeItem(STORAGE_THEME);
      localStorage.removeItem(STORAGE_BUBBLE);
      localStorage.removeItem(STORAGE_INPUT);
      localStorage.removeItem(STORAGE_DIMMING);
      localStorage.removeItem(STORAGE_WP_ENABLED);
      localStorage.removeItem(STORAGE_BOOT_INTRO);
      localStorage.removeItem(STORAGE_SKETCH_REVEAL);
      localStorage.removeItem(STORAGE_TAWA_GREETING);
      localStorage.removeItem(STORAGE_MECHA_WORKING);
      localStorage.removeItem(STORAGE_WORKING_STYLE);
      localStorage.removeItem(STORAGE_WORKING_TEXTS);
      localStorage.removeItem(STORAGE_WORKING_ICON);
      localStorage.removeItem(STORAGE_WORKING_SHOW_TIMER);
      localStorage.removeItem(STORAGE_TASK_VOICE_ENABLED);
      localStorage.removeItem(STORAGE_TASK_VOICE_VOL);
      localStorage.removeItem(STORAGE_CUSTOM_GREETINGS);
      const defTh = THEMES[DEFAULT_THEME_KEY] || {};
      const defMode = defTh.wallpaperVideo ? 'video' : 'image';
      applyTheme({
        themeEnabled: true,
        themeName: DEFAULT_THEME_KEY,
        bubbleName: DEFAULT_THEME_KEY,
        inputStyle: 'sync',
        dimming: 69,
        wpEnabled: true,
        wpMode: defMode,
        customWp: '',
        customVideo: '',
        taskVoiceEnabled: true,
        taskVoiceVol: 85,
        customGreetings: [],
        userAvatar: '',
        agentAvatar: '',
        glassBlur: 3,
        avatarSize: 32,
        avatarRadius: 50,
        bootIntro: true,
        sketchReveal: true,
        tawaGreeting: true,
        mechaWorking: true,
        workingStyle: 'mecha',
        workingTexts: [],
        workingIcon: '',
        workingShowTimer: true
      });
      syncModeButtons(defMode);
      syncMasterToggleUi();
      if (bootToggle) bootToggle.checked = true;
      if (sketchToggle) sketchToggle.checked = true;
      if (greetingToggle) greetingToggle.checked = true;
      if (typeof syncWorkingUiState === 'function') syncWorkingUiState();
      if (taskVoiceToggle) taskVoiceToggle.checked = true;
      if (taskVoiceVolSlider) taskVoiceVolSlider.value = 85;
      if (taskVoiceVolVal) taskVoiceVolVal.textContent = '85%';
      if (greetingLinesEl) greetingLinesEl.value = '';
      renderTaskVoiceList();
      window.__AGY_GREETING_NEED_FRESH__ = true;
      syncEmptyGreeting();
      if (uploadStatus) uploadStatus.textContent = '';
      syncAvPreview(userAvPreview, defTh.userAvatar || '', 'U');
      syncAvPreview(agentAvPreview, defTh.agentAvatar || '', 'AI');
      syncAvatarClearBtns();
      if (userAvPreview) userAvPreview.style.borderRadius = '50%';
      if (agentAvPreview) agentAvPreview.style.borderRadius = '50%';
      if (slider) slider.value = 69;
      if (valLabel) valLabel.textContent = '69%';
      if (blurSlider) blurSlider.value = 3;
      if (blurLabel) blurLabel.textContent = '3px';
      if (avSizeSlider) avSizeSlider.value = 32;
      if (avSizeVal) avSizeVal.textContent = '32px';
      if (avRadSlider) avRadSlider.value = 50;
      if (avRadVal) avRadVal.textContent = '50%';
      if (wpToggle) wpToggle.checked = true;

      renderPresetsSection();
      container.querySelectorAll('.agy-bubble-card').forEach(b => {
        const isSel = b.dataset.name === DEFAULT_THEME_KEY;
        b.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
        b.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
        const slot = b.querySelector('.agy-card-check-slot');
        if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
      });
      container.querySelectorAll('.agy-input-card').forEach(c => {
        const isSel = c.dataset.style === 'sync';
        c.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
        c.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
        const slot = c.querySelector('.agy-card-check-slot');
        if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
      });
      updateInputPreviews(DEFAULT_THEME_KEY);
    });

    const taskVoiceToggle = container.querySelector('#agy-task-voice-toggle');
    const customVgToggle = container.querySelector('#agy-custom-vg-toggle');
    const customVgBox = container.querySelector('#agy-custom-vg-box');
    const taskVoiceUpload = container.querySelector('#agy-task-voice-upload');
    const taskVoiceTestBtn = container.querySelector('#agy-task-voice-test');
    const taskVoiceVolSlider = container.querySelector('#agy-task-voice-vol');
    const taskVoiceVolVal = container.querySelector('#agy-task-voice-vol-val');
    const taskVoiceListEl = container.querySelector('#agy-task-voice-list');
    const greetingLinesEl = container.querySelector('#agy-greeting-lines');
    const greetingSaveBtn = container.querySelector('#agy-greeting-save');
    const greetingResetBtn = container.querySelector('#agy-greeting-reset');
    const greetingMsgEl = container.querySelector('#agy-greeting-msg');

    function renderTaskVoiceList() {
      if (!taskVoiceListEl) return;
      const voices = getMediaLibrary('audio');
      if (voices.length === 0) {
        taskVoiceListEl.innerHTML = `<div style="font-size: 11.5px; color: #71717a; padding: 6px 2px;">Chưa có file voice nào. Bấm "Thêm Voice" để nạp 1 hoặc nhiều file .mp3/.wav/.ogg/.m4a.</div>`;
        return;
      }
      taskVoiceListEl.innerHTML = voices.map((v, idx) => `
        <div style="display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.03);">
          <span style="font-size: 10.5px; color: #93c5fd; min-width: 16px;">#${idx + 1}</span>
          <span style="flex: 1; font-size: 11.5px; color: #e4e4e7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(v.name)}">${escapeHtml(v.name)}</span>
          <button type="button" class="agy-tv-play-btn" data-url="${escapeHtml(v.url)}" title="Nghe thử" style="padding: 2px 6px; border-radius: 5px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); color: #e4e4e7; font-size: 10.5px; cursor: pointer;">▶</button>
          <button type="button" class="agy-tv-del-btn" data-url="${escapeHtml(v.url)}" title="Xóa voice" style="padding: 2px 6px; border-radius: 5px; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.28); color: #fca5a5; font-size: 10.5px; cursor: pointer;">✕</button>
        </div>
      `).join('');

      taskVoiceListEl.querySelectorAll('.agy-tv-play-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const url = btn.dataset.url || '';
          if (url) playOneShotTaskAudio(url, getState().taskVoiceVol);
        });
      });
      taskVoiceListEl.querySelectorAll('.agy-tv-del-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const url = btn.dataset.url || '';
          if (url) deleteSavedMediaItem('audio', url);
        });
      });
    }

    if (taskVoiceToggle) {
      taskVoiceToggle.addEventListener('change', (e) => {
        applyTheme({ taskVoiceEnabled: e.target.checked });
      });
    }
    if (taskVoiceVolSlider) {
      taskVoiceVolSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (taskVoiceVolVal) taskVoiceVolVal.textContent = v + '%';
        applyTheme({ taskVoiceVol: v }, { debounceSave: true });
      });
      taskVoiceVolSlider.addEventListener('change', (e) => {
        const v = parseInt(e.target.value, 10);
        if (taskVoiceVolVal) taskVoiceVolVal.textContent = v + '%';
        applyTheme({ taskVoiceVol: v }, { debounceSave: false });
      });
    }
    if (taskVoiceTestBtn) {
      taskVoiceTestBtn.addEventListener('click', () => {
        playRandomTaskVoice(true);
      });
    }
    if (taskVoiceUpload) {
      taskVoiceUpload.addEventListener('change', async (e) => {
        const files = Array.from((e.target && e.target.files) || []);
        if (files.length === 0) return;
        if (uploadStatus) uploadStatus.textContent = `Đang nạp ${files.length} voice...`;
        let nextVoices = getMediaLibrary('audio');
        for (const file of files) {
          const uploaded = await uploadMediaToServer(file, 'task_voice.mp3');
          let mediaUrl = uploaded && uploaded.url ? uploaded.url : '';
          const displayName = (uploaded && uploaded.name) || file.name || 'Task Voice';
          if (!mediaUrl) {
            mediaUrl = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ''));
              reader.onerror = () => resolve('');
              reader.readAsDataURL(file);
            });
          }
          if (mediaUrl) {
            nextVoices = upsertSavedMedia('audio', { url: mediaUrl, name: displayName, addedAt: Date.now() });
          }
        }
        taskVoiceUpload.value = '';
        applyTheme({ taskVoices: nextVoices, taskVoiceEnabled: true });
        if (taskVoiceToggle) taskVoiceToggle.checked = true;
        if (uploadStatus) uploadStatus.textContent = `Đã thêm ${files.length} voice (${nextVoices.length} tổng)!`;
        renderTaskVoiceList();
      });
    }

    const bootAuthToggle = container.querySelector('#agy-boot-auth-toggle');
    const bootAuthBox = container.querySelector('#agy-boot-auth-box');
    const bootOpInput = container.querySelector('#agy-boot-operator-input');
    const bootOpSave = container.querySelector('#agy-boot-operator-save');
    const bootOpMsg = container.querySelector('#agy-boot-op-msg');
    const bootPassInput = container.querySelector('#agy-boot-pass-new');
    const bootPassVis = container.querySelector('#agy-boot-pass-vis');
    const bootPassSave = container.querySelector('#agy-boot-pass-save');
    const bootPassClear = container.querySelector('#agy-boot-pass-clear');
    const bootPassStatus = container.querySelector('#agy-boot-pass-status');
    const bootAuthMsg = container.querySelector('#agy-boot-auth-msg');

    function syncBootAuthLabels() {
      const hasP = Boolean(getState().bootPassHash);
      const isOpen = bootAuthBox && bootAuthBox.style.display !== 'none';
      if (bootAuthToggle) {
        bootAuthToggle.textContent = `${hasP ? '🔒 Boot Pass' : '🔓 Đặt Boot Pass'} ${isOpen ? '▴' : '▾'}`;
      }
      if (bootPassStatus) {
        bootPassStatus.textContent = hasP ? 'Đã thiết lập ✓' : 'Chưa đặt mật khẩu';
        bootPassStatus.style.color = hasP ? '#86efac' : '#fbbf24';
      }
      if (bootPassInput) {
        bootPassInput.placeholder = hasP ? 'Nhập mật khẩu mới để đổi...' : 'Nhập mật khẩu muốn đặt...';
      }
    }

    if (bootAuthToggle && bootAuthBox) {
      bootAuthToggle.addEventListener('click', () => {
        const isHidden = bootAuthBox.style.display === 'none';
        bootAuthBox.style.display = isHidden ? 'grid' : 'none';
        syncBootAuthLabels();
      });
    }
    if (bootOpSave && bootOpInput) {
      const saveOp = () => {
        const name = bootOpInput.value.trim();
        applyTheme({ bootOperator: name });
        if (bootOpMsg) {
          bootOpMsg.textContent = name ? `Đã lưu: ${name.toUpperCase()}` : 'Đã đặt về mặc định';
          setTimeout(() => { if (bootOpMsg) bootOpMsg.textContent = ''; }, 2000);
        }
      };
      bootOpSave.addEventListener('click', saveOp);
      bootOpInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveOp();
        }
      });
    }
    if (bootPassVis && bootPassInput) {
      bootPassVis.addEventListener('click', () => {
        const show = bootPassInput.type === 'password';
        bootPassInput.type = show ? 'text' : 'password';
        bootPassVis.style.color = show ? '#60a5fa' : '#d4d4d8';
        bootPassInput.focus();
      });
    }
    if (bootPassSave && bootPassInput) {
      const savePass = () => {
        const raw = bootPassInput.value;
        if (!raw || !raw.trim()) {
          if (bootAuthMsg) {
            bootAuthMsg.style.color = '#fca5a5';
            bootAuthMsg.textContent = 'Vui lòng nhập mật khẩu!';
          }
          bootPassInput.focus();
          return;
        }
        const hashed = hashBootPasscode(raw);
        applyTheme({ bootPassHash: hashed });
        bootPassInput.value = '';
        bootPassInput.type = 'password';
        if (bootPassVis) bootPassVis.style.color = '#d4d4d8';
        syncBootAuthLabels();
        if (bootAuthMsg) {
          bootAuthMsg.style.color = '#86efac';
          bootAuthMsg.textContent = 'Đã lưu mật khẩu mới ✓';
          setTimeout(() => { if (bootAuthMsg) bootAuthMsg.textContent = ''; }, 2400);
        }
      };
      bootPassSave.addEventListener('click', savePass);
      bootPassInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          savePass();
        }
      });
    }
    if (bootPassClear) {
      bootPassClear.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_BOOT_PASS_HASH);
        applyTheme({ bootPassHash: '' });
        if (bootPassInput) bootPassInput.value = '';
        syncBootAuthLabels();
        if (bootAuthMsg) {
          bootAuthMsg.style.color = '#fbbf24';
          bootAuthMsg.textContent = 'Đã xóa mật khẩu Boot HUD';
          setTimeout(() => { if (bootAuthMsg) bootAuthMsg.textContent = ''; }, 2400);
        }
      });
    }

    if (customVgToggle && customVgBox) {
      customVgToggle.addEventListener('click', () => {
        const isHidden = customVgBox.style.display === 'none';
        customVgBox.style.display = isHidden ? 'grid' : 'none';
        customVgToggle.textContent = isHidden ? 'Tùy chỉnh Voice & Câu chào ▴' : 'Tùy chỉnh Voice & Câu chào ▾';
      });
    }
    if (greetingSaveBtn && greetingLinesEl) {
      greetingSaveBtn.addEventListener('click', () => {
        const lines = normalizeGreetingLines(greetingLinesEl.value.split(/\r?\n/));
        applyTheme({ customGreetings: lines, tawaGreeting: true });
        if (greetingToggle) greetingToggle.checked = true;
        window.__AGY_GREETING_NEED_FRESH__ = true;
        syncEmptyGreeting();
        if (greetingMsgEl) {
          greetingMsgEl.textContent = lines.length > 0 ? `Đã lưu (${lines.length} câu)` : 'Đã xóa câu chào custom';
          setTimeout(() => { if (greetingMsgEl) greetingMsgEl.textContent = ''; }, 2000);
        }
      });
    }
    if (greetingResetBtn && greetingLinesEl) {
      greetingResetBtn.addEventListener('click', () => {
        greetingLinesEl.value = '';
        applyTheme({ customGreetings: [] });
        window.__AGY_GREETING_NEED_FRESH__ = true;
        syncEmptyGreeting();
        if (greetingMsgEl) {
          greetingMsgEl.textContent = 'Đã xóa danh sách câu chào';
          setTimeout(() => { if (greetingMsgEl) greetingMsgEl.textContent = ''; }, 2000);
        }
      });
    }

    const workingCustomToggle = container.querySelector('#agy-working-custom-toggle');
    const workingCustomBox = container.querySelector('#agy-working-custom-box');
    const workingPreviewEl = container.querySelector('#agy-working-preview-el');
    const workingTimerToggle = container.querySelector('#agy-working-timer-toggle');
    const workingPreviewShuffle = container.querySelector('#agy-working-preview-shuffle');
    const workingLinesEl = container.querySelector('#agy-working-lines');
    const workingTextSaveBtn = container.querySelector('#agy-working-text-save');
    const workingTextResetBtn = container.querySelector('#agy-working-text-reset');
    const workingTextMsgEl = container.querySelector('#agy-working-text-msg');
    const workingIconPreview = container.querySelector('#agy-working-icon-preview');
    const workingIconUpload = container.querySelector('#agy-working-icon-upload');
    const workingIconClear = container.querySelector('#agy-working-icon-clear');
    const workingIconMsg = container.querySelector('#agy-working-icon-msg');

    function syncWorkingUiState() {
      const cur = getState();
      const curTh = THEMES[cur.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
      const meta = workingStyleMap[cur.workingStyle] || workingStyleMap.mecha;
      const isOpen = workingCustomBox && workingCustomBox.style.display !== 'none';
      if (workingCustomToggle) {
        workingCustomToggle.textContent = `${meta.badge} · Working ${isOpen ? '▴' : '▾'}`;
      }
      if (workingTimerToggle) {
        workingTimerToggle.checked = cur.workingShowTimer !== false;
      }
      container.querySelectorAll('.agy-working-style-card').forEach((card) => {
        const isSel = card.dataset.wstyle === cur.workingStyle;
        card.style.border = isSel ? `1.5px solid ${curTh.primary || '#c084fc'}` : '1px solid rgba(255,255,255,0.10)';
        card.style.background = isSel ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.24)';
        const slot = card.querySelector('.agy-wstyle-check');
        if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
      });
      if (workingLinesEl && document.activeElement !== workingLinesEl) {
        workingLinesEl.value = (cur.workingTexts || []).join('\n');
      }
      if (workingIconPreview) {
        const curAgent = cur.agentAvatar === 'none' ? '' : (cur.agentAvatar || curTh.agentAvatar || '');
        const resolvedIcon = resolveMediaUrl(cur.workingIcon || curTh.sticker || curAgent || '');
        if (resolvedIcon) {
          workingIconPreview.style.backgroundImage = `url("${sanitizeCssUrl(resolvedIcon)}")`;
          workingIconPreview.style.backgroundSize = 'contain';
          workingIconPreview.style.backgroundPosition = 'center';
          workingIconPreview.style.backgroundRepeat = 'no-repeat';
          workingIconPreview.textContent = '';
        } else {
          workingIconPreview.style.backgroundImage = 'none';
          workingIconPreview.textContent = '✦';
        }
      }
      if (workingPreviewEl) {
        delete workingPreviewEl.dataset.agyTelemLine;
        delete workingPreviewEl.dataset.agyTelemSig;
        workingPreviewEl.dataset.agyTelemStart = String(Date.now());
      }
      if (typeof syncWorkingTelemetry === 'function') syncWorkingTelemetry();
    }

    if (workingCustomToggle && workingCustomBox) {
      workingCustomToggle.addEventListener('click', () => {
        const isHidden = workingCustomBox.style.display === 'none';
        workingCustomBox.style.display = isHidden ? 'flex' : 'none';
        syncWorkingUiState();
      });
    }
    if (workingTimerToggle) {
      workingTimerToggle.addEventListener('change', (e) => {
        applyTheme({ workingShowTimer: e.target.checked });
        syncWorkingUiState();
      });
    }
    if (workingPreviewShuffle && workingPreviewEl) {
      workingPreviewShuffle.addEventListener('click', () => {
        delete workingPreviewEl.dataset.agyTelemLine;
        workingPreviewEl.dataset.agyTelemStart = String(Date.now());
        if (typeof syncWorkingTelemetry === 'function') syncWorkingTelemetry();
      });
    }
    container.querySelectorAll('.agy-working-style-card').forEach((card) => {
      card.addEventListener('click', () => {
        const nextStyle = card.dataset.wstyle || 'mecha';
        applyTheme({ workingStyle: nextStyle });
        syncWorkingUiState();
      });
    });
    if (workingTextSaveBtn && workingLinesEl) {
      workingTextSaveBtn.addEventListener('click', () => {
        const lines = normalizeGreetingLines(workingLinesEl.value.split(/\r?\n/));
        applyTheme({ workingTexts: lines });
        syncWorkingUiState();
        if (workingTextMsgEl) {
          workingTextMsgEl.textContent = lines.length > 0 ? `Đã lưu (${lines.length} câu)` : 'Đang dùng câu mặc định';
          setTimeout(() => { if (workingTextMsgEl) workingTextMsgEl.textContent = ''; }, 2000);
        }
      });
    }
    if (workingTextResetBtn && workingLinesEl) {
      workingTextResetBtn.addEventListener('click', () => {
        workingLinesEl.value = '';
        applyTheme({ workingTexts: [] });
        syncWorkingUiState();
        if (workingTextMsgEl) {
          workingTextMsgEl.textContent = 'Đã khôi phục mặc định';
          setTimeout(() => { if (workingTextMsgEl) workingTextMsgEl.textContent = ''; }, 2000);
        }
      });
    }
    if (workingIconUpload) {
      workingIconUpload.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (workingIconMsg) workingIconMsg.textContent = 'Đang nạp icon...';
        const uploaded = await uploadMediaToServer(file, file.name || 'working_icon.gif');
        let iconUrl = uploaded && uploaded.url ? uploaded.url : '';
        if (!iconUrl) {
          iconUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => resolve('');
            reader.readAsDataURL(file);
          });
        }
        workingIconUpload.value = '';
        if (!iconUrl) {
          if (workingIconMsg) workingIconMsg.textContent = 'Không đọc được tệp!';
          return;
        }
        applyTheme({ workingIcon: iconUrl });
        syncWorkingUiState();
        if (workingIconMsg) {
          workingIconMsg.textContent = getState().workingStyle === 'chibi_mali' ? 'Đã cập nhật icon ✓' : 'Đã lưu (chọn Chibi + Mali để xem)';
          setTimeout(() => { if (workingIconMsg) workingIconMsg.textContent = ''; }, 2600);
        }
      });
    }
    if (workingIconClear) {
      workingIconClear.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_WORKING_ICON);
        applyTheme({ workingIcon: '' });
        syncWorkingUiState();
        if (workingIconMsg) {
          workingIconMsg.textContent = 'Đã về icon mặc định';
          setTimeout(() => { if (workingIconMsg) workingIconMsg.textContent = ''; }, 2000);
        }
      });
    }

    async function deleteSavedMediaItem(kind, targetUrl) {
      const isVideo = kind === 'video';
      const isAudio = kind === 'audio';
      const base = window.__AGY_MEDIA_BASE_URL__ ? String(window.__AGY_MEDIA_BASE_URL__).replace(/\/+$/, '') : '';
      if (base && canonicalMediaKey(targetUrl).startsWith('user_media/')) {
        try {
          const resp = await fetch(`${base}/delete_media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: targetUrl })
          });
          if (resp.ok) {
            const info = await resp.json();
            if (info && info.media) {
              window.__AGY_USER_MEDIA__ = info.media;
            }
          }
        } catch (err) {}
      }

      const nextList = removeSavedMediaFromStore(kind, targetUrl);
      const curSt = getState();
      const patch = isVideo ? { savedVideos: nextList } : (isAudio ? { taskVoices: nextList } : { savedImages: nextList });
      if (isVideo && isSameMediaUrl(curSt.customVideo, targetUrl)) {
        patch.customVideo = '';
      } else if (!isVideo && !isAudio && isSameMediaUrl(curSt.customWp, targetUrl)) {
        patch.customWp = '';
      }
      applyTheme(patch);
      if (uploadStatus) {
        uploadStatus.textContent = isVideo ? 'Đã xóa video khỏi thư viện!' : (isAudio ? 'Đã xóa voice khỏi danh sách!' : 'Đã xóa ảnh khỏi thư viện!');
      }
      if (isAudio) {
        renderTaskVoiceList();
      } else {
        renderPresetsSection();
      }
    }

    function renderPresetsSection() {
      const host = container.querySelector('#agy-presets-section');
      if (!host) return;
      const curSt = getState();
      const isVideoTab = curSt.wpMode === 'video';
      const builtInKeys = THEME_KEYS.filter((name) => {
        const th = THEMES[name] || {};
        const isLive = Boolean(th.wallpaperVideo || th.mediaType === 'video');
        return isVideoTab ? isLive : !isLive;
      });
      const savedItems = getMediaLibrary(isVideoTab ? 'video' : 'image');
      const totalCount = builtInKeys.length + savedItems.length;

      const headerBadge = document.getElementById('agy-custom-theme-badge');
      if (headerBadge) {
        headerBadge.textContent = `${totalCount} ${isVideoTab ? 'Video' : 'Ảnh'}`;
      }

      const builtInHtml = builtInKeys.map((name) => {
        const th = THEMES[name];
        const activeCustom = isVideoTab ? curSt.customVideo : curSt.customWp;
        const isSelected = name === curSt.themeName && !activeCustom;
        const wpThumb = resolveMediaUrl(th.wallpaper);
        const thumbBg = wpThumb
          ? `linear-gradient(180deg, rgba(0,0,0,0.15), rgba(14,12,12,0.85)), url('${sanitizeCssUrl(wpThumb)}')`
          : (th.pureBg || th.bg);
        const thumbOrnamentStyle = th.isOrnament
          ? 'right: 10px; bottom: 8px; width: 76px; height: 24px; background-position: center;'
          : 'right: 12px; bottom: 4px; width: 42px; height: 38px; background-position: bottom center;';
        return `
          <div class="agy-preset-card" data-name="${escapeHtml(name)}" style="border-radius: 12px; border: ${isSelected ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)'}; background: rgba(14, 12, 12, 0.82); overflow: hidden; cursor: pointer; display: flex; flex-direction: column; transition: border-color 0.15s ease;">
            <div style="height: 68px; width: 100%; background-image: ${thumbBg}; background-size: cover; background-position: ${th.bgPosition || 'center'}; position: relative; display: flex; align-items: flex-end; padding: 8px 14px;">
              ${th.sticker ? `<div style="position: absolute; ${thumbOrnamentStyle} background-image: url('${th.sticker}'); background-size: contain; background-repeat: no-repeat; pointer-events: none;"></div>` : ''}
              <span style="font-size: 13.5px; font-weight: 600; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,0.7);">${escapeHtml(name)}</span>
            </div>
            <div style="padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; color: #a1a1aa;">${escapeHtml(th.concept || '')}</span>
              <div class="agy-card-check-slot">${isSelected ? CHECK_SVG : ''}</div>
            </div>
          </div>
        `;
      }).join('');

      const savedHtml = savedItems.map((item) => {
        const resolvedUrl = resolveMediaUrl(item.url);
        const isSelected = isVideoTab
          ? isSameMediaUrl(curSt.customVideo, item.url)
          : isSameMediaUrl(curSt.customWp, item.url);
        const displayName = item.name || deriveMediaName(item.url, isVideoTab ? 'Saved Video' : 'Saved Image');
        const deleteBtnHtml = `
          <button type="button" class="agy-saved-delete-btn" data-url="${escapeHtml(item.url)}" title="Xóa khỏi thư viện" style="position: absolute; top: 8px; right: 8px; z-index: 4; width: 24px; height: 24px; border-radius: 9999px; border: 1px solid rgba(255, 255, 255, 0.22); background: rgba(10, 12, 18, 0.72); color: #fca5a5; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: background-color 0.15s ease, border-color 0.15s ease;">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        `;
        const previewInner = isVideoTab
          ? `
            <video class="agy-saved-vid-thumb" src="${escapeHtml(resolvedUrl)}#t=0.5" muted loop playsinline preload="metadata" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none;"></video>
            <div style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.12), rgba(14,12,12,0.86)); pointer-events: none;"></div>
            <span style="position: absolute; top: 8px; left: 10px; z-index: 3; font-size: 10px; font-weight: 600; letter-spacing: 0.4px; padding: 2px 6px; border-radius: 9999px; background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(56, 189, 248, 0.35); color: #bae6fd;">VIDEO</span>
          `
          : `
            <div style="position: absolute; inset: 0; background-image: linear-gradient(180deg, rgba(0,0,0,0.12), rgba(14,12,12,0.86)), url('${sanitizeCssUrl(resolvedUrl)}'); background-size: cover; background-position: center; pointer-events: none;"></div>
            <span style="position: absolute; top: 8px; left: 10px; z-index: 3; font-size: 10px; font-weight: 600; letter-spacing: 0.4px; padding: 2px 6px; border-radius: 9999px; background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(251, 191, 36, 0.35); color: #fde68a;">ẢNH</span>
          `;

        return `
          <div class="agy-saved-media-card" data-url="${escapeHtml(item.url)}" data-kind="${isVideoTab ? 'video' : 'image'}" style="border-radius: 12px; border: ${isSelected ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)'}; background: rgba(14, 12, 12, 0.82); overflow: hidden; cursor: pointer; display: flex; flex-direction: column; transition: border-color 0.15s ease;">
            <div style="height: 68px; width: 100%; position: relative; display: flex; align-items: flex-end; padding: 8px 14px; background: rgba(18, 20, 28, 0.9);">
              ${previewInner}
              ${deleteBtnHtml}
              <span style="position: relative; z-index: 3; font-size: 13px; font-weight: 600; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,0.85); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;">${escapeHtml(displayName)}</span>
            </div>
            <div style="padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; color: #a1a1aa;">${isVideoTab ? 'Video đã lưu' : 'Ảnh tĩnh đã lưu'}</span>
              <div class="agy-card-check-slot">${isSelected ? CHECK_SVG : ''}</div>
            </div>
          </div>
        `;
      }).join('');

      host.innerHTML = `
        <div style="font-size: 15px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">Theme Presets — ${isVideoTab ? 'Video động' : 'Ảnh tĩnh'} (${totalCount})</div>
        <div style="font-size: 12.5px; color: #a1a1aa; margin-bottom: 14px;">${isVideoTab ? 'Live wallpaper mặc định & toàn bộ video nền bạn đã từng chọn.' : 'Preset tĩnh mặc định & toàn bộ ảnh nền bạn đã từng chọn.'}</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          ${builtInHtml}
          ${savedHtml}
        </div>
      `;

      host.querySelectorAll('.agy-preset-card').forEach((card) => {
        card.addEventListener('click', () => {
          const name = card.dataset.name;
          if (isVideoTab) {
            applyTheme({ themeName: name, bubbleName: name, customVideo: '', wpMode: 'video', wpEnabled: true });
          } else {
            applyTheme({ themeName: name, bubbleName: name, customWp: '', wpMode: 'image', wpEnabled: true });
          }
          if (wpToggle) wpToggle.checked = true;
          if (uploadStatus) uploadStatus.textContent = '';

          container.querySelectorAll('.agy-bubble-card').forEach((b) => {
            const isSel = b.dataset.name === name;
            b.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
            b.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
            const slot = b.querySelector('.agy-card-check-slot');
            if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
          });

          updateInputPreviews(name);
          renderPresetsSection();
        });
      });

      host.querySelectorAll('.agy-saved-media-card').forEach((card) => {
        const vidThumb = card.querySelector('.agy-saved-vid-thumb');
        if (vidThumb) {
          card.addEventListener('mouseenter', () => {
            vidThumb.play().catch(() => {});
          });
          card.addEventListener('mouseleave', () => {
            vidThumb.pause();
          });
        }
        card.addEventListener('click', () => {
          const url = card.dataset.url || '';
          const kind = card.dataset.kind || 'image';
          if (!url) return;
          if (kind === 'video') {
            applyTheme({ wpMode: 'video', customVideo: url, wpEnabled: true });
            syncModeButtons('video');
            if (uploadStatus) uploadStatus.textContent = '';
          } else {
            applyTheme({ wpMode: 'image', customWp: url, wpEnabled: true });
            syncModeButtons('image');
            if (uploadStatus) uploadStatus.textContent = '';
          }
          if (wpToggle) wpToggle.checked = true;
          renderPresetsSection();
          triggerRevealOnReady(kind);
        });
      });

      host.querySelectorAll('.agy-saved-delete-btn').forEach((btn) => {
        btn.addEventListener('mouseenter', () => {
          btn.style.background = 'rgba(220, 38, 38, 0.85)';
          btn.style.borderColor = 'rgba(248, 113, 113, 0.9)';
          btn.style.color = '#ffffff';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'rgba(10, 12, 18, 0.72)';
          btn.style.borderColor = 'rgba(255, 255, 255, 0.22)';
          btn.style.color = '#fca5a5';
        });
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const url = btn.dataset.url || '';
          if (!url) return;
          deleteSavedMediaItem(isVideoTab ? 'video' : 'image', url);
        });
      });
    }

    renderPresetsSection();
    renderTaskVoiceList();

    (async () => {
      const base = window.__AGY_MEDIA_BASE_URL__ ? String(window.__AGY_MEDIA_BASE_URL__).replace(/\/+$/, '') : '';
      if (!base) return;
      try {
        const resp = await fetch(`${base}/user_media_list`);
        if (!resp.ok) return;
        const info = await resp.json();
        if (info && info.ok) {
          window.__AGY_USER_MEDIA__ = {
            images: Array.isArray(info.images) ? info.images : [],
            videos: Array.isArray(info.videos) ? info.videos : [],
            audios: Array.isArray(info.audios) ? info.audios : []
          };
          if (document.body.contains(container)) {
            renderPresetsSection();
            renderTaskVoiceList();
          }
        }
      } catch (err) {}
    })();

    container.querySelectorAll('.agy-bubble-card').forEach(card => {
      card.addEventListener('click', () => {
        const name = card.dataset.name;
        applyTheme({ bubbleName: name });

        container.querySelectorAll('.agy-bubble-card').forEach(b => {
          const isSel = b.dataset.name === name;
          b.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
          b.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
          const slot = b.querySelector('.agy-card-check-slot');
          if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
        });

        updateInputPreviews(name);
      });
    });

    container.querySelectorAll('.agy-input-card').forEach(card => {
      card.addEventListener('click', () => {
        const styleKey = card.dataset.style;
        applyTheme({ inputStyle: styleKey });

        container.querySelectorAll('.agy-input-card').forEach(c => {
          const isSel = c.dataset.style === styleKey;
          c.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
          c.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
          const slot = c.querySelector('.agy-card-check-slot');
          if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
        });
      });
    });
  }

  return openCustomThemeModal();
};
