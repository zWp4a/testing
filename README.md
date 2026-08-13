# 🏡 Nuestra Casa

App de gastos compartidos para una pareja que vive junta. Se abre desde la
compu o desde el celular, se instala como una app y **funciona sin internet**.

Está pensada para responder tres preguntas de todos los meses:

- ¿Cuánto gastamos y en qué?
- ¿Quién le debe a quién y cuánto?
- ¿Qué falta pagar y qué falta comprar?

---

## Qué trae

| Pantalla | Para qué sirve |
|---|---|
| **Resumen** | Balance entre los dos, total del mes, vencimientos próximos, gasto por categoría y tendencia de 6 meses. |
| **Gastos** | Todos los movimientos del mes, agrupados por día, con búsqueda y filtros. Exportable a CSV. |
| **Fijos** | Alquiler, expensas, luz, gas, internet, suscripciones. Se cargan una vez y la app los recuerda cada mes con su vencimiento. |
| **Compras** | Lista compartida para el súper. Se marca en la góndola y al final se convierte en un gasto de un toque. |
| **Metas** | Ahorro para un viaje, la mudanza o el fondo de imprevistos, con lo que puso cada uno. |
| **Ajustes** | Nombres, moneda, categorías, presupuestos, sincronización y backups. |

Algunas cosas útiles que quizás no esperabas:

- **División flexible por gasto**: mitad y mitad, lo banca uno solo, o porcentajes
  a medida (por ejemplo 70/30 si los sueldos son distintos).
- **Cuotas**: cargás "Heladera, $120.000 en 6 cuotas" y quedan los 6 meses
  agendados automáticamente.
- **Montos variables**: para la luz o el gas, al marcarlos pagados te pide el
  importe real de ese mes y se lo guarda para la próxima.
- **Presupuesto por categoría**: la barra se pone amarilla al 80% y roja al pasarse.
- **Saldar cuentas**: cuando uno le transfiere al otro, lo registrás y el balance
  vuelve a cero.
- **Productos habituales**: leche, pan y café vuelven solos a la lista cada mes.
- **Precio estimado del carrito** antes de ir al súper, usando lo que salió la vez pasada.
- **Deshacer** en todo lo que se borra, backup en JSON y exportación a CSV.

Los importes se guardan en centavos enteros, así que las divisiones nunca pierden
ni inventan un centavo.

---

## Cómo usarla

### 1. Publicarla (una sola vez, gratis)

En GitHub: **Settings → Pages → Source: `Deploy from a branch`**, elegí la rama
donde está este código y la carpeta `/ (root)`. En un minuto queda en:

```
https://<tu-usuario>.github.io/<repo>/
```

Esa dirección se abre igual desde la compu y desde cualquier celular.

> ¿No querés publicarla todavía? Hay una **versión de un solo archivo** en
> [`dist/nuestra-casa.html`](dist/nuestra-casa.html): la descargás, la abrís con
> doble clic y funciona. Sirve para probarla en la compu en 10 segundos, pero no
> se instala ni sincroniza — para eso usá la versión publicada.
>
> Para desarrollar también sirve un servidor local: `npx http-server` y entrás a
> `http://localhost:8080`.

### 2. Instalarla en el celular

- **Android (Chrome)**: menú ⋮ → *Instalar aplicación*.
- **iPhone (Safari)**: botón compartir → *Agregar a pantalla de inicio*.

Queda con su ícono, se abre a pantalla completa y anda sin señal.

### 3. Que los dos vean lo mismo (opcional pero recomendado)

Sin configurar nada, cada teléfono guarda sus propios datos. Para compartirlos
hace falta una base gratuita:

1. Creá una cuenta en [supabase.com](https://supabase.com) y un proyecto nuevo
   (el plan gratis alcanza y sobra).
2. Entrá a **SQL Editor → New query**, pegá todo el archivo
   [`supabase/schema.sql`](supabase/schema.sql) y apretá **Run**.
3. Andá a **Settings → API** y copiá el **Project URL** y la clave **anon public**.
4. En la app: **Ajustes → Configurar sincronización**, pegá los dos valores y
   tocá *Generar código nuevo*. Guardá.
5. En el mismo lugar aparece **🔗 Sumar el otro celular**: te da un enlace para
   mandarle a tu pareja. Lo abre en su teléfono y queda configurado solo.

A partir de ahí los dos ven los mismos gastos. La app sincroniza al abrirse, al
volver del segundo plano, cada minuto mientras la tenés en pantalla y cada vez
que cargás algo. Si no hay señal, guarda igual y sube cuando vuelve.

**Sobre la privacidad**: el código del hogar es un valor aleatorio de 128 bits y
funciona como contraseña. No lo publiques ni subas las claves al repositorio: se
guardan sólo en el navegador de cada uno.

---

## Backups

Ajustes tiene tres botones que conviene conocer:

- **Descargar backup (JSON)**: se guarda todo en un archivo.
- **Importar backup**: mezcla ese archivo con lo que ya haya (gana lo más nuevo).
- **Exportar a CSV**: para abrirlo en Excel o Google Sheets.

Sirven también para pasar los datos de un teléfono a otro sin usar la nube.

---

## Estructura del proyecto

```
index.html              Estructura y navegación
css/styles.css          Estilos, tema claro y oscuro
js/
  app.js                Arranque: rutas, tema, sincronización, service worker
  router.js             Navegación por hash (#/gastos?month=2026-08)
  store.js              Estado, guardado local y CRUD
  calc.js               Balances, reparto, resúmenes, vencimientos
  sync.js               Sincronización con Supabase (REST, sin SDK)
  ui.js                 Piezas de interfaz: hoja modal, avisos, gráficos
  util.js               Dinero en centavos, fechas, helpers de DOM
  theme.js              Claro / oscuro / automático
  views/                Una pantalla por archivo
sw.js                   Service worker (funciona sin conexión)
manifest.webmanifest    Datos para instalarla como app
supabase/schema.sql     Script para la base compartida
tools/make-icons.py     Genera los PNG del ícono sin dependencias
```

Sin build, sin npm install, sin frameworks: son archivos estáticos que el
navegador abre tal cual.

---

## Detalles técnicos

- **JavaScript moderno con módulos ES**, sin dependencias ni paso de compilación.
- **Todo en centavos enteros.** El reparto usa el método del resto mayor, así que
  `$100 / 3` da `33,34 + 33,33 + 33,33` y nunca `99,99`.
- **Borrado lógico**: cada registro tiene `updatedAt` y `deleted`, para que la
  sincronización propague también lo que se borró.
- **Conflictos**: gana la edición más reciente, registro por registro. Si los dos
  tocan gastos distintos al mismo tiempo, se conservan los dos.
- **Fechas locales**: se guardan como `YYYY-MM-DD` y se parsean a mano para que no
  se corran un día por la zona horaria.
- **Meses cortos**: un fijo que vence el 31 cae el 28 en febrero.
- **Accesibilidad**: objetivos táctiles de 44px, foco visible, `aria-label` en los
  gráficos y respeto por `prefers-reduced-motion`.

---

## Desarrollo

```bash
npx http-server -p 8080 -c-1     # servidor local
python3 tools/make-icons.py      # regenerar los íconos
node tools/build-single.mjs      # regenerar dist/nuestra-casa.html
```

Para que un cambio de CSS o JS se vea en un teléfono donde ya la instalaste,
subí el número de `VERSION` en `sw.js`: eso invalida la caché vieja.
