document.addEventListener("DOMContentLoaded", function () {
    // Manejo dinámico del formulario de nueva transacción
    const typeSelect = document.getElementById("transactionType");
    const categorySelect = document.getElementById("transactionCategory");
    const gananciaInput = document.getElementById("transactionGanancia"); // Selecciona el campo de ganancia

    const empenioPicker = document.getElementById("empenioPicker");
    const empenioSearch = document.getElementById("empenioSearch");
    const empenioIdInput = document.getElementById("empenioId");
    const empenioResults = document.getElementById("empenioResults");
    const empenioSelectedSummary = document.getElementById("empenioSelectedSummary");

    const editCancelButton = document.getElementById("editCamcelButton");
    // Manejo dinamico del formulario de editar transaccion
    const editTypeSelect = document.getElementById("editTransactionType");
    const editCategorySelect = document.getElementById("editTransactionCategory");
    const editGananciaInput = document.getElementById("editTransactionGanancia");

    const form = document.getElementById("transactionForm");
    const editForm = document.getElementById("editTransactionForm");

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0"); // Mes en formato 2 dígitos
    const dd = String(today.getDate()).padStart(2, "0"); // Día en formato 2 dígitos

    // Formato: yyyy-mm-dd
    const formattedDate = `${yyyy}-${mm}-${dd}`;

    // Establece el valor por defecto del campo de fecha (solo si existe en esta página)
    const fechaInput = document.getElementById("fecha");
    if (fechaInput) {
        fechaInput.value = formattedDate;
    }

    if (editTypeSelect && editTypeSelect.value === "entrada") {
        console.log("El valor de el tipo no es nulo");
    }
    // Si no estamos en la página que tiene el formulario, salir
    if (!typeSelect || !categorySelect || !gananciaInput || !form) {
        return;
    }

    // Al cargar la página, el select de categoría está deshabilitado
    categorySelect.setAttribute("disabled", "true");
    // Al cargar la página, el campo de ganancia está habilitado
    gananciaInput.removeAttribute("disabled");

    const allCategories = [
        { value: "", text: "Seleccionar..." },
        { value: "empenio", text: "Recogida de Empeñossss" },
        { value: "venta", text: "Venta de Producto" },
        { value: "interes", text: "Dejo a cuenta/Interes" },
        { value: "prestamo", text: "Préstamo" },
        { value: "gasto", text: "Gasto Operativo" },
        { value: "otro", text: "Otro" },
    ];
    const entradaCategories = [
        { value: "", text: "Seleccionar..." },
        { value: "empenio", text: "Recogida de Empeño" },
        { value: "venta", text: "Venta de Producto" },
        { value: "interes", text: "Dejo a cuenta/Interes" },
    ];
    const salidaCategories = [
        { value: "", text: "Seleccionar..." },
        { value: "prestamo", text: "Préstamo" },
        { value: "gasto", text: "Gasto Operativo" },
        { value: "otro", text: "Otro" },
    ];

    const shouldPickEmpenio = () =>
        typeSelect.value === "entrada" && (categorySelect.value === "empenio" || categorySelect.value === "interes");

    const clearEmpenioSelection = () => {
        if (!empenioPicker) return;
        empenioPicker.classList.add("d-none");
        empenioSearch.value = "";
        empenioIdInput.value = "";
        empenioResults.innerHTML = "";
        empenioSelectedSummary.textContent = "";
    };

    const showEmpenioPicker = () => {
        if (!empenioPicker) return;
        empenioPicker.classList.remove("d-none");
        empenioSearch.focus();
    };

    const renderEmpenioResults = (items) => {
        if (!empenioResults) return;
        if (!items.length) {
            empenioResults.innerHTML =
                '<div class="list-group-item text-muted">Sin resultados</div>';
            return;
        }
        empenioResults.innerHTML = items
            .map(
                (item) => `
                    <button type="button" class="list-group-item list-group-item-action empenio-option"
                        data-id="${item.idEmpenios}"
                        data-summary="${escapeHtml(
                    `${item.Nombres_Cliente || ""} ${item.Apellidos_Cliente || ""} | ${item.Artefacto || ""} (${item.Marca || ""})`
                )}">
                        <div><strong>${escapeHtml(item.Nombres_Cliente || "")}</strong> ${escapeHtml(item.Apellidos_Cliente || "")}</div>
                        <div class="small text-muted">${escapeHtml(item.Artefacto || "")} - ${escapeHtml(item.Marca || "")}</div>
                        <div class="small">Monto: S/ ${item.Monto}</div>
                    </button>
                `
            )
            .join("");
    };

    let searchTimeout;
    const debounceSearch = (term) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => performSearch(term), 300);
    };

    const performSearch = async (term) => {
        if (!term || term.length < 2) {
            empenioResults.innerHTML = "";
            return;
        }
        try {
            const res = await fetch(`/empenio/buscar?term=${encodeURIComponent(term)}`);
            const data = await res.json();
            renderEmpenioResults(data || []);
        } catch (err) {
            console.error("Error buscando empeños:", err);
            empenioResults.innerHTML =
                '<div class="list-group-item text-danger">Error al buscar</div>';
        }
    };
    // Al cambiar el tipo, actualizar categorías y estado del campo ganancia
    typeSelect.addEventListener("change", function () {
        let options = allCategories;
        // Si no se ha seleccionado tipo, deshabilita categoría
        if (!typeSelect.value) {
            categorySelect.innerHTML = "";
            categorySelect.setAttribute("disabled", "true");
            gananciaInput.removeAttribute("disabled");
            clearEmpenioSelection();
            return;
        }
        // Si se selecciona tipo, habilita categoría y muestra opciones
        categorySelect.removeAttribute("disabled");
        if (typeSelect.value === "entrada") {
            entradaCategories.map((cat) => console.log(cat));
            options = entradaCategories;
            gananciaInput.removeAttribute("disabled"); // Habilita ganancia
        } else if (typeSelect.value === "salida") {
            options = salidaCategories;
            gananciaInput.setAttribute("disabled", "true"); // Deshabilita ganancia
            gananciaInput.value = ""; // Opcional: limpia el campo
            clearEmpenioSelection();
        }
        categorySelect.innerHTML = "";
        options.forEach((opt) => {
            const option = document.createElement("option");
            option.value = opt.value;
            option.textContent = opt.text;
            categorySelect.appendChild(option);
        });

        if (shouldPickEmpenio()) {
            showEmpenioPicker();
        } else {
            clearEmpenioSelection();
        }
    });

    categorySelect.addEventListener("change", function () {
        if (shouldPickEmpenio()) {
            showEmpenioPicker();
        } else {
            clearEmpenioSelection();
        }
    });

    if (empenioSearch) {
        empenioSearch.addEventListener("input", (e) => {
            const term = e.target.value.trim();
            debounceSearch(term);
        });
    }

    document.addEventListener("click", (e) => {
        const opt = e.target.closest(".empenio-option");
        if (!opt) return;
        const id = opt.getAttribute("data-id");
        const summary = opt.getAttribute("data-summary") || "";
        empenioIdInput.value = id;
        empenioSelectedSummary.textContent = summary ? `Seleccionado: ${summary}` : "";
        empenioResults.innerHTML = "";
    });
    form.addEventListener("submit", (event) => {
        if (shouldPickEmpenio() && !empenioIdInput.value) {
            alert("Selecciona el empeño asociado antes de guardar.");
            event.preventDefault();
            return;
        }
        if (typeSelect.value === "salida") {
            // Quita el "disabled" para que se envíe
            gananciaInput.removeAttribute("disabled");
            gananciaInput.value = 0; // fuerza valor 0
        }
    });
});

