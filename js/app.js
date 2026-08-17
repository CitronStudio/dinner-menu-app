(function () {
  const state = {
    seasonalAll: [],
    recipesAll: [],
    selectedSeasonal: new Set(),
    timeLimit: "",
  };

  const el = {
    monthLabel: document.getElementById("season-month-label"),
    seasonChips: document.getElementById("season-chips"),
    timeChips: document.getElementById("time-chips"),
    salesInput: document.getElementById("sales-input"),
    btnSuggest: document.getElementById("btn-suggest"),
    resultSection: document.getElementById("section-result"),
    resultBody: document.getElementById("result-body"),
  };

  const LS_KEYS = { sales: "dma_sales_text", picks: "dma_picks" };

  function currentMonth() {
    return new Date().getMonth() + 1;
  }

  function renderSeasonChips() {
    const month = currentMonth();
    el.monthLabel.textContent = `${month}月が旬の食材（タップして選択、複数選択可）`;
    const items = state.seasonalAll.filter((i) => i.months.includes(month));
    el.seasonChips.innerHTML = "";
    if (items.length === 0) {
      el.seasonChips.innerHTML = '<p class="hint">該当データがありません</p>';
      return;
    }
    items.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (state.selectedSeasonal.has(item.name) ? " selected" : "");
      chip.innerHTML = `${item.name}<span class="cat-tag">${item.category}</span>`;
      chip.addEventListener("click", () => {
        if (state.selectedSeasonal.has(item.name)) {
          state.selectedSeasonal.delete(item.name);
        } else {
          state.selectedSeasonal.add(item.name);
        }
        localStorage.setItem(LS_KEYS.picks, JSON.stringify([...state.selectedSeasonal]));
        renderSeasonChips();
      });
      el.seasonChips.appendChild(chip);
    });
  }

  function setupTimeChips() {
    const chips = [...el.timeChips.querySelectorAll(".chip")];
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        chips.forEach((c) => c.classList.remove("selected"));
        chip.classList.add("selected");
        state.timeLimit = chip.dataset.time;
      });
    });
  }

  async function loadData() {
    try {
      const [seasonalRes, recipesRes] = await Promise.all([
        fetch("data/seasonal_ingredients.json"),
        fetch("data/recipes.json"),
      ]);
      state.seasonalAll = await seasonalRes.json();
      state.recipesAll = await recipesRes.json();
    } catch (e) {
      el.seasonChips.innerHTML = '<p class="hint">データの読み込みに失敗しました</p>';
      return;
    }
    const savedPicks = JSON.parse(localStorage.getItem(LS_KEYS.picks) || "[]");
    state.selectedSeasonal = new Set(savedPicks);
    renderSeasonChips();
  }

  function parseSaleTokens(text) {
    return text
      .split(/[,、\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function toKatakana(str) {
    return str.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  }

  function matches(pickedName, recipeIngredient) {
    const a = toKatakana(pickedName);
    const b = toKatakana(recipeIngredient);
    return a.includes(b) || b.includes(a);
  }

  function scoreRecipe(recipe, seasonalPicks, saleTokens) {
    const seasonalHits = seasonalPicks.filter((picked) =>
      recipe.main_ingredients.some((ing) => matches(picked, ing))
    );
    const saleHits = saleTokens.filter((token) =>
      recipe.main_ingredients.some((ing) => matches(token, ing))
    );
    return {
      score: seasonalHits.length * 2 + saleHits.length * 3,
      seasonalHits,
      saleHits,
    };
  }

  function renderRecipes(picked) {
    el.resultSection.hidden = false;
    if (picked.length === 0) {
      el.resultBody.innerHTML = '<p class="hint">条件に合うレシピが見つかりませんでした。時間の目安を変えてお試しください。</p>';
      return;
    }
    el.resultBody.innerHTML = "";
    picked.forEach(({ recipe, seasonalHits, saleHits }) => {
      const block = document.createElement("div");
      block.className = "recipe-block";
      const tags = [];
      if (saleHits.length) tags.push(`特売: ${saleHits.join("・")}`);
      if (seasonalHits.length) tags.push(`旬: ${seasonalHits.join("・")}`);
      tags.push(`約${recipe.time_minutes}分`);
      tags.push(recipe.category);
      block.innerHTML = `
        <h3>${recipe.title}</h3>
        <p>${recipe.summary || ""}</p>
        <p class="hint">${recipe.main_ingredients.join("・")}</p>
        <p class="hint">${tags.join(" / ")}</p>
      `;
      el.resultBody.appendChild(block);
    });
  }

  function suggest() {
    const seasonalPicks = [...state.selectedSeasonal];
    const saleTokens = parseSaleTokens(el.salesInput.value);
    const timeLimit = state.timeLimit ? Number(state.timeLimit) : null;

    let candidates = state.recipesAll
      .filter((r) => !timeLimit || r.time_minutes <= timeLimit)
      .map((r) => ({ recipe: r, ...scoreRecipe(r, seasonalPicks, saleTokens) }));

    const hasConditions = seasonalPicks.length > 0 || saleTokens.length > 0;

    if (hasConditions) {
      candidates = candidates.filter((c) => c.score > 0);
      candidates.sort((a, b) => b.score - a.score || a.recipe.time_minutes - b.recipe.time_minutes);
      candidates = candidates.slice(0, 6);
    } else {
      candidates = shuffle(candidates).slice(0, 5);
    }

    renderRecipes(candidates);
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function restoreTextFields() {
    el.salesInput.value = localStorage.getItem(LS_KEYS.sales) || "";
    el.salesInput.addEventListener("input", () => localStorage.setItem(LS_KEYS.sales, el.salesInput.value));
  }

  el.btnSuggest.addEventListener("click", suggest);

  setupTimeChips();
  restoreTextFields();
  loadData();
})();
