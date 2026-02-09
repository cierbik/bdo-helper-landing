// ============================================================================
// BDO Helper - Dashboard Logic with Aggregation Groups
// ============================================================================
// English comment: Main dashboard logic handling waste limit groups,
// dynamic UI generation, and waste code search functionality

// ============================================================================
// GLOBAL STATE
// ============================================================================

let currentUser = null;
let supabaseClient = null;

// English comment: Cache for waste codes to avoid repeated database queries
let wasteCodesCache = [];

// English comment: Cache for limit groups
let limitGroupsCache = {};

// English comment: User's waste entries for current year
let userEntriesCache = [];

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * English comment: Initialize dashboard when page loads
 * Sets up Supabase client, checks authentication, and loads data
 */
async function initDashboard() {
    console.log("🚀 Dashboard: Starting initialization...");

    // English comment: Check if Supabase library is loaded
    if (typeof supabase === 'undefined') {
        console.error("❌ Error: Supabase library not loaded from CDN!");
        showError("Błąd ładowania biblioteki Supabase");
        return;
    }

    try {
        // English comment: Create Supabase client
        supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        console.log("✅ Dashboard: Client created");

        // English comment: Check authentication
        const { data: { session }, error } = await supabaseClient.auth.getSession();

        if (error || !session) {
            console.warn("⚠️ No session, redirecting to login");
            window.location.href = 'login.html';
            return;
        }

        console.log("👤 User authenticated:", session.user.email);
        currentUser = session.user;

        // English comment: Fill basic UI info
        document.getElementById('userEmail').textContent = session.user.email;
        document.getElementById('currentYear').textContent = new Date().getFullYear();

        // English comment: Load all necessary data
        await loadAllData();

        // English comment: Populate waste code search in modal
        await populateWasteCodeSearch();

        // English comment: Set today's date as default in form
        document.getElementById('entryDate').valueAsDate = new Date();

    } catch (err) {
        console.error("💥 Dashboard initialization failed:", err);
        showError("Wystąpił błąd podczas inicjalizacji aplikacji");
    }
}

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * English comment: Load all required data from Supabase
 * Fetches waste codes, limit groups, and user entries
 */
async function loadAllData() {
    console.log("📊 Loading all data...");

    try {
        // English comment: Show loading state
        showLoading(true);

        // English comment: Load waste codes with their groups
        const { data: wasteCodes, error: codesError } = await supabaseClient
            .from('waste_codes')
            .select('*')
            .order('waste_code');

        if (codesError) throw codesError;

        wasteCodesCache = wasteCodes || [];
        console.log(`✅ Loaded ${wasteCodesCache.length} waste codes`);

        // English comment: Load limit groups
        const { data: limitGroups, error: groupsError } = await supabaseClient
            .from('waste_limit_groups')
            .select('*');

        if (groupsError) throw groupsError;

        // English comment: Convert array to object for faster lookup
        limitGroupsCache = {};
        (limitGroups || []).forEach(group => {
            limitGroupsCache[group.group_key] = group;
        });
        console.log(`✅ Loaded ${Object.keys(limitGroupsCache).length} limit groups`);

        // English comment: Load user's waste entries for current year
        await loadUserEntries();

        // English comment: Calculate aggregated data and render UI
        renderDashboard();

        // English comment: Hide loading state
        showLoading(false);

    } catch (error) {
        console.error("❌ Error loading data:", error);
        showError("Błąd ładowania danych: " + error.message);
        showLoading(false);
    }
}

/**
 * English comment: Load user's waste entries for current year
 */
async function loadUserEntries() {
    const currentYear = new Date().getFullYear();
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;

    const { data: entries, error } = await supabaseClient
        .from('waste_entries')
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('entry_date', yearStart)
        .lte('entry_date', yearEnd)
        .order('entry_date', { ascending: false });

    if (error) throw error;

    userEntriesCache = entries || [];
    console.log(`✅ Loaded ${userEntriesCache.length} user entries`);
}