// Función para manejar la edición de transacciones
function handleEditButtonClick(e) {
    // Verificar si se hizo clic en el botón o en el ícono
    const btn = e.target.closest(".btn.btn-sm.btn-primary");
    if (!btn) return;

    // Buscar la fila de la transacción
    const row = btn.closest("tr");
    if (!row) return;

    // Obtener los datos de la fila
    const tds = row.querySelectorAll("td");
    console.log(
        "tds[3].innerText.trim().toLowerCase(): ",
        tds[3].innerText.trim().toLowerCase()
    );
    const categoria = document.getElementById("editTransactionCategory");
    const tipo = document.getElementById("editTransactionType");
    // Asignar valores al modal
    document.getElementById("editTransactionId").value =
        btn.getAttribute("data-id");
    document.getElementById("editTransactionFecha").value =
        tds[0].innerText.trim();
    document.getElementById("editTransactionDescripcion").value =
        tds[2].innerText.trim();

    // nueva línea: llenar nota desde data-nota del botón
    const nota = btn.getAttribute("data-nota") || "";
    document.getElementById("editTransactionNota").value = nota;

    document.getElementById("editTransactionType").value = tds[1].innerText
        .trim()
        .toLowerCase();
    const Micategoria = tds[3].innerText.trim().toLowerCase();
    document.getElementById("editTransactionMonto").value = tds[4].innerText
        .replace("S/", "")
        .trim();
    document.getElementById("editTransactionGanancia").value = tds[5].innerText
        .replace("S/", "")
        .trim();

    // Permite mostrarlo pero no cambiarlo
    tipo.addEventListener("mousedown", (e) => {
        e.preventDefault(); // Bloquea que se abra el menú
        tipo.blur(); // Quita el foco
    });

    // Hacer inmodificable el campo de ganancia si la transacción es de salida pero que sí se envie el valor 0
    const editGananciaInput = document.getElementById("editTransactionGanancia");

    if (tipo.value === "salida") {
        editGananciaInput.readOnly = true;
        editGananciaInput.value = 0;
    } else {
        editGananciaInput.readOnly = false;
    }


    // Actualizar categorías según el tipo
    if (document.getElementById("editTransactionType").value === "entrada") {
        const entradaCategories = [
            { value: "", text: "Seleccionar..." },
            { value: "empenio", text: "Recogida de Empeño" },
            { value: "venta", text: "Venta de Producto" },
            { value: "interes", text: "Dejo a cuenta/Interes" },
        ];
        categoria.innerHTML = "";
        let options = entradaCategories;
        options.forEach((opt) => {
            let option = document.createElement("option");
            option.value = opt.value;
            option.text = opt.text;
            if (Micategoria === option.value) {
                console.log("Esta ingresando en el if: ");
                option.selected = true;
            }
            categoria.appendChild(option);
        });
    } else if (
        document.getElementById("editTransactionType").value === "salida"
    ) {
        const salidaCategories = [
            { value: "", text: "Seleccionar..." },
            { value: "prestamo", text: "Préstamo" },
            { value: "gasto", text: "Gasto Operativo" },
            { value: "otro", text: "Otro" },
        ];
        categoria.innerHTML = "";
        let options = salidaCategories;
        options.forEach((opt) => {
            let option = document.createElement("option");
            option.value = opt.value;
            option.text = opt.text;
            if (Micategoria === option.value) {
                console.log("Esta ingresando en el if: ");
                option.selected = true;
            }
            categoria.appendChild(option);
        });
    }
    // Mostrar el modal
    var editModal = new bootstrap.Modal(
        document.getElementById("editTransactionModal")
    );
    editModal.show();
}

