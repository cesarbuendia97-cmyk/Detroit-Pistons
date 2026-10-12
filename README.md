# Mi plantilla NBA

Último partido real de cada jugador de mi plantilla, con datos de ESPN.

- `index.html`: la página. Al abrirla muestra los datos guardados en `data.json` y enseguida los actualiza en directo desde ESPN. Con la página abierta se refresca cada 10 minutos, y también tiene un botón **Refrescar**.
- `roster.json`: la plantilla (nombre, id de ESPN, posición, edad, media, etiquetas). Edítalo para fichajes o cambios de media.
- `espn.js`: descarga y procesa los datos de ESPN (lo usan la página y el script).
- `sync.js`: `node sync.js` regenera `data.json`. Una GitHub Action lo ejecuta cada día a las 7:00.

El id de ESPN de un jugador es el número de la URL de su ficha: espn.com/nba/player/_/id/**4278073**/...
