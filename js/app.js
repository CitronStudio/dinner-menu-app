(function () {
  const state = {
    seasonalAll: [],
    selected: new Set(),
    lastSales: null,
  };

  const el = {
    monthLabel: document.getElementById("season-month-label"),
    chips: document.getElementById("season-chips"),
    salesBody: document.getElementById("sales-body"),
    btnRefreshSales: document.getElementById("btn-refresh-sales"),
    ngInput: document.getElementById("ng-input"),
    extraInput: document.getElementById("extra-input"),
    btnSuggest: document.getElementById("btn-suggest"),
    resultSection: document.getElementById("section-result"),
    resultBody: document.getElementById("result-body"),
  };

  const LS_KEYS = { ng: "dma_ng_text", extra: "dma_extra_text", picks: "dma_picks" };

  function currentMonth() {
    return new Date().getMonth() + 1;
  }

  function apiHeaders(extra) {
    return Object.assign(
      { "content-type": "application/json" },
      APP_CONFIG.APP_KEY ? { "x-app-key": APP_CONFIG.APP_KEY } : {},
      extra || {}
    );
  }

  function renderSeasonChips() {
    const month = currentMonth();
    el.monthLabel.textContent = `${month}月が旬の食材（タップして選択、複数選択可）`;
    const items = state.seasonalAll.filter((i) => i.months.includes(month));
    el.chips.innerHTML = "";
    if (items.length === 0) {
      el.chips.innerHTML = '<p class="hint">該当データがありません</p>';
      return;
    }
    items.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (state.selected.has(item.name) ? " selected" : "");
      chip.innerHTML = `${item.name}<span class="cat-tag">${item.category}</span>`;
      chip.addEventListener("click", () => {
        if (state.selected.has(item.name)) {
          state.selected.delete(item.name);
        } else {
          state.selected.add(item.name);
        }
        localStorage.setItem(LS_KEYS.picks, JSON.stringify([...state.selected]));
        renderSeasonChips();
      });
      el.chips.appendChild(chip);
    });
  }

  async function loadSeasonalData() {
    try {
      const res = await fetch("data/seasonal_ingredients.json");
      state.seasonalAll = await res.json();
    } catch (e) {
      el.chips.innerHTML = '<p class="hint">旬の食材データの読み込みに失敗しました</p>';
      return;
    }
    const savedPicks = JSON.parse(localStorage.getItem(LS_KEYS.picks) || "[]");
    state.selected = new Set(savedPicks);
    renderSeasonChips();
  }

  function renderSales(data) {
    if (!data || !data.stores || data.stores.length === 0) {
      el.salesBody.innerHTML = `<p class="hint">${(data && data.note) || "対象スーパーが未設定です。"}</p>`;
      return;
    }
    el.salesBody.innerHTML = "";
    data.stores.forEach((s) => {
      const div = document.createElement("div");
      div.className = "sale-store";
      if (s.error) {
        div.innerHTML = `<h3>${s.name}</h3><p class="error">取得失敗: ${s.error}</p>`;
      } else {
        div.innerHTML = `<h3>${s.name}</h3><p class="hint">取得済み（提案生成時にAIが内容を読み取ります）</p>`;
      }
      el.salesBody.appendChild(div);
    });
  }

  async function refreshSales() {
    el.btnRefreshSales.disabled = true;
    el.btnRefreshSales.textContent = "取得中…";
    el.salesBody.innerHTML = '<p class="hint"><span class="spinner"></span>特売情報を取得しています…</p>';
    try {
      const res = await fetch(`${APP_CONFIG.API_BASE}/api/sales`, { headers: apiHeaders() });
      const data = await res.json();
      state.lastSales = data.stores || null;
      renderSales(data);
    } catch (e) {
      el.salesBody.innerHTML = `<p class="hint error">取得エラー: ${e}</p>`;
    } finally {
      el.btnRefreshSales.disabled = false;
      el.btnRefreshSales.textContent = "特売情報を取得";
    }
  }

  function renderRecipes(result) {
    el.resultSection.hidden = false;
    if (!result || !result.recipes) {
      el.resultBody.textContent = "うまく提案を生成できませんでした。もう一度お試しください。";
      return;
    }
    el.resultBody.innerHTML = "";
    result.recipes.forEach((r) => {
      const block = document.createElement("div");
      block.className = "recipe-block";
      const tags = [];
      if (r.uses_seasonal) tags.push(`旬: ${r.uses_seasonal}`);
      if (r.uses_sale_item) tags.push(`特売: ${r.uses_sale_item}`);
      if (r.time_minutes) tags.push(`約${r.time_minutes}分`);
      block.innerHTML = `
        <h3>${r.title}</h3>
        <p>${r.summary || ""}</p>
        <p class="hint">${(r.main_ingredients || []).join("・")}</p>
        <p class="hint">${tags.join(" / ")}</p>
      `;
      el.resultBody.appendChild(block);
    });
    if (result.notes) {
      const notesEl = document.createElement("p");
      notesEl.className = "hint";
      notesEl.textContent = result.notes;
      el.resultBody.appendChild(notesEl);
    }
  }

  async function suggest() {
    el.btnSuggest.disabled = true;
    el.btnSuggest.textContent = "考え中…";
    el.resultSection.hidden = false;
    el.resultBody.innerHTML = '<p class="hint"><span class="spinner"></span>献立を考えています…</p>';

    const payload = {
      month: currentMonth(),
      seasonalPicks: [...state.selected],
      ngText: el.ngInput.value,
      extraText: el.extraInput.value,
      sales: state.lastSales || undefined,
    };

    try {
      const res = await fetch(`${APP_CONFIG.API_BASE}/api/suggest`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) {
        el.resultBody.innerHTML = `<p class="hint error">エラー: ${data.error}</p>`;
      } else if (data.result) {
        renderRecipes(data.result);
      } else if (data.raw) {
        el.resultBody.textContent = data.raw;
      }
    } catch (e) {
      el.resultBody.innerHTML = `<p class="hint error">通信エラー: ${e}</p>`;
    } finally {
      el.btnSuggest.disabled = false;
      el.btnSuggest.textContent = "献立を提案してもらう";
    }
  }

  function restoreTextFields() {
    el.ngInput.value = localStorage.getItem(LS_KEYS.ng) || "";
    el.extraInput.value = localStorage.getItem(LS_KEYS.extra) || "";
    el.ngInput.addEventListener("input", () => localStorage.setItem(LS_KEYS.ng, el.ngInput.value));
    el.extraInput.addEventListener("input", () => localStorage.setItem(LS_KEYS.extra, el.extraInput.value));
  }

  el.btnRefreshSales.addEventListener("click", refreshSales);
  el.btnSuggest.addEventListener("click", suggest);

  restoreTextFields();
  loadSeasonalData();
})();