// Usar delegación de eventos para manejar clicks en botones de editar (tanto estáticos como dinámicos)
document.addEventListener("click", function (e) {
    if (e.target.closest(".btn.btn-sm.btn-primary")) {
        handleEditButtonClick(e);
    }
});

// Mostrar nota en un modal sencillo
document.addEventListener("click", (e) => {
    const btn = e.target.closest(".note-btn");
    if (!btn) return;

    const modalEl = document.getElementById("noteModal");
    const modalBody = document.getElementById("noteModalContent");
    if (!modalEl || !modalBody) return;

    const noteText = btn.getAttribute("data-nota") || "";
    modalBody.textContent = noteText || "Sin nota";

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
});

// Obtener datos del endpoint /totales y actualizar los gráficos
async function cargarTotalesYGraficos() {
    try {
        const response = await fetch("/cashflow/totales");
        const data = await response.json();
        console.log("Datos recibidos:", data);
        // Procesar datos para el gráfico de capital
        // Puedes ajustar la lógica según cómo quieras distribuir el capital
        const capitalDisponible = data.capital.reduce(
            (acc, curr) => acc + curr.capital,
            0
        );
        //quiero un arreglo con el valor de las ganancias de cada mes en orden
        const gananciasOrdenadas = [];
        for (let i = 1; i <= 12; i++) {
            const mes = data.ganancias.find((g) => g.month === i);
            gananciasOrdenadas.push(mes ? mes.ganancias : 0);
        }
        console.log("Ganancias ordenadas:", gananciasOrdenadas);
        //quiero un arreglo con el valor de las entradas de cada mes en orden
        const entradasOrdenadas = [];
        for (let i = 1; i <= 12; i++) {
            const mes = data.entradas.find((e) => e.month === i);
            entradasOrdenadas.push(mes ? mes.entradas : 0);
        }
        //quiero un arreglo con el valor de las salidas de cada mes en orden
        const salidasOrdenadas = [];
        for (let i = 1; i <= 12; i++) {
            const mes = data.salidas.find((s) => s.month === i);
            salidasOrdenadas.push(mes ? mes.salidas : 0);
        }
        // Monthly Flow Chart (solo si existe el canvas en esta página)
        const flowCanvas = document.getElementById("flowChart");
        if (!flowCanvas) {
            return;
        }
        const flowCtx = flowCanvas.getContext("2d");
        const flowChart = new Chart(flowCtx, {
            type: "bar",
            data: {
                labels: [
                    "Ene",
                    "Feb",
                    "Mar",
                    "Abr",
                    "May",
                    "Jun",
                    "Jul",
                    "Ago",
                    "Sep",
                    "Oct",
                    "Nov",
                    "Dic",
                ],
                datasets: [
                    {
                        label: "Entradas",
                        backgroundColor: "#1cc88a",
                        hoverBackgroundColor: "#17a673",
                        data: entradasOrdenadas,
                    },
                    {
                        label: "Salidas",
                        backgroundColor: "#e74a3b",
                        hoverBackgroundColor: "#be2617",
                        data: salidasOrdenadas,
                    },
                ],
            },
            options: {
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: {
                            display: false,
                        },
                    },
                    y: {
                        ticks: {
                            callback: function (value) {
                                return "S/ " + value.toLocaleString();
                            },
                        },
                        grid: {
                            color: "rgb(234, 236, 244)",
                        },
                    },
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return `${context.dataset.label
                                    }: S/ ${context.raw.toLocaleString()}`;
                            },
                        },
                    },
                },
            },
        });
        const profitCanvas = document.getElementById("GananciaChart");
        if (!profitCanvas) {
            return;
        }
        const profitCtx = profitCanvas.getContext("2d");
        const profitChart = new Chart(profitCtx, {
            type: "bar",
            data: {
                labels: [
                    "Ene",
                    "Feb",
                    "Mar",
                    "Abr",
                    "May",
                    "Jun",
                    "Jul",
                    "Ago",
                    "Sep",
                    "Oct",
                    "Nov",
                    "Dic",
                ],
                datasets: [
                    {
                        label: "Ganancias",
                        backgroundColor: "#155DFC",
                        hoverBackgroundColor: "#155DFC",
                        data: gananciasOrdenadas,
                    },
                ],
            },
            options: {
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: {
                            display: false,
                        },
                    },
                    y: {
                        ticks: {
                            callback: function (value) {
                                return "S/ " + value.toLocaleString();
                            },
                        },
                        grid: {
                            color: "rgb(234, 236, 244)",
                        },
                    },
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return `${context.dataset.label
                                    }: S/ ${context.raw.toLocaleString()}`;
                            },
                        },
                    },
                },
            },
        });
        //

        console.log("Ganacias Disponible:", data.ganancias);
        const capitalEnEmpeños = 0; // Ajusta según tu lógica
        const capitalEnPrestamos = 0; // Ajusta según tu lógica
        /*
                    capitalChart.data.datasets[0].data = [
                        capitalDisponible,
                        capitalEnEmpeños,
                        capitalEnPrestamos
                    ];
                    capitalChart.update();
            
                    // Procesar datos para el gráfico de flujo mensual
                    // Asume que los datos tienen el mismo orden de meses
                    const meses = data.entradas.map(e => {
                        const mes = e.month;
                        // Puedes usar un array de nombres de meses si lo prefieres
                        return ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][mes - 1];
                    });
            
                    const entradas = data.entradas.map(e => e.entradas);
                    const salidas = data.salidas.map(e => e.salidas);
            
                    flowChart.data.labels = meses;
                    flowChart.data.datasets[0].data = entradas;
                    flowChart.data.datasets[1].data = salidas;
                    flowChart.update();
                    */
    } catch (error) {
        console.error("Error al cargar totales:", error);
    }
}
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function loadCurrentDayTransactions() {
    try {
        const response = await fetch("/cashflow/transacciones-dia-actual");
        const data = await response.json();
        const transacciones = data.transacciones || [];
        const usuarioNombre = data.usuario || '';
        const tbody = document.getElementById("currentDayTransactionsBody");

        // Guarda en memoria para la calculadora diaria
        window.currentDayTransactions = transacciones;

        if (!tbody) {
            return;
        }

        if (!transacciones.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center">No hay transacciones para hoy</td></tr>';
            return;
        }

        tbody.innerHTML = transacciones
            .map((transaccion) => {
                const fecha = new Date(transaccion.fecha).toISOString().split("T")[0];
                const tipo = transaccion.tipo;
                const tipoClass = tipo === "entrada" ? "income" : "expense";
                const tipoTexto = tipo.charAt(0).toUpperCase() + tipo.slice(1);
                const capital = transaccion.monto_total - transaccion.monto_ganancia;

                return `
                    <tr>
                        <td>${fecha}</td>
                        <td><span class="${tipoClass}">${tipoTexto}</span></td>
                        <td>${escapeHtml(transaccion.descripcion)}</td>
                        <td>${transaccion.categoria}</td>
                        <td class="${tipoClass}">S/ ${transaccion.monto_total}</td>
                        <td class="${tipoClass}">S/ ${transaccion.monto_ganancia}</td>
                        <td class="${tipoClass}">S/ ${capital}</td>
                        <td>${escapeHtml(usuarioNombre || 'N/A')}</td>
                        <td>
                            ${transaccion.nota
                        ? `<button class="btn btn-sm btn-info note-btn" data-nota="${escapeHtml(transaccion.nota)}" title="Ver nota">
                                        <i class="fas fa-sticky-note"></i>
                                   </button>`
                        : ""}
                        </td>
                        <td>
                            <button class="btn btn-sm btn-primary"
                                data-id="${transaccion.id}"
                                data-nota="${escapeHtml(transaccion.nota || '')}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <form action="/cashflow/eliminar-transaccion" method="POST" style="display:inline;" 
                                onsubmit="return confirm('¿Está seguro que desea eliminar esta transacción?');">
                                <input type="hidden" name="id" value="${transaccion.id}">
                                <button type="submit" class="btn btn-sm btn-danger">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </form>
                        </td>
                    </tr>
                `;
            })
            .join("");
    } catch (error) {
        console.error("Error al cargar transacciones del día actual:", error);
        const tbody = document.getElementById("currentDayTransactionsBody");
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-danger">Error al cargar las transacciones</td></tr>';
        }
        window.currentDayTransactions = [];
    }
}

