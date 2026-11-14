

const state = {
  all: [],
  filter: 'all',
  favorites: JSON.parse(localStorage.getItem('recipeFavorites') || '[]'),
};

const placeholder =
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80';

let recipeMap = null;
let markerGroup = null;

/* ---------- Toast ---------- */
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => t.remove(), 3000);
}

/* ---------- Skeletons ---------- */
function showSkeletons(n = 6) {
  const c = document.getElementById('recipe-container');
  c.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'recipe skeleton-card';
    s.innerHTML = `
      <div class="skeleton-img shimmer"></div>
      <div class="recipe-content">
        <div class="skeleton-line shimmer" style="height:22px;width:80%"></div>
      </div>`;
    c.appendChild(s);
  }
}

/* ---------- Render ---------- */
function render(recipes) {
  const c = document.getElementById('recipe-container');
  c.innerHTML = '';

  if (!recipes.length) {
    c.innerHTML = `<div class="no-results"><i class="fas fa-utensils"></i><h3>No recipes found</h3></div>`;
    return;
  }

  recipes.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = 'recipe';
    el.dataset.id = r.id;
    el.style.animationDelay = `${i * 50}ms`;
    el.innerHTML = `
      <div class="recipe-badge ${r.source}">${r.source === 'local' ? 'Local' : 'API'}</div>
      <div class="recipe-img-container">
        <img src="${r.image}" alt="${r.title}" loading="lazy"
             onerror="this.src='${placeholder}'">
      </div>
      <div class="recipe-content">
        <h3>${r.title}</h3>
        <div class="recipe-tags">
          <span class="recipe-tag">${r.category || 'Main Dish'}</span>
          ${r.location ? `<span class="recipe-tag"><i class="fas fa-map-marker-alt"></i> ${r.location.country}</span>` : ''}
        </div>
        <button data-id="${r.id}" data-source="${r.source}">
          <i class="fas fa-book-open"></i> View Recipe
        </button>
      </div>`;
    el.querySelector('button').addEventListener('click', (e) =>
      viewRecipe(e.currentTarget.dataset.id, e.currentTarget.dataset.source)
    );
    c.appendChild(el);
  });
}

/* ---------- Filter ---------- */
function applyFilter(filter) {
  state.filter = filter;
  document.querySelectorAll('.filter-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.filter === filter)
  );

  const map = {
    all: () => true,
    local: (r) => r.source === 'local',
    api: (r) => r.source === 'api',
    gari: (r) =>
      r.title.toLowerCase().includes('gari') ||
      (r.ingredients && r.ingredients.some((i) => i.toLowerCase().includes('gari'))),
    soup: (r) =>
      r.title.toLowerCase().includes('soup') ||
      (r.category || '').toLowerCase().includes('soup'),
  };
  render(state.all.filter(map[filter] || map.all));
}

/* ============================================
   MAP
   ============================================ */
function initMap(recipes) {
  const el = document.getElementById('recipe-map');
  if (!el || typeof L === 'undefined') return;
  if (recipeMap) return; // already initialized

  recipeMap = L.map('recipe-map', {
    scrollWheelZoom: false,
    worldCopyJump: true,
  }).setView([8.5, 3.5], 3);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(recipeMap);

  markerGroup = L.layerGroup().addTo(recipeMap);
  refreshMarkers(recipes);
}

