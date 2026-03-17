// Obtiene el propietario actual
var propietarioActual = "<%= propietario %>";

// Lista de posibles propietarios
var propietarios = ["Tienda", "Orlando", "Oscar", "Oliver"];

// Filtrar para evitar repetidos
var opcionesFiltradas = propietarios.filter(p => p !== propietarioActual);

// Insertar las opciones en el select
var select = document.getElementById("propietario");
opcionesFiltradas.forEach(propietario => {
    var option = document.createElement("option");
    option.value = propietario;
    option.textContent = propietario;
    select.appendChild(option);
});

// Colorear filas según estado
document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("tbody tr").forEach(row => {
        let estado = row.cells[7].textContent.trim();
        if (estado === "activo") {
            row.style.backgroundColor = "#90EE90";
        } else if (estado === "Recogido") {
            row.style.backgroundColor = "#ADD8E6";
        }
        else if (estado === "Vendido") {
            row.style.backgroundColor = "#ffcccc";
        }
    });

    // Función para calcular el total de empeños activos
    document.getElementById('calcularTotal').addEventListener('click', function () {
        let total = 0;
        const filas = document.querySelectorAll('tbody tr');
        let contadorActivos = 0;

        if (filas.length === 0) {
            document.getElementById('totalResultado').textContent = "No hay empeños para calcular";
            return;
        }

        filas.forEach(fila => {
            // Verificar si el estado es "activo" (columna 7)
            const estado = fila.cells[7].textContent.trim().toLowerCase();

            if (estado === "activo") {
                // Obtener el texto de la celda de monto (columna 6)
                const montoTexto = fila.cells[6].textContent;
                // Eliminar el símbolo de dólar si existe y convertir a número
                const montoValor = parseFloat(montoTexto.replace('S/', ''));

                if (!isNaN(montoValor)) {
                    total += montoValor;
                    contadorActivos++;
                }
            }
        });

        // Formatear el total como moneda
        const mensaje = contadorActivos > 0
            ? `Total activos (${contadorActivos}): S/${total.toFixed(2)}`
            : "No hay empeños activos";

        document.getElementById('totalResultado').textContent = mensaje;
    });
});