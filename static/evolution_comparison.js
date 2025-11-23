document.addEventListener('DOMContentLoaded', () => {
    const periodTypeSelect = document.getElementById('period-type');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const metricSelector = document.getElementById('metric-selector');
    
    const searchBtn = document.getElementById('search-btn');
    const updateChartBtn = document.getElementById('update-chart-btn');
    const clearBtn = document.getElementById('clear-selection-btn');
    
    const periodsContainer = document.getElementById('periods-container');
    
    let chartInstance = null;
    let cachedData = null;

    // Configura datas padrão (últimos 6 meses para evitar excesso de dados inicial)
    const today = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 5);
    
    endDateInput.value = today.toISOString().split('T')[0];
    startDateInput.value = sixMonthsAgo.toISOString().split('T')[0];

    function getRandomColor(index) {
        const hue = (index * 137.508) % 360; 
        return `hsl(${hue}, 70%, 50%)`;
    }

    async function fetchPeriods() {
        try {
            periodsContainer.innerHTML = '<p>Carregando...</p>';
            
            const periodType = periodTypeSelect.value;
            const metric = metricSelector.value;
            const startDate = startDateInput.value;
            const endDate = endDateInput.value;

            // Busca dados filtrados
            let url = `/api/reports/evolution-comparison?period_type=${periodType}&metric=${metric}`;
            if (startDate && endDate) {
                url += `&start_date=${startDate}&end_date=${endDate}`;
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error('Erro ao buscar dados');
            
            cachedData = await response.json();
            const periods = Object.keys(cachedData).sort().reverse();
            
            renderCheckboxes(periods);
            
            // Seleciona automaticamente os 3 mais recentes
            selectLatestPeriods(3);
            
            // Atualiza o gráfico automaticamente após buscar
            updateChart();
            
        } catch (error) {
            console.error(error);
            periodsContainer.innerHTML = '<p style="color:red">Erro ao carregar dados. Verifique o console.</p>';
        }
    }

    function renderCheckboxes(periods) {
        periodsContainer.innerHTML = '';
        if (periods.length === 0) {
            periodsContainer.innerHTML = '<p>Nenhum dado encontrado para o período selecionado.</p>';
            return;
        }

        periods.forEach(period => {
            const div = document.createElement('div');
            div.className = 'period-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = period;
            checkbox.id = `chk-${period}`;
            
            const label = document.createElement('label');
            label.htmlFor = `chk-${period}`;
            label.textContent = period;
            
            div.appendChild(checkbox);
            div.appendChild(label);
            periodsContainer.appendChild(div);
        });
    }

    function selectLatestPeriods(count) {
        const checkboxes = periodsContainer.querySelectorAll('input[type="checkbox"]');
        for (let i = 0; i < Math.min(count, checkboxes.length); i++) {
            checkboxes[i].checked = true;
        }
    }

    function getAxisConfig(periodType) {
        // Configuração dinâmica do Eixo X
        switch(periodType) {
            case 'week':
                return { 
                    title: 'Dia da Semana', 
                    min: 0, max: 6, 
                    callback: (val) => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][val] || val 
                };
            case 'month':
                return { title: 'Dia do Mês', min: 1, max: 31 };
            case 'year':
                return { 
                    title: 'Mês do Ano', 
                    min: 1, max: 12,
                    callback: (val) => ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][val-1] || val
                };
            case 'bimester':
                return { title: 'Mês do Bimestre', min: 1, max: 2 };
            case 'trimester':
                return { title: 'Mês do Trimestre', min: 1, max: 3 };
            case 'semester':
                return { title: 'Mês do Semestre', min: 1, max: 6 };
            default:
                return { title: 'Índice Temporal', min: 1, max: 31 };
        }
    }

    function updateChart() {
        if (!cachedData) return;
        
        const selectedCheckboxes = periodsContainer.querySelectorAll('input[type="checkbox"]:checked');
        // Ordena para que a legenda fique sequencial
        const selectedPeriods = Array.from(selectedCheckboxes).map(cb => cb.value).sort(); 
        
        const ctx = document.getElementById('evolutionChart').getContext('2d');
        const metric = metricSelector.value;
        const periodType = periodTypeSelect.value;
        const axisConfig = getAxisConfig(periodType);

        if (chartInstance) {
            chartInstance.destroy();
        }

        const datasets = selectedPeriods.map((period, index) => {
            return {
                label: period,
                data: cachedData[period].data_points,
                borderColor: getRandomColor(index),
                backgroundColor: getRandomColor(index),
                borderWidth: 2,
                tension: 0.1,
                pointRadius: 3,
                fill: false
            };
        });

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: { datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'linear',
                        min: axisConfig.min,
                        max: axisConfig.max,
                        title: { display: true, text: axisConfig.title },
                        ticks: {
                            stepSize: 1,
                            callback: function(value) {
                                if (axisConfig.callback) return axisConfig.callback(value);
                                return value;
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: metric === 'revenue' ? 'Valor Acumulado (R$)' : 'Qtd. Pedidos' },
                        ticks: {
                            callback: function(value) {
                                if (metric === 'revenue') return 'R$ ' + value.toLocaleString('pt-BR');
                                return value;
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: (context) => {
                                const val = context[0].parsed.x;
                                if (axisConfig.callback) return `${axisConfig.title}: ${axisConfig.callback(val)}`;
                                return `${axisConfig.title}: ${val}`;
                            },
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    if (metric === 'revenue') {
                                        label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                                    } else {
                                        label += context.parsed.y;
                                    }
                                }
                                return label;
                            }
                        }
                    },
                    legend: { position: 'top' },
                }
            }
        });
    }

    // Event Listeners
    searchBtn.addEventListener('click', fetchPeriods);
    updateChartBtn.addEventListener('click', updateChart);
    
    clearBtn.addEventListener('click', () => {
        const checkboxes = periodsContainer.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
        updateChart();
    });

    // Carga inicial
    fetchPeriods();
});