// ============================================================================
// DATA AGGREGATION
// ============================================================================

/**
 * English comment: Calculate aggregated waste data
 * Groups entries by aggregation_group or individual waste_code
 * Returns object with totals and limits for each group/code
 */
function calculateAggregatedData() {
    console.log("🧮 Calculating aggregated data...");

    const aggregated = {};

    // English comment: Process each user entry
    userEntriesCache.forEach(entry => {
        const wasteCode = entry.waste_code;
        const weight = parseFloat(entry.weight_kg) || 0;

        // English comment: Find waste code definition
        const codeInfo = wasteCodesCache.find(c => c.waste_code === wasteCode);

        if (!codeInfo) {
            console.warn(`⚠️ Unknown waste code: ${wasteCode}`);
            return;
        }

        // English comment: Determine if this code belongs to a group
        const groupKey = codeInfo.aggregation_group;

        if (groupKey) {
            // English comment: Code belongs to aggregation group
            if (!aggregated[groupKey]) {
                const groupInfo = limitGroupsCache[groupKey];
                aggregated[groupKey] = {
                    type: 'group',
                    key: groupKey,
                    name: groupInfo ? groupInfo.name : groupKey,
                    limit_kg: groupInfo ? groupInfo.limit_kg : 0,
                    total_kg: 0,
                    codes: []
                };
            }
            aggregated[groupKey].total_kg += weight;

            // English comment: Track which codes contributed to this group
            if (!aggregated[groupKey].codes.includes(wasteCode)) {
                aggregated[groupKey].codes.push(wasteCode);
            }
        } else {
            // English comment: Individual code with its own limit
            if (!aggregated[wasteCode]) {
                aggregated[wasteCode] = {
                    type: 'individual',
                    key: wasteCode,
                    name: codeInfo.name,
                    limit_kg: codeInfo.individual_limit_kg || 0,
                    total_kg: 0,
                    codes: [wasteCode]
                };
            }
            aggregated[wasteCode].total_kg += weight;
        }
    });

    console.log("✅ Aggregation complete:", aggregated);
    return aggregated;
}

// ============================================================================
// UI RENDERING
// ============================================================================

/**
 * English comment: Render complete dashboard UI
 * Generates annual summary and dynamic limit cards
 */
function renderDashboard() {
    console.log("🎨 Rendering dashboard...");

    const aggregatedData = calculateAggregatedData();

    // English comment: Render annual summary (top section)
    renderAnnualSummary(aggregatedData);

    // English comment: Render dynamic limit cards
    renderLimitCards(aggregatedData);
}

/**
 * English comment: Render annual summary section
 * Shows total weight and breakdown by group/code
 */
