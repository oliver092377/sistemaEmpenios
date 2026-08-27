document.addEventListener('DOMContentLoaded', function () {

    const dashboardElement = document.getElementById("dashboard-data");

    const dashboardData = JSON.parse(
        dashboardElement.dataset.dashboard
    );

    console.log(dashboardData);




    //const dashboardData = window.dashboardData;
    const canvas = document.getElementById('capitalDistributionChart');

    if (!canvas || !dashboardData) {
        return;
    }

    const capitalTotal = Number(dashboardData.capitalTotal || 0);
    const dineroEmpleado = Number(dashboardData.dineroEmpleado || 0);
    const saldoDisponible = Number(dashboardData.saldoDisponible || 0);

    new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Saldo disponible', 'Dinero empleado en préstamos'],
            datasets: [{
                data: [Math.max(saldoDisponible, 0), Math.max(dineroEmpleado, 0)],
                backgroundColor: ['#1cc88a', '#f6c23e'],
                hoverBackgroundColor: ['#17a673', '#dda20a'],
                borderColor: '#ffffff',
                borderWidth: 2,
            }],
        },
        options: {
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: {
                    position: 'bottom',
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const value = Number(context.raw || 0);
                            return `${context.label}: S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                        },
                        afterLabel() {
                            return `Capital total: S/ ${capitalTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                        }
                    }
                }
            }
        }
    });
});