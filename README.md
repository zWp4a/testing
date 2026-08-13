# 🏡 PochoHouse

App de gastos compartidos para **Posolo y Posola**. Se abre desde la compu o
desde el celular, se instala como una app y **funciona sin internet**.

Está pensada para responder cuatro preguntas de todos los meses:

- ¿Cuánto nos queda, a cada uno y a los dos?
- ¿Cuánto gastamos y en qué?
- ¿Quién le debe a quién y cuánto?
- ¿Qué falta pagar y qué falta comprar?

## Cómo funciona la cuenta

Se carga el **sueldo líquido de cada uno, ya con el alquiler descontado**
(porque el alquiler se descuenta directamente del sueldo, no se paga aparte).
De ahí en más los gastos se van restando y siempre está a la vista cuánto
queda:

```
Nos queda   = sueldo de Posolo + sueldo de Posola − gastos del mes
Le queda a  = su sueldo − la parte que le toca de cada gasto
```

Se descuenta **la parte que le toca** a cada uno, no lo que puso de su
bolsillo: las diferencias se emparejan en el balance de "Entre ustedes". Por
eso lo que le queda a uno más lo que le queda al otro da siempre el total.

El sueldo se carga una vez y **se arrastra solo** a los meses siguientes; si
un mes cobran distinto, se cambia y listo. Por lo mismo, **el alquiler no se
carga como gasto**: ya está descontado del líquido.

---

## Qué trae

| Pantalla | Para qué sirve |
|---|---|
| **Resumen** | Cuánto queda del sueldo (en total y de cada uno), balance entre los dos, vencimientos próximos, gasto por categoría y tendencia de 6 meses. |
| **Gastos** | Todos los movimientos del mes, agrupados por día, con búsqueda y filtros. Exportable a CSV. |
| **Fijos** | Expensas, luz, gas, internet, suscripciones. Se cargan una vez y la app los recuerda cada mes con su vencimiento. |
| **Compras** | Lista compartida para el súper. Se marca en la góndola y al final se convierte en un gasto de un toque. También se le puede **sacar una foto al ticket** y que cargue todo solo. |
| **Metas** | Ahorro para un viaje, la mudanza o el fondo de imprevistos, con lo que puso cada uno. |
| **Ajustes** | Sueldos, cotización del dólar, categorías, presupuestos, escaneo de tickets, sincronización y backups. |

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
- **Proyección de los fijos**: además de lo que queda hoy, te dice con cuánto
  quedarían después de pagar los fijos que faltan.
- **Productos habituales**: leche, pan y café vuelven solos a la lista cada mes.
- **Precio estimado del carrito** antes de ir al súper, usando lo que salió la vez pasada.
- **Deshacer** en todo lo que se borra, backup en JSON y exportación a CSV.

Los importes se guardan en centavos enteros, así que las divisiones nunca pierden
ni inventan un centavo.

### Pesos y dólares

La cuenta es siempre **en pesos uruguayos**. Cuando algo se paga en dólares, en
el formulario se elige `US$ Dólares`, se pone la cotización y la app guarda el
gasto convertido a pesos, recordando también el monto original en dólares y a
qué cambio se hizo. Así los totales, los balances y los gráficos son siempre
comparables, y en la lista de gastos se sigue viendo `US$ 40,00` al lado del
importe en pesos.

La última cotización usada queda guardada y se ofrece sola la próxima vez; se
puede cambiar cuando quieras desde **Ajustes → Cotización del dólar**.

### Escanear el ticket del súper

En **Compras → Escanear ticket** hay dos caminos.

**📝 Pegar el texto — gratis, sin cuenta y sin internet.** El celular ya sabe
leer el texto de una foto:

- **iPhone**: abrí la foto en Fotos → ícono de texto abajo a la derecha →
  *Seleccionar todo* → *Copiar*.
- **Android**: abrí la foto → **Google Lens** → *Seleccionar todo* → *Copiar*.

Se pega en la app y el parser lo interpreta **acá mismo**. Aguanta lo que trae
un ticket uruguayo de verdad: nombre y precio en renglones separados, códigos
de barras sueltos, cantidades por peso (`0,532 kg x 395,00`), la letra del IVA
al final del renglón, descuentos en negativo y encabezados con dirección y
fecha. Este camino no cuesta nada, nunca.

**📷 Sacar foto — un toque, pero paga.** La foto va a la API de Claude y vuelve
con los renglones ya separados. Es lo más cómodo con una compra de 40
productos, y lee mejor los tickets arrugados o borrosos.

En los dos casos aparece una pantalla de revisión: se puede corregir cualquier
nombre o precio, destildar lo que no va, y la app avisa si la suma de los
renglones no coincide con el total (suele ser por descuentos o por algún
renglón que no se llegó a leer). Al confirmar se carga **un gasto** con el
total, y opcionalmente se suman los productos a la lista de compras como ya
comprados, con su precio, para estimar mejor la próxima vez.