function calculateDaySummary() {
    const input = document.getElementById("initialCapitalInput");
    const resultEl = document.getElementById("daySummaryResult");
    if (!input || !resultEl) return;

    const initial = parseFloat(input.value || "0");
    const transacciones = Array.isArray(window.currentDayTransactions) ? window.currentDayTransactions : [];

    let capital = initial;
    let ganancia = 0;

    transacciones.forEach((tx) => {
        const montoTotal = Number(tx.monto_total) || 0;
        const montoGanancia = Number(tx.monto_ganancia) || 0;
        const esEntrada = tx.tipo === "entrada";

        if (esEntrada) {
            capital += montoTotal - montoGanancia;
            ganancia += montoGanancia;
        } else {
            capital -= montoTotal;
        }
    });

    resultEl.classList.remove("d-none", "alert-danger");
    resultEl.classList.add("alert-info");
    resultEl.textContent = `Capital: S/ ${capital.toFixed(2)} | Ganancia: S/ ${ganancia.toFixed(2)}`;
}

function setupCerrarCajaButton() {
    const btn = document.getElementById("cerrarCajaBtn");
    const mensaje = document.getElementById("cerrarCajaMensaje");

    if (!btn || !mensaje) return;

    btn.addEventListener("click", async () => {
        btn.disabled = true;
        mensaje.classList.remove("d-none", "alert-danger", "alert-success", "alert-info");
        mensaje.classList.add("alert-info");
        mensaje.textContent = "Cerrando caja...";

        try {
            const resp = await fetch("/cashflow/cierre-caja", { method: "POST" });
            const data = await resp.json();

            if (!resp.ok) {
                throw new Error(data.error || "No se pudo cerrar la caja.");
            }

            const info = data.data || {};
            mensaje.classList.remove("alert-info", "alert-danger");
            mensaje.classList.add("alert-success");
            mensaje.textContent = `Caja cerrada. Capital: S/ ${Number(info.capital_final || 0).toFixed(2)} | Ganancia: S/ ${Number(info.ganancia_dia || 0).toFixed(2)} | Saldo final: S/ ${Number(info.saldo_final || 0).toFixed(2)}`;

            btn.remove();
        } catch (err) {
            mensaje.classList.remove("alert-info", "alert-success");
            mensaje.classList.add("alert-danger");
            mensaje.textContent = err.message;
            btn.disabled = false;
        }
    });
}

