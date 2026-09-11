# ¿Dónde se va la guita?

App de gastos del hogar para toda la familia. Se instala en el celular como una app,
funciona sin señal y se sincroniza sola entre todos los teléfonos.

- **Gastos fijos** agrupados por dueño: los comunes, los de cada uno, los de afuera
- **Carga rápida**: un botón por cada lugar de siempre, el monto y listo
- **La categoría se asigna sola** por el nombre del lugar; no la elige quien carga
- **Gastos variables** con quién pagó y foto del comprobante
- **Metas de ahorro** con cálculo de en cuánto tiempo llegás
- **Gráficos**: torta por categoría, últimos seis meses, comparación mes a mes
- **Pesos y dólares**, con la cotización que vos cargues
- **Los dólares del mes juntos**, con aviso antes de que cierre la tarjeta, para
  pagarlos en dólares y no comerse los impuestos
- **La barra del mes se mide contra lo que entra**, no contra un presupuesto inventado
- **Cachito**, el chanchito que mira los números y te dice una cosa útil por vez
- **Modo offline**: cargás sin internet y se sube solo cuando vuelve

Hecho con HTML, CSS y JavaScript sin frameworks ni build. El backend es Supabase.

---

## Puesta en marcha

Son unos 15 minutos. Necesitás dos cuentas gratuitas: Supabase y Vercel.

### 1. Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá una cuenta.
2. **New project**. Ponele un nombre (`libreta-de-casa`), elegí una contraseña
   para la base y la región más cercana (South America / São Paulo).
3. Esperá dos o tres minutos a que termine de crearse.

### 2. Correr el SQL

1. En el panel del proyecto, andá a **SQL Editor** → **New query**.
2. Abrí el archivo [`sql/schema.sql`](sql/schema.sql) de este repo, copiá **todo** y pegalo.
3. **Run**. Tiene que decir *Success*.

Eso crea las tablas, las reglas de seguridad, las funciones para entrar con
código y el lugar donde se guardan las fotos de los comprobantes.

### 3. Activar el ingreso sin cuenta

1. **Authentication** → **Sign In / Providers**.
2. Buscá **Anonymous sign-ins** y activalo. Guardá.

Esto es lo que permite entrar con un código en vez de con usuario y contraseña.
Cada teléfono recibe igual una identidad propia por debajo, que es lo que hace
que las reglas de seguridad funcionen.

### 4. Copiar las claves

1. **Settings** → **API Keys**.
2. Copiá el **Project URL** y la **publishable key** (empieza con `sb_publishable_`).
   Si tu proyecto todavía muestra la vieja **anon key**, también sirve.
3. Pegalas en [`js/config.js`](js/config.js).

> La clave pública va en el repo sin problema: sola no abre nada, porque todas
> las tablas tienen Row Level Security y sin pertenecer a un hogar no devuelven
> ni una fila. La que **nunca** se sube es la *secret key* (o *service_role*).

### 5. Publicar en Vercel

**Opción A — desde GitHub (recomendada):**

```bash
git init
git add .
git commit -m "Libreta de Casa"
git branch -M main
git remote add origin https://github.com/zayitus/libreta-de-casa.git
git push -u origin main
```

Después en [vercel.com](https://vercel.com): **Add New** → **Project** → importás el
repo → **Deploy**. No hace falta configurar nada: no tiene build.
De ahí en más, cada `git push` publica solo.

**Opción B — sin git:** instalá el CLI y desde esta carpeta:

```bash
npm i -g vercel
vercel --prod
```

### 6. Instalar en el celular

1. Abrí la URL que te dio Vercel.
2. **Crear uno nuevo** → nombre del hogar, un código que inventes vos, tu nombre.
3. Menú del navegador → **Agregar a pantalla de inicio**.
4. Pasale la URL y el código a la familia. Cada uno entra con **Entrar a un hogar**.

---

## Cómo funciona por dentro

```
index.html          pantalla y estructura
css/styles.css      tokens de color y tipografía (azul noche, un solo mundo visual)
js/config.js        tus claves de Supabase
js/store.js         datos: Supabase, caché en IndexedDB y cola offline
js/categorias.js    categorías, íconos, lugares de carga rápida y el categorizador
js/cachito.js       el chanchito: dibujo SVG y qué dice según los números
js/app.js           render y comportamiento
sw.js               service worker: la app abre sin internet
sql/schema.sql      tablas, seguridad y funciones
```

### Seguridad

Toda la seguridad está en la base, no en el navegador:

- Cada tabla tiene **Row Level Security**. La política es siempre
  *"sólo las filas de un hogar al que pertenezco"*.
- La pertenencia vive en `household_members`, y la única forma de entrar ahí es
  la función `join_household(código)`, que compara contra un hash bcrypt.
- El código del hogar **nunca se guarda en texto plano**, ni en la base ni en el
  navegador: sólo queda el `household_id` una vez que entraste.
- Las fotos van a un bucket privado, en una carpeta por hogar, con las mismas
  reglas. Se ven por URL firmada que vence en una hora.

Si el código se filtra, entrá a **⚙ → Cambiar el código**: los que ya están
adentro siguen adentro, y el código viejo deja de servir para entrar.

### El modo offline

Toda escritura pasa por una cola en IndexedDB antes de ir a la nube. La pantalla
se actualiza al instante (actualización optimista) y la cola se vacía sola cuando
vuelve la conexión, cuando volvés a la app o cuando la abrís de nuevo. Las fotos
esperan en la cola como Blob, así que podés sacar el ticket en el super sin señal.

### Los consejos de "Revisá esto"

No son una lista escrita a mano: salen de tus propios datos. Compara entre sí los
seguros que tengas cargados, cuenta las suscripciones prendidas y las suma al año,
marca la categoría que más pesa sobre los fijos y avisa cuando una categoría pega
un salto contra el mes pasado. Si no hay con qué compararse no dice nada: prefiere
callarse antes que inventar.

Los avisos de vencimiento se sacaron a propósito: acá los servicios van por débito
automático y cada uno avisa por su cuenta.

---

## Costos

Con el plan gratuito de Supabase y el Hobby de Vercel esto no cuesta nada, y para
una familia sobra: el límite gratuito de Supabase es de 500 MB de base y 1 GB de
archivos. Un hogar que carga 40 gastos por mes con foto tarda años en acercarse.

Ojo con una cosa: **Supabase pausa los proyectos gratuitos que pasan una semana
sin actividad**. Si van a usarla todos los días no es un problema; si la dejás
quieta, la despertás desde el panel en un minuto.

---

## Ideas para más adelante

- Que sugiera alternativas más baratas para los contratos que ya tenés (seguros, telefonía)
- Cuotas con fecha de fin, que se den de baja solas cuando termina el plan
- Presupuesto por categoría, no sólo el total
- Aportes automáticos a las metas el día que cobrás
- Export a Excel además del CSV
- Que Cachito lea la foto del ticket y complete el monto solo

---

MIT. Hecho para casa.