#### Lo que cuesta la foto

La clave se saca en [console.anthropic.com](https://console.anthropic.com) y se
carga en **Ajustes → Escanear tickets**. Ahí mismo se elige con qué modelo
leer, y la app muestra el costo estimado en pesos usando la cotización que
tengas cargada:

| Modelo | Por ticket | Cuándo conviene |
|---|---|---|
| **Rápido** (Haiku 4.5, por defecto) | ~US$ 0,009 | Un ticket bien sacado. |
| **Equilibrado** (Sonnet 5) | ~US$ 0,017 | Letra chica, renglones cortados. |
| **El que mejor lee** (Opus 5) | ~US$ 0,043 | Tickets arrugados, borrosos o muy largos. |

Con ocho compras por mes eso es menos de un dólar al año con el modelo por
defecto. Lo que sí hace falta es cargar el mínimo de la cuenta (unos US$ 5) con
tarjeta: **la API no tiene plan gratis**. Si eso no va, pegar el texto cubre lo
mismo sin gastar un peso.

**La clave queda guardada sólo en el navegador de ese teléfono**: no se
sincroniza, no entra en el backup y no está en este repositorio.

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
> [`dist/pochohouse.html`](dist/pochohouse.html): la descargás, la abrís con
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
funciona como contraseña. No lo publiques ni subas las claves al repositorio.

Todo lo que es secreto — el código del hogar, la URL y la clave anon de
Supabase, y la clave de Claude — vive **sólo en el `localStorage` de cada
navegador**, bajo `pochohouse.config.v1`. No se versiona, no se sube a Supabase
con la sincronización y no se incluye en el backup JSON: si cambiás de
teléfono, esos cuatro valores se vuelven a cargar a mano.

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
  scan.js               Lectura de tickets: foto a Claude, o texto pegado
  ui.js                 Piezas de interfaz: hoja modal, avisos, gráficos
  util.js               Dinero en centavos, fechas, cambio de moneda, DOM
  theme.js              Claro / oscuro / automático
  views/                Una pantalla por archivo
sw.js                   Service worker (funciona sin conexión)
manifest.webmanifest    Datos para instalarla como app
supabase/schema.sql     Script para la base compartida
tools/make-icons.py     Genera los PNG del ícono sin dependencias
tools/build-single.mjs  Empaqueta todo en un solo HTML
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
- **Usuarios fijos**: son siempre los mismos dos, con ids estables (`posolo` y
  `posola`), así los gastos viejos y la sincronización nunca apuntan a otra
  persona. Se les puede cambiar el color, no el nombre.
- **Sueldos por mes**: se guardan como `mes:persona`, con id determinista para
  que no se dupliquen si los dos cargan el mismo sueldo a la vez. Si un mes no
  tiene nada cargado, se arrastra el último conocido.
- **Meses cortos**: un fijo que vence el 31 cae el 28 en febrero.
- **Moneda**: la base es el peso uruguayo. Un gasto en dólares guarda su monto
  en pesos y además `fx: {currency, amountCents, rateCents}`, así queda
  registrado a qué cambio se hizo aunque el dólar se mueva después.
- **Escaneo de tickets**: la foto se reduce a 2000px de lado antes de subirla
  y se pide la respuesta con un esquema JSON fijo, así siempre vuelve la misma
  forma. El pedido se arma en escalones: si un modelo rechaza un parámetro
  (`effort`, el esquema), reintenta sin él en vez de dejarte sin escáner en el
  medio del súper.
- **Parser de texto**: un precio sólo cuenta si cierra el renglón, así `Leche
  1L` o `Av. Italia 2345 - Centro` no se leen como importes; y un precio
  unitario tiene que traer centavos, así `PROMO 2x1` no se confunde con una
  cantidad. Un renglón sin precio queda esperando: el importe suele venir en la
  línea siguiente.
- **Accesibilidad**: objetivos táctiles de 44px, foco visible, `aria-label` en los
  gráficos y respeto por `prefers-reduced-motion`.

---

## Desarrollo

```bash
npx http-server -p 8080 -c-1     # servidor local
python3 tools/make-icons.py      # regenerar los íconos
node tools/build-single.mjs      # regenerar dist/pochohouse.html
```

Si venías usando la versión anterior (se llamaba "Nuestra Casa"), no hay nada
que hacer: al abrirla, los datos guardados con el nombre viejo se copian solos
a las claves nuevas.

Para que un cambio de CSS o JS se vea en un teléfono donde ya la instalaste,
subí el número de `VERSION` en `sw.js`: eso invalida la caché vieja.
