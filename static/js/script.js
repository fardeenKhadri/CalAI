document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on the index page
    if (document.getElementById('upload-form')) {
        setupIndexPage();
    }
    // Check if we are on the history page
    if (document.getElementById('history-date-select')) {
        setupHistoryPage();
    }
});

/**
 * Setup functions for the index.html page (Food Analysis)
 */
function setupIndexPage() {
    const form = document.getElementById('upload-form');
    const resultsDiv = document.getElementById('analysis-results');
    const loadingDiv = document.getElementById('loading');
    const imageInput = document.getElementById('image-upload');
    const reanalysisSection = document.getElementById('reanalysis-section');
    const reanalysisButton = document.getElementById('reanalyze-btn');
    const reanalysisInput = document.getElementById('reanalysis-input');

    let currentAnalysisData = null; // Stores the latest successful analysis data

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const file = imageInput.files[0];
        if (!file) {
            alert('Please select an image file to analyze.');
            return;
        }

        const formData = new FormData(form);
        const url = '/analyze';
        
        // Reset and show loading state
        resultsDiv.classList.add('hidden');
        reanalysisSection.classList.add('hidden');
        loadingDiv.classList.remove('hidden');
        currentAnalysisData = null;

        await analyzeImage(url, formData);
    });

    reanalysisButton.addEventListener('click', async () => {
        if (!currentAnalysisData) return;

        const modifications = reanalysisInput.value.trim();
        if (modifications.length < 5) {
            alert('Please provide detailed modifications (e.g., "The quantity of fries is 150g, not 200g").');
            return;
        }
        
        const data = {
            image_path: currentAnalysisData.image_path,
            meal_type: currentAnalysisData.meal_type,
            modifications: modifications
        };

        const url = '/reanalyze';

        // Reset and show loading state
        resultsDiv.classList.add('hidden');
        loadingDiv.classList.remove('hidden');

        // Note: Reanalysis uses JSON data, not FormData
        await analyzeImage(url, JSON.stringify(data), 'application/json');
    });

    /**
     * General function to call the analysis or reanalysis API endpoint.
     * @param {string} url - The API endpoint URL.
     * @param {FormData|string} data - The data to send (FormData for analyze, JSON string for reanalyze).
     * @param {string} contentType - The Content-Type header.
     */
    async function analyzeImage(url, data, contentType = null) {
        try {
            const fetchOptions = {
                method: 'POST',
                body: data,
            };

            if (contentType) {
                fetchOptions.headers = { 'Content-Type': contentType };
            }

            const response = await fetch(url, fetchOptions);
            const result = await response.json();

            loadingDiv.classList.add('hidden');

            if (response.ok) {
                currentAnalysisData = result;
                displayResults(result);
                reanalysisSection.classList.remove('hidden');
            } else {
                displayError(result.error || 'Unknown error occurred during analysis.');
            }

        } catch (error) {
            loadingDiv.classList.add('hidden');
            displayError(`A network error occurred: ${error.message}`);
            console.error('Fetch error:', error);
        }
    }

    /**
     * Renders the analysis results to the DOM.
     * @param {object} data - The nutritional data returned from the API.
     */
    function displayResults(data) {
        let itemsHtml = data.items.map(item => `
            <li>
                <strong>${item.name}</strong> (${item.quantity})
                <br>
                Calories: ${item.calories.toFixed(0)} | Protein: ${item.protein.toFixed(1)}g | Carbs: ${item.carbs.toFixed(1)}g | Fat: ${item.fat.toFixed(1)}g
            </li>
        `).join('');

        const resultHtml = `
            <h3>Analysis for: ${data.meal_type.toUpperCase()}</h3>
            <img src="/uploads/${data.image_path}" alt="Analyzed Food" class="result-image">
            
            <div class="nutrition-summary">
                <div class="summary-item">Total Calories: <strong>${data.total_calories.toFixed(0)}</strong> kcal</div>
                <div class="summary-item">Protein: <strong>${data.total_protein.toFixed(1)}</strong> g</div>
                <div class="summary-item">Carbs: <strong>${data.total_carbs.toFixed(1)}</strong> g</div>
                <div class="summary-item">Fat: <strong>${data.total_fat.toFixed(1)}</strong> g</div>
                <div class="summary-item">Fiber: <strong>${data.total_fiber.toFixed(1)}</strong> g</div>
            </div>

            <h4>Detailed Breakdown:</h4>
            <ul class="item-list">
                ${itemsHtml}
            </ul>

            <div class="text-center">
                <button id="save-btn" class="btn-primary">Save Meal to History</button>
            </div>
        `;
        
        resultsDiv.innerHTML = resultHtml;
        resultsDiv.classList.remove('hidden');
        
        // ✅ FIX: attach to fresh save button after rendering
        const newSaveBtn = document.getElementById('save-btn');
        newSaveBtn.addEventListener('click', async () => {
            if (!currentAnalysisData) {
                alert('No meal data to save.');
                return;
            }

            try {
                const response = await fetch('/save_meal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(currentAnalysisData),
                });

                const result = await response.json();
                if (result.success) {
                    alert(`Meal successfully saved for ${result.date}!`);
                    form.reset();
                    resultsDiv.classList.add('hidden');
                    reanalysisSection.classList.add('hidden');
                    currentAnalysisData = null;
                } else {
                    alert(`Error saving meal: ${result.error}`);
                }
            } catch (error) {
                console.error('Save error:', error);
                alert('An error occurred while saving the meal.');
            }
        });
    }
    
    /**
     * Renders an error message.
     * @param {string} message - The error message.
     */
    function displayError(message) {
        resultsDiv.innerHTML = `<div class="card" style="background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;">
                                    <strong>Error!</strong> ${message}
                                    <p>Please ensure the image is clear and you have provided the GEMINI_API_KEY.</p>
                                </div>`;
        resultsDiv.classList.remove('hidden');
    }
}


