// Colorear filas según estado
document.addEventListener("DOMContentLoaded", function () {
    // El total se calcula en backend sobre todos los resultados filtrados,
    // no solamente sobre la página visible.
    const totalButton = document.getElementById('calcularTotal');
    if (totalButton) {
        totalButton.disabled = true;
        totalButton.title = 'El total se actualiza automáticamente con los filtros';
    }
});