async function loadCurrentMonthTransactions() {
    try {
        const response = await fetch("/cashflow/transacciones-mes-actual");
        const data = await response.json();
        const transacciones = data.transacciones || [];
        const usuarioNombre = data.usuario || '';
        const tbody = document.getElementById("currentMonthTransactionsBody");

        // Si la tabla de transacciones del mes actual no existe en esta página, no hacer nada
        if (!tbody) {
            return;
        }

        if (transacciones.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="10" class="text-center">No hay transacciones para el mes actual</td></tr>';
            return;
        }
        console.log("Transacciones del mes actual:", transacciones);

        tbody.innerHTML = transacciones
            .map((transaccion) => {
                const fecha = new Date(transaccion.fecha).toISOString().split("T")[0];
                const tipo = transaccion.tipo;
                const tipoClass = tipo === "entrada" ? "income" : "expense";
                const tipoTexto = tipo.charAt(0).toUpperCase() + tipo.slice(1);
                const capital = transaccion.monto_total - transaccion.monto_ganancia;

                return `
                                    <tr>
                                        <td>${fecha}</td>
                                        <td><span class="${tipoClass}">${tipoTexto}</span></td>
                                        <td>${escapeHtml(transaccion.descripcion)}</td>
                                        <td>${transaccion.categoria}</td>
                                        <td class="${tipoClass}">S/ ${transaccion.monto_total}</td>
                                        <td class="${tipoClass}">S/ ${transaccion.monto_ganancia}</td>
                                        <td class="${tipoClass}">S/ ${capital}</td>
                                        <td>${escapeHtml(usuarioNombre || 'N/A')}</td>
                                        <td>
                                            ${transaccion.nota
                        ? `<button class="btn btn-sm btn-info note-btn" data-nota="${escapeHtml(transaccion.nota)}" title="Ver nota">
                                                        <i class="fas fa-sticky-note"></i>
                                                   </button>`
                        : ""}
                                        </td>

                                        <td>
                                            <button class="btn btn-sm btn-primary"
                                                data-id="${transaccion.id}"
                                                data-nota="${escapeHtml(transaccion.nota || '')}">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <form action="/cashflow/eliminar-transaccion" method="POST" style="display:inline;" 
                                                onsubmit="return confirm('¿Está seguro que desea eliminar esta transacción?');">
                                                <input type="hidden" name="id" value="${transaccion.id}">
                                                <button type="submit" class="btn btn-sm btn-danger">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </form>
                                        </td>
                                    </tr>
                                `;
            })
            .join("");
    } catch (error) {
        console.error("Error al cargar transacciones del mes actual:", error);
        const tbody = document.getElementById("currentMonthTransactionsBody");
        if (tbody) {
            tbody.innerHTML =
                '<tr><td colspan="10" class="text-center text-danger">Error al cargar las transacciones</td></tr>';
        }
    }
}

// Llama a las funciones al cargar la página
document.addEventListener("DOMContentLoaded", () => {
    cargarTotalesYGraficos();
    loadCurrentDayTransactions();
    loadCurrentMonthTransactions();
    setupCerrarCajaButton();

    const calcBtn = document.getElementById("calculateDaySummaryBtn");
    if (calcBtn) {
        calcBtn.addEventListener("click", (e) => {
            e.preventDefault();
            calculateDaySummary();
        });
    }
});

// ...existing code..
