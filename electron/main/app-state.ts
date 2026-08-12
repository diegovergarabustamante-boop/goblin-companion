/**
 * Flag compartido para distinguir "cerrar ventana → minimizar a tray" de
 * "salir de verdad" (plan sección 8: cerrar [x] minimiza al tray).
 */
let quitting = false

export function isQuittingApp(): boolean {
  return quitting
}

export function markQuitting(): void {
  quitting = true
}
