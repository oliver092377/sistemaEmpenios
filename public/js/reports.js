const yearFilter = document.getElementById("yearFilter");

let flowChart = null;
let profitChart = null;
let perdidaChart = null;

document.addEventListener("DOMContentLoaded", () => {
    cargarTotalesYGraficos(yearFilter ? yearFilter.value : "");

    if (yearFilter) {
        yearFilter.addEventListener("change", () => {
            cargarTotalesYGraficos(yearFilter.value);
        });
    }
});

async function cargarTotalesYGraficos(year) {
    try {
        const params = new URLSearchParams();
        if (year) {
            params.set("year", year);
        }
        const response = await fetch(`/cashflow/totales?${params.toString()}`);
        const data = await response.json();

        if (yearFilter) {
            const selected = Number(yearFilter.value) || Number(data.selectedYear);
            yearFilter.innerHTML = "";
            (data.years || []).forEach((y) => {
                const option = document.createElement("option");
                option.value = y;
                option.textContent = y;
                if (y === selected) {
                    option.selected = true;
                }
                yearFilter.appendChild(option);
            });
        }

        const porMes = (rows, field) => {
            const arr = [];
            for (let i = 1; i <= 12; i++) {
                const mes = (rows || []).find((r) => r.month === i);
                arr.push(mes ? Number(mes[field] || 0) : 0);
            }
            return arr;
        };

        const gananciasOrdenadas = porMes(data.ganancias, "ganancias");
        const perdidasOrdenadas = porMes(data.perdidas, "perdidas");
        const entradasOrdenadas = porMes(data.entradas, "entradas");
        const salidasOrdenadas = porMes(data.salidas, "salidas");

        const labels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

        flowChart = renderBarChart(
            "flowChart",
            labels,
            [
                { label: "Entradas", backgroundColor: "#1cc88a", hoverBackgroundColor: "#17a673", data: entradasOrdenadas },
                { label: "Salidas", backgroundColor: "#e74a3b", hoverBackgroundColor: "#be2617", data: salidasOrdenadas },
            ],
            flowChart
        );

        profitChart = renderBarChart(
            "GananciaChart",
            labels,
            [
                { label: "Ganancias", backgroundColor: "#155DFC", hoverBackgroundColor: "#155DFC", data: gananciasOrdenadas },
            ],
            profitChart
        );

        perdidaChart = renderBarChart(
            "PerdidaChart",
            labels,
            [
                { label: "Pérdidas", backgroundColor: "#e74a3b", hoverBackgroundColor: "#be2617", data: perdidasOrdenadas },
            ],
            perdidaChart
        );
    } catch (error) {
        console.error("Error al cargar totales:", error);
    }
}

function renderBarChart(canvasId, labels, datasets, existingChart) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        return existingChart;
    }

    const config = {
        type: "bar",
        data: {
            labels,
            datasets: datasets.map((d) => ({
                label: d.label,
                backgroundColor: d.backgroundColor,
                hoverBackgroundColor: d.hoverBackgroundColor,
                data: d.data,
            })),
        },
        options: {
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false } },
                y: {
                    ticks: {
                        callback: function (value) {
                            return "S/ " + value.toLocaleString();
                        },
                    },
                    grid: { color: "rgb(234, 236, 244)" },
                },
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label}: S/ ${context.raw.toLocaleString()}`;
                        },
                    },
                },
            },
        },
    };

    if (existingChart) {
        existingChart.data = config.data;
        existingChart.options = config.options;
        existingChart.update();
        return existingChart;
    }

    return new Chart(canvas.getContext("2d"), config);
}
