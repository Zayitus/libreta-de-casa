# Probar sin Supabase

`mock-supabase.js` es un Supabase falso, en memoria, con datos de ejemplo.
Sirve para abrir la app en la compu y ver cómo queda sin haber configurado nada.

1. En `js/config.js` poné cualquier URL con forma válida, por ejemplo
   `https://demo1234.supabase.co`, y una clave de más de 20 caracteres.
2. En `index.html`, justo antes del `<script src="...supabase-js...">`, agregá:
   `<script src="./test/mock-supabase.js"></script>`
3. Levantá un servidor local: `python3 -m http.server 8000`
4. Abrí `http://localhost:8000`

Acordate de sacar esa línea antes de publicar.