/* Custom green pin icon */
function createPinIcon() {
  return L.divIcon({
    className: 'map-pin',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

function refreshMarkers(recipes) {
  if (!markerGroup) return;
  markerGroup.clearLayers();

  const located = recipes.filter((r) => r.location && r.location.lat);
  const bounds = [];

  located.forEach((recipe) => {
    const { lat, lng, country } = recipe.location;
    const marker = L.marker([lat, lng], { icon: createPinIcon() });

    marker.bindPopup(`
      <strong>${recipe.title}</strong>
      <span style="color:#666;font-size:0.85rem">${country}</span>
    `);

    // Bonus: click marker → scroll to + highlight card
    marker.on('click', () => {
      const card = document.querySelector(`.recipe[data-id="${recipe.id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.remove('highlighted');
        void card.offsetWidth; // force reflow to restart animation
        card.classList.add('highlighted');
        setTimeout(() => card.classList.remove('highlighted'), 1800);
      }
    });

    marker.addTo(markerGroup);
    bounds.push([lat, lng]);
  });

  // Fit map to show all markers
  if (bounds.length > 1) {
    recipeMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 });
  } else if (bounds.length === 1) {
    recipeMap.setView(bounds[0], 6);
  }
}

/* ============================================
   SEARCH
   ============================================ */
async function search() {
  const input = document.getElementById('ingredient-input').value.trim();
  if (!input) return toast('Enter an ingredient', 'error');

  showSkeletons();
  try {
    const meals = await fetch(
      `/api/search?ingredients=${encodeURIComponent(input)}`
    ).then((r) => r.json());

    meals.forEach((m) => {
      if (!state.all.some((r) => r.id === m.idMeal)) {
        state.all.push({
          id: m.idMeal,
          title: m.strMeal,
          image: m.strMealThumb,
          source: 'api',
          category: 'Main Dish',
          // API recipes have no location/nutrition — leave undefined
        });
      }
    });
    applyFilter(state.filter);
    refreshMarkers(state.all);
  } catch {
    toast('Search failed', 'error');
  }
}

/* ============================================
   MODAL (with nutrition + health)
   ============================================ */
async function viewRecipe(id, source) {
  let recipe = state.all.find((r) => String(r.id) === String(id));

  // If API recipe has no instructions yet, fetch them
  if (source === 'api' && !recipe?.instructions) {
    try {
      const full = await fetch(`/api/recipe/${id}`).then((r) => r.json());
      recipe = { ...recipe, ...full };
    } catch {
      return toast('Could not load recipe', 'error');
    }
  }
  if (!recipe) return;

  // Header
  document.getElementById('modal-title').textContent = recipe.title;
  document.getElementById('modal-image').src = recipe.image || placeholder;
  document.getElementById('modal-source').textContent =
    recipe.source === 'local' ? 'Local Recipe' : 'TheMealDB';
  document.getElementById('modal-category').textContent = recipe.category || 'Main Dish';
  document.getElementById('modal-prep-time').textContent = recipe.prepTime || '30–45 min';

  // Ingredients
  const list = document.getElementById('modal-ingredients');
  list.innerHTML = '';
  (recipe.ingredients || []).forEach((ing) => {
    const li = document.createElement('li');
    li.textContent = ing;
    list.appendChild(li);
  });

  // Instructions
  document.getElementById('modal-instructions').textContent =
    recipe.instructions || 'Instructions unavailable.';

  // Nutrition
  renderNutrition(recipe.nutrition);

  // Health
  renderHealth(recipe.health);

  // Save button
  document.getElementById('save-recipe-btn').onclick = () => saveRecipe(recipe);

  document.getElementById('recipe-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function renderNutrition(n) {
  const el = document.getElementById('modal-nutrition');
  if (!el) return;

  if (!n) {
    el.innerHTML = `<p style="color:#666;font-size:0.9rem">Nutrition data not available for this recipe.</p>`;
    return;
  }

  const items = [
    { label: 'Calories', value: n.calories, unit: 'kcal' },
    { label: 'Protein', value: n.protein, unit: 'g' },
    { label: 'Carbs', value: n.carbs, unit: 'g' },
    { label: 'Fat', value: n.fat, unit: 'g' },
    { label: 'Fiber', value: n.fiber, unit: 'g' },
    { label: 'Sodium', value: n.sodium, unit: 'mg' },
  ];

  el.innerHTML = items
    .filter((i) => i.value != null)
    .map(
      (i) => `
      <div class="nutrition-item">
        <div class="nutrition-value">${i.value}<small>${i.unit}</small></div>
        <div class="nutrition-label">${i.label}</div>
      </div>`
    )
    .join('');
}

function renderHealth(h) {
  const el = document.getElementById('modal-health');
  if (!el) return;

  if (!h) {
    el.innerHTML = `<p style="color:#666;font-size:0.9rem">Health data not available.</p>`;
    return;
  }

  let html = '';

  if (h.benefits?.length) {
    html += `
      <div class="health-group benefits">
        <div class="health-group-title benefits">
          <i class="fas fa-circle-check"></i> Benefits
        </div>
        <ul>${h.benefits.map((b) => `<li>${b}</li>`).join('')}</ul>
      </div>`;
  }

  if (h.risks?.length) {
    html += `
      <div class="health-group risks">
        <div class="health-group-title risks">
          <i class="fas fa-triangle-exclamation"></i> Watch out for
        </div>
        <ul>${h.risks.map((r) => `<li>${r}</li>`).join('')}</ul>
      </div>`;
  }

  if (h.tags?.length) {
    html += `<div class="health-tags">${h.tags
      .map((t) => `<span class="health-tag">${t}</span>`)
      .join('')}</div>`;
  }

  el.innerHTML = html || `<p style="color:#666;font-size:0.9rem">No details available.</p>`;
}

/* ---------- Favorites ---------- */
function saveRecipe(recipe) {
  const exists = state.favorites.some(
    (f) => String(f.id) === String(recipe.id) && f.source === recipe.source
  );
  if (exists) return toast('Already in favorites', 'error');

  state.favorites.push({
    id: recipe.id,
    source: recipe.source,
    title: recipe.title,
    savedAt: new Date().toISOString(),
  });
  localStorage.setItem('recipeFavorites', JSON.stringify(state.favorites));
  toast(`"${recipe.title}" saved!`);
}

function closeModal() {
  document.getElementById('recipe-modal').style.display = 'none';
  document.body.style.overflow = '';
}

/* ============================================
   INIT
   ============================================ */
async function init() {
  showSkeletons();

  try {
    const data = await fetch('/recipes.json').then((r) => r.json());
    state.all = (data.recipes || []).map((r) => ({
      ...r,
      id: `local-${r.id}`, // keep ids unique
      source: 'local',
      category: r.title.toLowerCase().includes('soup') ? 'Soup' : 'Main Dish',
      prepTime: '30–45 min',
      instructions: Array.isArray(r.instructions)
        ? r.instructions.join('\n')
        : r.instructions,
    }));

    render(state.all);
    initMap(state.all); 
  } catch (err) {
    console.error(err);
    toast('Could not load local recipes', 'error');
  }

  // Filters
  document.querySelectorAll('.filter-btn').forEach((b) =>
    b.addEventListener('click', () => applyFilter(b.dataset.filter))
  );

  // Search
  document.getElementById('search-button').addEventListener('click', search);
  document.getElementById('ingredient-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') search();
  });

  // Modal
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('close-modal-btn').addEventListener('click', closeModal);
  document.getElementById('recipe-modal').addEventListener('click', (e) => {
    if (e.target.id === 'recipe-modal') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

window.addEventListener('DOMContentLoaded', init);