function renderAnnualSummary(aggregatedData) {
    const summaryContainer = document.getElementById('reportsSummary');
    if (!summaryContainer) return;

    let grandTotal = 0;
    const summaryHTML = [];

    // English comment: Generate summary rows for each group/code
    Object.values(aggregatedData).forEach(item => {
        grandTotal += item.total_kg;

        summaryHTML.push(`
            <div class="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div class="flex-1">
                    <span class="font-bold text-slate-700">${item.name}</span>
                    ${item.type === 'group' ? `
                        <div class="text-xs text-gray-500 mt-1">
                            Kody: ${item.codes.join(', ')}
                        </div>
                    ` : `
                        <div class="text-xs text-gray-500 mt-1">
                            ${item.key}
                        </div>
                    `}
                </div>
                <span class="font-bold text-emerald-600">${item.total_kg.toFixed(1)} kg</span>
            </div>
        `);
    });

    // English comment: Update summary container
    if (summaryHTML.length === 0) {
        summaryContainer.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                Brak wpisów za bieżący rok
            </div>
        `;
    } else {
        summaryContainer.innerHTML = summaryHTML.join('');
    }

    // English comment: Update grand totals
    const totalWeightEl = document.getElementById('totalWeight');
    const totalMgEl = document.getElementById('totalWeightMg');
    if (totalWeightEl) totalWeightEl.textContent = `${grandTotal.toFixed(1)} kg`;
    if (totalMgEl) totalMgEl.textContent = `${(grandTotal / 1000).toFixed(3)} Mg`;
}

/**
 * English comment: Render dynamic limit cards
 * Creates progress bars for each group/code with limit tracking
 */
function renderLimitCards(aggregatedData) {
    const cardsContainer = document.getElementById('limitCardsContainer');
    if (!cardsContainer) return;

    const cardsHTML = [];

    // English comment: Color schemes for different card types
    const colors = ['blue', 'purple', 'amber', 'rose', 'cyan', 'indigo', 'pink'];
    let colorIndex = 0;

    // English comment: Generate cards for each group/code
    Object.values(aggregatedData).forEach(item => {
        const percentage = (item.total_kg / item.limit_kg) * 100;
        const color = colors[colorIndex % colors.length];
        colorIndex++;

        // English comment: Determine status color based on percentage
        let statusColor, statusText, progressColor;
        if (percentage >= 100) {
            statusColor = 'red';
            statusText = 'Przekroczono limit!';
            progressColor = 'bg-red-600';
        } else if (percentage >= 80) {
            statusColor = 'amber';
            statusText = 'Uwaga - zbliżasz się do limitu';
            progressColor = 'bg-amber-500';
        } else {
            statusColor = 'emerald';
            statusText = 'Bezpieczna strefa';
            progressColor = 'bg-emerald-500';
        }

        cardsHTML.push(`
            <div class="bg-white p-5 rounded-2xl border-2 border-${color}-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex-1">
                        <div class="text-[10px] font-black text-${color}-500 uppercase mb-1">
                            ${item.type === 'group' ? 'GRUPA' : item.key}
                        </div>
                        <div class="text-sm font-bold text-slate-800 mb-1">${item.name}</div>
                        ${item.type === 'group' ? `
                            <div class="text-[10px] text-gray-500">
                                ${item.codes.join(', ')}
                            </div>
                        ` : ''}
                    </div>
                    <div class="w-12 h-12 bg-${color}-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <svg class="w-7 h-7 text-${color}-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            ${item.type === 'group' ? `
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                            ` : `
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                            `}
                        </svg>
                    </div>
                </div>
                
                <div class="flex justify-between text-xs mb-2">
                    <span class="font-bold">${item.total_kg.toFixed(1)} kg</span>
                    <span class="text-gray-400">Limit: ${item.limit_kg.toFixed(0)} kg</span>
                </div>
                
                <div class="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div class="${progressColor} h-full transition-all duration-500" style="width: ${Math.min(percentage, 100)}%"></div>
                </div>
                
                <div class="mt-2 text-[10px] font-semibold text-${statusColor}-600 uppercase">
                    ${statusText}
                </div>
            </div>
        `);
    });

    // English comment: Update cards container
    if (cardsHTML.length === 0) {
        cardsContainer.innerHTML = `
            <div class="col-span-full text-center py-12 text-gray-500">
                Brak danych do wyświetlenia. Dodaj pierwszy wpis!
            </div>
        `;
    } else {
        cardsContainer.innerHTML = cardsHTML.join('');
    }
}

// ============================================================================
// WASTE CODE SEARCH
// ============================================================================

/**
 * English comment: Populate waste code search in add entry modal
 * Uses datalist for native autocomplete functionality
 */
async function populateWasteCodeSearch() {
    const select = document.getElementById('wasteCode');
    const datalist = document.getElementById('wasteCodeDatalist');
    
    if (!select) return;

    // English comment: Clear existing options
    select.innerHTML = '<option value="">Wybierz kod odpadu...</option>';

    // English comment: Add all waste codes as options
    wasteCodesCache.forEach(code => {
        const option = document.createElement('option');
        option.value = code.waste_code;
        option.textContent = `${code.waste_code} - ${code.name}`;
        select.appendChild(option);
    });

    // English comment: If using datalist approach, populate it as well
    if (datalist) {
        datalist.innerHTML = '';
        wasteCodesCache.forEach(code => {
            const option = document.createElement('option');
            option.value = `${code.waste_code} - ${code.name}`;
            datalist.appendChild(option);
        });
    }

    console.log(`✅ Populated ${wasteCodesCache.length} waste codes in search`);
}

/**
 * English comment: Filter waste codes based on search input
 * Can be used for custom search implementation
 */
function filterWasteCodes(searchTerm) {
    if (!searchTerm) return wasteCodesCache;

    const term = searchTerm.toLowerCase();

    return wasteCodesCache.filter(code => 
        code.waste_code.toLowerCase().includes(term) ||
        code.name.toLowerCase().includes(term)
    );
}

// ============================================================================
// FORM HANDLING
// ============================================================================

/**
 * English comment: Handle adding new waste entry
 */
async function handleAddEntry(event) {
    event.preventDefault();

    if (!supabaseClient || !currentUser) {
        showError('Błąd: Brak połączenia z bazą danych');
        return;
    }

    const wasteCode = document.getElementById('wasteCode').value;
    const weight = parseFloat(document.getElementById('wasteWeight').value);
    const entryDate = document.getElementById('entryDate').value;

    // English comment: Validate inputs
    if (!wasteCode || !weight || !entryDate) {
        showError('Proszę wypełnić wszystkie pola');
        return;
    }

    // English comment: Verify waste code exists
    const codeExists = wasteCodesCache.find(c => c.waste_code === wasteCode);
    if (!codeExists) {
        showError('Nieprawidłowy kod odpadu');
        return;
    }

    try {
        console.log('📝 Adding entry:', { wasteCode, weight, entryDate });

        // English comment: Insert new entry into Supabase
        const { data, error } = await supabaseClient
            .from('waste_entries')
            .insert([{
                user_id: currentUser.id,
                waste_code: wasteCode,
                weight_kg: weight,
                entry_date: entryDate
            }]);

        if (error) throw error;

        console.log('✅ Entry added successfully');

        // English comment: Close modal and reload data
        closeAddEntryModal();
        await loadUserEntries();
        renderDashboard();

        // English comment: Show success message
        showSuccess('Wpis dodany pomyślnie!');

    } catch (error) {
        console.error('💥 Error adding entry:', error);
        showError('Wystąpił błąd podczas dodawania wpisu: ' + error.message);
    }
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

/**
 * English comment: Open add entry modal
 */
function openAddEntryModal() {
    const modal = document.getElementById('addEntryModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

/**
 * English comment: Close add entry modal
 */
function closeAddEntryModal() {
    const modal = document.getElementById('addEntryModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        document.getElementById('addEntryForm')?.reset();
        document.getElementById('entryDate').valueAsDate = new Date();
    }
}

// English comment: Close modal when clicking outside
window.addEventListener('click', function(event) {
    const modal = document.getElementById('addEntryModal');
    if (event.target === modal) {
        closeAddEntryModal();
    }
});

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * English comment: Handle user logout
 */
async function handleLogout() {
    if (!supabaseClient) {
        window.location.href = 'login.html';
        return;
    }

    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        console.error('Logout error:', error);
    }
    window.location.href = 'login.html';
}

// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * English comment: Show/hide loading state
 */
function showLoading(show) {
    const loadingEl = document.getElementById('loadingState');
    const contentEl = document.getElementById('dashboardContent');

    if (loadingEl) {
        loadingEl.classList.toggle('hidden', !show);
    }
    if (contentEl) {
        contentEl.classList.toggle('hidden', show);
    }
}

/**
 * English comment: Show error message
 */
function showError(message) {
    console.error('❌ Error:', message);
    alert('Błąd: ' + message);
}

/**
 * English comment: Show success message
 */
function showSuccess(message) {
    console.log('✅ Success:', message);
    // English comment: Could be replaced with toast notification
    alert(message);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// English comment: Start dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', initDashboard);