/**
 * Setup functions for the history.html page
 */
function setupHistoryPage() {
    const dateSelect = document.getElementById('history-date-select');
    const historyContainer = document.getElementById('daily-history-container');
    const dateDisplay = document.getElementById('date-display');
    const totalsDiv = document.getElementById('daily-totals');

    // Function to fetch all dates with data
    async function loadDates() {
        try {
            const response = await fetch('/get_all_dates');
            const dates = await response.json();

            // Clear existing options
            dateSelect.innerHTML = '<option value="">Select a Date</option>';

            if (dates.length === 0) {
                dateSelect.innerHTML = '<option value="">No History Available</option>';
                historyContainer.innerHTML = '<p class="text-center">Start analyzing and saving meals to view your history!</p>';
                return;
            }

            dates.forEach(date => {
                const option = document.createElement('option');
                option.value = date;
                option.textContent = date;
                dateSelect.appendChild(option);
            });

            // Automatically load the latest date
            if (dates.length > 0) {
                dateSelect.value = dates[0];
                loadDailyData(dates[0]);
            }
        } catch (error) {
            console.error('Error loading dates:', error);
            historyContainer.innerHTML = '<p class="text-center" style="color:red;">Failed to load history dates.</p>';
        }
    }

    // Function to fetch and display data for a specific date
    async function loadDailyData(date) {
        if (!date) {
            dateDisplay.textContent = 'Please select a date';
            historyContainer.innerHTML = '';
            totalsDiv.classList.add('hidden');
            return;
        }

        historyContainer.innerHTML = '<p class="text-center"><span class="loader"></span> Loading data...</p>';
        totalsDiv.classList.add('hidden');
        dateDisplay.textContent = date;

        try {
            const response = await fetch(`/get_daily_data/${date}`);
            const data = await response.json();

            renderDailyHistory(data);
        } catch (error) {
            console.error('Error loading daily data:', error);
            historyContainer.innerHTML = `<p class="text-center" style="color:red;">Failed to load data for ${date}.</p>`;
        }
    }

    function renderDailyHistory(data) {
        if (data.meals.length === 0) {
            historyContainer.innerHTML = '<p class="text-center">No meals logged for this date.</p>';
            totalsDiv.classList.add('hidden');
            return;
        }

        let mealsHtml = data.meals.map(meal => {
            const time = new Date(meal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            let itemsHtml = meal.items.map(item => `
                <li>
                    <strong>${item.name}</strong> (${item.quantity}) - ${item.calories.toFixed(0)} kcal
                </li>
            `).join('');

            return `
                <div class="meal-entry">
                    <div class="meal-header">
                        <h4>${meal.meal_type.toUpperCase()}</h4>
                        <span>Logged at: ${time}</span>
                    </div>
                    
                    <img src="/uploads/${meal.image_path}" alt="${meal.meal_type}" class="meal-image-history">
                    
                    <p><strong>Total Calories: ${meal.total_calories.toFixed(0)} kcal</strong></p>
                    <p>Macronutrients: P: ${meal.total_protein.toFixed(1)}g | C: ${meal.total_carbs.toFixed(1)}g | F: ${meal.total_fat.toFixed(1)}g</p>
                    
                    <ul class="item-list">
                        ${itemsHtml}
                    </ul>
                    <div style="clear: both;"></div>
                </div>
            `;
        }).join('');

        historyContainer.innerHTML = mealsHtml;

        // Render Totals
        totalsDiv.innerHTML = `
            <h3>Daily Totals</h3>
            <div>Total Calories: <strong>${data.total_calories.toFixed(0)} kcal</strong></div>
            <div>Total Protein: <strong>${data.total_protein.toFixed(1)} g</strong></div>
            <div>Total Carbs: <strong>${data.total_carbs.toFixed(1)} g</strong></div>
            <div>Total Fat: <strong>${data.total_fat.toFixed(1)} g</strong></div>
            <div>Total Fiber: <strong>${data.total_fiber.toFixed(1)} g</strong></div>
        `;
        totalsDiv.classList.remove('hidden');
    }

    // Event listener for date change
    dateSelect.addEventListener('change', (e) => {
        loadDailyData(e.target.value);
    });

    // Initial load
    loadDates();
}
